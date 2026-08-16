/* --- EndoSimulators: simulador de curva glucémica ---
 * Guarda los últimos macros simulados para poder RECALCULAR automáticamente
 * en cuanto se agrega un fármaco antidiabético/insulina desde EndoManagement
 * (vía rx.onRxChange) — así el médico ve de inmediato el contraste "curva
 * basal" vs. "curva proyectada con tratamiento actual" sin tener que volver
 * a llenar el formulario de EndoSimulators.
 */
import { simulateGlucoseCurve, simulateGlucoseCurveConTratamiento } from "./calculations.js";
import { getPatient } from "./state.js";
import { updateGlucoseChart } from "./charts.js";
import { getAddedAntidiabeticIds, onRxChange } from "./rx.js";
import { DB_PHARMA } from "./pharma-db.js";

let lastInputs = null; // { carbs, protein, fat } de la última simulación manual

function readInputs() {
  return {
    carbs: parseFloat(document.getElementById("inCarbs")?.value) || 0,
    protein: parseFloat(document.getElementById("inProt")?.value) || 0,
    fat: parseFloat(document.getElementById("inFat")?.value) || 0,
  };
}

function simulateAndRender() {
  if (!lastInputs) return;
  const p = getPatient();
  const { carbs, protein, fat } = lastInputs;
  const { labels, data: basal } = simulateGlucoseCurve(p, carbs, protein, fat);
  const drugIds = getAddedAntidiabeticIds();
  const tratamiento = drugIds.length ? simulateGlucoseCurveConTratamiento(p, carbs, protein, fat, drugIds) : null;
  updateGlucoseChart(labels, basal, tratamiento);
  toggleContrastNote(drugIds);
}

/** Muestra/oculta el aviso de que la curva verde ya refleja fármacos
 * agregados a EndoNote, y lista cuáles son (transparencia del modelo). */
function toggleContrastNote(drugIds) {
  const note = document.getElementById("glucoseContrastNote");
  const list = document.getElementById("glucoseContrastDrugs");
  if (!note) return;
  if (drugIds.length === 0) {
    note.classList.add("hidden");
    return;
  }
  note.classList.remove("hidden");
  if (list) {
    const nombres = drugIds.map((id) => DB_PHARMA.find((f) => f.id === id)?.name || id);
    list.innerText = nombres.join(", ");
  }
}

export function runComplexSimulation() {
  lastInputs = readInputs();
  simulateAndRender();
}

// Recalcula automáticamente cuando cambia lo agregado a EndoNote (ver rx.js).
onRxChange(() => simulateAndRender());
