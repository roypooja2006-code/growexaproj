/* =====================================================================
   GROWEXA — script.js
===================================================================== */

let customerData = [];
let analyticsData = {};
let charts = {};
let uploadedFile = null;

const uploadInput = document.getElementById("fileInput");
const uploadBtn = document.getElementById("uploadBtn");
const csvPreview = document.getElementById("csvPreview");
const ledgerTrack = document.getElementById("ledgerTrack");

function money(value) {
  return "₹" + Number(value).toLocaleString("en-IN");
}

function toLakh(n) {
  if (n >= 100000) return "₹" + (n / 100000).toFixed(1) + "L";
  if (n >= 1000)   return "₹" + (n / 1000).toFixed(1) + "K";
  return "₹" + Math.round(n);
}

async function postJSON(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function getJSON(url) {
  const res = await fetch(url);
  return res.json();
}

function toast(msg, type = "success") {
  const el = document.createElement("div");
  el.textContent = msg;
  el.style.cssText = `
    position:fixed; bottom:24px; right:24px; z-index:9999;
    background:${type === "success" ? "var(--accent)" : "var(--coral)"};
    color:#0A0B0D; font-family:'Space Grotesk',sans-serif;
    font-size:.82rem; font-weight:700;
    padding:12px 20px; border-radius:8px;
    box-shadow:0 4px 20px rgba(0,0,0,.4);
    transform:translateY(16px); opacity:0;
    transition:transform .25s, opacity .25s;
    max-width:320px; line-height:1.4;
  `;
  document.body.appendChild(el);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    el.style.transform = "translateY(0)";
    el.style.opacity   = "1";
  }));
  setTimeout(() => {
    el.style.transform = "translateY(16px)";
    el.style.opacity   = "0";
    setTimeout(() => el.remove(), 300);
  }, 3400);
}

(function initTheme() {
  const html   = document.documentElement;
  const btn    = document.getElementById("themeToggle");
  const stored = localStorage.getItem("gx-theme") || "dark";
  html.setAttribute("data-theme", stored);
  if (btn) btn.textContent = stored === "dark" ? "Dark" : "Light";

  if (!btn) return;
  btn.addEventListener("click", () => {
    const next = html.getAttribute("data-theme") === "dark" ? "light" : "dark";
    html.setAttribute("data-theme", next);
    localStorage.setItem("gx-theme", next);
    btn.textContent = next === "dark" ? "Dark" : "Light";
  });
})();

const PAGE_TITLES = {
  dashboard:       "Main Dashboard",
  upload:          "Customer Data Upload",
  recommendations: "AI Recommendation Center",
  segments:        "Customer Segmentation",
  campaigns:       "Campaign Builder",
  messaging:       "WhatsApp & Email Messaging",
  analytics:       "Analytics & Graphs",
  assistant:       "AI Chat Assistant",
};

let currentSection = "dashboard";

function switchSection(id) {
  if (id === currentSection) return;
  document.getElementById(currentSection)?.classList.remove("active");
  document.querySelector(`.rail-btn[data-section="${currentSection}"]`)?.classList.remove("active");
  document.getElementById(id)?.classList.add("active");
  document.querySelector(`.rail-btn[data-section="${id}"]`)?.classList.add("active");
  const titleEl = document.getElementById("page-title");
  if (titleEl) titleEl.textContent = PAGE_TITLES[id] || id;
  currentSection = id;

  if (id === "dashboard")       loadKPIs();
  if (id === "recommendations") loadRecommendations();
  if (id === "segments")        loadSegments();
  if (id === "campaigns")       loadCampaign();
  if (id === "analytics")       loadAnalytics();
}

document.querySelectorAll(".rail-btn[data-section]").forEach(btn => {
  btn.addEventListener("click", () => switchSection(btn.dataset.section));
});

/* =====================================================================
   LIVE TICKER — now driven by real backend data (falls back to demo
   data automatically since /api/recommendations always returns
   something, even before a CSV is uploaded).
===================================================================== */

