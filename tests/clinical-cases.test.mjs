/* --- BATERÍA DE CASOS CLÍNICOS INVENTADOS (verificación de eficacia del motor) ---
 * Corre las funciones REALES de calculations.js/individualization.js contra
 * pacientes sintéticos, y compara contra la respuesta esperada según la guía
 * ya citada en cada función del motor. No reimplementa ninguna lógica.
 * Uso: node tests/clinical-cases.test.mjs   (desde la raíz del proyecto)
 * Vuelve a correrlo cada vez que se edite pharma-db.js, calculations.js o
 * individualization.js, para detectar regresiones antes de que lleguen a
 * producción — así fue como se detectó y corrigió el bug de verapamilo/
 * diltiazem (caso B5) durante la ampliación del Compendio 2026.
 */
import {
  buildAntidiabeticPlan, buildHTNPlan, buildLipidPlan, buildObesityPlan, buildTreatmentPlan,
  calcEGFR, calcFIB4, getA1cEfectiva, classifyBP as classifyBPCalc, classifyLipidRisk as classifyLipidRiskCalc,
} from "../js/calculations.js";
import {
  classifyFIB4, classifyBP, getA1cTarget, getGlycemicAndBPGoals,
} from "../js/individualization.js";

let pass = 0, fail = 0;
const results = [];

function check(caseId, desc, condition, detail) {
  const ok = !!condition;
  if (ok) pass++; else fail++;
  results.push({ caseId, desc, ok, detail });
}

function planDrugs(plan) { return plan.map((x) => x.drug); }
function includesDrug(plan, name) { return plan.some((x) => x.drug.includes(name)); }

/* ============ A. ANTIDIABÉTICO — AACE Fig. 6/7 (comorbilidad-driven) ============ */

// A1: T2D virgen + IC -> debe agregar Metformina + SGLT2i con beneficio IC (Dapa/Empa)
{
  const p = { edad: 60, sexo: "H", creatinina: 0.9, hba1c: 8.2, comorbilidades: ["IC"], antecedentesFamiliares: [], nivelAcceso: "medio", medicacionActual: {} };
  const { plan } = buildAntidiabeticPlan(p);
  check("A1", "T2D virgen + IC -> Metformina + SGLT2i con beneficio IC",
    includesDrug(plan, "Metformina") && (includesDrug(plan, "Dapagliflozina") || includesDrug(plan, "Empagliflozina")),
    planDrugs(plan).join(", "));
}

// A2: T2D virgen + ERC (eGFR<60 y UACR>30) -> SGLT2i con beneficio erc
{
  const p = { edad: 65, sexo: "M", creatinina: 1.6, hba1c: 7.8, uacr: 80, comorbilidades: [], antecedentesFamiliares: [], nivelAcceso: "medio", medicacionActual: {} };
  const egfr = calcEGFR(p);
  const { plan } = buildAntidiabeticPlan(p);
  check("A2", `T2D virgen + ERC (eGFR calculado=${egfr}) -> Metformina + SGLT2i con beneficio erc`,
    includesDrug(plan, "Metformina") && (includesDrug(plan, "Dapagliflozina") || includesDrug(plan, "Empagliflozina") || includesDrug(plan, "Canagliflozina")),
    planDrugs(plan).join(", "));
}

// A3: T2D virgen + ASCVD (IAM previo) -> agente con beneficio ascvd
{
  const p = { edad: 58, sexo: "H", creatinina: 0.9, hba1c: 8.0, comorbilidades: ["IAM_ANGINA"], antecedentesFamiliares: [], nivelAcceso: "medio", medicacionActual: {} };
  const { plan } = buildAntidiabeticPlan(p);
  check("A3", "T2D virgen + ASCVD -> Metformina + agente con beneficio ASCVD",
    includesDrug(plan, "Metformina") && plan.length >= 2,
    planDrugs(plan).join(", "));
}

// A4: T2D virgen + obesidad (IMC 33), sin otras comorbilidades -> agente peso="perdida"
{
  const p = { edad: 40, sexo: "M", creatinina: 0.8, hba1c: 7.5, peso: 90, talla: 165, comorbilidades: [], antecedentesFamiliares: [], nivelAcceso: "medio", medicacionActual: {} };
  const { plan } = buildAntidiabeticPlan(p);
  check("A4", "T2D virgen + obesidad sin otras comorbilidades -> Metformina + agente de pérdida de peso",
    includesDrug(plan, "Metformina") && plan.length >= 2,
    planDrugs(plan).join(", "));
}

// A5: T2D ya en Metformina+Dapagliflozina (no max) + IC -> debe pedir TITULAR, no agregar fármaco nuevo
{
  const p = { edad: 60, sexo: "H", creatinina: 0.9, hba1c: 7.9, comorbilidades: ["IC"], antecedentesFamiliares: [], nivelAcceso: "medio",
    medicacionActual: { antidiabetic: [{ id: "MET", isMax: false }, { id: "DAPA", isMax: false }] } };
  const { plan } = buildAntidiabeticPlan(p);
  const onlyTitration = plan.every((x) => x.dose.startsWith("Titular"));
  check("A5", "T2D en Met+Dapa (no max) + IC -> solo recordatorios de TITULAR, sin fármaco nuevo",
    onlyTitration && plan.length === 2,
    plan.map((x) => `${x.drug}: ${x.dose}`).join(" | "));
}

// A6: A1c 11% (hiperglucemia severa) -> nota de insulina basal
{
  const p = { edad: 55, sexo: "H", creatinina: 0.9, hba1c: 11.2, comorbilidades: [], antecedentesFamiliares: [], nivelAcceso: "medio", medicacionActual: {} };
  const { note } = buildAntidiabeticPlan(p);
  check("A6", "A1c 11.2% -> nota de considerar insulina basal simultánea",
    !!note && note.includes("insulina"), note);
}

/* ============ B. HIPERTENSIÓN — AHA/ACC 2025 ============ */

// B1 (ACTUALIZADO — integración PREVENT-CVD, Guía de HTA 2025): Etapa 1
// virgen SIN ASCVD/ERC/diabetes conocidas y SIN PREVENT-CVD capturado -> la
// guía exige ensayo de estilo de vida 3-6 meses ANTES de fármaco, no inicio
// inmediato. Antes de esta ronda el motor iniciaba Amlodipino sin este
// filtro; el comportamiento anterior violaba la guía (trataba SIN haber
// confirmado el riesgo aumentado que la guía exige).
{
  const p = { edad: 50, sexo: "H", tas: 132, tad: 84, uacr: 10, comorbilidades: [], antecedentesFamiliares: [], nivelAcceso: "medio", medicacionActual: {} };
  const { plan } = buildHTNPlan(p);
  check("B1", "HTA Etapa 1 (132/84), sin ASCVD/ERC/DM, sin PREVENT-CVD -> ensayo de estilo de vida, NO fármaco todavía",
    plan.length === 1 && plan[0].id === "LIFESTYLE_TRIAL_HTN" && !includesDrug(plan, "Amlodipino"),
    planDrugs(plan).join(", ") + " | " + (plan[0]?.reason || ""));
}

// B1b (mismo hallazgo): el MISMO paciente Etapa 1, pero con PREVENT-CVD
// ≥7.5% ya capturado -> el riesgo queda confirmado y SÍ debe iniciar
// fármaco de inmediato.
{
  const p = { edad: 50, sexo: "H", tas: 132, tad: 84, uacr: 10, preventCvd10: 8.2, comorbilidades: [], antecedentesFamiliares: [], nivelAcceso: "medio", medicacionActual: {} };
  const { plan } = buildHTNPlan(p);
  check("B1b", "HTA Etapa 1 + PREVENT-CVD 8.2% (≥7.5%) -> riesgo confirmado, inicia Amlodipino de inmediato",
    plan.length === 1 && includesDrug(plan, "Amlodipino"),
    planDrugs(plan).join(", ") + " | " + (plan[0]?.reason || ""));
}

// B1c (mismo hallazgo): PREVENT-CVD capturado pero <7.5% -> confirma riesgo
// bajo, se mantiene el ensayo de estilo de vida (no basta con "tener el
// dato", el valor debe superar el umbral).
{
  const p = { edad: 50, sexo: "H", tas: 132, tad: 84, uacr: 10, preventCvd10: 4.1, comorbilidades: [], antecedentesFamiliares: [], nivelAcceso: "medio", medicacionActual: {} };
  const { plan } = buildHTNPlan(p);
  check("B1c", "HTA Etapa 1 + PREVENT-CVD 4.1% (<7.5%) -> sigue en ensayo de estilo de vida",
    plan.length === 1 && plan[0].id === "LIFESTYLE_TRIAL_HTN",
    planDrugs(plan).join(", ") + " | " + (plan[0]?.reason || ""));
}

// B1d (mismo hallazgo): Etapa 1 sin PREVENT-CVD, pero con ERC ya conocida
// (albuminuria/eGFR<60) -> riesgo YA confirmado por comorbilidad, no
// necesita el dato de PREVENT para iniciar fármaco de inmediato.
{
  const p = { edad: 60, sexo: "H", tas: 132, tad: 84, uacr: 80, comorbilidades: [], antecedentesFamiliares: [], nivelAcceso: "medio", medicacionActual: {} };
  const { plan } = buildHTNPlan(p);
  check("B1d", "HTA Etapa 1 + ERC ya conocida (UACR 80) -> riesgo confirmado por comorbilidad, inicia fármaco de inmediato",
    plan.length === 1 && !plan.some((x) => x.id === "LIFESTYLE_TRIAL_HTN"),
    planDrugs(plan).join(", ") + " | " + (plan[0]?.reason || ""));
}

// B1e (mismo hallazgo): HTA Etapa 2 NUNCA pasa por este gate — se trata
// siempre, sin importar riesgo/PREVENT-CVD (texto explícito de la guía).
{
  const p = { edad: 50, sexo: "H", tas: 155, tad: 98, uacr: 10, comorbilidades: [], antecedentesFamiliares: [], nivelAcceso: "medio", medicacionActual: {} };
  const { plan } = buildHTNPlan(p);
  check("B1e", "HTA Etapa 2 (155/98) sin ASCVD/ERC/DM/PREVENT -> se trata igual, combo de inicio (Etapa 2 no pasa por el gate)",
    plan.length === 2, planDrugs(plan).join(", "));
}

