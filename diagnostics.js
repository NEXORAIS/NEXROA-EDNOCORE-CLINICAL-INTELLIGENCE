/* --- ENDODIAGNOSTICS: Lista consolidada de diagnósticos del paciente ---
 * Sección nueva, independiente (12-ago-2026, a petición del Dr. Ortega:
 * "al final de que todo esté detectado y clasificado, poner todos los
 * diagnósticos del paciente en lista, con íconos referentes al
 * padecimiento") — mismo patrón que EndoScreen/EndoInsulin: NO modifica
 * calculations.js/individualization.js/render.js de forma sustantiva (solo
 * un import + una línea en renderAll), no toca ningún motor de decisión.
 *
 * Es deliberadamente el ÚLTIMO punto del sidebar: reúne en un solo lugar
 * dos fuentes que hasta ahora vivían separadas —
 *   1) Comorbilidades marcadas explícitamente por el médico en Ingreso
 *      Clínico (checkboxes de Sección 4).
 *   2) Diagnósticos que el motor DERIVA de los cálculos pero que no tienen
 *      checkbox propio: Diabetes/Prediabetes (tipoDM), Hipertensión
 *      Arterial (clasificación AHA/ACC 2025), Dislipidemia (clasificación
 *      de riesgo lipídico), trastornos hidroelectrolíticos (ver
 *      individualization.js, agregado en esta misma sesión), y el estadio
 *      real de ERC/MASLD/Obesidad cuando hay datos calculados de por medio.
 *
 * Para evitar una entrada duplicada del mismo padecimiento (ej. "ERC" del
 * checkbox Y "ERC" del eGFR calculado), ERC/MASLD/Obesidad se funden en UNA
 * sola entrada que se activa por CUALQUIERA de las dos señales y muestra el
 * detalle calculado cuando existe.
 *
 * Deliberadamente EXCLUIDOS de esta lista (no son "diagnósticos" en sí,
 * son antecedentes de seguridad farmacológica o una posibilidad, no un
 * estado actual): ANGIOEDEMA_IECA, TOS_IECA, HIPOGLUCEMIA_PERSONAL,
 * EMBARAZO_POSIBLE.
 */
import * as calc from "./calculations.js";
import {
  classifyBP,
  classifyEGFR,
  classifyFIB4,
  classifyABCD,
  deriveOrcdFromFlags,
  classifySodio,
  classifyPotasio,
  classifyCalcio,
  classifyFosforo,
  classifyMagnesio,
  classifyCKM,
} from "./individualization.js";

const COMORB_DIAGNOSIS_META = {
  IC: { label: "Insuficiencia Cardíaca", icon: "heart", color: "red" },
  IAM_ANGINA: { label: "Enfermedad Coronaria", icon: "heart-pulse", color: "red" },
  EVC_AIT: { label: "Enfermedad Cerebrovascular", icon: "brain", color: "red" },
  EAP: { label: "Enfermedad Arterial Periférica", icon: "footprints", color: "red" },
  SAOS: { label: "SAOS (Apnea Obstructiva del Sueño)", icon: "moon", color: "indigo" },
  OSTEOARTRITIS: { label: "Osteoartritis", icon: "bone", color: "stone" },
  PANCREATITIS: { label: "Pancreatitis Previa", icon: "flame", color: "orange" },
  GASTROPARESIA: { label: "Gastroparesia", icon: "utensils", color: "amber" },
  EMBARAZO_ACTUAL: { label: "Embarazo Actual", icon: "baby", color: "rose" },
};

const ZONA_COLOR = { rojo: "red", naranja: "orange", amarillo: "amber", verde: "emerald", gris: "slate" };

/** Lógica pura (sin DOM) — testeable directamente, mismo patrón que
 * computeScreeningItems en screening.js. */
