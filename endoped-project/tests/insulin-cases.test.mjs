/* --- BATERÍA DE CASOS: ENDOINSULIN (dosificación basal/bolo + automonitoreo) ---
 * Corre las funciones REALES de js/insulin.js contra pacientes sintéticos.
 * Reglas verificadas (confirmadas textualmente con el Dr. Ortega):
 *   - Virgen de insulina: 0.1-0.2 UI/kg/día (basal).
 *   - Ya establecida y NO en metas: considerar hasta 0.5 UI/kg/día.
 *   - Prandial/bolo: 0.05-0.1 UI/kg/comida (misma cifra que pharma-db.js).
 *   - Ayuno/nocturna elevados -> problema de BASAL; preprandial/posprandial
 *     elevados con ayuno/nocturna en meta -> problema de BOLO.
 * Uso: node tests/insulin-cases.test.mjs   (desde la raíz del proyecto)
 */
import {
  computeBasalInsulinDose, computePrandialInsulinDose, computeMonitoreo,
  computeInsulinAssessment, computeGlucoseGoals, tieneBasalActiva, tienePrandialActiva,
  estimateTDD, computeISF, computeICR, computeCorrectionDose,
  setTDDOverride, resetTDDOverride,
} from "../js/insulin.js";

let pass = 0, fail = 0;
const results = [];

function check(caseId, desc, condition, detail) {
  const ok = !!condition;
  if (ok) pass++; else fail++;
  results.push({ caseId, desc, ok, detail });
}

const conGlargina = { medicacionActual: { antidiabetic: [{ id: "GLAR", isMax: false }] } };
const conLispro = { medicacionActual: { antidiabetic: [{ id: "GLAR", isMax: false }, { id: "LISPRO", isMax: false }] } };

/* ============ BASAL ============ */

// I1: virgen de insulina, 80kg -> 8-16 UI/día
{
  const p = { peso: 80, edad: 50, medicacionActual: {} };
  const b = computeBasalInsulinDose(p);
  check("I1", "Virgen de insulina, 80kg -> 8-16 UI/día (0.1-0.2 UI/kg)", b.estado === "virgen" && b.dosisMinUI === 8 && b.dosisMaxUI === 16, JSON.stringify(b));
}

// I2: ya con basal (Glargina), A1c 9.0% (meta <65a sin bajo riesgo = 7.0%) -> NO en metas -> objetivo 0.5 UI/kg
{
  const p = { peso: 80, edad: 50, hba1c: 9.0, ...conGlargina };
  const b = computeBasalInsulinDose(p);
  check("I2", "Ya con basal + A1c 9.0% (meta 7.0%) -> NO en metas, objetivo 40 UI/día (0.5 UI/kg)",
    b.estado === "establecida_no_en_metas" && b.dosisObjetivoUI === 40, JSON.stringify(b));
}

// I3: ya con basal, A1c 6.5% (en meta) -> en metas
{
  const p = { peso: 80, edad: 50, hba1c: 6.5, ...conGlargina };
  const b = computeBasalInsulinDose(p);
  check("I3", "Ya con basal + A1c 6.5% (meta 7.0%) -> EN metas", b.estado === "establecida_en_metas", JSON.stringify(b));
}

// I4: ya con basal, sin A1c ni glucosa capturada -> sin datos de control (no asume nada)
{
  const p = { peso: 80, edad: 50, ...conGlargina };
  const b = computeBasalInsulinDose(p);
  check("I4", "Ya con basal, sin A1c/glucosa -> 'sin datos de control' (no inventa un estado)", b.estado === "establecida_sin_datos_de_control", JSON.stringify(b));
}

// I5: ya con basal, ayuno en hipoglucemia (60) aunque no haya A1c -> riesgo de hipoglucemia (prioridad sobre "sin datos")
{
  const p = { peso: 80, edad: 50, glucosa: 60, ...conGlargina };
  const b = computeBasalInsulinDose(p);
  check("I5", "Ya con basal + ayuno=60 (hipoglucemia) -> riesgo de hipoglucemia, considerar REDUCIR basal", b.estado === "establecida_riesgo_hipoglucemia", JSON.stringify(b));
}

