/* --- MOTOR DE INDIVIDUALIZACIÓN CLÍNICA ---
 * Traduce valores calculados (eGFR, FIB-4, PREVENT, A1c, etc.) a zonas de riesgo
 * codificadas por color, según las guías vigentes citadas en
 * Criterios_Individualizacion_Dashboard.md. Este módulo NO calcula los valores
 * crudos (eso vive en calculations.js): solo los CLASIFICA visualmente.
 *
 * Cada función `classify*` regresa: { valor, label, zona, color, texto, detalle }
 *   - valor: número crudo (o null si no aplica)
 *   - label: texto corto para mostrar junto al valor (ej. "mL/min/1.73m²")
 *   - zona: clave interna de color ("verde"|"amarillo"|"naranja"|"rojo"|"gris")
 *   - color: clases Tailwind ya resueltas para fondo/texto/borde
 *   - texto: interpretación clínica corta (ej. "Riesgo Alto")
 *   - detalle: explicación técnica más larga (para acordeón/tooltip)
 */

// Paleta de 4 zonas + gris (dato insuficiente), reutilizada en todas las clasificaciones.
export const ZONES = {
  // `grad`/`chip`/`shadow` (11-ago-2026, rediseño visual general): mismo
  // código de color clínico de siempre (verde=bien, rojo=mal, etc. — esa
  // semántica NO se toca), pero con un tratamiento visual más vívido —
  // gradiente sutil de fondo, chip de ícono a color, sombra de color en
  // hover — en vez del tinte plano `bg-X-50` de antes. Ver
  // buildIndividualizationCardHTML.
  verde: { bg: "bg-emerald-50 dark:bg-emerald-950/30", text: "text-emerald-700 dark:text-emerald-300", border: "border-emerald-300 dark:border-emerald-800", dot: "bg-emerald-500", grad: "from-emerald-50 dark:from-emerald-950/30", chip: "bg-emerald-100 dark:bg-emerald-900/40", shadow: "hover:shadow-emerald-200/50 dark:hover:shadow-emerald-950/40" },
  amarillo: { bg: "bg-amber-50 dark:bg-amber-950/30", text: "text-amber-700 dark:text-amber-300", border: "border-amber-300 dark:border-amber-800", dot: "bg-amber-500", grad: "from-amber-50 dark:from-amber-950/30", chip: "bg-amber-100 dark:bg-amber-900/40", shadow: "hover:shadow-amber-200/50 dark:hover:shadow-amber-950/40" },
  naranja: { bg: "bg-orange-50 dark:bg-orange-950/30", text: "text-orange-700 dark:text-orange-300", border: "border-orange-300 dark:border-orange-800", dot: "bg-orange-500", grad: "from-orange-50 dark:from-orange-950/30", chip: "bg-orange-100 dark:bg-orange-900/40", shadow: "hover:shadow-orange-200/50 dark:hover:shadow-orange-950/40" },
  rojo: { bg: "bg-rose-50 dark:bg-rose-950/30", text: "text-rose-700 dark:text-rose-300", border: "border-rose-300 dark:border-rose-800", dot: "bg-rose-500", grad: "from-rose-50 dark:from-rose-950/30", chip: "bg-rose-100 dark:bg-rose-900/40", shadow: "hover:shadow-rose-200/50 dark:hover:shadow-rose-950/40" },
  gris: { bg: "bg-slate-50 dark:bg-slate-800/40", text: "text-slate-500 dark:text-slate-400", border: "border-slate-200 dark:border-slate-700", dot: "bg-slate-400", grad: "from-slate-50 dark:from-slate-800/40", chip: "bg-slate-100 dark:bg-slate-800", shadow: "hover:shadow-slate-200/50 dark:hover:shadow-black/20" },
};

/* ================= RENAL: KDIGO 2024 (eGFR × UACR heat map) ================= */

// Fallback simplificado si no hay UACR disponible (solo eGFR, categorías G1-G5).
const EGFR_ONLY_LABEL = [
  { min: 90, zona: "verde", texto: "Normal / G1" },
  { min: 60, zona: "verde", texto: "Levemente disminuida / G2" },
  { min: 45, zona: "amarillo", texto: "Leve-moderada / G3a" },
  { min: 30, zona: "naranja", texto: "Moderada-severa / G3b" },
  { min: 15, zona: "rojo", texto: "Severamente disminuida / G4" },
  { min: 0, zona: "rojo", texto: "Falla renal / G5" },
];

function egfrStage(egfr) {
  if (egfr >= 90) return "G1";
  if (egfr >= 60) return "G2";
  if (egfr >= 45) return "G3a";
  if (egfr >= 30) return "G3b";
  if (egfr >= 15) return "G4";
  return "G5";
}

function uacrStage(uacr) {
  if (uacr < 30) return "A1";
  if (uacr < 300) return "A2";
  return "A3";
}

// Heat map KDIGO 2024 completo (fila = eGFR G1-G5, columna = UACR A1-A3).
const KDIGO_HEATMAP = {
  G1: { A1: "verde", A2: "amarillo", A3: "naranja" },
  G2: { A1: "verde", A2: "amarillo", A3: "naranja" },
  G3a: { A1: "amarillo", A2: "naranja", A3: "rojo" },
  G3b: { A1: "naranja", A2: "rojo", A3: "rojo" },
  G4: { A1: "rojo", A2: "rojo", A3: "rojo" },
  G5: { A1: "rojo", A2: "rojo", A3: "rojo" },
};

const ZONE_LABEL = {
  verde: "Riesgo Bajo",
  amarillo: "Riesgo Moderadamente Aumentado",
  naranja: "Riesgo Alto",
  rojo: "Riesgo Muy Alto",
};