async function refreshTicker() {
  try {
    const recs = await getJSON("/api/recommendations");
    const track = document.getElementById("ledgerTrack");
    if (!track || !Array.isArray(recs) || !recs.length) return;

    const items = [...recs, ...recs]; // duplicate for seamless scroll loop
    track.innerHTML = items.map(d => `
      <span class="tick-item">
        <span class="tick-name">${d.name}</span>
        <span class="tick-seg">&nbsp;·&nbsp;${d.segment}&nbsp;·&nbsp;</span>
        <span class="tick-action">${d.recommendation}</span>
        <span class="tick-disc ${d.discount > 0 ? "has-disc" : "no-disc"}">
          &nbsp;${d.discount > 0 ? d.discount + "% OFF" : "✓ Full Price"}
        </span>
      </span>
    `).join("");
  } catch (e) {
    console.warn("Ticker refresh failed:", e);
  }
}

/* =====================================================================
   Summary card updaters — one shared kpis object feeds ALL sections
   (Dashboard top row, Upload page cards, Analytics summary cards) so
   everything always stays in sync after a CSV upload.
===================================================================== */

function updateDashboard(kpis) {
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
  set("customerCount",  kpis.customers);
  set("revenueValue",   money(kpis.total_revenue));
  set("avgSpend",       money(Math.round(kpis.average_spend)));
  set("highestSpend",   money(kpis.highest_spend));
  set("returnCustomer", kpis.returning_customers);
  set("cartCount",      kpis.cart_abandoned);
}

function updateUploadSection(kpis) {
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
  set("uploadCustomers", kpis.customers);
  set("uploadRevenue",   money(kpis.total_revenue));
  set("uploadAverage",   money(Math.round(kpis.average_spend)));
  set("topCategory",     kpis.top_category || "-");
}

function updateAnalyticsSummary(kpis) {
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
  set("totalRevenue",    money(kpis.total_revenue));
  set("averageSpend",    money(Math.round(kpis.average_spend)));
  set("totalCustomers",  kpis.customers);
  set("highestCustomer", kpis.highest_customer || "-");
}

async function loadKPIs() {
  try {
    const k = await getJSON("/api/kpis");

    // Top KPI row (Total Customers / Revenue / Avg Spend / Highest / Returning / Cart)
    updateDashboard(k);
    // Upload page's own summary cards
    updateUploadSection(k);
    // Analytics page's own summary cards
    updateAnalyticsSummary(k);

    // Second KPI row (Revenue This Month / Profit / ROI / Active / Retention / Discount Savings)
    const updates = [
      { val: toLakh(k.revenue_this_month),               delta: "up",   dt: "▲ Revenue from all customers" },
      { val: toLakh(k.profit_generated),                 delta: "up",   dt: "▲ 37.5% vs flat discounting"  },
      { val: k.marketing_roi.toFixed(1) + "×",           delta: "up",   dt: "▲ This quarter"               },
      { val: k.active_customers.toLocaleString("en-IN"), delta: "up",   dt: "▲ Active last 30 days"        },
      { val: k.retention_rate + "%",                     delta: "down", dt: "▼ Track weekly"               },
      { val: toLakh(k.discount_savings),                 delta: "up",   dt: "Avoided this month"           },
    ];

    document.querySelectorAll("#dashboard > .kpi-grid:nth-of-type(2) .kpi-card").forEach((card, i) => {
      const u = updates[i]; if (!u) return;
      const valEl   = card.querySelector(".kpi-value");
      const deltaEl = card.querySelector(".kpi-delta");
      if (valEl)   valEl.textContent   = u.val;
      if (deltaEl) { deltaEl.textContent = u.dt; deltaEl.className = "kpi-delta " + u.delta; }
    });

    // AI Profit Summary panel
    const nums = document.querySelectorAll(".ai-summary-grid .num");
    const sumVals = [
      k.customers_analyzed.toLocaleString("en-IN"),
      k.discounts_avoided.toLocaleString("en-IN"),
      toLakh(k.additional_profit),
      "+" + k.conversion_improvement + "%",
    ];
    nums.forEach((el, i) => { if (sumVals[i]) el.textContent = sumVals[i]; });

  } catch (e) {
    console.warn("KPI load failed:", e);
  }
}