// I6: sin peso capturado -> no se puede calcular
{
  const p = { edad: 50, medicacionActual: {} };
  const b = computeBasalInsulinDose(p);
  check("I6", "Sin peso capturado -> 'sin_peso' (no inventa una dosis)", b.estado === "sin_peso", JSON.stringify(b));
}

/* ============ PRANDIAL / BOLO ============ */

// I7: ya con basal, ayuno/nocturna en meta, posprandial elevado, SIN bolo activo -> sugiere iniciar bolo
{
  const p = { peso: 80, edad: 50, glucosa: 100, glucosaNocturna: 100, glucosaPosprandial: 220, ...conGlargina };
  const pr = computePrandialInsulinDose(p);
  check("I7", "Basal ok + posprandial elevada (220) + sin bolo activo -> sugiere bolo nuevo, 4-8 UI/comida (0.05-0.1 UI/kg)",
    pr.aplica === true && pr.estado === "sugerido_nuevo" && pr.dosisMinUI === 4 && pr.dosisMaxUI === 8, JSON.stringify(pr));
}

// I8: ya con bolo activo (Lispro) y posprandial sigue elevada -> reevaluar ajuste (no "nuevo")
{
  const p = { peso: 80, edad: 50, glucosa: 100, glucosaNocturna: 100, glucosaPosprandial: 220, ...conLispro };
  const pr = computePrandialInsulinDose(p);
  check("I8", "Bolo YA activo + posprandial sigue elevada -> reevaluar ajuste (no lo trata como indicación nueva)",
    pr.aplica === true && pr.estado === "activo_reevaluar", JSON.stringify(pr));
}

// I9: paciente VIRGEN de insulina (sin basal) con posprandial elevada -> NO sugiere bolo todavía (falta la base basal)
{
  const p = { peso: 80, edad: 50, glucosaPosprandial: 220, medicacionActual: {} };
  const pr = computePrandialInsulinDose(p);
  check("I9", "Virgen de insulina (sin basal) + posprandial elevada -> NO sugiere bolo aún (requiere base basal primero)",
    pr.aplica === false, JSON.stringify(pr));
}

// I10: basal insuficiente (ayuno elevado) -> aunque posprandial también esté elevada, NO se sugiere bolo nuevo
// todavía (hay que corregir la basal primero; ver computeMonitoreo -> basalInsuficiente gana prioridad)
{
  const p = { peso: 80, edad: 50, glucosa: 200, glucosaPosprandial: 220, ...conGlargina };
  const pr = computePrandialInsulinDose(p);
  check("I10", "Ayuno TAMBIÉN elevado (200) -> no sugiere bolo nuevo todavía (corregir basal primero)",
    pr.aplica === false, JSON.stringify(pr));
}

/* ============ MONITOREO / INTERPRETACIÓN ============ */

// I11: ayuno elevado + posprandial en meta -> problema de BASAL
{
  const p = { peso: 80, edad: 50, glucosa: 200, glucosaPosprandial: 150 };
  const m = computeMonitoreo(p);
  check("I11", "Ayuno elevado + posprandial en meta -> interpretación apunta a BASAL insuficiente",
    m.basalInsuficiente === true && m.bolusInsuficiente === false && m.colorInterpretacion === "amber", JSON.stringify(m));
}

// I12: ayuno en meta + posprandial elevado -> problema de BOLO
{
  const p = { peso: 80, edad: 50, glucosa: 100, glucosaPosprandial: 220 };
  const m = computeMonitoreo(p);
  check("I12", "Ayuno en meta + posprandial elevado -> interpretación apunta a BOLO",
    m.basalInsuficiente === false && m.bolusInsuficiente === true, JSON.stringify(m));
}

// I13: hipoglucemia estricta <70 vs "bajo" (70-79, meta general 80-130) —
// el rango original <70 NO cambió (11-ago-2026); solo se subclasificó.
{
  const p69 = { glucosa: 69 }, p70 = { glucosa: 70 };
  const m69 = computeMonitoreo(p69), m70 = computeMonitoreo(p70);
  check("I13", "Glucosa 69 -> 'hipoglucemia_nivel1'; 70 -> 'bajo' (no hipoglucemia, umbral estricto ADA <70)",
    m69.ayuno.estado === "hipoglucemia_nivel1" && m70.ayuno.estado === "bajo",
    `69->${m69.ayuno.estado}, 70->${m70.ayuno.estado}`);
}

