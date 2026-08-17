/* --- CÁLCULOS CLÍNICOS PUROS ---
 * Reglas de este módulo:
 *  - Ninguna función toca el DOM.
 *  - Todas aceptan el objeto `p` (paciente) y regresan valores primitivos.
 *  - `v()` normaliza "" / null a 0 para no romper aritmética.
 * Esto permite testear cada fórmula de forma aislada.
 */
import { DB_PHARMA } from "./pharma-db.js";
import { checkInteractions } from "./interactions.js";
import { checkRedFlags } from "./redflags.js";
import { checkOvertreatmentDM, checkOrthostaticBlock } from "./geriatric.js";
import { checkPerioperativeSafety } from "./perioperative.js";
import { checkHyperkalemiaZoneGray, checkUnreliableA1c } from "./borderline-labs.js";
import { checkSevereGlycemicOvertreatment, checkTripleWhammy, checkNsaidCkdRisk } from "./polypharmacy.js";
import { getA1cTarget } from "./individualization.js";
import { checkCorticosteroidRisk } from "./corticosteroids.js";
import { getLithiumInteractionReason, pickAntipsychoticPriorityDrug } from "./psychiatry.js";
import { getHivArtStatinBlockReason, deprioritizeAtorvastatinIfHivArt } from "./hiv-art.js";
import { checkSickDayRules } from "./sick-day.js";

export const v = (val) => (val === "" || val === null || val === undefined) ? 0 : val;

/**
 * FIB-4: fibrosis hepática. Alto riesgo si > 1.3 (o > 2.0 en >65 años, simplificado aquí a 1.3).
 * CORRECCIÓN DE GOBERNANZA (16-ago-2026, Dr. Ortega): antes regresaba `0`
 * si faltaban plaquetas/ALT — indistinguible de un FIB-4 genuinamente bajo,
 * y alimentaba en silencio `flags.masld` como "sin riesgo hepático" cuando
 * en realidad era "no evaluado". Ahora regresa `null` explícito, mismo
 * patrón que calcEGFR/calcIMC/calcPAM en este archivo.
 */
export function calcFIB4(p) {
  if (v(p.plaquetas) <= 0 || v(p.alt) <= 0) return null;
  return +((v(p.edad) * v(p.ast)) / (v(p.plaquetas) * Math.sqrt(v(p.alt)))).toFixed(2);
}

/** HOMA-IR: resistencia a la insulina. */
export function calcHOMA_IR(p) {
  return +((v(p.glucosa) * v(p.insulina)) / 405).toFixed(1);
}

/**
 * eGFR vía CKD-EPI 2021 (sin coeficiente racial), en mL/min/1.73m².
 * Requiere: creatinina (mg/dL), edad, sexo ("H"/"M").
 * Si falta creatinina, cae de vuelta al valor de eGFR capturado manualmente (si existe).
 *
 * CORRECCIÓN DE GOBERNANZA (16-ago-2026, Dr. Ortega — hallazgo del catálogo
 * de gobernanza clínica): antes, cuando no se podía calcular (falta
 * creatinina/edad/sexo) y tampoco había `p.tfg` manual, esta función
 * regresaba `0` en silencio (`v(p.tfg) || 0`). Un `0` es indistinguible de
 * "eGFR calculado en cero" para cualquier guarda `egfr > 0` río abajo — el
 * caso más grave detectado: la rama de inicio de metformina en paciente
 * virgen usaba literalmente `flags.egfr === 0` para decidir SÍ iniciar el
 * fármaco, tratando "no se pudo verificar" como "función renal normal".
 * Ahora regresa `null` explícito cuando no se puede calcular NI hay valor
 * manual — `null` es el mismo valor "dato faltante" que ya usan
 * calcIMC/calcPAM/calcNonHDL en este archivo (patrón correcto, ahora
 * también aquí). Decisión de comportamiento (Dr. Ortega, 16-ago-2026): un
 * eGFR desconocido NO bloquea la recomendación de un fármaco con mínimo
 * renal conocido — se permite, pero se marca visiblemente como "seguridad
 * renal no verificada" (ver `annotateRenalCaution` más abajo).
 */
export function calcEGFR(p) {
  const cr = v(p.creatinina);
  const edad = v(p.edad);
  if (cr <= 0 || edad <= 0 || !p.sexo) {
    const manual = v(p.tfg);
    return manual > 0 ? manual : null; // null = no se pudo calcular (antes: 0 silencioso)
  }
  const isFemale = p.sexo === "M";
  const kappa = isFemale ? 0.7 : 0.9;
  const alpha = isFemale ? -0.241 : -0.302;
  const sexFactor = isFemale ? 1.012 : 1;

  const ratio = cr / kappa;
  const minTerm = Math.pow(Math.min(ratio, 1), alpha);
  const maxTerm = Math.pow(Math.max(ratio, 1), -1.200);
  const ageTerm = Math.pow(0.9938, edad);

  const egfr = 142 * minTerm * maxTerm * ageTerm * sexFactor;
  return Math.round(egfr);
}

/** Índices antropométricos */
export function calcIMC(p) {
  if (v(p.talla) <= 0) return null;
  return +(v(p.peso) / Math.pow(v(p.talla) / 100, 2)).toFixed(1);
}

export function calcICC(p) {
  if (v(p.cadera) <= 0) return null;
  return +(v(p.cintura) / v(p.cadera)).toFixed(2);
}

export function calcICA(p) {
  if (v(p.talla) <= 0) return null;
  return +(v(p.cintura) / v(p.talla)).toFixed(2);
}

/** Presión arterial media: PAM = (TAS + 2*TAD) / 3 */
export function calcPAM(p) {
  if (!p.tas || !p.tad) return null;
  return Math.round((v(p.tas) + 2 * v(p.tad)) / 3);
}

export function calcPulsePressure(p) {
  if (!p.tas || !p.tad) return null;
  return v(p.tas) - v(p.tad);
}

/** eAG (glucosa promedio estimada) vía ecuación ADAG: eAG = 28.7*A1c - 46.7 */
export function calcEAG(p) {
  const a1c = getA1cEfectiva(p).value;
  if (!a1c) return null;
  return Math.round(28.7 * a1c - 46.7);
}

/**
 * HbA1c ESTIMADA a partir de glucosa (inversa de la fórmula ADA/ADAG de eAG).
 * Solo es un aproximado — se usa únicamente cuando no hay HbA1c medida.
 * A1c_estimada = (glucosa + 46.7) / 28.7
 */
export function calcHbA1cEstimada(p) {
  if (!v(p.glucosa)) return null;
  return +(((v(p.glucosa) + 46.7) / 28.7).toFixed(1));
}

/**
 * HbA1c EFECTIVA: prioriza siempre el valor medido en laboratorio;
 * si no existe, cae de vuelta a la estimación por glucosa (tabla ADA).
 * Regresa { value, source: "medida" | "estimada" | null }.
 */
export function getA1cEfectiva(p) {
  if (v(p.hba1c) > 0) return { value: v(p.hba1c), source: "medida" };
  const est = calcHbA1cEstimada(p);
  return est !== null ? { value: est, source: "estimada" } : { value: 0, source: null };
}

/**
 * CORRECCIÓN (10-ago-2026, punto #2 de la auditoría): classifyLipidRisk y
 * buildHTNPlan usaban SOLO `a1c >= 6.5` como proxy de "paciente diabético"
 * para sus indicaciones automáticas (40-75a con diabetes / riesgo HTA
 * confirmado). Eso es el criterio DIAGNÓSTICO de diabetes, no el estado real
 * del paciente — un DM2 ya diagnosticado y bien controlado con tratamiento
 * (ej. A1c 6.0% con metformina) dejaba de calificar, aunque la guía no deja
 * de aplicar "40-75 años CON diabetes" solo porque el paciente esté en meta.
 * Antes de esta corrección el esquema de datos no tenía un campo dedicado de
 * diagnóstico (ver comentario que existía en buildHTNPlan) — ahora sí existe
 * `p.tipoDM` (agregado para EndoScreen), así que se usa como fuente primaria
 * y el corte de A1c queda como respaldo para quien no capturó el tipo.
 * NOTA: "Prediabetes" NO cuenta — la guía dice "con diabetes", no "en riesgo".
 */
export function hasDiagnosedDiabetes(p) {
  return p.tipoDM === "DM1" || p.tipoDM === "DM2" || getA1cEfectiva(p).value >= 6.5;
}

/** TMB (Mifflin-St Jeor) y GET (TMB * factor de actividad) */
export function calcTMB(p) {
  const base = 10 * v(p.peso) + 6.25 * v(p.talla) - 5 * v(p.edad);
  return Math.round(p.sexo === "H" ? base + 5 : base - 161);
}

export function calcGET(p) {
  return Math.round(calcTMB(p) * (v(p.actividad) || 1.2));
}

/** Lípidos: No-HDL y ApoB estimada */
export function calcNonHDL(p) {
  if (!p.col_total || !p.hdl) return null;
  return v(p.col_total) - v(p.hdl);
}

export function calcApoBEst(p) {
  const nonHDL = calcNonHDL(p);
  return nonHDL === null ? null : Math.round(nonHDL * 0.8);
}

// ELIMINADO (16-ago-2026, Dr. Ortega — catálogo de gobernanza clínica,
// categoría I "consistencia interna"): aquí vivía una segunda versión de
// `classifyFIB4(fib4)`, de un solo argumento, con corte plano 1.3 —
// código muerto desde el 8-ago-2026 (nunca se llamó desde ningún render;
// la versión real, `classifyFIB4(fib4, edad, vctLsm)`, vive en
// individualization.js y ajusta el corte a 2.0 en ≥65 años + exige
// VCTE-LSM). Se mantuvo "por si algún consumidor futuro la necesita" —
// pero esa misma decisión ya obligó a `render.js` (línea ~55) a llevar un
// comentario defensivo advirtiendo "no uses calc.classifyFIB4, ese no es
// el bueno": la prueba de que el código muerto YA era un riesgo activo, no
// solo teórico. Se elimina en vez de mantenerlo sincronizado a mano — si
// algún consumidor futuro necesita clasificar FIB-4, debe importar
// `classifyFIB4` de individualization.js (fuente única de verdad), nunca
// reintroducir una segunda implementación aquí.

/**
 * Meta de LDL y categoría de riesgo cardiovascular (AACE, simplificado).
 *
 * CORRECCIÓN CRÍTICA (encontrada al revisar por qué EndoLypids no funcionaba):
 * la versión anterior comparaba contra `p.tfg`, un campo que NUNCA se llena
 * en el formulario (el eGFR real se calcula aparte, vía calcEGFR, y nunca se
 * guarda de vuelta en `p.tfg`). Como v(undefined) = 0, la condición
 * "v(p.tfg) < 30" era SIEMPRE verdadera — es decir, TODO paciente caía
 * automáticamente en "MUY ALTO" con meta LDL 55, sin importar sus datos
 * reales. Se corrigió para usar el eGFR calculado de verdad (calcEGFR), con
 * guarda `egfr > 0` para no confundir "dato faltante" con "función renal
 * severamente reducida". También se corrigió la detección de ASCVD para usar
 * las banderas derivadas (flags.ascvd, que ahora agrupa enfermedad coronaria
 * + cerebrovascular + arterial periférica) en vez de buscar el string
 * "ASCVD" de un checkbox único que ya no existe.
 */
/**
 * ACTUALIZACIÓN (hallazgo de auditoría — "modelos de riesgo simplificados"):
 * esta clasificación siempre fue, y sigue siendo POR DEFECTO, una
 * simplificación educativa basada en comorbilidades/laboratorios discretos —
 * nunca implementó la ecuación PREVENT (AHA 2023) completa, y así se
 * documentaba honestamente en este mismo comentario. Se investigaron a fondo
 * los coeficientes numéricos publicados de PREVENT para codificarla aquí,
 * pero no están disponibles en ninguna fuente abierta verificable: la tabla
 * suplementaria de Circulation está tras paywall, MDCalc solo expone una
 * calculadora interactiva (no la fórmula), y el código fuente oficial de AHA
 * vive en un repositorio privado (GitHub AHA-DS-Analytics/PREVENT) que exige
 * aceptar un acuerdo institucional. Recalcular la fórmula de memoria habría
 * significado inventar coeficientes de una ecuación clínica — exactamente lo
 * que este proyecto se propuso nunca hacer.
 *
 * En su lugar, el motor ahora ACEPTA el % de riesgo PREVENT-ASCVD a 10 años
 * ya calculado por el médico en la calculadora oficial (heart.org/prevent,
 * MDCalc, etc.) como dato de entrada OPCIONAL (`p.preventAscvd10`), y aplica
 * los umbrales REALES de la Guía de Dislipidemia 2026 (que reemplazó a
 * ACC/AHA 2018 como referencia para estos cortes):
 *   <3%    Bajo        — estatina NO indicada, salvo LDL 160-189 mg/dL
 *                         (el criterio adicional "riesgo a 30a ≥10%" no se
 *                         evalúa aquí porque el motor no calcula PREVENT-30a)
 *   3-<5%  Limítrofe   — estatina moderada razonable tras decisión compartida
 *   5-<10% Intermedio  — al menos estatina moderada (alta es razonable)
 *   ≥10%   Alto        — estatina de alta intensidad
 * Si `p.preventAscvd10` no se captura, se usa la clasificación simplificada
 * de siempre — el campo `fuente` del resultado lo deja explícito para que la
 * interfaz nunca la presente con una precisión que no tiene.
 *
 * Las indicaciones "regardless of risk" de la misma guía (ASCVD establecida,
 * ERC severa, LDL≥190, o 40-75 años con diabetes/ERC) se evalúan PRIMERO y
 * no dependen de tener el % de PREVENT capturado.
 */
export function classifyLipidRisk(p) {
  const a1c = getA1cEfectiva(p).value;
  const egfr = calcEGFR(p);
  const flags = getPatientFlags(p);
  const age = v(p.edad);
  const ldl = v(p.ldl);

  if (flags.ascvd || (egfr > 0 && egfr < 30)) {
    return { label: "MUY ALTO", target: 55, reduccionMeta: "≥50%", statinIndicated: true, fuente: "indicación automática — ASCVD establecida / ERC severa (Guía de Dislipidemia 2026)" };
  }
  // LDL-C ≥190 mg/dL (hipercolesterolemia severa): estatina a dosis máxima
  // tolerada independientemente del riesgo calculado (indicación "regardless
  // of risk" de la Guía de Dislipidemia 2026).
  if (ldl >= 190) {
    return { label: "MUY ALTO", target: 70, reduccionMeta: "≥50%", statinIndicated: true, fuente: "indicación automática — LDL-C ≥190 mg/dL (Guía de Dislipidemia 2026)" };
  }
  // 40-75 años con ERC (eGFR<60): indicación automática de intensidad ALTA
  // (igual que el criterio "ALTO" ya existente, ahora también documentado
  // como indicación automática independiente del riesgo calculado).
  if (age >= 40 && age <= 75 && egfr > 0 && egfr < 60) {
    return { label: "ALTO", target: 70, reduccionMeta: "≥50%", statinIndicated: true, fuente: "indicación automática — 40-75a con ERC (Guía de Dislipidemia 2026)" };
  }
  // 40-75 años con diabetes SIN otros risk enhancers: indicación automática
  // de intensidad MODERADA (no alta — la diabetes sola, sin ASCVD
  // establecida ni otros factores de riesgo mayores, no basta para exigir
  // alta intensidad per ADA Standards of Care; alta intensidad se reserva
  // para ASCVD establecida, LDL≥190, o ERC, ya cubiertas en las ramas
  // anteriores). "Diabetes" = diagnóstico conocido (p.tipoDM) O criterio
  // A1c≥6.5% como respaldo si no se capturó el tipo (ver hasDiagnosedDiabetes).
  const diabetesDx = hasDiagnosedDiabetes(p);
  if (age >= 40 && age <= 75 && diabetesDx) {
    return { label: "MODERADO", target: 100, reduccionMeta: "≥30%", statinIndicated: true, fuente: "indicación automática — 40-75a con diabetes (Guía de Dislipidemia 2026 / ADA Standards of Care)" };
  }

  // Prevención primaria sin indicación automática: usar PREVENT-ASCVD si el
  // médico lo capturó; si no, caer al modelo simplificado de siempre.
  const prevent = v(p.preventAscvd10);
  if (prevent > 0) {
    if (prevent >= 10) return { label: "ALTO", target: 70, reduccionMeta: "≥50%", statinIndicated: true, fuente: "PREVENT-ASCVD 2026 (≥10% — alto)" };
    if (prevent >= 5) return { label: "MODERADO", target: 100, reduccionMeta: "≥30%", statinIndicated: true, fuente: "PREVENT-ASCVD 2026 (5-<10% — intermedio, al menos moderada; alta es razonable)" };
    if (prevent >= 3) return { label: "LIMITROFE", target: 100, reduccionMeta: "≥30%", statinIndicated: true, fuente: "PREVENT-ASCVD 2026 (3-<5% — limítrofe, razonable tras decisión compartida)" };
    if (ldl >= 160) return { label: "BAJO", target: 100, reduccionMeta: null, statinIndicated: true, fuente: "PREVENT-ASCVD 2026 (<3% — bajo, pero LDL 160-189 mg/dL: considerar estatina moderada)" };
    return { label: "BAJO", target: 115, reduccionMeta: null, statinIndicated: false, fuente: "PREVENT-ASCVD 2026 (<3% — bajo: estatina no indicada, refuerzo de estilo de vida)" };
  }

  // Fallback: clasificación simplificada de siempre (SIN PREVENT-ASCVD
  // capturado) — educativa, basada en comorbilidad/A1c/eGFR discretos.
  if (a1c > 8 || (egfr > 0 && egfr < 60)) {
    return { label: "ALTO", target: 70, reduccionMeta: "≥50%", statinIndicated: true, fuente: "simplificado — sin PREVENT-ASCVD capturado" };
  }
  // Antecedente familiar de ASCVD prematura Y tabaquismo activo: ambos son
  // "risk enhancers" reconocidos (ACC/AHA) que reclasifican hacia arriba
  // cuando no hay PREVENT-ASCVD capturado (AACE Algorithm Fig. 4, "Major
  // ASCVD Risk Factors").
  //
  // CORRECCIÓN (11-ago-2026, auditoría de secuencia — Dr. Ortega): el
  // formulario captura tabaquismo (fumador/cigarrillosDía/añosFumando) desde
  // el inicio del proyecto, pero hasta ahora solo se usaba para el índice
  // paquetes-año y el PDF — nunca alimentaba NINGUNA clasificación de riesgo
  // del motor. Un fumador activo con la misma A1c/eGFR que un no-fumador
  // caía siempre en la misma categoría, justo en la rama simplificada donde
  // más falta hace (sin PREVENT-ASCVD capturado, que sí incluye tabaquismo
  // en su fórmula real).
  const famASCVD = !!(p.antecedentesFamiliares && p.antecedentesFamiliares.includes("FAM_ASCVD"));
  const fumadorActivo = p.fumador === "si";
  if (a1c > 7) {
    return (famASCVD || fumadorActivo)
      ? { label: "ALTO", target: 70, reduccionMeta: "≥50%", statinIndicated: true, fuente: "simplificado — sin PREVENT-ASCVD capturado" }
      : { label: "MODERADO", target: 100, reduccionMeta: "≥30%", statinIndicated: true, fuente: "simplificado — sin PREVENT-ASCVD capturado" };
  }
  if (fumadorActivo) {
    return { label: "MODERADO", target: 100, reduccionMeta: "≥30%", statinIndicated: true, fuente: "simplificado — sin PREVENT-ASCVD capturado (tabaquismo activo como risk enhancer)" };
  }
  return { label: "BAJO", target: 115, reduccionMeta: null, statinIndicated: true, fuente: "simplificado — sin PREVENT-ASCVD capturado" };
}

