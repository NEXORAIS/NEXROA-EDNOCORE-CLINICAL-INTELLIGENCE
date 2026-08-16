/* --- EndoSimulators: sub-pestaña Presión Arterial ---
 * Análogo a simulator.js (glucosa), pero con una diferencia deliberada por
 * decisión explícita del Dr. Ortega: la hora de toma de cada antihipertensivo
 * se captura DENTRO de esta misma pestaña (no en rx.js/EndoManagement), para
 * no acoplar el flujo de prescripción con la exploración educativa de la
 * curva. Aun así, la LISTA de fármacos considerados sí viene de EndoNote
 * (vía rx.onRxChange, igual que el simulador de glucosa) — solo la hora de
 * toma es de gestión local a esta pestaña.
 */
import { simulateBPBaseline, simulateBPCurveConTratamiento } from "./calculations.js";
import { getPatient, onPatientChange } from "./state.js";
import { updateBPChart } from "./charts.js";
import { getAddedAntihypertensiveIds, onRxChange } from "./rx.js";
import { DB_PHARMA } from "./pharma-db.js";

// Hora(s) de toma por fármaco, en memoria de esta sesión únicamente.
const doseState = new Map(); // drugId -> ["08:00"] | ["08:00", "20:00"]

function defaultHoras(tomasPorDia) {
  return tomasPorDia === 2 ? ["08:00", "20:00"] : ["08:00"];
}

function timeToHourFloat(hhmm) {
  const [h, m] = (hhmm || "08:00").split(":").map(Number);
  return h + (m || 0) / 60;
}

function ensureDoseState(drugId, tomasPorDia) {
  if (!doseState.has(drugId)) doseState.set(drugId, defaultHoras(tomasPorDia));
  return doseState.get(drugId);
}

function buildDosisConfig() {
  return getAddedAntihypertensiveIds().map((id) => {
    const f = DB_PHARMA.find((d) => d.id === id);
    const horasStr = ensureDoseState(id, f?.efectoPA?.tomasPorDia || 1);
    return { drugId: id, horas: horasStr.map(timeToHourFloat) };
  });
}

/** Llamado desde main.js (delegación de eventos) cuando el médico cambia
 * un input de hora de toma. */
export function setDoseTime(drugId, index, value) {
  const current = doseState.get(drugId) || defaultHoras(1);
  current[index] = value;
  doseState.set(drugId, current);
  simulateAndRenderBP();
}

function toggleFallbackNote(isFallback) {
  document.getElementById("bpFallbackNote")?.classList.toggle("hidden", !isFallback);
}

/** Pinta la lista de antihipertensivos ya agregados a EndoNote, cada uno con
 * su(s) input(s) editable(s) de hora de toma (1 para QD, 2 para BID). */
function renderBPDosingList() {
  const container = document.getElementById("bpDosingList");
  const empty = document.getElementById("bpDosingEmpty");
  if (!container) return;

  const ids = getAddedAntihypertensiveIds();
  if (empty) empty.classList.toggle("hidden", ids.length > 0);

  container.innerHTML = ids.map((id) => {
    const f = DB_PHARMA.find((d) => d.id === id);
    const tomasPorDia = f?.efectoPA?.tomasPorDia || 1;
    const horas = ensureDoseState(id, tomasPorDia);
    const inputs = horas.map((h, i) => `
      <div class="flex items-center gap-1.5">
        <label class="text-[10px] font-bold text-slate-400 uppercase">Toma ${i + 1}</label>
        <input type="time" value="${h}" data-dose-time-drug="${id}" data-dose-index="${i}"
          class="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-data" />
      </div>`).join("");
    return `<div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 flex flex-wrap items-center justify-between gap-3 mb-2">
      <p class="text-sm font-bold text-slate-700 dark:text-slate-200">${f?.name || id} <span class="ml-1 text-[10px] font-black text-slate-400 uppercase">${tomasPorDia === 2 ? "BID" : "QD"}</span></p>
      <div class="flex items-center gap-3 flex-wrap">${inputs}</div>
    </div>`;
  }).join("");

  if (typeof lucide !== "undefined") lucide.createIcons();
}

export function simulateAndRenderBP() {
  const p = getPatient();
  const base = simulateBPBaseline(p);
  const dosisConfig = buildDosisConfig();
  const tx = dosisConfig.length ? simulateBPCurveConTratamiento(p, dosisConfig) : null;
  updateBPChart(base.labels, base.sist, base.diast, tx?.sist || null, tx?.diast || null);
  toggleFallbackNote(base.fallback);
}

/** Punto de entrada al mostrar la sub-pestaña (ver navigation.showSimSubtab)
 * y al recibir cambios relevantes (paciente, fármacos agregados). */
export function renderBPTab() {
  renderBPDosingList();
  simulateAndRenderBP();
}

onRxChange(() => renderBPTab());
onPatientChange(() => simulateAndRenderBP());