export function classifyEGFR(egfr, uacr = null) {
  if (egfr === null || egfr === undefined || egfr === "" || isNaN(egfr)) {
    return { valor: null, label: "mL/min/1.73m²", zona: "gris", color: ZONES.gris, texto: "Sin dato", detalle: "Requiere creatinina, edad y sexo para calcular eGFR (CKD-EPI 2021)." };
  }
  const gStage = egfrStage(egfr);
  if (uacr === null || uacr === undefined || uacr === "" || isNaN(uacr)) {
    const match = EGFR_ONLY_LABEL.find((r) => egfr >= r.min);
    return {
      valor: Math.round(egfr), label: "mL/min/1.73m²", zona: match.zona, color: ZONES[match.zona],
      texto: match.texto,
      detalle: `Categoría eGFR KDIGO ${gStage} (sin UACR disponible; el mapa de calor completo requiere albuminuria).`,
    };
  }
  const aStage = uacrStage(uacr);
  const zona = KDIGO_HEATMAP[gStage][aStage];
  return {
    valor: Math.round(egfr), label: "mL/min/1.73m²", zona, color: ZONES[zona],
    texto: `${ZONE_LABEL[zona]} (${gStage}/${aStage})`,
    detalle: `Mapa de calor KDIGO 2024: eGFR ${Math.round(egfr)} (${gStage}) × UACR ${uacr} mg/g (${aStage}) → ${ZONE_LABEL[zona]}.`,
  };
}

/* ================= PRESIÓN ARTERIAL: AHA/ACC 2025 (5 categorías) ================= */

export function classifyBP(sbp, dbp) {
  if (sbp === null || sbp === undefined || sbp === "" || isNaN(sbp) || dbp === null || dbp === undefined || dbp === "" || isNaN(dbp)) {
    return { valor: null, label: "mmHg", zona: "gris", color: ZONES.gris, texto: "Sin dato", detalle: "Requiere TAS y TAD." };
  }
  let zona, texto;
  if (sbp >= 180 || dbp >= 120) { zona = "rojo"; texto = "Crisis Hipertensiva"; }
  else if (sbp >= 140 || dbp >= 90) { zona = "rojo"; texto = "Hipertensión Etapa 2"; }
  else if (sbp >= 130 || dbp >= 80) { zona = "naranja"; texto = "Hipertensión Etapa 1"; }
  else if (sbp >= 120) { zona = "amarillo"; texto = "Elevada"; }
  else { zona = "verde"; texto = "Normal"; }
  return {
    valor: `${Math.round(sbp)}/${Math.round(dbp)}`, label: "mmHg", zona, color: ZONES[zona], texto,
    detalle: "Clasificación AHA/ACC 2025: Normal <120/<80, Elevada 120-129/<80, Etapa 1 130-139/80-89, Etapa 2 ≥140/≥90, Crisis ≥180/≥120.",
  };
}

/* ================= HEPÁTICA: FIB-4 (MASLD Consensus 2026, 2 pasos) ================= */

export function classifyFIB4(fib4, age, vctLsm = null) {
  if (fib4 === null || fib4 === undefined || isNaN(fib4)) {
    return { valor: null, label: "índice", zona: "gris", color: ZONES.gris, texto: "Sin dato", detalle: "Requiere edad, AST, ALT y plaquetas." };
  }
  const cutoff = age >= 65 ? 2.0 : 1.3;
  if (fib4 < cutoff) {
    return {
      valor: fib4.toFixed(2), label: "índice", zona: "verde", color: ZONES.verde, texto: "Riesgo Bajo de Fibrosis Avanzada",
      detalle: `FIB-4 ${fib4.toFixed(2)} < ${cutoff} (corte ajustado por edad ${age >= 65 ? "≥65" : "<65"} años). No requiere estudio adicional por ahora.`,
    };
  }
  if (vctLsm === null || vctLsm === undefined || vctLsm === "" || isNaN(vctLsm)) {
    return {
      valor: fib4.toFixed(2), label: "índice", zona: "amarillo", color: ZONES.amarillo, texto: "Indeterminado — Requiere VCTE (elastografía)",
      detalle: `FIB-4 ${fib4.toFixed(2)} ≥ ${cutoff}: por consenso MASLD 2026 se requiere una segunda prueba (VCTE-LSM) antes de confirmar riesgo alto.`,
    };
  }
  if (vctLsm >= 8) {
    return {
      valor: fib4.toFixed(2), label: "índice", zona: "rojo", color: ZONES.rojo, texto: "Riesgo Alto de Fibrosis Avanzada",
      detalle: `FIB-4 ${fib4.toFixed(2)} ≥ ${cutoff} + VCTE-LSM ${vctLsm} kPa ≥ 8 kPa: riesgo alto confirmado. Referir a hepatología.`,
    };
  }
  return {
    valor: fib4.toFixed(2), label: "índice", zona: "amarillo", color: ZONES.amarillo, texto: "Riesgo Bajo-Intermedio (VCTE no confirma alto riesgo)",
    detalle: `FIB-4 ${fib4.toFixed(2)} ≥ ${cutoff} pero VCTE-LSM ${vctLsm} kPa < 8 kPa: no se confirma fibrosis avanzada. Vigilancia.`,
  };
}

/* ================= CARDIOVASCULAR: PREVENT (AHA) ================= */

export function classifyASCVD(riskPct) {
  if (riskPct === null || riskPct === undefined || riskPct === "" || isNaN(riskPct)) {
    return { valor: null, label: "% a 10 años", zona: "gris", color: ZONES.gris, texto: "Sin dato", detalle: "Requiere ecuación PREVENT calculada aparte." };
  }
  let zona, texto;
  if (riskPct >= 10) { zona = "rojo"; texto = "Riesgo Alto"; }
  else if (riskPct >= 5) { zona = "naranja"; texto = "Riesgo Intermedio"; }
  else if (riskPct >= 3) { zona = "amarillo"; texto = "Riesgo Limítrofe"; }
  else { zona = "verde"; texto = "Riesgo Bajo"; }
  return {
    valor: riskPct.toFixed(1), label: "% a 10 años", zona, color: ZONES[zona], texto,
    detalle: "Categorías PREVENT (AHA): Bajo <3%, Limítrofe 3-<5%, Intermedio 5-<10%, Alto ≥10%.",
  };
}