/**
 * Categoría de presión arterial (AHA/ACC 2025, 5 categorías).
 *
 * CORRECCIÓN CRÍTICA (auditoría de guías, 8 de agosto de 2026): esta función
 * usaba una escala de estilo ESH 2023 ("HTA G1/G2/G3", cortes en 140/90,
 * 160/100, 180/110) que NO coincidía con la escala AHA/ACC 2025 que ya usa
 * el panel de Individualización (individualization.js -> classifyBP), que es
 * la guía de referencia real de este proyecto para hipertensión. Esto hacía
 * que la MISMA lectura de presión arterial del MISMO paciente se mostrara con
 * una categoría y un color distintos según la pestaña (EndoPressure vs.
 * Individualización) — una inconsistencia real que un médico podría notar y
 * que no tenía justificación clínica. Se alineó a los 5 cortes exactos de la
 * Tabla 4 (AHA/ACC 2025, verificados contra el PDF): Normal <120/<80, Elevada
 * 120-129/<80, Etapa 1 130-139/80-89, Etapa 2 ≥140/≥90, Crisis Hipertensiva
 * (guía la llama "severe hypertension") >180/120.
 *
 * VERIFICACIÓN DE GOBERNANZA (16-ago-2026, Dr. Ortega): se releyó el PDF
 * completo de la guía (2025 AHA/ACC/AANP/.../SGIM Guideline, Circulation.
 * 2025;152:e114–e218 — NO existe una edición "2026" de esta guía; la del
 * PDF cargado es la más actual disponible). Los 4 cortes de la Tabla 4
 * (Normal/Elevada/Etapa 1/Etapa 2) coinciden exactamente, sin cambios.
 *
 * DISCREPANCIA ENCONTRADA Y RESUELTA (16-ago-2026): el texto de la guía
 * define "severe hypertension"/"hypertensive emergency" con ">180/120 mm Hg"
 * — ESTRICTAMENTE mayor, no "≥180/120" — citado así 5 veces de forma
 * consistente en el documento (ej. "Severe hypertension... defined as
 * blood pressure >180/120 mm Hg"; "hypertensive emergency (BP >180 and/or
 * >120 mm Hg...)"). Este código usa "≥180/120" (s >= 180 || d >= 120)
 * desde su creación. Decisión EXPLÍCITA del Dr. Ortega tras revisar el
 * hallazgo: se MANTIENE "≥180/120" deliberadamente — un paciente
 * exactamente en 180/120 sigue activando el guardrail de urgencia (más
 * conservador del lado de la seguridad, aunque no coincida con la letra
 * exacta del texto de la guía). Mismo criterio aplicado consistentemente
 * en individualization.js -> classifyBP y en redflags.js ->
 * CRISIS_HIPERTENSIVA — los tres puntos usan ">=", ninguno usa ">", por
 * diseño y no por descuido.
 */
export function classifyBP(p) {
  const s = v(p.tas), d = v(p.tad);
  if (s >= 180 || d >= 120) return { label: "CRISIS HIPERTENSIVA", color: "bg-red-700" };
  if (s >= 140 || d >= 90) return { label: "HTA ETAPA 2", color: "bg-red-500" };
  if (s >= 130 || d >= 80) return { label: "HTA ETAPA 1", color: "bg-orange-500" };
  if (s >= 120) return { label: "ELEVADA", color: "bg-amber-500" };
  return { label: "NORMAL", color: "bg-emerald-500" };
}

// ELIMINADO (16-ago-2026, Dr. Ortega — catálogo de gobernanza clínica,
// categoría I "consistencia interna"): aquí vivía `classifyGlobalRisk(p)`,
// código muerto desde el 8-ago-2026 (nunca se llamó desde ningún lado del
// proyecto — reemplazada por el panel de Individualización + Estratificación
// Global). Mismo razonamiento que la eliminación de `classifyFIB4` justo
// arriba: mantener una segunda implementación "por si acaso" es exactamente
// el patrón que ya produjo bugs reales en este proyecto (la inconsistencia
// de escalas de `classifyBP`, el bug fantasma de `p.tfg`) — se elimina en
// vez de conservarla sincronizada a mano. La estratificación de riesgo
// global vigente vive en individualization.js.

/** Curva glucémica simulada (EndoSimulators) a partir de macros de una comida */
/**
 * EndoSimulators: curva glucémica posprandial simulada.
 *
 * MODELO (educativo/ilustrativo, NO una predicción validada para el
 * paciente individual — el objetivo es enseñar la fisiología del pico
 * posprandial, no reemplazar un CGM real):
 *  - Los carbohidratos generan un pico temprano (~1 h) que decae rápido.
 *  - Proteína+grasa generan un efecto más tardío y prolongado (~3 h),
 *    por el retraso del vaciamiento gástrico y la gluconeogénesis tardía.
 *  - Se usa una curva tipo impulso-respuesta (t·e^(1-t)) para que cada
 *    componente suba, alcance su pico y baje de forma suave — en vez de
 *    los 7 puntos rígidos de la versión anterior, ahora se muestrea cada
 *    30 minutos durante 6 horas (13 puntos) para una proyección más fina.
 *
 * Regresa { labels, data } — mismo formato que projectWeightLoss(), para
 * que charts.js pueda pintar labels y data juntos en cada actualización.
 */
const CURVE_STEP_H = 0.5;
const CURVE_END_H = 6;

function curveTimeline() {
  const t = [];
  for (let h = 0; h <= CURVE_END_H; h += CURVE_STEP_H) t.push(+h.toFixed(1));
  return t;
}

function curveLabels() {
  return curveTimeline().map((h) => (h === 0 ? "Ayuno" : `${h}h`));
}

/** Forma impulso-respuesta: sube, alcanza pico en t=peakAt, decae suavemente. */
function impulseResponse(t, peakAt, amplitude) {
  if (amplitude <= 0) return 0;
  const x = (t - (peakAt - 1)) / 1; // normaliza para que el pico caiga en t=peakAt
  if (x <= 0) return 0;
  return amplitude * x * Math.exp(1 - x);
}

function buildCurveData(baseline, carbPeak, fatProtPeak, delayHoras = 0) {
  return curveTimeline().map((t) => {
    const tAjustado = Math.max(0, t - delayHoras);
    const carb = impulseResponse(tAjustado, 1, carbPeak);
    const fatProt = impulseResponse(tAjustado, 3, fatProtPeak);
    return Math.max(40, Math.round(baseline + carb + fatProt));
  });
}

export function simulateGlucoseCurve(p, carbsG, proteinG, fatG) {
  const baseline = v(p.glucosa) || 90;
  const carbPeak = carbsG * 3;
  const fatProtPeak = (proteinG * 0.5 + fatG * 0.9) * 1.5;
  return { labels: curveLabels(), data: buildCurveData(baseline, carbPeak, fatProtPeak) };
}

/**
 * Curva "con tratamiento": aplica el efecto simplificado de cada fármaco
 * antidiabético/insulina ya agregado a EndoNote (ver pharma-db.js ->
 * `efectoCurva`) sobre la MISMA comida simulada, para contrastar visualmente
 * cómo cambiaría el comportamiento glucémico. Es una simulación educativa
 * basada en el mecanismo de acción general de cada clase — NO sustituye
 * una curva de monitoreo continuo real del paciente.
 */
export function simulateGlucoseCurveConTratamiento(p, carbsG, proteinG, fatG, drugIds = []) {
  const baseline = v(p.glucosa) || 90;
  const carbPeak = carbsG * 3;
  const fatProtPeak = (proteinG * 0.5 + fatG * 0.9) * 1.5;

  let peakReduction = 0;
  let baselineReduction = 0;
  let delayHoras = 0;
  drugIds.forEach((id) => {
    const f = DB_PHARMA.find((d) => d.id === id);
    const efecto = f?.efectoCurva;
    if (!efecto) return;
    peakReduction += efecto.peakReduction || 0;
    baselineReduction += efecto.baselineReduction || 0;
    delayHoras += efecto.delayHoras || 0;
  });
  // Topes fisiológicos razonables: ningún combo de fármacos "aplana a cero"
  // ni retrasa el pico más allá de lo clínicamente plausible en este modelo simplificado.
  peakReduction = Math.min(peakReduction, 0.8);
  delayHoras = Math.min(delayHoras, 1.5);

  const baselineAjustado = Math.max(60, baseline - baselineReduction);
  const factor = 1 - peakReduction;
  return buildCurveData(baselineAjustado, carbPeak * factor, fatProtPeak * factor, delayHoras);
}

/**
 * EndoSimulators — Presión Arterial: curva circadiana de 24 h.
 *
 * MODELO (educativo/ilustrativo, mismo espíritu que simulateGlucoseCurve):
 *  - Ritmo circadiano normal: descenso nocturno (~10-15%) con valle hacia
 *    las 02:00-04:00 y ascenso matutino ("morning surge") con pico hacia
 *    las 08:00-12:00, seguido de una meseta diurna y descenso vespertino.
 *    Se modela con una tabla de anclas cada 2 h (factor relativo al
 *    promedio diurno del paciente) interpolada linealmente a resolución
 *    horaria — mismo principio de suavizado por interpolación que la
 *    curva de glucosa, adaptado a un patrón de 24 h en vez de un pico
 *    posprandial único.
 *  - ANCLAJE: la curva se ancla a la TA real del paciente (p.tas/p.tad)
 *    cuando existe; si no hay dato, usa Etapa 1 (135/85 mmHg) como
 *    respaldo — EXACTAMENTE el mismo patrón de fallback que
 *    simulateGlucoseCurve usa para p.glucosa -> 90 mg/dL (decisión
 *    confirmada explícitamente por el Dr. Ortega).
 *  - EFECTO FARMACOLÓGICO (efectoPA en pharma-db.js): envolvente tipo
 *    "ataque-decaimiento" (onsetHoras -> picoHoras -> duracionHoras),
 *    anclada a la hora de toma que el médico captura en la pestaña de
 *    Presión Arterial de EndoSimulators. Fármacos de 2 tomas al día
 *    (tomasPorDia: 2, ej. Carvedilol, y Enalapril a dosis de
 *    mantenimiento "20 mg BID") generan DOS envolventes independientes y
 *    visibles, una por cada toma.
 *  - `duracionHoras` en efectoPA representa la ventana de cobertura
 *    antihipertensiva VISIBLE dentro de un día de 24 h para fines de esta
 *    gráfica educativa — NO es literalmente la vida media terminal del
 *    fármaco (ese dato, cuando aplica, ya vive por separado en
 *    `vidaMediaHoras`). Es una simplificación deliberada y documentada,
 *    igual que el resto de este modelo.
 *  - NO es una predicción farmacocinética validada para el paciente
 *    individual — es una herramienta educativa para visualizar CÓMO el
 *    horario de dosificación se relaciona con la cobertura a lo largo
 *    del día.
 */
const BP_STEP_H = 1;
const BP_END_H = 23;

function bpTimeline() {
  const t = [];
  for (let h = 0; h <= BP_END_H; h += BP_STEP_H) t.push(h);
  return t;
}

function bpLabels() {
  return bpTimeline().map((h) => `${String(h).padStart(2, "0")}:00`);
}

// Tabla de anclas del ritmo circadiano normal (hora -> factor relativo al
// promedio diurno). Interpolada linealmente entre anclas a resolución horaria.
const CIRCADIAN_ANCHORS = [
  [0, 0.94], [2, 0.88], [4, 0.90], [6, 0.95], [8, 1.05], [10, 1.08],
  [12, 1.06], [14, 1.04], [16, 1.05], [18, 1.03], [20, 1.00], [22, 0.97], [24, 0.94],
];

function circadianFactor(hourFloat) {
  const h = ((hourFloat % 24) + 24) % 24;
  for (let i = 0; i < CIRCADIAN_ANCHORS.length - 1; i++) {
    const [h0, f0] = CIRCADIAN_ANCHORS[i];
    const [h1, f1] = CIRCADIAN_ANCHORS[i + 1];
    if (h >= h0 && h <= h1) {
      const x = (h - h0) / (h1 - h0);
      return f0 + (f1 - f0) * x;
    }
  }
  return 1;
}

/**
 * Curva basal circadiana (sin fármacos), anclada a la TA real del paciente
 * o a Etapa 1 (135/85) de respaldo. `fallback: true` indica que se usó el
 * respaldo (para poder avisar al médico en la UI, igual que se documenta
 * el origen "medida"/"estimada" de la A1c en otras partes del dashboard).
 */
export function simulateBPBaseline(p) {
  const hasReal = v(p.tas) > 0 && v(p.tad) > 0;
  const tasMean = hasReal ? v(p.tas) : 135;
  const tadMean = hasReal ? v(p.tad) : 85;
  const labels = bpLabels();
  const sist = [];
  const diast = [];
  bpTimeline().forEach((h) => {
    const f = circadianFactor(h);
    sist.push(Math.round(tasMean * f));
    diast.push(Math.round(tadMean * f));
  });
  return { labels, sist, diast, fallback: !hasReal };
}

/** Envolvente "ataque-decaimiento" (0 a 1) para el efecto de una sola toma,
 * en función de las horas transcurridas desde esa toma. Sube suavemente de
 * onset a pico, y decae suavemente de pico a duracion (smoothstep en ambos
 * tramos, para evitar quiebres angulosos en la curva). */
function doseEnvelope(hoursSinceDose, onset, pico, duracion) {
  if (hoursSinceDose < onset || hoursSinceDose > duracion) return 0;
  if (hoursSinceDose <= pico) {
    const x = (hoursSinceDose - onset) / Math.max(0.1, pico - onset);
    return x * x * (3 - 2 * x);
  }
  const x = (hoursSinceDose - pico) / Math.max(0.1, duracion - pico);
  return 1 - x * x * (3 - 2 * x);
}

/** Suma el efecto de TODAS las tomas de un fármaco (considerando también la
 * toma "de ayer" a la misma hora, por si su cola todavía cubre horas
 * tempranas del día actual — así se ve el descenso justo antes de la
 * siguiente toma, un fenómeno farmacológico real). */
function drugEffectAt(t, horas, efectoPA) {
  let sist = 0, diast = 0;
  horas.forEach((doseHour) => {
    [doseHour, doseHour - 24].forEach((d) => {
      const factor = doseEnvelope(t - d, efectoPA.onsetHoras, efectoPA.picoHoras, efectoPA.duracionHoras);
      sist += factor * efectoPA.reduccionSistolica;
      diast += factor * efectoPA.reduccionDiastolica;
    });
  });
  return { sist, diast };
}

/**
 * Curva "con tratamiento": aplica el efecto simplificado de cada
 * antihipertensivo ya agregado a EndoNote, en la(s) hora(s) de toma que el
 * médico capturó en la pestaña de Presión Arterial (ver simulatorBP.js).
 * `dosisConfig`: [{ drugId, horas: [8] | [8, 20] }, ...] (horas en formato
 * decimal, ej. 20.5 = 20:30).
 */
export function simulateBPCurveConTratamiento(p, dosisConfig = []) {
  const base = simulateBPBaseline(p);
  const sist = [];
  const diast = [];
  bpTimeline().forEach((t, i) => {
    let redSist = 0, redDiast = 0;
    dosisConfig.forEach((cfg) => {
      const f = DB_PHARMA.find((d) => d.id === cfg.drugId);
      const efecto = f?.efectoPA;
      if (!efecto || !cfg.horas || !cfg.horas.length) return;
      const eff = drugEffectAt(t, cfg.horas, efecto);
      redSist += eff.sist;
      redDiast += eff.diast;
    });
    // Tope fisiológico razonable, mismo espíritu que el tope de la curva de glucosa.
    redSist = Math.min(redSist, 35);
    redDiast = Math.min(redDiast, 20);
    sist.push(Math.max(80, Math.round(base.sist[i] - redSist)));
    diast.push(Math.max(45, Math.round(base.diast[i] - redDiast)));
  });
  return { labels: base.labels, sist, diast };
}

