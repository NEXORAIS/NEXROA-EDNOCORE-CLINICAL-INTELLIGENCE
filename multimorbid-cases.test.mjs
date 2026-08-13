/* --- CASOS MULTIMÓRBIDOS ESCALONADOS (pacientes "fuera de la media") ---
 * 4 pacientes con DM2 mal controlada + obesidad, subiendo comorbilidades,
 * severidad de dislipidemia y grado de HTA en cada escalón — exactamente la
 * serie que pidió el Dr. Ortega para ver si el motor consolida y prioriza
 * bien cuando MUCHAS banderas están activas a la vez, no solo 1 a la vez
 * como en la batería anterior (tests/clinical-cases.test.mjs).
 * Uso: node tests/multimorbid-cases.test.mjs
 */
import { buildTreatmentPlan, getPatientFlags, calcEGFR, calcFIB4, calcIMC, classifyLipidRisk } from "../js/calculations.js";
import { classifyABCD, deriveOrcdFromFlags, classifyFIB4, classifyBP } from "../js/individualization.js";
import { DB_PHARMA } from "../js/pharma-db.js";

const dbById = Object.fromEntries(DB_PHARMA.map((f) => [f.id, f]));

const CASES = [
  {
    id: "Caso 1",
    label: "DM2 mal controlada (A1c 7.6%) + Obesidad + 1 comorbilidad (MASLD) + Dislipidemia moderada + sin HTA",
    p: { edad: 48, sexo: "M", peso: 92, talla: 168, tas: 122, tad: 78, hba1c: 7.6,
      ldl: 145, trigliceridos: 180, col_total: 220, hdl: 42,
      creatinina: 0.9, ast: 30, alt: 28, plaquetas: 240,
      comorbilidades: ["MASLD"], antecedentesFamiliares: [], nivelAcceso: "medio", medicacionActual: {} },
  },
  {
    id: "Caso 2",
    label: "DM2 mal controlada (A1c 7.9%) + Obesidad + 2 comorbilidades (MASLD+SAOS) + Dislipidemia moderada + HTA Grado I",
    p: { edad: 52, sexo: "H", peso: 98, talla: 170, tas: 135, tad: 85, hba1c: 7.9,
      ldl: 150, trigliceridos: 200, col_total: 230, hdl: 40,
      creatinina: 0.95, ast: 32, alt: 30, plaquetas: 230, uacr: 15,
      comorbilidades: ["MASLD", "SAOS"], antecedentesFamiliares: [], nivelAcceso: "medio", medicacionActual: {} },
  },
  {
    id: "Caso 3",
    label: "DM2 mal controlada (A1c 9.2%) + Obesidad + 3 comorbilidades (MASLD+SAOS+ERC) + Dislipidemia severa + HTA Grado II",
    p: { edad: 60, sexo: "M", peso: 95, talla: 162, tas: 152, tad: 96, hba1c: 9.2,
      ldl: 175, trigliceridos: 220, col_total: 260, hdl: 38,
      creatinina: 1.5, ast: 35, alt: 33, plaquetas: 210, uacr: 150,
      comorbilidades: ["MASLD", "SAOS", "ERC"], antecedentesFamiliares: [], nivelAcceso: "medio", medicacionActual: {} },
  },
  {
    id: "Caso 4",
    label: "DM2 mal controlada (A1c 10.5%) + Obesidad + >3 comorbilidades (MASLD+SAOS+ERC+IC+ASCVD) + Dislipidemia muy alta + HTA Grado II — paciente atípico/outlier",
    p: { edad: 64, sexo: "H", peso: 110, talla: 170, tas: 168, tad: 104, hba1c: 10.5,
      ldl: 190, trigliceridos: 260, col_total: 290, hdl: 34,
      creatinina: 1.8, ast: 40, alt: 38, plaquetas: 190, uacr: 300, vctLsm: 9.5,
      comorbilidades: ["MASLD", "SAOS", "ERC", "IC", "IAM_ANGINA"], antecedentesFamiliares: [], nivelAcceso: "medio", medicacionActual: {} },
  },
];

