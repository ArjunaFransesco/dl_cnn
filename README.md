# 🌾 Rice Leaf Disease Classification (ResNet50V2 — v8 Final Robust)

[![Python 3.10+](https://img.shields.io/badge/Python-3.10%2B-blue.svg)](https://www.python.org/)
[![TensorFlow 2.x](https://img.shields.io/badge/Framework-TensorFlow%202.x-orange.svg)](https://www.tensorflow.org/)
[![Architecture](https://img.shields.io/badge/Backbone-ResNet50V2-green.svg)](https://keras.io/api/applications/resnet_v2/#resnet50v2-function)
[![Dataset](https://img.shields.io/badge/Dataset-RiceLeafs-yellow.svg)](https://www.kaggle.com/datasets/shayanriyaz/riceleafs)
[![License](https://img.shields.io/badge/License-MIT-lightgrey.svg)](LICENSE)

Pipeline klasifikasi penyakit daun padi berbasis Deep Learning (**ResNet50V2**) yang dirancang untuk mengatasi *class imbalance*, duplikasi dataset (*near-duplicates*), serta menjamin evaluasi holdout yang objektif dan *unbiased*.

---

## 📌 Ringkasan Proyek

Model ini mengklasifikasikan 4 kondisi/penyakit pada daun padi:
1. **BrownSpot** (Bercak Cokelat)
2. **Healthy** (Sehat)
3. **Hispa** (Hama Hispa)
4. **LeafBlast** (Blas Daun)

### ✨ Fitur & Peningkatan Utama (v8 Final Robust)
* **Group-Aware Splitting (80/10/10):** Audit perceptual hash (`pHash` + `BK-Tree` + `Union-Find`) untuk mengelompokkan gambar identik/serupa agar tidak terjadi kebocoran data (*data leakage*) antar split.
* **Penanganan Imbalance Terukur:** Menggunakan *Effective-Number Class Weighting* ($\beta=0.999$) dan *Label Smoothing* ($0.04$) tanpa oversampling berlebihan.
* **Custom Feature Head:** Kombinasi **Global Average Pooling (GAP)** + **Global Max Pooling (GMP)** + **Dense Layer (512 units, GELU)** dengan regularisasi L2 dan Dropout.
* **Robust Checkpoint Selection:** Pemilihan model terbaik dihitung berdasarkan gabungan metrik validasi (*Macro-F1*, *Geometric-Mean F1*, *Worst-Class F1*, dan *Wilson Lower Confidence Bound 90% Recall*).
* **Test-Time Augmentation (TTA) & Temperature Scaling:** Peningkatan akurasi prediksi serta kalibrasi probabilitas (*Expected Calibration Error* terkontrol).
* **Confidence & Margin Gating:** Sistem inferensi menyaring prediksi menjadi 3 status (`valid`, `uncertain`, `rejected_low_confidence`) sebelum disajikan ke pengguna.

---

## 🏗️ Arsitektur Model

```text
Input Image (320x320x3)
│
├── Data Augmentation (Flip, Rotation, Subtle Zoom/Translation/Brightness)
├── ResNet50V2 Preprocessing [-1.0, 1.0]
├── Backbone: ResNet50V2 (Pretrained ImageNet, Top 120 layers fine-tuned)
│
├── Multi-Pooling Branch:
│   ├── GlobalAveragePooling2D ──┐
│   └── GlobalMaxPooling2D     ──┴──> Concatenate (4096-d)
│
├── BatchNormalization & Dropout (0.30)
├── Dense (512 units, GELU, L2 Regularization)
├── BatchNormalization & Dropout (0.225)
└── Dense (4 units, Logits output)