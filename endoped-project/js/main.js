/* --- PUNTO DE ENTRADA ---
 * Este archivo es el único que conoce tanto los módulos internos como
 * el HTML existente. Expone en `window` las funciones que el HTML
 * todavía invoca vía onclick="..." — así NO hay que reescribir el
 * markup para migrar a módulos. (Ver MIGRATION.md para el único
 * cambio que sí hace falta: el <script> tag.)
 */
import * as state from "./state.js";
import * as nav from "./navigation.js";
import * as render from "./render.js";
import * as rx from "./rx.js";
import { runComplexSimulation } from "./simulator.js";
import * as simBP from "./simulatorBP.js";
import { generarExpediente } from "./pdfExport.js";
import { calcPAM, calcIMC, calcIndiceTabaquico, calcAlcoholSemanal } from "./calculations.js";
import { onScreeningDateChange, onScreeningNoteChange, renderScreening as renderScreeningView } from "./screening.js";
import { wireBoundaryAlerts } from "./boundary-alerts.js";
import {
  applyBasalDoseToEndoNote,
  applyPrandialDoseToEndoNote,
  insulinRecalcTitulacion,
  insulinRecalcCorreccion,
} from "./insulin.js";
import { initIngresoProgress, resetIngresoProgress } from "./ingreso-progress.js";
import { initPrecisionCompass, renderPrecisionCompass, toggleQuickMode, togglePrecisionCompassPanel } from "./precision-compass.js";
import { logPrecisionSnapshot, exportPrecisionLogCSV } from "./precision-log.js";

/** Muestra un aviso discreto y descartable si algo del dashboard no pudo cargar
 * (ej. un CDN externo bloqueado), sin impedir el uso del resto de la app. */
function showRenderWarning() {
  if (document.getElementById("renderWarningBanner")) return; // no duplicar
  const main = document.querySelector("main");
  if (!main) return;
  const banner = document.createElement("div");
  banner.id = "renderWarningBanner";
  banner.className = "max-w-6xl mx-auto mb-4 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-800 text-xs font-bold text-amber-700 dark:text-amber-300 flex items-center justify-between gap-3";
  banner.innerHTML = `<span>⚠️ Algunas gráficas no cargaron (posible bloqueo de red a un recurso externo). El resto del dashboard funciona con normalidad — revisa tu conexión o desactiva bloqueadores de anuncios y recarga la página.</span>
    <button style="cursor:pointer" class="shrink-0 font-black">✕</button>`;
  banner.querySelector("button").onclick = () => banner.remove();
  main.prepend(banner);
}

/* --- Regla central: el paciente es la única fuente de recálculo.
 * Cambiar de pestaña (nav.showTab) NUNCA dispara renderAll.
 * Solo state.setPatient()/restoreSession() lo hace.
 *
 * El try/catch es intencional: si CUALQUIER parte del renderizado falla
 * (ej. un CDN externo que no cargó a tiempo), NO debe impedir que el
 * Dashboard se habilite. Preferimos un dashboard con un gráfico faltante
 * a un dashboard completamente inaccesible. */
state.onPatientChange((p) => {
  try {
    render.renderAll(p);
  } catch (err) {
    console.error("Error renderizando el dashboard (no debería bloquear el acceso):", err);
    showRenderWarning();
  }
});

/** Pantalla de inicio: desvanece el splash y revela el Hub de Módulos
 * (13-ago-2026, ver #moduleHub en index.html) — ya NO revela la app
 * directamente. Se llama al hacer click en cualquier parte de
 * #splashScreen (ver index.html). */
function onDismissSplash() {
  const splash = document.getElementById("splashScreen");
  if (splash) splash.classList.add("splash-hidden");
  showModuleHub();
}

/** Muestra el Hub de Módulos (logo del sidebar -> "cambiar de módulo",
 * y también el paso normal tras el splash). */
function showModuleHub() {
  const hub = document.getElementById("moduleHub");
  if (hub) hub.classList.remove("hub-hidden");
}

/** Click en una tarjeta del Hub. Por ahora solo 'metabolic' tiene motor
 * real (la app EndoCore existente, detrás del hub sin cambios) — las
 * demás (thyroid/bones/fem) son vitrina de diseño y no tienen <button>
 * con onclick en el HTML, así que nunca llegan aquí. */
function enterHubModule(moduleId) {
  if (moduleId !== "metabolic") return;
  const hub = document.getElementById("moduleHub");
  if (hub) hub.classList.add("hub-hidden");
}

