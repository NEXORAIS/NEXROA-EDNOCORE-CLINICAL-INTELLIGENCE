/* --- CASOS DE BORDE 38-57 (ronda "Capas 1-4 + Dominios 1,3,5,6") ---
 * Regresión dedicada para la ronda de 20 casos de borde clínico propuesta
 * por el Dr. Ortega (10-ago-2026): guardrail de extremos fisiológicos +
 * geriatría (Capa 1) + perioperatorio (Capa 2) + labs de borde (Capa 3) +
 * desescalamiento/polifarmacia (Capa 4) + corticoides/AINE renal
 * (Dominio 1) + psiquiatría (Dominio 3) + TARV/VIH (Dominio 5) + sick day
 * rules (Dominio 6).
 *
 * FUERA DE ALCANCE (documentado, no construido — decisión explícita del
 * Dr. Ortega, "Fuera de alcance por ahora"): Dominio 2 (oncología, casos
 * 48-49) y el caso 53 (hipertensión portal, Dominio 4). El caso 52
 * (cirrosis Child-Pugh B/C) tampoco se construyó — no estaba en la lista de
 * dominios aprobados ("Domains 1,3,5,6"). El caso 55 (crisis hipertensiva/
 * sepsis) se considera cubierto por el guardrail de redflags.js en su
 * componente de PA ≥180/120 — no se modela sepsis como entidad aparte.
 *
 * Uso: node tests/edge-cases.test.mjs
 */
import { buildTreatmentPlan, buildAntidiabeticPlan, buildHTNPlan, buildLipidPlan, buildObesityPlan } from "../js/calculations.js";

let pass = 0, fail = 0;
function check(desc, condition, detail) {
  const ok = !!condition;
  if (ok) pass++; else fail++;
  console.log(`${ok ? "PASS" : "FAIL"} — ${desc}${ok ? "" : `  [${JSON.stringify(detail)}]`}`);
}
const hasId = (items, id) => items.some((x) => x.id === id);

console.log("=".repeat(90));
console.log("CAPA 0 — GUARDRAIL (extremos fisiológicos)");
console.log("=".repeat(90));
{
  const r1 = buildTreatmentPlan({ creatinina: 11 });
  check("Creatinina >10 -> guardrail activo, items vacíos", r1.redFlags.activo && r1.items.length === 0, r1);
  const r2 = buildTreatmentPlan({ potasio: 6.8 });
  check("K+ >6.5 -> guardrail activo", r2.redFlags.activo, r2.redFlags);
  const r3 = buildTreatmentPlan({ tas: 182, tad: 100 });
  check("PA ≥180 sistólica -> guardrail activo (Crisis Hipertensiva)", r3.redFlags.activo, r3.redFlags);
  const r4 = buildTreatmentPlan({ tad: 122 });
  check("PA ≥120 diastólica -> guardrail activo", r4.redFlags.activo, r4.redFlags);
  const r5 = buildTreatmentPlan({ glucosa: 650 });
  check("Glucosa >600 -> guardrail activo (rango EHH)", r5.redFlags.activo, r5.redFlags);
  const r6 = buildTreatmentPlan({ glucosa: 35 });
  check("Glucosa <40 -> guardrail activo (hipoglucemia severa)", r6.redFlags.activo, r6.redFlags);
  const r7 = buildTreatmentPlan({ creatinina: 1.1, potasio: 4.5, tas: 130, tad: 80, glucosa: 120 });
  check("Valores normales -> guardrail NO activo", !r7.redFlags.activo, r7.redFlags);
}

