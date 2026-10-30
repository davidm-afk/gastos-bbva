// BBVA LiveTracker Frontend Logic - Ingresos, Gastos y Transferencias
let ws = null;
let soundEnabled = true;
let allTransactions = [];
let trendChartInstance = null;
let categoryChartInstance = null;

const CATEGORY_COLORS = {
  "Alimentos & Restaurantes": "#f59e0b",
  "Supermercado & Abarrotes": "#10b981",
  "Transporte & Movilidad": "#3b82f6",
  "Salud & Farmacias": "#ec4899",
  "Servicios & Suscripciones": "#8b5cf6",
  "Entretenimiento & Ocio": "#06b6d4",
  "Compras & Ropa": "#f97316",
  "Transferencia Enviada": "#f43f5e",
  "Transferencia Recibida": "#10b981",
  "Nómina & Sueldo": "#059669",
  "Depósito en Efectivo": "#14b8a6",
  "Reembolsos & Devoluciones": "#06b6d4",
  "Financiero & Retiros": "#64748b",
  "Otros Gastos": "#94a3b8"
};

const CATEGORY_ICONS = {
  "Alimentos & Restaurantes": "utensils",
  "Supermercado & Abarrotes": "shopping-cart",
  "Transporte & Movilidad": "car",
  "Salud & Farmacias": "heart-pulse",
  "Servicios & Suscripciones": "receipt",
  "Entretenimiento & Ocio": "film",
  "Compras & Ropa": "shopping-bag",
  "Transferencia Enviada": "send",
  "Transferencia Recibida": "download",
  "Nómina & Sueldo": "briefcase",
  "Depósito en Efectivo": "banknote",
  "Reembolsos & Devoluciones": "rotate-ccw",
  "Financiero & Retiros": "landmark",
  "Otros Gastos": "tag"
};

// --- ALERTAS SONORAS DIFERENCIADAS (Ingreso vs Gasto) ---
function playNotificationChime(isIncome = false) {
  if (!soundEnabled) return;
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    
    if (isIncome) {
      // Chime alegre ascendente para Ingreso (C5 -> E5 -> G5)
      const notes = [523.25, 659.25, 783.99];
      notes.forEach((freq, i) => {
        setTimeout(() => {
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
          gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.35);
          osc.connect(gain);
          gain.connect(audioCtx.destination);
          osc.start();
          osc.stop(audioCtx.currentTime + 0.35);
        }, i * 110);
      });
    } else {
      // Chime sutil para Gasto (A5 -> E6)
      const osc1 = audioCtx.createOscillator();
      const gain1 = audioCtx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(880, audioCtx.currentTime);
      gain1.gain.setValueAtTime(0.15, audioCtx.currentTime);
      gain1.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
      osc1.connect(gain1);
      gain1.connect(audioCtx.destination);
      osc1.start();
      osc1.stop(audioCtx.currentTime + 0.3);

      setTimeout(() => {
        const osc2 = audioCtx.createOscillator();
        const gain2 = audioCtx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(1318.5, audioCtx.currentTime);
        gain2.gain.setValueAtTime(0.15, audioCtx.currentTime);
        gain2.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);
        osc2.connect(gain2);
        gain2.connect(audioCtx.destination);
        osc2.start();
        osc2.stop(audioCtx.currentTime + 0.4);
      }, 120);
    }
  } catch (e) {
    console.warn("Audio Context error:", e);
  }
}

function toggleSound() {
  soundEnabled = !soundEnabled;
  const icon = document.getElementById("sound-icon");
  if (soundEnabled) {
    icon.setAttribute("data-lucide", "volume-2");
    icon.classList.remove("text-slate-500");
    icon.classList.add("text-emerald-400");
    playNotificationChime(true);
  } else {
    icon.setAttribute("data-lucide", "volume-x");
    icon.classList.remove("text-emerald-400");
    icon.classList.add("text-slate-500");
  }
  lucide.createIcons();
}