function onSubmitForm() {
  const p = state.buildPatientFromForm();
  state.setPatient(p); // dispara renderAll() vía el listener de arriba

  // Registro de precisión (investigación, 16-ago-2026, a petición del Dr.
  // Ortega) — snapshot de qué campos ALTO seguían vacíos justo al pasar de
  // Ingreso Clínico a Dashboard. Sin PHI (ver precision-log.js). No
  // bloquea ni interrumpe el flujo — se ejecuta después de setPatient para
  // no retrasar el render del dashboard con esto.
  logPrecisionSnapshot();

  nav.enableDashboardMenu();
  const submenu = document.getElementById("dashboard-submenu");
  if (submenu && submenu.classList.contains("hidden")) nav.toggleDashboardMenu();

  const submitBtn = document.querySelector("#admissionForm button[type='submit']");
  if (submitBtn) {
    submitBtn.innerHTML = '<i data-lucide="refresh-cw" class="w-5 h-5"></i> ACTUALIZAR DASHBOARD';
    if (typeof lucide !== "undefined") lucide.createIcons();
  }

  const firstTab = document.querySelector("#dashboard-submenu button:first-child");
  nav.showTab("view-riesgo", firstTab);
}

function onClearForm() {
  if (!confirm("¿Estás seguro de limpiar todos los campos?")) return;
  document.querySelectorAll("#admissionForm input").forEach((el) => (el.value = ""));
  document.querySelectorAll("#admissionForm select").forEach((el) => (el.selectedIndex = 0));

  state.clearPatient();

  const submitBtn = document.querySelector("#admissionForm button[type='submit']");
  if (submitBtn) {
    submitBtn.innerHTML = '<i data-lucide="rocket" class="w-5 h-5"></i> IR AL DASHBOARD';
    if (typeof lucide !== "undefined") lucide.createIcons();
  }

  nav.disableDashboardMenu();
  const submenu = document.getElementById("dashboard-submenu");
  if (submenu && !submenu.classList.contains("hidden")) nav.toggleDashboardMenu();

  nav.toggleSection(1);
  resetIngresoProgress();
  renderPrecisionCompass();
}

function onCerrarConsulta() {
  if (!confirm("¿Terminar sesión actual y borrar datos del paciente?")) return;
  state.clearPatient();
  window.location.reload();
}

function onUpdateWeightChart(deficit) {
  render.updateWeightChart(state.getPatient(), Number(deficit));
}

/** EndoSimulators: alterna Glucosa/Presión Arterial. Al entrar a Presión
 * Arterial se dispara su primer render (lista de dosis + gráfica). */
function onShowSimSubtab(tab, el) {
  nav.showSimSubtab(tab, el, simBP.renderBPTab);
}

/** EndoManagement: actualiza el texto libre de Prescripción (ver rx.js) —
 * se refleja de inmediato en EndoNote y, al generar el expediente, en
 * "EndoNote | Tratamiento Otorgado". */
function onUpdatePrescripcionLibre(value) {
  rx.setFreeTextNote(value);
}

/** Ficha de Identificación -> Medicación Actual: muestra/oculta el campo de
 * texto libre "dosis y frecuencia" de un fármaco (detrás del ícono de
 * lápiz, para no saturar visualmente la lista). NO toca la casilla "Máx",
 * que sigue funcionando exactamente igual que antes. */
function onToggleDosisField(categoria, id) {
  const el = document.getElementById(`medActualDosis_${categoria}_${id}`);
  if (!el) return;
  el.classList.toggle("hidden");
  if (!el.classList.contains("hidden")) el.focus();
}

/** Calcula la edad automáticamente a partir de la fecha de nacimiento. */
function onCalcAgeFromDOB() {
  const dobEl = document.getElementById("fecha_nacimiento");
  const edadEl = document.getElementById("edad");
  if (!dobEl || !dobEl.value || !edadEl) return;
  const dob = new Date(dobEl.value);
  if (isNaN(dob.getTime())) return;
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  if (age >= 0) edadEl.value = age;
}

/** Vista previa en vivo de PAM/IMC mientras se llena el formulario de ingreso. */
function onPreviewVitals() {
  const tas = parseFloat(document.getElementById("tas")?.value) || 0;
  const tad = parseFloat(document.getElementById("tad")?.value) || 0;
  const peso = parseFloat(document.getElementById("peso")?.value) || 0;
  const talla = parseFloat(document.getElementById("talla")?.value) || 0;
  const pam = calcPAM({ tas, tad });
  const imc = calcIMC({ peso, talla });
  const pamEl = document.getElementById("previewPAM");
  const imcEl = document.getElementById("previewIMC");
  if (pamEl) pamEl.innerText = pam !== null ? pam + " mmHg" : "--";
  if (imcEl) imcEl.innerText = imc !== null ? imc : "--";
}