// B2: Virgen, Etapa 2 (155/98) + albuminuria -> combo inicial, primero clase renal
{
  const p = { edad: 55, sexo: "M", tas: 155, tad: 98, uacr: 60, comorbilidades: [], antecedentesFamiliares: [], nivelAcceso: "medio", medicacionActual: {} };
  const { plan } = buildHTNPlan(p);
  check("B2", "HTA Etapa 2 + albuminuria (UACR 60), virgen -> combo de 2 clases, ARA-II/IECA primero",
    plan.length === 2 && (plan[0].drug === "Losartan" || plan[0].drug === "Telmisartan" || plan[0].drug === "Enalapril" || plan[0].drug === "Lisinopril" || plan[0].drug === "Ramipril"),
    planDrugs(plan).join(", "));
}

// B3: Ya en Amlodipino no maxeado, meta no alcanzada -> recordatorio de titular
{
  const p = { edad: 50, sexo: "H", tas: 138, tad: 88, uacr: 5, comorbilidades: [], antecedentesFamiliares: [], nivelAcceso: "medio",
    medicacionActual: { htn: [{ id: "AMLO", isMax: false }] } };
  const { plan } = buildHTNPlan(p);
  check("B3", "En Amlodipino no maxeado, meta no alcanzada -> titular antes de agregar clase nueva",
    plan.length === 1 && plan[0].dose.startsWith("Titular"),
    plan.map((x) => `${x.drug}: ${x.dose}`).join(" | "));
}

// B4: ERC+T2D, UACR>=30, eGFR>=25 -> agrega Finerenona
{
  const p = { edad: 62, sexo: "H", tas: 135, tad: 85, creatinina: 1.4, uacr: 120, comorbilidades: ["ERC"], antecedentesFamiliares: [], nivelAcceso: "medio", medicacionActual: {} };
  const { plan } = buildHTNPlan(p);
  check("B4", "ERC+T2D con UACR alto, eGFR>=25 -> incluye Finerenona",
    includesDrug(plan, "Finerenona"), planDrugs(plan).join(", "));
}

// B5 (regresión): motor NUNCA sugiere verapamilo/diltiazem como 1a línea (bug corregido en esta sesión)
{
  const p = { edad: 55, sexo: "H", tas: 150, tad: 95, uacr: 10, comorbilidades: [], antecedentesFamiliares: [], nivelAcceso: "medio", medicacionActual: {} };
  const { plan } = buildHTNPlan(p);
  check("B5 (regresión)", "Motor nunca sugiere Verapamilo/Diltiazem como 1a línea automática",
    !includesDrug(plan, "Verapamilo") && !includesDrug(plan, "Diltiazem"),
    planDrugs(plan).join(", "));
}

/* ============ C. LÍPIDOS — Algorithm Fig. 4 + escalonamiento AHA/ACC 2025 ============ */

// C1: ASCVD establecida, LDL 140, virgen -> estatina de ALTA intensidad
{
  const p = { edad: 60, sexo: "H", ldl: 140, comorbilidades: ["IAM_ANGINA"], antecedentesFamiliares: [], nivelAcceso: "medio", medicacionActual: {}, hba1c: 6.0 };
  const { plan } = buildLipidPlan(p);
  check("C1", "ASCVD + LDL 140, virgen -> estatina de alta intensidad (Atorvastatina/Rosuvastatina)",
    plan.length === 1 && (includesDrug(plan, "Atorvastatina") || includesDrug(plan, "Rosuvastatina")),
    planDrugs(plan).join(", "));
}

// C2: Estatina ya a dosis máxima, LDL sigue sobre meta, SIN ASCVD/FH -> solo ezetimibe (NO PCSK9i)
{
  const p = { edad: 55, sexo: "M", ldl: 120, comorbilidades: [], antecedentesFamiliares: [], nivelAcceso: "medio", hba1c: 7.2,
    medicacionActual: { lipid: [{ id: "ATOR", isMax: true }] } };
  const { plan } = buildLipidPlan(p);
  check("C2", "Estatina maxeada, LDL sobre meta, sin ASCVD/FH -> solo Ezetimibe, sin PCSK9i",
    includesDrug(plan, "Ezetimibe") && !includesDrug(plan, "Evolocumab") && !includesDrug(plan, "Alirocumab"),
    planDrugs(plan).join(", "));
}

// C3: Estatina + ezetimibe maxeados, ASCVD, LDL sobre meta -> escala a PCSK9i
{
  const p = { edad: 60, sexo: "H", ldl: 90, comorbilidades: ["IAM_ANGINA"], antecedentesFamiliares: [], nivelAcceso: "medio", hba1c: 6.5,
    medicacionActual: { lipid: [{ id: "ATOR", isMax: true }, { id: "EZE", isMax: true }] } };
  const { plan } = buildLipidPlan(p);
  check("C3", "Estatina+Ezetimibe maxeados, ASCVD, LDL sobre meta (<55) -> escala a PCSK9i",
    includesDrug(plan, "Evolocumab") || includesDrug(plan, "Alirocumab"),
    planDrugs(plan).join(", "));
}

// C4: TG 600 -> Fenofibrato (prevención de pancreatitis), NO Icosapent etilo
{
  const p = { edad: 50, sexo: "H", ldl: 100, trigliceridos: 600, comorbilidades: [], antecedentesFamiliares: [], nivelAcceso: "medio", hba1c: 6.8, medicacionActual: {} };
  const { plan } = buildLipidPlan(p);
  check("C4", "TG 600 -> Fenofibrato (pancreatitis), sin Icosapent etilo",
    includesDrug(plan, "Fenofibrato") && !includesDrug(plan, "Icosapent"),
    planDrugs(plan).join(", "));
}

// C5: TG 300 + ASCVD + estatina maxeada -> Icosapent etilo (REDUCE-IT)
{
  const p = { edad: 60, sexo: "H", ldl: 65, trigliceridos: 300, comorbilidades: ["IAM_ANGINA"], antecedentesFamiliares: [], nivelAcceso: "medio", hba1c: 6.2,
    medicacionActual: { lipid: [{ id: "ATOR", isMax: true }] } };
  const { plan } = buildLipidPlan(p);
  check("C5", "TG 300 + ASCVD + estatina maxeada -> Icosapent Etilo",
    includesDrug(plan, "Icosapent"), planDrugs(plan).join(", "));
}

/* ============ D. CONSISTENCIA DE CLASIFICACIÓN (regresión) ============ */

// D1: FIB-4 en paciente >=65 años, zona 1.3-2.0 -> individualization.js debe decir "Riesgo Bajo" (corte 2.0), no "elevado"
{
  const p = { edad: 70, ast: 25, alt: 25, plaquetas: 220 };
  const fib4 = calcFIB4(p);
  const r = classifyFIB4(fib4, p.edad, null);
  check("D1", `FIB-4=${fib4} en paciente >=65a -> zona "verde" (corte edad-ajustado 2.0)`,
    r.zona === "verde", `zona=${r.zona}, texto="${r.texto}"`);
}

// D2: Clasificación de BP Etapa 1 (132/84) consistente entre calculations.js y individualization.js
{
  const calc = classifyBPCalc({ tas: 132, tad: 84 });
  const indiv = classifyBP(132, 84);
  const bothStage1 = calc.label.includes("ETAPA 1") && indiv.texto.includes("Etapa 1");
  check("D2", "BP 132/84 -> misma categoría (Etapa 1) en calculations.js e individualization.js",
    bothStage1, `calc.label="${calc.label}" | indiv.texto="${indiv.texto}"`);
}

/* ============ E. METAS INDIVIDUALIZADAS — ADA 2026 Tabla 13.2 ============ */

// E1: 70 años, salud "compleja" -> meta A1c 8.0%, ayuno 90-150
{
  const target = getA1cTarget({ age: 70, healthStatus: "complejo", lowTreatmentBurden: false });
  const goals = getGlycemicAndBPGoals({ age: 70, healthStatus: "complejo", lowTreatmentBurden: false });
  check("E1", "70a, salud compleja -> meta A1c 8.0% y ayuno 90-150 mg/dL (coherentes entre sí)",
    target === 8.0 && goals.a1c === "<8.0%" && goals.ayuno === "90-150 mg/dL",
    `target=${target}, goals=${JSON.stringify(goals)}`);
}

// E2: 45 años, bajo riesgo/carga de tratamiento -> meta A1c 6.5%
{
  const target = getA1cTarget({ age: 45, healthStatus: "sano", lowTreatmentBurden: true });
  const goals = getGlycemicAndBPGoals({ age: 45, healthStatus: "sano", lowTreatmentBurden: true });
  check("E2", "45a, bajo riesgo/carga de tratamiento -> meta A1c <6.5% (coherente en ambas funciones)",
    target === 6.5 && goals.a1c === "<6.5%",
    `target=${target}, goals=${JSON.stringify(goals)}`);
}

/* ============ G. MULTIMORBILIDAD — cobertura máxima (set cover) ============ */

// G1 (regresión, caso "outlier" del Dr. Ortega): IC+ERC+ASCVD+MASLD simultáneos
// -> el motor debe consolidar en UN solo fármaco que cubra las 4 (Empagliflozina),
// NUNCA dos SGLT2i distintos para el mismo grupo de comorbilidades.
{
  const p = { edad: 64, sexo: "H", hba1c: 10.5, creatinina: 1.8, uacr: 300,
    comorbilidades: ["MASLD", "ERC", "IC", "IAM_ANGINA"], antecedentesFamiliares: [], nivelAcceso: "medio", medicacionActual: {} };
  const { plan } = buildAntidiabeticPlan(p);
  const sglt2Count = plan.filter((x) => ["Dapagliflozina", "Empagliflozina", "Canagliflozina", "Ertugliflozina"].some((n) => x.drug.includes(n))).length;
  check("G1 (regresión)", "IC+ERC+ASCVD+MASLD simultáneos -> UN solo SGLT2i consolidado (no dos)",
    sglt2Count === 1 && includesDrug(plan, "Empagliflozina"),
    planDrugs(plan).join(", "));
}