/**
 * Decide cuál de los dos (PREVENT o "ASCVD establecida") aplica para un
 * paciente dado, según el árbol de decisión ya delimitado en este proyecto:
 *   - Si ya tiene ASCVD establecida -> se omite PREVENT, es automáticamente
 *     muy alto riesgo (no tiene caso calcular un score de riesgo futuro en
 *     alguien que ya tuvo el evento).
 *   - Si NO tiene ASCVD y está en el rango de validación de PREVENT
 *     (edad 30-79 años) -> se usa el % de riesgo PREVENT si está capturado.
 *   - Fuera de ese rango de edad -> PREVENT no está validado, se marca N/A.
 * La ecuación PREVENT en sí NO está implementada todavía dentro del
 * dashboard: `p.ascvdRiskPct` se captura manualmente (calculado aparte) y
 * esta función solo decide CUÁL score mostrar y cómo colorearlo.
 */
export function getCardiovascularSummary(p, flags) {
  if (flags?.ascvd) {
    return { valor: "Establecida", label: "", zona: "rojo", color: ZONES.rojo, texto: "ASCVD Establecida — Muy Alto Riesgo", detalle: "Paciente con ASCVD documentada (coronaria, cerebrovascular o arterial periférica): se omite PREVENT, manejo de muy alto riesgo." };
  }
  const edad = Number(p?.edad);
  const elegiblePorEdad = edad >= 30 && edad <= 79;
  if (!elegiblePorEdad) {
    return { valor: "N/A", label: "", zona: "gris", color: ZONES.gris, texto: "Fuera de rango PREVENT", detalle: "PREVENT (AHA) está validado para edades 30-79 años sin ASCVD establecida." };
  }
  if (p?.ascvdRiskPct === undefined || p?.ascvdRiskPct === null || p?.ascvdRiskPct === "") {
    return { valor: "--", label: "% PREVENT", zona: "gris", color: ZONES.gris, texto: "Sin capturar", detalle: "Ingresa el % de riesgo PREVENT a 10 años (calculado aparte); la ecuación aún no está implementada dentro del dashboard." };
  }
  return classifyASCVD(Number(p.ascvdRiskPct));
}

/* ================= OBESIDAD: ABCD Staging (AACE 2025) ================= */

/**
 * Deriva la lista de severidades ORCD (Obesity-Related Chronic Disease, AACE
 * ABCD) a partir de las banderas clínicas. IMPORTANTE: solo tiene sentido
 * evaluar ORCD si el paciente tiene obesidad/sobrepeso con criterio
 * (flags.obesidad) — de lo contrario un paciente con, por ejemplo, IC pero
 * sin obesidad se estadificaría incorrectamente bajo un marco que es
 * específicamente para adiposidad excesiva.
 *
 * Mapeo de severidad (simplificado; AACE no da un solo nivel por comorbilidad,
 * depende de gravedad clínica — aquí se usa la categoría más frecuente/típica
 * cuando el dato capturado es solo presencia/ausencia, no severidad):
 *   Severa:    IC, ERC, ASCVD, SAOS (apnea obstructiva del sueño)
 *   Moderada:  MASLD, Osteoartritis
 */
export function deriveOrcdFromFlags(flags = {}) {
  if (!flags.obesidad) return [];
  const orcd = [];
  if (flags.ic || flags.erc || flags.ascvd || flags.saos) orcd.push("severa");
  if (flags.masld || flags.osteoartritis) orcd.push("moderada");
  return orcd;
}

export function classifyABCD(orcdList = [], hasObesidad = true) {
  if (!hasObesidad) {
    return { valor: "N/A", label: "", zona: "gris", color: ZONES.gris, texto: "Sin obesidad/sobrepeso", detalle: "AACE ABCD estadifica complicaciones relacionadas con adiposidad excesiva; no aplica si el paciente no cumple criterio de obesidad/sobrepeso." };
  }
  if (!orcdList || orcdList.length === 0) {
    return { valor: "Estadio 0", label: "", zona: "verde", color: ZONES.verde, texto: "Sin complicaciones relacionadas con obesidad", detalle: "AACE ABCD: hay obesidad/sobrepeso pero sin ORCD detectada por las comorbilidades marcadas." };
  }
  if (orcdList.includes("severa")) {
    return { valor: "Estadio 3", label: "", zona: "rojo", color: ZONES.rojo, texto: "ORCD Severa", detalle: "AACE ABCD Estadio 3: presencia de complicación severa (IC, ERC, ASCVD o SAOS) relacionada con adiposidad." };
  }
  if (orcdList.includes("moderada")) {
    return { valor: "Estadio 2", label: "", zona: "naranja", color: ZONES.naranja, texto: "ORCD Moderada", detalle: "AACE ABCD Estadio 2: presencia de complicación moderada (MASLD u Osteoartritis) relacionada con adiposidad." };
  }
  return { valor: "Estadio 1", label: "", zona: "amarillo", color: ZONES.amarillo, texto: "ORCD Leve", detalle: "AACE ABCD Estadio 1: complicación leve relacionada con adiposidad." };
}

/* ================= GLUCÉMICA: Meta de A1c individualizada (ADA 2026) ================= */

