/* --- CAPA 4: DESESCALAMIENTO Y POLIFARMACIA (casos 44-45, 57) ---
 * Casos de borde propuestos por el Dr. Ortega (10-ago-2026, ronda de 20
 * casos 38-57).
 *
 * Casos 44 y 57 — Sobretratamiento glucémico SEVERO (independiente de edad):
 *   a diferencia del Caso 38 (geriatric.js — SOLO adultos ≥65 años, A1c en
 *   o levemente bajo la meta relajada de Tabla 13.2), estos dos casos
 *   describen un paciente de CUALQUIER edad cuya A1c cayó MUY por debajo de
 *   su meta individualizada mientras sigue con un agente de alto riesgo de
 *   hipoglucemia activo. El mecanismo que lo origina no importa para la
 *   detección — pérdida de peso masiva por un GLP-1/GIP (Caso 44) o
 *   remisión de diabetes tras cirugía bariátrica (Caso 57) producen la
 *   MISMA señal medible (A1c muy por debajo de meta + SU/insulina aún
 *   activa) sin necesitar un campo nuevo dedicado a "cirugía bariátrica" —
 *   el proyecto solo agrega campos que el motor puede usar de forma
 *   accionable (ver principio de paridad dato-lógica de este proyecto);
 *   aquí la señal ya es capturable con los campos existentes (A1c, edad,
 *   medicación actual).
 *
 *   Umbral: "muy por debajo" se define como ≥1.5 puntos porcentuales bajo
 *   la meta individualizada (vs. el Caso 38, que solo pide estar EN o bajo
 *   la meta) — un margen deliberadamente más amplio que el del Caso 38 para
 *   que esta alerta (de cualquier edad, más genérica) no se dispare en el
 *   mismo umbral que la geriátrica y ambas puedan coexistir sin ser
 *   redundantes: cuando el Caso 44/57 aplica, es ADEMÁS más urgente
 *   (hipoglucemia inminente, no solo ausencia de beneficio adicional), así
 *   que en calculations.js se prioriza esta tarjeta sobre la del Caso 38
 *   cuando ambas aplicarían al mismo paciente.
 *
 * Caso 45 — "Tríada Mortal" (Triple Whammy): AINE + IECA/ARA-II + diurético,
 *   la combinación clásica de nefrotoxicidad aguda descrita en la
 *   literatura (Loboz & Shenfield 2005; NPS MedicineWise) — cada fármaco
 *   reduce la perfusión renal por un mecanismo distinto (AINE: vasoconstricción
 *   de la arteriola aferente por inhibición de prostaglandinas; IECA/ARA-II:
 *   vasodilatación de la arteriola eferente; diurético: depleción de
 *   volumen) y la combinación de los tres puede colapsar la presión de
 *   filtración glomerular. Se modela como una función dedicada (no una
 *   extensión de checkInteractions en interactions.js) porque esa tabla
 *   solo compara pares de fármacos activos entre sí (idsA × idsB) — aquí
 *   uno de los tres "fármacos" (AINE reciente) no es un medicamento crónico
 *   con id en DB_PHARMA, es un antecedente de uso reciente capturado como
 *   bandera (`p.aineReciente`), así que no encaja en ese motor de pares sin
 *   forzar la estructura de datos.
 *
 * LÍMITE: igual que el resto de los módulos de esta ronda, solo se advierte
 * — no se calcula una dosis de reducción de insulina/SU ni se sugiere un
 * AINE "seguro" alternativo (el mensaje es evitar AINE en este contexto,
 * punto).
 */

const HIGH_HYPO_RISK_GROUPS = new Set(["Sulfonilurea", "Meglitinida", "Insulina Basal", "Insulina Prandial"]);
const SEVERE_OVERTREATMENT_MARGIN = 1.5;

/**
 * Casos 44/57. Recibe el paciente, el `state` de medicación antidiabética
 * (getMedicationState(p, "antidiabetic")), el valor de A1c efectivo
 * (getA1cEfectiva(p).value) y la meta individualizada ya resuelta
 * (getA1cTarget(...) — se pasa como número para no reimportar
 * individualization.js aquí también; calculations.js/geriatric.js ya la
 * calculan).
 */