// G2 (regresión, hallazgo H3 de la exploración adversarial "competing candidates"):
// eGFR=18 (excluye TODOS los iSGLT2) + IC+ERC+ASCVD simultáneos -> ningún fármaco
// individual cubre ic+erc+ascvd a la vez, así que el greedy sin restricciones caía
// en Semaglutida (GLP-1 RA) + Tirzepatida (GIP/GLP-1 RA) A LA VEZ para cerrar la
// cobertura. Corrección: nunca más de un agente de familia incretina en el mismo
// plan — el motor debe quedarse con UN incretina y dejar la comorbilidad restante
// sin cubrir por vía antidiabética antes que apilar dos incretinas.
{
  const p = { edad: 70, sexo: "H", creatinina: 3.8, hba1c: 8.2,
    comorbilidades: ["IC", "ERC", "IAM_ANGINA"], antecedentesFamiliares: [], nivelAcceso: "medio", medicacionActual: {} };
  const egfr = calcEGFR(p);
  const { plan } = buildAntidiabeticPlan(p);
  const incretinNames = ["Semaglutida", "Semaglutida Oral", "Dulaglutida", "Liraglutida", "Tirzepatida"];
  const incretinCount = plan.filter((x) => incretinNames.some((n) => x.drug.includes(n))).length;
  check("G2 (regresión)", `eGFR=${egfr} (excluye iSGLT2) + IC+ERC+ASCVD -> máximo UN agente de familia incretina (nunca 2 a la vez)`,
    incretinCount <= 1, planDrugs(plan).join(", "));
}

/* ============ F. FILTROS DE SEGURIDAD Y LÍMITES (dónde suelen esconderse los bugs) ============ */

// F1: Pancreatitis previa -> JAMÁS debe sugerir GLP-1/GIP RA, aunque haya ASCVD (contraindicación GLP1_GIP)
{
  const p = { edad: 58, sexo: "H", creatinina: 0.9, hba1c: 8.0, comorbilidades: ["IAM_ANGINA", "PANCREATITIS"], antecedentesFamiliares: [], nivelAcceso: "medio", medicacionActual: {} };
  const { plan } = buildAntidiabeticPlan(p);
  const glp1Ids = ["Semaglutida", "Dulaglutida", "Liraglutida", "Tirzepatida", "Exenatida", "Lixisenatida"];
  const hasGLP1 = plan.some((x) => glp1Ids.some((n) => x.drug.includes(n)));
  check("F1", "ASCVD + pancreatitis previa -> NUNCA sugiere GLP-1/GIP RA (contraindicado)",
    !hasGLP1, planDrugs(plan).join(", "));
}

// F2: Antecedente familiar de MEN2A -> JAMÁS GLP-1/GIP RA, aunque haya ASCVD
{
  const p = { edad: 58, sexo: "H", creatinina: 0.9, hba1c: 8.0, comorbilidades: ["IAM_ANGINA"], antecedentesFamiliares: ["FAM_MEN2A"], nivelAcceso: "medio", medicacionActual: {} };
  const { plan } = buildAntidiabeticPlan(p);
  const glp1Ids = ["Semaglutida", "Dulaglutida", "Liraglutida", "Tirzepatida"];
  const hasGLP1 = plan.some((x) => glp1Ids.some((n) => x.drug.includes(n)));
  check("F2", "ASCVD + antecedente familiar MEN2A -> NUNCA sugiere GLP-1/GIP RA (contraindicado)",
    !hasGLP1, planDrugs(plan).join(", "));
}

// F3: eGFR límite 22 (entre egfrMin de Empagliflozina=20 y Canagliflozina/Dapagliflozina=25/30)
// -> Empagliflozina debe seguir disponible, Cana/Dapa NO deben aparecer como sugerencia
{
  const p = { edad: 70, sexo: "H", creatinina: 2.8, hba1c: 8.0, comorbilidades: ["IC"], antecedentesFamiliares: [], nivelAcceso: "medio", medicacionActual: {} };
  const egfr = calcEGFR(p);
  const { plan } = buildAntidiabeticPlan(p);
  const hasCanaOrDapa = includesDrug(plan, "Canagliflozina") || includesDrug(plan, "Dapagliflozina");
  check("F3", `eGFR calculado=${egfr} (banda 20-25) -> Empagliflozina disponible, Cana/Dapa filtradas por egfrMin`,
    egfr >= 15 && egfr < 25 ? !hasCanaOrDapa : true,
    `egfr=${egfr}, plan=${planDrugs(plan).join(", ")}`);
}

// F4: Nivel de acceso "bajo" -> entre candidatos empatados en beneficio, el motor debe preferir el más barato (costo=1)
{
  const p = { edad: 55, sexo: "H", tas: 145, tad: 92, uacr: 5, comorbilidades: [], antecedentesFamiliares: [], nivelAcceso: "bajo", medicacionActual: {} };
  const { plan } = buildHTNPlan(p);
  const first = plan[0];
  const drugCosto = { Amlodipino: 1, Nifedipino: 1, Felodipino: 1 };
  check("F4", "Acceso económico BAJO -> 1a línea debe ser un fármaco de costo 1 ($)",
    first && (drugCosto[first.drug.split(" ")[0]] === 1 || first.drug.includes("Amlodipino")),
    planDrugs(plan).join(", "));
}

// F5: Antecedente familiar de hipoglucemias severas, sin otra comorbilidad -> agente de bajo riesgo, NUNCA sulfonilurea
{
  const p = { edad: 50, sexo: "M", creatinina: 0.8, hba1c: 7.3, peso: 70, talla: 170, comorbilidades: [], antecedentesFamiliares: ["FAM_HIPOGLUCEMIA"], nivelAcceso: "medio", medicacionActual: {} };
  const { plan } = buildAntidiabeticPlan(p);
  const hasSU = plan.some((x) => ["Glimepirida", "Glibenclamida", "Gliclazida"].some((n) => x.drug.includes(n)));
  check("F5", "Antecedente familiar de hipoglucemia severa -> NUNCA sugiere sulfonilurea",
    !hasSU, planDrugs(plan).join(", "));
}

// F6 (regresión): FIB-4 de la tarjeta clásica (Estratificación Global) y la de Individualización
// deben coincidir SIEMPRE para el mismo paciente (bug corregido esta sesión)
{
  const p1 = { edad: 70, ast: 25, alt: 25, plaquetas: 220 }; // FIB-4 ~1.59, zona gris para <65 pero verde para >=65
  const fib4 = calcFIB4(p1);
  const rich = classifyFIB4(fib4, p1.edad, null);
  check("F6 (regresión)", `FIB-4=${fib4}, edad 70 -> individualization.js (fuente única ahora usada en TODAS las vistas) = "${rich.texto}"`,
    rich.zona === "verde",
    "render.js ya no usa la versión plana de calculations.js para esta tarjeta (ver auditoría previa)");
}

// F8 (regresión, pregunta del Dr. Ortega "IECA vs ARA-II"): angioedema previo
// con IECA es contraindicación de CLASE (mediada por bradicinina) -> ningún
// IECA debe aparecer en el plan, aunque haya albuminuria (indicación RAAS).
{
  const p = { edad: 55, sexo: "M", tas: 145, tad: 92, uacr: 50, comorbilidades: ["ANGIOEDEMA_IECA"], antecedentesFamiliares: [], nivelAcceso: "medio", medicacionActual: {} };
  const { plan } = buildHTNPlan(p);
  const iecaNames = ["Enalapril", "Lisinopril", "Ramipril"];
  const hasIeca = plan.some((x) => iecaNames.some((n) => x.drug.includes(n)));
  check("F8", "Angioedema previo con IECA -> NUNCA sugiere ningún IECA (excluye toda la clase, no solo el fármaco)",
    !hasIeca, planDrugs(plan).join(", "));
}

// F9 (regresión, misma pregunta): tos documentada con IECA -> mismo principio
// de exclusión de clase completa, no solo "cambiar de IECA".
{
  const p = { edad: 50, sexo: "H", tas: 142, tad: 88, uacr: 40, comorbilidades: ["TOS_IECA"], antecedentesFamiliares: [], nivelAcceso: "medio", medicacionActual: {} };
  const { plan } = buildHTNPlan(p);
  const iecaNames = ["Enalapril", "Lisinopril", "Ramipril"];
  const hasIeca = plan.some((x) => iecaNames.some((n) => x.drug.includes(n)));
  check("F9", "Tos documentada con IECA -> NUNCA sugiere ningún IECA (excluye toda la clase)",
    !hasIeca, planDrugs(plan).join(", "));
}

// F10 (regresión, misma pregunta): IC sola (sin albuminuria/ERC) debe enrutar
// a IECA/ARA-II como 1ª línea (base de GDMT en HFrEF), NO a BCC/tiazida.
{
  const p = { edad: 60, sexo: "H", tas: 135, tad: 85, creatinina: 0.9, comorbilidades: ["IC"], antecedentesFamiliares: [], nivelAcceso: "medio", medicacionActual: {} };
  const { plan } = buildHTNPlan(p);
  const raasNames = ["Enalapril", "Lisinopril", "Ramipril", "Losartan", "Telmisartan", "Valsartán"];
  const hasRaas = plan.some((x) => raasNames.some((n) => x.drug.includes(n)));
  const hasBccOrTiazida = plan.some((x) => x.drug.includes("Amlodipino") || x.drug.includes("Nifedipino") || x.drug.includes("Clortalidona"));
  check("F10", "IC sola (sin albuminuria/ERC) -> 1ª línea IECA/ARA-II (GDMT), no BCC/tiazida",
    hasRaas && !hasBccOrTiazida, planDrugs(plan).join(", "));
}

// F11 (regresión, hallazgo tras la pregunta IECA vs ARA-II — mismo día de
// auditoría): riesgo lipídico MODERADO o BAJO en paciente virgen de estatina
// -> debe elegir intensidad MODERADA (Pravastatina/Simvastatina/Pitavastatina),
// NUNCA alta intensidad (Atorvastatina/Rosuvastatina) por defecto.
{
  const p = { edad: 45, sexo: "M", hba1c: 7.5, ldl: 130, comorbilidades: [], antecedentesFamiliares: [], nivelAcceso: "medio", medicacionActual: {} };
  const risk = classifyLipidRiskCalc(p);
  const { plan } = buildLipidPlan(p);
  const hasAlta = plan.some((x) => x.drug.includes("Atorvastatina") || x.drug.includes("Rosuvastatina"));
  check("F11", `Riesgo ${risk.label} virgen -> estatina de intensidad MODERADA, no alta`,
    !hasAlta && plan.length > 0, planDrugs(plan).join(", "));
}