export function computeDiagnosticsList(p) {
  const patient = p || {};
  const comorb = patient.comorbilidades || [];
  const list = [];

  // 1) Diabetes Mellitus / Prediabetes (tipoDM, sin checkbox propio)
  if (patient.tipoDM === "DM1" || patient.tipoDM === "DM2") {
    const a1c = calc.getA1cEfectiva(patient);
    list.push({
      id: "diabetes",
      label: patient.tipoDM === "DM1" ? "Diabetes Mellitus Tipo I" : "Diabetes Mellitus Tipo II",
      icon: "droplet", color: "sky",
      detalle: a1c.value !== null && a1c.value !== undefined ? `A1c ${a1c.value}% (${a1c.source === "medida" ? "medida" : "estimada"})` : "Sin A1c capturada",
    });
  } else if (patient.tipoDM === "Prediabetes") {
    list.push({ id: "prediabetes", label: "Prediabetes", icon: "droplet", color: "amber", detalle: "ADA Standards of Care 2026" });
  }

  // 2) Hipertensión Arterial (derivada de la clasificación AHA/ACC 2025 —
  // "Elevada" NO cuenta como diagnóstico de HTA por definición de la guía,
  // solo Etapa 1 en adelante).
  const bp = classifyBP(patient.tas, patient.tad);
  if (bp.valor !== null && bp.texto !== "Normal" && bp.texto !== "Elevada") {
    list.push({
      id: "hta", label: `Hipertensión Arterial — ${bp.texto}`, icon: "heart-pulse", color: ZONA_COLOR[bp.zona] || "orange",
      detalle: `TA actual ${patient.tas}/${patient.tad} mmHg`,
    });
  }

  // 3) Dislipidemia (derivada — el motor indica estatina cuando hay
  // dislipidemia clínicamente relevante, `statinIndicated` es la señal).
  const lipid = calc.classifyLipidRisk(patient);
  if (lipid && lipid.statinIndicated) {
    list.push({
      id: "dislipidemia", label: `Dislipidemia — Riesgo ${lipid.label}`, icon: "flask-conical",
      color: lipid.label === "MUY ALTO" || lipid.label === "ALTO" ? "red" : lipid.label === "MODERADO" || lipid.label === "LIMITROFE" ? "amber" : "emerald",
      detalle: `LDL ${patient.ldl || "--"} mg/dL — meta <${lipid.target} mg/dL`,
    });
  }

  // 4) Enfermedad Renal Crónica — checkbox O eGFR<60, fusionados en una sola
  // entrada para no duplicar el mismo diagnóstico dos veces en la lista.
  const egfr = calc.calcEGFR(patient);
  const ercPorEgfr = egfr !== null && egfr !== undefined && egfr < 60;
  if (comorb.includes("ERC") || ercPorEgfr) {
    const egfrClass = classifyEGFR(egfr, patient.uacr || null);
    list.push({
      id: "erc", label: "Enfermedad Renal Crónica", icon: "filter", color: ZONA_COLOR[egfrClass.zona] || "blue",
      detalle: egfr !== null && egfr !== undefined ? `eGFR ${egfr} mL/min/1.73m² — ${egfrClass.texto}` : "Marcada como comorbilidad (eGFR aún no calculable)",
    });
  }

  // 5) MASLD / Hígado Graso Metabólico — checkbox O FIB-4 en o sobre el
  // corte ajustado por edad (mismo corte que usa individualization.js).
  const fib4 = calc.calcFIB4(patient);
  const fib4Cutoff = Number(patient.edad) >= 65 ? 2.0 : 1.3;
  const masldPorFib4 = fib4 !== null && fib4 !== undefined && fib4 >= fib4Cutoff;
  if (comorb.includes("MASLD") || masldPorFib4) {
    const fib4Class = classifyFIB4(fib4, patient.edad, patient.vctLsm ?? null);
    list.push({
      id: "masld", label: "MASLD (Hígado Graso Metabólico)", icon: "activity", color: ZONA_COLOR[fib4Class.zona] || "emerald",
      detalle: fib4 !== null && fib4 !== undefined ? `FIB-4 ${fib4.toFixed ? fib4.toFixed(2) : fib4} — ${fib4Class.texto}` : "Marcada como comorbilidad",
    });
  }

  // 6) Obesidad — checkbox O criterio de IMC/comorbilidad (flags.obesidad,
  // ya centralizado en calculations.js), con su estadio AACE ABCD.
  const flags = calc.getPatientFlags(patient);
  const imc = calc.calcIMC(patient);
  if (flags.obesidad) {
    const abcd = classifyABCD(deriveOrcdFromFlags(flags), true);
    list.push({
      id: "obesidad", label: `Obesidad — ${abcd.valor || "Estadio 0"} (AACE ABCD)`, icon: "scale", color: ZONA_COLOR[abcd.zona] || "amber",
      detalle: imc !== null && imc !== undefined ? `IMC ${imc}` : "",
    });
  }

  // 7) Resto de comorbilidades marcadas 1:1 (sin contraparte calculada).
  Object.keys(COMORB_DIAGNOSIS_META).forEach((code) => {
    if (comorb.includes(code)) {
      const meta = COMORB_DIAGNOSIS_META[code];
      list.push({ id: `comorb_${code.toLowerCase()}`, label: meta.label, icon: meta.icon, color: meta.color, detalle: "" });
    }
  });

  // 8) Trastornos hidroelectrolíticos activos (ver individualization.js,
  // agregado en esta misma ronda — tabla de rangos confirmada con el Dr.
  // Ortega el 12-ago-2026). Solo entra a la lista si hay una dirección
  // (hipo/hiper) activa; "Normal" y "Sin dato" no generan diagnóstico.
  [
    ["sodio", classifySodio], ["potasio", classifyPotasio], ["calcio", classifyCalcio],
    ["fosforo", classifyFosforo], ["magnesio", classifyMagnesio],
  ].forEach(([key, fn]) => {
    const r = fn(patient);
    if (r.direccion) {
      list.push({
        id: `electrolito_${key}`, label: r.texto, icon: "beaker", color: ZONA_COLOR[r.zona] || "amber",
        detalle: `${r.valor} ${r.label}`,
      });
    }
  });

  // 9) Síndrome Cardiorrenometabólico (CKM) — guía 2026 AHA/ACC/ADA/ASN,
  // compartida por el Dr. Ortega el 13-ago-2026. SOLO aparece aquí en
  // EndoDiagnostics (petición explícita: "que sea para todos los pacientes
  // que cuenten con criterios diagnósticos de síndrome cardiorrenometabólico",
  // no se agregó a Estratificación Global). Ver classifyCKM en
  // individualization.js para el detalle completo de la estadificación,
  // sus fuentes de datos y sus limitaciones deliberadas (sin fibrilación
  // auricular, diálisis/TRR, ni hallazgos subclínicos por imagen/
  // biomarcadores — "no es típico de consulta", a petición del Dr. Ortega).
  // Solo entra a la lista si hay estadio 1-4; el Estadio 0 (sin riesgo) no
  // es un hallazgo accionable y no se muestra, mismo criterio que el resto
  // de esta lista.
  const ckm = classifyCKM(patient, flags, egfr, imc);
  if (ckm.valor !== null && ckm.valor !== 0) {
    list.push({
      id: "ckm", label: `Síndrome Cardiorrenometabólico — ${ckm.texto}`,
      icon: "gauge", color: ZONA_COLOR[ckm.zona] || "amber",
      detalle: ckm.factores.join(" · "),
    });
  }

  return list;
}