/** Proyección de pérdida de peso en 12 semanas dado un déficit calórico diario */
export function projectWeightLoss(p, dailyDeficit) {
  const weeklyLossKg = (dailyDeficit * 7) / 7700;
  const labels = [];
  const data = [];
  let currentWeight = v(p.peso);
  for (let i = 0; i <= 12; i++) {
    labels.push("Sem " + i);
    data.push(currentWeight.toFixed(1));
    currentWeight -= weeklyLossKg;
  }
  return { labels, data };
}

/**
 * Índice tabáquico (paquetes-año): (cigarrillos/día × años fumando) / 20.
 * Fórmula estándar de la literatura para cuantificar carga tabáquica acumulada.
 */
export function calcIndiceTabaquico(p) {
  const cig = v(p.cigarrillosDia);
  const anios = v(p.aniosFumando);
  if (!cig || !anios) return null;
  return +((cig * anios) / 20).toFixed(1);
}

/** Volumen (ml) y graduación alcohólica (%vol) típicos por bebida estándar. */
export const ALCOHOL_PRESETS = {
  cerveza: { ml: 355, pct: 5, label: "Cerveza (355 ml, 5% vol)" },
  vino: { ml: 148, pct: 12, label: "Vino (148 ml, 12% vol)" },
  licor: { ml: 44, pct: 40, label: "Licor destilado (44 ml, 40% vol)" },
};

/** Gramos de alcohol puro por bebida: ml × (%vol/100) × 0.789 (densidad del etanol). */
export function calcGramosPorBebida(tipo, mlCustom, pctCustom) {
  const preset = ALCOHOL_PRESETS[tipo];
  const ml = preset ? preset.ml : v(mlCustom);
  const pct = preset ? preset.pct : v(pctCustom);
  if (!ml || !pct) return null;
  return +(ml * (pct / 100) * 0.789).toFixed(1);
}

/** Gramos de alcohol totales por semana = gramos/bebida × bebidas/semana. */
export function calcAlcoholSemanal(p) {
  const gramosPorBebida = calcGramosPorBebida(p.alcoholTipo, p.alcoholMlCustom, p.alcoholPctCustom);
  const bebidas = v(p.alcoholBebidasSemana);
  if (gramosPorBebida === null || !bebidas) return null;
  return +(gramosPorBebida * bebidas).toFixed(1);
}

/* =========================================================================
 * MOTOR DE DECISIÓN TERAPÉUTICA CATEGÓRICA
 * Basado en AACE Algorithm for Management of Adults With T2D — 2026 Update,
 * Algorithm Fig. 6 (Comorbidities- and Complications-Centric), Fig. 7
 * (Glucose-Centric), Fig. 5 (Hipertensión, ahora alineado a AHA/ACC 2025)
 * y Fig. 4 (Dislipidemia, escalonamiento estatina->ezetimibe->PCSK9i),
 * superpuesto con un eje de costo/acceso (`p.nivelAcceso`) para maximizar
 * apego: "Choice of therapy considers ease of use and access" (Principio 4).
 *
 * Códigos esperados en `p.comorbilidades` (personales, array de strings):
 *   "IC"             Insuficiencia cardíaca
 *   "ERC"            Enfermedad renal crónica (además de eGFR/UACR calculados)
 *   "IAM_ANGINA"      Enfermedad coronaria (IAM previo, angina, revascularización)
 *   "EVC_AIT"         Enfermedad cerebrovascular (ACV/AIT previo)
 *   "EAP"             Enfermedad arterial periférica
 *   (las 3 anteriores reemplazan al antiguo checkbox único "ASCVD" -- muy
 *   vago para uso clínico -- y en conjunto siguen determinando flags.ascvd;
 *   EVC_AIT además activa flags.stroke, usado para priorizar fármacos con
 *   beneficio específico en stroke, ej. Dulaglutida/Semaglutida/Tirzepatida)
 *   "MASLD"          Enfermedad hepática esteatósica metabólica
 *   "OBESIDAD"       Obesidad (además del IMC calculado)
 *   "OSTEOARTRITIS"  Osteoartritis (ORCD moderada en estadificación ABCD)
 *   "SAOS"           Síndrome de apnea obstructiva del sueño (ORCD severa en ABCD)
 *   "PANCREATITIS"   Pancreatitis previa (contraindica GLP-1/GIP)
 *   "GASTROPARESIA"  Gastroparesia (contraindica GLP-1/GIP)
 *   "ANGIOEDEMA_IECA" Angioedema previo con IECA (contraindicación ABSOLUTA a
 *                     TODA la clase IECA — mecanismo mediado por bradicinina,
 *                     no hay "IECA más seguro" dentro de la clase; el motor
 *                     debe saltar directo a ARA-II, que tiene riesgo de
 *                     reactividad cruzada mucho menor aunque no nulo)
 *   "TOS_IECA"       Tos seca documentada con IECA previo (efecto de clase,
 *                     también mediado por bradicinina — no se reintenta con
 *                     otro IECA, se cambia permanentemente a ARA-II)
 *   "HIPOGLUCEMIA_PERSONAL" Hipoglucemia severa PERSONAL previa (no solo
 *                     antecedente familiar) — el dato más relevante
 *                     clínicamente para evitar sulfonilureas/agentes de alto
 *                     riesgo de hipoglucemia. Antes solo existía
 *                     FAM_HIPOGLUCEMIA (antecedente FAMILIAR); se combinan
 *                     ambos en flags.hipoRisk.
 *
 * Códigos esperados en `p.antecedentesFamiliares` (array de strings):
 *   "FAM_ASCVD"              ASCVD prematura en familiar de 1er grado (H<55, M<65 años)
 *   "FAM_HIPERCOLESTEROLEMIA" Hipercolesterolemia familiar / LDL muy elevado en la familia
 *                             -> activa flags.fh, habilita escalar a PCSK9i aunque no
 *                             haya ASCVD establecida todavía (antes era un vacío de datos)
 *   "FAM_MEN2A"        Antecedente familiar de MEN2A (contraindica GLP-1/GIP)
 *   "FAM_CA_MEDULAR"   Antecedente familiar de carcinoma medular de tiroides (contraindica GLP-1/GIP)
 *   "FAM_HIPOGLUCEMIA" Hipoglucemias severas en la familia (favorece agentes de bajo riesgo)
 *
 * `p.nivelAcceso` (string): "bajo" | "medio" | "alto" — costo/acceso del paciente.
 *
 * `p.medicacionActual` (objeto, opcional): fármacos YA en uso antes de esta
 * consulta, por categoría: { antidiabetic: [...], htn: [...], lipid: [...] }.
 * Cada entrada: { id: "<id de DB_PHARMA>", isMax: bool (dosis máxima tolerada
 * ya alcanzada) }. AUSENCIA TOTAL de una categoría (o del campo completo)
 * significa paciente "virgen" de tratamiento en esa categoría — el motor se
 * comporta exactamente igual que antes de que este concepto existiera
 * (ver getMedicationState()).
 * ========================================================================= */

const ACCESS_TIER = { bajo: 1, medio: 2, alto: 3 };

function hasComorb(p, code) {
  return !!(p.comorbilidades && p.comorbilidades.includes(code));
}

function hasFamHx(p, code) {
  return !!(p.antecedentesFamiliares && p.antecedentesFamiliares.includes(code));
}

/** Deriva las banderas clínicas que gobiernan la selección terapéutica. */
export function getPatientFlags(p) {
  const egfr = calcEGFR(p);
  // CORRECCIÓN DE GOBERNANZA (16-ago-2026): antes `|| 0` convertía el `null`
  // explícito de calcIMC (sin talla capturada) de vuelta a `0` silencioso
  // antes de usarlo — reintroducía la ambigüedad "faltante vs. cero real"
  // justo aquí, aunque calcIMC ya devolvía el valor correcto. Los usos de
  // `imc` abajo (`imc >= 30`, `imc >= 27`) se comportan igual con `null`
  // que con `0` (ambos fallan la comparación), así que quitar el `|| 0` no
  // cambia ningún resultado — solo deja de destruir la señal de "no
  // evaluado" para quien la necesite en el futuro.
  const imc = calcIMC(p);
  const fib4 = calcFIB4(p);
  return {
    egfr,
    imc,
    ic: hasComorb(p, "IC"),
    erc: hasComorb(p, "ERC") || (egfr > 0 && egfr < 60) || v(p.uacr) > 30,
    // ASCVD establecida = cualquiera de las 3 formas específicas (coronaria,
    // cerebrovascular, arterial periférica). "stroke" es un flag aparte para
    // poder priorizar fármacos con beneficio probado específicamente en ACV
    // (Dulaglutida/Semaglutida/Tirzepatida), antes nunca usado pese a existir
    // en pharma-db.js.
    ascvd: hasComorb(p, "IAM_ANGINA") || hasComorb(p, "EVC_AIT") || hasComorb(p, "EAP"),
    stroke: hasComorb(p, "EVC_AIT"),
    masld: hasComorb(p, "MASLD") || fib4 > 1.3,
    men2: hasFamHx(p, "FAM_MEN2A") || hasFamHx(p, "FAM_CA_MEDULAR"),
    // CORRECCIÓN (hallazgo de auditoría, "algo más que no hayamos cubierto"):
    // antes solo existía el antecedente FAMILIAR de hipoglucemia severa. El
    // antecedente PERSONAL (que el paciente MISMO ya haya tenido
    // hipoglucemias severas) es al menos igual de relevante clínicamente
    // para evitar sulfonilureas/agentes de alto riesgo y nunca se podía
    // registrar. Se combinan ambos.
    hipoRisk: hasFamHx(p, "FAM_HIPOGLUCEMIA") || hasComorb(p, "HIPOGLUCEMIA_PERSONAL"),
    // Hipercolesterolemia familiar: cierra el vacío de datos que impedía
    // escalar a PCSK9i en pacientes sin ASCVD establecida pero con FH.
    fh: hasFamHx(p, "FAM_HIPERCOLESTEROLEMIA"),
    // CORRECCIÓN (11-ago-2026, hallazgo de auditoría de secuencia — Dr.
    // Ortega): el motor no tenía NINGÚN dato de paciente que pudiera activar
    // seguridad en embarazo, pese a que el catálogo ya documentaba en texto
    // qué fármacos son de elección (Metildopa, Labetalol) o contraindicados
    // (IECA/ARA-II, estatinas, iSGLT2, GLP-1/GIP, etc.) en esa condición. Se
    // agrega el flag y su bloqueo por clase en `currentDrugIssue`/`contra`
    // (ver pharma-db.js — 64 fármacos marcados) — antes una paciente
    // embarazada recibía exactamente las mismas recomendaciones que
    // cualquier otra.
    // 12-ago-2026: el check único "EMBARAZO" se separó en el formulario en
    // dos checks independientes (embarazo actual / posibilidad de embarazo,
    // a petición del Dr. Ortega) — ambos activan el mismo bloqueo de
    // seguridad, el motor no distingue entre ellos para efectos de riesgo
    // farmacológico (el bloqueo aplica igual mientras exista la posibilidad).
    embarazo: hasComorb(p, "EMBARAZO_ACTUAL") || hasComorb(p, "EMBARAZO_POSIBLE"),
    obesidad: imc >= 30 || hasComorb(p, "OBESIDAD") || (imc >= 27 && (hasComorb(p, "IAM_ANGINA") || hasComorb(p, "EVC_AIT") || hasComorb(p, "EAP") || hasComorb(p, "IC") || v(p.tas) >= 140)),
    // Complicaciones relacionadas con adiposidad (ORCD, AACE ABCD) que antes se
    // capturaban en el formulario pero nunca se leían en ningún lado: alimentan
    // la estadificación ABCD en individualization.js (ver deriveOrcdFromFlags).
    osteoartritis: hasComorb(p, "OSTEOARTRITIS"),
    saos: hasComorb(p, "SAOS"),
    // Contraindicaciones/precauciones para la clase GLP-1/GIP (agonistas del
    // receptor de GLP-1 y coagonistas GIP/GLP-1): pancreatitis previa y
    // gastroparesia son contraindicaciones reconocidas (retraso del vaciamiento
    // gástrico aditivo / riesgo de recurrencia de pancreatitis).
    pancreatitis: hasComorb(p, "PANCREATITIS"),
    gastroparesia: hasComorb(p, "GASTROPARESIA"),
    // IECA vs ARA-II: ambas contraindicaciones son mediadas por bradicinina y
    // son efecto DE CLASE (no de un fármaco individual) — un angioedema o tos
    // con cualquier IECA excluye TODA la clase IECA, nunca solo "cambiar de
    // IECA". El ARA-II es la alternativa porque no eleva bradicinina.
    angioedemaIeca: hasComorb(p, "ANGIOEDEMA_IECA"),
    tosIeca: hasComorb(p, "TOS_IECA"),
    // CORRECCIÓN (misma ronda — hallazgo al revisar el grupo de obesidad):
    // Fentermina, Fentermina/Topiramato y Naltrexona/Bupropión son
    // estimulantes/simpaticomiméticos con contraindicación reconocida en
    // enfermedad cardiovascular establecida e HTA NO controlada (elevan
    // FC/PA — ficha técnica de fentermina; bupropión también contraindicado
    // en HTA no controlada). ASCVD establecida ya desvía al paciente fuera de
    // esta rama (entra al set-cover de comorbilidades), pero HTA en etapa 2
    // SIN ASCVD documentada aún no se revisaba en absoluto antes de elegir
    // el agente de pérdida de peso por costo.
    htnDescontrolada: v(p.tas) >= 140 || v(p.tad) >= 90,
    hiperglucemiaSevera: getA1cEfectiva(p).value > 10 || v(p.glucosa) > 300,
    accesoTier: ACCESS_TIER[p.nivelAcceso] || 2, // default: acceso medio
    // CORRECCIÓN (10-ago-2026, hallazgo del Dr. Ortega: "¿cómo registra el
    // médico CUÁL AINE/antipsicótico/TARV usa el paciente?"): litio, AINE,
    // antipsicótico de alto riesgo metabólico y TARV potenciado eran banderas
    // sí/no sueltas en el formulario, sin fármaco específico — no vivían en
    // Medicación Actual, así que el expediente/PDF tampoco los mostraba con
    // nombre. Se migraron a la nueva categoría "otros" de Medicación Actual
    // (ver pharma-db.js); estas 4 flags ahora se DERIVAN de qué fármaco
    // específico está marcado ahí, en vez de leer un booleano directo del
    // formulario — el resto del motor (currentDrugIssue, psychiatry.js,
    // hiv-art.js, polypharmacy.js) sigue consumiendo `flags.litio`/
    // `flags.tarvInhibidorProteasa`/`flags.aineReciente`/
    // `flags.antipsicoticoAltoRiesgo` exactamente igual, sin cambios.
    litio: getMedicationState(p, "otros").entries.some((e) => e.drug.id === "LITIO"),
    tarvInhibidorProteasa: getMedicationState(p, "otros").entries.some((e) => e.drug.grp === "TARV Potenciado"),
    aineReciente: getMedicationState(p, "otros").entries.some((e) => e.drug.grp === "AINE"),
    antipsicoticoAltoRiesgo: getMedicationState(p, "otros").entries.some((e) => e.drug.grp === "Antipsicótico Alto Riesgo Metabólico"),
  };
}

/**
 * Motivo de contraindicación/inseguridad de UN fármaco dado el estado clínico
 * ACTUAL del paciente (mismas reglas que `filterSafe`, pero devuelve el
 * motivo en texto en vez de solo filtrar) — o `null` si no hay problema.
 *
 * CORRECCIÓN (misma ronda de auditoría que el hallazgo de metformina/eGFR<30):
 * `filterSafe` solo se aplicaba al armar el POOL de candidatos para una
 * recomendación NUEVA. Las ramas de "ya en tratamiento" (`state.entries`,
 * usadas para decidir si solo hay que titular un fármaco YA prescrito) nunca
 * pasaban por ningún filtro de seguridad — un fármaco vigente que se volvía
 * contraindicado por una condición NUEVA (angioedema/tos con un IECA ya
 * prescrito, pancreatitis en alguien ya en GLP-1/GIP, MEN2A familiar
 * detectado después, eGFR que cae por debajo del mínimo seguro del fármaco,
 * etc.) seguía recibiendo "titular a dosis máxima" sin ninguna advertencia.
 * Esta función se usa en cada punto de continuación/titulación para volver a
 * correr la misma revisión de seguridad, no solo al elegir un fármaco nuevo.
 */
