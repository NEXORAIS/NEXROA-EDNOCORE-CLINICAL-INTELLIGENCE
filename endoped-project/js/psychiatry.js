/* --- DOMINIO 3: PSIQUIATRÍA (casos 50-51) ---
 * Casos de borde propuestos por el Dr. Ortega (10-ago-2026, ronda de 20
 * casos 38-57).
 *
 * Caso 50 — Obesidad inducida por antipsicótico de alto riesgo metabólico
 *   (`flags.antipsicoticoAltoRiesgo` — derivado de Medicación Actual/otros
 *   desde el 10-ago-2026, ver comentario en getPatientFlags/calculations.js;
 *   Olanzapina/Clozapina son las dos moléculas de mayor riesgo metabólico
 *   según el consenso ADA/APA/AACE/NAASO 2004,
 *   vigente como marco de referencia): la evidencia más sólida en esta
 *   población específica (más allá del beneficio general de la clase en
 *   obesidad) es para agonistas/coagonistas de incretina — Tirzepatida y
 *   Semaglutida en dosis de obesidad son las moléculas con más evidencia
 *   dedicada en aumento de peso inducido por antipsicóticos. Se prioriza
 *   este orden sobre el desempate habitual por costo/acceso
 *   (`rankByAccess`) que usa el resto del motor — aquí el criterio clínico
 *   (evidencia específica en esta población) pesa más que el acceso
 *   económico, a diferencia de la selección genérica de obesidad. Si
 *   ninguna de las dos está disponible seguras (contraindicación, ya en
 *   uso), se cae de vuelta al criterio genérico de `rankByAccess`.
 *
 * Caso 51 — Litio + IECA/ARA-II/Tiazida: interacción farmacocinética bien
 *   establecida y potencialmente grave — estas 3 clases reducen la
 *   depuración renal de litio (IECA/ARA-II por reducción de la filtración
 *   glomerular mediada por angiotensina-II; tiazidas por aumento de la
 *   reabsorción proximal de sodio, arrastrando litio con él) y pueden
 *   elevar la litemia a rango tóxico incluso sin cambiar la dosis de litio.
 *   Se maneja como bloqueo — no advertencia — reutilizando el mecanismo
 *   `currentDrugIssue`/`filterSafe` ya existente en calculations.js (mismo
 *   "guard sistémico" usado para angioedema/MEN2/etc.): así se bloquea
 *   automáticamente tanto la SELECCIÓN de un fármaco nuevo de estas 3
 *   clases (vía filterSafe) como la continuación/titulación de uno YA
 *   prescrito que se vuelve inseguro (vía la revisión de `state.entries` que
 *   ya corre en cada build*Plan). BCC (Amlodipino/Diltiazem) no tiene esta
 *   interacción y queda como alternativa de primera línea/no-renal.
 *
 * LÍMITE: no se modela la litemia en sí (no es un dato que este proyecto
 * capture) — el bloqueo es categórico (clase de fármaco × bandera de litio),
 * no dependiente de un nivel sérico específico.
 */

export const LITHIUM_INTERACTING_GROUPS = new Set(["IECA", "ARA-II", "Diurético tipo Tiazida"]);

/** Usado por currentDrugIssue (calculations.js) — mismo patrón que las demás
 * líneas de esa función, solo que basado en `drug.grp` en vez de
 * `drug.contra` (la interacción es de CLASE completa, no de un fármaco
 * individual con lista de contraindicaciones propia). */
export function getLithiumInteractionReason(drug, flags) {
  if (flags?.litio && LITHIUM_INTERACTING_GROUPS.has(drug.grp)) {
    return "contraindicado (relativo) por litio concurrente — IECA/ARA-II/tiazida reducen la depuración renal de litio, riesgo de litemia tóxica";
  }
  return null;
}

const ANTIPSYCHOTIC_PRIORITY_IDS = ["TIRZ_OB", "SEMA24"];

/**
 * Caso 50. Recibe la lista de candidatos YA filtrada por seguridad
 * (obesityDrugs, filterSafe ya aplicado) y las flags del paciente. Regresa
 * el fármaco elegido siguiendo la prioridad clínica de esta población, o
 * `null` si ninguno de los priorizados está disponible (el llamador cae de
 * vuelta a rankByAccess en ese caso).
 */
export function pickAntipsychoticPriorityDrug(candidates, flags) {
  if (!flags?.antipsicoticoAltoRiesgo) return null;
  for (const id of ANTIPSYCHOTIC_PRIORITY_IDS) {
    const found = candidates.find((f) => f.id === id);
    if (found) return found;
  }
  return null;
}
