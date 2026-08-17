import { buildPKCurve } from "../js/pk-curves.js";

let pass = 0, fail = 0;
function check(desc, cond, detail) {
  if (cond) { pass++; console.log(`PASS — ${desc}`); }
  else { fail++; console.log(`FAIL — ${desc}\n      -> ${JSON.stringify(detail)}`); }
}
function peakHour(curve) {
  return curve.reduce((best, p) => (p.level > best.level ? p : best), curve[0]).h;
}

console.log("=".repeat(90));
console.log("CURVAS PK/PD (24h) — EndoFarma (Dr. Ortega, 11-ago-2026)");
console.log("=".repeat(90));

// Cobertura: 49 puntos (0 a 24h cada 0.5h), normalizado 0-100.
{
  const c = buildPKCurve({ id: "MET", grp: "Biguanidas", vidaMediaHoras: 5 });
  check("49 puntos exactos (0 a 24h cada 0.5h)", c.length === 49, c.length);
  check("Empieza en h=0 y termina en h=24", c[0].h === 0 && c[48].h === 24, [c[0].h, c[48].h]);
  check("Pico normalizado a 100", Math.max(...c.map((p) => p.level)) === 100, Math.max(...c.map((p) => p.level)));
  check("Nunca negativo", c.every((p) => p.level >= 0), c.filter((p) => p.level < 0));
}

// Insulina rápida (Lispro/Aspart/Regular): pico temprano y corto, casi 0 a las 24h.
{
  const c = buildPKCurve({ id: "LISPRO", grp: "Insulina Prandial", vidaMediaHoras: 1 });
  check("Insulina rápida: pico dentro de las primeras 2h", peakHour(c) <= 2, peakHour(c));
  check("Insulina rápida: nivel cerca de 0 a las 24h (acción corta)", c[48].level < 5, c[48].level);
}

// Insulina NPH: pico intermedio documentado (~4-8h) — grupo "Insulina Basal"
// pero con override específico porque el propio pharma-db.js ya describe
// su pico marcado (a diferencia de Glargina/Degludec/Detemir).
{
  const c = buildPKCurve({ id: "NPH", grp: "Insulina Basal", vidaMediaHoras: 6 });
  check("NPH: pico entre 4 y 8h (documentado en pharma-db.js)", peakHour(c) >= 4 && peakHour(c) <= 8, peakHour(c));
}

// Insulina basal plana (Glargina/Degludec/Detemir): sin pico marcado, sigue
// elevada hacia el final del día — override por id, no por grupo.
{
  const glar = buildPKCurve({ id: "GLAR", grp: "Insulina Basal", vidaMediaHoras: 12 });
  const nph = buildPKCurve({ id: "NPH", grp: "Insulina Basal", vidaMediaHoras: 6 });
  check("Glargina (mismo grupo que NPH) NO usa el pico marcado de NPH — override por id funciona",
    peakHour(glar) > peakHour(nph), { glar: peakHour(glar), nph: peakHour(nph) });
  check("Glargina: nivel sigue alto (>50) a las 24h — acción plana prolongada", glar[48].level > 50, glar[48].level);
}

// Inyectable semanal (Semaglutida/Tirzepatida): vida media de días -> casi
// sin declive perceptible dentro de 24h (consecuencia natural de ke pequeño,
// no un caso especial forzado).
{
  const c = buildPKCurve({ id: "SEMA", grp: "GLP-1 RA", vidaMediaHoras: 168 });
  check("GLP-1 semanal: nivel a las 24h sigue muy alto (>85) — vida media de días domina sobre la ventana de 24h", c[48].level > 85, c[48].level);
}

// GLP-1 diario (Liraglutida) vs semanal (Semaglutida) dentro del MISMO grp
// "GLP-1 RA" -> deben distinguirse por override de id, no comportarse igual.
{
  const lira = buildPKCurve({ id: "LIRA", grp: "GLP-1 RA", vidaMediaHoras: 13 });
  const sema = buildPKCurve({ id: "SEMA", grp: "GLP-1 RA", vidaMediaHoras: 168 });
  check("Liraglutida (diaria) declina más que Semaglutida (semanal) en 24h pese a compartir grp",
    lira[48].level < sema[48].level, { lira: lira[48].level, sema: sema[48].level });
}

// Fármaco sin vidaMediaHoras capturado -> no debe tronar (usa default interno).
{
  const c = buildPKCurve({ id: "X", grp: "Biguanidas" });
  check("Sin vidaMediaHoras -> no truena, usa default razonable", Array.isArray(c) && c.length === 49, c.length);
}

console.log("\n" + "=".repeat(90));
console.log(`Total: ${pass + fail} verificaciones | ${pass} PASS | ${fail} FAIL`);
console.log("=".repeat(90));
if (fail > 0) process.exit(1);