function currentDrugIssue(drug, flags) {
  if (drug.egfrMin && flags.egfr > 0 && flags.egfr < drug.egfrMin) {
    return `eGFR ${flags.egfr} mL/min/1.73m² por debajo del mínimo seguro (${drug.egfrMin}) para este fármaco`;
  }
  // DOMINIO 3 — Caso 51: bloqueo por clase (IECA/ARA-II/Tiazida) cuando hay
  // litio concurrente — ver psychiatry.js. Se revisa por `drug.grp`, no por
  // `drug.contra` (esa lista es por fármaco individual; esta interacción es
  // de CLASE completa, igual que angioedema/tos con IECA más abajo).
  const lithiumIssue = getLithiumInteractionReason(drug, flags);
  if (lithiumIssue) return lithiumIssue;
  // DOMINIO 5 — Caso 54: bloqueo absoluto de Simvastatina con TARV inhibidor
  // de proteasa/cobicistat — ver hiv-art.js. Por `drug.id`, no `drug.grp`
  // (Pravastatina/Pitavastatina comparten grupo con Simvastatina y son
  // precisamente las alternativas preferidas).
  const hivArtIssue = getHivArtStatinBlockReason(drug, flags);
  if (hivArtIssue) return hivArtIssue;
  if (drug.contra && drug.contra.length) {
    if (drug.contra.includes("IC") && flags.ic) return "contraindicado por Insuficiencia Cardíaca";
    if (drug.contra.includes("MEN2") && flags.men2) return "contraindicado por antecedente familiar de MEN2A/carcinoma medular de tiroides";
    if (drug.contra.includes("HIPOGLUCEMIA") && flags.hipoRisk) return "contraindicado por antecedente de hipoglucemias severas";
    if (drug.contra.includes("GLP1_GIP") && (flags.pancreatitis || flags.gastroparesia)) return "contraindicado por pancreatitis previa/gastroparesia";
    if (drug.contra.includes("ANGIOEDEMA") && flags.angioedemaIeca) return "contraindicado por angioedema previo con IECA";
    if (drug.contra.includes("TOS_IECA") && flags.tosIeca) return "contraindicado por tos documentada con IECA";
    if (drug.contra.includes("ESTIMULANTE_CV") && (flags.ascvd || flags.htnDescontrolada)) return "contraindicado por enfermedad cardiovascular/HTA no controlada (estimulante simpaticomimético)";
    if (drug.contra.includes("EMBARAZO") && flags.embarazo) return "contraindicado/no recomendado en embarazo — valorar alternativa segura (Metildopa/Labetalol/Nifedipino en HTA, Insulina en diabetes)";
  }
  return null;
}

/** Filtra un listado de fármacos por seguridad: eGFR mínimo y contraindicaciones. */
function filterSafe(list, flags) {
  return list.filter((f) => currentDrugIssue(f, flags) === null);
}

/**
 * AVISO NO BLOQUEANTE de seguridad renal no verificada (16-ago-2026, Dr.
 * Ortega — capa central de "dato faltante" del catálogo de gobernanza
 * clínica). A diferencia de `currentDrugIssue` (que BLOQUEA cuando el eGFR
 * calculado está por debajo del mínimo seguro de un fármaco), esta función
 * nunca excluye nada del plan — solo revisa, al final de cada motor de plan
 * (antidiabético/HTN/lípidos/obesidad), si `flags.egfr` quedó en `null`
 * (no se pudo calcular por falta de creatinina/edad/sexo, y tampoco había
 * `p.tfg` manual — ver calcEGFR). Si es así, cualquier fármaco del plan con
 * `egfrMin` definido (>0) recibe una advertencia visible de "seguridad
 * renal no verificada", en vez de recomendarse como si el eGFR fuera normal
 * (el bug original: `flags.egfr === 0` se usaba para SÍ iniciar Metformina).
 * Decisión explícita del Dr. Ortega: permitir, no bloquear — el médico
 * decide con el aviso en pantalla, no el sistema por él.
 *
 * No se anota sobre tarjetas de "SUSPENDER" (esas ya son una alerta en sí
 * misma, y en la práctica no pueden originarse por eGFR desconocido —
 * las ramas que suspenden por eGFR bajo requieren `egfr > 0`, que `null`
 * nunca cumple).
 */
function annotateRenalCaution(planItems, flags) {
  if (flags.egfr !== null) return planItems; // eGFR conocido (o ya se usó p.tfg manual) — nada que avisar
  planItems.forEach((item) => {
    if (!item.id || String(item.dose).includes("SUSPENDER")) return;
    const drug = DB_PHARMA.find((f) => f.id === item.id);
    if (drug?.egfrMin) {
      item.caution = `Seguridad renal no verificada — falta creatinina para calcular eGFR (este fármaco requiere eGFR ≥ ${drug.egfrMin} mL/min/1.73m²)`;
    }
  });
  return planItems;
}

/**
 * GOBERNANZA (16-ago-2026, cierre de hueco de la auditoría de precisión de
 * campos, a petición del Dr. Ortega): Comorbilidades, Antecedentes
 * Familiares y Medicación Actual son las 3 secciones del Ingreso Clínico
 * donde "nada marcado" es una respuesta clínica válida (paciente sano, sin
 * antecedentes, sin fármacos) — por eso NO se puede usar "array vacío" como
 * señal de "no revisado" (ver ingreso-progress.js). La señal correcta ya
 * existe (`p.seccionesRevisadas`, poblada en state.js a partir de
 * data-visited del acordeón), pero antes de esta corrección nunca llegaba
 * hasta aquí: el motor generaba el mismo plan para un paciente
 * genuinamente sano que para uno cuyo checklist el médico nunca abrió.
 *
 * Mismo principio que annotateRenalCaution: NO bloquea nada — solo advierte,
 * de forma no intrusiva, cuando el plan que se está a punto de mostrar
 * descansa sobre una sección que nunca se revisó. `p.seccionesRevisadas`
 * ausente por completo (pacientes construidos fuera del formulario real,
 * p. ej. en pruebas o llamadas directas al motor) se trata igual que "no
 * revisada" — es la opción conservadora: no asumir revisión que no consta.
 */
function buildReviewCautions(p) {
  const revisadas = p.seccionesRevisadas || {};
  const cautions = [];
  if (!revisadas.comorbilidades) {
    cautions.push({
      id: "COMORB_NO_REVISADO",
      texto: "Comorbilidades no revisadas en esta consulta — el plan asume que el paciente no tiene ninguna registrada. Verifique antes de continuar.",
      section: 5,
    });
  }
  if (!revisadas.antecedentesFamiliares) {
    cautions.push({
      id: "FAMHX_NO_REVISADO",
      texto: "Antecedentes familiares no revisados en esta consulta — el plan asume que no hay ninguno relevante (incluye MEN2A/carcinoma medular e hipercolesterolemia familiar). Verifique antes de continuar.",
      section: 6,
    });
  }
  if (!revisadas.medicacionActual) {
    cautions.push({
      id: "MEDACTUAL_NO_REVISADO",
      texto: "Medicación actual no revisada en esta consulta — el plan asume que el paciente no toma ningún fármaco previo. Verifique antes de continuar.",
      section: 7,
    });
  }
  return cautions;
}

/**
 * Ordena candidatos priorizando: (1) beneficio probado en la comorbilidad
 * objetivo, (2) costo acorde al nivel de acceso del paciente,
 * (3) menor riesgo de hipoglucemia como desempate.
 */
function rankByAccess(list, flags, benefitKey) {
  return [...list].sort((a, b) => {
    if (benefitKey) {
      const ba = a.benef?.[benefitKey] ? 1 : 0;
      const bb = b.benef?.[benefitKey] ? 1 : 0;
      if (ba !== bb) return bb - ba;
    }
    if (flags.accesoTier === 1) {
      if (a.costo !== b.costo) return a.costo - b.costo;
    }
    const hipoOrder = { bajo: 0, moderado: 1, alto: 2 };
    return (hipoOrder[a.hipo] ?? 1) - (hipoOrder[b.hipo] ?? 1);
  });
}

/**
 * Resuelve `p.medicacionActual[categoria]` contra DB_PHARMA.
 * Regresa:
 *   entries   -> [{ drug, isMax }] (fármacos actuales ya resueltos a su ficha)
 *   usedIds   -> Set<string> de ids ya en uso (para no duplicar en el plan)
 *   notMaxed  -> subconjunto de entries con isMax=false (candidatos a titular)
 *   isVirgen  -> true si no hay NINGÚN fármaco registrado en esta categoría
 *
 * Un paciente "virgen" (isVirgen=true) hace que las tres funciones
 * build*Plan() se comporten EXACTAMENTE igual que antes de que existiera
 * el concepto de medicación actual: es el estado por defecto y no requiere
 * ninguna rama especial adicional en el código que las consume.
 */
function getMedicationState(p, categoria) {
  const raw = (p.medicacionActual && p.medicacionActual[categoria]) || [];
  const entries = raw
    .map((e) => {
      const drug = DB_PHARMA.find((f) => f.id === e.id);
      return drug ? { drug, isMax: !!e.isMax } : null;
    })
    .filter(Boolean);
  const usedIds = new Set(entries.map((e) => e.drug.id));
  const notMaxed = entries.filter((e) => !e.isMax);
  return { entries, usedIds, notMaxed, isVirgen: entries.length === 0 };
}

/** Plan antidiabético categórico (Algorithm Fig. 6 / Fig. 7).
 * Filosofía AACE: comorbilidad-driven, agrega SGLT2i/GLP-1/etc. de forma
 * temprana según IC/ERC/ASCVD/MASLD SIN esperar a que metformina esté
 * a dosis máxima (a diferencia de lípidos). Lo único nuevo aquí es que,
 * si el beneficio de una comorbilidad YA está cubierto por un fármaco
 * actual, no se duplica: se recomienda titular ese fármaco si aún no
 * está a dosis máxima, y si ya lo está, no se agrega nada más para esa
 * indicación (ya optimizada). */
