/* --- CAPA 1: DEPRESCRIPCIÓN GERIÁTRICA (casos 38-39) ---
 * Casos de borde propuestos por el Dr. Ortega (10-ago-2026, ronda de 20
 * casos 38-57). A diferencia del resto del motor —que solo sabe escalar o
 * agregar fármacos— estos dos casos requieren la operación inversa:
 * reconocer cuándo agregar/titular MÁS es lo clínicamente incorrecto.
 *
 * Caso 38 — Sobretratamiento glucémico en adulto mayor: A1c ya en o por
 *   debajo de la meta individualizada (Tabla 13.2, ADA 2026 — misma función
 *   getA1cTarget de individualization.js que ya usa este proyecto) CON un
 *   agente de alto riesgo de hipoglucemia activo (sulfonilurea/meglitinida/
 *   insulina). Bajar la A1c más allá de la meta relajada de un adulto mayor
 *   complejo no aporta beneficio adicional (ACCORD, VADT) y sí aumenta el
 *   riesgo de hipoglucemia severa — la evidencia respalda DESESCALAR, no
 *   mantener/titular igual que a un paciente joven sano.
 *
 * Caso 39 — Sobretratamiento de PA con riesgo de caídas: síntomas
 *   ortostáticos + PA ya en meta individualizada + múltiples
 *   antihipertensivos activos. Seguir titulando un fármaco no maxeado sin
 *   mirar este contexto (como hacía el motor antes de este parche — ver
 *   buildHTNPlan) empeora el riesgo de hipotensión ortostática/caídas.
 *   Beers Criteria / STOPP-START señalan explícitamente la polifarmacia
 *   antihipertensiva con síntomas ortostáticos como candidato a
 *   simplificación, no a más titulación.
 *
 * LÍMITE (mismo espíritu que redflags.js): estas funciones solo generan una
 * ADVERTENCIA/SUGERENCIA de desescalamiento — nunca especifican qué dosis
 * exacta reducir primero ni un cronograma de retiro. La secuencia real de
 * "qué quitar primero" (p. ej. SU antes que insulina basal) requiere
 * valoración presencial del patrón glucémico del paciente.
 */

import { getA1cTarget } from "./individualization.js";

// Agentes antidiabéticos de alto riesgo de hipoglucemia — mismos subgrupos
// (`grp`) ya usados en pharma-db.js. Se excluye deliberadamente Meglitinida
// del set salvo mención explícita: comparte mecanismo de riesgo con
// sulfonilurea (secretagogo) por lo que se incluye también.
const HIGH_HYPO_RISK_GROUPS = new Set(["Sulfonilurea", "Meglitinida", "Insulina Basal", "Insulina Prandial"]);

/**
 * Caso 38. Recibe el paciente y el `state` de medicación antidiabética ya
 * calculado por getMedicationState(p, "antidiabetic") (evita recalcularlo
 * dos veces dentro de buildAntidiabeticPlan) más el valor de A1c efectivo
 * ya resuelto por getA1cEfectiva(p).
 */
export function checkOvertreatmentDM(p, state, a1cValue) {
  const age = Number(p?.edad) || 0;
  if (age < 65) return null; // el criterio de "meta relajada" solo aplica a Tabla 13.2 (≥65 años)
  if (!(a1cValue > 0)) return null; // sin dato de A1c no se puede evaluar sobretratamiento

  const target = getA1cTarget({ age, healthStatus: p?.saludStatus, lowTreatmentBurden: p?.bajoRiesgoTratamiento });
  if (a1cValue > target) return null; // no está en meta -> no es sobretratamiento

  const riskyEntries = state.entries.filter((e) => HIGH_HYPO_RISK_GROUPS.has(e.drug.grp));
  if (riskyEntries.length === 0) return null; // en meta pero sin agente de riesgo -> no hay nada que desescalar

  const names = riskyEntries.map((e) => e.drug.name).join(", ");
  return {
    id: "OVERTREATMENT_DM_GERIATRIC",
    drugs: riskyEntries.map((e) => e.drug.id),
    reason: `Adulto mayor (${age} años) con A1c ${a1cValue.toFixed(1)}% ya en o por debajo de la meta individualizada (${target}%, Tabla 13.2 ADA 2026) y con agente(s) de alto riesgo de hipoglucemia activo(s) (${names}) — considerar DESESCALAR/reducir (sulfonilurea primero, luego insulina) en vez de mantener igual; sobre-tratar aquí no reduce complicaciones (ACCORD/VADT) y sí aumenta el riesgo de hipoglucemia severa.`,
  };
}

/**
 * Caso 39. Recibe el paciente, el `state` de medicación antihipertensiva ya
 * calculado por getMedicationState(p, "htn") y si la PA ya está en la meta
 * individualizada (`atGoal`, ya calculado por buildHTNPlan con
 * getIndividualizedBPGoalNumeric).
 */
export function checkOrthostaticBlock(p, state, atGoal) {
  if (!p?.sintomasOrtostaticos) return null;
  if (!atGoal) return null; // PA no controlada -> los síntomas ortostáticos no eximen de tratar la HTA
  if (state.entries.length < 2) return null; // simplificación solo tiene sentido con polifarmacia antihipertensiva

  const names = state.entries.map((e) => e.drug.name).join(", ");
  return {
    id: "ORTHOSTATIC_SIMPLIFY",
    reason: `Síntomas ortostáticos + PA ya en meta individualizada con ${state.entries.length} antihipertensivos activos (${names}) — NO titular más; considerar SIMPLIFICAR/reducir dosis (riesgo de caídas, Beers Criteria/STOPP-START) en vez de escalar el tratamiento.`,
  };
}
