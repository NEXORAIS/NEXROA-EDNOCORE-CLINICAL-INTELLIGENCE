/* --- ZONAS LÍMITE: "DEBE REEVALUARSE SU PRESCRIPCIÓN" ---
 * Propuesto por el Dr. Ortega (10-ago-2026), tabla de anchos confirmada
 * línea por línea el 11-ago-2026 antes de implementar.
 *
 * Idea central: varios cortes del motor son binarios por diseño (eGFR<30,
 * LDL≥190, etc. — así deben seguir siendo, la CLASIFICACIÓN no cambia aquí).
 * Pero un valor que cae justo AL LADO de esos cortes merece un aviso
 * adicional, porque la variabilidad analítica/biológica normal del analito
 * (o, en el caso del corticoide, el hecho de que el riesgo real es un
 * continuo y no un escalón) puede poner el valor "verdadero" del lado
 * contrario al que se registró. Esta capa NO reclasifica nada — solo avisa,
 * al capturar el dato, con un mensaje cerrable (a petición explícita del
 * Dr. Ortega: "en vez de cambiar los límites, que se abra un mensaje que
 * luego se puede cerrar").
 *
 * Anchos de banda y su justificación (confirmados con el Dr. Ortega):
 *  - eGFR (30/45/60/25): ±3 mL/min/1.73m² (±5 en el corte de 60, el más
 *    usado) — variabilidad biológica + analítica de creatinina ~10-15%.
 *  - LDL-C (190): ±10 mg/dL — CV analítico de laboratorio típico ~4%.
 *  - A1c (8%): ±0.2% absoluto — imprecisión de ensayo ~0.2-0.3%.
 *  - uACR (30): ±5 mg/g — analito con alta variabilidad día a día (CV
 *    reportado 20-40%), banda más ancha en términos relativos.
 *  - Corticoide (20 mg/día): banda asimétrica, solo 15-<20 — es una dosis
 *    exacta prescrita (sin ruido de medición), pero el riesgo de
 *    hiperglucemia/HTA es dosis-dependiente y continuo, no un escalón real;
 *    no hace falta avisar arriba de 20 porque ahí ya se clasifica ALTO
 *    correctamente (dirección conservadora ya cubierta).
 *
 * Explícitamente EXCLUIDOS de esta capa (decisión clínica del Dr. Ortega,
 * 10-ago-2026):
 *  - Presión arterial: "lo que se registra es y ya, no podemos comprobar
 *    esa variación" — permanece estricta, sin banda.
 *  - Glucosa/hipoglucemia: conserva el rango original (<70 mg/dL) sin
 *    banda de reevaluación — la granularidad adicional ahí es una
 *    SUBCLASIFICACIÓN por niveles ADA 1/2/3 dentro del rango ya
 *    establecido (ver getHypoglycemiaLevel en calculations.js), no una
 *    zona límite de "quizás está del otro lado".
 *  - Potasio >6.5 (redflags.js): alerta de urgencia vital — debe ser
 *    inequívoca, no se le agrega un matiz de "quizás no es para tanto".
 *
 * Este módulo se divide a propósito en dos partes:
 *  1. `evaluateBoundaryZones(p)` — PURA, testeable, no toca el DOM (mismo
 *     patrón que calculations.js).
 *  2. `wireBoundaryAlerts(doc)` — impura, vive aquí porque es un módulo de
 *     UI de un solo propósito, no porque calculations.js deba ensuciarse
 *     con DOM.
 */
import { calcEGFR } from "./calculations.js";

export const BOUNDARY_ZONES = [
  {
    id: "egfr_30",
    anchorFieldId: "creatinina",
    min: 27,
    max: 33,
    get: (p) => calcEGFR(p),
    msg: "eGFR calculado cerca de 30 mL/min/1.73m² (corte de ERC severa / riesgo lipídico MUY ALTO) — DEBE REEVALUARSE SU PRESCRIPCIÓN si el valor real cae del otro lado del límite.",
  },
  {
    id: "egfr_45",
    anchorFieldId: "creatinina",
    min: 42,
    max: 48,
    get: (p) => calcEGFR(p),
    msg: "eGFR calculado cerca de 45 mL/min/1.73m² (corte de reducción de dosis de metformina) — DEBE REEVALUARSE SU PRESCRIPCIÓN si el valor real cae del otro lado del límite.",
  },
  {
    id: "egfr_60",
    anchorFieldId: "creatinina",
    min: 55,
    max: 65,
    get: (p) => calcEGFR(p),
    msg: "eGFR calculado cerca de 60 mL/min/1.73m² (define ERC / indicación automática de estatina alta intensidad) — DEBE REEVALUARSE SU PRESCRIPCIÓN si el valor real cae del otro lado del límite.",
  },
  {
    id: "egfr_25",
    anchorFieldId: "creatinina",
    min: 23,
    max: 27,
    get: (p) => calcEGFR(p),
    msg: "eGFR calculado cerca de 25 mL/min/1.73m² (elegibilidad de Finerenona) — DEBE REEVALUARSE SU PRESCRIPCIÓN si el valor real cae del otro lado del límite.",
  },
  {
    id: "ldl_190",
    anchorFieldId: "ldl",
    min: 180,
    max: 199,
    get: (p) => Number(p.ldl) || 0,
    msg: "LDL-C cerca de 190 mg/dL (indicación automática de estatina de alta intensidad, sin importar el riesgo calculado) — DEBE REEVALUARSE SU PRESCRIPCIÓN si el valor real cae del otro lado del límite.",
  },
  {
    id: "a1c_8",
    anchorFieldId: "hba1c",
    min: 7.8,
    max: 8.2,
    get: (p) => Number(p.hba1c) || 0,
    msg: "A1c cerca de 8% (corte de riesgo lipídico ALTO en la clasificación simplificada) — DEBE REEVALUARSE SU PRESCRIPCIÓN si el valor real cae del otro lado del límite.",
  },
  {
    id: "uacr_30",
    anchorFieldId: "uacr",
    min: 25,
    max: 35,
    get: (p) => Number(p.uacr) || 0,
    msg: "uACR cerca de 30 mg/g (define albuminuria/ERC, elegibilidad de Finerenona) — DEBE REEVALUARSE SU PRESCRIPCIÓN si el valor real cae del otro lado del límite.",
  },
  {
    id: "cortico_20",
    anchorFieldId: "corticoideDosis",
    min: 15,
    max: 19.99,
    get: (p) => Number(p.corticoideDosis) || 0,
    msg: "Corticoide cerca de 20 mg/día equiv. prednisona (corte de riesgo ALTO de hiperglucemia/HTA) — DEBE REEVALUARSE SU PRESCRIPCIÓN.",
  },
];