/**
 * Meta de A1c individualizada.
 *
 * CORRECCIÓN (auditoría 8 de agosto 2026): esta función nunca recibía datos
 * reales. `render.js` la llamaba con `p.saludStatus || "general"`, pero
 * `p.saludStatus` NUNCA se capturaba en el formulario (no existe ese campo
 * en index.html) y, aunque hubiera existido, el propio código esperaba un
 * vocabulario de valores ("malaSalud"/"multiplesComorbilidades"/
 * "saludComplicada") que no coincidía con el documentado en render.js
 * ("general"/"complejo"/"muy_complejo"). Resultado: para TODO paciente
 * ≥65 años, esta función caía siempre en la rama por defecto (7.5%),
 * sin importar qué tan sano o complejo fuera en realidad. Se corrigió
 * para usar el vocabulario real de 3 niveles de la Tabla 13.2 de ADA 2026
 * ("sano" | "complejo" | "muyComplejo") y se agregó el campo correspondiente
 * al formulario (Ficha de Identificación) + su lectura en state.js.
 *
 * Tabla 13.2 (ADA 2026, "Older Adults") — verificada contra el PDF:
 *   Sano (pocas comorbilidades, función/cognición intactas): <7.0-7.5%
 *   Complejo/intermedio (múltiples comorbilidades o deterioro funcional/
 *     cognitivo leve-moderado): <8.0%
 *   Muy complejo/mala salud (cuidados prolongados, expectativa de vida
 *     limitada, deterioro cognitivo moderado-severo): la guía NO da un
 *     número fijo aquí — literalmente dice "evitar depender de la A1c;
 *     las decisiones deben basarse en evitar hipoglucemia e hiperglucemia
 *     sintomática". Se usa 8.5% como techo práctico de referencia (convención
 *     clínica habitual), no como cifra literal de la tabla — esto se explicita
 *     en el `detalle` de la tarjeta para no dar una falsa sensación de precisión.
 *
 * Para <65 años: 6.3a (meta general <7.0%) y 6.4 (meta <6.5% si buena salud,
 * bajo riesgo de hipoglucemia y baja carga de tratamiento) — ambas verificadas
 * contra el PDF.
 */
export function getA1cTarget({ age, healthStatus, lowTreatmentBurden } = {}) {
  if (age >= 65) {
    if (healthStatus === "muyComplejo") return 8.5;
    if (healthStatus === "complejo") return 8.0;
    return 7.5; // "sano" o sin especificar
  }
  if (lowTreatmentBurden) return 6.5;
  return 7.0;
}

export function classifyA1cVsTarget(a1cValue, target) {
  if (a1cValue === null || a1cValue === undefined || a1cValue === "" || isNaN(a1cValue)) {
    return { valor: null, label: "%", zona: "gris", color: ZONES.gris, texto: "Sin dato", detalle: "Requiere HbA1c medida o estimada." };
  }
  let zona, texto;
  if (a1cValue <= target) { zona = "verde"; texto = "En Meta"; }
  else if (a1cValue <= target + 1) { zona = "amarillo"; texto = "Levemente Sobre Meta"; }
  else if (a1cValue <= target + 2) { zona = "naranja"; texto = "Sobre Meta"; }
  else { zona = "rojo"; texto = "Muy Sobre Meta"; }
  return {
    valor: a1cValue.toFixed(1), label: `% (meta ${target}%)`, zona, color: ZONES[zona], texto,
    detalle: `Meta individualizada ADA 2026: ${target}%. Valor actual ${a1cValue.toFixed(1)}%.`,
  };
}

/* ================= ELECTROLITOS: hipo/hiper por severidad (12-ago-2026) =================
 * Rangos confirmados con el Dr. Ortega tras revisión de literatura. Sodio,
 * Potasio y Calcio tienen buen consenso entre fuentes (AAFP 2023, StatPearls,
 * Merck Manual); Fósforo y Magnesio (sobre todo su lado "hiper") tienen menos
 * estandarización entre fuentes para población general — se usó la síntesis
 * más citada, documentado explícitamente abajo para no dar una falsa
 * sensación de precisión donde la literatura no la tiene.
 *
 * El corte severo de Hiperkalemia (>6.5 mEq/L) se fijó IDÉNTICO al umbral
 * absoluto ya usado por el guardrail de extremos fisiológicos (redflags.js,
 * sección "Hiperkalemia severa") — a esa cifra, el caso ya deja de pasar
 * por aquí y cae directo en el guardrail de derivación inmediata; esta
 * clasificación aplica al resto de la escala (normal/leve/moderada) y sigue
 * siendo consistente si algún día ese caso llega a evaluarse aquí también.
 */
const ELECTROLYTE_RANGES = {
  sodio: { label: "Sodio", unit: "mEq/L", hipoSevero: 125, hipoModerado: 130, normalMin: 135, normalMax: 145, hiperLeveMax: 150, hiperModeradoMax: 159, decimales: 0,
    fuente: "Hiponatremia: AAFP 2023 (mild 130-134, moderate 125-129, severe <125). Hipernatremia: sin un único corte universal en la literatura — síntesis de rangos citados." },
  potasio: { label: "Potasio", unit: "mEq/L", hipoSevero: 2.5, hipoModerado: 3.0, normalMin: 3.6, normalMax: 5.0, hiperLeveMax: 5.5, hiperModeradoMax: 6.5, decimales: 1,
    fuente: "Hipokalemia: StatPearls (mild 3.0-3.5, moderate 2.5-3.0, severe <2.5). Hiperkalemia: corte severo (>6.5) alineado con el guardrail de extremos fisiológicos." },
  calcio: { label: "Calcio", unit: "mg/dL", hipoSevero: 7.0, hipoModerado: 8.0, normalMin: 8.5, normalMax: 10.4, hiperLeveMax: 11.9, hiperModeradoMax: 13.9, decimales: 1,
    fuente: "Merck Manual (hipocalcemia severa <7.0-7.5 mg/dL) y convención clínica habitual (hipercalcemia leve 10.5-11.9, moderada 12.0-13.9, severa ≥14.0)." },
  fosforo: { label: "Fósforo", unit: "mg/dL", hipoSevero: 1.0, hipoModerado: 2.0, normalMin: 2.5, normalMax: 4.5, hiperLeveMax: 6.0, hiperModeradoMax: 9.0, decimales: 1,
    fuente: "Hipofosfatemia con buen consenso (mild 2.0-2.5, moderate 1.0-2.0, severe <1.0). Hiperfosfatemia por severidad en población general NO tiene una tabla estándar única en la literatura (la mayoría de fuentes son específicas de diálisis) — síntesis propia, la de menor consenso de las 10." },
  magnesio: { label: "Magnesio", unit: "mg/dL", hipoSevero: 1.0, hipoModerado: 1.4, normalMin: 1.8, normalMax: 2.4, hiperLeveMax: 4.0, hiperModeradoMax: 7.0, decimales: 1,
    fuente: "Hipomagnesemia con buen consenso (mild 1.4-1.7, moderate 1.0-1.4, severe <1.0). Hipermagnesemia por severidad tiene menos estandarización en población general — síntesis propia." },
};

