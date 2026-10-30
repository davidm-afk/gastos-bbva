// BBVA LiveTracker Frontend Application Logic
let ws = null;
let soundEnabled = true;
let allTransactions = [];
let trendChartInstance = null;
let categoryChartInstance = null;

// Categorías y Colores
const CATEGORY_COLORS = {
  "Alimentos & Restaurantes": "#f59e0b",
  "Supermercado & Abarrotes": "#10b981",
  "Transporte & Movilidad": "#3b82f6",
  "Salud & Farmacias": "#ec4899",
  "Servicios & Suscripciones": "#8b5cf6",
  "Entretenimiento & Ocio": "#06b6d4",
  "Compras & Ropa": "#f97316",
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
  "Financiero & Retiros": "landmark",
  "Otros Gastos": "tag"
};

// --- SONIDO SINTETIZADO CON WEB AUDIO API ---
function playNotificationChime() {
  if (!soundEnabled) return;
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    
    // Tono 1 (880 Hz)
    const osc1 = audioCtx.createOscillator();
    const gain1 = audioCtx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(880, audioCtx.currentTime); // A5
    gain1.gain.setValueAtTime(0.15, audioCtx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
    osc1.connect(gain1);
    gain1.connect(audioCtx.destination);
    osc1.start();
    osc1.stop(audioCtx.currentTime + 0.3);

    // Tono 2 (1318.5 Hz - E6)
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
    playNotificationChime();
  } else {
    icon.setAttribute("data-lucide", "volume-x");
    icon.classList.remove("text-emerald-400");
    icon.classList.add("text-slate-500");
  }
  lucide.createIcons();
}

// --- CONEXIÓN WEBSOCKET EN TIEMPO REAL ---
function initWebSocket() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = `${protocol}//${window.location.host}/ws`;

  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    updateStatusPill(true);
    console.log("WebSocket conectado con éxito");
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
    // Intentar reconectar automáticamente cada 3 segundos
    setTimeout(initWebSocket, 3000);
  };

  ws.onerror = (err) => {
    console.warn("Error en WebSocket:", err);
    ws.close();
  };
}

