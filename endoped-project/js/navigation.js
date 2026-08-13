/* --- NAVEGACIÓN ---
 * Cambiar de pestaña NUNCA debe recalcular ni resetear estado
 * (categoría de EndoFarma, simulación de EndoSimulators, slider de déficit).
 * Solo se recalcula cuando el paciente cambia (ver main.js).
 */
import { resizeCharts } from "./charts.js";
import { renderIngresoProgress } from "./ingreso-progress.js";

const TITLE_MAP = {
  "view-riesgo": "Estratificación Global",
  "view-lipidos": "EndoLypids",
  "view-presion": "EndoPressure",
  "view-nutricion": "EndoNut",
  "view-simulador": "EndoSimulators",
  "view-management": "EndoManagement",
  "view-receta": "EndoNote",
  "view-goals": "EndoGoals",
};

/** Color insignia + ícono por módulo (11-ago-2026, rediseño visual general a
 * petición del Dr. Ortega). Alimenta tanto el ícono del topbar (setPageHeader
 * de abajo) como las clases `accent-*` ya puestas en el HTML de cada botón
 * del submenú (ver index.html + CSS `.nav-sub-item.accent-X.active-sub`). */
const MODULE_META = {
  "Ingreso Clínico": { icon: "clipboard-plus", color: "blue" },
  "Estratificación Global": { icon: "layers", color: "sky" },
  "EndoLypids": { icon: "droplet", color: "purple" },
  "EndoPressure": { icon: "heart-pulse", color: "rose" },
  "EndoNut": { icon: "salad", color: "emerald" },
  "EndoManagement": { icon: "clipboard-list", color: "indigo" },
  "EndoNote": { icon: "file-text", color: "violet" },
  "EndoGoals": { icon: "target", color: "amber" },
  "EndoSimulators": { icon: "activity", color: "cyan" },
  "EndoFarma": { icon: "pill", color: "sky" },
  "EndoScreen": { icon: "shield-check", color: "teal" },
  "EndoInsulin": { icon: "syringe", color: "orange" },
  "EndoDiagnostics": { icon: "clipboard-check", color: "fuchsia" },
  "Dashboard": { icon: "layout-dashboard", color: "slate" },
};

/** Pinta el ícono + color del topbar según el módulo activo (reemplaza el
 * antiguo `setText("page-title", ...)` suelto en cada show*()). El ícono se
 * reconstruye con innerHTML + lucide.createIcons() porque lucide ya
 * convirtió el <i> original en <svg> — no basta con cambiar data-lucide. */
function setPageHeader(title) {
  setText("page-title", title);
  const meta = MODULE_META[title];
  const chip = document.getElementById("page-title-icon");
  if (chip && meta) {
    chip.className = `w-8 h-8 rounded-xl flex items-center justify-center shrink-0 bg-${meta.color}-100 dark:bg-${meta.color}-900/30`;
    chip.innerHTML = `<i data-lucide="${meta.icon}" class="w-4 h-4 text-${meta.color}-600 dark:text-${meta.color}-400"></i>`;
    if (typeof lucide !== "undefined") lucide.createIcons();
  }
}

function hideAllViews() {
  document.querySelectorAll(".section-view").forEach((view) => {
    view.classList.add("hidden");
    view.classList.remove("active");
  });
}

/** Limpia el estado "activo" de los 3 botones de primer nivel (Ingreso
 * Clínico, EndoFarma, Dashboard) y de todos los sub-items del submenú.
 * Centralizado aquí para que los 3 puntos de entrada (showIngreso,
 * showFarma, showTab) queden siempre en sintonía. */
function clearTopLevelActive() {
  document.querySelectorAll(".nav-item").forEach((el) => el.classList.remove("active"));
  // "active-sub" es la clase genérica que activa el color ya fijado por la
  // clase accent-{color} propia de cada botón (ver CSS en index.html) — ya
  // no se agregan/quitan clases de color a mano aquí, un solo botón puede
  // quedar de cualquier color sin que este archivo necesite saber cuál.
  document.querySelectorAll(".nav-sub-item").forEach((x) => x.classList.remove("active-sub", "font-bold"));
}

export function showIngreso() {
  hideAllViews();
  const view = document.getElementById("view-ingreso");
  if (view) {
    view.classList.remove("hidden");
    view.classList.add("active");
  }
  setPageHeader("Ingreso Clínico");

  clearTopLevelActive();
  document.querySelector("button[onclick='showIngreso()']")?.classList.add("active");
}