export function buildAntidiabeticPlan(p) {
  const flags = getPatientFlags(p);
  const antidiabetics = filterSafe(DB_PHARMA.filter((f) => f.cat === "antidiabetic"), flags);
  const plan = [];
  const state = getMedicationState(p, "antidiabetic");

  const hierarchy = [
    { flag: flags.ic, key: "ic", label: "Insuficiencia Cardíaca" },
    { flag: flags.erc, key: "erc", label: "Enfermedad Renal Crónica" },
    { flag: flags.ascvd, key: "ascvd", label: "ASCVD establecida o alto riesgo" },
    { flag: flags.stroke, key: "stroke", label: "Enfermedad Cerebrovascular (ACV/AIT)" },
    { flag: flags.masld, key: "masld", label: "MASLD" },
  ];
  const matched = hierarchy.filter((h) => h.flag);
  // Un mismo fármaco actual puede cubrir >1 comorbilidad a la vez (ej. un
  // SGLT2i con beneficio simultáneo en ERC y MASLD): se recuerda titular
  // ESE fármaco una sola vez, no una vez por cada comorbilidad que cubre.
  const remindedIds = new Set();

  if (matched.length > 0) {
    // Primera pasada: comorbilidades ya cubiertas por un fármaco ACTUAL
    // (se recuerda titular, no se duplica) — igual que antes. Lo que quede
    // sin cubrir pasa a la selección de fármacos nuevos.
    const remaining = [];
    matched.forEach((h) => {
      const coveringCurrent = state.entries.find((e) => e.drug.benef && e.drug.benef[h.key]);
      if (coveringCurrent) {
        const issue = currentDrugIssue(coveringCurrent.drug, flags);
        if (issue) {
          // Ver CORRECCIÓN de currentDrugIssue: el fármaco que YA cubre esta
          // comorbilidad se volvió inseguro con el estado clínico actual del
          // paciente — nunca decir "titular a dosis máxima" en ese caso.
          if (!remindedIds.has(coveringCurrent.drug.id)) {
            plan.push({
              drug: coveringCurrent.drug.name, dose: "REVALORAR / SUSPENDER",
              reason: `Cubría ${h.label}, pero ahora ${issue} — no continuar/titular sin revalorar`,
              color: "rose", costo: coveringCurrent.drug.costo, id: coveringCurrent.drug.id,
            });
            remindedIds.add(coveringCurrent.drug.id);
          }
          remaining.push(h); // el "cobertor" ya no es seguro -> la comorbilidad sigue sin cubrir
          return;
        }
        if (!coveringCurrent.isMax && !remindedIds.has(coveringCurrent.drug.id)) {
          plan.push({
            drug: coveringCurrent.drug.name, dose: `Titular a ${coveringCurrent.drug.mant}`,
            reason: `Ya cubre ${h.label} — titular a dosis máxima antes de escalar`,
            color: h.key === "ic" || h.key === "erc" ? "blue" : "rose",
            costo: coveringCurrent.drug.costo, id: coveringCurrent.drug.id,
          });
          remindedIds.add(coveringCurrent.drug.id);
        }
        return; // beneficio ya cubierto por tratamiento actual — no duplicar
      }
      remaining.push(h);
    });

    /**
     * CORRECCIÓN (detectada por el Dr. Ortega con un paciente multimórbido
     * "outlier": IC + ERC + ASCVD + MASLD simultáneos): la versión anterior
     * elegía el mejor candidato PARA CADA comorbilidad de forma
     * independiente (una pasada por `matched`, sin mirar atrás). Eso
     * producía tarjetas duplicadas e innecesarias — ej. elegía
     * Dapagliflozina para IC+ERC+MASLD y por separado Empagliflozina para
     * ASCVD, cuando Empagliflozina POR SÍ SOLA ya cubre las 4 comorbilidades
     * (benef.ic/erc/ascvd/masld = true) y es la única recomendación
     * necesaria. Se reemplazó por un algoritmo de cobertura máxima greedy
     * (estándar para "set cover"): en cada ronda, elige el fármaco NUEVO
     * que cubre el mayor número de comorbilidades AÚN sin cubrir (con el
     * mismo desempate de rankByAccess — beneficio, costo/acceso, riesgo de
     * hipoglucemia), lo agrega con TODAS las razones que cubre en una sola
     * tarjeta, y repite con lo que quede sin cubrir. Con 1 sola comorbilidad
     * coincidente el comportamiento es idéntico al anterior.
     */
    /**
     * CORRECCIÓN 2 (detectada en exploración adversarial H3 — Dr. Ortega,
     * "verifiquemos dónde puede haber más bugs en el algoritmo": paciente con
     * eGFR=18 + IC+ERC+ASCVD simultáneos): con TODOS los iSGLT2 excluidos por
     * función renal, ningún fármaco individual cubre ic+erc+ascvd a la vez
     * (Semaglutida cubre erc+ascvd; Tirzepatida cubre ic+ascvd, pero ninguna
     * cubre ic+erc juntas). El greedy sin restricciones terminaba eligiendo
     * Semaglutida (GLP-1 RA) Y Tirzepatida (GIP/GLP-1 RA) A LA VEZ para cerrar
     * la cobertura — dos agonistas basados en incretina simultáneos, algo que
     * no es práctica clínica estándar (mecanismo redundante/competitivo, sin
     * evidencia de combinarlos) y que el chequeo `noDuplicateGroupsWithinCategory`
     * no detectaba porque "GLP-1 RA" y "GIP/GLP-1 RA" son `grp` distintos.
     * Corrección: una vez elegido un agente de familia incretina (GLP-1 RA o
     * GIP/GLP-1 RA), se excluye TODA esa familia de rondas posteriores del
     * mismo plan — si ninguna otra clase cubre lo que falta, esa comorbilidad
     * queda sin un fármaco antidiabético adicional (se puede abordar por otra
     * vía, p. ej. IC vía el motor de HTA) en vez de apilar dos incretinas.
     */
    const INCRETIN_GROUPS = new Set(["GLP-1 RA", "GIP/GLP-1 RA"]);
    const selections = new Map(); // id -> { drug, reasons: [] }
    let pending = [...remaining];
    let incretinFamilyUsed = false;
    let safety = pending.length + 1; // evita loop infinito si algo queda sin candidato
    while (pending.length > 0 && safety-- > 0) {
      let pool = antidiabetics.filter((f) => !state.usedIds.has(f.id) && !selections.has(f.id));
      if (incretinFamilyUsed) pool = pool.filter((f) => !INCRETIN_GROUPS.has(f.grp));
      const scored = pool
        .map((f) => ({ f, coverage: pending.filter((h) => f.benef[h.key]).length }))
        .filter((x) => x.coverage > 0);
      if (scored.length === 0) break; // ninguna candidata cubre lo que falta
      const maxCoverage = Math.max(...scored.map((x) => x.coverage));
      const topTier = scored.filter((x) => x.coverage === maxCoverage).map((x) => x.f);
      // Desempate entre candidatas con la MISMA cobertura máxima (11-ago-2026,
      // a petición del Dr. Ortega tras revisar el motor: "dejemos la
      // evidencia sobre el costo, eso es algo que el criterio del médico debe
      // considerar"): primero se prefiere la candidata con más comorbilidades
      // de ESTA ronda respaldadas por un ensayo dedicado de desenlace duro
      // (evid==="fuerte" — DAPA-HF/EMPA-KIDNEY/CREDENCE/FLOW/LEADER/REWIND/
      // SOUL/IRIS/SUMMIT, ver pharma-db.js) sobre beneficio de clase/indirecto
      // (evid==="clase"). Solo entre candidatas con la MISMA cantidad de
      // evidencia fuerte se aplica rankByAccess (costo solo si accesoTier===1,
      // luego riesgo de hipoglucemia) — el costo deja de ser el primer
      // desempate.
      const strongEvidenceCount = (f) => pending.filter((h) => f.benef[h.key] && f.evid?.[h.key] === "fuerte").length;
      const maxEvidence = Math.max(...topTier.map(strongEvidenceCount));
      const strongestTier = topTier.filter((f) => strongEvidenceCount(f) === maxEvidence);
      const chosen = rankByAccess(strongestTier, flags, null)[0];
      const coveredNow = pending.filter((h) => chosen.benef[h.key]);
      selections.set(chosen.id, { drug: chosen, reasons: coveredNow.map((h) => h.label) });
      pending = pending.filter((h) => !chosen.benef[h.key]);
      if (INCRETIN_GROUPS.has(chosen.grp)) incretinFamilyUsed = true;
    }
    selections.forEach(({ drug, reasons }) => {
      // CORRECCIÓN 3 (misma exploración H2 — Stroke+MASLD+Pancreatitis con
      // Obesidad IMC 34): cuando la clase GLP-1/GIP está contraindicada
      // (p. ej. pancreatitis previa), el greedy puede quedar forzado a un
      // agente con `peso:"ganancia"` (p. ej. Pioglitazona) como única opción
      // para cubrir una comorbilidad — clínicamente correcto (sin alternativa
      // mejor disponible), pero antes no se avisaba que ese fármaco es
      // contrario a la meta de peso del paciente obeso. Se agrega una
      // advertencia explícita en el texto del motivo para que quede visible
      // sin tener que revisar la ficha del fármaco aparte.
      const pesoCaveat = drug.peso === "ganancia" && flags.obesidad
        ? " ⚠ Este agente favorece ganancia de peso — contrario a la meta de pérdida de peso del paciente; valorar seguimiento estrecho de peso." : "";
      plan.push({
        drug: drug.name, dose: drug.ini,
        reason: `1ª línea por ${reasons.join(" + ")}${pesoCaveat}`,
        color: reasons.some((r) => r.includes("Cardíaca") || r.includes("Renal")) ? "blue" : "rose",
        costo: drug.costo, id: drug.id,
        // Marca temporal (11-ago-2026): agente NUEVO elegido por el algoritmo
        // de cobertura de comorbilidades en esta misma consulta — candidato a
        // combinación de inicio si termina habiendo 2+ agentes nuevos (ver
        // agrupación de combo al final de la función). Se limpia antes de
        // devolver el plan.
        _freshStart: true,
      });
    });
  } else {
    if (flags.obesidad) {
      const coveringCurrent = state.entries.find((e) => e.drug.peso === "perdida");
      if (coveringCurrent) {
        const issue = currentDrugIssue(coveringCurrent.drug, flags);
        if (issue) {
          // Ver CORRECCIÓN de currentDrugIssue: p. ej. paciente ya en un
          // GLP-1/GIP como agente de pérdida de peso que desarrolla
          // pancreatitis nueva — antes seguía diciendo "titular a dosis
          // máxima" ignorando la contraindicación recién aparecida.
          plan.push({ drug: coveringCurrent.drug.name, dose: "REVALORAR / SUSPENDER", reason: `Agente de pérdida de peso ya en uso, pero ahora ${issue} — no continuar/titular sin revalorar`, color: "rose", costo: coveringCurrent.drug.costo, id: coveringCurrent.drug.id });
        } else if (!coveringCurrent.isMax) {
          plan.push({ drug: coveringCurrent.drug.name, dose: `Titular a ${coveringCurrent.drug.mant}`, reason: "Ya en agente con pérdida de peso — titular a dosis máxima", color: "amber", costo: coveringCurrent.drug.costo, id: coveringCurrent.drug.id });
        }
      } else if (getMedicationState(p, "obesity").entries.length > 0) {
        // CORRECCIÓN (integración con buildObesityPlan, misma ronda de
        // auditoría): antes esta rama solo revisaba su PROPIO pool
        // (antidiabetic, peso:"perdida") para decidir si el paciente ya
        // tenía cobertura de pérdida de peso — nunca revisaba si ya estaba
        // en un fármaco de la categoría dedicada "obesity" (Orlistat,
        // Fentermina/Topiramato, etc.), lo que producía una recomendación
        // NUEVA y redundante desde el pool antidiabético (p. ej.
        // Dapagliflozina) encima de un tratamiento de obesidad YA activo.
        // buildObesityPlan() es quien maneja la continuidad de esos
        // fármacos; aquí solo no se duplica.
      } else {
        const candidates = rankByAccess(antidiabetics.filter((f) => f.peso === "perdida" && !state.usedIds.has(f.id)), flags, null);
        if (candidates[0]) {
          // CORRECCIÓN (11-ago-2026, auditoría de secuencia — Dr. Ortega): esta
          // rama solo se alcanza para un paciente VIRGEN (matched.length===0,
          // sin cobertura previa de pérdida de peso). Junto con la Metformina de
          // base (unshift más abajo, también _freshStart) son 2 fármacos nuevos
          // iniciados en la MISMA consulta — antes no se marcaba, así que nunca
          // se agrupaban como combinación de inicio pese a ser exactamente el
          // mismo escenario que la agrupación de cobertura de comorbilidades.
          plan.push({ drug: candidates[0].name, dose: candidates[0].ini, reason: "Obesidad/sobrepeso — meta de pérdida de peso", color: "neon", costo: candidates[0].costo, id: candidates[0].id, _freshStart: true });
        }
      }
    } else if (flags.hipoRisk) {
      const coveringCurrent = state.entries.find((e) => e.drug.hipo === "bajo" && e.drug.id !== "MET");
      if (coveringCurrent) {
        const issue = currentDrugIssue(coveringCurrent.drug, flags);
        if (issue) {
          plan.push({ drug: coveringCurrent.drug.name, dose: "REVALORAR / SUSPENDER", reason: `Agente de bajo riesgo de hipoglucemia ya en uso, pero ahora ${issue} — no continuar/titular sin revalorar`, color: "rose", costo: coveringCurrent.drug.costo, id: coveringCurrent.drug.id });
        } else if (!coveringCurrent.isMax) {
          plan.push({ drug: coveringCurrent.drug.name, dose: `Titular a ${coveringCurrent.drug.mant}`, reason: "Riesgo de hipoglucemia — titular agente de bajo riesgo ya iniciado", color: "amber", costo: coveringCurrent.drug.costo, id: coveringCurrent.drug.id });
        }
      } else {
        const candidates = rankByAccess(antidiabetics.filter((f) => f.hipo === "bajo" && f.id !== "MET" && !state.usedIds.has(f.id)), flags, null);
        if (candidates[0]) {
          // CORRECCIÓN (11-ago-2026, mismo hallazgo que la rama de obesidad de
          // arriba): mismo escenario — paciente virgen, Metformina de base +
          // este agente se inician en la misma consulta.
          plan.push({ drug: candidates[0].name, dose: candidates[0].ini, reason: "Riesgo de hipoglucemia — agente de bajo riesgo", color: "amber", costo: candidates[0].costo, id: candidates[0].id, _freshStart: true });
        }
      }
    }
  }

  // Metformina: base de terapia salvo contraindicación. Se revisa la
  // MEDICACIÓN ACTUAL (usedIds), no solo lo agregado en este plan — un
  // paciente ya en metformina no recibe una "nueva" recomendación de
  // inicio, sino titulación si aún no está a dosis máxima. Un paciente
  // virgen (sin metformina registrada) recibe exactamente el mismo
  // comportamiento de siempre.
  const metCurrent = state.entries.find((e) => e.drug.id === "MET");
  const metInPlan = plan.some((x) => x.id === "MET");
  // CORRECCIÓN (misma ronda de auditoría — hallazgo de seguridad, el más
  // relevante de esta ronda): la rama "paciente YA en metformina" nunca
  // revisaba el eGFR ACTUAL antes de recomendar titular a dosis máxima —
  // solo el eGFR se usaba como filtro para pacientes VÍRGENES (vía
  // `flags.egfr >= 30` más abajo). Un paciente que YA estaba en metformina y
  // cuya función renal se deterioró después (eGFR<30 — contraindicación
  // absoluta por riesgo de acidosis láctica, FDA/ADA) seguía recibiendo
  // "titular a dosis máxima" en cada consulta nueva. Se agrega la misma
  // verificación de eGFR también a la rama de continuación: <30 = suspender;
  // 30-45 = mantener sin escalar dosis (ADA: no iniciar en este rango, pero
  // continuar con vigilancia si ya estaba iniciada, dosis máxima 1000 mg/día);
  // ≥45 = comportamiento normal sin cambios.
  if (metCurrent) {
    if (flags.egfr > 0 && flags.egfr < 30) {
      plan.push({ drug: "Metformina", dose: "SUSPENDER", reason: `Contraindicación absoluta — eGFR ${flags.egfr} mL/min/1.73m² <30 (riesgo de acidosis láctica, FDA/ADA)`, color: "rose", costo: 1, id: "MET" });
    } else if (flags.egfr > 0 && flags.egfr < 45) {
      if (!metInPlan) plan.push({ drug: "Metformina", dose: "Mantener dosis actual (no escalar)", reason: `eGFR ${flags.egfr} mL/min/1.73m² en rango 30-45 — no iniciar/escalar, máximo 1000 mg/día, vigilancia renal más frecuente (ADA)`, color: "amber", costo: 1, id: "MET" });
    } else if (!metCurrent.isMax && !metInPlan) {
      plan.push({ drug: "Metformina", dose: `Titular a ${metCurrent.drug.mant}`, reason: "Terapia base ya iniciada — titular a dosis máxima tolerada", color: "emerald", costo: 1, id: "MET" });
    }
  } else if (!metInPlan && (flags.egfr === null || flags.egfr >= 30)) {
    // CORRECCIÓN DE GOBERNANZA (16-ago-2026, Dr. Ortega): antes decía
    // `flags.egfr === 0`, el viejo sentinela silencioso de "no se pudo
    // calcular" (ver calcEGFR) — un eGFR realmente calculado por CKD-EPI
    // nunca da 0, así que esa condición en realidad SOLO capturaba el caso
    // de dato faltante, y lo trataba como "función renal normal, iniciar
    // sin reservas". Ahora el sentinela es `null` (explícito) y el plan
    // sigue permitiendo iniciar (decisión del Dr. Ortega: no bloquear) —
    // pero `annotateRenalCaution`, al final de esta función, adjunta el
    // aviso de "seguridad renal no verificada" a esta misma tarjeta cuando
    // el eGFR es `null`.
    plan.unshift({ drug: "Metformina", dose: "500 mg", reason: "Terapia base salvo contraindicación", color: "emerald", costo: 1, id: "MET", _freshStart: true });
  }

  // Combinación de inicio explícita (11-ago-2026, a petición del Dr. Ortega —
  // "que sugiera la combinación, no solo que saque los medicamentos"): si en
  // ESTA consulta el plan terminó con 2+ fármacos antidiabéticos que se están
  // iniciando por primera vez (Metformina de base + lo que haya elegido el
  // algoritmo de cobertura de comorbilidades — ej. Metformina + Empagliflozina
  // + Semaglutida), se agrupan con un `comboGroup` compartido para que
  // render.js los presente como una sola tarjeta de "combinación de inicio"
  // en vez de N tarjetas sueltas sin relación visible entre sí. No aplica a
  // titulaciones, suspensiones ni advertencias — solo a inicios nuevos reales.
  const freshStartItems = plan.filter((x) => x._freshStart);
  if (freshStartItems.length >= 2) {
    const comboGroup = "DM_INIT_COMBO";
    freshStartItems.forEach((x) => { x.comboGroup = comboGroup; });
  }
  plan.forEach((x) => { delete x._freshStart; });

  // CATCH-ALL final (misma ronda de auditoría, generalización del hallazgo
  // sistémico): las ramas anteriores solo revisan currentDrugIssue en los
  // fármacos que efectivamente TOCAN (los que cubren una comorbilidad, o el
  // agente de peso/hipoglucemia). Un fármaco YA prescrito que ya está a dosis
  // máxima y no cae en ninguna de esas ramas (ej. una sulfonilurea vigente en
  // alguien que después desarrolla una contraindicación) pasaba en silencio,
  // sin titulación pero también sin ninguna advertencia. Se revisa aquí
  // CUALQUIER fármaco de `state.entries` que aún no haya sido mencionado en
  // el plan.
  state.entries.forEach((e) => {
    if (plan.some((x) => x.id === e.drug.id)) return; // ya reportado por una rama específica
    const issue = currentDrugIssue(e.drug, flags);
    if (issue) plan.push({ drug: e.drug.name, dose: "REVALORAR / SUSPENDER", reason: `Ya en tratamiento, pero ahora ${issue} — no continuar sin revalorar`, color: "rose", costo: e.drug.costo, id: e.drug.id });
  });

  // CAPA 1 — Caso 38 (Dr. Ortega, 10-ago-2026): sobretratamiento glucémico en
  // adulto mayor. Se evalúa DESPUÉS de que el resto de la lógica ya decidió
  // titulaciones/inicios normales, porque este chequeo puede aplicar incluso
  // cuando ninguna otra rama generó una tarjeta (paciente estable, ya en
  // meta) — ver geriatric.js para la justificación completa y el límite
  // deliberado (solo advierte, no prescribe un cronograma de retiro).
  const a1cValueForOvertreatment = getA1cEfectiva(p).value;
  const a1cTargetForOvertreatment = getA1cTarget({ age: Number(p?.edad) || 0, healthStatus: p?.saludStatus, lowTreatmentBurden: p?.bajoRiesgoTratamiento });

  // CAPA 4 — Casos 44/57 (cualquier edad, A1c MUY por debajo de meta): se
  // revisa PRIMERO porque es el escenario más urgente (hipoglucemia
  // inminente). Si aplica, se prioriza sobre el Caso 38 (geriatric.js —
  // solo ≥65 años, A1c apenas en/bajo meta) para no mostrar dos tarjetas
  // redundantes de "desescalar" con distinta urgencia al mismo paciente —
  // ver polypharmacy.js para el razonamiento completo del umbral.
  const severeOvertreatment = checkSevereGlycemicOvertreatment(p, state, a1cValueForOvertreatment, a1cTargetForOvertreatment);
  if (severeOvertreatment) {
    plan.push({
      drug: severeOvertreatment.drugs.length > 1 ? "Múltiples agentes" : (state.entries.find((e) => e.drug.id === severeOvertreatment.drugs[0])?.drug.name || "Agente de alto riesgo"),
      dose: "DESESCALAR / REDUCIR (prioritario)",
      reason: severeOvertreatment.reason,
      color: "purple",
      costo: 0,
      id: severeOvertreatment.id,
    });
  } else {
    const overtreatment = checkOvertreatmentDM(p, state, a1cValueForOvertreatment);
    if (overtreatment) {
      plan.push({
        drug: overtreatment.drugs.length > 1 ? "Múltiples agentes" : (state.entries.find((e) => e.drug.id === overtreatment.drugs[0])?.drug.name || "Agente de alto riesgo"),
        dose: "DESESCALAR / REDUCIR",
        reason: overtreatment.reason,
        color: "purple",
        costo: 0,
        id: overtreatment.id,
      });
    }
  }

  // CAPA 2 — Casos 40-41 (Dr. Ortega, 10-ago-2026): seguridad perioperatoria.
  // Se revisa independientemente de A1c/meta/comorbilidades — un iSGLT2 o
  // GLP-1/GIP en buen control glucémico es igual de riesgoso ante cirugía
  // inminente que uno mal controlado (ver perioperative.js para el porqué
  // de cada umbral). Se agrega al PRINCIPIO del plan (unshift) para que la
  // alerta de suspensión no quede enterrada debajo de recomendaciones de
  // rutina en una consulta donde lo más urgente es justamente esto.
  const periopAlerts = checkPerioperativeSafety(p, state);
  periopAlerts.slice().reverse().forEach((alert) => {
    // Si una rama anterior ya generó una tarjeta de "titular" para ESTE
    // mismo fármaco (ej. un iSGLT2 recomendado titular por cubrir ERC), se
    // retira: no tiene sentido mostrar "titular a dosis máxima" y
    // "SUSPENDER por cirugía" para el mismo agente en la misma consulta —
    // la alerta perioperatoria manda.
    for (let i = plan.length - 1; i >= 0; i--) {
      if (alert.drugs.includes(plan[i].id)) plan.splice(i, 1);
    }
    plan.unshift({
      drug: alert.drugLabel,
      dose: "SUSPENDER (perioperatorio)",
      reason: alert.reason,
      color: "rose",
      costo: 0,
      id: alert.id,
    });
  });

  // CAPA 3 — Caso 43 (Dr. Ortega, 10-ago-2026): A1c no confiable (anemia
  // significativa o ERC avanzada). Se agrega como advertencia informativa,
  // no como recomendación de fármaco — no cambia QUÉ se prescribe, cambia
  // qué tanto confiar en el número que está guiando esa decisión.
  const a1cReliability = checkUnreliableA1c(p, flags.egfr);
  if (a1cReliability) {
    plan.push({
      drug: "(A1c no confiable)",
      dose: "Ver Fructosamina/CGM",
      reason: a1cReliability.reason,
      color: "amber",
      costo: 0,
      id: a1cReliability.id,
    });
  }

  const note = flags.hiperglucemiaSevera
    ? "A1c >10% o glucosa >300 mg/dL: considerar inicio de insulina basal de forma simultánea (ver Algoritmo de Insulina)."
    : null;

  // Etiqueta de categoría en cada tarjeta -> permite a EndoManagement agrupar
  // visualmente por clase de fármaco (Antidiabéticos/Antihipertensivos/Hipolipemiantes).
  plan.forEach((item) => { item.categoria = "antidiabetic"; });
  annotateRenalCaution(plan, flags);

  return { plan, flags, note };
}