async function loadRecommendations() {
  try {
    const customers = await getJSON("/api/recommendations");
    const tbody = document.querySelector("#recommendations .data-table tbody");
    if (!tbody) return;

    tbody.innerHTML = customers.map(c => {
      const cls = { "Loyal Customer":"loyal","Price Sensitive":"price","Cart Abandoner":"cart","At Risk":"risk" }[c.segment] || "loyal";
      return `
        <tr>
          <td>${c.name}</td>
          <td><span class="tag ${cls}">${c.segment}</span></td>
          <td>${c.recommendation}</td>
          <td class="discount-cell ${c.discount > 0 ? "hot" : ""}">${c.discount}%</td>
        </tr>`;
    }).join("");
  } catch (e) {
    console.warn("Recommendations load failed:", e);
  }
}

const SEG_COLORS = {
  "Loyal Customer":  "var(--accent)",
  "Price Sensitive": "#FFCA47",
  "Cart Abandoner":  "#6FA3FF",
  "At Risk":         "var(--coral)",
};

async function loadSegments() {
  try {
    const data  = await getJSON("/api/segments");
    const total = Object.values(data).reduce((a, b) => a + b, 0) || 1;
    const chart = document.getElementById("segChart");
    if (!chart) return;

    chart.innerHTML = Object.entries(data).map(([seg, count]) => {
      const pct   = Math.round((count / total) * 100);
      const color = SEG_COLORS[seg] || "var(--accent)";
      return `
        <div class="seg-bar-row">
          <span class="seg-bar-name">${seg}</span>
          <div class="seg-bar-outer">
            <div class="seg-bar-inner" style="width:0%;background:${color};transition:width .8s cubic-bezier(.4,0,.2,1)"></div>
          </div>
          <span class="seg-bar-val">${count.toLocaleString("en-IN")}&nbsp;(${pct}%)</span>
        </div>`;
    }).join("");

    requestAnimationFrame(() => requestAnimationFrame(() => {
      const bars = chart.querySelectorAll(".seg-bar-inner");
      const vals = Object.values(data);
      bars.forEach((bar, i) => { bar.style.width = Math.round((vals[i] / total) * 100) + "%"; });
    }));

    const order = ["Loyal Customer","Price Sensitive","Cart Abandoner","At Risk"];
    document.querySelectorAll(".seg-card").forEach((card, i) => {
      const n = data[order[i]] || 0;
      const el = card.querySelector(".seg-count");
      if (el) el.textContent = n.toLocaleString("en-IN") + " customers";
    });

  } catch (e) {
    console.warn("Segments load failed:", e);
  }
}

if (uploadInput) {
  uploadInput.addEventListener("change", () => {
    if (uploadInput.files.length > 0) {
      uploadedFile = uploadInput.files[0];
      const label = document.getElementById("selectedFile");
      if (label) label.textContent = uploadedFile.name;
    }
  });
}

if (uploadBtn) {
  uploadBtn.addEventListener("click", uploadCSV);
}

async function uploadCSV() {
  if (!uploadedFile) {
    alert("Please choose a CSV.");
    return;
  }

  const formData = new FormData();
  formData.append("file", uploadedFile);

  try {
    const response = await fetch("/api/upload", {
      method: "POST",
      body: formData
    });
    const result = await response.json();

    if (!result.success) {
      alert(result.message);
      return;
    }

    customerData = result.customers;

    // Refresh everything from the single shared KPI source, so
    // Dashboard + Upload cards + Analytics summary all update together.
    await loadKPIs();
    await loadAnalytics();
    await refreshTicker();

    populateCustomerTable();
    showPreview();
    alert("CSV Uploaded Successfully");
  } catch (e) {
    console.warn("Upload failed:", e);
    alert("Upload failed — is the server running?");
  }
}