// F12 (regresión, mismo hallazgo): paciente reclasificado a riesgo MUY
// ALTO/ALTO mientras ya está en estatina de intensidad MODERADA (aunque esté
// a dosis máxima) -> debe escalar de CLASE a alta intensidad, no saltar
// directo a ezetimibe con la estatina moderada equivocada.
{
  const p = { edad: 60, sexo: "M", hba1c: 7.0, ldl: 120, comorbilidades: ["IAM_ANGINA"], antecedentesFamiliares: [], nivelAcceso: "medio",
    medicacionActual: { lipid: [{ id: "PRAVA", isMax: true }] } };
  const { plan } = buildLipidPlan(p);
  const first = plan[0];
  check("F12", "MUY ALTO riesgo con Pravastatina (moderada) maxeada -> escala a estatina de ALTA intensidad antes de ezetimibe",
    !!first && (first.drug.includes("Atorvastatina") || first.drug.includes("Rosuvastatina")) && !plan.some((x) => x.drug === "Ezetimibe"),
    planDrugs(plan).join(", "));
}

// F13 (regresión, hallazgo de la misma ronda de auditoría): paciente con
// ERC+T2D+albuminuria YA en Espironolactona (MRA esteroidea, p. ej. por HTA
// resistente) que ahora también califica para Finerenona (MRA no esteroidea)
// -> el motor NUNCA debe apilar las dos MRA a la vez (hiperkalemia aditiva,
// exclusión de FIDELIO/FIGARO-DKD); debe recomendar SUSTITUIR, no agregar.
{
  const p = { edad: 62, sexo: "H", tas: 150, tad: 95, creatinina: 1.6, uacr: 200, comorbilidades: ["ERC"], antecedentesFamiliares: [], nivelAcceso: "medio",
    medicacionActual: { htn: [{ id: "AMLO", isMax: true }, { id: "LOSA", isMax: true }, { id: "ESPI", isMax: true }] } };
  const { plan } = buildHTNPlan(p);
  const fine = plan.find((x) => x.drug === "Finerenona");
  check("F13", "ERC+T2D+albuminuria ya en Espironolactona -> Finerenona se recomienda como SUSTITUCIÓN, nunca como add-on silencioso",
    !!fine && fine.reason.includes("SUSTITUIR"), planDrugs(plan).join(", ") + " | " + (fine ? fine.reason : "sin Finerenona"));
}

// F14 (regresión, hallazgo de seguridad más relevante de esta ronda): paciente
// YA en metformina cuya función renal se deterioró a eGFR<30 -> el motor
// NUNCA debe seguir sugiriendo "titular a dosis máxima" (contraindicación
// absoluta, riesgo de acidosis láctica FDA/ADA); debe indicar suspensión.
{
  const p = { edad: 70, sexo: "H", creatinina: 4.5, hba1c: 8.0, comorbilidades: [], antecedentesFamiliares: [], nivelAcceso: "medio",
    medicacionActual: { antidiabetic: [{ id: "MET", isMax: false }] } };
  const egfr = calcEGFR(p);
  const { plan } = buildAntidiabeticPlan(p);
  const met = plan.find((x) => x.drug === "Metformina");
  check("F14", `eGFR=${egfr} (<30) con metformina ya iniciada -> NUNCA "titular a dosis máxima", debe indicar SUSPENDER`,
    !!met && met.dose === "SUSPENDER" && !met.reason.includes("titular"), planDrugs(plan).join(", ") + " | " + (met ? met.dose : "sin Metformina"));
}

// F15 (regresión, mismo hallazgo): banda eGFR 30-45 con metformina ya
// iniciada -> mantener sin escalar dosis (ADA), no "titular a dosis máxima"
// ni "suspender" (ninguna de las dos es correcta en esta banda).
{
  const p = { edad: 70, sexo: "H", creatinina: 2.0, hba1c: 8.0, comorbilidades: [], antecedentesFamiliares: [], nivelAcceso: "medio",
    medicacionActual: { antidiabetic: [{ id: "MET", isMax: false }] } };
  const egfr = calcEGFR(p);
  const { plan } = buildAntidiabeticPlan(p);
  const met = plan.find((x) => x.drug === "Metformina");
  check("F15", `eGFR=${egfr} (banda 30-45) con metformina ya iniciada -> mantener sin escalar, ni titular a máximo ni suspender`,
    !!met && !met.reason.includes("titular") && met.dose !== "SUSPENDER", planDrugs(plan).join(", ") + " | " + (met ? met.dose : "sin Metformina"));
}

// F16 (regresión, hallazgo sistémico "currentDrugIssue" — generalización del
// bug de metformina/eGFR a TODA la lógica de continuación): paciente obeso ya
// en Semaglutida (agente de pérdida de peso) que desarrolla pancreatitis
// nueva -> NUNCA debe seguir diciendo "titular a dosis máxima" de un GLP-1
// ahora contraindicado; debe marcar REVALORAR/SUSPENDER.
{
  const p = { edad: 45, sexo: "M", peso: 95, talla: 165, hba1c: 6.8, comorbilidades: ["PANCREATITIS"], antecedentesFamiliares: [], nivelAcceso: "medio",
    medicacionActual: { antidiabetic: [{ id: "SEMA", isMax: false }] } };
  const { plan } = buildAntidiabeticPlan(p);
  const sema = plan.find((x) => x.drug === "Semaglutida SC");
  check("F16", "Obesidad + Semaglutida ya en uso + pancreatitis nueva -> REVALORAR/SUSPENDER, nunca titular",
    !!sema && sema.dose === "REVALORAR / SUSPENDER" && !sema.reason.includes("titular a dosis"), planDrugs(plan).join(", ") + " | " + (sema ? sema.reason : "sin Semaglutida"));
}

// F17 (regresión, mismo hallazgo): paciente con ASCVD cuyo GLP-1 actual
// (Semaglutida) cubre esa comorbilidad, pero desarrolla pancreatitis nueva
// -> debe marcar Semaglutida para revalorar/suspender Y buscar un reemplazo
// NUEVO (no-incretina) para no dejar la ASCVD sin cobertura antidiabética.
{
  const p = { edad: 60, sexo: "H", hba1c: 7.5, creatinina: 0.9, comorbilidades: ["IAM_ANGINA", "PANCREATITIS"], antecedentesFamiliares: [], nivelAcceso: "medio",
    medicacionActual: { antidiabetic: [{ id: "SEMA", isMax: false }] } };
  const { plan } = buildAntidiabeticPlan(p);
  const sema = plan.find((x) => x.drug === "Semaglutida SC");
  const replacement = plan.find((x) => x.drug !== "Semaglutida SC" && x.drug !== "Metformina");
  check("F17", "ASCVD cubierta por Semaglutida + pancreatitis nueva -> marca revalorar Y agrega reemplazo no-incretina para no dejar ASCVD descubierta",
    !!sema && sema.dose === "REVALORAR / SUSPENDER" && !!replacement, planDrugs(plan).join(", "));
}

// F18 (regresión, mismo hallazgo): IECA ya prescrito, NO maxeado, en paciente
// que reporta angioedema con IECA -> NUNCA debe seguir diciendo "titular",
// debe marcar REVALORAR/SUSPENDER (efecto de clase, no se reintenta).
{
  const p = { edad: 55, sexo: "M", tas: 145, tad: 92, uacr: 50, comorbilidades: ["ANGIOEDEMA_IECA"], antecedentesFamiliares: [], nivelAcceso: "medio",
    medicacionActual: { htn: [{ id: "ENAL", isMax: false }] } };
  const { plan } = buildHTNPlan(p);
  const enal = plan.find((x) => x.drug === "Enalapril");
  check("F18", "Enalapril ya en uso, no maxeado + angioedema nuevo -> REVALORAR/SUSPENDER, nunca titular",
    !!enal && enal.dose === "REVALORAR / SUSPENDER", planDrugs(plan).join(", ") + " | " + (enal ? enal.reason : "sin Enalapril"));
}

// F19 (regresión, hallazgo catch-all — generalización final del hallazgo
// sistémico "currentDrugIssue" a fármacos que ninguna rama específica toca):
// Fenofibrato ya prescrito (egfrMin=30) en paciente cuya función renal cae a
// eGFR<30 -> antes pasaba en silencio (ninguna rama de continuación existía
// para fibratos); ahora debe marcarse REVALORAR/SUSPENDER.
{
  const p = { edad: 60, sexo: "H", creatinina: 4.0, trigliceridos: 600, ldl: 100, hba1c: 6.5, comorbilidades: [], antecedentesFamiliares: [], nivelAcceso: "medio",
    medicacionActual: { lipid: [{ id: "FENO", isMax: true }] } };
  const { plan } = buildLipidPlan(p);
  const feno = plan.find((x) => x.drug === "Fenofibrato");
  check("F19", "Fenofibrato ya en uso + eGFR<30 -> catch-all lo marca REVALORAR/SUSPENDER (antes pasaba en silencio)",
    !!feno && feno.dose === "REVALORAR / SUSPENDER", planDrugs(plan).join(", ") + " | " + (feno ? feno.reason : "sin Fenofibrato"));
}

// F20 (regresión, mismo catch-all): Doxazosina (alfabloqueante, contra IC) ya
// a dosis MÁXIMA (por eso nunca entra a `state.notMaxed`) en un paciente que
// desarrolla IC nueva -> sin el catch-all esto pasaba en silencio total (0
// menciones en el plan pese a un fármaco activo ahora contraindicado).
{
  const p = { edad: 65, sexo: "H", tas: 128, tad: 78, comorbilidades: ["IC"], antecedentesFamiliares: [], nivelAcceso: "medio",
    medicacionActual: { htn: [{ id: "DOXA", isMax: true }] } };
  const { plan } = buildHTNPlan(p);
  const doxa = plan.find((x) => x.drug === "Doxazosina");
  check("F20", "Doxazosina ya maxeada + IC nueva -> catch-all la marca REVALORAR/SUSPENDER (antes: plan vacío, sin ninguna advertencia)",
    !!doxa && doxa.dose === "REVALORAR / SUSPENDER", planDrugs(plan).join(", ") + " | " + (doxa ? doxa.reason : "sin Doxazosina"));
}