/**
 * Meta numérica de presión arterial para decidir si un paciente YA la
 * alcanzó (usada por buildHTNPlan para decidir si escalar tratamiento).
 *
 * CORRECCIÓN (auditoría de escalonamiento — mismo tipo de bug ya encontrado
 * y corregido para la meta de A1c, ver getA1cTarget en individualization.js,
 * pero nunca aplicado a la meta de PA): `atGoal` en buildHTNPlan usaba
 * SIEMPRE <130/80 sin importar edad/complejidad del paciente. La Tabla 13.2
 * (ADA 2026, "Older Adults") que este mismo proyecto ya usa en
 * individualization.js (GOALS_TABLE, ver getGlycemicAndBPGoals) define una
 * meta de PA <140/90 — no <130/80 — para adultos ≥65 años clasificados como
 * "muy complejos" (cuidados prolongados, expectativa de vida limitada,
 * deterioro cognitivo). Un paciente frágil de 82 años con PA 135/85 SÍ está
 * en su meta real, pero seguía recibiendo "meta no alcanzada — agregar otra
 * clase", con riesgo real de sobretratamiento/hipotensión/caídas — justo la
 * población donde ese riesgo es más peligroso.
 *
 * Replica la MISMA Tabla 13.2 aquí (en vez de importar individualization.js)
 * porque este proyecto mantiene la separación deliberada "calculations.js
 * calcula valores crudos, individualization.js solo los clasifica
 * visualmente" (ver encabezado de individualization.js) — importar en esa
 * dirección crearía una dependencia circular. Hay un test de regresión que
 * verifica que ambas fuentes concuerden para el mismo paciente.
 */
function getIndividualizedBPGoalNumeric(p) {
  const age = Number(p?.edad) || 0;
  if (age >= 65 && p?.saludStatus === "muyComplejo") return { sbp: 140, dbp: 90 };
  return { sbp: 130, dbp: 80 };
}

/** Plan de hipertensión categórico (AHA/ACC 2025).
 * Etapa 1 (130-139/80-89): monoterapia inicial — CON el gate de riesgo de la
 *   Guía de HTA 2025 descrito abajo (ACTUALIZACIÓN).
 * Etapa 2 (≥140/≥90): combinación de 2 clases de primera línea DESDE EL INICIO
 * (no escalonamiento secuencial) — corrige el umbral previo, erróneamente
 * fijado en >150/100. Se trata SIEMPRE, sin importar el riesgo estimado.
 * Pacientes YA en tratamiento: primero se titula cualquier fármaco actual que
 * no esté a dosis máxima; solo se agrega una clase nueva cuando TODOS los
 * fármacos actuales ya están a dosis máxima y la meta INDIVIDUALIZADA
 * (getIndividualizedBPGoalNumeric — <130/80 en general, <140/90 si ≥65 años
 * "muy complejo") no se alcanza.
 *
 * ACTUALIZACIÓN (hallazgo de auditoría, integración PREVENT-CVD): la Guía de
 * HTA 2025 (AHA/ACC) exige, para HTA Etapa 1 SIN ASCVD/ERC/diabetes ya
 * conocidas, confirmar riesgo aumentado (PREVENT-CVD total a 10 años ≥7.5%)
 * ANTES de iniciar fármaco — si el riesgo es <7.5% o no se ha calculado, la
 * recomendación es un ensayo de 3-6 meses de cambios de estilo de vida
 * primero. Antes, este motor iniciaba fármaco en TODO paciente Etapa 1
 * virgen sin excepción, sin este filtro de riesgo. Igual que con
 * PREVENT-ASCVD (ver classifyLipidRisk), el % se acepta como dato de entrada
 * OPCIONAL (`p.preventCvd10`) calculado externamente por el médico — el
 * motor no reimplementa la fórmula (ver esa misma función para la
 * justificación completa de por qué). Etapa 2 nunca pasa por este gate: se
 * trata siempre, independientemente del riesgo (texto explícito de la
 * guía). */
export function buildHTNPlan(p) {
  const flags = getPatientFlags(p);
  const htn = filterSafe(DB_PHARMA.filter((f) => f.cat === "htn"), flags);
  const bp = classifyBP(p);
  const plan = [];
  const state = getMedicationState(p, "htn");

  const sbp = v(p.tas), dbp = v(p.tad);
  // AHA/ACC 2025: Etapa 2 (combinación de inicio obligatoria) = SBP>=140 OR DBP>=90.
  const isStage2 = sbp >= 140 || dbp >= 90;
  const bpGoal = getIndividualizedBPGoalNumeric(p);
  const atGoal = sbp > 0 && dbp > 0 && sbp < bpGoal.sbp && dbp < bpGoal.dbp;

  // CORRECCIÓN (hallazgo derivado de la pregunta del Dr. Ortega sobre IECA vs
  // ARA-II): antes `needsRenal` solo miraba albuminuria/ERC para decidir si
  // el bloqueo del eje renina-angiotensina (IECA/ARA-II) era la clase de 1ª
  // línea. Un paciente con IC SOLA (sin albuminuria/ERC) caía en
  // `nonRenalClasses` (BCC dihidropiridínico/tiazida) — pero las guías de IC
  // con FEVI reducida (AHA/ACC/HFSA 2022) señalan IECA/ARA-II (o ARNI, fuera
  // de este catálogo) como terapia de base junto con beta-bloqueante/MRA/
  // iSGLT2, NO un BCC/tiazida como 1ª línea. Se renombra conceptualmente a
  // "necesita bloqueo RAAS" e incluye flags.ic.
  const needsRAAS = v(p.uacr) > 30 || flags.erc || flags.ic;
  const renalClasses = htn.filter((f) => f.grp.includes("ARA-II") || f.grp.includes("IECA"));
  // CORRECCIÓN (ampliación por Compendio 2026): antes se usaba
  // f.grp.includes("BCC"), que hacía match tanto con "BCC Dihidropiridínico"
  // (1ª línea real por guía) como con "BCC No Dihidropiridínico" (verapamilo/
  // diltiazem — reservados para indicaciones específicas: control de
  // frecuencia, contraindicados en IC, no son 1ª línea en HTA no complicada).
  // Al agregar el subgrupo No-Dihidropiridínico al catálogo, ese match por
  // substring habría empezado a colar verapamilo/diltiazem como candidatos
  // de "1ª línea sin daño renal" en el motor automático. Se restringe a
  // coincidencia exacta del subgrupo dihidropiridínico para que el motor
  // categórico siga sugiriendo SOLO las clases de 1ª línea guideline-backed;
  // verapamilo/diltiazem quedan disponibles en EndoFarma solo para consulta
  // y prescripción manual.
  const nonRenalClasses = htn.filter((f) => f.grp === "BCC Dihidropiridínico" || f.grp.includes("Tiazida"));
  // DOMINIO 3 — Caso 51 (Dr. Ortega, 10-ago-2026): con litio concurrente,
  // `htn` (arriba) ya viene sin IECA/ARA-II/Tiazida — filterSafe llama a
  // currentDrugIssue, que ahora bloquea esas 3 clases por completo (ver
  // psychiatry.js). Eso deja `renalClasses` vacío incluso cuando needsRAAS
  // es true (paciente con ERC/IC que SÍ se beneficiaría de RAAS). Sin este
  // caso especial, `firstLineClasses` quedaría vacío y el paciente se iría
  // sin NINGUNA recomendación de 1ª línea, en silencio — el mismo tipo de
  // hueco que ya se corrigió para otros guards sistémicos. Se hace explícito
  // el conflicto y se cae a BCC-DHP (Amlodipino) como alternativa segura,
  // dejando Diltiazem (BCC no-DHP) disponible solo por consulta manual, como
  // ya hace el resto del motor con esa subclase.
  const raasBlockedByLithium = needsRAAS && flags.litio && renalClasses.length === 0;
  const firstLineClasses = needsRAAS && !raasBlockedByLithium ? renalClasses : nonRenalClasses;
  if (raasBlockedByLithium) {
    plan.push({
      drug: "(Conflicto RAAS vs. Litio)",
      dose: "Ver nota",
      reason: `Este paciente se beneficiaría de bloqueo RAAS (IECA/ARA-II) por ${flags.erc ? "albuminuria/ERC" : "Insuficiencia Cardíaca"}, pero está BLOQUEADO por litio concurrente (riesgo de litemia tóxica — ver Caso 51). Se usa BCC dihidropiridínico (Amlodipino) como alternativa de 1ª línea; Diltiazem (BCC no-DHP) queda disponible solo por prescripción manual. Discutir con psiquiatría si el bloqueo RAAS es indispensable (monitoreo estrecho de litemia).`,
      color: "amber",
      costo: 0,
      id: "RAAS_LITIO_CONFLICT",
    });
  }
  // Dentro del pool RAAS (IECA+ARA-II ya sin excluidos por angioedema/tos —
  // ver filterSafe), el beneficio a priorizar depende de POR QUÉ se necesita
  // el bloqueo: si hay daño renal real (albuminuria/ERC) se prioriza
  // benef.erc; si el motivo es IC sin daño renal, se prioriza benef.ic (ver
  // CORRECCIÓN de needsRAAS arriba).
  const raasBenefitKey = (flags.erc || v(p.uacr) > 30) ? "erc" : (flags.ic ? "ic" : null);
  const raasReason = (flags.erc || v(p.uacr) > 30) ? "1ª línea — albuminuria/ERC" : (flags.ic ? "1ª línea — Insuficiencia Cardíaca (base de GDMT)" : "1ª línea — sin evidencia de daño renal");

  // ACTUALIZACIÓN (integración PREVENT-CVD, Guía de HTA 2025): ver comentario
  // de cabecera. ASCVD/ERC/diabetes ya conocidas equivalen a riesgo
  // confirmado sin necesidad de PREVENT-CVD (texto explícito de la guía:
  // "if clinical CVD, diabetes, or CKD is present"). Diabetes usa la MISMA
  // función que classifyLipidRisk (hasDiagnosedDiabetes: p.tipoDM primero,
  // A1c≥6.5% de respaldo) — CORRECCIÓN 10-ago-2026: antes solo usaba A1c≥6.5%
  // (comentario original decía que no existía campo dedicado de diagnóstico;
  // ya existe, agregado para EndoScreen), así que un DM2 diagnosticado pero
  // bien controlado (A1c<6.5% con tratamiento) dejaba de calificar como
  // "riesgo confirmado" pese a que la guía sigue aplicando igual.
  const knownHighRiskHTN = flags.ascvd || flags.erc || flags.ic || hasDiagnosedDiabetes(p);
  const preventCvd = v(p.preventCvd10);
  const confirmedRiskHTN = knownHighRiskHTN || (preventCvd > 0 && preventCvd >= 7.5);

  // CAPA 1 — Caso 39 (Dr. Ortega, 10-ago-2026): sobretratamiento de PA con
  // riesgo de caídas. Solo tiene sentido para un paciente YA en tratamiento
  // (state.isVirgen === false) — un paciente virgen no tiene polifarmacia
  // antihipertensiva que simplificar. Si aplica, reemplaza POR COMPLETO la
  // rama de titulación/escalonamiento de abajo: seguir titulando un fármaco
  // no maxeado en este contexto es precisamente el riesgo que este chequeo
  // existe para evitar (ver geriatric.js).
  const orthostaticBlock = !state.isVirgen ? checkOrthostaticBlock(p, state, atGoal) : null;

  if (state.isVirgen && !isStage2 && !confirmedRiskHTN) {
    // HTA Etapa 1 sin ASCVD/ERC/diabetes conocidas y sin riesgo confirmado
    // (PREVENT-CVD <7.5% o no capturado) -> la Guía de HTA 2025 indica
    // ensayo de estilo de vida 3-6 meses ANTES de fármaco, no inicio
    // inmediato.
    plan.push({
      drug: "(Ninguno)",
      dose: "Ensayo de estilo de vida 3-6 meses",
      reason: preventCvd > 0
        ? `HTA Etapa 1 con riesgo PREVENT-CVD ${preventCvd}% (<7.5%) — ensayo de estilo de vida 3-6 meses antes de iniciar fármaco (Guía de HTA 2025 AHA/ACC); reevaluar PA al final del periodo`
        : `HTA Etapa 1 sin ASCVD/ERC/diabetes conocidas y sin riesgo PREVENT-CVD capturado — ensayo de estilo de vida 3-6 meses antes de iniciar fármaco (Guía de HTA 2025 AHA/ACC); calcular PREVENT-CVD (heart.org/prevent) para precisar la decisión si se prefiere no esperar`,
      color: "emerald",
      costo: 0,
      id: "LIFESTYLE_TRIAL_HTN",
    });
  } else if (state.isVirgen) {
    const first = rankByAccess(firstLineClasses, flags, needsRAAS ? raasBenefitKey : null)[0];
    let firstItem = null;
    if (first) {
      const riskNote = !isStage2 && knownHighRiskHTN
        ? " — riesgo confirmado (ASCVD/ERC/diabetes ya conocidas)"
        : (!isStage2 && preventCvd >= 7.5 ? ` — riesgo confirmado (PREVENT-CVD ${preventCvd}% ≥7.5%)` : "");
      firstItem = { drug: first.name, dose: first.ini, reason: (needsRAAS ? raasReason : "1ª línea — sin evidencia de daño renal ni IC") + riskNote, color: "rose", costo: first.costo, id: first.id };
      plan.push(firstItem);
    }
    // DOMINIO 3 — Caso 51: cuando raasBlockedByLithium es true, `firstLineClasses`
    // YA cayó a nonRenalClasses (ver arriba) — el cálculo normal de
    // `otherClasses` para Etapa 2 (`needsRAAS ? nonRenalClasses : renalClasses`)
    // volvería a apuntar a ESE MISMO pool nonRenalClasses, ofreciendo un
    // segundo BCC-DHP junto al primero (ej. Nifedipino + Amlodipino) — dos
    // fármacos de la MISMA clase no es una combinación de guía real. Con
    // RAAS y Tiazida ambos bloqueados por litio, no queda una 2ª clase seria
    // automatizable: se omite el "second" automático y se deja constancia en
    // la tarjeta de conflicto (arriba) de que la combinación requiere
    // valoración manual.
    if (isStage2 && !raasBlockedByLithium) {
      const otherClasses = (needsRAAS ? nonRenalClasses : renalClasses).filter((f) => f.id !== first?.id);
      const second = rankByAccess(otherClasses, flags, null)[0];
      if (second) {
        // Combinación de inicio explícita (11-ago-2026, a petición del Dr.
        // Ortega): antes ambos fármacos quedaban en el plan como tarjetas
        // sueltas, sin nada que le dijera a la interfaz que son la MISMA
        // combinación de inicio — el médico veía "Losartán" y "Amlodipino"
        // por separado y tenía que inferir él mismo que van juntos. Se
        // etiquetan con un `comboGroup` compartido; render.js los funde en
        // una sola tarjeta ("Combinación de inicio") con un botón que agrega
        // ambos a EndoNote de una vez. No se toca `drug`/`dose`/`reason`/`id`
        // de ninguno de los dos — los tests y EndoNote siguen viendo 2
        // entradas normales del plan, solo se agrega metadata nueva.
        const comboGroup = "HTN_INIT_COMBO";
        if (firstItem) firstItem.comboGroup = comboGroup;
        plan.push({ drug: second.name, dose: second.ini, reason: "Combinación de inicio — HTA Etapa 2 (AHA/ACC 2025: ≥140/≥90, se trata siempre sin importar el riesgo)", color: "rose", costo: second.costo, id: second.id, comboGroup });
      }
    }
  } else if (orthostaticBlock) {
    plan.push({ drug: "(Ninguno — simplificar)", dose: "NO escalar / considerar reducir", reason: orthostaticBlock.reason, color: "purple", costo: 0, id: orthostaticBlock.id });
  } else {
    // Ya en tratamiento: titular primero lo que no está a dosis máxima.
    // CORRECCIÓN (mismo hallazgo sistémico que metformina/eGFR y GLP-1/
    // pancreatitis): titular TODO fármaco no maxeado sin revisar si el
    // paciente desarrolló una contraindicación NUEVA desde que se inició —
    // ej. un IECA ya prescrito, no maxeado, en un paciente que ahora reporta
    // angioedema/tos con él, o cuyo eGFR cayó por debajo del mínimo seguro.
    state.notMaxed.forEach((e) => {
      const issue = currentDrugIssue(e.drug, flags);
      if (issue) {
        plan.push({ drug: e.drug.name, dose: "REVALORAR / SUSPENDER", reason: `Ya en tratamiento, pero ahora ${issue} — no continuar/titular sin revalorar`, color: "rose", costo: e.drug.costo, id: e.drug.id });
      } else {
        plan.push({ drug: e.drug.name, dose: `Titular a ${e.drug.mant}`, reason: "Ya en tratamiento, no a dosis máxima — titular antes de agregar otra clase", color: "amber", costo: e.drug.costo, id: e.drug.id });
      }
    });
    const allMaxed = state.notMaxed.length === 0;
    if (allMaxed && !atGoal) {
      // CORRECCIÓN (hallazgo de escalonamiento — pregunta del Dr. Ortega sobre
      // "cuándo se deben escalonar los tratamientos"): `firstLineClasses`
      // agrupa BCC-DHP + Tiazida como un solo "bucket" alternante al RAAS.
      // Eso funciona para pasar de 1 a 2 fármacos, pero en triple terapia (RAAS
      // + BCC-DHP + Tiazida, las 3 YA maxeadas, sin meta — la definición
      // clínica real de HTA RESISTENTE) el filtro `!usedIds.has(f.id)` seguía
      // encontrando OTRO fármaco individual dentro de una clase YA
      // representada (ej. Nifedipino cuando Amlodipino ya está maxeado, o
      // HCTZ cuando Clortalidona ya está maxeada) y lo ofrecía como si fuera
      // "la siguiente clase" — combinar dos BCC o dos tiazidas no aporta
      // beneficio antihipertensivo adicional real. Se identifican las 3
      // clases canónicas por separado (RAAS / BCC-DHP / Tiazida): si falta
      // alguna, se completa la triple terapia; si las 3 ya están presentes y
      // maxeadas, es HTA resistente verdadera y el 4º fármaco de elección por
      // guía es una MRA en dosis baja (espironolactona — PATHWAY-2, superior
      // a betabloqueante/alfabloqueante como 4ª línea), no otro fármaco de una
      // clase ya usada.
      const hasRAASClass = state.entries.some((e) => e.drug.grp.includes("ARA-II") || e.drug.grp.includes("IECA"));
      const hasBccDhp = state.entries.some((e) => e.drug.grp === "BCC Dihidropiridínico");
      const hasTiazida = state.entries.some((e) => e.drug.grp.includes("Tiazida"));
      if (hasRAASClass && hasBccDhp && hasTiazida) {
        const onAnyMRA = state.entries.some((e) => e.drug.grp.includes("MRA"));
        if (!onAnyMRA) {
          const mra = htn.filter((f) => f.grp === "MRA Esteroidea");
          const chosenMRA = rankByAccess(mra, flags, null)[0];
          if (chosenMRA) plan.push({ drug: chosenMRA.name, dose: chosenMRA.ini, reason: `HTA resistente verdadera (RAAS + BCC-DHP + Tiazida, las 3 a dosis máxima, meta <${bpGoal.sbp}/${bpGoal.dbp} no alcanzada) — 4ª línea: MRA en dosis baja (PATHWAY-2), no otro fármaco de una clase ya usada`, color: "purple", costo: chosenMRA.costo, id: chosenMRA.id });
        }
      } else {
        const missingClass = !hasRAASClass ? renalClasses : !hasBccDhp ? htn.filter((f) => f.grp === "BCC Dihidropiridínico") : htn.filter((f) => f.grp.includes("Tiazida"));
        const next = rankByAccess(missingClass.filter((f) => !state.usedIds.has(f.id)), flags, needsRAAS ? raasBenefitKey : null)[0];
        if (next) plan.push({ drug: next.name, dose: next.ini, reason: `Meta <${bpGoal.sbp}/${bpGoal.dbp} no alcanzada con dosis máxima de fármacos actuales — agregar siguiente clase de 1ª línea (completar triple terapia RAAS + BCC-DHP + Tiazida)`, color: "rose", costo: next.costo, id: next.id });
      }
    }
  }

  if (flags.erc && v(p.uacr) >= 30 && flags.egfr >= 25 && !state.usedIds.has("FINE")) {
    const fine = htn.find((f) => f.id === "FINE");
    // CORRECCIÓN (misma ronda de auditoría — hallazgo al revisar interacciones
    // en el bloque de ERC+T2D): antes se agregaba Finerenona SIEMPRE que
    // aplicaba la indicación, sin revisar si el paciente ya estaba en una MRA
    // esteroidea (Espironolactona/Eplerenona) por otra razón (p. ej. HTA
    // resistente). Combinar dos MRA simultáneos (esteroidea + no esteroidea)
    // no es una práctica segura — FIDELIO-DKD/FIGARO-DKD, los ensayos que dan
    // la evidencia de Finerenona en esta indicación, EXCLUYERON explícitamente
    // a pacientes con uso concurrente de otra MRA (riesgo de hiperkalemia
    // aditivo). En vez de agregarla encima, se recomienda SUSTITUIR la MRA
    // esteroidea por Finerenona (que además tiene evidencia renal específica
    // más robusta para esta población).
    const currentSteroidalMRA = state.entries.find((e) => e.drug.grp === "MRA Esteroidea");
    if (fine && currentSteroidalMRA) {
      plan.push({ drug: fine.name, dose: fine.ini, reason: `ERC+T2D con albuminuria — SUSTITUIR ${currentSteroidalMRA.drug.name} (MRA esteroidea) por Finerenona, no combinar ambas MRA a la vez (riesgo de hiperkalemia, excluido en FIDELIO/FIGARO-DKD)`, color: "amber", costo: fine.costo, id: fine.id });
    } else if (fine) {
      plan.push({ drug: fine.name, dose: fine.ini, reason: "ERC+T2D con albuminuria — reduce progresión renal/IC", color: "blue", costo: fine.costo, id: fine.id });
    }
  }

  // CATCH-ALL final (mismo hallazgo sistémico generalizado a las 3
  // categorías): fármacos HTN ya prescritos que ninguna rama anterior toca
  // — p. ej. un alfabloqueante o vasodilatador directo YA a dosis máxima
  // (por eso nunca entra a `state.notMaxed`), o una MRA esteroidea sin
  // indicación activa de Finerenona — también deben revisarse contra el
  // estado clínico actual antes de devolver el plan.
  state.entries.forEach((e) => {
    if (plan.some((x) => x.id === e.drug.id)) return;
    const issue = currentDrugIssue(e.drug, flags);
    if (issue) plan.push({ drug: e.drug.name, dose: "REVALORAR / SUSPENDER", reason: `Ya en tratamiento, pero ahora ${issue} — no continuar sin revalorar`, color: "rose", costo: e.drug.costo, id: e.drug.id });
  });

  plan.forEach((item) => { item.categoria = "htn"; });
  annotateRenalCaution(plan, flags);

  return { plan, bp, flags };
}

