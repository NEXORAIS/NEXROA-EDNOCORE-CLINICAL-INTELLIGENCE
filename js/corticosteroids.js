/* --- DOMINIO 1: CORTICOIDES Y AINE RENAL (caso 46) ---
 * Caso de borde propuesto por el Dr. Ortega (10-ago-2026, ronda de 20 casos
 * 38-57).
 *
 * Caso 46 — Hiperglucemia/HTA inducida por corticoide: los glucocorticoides
 *   sistémicos (dosis equivalente de prednisona/día, `p.corticoideDosis`)
 *   inducen resistencia a la insulina y retención de sodio/líquidos de
 *   forma dosis-dependiente — esto es fisiología de mecanismo de acción
 *   bien establecida, no un hallazgo de un ensayo específico. El patrón
 *   típico ("hiperglucemia esteroidea") predomina en la glucosa
 *   POSPRANDIAL/vespertina (los corticoides de acción intermedia como
 *   prednisona tienen su pico de efecto hiperglucemiante horas después de
 *   la dosis matutina), por lo que la A1c/glucosa en ayuno puede verse
 *   engañosamente normal — se documenta esto en el mensaje para no dar una
 *   falsa tranquilidad si el único dato capturado es glucosa en ayuno.
 *
 * LÍMITE DELIBERADO: NO se implementa una fórmula de conversión de dosis
 * (prednisona-equivalente a partir de otros corticoides) ni un algoritmo de
 * ajuste de insulina/antidiabético basado en la dosis exacta — eso requiere
 * una tabla de equivalencias y un protocolo de titulación que varía por
 * guía institucional; el motor asume que `p.corticoideDosis` YA está en
 * equivalente de prednisona (así lo indica la etiqueta del campo en el
 * formulario) y solo da orientación DIRECCIONAL, no un plan de dosis.
 *
 * Umbral de "dosis alta" (≥20 mg/día equivalente de prednisona): convención
 * clínica ampliamente citada como el punto donde el riesgo de hiperglucemia
 * clínicamente significativa se vuelve consistente entre pacientes (dosis
 * menores también pueden elevar la glucosa, sobre todo en quien ya tiene
 * prediabetes/DM2 — por eso también hay un mensaje para dosis bajas-
 * moderadas, solo que con menor urgencia) — no es un corte oficial único de
 * una sola guía, se documenta aquí igual que otros umbrales de convención
 * ya usados en este proyecto (ver ANEMIA_SIGNIFICATIVA_HB en
 * borderline-labs.js).
 */

const HIGH_DOSE_THRESHOLD_MG = 20;

export function checkCorticosteroidRisk(p) {
  const dosis = Number(p?.corticoideDosis);
  if (!(dosis > 0)) return null;

  const esAlta = dosis >= HIGH_DOSE_THRESHOLD_MG;
  return {
    id: "CORTICOSTEROIDE_HIPERGLUCEMIA",
    esAlta,
    reason: esAlta
      ? `Corticoide sistémico ${dosis} mg/día equiv. prednisona (dosis alta, ≥${HIGH_DOSE_THRESHOLD_MG} mg) — riesgo ALTO de hiperglucemia/HTA inducida por esteroide. El patrón típico eleva sobre todo la glucosa POSPRANDIAL/vespertina (la glucosa en ayuno puede verse normal) — considerar monitoreo de glucosa posprandial y vigilancia de PA; puede requerir intensificación TEMPORAL del tratamiento antidiabético/antihipertensivo mientras dure el corticoide, con reversión al suspenderlo.`
      : `Corticoide sistémico ${dosis} mg/día equiv. prednisona (dosis baja-moderada) — riesgo de hiperglucemia/HTA inducida por esteroide presente pero menor; más relevante si ya hay prediabetes/DM2 o HTA de base. El patrón típico eleva sobre todo la glucosa POSPRANDIAL/vespertina (la glucosa en ayuno puede verse normal) — vigilar si el uso se prolonga.`,
  };
}