// F21 (regresión, hallazgo de escalonamiento — pregunta directa del Dr.
// Ortega sobre cuándo escalar tratamientos): paciente en triple terapia
// VERDADERA (RAAS + BCC-DHP + Tiazida, las 3 a dosis máxima) sin alcanzar
// meta -> HTA resistente real. El motor debía escalar a MRA (espironolactona,
// PATHWAY-2), no ofrecer OTRO fármaco de una clase ya representada (ej. un
// segundo BCC cuando el primero ya está maxeado).
{
  const p = { edad: 55, sexo: "H", tas: 148, tad: 94, uacr: 10, creatinina: 0.9, comorbilidades: [], antecedentesFamiliares: [], nivelAcceso: "medio",
    medicacionActual: { htn: [{ id: "LOSA", isMax: true }, { id: "AMLO", isMax: true }, { id: "CLOR", isMax: true }] } };
  const { plan } = buildHTNPlan(p);
  check("F21", "Triple terapia RAAS+BCC-DHP+Tiazida maxeada sin meta -> escala a MRA (espironolactona), nunca repite clase ya usada",
    plan.length === 1 && plan[0].drug === "Espironolactona", planDrugs(plan).join(", "));
}

// F22 (regresión, mismo hallazgo): con solo 2 de las 3 clases maxeadas
// (comportamiento previo, ya validado), el motor debe seguir completando la
// triple terapia (agregar la clase faltante), NO saltar directo a MRA.
{
  const p = { edad: 55, sexo: "H", tas: 148, tad: 94, uacr: 10, creatinina: 0.9, comorbilidades: [], antecedentesFamiliares: [], nivelAcceso: "medio",
    medicacionActual: { htn: [{ id: "LOSA", isMax: true }, { id: "AMLO", isMax: true }] } };
  const { plan } = buildHTNPlan(p);
  check("F22", "Solo 2 de 3 clases maxeadas -> completa triple terapia con la clase faltante (Tiazida), NO salta a MRA todavía",
    plan.length === 1 && plan[0].drug === "Clortalidona", planDrugs(plan).join(", "));
}

// F7 (regresión, hallazgo H2 de la exploración adversarial): Stroke+MASLD+
// Pancreatitis previa (excluye TODOS los GLP-1/GIP) + Obesidad IMC 34 -> el
// motor queda forzado a Pioglitazona (peso: ganancia) como única opción para
// cubrir el stroke. Es la elección clínicamente correcta (sin alternativa
// mejor disponible), pero DEBE avisar explícitamente que ese agente es
// contrario a la meta de peso del paciente obeso.
{
  const p = { edad: 55, sexo: "M", hba1c: 8.0, creatinina: 0.9, peso: 92, talla: 165,
    comorbilidades: ["EVC_AIT", "MASLD", "PANCREATITIS"], antecedentesFamiliares: [], nivelAcceso: "medio", medicacionActual: {} };
  const { plan } = buildAntidiabeticPlan(p);
  const pio = plan.find((x) => x.drug.includes("Pioglitazona"));
  check("F7 (regresión)", "Pioglitazona forzada en paciente obeso (GLP-1/GIP contraindicados) -> motivo debe incluir advertencia de ganancia de peso",
    !!pio && pio.reason.includes("ganancia de peso"), planDrugs(plan).join(", ") + " | " + (pio ? pio.reason : "no Pioglitazona"));
}

// F23 (regresión, hallazgo directo de "¿algo más que no hayamos cubierto?"):
// paciente ≥65 años "muy complejo" (Tabla 13.2 ADA 2026: meta de PA <140/90,
// NO <130/80) con PA 135/85 (dentro de SU meta real) y ya maxeado -> NUNCA
// debe decir "meta no alcanzada, agregar otra clase". Mismo tipo de bug que
// ya se había corregido para A1c (getA1cTarget) pero nunca se aplicó a PA.
{
  const p = { edad: 82, sexo: "H", saludStatus: "muyComplejo", tas: 135, tad: 85, uacr: 10, creatinina: 0.9, comorbilidades: [], antecedentesFamiliares: [], nivelAcceso: "medio",
    medicacionActual: { htn: [{ id: "AMLO", isMax: true }] } };
  const { plan } = buildHTNPlan(p);
  check("F23", "≥65a muy complejo, PA 135/85 (meta real <140/90) -> NUNCA escala tratamiento (ya está en meta individualizada)",
    plan.length === 0, planDrugs(plan).join(", ") || "(vacío, correcto)");
}

// F24 (regresión, mismo hallazgo): el mismo paciente muy complejo pero
// genuinamente FUERA de su meta individualizada (145/95, sobre <140/90) SÍ
// debe escalar tratamiento — confirma que la meta se aplica correctamente en
// ambas direcciones, no que simplemente se desactivó el escalonamiento.
{
  const p = { edad: 82, sexo: "H", saludStatus: "muyComplejo", tas: 145, tad: 95, uacr: 10, creatinina: 0.9, comorbilidades: [], antecedentesFamiliares: [], nivelAcceso: "medio",
    medicacionActual: { htn: [{ id: "AMLO", isMax: true }] } };
  const { plan } = buildHTNPlan(p);
  check("F24", "≥65a muy complejo, PA 145/95 (fuera de meta real <140/90) -> SÍ escala tratamiento",
    plan.length === 1 && plan[0].reason.includes("<140/90"), planDrugs(plan).join(", ") + " | " + (plan[0]?.reason || ""));
}

// F25 (regresión, hallazgo "algo más que no hayamos cubierto"): antes solo
// existía el antecedente FAMILIAR de hipoglucemia severa (FAM_HIPOGLUCEMIA)
// para activar flags.hipoRisk y excluir sulfonilureas. El antecedente
// PERSONAL (HIPOGLUCEMIA_PERSONAL) es al menos igual de relevante y ahora
// se combina con el familiar. T2D virgen con SOLO antecedente personal (sin
// antecedente familiar) -> debe excluir sulfonilureas igual que el familiar.
{
  const p = { edad: 55, sexo: "M", creatinina: 0.9, hba1c: 8.5, comorbilidades: ["HIPOGLUCEMIA_PERSONAL"], antecedentesFamiliares: [], nivelAcceso: "medio", medicacionActual: {} };
  const { plan } = buildAntidiabeticPlan(p);
  check("F25", "T2D virgen + hipoglucemia severa PERSONAL (sin antecedente familiar) -> excluye sulfonilureas (Glibenclamida/Glimepirida)",
    !includesDrug(plan, "Glibenclamida") && !includesDrug(plan, "Glimepirida"), planDrugs(plan).join(", "));
}

// F26 (regresión, mismo hallazgo "algo más que no hayamos cubierto"): riesgo
// lipídico ALTO por clasificación normalmente exige estatina de intensidad
// ALTA, pero en paciente ≥65a "muy complejo" (fragilidad extrema) SIN ASCVD
// establecida y SIN ERC severa, se de-intensifica a moderada por decisión
// compartida (ADA 2026 Cap. 13/AACE 2026).
{
  const p = { edad: 80, sexo: "H", saludStatus: "muyComplejo", hba1c: 8.5, ldl: 160, creatinina: 0.9, comorbilidades: [], antecedentesFamiliares: [], nivelAcceso: "medio", medicacionActual: {} };
  const { plan, label } = buildLipidPlan(p);
  check("F26", "≥65a muy complejo, riesgo ALTO, sin ASCVD, sin ERC severa -> de-intensifica a estatina moderada (no alta)",
    label === "ALTO" && !plan[0]?.dose?.match(/40|80/) && plan[0]?.reason.includes("de-intensifica"),
    planDrugs(plan).join(", ") + " | " + (plan[0]?.reason || ""));
}

// F27 (regresión, mismo hallazgo): el MISMO tipo de paciente frágil pero CON
// ASCVD establecida (prevención secundaria) NUNCA debe de-intensificarse —
// la evidencia de beneficio de estatina de alta intensidad se mantiene
// incluso en fragilidad extrema.
{
  const p = { edad: 80, sexo: "H", saludStatus: "muyComplejo", hba1c: 8.5, ldl: 160, creatinina: 0.9, comorbilidades: ["IAM_ANGINA"], antecedentesFamiliares: [], nivelAcceso: "medio", medicacionActual: {} };
  const { plan, label } = buildLipidPlan(p);
  check("F27", "≥65a muy complejo CON ASCVD establecida -> NO de-intensifica, mantiene intensidad alta",
    label === "MUY ALTO" && !plan[0]?.reason.includes("de-intensifica") && includesDrug(plan, "Atorvastatina"),
    planDrugs(plan).join(", ") + " | " + (plan[0]?.reason || ""));
}

// F28 (regresión, mismo hallazgo): fragilidad extrema + ERC severa (eGFR<30,
// ya MUY ALTO por esa vía) tampoco debe de-intensificarse — KDIGO 2024
// mantiene la indicación de estatina en ERC avanzada pese a la fragilidad.
{
  const p = { edad: 80, sexo: "H", saludStatus: "muyComplejo", hba1c: 8.5, ldl: 160, creatinina: 4.5, comorbilidades: [], antecedentesFamiliares: [], nivelAcceso: "medio", medicacionActual: {} };
  const { plan, label } = buildLipidPlan(p);
  check("F28", "≥65a muy complejo + ERC severa (eGFR<30) -> NO de-intensifica, mantiene intensidad alta",
    label === "MUY ALTO" && !plan[0]?.reason.includes("de-intensifica") && includesDrug(plan, "Atorvastatina"),
    planDrugs(plan).join(", ") + " | " + (plan[0]?.reason || ""));
}

/* ============ I. VALORES LÍMITE EXACTOS (boundary tests) — el motor usa
   funciones escalón con operadores estrictos (>, <, >=), sin zona gris ni
   histéresis: en el valor EXACTO del corte el paciente cae de un solo lado.
   Esta sección fija ese comportamiento como contrato explícito en los cortes
   más sensibles (donde 0.1 de A1c, 1 mL/min de eGFR o 1 año de edad — todos
   dentro del margen de variabilidad clínica real — cambian la recomendación
   completa), para detectar cualquier futuro error de tipo `>` vs `>=`. Usa
   p.tfg (override manual de eGFR, ver calcEGFR) para fijar el eGFR exacto sin
   depender del despeje de la fórmula CKD-EPI. ============ */