let pass = 0, fail = 0;
function check(caseId, desc, condition, detail) {
  const ok = !!condition;
  if (ok) pass++; else fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"} — ${desc}${ok ? "" : `  [${detail}]`}`);
}

/** Ninguna categoría del plan debe repetir el mismo subgrupo farmacológico
 * más de una vez (esa es exactamente la forma del bug de consolidación que
 * encontró el Dr. Ortega con el Caso 4 — dos SGLT2i distintos a la vez). */
function noDuplicateGroupsWithinCategory(items, dbById) {
  const seenByCat = {};
  for (const it of items) {
    const grp = dbById[it.id]?.grp;
    if (!grp) continue;
    const key = `${it.categoria}:${grp}`;
    seenByCat[key] = (seenByCat[key] || 0) + 1;
  }
  return Object.entries(seenByCat).filter(([, n]) => n > 1);
}

for (const c of CASES) {
  const { p } = c;
  const flags = getPatientFlags(p);
  const egfr = calcEGFR(p);
  const imc = calcIMC(p);
  const fib4 = calcFIB4(p);
  const fib4Class = classifyFIB4(fib4, p.edad, p.vctLsm ?? null);
  const bp = classifyBP(p.tas, p.tad);
  const lipidRisk = classifyLipidRisk(p);
  const orcd = deriveOrcdFromFlags(flags);
  const abcd = classifyABCD(orcd, flags.obesidad);
  const { items, dmNote } = buildTreatmentPlan(p);

  console.log("\n" + "=".repeat(90));
  console.log(`${c.id}: ${c.label}`);
  console.log("=".repeat(90));
  console.log(`Banderas activas: ${Object.entries(flags).filter(([k, v]) => v === true).map(([k]) => k).join(", ") || "ninguna"}`);
  console.log(`IMC=${imc} | eGFR=${egfr} | FIB-4=${fib4} (${fib4Class.texto}) | BP=${bp.valor} (${bp.texto}) | Riesgo lipídico=${lipidRisk.label} (meta LDL<${lipidRisk.target}) | ABCD=${abcd.valor} (${abcd.texto})`);
  if (dmNote) console.log(`NOTA: ${dmNote}`);
  console.log(`\nPlan de tratamiento consolidado (${items.length} líneas):`);
  const byCat = { antidiabetic: [], htn: [], lipid: [] };
  items.forEach((it) => byCat[it.categoria]?.push(it));
  ["antidiabetic", "htn", "lipid"].forEach((cat) => {
    if (!byCat[cat].length) return;
    console.log(`  [${cat.toUpperCase()}]`);
    byCat[cat].forEach((it) => console.log(`    - ${it.drug} (${it.dose}) — ${it.reason}`));
  });

  console.log(`\nVerificaciones:`);
  check(c.id, "el motor no truena con múltiples comorbilidades simultáneas (sin excepción)", true, "");
  const dupes = noDuplicateGroupsWithinCategory(items, dbById);
  check(c.id, "ningún subgrupo farmacológico se repite dentro de la misma categoría (sin redundancia tipo Caso 4)",
    dupes.length === 0, JSON.stringify(dupes));
  check(c.id, "Metformina siempre presente como base de terapia (salvo eGFR<30)",
    items.some((it) => it.drug === "Metformina") || egfr < 30, `eGFR=${egfr}`);
  if (c.id === "Caso 4") {
    check(c.id, "A1c 10.5% -> dispara nota de insulina basal simultánea",
      !!dmNote && dmNote.includes("insulina"), dmNote);
    check(c.id, "riesgo lipídico MUY ALTO (ASCVD) -> meta LDL <55",
      lipidRisk.target === 55, `target=${lipidRisk.target}`);
  }
}

console.log("\n" + "=".repeat(90));
console.log(`Total verificaciones: ${pass + fail} | ${pass} PASS | ${fail} FAIL`);
if (fail > 0) process.exitCode = 1;
