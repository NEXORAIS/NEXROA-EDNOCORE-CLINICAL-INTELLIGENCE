import { evaluateBoundaryZones } from "../js/boundary-alerts.js";

let pass = 0, fail = 0;
function check(desc, cond, detail) {
  if (cond) { pass++; console.log(`PASS — ${desc}`); }
  else { fail++; console.log(`FAIL — ${desc}\n      -> ${JSON.stringify(detail)}`); }
}
const ids = (zones) => zones.map((z) => z.id);

console.log("=".repeat(90));
console.log("ZONAS LÍMITE — 'DEBE REEVALUARSE SU PRESCRIPCIÓN' (Dr. Ortega, tabla confirmada 11-ago-2026)");
console.log("=".repeat(90));

// --- eGFR: cr=2.2/edad60/sexo H -> eGFR≈33 (borde superior banda 30) ---
{
  const r = evaluateBoundaryZones({ creatinina: 2.2, edad: 60, sexo: "H" });
  check("eGFR≈33 (cr=2.2) -> dispara zona egfr_30", ids(r).includes("egfr_30"), r);
  check("eGFR≈33 -> NO dispara egfr_45/60/25 a la vez", !ids(r).includes("egfr_45") && !ids(r).includes("egfr_60") && !ids(r).includes("egfr_25"), r);
}
// --- eGFR≈43 (cr=1.8) -> banda 45 ---
{
  const r = evaluateBoundaryZones({ creatinina: 1.8, edad: 60, sexo: "H" });
  check("eGFR≈43 (cr=1.8) -> dispara zona egfr_45", ids(r).includes("egfr_45"), r);
}
// --- eGFR≈63 (cr=1.3) -> banda 60 ---
{
  const r = evaluateBoundaryZones({ creatinina: 1.3, edad: 60, sexo: "H" });
  check("eGFR≈63 (cr=1.3) -> dispara zona egfr_60", ids(r).includes("egfr_60"), r);
}
// --- eGFR≈26 (cr=2.7) -> banda 25 ---
{
  const r = evaluateBoundaryZones({ creatinina: 2.7, edad: 60, sexo: "H" });
  check("eGFR≈26 (cr=2.7) -> dispara zona egfr_25", ids(r).includes("egfr_25"), r);
}
// --- eGFR claramente fuera de toda banda (control negativo) ---
{
  const r1 = evaluateBoundaryZones({ creatinina: 1.0, edad: 60, sexo: "H" }); // eGFR≈86
  check("eGFR≈86 (control, función renal normal) -> ninguna zona eGFR activa", !ids(r1).some((id) => id.startsWith("egfr_")), r1);
  const r2 = evaluateBoundaryZones({ creatinina: 4.0, edad: 60, sexo: "H" }); // eGFR≈16, bajo TODAS las bandas
  check("eGFR≈16 (ERC terminal, muy por debajo de toda banda) -> ninguna zona eGFR activa", !ids(r2).some((id) => id.startsWith("egfr_")), r2);
}
// --- Sin datos suficientes para calcular eGFR -> no debe tronar ni disparar nada ---
{
  const r = evaluateBoundaryZones({});
  check("Sin datos -> evaluateBoundaryZones no truena y regresa lista vacía", Array.isArray(r) && r.length === 0, r);
}

console.log("\n" + "-".repeat(90));

// --- LDL cerca de 190 ---
{
  const rDentro = evaluateBoundaryZones({ ldl: 185 });
  check("LDL 185 -> dispara zona ldl_190", ids(rDentro).includes("ldl_190"), rDentro);
  const rFuera = evaluateBoundaryZones({ ldl: 150 });
  check("LDL 150 (control) -> NO dispara ldl_190", !ids(rFuera).includes("ldl_190"), rFuera);
  const rArriba = evaluateBoundaryZones({ ldl: 250 });
  check("LDL 250 (muy por encima, ya clasificado sin ambigüedad) -> NO dispara ldl_190", !ids(rArriba).includes("ldl_190"), rArriba);
}

// --- A1c cerca de 8% ---
{
  const rDentro = evaluateBoundaryZones({ hba1c: 8.0 });
  check("A1c 8.0% (justo en el corte) -> dispara zona a1c_8", ids(rDentro).includes("a1c_8"), rDentro);
  const rFuera = evaluateBoundaryZones({ hba1c: 6.5 });
  check("A1c 6.5% (control) -> NO dispara a1c_8", !ids(rFuera).includes("a1c_8"), rFuera);
}

// --- uACR cerca de 30 ---
{
  const rDentro = evaluateBoundaryZones({ uacr: 32 });
  check("uACR 32 mg/g -> dispara zona uacr_30", ids(rDentro).includes("uacr_30"), rDentro);
  const rFuera = evaluateBoundaryZones({ uacr: 10 });
  check("uACR 10 mg/g (control, normal) -> NO dispara uacr_30", !ids(rFuera).includes("uacr_30"), rFuera);
}

// --- Corticoide cerca de 20 (banda asimétrica 15-19.99) ---
{
  const rDentro = evaluateBoundaryZones({ corticoideDosis: 17 });
  check("Corticoide 17 mg/día -> dispara zona cortico_20", ids(rDentro).includes("cortico_20"), rDentro);
  const rEnCorte = evaluateBoundaryZones({ corticoideDosis: 20 });
  check("Corticoide exactamente 20 mg/día (ya clasificado ALTO sin ambigüedad) -> NO dispara cortico_20 (banda asimétrica, solo bajo el corte)", !ids(rEnCorte).includes("cortico_20"), rEnCorte);
  const rBajo = evaluateBoundaryZones({ corticoideDosis: 5 });
  check("Corticoide 5 mg/día (control, dosis baja) -> NO dispara cortico_20", !ids(rBajo).includes("cortico_20"), rBajo);
}

console.log("\n" + "=".repeat(90));
console.log(`Total: ${pass + fail} verificaciones | ${pass} PASS | ${fail} FAIL`);
console.log("=".repeat(90));
if (fail > 0) process.exit(1);