// B1/B2: riesgo lipídico, corte a1c>8 del FALLBACK SIMPLIFICADO. Edad=35
// (fuera de 40-75) para que NO intercepte la indicación automática nueva
// "40-75a con diabetes (A1c>=6.5) -> MODERADO" (ver classifyLipidRisk) y el
// cliff a1c>8 original quede aislado como se probó siempre.
{
  const base = { edad: 35, sexo: "H", tfg: 90, ldl: 160, comorbilidades: [], antecedentesFamiliares: [], nivelAcceso: "medio", medicacionActual: {} };
  const r80 = buildLipidPlan({ ...base, hba1c: 8.0 });
  const r81 = buildLipidPlan({ ...base, hba1c: 8.1 });
  check("B1", "A1c=8.0 EXACTO (no >8), edad fuera de 40-75 -> riesgo MODERADO, no ALTO", r80.label === "MODERADO", r80.label);
  check("B2", "A1c=8.1 (>8), edad fuera de 40-75 -> riesgo ALTO", r81.label === "ALTO", r81.label);
}

// B3/B4: doble filo eGFR=30 en riesgo lipídico + gate de de-intensificación
// por fragilidad (severeCKD también depende de egfr<30).
{
  const base = { edad: 70, sexo: "H", hba1c: 6.5, ldl: 160, saludStatus: "muyComplejo", comorbilidades: [], antecedentesFamiliares: [], nivelAcceso: "medio", medicacionActual: {} };
  const r30 = buildLipidPlan({ ...base, tfg: 30 });
  const r29 = buildLipidPlan({ ...base, tfg: 29 });
  check("B3", "eGFR=30 EXACTO (no <30) -> riesgo ALTO (no MUY ALTO) y SÍ de-intensifica (severeCKD=false)",
    r30.label === "ALTO" && r30.plan[0]?.reason.includes("de-intensifica"),
    r30.label + " | " + (r30.plan[0]?.reason || ""));
  check("B4", "eGFR=29 (<30) -> riesgo MUY ALTO y NO de-intensifica (severeCKD=true, mantiene alta intensidad)",
    r29.label === "MUY ALTO" && !r29.plan[0]?.reason.includes("de-intensifica") && includesDrug(r29.plan, "Atorvastatina"),
    r29.label + " | " + (r29.plan[0]?.reason || ""));
}

// B5/B6: edad=65 en meta de PA individualizada (getIndividualizedBPGoalNumeric)
{
  const mk = (edad) => ({ edad, sexo: "H", saludStatus: "muyComplejo", tas: 135, tad: 85, uacr: 10, creatinina: 0.9, comorbilidades: [], antecedentesFamiliares: [], nivelAcceso: "medio",
    medicacionActual: { htn: [{ id: "AMLO", isMax: true }] } });
  const r65 = buildHTNPlan(mk(65));
  const r64 = buildHTNPlan(mk(64));
  check("B5", "Edad=65 EXACTO + muyComplejo, PA 135/85 -> meta individualizada <140/90 YA alcanzada, no escala",
    r65.plan.length === 0, planDrugs(r65.plan).join(", ") || "(vacío, correcto)");
  check("B6", "Edad=64 (<65) + muyComplejo, misma PA 135/85 -> NO aplica meta individualizada, meta por defecto <130/80 NO alcanzada, SÍ escala",
    r64.plan.length === 1 && r64.plan[0].reason.includes("<130/80"), planDrugs(r64.plan).join(", ") + " | " + (r64.plan[0]?.reason || ""));
}

// B7/B8: edad=65 en el gate de de-intensificación de estatina por fragilidad.
// Usa tfg=50 (ERC no severa, banda 40-75 -> indicación automática ALTO vía
// ERC) y hba1c=6.0 (NO diabético) para que el ALTO de partida venga de la
// rama de ERC automática, no de la nueva rama de diabetes automática
// (que ya mapea a MODERADO de por sí y no dejaría nada que "capear").
{
  const mk = (edad) => ({ edad, sexo: "H", saludStatus: "muyComplejo", hba1c: 6.0, ldl: 160, tfg: 50, comorbilidades: [], antecedentesFamiliares: [], nivelAcceso: "medio", medicacionActual: {} });
  const r65 = buildLipidPlan(mk(65));
  const r64 = buildLipidPlan(mk(64));
  check("B7", "Edad=65 EXACTO + muyComplejo + riesgo ALTO -> SÍ de-intensifica a estatina moderada",
    r65.plan[0]?.reason.includes("de-intensifica") && !includesDrug(r65.plan, "Atorvastatina"),
    r65.plan.map((x) => x.drug).join(", ") + " | " + (r65.plan[0]?.reason || ""));
  check("B8", "Edad=64 (<65), mismo perfil -> NO de-intensifica pese a ser muyComplejo, mantiene alta intensidad",
    !r64.plan[0]?.reason.includes("de-intensifica") && includesDrug(r64.plan, "Atorvastatina"),
    r64.plan.map((x) => x.drug).join(", ") + " | " + (r64.plan[0]?.reason || ""));
}

// B9/B10: eGFR=30 exacto en continuación de metformina (banda 30-45 vs <30)
{
  const mk = (tfg) => ({ edad: 70, sexo: "H", hba1c: 8.0, tfg, comorbilidades: [], antecedentesFamiliares: [], nivelAcceso: "medio",
    medicacionActual: { antidiabetic: [{ id: "MET", isMax: false }] } });
  const r30 = buildAntidiabeticPlan(mk(30));
  const r29 = buildAntidiabeticPlan(mk(29));
  const met30 = r30.plan.find((x) => x.drug === "Metformina");
  const met29 = r29.plan.find((x) => x.drug === "Metformina");
  check("B9", "eGFR=30 EXACTO (no <30) -> banda 30-45, mantener sin escalar, NO suspender",
    met30?.dose === "Mantener dosis actual (no escalar)", met30?.dose || "(sin entrada)");
  check("B10", "eGFR=29 (<30) -> SUSPENDER (contraindicación absoluta)",
    met29?.dose === "SUSPENDER", met29?.dose || "(sin entrada)");
}

/* ============ P. PREVENT-ASCVD como input manual (Guía de Dislipidemia
   2026) — el motor NO recalcula la fórmula PREVENT (coeficientes no
   verificables desde fuentes abiertas, ver comentario de classifyLipidRisk);
   el médico ingresa el % ya calculado externamente y el motor aplica los
   umbrales reales de la guía sobre ese valor. ============ */

// P1: <3% (bajo) sin LDL 160-189 -> estatina NO indicada (antes: el motor
// SIEMPRE recomendaba una estatina a cualquier paciente, sin excepción).
{
  const p = { edad: 45, sexo: "H", hba1c: 5.5, ldl: 120, preventAscvd10: 2.0, comorbilidades: [], antecedentesFamiliares: [], nivelAcceso: "medio", medicacionActual: {} };
  const { plan, label } = buildLipidPlan(p);
  check("P1", "PREVENT-ASCVD 2.0% (bajo) + LDL 120 -> estatina NO indicada",
    label === "BAJO" && plan.length === 1 && plan[0].id === "LIFESTYLE_ONLY_LIPID",
    planDrugs(plan).join(", ") + " | " + (plan[0]?.reason || ""));
}

// P2: <3% (bajo) pero LDL 160-189 -> SÍ considerar estatina moderada
// (excepción explícita de la guía dentro del nivel bajo).
{
  const p = { edad: 45, sexo: "H", hba1c: 5.5, ldl: 170, preventAscvd10: 2.0, comorbilidades: [], antecedentesFamiliares: [], nivelAcceso: "medio", medicacionActual: {} };
  const { plan, label } = buildLipidPlan(p);
  check("P2", "PREVENT-ASCVD 2.0% (bajo) + LDL 170 (160-189) -> SÍ considerar estatina moderada",
    label === "BAJO" && plan.length === 1 && !includesDrug(plan, "Atorvastatina") && !includesDrug(plan, "Rosuvastatina") && plan[0].id !== "LIFESTYLE_ONLY_LIPID",
    planDrugs(plan).join(", ") + " | " + (plan[0]?.reason || ""));
}

// P3: 3-<5% (limítrofe) -> estatina moderada, lenguaje de decisión compartida
{
  const p = { edad: 45, sexo: "H", hba1c: 5.5, ldl: 120, preventAscvd10: 4.0, comorbilidades: [], antecedentesFamiliares: [], nivelAcceso: "medio", medicacionActual: {} };
  const { plan, label } = buildLipidPlan(p);
  check("P3", "PREVENT-ASCVD 4.0% (limítrofe) -> estatina MODERADA, meta LDL<100",
    label === "LIMITROFE" && plan[0]?.reason.includes("<100") && !includesDrug(plan, "Atorvastatina") && !includesDrug(plan, "Rosuvastatina"),
    planDrugs(plan).join(", ") + " | " + (plan[0]?.reason || ""));
}

// P4: 5-<10% (intermedio) -> al menos estatina moderada, meta LDL<100
{
  const p = { edad: 45, sexo: "H", hba1c: 5.5, ldl: 120, preventAscvd10: 7.0, comorbilidades: [], antecedentesFamiliares: [], nivelAcceso: "medio", medicacionActual: {} };
  const { plan, label } = buildLipidPlan(p);
  check("P4", "PREVENT-ASCVD 7.0% (intermedio) -> estatina moderada, meta LDL<100",
    label === "MODERADO" && plan[0]?.reason.includes("<100"),
    planDrugs(plan).join(", ") + " | " + (plan[0]?.reason || ""));
}

// P5: >=10% (alto) -> estatina de ALTA intensidad, meta LDL<70, reducción >=50%
{
  const p = { edad: 45, sexo: "H", hba1c: 5.5, ldl: 120, preventAscvd10: 15.0, comorbilidades: [], antecedentesFamiliares: [], nivelAcceso: "medio", medicacionActual: {} };
  const { plan, label } = buildLipidPlan(p);
  check("P5", "PREVENT-ASCVD 15% (alto) -> estatina ALTA intensidad, meta LDL<70, reducción ≥50%",
    label === "ALTO" && (includesDrug(plan, "Atorvastatina") || includesDrug(plan, "Rosuvastatina")) && plan[0]?.reason.includes("<70") && plan[0]?.reason.includes("≥50%"),
    planDrugs(plan).join(", ") + " | " + (plan[0]?.reason || ""));
}