// --- WEBSOCKET EN VIVO ---
function initWebSocket() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = `${protocol}//${window.location.host}/ws`;

  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    updateStatusPill(true);
    console.log("WebSocket conectado");
  };

  ws.onmessage = (event) => {
    try {
      const payload = JSON.parse(event.data);
      handleSocketEvent(payload);
    } catch (e) {
      console.error("Error parseando WebSocket payload:", e);
    }
  };

  ws.onclose = () => {
    updateStatusPill(false);
    setTimeout(initWebSocket, 3000);
  };

  ws.onerror = (err) => {
    console.warn("Error en WebSocket:", err);
    ws.close();
  };
}

function updateStatusPill(connected) {
  const pill = document.getElementById("status-pill");
  if (connected) {
    pill.className = "flex items-center space-x-2 px-3 py-1.5 rounded-full bg-emerald-950/60 border border-emerald-600/40 text-emerald-400 text-xs font-medium";
    pill.innerHTML = `<span class="w-2.5 h-2.5 rounded-full bg-emerald-400 live-pulse"></span><span>Conectado 24/7</span>`;
  } else {
    pill.className = "flex items-center space-x-2 px-3 py-1.5 rounded-full bg-rose-950/60 border border-rose-600/40 text-rose-400 text-xs font-medium";
    pill.innerHTML = `<span class="w-2.5 h-2.5 rounded-full bg-rose-400"></span><span>Reconectando...</span>`;
  }
}

function handleSocketEvent(payload) {
  if (payload.event === "INITIAL_STATE") {
    updateAnalyticsUI(payload.analytics);
    loadInitialTransactions();
  } else if (payload.event === "NEW_TRANSACTION") {
    const isIncome = payload.transaction.flow_type === "ingreso";
    playNotificationChime(isIncome);
    prependTransactionRow(payload.transaction);
    updateAnalyticsUI(payload.analytics);
  } else if (payload.event === "UPDATE_TRANSACTION") {
    replaceTransactionRow(payload.transaction);
    updateAnalyticsUI(payload.analytics);
  } else if (payload.event === "DELETE_TRANSACTION") {
    removeTransactionRow(payload.tx_id);
    updateAnalyticsUI(payload.analytics);
  } else if (payload.event === "BUDGET_UPDATED") {
    updateAnalyticsUI(payload.analytics);
  }
}

