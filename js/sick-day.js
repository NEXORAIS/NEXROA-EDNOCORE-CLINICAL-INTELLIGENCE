/* --- DOMINIO 6: REGLAS DE DÍA DE ENFERMEDAD / SICK DAY RULES (caso 56) ---
 * Caso de borde propuesto por el Dr. Ortega (10-ago-2026, ronda de 20 casos
 * 38-57).
 *
 * Caso 56 — Enfermedad aguda (`p.enfermedadAguda`: fiebre, vómito, diarrea,
 *   ingesta oral reducida) + fármacos que se vuelven riesgosos durante la
 *   deshidratación/reducción de perfusión renal que acompaña a estos
 *   cuadros. Es la misma lógica clínica detrás de las "Sick Day Rules"
 *   enseñadas a pacientes (mnemónico SADMAN en el Reino Unido: Sulfonilureas,
 *   ACEi, Diuréticos, Metformina, ARBs, NSAIDs) — este caso, tal como lo
 *   planteó el Dr. Ortega, cubre 3 de esas clases:
 *
 *   - Metformina: riesgo de acidosis láctica si la deshidratación reduce la
 *     función renal (el mecanismo es el mismo por el que ya se suspende con
 *     eGFR<30 — ver buildAntidiabeticPlan — solo que aquí el eGFR medido
 *     puede seguir viéndose normal porque el deterioro es AGUDO/inminente,
 *     no un valor de laboratorio ya capturado).
 *   - iSGLT2: riesgo de Cetoacidosis Diabética Euglucémica, agravado por la
 *     depleción de volumen de la enfermedad aguda (mismo mecanismo que el
 *     Caso 40 perioperatorio, pero por enfermedad en vez de cirugía).
 *   - IECA/ARA-II: riesgo de lesión renal aguda "prerrenal" cuando se
 *     combina hipoperfusión renal (deshidratación) con la vasodilatación de
 *     la arteriola eferente que produce el bloqueo RAAS.
 *
 * LÍMITE DELIBERADO (documentado explícitamente, mismo espíritu que el
 * resto de esta ronda): SADMAN completo también incluye sulfonilureas
 * (riesgo de hipoglucemia si la ingesta oral está reducida) y diuréticos
 * (agravan la depleción de volumen) — no se incluyen aquí porque el caso tal
 * como se aprobó con el Dr. Ortega especifica solo estas 3 clases; queda
 * como limitación conocida para una ronda futura, no como omisión
 * silenciosa.
 */

const SUSPEND_GROUPS_ANTIDIABETIC = new Set(["Biguanidas", "iSGLT2"]);
const SUSPEND_GROUPS_HTN = new Set(["IECA", "ARA-II"]);

/**
 * Recibe el paciente, el `state` de medicación antidiabética
 * (getMedicationState(p, "antidiabetic")) y el `state` de medicación
 * antihipertensiva (getMedicationState(p, "htn")).
 */
export function checkSickDayRules(p, dmState, htnState) {
  if (!p?.enfermedadAguda) return null;

  const dmEntries = dmState.entries.filter((e) => SUSPEND_GROUPS_ANTIDIABETIC.has(e.drug.grp));
  const htnEntries = htnState.entries.filter((e) => SUSPEND_GROUPS_HTN.has(e.drug.grp));
  const allEntries = [...dmEntries, ...htnEntries];
  if (allEntries.length === 0) return null;

  const names = allEntries.map((e) => e.drug.name).join(", ");
  return {
    id: "SICK_DAY_SUSPEND",
    drugs: allEntries.map((e) => e.drug.id),
    reason: `Enfermedad aguda (fiebre/vómito/diarrea/ingesta oral reducida) con ${names} activo(s) — "Reglas de Día de Enfermedad": SUSPENDER TEMPORALMENTE mientras dure el cuadro agudo y hasta 24-48h después de reanudar ingesta oral normal (Metformina: riesgo de acidosis láctica; iSGLT2: riesgo de CAD euglucémica; IECA/ARA-II: riesgo de lesión renal aguda prerrenal — todos agravados por depleción de volumen). Reanudar al resolver el cuadro agudo. No suspender insulina basal sin valoración adicional.`,
  };
}