const ELECTROLYTE_SUFFIX = { sodio: "natremia", potasio: "kalemia", calcio: "calcemia", fosforo: "fosfatemia", magnesio: "magnesemia" };

function classifyElectrolyte(key, rawValue) {
  const r = ELECTROLYTE_RANGES[key];
  const v = Number(rawValue);
  if (rawValue === "" || rawValue === null || rawValue === undefined || isNaN(v)) {
    return { valor: null, label: r.unit, zona: "gris", color: ZONES.gris, texto: "Sin dato", detalle: `Requiere ${r.label.toLowerCase()} sérico.`, direccion: null, severidad: null };
  }
  const vv = v.toFixed(r.decimales);
  let zona, direccion, severidad;
  if (v < r.hipoSevero) { zona = "rojo"; direccion = "hipo"; severidad = "severa"; }
  else if (v < r.hipoModerado) { zona = "naranja"; direccion = "hipo"; severidad = "moderada"; }
  else if (v < r.normalMin) { zona = "amarillo"; direccion = "hipo"; severidad = "leve"; }
  else if (v <= r.normalMax) { zona = "verde"; direccion = null; severidad = null; }
  else if (v <= r.hiperLeveMax) { zona = "amarillo"; direccion = "hiper"; severidad = "leve"; }
  else if (v <= r.hiperModeradoMax) { zona = "naranja"; direccion = "hiper"; severidad = "moderada"; }
  else { zona = "rojo"; direccion = "hiper"; severidad = "severa"; }
  const sufijo = ELECTROLYTE_SUFFIX[key];
  const texto = direccion ? `Hip${direccion === "hipo" ? "o" : "er"}${sufijo} ${severidad}` : "Normal";
  return {
    valor: vv, label: r.unit, zona, color: ZONES[zona], texto,
    detalle: direccion
      ? `${r.label} ${vv} ${r.unit} (rango normal de referencia ${r.normalMin}-${r.normalMax} ${r.unit}). ${r.fuente}`
      : `${r.label} dentro de rango normal (${r.normalMin}-${r.normalMax} ${r.unit}).`,
    direccion, severidad,
  };
}

export function classifySodio(p) { return classifyElectrolyte("sodio", p?.sodio); }
export function classifyPotasio(p) { return classifyElectrolyte("potasio", p?.potasio); }
export function classifyCalcio(p) { return classifyElectrolyte("calcio", p?.calcio); }
export function classifyFosforo(p) { return classifyElectrolyte("fosforo", p?.fosforo); }
export function classifyMagnesio(p) { return classifyElectrolyte("magnesio", p?.magnesio); }

/* ================= SÍNDROME CARDIORRENOMETABÓLICO (CKM) — SOLO EndoDiagnostics =================
 * Guía 2026 AHA/ACC/ADA/ASN, Tabla 4 ("CKM Staging Definitions and Diagnostic
 * Criteria for Adults", pág. 191) — PDF compartido por el Dr. Ortega el
 * 13-ago-2026. Estadificación 0-4 (4a/4b) construida ÚNICAMENTE con datos que
 * YA existen en el expediente — a petición explícita del Dr. Ortega, NO se
 * agregó ningún campo nuevo ("lo demás no es típico de consulta... lo
 * dejaremos fuera por ahora"). Se usa SOLO en EndoDiagnostics (ver
 * diagnostics.js) — no se agregó a Estratificación Global.
 *
 * Deliberadamente FUERA de esta versión (Tabla 4 los define, pero no son
 * datos típicos de una consulta de endocrinología):
 *   - Fibrilación auricular como componente de ECV clínica del Estadio 4
 *     (hoy solo se evalúan IC/Enf. Coronaria/EVC/EAP).
 *   - Estado explícito de diálisis/terapia de reemplazo renal — el Estadio
 *     4b (falla renal) solo se detecta vía eGFR <15 mL/min/1.73m².
 *   - La vía de Estadio 3 por hallazgo subclínico directo (calcio coronario,
 *     NT-proBNP/troponinas, ecocardiograma). Aquí el Estadio 3 se alcanza
 *     SOLO por sus 2 "risk equivalents" (ERC de muy alto riesgo o PREVENT
 *     ≥20%) — la propia Tabla 4 los reconoce como criterio diagnóstico
 *     válido por sí solos, no es una aproximación.
 *
 * REUTILIZACIÓN: el criterio de ERC "riesgo moderado-alto" vs. "muy alto
 * riesgo" de la Tabla 4 (nota § ) coincide EXACTAMENTE con las zonas
 * amarillo/naranja (moderado-alto) y rojo (muy alto) que ya calcula
 * classifyEGFR() más arriba — se reutiliza tal cual, sin reimplementar
 * el mapa de calor KDIGO.
 *
 * DECISIÓN DOCUMENTADA: la Tabla 4 dice "T2D" para el criterio de diabetes
 * del Estadio 2, pero aquí se acepta diabetes Tipo I o Tipo II por igual —
 * el riesgo cardiorrenal de la hiperglucemia crónica sostenida no es
 * exclusivo de la diabetes tipo 2.
 *
 * LIMITACIÓN CONOCIDA: el corte de IMC/cintura de la Tabla 4 tiene un ajuste
 * para ascendencia asiática (IMC ≥23, cintura ≥80/90 cm) — el expediente no
 * captura ascendencia, así que aquí siempre se usa el corte estándar
 * (IMC ≥25, cintura ≥88/102 cm).
 */

