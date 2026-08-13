/* --- GESTIÓN DE INSTANCIAS DE CHART.JS ---
 * Cada gráfico vive una sola vez; renderX() destruye la instancia previa
 * antes de crear una nueva, para no acumular canvases fantasma.
 *
 * IMPORTANTE: todas las funciones verifican que `Chart` (la librería, cargada
 * por CDN en index.html) exista antes de usarla. Si el CDN no cargó a tiempo
 * (firewall, antivirus, conexión lenta, bloqueador de anuncios), NO se lanza
 * una excepción — solo se omite el gráfico. Esto evita que una falla de red
 * externa tumbe el resto del dashboard (ver también el try/catch alrededor
 * de renderAll en main.js).
 *
 * CORRECCIÓN (auditoría 9-ago-2026, reportado por el Dr. Ortega: "las gráficas
 * de los simuladores no funcionan, se queda vacío y únicamente sale la nota
 * al final del recuadro"): antes esta función solo avisaba por consola
 * (console.warn), invisible para cualquiera que no tenga las herramientas de
 * desarrollador abiertas. Eso explica EXACTAMENTE el síntoma reportado: en
 * simulator.js, `updateGlucoseChart(...)` (que depende de Chart.js) y
 * `toggleContrastNote(...)` (que NO depende de Chart.js) se llaman en
 * secuencia — si el CDN de Chart.js no cargó, la primera se omite en
 * silencio y la segunda sí se pinta con normalidad, dejando exactamente lo
 * que se reportó: el recuadro de la gráfica vacío y solo la nota visible.
 * Ahora se muestra un aviso visible en pantalla (mismo estilo que el banner
 * de renderAll en main.js) la primera vez que esto ocurre, para que sea
 * diagnosticable sin abrir la consola.
 */

function showChartLibWarningBanner() {
  if (document.getElementById("chartLibWarningBanner")) return; // no duplicar
  const main = document.querySelector("main");
  if (!main) return;
  const banner = document.createElement("div");
  banner.id = "chartLibWarningBanner";
  banner.className = "max-w-6xl mx-auto mb-4 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-800 text-xs font-bold text-amber-700 dark:text-amber-300 flex items-center justify-between gap-3";
  banner.innerHTML = `<span>⚠️ La librería de gráficas (Chart.js) no cargó — las curvas de EndoSimulators/EndoNut no pueden dibujarse. Suele deberse a un bloqueador de anuncios/antivirus/firewall bloqueando cdnjs.cloudflare.com. Desactívalo para este sitio o revisa tu conexión, y recarga la página.</span>
    <button style="cursor:pointer" class="shrink-0 font-black">✕</button>`;
  banner.querySelector("button").onclick = () => banner.remove();
  main.prepend(banner);
}

function chartLibDisponible() {
  if (typeof Chart === "undefined") {
    console.warn("Chart.js no está disponible (¿falló el CDN?). Se omite este gráfico.");
    showChartLibWarningBanner();
    return false;
  }
  return true;
}

const instances = {
  pharma: null,
  weight: null,
  glucose: null,
  bp: null,
};

/**
 * Curva PK/PD de 24h para EndoFarma (reemplaza el gráfico de pasos de
 * titulación — Dr. Ortega, 10/11-ago-2026, estilo inspirado en la imagen de
 * referencia de curvas de insulina que envió). `curve` es la salida de
 * `buildPKCurve()` en pk-curves.js: [{h, level}, ...] cada 0.5h, 0 a 24,
 * normalizado 0-100. `colorHex` distingue visualmente cada grupo
 * farmacológico (mismo color que ya usa la tarjeta del fármaco en la UI).
 */
export function renderPharmaPKChart(canvasId, curve, colorHex = "#3b82f6") {
  if (!chartLibDisponible()) return;
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  if (instances.pharma) instances.pharma.destroy();
  instances.pharma = new Chart(canvas.getContext("2d"), {
    type: "line",
    data: {
      datasets: [{
        data: curve.map((p) => ({ x: p.h, y: p.level })),
        borderColor: colorHex,
        backgroundColor: `${colorHex}33`, // ~20% opacidad, mismo look "área sombreada" que la referencia
        fill: true,
        tension: 0.35,
        pointRadius: 0,
        borderWidth: 2,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: "index" },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (items) => `Hora ${items[0].parsed.x}`,
            label: (item) => `Nivel relativo: ${item.parsed.y}%`,
          },
        },
      },
      scales: {
        x: {
          type: "linear",
          min: 0,
          max: 24,
          ticks: { stepSize: 2, color: "#94a3b8", font: { size: 10 } },
          grid: { display: false },
          title: { display: true, text: "Horas", color: "#94a3b8", font: { size: 10, weight: "bold" } },
        },
        y: {
          display: false,
          min: 0,
          max: 110,
        },
      },
    },
  });
}

/**
 * Proyección de peso con estilo "3D" (degradado + sombra + puntos con
 * relieve) — parte del diseño final del proyecto (11-ago-2026, rediseño
 * visual completo), mismo tratamiento que las curvas de EndoSimulators.
 */
