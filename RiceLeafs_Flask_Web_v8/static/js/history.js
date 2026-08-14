(() => {
  "use strict";
  const displayNames = { BrownSpot: "Brown Spot", Healthy: "Healthy", Hispa: "Hispa", LeafBlast: "Leaf Blast" };
  const statusLabels = { valid: "Valid", uncertain: "Perlu ditinjau", rejected_low_confidence: "Ditolak" };
  let currentPage = 1;
  let totalPages = 1;

  const percent = (value) => new Intl.NumberFormat("id-ID", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value || 0);
  const dateTime = (value) => new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  const statusClass = (status) => status === "valid" ? "status-valid" : status === "uncertain" ? "status-uncertain" : "status-rejected";

  function buildScore(name, value) {
    const row = document.createElement("div");
    row.className = "mini-score";
    row.innerHTML = `<span>${displayNames[name] || name}</span><i><b style="width:${Math.max(value * 100, .6)}%"></b></i><strong>${percent(value)}</strong>`;
    return row;
  }

  function render(items) {
    const container = document.querySelector("#history-cards");
    container.innerHTML = "";
    if (!items.length) {
      container.innerHTML = '<p class="empty-state">Tidak ada riwayat yang sesuai dengan filter.</p>';
      return;
    }
    items.forEach((item) => {
      const article = document.createElement("article");
      article.className = "history-card";
      const image = document.createElement("div");
      image.className = "history-card-image";
      image.innerHTML = `<img src="${item.image_url}" alt="Foto hasil ${displayNames[item.top_class] || item.top_class}"><span class="history-status ${statusClass(item.status)}">${statusLabels[item.status] || item.status}</span>`;
      const body = document.createElement("div");
      body.className = "history-card-body";
      body.innerHTML = `<h2>${displayNames[item.top_class] || item.top_class}</h2><div class="history-card-meta"><span>${percent(item.confidence)} confidence</span><span>${dateTime(item.created_at)}</span></div>`;
      const scores = document.createElement("div");
      scores.className = "history-card-scores";
      Object.entries(item.scores).sort((a, b) => b[1] - a[1]).forEach(([name, value]) => scores.appendChild(buildScore(name, value)));
      body.appendChild(scores);
      article.append(image, body);
      container.appendChild(article);
    });
    if (window.gsap) window.gsap.fromTo(".history-card", { opacity: 0, y: 26 }, { opacity: 1, y: 0, duration: .6, stagger: .06, ease: "power3.out" });
  }

  async function load(page = 1) {
    const params = new URLSearchParams({ page: String(page), per_page: "12" });
    const className = document.querySelector("#class-filter").value;
    const status = document.querySelector("#status-filter").value;
    if (className) params.set("class", className);
    if (status) params.set("status", status);
    const response = await fetch(`/api/history?${params.toString()}`);
    if (!response.ok) throw new Error("Riwayat tidak dapat dimuat.");
    const data = await response.json();
    currentPage = data.page;
    totalPages = data.pages;
    render(data.items);
    document.querySelector("#history-total").textContent = `${data.total} data`;
    document.querySelector("#page-indicator").textContent = `Halaman ${data.page} dari ${data.pages}`;
    document.querySelector("#previous-page").disabled = data.page <= 1;
    document.querySelector("#next-page").disabled = data.page >= data.pages;
  }

  document.querySelector("#apply-filter").addEventListener("click", () => load(1).catch(console.error));
  document.querySelector("#previous-page").addEventListener("click", () => load(Math.max(1, currentPage - 1)).catch(console.error));
  document.querySelector("#next-page").addEventListener("click", () => load(Math.min(totalPages, currentPage + 1)).catch(console.error));
  document.querySelector(".nav-toggle").addEventListener("click", () => {
    const links = document.querySelector(".nav-links");
    const open = links.classList.toggle("is-open");
    document.querySelector(".nav-toggle").setAttribute("aria-expanded", String(open));
  });
  load().catch((error) => { document.querySelector("#history-cards").innerHTML = `<p class="empty-state">${error.message}</p>`; });
})();
