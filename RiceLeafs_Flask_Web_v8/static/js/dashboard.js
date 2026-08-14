(() => {
  "use strict";

  const classNames = ["BrownSpot", "Healthy", "Hispa", "LeafBlast"];
  const displayNames = { BrownSpot: "Brown Spot", Healthy: "Healthy", Hispa: "Hispa", LeafBlast: "Leaf Blast" };
  const palette = ["#b88752", "#76a95a", "#d0c371", "#315f49"];
  let charts = [];

  const percent = (value) => new Intl.NumberFormat("id-ID", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value || 0);
  const dateTime = (value) => new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  const statusLabels = { valid: "Valid", uncertain: "Perlu ditinjau", rejected_low_confidence: "Ditolak" };

  function statusClass(status) {
    if (status === "valid") return "status-valid";
    if (status === "uncertain") return "status-uncertain";
    return "status-rejected";
  }

  function destroyCharts() {
    charts.forEach((chart) => chart.destroy());
    charts = [];
  }

  function renderKpis(summary) {
    document.querySelector("#kpi-total").textContent = summary.total;
    document.querySelector("#kpi-valid").textContent = summary.valid;
    document.querySelector("#kpi-rejected").textContent = summary.rejected;
    document.querySelector("#kpi-confidence").textContent = percent(summary.average_confidence);
    document.querySelector("#kpi-valid-rate").textContent = `${percent(summary.valid_rate)} dari seluruh klasifikasi`;
    document.querySelector("#status-valid").textContent = summary.valid;
    document.querySelector("#status-uncertain").textContent = summary.uncertain;
    document.querySelector("#status-rejected").textContent = summary.rejected;
    const denominator = Math.max(summary.total, 1);
    document.querySelector("#status-valid-bar").style.width = `${summary.valid / denominator * 100}%`;
    document.querySelector("#status-uncertain-bar").style.width = `${summary.uncertain / denominator * 100}%`;
    document.querySelector("#status-rejected-bar").style.width = `${summary.rejected / denominator * 100}%`;
  }

  function renderDatabase(database) {
    const note = document.querySelector("#database-note");
    note.classList.toggle("is-mysql", database.backend === "mysql");
    document.querySelector("#database-note-text").textContent = `${database.note} Backend aktif: ${database.backend}.`;
  }

  function renderCharts(data) {
    destroyCharts();
    const shared = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } };
    charts.push(new Chart(document.querySelector("#trend-chart"), {
      type: "line",
      data: { labels: data.trend.map((item) => item.date.slice(5)), datasets: [{ data: data.trend.map((item) => item.count), borderColor: "#154c38", backgroundColor: "rgba(185,231,105,.28)", fill: true, tension: .38, borderWidth: 3, pointRadius: 3, pointBackgroundColor: "#154c38" }] },
      options: { ...shared, scales: { y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: "rgba(16,39,31,.08)" } }, x: { grid: { display: false } } } },
    }));

    const distributionValues = classNames.map((name) => data.distribution[name] || 0);
    charts.push(new Chart(document.querySelector("#distribution-chart"), {
      type: "doughnut",
      data: { labels: classNames.map((name) => displayNames[name]), datasets: [{ data: distributionValues, backgroundColor: palette, borderWidth: 0, hoverOffset: 8 }] },
      options: { ...shared, cutout: "70%" },
    }));

    const legend = document.querySelector("#distribution-legend");
    legend.innerHTML = "";
    classNames.forEach((name, index) => {
      const item = document.createElement("div");
      item.className = "legend-item";
      const label = document.createElement("span");
      const dot = document.createElement("i");
      dot.className = "legend-dot";
      dot.style.background = palette[index];
      label.append(dot, document.createTextNode(displayNames[name]));
      const value = document.createElement("strong");
      value.textContent = distributionValues[index];
      item.append(label, value);
      legend.appendChild(item);
    });

    charts.push(new Chart(document.querySelector("#confidence-chart"), {
      type: "bar",
      data: { labels: classNames.map((name) => displayNames[name]), datasets: [{ data: classNames.map((name) => (data.average_confidence_by_class[name] || 0) * 100), backgroundColor: palette, borderRadius: 9, maxBarThickness: 58 }] },
      options: { ...shared, scales: { y: { beginAtZero: true, max: 100, ticks: { callback: (value) => `${value}%` }, grid: { color: "rgba(16,39,31,.08)" } }, x: { grid: { display: false } } } },
    }));
  }

  function renderRecent(items) {
    const body = document.querySelector("#recent-history");
    body.innerHTML = "";
    if (!items.length) {
      body.innerHTML = '<tr><td colspan="6" class="empty-state">Belum ada data. Lakukan klasifikasi pertama untuk mengisi dashboard.</td></tr>';
      return;
    }
    items.forEach((item) => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td><img class="table-image" src="${item.image_url}" alt="Citra ${displayNames[item.top_class] || item.top_class}"></td>
        <td><span class="table-result"><strong>${displayNames[item.top_class] || item.top_class}</strong><small>${item.original_filename}</small></span></td>
        <td><span class="history-status ${statusClass(item.status)}">${statusLabels[item.status] || item.status}</span></td>
        <td><strong>${percent(item.confidence)}</strong></td>
        <td>${item.source === "camera" ? "Kamera" : "Galeri"}</td>
        <td>${dateTime(item.created_at)}</td>
      `;
      body.appendChild(row);
    });
  }

  async function loadDashboard() {
    const days = document.querySelector("#trend-days").value;
    const response = await fetch(`/api/dashboard/data?days=${encodeURIComponent(days)}`);
    if (!response.ok) throw new Error("Data dashboard tidak dapat dimuat.");
    const data = await response.json();
    renderKpis(data.summary);
    renderDatabase(data.database);
    renderCharts(data);
    renderRecent(data.recent);
    if (window.gsap) window.gsap.fromTo(".kpi-card", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: .55, stagger: .07, ease: "power3.out" });
  }

  document.querySelector("#refresh-dashboard").addEventListener("click", () => loadDashboard().catch(console.error));
  document.querySelector("#trend-days").addEventListener("change", () => loadDashboard().catch(console.error));
  document.querySelector(".nav-toggle").addEventListener("click", () => {
    const links = document.querySelector(".nav-links");
    const open = links.classList.toggle("is-open");
    document.querySelector(".nav-toggle").setAttribute("aria-expanded", String(open));
  });

  loadDashboard().catch((error) => {
    document.querySelector("#database-note-text").textContent = error.message;
  });
})();