function showPreview() {
  if (!csvPreview) return;
  csvPreview.innerHTML = "";
  customerData.slice(0, 10).forEach(customer => {
    csvPreview.innerHTML += `
      <tr>
        <td>${customer.name}</td>
        <td>${customer.email}</td>
        <td>${customer.mobile}</td>
        <td>${money(customer.total_spend)}</td>
        <td>${customer.purchase_frequency}</td>
        <td>${customer.last_purchase_date}</td>
        <td>${customer.days_since_purchase}</td>
        <td>${customer.cart_abandoned ? "Yes" : "No"}</td>
        <td>${customer.discount_used ? "Yes" : "No"}</td>
        <td>${customer.category}</td>
        <td>${customer.city}</td>
      </tr>
    `;
  });
}

async function loadCampaign() {
  try {
    const c = await getJSON("/api/campaign/suggest");
    const fields = document.querySelectorAll(".campaign-field strong");
    if (!fields.length) return;

    const vals = [
      c.target_segment + " (" + c.audience_size.toLocaleString("en-IN") + " customers)",
      c.channel,
      c.discount + "% Discount",
      c.best_time,
      c.expected_conversion,
    ];
    fields.forEach((el, i) => { if (vals[i]) el.textContent = vals[i]; });

    const btn = document.querySelector(".btn-primary");
    if (btn) {
      btn.addEventListener("click", function handler() {
        btn.textContent = "✅ Campaign Launched!";
        btn.disabled    = true;
        toast("Campaign launched! Messages will be sent at " + c.best_time);
        setTimeout(() => { btn.textContent = "Approve & Launch Campaign"; btn.disabled = false; }, 4000);
        btn.removeEventListener("click", handler);
      });
    }
  } catch (e) {
    console.warn("Campaign load failed:", e);
  }
}

async function loadAnalytics() {
  try {
    const response = await fetch("/api/analytics");
    analyticsData = await response.json();
    drawCharts();
  } catch (e) {
    console.warn("Analytics load failed:", e);
  }
}

function populateCustomerTable() {
  const table = document.getElementById("analyticsTable");
  if (!table) return;
  table.innerHTML = "";
  customerData.forEach(customer => {
    table.innerHTML += `
      <tr>
        <td>${customer.name}</td>
        <td>${customer.city}</td>
        <td>${customer.category}</td>
        <td>${money(customer.total_spend)}</td>
        <td>${customer.purchase_frequency}</td>
        <td>${customer.days_since_purchase}</td>
        <td>${customer.discount_used ? "Yes" : "No"}</td>
        <td>${customer.cart_abandoned ? "Yes" : "No"}</td>
      </tr>
    `;
  });
}

(function initChat() {
  const form    = document.getElementById("chatForm");
  const input   = document.getElementById("chatInput");
  const chatWin = document.getElementById("chatWindow");
  if (!form) return;

  const PRESETS = [
    "Which customers should I target today?",
    "How much profit did AI save this month?",
    "Who are my loyal customers?",
    "Which customers are at risk?",
  ];

  const chips = document.createElement("div");
  chips.style.cssText = "display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px;";
  PRESETS.forEach(p => {
    const chip = document.createElement("button");
    chip.textContent = p;
    chip.type = "button";
    chip.style.cssText = `
      background:var(--surface-2);border:1px solid var(--border);
      border-radius:999px;padding:5px 14px;
      font-size:.72rem;color:var(--text-muted);cursor:pointer;
      transition:border-color .15s,color .15s;
    `;
    chip.addEventListener("mouseenter", () => { chip.style.borderColor="var(--accent)"; chip.style.color="var(--accent)"; });
    chip.addEventListener("mouseleave", () => { chip.style.borderColor="var(--border)"; chip.style.color="var(--text-muted)"; });
    chip.addEventListener("click", () => { input.value = p; sendMessage(); });
    chips.appendChild(chip);
  });
  form.parentElement.insertBefore(chips, chatWin);

  form.addEventListener("submit", e => { e.preventDefault(); sendMessage(); });

  async function sendMessage() {
    const msg = input.value.trim();
    if (!msg) return;
    appendMsg(msg, "user");
    input.value = "";
    const typing = appendMsg("…", "ai");
    try {
      const data = await postJSON("/api/chat", { message: msg });
      typing.textContent = data.reply || "I didn't quite catch that — try rephrasing.";
    } catch {
      typing.textContent = "Server not responding — is Flask running?";
    }
  }

  function appendMsg(text, role) {
    const div = document.createElement("div");
    div.className   = "chat-msg " + role;
    div.textContent = text;
    chatWin.appendChild(div);
    chatWin.scrollTop = chatWin.scrollHeight;
    return div;
  }
})();