/** EndoFarma: mismo nivel que Ingreso Clínico y Dashboard — no requiere
 * paciente cargado, es un catálogo de consulta libre. */
export function showFarma() {
  hideAllViews();
  const view = document.getElementById("view-farmacia");
  if (view) {
    view.classList.remove("hidden");
    view.classList.add("active");
  }
  setPageHeader("EndoFarma");

  clearTopLevelActive();
  document.querySelector("button[onclick='showFarma()']")?.classList.add("active");

  if (window.innerWidth < 1024) toggleSidebar();
}

/** EndoScreen: mismo nivel jerárquico que Ingreso Clínico/EndoFarma (a
 * petición del Dr. Ortega, 10-ago-2026) — no depende de tener el submenú de
 * Dashboard habilitado. Si no hay antecedente diabetológico capturado
 * todavía, screening.js muestra su propio estado vacío (no se bloquea el
 * acceso, igual que EndoFarma). */
export function showScreening() {
  hideAllViews();
  const view = document.getElementById("view-screening");
  if (view) {
    view.classList.remove("hidden");
    view.classList.add("active");
  }
  setPageHeader("EndoScreen");

  clearTopLevelActive();
  document.querySelector("button[onclick='showScreening()']")?.classList.add("active");

  if (window.innerWidth < 1024) toggleSidebar();
}

/** EndoInsulin: mismo nivel jerárquico que EndoFarma/EndoScreen — promovida
 * desde EndoManagement el 11-ago-2026 a petición del Dr. Ortega. Si el
 * paciente cargado aún no aplica (sin diagnóstico/insulina activa/A1c>9%),
 * insulin.js muestra su propio placeholder (no se bloquea el acceso, igual
 * que EndoScreen). */
export function showInsulinTab() {
  hideAllViews();
  const view = document.getElementById("view-insulin");
  if (view) {
    view.classList.remove("hidden");
    view.classList.add("active");
  }
  setPageHeader("EndoInsulin");

  clearTopLevelActive();
  document.querySelector("button[onclick='showInsulinTab()']")?.classList.add("active");

  if (window.innerWidth < 1024) toggleSidebar();
}

/** EndoDiagnostics: mismo nivel jerárquico que EndoFarma/EndoScreen/
 * EndoInsulin — deliberadamente el ÚLTIMO botón del sidebar (12-ago-2026,
 * a petición del Dr. Ortega: "al final de que todo esté detectado y
 * clasificado"). Reúne comorbilidades + diagnósticos derivados del motor
 * en una sola lista con ícono por padecimiento (ver diagnostics.js). Si
 * el paciente cargado no tiene nada detectado todavía, muestra su propio
 * estado vacío (no se bloquea el acceso, igual que EndoScreen/EndoInsulin). */
export function showDiagnostics() {
  hideAllViews();
  const view = document.getElementById("view-diagnostics");
  if (view) {
    view.classList.remove("hidden");
    view.classList.add("active");
  }
  setPageHeader("EndoDiagnostics");

  clearTopLevelActive();
  document.querySelector("button[onclick='showDiagnostics()']")?.classList.add("active");

  if (window.innerWidth < 1024) toggleSidebar();
}

/** Cambia de pestaña del dashboard. NO recalcula nada. */
export function showTab(viewId, el) {
  hideAllViews();
  const target = document.getElementById(viewId);
  if (target) {
    target.classList.remove("hidden");
    target.classList.add("active");
  }

  clearTopLevelActive();
  if (el) {
    el.classList.remove("text-slate-500");
    el.classList.add("active-sub", "font-bold");
  }

  setPageHeader(TITLE_MAP[viewId] || "Dashboard");

  // CORRECCIÓN: Chart.js calcula mal el tamaño de un <canvas> que estaba
  // dentro de una vista oculta (display:none) al momento de crearse — por
  // eso las gráficas de EndoNut/EndoSimulators podían verse rotas o invisibles
  // la primera vez que se entraba a esas pestañas. Al volverse visible la
  // vista, se le pide a Chart.js que recalcule el tamaño real del canvas.
  requestAnimationFrame(() => resizeCharts());

  if (window.innerWidth < 1024) toggleSidebar();
}