/** Plan de dislipidemia categórico (Algorithm Fig. 4 + escalonamiento estricto
 * ACC/AHA: estatina (moderada-alta intensidad) -> dosis MÁXIMA tolerada ->
 * ezetimibe -> (estatina+ezetimibe ambos maxeados) -> PCSK9i. Ezetimibe
 * NUNCA se agrega en la misma consulta en que se inicia la estatina; solo
 * cuando la estatina actual ya está a dosis máxima y el LDL sigue sobre
 * meta. Icosapent etilo (IPE) requiere, además, estatina YA a dosis máxima
 * (así lo especifica su propia ficha en pharma-db.js). */
export function buildLipidPlan(p) {
  const flags = getPatientFlags(p);
  const lipid = filterSafe(DB_PHARMA.filter((f) => f.cat === "lipid"), flags);
  const { label, target, reduccionMeta, statinIndicated, fuente } = classifyLipidRisk(p);
  const plan = [];
  const state = getMedicationState(p, "lipid");

  // CORRECCIÓN (hallazgo de auditoría, "algo más que no hayamos cubierto"):
  // la clasificación de riesgo (MUY ALTO/ALTO -> intensidad alta) es puramente
  // por LDL/comorbilidad, sin considerar fragilidad. ADA 2026 Cap. 13 / AACE
  // 2026 recomiendan, en pacientes ≥65a "muy complejos" (expectativa de vida
  // limitada, alta carga de tratamiento — misma categoría ya capturada en
  // p.saludStatus vía individualization.js) SIN ASCVD establecida (prevención
  // primaria) y SIN ERC severa (donde la evidencia de intensificación sigue
  // siendo favorable pese a la fragilidad), considerar de-intensificar a
  // estatina de intensidad moderada como decisión compartida — el riesgo de
  // efectos adversos/polifarmacia puede superar el beneficio marginal a corto
  // plazo. Deliberadamente NO se aplica si ya hay ASCVD establecida (prevención
  // secundaria, beneficio bien demostrado incluso en fragilidad) ni si hay ERC
  // severa (eGFR<30, donde KDIGO 2024 mantiene la indicación de estatina).
  const age = Number(p?.edad) || 0;
  const egfrLipid = calcEGFR(p);
  const severeCKD = egfrLipid > 0 && egfrLipid < 30;
  const frailDeintensify = age >= 65 && p?.saludStatus === "muyComplejo" && !flags.ascvd && !severeCKD;
  const rawHighIntensity = label === "MUY ALTO" || label === "ALTO";
  const intensityCapped = rawHighIntensity && frailDeintensify;
  const highIntensity = rawHighIntensity && !frailDeintensify;
  const statins = lipid.filter((f) => f.grp.includes("Estatina"));

  const currentStatin = state.entries.find((e) => e.drug.grp.includes("Estatina"));
  const currentEze = state.entries.find((e) => e.drug.id === "EZE");

  let statinMaxed = false;

  if (!currentStatin && statinIndicated === false) {
    // ACTUALIZACIÓN (integración PREVENT-ASCVD): riesgo <3% (Guía de
    // Dislipidemia 2026) sin LDL 160-189 -> la guía NO indica estatina en
    // este momento. Antes el motor recomendaba una estatina moderada a
    // CUALQUIER paciente sin excepción, sin importar qué tan bajo fuera su
    // riesgo real — este es el único caso donde ahora "ningún fármaco" es la
    // recomendación correcta, en vez de simplemente la de menor intensidad.
    plan.push({ drug: "(Ninguno)", dose: "Refuerzo de estilo de vida", reason: `Riesgo ${label} (${fuente}) — estatina no indicada en este momento; reforzar dieta/ejercicio/cese de tabaquismo y reevaluar riesgo periódicamente`, color: "emerald", costo: 0, id: "LIFESTYLE_ONLY_LIPID" });
  } else if (!currentStatin) {
    // CORRECCIÓN (misma auditoría de guías, hallazgo tras la pregunta IECA vs
    // ARA-II): para riesgo MUY ALTO/ALTO sí se restringía a "Alta Intensidad",
    // pero para MODERADO/BAJO se usaba el pool COMPLETO de estatinas (alta +
    // moderada) sin filtrar. Como todas comparten benef.ascvd=true, el
    // desempate de `rankByAccess` (costo, luego orden del arreglo) caía
    // siempre en Atorvastatina — la primera "Alta Intensidad" en pharma-db.js
    // — incluso en un paciente de riesgo MODERADO/BAJO, donde la guía
    // indica iniciar con intensidad MODERADA (la alta intensidad se reserva
    // para riesgo alto/muy alto o cuando no se alcanza meta). Se restringe
    // también el pool a "Baja/Moderada Intensidad" en ese caso, simétrico a
    // la rama de alto riesgo.
    let statinPool = highIntensity
      ? statins.filter((f) => f.grp.includes("Alta Intensidad"))
      : statins.filter((f) => f.grp.includes("Baja/Moderada"));
    // DOMINIO 5 — Caso 54: deprioriza Atorvastatina si hay TARV inhibidor de
    // proteasa/cobicistat activo (ver hiv-art.js) — se aplica ANTES de
    // rankByAccess para que la preferencia clínica (menor interacción CYP3A4)
    // gane sobre el desempate por costo/acceso.
    statinPool = deprioritizeAtorvastatinIfHivArt(statinPool, flags);
    const chosen = rankByAccess(statinPool, flags, "ascvd")[0];
    const intensityNote = intensityCapped
      ? ` — riesgo ${label} normalmente indicaría intensidad alta, pero se de-intensifica a moderada por fragilidad extrema (≥65a "muy complejo", sin ASCVD establecida, sin ERC severa) — decisión compartida, ADA 2026 Cap. 13/AACE 2026`
      : "";
    const hivArtNote = flags.tarvInhibidorProteasa && chosen?.id !== "ATOR"
      ? " — se prioriza sobre Atorvastatina por interacción CYP3A4 con TARV inhibidor de proteasa/cobicistat (Caso 54)"
      : "";
    const reduccionTxt = reduccionMeta ? `, reducción ${reduccionMeta}` : "";
    if (chosen) plan.push({ drug: chosen.name, dose: chosen.ini, reason: `Riesgo ${label} (${fuente}) — meta LDL-C <${target} mg/dL${reduccionTxt} — intensidad ${highIntensity ? "alta" : "moderada"}${intensityNote}${hivArtNote}`, color: "purple", costo: chosen.costo, id: chosen.id });
  } else if (highIntensity && !currentStatin.drug.grp.includes("Alta Intensidad")) {
    // CORRECCIÓN (mismo hallazgo): paciente reclasificado a riesgo ALTO/MUY
    // ALTO mientras ya estaba en una estatina de intensidad MODERADA (incluso
    // a dosis máxima). Antes esto caía directo en la rama `statinMaxed=true`
    // -> saltaba a ofrecer Ezetimibe, SIN pasar antes por escalar a una
    // estatina de alta intensidad — que es el paso que exige la guía
    // ACC/AHA 2018 antes de cualquier add-on no-estatínico. Se prioriza
    // cambiar de CLASE (a alta intensidad) sobre agregar ezetimibe.
    let pool = statins.filter((f) => f.grp.includes("Alta Intensidad") && f.id !== currentStatin.drug.id);
    pool = deprioritizeAtorvastatinIfHivArt(pool, flags); // DOMINIO 5 — Caso 54
    const chosen = rankByAccess(pool, flags, "ascvd")[0];
    if (chosen) plan.push({ drug: chosen.name, dose: chosen.ini, reason: `Riesgo reclasificado a ${label} con estatina de intensidad moderada (${currentStatin.drug.name}) — escalar a intensidad alta antes de agregar ezetimibe (ACC/AHA 2018)`, color: "purple", costo: chosen.costo, id: chosen.id });
  } else if (currentDrugIssue(currentStatin.drug, flags)) {
    // Mismo guard sistémico — hoy ninguna estatina tiene `contra`/`egfrMin`
    // en pharma-db.js, así que esta rama no se activa todavía, pero queda
    // lista para cuando se agregue cualquier estatina con contraindicación
    // específica (evita reintroducir el mismo tipo de bug encontrado con
    // metformina/GLP-1/IECA).
    plan.push({ drug: currentStatin.drug.name, dose: "REVALORAR / SUSPENDER", reason: `Estatina ya en uso, pero ahora ${currentDrugIssue(currentStatin.drug, flags)} — no continuar/titular sin revalorar`, color: "rose", costo: currentStatin.drug.costo, id: currentStatin.drug.id });
  } else if (!currentStatin.isMax) {
    plan.push({ drug: currentStatin.drug.name, dose: `Titular a ${currentStatin.drug.mant}`, reason: "Estatina no a dosis máxima tolerada — titular antes de agregar ezetimibe (escalonamiento por guía)", color: "purple", costo: currentStatin.drug.costo, id: currentStatin.drug.id });
  } else {
    statinMaxed = true;
  }

  // Ezetimibe: solo si la estatina YA está a dosis máxima y el LDL sigue sobre meta.
  if (statinMaxed && !currentEze && v(p.ldl) > 0 && v(p.ldl) > target) {
    const eze = lipid.find((f) => f.id === "EZE");
    if (eze) plan.push({ drug: eze.name, dose: eze.ini, reason: "LDL sobre meta con estatina a dosis máxima — add-on de 1ª elección", color: "purple", costo: eze.costo, id: eze.id });
  }

  // PCSK9i: estatina + ezetimibe ambos presentes y a dosis máxima (ezetimibe es
  // dosis fija en la DB, así que "presente" ya equivale a "maxeado"), LDL sigue
  // sobre meta, y (ASCVD establecida O hipercolesterolemia familiar). El gap de
  // datos de "FH" que existía antes ya se cerró: ver flags.fh (antecedente
  // familiar de hipercolesterolemia, sección Antecedentes Familiares).
  if (statinMaxed && currentEze && v(p.ldl) > 0 && v(p.ldl) > target && (flags.ascvd || flags.fh) && !state.usedIds.has("EVOLO") && !state.usedIds.has("ALIRO")) {
    const pcsk9 = rankByAccess(lipid.filter((f) => f.grp.includes("PCSK9i")), flags, "ascvd")[0];
    if (pcsk9) plan.push({ drug: pcsk9.name, dose: pcsk9.ini, reason: `LDL sobre meta con estatina + ezetimibe a dosis máxima, ${flags.ascvd ? "ASCVD" : "hipercolesterolemia familiar"} — escalar a PCSK9i`, color: "purple", costo: pcsk9.costo, id: pcsk9.id });
  }

  if (v(p.trigliceridos) >= 500) {
    const feno = lipid.find((f) => f.id === "FENO");
    if (feno && !state.usedIds.has("FENO")) plan.push({ drug: feno.name, dose: feno.ini, reason: "TG ≥500 mg/dL — prevención de pancreatitis", color: "amber", costo: feno.costo, id: feno.id });
  } else if (v(p.trigliceridos) >= 150 && v(p.trigliceridos) < 500 && flags.ascvd && statinMaxed) {
    const ipe = lipid.find((f) => f.id === "IPE");
    if (ipe && !state.usedIds.has("IPE")) plan.push({ drug: ipe.name, dose: ipe.ini, reason: "TG 150-499 + ASCVD en estatina a dosis máxima — reduce CVD 25%", color: "amber", costo: ipe.costo, id: ipe.id });
  }

  // CATCH-ALL final (mismo hallazgo sistémico — el más relevante aquí es
  // Fenofibrato/Gemfibrozilo, egfrMin=30 en pharma-db.js: esta función nunca
  // tenía NINGUNA rama de continuación para fibratos, así que un paciente ya
  // en FENO cuyo eGFR cae luego por debajo de 30 no recibía ni titulación ni
  // advertencia — pasaba en completo silencio).
  state.entries.forEach((e) => {
    if (plan.some((x) => x.id === e.drug.id)) return;
    const issue = currentDrugIssue(e.drug, flags);
    if (issue) plan.push({ drug: e.drug.name, dose: "REVALORAR / SUSPENDER", reason: `Ya en tratamiento, pero ahora ${issue} — no continuar sin revalorar`, color: "rose", costo: e.drug.costo, id: e.drug.id });
  });

  plan.forEach((item) => { item.categoria = "lipid"; });
  annotateRenalCaution(plan, flags);

  return { plan, label, target, flags };
}

// Semaglutida/Liraglutida/Tirzepatida existen DOS VECES en pharma-db.js: una
// vez con dosis/indicación de DIABETES (categoría "antidiabetic": SEMA, LIRA,
// TIRZ) y otra con dosis/indicación de OBESIDAD, más alta (categoría
// "obesity": SEMA24, LIRA3, TIRZ_OB) — es la MISMA molécula, no dos fármacos
// distintos. buildObesityPlan() usa este mapa para nunca ofrecer la versión
// "obesity" como si fuera un fármaco nuevo cuando el paciente ya está en la
// versión "antidiabetic", y para saber cuándo sí corresponde escalar de
// dosis/indicación.
const OBESITY_MOLECULE_PAIRS = { SEMA: "SEMA24", LIRA: "LIRA3", TIRZ: "TIRZ_OB" };