document.addEventListener("DOMContentLoaded", () => {
  loadKPIs();
  refreshTicker();

  document.querySelectorAll(".kpi-card").forEach((card, i) => {
    card.style.opacity    = "0";
    card.style.transform  = "translateY(14px)";
    card.style.transition = `opacity .35s ${i * 55}ms ease, transform .35s ${i * 55}ms ease`;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      card.style.opacity   = "1";
      card.style.transform = "translateY(0)";
    }));
  });
});

function destroyCharts() {
  Object.values(charts).forEach(chart => {
    if (chart) chart.destroy();
  });
  charts = {};
}

function drawCharts() {
  destroyCharts();
  drawCategoryChart();
  drawCityChart();
  drawSpendingChart();
  drawDistributionChart();
  drawPurchaseChart();
  drawDiscountChart();
  drawSegmentChart();
  drawRadarChart();
  drawDaysChart();
  drawTopCustomerChart();
  drawCartChart();
  drawRevenueTrendChart();
}

function drawCategoryChart() {
  const canvas = document.getElementById("categoryChart");
  if (!canvas) return;

  charts.categoryChart = new Chart(canvas, {
    type: "bar",
    data: {
      labels: Object.keys(analyticsData.categories),
      datasets: [{
        label: "Revenue",
        data: Object.values(analyticsData.categories),
        backgroundColor: [
          "#00E5FF", "#00C853", "#FF9800", "#E91E63",
          "#9C27B0", "#3F51B5", "#FFC107"
        ],
        borderRadius: 10
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } }
    }
  });
}

function drawCityChart() {
  const canvas = document.getElementById("cityChart");
  if (!canvas) return;

  charts.cityChart = new Chart(canvas, {
    type: "pie",
    data: {
      labels: Object.keys(analyticsData.cities),
      datasets: [{
        data: Object.values(analyticsData.cities),
        backgroundColor: [
          "#00E5FF", "#7C4DFF", "#4CAF50", "#FFC107",
          "#F44336", "#FF9800", "#9C27B0"
        ]
      }]
    },
    options: { responsive: true, maintainAspectRatio: false }
  });
}

function drawSpendingChart() {
  const canvas = document.getElementById("spendingChart");
  if (!canvas) return;

  charts.spendingChart = new Chart(canvas, {
    type: "bar",
    data: {
      labels: analyticsData.customer_names,
      datasets: [{
        label: "Customer Spend",
        data: analyticsData.spending,
        backgroundColor: "#00E5FF",
        borderRadius: 8
      }]
    },
    options: { responsive: true, maintainAspectRatio: false }
  });
}

function drawDistributionChart() {
  const canvas = document.getElementById("distributionChart");
  if (!canvas) return;

  const buckets = { "Under ₹5K": 0, "₹5K–20K": 0, "₹20K–50K": 0, "Over ₹50K": 0 };
  (analyticsData.spending || []).forEach(v => {
    if (v < 5000) buckets["Under ₹5K"]++;
    else if (v < 20000) buckets["₹5K–20K"]++;
    else if (v < 50000) buckets["₹20K–50K"]++;
    else buckets["Over ₹50K"]++;
  });

  charts.distributionChart = new Chart(canvas, {
    type: "doughnut",
    data: {
      labels: Object.keys(buckets),
      datasets: [{
        data: Object.values(buckets),
        backgroundColor: ["#00E5FF", "#4CAF50", "#FFC107", "#F44336"]
      }]
    },
    options: { responsive: true, maintainAspectRatio: false }
  });
}