/**
 * EndoSimulators: alterna entre las sub-pestañas "Glucosa" y "Presión
 * Arterial" DENTRO de view-simulador. No recalcula nada por sí sola — la
 * pestaña de Presión Arterial recibe su propio callback opcional
 * (`onShowPresion`) para disparar su primer render justo al volverse
 * visible (evita el bug de Chart.js con canvas creado en display:none,
 * ya que aquí la visibilidad se resuelve ANTES de invocar el callback).
 */
export function showSimSubtab(tab, el, onShowPresion) {
  document.querySelectorAll(".sim-subtab-btn").forEach((b) => {
    b.classList.remove("bg-white", "dark:bg-slate-900", "shadow", "text-cyan-600", "dark:text-cyan-400");
    b.classList.add("text-slate-400");
  });
  if (el) {
    el.classList.remove("text-slate-400");
    el.classList.add("bg-white", "dark:bg-slate-900", "shadow", "text-cyan-600", "dark:text-cyan-400");
  }
  document.getElementById("subtab-glucosa")?.classList.toggle("hidden", tab !== "glucosa");
  document.getElementById("subtab-presion")?.classList.toggle("hidden", tab !== "presion");

  if (tab === "presion" && typeof onShowPresion === "function") onShowPresion();
}

export function enableDashboardMenu() {
  const btn = document.getElementById("btn-dashboard-parent");
  if (btn) {
    btn.disabled = false;
    btn.classList.remove("opacity-60", "cursor-not-allowed");
    btn.classList.add("hover:bg-slate-50", "dark:hover:bg-slate-800");
  }
}

export function disableDashboardMenu() {
  const btn = document.getElementById("btn-dashboard-parent");
  if (btn) {
    btn.disabled = true;
    btn.classList.add("opacity-60", "cursor-not-allowed");
    btn.classList.remove("hover:bg-slate-50", "dark:hover:bg-slate-800");
  }
}

export function toggleDashboardMenu() {
  const submenu = document.getElementById("dashboard-submenu");
  const chevron = document.getElementById("dashboard-chevron");
  if (!submenu) return;
  const isHidden = submenu.classList.toggle("hidden");
  if (chevron) chevron.style.transform = isHidden ? "rotate(0deg)" : "rotate(180deg)";
}

export function toggleSidebar() {
  document.getElementById("sidebar")?.classList.toggle("-translate-x-full");
  document.getElementById("mobile-menu-overlay")?.classList.toggle("hidden");
}

export function initAccordion() {
  document.querySelectorAll(".accordion-content.open").forEach((section) => {
    section.style.maxHeight = section.scrollHeight + "px";
  });
}

export function toggleSection(id) {
  for (let i = 1; i <= 7; i++) {
    const body = document.getElementById(`body-section-${i}`);
    const icon = document.getElementById(`icon-section-${i}`);
    if (!body) continue;
    if (i === id) {
      const wasOpen = body.classList.contains("open");
      body.classList.toggle("open", !wasOpen);
      body.style.maxHeight = wasOpen ? null : body.scrollHeight + "px";
      if (icon) icon.style.transform = wasOpen ? "rotate(0deg)" : "rotate(180deg)";
      // Marca la sección como "revisada" la primera vez que se abre — usado
      // por la barra de progreso para secciones 5-7 (solo checkboxes, donde
      // "nada marcado" es una respuesta clínica válida y no puede exigirse).
      if (!wasOpen) body.dataset.visited = "1";
    } else if (body.classList.contains("open")) {
      body.classList.remove("open");
      body.style.maxHeight = null;
      if (icon) icon.style.transform = "rotate(0deg)";
    }
  }
  renderIngresoProgress();
}

export function toggleDarkMode() {
  const html = document.documentElement;
  const dot = document.getElementById("dark-toggle-dot");
  const isDark = html.classList.toggle("dark");
  localStorage.setItem("theme", isDark ? "dark" : "light");
  if (dot) {
    dot.classList.toggle("translate-x-5", isDark);
    dot.classList.toggle("translate-x-1", !isDark);
  }
}

export function applyStoredTheme() {
  const html = document.documentElement;
  const dot = document.getElementById("dark-toggle-dot");
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const stored = localStorage.getItem("theme");
  if (stored === "dark" || (!stored && prefersDark)) {
    html.classList.add("dark");
    dot?.classList.replace("translate-x-1", "translate-x-5");
  }
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.innerText = text;
}
