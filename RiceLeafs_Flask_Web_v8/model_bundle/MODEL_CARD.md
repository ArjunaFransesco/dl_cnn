# RiceLeafs ResNet50V2 v8 Model Card

## Dataset dan Split
- Sumber: shayanriyaz/riceleafs
- Data unik: 3355
- Train: 2687
- Validation: 332
- Test: 336
- Split seed: 20260803
- Split fingerprint: 5230275d61826f63efa51f4a913ce11e816458d559ae59206ada52d38dfeb40c
- Kelas: BrownSpot, Healthy, Hispa, LeafBlast
- Exact duplicate dihapus; near-duplicate satu kelas dikelompokkan sebelum split.
- Kandidat near-duplicate lintas kelas hanya dilaporkan untuk audit manual.

## Model
- Backbone: ResNet50V2, bobot awal ImageNet
- Input: 320 x 320 RGB
- Feature head: GAP + GMP + Dense
- Fine-tuned layers maksimum: 120
- Output: logits
- TTA terpilih dari validation: True
- Temperature: 0.962092

## Strategi Training v8
- Loss: categorical cross-entropy, label smoothing 0.04
- Effective-number beta: 0.999
- Class weights: {0: 1.2351591812181968, 1: 0.6863928192039437, 2: 1.166925327399233, 3: 0.9115226721786267}
- Oversampling: tidak digunakan
- Focal loss: tidak digunakan
- Checkpoint robust: 45% macro F1 + 30% geometric mean F1 + 10% minimum class F1 + 15% recall LCB90
- Early stopping aktif; fine-tuning maksimum 40 epoch

## Final Test
- Accuracy: 0.7827
- Macro precision: 0.7749
- Macro recall: 0.7605
- Macro F1: 0.7665
- Minimum class F1: 0.6552
- Minimum class recall: 0.6667
- Minimum recall LCB90: 0.5830
- Geometric mean F1: 0.7630
- Hispa precision: 0.6441
- Hispa recall: 0.6667
- Hispa F1: 0.6552
- Macro ROC-AUC OVR: 0.9320
- Macro PR-AUC: 0.8452
- ECE sesudah kalibrasi: 0.0213
- Valid coverage: 0.7857
- Valid accuracy: 0.8561

## Batasan
- Model hanya mengenali empat kelas dalam dataset RiceLeafs.
- Confidence tinggi tidak menjamin prediksi benar.
- Test tidak dipakai untuk selection pada notebook ini.
- Revisi setelah melihat test memerlukan holdout eksternal baru untuk klaim unbiased.
- Saran penanganan penyakit harus ditinjau ahli pertanian.
