/* --- MODO RÁPIDO + BRÚJULA DE PRECISIÓN ---
 * (16-ago-2026, a petición del Dr. Ortega — auditoría de precisión de
 * campos, ver NEXORA_Clasificacion_Tests.xlsx/gobernanza para el mismo
 * espíritu aplicado a tests/reglas clínicas).
 *
 * ORIGEN: el Dr. pidió reducir tiempo de consulta sin perder precisión
 * diagnóstica. La auditoría de precisión (grep exhaustivo de cada campo no-
 * núcleo contra calculations.js/individualization.js/insulin.js/
 * screening.js) clasificó cada campo opcional en ALTO/MEDIO/BAJO/NINGUNO
 * impacto según si realmente cambia una clasificación o plan de
 * tratamiento — no solo si "suena importante".
 *
 * DOS MECANISMOS DISTINTOS, A PROPÓSITO:
 *  1. Modo Rápido (toggleQuickMode): oculta SOLO los campos BAJO/NINGUNO
 *     (marcados data-quick-optional="1" en index.html — col_total, vldl,
 *     urea, insulina, ggt, itb, cadera, dieta, alcohol, tabaquismo
 *     detallado, teléfono/domicilio). Es un filtro de visualización puro
 *     (ver CSS en index.html) — NUNCA borra datos ya capturados.
 *  2. Brújula de Precisión (PRECISION_FIELDS + computeMissingPrecisionFields):
 *     SÍ deja visibles los campos ALTO, pero cuenta en vivo cuántos siguen
 *     vacíos para el paciente actual y ofrece un salto directo
 *     (jumpToIngresoSection, navigation.js) con la justificación clínica
 *     de por qué importa — sin bloquear nada. El médico decide si la pausa
 *     vale la pena para ESTE paciente.
 *
 * Comorbilidades/Antecedentes Familiares/Medicación Actual (también ALTO
 * impacto) NO están en PRECISION_FIELDS a propósito: son checkboxes donde
 * "vacío" es una respuesta clínica válida, ya cubiertos por su propio
 * mecanismo (reviewCautions en calculations.js, basado en
 * seccionesRevisadas — ver state.js). Duplicar esa advertencia aquí sería
 * ruido, no señal.
 */
import { jumpToIngresoSection } from "./navigation.js";

export const PRECISION_FIELDS = [
  { field: "saludStatus", section: 1, label: "Estado de salud (fragilidad, ≥65 años)", justificacion: "Sin este dato, un adulto mayor frágil recibe la meta de A1c/PA MÁS estricta por defecto — el error contrario al que pide la Tabla 13.2 ADA 2026." },
  { field: "fumador", section: 3, label: "Tabaquismo", justificacion: "Sin PREVENT-ASCVD capturado, el tabaquismo es lo que reclasifica el riesgo lipídico de MODERADO a ALTO — sin este dato esa reclasificación nunca ocurre." },
  { field: "uacr", section: 4, label: "UACR (albúmina/creatinina urinaria)", justificacion: "El campo de mayor impacto de toda la auditoría — sin él se pierde detección de ERC por albuminuria, prioridad de IECA/ARA-II y elegibilidad a Finerenona." },
  { field: "ldl", section: 4, label: "LDL", justificacion: "Determina directamente qué fármaco hipolipemiante se agrega o escala (ezetimibe/PCSK9i) y si aplica indicación automática por LDL≥190." },
  { field: "trigliceridos", section: 4, label: "Triglicéridos", justificacion: "TG≥500 agrega Fenofibrato por riesgo de pancreatitis; TG 150-499 con ASCVD puede agregar Icosapent Etilo." },
  { field: "ast", section: 4, label: "AST", justificacion: "Sin este dato el FIB-4 sale artificialmente bajo (falso negativo), pudiendo ocultar una indicación real de MASLD en el plan antidiabético." },
  { field: "alt", section: 4, label: "ALT", justificacion: "Bloquea por completo el cálculo de FIB-4 (junto con plaquetas) — se pierde toda detección automática de MASLD." },
  { field: "plaquetas", section: 4, label: "Plaquetas", justificacion: "Igual que ALT — sin este dato el FIB-4 no se puede calcular en absoluto." },
  { field: "hemoglobina", section: 4, label: "Hemoglobina", justificacion: "Detecta si la A1c es confiable (anemia distorsiona la correlación A1c-glucemia) — sin este dato, una A1c sesgada se usa sin ningún aviso." },
  { field: "preventAscvd10", section: 4, label: "% Riesgo PREVENT-ASCVD a 10 años", justificacion: "Cambia directamente la intensidad de estatina y la meta de LDL en prevención primaria — el escenario más común en consulta." },
  { field: "preventCvd10", section: 4, label: "% Riesgo PREVENT-CVD a 10 años", justificacion: "Decide si un paciente con HTA Etapa 1 sin ASCVD/ERC/diabetes conocidas recibe fármaco de inmediato o un ensayo de estilo de vida 3-6 meses." },
  { field: "glucosaNocturna", section: 4, label: "Glucosa nocturna (automonitoreo)", justificacion: "Sin este dato se pierde la capacidad de detectar hipoglucemia nocturna oculta al ajustar la dosis basal de insulina (EndoInsulin)." },
  { field: "glucosaPreprandial", section: 4, label: "Glucosa preprandial (automonitoreo)", justificacion: "Puede ser el dato que active la sugerencia de iniciar o ajustar insulina prandial." },
  { field: "glucosaPosprandial", section: 4, label: "Glucosa posprandial (automonitoreo)", justificacion: "Misma función que preprandial en la decisión de bolo prandial." },
  { field: "tipoDM", section: 5, label: "Tipo de Diabetes", justificacion: "Fuente primaria de 'diabetes diagnosticada' para estatinas/HTA (incluso con A1c controlada), y determina el cronograma completo de tamizaje en EndoScreen." },
  { field: "fechaDxDM", section: 5, label: "Fecha de diagnóstico de DM", justificacion: "Activa o desactiva por completo el cronograma de tamizaje de retinopatía/nefropatía/neuropatía en EndoScreen." },
  { field: "corticoideDosis", section: 5, label: "Dosis de corticoide sistémico", justificacion: "Genera un aviso direccional de hiperglucemia/HTA inducida por esteroide, con umbral cuantitativo específico (≥20 mg/día)." },
];