// --- ACTUALIZACIÓN DE KPIS ---
function updateAnalyticsUI(analytics) {
  if (!analytics) return;

  const fmt = (num) => `$${Number(num).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  document.getElementById("kpi-total-income").textContent = `+${fmt(analytics.total_income_month)}`;
  document.getElementById("kpi-total-month").textContent = `-${fmt(analytics.total_month)}`;
  
  // Balance Neto
  const net = analytics.net_balance;
  const netEl = document.getElementById("kpi-net-balance");
  if (net >= 0) {
    netEl.textContent = `+${fmt(net)}`;
    netEl.className = "text-2xl font-black text-emerald-400 mt-1 tracking-tight";
  } else {
    netEl.textContent = `-${fmt(Math.abs(net))}`;
    netEl.className = "text-2xl font-black text-rose-400 mt-1 tracking-tight";
  }

  document.getElementById("kpi-count-income").innerHTML = `<span class="text-slate-300 font-semibold mr-1">${analytics.count_income || 0}</span> ingresos registrados`;
  document.getElementById("kpi-count-month").innerHTML = `<span class="text-slate-300 font-semibold mr-1">${analytics.count_expenses || 0}</span> gastos registrados`;

  // Presupuesto
  document.getElementById("kpi-remaining-budget").textContent = fmt(analytics.remaining_budget);
  document.getElementById("kpi-total-budget").textContent = `Meta: ${fmt(analytics.budget)}`;
  document.getElementById("kpi-percent-spent").textContent = `${analytics.percent_spent}% consumido`;

  const budgetBar = document.getElementById("budget-bar");
  const pct = Math.min(100, analytics.percent_spent);
  budgetBar.style.width = `${pct}%`;
  if (pct > 90) {
    budgetBar.className = "bg-gradient-to-r from-amber-500 to-rose-500 h-2 rounded-full transition-all duration-500";
  } else {
    budgetBar.className = "bg-gradient-to-r from-cyan-500 to-blue-500 h-2 rounded-full transition-all duration-500";
  }

  renderTrendChart(analytics.by_day);
  renderCategoryChart(analytics.by_category);
}

// --- GRÁFICOS ---
function renderTrendChart(byDay) {
  const ctx = document.getElementById("trendChart").getContext("2d");
  
  const labels = byDay && byDay.length > 0 ? byDay.map(d => d.day.slice(5)) : ["Sin datos"];
  const data = byDay && byDay.length > 0 ? byDay.map(d => d.total) : [0];

  if (trendChartInstance) {
    trendChartInstance.data.labels = labels;
    trendChartInstance.data.datasets[0].data = data;
    trendChartInstance.update();
    return;
  }

  trendChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Gasto Diario (MXN)',
        data: data,
        borderColor: '#f43f5e',
        backgroundColor: 'rgba(244, 63, 94, 0.1)',
        borderWidth: 2.5,
        fill: true,
        tension: 0.35,
        pointBackgroundColor: '#e11d48',
        pointRadius: 4,
        pointHoverRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#0f172a',
          titleColor: '#e2e8f0',
          bodyColor: '#f43f5e',
          borderColor: '#1e293b',
          borderWidth: 1,
          callbacks: {
            label: (ctx) => ` -$${ctx.parsed.y.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN`
          }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(51, 65, 85, 0.2)' },
          ticks: { color: '#94a3b8', font: { size: 10 } }
        },
        y: {
          grid: { color: 'rgba(51, 65, 85, 0.2)' },
          ticks: {
            color: '#94a3b8',
            font: { size: 10 },
            callback: (val) => `$${val}`
          }
        }
      }
    }
  });
}

function renderCategoryChart(byCategory) {
  const ctx = document.getElementById("categoryChart").getContext("2d");
  const legendDiv = document.getElementById("category-legend");

  if (!byCategory || byCategory.length === 0) {
    byCategory = [{ category: "Sin gastos aún", total: 1 }];
  }

  const labels = byCategory.map(c => c.category);
  const data = byCategory.map(c => c.total);
  const colors = labels.map(l => CATEGORY_COLORS[l] || "#94a3b8");

  legendDiv.innerHTML = byCategory.map(c => {
    if (c.category === "Sin gastos aún") return "";
    const color = CATEGORY_COLORS[c.category] || "#94a3b8";
    return `
      <div class="flex items-center justify-between py-0.5">
        <span class="flex items-center space-x-1.5 truncate">
          <span class="w-2.5 h-2.5 rounded-full flex-shrink-0" style="background-color: ${color}"></span>
          <span class="text-slate-300 truncate">${c.category}</span>
        </span>
        <span class="font-semibold text-slate-200 ml-2">$${c.total.toLocaleString('es-MX')}</span>
      </div>
    `;
  }).join("");

  if (categoryChartInstance) {
    categoryChartInstance.data.labels = labels;
    categoryChartInstance.data.datasets[0].data = data;
    categoryChartInstance.data.datasets[0].backgroundColor = colors;
    categoryChartInstance.update();
    return;
  }

  categoryChartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: colors,
        borderWidth: 0,
        hoverOffset: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#0f172a',
          titleColor: '#e2e8f0',
          borderColor: '#1e293b',
          borderWidth: 1,
          callbacks: {
            label: (ctx) => ` ${ctx.label}: $${ctx.parsed.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN`
          }
        }
      },
      cutout: '70%'
    }
  });
}

// --- CARGAR Y FILTRAR TABLA ---
async function loadInitialTransactions() {
  try {
    const res = await fetch("/api/transactions?limit=150");
    allTransactions = await res.json();
    renderTransactionsTable();
  } catch (err) {
    console.error("Error al cargar transacciones:", err);
  }
}

function renderTransactionsTable() {
  const tbody = document.getElementById("transactions-tbody");
  const flowFilter = document.getElementById("flow-filter").value;
  const catFilter = document.getElementById("category-filter").value;
  const search = document.getElementById("search-input").value.toLowerCase();

  const filtered = allTransactions.filter(tx => {
    // Filtro de flujo
    if (flowFilter === "egreso" && tx.flow_type === "ingreso") return false;
    if (flowFilter === "ingreso" && tx.flow_type !== "ingreso") return false;
    if (flowFilter === "transfer") {
      const isTransfer = (tx.transaction_type && tx.transaction_type.toLowerCase().includes("transferencia")) ||
                         (tx.category && tx.category.toLowerCase().includes("transferencia"));
      if (!isTransfer) return false;
    }

    // Filtro de categoría
    if (catFilter !== "all" && tx.category !== catFilter) return false;

    // Filtro de búsqueda
    if (search) {
      const textMatch = (tx.merchant && tx.merchant.toLowerCase().includes(search)) ||
                        (tx.raw_text && tx.raw_text.toLowerCase().includes(search));
      if (!textMatch) return false;
    }

    return true;
  });

  document.getElementById("tx-total-badge").textContent = filtered.length;

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center py-12 text-slate-500">
          <i data-lucide="inbox" class="w-8 h-8 mx-auto mb-2 opacity-50"></i>
          No hay movimientos que coincidan con la búsqueda.
        </td>
      </tr>
    `;
    lucide.createIcons();
    return;
  }

  tbody.innerHTML = filtered.map(tx => createRowHtml(tx)).join("");
  lucide.createIcons();
}

function createRowHtml(tx, isNew = false) {
  const isIncome = tx.flow_type === "ingreso";
  const icon = CATEGORY_ICONS[tx.category] || (isIncome ? "download" : "shopping-cart");
  const catColor = CATEGORY_COLORS[tx.category] || (isIncome ? "#10b981" : "#f43f5e");
  const digits = tx.card_digits ? `•••• ${tx.card_digits}` : (tx.card_type || "Débito");
  const animateClass = isNew ? "new-tx-animate" : "";

  // Badge de flujo
  const flowBadge = isIncome 
    ? `<span class="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-600/40 text-emerald-400 text-[10px] font-bold uppercase"><i data-lucide="arrow-down-left" class="w-3 h-3"></i><span>Ingreso</span></span>`
    : `<span class="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-rose-950/80 border border-rose-600/40 text-rose-400 text-[10px] font-bold uppercase"><i data-lucide="arrow-up-right" class="w-3 h-3"></i><span>Gasto</span></span>`;

  // Monto con signo y color
  const amountHtml = isIncome
    ? `<span class="font-black text-emerald-400 text-sm">+$${tx.amount.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>`
    : `<span class="font-black text-rose-400 text-sm">-$${tx.amount.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>`;

  return `
    <tr id="tx-row-${tx.id}" class="border-b border-slate-800/40 hover:bg-slate-800/30 transition ${animateClass}">
      
      <!-- Flujo -->
      <td class="py-3 px-4">
        ${flowBadge}
      </td>

      <!-- Comercio / Origen / Destino -->
      <td class="py-3 px-4">
        <div class="flex items-center space-x-3">
          <div class="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style="background-color: ${catColor}15; color: ${catColor}; border: 1px solid ${catColor}30">
            <i data-lucide="${icon}" class="w-4 h-4"></i>
          </div>
          <div>
            <div class="font-bold text-white text-xs">${tx.merchant}</div>
            <div class="text-[11px] text-slate-400 truncate max-w-xs" title="${tx.raw_text || ''}">
              ${tx.raw_text ? tx.raw_text.slice(0, 48) + '...' : tx.transaction_type}
            </div>
          </div>
        </div>
      </td>

      <!-- Categoría -->
      <td class="py-3 px-4">
        <span class="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg text-[11px] font-medium" style="background-color: ${catColor}15; color: ${catColor}">
          <span class="w-1.5 h-1.5 rounded-full" style="background-color: ${catColor}"></span>
          <span>${tx.category}</span>
        </span>
      </td>

      <!-- Tarjeta / Cuenta -->
      <td class="py-3 px-4 text-slate-300">
        <span class="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-[11px] font-mono">
          <i data-lucide="credit-card" class="w-3 h-3 text-blue-400"></i>
          <span>${digits}</span>
        </span>
      </td>

      <!-- Fecha -->
      <td class="py-3 px-4 text-slate-400 text-[11px] whitespace-nowrap">
        ${tx.timestamp}
      </td>

      <!-- Monto -->
      <td class="py-3 px-4 text-right">
        ${amountHtml}
        <span class="text-[10px] text-slate-500 ml-0.5 font-mono">MXN</span>
      </td>

      <!-- Acciones -->
      <td class="py-3 px-4 text-center">
        <button onclick="deleteTx(${tx.id})" class="p-1 text-slate-500 hover:text-rose-400 transition" title="Eliminar">
          <i data-lucide="trash-2" class="w-4 h-4"></i>
        </button>
      </td>
    </tr>
  `;
}

function prependTransactionRow(tx) {
  allTransactions.unshift(tx);
  const tbody = document.getElementById("transactions-tbody");
  
  if (tbody.innerText.includes("Esperando") || tbody.innerText.includes("No hay movimientos")) {
    tbody.innerHTML = "";
  }
  
  const tempDiv = document.createElement("table");
  tempDiv.innerHTML = `<tbody>${createRowHtml(tx, true)}</tbody>`;
  const newRow = tempDiv.querySelector("tr");
  tbody.insertBefore(newRow, tbody.firstChild);

  document.getElementById("tx-total-badge").textContent = allTransactions.length;
  lucide.createIcons();
}

function replaceTransactionRow(tx) {
  const idx = allTransactions.findIndex(t => t.id === tx.id);
  if (idx !== -1) allTransactions[idx] = tx;
  const existingRow = document.getElementById(`tx-row-${tx.id}`);
  if (existingRow) {
    existingRow.outerHTML = createRowHtml(tx);
    lucide.createIcons();
  }
}

function removeTransactionRow(txId) {
  allTransactions = allTransactions.filter(t => t.id !== txId);
  const row = document.getElementById(`tx-row-${txId}`);
  if (row) row.remove();
  document.getElementById("tx-total-badge").textContent = allTransactions.length;
}

function filterTransactions() {
  renderTransactionsTable();
}

async function deleteTx(id) {
  if (!confirm("¿Deseas eliminar este registro?")) return;
  try {
    await fetch(`/api/transactions/${id}`, { method: "DELETE" });
  } catch (err) {
    alert("Error al eliminar: " + err);
  }
}

async function promptBudget() {
  const current = document.getElementById("kpi-total-budget").textContent.replace(/\D/g, "");
  const input = prompt("Ingresa tu presupuesto mensual de gastos en MXN:", current || "15000");
  if (input && !isNaN(input) && Number(input) > 0) {
    await fetch("/api/budget", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ budget: Number(input) })
    });
  }
}