/** Síndrome Metabólico (criterio AHA/NHLBI, nota † de la Tabla 4): ≥3 de 5.
 * Recibe valores ya extraídos (no el paciente crudo) para mantener esta
 * función chica y testeable por separado de classifyCKM. */
function countMetSCriteria({ sexo, cintura, hdl, tg, tas, tad, medHTN, glucosa }) {
  const detalles = [];
  const cinturaCorte = sexo === "H" ? 102 : 88;
  if (cintura !== null && cintura >= cinturaCorte) detalles.push(`cintura ${cintura} cm (≥${cinturaCorte})`);
  const hdlCorte = sexo === "H" ? 40 : 50;
  if (hdl !== null && hdl < hdlCorte) detalles.push(`HDL ${hdl} mg/dL (<${hdlCorte})`);
  if (tg !== null && tg >= 150) detalles.push(`triglicéridos ${tg} mg/dL (≥150)`);
  if ((tas !== null && tas >= 130) || (tad !== null && tad >= 80) || medHTN) detalles.push("TA ≥130/80 o en tratamiento antihipertensivo");
  if (glucosa !== null && glucosa >= 100) detalles.push(`glucosa en ayuno ${glucosa} mg/dL (≥100)`);
  return { count: detalles.length, detalles };
}

/** Estadifica el síndrome CKM (0-4, con 4a/4b) a partir del paciente crudo +
 * las banderas clínicas ya derivadas + eGFR/IMC ya calculados por el
 * llamador (calculations.js) — este módulo NO calcula valores crudos, solo
 * clasifica (ver cabecera del archivo). Mismo shape que el resto de
 * classify*, con un campo extra `factores`: la lista específica de qué
 * cumple ESE paciente (a petición del Dr. Ortega — "que sea para todos los
 * pacientes que cuenten con criterios diagnósticos", cada uno con su propio
 * detalle, no solo el número de estadio). */
export function classifyCKM(p, flags, egfr, imc) {
  const patient = p || {};
  const num = (x) => (x === "" || x === null || x === undefined || isNaN(Number(x)) ? null : Number(x));
  const sexo = patient.sexo;
  const cintura = num(patient.cintura);
  const hdl = num(patient.hdl);
  const tg = num(patient.trigliceridos);
  const tas = num(patient.tas);
  const tad = num(patient.tad);
  const glucosa = num(patient.glucosa);
  const a1c = num(patient.hba1c);
  const uacr = num(patient.uacr);
  const prevent = num(patient.ascvdRiskPct);
  const medHTN = (patient.medicacionActual?.htn || []).length > 0;

  const datosBasicos = imc !== null || glucosa !== null || a1c !== null || (tas !== null && tad !== null);
  if (!datosBasicos) {
    return { valor: null, label: "", zona: "gris", color: ZONES.gris, texto: "Sin datos suficientes", detalle: "Requiere al menos IMC, glucosa/A1c o presión arterial para estadificar CKM.", factores: [] };
  }

  // --- Estadio 4: ECV clínica (con o sin falla renal) ---
  const cvdFactores = [];
  if (flags?.ic) cvdFactores.push("Insuficiencia Cardíaca");
  if (patient.comorbilidades?.includes("IAM_ANGINA")) cvdFactores.push("Enfermedad Coronaria (IAM previo/angina/revascularización)");
  if (patient.comorbilidades?.includes("EVC_AIT")) cvdFactores.push("Enfermedad Cerebrovascular (ACV/AIT)");
  if (patient.comorbilidades?.includes("EAP")) cvdFactores.push("Enfermedad Arterial Periférica");
  if (cvdFactores.length > 0) {
    const subEstadio = egfr !== null && egfr < 15 ? "4b" : "4a";
    return {
      valor: subEstadio, label: "", zona: "rojo", color: ZONES.rojo,
      texto: `Estadio ${subEstadio} — ECV Clínica`,
      detalle: subEstadio === "4b" ? "ECV clínica establecida + falla renal (eGFR <15 mL/min/1.73m²)." : "ECV clínica establecida, sin falla renal conocida.",
      factores: cvdFactores,
    };
  }

  // --- Estadio 3: equivalentes de riesgo subclínico ---
  const egfrZona = egfr !== null ? classifyEGFR(egfr, uacr).zona : null;
  const ercMuyAlto = egfrZona === "rojo";
  const preventAlto = prevent !== null && prevent >= 20;
  if (ercMuyAlto || preventAlto) {
    const factores3 = [];
    if (ercMuyAlto) factores3.push(`ERC de muy alto riesgo (eGFR ${Math.round(egfr)} mL/min/1.73m²${uacr !== null ? `, UACR ${uacr} mg/g` : ""})`);
    if (preventAlto) factores3.push(`Riesgo PREVENT a 10 años: ${prevent}% (≥20%)`);
    return {
      valor: 3, label: "", zona: "rojo", color: ZONES.rojo,
      texto: "Estadio 3 — ECV Subclínica (equivalente de riesgo)",
      detalle: "Cumple un equivalente de riesgo subclínico reconocido por la guía (no se evaluó calcio coronario ni biomarcadores cardiacos en esta consulta).",
      factores: factores3,
    };
  }

  // --- Estadio 2: factores metabólicos y/o ERC moderada-alta ---
  const factores2 = [];
  if ((tas !== null && tas >= 130) || (tad !== null && tad >= 80) || medHTN) {
    factores2.push(`Hipertensión (TA ${tas ?? "--"}/${tad ?? "--"} mmHg${medHTN ? ", en tratamiento antihipertensivo" : ""})`);
  }
  if (tg !== null && tg >= 150) factores2.push(`Hipertrigliceridemia (${tg} mg/dL)`);
  const esDiabetes = patient.tipoDM === "DM1" || patient.tipoDM === "DM2" || (a1c !== null && a1c >= 6.5) || (glucosa !== null && glucosa >= 126);
  if (esDiabetes) factores2.push(`Diabetes (${a1c !== null ? `A1c ${a1c}%` : `glucosa en ayuno ${glucosa} mg/dL`})`);
  const metSyn = countMetSCriteria({ sexo, cintura, hdl, tg, tas, tad, medHTN, glucosa });
  if (metSyn.count >= 3) factores2.push(`Síndrome Metabólico (${metSyn.count}/5 criterios AHA/NHLBI: ${metSyn.detalles.join("; ")})`);
  const ercModAlto = egfrZona === "amarillo" || egfrZona === "naranja";
  if (ercModAlto) factores2.push(`ERC riesgo moderado-alto (eGFR ${Math.round(egfr)} mL/min/1.73m²${uacr !== null ? `, UACR ${uacr} mg/g` : ""})`);
  if (factores2.length > 0) {
    return {
      valor: 2, label: "", zona: "naranja", color: ZONES.naranja,
      texto: "Estadio 2 — Factores Metabólicos / ERC",
      detalle: "Cumple ≥1 factor de riesgo metabólico y/o ERC de riesgo moderado-alto.",
      factores: factores2,
    };
  }

  // --- Estadio 1: adiposidad excesiva o prediabetes, sin otros factores ---
  const factores1 = [];
  if (imc !== null && imc >= 25) factores1.push(`IMC ${imc} kg/m² (≥25)`);
  const cinturaCorte1 = sexo === "H" ? 102 : 88;
  if (cintura !== null && cintura >= cinturaCorte1) factores1.push(`Cintura ${cintura} cm (≥${cinturaCorte1})`);
  const prediabetes = patient.tipoDM === "Prediabetes" || (a1c !== null && a1c >= 5.7 && a1c < 6.5) || (glucosa !== null && glucosa >= 100 && glucosa < 126);
  if (prediabetes) factores1.push(`Prediabetes (${a1c !== null ? `A1c ${a1c}%` : `glucosa en ayuno ${glucosa} mg/dL`})`);
  if (factores1.length > 0) {
    return {
      valor: 1, label: "", zona: "amarillo", color: ZONES.amarillo,
      texto: "Estadio 1 — Adiposidad Excesiva",
      detalle: "Sobrepeso/obesidad o prediabetes, sin otros factores de riesgo metabólico ni ERC.",
      factores: factores1,
    };
  }

  // --- Estadio 0: sin factores CKM ---
  return {
    valor: 0, label: "", zona: "verde", color: ZONES.verde,
    texto: "Estadio 0 — Sin Riesgo CKM",
    detalle: "Sin factores de riesgo cardiorrenometabólico detectados con los datos disponibles.",
    factores: [],
  };
}