// I13b: subclasificación ADA Nivel 1 (54-69) vs Nivel 2 (<54) — nuevo
// (11-ago-2026, a petición del Dr. Ortega).
{
  const p53 = { glucosa: 53 }, p54 = { glucosa: 54 }, p60 = { glucosa: 60 };
  const m53 = computeMonitoreo(p53), m54 = computeMonitoreo(p54), m60 = computeMonitoreo(p60);
  check("I13b", "Glucosa 53 -> Nivel 2 (<54, clínicamente significativa)",
    m53.ayuno.estado === "hipoglucemia_nivel2", m53.ayuno.estado);
  check("I13b", "Glucosa 54 (borde inclusivo) -> Nivel 1, no Nivel 2",
    m54.ayuno.estado === "hipoglucemia_nivel1", m54.ayuno.estado);
  check("I13b", "Glucosa 60 -> Nivel 1 (54-69, alerta)",
    m60.ayuno.estado === "hipoglucemia_nivel1", m60.ayuno.estado);
}

// I14: meta posprandial se relaja en paciente muy complejo/frágil (200 vs 180 general)
{
  const pGeneral = { edad: 50 };
  const pFragil = { edad: 70, saludStatus: "muyComplejo" };
  const goalsGeneral = computeGlucoseGoals(pGeneral);
  const goalsFragil = computeGlucoseGoals(pFragil);
  check("I14", "Meta posprandial: 180 en adulto general, 200 en paciente muy complejo/frágil (≥65a)",
    goalsGeneral.posprandialMax === 180 && goalsFragil.posprandialMax === 200,
    `general=${goalsGeneral.posprandialMax}, fragil=${goalsFragil.posprandialMax}`);
}

/* ============ ENSAMBLE / APLICABILIDAD ============ */

// I15: paciente sin diabetes, sin insulina, A1c normal -> el panel no aplica
{
  const p = { edad: 40, hba1c: 5.2, medicacionActual: {} };
  const a = computeInsulinAssessment(p);
  check("I15", "Sin diabetes/insulina/A1c alto -> EndoInsulin NO aplica (no se muestra el panel)", a.aplica === false, JSON.stringify(a));
}

// I16: tipoDM=DM2 capturado (aunque A1c esté en meta) -> el panel SÍ aplica
{
  const p = { edad: 40, tipoDM: "DM2", hba1c: 6.0, peso: 70, medicacionActual: {} };
  const a = computeInsulinAssessment(p);
  check("I16", "tipoDM=DM2 capturado -> EndoInsulin SÍ aplica (independiente del A1c)", a.aplica === true && a.basal.estado === "virgen", JSON.stringify(a.basal));
}

// I16b: umbral de A1c-solo subido de 6.5% a >9% (11-ago-2026, Dr. Ortega)
{
  const pMedio = { edad: 40, hba1c: 8.0, medicacionActual: {} };
  const aMedio = computeInsulinAssessment(pMedio);
  check("I16b", "A1c 8.0% sin dx de diabetes ni insulina activa -> YA NO aplica (antes 6.5% sí aplicaba)", aMedio.aplica === false, JSON.stringify(aMedio));
  const pAlto = { edad: 40, hba1c: 9.5, medicacionActual: {} };
  const aAlto = computeInsulinAssessment(pAlto);
  check("I16b", "A1c 9.5% sin dx de diabetes ni insulina activa -> SÍ aplica (>9%)", aAlto.aplica === true, JSON.stringify(aAlto));
  const pCorte = { edad: 40, hba1c: 9.0, medicacionActual: {} };
  const aCorte = computeInsulinAssessment(pCorte);
  check("I16b", "A1c exactamente 9.0% -> NO aplica (corte estricto >9, no ≥9)", aCorte.aplica === false, JSON.stringify(aCorte));
}

// I17: helpers de detección de insulina activa
{
  const conBasal = tieneBasalActiva(conGlargina);
  const conBolo = tienePrandialActiva(conLispro);
  const sinNinguna = tieneBasalActiva({ medicacionActual: {} });
  check("I17", "tieneBasalActiva/tienePrandialActiva detectan correctamente por grupo farmacológico",
    conBasal === true && conBolo === true && sinNinguna === false, `basal=${conBasal}, bolo=${conBolo}, ninguna=${sinNinguna}`);
}

