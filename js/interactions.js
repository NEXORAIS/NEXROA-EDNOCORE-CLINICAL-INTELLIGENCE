/* --- INTERACCIONES FÁRMACO-FÁRMACO CRUZADAS ---
 * Hallazgo de auditoría (limitación documentada en el expediente técnico):
 * el motor revisa contraindicaciones por comorbilidad/función renal
 * (currentDrugIssue) y evita duplicación de subgrupo DENTRO de la misma
 * categoría (ej. dos estatinas, dos IECA), pero nunca evaluó interacciones
 * CRUZADAS entre categorías — el ejemplo que motivó esta revisión fue
 * Gemfibrozilo (lipid) + una estatina (lipid, misma categoría en realidad,
 * pero el motor no comparaba subgrupos "Fibrato" vs "Estatina" entre sí).
 *
 * Alcance DELIBERADO (decisión del Dr. Ortega): un set CURADO de las
 * interacciones mayores mejor documentadas del catálogo actual, no una
 * matriz exhaustiva de las 81 fichas — extensible con el tiempo. Cada
 * entrada tiene `severidad`:
 *   "mayor"        -> combinación que en general debe evitarse/sustituirse
 *   "monitorizar"  -> combinación frecuentemente INTENCIONAL y respaldada
 *                     por guía (ej. IECA/ARA-II + MRA en ERC con albuminuria,
 *                     que este mismo motor a veces recomienda) — la acción
 *                     correcta es vigilancia, no evitarla
 * No reemplaza duplicar aquí lo que `currentDrugIssue`/`filterSafe` ya
 * cubren (contraindicación absoluta por comorbilidad/eGFR); esto es
 * exclusivamente para pares de fármacos que son, cada uno por separado,
 * seguros para el paciente, pero cuya COMBINACIÓN tiene un riesgo propio.
 */
export const DRUG_INTERACTIONS = [
  {
    id: "GEMFI_STATIN",
    idsA: ["GEMFI"],
    idsB: ["ATOR", "ROSU", "PRAVA", "SIMVA", "PITA"],
    severidad: "mayor",
    mecanismo: "Gemfibrozilo inhibe OATP1B1 y la glucuronidación de las estatinas — aumenta marcadamente su concentración plasmática",
    riesgo: "Miopatía / rabdomiólisis",
    accion: "Evitar la combinación. Si se requiere un fibrato junto con estatina, usar Fenofibrato en su lugar (no comparte este mecanismo de interacción con Gemfibrozilo)",
    evidencia: "Ficha técnica FDA de Gemfibrozilo (contraindicado con Simvastatina; riesgo aumentado con el resto de estatinas)",
  },
  {
    id: "NONDHP_CCB_STATIN_CYP3A4",
    idsA: ["VERA", "DILT"],
    idsB: ["SIMVA", "ATOR"],
    severidad: "mayor",
    mecanismo: "Verapamilo/Diltiazem inhiben CYP3A4, vía principal de metabolismo de Simvastatina y (en menor grado) Atorvastatina",
    riesgo: "Miopatía / rabdomiólisis por acumulación de la estatina",
    accion: "Preferir una estatina no dependiente de CYP3A4 (Pravastatina, Rosuvastatina, Pitavastatina) o, si se mantiene Simvastatina, limitar la dosis a 10 mg/día (FDA)",
    evidencia: "Ficha técnica FDA de Simvastatina (límite de dosis explícito con diltiazem/verapamilo)",
  },
  {
    id: "RAAS_MRA_HIPERK",
    idsA: ["LOSA", "TELM", "VALS", "ENAL", "LISI", "RAMI"],
    idsB: ["ESPI", "FINE", "EPLE"],
    severidad: "monitorizar",
    mecanismo: "IECA/ARA-II y los MRA reducen la excreción renal de potasio por vías complementarias (bloqueo del eje renina-angiotensina-aldosterona desde dos puntos distintos)",
    riesgo: "Hiperkalemia",
    accion: "Combinación frecuentemente INTENCIONAL y respaldada por guía (ej. ERC con albuminuria — FIDELIO-DKD/FIGARO-DKD; IC — AHA/ACC/HFSA 2022), este mismo motor la recomienda en esos escenarios. No evitar la combinación; vigilar K+ sérico y eGFR periódicamente, sobre todo al iniciar o titular",
    evidencia: "FIDELIO-DKD / FIGARO-DKD; guía AHA/ACC/HFSA 2022 de insuficiencia cardíaca",
  },
  {
    id: "HIPOGLU_BETABLOQ",
    idsA: ["GLIM", "GLIB", "GLICLA", "GLAR", "DEGLU", "DETE", "NPH", "LISPRO", "ASPART", "REGULAR"],
    idsB: ["CARV", "LABE", "BISO", "METOS"],
    severidad: "monitorizar",
    mecanismo: "Los betabloqueadores (especialmente los no cardioselectivos, como Carvedilol/Labetalol) enmascaran los síntomas adrenérgicos de hipoglucemia (taquicardia, temblor) sin bloquear la sudoración",
    riesgo: "Hipoglucemia no reconocida o prolongada",
    accion: "Preferir un betabloqueador cardioselectivo (Bisoprolol/Metoprolol) sobre uno no selectivo cuando ambas opciones sean clínicamente equivalentes; educar al paciente sobre síntomas NO adrenérgicos de hipoglucemia (sudoración, confusión); vigilancia glucémica más frecuente, en especial al iniciar el betabloqueador",
    evidencia: "Farmacología clínica establecida; ficha técnica de betabloqueadores",
  },
];

/**
 * Revisa un plan de tratamiento CONSOLIDADO (las 4 categorías juntas, salida
 * de buildTreatmentPlan) contra DRUG_INTERACTIONS y devuelve las
 * advertencias correspondientes a cada par de fármacos presente en el plan.
 * Se aplica sobre el plan final (no por categoría) porque las interacciones
 * relevantes son precisamente CRUZADAS entre categorías.
 */
export function checkInteractions(planEntries) {
  const ids = new Set(planEntries.map((e) => e.id).filter(Boolean));
  const warnings = [];
  for (const inter of DRUG_INTERACTIONS) {
    const foundA = inter.idsA.filter((id) => ids.has(id));
    const foundB = inter.idsB.filter((id) => ids.has(id));
    if (foundA.length > 0 && foundB.length > 0) {
      const nameOf = (id) => planEntries.find((e) => e.id === id)?.drug || id;
      warnings.push({
        id: inter.id,
        severidad: inter.severidad,
        farmacoA: foundA.map(nameOf).join(" / "),
        farmacoB: foundB.map(nameOf).join(" / "),
        mecanismo: inter.mecanismo,
        riesgo: inter.riesgo,
        accion: inter.accion,
        evidencia: inter.evidencia,
      });
    }
  }
  return warnings;
}