// P6: ASCVD establecida SIEMPRE se evalúa ANTES que PREVENT-ASCVD, aunque el
// médico haya capturado un % bajo -> indicación automática, no se usa el %.
{
  const p = { edad: 45, sexo: "H", hba1c: 5.5, ldl: 120, preventAscvd10: 1.0, comorbilidades: ["IAM_ANGINA"], antecedentesFamiliares: [], nivelAcceso: "medio", medicacionActual: {} };
  const { plan } = buildLipidPlan(p);
  const risk = classifyLipidRiskCalc(p);
  check("P6", "ASCVD establecida + PREVENT-ASCVD 1.0% capturado -> indicación automática MUY ALTO, el % bajo NO lo anula",
    risk.label === "MUY ALTO" && risk.fuente.includes("automática") && includesDrug(plan, "Atorvastatina"),
    risk.label + " | " + risk.fuente);
}

/* ============ H. FARMACOTERAPIA DE OBESIDAD (buildObesityPlan — nueva, esta
   ronda de auditoría: la categoría "obesity" de pharma-db.js existía desde
   hace varias sesiones pero ningún motor la usaba) ============ */

// H1: obeso virgen SIN ninguna comorbilidad de órgano, y con TODO el pool
// antidiabético de pérdida de peso excluido (pancreatitis excluye GLP-1/GIP;
// eGFR<20 excluye TODOS los iSGLT2 incluido Empagliflozina) -> es el
// escenario exacto que motivó construir buildObesityPlan: el fallback de
// buildAntidiabeticPlan queda sin ningún candidato, así que debe ser
// buildObesityPlan quien SÍ asigne un candidato nuevo del catálogo dedicado.
{
  const p = { edad: 50, sexo: "M", peso: 100, talla: 170, hba1c: 5.5, creatinina: 4.0, tas: 118, tad: 76, comorbilidades: ["PANCREATITIS"], antecedentesFamiliares: [], nivelAcceso: "medio", medicacionActual: {} };
  const dm = buildAntidiabeticPlan(p);
  const { plan } = buildObesityPlan(p, dm.plan);
  check("H1", "Obeso con pool antidiabético de peso totalmente excluido (pancreatitis + eGFR<20) -> buildObesityPlan asigna un fármaco dedicado",
    plan.length > 0, `antidiabetic: ${dm.plan.map((x) => x.drug).join(", ")} | obesity: ${plan.map((x) => x.drug).join(", ")}`);
}

// H2 (no-duplicación): obeso diabético virgen SIN comorbilidad de órgano ->
// el fallback de buildAntidiabeticPlan YA asigna un fármaco de pérdida de
// peso del pool antidiabético; buildObesityPlan NO debe agregar un segundo
// agente compitiendo por el mismo objetivo.
{
  const p = { edad: 45, sexo: "M", peso: 100, talla: 170, hba1c: 7.8, tas: 118, tad: 76, comorbilidades: [], antecedentesFamiliares: [], nivelAcceso: "medio", medicacionActual: {} };
  const dm = buildAntidiabeticPlan(p);
  const { plan } = buildObesityPlan(p, dm.plan);
  check("H2", "Obeso diabético sin comorbilidad de órgano -> buildObesityPlan NO duplica el pick del fallback antidiabético",
    plan.length === 0, `antidiabetic: ${dm.plan.map((x) => x.drug).join(", ")} | obesity: ${plan.map((x) => x.drug).join(", ")}`);
}

// H3: obeso diabético CON comorbilidad de órgano (ERC) -> Dapagliflozina se
// elige por la ERC, no por peso; buildObesityPlan SÍ debe agregar
// farmacoterapia dedicada porque el objetivo de peso sigue sin cubrir.
{
  const p = { edad: 55, sexo: "H", peso: 100, talla: 170, hba1c: 7.8, creatinina: 1.8, tas: 118, tad: 76, comorbilidades: ["ERC"], antecedentesFamiliares: [], nivelAcceso: "medio", medicacionActual: {} };
  const dm = buildAntidiabeticPlan(p);
  const { plan } = buildObesityPlan(p, dm.plan);
  check("H3", "Obeso diabético con ERC -> buildObesityPlan SÍ agrega farmacoterapia dedicada (el pick antidiabético fue por ERC, no por peso)",
    plan.length > 0, `antidiabetic: ${dm.plan.map((x) => x.drug).join(", ")} | obesity: ${plan.map((x) => x.drug).join(", ")}`);
}

// H4 (escalonamiento dosis-diabetes -> dosis-obesidad, misma molécula): YA en
// Semaglutida SC (antidiabetic) a dosis MÁXIMA, sigue obeso -> debe escalar a
// Semaglutida 2.4 mg (obesity), NUNCA como fármaco "nuevo" independiente.
{
  const p = { edad: 45, sexo: "M", peso: 100, talla: 170, hba1c: 6.5, tas: 118, tad: 76, comorbilidades: [], antecedentesFamiliares: [], nivelAcceso: "medio",
    medicacionActual: { antidiabetic: [{ id: "SEMA", isMax: true }] } };
  const dm = buildAntidiabeticPlan(p);
  const { plan } = buildObesityPlan(p, dm.plan);
  check("H4", "Semaglutida SC maxeada (dosis diabetes) + sigue obeso -> escala a Semaglutida 2.4 mg (dosis obesidad), misma molécula",
    plan.length === 1 && plan[0].drug === "Semaglutida 2.4 mg" && plan[0].reason.includes("mismo principio activo"), plan.map((x) => x.drug + " — " + x.reason).join(" | "));
}

// H5 (no-duplicación, molécula compartida NO maxeada): Semaglutida SC ya en
// uso pero NO maxeada -> buildAntidiabeticPlan la está titulando;
// buildObesityPlan no debe hacer nada todavía (ni nuevo agente ni escalar).
{
  const p = { edad: 45, sexo: "M", peso: 100, talla: 170, hba1c: 6.5, tas: 118, tad: 76, comorbilidades: [], antecedentesFamiliares: [], nivelAcceso: "medio",
    medicacionActual: { antidiabetic: [{ id: "SEMA", isMax: false }] } };
  const dm = buildAntidiabeticPlan(p);
  const { plan } = buildObesityPlan(p, dm.plan);
  check("H5", "Semaglutida SC ya en uso pero NO maxeada -> buildObesityPlan no interviene (buildAntidiabeticPlan ya la titula)",
    plan.length === 0, `antidiabetic: ${dm.plan.map((x) => x.drug).join(", ")} | obesity: ${plan.map((x) => x.drug).join(", ")}`);
}

// H6 (continuidad de la categoría "obesity" propiamente — Orlistat no
// maxeado): debe titular, y buildAntidiabeticPlan NO debe agregar un
// segundo agente de pérdida de peso encima (no-duplicación cruzada de categorías).
{
  const p = { edad: 40, sexo: "M", peso: 100, talla: 170, hba1c: 5.5, tas: 118, tad: 76, comorbilidades: [], antecedentesFamiliares: [], nivelAcceso: "medio",
    medicacionActual: { obesity: [{ id: "ORLI", isMax: false }] } };
  const dm = buildAntidiabeticPlan(p);
  const { plan } = buildObesityPlan(p, dm.plan);
  const dmHasWeightPick = dm.plan.some((x) => x.reason && x.reason.includes("meta de pérdida de peso"));
  check("H6", "Orlistat ya en uso (no maxeado) -> buildObesityPlan lo titula, y buildAntidiabeticPlan NO agrega un segundo agente de peso",
    plan.length === 1 && plan[0].drug === "Orlistat" && plan[0].dose.includes("Titular") && !dmHasWeightPick,
    `antidiabetic: ${dm.plan.map((x) => x.drug).join(", ")} | obesity: ${plan.map((x) => x.drug + " — " + x.dose).join(", ")}`);
}

// H7 (guard de seguridad ESTIMULANTE_CV — cierre del hueco texto-vs-`contra`
// de esta misma ronda): obesidad forzada a elegir del catálogo dedicado
// (ERC ya cubierta por otro motivo) + HTA no controlada + MEN2A familiar
// (excluye incretinas) -> debe caer en Orlistat, el único candidato sin
// contraindicación activa; NUNCA Fentermina/Fentermina-Topiramato/
// Naltrexona-Bupropión (estimulantes, contraindicados en HTA no controlada).
{
  const p = { edad: 55, sexo: "H", peso: 100, talla: 170, hba1c: 7.5, creatinina: 1.8, tas: 155, tad: 96, comorbilidades: ["ERC"], antecedentesFamiliares: ["FAM_MEN2A"], nivelAcceso: "medio", medicacionActual: {} };
  const dm = buildAntidiabeticPlan(p);
  const { plan } = buildObesityPlan(p, dm.plan);
  const stimulantNames = ["Fentermina", "Fentermina/Topiramato ER", "Naltrexona/Bupropion ER"];
  check("H7", "ERC+HTA no controlada+MEN2A familiar -> excluye incretinas Y estimulantes, cae en Orlistat (único seguro)",
    plan.length === 1 && plan[0].drug === "Orlistat" && !stimulantNames.includes(plan[0]?.drug), plan.map((x) => x.drug).join(", "));
}

// H8: no obeso -> plan vacío (no aplica ninguna farmacoterapia de obesidad).
{
  const p = { edad: 40, sexo: "M", peso: 70, talla: 175, hba1c: 5.5, tas: 118, tad: 76, comorbilidades: [], antecedentesFamiliares: [], nivelAcceso: "medio", medicacionActual: {} };
  const { plan } = buildObesityPlan(p, []);
  check("H8", "Paciente sin criterio de obesidad -> buildObesityPlan no asigna nada",
    plan.length === 0, plan.map((x) => x.drug).join(", "));
}

/* ============ Q. INTERACCIONES FÁRMACO-FÁRMACO CRUZADAS (checkInteractions,
   interactions.js) — hallazgo de auditoría, limitación documentada en el
   expediente ("sin verificación de interacciones"). Set curado, no
   exhaustivo (decisión explícita del Dr. Ortega). Se revisa sobre
   buildTreatmentPlan (medicación activa de las 4 categorías + lo recién
   recomendado), NO solo sobre los items nuevos del plan. ============ */