/* ================= RENDER: Tarjeta reutilizable ================= */

export function buildIndividualizationCardHTML(iconName, title, result, barPercent = null) {
  const c = result.color || ZONES.gris;
  // barPercent (11-ago-2026, rediseño de Estratificación Global — a petición
  // del Dr. Ortega: "más agradable a la vista, mejor uso del espacio"): las
  // tarjetas de eGFR renal y FIB-4 hepático antes vivían DUPLICADAS — una vez
  // aquí (con zona/color) y otra vez como tarjeta de barra plana en la parte
  // superior de la vista, mismo dato, dos tratamientos visuales distintos.
  // Se funde la barra DENTRO de esta tarjeta (mismo color que el punto de
  // zona) y se elimina la tarjeta duplicada — un solo lugar, mejor
  // aprovechamiento del espacio.
  const barHTML = barPercent !== null && barPercent !== undefined
    ? `<div class="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden"><div class="h-full ${c.dot} rounded-full transition-all duration-700" style="width:${Math.max(0, Math.min(100, barPercent))}%"></div></div>`
    : "";
  return `
  <div class="p-5 rounded-2xl border ${c.border} bg-gradient-to-br ${c.grad} to-white dark:to-slate-900 flex flex-col gap-3 min-h-[168px] hover:shadow-lg ${c.shadow} hover:-translate-y-0.5 transition-all duration-200">
    <div class="flex items-center gap-2">
      <span class="w-7 h-7 rounded-lg ${c.chip} flex items-center justify-center shrink-0"><i data-lucide="${iconName}" class="w-3.5 h-3.5 ${c.text}"></i></span>
      <span class="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">${title}</span>
    </div>
    <div class="flex items-baseline gap-2">
      <span class="text-3xl font-black ${c.text}">${result.valor !== null && result.valor !== undefined ? result.valor : "--"}</span>
      <span class="text-xs text-slate-400 dark:text-slate-500">${result.label || ""}</span>
    </div>
    ${barHTML}
    <div class="flex items-center gap-1.5">
      <span class="w-2 h-2 rounded-full ${c.dot} shrink-0"></span>
      <span class="text-sm font-semibold ${c.text}">${result.texto}</span>
    </div>
    ${result.detalle ? `<p class="text-[11px] text-slate-400 dark:text-slate-500 leading-snug pt-2 border-t ${c.border}">${result.detalle}</p>` : ""}
  </div>`;
}

/* ================= ENDOGOALS: metas consolidadas ================= */

/**
 * Metas de glucosa en ayuno/preprandial y presión arterial, según la misma
 * Tabla 13.2 (ADA 2026, adultos mayores) ya usada por getA1cTarget, más la
 * Recomendación 6.3a (ADA 2026) para adultos <65 años. Se centraliza aquí
 * para que EndoGoals, EndoLypids y EndoPressure muestren siempre el mismo
 * número — nunca metas distintas para el mismo paciente en dos pantallas.
 */