/** Vista previa en vivo del índice tabáquico (paquetes-año) mientras se llena el formulario. */
function onPreviewTabaco() {
  const cigarrillosDia = parseFloat(document.getElementById("cigarrillosDia")?.value) || 0;
  const aniosFumando = parseFloat(document.getElementById("aniosFumando")?.value) || 0;
  const indice = calcIndiceTabaquico({ cigarrillosDia, aniosFumando });
  const el = document.getElementById("previewTabaquico");
  if (el) el.innerText = indice !== null ? indice + " paq/año" : "--";
}

/** Muestra/oculta los campos de ml y %vol personalizados según el tipo de bebida elegido. */
function onAlcoholTipoChange() {
  const tipo = document.getElementById("alcoholTipo")?.value;
  const customFields = document.getElementById("alcoholCustomFields");
  if (customFields) customFields.classList.toggle("hidden", tipo !== "otro");
  onPreviewAlcohol();
}

/** Vista previa en vivo de gramos de alcohol/semana mientras se llena el formulario. */
function onPreviewAlcohol() {
  const alcoholTipo = document.getElementById("alcoholTipo")?.value || "";
  const alcoholMlCustom = parseFloat(document.getElementById("alcoholMlCustom")?.value) || 0;
  const alcoholPctCustom = parseFloat(document.getElementById("alcoholPctCustom")?.value) || 0;
  const alcoholBebidasSemana = parseFloat(document.getElementById("alcoholBebidasSemana")?.value) || 0;
  const gSemana = calcAlcoholSemanal({ alcoholTipo, alcoholMlCustom, alcoholPctCustom, alcoholBebidasSemana });
  const el = document.getElementById("previewAlcohol");
  if (el) el.innerText = gSemana !== null ? gSemana + " g/semana" : "--";
}

/* --- Delegación de eventos para contenido generado dinámicamente
 * (tarjetas de fármacos y botones "Agregar a receta" que render.js
 * inyecta con data-attributes en vez de onclick). */
document.addEventListener("click", (e) => {
  const drugCard = e.target.closest("[data-drug-id]");
  if (drugCard && !e.target.closest("[data-add-rx-id]")) {
    render.showPharmaDetail(drugCard.dataset.drugId, drugCard);
    return;
  }
  const rxById = e.target.closest("[data-add-rx-id]");
  if (rxById) {
    rx.addToRxById(rxById.dataset.addRxId);
    return;
  }
  // Tarjeta de "combinación de inicio" (ver render.js buildComboCardHTML):
  // un solo botón agrega TODOS los ids de la combinación a EndoNote, uno por
  // uno, reutilizando addToRxById tal cual (mismo camino que el botón "+"
  // individual, sin duplicar lógica de agregado).
  const rxByIds = e.target.closest("[data-add-rx-ids]");
  if (rxByIds) {
    rxByIds.dataset.addRxIds.split(",").filter(Boolean).forEach((id) => rx.addToRxById(id));
    return;
  }
  const rxByName = e.target.closest("[data-add-rx-name]");
  if (rxByName) {
    rx.addToRxByName(rxByName.dataset.addRxName);
    return;
  }
  const pharmaGroupToggle = e.target.closest("[data-toggle-pharma-group]");
  if (pharmaGroupToggle) {
    render.togglePharmaGroup(pharmaGroupToggle.dataset.togglePharmaGroup);
  }
});

/* --- EndoSimulators (Presión Arterial): hora de toma editable por fármaco.
 * Delegación igual que el bloque anterior, para contenido inyectado
 * dinámicamente por simulatorBP.js. */
document.addEventListener("change", (e) => {
  const doseInput = e.target.closest("[data-dose-time-drug]");
  if (doseInput) {
    simBP.setDoseTime(doseInput.dataset.doseTimeDrug, Number(doseInput.dataset.doseIndex), doseInput.value);
  }
  // EndoScreen: fecha de "último tamizaje realizado" por complicación —
  // redibuja solo esa sección (ver screening.js -> onScreeningDateChange),
  // no dispara el renderAll completo del resto del dashboard.
  const screeningDateInput = e.target.closest("[data-screening-date]");
  if (screeningDateInput) {
    onScreeningDateChange(screeningDateInput.dataset.screeningDate, screeningDateInput.value);
  }
});

/* EndoScreen: descripción/hallazgos por ítem — usa "input" (no "change")
 * para persistir mientras el médico escribe sin perder el cursor, igual
 * que el patrón de dosis editable de EndoManagement más abajo. NO redibuja
 * el panel (a diferencia de la fecha), para no interrumpir la escritura. */
document.addEventListener("input", (e) => {
  const screeningNoteInput = e.target.closest("[data-screening-note]");
  if (screeningNoteInput) {
    onScreeningNoteChange(screeningNoteInput.dataset.screeningNote, screeningNoteInput.value);
  }
});