console.log("\n" + "=".repeat(90));
console.log("CAPA 1 — DEPRESCRIPCIÓN GERIÁTRICA (casos 38-39)");
console.log("=".repeat(90));
{
  // Caso 38: adulto mayor complejo, A1c en meta, SU activa a dosis máxima.
  const p38 = { edad: 78, saludStatus: "complejo", hba1c: 6.9, medicacionActual: { antidiabetic: [{ id: "GLIM", isMax: true }] } };
  const r38 = buildAntidiabeticPlan(p38);
  check("Caso 38: adulto mayor + A1c en meta + SU -> sugiere desescalar", hasId(r38.plan, "OVERTREATMENT_DM_GERIATRIC"), r38.plan);
  const r38noAge = buildAntidiabeticPlan({ ...p38, edad: 45 });
  check("Caso 38: <65 años -> NO se activa (criterio exclusivo Tabla 13.2)", !hasId(r38noAge.plan, "OVERTREATMENT_DM_GERIATRIC"), r38noAge.plan);

  // Caso 39: síntomas ortostáticos + PA en meta + polifarmacia antihipertensiva.
  const p39 = { edad: 80, saludStatus: "muyComplejo", tas: 135, tad: 85, sintomasOrtostaticos: true, medicacionActual: { htn: [{ id: "ENAL", isMax: false }, { id: "AMLO", isMax: true }] } };
  const r39 = buildHTNPlan(p39);
  check("Caso 39: ortostatismo + PA en meta + 2 antihipertensivos -> bloquea titulación, sugiere simplificar", hasId(r39.plan, "ORTHOSTATIC_SIMPLIFY"), r39.plan);
  const r39sinSintomas = buildHTNPlan({ ...p39, sintomasOrtostaticos: false });
  check("Caso 39: sin síntomas -> titula normalmente (Enalapril no maxeado)", r39sinSintomas.plan.some((x) => x.id === "ENAL" && x.dose.includes("Titular")), r39sinSintomas.plan);
}

console.log("\n" + "=".repeat(90));
console.log("CAPA 2 — SEGURIDAD PERIOPERATORIA (casos 40-41)");
console.log("=".repeat(90));
{
  const p40 = { cirugiaProgramada: true, diasCirugia: 2, medicacionActual: { antidiabetic: [{ id: "DAPA", isMax: true }] } };
  const r40 = buildAntidiabeticPlan(p40);
  check("Caso 40: iSGLT2 + cirugía en 2 días -> SUSPENDER (CAD-e)", hasId(r40.plan, "PERIOP_SGLT2_SUSPEND"), r40.plan);
  const r40lejos = buildAntidiabeticPlan({ ...p40, diasCirugia: 10 });
  check("Caso 40: cirugía en 10 días -> NO se activa (fuera de ventana de 4 días)", !hasId(r40lejos.plan, "PERIOP_SGLT2_SUSPEND"), r40lejos.plan);

  const p41 = { cirugiaProgramada: true, diasCirugia: 3, medicacionActual: { antidiabetic: [{ id: "SEMA", isMax: true }] } };
  const r41 = buildAntidiabeticPlan(p41);
  check("Caso 41: GLP-1 semanal + procedimiento en 3 días -> SUSPENDER (aspiración)", hasId(r41.plan, "PERIOP_INCRETIN_SUSPEND"), r41.plan);
  check("Caso 40/41: no queda 'Titular' contradictorio junto a la suspensión", !r40.plan.some((x) => x.id === "DAPA" && x.dose.includes("Titular")), r40.plan);
}

console.log("\n" + "=".repeat(90));
console.log("CAPA 3 — LABS DE BORDE (casos 42-43)");
console.log("=".repeat(90));
{
  const p42 = { tas: 118, tad: 72, potasio: 5.6, medicacionActual: { htn: [{ id: "ENAL", isMax: true }, { id: "ESPI", isMax: true }] } };
  const r42 = buildTreatmentPlan(p42);
  check("Caso 42: K+ 5.6 + IECA+MRA (PA controlada, sin gate de PA) -> sugiere quelante, NO suspende RAAS", hasId(r42.items, "HYPERK_ZONE_GRAY_BINDER"), r42.items);
  const r42severo = buildTreatmentPlan({ ...p42, potasio: 6.7 });
  check("Caso 42: K+ >6.5 -> va a guardrail, no al aviso de quelante", r42severo.redFlags.activo, r42severo.redFlags);

  const p43 = { hemoglobina: 8.5, hba1c: 7.2 };
  const r43 = buildAntidiabeticPlan(p43);
  check("Caso 43: anemia significativa (Hb 8.5) -> A1c marcada como no confiable", hasId(r43.plan, "A1C_NO_CONFIABLE"), r43.plan);
  const r43normal = buildAntidiabeticPlan({ hemoglobina: 13.5, egfr: 90, hba1c: 7.0 });
  check("Caso 43: Hb/eGFR normales -> NO se activa", !hasId(r43normal.plan, "A1C_NO_CONFIABLE"), r43normal.plan);
}

