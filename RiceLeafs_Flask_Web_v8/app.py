from __future__ import annotations

import json
import logging
from datetime import datetime
from io import BytesIO
from pathlib import Path
from uuid import uuid4

from flask import Flask, jsonify, render_template, request, send_from_directory
from sqlalchemy.exc import SQLAlchemyError
from werkzeug.exceptions import RequestEntityTooLarge
from werkzeug.utils import secure_filename

from services.history_repository import HistoryRepository
from services.predictor import get_predictor


BASE_DIR = Path(__file__).resolve().parent
MODEL_DIR = BASE_DIR / "model_bundle"
ALLOWED_EXTENSIONS = {"jpg", "jpeg", "png"}
MAX_FILE_SIZE = 5 * 1024 * 1024
UPLOAD_DIR = BASE_DIR / "instance" / "uploads"


DISEASE_CONTENT = {
    "BrownSpot": {
        "display_name": "Brown Spot",
        "short_name": "Bercak cokelat",
        "description": (
            "Pola bercak cokelat pada helaian daun yang perlu dibedakan dari "
            "kerusakan mekanis dan perubahan warna akibat kondisi lingkungan."
        ),
        "guidance": (
            "Pisahkan daun yang dicurigai, dokumentasikan perkembangan bercak, "
            "dan konfirmasikan penanganan dengan petugas pertanian setempat."
        ),
    },
    "Healthy": {
        "display_name": "Healthy",
        "short_name": "Daun sehat",
        "description": (
            "Citra paling menyerupai karakter daun sehat pada empat kelas yang "
            "dikenali model. Hasil ini bukan jaminan bebas gangguan lain."
        ),
        "guidance": (
            "Lanjutkan pemantauan rutin, khususnya ketika muncul perubahan warna, "
            "bercak baru, atau kerusakan permukaan daun."
        ),
    },
    "Hispa": {
        "display_name": "Hispa",
        "short_name": "Kerusakan hispa",
        "description": (
            "Model mendeteksi pola permukaan yang menyerupai kerusakan akibat hispa. "
            "Kelas ini memiliki ketidakpastian tertinggi pada evaluasi model."
        ),
        "guidance": (
            "Periksa kedua sisi daun dan tanaman di sekitarnya. Gunakan hasil ini "
            "sebagai sinyal pemeriksaan, bukan keputusan pengendalian tunggal."
        ),
    },
    "LeafBlast": {
        "display_name": "Leaf Blast",
        "short_name": "Blast daun",
        "description": (
            "Pola lesi pada foto menyerupai karakter blast daun di dalam dataset "
            "pelatihan model. Gejala awal dapat tampak mirip dengan kelas lain."
        ),
        "guidance": (
            "Catat lokasi dan tingkat penyebaran, hindari mencampur sampel, lalu "
            "mintakan konfirmasi lapangan sebelum menentukan tindakan."
        ),
    },
}


def _read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def _allowed_file(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def create_app(test_config: dict | None = None) -> Flask:
    app = Flask(__name__)
    app.config.update(
        MAX_CONTENT_LENGTH=MAX_FILE_SIZE,
        JSON_SORT_KEYS=False,
    )
    if test_config:
        app.config.update(test_config)

    class_config = _read_json(MODEL_DIR / "class_names.json")
    inference_config = _read_json(MODEL_DIR / "inference_config.json")
    model_metadata = _read_json(MODEL_DIR / "model_metadata.json")
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    history_repository = HistoryRepository(BASE_DIR)
    app.extensions["history_repository"] = history_repository

    @app.get("/")
    def index():
        return render_template(
            "index.html",
            classes=class_config["class_names"],
            diseases=DISEASE_CONTENT,
            inference=inference_config,
            metadata=model_metadata,
            database_backend=history_repository.backend,
        )

    @app.get("/dashboard")
    def dashboard():
        return render_template(
            "dashboard.html",
            database_backend=history_repository.backend,
        )

    @app.get("/history")
    def history():
        return render_template("history.html")

    @app.post("/api/predict")
    def predict():
        if "image" not in request.files:
            return jsonify({"error": "Field image wajib diisi."}), 400

        image_file = request.files["image"]
        if not image_file.filename:
            return jsonify({"error": "Pilih sebuah file gambar terlebih dahulu."}), 400
        if not _allowed_file(image_file.filename):
            return jsonify({"error": "Format gambar harus JPG, JPEG, atau PNG."}), 400

        image_bytes = image_file.read()
        if not image_bytes:
            return jsonify({"error": "File gambar kosong."}), 400

        try:
            result = get_predictor(MODEL_DIR).predict(BytesIO(image_bytes))
        except ValueError as error:
            return jsonify({"error": str(error)}), 400

        extension = secure_filename(image_file.filename).rsplit(".", 1)[1].lower()
        stored_filename = f"{uuid4().hex}.{extension}"
        now = datetime.now()
        date_folder = Path(str(now.year), f"{now.month:02d}", f"{now.day:02d}")
        destination_dir = UPLOAD_DIR / date_folder
        destination_dir.mkdir(parents=True, exist_ok=True)
        (destination_dir / stored_filename).write_bytes(image_bytes)

        history_saved = False
        history_record = None
        try:
            history_record = history_repository.save(
                {
                    "original_filename": secure_filename(image_file.filename),
                    "stored_filename": stored_filename,
                    "image_path": str(date_folder / stored_filename),
                    "predicted_class": result["predicted_class"],
                    "top_class": result["top_class_internal"],
                    "confidence": result["confidence"],
                    "margin": result["margin"],
                    "status": result["status"],
                    "scores": result["scores"],
                    "source": request.form.get("source", "gallery")[:20],
                }
            )
            history_saved = True
        except SQLAlchemyError:
            logging.exception("Riwayat klasifikasi gagal disimpan.")

        result["display"] = DISEASE_CONTENT[result["top_class_internal"]]
        result["model_scope"] = "Empat kelas RiceLeafs"
        result["history_saved"] = history_saved
        result["history"] = history_record
        return jsonify(result)

    @app.get("/api/dashboard/data")
    def dashboard_data():
        days = min(max(request.args.get("days", 14, type=int), 7), 90)
        return jsonify(history_repository.dashboard(days=days))

    @app.get("/api/history")
    def history_data():
        page = max(request.args.get("page", 1, type=int), 1)
        per_page = min(max(request.args.get("per_page", 12, type=int), 5), 50)
        class_name = request.args.get("class") or None
        status = request.args.get("status") or None
        return jsonify(
            history_repository.list_history(
                page=page,
                per_page=per_page,
                class_name=class_name,
                status=status,
            )
        )

    @app.get("/uploads/<path:filename>")
    def uploaded_file(filename: str):
        return send_from_directory(UPLOAD_DIR, filename)

    @app.get("/api/health")
    def health():
        predictor = get_predictor(MODEL_DIR)
        return jsonify(
            {
                "status": "ok",
                "model": "ResNet50V2",
                "model_state": "loaded" if predictor.is_loaded else "cold",
                "classes": class_config["class_names"],
                "database": history_repository.backend,
                "database_note": history_repository.connection_note,
            }
        )

    @app.errorhandler(RequestEntityTooLarge)
    def file_too_large(_error):
        return jsonify({"error": "Ukuran gambar melebihi batas 5 MB."}), 413

    @app.errorhandler(500)
    def internal_error(_error):
        return jsonify(
            {"error": "Terjadi kesalahan internal saat memproses gambar."}
        ), 500

    return app


app = create_app()


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=False)
