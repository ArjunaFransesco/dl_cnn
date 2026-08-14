(() => {
  "use strict";

  const form = document.querySelector("#predict-form");
  const input = document.querySelector("#image-input");
  const cameraInput = document.querySelector("#camera-input");
  const dropZone = document.querySelector("#drop-zone");
  const preview = document.querySelector("#image-preview");
  const previewWrap = document.querySelector(".preview-wrap");
  const fileRow = document.querySelector("#file-row");
  const fileName = document.querySelector("#file-name");
  const fileSize = document.querySelector("#file-size");
  const analyzeButton = document.querySelector("#analyze-button");
  const formMessage = document.querySelector("#form-message");
  const resultPanel = document.querySelector("#result-panel");
  const openFileButtons = document.querySelectorAll("[data-open-file]");
  const changeFile = document.querySelector("#change-file");
  const resultReset = document.querySelector("#result-reset");
  const navToggle = document.querySelector(".nav-toggle");
  const navLinks = document.querySelector(".nav-links");
  const cameraButton = document.querySelector("#camera-button");
  const cameraModal = document.querySelector("#camera-modal");
  const cameraVideo = document.querySelector("#camera-video");
  const cameraCanvas = document.querySelector("#camera-canvas");
  const cameraClose = document.querySelector("#camera-close");
  const cameraCapture = document.querySelector("#camera-capture");
  const cameraMessage = document.querySelector("#camera-message");
  const historySaved = document.querySelector("#history-saved");

  let selectedFile = null;
  let previewUrl = null;
  let selectedSource = "gallery";
  let cameraStream = null;

  const statusContent = {
    valid: { label: "Valid", className: "status-valid" },
    uncertain: { label: "Perlu ditinjau", className: "status-uncertain" },
    rejected_low_confidence: { label: "Keyakinan rendah", className: "status-rejected" },
  };

  const displayNames = {
    BrownSpot: "Brown Spot",
    Healthy: "Healthy",
    Hispa: "Hispa",
    LeafBlast: "Leaf Blast",
  };

  function formatPercent(value) {
    return new Intl.NumberFormat("id-ID", {
      style: "percent",
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(value);
  }

  function formatBytes(bytes) {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  function clearMessage() {
    formMessage.textContent = "";
  }

  function showMessage(message) {
    formMessage.textContent = message;
  }

  function validateFile(file) {
    const allowed = ["image/jpeg", "image/png"];
    if (!allowed.includes(file.type)) return "Format gambar harus JPG, JPEG, atau PNG.";
    if (file.size > 5 * 1024 * 1024) return "Ukuran gambar melebihi batas 5 MB.";
    return null;
  }

  function selectFile(file, source = "gallery") {
    clearMessage();
    const error = validateFile(file);
    if (error) {
      showMessage(error);
      return;
    }

    selectedFile = file;
    selectedSource = source;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(file);
    preview.src = previewUrl;
    previewWrap.classList.add("has-image");
    fileName.textContent = file.name;
    fileSize.textContent = formatBytes(file.size);
    fileRow.hidden = false;
    analyzeButton.disabled = false;
    resultPanel.hidden = true;
    historySaved.hidden = true;
    form.hidden = false;
  }

  function resetAnalysis() {
    selectedFile = null;
    input.value = "";
    cameraInput.value = "";
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null;
    preview.removeAttribute("src");
    previewWrap.classList.remove("has-image");
    fileRow.hidden = true;
    analyzeButton.disabled = true;
    resultPanel.hidden = true;
    historySaved.hidden = true;
    form.hidden = false;
    clearMessage();
  }

  function renderResult(result) {
    const status = statusContent[result.status] || statusContent.uncertain;
    const statusBadge = document.querySelector("#status-badge");
    statusBadge.className = `status-badge ${status.className}`;
    statusBadge.textContent = status.label;

    document.querySelector("#result-class").textContent = displayNames[result.top_class_internal] || result.top_class_internal;
    document.querySelector("#result-summary").textContent = result.display.description;
    document.querySelector("#result-guidance").textContent = result.display.guidance;
    document.querySelector("#confidence-value").textContent = formatPercent(result.confidence);
    document.querySelector("#margin-value").textContent = formatPercent(result.margin);

    const dial = document.querySelector("#confidence-dial");
    dial.style.setProperty("--confidence", `${Math.max(0, Math.min(1, result.confidence)) * 360}deg`);

    const scoreList = document.querySelector("#score-list");
    scoreList.innerHTML = "";
    Object.entries(result.scores)
      .sort((a, b) => b[1] - a[1])
      .forEach(([name, score]) => {
        const row = document.createElement("div");
        row.className = `score-row${name === result.top_class_internal ? " is-top" : ""}`;
        row.innerHTML = `
          <strong>${displayNames[name] || name}</strong>
          <span class="score-track"><span class="score-fill"></span></span>
          <span>${formatPercent(score)}</span>
        `;
        scoreList.appendChild(row);
        requestAnimationFrame(() => {
          row.querySelector(".score-fill").style.width = `${score * 100}%`;
        });
      });

    form.hidden = true;
    resultPanel.hidden = false;
    historySaved.hidden = !result.history_saved;
    if (window.gsap) {
      window.gsap.fromTo(resultPanel, { opacity: 0, y: 22 }, { opacity: 1, y: 0, duration: .65, ease: "power3.out" });
    }
  }

  async function submitPrediction(event) {
    event.preventDefault();
    if (!selectedFile) {
      showMessage("Pilih gambar terlebih dahulu.");
      return;
    }

    const payload = new FormData();
    payload.append("image", selectedFile, selectedFile.name);
    payload.append("source", selectedSource);
    analyzeButton.disabled = true;
    analyzeButton.classList.add("is-loading");
    clearMessage();

    try {
      const response = await fetch("/api/predict", { method: "POST", body: payload });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Gambar tidak dapat diproses.");
      renderResult(data);
    } catch (error) {
      showMessage(error.message || "Koneksi ke server bermasalah.");
    } finally {
      analyzeButton.classList.remove("is-loading");
      analyzeButton.disabled = !selectedFile;
    }
  }

  openFileButtons.forEach((button) => button.addEventListener("click", () => input.click()));
  changeFile.addEventListener("click", () => input.click());
  resultReset.addEventListener("click", () => {
    resetAnalysis();
    input.click();
  });
  input.addEventListener("change", () => {
    if (input.files && input.files[0]) selectFile(input.files[0], "gallery");
  });
  cameraInput.addEventListener("change", () => {
    if (cameraInput.files && cameraInput.files[0]) {
      selectFile(cameraInput.files[0], "camera");
      document.querySelector("#analyze").scrollIntoView({ behavior: "smooth", block: "center" });
    }
  });
  form.addEventListener("submit", submitPrediction);

  ["dragenter", "dragover"].forEach((eventName) => {
    dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropZone.classList.add("is-dragging");
    });
  });
  ["dragleave", "drop"].forEach((eventName) => {
    dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropZone.classList.remove("is-dragging");
    });
  });
  dropZone.addEventListener("drop", (event) => {
    const file = event.dataTransfer.files && event.dataTransfer.files[0];
    if (file) selectFile(file, "gallery");
  });

  async function openCamera() {
    cameraMessage.textContent = "";
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      cameraInput.click();
      return;
    }
    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      cameraVideo.srcObject = cameraStream;
      cameraModal.hidden = false;
      document.body.classList.add("modal-open");
    } catch (error) {
      cameraModal.hidden = false;
      document.body.classList.add("modal-open");
      cameraMessage.textContent = "Izin kamera ditolak atau kamera sedang digunakan aplikasi lain.";
    }
  }

  function closeCamera() {
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
      cameraStream = null;
    }
    cameraVideo.srcObject = null;
    cameraModal.hidden = true;
    document.body.classList.remove("modal-open");
  }

  function captureCameraImage() {
    if (!cameraVideo.videoWidth || !cameraVideo.videoHeight) {
      cameraMessage.textContent = "Kamera belum siap. Tunggu sebentar lalu coba lagi.";
      return;
    }
    cameraCanvas.width = cameraVideo.videoWidth;
    cameraCanvas.height = cameraVideo.videoHeight;
    cameraCanvas.getContext("2d").drawImage(cameraVideo, 0, 0);
    cameraCanvas.toBlob((blob) => {
      if (!blob) {
        cameraMessage.textContent = "Foto tidak berhasil diambil.";
        return;
      }
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      selectFile(new File([blob], `kamera-${timestamp}.jpg`, { type: "image/jpeg" }), "camera");
      closeCamera();
      document.querySelector("#analyze").scrollIntoView({ behavior: "smooth", block: "center" });
    }, "image/jpeg", .92);
  }

  cameraButton.addEventListener("click", openCamera);
  cameraClose.addEventListener("click", closeCamera);
  cameraCapture.addEventListener("click", captureCameraImage);
  cameraModal.addEventListener("click", (event) => {
    if (event.target === cameraModal) closeCamera();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !cameraModal.hidden) closeCamera();
  });

  navToggle.addEventListener("click", () => {
    const isOpen = navLinks.classList.toggle("is-open");
    navToggle.setAttribute("aria-expanded", String(isOpen));
  });

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (window.gsap && window.ScrollTrigger && !reducedMotion) {
    window.gsap.registerPlugin(window.ScrollTrigger);
    window.gsap.from(".site-nav", { y: -30, opacity: 0, duration: .9, ease: "power3.out" });
    window.gsap.from(".hero-copy > *", { y: 34, opacity: 0, duration: .9, stagger: .09, ease: "power3.out", delay: .12 });
    window.gsap.from(".analysis-shell", { y: 52, opacity: 0, scale: .96, duration: 1.1, ease: "power3.out", delay: .28 });

    window.gsap.utils.toArray(".bento-card").forEach((card) => {
      window.gsap.from(card, {
        scrollTrigger: { trigger: card, start: "top 86%" },
        y: 50,
        opacity: 0,
        duration: .8,
        ease: "power3.out",
      });
    });

    const cards = window.gsap.utils.toArray(".protocol-card");
    cards.forEach((card, index) => {
      window.gsap.fromTo(card,
        { y: index === 0 ? 20 : 90, scale: .94 },
        {
          y: 0,
          scale: 1,
          ease: "none",
          scrollTrigger: {
            trigger: card,
            start: "top 92%",
            end: "top 34%",
            scrub: true,
          },
        }
      );
    });

    const words = window.gsap.utils.toArray(".manifesto-word");
    window.gsap.to(words, {
      opacity: 1,
      stagger: .12,
      ease: "none",
      scrollTrigger: {
        trigger: ".manifesto",
        start: "top 68%",
        end: "bottom 70%",
        scrub: 1,
      },
    });
  }
})();