/**
 * Plan de farmacoterapia dedicada para obesidad (AACE/Endocrine Society/
 * Obesity Medicine Association 2025) — categoría "obesity" completa de
 * pharma-db.js (Fentermina, Fentermina/Topiramato, Naltrexona/Bupropión,
 * Orlistat, y las versiones de dosis-obesidad de Semaglutida/Liraglutida/
 * Tirzepatida).
 *
 * HALLAZGO (auditoría de escalonamiento, Dr. Ortega — "revisemos los demás
 * grupos de fármacos y cuándo se deben escalonar"): esta categoría existía
 * completa en pharma-db.js desde hace varias sesiones (con su propio flujo
 * de consulta manual en EndoFarma), pero NINGÚN `build*Plan` la usaba nunca
 * para generar una recomendación automática — un paciente obeso solo recibía
 * un fármaco de pérdida de peso indirectamente, a través del pool
 * "antidiabetic" (SGLT2i/GLP-1/GIP con `peso:"perdida"`), lo cual funciona
 * para pacientes con DM2 pero deja sin cobertura dedicada las opciones NO
 * incretina (Fentermina/Topiramato, Naltrexona/Bupropión, Orlistat) y el
 * escalonamiento de dosis-diabetes -> dosis-obesidad de la MISMA molécula.
 *
 * Para evitar duplicar el mismo principio activo bajo dos IDs distintos (el
 * riesgo real al agregar este motor), recibe `dmPlan` (el plan YA armado por
 * buildAntidiabeticPlan en la misma consulta): si esa función ya asignó un
 * fármaco NUEVO específicamente para pérdida de peso en este mismo paso
 * (rama de fallback obesidad/hipoRisk), buildObesityPlan no agrega un
 * segundo agente compitiendo por el mismo objetivo.
 */
export function buildObesityPlan(p, dmPlan = []) {
  const flags = getPatientFlags(p);
  const plan = [];
  if (!flags.obesidad) return { plan, flags };

  const obesityDrugs = filterSafe(DB_PHARMA.filter((f) => f.cat === "obesity"), flags);
  const state = getMedicationState(p, "obesity");
  const antidiabeticState = getMedicationState(p, "antidiabetic");

  // 1) Continuidad/seguridad de lo YA prescrito directamente en la categoría
  // "obesity" — mismo patrón currentDrugIssue del resto del motor (titular
  // si no maxeado y sigue seguro; revalorar/suspender si se volvió inseguro;
  // catch-all para lo maxeado que ninguna rama anterior toca).
  state.notMaxed.forEach((e) => {
    const issue = currentDrugIssue(e.drug, flags);
    if (issue) {
      plan.push({ drug: e.drug.name, dose: "REVALORAR / SUSPENDER", reason: `Ya en tratamiento para obesidad, pero ahora ${issue} — no continuar/titular sin revalorar`, color: "rose", costo: e.drug.costo, id: e.drug.id });
    } else {
      plan.push({ drug: e.drug.name, dose: `Titular a ${e.drug.mant}`, reason: "Ya en tratamiento para obesidad, no a dosis máxima — titular antes de agregar otro agente", color: "amber", costo: e.drug.costo, id: e.drug.id });
    }
  });
  state.entries.forEach((e) => {
    if (plan.some((x) => x.id === e.drug.id)) return;
    const issue = currentDrugIssue(e.drug, flags);
    if (issue) plan.push({ drug: e.drug.name, dose: "REVALORAR / SUSPENDER", reason: `Ya en tratamiento para obesidad, pero ahora ${issue} — no continuar sin revalorar`, color: "rose", costo: e.drug.costo, id: e.drug.id });
  });

  // 2) Escalonamiento dosis-diabetes -> dosis-obesidad de la MISMA molécula:
  // si el paciente ya está en la versión "antidiabetic" (SEMA/LIRA/TIRZ) y
  // ya está a dosis máxima de esa indicación, y el criterio de obesidad
  // sigue activo, se sugiere escalar a la versión de dosis-obesidad — nunca
  // se ofrece como fármaco "nuevo" independiente.
  let moleculeAlreadyActive = false;
  Object.entries(OBESITY_MOLECULE_PAIRS).forEach(([dmId, obId]) => {
    const dmEntry = antidiabeticState.entries.find((e) => e.drug.id === dmId);
    if (!dmEntry) return;
    moleculeAlreadyActive = true;
    if (dmEntry.isMax && !state.usedIds.has(obId) && !plan.some((x) => x.id === obId)) {
      const obDrug = DB_PHARMA.find((f) => f.id === obId);
      if (obDrug && currentDrugIssue(obDrug, flags) === null) {
        plan.push({ drug: obDrug.name, dose: obDrug.ini, reason: `Ya a dosis máxima de indicación diabetes (${dmEntry.drug.name}) — mismo principio activo; escalar a dosis/indicación de obesidad para meta adicional de pérdida de peso`, color: "neon", costo: obDrug.costo, id: obDrug.id });
      }
    }
  });

  // 3) Solo se elige un candidato NUEVO del catálogo completo de obesidad
  // (excluyendo Setmelanotida — indicación genética específica, POMC/PCSK1/
  // LEPR, que esta app no captura como dato; queda disponible solo para
  // consulta/prescripción manual en EndoFarma) si NO hay nada activo todavía
  // en esta categoría, NINGUNA molécula compartida ya en uso, y
  // buildAntidiabeticPlan NO acaba de asignar un fármaco nuevo para el mismo
  // objetivo en esta misma consulta.
  const dmFreshWeightPick = dmPlan.some((x) => x.reason && (x.reason.includes("meta de pérdida de peso") || x.reason.includes("agente con pérdida de peso")));
  const nothingActiveYet = plan.length === 0 && state.entries.length === 0 && !moleculeAlreadyActive;
  if (nothingActiveYet && !dmFreshWeightPick) {
    const candidates = obesityDrugs.filter((f) => f.id !== "SETME" && !state.usedIds.has(f.id));
    // DOMINIO 3 — Caso 50 (Dr. Ortega, 10-ago-2026): antipsicótico de alto
    // riesgo metabólico -> priorizar Tirzepatida/Semaglutida dosis-obesidad
    // (evidencia específica en esta población) sobre el desempate genérico
    // por costo/acceso — ver psychiatry.js. Si ninguna está disponible
    // (contraindicación ya filtrada en `candidates`, o ya en uso), cae de
    // vuelta al criterio genérico.
    const antipsychoticPick = pickAntipsychoticPriorityDrug(candidates, flags);
    const chosen = antipsychoticPick || rankByAccess(candidates, flags, null)[0];
    if (chosen) {
      const reason = antipsychoticPick
        ? "Obesidad inducida/agravada por antipsicótico de alto riesgo metabólico — se prioriza esta molécula (evidencia específica en aumento de peso inducido por antipsicóticos) sobre el desempate habitual por costo/acceso"
        : "Obesidad/sobrepeso — meta de pérdida de peso (farmacoterapia dedicada, AACE/Endocrine Society 2025)";
      plan.push({ drug: chosen.name, dose: chosen.ini, reason, color: "neon", costo: chosen.costo, id: chosen.id });
    }
  }

  plan.forEach((item) => { item.categoria = "obesity"; });
  annotateRenalCaution(plan, flags);
  return { plan, flags };
}

/**
 * Plan integral: combina antidiabético + HTN (si aplica) + lípidos (si
 * aplica) + obesidad (si aplica). Reemplaza a la lógica vieja de
 * `suggestTherapy` como fuente de verdad.
 */
export function buildTreatmentPlan(p) {
  // GUARDRAIL (10-ago-2026, cláusula de resguardo lógico — propuesta del
  // Dr. Ortega tras revisar 20 casos de borde clínico): si el paciente está
  // en un extremo fisiológico absoluto, NO se calcula ningún plan
  // ambulatorio — recomendar "iniciar metformina" a un paciente con
  // creatinina 12 sería, en el mejor caso, inútil, y en el peor, peligroso
  // si alguien lo lee sin pensar. Ver js/redflags.js para los umbrales y su
  // fuente; el límite es deliberado: SOLO detectar y derivar, nunca sugerir
  // manejo agudo.
  const redFlags = checkRedFlags(p);
  if (redFlags.activo) {
    return { items: [], dmNote: null, flags: {}, interactionWarnings: [], redFlags, reviewCautions: [] };
  }

  const dm = buildAntidiabeticPlan(p);
  const out = [...dm.plan];

  if (v(p.tas) >= 130 || v(p.tad) >= 80) {
    out.push(...buildHTNPlan(p).plan);
  }

  // CAPA 3 — Caso 42 (Dr. Ortega, 10-ago-2026): hiperkalemia zona gris con
  // bloqueo RAAS/MRA activo. Se evalúa AQUÍ (no dentro de buildHTNPlan) a
  // propósito: buildHTNPlan solo se invoca si la PA actual está ≥130/80
  // (gate justo arriba), pero un paciente con PA bien controlada (<130/80)
  // puede seguir en RAAS/MRA por indicación renal/IC y desarrollar
  // hiperkalemia de todos modos — este caso no debe depender de que la PA
  // esté elevada para aparecer.
  const htnStateForAdvisories = getMedicationState(p, "htn");
  const kZoneGray = checkHyperkalemiaZoneGray(p, htnStateForAdvisories);
  if (kZoneGray) {
    out.push({ drug: "(Agregar quelante de K+)", dose: "Patiromer / Ciclosilicato de Na-Zr", reason: kZoneGray.reason, color: "amber", costo: 0, id: kZoneGray.id, categoria: "htn" });
  }

  // DOMINIO GDMT — Beta-bloqueante para Insuficiencia Cardíaca (11-ago-2026,
  // auditoría de secuencia — Dr. Ortega): el catálogo ya tiene los 3
  // beta-bloqueantes con evidencia de mortalidad en IC-FEVI reducida
  // (Carvedilol/Bisoprolol/Metoprolol Succinato — nunca un beta-bloqueante
  // genérico), pero ninguna rama del motor los recomendaba activamente:
  // buildHTNPlan solo automatiza el pilar RAAS de la terapia cuádruple de IC
  // (AHA/ACC/HFSA 2022: RAAS/ARNI + beta-bloqueante + MRA + iSGLT2). Se
  // evalúa AQUÍ (no dentro de buildHTNPlan), igual que el Caso 42/45 de
  // arriba — un paciente con IC y PA ya controlada (<130/80, donde
  // buildHTNPlan nunca se invoca) sigue necesitando este pilar de todos
  // modos. Solo se sugiere si el paciente no está YA en un beta-bloqueante
  // de NINGÚN subgrupo — no se sustituye uno no-GDMT que el médico ya eligió
  // por otra razón, esto solo cubre el vacío de "ninguno en absoluto".
  const onAnyBetaBlocker = htnStateForAdvisories.entries.some((e) => e.drug.grp.includes("Beta-bloqueante"));
  if (dm.flags.ic && !onAnyBetaBlocker) {
    const gdmtBB = filterSafe(DB_PHARMA.filter((f) => f.cat === "htn" && (f.grp === "Beta-bloqueante Cardioselectivo" || f.grp === "Beta-bloqueante combinado α-β")), dm.flags);
    const chosenBB = rankByAccess(gdmtBB, dm.flags, null)[0];
    if (chosenBB) {
      out.push({ drug: chosenBB.name, dose: chosenBB.ini, reason: "Insuficiencia Cardíaca — pilar de terapia cuádruple GDMT (AHA/ACC/HFSA 2022), independiente del pilar RAAS ya cubierto", color: "blue", costo: chosenBB.costo, id: chosenBB.id, categoria: "htn" });
    }
  }

  // CAPA 4 — Caso 45 (Dr. Ortega, 10-ago-2026): "Tríada Mortal" (AINE +
  // RAAS +/- diurético). Igual que el Caso 42, se evalúa aquí (no dentro de
  // buildHTNPlan) para no depender del gate de PA≥130/80 — el riesgo renal
  // de esta combinación no depende de qué tan alta esté la presión arterial
  // actual. AINE ahora SÍ tiene ficha propia en DB_PHARMA (cat "otros",
  // 10-ago-2026) — pero sigue viviendo fuera de checkInteractions()
  // (interactions.js) porque ese motor solo compara pares DENTRO de las 4
  // categorías de prescripción (antidiabetic/htn/lipid/obesity); "otros" es
  // deliberadamente una categoría aparte (ver pharma-db.js) que no participa
  // del ranking/selección de fármaco nuevo. `dm.flags.aineReciente` ya
  // resuelve si hay algún AINE activo (ver getPatientFlags).
  const tripleWhammy = checkTripleWhammy(dm.flags, htnStateForAdvisories);
  if (tripleWhammy) {
    out.push({ drug: "(Evitar AINE)", dose: tripleWhammy.severidad === "alta" ? "Tríada Mortal — riesgo alto" : "Riesgo moderado", reason: tripleWhammy.reason, color: "rose", costo: 0, id: tripleWhammy.id, categoria: "htn" });
  }

  // DOMINIO 1 — Caso 47 (Dr. Ortega, 10-ago-2026): nefrotoxicidad por AINE
  // en ERC de base, independiente de si el paciente toma RAAS/diurético
  // (a diferencia del Caso 45 arriba). Solo se agrega si el Caso 45 NO ya
  // cubrió este mismo AINE con una advertencia (RAAS activo) — evita 2
  // tarjetas de "evitar AINE" simultáneas cuando ambos motivos aplican a la
  // vez; el mensaje del Caso 45 ya es más específico en ese escenario.
  if (!tripleWhammy) {
    const nsaidCkd = checkNsaidCkdRisk(dm.flags);
    if (nsaidCkd) {
      out.push({ drug: "(Evitar AINE)", dose: "Riesgo renal — ERC de base", reason: nsaidCkd.reason, color: "rose", costo: 0, id: nsaidCkd.id, categoria: "htn" });
    }
  }

  // DOMINIO 1 — Caso 46 (Dr. Ortega, 10-ago-2026): hiperglucemia/HTA por
  // corticoide. Se evalúa aquí (nivel de buildTreatmentPlan) porque afecta
  // simultáneamente el manejo glucémico y el de PA — no pertenece
  // exclusivamente a ninguna de las dos categorías.
  const corticoRisk = checkCorticosteroidRisk(p);
  if (corticoRisk) {
    out.push({ drug: "(Corticoide sistémico activo)", dose: corticoRisk.esAlta ? "Vigilancia estrecha" : "Vigilancia", reason: corticoRisk.reason, color: corticoRisk.esAlta ? "rose" : "amber", costo: 0, id: corticoRisk.id, categoria: "antidiabetic" });
  }

  // DOMINIO 6 — Caso 56 (Dr. Ortega, 10-ago-2026): "Reglas de Día de
  // Enfermedad" (Metformina/iSGLT2/IECA/ARA-II) — ver sick-day.js. Se evalúa
  // aquí (nivel de buildTreatmentPlan, no dentro de un build*Plan individual)
  // porque abarca fármacos de DOS categorías distintas (antidiabetic + htn)
  // a la vez.
  const sickDay = checkSickDayRules(p, getMedicationState(p, "antidiabetic"), htnStateForAdvisories);
  if (sickDay) {
    out.push({ drug: "(Suspensión temporal — día de enfermedad)", dose: "SUSPENDER hasta resolución", reason: sickDay.reason, color: "rose", costo: 0, id: sickDay.id, categoria: "antidiabetic" });
  }
  if (v(p.ldl) > 0 || v(p.trigliceridos) > 0) {
    out.push(...buildLipidPlan(p).plan);
  }
  out.push(...buildObesityPlan(p, dm.plan).plan);

  // Hallazgo de auditoría (limitación documentada — "sin verificación de
  // interacciones fármaco-fármaco"): cada build*Plan revisa contraindicación
  // por comorbilidad/eGFR y evita duplicar subgrupo DENTRO de su propia
  // categoría, pero ninguno comparaba fármacos de categorías DISTINTAS entre
  // sí (ej. Gemfibrozilo de "lipid" contra una estatina de "lipid" en otro
  // subgrupo, o un IECA de "htn" contra una MRA también de "htn").
  //
  // IMPORTANTE: se revisa contra TODOS los fármacos ACTIVOS del paciente
  // (medicación actual de las 4 categorías) MÁS lo recién recomendado en
  // `out` — no solo `out`. Un fármaco ya prescrito y a dosis máxima, sin
  // ningún problema propio, no genera ninguna línea en `out` (build*Plan
  // solo emite líneas "accionables": inicio, titulación, o advertencia) —
  // si solo se revisara `out`, una interacción entre dos fármacos YA
  // estables pasaría completamente inadvertida.
  const allActiveAndPlanned = [
    ...getMedicationState(p, "antidiabetic").entries.map((e) => ({ id: e.drug.id, drug: e.drug.name })),
    ...getMedicationState(p, "htn").entries.map((e) => ({ id: e.drug.id, drug: e.drug.name })),
    ...getMedicationState(p, "lipid").entries.map((e) => ({ id: e.drug.id, drug: e.drug.name })),
    ...getMedicationState(p, "obesity").entries.map((e) => ({ id: e.drug.id, drug: e.drug.name })),
    ...out,
  ];
  const interactionWarnings = checkInteractions(allActiveAndPlanned);

  const reviewCautions = buildReviewCautions(p);

  return { items: out, dmNote: dm.note, flags: dm.flags, interactionWarnings, redFlags, reviewCautions };
}

/** Sugerencias terapéuticas (Management). Ahora respaldadas por el motor categórico. */
export function suggestTherapy(p) {
  return buildTreatmentPlan(p).items;
}