/** Campos de PRECISION_FIELDS que el paciente ACTUAL no tiene capturados —
 * lee directamente el DOM (no el objeto patient ya construido) para no
 * heredar defaults silenciosos como saludStatus:"sano" (ver auditoría). */
export function computeMissingPrecisionFields(doc = document) {
  return PRECISION_FIELDS.filter((f) => {
    const el = doc.getElementById(f.field);
    if (!el) return false;
    return !el.value || el.value.trim() === "";
  });
}

function renderPrecisionCompassChip(missing) {
  const chip = document.getElementById("precisionCompassChip");
  const count = document.getElementById("precisionCompassCount");
  if (!chip || !count) return;
  if (missing.length === 0) {
    chip.classList.add("hidden");
    chip.classList.remove("flex");
    document.getElementById("precisionCompassPanel")?.classList.add("hidden");
    return;
  }
  chip.classList.remove("hidden");
  chip.classList.add("flex");
  count.textContent = `${missing.length} dato${missing.length === 1 ? "" : "s"} de alto impacto sin capturar`;
}

function renderPrecisionCompassPanel(missing) {
  const panel = document.getElementById("precisionCompassPanel");
  if (!panel) return;
  panel.innerHTML = missing.map((f) => `
    <div class="flex items-start justify-between gap-3 py-1.5 border-b border-amber-200/60 dark:border-amber-800/40 last:border-0 last:pb-0">
      <div class="text-xs text-amber-800 dark:text-amber-300">
        <p class="font-bold">${f.label}</p>
        <p class="text-amber-700/80 dark:text-amber-400/80">${f.justificacion}</p>
      </div>
      <button type="button" onclick="jumpToIngresoSection(${f.section})" class="shrink-0 px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-[10px] font-bold uppercase tracking-wide whitespace-nowrap">Ir al dato</button>
    </div>`).join("");
  if (typeof lucide !== "undefined") lucide.createIcons();
}

/** Recalcula y pinta la Brújula — mismo disparador que renderIngresoProgress
 * (cualquier input/change del formulario). */
export function renderPrecisionCompass() {
  const missing = computeMissingPrecisionFields();
  renderPrecisionCompassChip(missing);
  renderPrecisionCompassPanel(missing);
  return missing;
}

export function togglePrecisionCompassPanel() {
  document.getElementById("precisionCompassPanel")?.classList.toggle("hidden");
}

/** Modo Rápido: filtro de visualización puro sobre #admissionForm — nunca
 * borra ni deshabilita datos ya capturados (ver comentario de cabecera). */
export function toggleQuickMode() {
  const form = document.getElementById("admissionForm");
  const active = document.getElementById("quickModeToggle")?.checked;
  form?.classList.toggle("quick-mode", !!active);
  localStorage.setItem("endoped_quick_mode", active ? "1" : "0");
}

export function applyStoredQuickMode() {
  const stored = localStorage.getItem("endoped_quick_mode") === "1";
  const toggle = document.getElementById("quickModeToggle");
  if (toggle) toggle.checked = stored;
  document.getElementById("admissionForm")?.classList.toggle("quick-mode", stored);
}

export function initPrecisionCompass() {
  const form = document.getElementById("admissionForm");
  if (!form) return;
  applyStoredQuickMode();
  form.addEventListener("input", renderPrecisionCompass);
  form.addEventListener("change", renderPrecisionCompass);
  renderPrecisionCompass();
}