console.log("\n" + "=".repeat(90));
console.log("CAPA 4 — DESESCALAMIENTO Y POLIFARMACIA (casos 44-45, 57)");
console.log("=".repeat(90));
{
  const p44 = { edad: 45, hba1c: 5.0, medicacionActual: { antidiabetic: [{ id: "GLIM", isMax: true }] } };
  const r44 = buildAntidiabeticPlan(p44);
  check("Caso 44/57: paciente <65a con A1c muy por debajo de meta + SU -> desescalar prioritario", hasId(r44.plan, "SEVERE_OVERTREATMENT_DM"), r44.plan);
  const p44elderly = { edad: 78, saludStatus: "complejo", hba1c: 5.5, medicacionActual: { antidiabetic: [{ id: "GLIM", isMax: true }] } };
  const r44elderly = buildAntidiabeticPlan(p44elderly);
  check("Caso 44 en adulto mayor: prioriza tarjeta 'severa' sobre la 'leve' del Caso 38 (sin duplicar)",
    hasId(r44elderly.plan, "SEVERE_OVERTREATMENT_DM") && !hasId(r44elderly.plan, "OVERTREATMENT_DM_GERIATRIC"), r44elderly.plan);

  // aineReciente ahora se deriva de medicacionActual.otros (10-ago-2026) — ver
  // getPatientFlags en calculations.js. IBU/NAPRO/DICLO/KETOR/CELEC son
  // equivalentes para esta bandera (todos grp:"AINE" en pharma-db.js).
  const p45 = { medicacionActual: { htn: [{ id: "ENAL", isMax: true }, { id: "FURO", isMax: true }], otros: [{ id: "IBU" }] } };
  const r45 = buildTreatmentPlan(p45);
  check("Caso 45: AINE + IECA + diurético de asa -> Tríada Mortal (riesgo alto)", hasId(r45.items, "TRIPLE_WHAMMY_AKI"), r45.items);
  const r45moderado = buildTreatmentPlan({ medicacionActual: { htn: [{ id: "ENAL", isMax: true }], otros: [{ id: "IBU" }] } });
  check("Caso 45: AINE + IECA sin diurético -> riesgo moderado (2 de 3 componentes)", hasId(r45moderado.items, "AINE_RAAS_RENAL_RISK"), r45moderado.items);
  const r45sinAine = buildTreatmentPlan({ medicacionActual: { htn: [{ id: "ENAL", isMax: true }, { id: "FURO", isMax: true }] } });
  check("Caso 45: sin AINE reciente -> no se activa pese a RAAS+diurético", !hasId(r45sinAine.items, "TRIPLE_WHAMMY_AKI") && !hasId(r45sinAine.items, "AINE_RAAS_RENAL_RISK"), r45sinAine.items);
}

console.log("\n" + "=".repeat(90));
console.log("DOMINIO 1 — CORTICOIDES Y AINE RENAL (casos 46-47)");
console.log("=".repeat(90));
{
  const r46alta = buildTreatmentPlan({ corticoideDosis: 30 });
  check("Caso 46: corticoide ≥20mg/día -> aviso de riesgo ALTO de hiperglucemia/HTA", hasId(r46alta.items, "CORTICOSTEROIDE_HIPERGLUCEMIA") && r46alta.items.find((x) => x.id === "CORTICOSTEROIDE_HIPERGLUCEMIA").color === "rose", r46alta.items);
  const r46baja = buildTreatmentPlan({ corticoideDosis: 5 });
  check("Caso 46: corticoide dosis baja -> aviso de menor urgencia", r46baja.items.find((x) => x.id === "CORTICOSTEROIDE_HIPERGLUCEMIA")?.color === "amber", r46baja.items);

  const p47 = { creatinina: 2.5, edad: 60, sexo: "M", peso: 75, medicacionActual: { otros: [{ id: "IBU" }] } };
  const r47 = buildTreatmentPlan(p47);
  check("Caso 47: AINE + ERC de base (sin RAAS/diurético) -> advierte nefrotoxicidad independiente", hasId(r47.items, "AINE_ERC_NEFROTOXICIDAD"), r47.items);
  const p47conRaas = { ...p47, medicacionActual: { ...p47.medicacionActual, htn: [{ id: "ENAL", isMax: true }] } };
  const r47conRaas = buildTreatmentPlan(p47conRaas);
  check("Caso 47+45 combinados: no duplica -> solo la tarjeta más específica (Caso 45)", hasId(r47conRaas.items, "AINE_RAAS_RENAL_RISK") && !hasId(r47conRaas.items, "AINE_ERC_NEFROTOXICIDAD"), r47conRaas.items);
}