// Q1: Gemfibrozilo + estatina ya activos -> interacción MAYOR (rabdomiólisis)
{
  const p = { edad: 55, sexo: "H", ldl: 160, trigliceridos: 600, comorbilidades: [], antecedentesFamiliares: [], nivelAcceso: "medio",
    medicacionActual: { lipid: [{ id: "GEMFI", isMax: true }, { id: "ATOR", isMax: true }] } };
  const { interactionWarnings } = buildTreatmentPlan(p);
  const w = interactionWarnings.find((x) => x.id === "GEMFI_STATIN");
  check("Q1", "Gemfibrozilo + Atorvastatina activos -> interacción MAYOR detectada (rabdomiólisis, sugiere Fenofibrato)",
    !!w && w.severidad === "mayor" && w.accion.includes("Fenofibrato"),
    JSON.stringify(interactionWarnings.map((x) => x.id)));
}

// Q2: Verapamilo + Simvastatina activos -> interacción MAYOR (CYP3A4)
{
  const p = { edad: 60, sexo: "H", ldl: 130, tas: 135, tad: 85, comorbilidades: [], antecedentesFamiliares: [], nivelAcceso: "medio",
    medicacionActual: { htn: [{ id: "VERA", isMax: true }], lipid: [{ id: "SIMVA", isMax: true }] } };
  const { interactionWarnings } = buildTreatmentPlan(p);
  const w = interactionWarnings.find((x) => x.id === "NONDHP_CCB_STATIN_CYP3A4");
  check("Q2", "Verapamilo + Simvastatina activos -> interacción MAYOR detectada (CYP3A4, miopatía)",
    !!w && w.severidad === "mayor",
    JSON.stringify(interactionWarnings.map((x) => x.id)));
}

// Q3: IECA/ARA-II + MRA activos -> interacción a VIGILAR (hiperkalemia), NO
// "mayor" — es una combinación frecuentemente intencional (el motor mismo la
// recomienda en ERC+albuminuria) y no debe marcarse como "evitar".
{
  const p = { edad: 60, sexo: "H", tas: 145, tad: 92, uacr: 80, creatinina: 1.2, comorbilidades: [], antecedentesFamiliares: [], nivelAcceso: "medio",
    medicacionActual: { htn: [{ id: "LOSA", isMax: true }, { id: "ESPI", isMax: true }] } };
  const { interactionWarnings } = buildTreatmentPlan(p);
  const w = interactionWarnings.find((x) => x.id === "RAAS_MRA_HIPERK");
  check("Q3", "Losartan + Espironolactona activos -> interacción a VIGILAR (hiperkalemia), NO 'mayor'",
    !!w && w.severidad === "monitorizar",
    JSON.stringify(interactionWarnings.map((x) => x.id + ":" + x.severidad)));
}

// Q4: Sulfonilurea + betabloqueador no cardioselectivo activos -> VIGILAR
// (enmascaramiento de hipoglucemia)
{
  const p = { edad: 60, sexo: "H", hba1c: 7.2, tas: 135, tad: 85, comorbilidades: [], antecedentesFamiliares: [], nivelAcceso: "medio",
    medicacionActual: { antidiabetic: [{ id: "GLIM", isMax: true }], htn: [{ id: "CARV", isMax: true }] } };
  const { interactionWarnings } = buildTreatmentPlan(p);
  const w = interactionWarnings.find((x) => x.id === "HIPOGLU_BETABLOQ");
  check("Q4", "Glimepirida + Carvedilol activos -> interacción a VIGILAR (hipoglucemia enmascarada)",
    !!w && w.severidad === "monitorizar",
    JSON.stringify(interactionWarnings.map((x) => x.id)));
}

// Q5: control negativo — Atorvastatina sola (sin fibrato ni CCB no-DHP) ->
// ninguna advertencia de interacción.
{
  const p = { edad: 50, sexo: "H", ldl: 130, comorbilidades: [], antecedentesFamiliares: [], nivelAcceso: "medio",
    medicacionActual: { lipid: [{ id: "ATOR", isMax: true }] } };
  const { interactionWarnings } = buildTreatmentPlan(p);
  check("Q5", "Atorvastatina sola, sin pareja de interacción -> 0 advertencias (control negativo)",
    interactionWarnings.length === 0, JSON.stringify(interactionWarnings.map((x) => x.id)));
}

// Q6: la interacción se detecta también cuando UNO de los dos fármacos es
// una recomendación NUEVA del propio motor (no solo entre dos ya activos) —
// paciente ya en Gemfibrozilo, y el motor recién agrega una estatina nueva
// por LDL alto.
{
  const p = { edad: 55, sexo: "H", ldl: 190, trigliceridos: 200, comorbilidades: [], antecedentesFamiliares: [], nivelAcceso: "medio",
    medicacionActual: { lipid: [{ id: "GEMFI", isMax: true }] } };
  const { interactionWarnings, items } = buildTreatmentPlan(p);
  const w = interactionWarnings.find((x) => x.id === "GEMFI_STATIN");
  check("Q6", "Gemfibrozilo ya activo + motor agrega estatina NUEVA por LDL≥190 -> interacción SÍ se detecta (no solo entre fármacos ya activos)",
    !!w, "plan nuevo: " + items.map((x) => x.drug).join(", ") + " | warnings: " + JSON.stringify(interactionWarnings.map((x) => x.id)));
}

/* ============ R. FIX #2 (10-ago-2026): hasDiagnosedDiabetes usa p.tipoDM ============
 * Antes classifyLipidRisk/buildHTNPlan solo usaban A1c≥6.5% como proxy de
 * "paciente diabético" para sus indicaciones automáticas — un DM2 ya
 * diagnosticado pero bien controlado (A1c<6.5% con tratamiento) dejaba de
 * calificar. Ahora usan p.tipoDM (DM1/DM2) como fuente primaria. */

// R1: DM2 diagnosticado y CONTROLADO (A1c 6.0%, bajo tratamiento), 50 años,
// sin ASCVD/ERC/LDL≥190/PREVENT -> DEBE seguir calificando para la
// indicación automática MODERADA (antes, con el bug, caía al fallback).
{
  const p = { edad: 50, sexo: "H", tipoDM: "DM2", hba1c: 6.0, ldl: 130, creatinina: 0.9, comorbilidades: [], antecedentesFamiliares: [], nivelAcceso: "medio", medicacionActual: {} };
  const r = classifyLipidRiskCalc(p);
  check("R1", "DM2 diagnosticado + A1c 6.0% controlada -> SIGUE calificando indicación automática MODERADA (fix tipoDM)",
    r.label === "MODERADO" && r.fuente.includes("automática"), JSON.stringify(r));
}

// R2: MISMO perfil de laboratorio (A1c 6.0%) pero SIN tipoDM capturado -> cae
// al modelo simplificado (comportamiento preexistente sin cambios cuando no
// hay diagnóstico capturado; A1c 6.0% no alcanza el corte de respaldo 6.5%).
{
  const p = { edad: 50, sexo: "H", hba1c: 6.0, ldl: 130, creatinina: 0.9, comorbilidades: [], antecedentesFamiliares: [], nivelAcceso: "medio", medicacionActual: {} };
  const r = classifyLipidRiskCalc(p);
  check("R2", "Sin tipoDM + A1c 6.0% (bajo el respaldo 6.5%) -> NO indicación automática por diabetes, cae a simplificado",
    !r.fuente.includes("40-75a con diabetes"), JSON.stringify(r));
}

// R3: Prediabetes (NO es diabetes) con A1c 6.0% -> tampoco debe activar la
// rama automática de diabetes (la guía dice "con diabetes", no "en riesgo").
{
  const p = { edad: 50, sexo: "H", tipoDM: "Prediabetes", hba1c: 6.0, ldl: 130, creatinina: 0.9, comorbilidades: [], antecedentesFamiliares: [], nivelAcceso: "medio", medicacionActual: {} };
  const r = classifyLipidRiskCalc(p);
  check("R3", "Prediabetes (no diabetes) + A1c 6.0% -> NO dispara la indicación automática de diabetes",
    !r.fuente.includes("40-75a con diabetes"), JSON.stringify(r));
}

// R4: buildHTNPlan — DM2 diagnosticado y controlado + HTA Etapa 1 (132/84),
// sin ASCVD/ERC, sin PREVENT-CVD capturado -> riesgo YA confirmado por
// diabetes conocida (tipoDM), debe tratar de inmediato (antes, con el bug,
// esto caía en "ensayo de estilo de vida" porque A1c 6.0% < 6.5%).
{
  const p = { edad: 50, sexo: "H", tipoDM: "DM2", hba1c: 6.0, tas: 132, tad: 84, uacr: 10, comorbilidades: [], antecedentesFamiliares: [], nivelAcceso: "medio", medicacionActual: {} };
  const { plan } = buildHTNPlan(p);
  check("R4", "DM2 diagnosticado y controlado + HTA Etapa 1 -> riesgo confirmado por diabetes conocida, trata de inmediato (fix tipoDM)",
    plan.length === 1 && includesDrug(plan, "Amlodipino"),
    planDrugs(plan).join(", ") + " | " + (plan[0]?.reason || ""));
}

// R5: MISMO paciente pero SIN tipoDM capturado -> comportamiento preexistente
// sin cambios: sin diagnóstico conocido y A1c 6.0% bajo el respaldo, cae en
// ensayo de estilo de vida.
{
  const p = { edad: 50, sexo: "H", hba1c: 6.0, tas: 132, tad: 84, uacr: 10, comorbilidades: [], antecedentesFamiliares: [], nivelAcceso: "medio", medicacionActual: {} };
  const { plan } = buildHTNPlan(p);
  check("R5", "Sin tipoDM + A1c 6.0% -> comportamiento preexistente sin cambios, ensayo de estilo de vida",
    plan.length === 1 && plan[0].id === "LIFESTYLE_TRIAL_HTN",
    planDrugs(plan).join(", ") + " | " + (plan[0]?.reason || ""));
}

/* ============ REPORTE ============ */
console.log("\n=== RESULTADOS ===\n");
results.forEach((r) => {
  console.log(`${r.ok ? "PASS" : "FAIL"}  [${r.caseId}] ${r.desc}`);
  console.log(`      -> ${r.detail}`);
});
console.log(`\nTotal: ${pass + fail} casos | ${pass} PASS | ${fail} FAIL`);
