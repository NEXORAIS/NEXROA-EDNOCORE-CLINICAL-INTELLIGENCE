import { DB_PHARMA } from "./pharma-db.js";
import { getPatient } from "./state.js";

// Fármacos ya agregados a EndoNote en esta sesión (para detectar el umbral de ≥4
// antidiabéticos no-insulínicos y disparar el recordatorio de insulinización, y
// para que EndoSimulators pueda contrastar la curva glucémica "con tratamiento actual").
// Cada entrada es una COPIA del registro de pharma-db.js ({ ...f, dosis: f.ini })
// — NUNCA la referencia original — para poder editar la dosis por consulta sin
// mutar la base de datos compartida de fármacos.
const addedDrugs = [];
// Texto libre de "Prescripción" (EndoManagement) — se imprime también en
// EndoNote y en el Expediente Completo (PDF) como "Indicaciones / Notas Adicionales".
let freeTextNote = "";
const listeners = new Set();

/** Se dispara SOLO cuando cambia la LISTA de fármacos agregados (alta) —
 * EndoSimulators se suscribe a esto para recalcular las curvas "con
 * tratamiento" automáticamente. Editar una dosis o el texto libre de
 * Prescripción NO dispara esto (no cambia qué fármacos están presentes). */
export function onRxChange(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function notifyRxChange() {
  listeners.forEach((cb) => cb(addedDrugs.slice()));
}

/** IDs de antidiabéticos/insulina ya agregados a EndoNote — lo único relevante
 * para el modelo simplificado de efecto sobre la curva glucémica (ver
 * `efectoCurva` en pharma-db.js y `simulateGlucoseCurveConTratamiento`). */
export function getAddedAntidiabeticIds() {
  return addedDrugs.filter((f) => f.cat === "antidiabetic").map((f) => f.id);
}

/** IDs de antihipertensivos ya agregados a EndoNote — alimenta la pestaña de
 * Presión Arterial de EndoSimulators (ver simulatorBP.js), que se suscribe
 * a onRxChange igual que el simulador de glucosa. La hora de toma de cada
 * uno NO vive aquí (decisión explícita: se captura directamente en esa
 * pestaña, sin acoplar el flujo de EndoNote/EndoManagement). */
export function getAddedAntihypertensiveIds() {
  return addedDrugs.filter((f) => f.cat === "htn").map((f) => f.id);
}

/** Copia de los fármacos agregados (con su dosis EDITADA, si se cambió) —
 * usada por EndoManagement (lista editable) y por el Expediente Completo (PDF). */
export function getAddedDrugs() {
  return addedDrugs.map((f) => ({ ...f }));
}

export function getFreeTextNote() {
  return freeTextNote;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * EndoNote: redibuja TODO el contenido de #rxContent a partir del estado
 * actual (addedDrugs + freeTextNote) — reemplaza el viejo patrón imperativo
 * de "append de una línea al agregar" para que EDITAR una dosis o escribir
 * en Prescripción (EndoManagement) se refleje aquí de inmediato, sin
 * necesidad de re-agregar el fármaco.
 */
function renderEndoNoteContent() {
  const container = document.getElementById("rxContent");
  if (!container) return;

  const p = getPatient();
  const nameEl = document.getElementById("rxPtName");
  const ageEl = document.getElementById("rxPtAge");
  const dateEl = document.getElementById("rxDate");
  if (nameEl) nameEl.innerText = p.nombre || "Paciente";
  if (ageEl) ageEl.innerText = (p.edad || "--") + " años";
  if (dateEl) dateEl.innerText = new Date().toLocaleDateString();

  if (addedDrugs.length === 0 && !freeTextNote.trim()) {
    container.innerHTML = `<div id="rxEmptyState" class="text-center text-sm text-slate-400 py-16">
      <i data-lucide="file-text" class="w-8 h-8 mx-auto mb-2 opacity-40"></i>
      Agrega fármacos desde EndoFarma o EndoManagement para construir la receta.
    </div>`;
    if (typeof lucide !== "undefined") lucide.createIcons();
    return;
  }

  let html = "";

  const orales = addedDrugs.filter((f) => f.cat === "antidiabetic" && f.grp !== "Insulina Basal");
  if (orales.length >= 4) {
    html += `<div id="insulinReminder" class="p-4 mb-3 rounded-xl bg-gradient-to-r from-rose-50 to-amber-50 dark:from-rose-950/30 dark:to-amber-950/20 border-2 border-rose-300 dark:border-rose-800 flex items-start gap-3">
      <i data-lucide="alarm-clock" class="w-6 h-6 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5"></i>
      <div>
        <p class="font-black text-rose-700 dark:text-rose-300 text-sm uppercase tracking-wide">Recordatorio: Considerar Insulinización Temprana</p>
        <p class="text-xs text-rose-600 dark:text-rose-300/90 mt-1">Este paciente ya acumula <b>${orales.length} antidiabéticos no-insulínicos</b> sin alcanzar control. Según AACE 2026, tras falla con 3-4 terapias orales/inyectables el siguiente paso es evaluar inicio de <b>insulina basal</b> — evita la inercia terapéutica.</p>
      </div>
    </div>`;
  }

  html += addedDrugs.map((f) => `<div class="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg border-l-4 border-slate-900 dark:border-slate-500 font-bold text-slate-800 dark:text-white mb-2 flex items-center justify-between gap-3">
    <span>${f.name}</span><span class="font-data">${escapeHtml(f.dosis || f.ini)}</span>
  </div>`).join("");

  if (freeTextNote.trim()) {
    html += `<div class="mt-4 p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/40">
      <p class="text-[10px] font-black text-blue-500 uppercase mb-1">Indicaciones / Notas Adicionales</p>
      <p class="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap">${escapeHtml(freeTextNote)}</p>
    </div>`;
  }

  container.innerHTML = html;
  if (typeof lucide !== "undefined") lucide.createIcons();

  // Precarga (sin pisar lo que el médico ya esté escribiendo) el textarea
  // de Prescripción con el texto libre actual — ambos viven en EndoNote.
  syncPrescripcionTextarea();
}

/**
 * EndoNote: lista editable de fármacos ya seleccionados (agregados desde
 * EndoFarma/EndoManagement), con su dosis en un input de texto libre
 * (precargado con la dosis inicial sugerida, `f.ini`, pero editable). NO se
 * re-dibuja al editar una dosis individual (ver setDoseAt) para no perder
 * el foco del input mientras el médico escribe.
 */
function renderAddedDrugsEditor() {
  const container = document.getElementById("addedDrugsList");
  const empty = document.getElementById("addedDrugsEmpty");
  if (!container) return;
  if (empty) empty.classList.toggle("hidden", addedDrugs.length > 0);
  container.innerHTML = addedDrugs.map((f, i) => `
    <div class="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 mb-2">
      <p class="text-sm font-bold text-slate-700 dark:text-slate-200 truncate">${f.name} <span class="text-[10px] font-normal text-slate-400">(sugerido: ${f.ini})</span></p>
      <input type="text" value="${f.dosis || f.ini}" data-dose-edit-index="${i}"
        class="w-44 px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-data text-right focus:outline-none focus:ring-2 focus:ring-blue-400" />
    </div>`).join("");
}

function rerenderLocal() {
  renderEndoNoteContent();
  renderAddedDrugsEditor();
}

/** Muestra (una sola vez, ya no imperativamente) el recordatorio de
 * insulinización temprana — ahora se calcula de nuevo en cada redibujado
 * de EndoNote (ver renderEndoNoteContent), así que ya no requiere el
 * chequeo "yaExiste" que tenía la versión anterior. */

export function addToRxById(id) {
  const f = DB_PHARMA.find((x) => x.id === id);
  if (f) {
    addedDrugs.push({ ...f, dosis: f.ini });
    rerenderLocal();
    notifyRxChange();
  }
}

/**
 * Agrega un fármaco a EndoNote con una dosis específica YA CALCULADA (no la
 * dosis inicial genérica `f.ini` de pharma-db.js) — si el fármaco YA estaba
 * en EndoNote, actualiza su dosis en vez de duplicarlo. Construido para el
 * botón "Aplicar a EndoNote" de EndoInsulin (11-ago-2026, a petición del
 * Dr. Ortega: "que si algo se modifica ahí, también se modifique en la
 * EndoNote, para que no sea necesario volver a entrar a EndoNote a colocar
 * todo") — deliberadamente NO automático/silencioso: solo se llama cuando
 * el médico hace clic en el botón, nunca desde un recálculo pasivo.
 */
export function addOrUpdateRxDose(id, doseText) {
  const existing = addedDrugs.find((d) => d.id === id);
  if (existing) {
    existing.dosis = doseText;
    rerenderLocal();
    return;
  }
  const f = DB_PHARMA.find((x) => x.id === id);
  if (!f) return;
  addedDrugs.push({ ...f, dosis: doseText });
  rerenderLocal();
  notifyRxChange();
}

export function addToRxByName(name) {
  const f = DB_PHARMA.find((x) => x.name === name);
  if (f) {
    addedDrugs.push({ ...f, dosis: f.ini });
    rerenderLocal();
    notifyRxChange();
  }
}

/** Edita la dosis de un fármaco ya agregado (por su índice en la lista).
 * Solo redibuja EndoNote (el "documento" final) — el input de
 * EndoManagement que disparó esto ya muestra lo que el médico escribió,
 * no hace falta (ni conviene) re-crearlo. */
export function setDoseAt(index, value) {
  if (addedDrugs[index]) {
    addedDrugs[index].dosis = value;
    renderEndoNoteContent();
  }
}

/** Actualiza el texto libre de "Prescripción" (EndoManagement) y refresca
 * EndoNote para que se vea reflejado de inmediato. */
export function setFreeTextNote(text) {
  freeTextNote = text;
  renderEndoNoteContent();
}

/** Llamado una vez al render de EndoManagement (ver render.js -> renderManagement)
 * para precargar el textarea de Prescripción con el texto actual, sin pisar lo
 * que el médico esté escribiendo si se vuelve a llamar (solo setea si difiere). */
export function syncPrescripcionTextarea() {
  const el = document.getElementById("prescripcionLibre");
  if (el && el.value !== freeTextNote && document.activeElement !== el) {
    el.value = freeTextNote;
  }
}
