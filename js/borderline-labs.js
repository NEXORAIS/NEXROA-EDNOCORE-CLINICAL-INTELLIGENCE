/* --- CAPA 3: LABS DE BORDE (casos 42-43) ---
 * Casos de borde propuestos por el Dr. Ortega (10-ago-2026, ronda de 20
 * casos 38-57). Ambos casos son "trampas" de interpretación: un valor de
 * laboratorio en zona gris que un motor ingenuo podría manejar mal en
 * cualquiera de las dos direcciones (ignorarlo, o sobrerreaccionar
 * suspendiendo terapia protectora que sí funciona).
 *
 * Caso 42 — Hiperkalemia zona gris + IECA/ARA-II + MRA: la reacción
 *   reflejo (y frecuentemente EQUIVOCADA) ante K+ elevado es suspender el
 *   bloqueo RAAS/MRA — pero esa terapia es precisamente la que reduce
 *   mortalidad/progresión renal en ERC+IC (ver comentarios de buildHTNPlan
 *   sobre needsRAAS/Finerenona). La evidencia más reciente (ensayo DIAMOND
 *   2023 con Patiromer, guías KDIGO 2024) respalda AGREGAR un quelante de
 *   potasio para poder MANTENER el bloqueo RAAS, en vez de retirarlo, en
 *   hiperkalemia leve-moderada (no en la severa >6.5, que ya está cubierta
 *   por el guardrail de redflags.js y requiere manejo urgente, no un
 *   quelante oral ambulatorio).
 *
 * Caso 43 — A1c no confiable: la A1c depende de la vida media del glóbulo
 *   rojo — cualquier condición que la altere (anemia significativa,
 *   enfermedad renal terminal/diálisis) hace que la A1c medida no refleje
 *   el control glucémico real (ADA Standards of Care 2026, sección sobre
 *   limitaciones de la A1c). Se advierte en vez de tomar decisiones de
 *   tratamiento basadas en un número que puede estar sistemáticamente
 *   sesgado, y se sugieren alternativas (Fructosamina, Monitoreo Continuo
 *   de Glucosa/CGM con Tiempo en Rango).
 *
 * LÍMITE: como el resto de los módulos de esta ronda, estas funciones solo
 * ADVIERTEN/SUGIEREN — no calculan la dosis del quelante ni reinterpretan
 * la A1c a un valor "corregido" (no existe una fórmula de conversión
 * confiable de uso general).
 */

const RAAS_GROUPS = new Set(["IECA", "ARA-II"]);
const MRA_GROUPS = new Set(["MRA Esteroidea", "MRA No Esteroidea"]);

// Piso: 5.0 mEq/L (borde inferior de hiperkalemia). Techo: <6.5 mEq/L, el
// mismo umbral que redflags.js usa para HIPERK_SEVERA — por encima de eso
// buildTreatmentPlan ya ni siquiera llega a calcular un plan ambulatorio
// (ver checkRedFlags), así que este chequeo nunca compite con el guardrail:
// cubre exactamente la zona gris que queda ENTRE "normal" y "guardrail".
const K_ZONE_GRAY_MIN = 5.0;
const K_ZONE_GRAY_MAX = 6.5;

/**
 * Caso 42. Recibe el paciente y el `state` de medicación antihipertensiva
 * ya calculado por getMedicationState(p, "htn").
 */
export function checkHyperkalemiaZoneGray(p, state) {
  const k = Number(p?.potasio);
  if (!(k >= K_ZONE_GRAY_MIN && k < K_ZONE_GRAY_MAX)) return null;

  const raasEntries = state.entries.filter((e) => RAAS_GROUPS.has(e.drug.grp));
  const mraEntries = state.entries.filter((e) => MRA_GROUPS.has(e.drug.grp));
  if (raasEntries.length === 0 && mraEntries.length === 0) return null; // K+ elevado sin causa RAAS/MRA -> fuera del alcance de este caso

  const names = [...raasEntries, ...mraEntries].map((e) => e.drug.name).join(", ");
  return {
    id: "HYPERK_ZONE_GRAY_BINDER",
    reason: `Potasio ${k} mEq/L (hiperkalemia leve-moderada) en paciente con bloqueo RAAS/MRA activo (${names}) — NO suspender reflejamente esta terapia (reduce mortalidad/progresión renal). Considerar AGREGAR un quelante de potasio (Patiromer o Ciclosilicato de sodio y zirconio) para permitir mantener el bloqueo RAAS/MRA (evidencia: ensayo DIAMOND 2023, guías KDIGO 2024). Repetir potasio para confirmar tendencia.`,
  };
}

// Anemia significativa: se usa 10 g/dL como corte práctico (anemia
// moderada-severa) — por debajo de este nivel el recambio de glóbulos rojos
// se acelera lo suficiente para sesgar la A1c de forma clínicamente
// relevante; no es un corte oficial único de una sola guía, se documenta
// explícitamente como convención clínica (igual que el techo de 8.5% en
// getA1cTarget de individualization.js).
const ANEMIA_SIGNIFICATIVA_HB = 10;
// eGFR<15 = categoría G5 KDIGO (falla renal / rango de diálisis) — ADA
// Standards of Care 2026 señala ERC avanzada/diálisis como condición que
// invalida la A1c (recambio eritrocitario alterado, uremia, eritropoyetina
// exógena).
const EGFR_A1C_INVALIDA = 15;

/**
 * Caso 43. Recibe el paciente y el eGFR ya calculado (flags.egfr, resuelto
 * por getPatientFlags en calculations.js) para no duplicar esa fórmula
 * aquí.
 */
export function checkUnreliableA1c(p, egfr) {
  const hb = Number(p?.hemoglobina);
  const anemiaSignificativa = hb > 0 && hb < ANEMIA_SIGNIFICATIVA_HB;
  const ercAvanzada = egfr > 0 && egfr < EGFR_A1C_INVALIDA;
  if (!anemiaSignificativa && !ercAvanzada) return null;

  const motivos = [];
  if (anemiaSignificativa) motivos.push(`Hemoglobina ${hb} g/dL (anemia significativa)`);
  if (ercAvanzada) motivos.push(`eGFR ${Math.round(egfr)} mL/min/1.73m² (ERC avanzada/rango de diálisis)`);

  return {
    id: "A1C_NO_CONFIABLE",
    reason: `A1c no confiable — ${motivos.join(" + ")}: el recambio eritrocitario alterado invalida la correlación A1c-glucemia promedio. No basar decisiones de tratamiento únicamente en este valor; considerar Fructosamina o Monitoreo Continuo de Glucosa (Tiempo en Rango) como alternativa.`,
  };
}
