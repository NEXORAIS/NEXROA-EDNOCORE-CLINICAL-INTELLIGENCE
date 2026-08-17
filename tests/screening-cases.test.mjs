/* --- BATERÍA DE CASOS: ENDOSCREEN (tamizaje de complicaciones crónicas) ---
 * Corre las funciones REALES de js/screening.js (computeScreeningItems,
 * getAniosConDM) contra pacientes sintéticos, verificando la regla clínica
 * central (ADA Standards of Care 2026): DM2 tamiza desde el diagnóstico,
 * DM1 tamiza desde los 5 años — más los intervalos de pie diabético
 * (6 vs 12 meses según riesgo) y riesgo CV.
 * Uso: node tests/screening-cases.test.mjs   (desde la raíz del proyecto)
 */
import { computeScreeningItems, getAniosConDM } from "../js/screening.js";

let pass = 0, fail = 0;
const results = [];

function check(caseId, desc, condition, detail) {
  const ok = !!condition;
  if (ok) pass++; else fail++;
  results.push({ caseId, desc, ok, detail });
}

function findItem(items, key) {
  return items.find((i) => i.key === key);
}

/** Fecha (YYYY-MM-DD) hace exactamente `dias` días, relativa a hoy. */
function fechaHace(dias) {
  const d = new Date(Date.now() - dias * 24 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}

/* ============ S. GETANIOSCONDM ============ */

// S1: prioriza fecha exacta sobre años aproximados cuando ambos existen
{
  const p = { fechaDxDM: fechaHace(3653), aniosDxDM: 999 }; // ~10 años exactos
  const anios = getAniosConDM(p);
  check("S1", "getAniosConDM prioriza fecha exacta sobre años aproximados",
    anios !== null && Math.abs(anios - 10) < 0.2, `anios=${anios}`);
}

// S2: usa años aproximados como respaldo si no hay fecha
{
  const p = { fechaDxDM: "", aniosDxDM: 6 };
  const anios = getAniosConDM(p);
  check("S2", "getAniosConDM usa años aproximados si no hay fecha", anios === 6, `anios=${anios}`);
}

// S3: sin fecha ni años -> null (no inventar un valor)
{
  const p = {};
  check("S3", "getAniosConDM regresa null sin datos de duración", getAniosConDM(p) === null, `anios=${getAniosConDM(p)}`);
}

/* ============ DM2 — tamizaje debe iniciar AL DIAGNÓSTICO ============ */

// D1: DM2 recién diagnosticado (0 años) -> retinopatía/nefropatía/neuropatía YA
// corresponden (no "no_indicado"), sin registro previo -> "indicado_sin_registro"
{
  const p = { tipoDM: "DM2", fechaDxDM: fechaHace(1) };
  const { items } = computeScreeningItems(p);
  const ret = findItem(items, "retinopatia");
  const nef = findItem(items, "nefropatia");
  const neu = findItem(items, "neuropatia");
  check("D1", "DM2 día 1 -> retinopatía/nefropatía/neuropatía YA indicadas (no esperan 5 años)",
    ret.estado === "indicado_sin_registro" && nef.estado === "indicado_sin_registro" && neu.estado === "indicado_sin_registro",
    `ret=${ret.estado}, nef=${nef.estado}, neu=${neu.estado}`);
}

// D2: DM2 con retinopatía tamizada hace 3 meses -> al día
{
  const p = { tipoDM: "DM2", fechaDxDM: fechaHace(1000), screeningLog: { retinopatia: fechaHace(90) } };
  const { items } = computeScreeningItems(p);
  const ret = findItem(items, "retinopatia");
  check("D2", "DM2 con tamizaje de retinopatía hace 3 meses -> al día", ret.estado === "al_dia", `estado=${ret.estado}, detalle=${JSON.stringify(ret)}`);
}

// D3: DM2 con nefropatía tamizada hace 20 meses (>12) -> atrasado
{
  const p = { tipoDM: "DM2", fechaDxDM: fechaHace(1000), screeningLog: { nefropatia: fechaHace(610) } };
  const { items } = computeScreeningItems(p);
  const nef = findItem(items, "nefropatia");
  check("D3", "DM2 con nefropatía tamizada hace ~20 meses -> atrasado", nef.estado === "atrasado", `estado=${nef.estado}, detalle=${JSON.stringify(nef)}`);
}

/* ============ DM1 — tamizaje de retinopatía/nefropatía/neuropatía a los 5 años ============ */

// D4: DM1 con 2 años de evolución -> retinopatía/nefropatía/neuropatía "no_indicado"
{
  const p = { tipoDM: "DM1", aniosDxDM: 2 };
  const { items } = computeScreeningItems(p);
  const ret = findItem(items, "retinopatia");
  const nef = findItem(items, "nefropatia");
  const neu = findItem(items, "neuropatia");
  check("D4", "DM1 con 2 años -> retinopatía/nefropatía/neuropatía AÚN NO indicadas (regla 5 años)",
    ret.estado === "no_indicado" && nef.estado === "no_indicado" && neu.estado === "no_indicado" && ret.faltanAnios === 3,
    `ret=${JSON.stringify(ret)}`);
}

// D5: DM1 con exactamente 5 años -> YA corresponde (límite inclusivo)
{
  const p = { tipoDM: "DM1", aniosDxDM: 5 };
  const { items } = computeScreeningItems(p);
  const ret = findItem(items, "retinopatia");
  check("D5", "DM1 con exactamente 5 años -> corresponde tamizaje (límite inclusivo)", ret.estado === "indicado_sin_registro", `estado=${ret.estado}`);
}

// D6: DM1 con 4.9 años -> aún no corresponde (justo bajo el límite)
{
  const p = { tipoDM: "DM1", aniosDxDM: 4.9 };
  const { items } = computeScreeningItems(p);
  const ret = findItem(items, "retinopatia");
  check("D6", "DM1 con 4.9 años -> aún NO corresponde (justo bajo el límite)", ret.estado === "no_indicado", `estado=${ret.estado}`);
}

// D7: DM1 con 2 años -> pie diabético y riesgo CV SÍ corresponden ya (no aplica regla de 5 años)
{
  const p = { tipoDM: "DM1", aniosDxDM: 2 };
  const { items } = computeScreeningItems(p);
  const pie = findItem(items, "pie");
  const cv = findItem(items, "riesgoCV");
  check("D7", "DM1 con 2 años -> pie diabético y riesgo CV YA corresponden (sin regla de 5 años)",
    pie.estado === "indicado_sin_registro" && cv.estado === "indicado_sin_registro",
    `pie=${pie.estado}, cv=${cv.estado}`);
}

/* ============ PIE DIABÉTICO — intervalo 6 vs 12 meses según riesgo ============ */

// D8: paciente de alto riesgo de pie (neuropatía periférica) con último examen
// hace 8 meses -> atrasado en PIE (intervalo 6m) pero AL DÍA en riesgoCV (intervalo 12m)
{
  const p = {
    tipoDM: "DM2", fechaDxDM: fechaHace(2000),
    comorbilidades: ["NEUROPATIA_PERIFERICA"],
    screeningLog: { pie: fechaHace(240), riesgoCV: fechaHace(240) }, // ~8 meses
  };
  const { items, altoRiesgoPie } = computeScreeningItems(p);
  const pie = findItem(items, "pie");
  const cv = findItem(items, "riesgoCV");
  check("D8", "Alto riesgo de pie + examen hace ~8 meses -> PIE atrasado (intervalo 6m) pero riesgoCV al día (intervalo 12m)",
    altoRiesgoPie === true && pie.estado === "atrasado" && cv.estado === "al_dia",
    `altoRiesgoPie=${altoRiesgoPie}, pie=${pie.estado}, cv=${cv.estado}`);
}

// D9: mismo escenario SIN el flag de alto riesgo -> pie con intervalo 12m -> al día
{
  const p = {
    tipoDM: "DM2", fechaDxDM: fechaHace(2000),
    comorbilidades: [],
    screeningLog: { pie: fechaHace(240) },
  };
  const { items, altoRiesgoPie } = computeScreeningItems(p);
  const pie = findItem(items, "pie");
  check("D9", "Sin alto riesgo de pie + examen hace ~8 meses -> PIE al día (intervalo 12m)",
    altoRiesgoPie === false && pie.estado === "al_dia", `altoRiesgoPie=${altoRiesgoPie}, pie=${pie.estado}`);
}

/* ============ SIN DATOS ============ */

// D10: sin tipoDM ni duración capturada -> todos los ítems "sin_dato" (no inventar estado)
{
  const p = {};
  const { items, aniosDM } = computeScreeningItems(p);
  check("D10", "Sin antecedente diabetológico -> todos los ítems 'sin_dato' (no se inventa un estado)",
    aniosDM === null && items.every((i) => i.estado === "sin_dato"),
    `aniosDM=${aniosDM}, estados=${items.map((i) => i.estado).join(",")}`);
}

/* ============ RESULTADOS ============ */

console.log(`\n=== ENDOSCREEN: ${pass} pasaron, ${fail} fallaron (de ${pass + fail}) ===\n`);
results.forEach((r) => {
  console.log(`[${r.ok ? "OK" : "FALLO"}] ${r.caseId}: ${r.desc}${r.ok ? "" : `  <-- ${r.detail}`}`);
});
if (fail > 0) process.exit(1);
