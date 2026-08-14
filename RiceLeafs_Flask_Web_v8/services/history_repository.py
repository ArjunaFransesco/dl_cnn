from __future__ import annotations

import json
import os
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

from dotenv import load_dotenv
from sqlalchemy import (
    Column,
    DateTime,
    Float,
    Integer,
    MetaData,
    String,
    Table,
    Text,
    and_,
    create_engine,
    func,
    insert,
    select,
)
from sqlalchemy.exc import SQLAlchemyError


JAKARTA = ZoneInfo("Asia/Jakarta")


class HistoryRepository:
    def __init__(self, base_dir: Path):
        self.base_dir = Path(base_dir)
        load_dotenv(self.base_dir / ".env")
        self.metadata = MetaData()
        self.history = Table(
            "classification_history",
            self.metadata,
            Column("id", Integer, primary_key=True, autoincrement=True),
            Column("original_filename", String(255), nullable=False),
            Column("stored_filename", String(255), nullable=False),
            Column("image_path", String(500), nullable=False),
            Column("predicted_class", String(50), nullable=True),
            Column("top_class", String(50), nullable=False, index=True),
            Column("confidence", Float, nullable=False),
            Column("margin", Float, nullable=False),
            Column("status", String(40), nullable=False, index=True),
            Column("scores_json", Text, nullable=False),
            Column("source", String(20), nullable=False, default="gallery"),
            Column("created_at", DateTime, nullable=False, index=True),
        )

        primary_url = os.getenv(
            "DATABASE_URL",
            "mysql+pymysql://root:@127.0.0.1:3306/riceleafs_db?charset=utf8mb4",
        )
        allow_fallback = os.getenv("ALLOW_SQLITE_FALLBACK", "false").lower() in {
            "1",
            "true",
            "yes",
        }
        self.engine, self.backend, self.connection_note = self._connect(
            primary_url,
            allow_fallback,
        )

    def _connect(self, database_url: str, allow_fallback: bool):
        try:
            engine = create_engine(
                database_url,
                pool_pre_ping=True,
                pool_recycle=280,
            )
            with engine.connect() as connection:
                connection.execute(select(1))
            self.metadata.create_all(engine)
            backend = "mysql" if database_url.startswith("mysql") else "sqlite"
            return engine, backend, "Database utama terhubung."
        except (SQLAlchemyError, OSError) as error:
            if not allow_fallback:
                raise RuntimeError(
                    "MySQL tidak dapat dihubungkan dan SQLite fallback dinonaktifkan."
                ) from error

            instance_dir = self.base_dir / "instance"
            instance_dir.mkdir(parents=True, exist_ok=True)
            fallback_url = f"sqlite:///{(instance_dir / 'riceleafs_fallback.db').as_posix()}"
            engine = create_engine(fallback_url)
            self.metadata.create_all(engine)
            return (
                engine,
                "sqlite-fallback",
                "MySQL belum aktif; data sementara disimpan di SQLite.",
            )

    def save(self, payload: dict) -> dict:
        created_at = datetime.now(JAKARTA).replace(tzinfo=None)
        values = {
            "original_filename": payload["original_filename"],
            "stored_filename": payload["stored_filename"],
            "image_path": payload["image_path"],
            "predicted_class": payload.get("predicted_class"),
            "top_class": payload["top_class"],
            "confidence": float(payload["confidence"]),
            "margin": float(payload["margin"]),
            "status": payload["status"],
            "scores_json": json.dumps(payload["scores"], ensure_ascii=False),
            "source": payload.get("source", "gallery"),
            "created_at": created_at,
        }
        with self.engine.begin() as connection:
            result = connection.execute(insert(self.history).values(**values))
            history_id = int(result.inserted_primary_key[0])
        return {"id": history_id, "created_at": created_at.isoformat()}

    def _row_to_dict(self, row) -> dict:
        item = dict(row._mapping)
        item["scores"] = json.loads(item.pop("scores_json"))
        item["created_at"] = item["created_at"].isoformat()
        item["image_url"] = f"/uploads/{item['image_path'].replace(os.sep, '/')}"
        return item

    def recent(self, limit: int = 8) -> list[dict]:
        statement = (
            select(self.history)
            .order_by(self.history.c.created_at.desc(), self.history.c.id.desc())
            .limit(limit)
        )
        with self.engine.connect() as connection:
            rows = connection.execute(statement).fetchall()
        return [self._row_to_dict(row) for row in rows]

    def list_history(
        self,
        page: int = 1,
        per_page: int = 12,
        class_name: str | None = None,
        status: str | None = None,
    ) -> dict:
        conditions = []
        if class_name:
            conditions.append(self.history.c.top_class == class_name)
        if status:
            conditions.append(self.history.c.status == status)

        where_clause = and_(*conditions) if conditions else None
        count_statement = select(func.count()).select_from(self.history)
        data_statement = select(self.history)
        if where_clause is not None:
            count_statement = count_statement.where(where_clause)
            data_statement = data_statement.where(where_clause)

        data_statement = (
            data_statement.order_by(
                self.history.c.created_at.desc(),
                self.history.c.id.desc(),
            )
            .limit(per_page)
            .offset((page - 1) * per_page)
        )
        with self.engine.connect() as connection:
            total = int(connection.execute(count_statement).scalar_one())
            rows = connection.execute(data_statement).fetchall()

        return {
            "items": [self._row_to_dict(row) for row in rows],
            "page": page,
            "per_page": per_page,
            "total": total,
            "pages": max(1, (total + per_page - 1) // per_page),
        }

    def dashboard(self, days: int = 14) -> dict:
        with self.engine.connect() as connection:
            rows = connection.execute(
                select(
                    self.history.c.top_class,
                    self.history.c.confidence,
                    self.history.c.status,
                    self.history.c.created_at,
                )
            ).fetchall()

        total = len(rows)
        valid = sum(row.status == "valid" for row in rows)
        rejected = sum(row.status == "rejected_low_confidence" for row in rows)
        uncertain = sum(row.status == "uncertain" for row in rows)
        avg_confidence = (
            sum(float(row.confidence) for row in rows) / total if total else 0.0
        )

        distribution = Counter(row.top_class for row in rows)
        confidence_by_class: dict[str, list[float]] = defaultdict(list)
        trend_count = Counter(row.created_at.date() for row in rows)
        for row in rows:
            confidence_by_class[row.top_class].append(float(row.confidence))

        classes = ["BrownSpot", "Healthy", "Hispa", "LeafBlast"]
        end_date = date.today()
        dates = [end_date - timedelta(days=offset) for offset in range(days - 1, -1, -1)]

        return {
            "summary": {
                "total": total,
                "valid": valid,
                "uncertain": uncertain,
                "rejected": rejected,
                "average_confidence": avg_confidence,
                "valid_rate": valid / total if total else 0.0,
            },
            "distribution": {
                name: int(distribution.get(name, 0)) for name in classes
            },
            "average_confidence_by_class": {
                name: (
                    sum(confidence_by_class[name]) / len(confidence_by_class[name])
                    if confidence_by_class[name]
                    else 0.0
                )
                for name in classes
            },
            "trend": [
                {"date": current.isoformat(), "count": int(trend_count[current])}
                for current in dates
            ],
            "recent": self.recent(limit=8),
            "database": {
                "backend": self.backend,
                "note": self.connection_note,
            },
        }