function drawPurchaseChart() {
  const canvas = document.getElementById("purchaseChart");
  if (!canvas) return;

  charts.purchaseChart = new Chart(canvas, {
    type: "bar",
    data: {
      labels: analyticsData.customer_names,
      datasets: [{
        label: "Purchase Frequency",
        data: analyticsData.purchase_frequency,
        backgroundColor: "#4CAF50",
        borderRadius: 8
      }]
    },
    options: { responsive: true, maintainAspectRatio: false }
  });
}

function drawDiscountChart() {
  const canvas = document.getElementById("discountChart");
  if (!canvas) return;

  charts.discountChart = new Chart(canvas, {
    type: "doughnut",
    data: {
      labels: Object.keys(analyticsData.discount_used),
      datasets: [{
        data: Object.values(analyticsData.discount_used),
        backgroundColor: ["#4CAF50", "#F44336"]
      }]
    },
    options: { responsive: true, maintainAspectRatio: false }
  });
}

function drawSegmentChart() {
  const canvas = document.getElementById("segmentChart");
  if (!canvas) return;

  charts.segmentChart = new Chart(canvas, {
    type: "polarArea",
    data: {
      labels: Object.keys(analyticsData.segments),
      datasets: [{
        data: Object.values(analyticsData.segments),
        backgroundColor: ["#00E5FF", "#00C853", "#FF9800", "#E91E63"]
      }]
    },
    options: { responsive: true, maintainAspectRatio: false }
  });
}

function drawRadarChart() {
  const canvas = document.getElementById("radarChart");
  if (!canvas) return;

  charts.radarChart = new Chart(canvas, {
    type: "radar",
    data: {
      labels: ["Revenue", "Customers", "Frequency", "Loyalty", "Discount", "Retention"],
      datasets: [{
        label: "Business Score",
        data: [
          analyticsData.spending.reduce((a, b) => a + b, 0) / 1000,
          analyticsData.customer_names.length,
          analyticsData.purchase_frequency.reduce((a, b) => a + b, 0),
          analyticsData.segments["Loyal Customer"] || 0,
          analyticsData.discount_used["Yes"],
          analyticsData.customer_names.length - analyticsData.cart_abandoned["Yes"]
        ],
        backgroundColor: "rgba(0,229,255,.25)",
        borderColor: "#00E5FF"
      }]
    },
    options: { responsive: true, maintainAspectRatio: false }
  });
}

function drawDaysChart() {
  const canvas = document.getElementById("daysChart");
  if (!canvas) return;

  charts.daysChart = new Chart(canvas, {
    type: "bar",
    data: {
      labels: analyticsData.customer_names,
      datasets: [{
        label: "Days",
        data: analyticsData.days_since_purchase,
        backgroundColor: "#FF9800",
        borderRadius: 8
      }]
    },
    options: { responsive: true, maintainAspectRatio: false }
  });
}

function drawTopCustomerChart() {
  const canvas = document.getElementById("topCustomerChart");
  if (!canvas) return;

  charts.topCustomerChart = new Chart(canvas, {
    type: "bar",
    data: {
      labels: analyticsData.customer_names,
      datasets: [{
        label: "Spend",
        data: analyticsData.spending,
        backgroundColor: "#7C4DFF",
        borderRadius: 8
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: "y"
    }
  });
}

function drawCartChart() {
  const canvas = document.getElementById("cartChart");
  if (!canvas) return;

  charts.cartChart = new Chart(canvas, {
    type: "pie",
    data: {
      labels: Object.keys(analyticsData.cart_abandoned),
      datasets: [{
        data: Object.values(analyticsData.cart_abandoned),
        backgroundColor: ["#F44336", "#4CAF50"]
      }]
    },
    options: { responsive: true, maintainAspectRatio: false }
  });
}

function drawRevenueTrendChart() {
  const canvas = document.getElementById("lineChart");
  if (!canvas) return;

  charts.lineChart = new Chart(canvas, {
    type: "line",
    data: {
      labels: analyticsData.customer_names,
      datasets: [{
        label: "Customer Spend",
        data: analyticsData.spending,
        borderColor: "#00E5FF",
        backgroundColor: "rgba(0,229,255,.25)",
        fill: true,
        tension: .35
      }]
    },
    options: { responsive: true, maintainAspectRatio: false }
  });
}