async function submitManualExpense(e) {
  e.preventDefault();
  const flow = document.getElementById("man-flow").value;
  const amount = parseFloat(document.getElementById("man-amount").value);
  const merchant = document.getElementById("man-merchant").value;
  const category = document.getElementById("man-category").value;

  if (!amount || !merchant) return;

  try {
    await fetch("/api/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: amount,
        merchant: merchant,
        category: category,
        flow_type: flow,
        transaction_type: flow === "ingreso" ? "Depósito/Transferencia" : "Compra/Envío",
        card_type: "Débito"
      })
    });
    closeModal('manual-modal');
    document.getElementById("manual-form").reset();
  } catch (err) {
    alert("Error al guardar: " + err);
  }
}

async function sendSimulatePreset(preset) {
  try {
    await fetch("/api/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preset: preset })
    });
    closeModal('sim-modal');
  } catch (err) {
    alert("Error en simulación: " + err);
  }
}

async function sendSimulateCustom() {
  const text = document.getElementById("sim-custom-text").value.trim();
  if (!text) return;
  try {
    const res = await fetch("/api/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: text })
    });
    if (!res.ok) {
      const err = await res.json();
      alert("Error: " + err.detail);
      return;
    }
    closeModal('sim-modal');
    document.getElementById("sim-custom-text").value = "";
  } catch (err) {
    alert("Error: " + err);
  }
}

function openModal(id) {
  const m = document.getElementById(id);
  m.classList.remove("hidden");
  m.classList.add("flex");
}

function closeModal(id) {
  const m = document.getElementById(id);
  m.classList.add("hidden");
  m.classList.remove("flex");
}

window.addEventListener("DOMContentLoaded", () => {
  lucide.createIcons();
  initWebSocket();
});