/* --- EndoManagement: dosis editable de fármacos ya agregados a esta
 * consulta. Usa "input" (no "change") para que EndoNote se actualice en
 * vivo mientras el médico escribe, no solo al perder el foco. */
document.addEventListener("input", (e) => {
  const doseEditInput = e.target.closest("[data-dose-edit-index]");
  if (doseEditInput) {
    rx.setDoseAt(Number(doseEditInput.dataset.doseEditIndex), doseEditInput.value);
  }
});

/* --- Exponer en window lo que el HTML existente invoca vía onclick="" --- */
Object.assign(window, {
  showIngreso: nav.showIngreso,
  showFarma: nav.showFarma,
  showScreening: nav.showScreening,
  showInsulinTab: nav.showInsulinTab,
  showDiagnostics: nav.showDiagnostics,
  showTab: nav.showTab,
  toggleDashboardMenu: nav.toggleDashboardMenu,
  toggleSidebar: nav.toggleSidebar,
  toggleSection: nav.toggleSection,
  jumpToIngresoSection: nav.jumpToIngresoSection,
  toggleQuickMode,
  togglePrecisionCompassPanel,
  exportPrecisionLogCSV,
  toggleDarkMode: nav.toggleDarkMode,
  procesar: onSubmitForm,
  clearForm: onClearForm,
  cerrarConsulta: onCerrarConsulta,
  renderPharmaLib: render.renderPharmaLib,
  searchPharmaLib: render.searchPharmaLib,
  runComplexSimulation,
  showSimSubtab: onShowSimSubtab,
  updatePrescripcionLibre: onUpdatePrescripcionLibre,
  toggleDosisField: onToggleDosisField,
  generarExpediente,
  updateWeightChart: onUpdateWeightChart,
  calcAgeFromDOB: onCalcAgeFromDOB,
  previewVitals: onPreviewVitals,
  previewTabaco: onPreviewTabaco,
  previewAlcohol: onPreviewAlcohol,
  alcoholTipoChange: onAlcoholTipoChange,
  dismissSplash: onDismissSplash,
  showModuleHub,
  enterHubModule,
  // EndoInsulin (js/insulin.js): botones "Aplicar a EndoNote" y
  // recalculadoras en vivo de las calculadoras de titulación (TDD/ISF/ICR/
  // dosis de corrección) — ver comentarios en insulin.js.
  applyBasalDoseToEndoNote,
  applyPrandialDoseToEndoNote,
  insulinRecalcTitulacion,
  insulinRecalcCorreccion,
});

/* --- Arranque --- */
document.addEventListener("DOMContentLoaded", () => {
  nav.applyStoredTheme();
  nav.initAccordion();
  initIngresoProgress();
  initPrecisionCompass();

  // CORRECCIÓN (9-ago-2026): antes, si el CDN de Chart.js no cargaba
  // (bloqueador de anuncios/antivirus/firewall), las gráficas de
  // EndoSimulators/EndoNut simplemente se quedaban vacías sin ningún aviso
  // visible — solo un console.warn que nadie ve sin abrir las herramientas
  // de desarrollador. Se avisa aquí, en el arranque, apenas se puede detectar.
  if (typeof Chart === "undefined") {
    showRenderWarning();
  }

  // Zonas límite / "debe reevaluarse su prescripción" (Dr. Ortega,
  // 10-ago-2026, tabla confirmada 11-ago-2026) — ver boundary-alerts.js.
  wireBoundaryAlerts(document);

  const submitBtn = document.querySelector("#admissionForm button[type='submit']");
  const restored = state.restoreSession();

  if (restored) {
    nav.enableDashboardMenu();
    state.populateForm();
    // Recalcula Brújula de Precisión (y el toggle de Modo Rápido) contra los
    // campos ya restaurados — initPrecisionCompass() más arriba corrió ANTES
    // de restoreSession()/populateForm(), así que su primer cálculo fue
    // sobre un formulario todavía vacío.
    renderPrecisionCompass();
    try {
      render.renderAll(state.getPatient());
    } catch (err) {
      console.error("Error renderizando el dashboard al restaurar sesión:", err);
    }
    if (submitBtn) submitBtn.innerHTML = '<i data-lucide="refresh-cw" class="w-5 h-5"></i> ACTUALIZAR DASHBOARD';
  } else if (submitBtn) {
    submitBtn.innerHTML = '<i data-lucide="rocket" class="w-5 h-5"></i> IR AL DASHBOARD';
  }

  render.renderPharmaLib("antidiabetic", null);
  if (!restored) renderScreeningView(state.getPatient()); // EndoScreen: estado vacío inicial (si hubo restore, renderAll ya la pintó)

  if (typeof lucide !== "undefined") lucide.createIcons();
});