function updateStatusPill(connected) {
  const pill = document.getElementById("status-pill");
  const text = document.getElementById("status-text");
  
  if (connected) {
    pill.className = "flex items-center space-x-2 px-3 py-1.5 rounded-full bg-emerald-950/60 border border-emerald-600/40 text-emerald-400 text-xs font-medium";
    pill.innerHTML = `<span class="w-2.5 h-2.5 rounded-full bg-emerald-400 live-pulse"></span><span>Conectado en Vivo</span>`;
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
    playNotificationChime();
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

// --- ACTUALIZACIÓN DE KPIS Y GRÁFICOS ---
function updateAnalyticsUI(analytics) {
  if (!analytics) return;

  // Formato de moneda
  const fmt = (num) => `$${Number(num).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  document.getElementById("kpi-total-month").textContent = fmt(analytics.total_month);
  document.getElementById("kpi-total-today").textContent = fmt(analytics.total_today);
  document.getElementById("kpi-remaining-budget").textContent = fmt(analytics.remaining_budget);
  document.getElementById("kpi-total-budget").textContent = `Meta: ${fmt(analytics.budget)}`;
  document.getElementById("kpi-percent-spent").textContent = `${analytics.percent_spent}% consumido`;

  document.getElementById("kpi-count-month").innerHTML = `<span class="text-slate-300 font-semibold mr-1">${analytics.count_month}</span> compras registradas`;
  document.getElementById("kpi-count-today").innerHTML = `<span class="text-slate-300 font-semibold mr-1">${analytics.count_today}</span> movimientos hoy`;

  // Barra de progreso
  const budgetBar = document.getElementById("budget-bar");
  const pct = Math.min(100, analytics.percent_spent);
  budgetBar.style.width = `${pct}%`;
  if (pct > 90) {
    budgetBar.className = "bg-gradient-to-r from-amber-500 to-rose-500 h-2 rounded-full transition-all duration-500";
  } else {
    budgetBar.className = "bg-gradient-to-r from-cyan-500 to-blue-500 h-2 rounded-full transition-all duration-500";
  }

  // Actualizar gráficos
  renderTrendChart(analytics.by_day);
  renderCategoryChart(analytics.by_category);
}

// --- GRÁFICO DE TENDENCIA DIARIA ---
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
        borderColor: '#38bdf8',
        backgroundColor: 'rgba(56, 189, 248, 0.1)',
        borderWidth: 2.5,
        fill: true,
        tension: 0.35,
        pointBackgroundColor: '#0284c7',
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
          bodyColor: '#38bdf8',
          borderColor: '#1e293b',
          borderWidth: 1,
          callbacks: {
            label: (ctx) => ` $${ctx.parsed.y.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN`
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

// --- GRÁFICO DE DONA POR CATEGORÍA ---
function renderCategoryChart(byCategory) {
  const ctx = document.getElementById("categoryChart").getContext("2d");
  const legendDiv = document.getElementById("category-legend");

  if (!byCategory || byCategory.length === 0) {
    byCategory = [{ category: "Sin gastos aún", total: 1 }];
  }

  const labels = byCategory.map(c => c.category);
  const data = byCategory.map(c => c.total);
  const colors = labels.map(l => CATEGORY_COLORS[l] || "#94a3b8");

  // Actualizar leyenda personalizada
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

// --- CARGAR Y MANEJAR TABLA DE TRANSACCIONES ---
async function loadInitialTransactions() {
  try {
    const res = await fetch("/api/transactions?limit=100");
    allTransactions = await res.json();
    renderTransactionsTable();
  } catch (err) {
    console.error("Error al cargar transacciones:", err);
  }
}

function renderTransactionsTable() {
  const tbody = document.getElementById("transactions-tbody");
  const catFilter = document.getElementById("category-filter").value;
  const search = document.getElementById("search-input").value.toLowerCase();

  const filtered = allTransactions.filter(tx => {
    const matchesCat = (catFilter === "all" || tx.category === catFilter);
    const matchesSearch = (!search || tx.merchant.toLowerCase().includes(search) || (tx.raw_text && tx.raw_text.toLowerCase().includes(search)));
    return matchesCat && matchesSearch;
  });

  document.getElementById("tx-total-badge").textContent = filtered.length;

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center py-12 text-slate-500">
          <i data-lucide="inbox" class="w-8 h-8 mx-auto mb-2 opacity-50"></i>
          No hay compras que coincidan con la búsqueda.
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
  const icon = CATEGORY_ICONS[tx.category] || "tag";
  const catColor = CATEGORY_COLORS[tx.category] || "#94a3b8";
  const digits = tx.card_digits ? `•••• ${tx.card_digits}` : "Débito";
  const animateClass = isNew ? "new-tx-animate" : "";

  return `
    <tr id="tx-row-${tx.id}" class="border-b border-slate-800/40 hover:bg-slate-800/30 transition ${animateClass}">
      
      <!-- Comercio y Detalle -->
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
        <span class="font-black text-rose-400 text-sm">
          -$${tx.amount.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
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
  
  // Si antes decía 'Esperando compras...', limpiar
  if (tbody.innerText.includes("Esperando compras") || tbody.innerText.includes("No hay compras")) {
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
  if (idx !== -1) {
    allTransactions[idx] = tx;
  }
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

// --- ACCIONES CRUD ---
async function deleteTx(id) {
  if (!confirm("¿Deseas eliminar este registro de gasto?")) return;
  try {
    await fetch(`/api/transactions/${id}`, { method: "DELETE" });
  } catch (err) {
    alert("Error al eliminar la transacción: " + err);
  }
}

async function promptBudget() {
  const current = document.getElementById("kpi-total-budget").textContent.replace(/\D/g, "");
  const input = prompt("Ingresa tu presupuesto mensual en MXN:", current || "15000");
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
        transaction_type: "Compra",
        card_type: "Débito"
      })
    });
    closeModal('manual-modal');
    document.getElementById("manual-form").reset();
  } catch (err) {
    alert("Error al guardar: " + err);
  }
}

// --- SIMULADOR DE NOTIFICACIONES ---
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

// --- MODALES Y UTILIDADES ---
function openModal(id) {
  const m = document.getElementById(id);
  m.classList.remove("hidden");
  m.classList.add("flex");
  
  if (id === 'setup-modal') {
    // Actualizar URL sugerida
    const input = document.getElementById("webhook-url-input");
    input.value = `${window.location.origin}/api/webhook/bbva`;
  }
}

function closeModal(id) {
  const m = document.getElementById(id);
  m.classList.add("hidden");
  m.classList.remove("flex");
}

function copyWebhookUrl() {
  const input = document.getElementById("webhook-url-input");
  input.select();
  navigator.clipboard.writeText(input.value);
  alert("¡URL copiada al portapapeles! Pégala en MacroDroid en tu Samsung A56.");
}

// Iniciar aplicación al cargar el DOM
window.addEventListener("DOMContentLoaded", () => {
  lucide.createIcons();
  initWebSocket();
});

