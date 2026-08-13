/* --- GUARDRAIL: EXTREMOS FISIOLÓGICOS (cláusula de resguardo lógico) ---
 * Propuesta del Dr. Ortega (10-ago-2026), pieza de mayor apalancamiento de
 * la ronda de "casos de borde" 38-57: este motor es para CONSULTA EXTERNA.
 * Cuando un valor está tan fuera de rango que la situación real es una
 * urgencia/emergencia, el motor NO debe intentar recomendar un fármaco
 * ambulatorio — debe reconocer que está fuera de su alcance y decirlo.
 *
 * LÍMITE DELIBERADO: este módulo SOLO detecta y deriva. Nunca sugiere manejo
 * agudo (dosis de labetalol/nitroprusiato IV, protocolo de insulina en
 * bomba para HHS/CAD, etc.) — eso es medicina de urgencias/UCI, fuera de lo
 * que una herramienta de consulta externa debe siquiera insinuar.
 *
 * UMBRALES (cada uno con su fuente — no se inventó ninguno):
 *   - Creatinina > 10 mg/dL: umbral sugerido por el Dr. Ortega — falla renal
 *     de magnitud dialítica en la enorme mayoría de los casos.
 *   - K+ > 6.5 mEq/L: umbral clásico de hiperkalemia severa con riesgo
 *     inminente de arritmia letal (requiere manejo urgente con gluconato de
 *     calcio/insulina-glucosa IV, no un ajuste de fármaco oral).
 *   - PA ≥ 180/120 mmHg: el Dr. Ortega sugirió >220, pero el umbral de
 *     "Crisis Hipertensiva" según ACC/AHA 2017/2025 es 180/120 (systolic OR
 *     diastolic) — se usa el umbral de guía, no el sugerido, y se documenta
 *     aquí el porqué del ajuste. Con o sin síntomas (que este sistema no
 *     captura — ver limitación abajo), ≥180/120 ya exige evaluación urgente
 *     para descartar daño de órgano blanco.
 *   - Glucosa > 600 mg/dL: rango de Estado Hiperosmolar Hiperglucémico (EHH).
 *   - Glucosa < 40 mg/dL: hipoglucemia severa (Nivel 3 ADA) con riesgo de
 *     alteración del estado de alerta.
 *
 * LIMITACIÓN HONESTA: este sistema no captura hallazgos de exploración física
 * (papiledema, alteración del estado de alerta, dolor torácico) — el Caso 55
 * del Dr. Ortega los menciona como parte del cuadro. El umbral numérico de
 * 180/120 se usa precisamente PORQUE la guía lo trata como suficiente por sí
 * solo para exigir evaluación urgente, sin necesitar esos hallazgos para
 * activar la derivación (los hallazgos SÍ determinan si es "urgencia" o
 * "emergencia" hipertensiva una vez en el servicio de salud, pero esa
 * distinción la hace el médico presencial, no este sistema).
 */

import { v } from "./calculations.js";

const RED_FLAG_DEFS = [
  {
    id: "CREATININA_CRITICA",
    label: "Creatinina crítica",
    check: (p) => v(p.creatinina) > 10,
    detalle: (p) => `Creatinina ${p.creatinina} mg/dL — falla renal de magnitud probablemente dialítica.`,
  },
  {
    id: "HIPERK_SEVERA",
    label: "Hiperkalemia severa",
    check: (p) => v(p.potasio) > 6.5,
    detalle: (p) => `Potasio ${p.potasio} mEq/L — riesgo inminente de arritmia letal.`,
  },
  {
    id: "CRISIS_HIPERTENSIVA",
    label: "Crisis hipertensiva",
    check: (p) => v(p.tas) >= 180 || v(p.tad) >= 120,
    detalle: (p) => `PA ${p.tas || "--"}/${p.tad || "--"} mmHg — umbral de Crisis Hipertensiva (ACC/AHA ≥180/120).`,
  },
  {
    id: "EHH_RANGO",
    label: "Glucosa en rango de Estado Hiperosmolar",
    check: (p) => v(p.glucosa) > 600,
    detalle: (p) => `Glucosa ${p.glucosa} mg/dL — rango de Estado Hiperosmolar Hiperglucémico (EHH).`,
  },
  {
    id: "HIPOGLUCEMIA_SEVERA",
    label: "Hipoglucemia severa",
    check: (p) => v(p.glucosa) > 0 && v(p.glucosa) < 40,
    detalle: (p) => `Glucosa ${p.glucosa} mg/dL — hipoglucemia severa (Nivel 3 ADA), riesgo de alteración del estado de alerta.`,
  },
];

/**
 * Revisa extremos fisiológicos absolutos. Regresa { activo, flags } —
 * `activo` es true si CUALQUIER umbral se cruzó. `buildTreatmentPlan`
 * (calculations.js) antepone este resultado a cualquier recomendación
 * ambulatoria; render.js/pdfExport.js lo muestran como bloqueo, no como
 * una advertencia más.
 */
export function checkRedFlags(p) {
  const flags = RED_FLAG_DEFS.filter((def) => def.check(p)).map((def) => ({
    id: def.id,
    label: def.label,
    detalle: def.detalle(p),
  }));
  return {
    activo: flags.length > 0,
    flags,
    mensaje: "Caso de Extrema Complejidad / Urgencia — Derivar inmediatamente a evaluación médica presencial / Urgencias. Este sistema es una herramienta de apoyo para CONSULTA EXTERNA y no está diseñado para el manejo agudo de esta situación.",
  };
}
