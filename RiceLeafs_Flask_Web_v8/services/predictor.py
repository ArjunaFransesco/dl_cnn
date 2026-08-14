from __future__ import annotations

import json
import threading
from pathlib import Path
from typing import BinaryIO

import numpy as np
from PIL import Image, ImageOps, UnidentifiedImageError


Image.MAX_IMAGE_PIXELS = 25_000_000


class RiceLeafPredictor:
    def __init__(self, bundle_dir: Path):
        self.bundle_dir = Path(bundle_dir)
        self._model = None
        self._tf = None
        self._load_lock = threading.Lock()
        self._predict_lock = threading.Lock()

        class_config = self._read_json("class_names.json")
        config = self._read_json("inference_config.json")
        self.class_names = class_config["class_names"]
        self.image_size = tuple(config["image_size"])
        self.temperature = float(config["temperature"])
        self.low_threshold = float(config["low_conf_threshold"])
        self.high_threshold = float(config["high_conf_threshold"])
        self.min_margin = float(config.get("min_confidence_margin", 0.10))
        self.use_tta = bool(config.get("use_tta", True))

    def _read_json(self, filename: str) -> dict:
        path = self.bundle_dir / filename
        return json.loads(path.read_text(encoding="utf-8"))

    @property
    def is_loaded(self) -> bool:
        return self._model is not None

    def _ensure_model(self):
        if self._model is None:
            with self._load_lock:
                if self._model is None:
                    import tensorflow as tf

                    model_path = self.bundle_dir / "best_model.keras"
                    if not model_path.exists():
                        raise RuntimeError(f"Model tidak ditemukan: {model_path}")
                    self._tf = tf
                    self._model = self._tf.keras.models.load_model(
                        model_path,
                        compile=False,
                    )
        return self._model

    def _prepare_image(self, file_source: BinaryIO):
        if self._tf is None:
            self._ensure_model()
        try:
            with Image.open(file_source) as source:
                source.verify()
            file_source.seek(0)
            with Image.open(file_source) as source:
                image = ImageOps.exif_transpose(source).convert("RGB")
                width, height = image.size
                if min(width, height) < 96:
                    raise ValueError("Resolusi gambar terlalu kecil. Gunakan minimal 96×96 piksel.")
                image_array = np.asarray(image)
        except (UnidentifiedImageError, OSError, SyntaxError) as error:
            raise ValueError("File bukan gambar yang valid.") from error

        image_tensor = self._tf.image.resize_with_pad(
            image_array,
            self.image_size[0],
            self.image_size[1],
            antialias=True,
        )
        image_tensor = self._tf.cast(image_tensor, self._tf.float32)
        return self._tf.expand_dims(image_tensor, axis=0)

    def predict(self, file_source: BinaryIO) -> dict:
        model = self._ensure_model()
        image_batch = self._prepare_image(file_source)
        variants = [image_batch]
        if self.use_tta:
            variants.extend(
                [
                    self._tf.image.flip_left_right(image_batch),
                    self._tf.image.flip_up_down(image_batch),
                ]
            )

        variant_batch = self._tf.concat(variants, axis=0)
        with self._predict_lock:
            variant_logits = model.predict(variant_batch, verbose=0)

        logits = np.mean(variant_logits, axis=0)
        probabilities = self._tf.nn.softmax(logits / self.temperature).numpy()
        predicted_index = int(np.argmax(probabilities))
        confidence = float(probabilities[predicted_index])
        sorted_probabilities = np.sort(probabilities)
        margin = float(sorted_probabilities[-1] - sorted_probabilities[-2])
        top_class = self.class_names[predicted_index]

        if confidence < self.low_threshold:
            status = "rejected_low_confidence"
            predicted_class = None
        elif confidence < self.high_threshold or margin < self.min_margin:
            status = "uncertain"
            predicted_class = top_class
        else:
            status = "valid"
            predicted_class = top_class

        return {
            "status": status,
            "predicted_class": predicted_class,
            "top_class_internal": top_class,
            "confidence": confidence,
            "margin": margin,
            "scores": {
                name: float(score)
                for name, score in zip(self.class_names, probabilities)
            },
        }


_instances: dict[Path, RiceLeafPredictor] = {}
_instances_lock = threading.Lock()


def get_predictor(bundle_dir: Path) -> RiceLeafPredictor:
    key = Path(bundle_dir).resolve()
    if key not in _instances:
        with _instances_lock:
            if key not in _instances:
                _instances[key] = RiceLeafPredictor(key)
    return _instances[key]