const GOALS_TABLE = {
  general: { a1c: "<7.0%", ayuno: "80-130 mg/dL", bp: "<130/80 mmHg" },
  bajoRiesgo: { a1c: "<6.5%", ayuno: "80-130 mg/dL", bp: "<130/80 mmHg" },
  sano: { a1c: "<7.0-7.5%", ayuno: "80-130 mg/dL", bp: "<130/80 mmHg" },
  complejo: { a1c: "<8.0%", ayuno: "90-150 mg/dL", bp: "<130/80 mmHg" },
  muyComplejo: { a1c: "Evitar depender de la A1c", ayuno: "100-180 mg/dL", bp: "<140/90 mmHg" },
};

/**
 * CORRECCIÓN (8-ago-2026, detectada por el Dr. Ortega al revisar la
 * integración): esta función NO recibía `lowTreatmentBurden`, por lo que un
 * paciente <65 años con la casilla "bajo riesgo/carga de tratamiento" marcada
 * veía meta de A1c <6.5% en Individualización pero <7.0% en EndoGoals —
 * mismo paciente, dos metas distintas, el mismo tipo de inconsistencia que
 * ya se había corregido para presión arterial en la auditoría anterior. Se
 * alineó la firma y la lógica exactamente con `getA1cTarget` para que ambas
 * funciones respondan siempre lo mismo dado el mismo paciente.
 */
export function getGlycemicAndBPGoals({ age, healthStatus, lowTreatmentBurden } = {}) {
  if (age >= 65) return GOALS_TABLE[healthStatus || "sano"] || GOALS_TABLE.sano;
  if (lowTreatmentBurden) return GOALS_TABLE.bajoRiesgo;
  return GOALS_TABLE.general;
}

/** Meta de triglicéridos: <150 mg/dL (convención ATP III/ACC-AHA); se documentan
 * también los umbrales de escalonamiento terapéutico ya usados en buildLipidPlan
 * (150-499 -> icosapent etilo si hay ASCVD; ≥500 -> fenofibrato, prevención de
 * pancreatitis) para que el médico entienda el "por qué" del número. */
export const TG_GOAL = { target: 150, label: "<150 mg/dL" };

/** ================= ENDOGOALS: anillo de progreso hacia la meta =================
 * Agregado el 16-ago-2026 (rediseño visual de EndoGoals, a petición del Dr.
 * Ortega). Estas funciones NO clasifican riesgo clínico — ese trabajo ya lo
 * hacen classifyA1cVsTarget, computeMonitoreo (insulin.js), classifyLipidRisk
 * y classifyBP. Son puramente un heurístico VISUAL para decidir qué tan
 * lleno se ve el anillo de progreso y de qué color, para variables
 * "mientras más bajo, mejor" (glucosa, LDL, TG) que hoy no tienen una
 * función de zona propia. Los cortes (meta / +15% / +40%) son un criterio
 * de diseño, no una guía — documentado explícitamente para no confundirse
 * con un umbral clínico real. */
export function classifyValueVsTarget(value, target) {
  if (value === null || value === undefined || value === "" || isNaN(value) || !(target > 0)) {
    return { zona: "gris", color: ZONES.gris, percent: 0 };
  }
  const v = Number(value);
  let zona;
  if (v <= target) zona = "verde";
  else if (v <= target * 1.15) zona = "amarillo";
  else if (v <= target * 1.4) zona = "naranja";
  else zona = "rojo";
  // El anillo se llena al 100% en la meta o mejor; más allá de la meta se
  // vacía proporcionalmente (nunca negativo) — es una lectura de "qué tan
  // cerca", no un porcentaje clínico.
  const percent = Math.max(0, Math.min(100, Math.round((target / v) * 100)));
  return { zona, color: ZONES[zona], percent };
}

/** Compara TA actual contra la meta INDIVIDUALIZADA ya calculada en
 * getGlycemicAndBPGoals (ej. "<130/80 mmHg", relajada a "<140/90 mmHg" en
 * adultos mayores muy complejos, Tabla 13.2 ADA 2026) — a propósito NO
 * reutiliza classifyBP (esa función usa los cortes poblacionales fijos de
 * AHA/ACC 2025 para estadificar Normal/Elevada/Etapa 1/Etapa 2, un criterio
 * distinto a la meta individualizada del paciente que se muestra aquí). */
export function classifyBPVsGoal(tas, tad, goalBPLabel) {
  const m = String(goalBPLabel || "").match(/(\d+)\D+(\d+)/);
  if (!(tas > 0) || !(tad > 0) || !m) return { zona: "gris", color: ZONES.gris, percent: 0 };
  const goalSBP = Number(m[1]);
  const goalDBP = Number(m[2]);
  let zona;
  if (tas <= goalSBP && tad <= goalDBP) zona = "verde";
  else if (tas <= goalSBP + 10 && tad <= goalDBP + 5) zona = "amarillo";
  else if (tas <= goalSBP + 20 && tad <= goalDBP + 10) zona = "naranja";
  else zona = "rojo";
  const pctSBP = Math.min(100, (goalSBP / tas) * 100);
  const pctDBP = Math.min(100, (goalDBP / tad) * 100);
  const percent = Math.max(0, Math.round(Math.min(pctSBP, pctDBP)));
  return { zona, color: ZONES[zona], percent };
}

/** Mapea el estado de computeMonitoreo (insulin.js — YA es la fuente única
 * de verdad para "¿la glucosa en ayuno está en meta?", usada también por
 * EndoInsulin) a la misma paleta ZONES que el resto del sistema, para que
 * el anillo de EndoGoals nunca contradiga lo que dice EndoInsulin del mismo
 * dato. */
export function ayunoEstadoToZona(estado) {
  const MAP = {
    sin_dato: "gris", en_meta: "verde", elevado: "amarillo",
    bajo: "naranja", hipoglucemia_nivel1: "rojo", hipoglucemia_nivel2: "rojo",
  };
  const zona = MAP[estado] || "gris";
  return { zona, color: ZONES[zona] };
}

export function renderIndividualizationCard(containerId, items) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = items.map((it) => buildIndividualizationCardHTML(it.icon, it.title, it.result, it.barPercent ?? null)).join("");
  if (typeof lucide !== "undefined") lucide.createIcons();
}
