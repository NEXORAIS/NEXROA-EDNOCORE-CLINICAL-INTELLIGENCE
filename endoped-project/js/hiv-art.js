/* --- DOMINIO 5: TARV/VIH (caso 54) ---
 * Caso de borde propuesto por el Dr. Ortega (10-ago-2026, ronda de 20 casos
 * 38-57).
 *
 * Caso 54 — Interacción estatina × inhibidor de proteasa/cobicistat
 *   potenciado (`p.tarvInhibidorProteasa`): los inhibidores de proteasa del
 *   VIH potenciados (ritonavir) y el cobicistat son inhibidores potentes de
 *   CYP3A4, la vía principal de metabolismo de varias estatinas —
 *   elevaciones marcadas de la concentración plasmática de la estatina
 *   aumentan el riesgo de miopatía/rabdomiólisis. Consenso DHHS (Guidelines
 *   for the Use of Antiretroviral Agents) / Liverpool HIV Drug Interactions:
 *
 *   - Simvastatina: CONTRAINDICADA (bloqueo absoluto) — el metabolismo es
 *     casi exclusivamente vía CYP3A4, la interacción puede multiplicar la
 *     exposición varias veces.
 *   - Atorvastatina: interacción significativa pero manejable — se prefiere
 *     evitar o usar la dosis más baja posible; en este motor se DEPRIORIZA
 *     (no se bloquea) frente a Rosuvastatina/Pravastatina/Pitavastatina
 *     cuando hay alternativa disponible en el mismo pool de intensidad.
 *   - Rosuvastatina/Pravastatina/Pitavastatina: interacción mínima o nula
 *     (metabolismo predominantemente independiente de CYP3A4) — opciones
 *     preferidas.
 *
 * LÍMITE: no se modela cobicistat como potenciador de INTIs/otros fármacos
 * fuera de estatinas (esta ronda de casos se limita explícitamente a la
 * interacción estatina × TARV, caso 54 tal como lo planteó el Dr. Ortega) ni
 * se calcula una dosis exacta de Atorvastatina "segura" — solo se
 * deprioriza frente a alternativas de menor interacción.
 */

// Simvastatina: bloqueo absoluto por id específico (NO por grupo — el grupo
// "Estatina Baja/Moderada Intensidad" también incluye Pravastatina y
// Pitavastatina, que son precisamente las alternativas preferidas, así que
// bloquear por grupo excluiría también a las opciones seguras).
const HARD_BLOCKED_STATIN_ID = "SIMVA";
// Atorvastatina: no se bloquea, se deprioriza (ver comentario de cabecera).
const DEPRIORITIZED_STATIN_ID = "ATOR";

/** Usado por currentDrugIssue (calculations.js) — mismo patrón que
 * getLithiumInteractionReason en psychiatry.js, pero por `drug.id` en vez de
 * `drug.grp` (aquí el bloqueo es de UN fármaco específico dentro de su
 * clase, no de la clase completa). */
export function getHivArtStatinBlockReason(drug, flags) {
  if (flags?.tarvInhibidorProteasa && drug.id === HARD_BLOCKED_STATIN_ID) {
    return "contraindicado con inhibidor de proteasa/cobicistat potenciado (VIH) — interacción CYP3A4 mayor, riesgo de miopatía/rabdomiólisis";
  }
  return null;
}

/**
 * Deprioriza (no bloquea) Atorvastatina frente a alternativas de menor
 * interacción dentro del MISMO pool de intensidad — si el pool solo tiene
 * Atorvastatina (sin alternativa en esa intensidad), la deja disponible en
 * vez de dejar al paciente sin ninguna opción automatizada.
 *
 * Recibe `flags` (getPatientFlags(p)), no `p` directo — `tarvInhibidorProteasa`
 * es derivado de Medicación Actual/otros desde el 10-ago-2026, ver
 * getPatientFlags en calculations.js.
 */
export function deprioritizeAtorvastatinIfHivArt(pool, flags) {
  if (!flags?.tarvInhibidorProteasa) return pool;
  const withoutAtor = pool.filter((f) => f.id !== DEPRIORITIZED_STATIN_ID);
  return withoutAtor.length > 0 ? withoutAtor : pool;
}