export function renderWeightProjectionChart(labels, data) {
  if (!chartLibDisponible()) return;
  const canvas = document.getElementById("weightLossChart");
  if (!canvas) return;
  if (instances.weight) instances.weight.destroy();

  const ctx = canvas.getContext("2d");
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.clientHeight || 260);
  gradient.addColorStop(0, "rgba(6,182,212,0.55)");
  gradient.addColorStop(0.6, "rgba(6,182,212,0.15)");
  gradient.addColorStop(1, "rgba(6,182,212,0.0)");

  instances.weight = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "Peso proyectado (kg)",
        data,
        borderColor: "#0891b2",
        borderWidth: 3,
        backgroundColor: gradient,
        fill: true,
        tension: 0.35,
        pointRadius: 4,
        pointBackgroundColor: "#ffffff",
        pointBorderColor: "#0891b2",
        pointBorderWidth: 2,
        pointHoverRadius: 7,
        pointHoverBackgroundColor: "#0891b2",
        pointHoverBorderColor: "#ffffff",
        pointHoverBorderWidth: 2,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: "index" },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "rgba(15,23,42,0.9)",
          padding: 10,
          cornerRadius: 8,
          displayColors: false,
        },
      },
      scales: {
        x: { grid: { display: false } },
        y: { grid: { color: "rgba(148,163,184,0.15)" } },
      },
    },
    // Plugin inline: dibuja una sombra debajo de la línea antes de trazarla,
    // dando un efecto de "elevación" (look 3D sin dependencias nuevas).
    plugins: [{
      id: "lineShadow3d",
      beforeDatasetDraw(chart) {
        const { ctx } = chart;
        ctx.save();
        ctx.shadowColor = "rgba(8,145,178,0.35)";
        ctx.shadowBlur = 12;
        ctx.shadowOffsetY = 6;
      },
      afterDatasetDraw(chart) {
        chart.ctx.restore();
      },
    }],
  });
}

/** Ajusta las gráficas existentes cuando su pestaña vuelve a ser visible
 * (Chart.js calcula mal el tamaño de un canvas que estaba en display:none
 * al momento de crearse — por eso la gráfica podía verse "rota"/invisible
 * la primera vez que se entraba a EndoNut/EndoSimulators). */
export function resizeCharts() {
  Object.values(instances).forEach((inst) => inst?.resize());
}

/**
 * EndoSimulators: curva glucémica posprandial, con el mismo estilo "3D" (degradado
 * + sombra) que la proyección de peso. Cuando `dataTratamiento` viene (porque
 * ya hay antidiabéticos/insulina agregados a EndoNote desde EndoManagement),
 * se dibuja una SEGUNDA línea contrastada — "curva con tratamiento actual" —
 * para visualizar cómo cambiaría el comportamiento glucémico proyectado.
 *
 * Se recrea el gráfico completo en cada llamada (en vez de reusar la
 * instancia y solo actualizar datasets) porque las labels cambian de
 * resolución y el número de datasets (1 o 2) también puede cambiar.
 */
export function updateGlucoseChart(labels, dataBasal, dataTratamiento = null) {
  if (!chartLibDisponible()) return;
  const canvas = document.getElementById("glucoseChart");
  if (!canvas) return;
  if (instances.glucose) instances.glucose.destroy();

  const ctx = canvas.getContext("2d");
  const gradientBasal = ctx.createLinearGradient(0, 0, 0, canvas.clientHeight || 260);
  gradientBasal.addColorStop(0, "rgba(6,182,212,0.5)");
  gradientBasal.addColorStop(0.6, "rgba(6,182,212,0.12)");
  gradientBasal.addColorStop(1, "rgba(6,182,212,0.0)");

  const datasets = [{
    label: dataTratamiento ? "Curva basal (sin tratamiento)" : "Glucemia proyectada",
    data: dataBasal,
    borderColor: "#0891b2",
    borderWidth: 3,
    backgroundColor: gradientBasal,
    fill: true,
    tension: 0.35,
    pointRadius: 3,
    pointBackgroundColor: "#ffffff",
    pointBorderColor: "#0891b2",
    pointBorderWidth: 2,
    pointHoverRadius: 6,
  }];

  if (dataTratamiento) {
    const gradientTx = ctx.createLinearGradient(0, 0, 0, canvas.clientHeight || 260);
    gradientTx.addColorStop(0, "rgba(16,185,129,0.45)");
    gradientTx.addColorStop(0.6, "rgba(16,185,129,0.10)");
    gradientTx.addColorStop(1, "rgba(16,185,129,0.0)");
    datasets.push({
      label: "Curva proyectada con tratamiento actual",
      data: dataTratamiento,
      borderColor: "#059669",
      borderWidth: 3,
      borderDash: [6, 4],
      backgroundColor: gradientTx,
      fill: true,
      tension: 0.35,
      pointRadius: 3,
      pointBackgroundColor: "#ffffff",
      pointBorderColor: "#059669",
      pointBorderWidth: 2,
      pointHoverRadius: 6,
    });
  }

  instances.glucose = new Chart(ctx, {
    type: "line",
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: "index" },
      plugins: {
        legend: { display: !!dataTratamiento, position: "top", labels: { boxWidth: 12, font: { size: 11 } } },
        tooltip: {
          backgroundColor: "rgba(15,23,42,0.9)",
          padding: 10,
          cornerRadius: 8,
        },
      },
      scales: {
        x: { grid: { display: false } },
        y: { grid: { color: "rgba(148,163,184,0.15)" }, title: { display: true, text: "mg/dL", font: { size: 10 } } },
      },
    },
    plugins: [{
      id: "lineShadow3dGlucose",
      beforeDatasetDraw(chart) {
        const { ctx } = chart;
        ctx.save();
        ctx.shadowColor = "rgba(8,145,178,0.3)";
        ctx.shadowBlur = 10;
        ctx.shadowOffsetY = 5;
      },
      afterDatasetDraw(chart) {
        chart.ctx.restore();
      },
    }],
  });
}