/* ============ CALCULADORAS DE TITULACIÓN (TDD/ISF/ICR/corrección) ============ */

// I18: ISF (Factor de Sensibilidad) — Regla 1800 (rápida) y 1500 (Regular)
{
  const isfRapida = computeISF(50);
  const isfRegular = computeISF(50, { insulinaRegular: true });
  check("I18", "ISF con TDD=50, análogo rápido -> 1800/50 = 36 mg/dL por UI", isfRapida === 36, isfRapida);
  check("I18", "ISF con TDD=50, insulina Regular -> 1500/50 = 30 mg/dL por UI", isfRegular === 30, isfRegular);
  check("I18", "ISF sin TDD (0) -> null, no truena", computeISF(0) === null, computeISF(0));
}

// I19: ICR (Relación Insulina:Carbohidratos) — Regla 500
{
  const icr = computeICR(50);
  check("I19", "ICR con TDD=50 -> 500/50 = 10 g de carbohidrato por UI", icr === 10, icr);
  check("I19", "ICR sin TDD -> null, no truena", computeICR(null) === null, computeICR(null));
}

// I20: dosis de corrección — (glucosa actual - meta) / ISF, nunca negativa
{
  const d1 = computeCorrectionDose(250, 120, 36);
  check("I20", "Corrección: glucosa 250, meta 120, ISF 36 -> (250-120)/36 = 3.6 UI", d1 === 3.6, d1);
  const d2 = computeCorrectionDose(100, 120, 36);
  check("I20", "Corrección: glucosa YA por debajo de la meta -> 0 UI, nunca negativa", d2 === 0, d2);
  const d3 = computeCorrectionDose(0, 120, 36);
  check("I20", "Corrección sin glucosa capturada -> null, no truena", d3 === null, d3);
}

// I21: TDD estimada — se deriva de las mismas sugerencias basal/prandial
// que ya calcula este módulo, no de una fórmula nueva.
{
  const pVirgen = { peso: 80, edad: 50, medicacionActual: {} };
  const tddVirgen = estimateTDD(pVirgen);
  check("I21", "TDD estimada, virgen 80kg (sin bolo aplicable) -> promedio basal (8-16 UI) = 12", tddVirgen === 12, tddVirgen);
  const pSinPeso = { edad: 50, medicacionActual: {} };
  check("I21", "TDD estimada sin peso capturado -> 0, no inventa un número", estimateTDD(pSinPeso) === 0, estimateTDD(pSinPeso));
}

// I22: computeInsulinAssessment ensambla `titulacion` con TDD/ISF/ICR, y
// respeta el override manual (setTDDOverride) sobre la estimación.
{
  resetTDDOverride();
  const p = { peso: 80, edad: 50, tipoDM: "DM2", medicacionActual: {} };
  const aEstimado = computeInsulinAssessment(p);
  check("I22", "Sin override -> titulacion.tddEsEstimado = true, TDD = estimateTDD(p)",
    aEstimado.titulacion.tddEsEstimado === true && aEstimado.titulacion.tdd === estimateTDD(p), JSON.stringify(aEstimado.titulacion));

  setTDDOverride(60);
  const aManual = computeInsulinAssessment(p);
  check("I22", "Con override manual (60) -> titulacion.tdd = 60, tddEsEstimado = false, ISF/ICR derivados de 60",
    aManual.titulacion.tdd === 60 && aManual.titulacion.tddEsEstimado === false &&
    aManual.titulacion.isf === computeISF(60) && aManual.titulacion.icr === computeICR(60),
    JSON.stringify(aManual.titulacion));
  resetTDDOverride(); // no contaminar otros tests
}

/* ============ RESULTADOS ============ */

console.log(`\n=== ENDOINSULIN: ${pass} pasaron, ${fail} fallaron (de ${pass + fail}) ===\n`);
results.forEach((r) => {
  console.log(`[${r.ok ? "OK" : "FALLO"}] ${r.caseId}: ${r.desc}${r.ok ? "" : `  <-- ${r.detail}`}`);
});
if (fail > 0) process.exit(1);