/* ==================== RENDER (DOM) ==================== */

function buildDiagnosisCardHTML(d) {
  return `<div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 flex items-center gap-4 hover:shadow-lg hover:shadow-${d.color}-200/50 dark:hover:shadow-${d.color}-950/30 hover:border-${d.color}-300 dark:hover:border-${d.color}-700 hover:-translate-y-0.5 transition-all duration-200">
    <div class="w-12 h-12 rounded-2xl bg-gradient-to-br from-${d.color}-100 to-${d.color}-50 dark:from-${d.color}-900/40 dark:to-${d.color}-900/20 flex items-center justify-center shrink-0">
      <i data-lucide="${d.icon}" class="w-5.5 h-5.5 text-${d.color}-600 dark:text-${d.color}-400"></i>
    </div>
    <div class="min-w-0">
      <h4 class="font-bold text-sm text-slate-800 dark:text-white leading-tight">${d.label}</h4>
      ${d.detalle ? `<p class="text-xs text-slate-400 mt-0.5">${d.detalle}</p>` : ""}
    </div>
  </div>`;
}

function buildEmptyStateHTML() {
  return `<div class="text-center py-16">
    <i data-lucide="clipboard-check" class="w-10 h-10 mx-auto mb-3 text-slate-300 dark:text-slate-700"></i>
    <p class="font-bold text-slate-500 dark:text-slate-400">Sin diagnósticos detectados por ahora</p>
    <p class="text-xs text-slate-400 mt-1 max-w-md mx-auto">A medida que captures comorbilidades, laboratorios y signos vitales en Ingreso Clínico, esta lista se irá completando automáticamente.</p>
  </div>`;
}

/** Redibuja #diagnosticsRoot a partir del paciente actual — llamado desde
 * render.renderAll() (paciente cambia), mismo patrón que renderScreening. */
export function renderDiagnostics(p) {
  const root = document.getElementById("diagnosticsRoot");
  if (!root) return;

  const list = computeDiagnosticsList(p || {});

  if (list.length === 0) {
    root.innerHTML = buildEmptyStateHTML();
    if (typeof lucide !== "undefined") lucide.createIcons();
    return;
  }

  root.innerHTML = `
    <div class="flex items-center justify-between mb-1">
      <p class="text-xs text-slate-400">${list.length} ${list.length === 1 ? "diagnóstico detectado" : "diagnósticos detectados"} — comorbilidades registradas + hallazgos derivados de la clasificación automática.</p>
    </div>
    <div class="grid sm:grid-cols-2 gap-3">
      ${list.map(buildDiagnosisCardHTML).join("")}
    </div>
  `;

  if (typeof lucide !== "undefined") lucide.createIcons();
}