/**
 * Pura, testeable: recibe un objeto tipo-paciente (mismos nombres de campo
 * que buildPatientFromForm — no requiere el objeto completo, solo los
 * campos relevantes) y regresa la lista de zonas activas para esos valores.
 * No toca el DOM.
 */
export function evaluateBoundaryZones(p) {
  const patient = p || {};
  return BOUNDARY_ZONES.filter((zone) => {
    const val = zone.get(patient);
    return typeof val === "number" && !Number.isNaN(val) && val > 0 && val >= zone.min && val <= zone.max;
  });
}

/* ---- Capa de UI (impura) ---- */

const TRIGGER_FIELD_IDS = ["creatinina", "edad", "sexo", "ldl", "hba1c", "uacr", "corticoideDosis"];

function readMiniPatient(doc) {
  const num = (id) => {
    const raw = doc.getElementById(id)?.value;
    const val = parseFloat(raw);
    return Number.isNaN(val) ? "" : val;
  };
  return {
    creatinina: num("creatinina"),
    edad: num("edad"),
    sexo: doc.getElementById("sexo")?.value || "",
    ldl: num("ldl"),
    hba1c: num("hba1c"),
    uacr: num("uacr"),
    corticoideDosis: num("corticoideDosis"),
  };
}

function renderZoneNote(doc, zone, onDismiss) {
  const noteId = `bzNote_${zone.id}`;
  if (doc.getElementById(noteId)) return;
  const anchor = doc.getElementById(zone.anchorFieldId);
  const container = anchor?.closest("div");
  if (!container) return;
  const note = doc.createElement("div");
  note.id = noteId;
  note.className = "mt-1.5 flex items-start gap-2 px-2.5 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-800 text-[11px] font-bold text-amber-700 dark:text-amber-300";
  note.innerHTML = `<span class="flex-1">⚠️ ${zone.msg}</span><button type="button" style="cursor:pointer" class="shrink-0 font-black leading-none">✕</button>`;
  note.querySelector("button").onclick = () => {
    note.remove();
    onDismiss?.();
  };
  container.appendChild(note);
}

function removeZoneNote(doc, zone) {
  doc.getElementById(`bzNote_${zone.id}`)?.remove();
}

/**
 * Se llama una vez al iniciar la app (ver main.js). Escucha los campos que
 * alimentan alguna zona límite y muestra/oculta el aviso cerrable
 * correspondiente en tiempo real, junto al campo, mientras el médico
 * captura los datos.
 *
 * Si el médico cierra un aviso (✕) y el valor SIGUE en la misma zona, no
 * reaparece solo — evita que un cierre se sienta ignorado. Sí reaparece si
 * el valor sale de la zona y vuelve a entrar (nueva "entrada" a la zona,
 * merece aviso otra vez).
 */
export function wireBoundaryAlerts(doc = document) {
  const dismissed = new Set();

  const recompute = () => {
    const mini = readMiniPatient(doc);
    const active = new Set(evaluateBoundaryZones(mini).map((z) => z.id));
    BOUNDARY_ZONES.forEach((zone) => {
      if (!active.has(zone.id)) {
        dismissed.delete(zone.id);
        removeZoneNote(doc, zone);
        return;
      }
      if (dismissed.has(zone.id)) return;
      renderZoneNote(doc, zone, () => dismissed.add(zone.id));
    });
  };

  TRIGGER_FIELD_IDS.forEach((id) => {
    const el = doc.getElementById(id);
    el?.addEventListener("input", recompute);
    el?.addEventListener("change", recompute);
  });

  recompute(); // por si el formulario ya viene con datos (sesión restaurada)
}