/**
 * EndoSimulators — Presión Arterial: curva circadiana de 24 h, mismo estilo
 * "3D" (degradado + sombra) que glucosa/peso. Dibuja SIEMPRE las 2 curvas
 * basales (TAS/TAD); cuando hay antihipertensivos con hora de toma
 * capturada, agrega las curvas "con tratamiento" (TAS/TAD) como líneas
 * punteadas — hasta 4 datasets simultáneos. Se recrea el gráfico completo
 * en cada llamada, mismo motivo que updateGlucoseChart (las labels/número
 * de datasets pueden cambiar entre llamadas).
 */
export function updateBPChart(labels, basalSist, basalDiast, txSist = null, txDiast = null) {
  if (!chartLibDisponible()) return;
  const canvas = document.getElementById("bpChart");
  if (!canvas) return;
  if (instances.bp) instances.bp.destroy();

  const ctx = canvas.getContext("2d");
  const gradSist = ctx.createLinearGradient(0, 0, 0, canvas.clientHeight || 260);
  gradSist.addColorStop(0, "rgba(225,29,72,0.4)");
  gradSist.addColorStop(0.6, "rgba(225,29,72,0.10)");
  gradSist.addColorStop(1, "rgba(225,29,72,0.0)");
  const gradDiast = ctx.createLinearGradient(0, 0, 0, canvas.clientHeight || 260);
  gradDiast.addColorStop(0, "rgba(79,70,229,0.35)");
  gradDiast.addColorStop(0.6, "rgba(79,70,229,0.08)");
  gradDiast.addColorStop(1, "rgba(79,70,229,0.0)");

  const datasets = [
    {
      label: "TAS basal",
      data: basalSist,
      borderColor: "#e11d48",
      borderWidth: 3,
      backgroundColor: gradSist,
      fill: true,
      tension: 0.35,
      pointRadius: 2,
      pointHoverRadius: 5,
    },
    {
      label: "TAD basal",
      data: basalDiast,
      borderColor: "#4f46e5",
      borderWidth: 3,
      backgroundColor: gradDiast,
      fill: true,
      tension: 0.35,
      pointRadius: 2,
      pointHoverRadius: 5,
    },
  ];

  if (txSist) {
    datasets.push({
      label: "TAS con tratamiento",
      data: txSist,
      borderColor: "#9f1239",
      borderWidth: 2.5,
      borderDash: [6, 4],
      fill: false,
      tension: 0.35,
      pointRadius: 2,
      pointHoverRadius: 5,
    });
  }
  if (txDiast) {
    datasets.push({
      label: "TAD con tratamiento",
      data: txDiast,
      borderColor: "#3730a3",
      borderWidth: 2.5,
      borderDash: [6, 4],
      fill: false,
      tension: 0.35,
      pointRadius: 2,
      pointHoverRadius: 5,
    });
  }

  instances.bp = new Chart(ctx, {
    type: "line",
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: "index" },
      plugins: {
        legend: { display: true, position: "top", labels: { boxWidth: 12, font: { size: 10 } } },
        tooltip: {
          backgroundColor: "rgba(15,23,42,0.9)",
          padding: 10,
          cornerRadius: 8,
        },
      },
      scales: {
        x: { grid: { display: false } },
        y: { grid: { color: "rgba(148,163,184,0.15)" }, title: { display: true, text: "mmHg", font: { size: 10 } } },
      },
    },
    plugins: [{
      id: "lineShadow3dBP",
      beforeDatasetDraw(chart) {
        const { ctx } = chart;
        ctx.save();
        ctx.shadowColor = "rgba(225,29,72,0.25)";
        ctx.shadowBlur = 8;
        ctx.shadowOffsetY = 4;
      },
      afterDatasetDraw(chart) {
        chart.ctx.restore();
      },
    }],
  });
}