export function checkSevereGlycemicOvertreatment(p, state, a1cValue, target) {
  if (!(a1cValue > 0)) return null;
  if (!(a1cValue <= target - SEVERE_OVERTREATMENT_MARGIN)) return null;

  const riskyEntries = state.entries.filter((e) => HIGH_HYPO_RISK_GROUPS.has(e.drug.grp));
  if (riskyEntries.length === 0) return null;

  const names = riskyEntries.map((e) => e.drug.name).join(", ");
  return {
    id: "SEVERE_OVERTREATMENT_DM",
    drugs: riskyEntries.map((e) => e.drug.id),
    reason: `A1c ${a1cValue.toFixed(1)}% muy por debajo de la meta individualizada (${target}%, margen ≥${SEVERE_OVERTREATMENT_MARGIN} puntos) con agente(s) de alto riesgo de hipoglucemia activo(s) (${names}) — sugiere mejoría glucémica sustancial reciente (pérdida de peso significativa, posible remisión post-bariátrica) sin ajuste de tratamiento. DESESCALAR de forma prioritaria: sulfonilurea/meglitinida primero, insulina después — riesgo real e inminente de hipoglucemia si no se reduce.`,
  };
}

const RAAS_GROUPS = new Set(["IECA", "ARA-II"]);
const DIURETIC_GROUPS = new Set(["Diurético de Asa", "Diurético tipo Tiazida"]);

/**
 * Caso 45. Recibe `flags` (ya resueltas por getPatientFlags — incluye
 * `aineReciente`, derivado de Medicación Actual/otros desde el 10-ago-2026,
 * ver comentario en calculations.js) y el `state` de medicación
 * antihipertensiva (getMedicationState(p, "htn")).
 */
export function checkTripleWhammy(flags, state) {
  if (!flags?.aineReciente) return null;
  const raasEntries = state.entries.filter((e) => RAAS_GROUPS.has(e.drug.grp));
  if (raasEntries.length === 0) return null; // sin RAAS activo, no es el patrón de "Tríada Mortal"

  const diureticEntries = state.entries.filter((e) => DIURETIC_GROUPS.has(e.drug.grp));
  const raasNames = raasEntries.map((e) => e.drug.name).join(", ");

  if (diureticEntries.length > 0) {
    const diurNames = diureticEntries.map((e) => e.drug.name).join(", ");
    return {
      id: "TRIPLE_WHAMMY_AKI",
      severidad: "alta",
      reason: `"Tríada Mortal" (Triple Whammy) completa — AINE reciente + ${raasNames} (RAAS) + ${diurNames} (diurético): las 3 clases reducen la perfusión/filtración renal por mecanismos distintos y en combinación pueden precipitar lesión renal aguda. EVITAR el AINE mientras continúe esta combinación; si es imprescindible, suspender temporalmente RAAS/diurético y vigilar función renal.`,
    };
  }
  return {
    id: "AINE_RAAS_RENAL_RISK",
    severidad: "moderada",
    reason: `AINE reciente + ${raasNames} (RAAS) — riesgo de lesión renal aguda por reducción combinada de la perfusión/filtración glomerular (2 de los 3 componentes de la "Tríada Mortal"; el riesgo aumenta más si además se agrega un diurético). Evitar AINE mientras sea posible; vigilar función renal si el uso es indispensable.`,
  };
}

/**
 * DOMINIO 1 — Caso 47: nefrotoxicidad por AINE en paciente con ERC de base,
 * INDEPENDIENTE de si toma RAAS/diurético (a diferencia de checkTripleWhammy
 * arriba, que requiere RAAS activo). Un AINE por sí solo ya reduce la
 * perfusión renal (vasoconstricción de la arteriola aferente por inhibición
 * de prostaglandinas) — en un riñón con reserva funcional ya disminuida
 * (ERC), esa reducción que un riñón sano toleraría sin problema puede ser
 * suficiente para precipitar una lesión aguda sobre crónica. Recibe
 * `flags.erc`/`flags.egfr`/`flags.aineReciente` ya resueltos por
 * getPatientFlags (calculations.js) para no reimplementar el cálculo de
 * eGFR ni la lectura de Medicación Actual/otros aquí.
 */
export function checkNsaidCkdRisk(flags) {
  if (!flags?.aineReciente) return null;
  if (!flags?.erc) return null;

  const egfrTxt = flags.egfr > 0 ? `eGFR ${Math.round(flags.egfr)} mL/min/1.73m²` : "ERC documentada";
  return {
    id: "AINE_ERC_NEFROTOXICIDAD",
    reason: `AINE reciente en paciente con ERC de base (${egfrTxt}) — un riñón con reserva funcional ya disminuida tolera mal la vasoconstricción de la arteriola aferente inducida por AINE; riesgo de lesión renal aguda sobre crónica incluso sin RAAS/diurético concurrente. Evitar AINE; usar alternativa analgésica sin efecto renal (ej. paracetamol) si es posible.`,
  };
}