console.log("\n" + "=".repeat(90));
console.log("DOMINIO 3 — PSIQUIATRÍA (casos 50-51)");
console.log("=".repeat(90));
{
  const p50 = { peso: 100, talla: 165, medicacionActual: { otros: [{ id: "OLANZ" }] } };
  const r50 = buildObesityPlan(p50, []);
  check("Caso 50: obesidad + antipsicótico alto riesgo -> prioriza Tirzepatida dosis-obesidad", hasId(r50.plan, "TIRZ_OB"), r50.plan);

  const p51 = { tas: 145, tad: 92, egfr: 40, uacr: 50, medicacionActual: { otros: [{ id: "LITIO" }] } };
  const r51 = buildHTNPlan(p51);
  check("Caso 51: litio + necesidad de RAAS (ERC) -> bloquea IECA/ARA-II, usa BCC-DHP", !r51.plan.some((x) => ["LOSA", "TELM", "ENAL", "LISI", "RAMI"].includes(x.id)) && hasId(r51.plan, "AMLO"), r51.plan);
  check("Caso 51: no ofrece 2 BCC-DHP como pseudo-combinación (fix del hueco Etapa 2)", r51.plan.filter((x) => x.id === "AMLO" || x.id === "NIFE").length <= 1, r51.plan);
  const p51activo = { tas: 135, tad: 85, medicacionActual: { htn: [{ id: "LOSA", isMax: true }], otros: [{ id: "LITIO" }] } };
  const r51activo = buildHTNPlan(p51activo);
  check("Caso 51: Losartan YA prescrito + litio nuevo -> REVALORAR/SUSPENDER", r51activo.plan.find((x) => x.id === "LOSA")?.dose === "REVALORAR / SUSPENDER", r51activo.plan);
}

console.log("\n" + "=".repeat(90));
console.log("DOMINIO 5 — TARV/VIH (caso 54)");
console.log("=".repeat(90));
{
  const r54 = buildLipidPlan({ ldl: 145, preventAscvd10: 15, edad: 55, medicacionActual: { otros: [{ id: "RITON" }] } });
  check("Caso 54: riesgo alto + TARV IP -> evita Atorvastatina, prefiere Rosuvastatina", hasId(r54.plan, "ROSU") && !hasId(r54.plan, "ATOR"), r54.plan);
  const r54sinTarv = buildLipidPlan({ ldl: 145, preventAscvd10: 15, edad: 55 });
  check("Control: mismo perfil sin TARV -> puede elegir Atorvastatina normalmente", hasId(r54sinTarv.plan, "ATOR"), r54sinTarv.plan);
  const r54simva = buildLipidPlan({ ldl: 110, medicacionActual: { lipid: [{ id: "SIMVA", isMax: true }], otros: [{ id: "RITON" }] } });
  check("Caso 54: Simvastatina ya prescrita + TARV IP -> REVALORAR/SUSPENDER (bloqueo absoluto)", r54simva.plan.find((x) => x.id === "SIMVA")?.dose === "REVALORAR / SUSPENDER", r54simva.plan);
}

console.log("\n" + "=".repeat(90));
console.log("DOMINIO 6 — SICK DAY RULES (caso 56)");
console.log("=".repeat(90));
{
  const p56 = { enfermedadAguda: true, medicacionActual: { antidiabetic: [{ id: "MET", isMax: true }, { id: "DAPA", isMax: true }], htn: [{ id: "ENAL", isMax: true }] } };
  const r56 = buildTreatmentPlan(p56);
  check("Caso 56: enfermedad aguda + Metformina/iSGLT2/IECA -> sugiere suspensión temporal", hasId(r56.items, "SICK_DAY_SUSPEND"), r56.items);
  const r56sinEnfermedad = buildTreatmentPlan({ ...p56, enfermedadAguda: false });
  check("Caso 56: sin enfermedad aguda -> NO se activa", !hasId(r56sinEnfermedad.items, "SICK_DAY_SUSPEND"), r56sinEnfermedad.items);
  const r56sinFarmacos = buildTreatmentPlan({ enfermedadAguda: true, medicacionActual: { htn: [{ id: "AMLO", isMax: true }] } });
  check("Caso 56: enfermedad aguda sin fármacos relevantes -> NO se activa", !hasId(r56sinFarmacos.items, "SICK_DAY_SUSPEND"), r56sinFarmacos.items);
}

console.log("\n" + "=".repeat(90));
console.log(`Total: ${pass + fail} verificaciones | ${pass} PASS | ${fail} FAIL`);
console.log("=".repeat(90));
if (fail > 0) process.exit(1);
