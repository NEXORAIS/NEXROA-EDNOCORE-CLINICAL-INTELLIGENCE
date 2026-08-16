/* --- ENDOINSULIN: Dosificación de insulina + triada de automonitoreo ---
 * Módulo nuevo (a petición del Dr. Ortega, 10-ago-2026 — "punto #1" de la
 * ronda), autocontenido igual que interactions.js/screening.js: NO modifica
 * buildAntidiabeticPlan ni el resto de calculations.js. Se integra en
 * EndoManagement (ver render.js -> renderAll) como un panel adicional.
 *
 * REGLAS DE DOSIFICACIÓN (confirmadas con el Dr. Ortega, textualmente):
 *   - Virgen de insulina basal: 0.1-0.2 UI/kg/día (MISMA cifra ya documentada
 *     en pharma-db.js para Glargina/Degludec/Detemir/NPH — no se inventa un
 *     número nuevo, se REUTILIZA y se multiplica por el peso real).
 *   - Ya con basal establecida y NO en metas: considerar escalar hacia
 *     0.5 UI/kg/día.
 *   - Bolo/prandial (esquema basal-bolo): 0.05-0.1 UI/kg/comida (misma
 *     cifra ya documentada en pharma-db.js para Lispro/Aspart/Regular).
 *
 * LÓGICA DE "¿BASAL O BOLO?" (razonamiento clínico dado por el Dr. Ortega):
 * la insulina basal controla la glucosa en AYUNO/NOCTURNA; si esos puntos
 * están en meta pero la PREPRANDIAL/POSPRANDIAL está elevada, el problema
 * es el bolo (ajustarlo o iniciarlo), no la basal.
 *
 * FUENTE: dosis reutilizadas de pharma-db.js (Compendio ya citado en el
 * expediente); metas de glucosa en ayuno/preprandial reutilizan
 * individualization.js (GOALS_TABLE, misma fuente que EndoGoals); meta
 * posprandial (<180 mg/dL general, relajada en pacientes complejos/frágiles)
 * es el estándar ADA Standards of Care 2026 para automonitoreo capilar.
 */

import { DB_PHARMA } from "./pharma-db.js";
import { v, getA1cEfectiva } from "./calculations.js";
import { getA1cTarget, getGlycemicAndBPGoals } from "./individualization.js";
import { getPatient } from "./state.js";
import { addOrUpdateRxDose } from "./rx.js";

const BASAL_IDS = DB_PHARMA.filter((f) => f.grp === "Insulina Basal").map((f) => f.id);
const PRANDIAL_IDS = DB_PHARMA.filter((f) => f.grp === "Insulina Prandial").map((f) => f.id);

function activeIds(p, categoria) {
  return ((p.medicacionActual && p.medicacionActual[categoria]) || []).map((e) => e.id);
}

export function tieneBasalActiva(p) {
  return activeIds(p, "antidiabetic").some((id) => BASAL_IDS.includes(id));
}
export function tienePrandialActiva(p) {
  return activeIds(p, "antidiabetic").some((id) => PRANDIAL_IDS.includes(id));
}

function parseRango(str) {
  const m = String(str || "").match(/(\d+)\s*-\s*(\d+)/);
  return m ? { min: Number(m[1]), max: Number(m[2]) } : null;
}

/** Mismo criterio de selección de nivel que getGlycemicAndBPGoals en
 * individualization.js — se replica aquí SOLO para elegir el techo
 * posprandial (que no vive en individualization.js); el rango de ayuno
 * sigue viniendo de ahí directamente (parseado), para no duplicar esa
 * fuente de verdad. */
function resolveGoalTier(p) {
  const age = v(p.edad);
  if (age >= 65) return p.saludStatus || "sano";
  if (p.bajoRiesgoTratamiento) return "bajoRiesgo";
  return "general";
}

const POSPRANDIAL_MAX_POR_NIVEL = { general: 180, bajoRiesgo: 180, sano: 180, complejo: 200, muyComplejo: 200 };

export function computeGlucoseGoals(p) {
  const tier = resolveGoalTier(p);
  const goals = getGlycemicAndBPGoals({ age: v(p.edad), healthStatus: p.saludStatus || "sano", lowTreatmentBurden: !!p.bajoRiesgoTratamiento });
  const ayunoRango = parseRango(goals.ayuno) || { min: 80, max: 130 };
  const posprandialMax = POSPRANDIAL_MAX_POR_NIVEL[tier] ?? 180;
  return { ayunoMin: ayunoRango.min, ayunoMax: ayunoRango.max, posprandialMax, tier };
}

/** Clasifica un punto de glucosa contra su meta.
 * Estados: sin_dato | hipoglucemia_nivel2 (<54 mg/dL, clínicamente
 * significativa) | hipoglucemia_nivel1 (54-69 mg/dL, alerta) | bajo (entre
 * 70 y el mínimo de meta) | en_meta | elevado.
 *
 * ACTUALIZACIÓN (11-ago-2026, a petición del Dr. Ortega — "necesitamos los
 * rangos originales de hipoglucemia marcando, sin embargo ahí puedes dar
 * clasificación"): el rango original <70 mg/dL para "hipoglucemia" NO
 * cambió — sigue siendo el mismo corte de siempre. Lo que se agrega es una
 * subclasificación DENTRO de ese rango ya establecido, siguiendo los
 * niveles de la clasificación internacional de hipoglucemia del ADA
 * (Standards of Care 2026, adoptada también por ISPAD/Endocrine Society):
 * Nivel 1 = 54-69 mg/dL (alerta clínica, umbral de acción); Nivel 2 = <54
 * mg/dL (clínicamente significativa, umbral de daño neuroglucopénico real).
 *
 * LÍMITE: el Nivel 3 ADA (hipoglucemia severa — alteración cognitiva/
 * funcional que requiere asistencia de terceros para tratarse, INDEPENDIENTE
 * del valor numérico) no se clasifica aquí — depende de la presentación
 * clínica del episodio, no de un valor de automonitoreo capturado, y este
 * panel solo procesa datos numéricos de glucosa.
 */
function evaluarPunto(valor, min, max) {
  const val = v(valor);
  if (val <= 0) return { estado: "sin_dato", valor: null };
  if (val < 54) return { estado: "hipoglucemia_nivel2", valor: val };
  if (val < 70) return { estado: "hipoglucemia_nivel1", valor: val };
  if (min !== null && val < min) return { estado: "bajo", valor: val };
  if (val > max) return { estado: "elevado", valor: val };
  return { estado: "en_meta", valor: val };
}

export function computeMonitoreo(p) {
  const { ayunoMin, ayunoMax, posprandialMax } = computeGlucoseGoals(p);
  const ayuno = evaluarPunto(p.glucosa, ayunoMin, ayunoMax);
  const nocturna = evaluarPunto(p.glucosaNocturna, ayunoMin, ayunoMax);
  const preprandial = evaluarPunto(p.glucosaPreprandial, ayunoMin, ayunoMax);
  const posprandial = evaluarPunto(p.glucosaPosprandial, null, posprandialMax);

  const puntos = { ayuno, nocturna, preprandial, posprandial };
  const todosSinDato = Object.values(puntos).every((x) => x.estado === "sin_dato");

  let interpretacion, colorInterpretacion;
  const bajoOHipo = (x) => x.estado === "hipoglucemia_nivel1" || x.estado === "hipoglucemia_nivel2" || x.estado === "bajo";
  const basalInsuficiente = ayuno.estado === "elevado" || nocturna.estado === "elevado";
  const basalExcesiva = bajoOHipo(ayuno) || bajoOHipo(nocturna);
  const bolusInsuficiente = preprandial.estado === "elevado" || posprandial.estado === "elevado";

  if (todosSinDato) {
    interpretacion = "Captura el automonitoreo (ayuno/nocturna/preprandial/posprandial) para evaluar si la dosis basal y el bolo son adecuados.";
    colorInterpretacion = "slate";
  } else if (basalExcesiva) {
    interpretacion = "Ayuno y/o nocturna por debajo de meta (o en rango de hipoglucemia) — considerar REDUCIR la dosis basal.";
    colorInterpretacion = "red";
  } else if (basalInsuficiente && bolusInsuficiente) {
    interpretacion = "Ayuno/nocturna Y preprandial/posprandial elevados — la basal parece insuficiente Y hay hiperglucemia asociada a las comidas; revisar ambas.";
    colorInterpretacion = "red";
  } else if (basalInsuficiente) {
    interpretacion = "Ayuno/nocturna elevados — la insulina BASAL no está cubriendo la glucosa en ayuno; considerar escalar la dosis basal.";
    colorInterpretacion = "amber";
  } else if (bolusInsuficiente) {
    interpretacion = "Ayuno/nocturna en meta, pero preprandial/posprandial elevados — la basal está funcionando; esto sugiere ajustar o INICIAR un bolo prandial.";
    colorInterpretacion = "amber";
  } else {
    interpretacion = "Control adecuado en los puntos de automonitoreo evaluados.";
    colorInterpretacion = "emerald";
  }

  return { ...puntos, interpretacion, colorInterpretacion, basalInsuficiente, basalExcesiva, bolusInsuficiente };
}

/** Dosis de insulina BASAL — ver reglas citadas en el encabezado del archivo. */
export function computeBasalInsulinDose(p) {
  const peso = v(p.peso);
  if (peso <= 0) return { estado: "sin_peso" };

  if (!tieneBasalActiva(p)) {
    return {
      estado: "virgen",
      dosisMinUI: Math.round(peso * 0.1 * 10) / 10,
      dosisMaxUI: Math.round(peso * 0.2 * 10) / 10,
      fuente: "0.1-0.2 UI/kg/día (pharma-db.js — Glargina/Degludec/Detemir/NPH) × peso real del paciente.",
    };
  }

  const a1c = getA1cEfectiva(p);
  const a1cTarget = getA1cTarget({ age: v(p.edad), healthStatus: p.saludStatus || "sano", lowTreatmentBurden: !!p.bajoRiesgoTratamiento });
  const a1cEnMeta = a1c.value > 0 ? a1c.value <= a1cTarget : null;
  const { basalInsuficiente, basalExcesiva } = computeMonitoreo(p);

  if (a1cEnMeta === null && !basalInsuficiente && !basalExcesiva) {
    return { estado: "establecida_sin_datos_de_control", fuente: "Captura A1c y/o glucosa en ayuno/nocturna para evaluar si la basal actual es adecuada." };
  }

  if (a1cEnMeta === false || basalInsuficiente) {
    return {
      estado: "establecida_no_en_metas",
      dosisObjetivoUI: Math.round(peso * 0.5 * 10) / 10,
      fuente: "Ya con basal establecida y NO en metas -> considerar escalar hacia 0.5 UI/kg/día (techo antes de intensificar con bolo u otro agente).",
    };
  }

  if (basalExcesiva) {
    return { estado: "establecida_riesgo_hipoglucemia", fuente: "Ayuno/nocturna bajo meta -> considerar REDUCIR la dosis basal actual antes de cualquier otro ajuste." };
  }

  return { estado: "establecida_en_metas", fuente: "A1c y automonitoreo disponible dentro de meta — dosis basal actual parece adecuada." };
}

/** Rango de INICIO por peso (0.05-0.1 UI/kg/comida), sin la dosis de
 * corrección. Separada de computePrandialInsulinDose para poder usarse
 * dentro de estimateTDD sin crear una dependencia circular: estimateTDD
 * necesita este rango para estimar la TDD, y la dosis de corrección
 * (computeBolusCorrection) necesita la TDD para calcular el ISF — si
 * computePrandialInsulinDose llamara a computeBolusCorrection y
 * estimateTDD llamara a computePrandialInsulinDose, ambas se llamarían
 * entre sí sin fin. */
function computePrandialBaseRange(p, monitoreo) {
  const peso = v(p.peso);
  const yaBasal = tieneBasalActiva(p);
  const yaPrandial = tienePrandialActiva(p);

  const necesitaPorMonitoreo = yaBasal && !monitoreo.basalInsuficiente && !monitoreo.basalExcesiva && monitoreo.bolusInsuficiente;

  if (!yaPrandial && !necesitaPorMonitoreo) return { aplica: false };
  if (peso <= 0) return { aplica: true, estado: "sin_peso" };

  return {
    aplica: true,
    estado: yaPrandial ? "activo_reevaluar" : "sugerido_nuevo",
    dosisMinUI: Math.round(peso * 0.05 * 10) / 10,
    dosisMaxUI: Math.round(peso * 0.1 * 10) / 10,
    fuente: "0.05-0.1 UI/kg/comida (pharma-db.js — Lispro/Aspart/Regular) × peso real del paciente.",
    detalle: yaPrandial
      ? "Ya tiene bolo activo, pero la glucosa preprandial/posprandial sigue fuera de meta — reevaluar ajuste de dosis con este rango como referencia."
      : "Ayuno/nocturna en meta pero preprandial/posprandial elevada — sugiere iniciar bolo prandial.",
  };
}

/** Dosis de insulina PRANDIAL/BOLO — solo se muestra si hay indicación real
 * (ya está en esquema basal-bolo, o hay evidencia de que lo necesita).
 * Combina el rango de inicio por peso (computePrandialBaseRange) con la
 * dosis de corrección YA calculada a partir de la glucosa pre/posprandial
 * real (computeBolusCorrection) — ver el comentario de esa función para el
 * porqué se agregó (16-ago-2026, a petición del Dr. Ortega). */
export function computePrandialInsulinDose(p) {
  const monitoreo = computeMonitoreo(p);
  const base = computePrandialBaseRange(p, monitoreo);
  if (!base.aplica) return base;

  const correccion = computeBolusCorrection(p, monitoreo);
  return { ...base, correccion };
}

/* ==================== CALCULADORAS DE TITULACIÓN ====================
 * Agregadas el 11-ago-2026, a petición del Dr. Ortega ("índice glucémico,
 * índice de corrección... hay otros que hay que revisar" — aclarado en la
 * conversación: Relación Insulina:Carbohidratos, no Índice Glucémico de
 * alimentos, que es un concepto de nutrición distinto).
 *
 * Las 3 herramientas clásicas de bolsillo para ajustar un esquema
 * basal-bolo ya iniciado, más la Dosis Diaria Total (TDD) de la que las
 * primeras dos se derivan:
 *
 *  - Factor de Sensibilidad a la Insulina (ISF / "factor de corrección"):
 *    cuánto baja la glucosa 1 UI de insulina rápida. Regla práctica
 *    estándar de educación en diabetes: 1800/TDD para análogos de acción
 *    rápida (Lispro/Aspart), 1500/TDD para insulina Regular (metaboliza
 *    más lento, cada unidad "dura" menos en términos de esta regla).
 *  - Relación Insulina:Carbohidratos (ICR): cuántos gramos de carbohidrato
 *    cubre 1 UI de insulina rápida. Regla práctica estándar: 500/TDD.
 *  - Dosis de corrección: (glucosa actual − meta) / ISF, nunca negativa.
 *  - TDD (Dosis Diaria Total): si el paciente YA está en un esquema
 *    establecido, es un dato que el médico conoce y debe poder capturar/
 *    sobrescribir directamente. Si no, se ofrece una ESTIMACIÓN de
 *    partida (`estimateTDD`) construida con las mismas sugerencias
 *    basal/prandial que ya calcula este módulo — se etiqueta explícitamente
 *    como estimación, nunca como TDD medida.
 *
 * FUENTE: reglas 1800/1500/500 — reglas prácticas estándar, ampliamente
 * enseñadas en educación en diabetes (ej. American Association of Diabetes
 * Educators; Walsh & Roberts, "Pumping Insulin") — no son una fórmula de
 * una guía ADA/AACE específica, se documentan aquí como convención
 * práctica establecida, igual que otros convencionalismos ya declarados en
 * este proyecto (ej. el techo de hemoglobina en borderline-labs.js).
 *
 * LÍMITE: estas 3 calculadoras son un PUNTO DE PARTIDA para ajuste fino
 * por el médico tratante — no sustituyen la titulación individualizada
 * basada en la respuesta real del paciente a lo largo de varias semanas.
 */

const REGLA_ISF_RAPIDA = 1800;
const REGLA_ISF_REGULAR = 1500;
const REGLA_ICR = 500;

/** Estimación de partida de la Dosis Diaria Total (TDD), a partir de las
 * mismas sugerencias basal/prandial que ya calcula este módulo. Regresa 0
 * si no hay peso capturado (no se puede estimar nada). Es un punto de
 * partida editable, NO una TDD medida. */
export function estimateTDD(p) {
  const peso = v(p.peso);
  if (peso <= 0) return 0;

  const basal = computeBasalInsulinDose(p);
  let basalUI = 0;
  if (basal.estado === "virgen") basalUI = (basal.dosisMinUI + basal.dosisMaxUI) / 2;
  else if (basal.estado === "establecida_no_en_metas") basalUI = basal.dosisObjetivoUI;
  else basalUI = peso * 0.15; // ya en metas o riesgo de hipoglucemia y sin otro número mejor — punto medio genérico

  // Usa el rango base (sin corrección) para no depender circularmente de
  // computeBolusCorrection, que a su vez necesita esta TDD para el ISF.
  const prandial = computePrandialBaseRange(p, computeMonitoreo(p));
  const prandialUI = prandial.aplica && prandial.dosisMinUI != null
    ? ((prandial.dosisMinUI + prandial.dosisMaxUI) / 2) * 3 // 3 comidas, supuesto estándar
    : 0;

  return Math.round(basalUI + prandialUI);
}

/** Factor de Sensibilidad a la Insulina (ISF), en mg/dL por UI. */
export function computeISF(tdd, { insulinaRegular = false } = {}) {
  if (!(tdd > 0)) return null;
  const regla = insulinaRegular ? REGLA_ISF_REGULAR : REGLA_ISF_RAPIDA;
  return Math.round(regla / tdd);
}

/** Relación Insulina:Carbohidratos (ICR), en gramos de carbohidrato por UI. */
export function computeICR(tdd) {
  if (!(tdd > 0)) return null;
  return Math.round(REGLA_ICR / tdd);
}

/** Dosis de corrección: (glucosa actual − meta) / ISF. Nunca negativa —
 * si la glucosa ya está en o bajo la meta, la dosis de corrección es 0. */
export function computeCorrectionDose(glucosaActual, metaGlucosa, isf) {
  if (!(glucosaActual > 0) || !(metaGlucosa > 0) || !(isf > 0)) return null;
  const diff = glucosaActual - metaGlucosa;
  if (diff <= 0) return 0;
  return Math.round((diff / isf) * 10) / 10;
}

/** TDD manual (Dosis Diaria Total) — estado local al módulo, igual que
 * `addedDrugs` en rx.js: es un valor de trabajo de la calculadora, no un
 * campo del formulario de Ingreso Clínico ni algo que deba viajar en el
 * objeto paciente/PDF. `null` = usar la estimación automática
 * (`estimateTDD`); un número = el médico ya conoce la TDD real de un
 * esquema establecido y la capturó directamente. Se resetea al cambiar de
 * paciente (ver wireTitulacionInputs). */
let tddOverride = null;
export function setTDDOverride(value) {
  const n = Number(value);
  tddOverride = value === "" || value == null || Number.isNaN(n) ? null : n;
}
export function getTDDOverride() { return tddOverride; }
export function resetTDDOverride() { tddOverride = null; }

/** Dosis de CORRECCIÓN del bolo, calculada automáticamente a partir de la
 * glucosa preprandial/posprandial ya capturada en Ingreso Clínico — a
 * petición del Dr. Ortega ("necesito que ya tomando en cuenta la glucosa
 * pre y posprandial que estén mal, que dé el recuadro del bolo ya
 * calculado", 16-ago-2026).
 *
 * ANTES: el recuadro de Insulina Prandial solo mostraba el rango de INICIO
 * por peso (0.05-0.1 UI/kg/comida) — nunca calculaba nada con el valor de
 * glucosa realmente capturado, aunque esa fórmula ((glucosa−meta)/ISF) ya
 * existía en la calculadora manual de Titulación (computeCorrectionDose).
 * El médico tenía que volver a teclear esos mismos números ahí abajo para
 * obtener un número. Esta función reutiliza exactamente esa fórmula, la
 * aplica automáticamente a preprandial y/o posprandial cuando la Triada de
 * Automonitoreo ya los marca como "elevado", y la muestra directo en el
 * recuadro del Bolo.
 *
 * METAS usadas para la corrección (no son un número nuevo, son las mismas
 * metas de mantenimiento que ya usa el resto del panel):
 *   - Preprandial -> techo de la meta de ayuno (computeGlucoseGoals.ayunoMax,
 *     misma meta que ya evalúa la Triada para ese punto).
 *   - Posprandial -> techo posprandial (computeGlucoseGoals.posprandialMax).
 *
 * TDD/ISF usados: los MISMOS que alimentan el panel de Titulación (TDD
 * manual si el médico ya la capturó ahí, o estimateTDD si no) — así el
 * número que aparece en el recuadro del Bolo y el que aparece en Titulación
 * siempre son coherentes entre sí, nunca dos cálculos independientes. */
function computeBolusCorrection(p, monitoreo) {
  const tdd = tddOverride != null ? tddOverride : estimateTDD(p);
  const isf = computeISF(tdd);
  if (!isf) return { disponible: false };

  const { ayunoMax, posprandialMax } = computeGlucoseGoals(p);
  const m = monitoreo || computeMonitoreo(p);

  const pre = m.preprandial.estado === "elevado"
    ? { valor: m.preprandial.valor, meta: ayunoMax, dosisUI: computeCorrectionDose(m.preprandial.valor, ayunoMax, isf) }
    : null;
  const post = m.posprandial.estado === "elevado"
    ? { valor: m.posprandial.valor, meta: posprandialMax, dosisUI: computeCorrectionDose(m.posprandial.valor, posprandialMax, isf) }
    : null;

  return { disponible: true, isf, tdd, tddEsEstimado: tddOverride == null, pre, post };
}

/** Ensambla todo — usado tanto por el render como por las pruebas.
 *
 * ACTUALIZACIÓN (11-ago-2026, a petición del Dr. Ortega): el corte de A1c
 * para que EndoInsulin aplique SIN diagnóstico de diabetes ni insulina ya
 * activa se sube de 6.5% (ese es solo el umbral DIAGNÓSTICO de diabetes,
 * ADA Standards of Care — demasiado bajo para implicar "este paciente
 * probablemente necesita insulina") a >9%, más cercano al umbral que la
 * propia pharma-db.js ya usa para Glargina ("Iniciar si A1c >10% o glucosa
 * >300") — señal clínica real de que insulinizar es una consideración
 * seria, no solo que el paciente es diabético.
 *
 * También ensambla `titulacion` (TDD/ISF/ICR) — calculadoras agregadas el
 * mismo día, ver bloque de comentario arriba de estimateTDD. */
export function computeInsulinAssessment(p) {
  const esDiabetico = p.tipoDM === "DM1" || p.tipoDM === "DM2";
  const aplica = esDiabetico || tieneBasalActiva(p) || tienePrandialActiva(p) || getA1cEfectiva(p).value > 9;
  if (!aplica) return { aplica: false };

  const tdd = tddOverride != null ? tddOverride : estimateTDD(p);
  const titulacion = {
    tdd,
    tddEsEstimado: tddOverride == null,
    isf: computeISF(tdd),
    icr: computeICR(tdd),
  };

  return {
    aplica: true,
    basal: computeBasalInsulinDose(p),
    prandial: computePrandialInsulinDose(p),
    monitoreo: computeMonitoreo(p),
    titulacion,
  };
}

/* ==================== RENDER (DOM) ==================== */

const BASAL_UI = {
  sin_peso: { badge: "Captura el peso", cls: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400" },
  virgen: { badge: "Virgen de insulina", cls: "bg-sky-50 text-sky-600 dark:bg-sky-900/30 dark:text-sky-300" },
  establecida_sin_datos_de_control: { badge: "Faltan datos de control", cls: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400" },
  establecida_en_metas: { badge: "En metas", cls: "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300" },
  establecida_no_en_metas: { badge: "NO en metas", cls: "bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300" },
  establecida_riesgo_hipoglucemia: { badge: "Riesgo de hipoglucemia", cls: "bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-300" },
};

function buildDrugOptionsHTML(idsList, selectedId) {
  return idsList.map((id) => {
    const f = DB_PHARMA.find((x) => x.id === id);
    return `<option value="${id}" ${id === selectedId ? "selected" : ""}>${f ? f.name : id}</option>`;
  }).join("");
}

/** Botón + selector "Aplicar a EndoNote" — solo se ofrece cuando hay una
 * dosis numérica concreta que tenga sentido escribir en la receta. Si ya
 * hay UN fármaco activo de ese tipo, se aplica directo a ese id (sin
 * selector); si el paciente es insulino-virgen para ese tipo, el médico
 * elige de un selector con las opciones ya documentadas en pharma-db.js;
 * si hay más de un fármaco activo del mismo tipo (caso raro), también se
 * muestra el selector, limitado a los ya activos. */
function buildAplicarHTML({ selectId, applyFn, idsList, activos }) {
  const selectHTML = activos.length <= 1
    ? (activos.length === 0 ? `<select id="${selectId}" class="flex-1 text-xs px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">${buildDrugOptionsHTML(idsList, idsList[0])}</select>` : "")
    : `<select id="${selectId}" class="flex-1 text-xs px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">${buildDrugOptionsHTML(activos, activos[0])}</select>`;
  return `<div class="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2">
    ${selectHTML}
    <button id="${selectId}ApplyBtn" onclick="${applyFn}()" class="shrink-0 text-[11px] font-bold px-3 py-1.5 rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-500 hover:shadow-lg hover:shadow-violet-300/50 dark:hover:shadow-violet-950/40 text-white flex items-center gap-1 transition-all duration-200">
      <i data-lucide="clipboard-plus" class="w-3.5 h-3.5"></i> Aplicar a EndoNote
    </button>
  </div>`;
}

function buildBasalHTML(basal, p) {
  const ui = BASAL_UI[basal.estado] || BASAL_UI.sin_peso;
  const activos = activeIds(p, "antidiabetic").filter((id) => BASAL_IDS.includes(id));
  let cuerpo = "";
  let aplicar = "";
  if (basal.estado === "virgen") {
    cuerpo = `<p class="text-2xl font-black text-slate-800 dark:text-white font-data">${basal.dosisMinUI}–${basal.dosisMaxUI} <span class="text-sm font-bold text-slate-400">UI/día</span></p>
      <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">Dosis de inicio sugerida (basal, insulino-virgen).</p>`;
    aplicar = buildAplicarHTML({ selectId: "insulinBasalDrugSelect", applyFn: "applyBasalDoseToEndoNote", idsList: BASAL_IDS, activos });
  } else if (basal.estado === "establecida_no_en_metas") {
    cuerpo = `<p class="text-2xl font-black text-amber-600 dark:text-amber-400 font-data">hasta ${basal.dosisObjetivoUI} <span class="text-sm font-bold text-slate-400">UI/día</span></p>
      <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">Techo sugerido para considerar escalar la basal actual.</p>`;
    aplicar = buildAplicarHTML({ selectId: "insulinBasalDrugSelect", applyFn: "applyBasalDoseToEndoNote", idsList: BASAL_IDS, activos });
  } else if (basal.estado === "establecida_en_metas" || basal.estado === "establecida_riesgo_hipoglucemia" || basal.estado === "establecida_sin_datos_de_control" || basal.estado === "sin_peso") {
    cuerpo = `<p class="text-sm text-slate-500 dark:text-slate-400">${basal.fuente}</p>`;
  }
  return `<div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 hover:shadow-lg hover:shadow-orange-200/40 dark:hover:shadow-orange-950/30 hover:border-orange-300 dark:hover:border-orange-700 hover:-translate-y-0.5 transition-all duration-200">
    <div class="flex items-center justify-between gap-2 mb-2">
      <p class="flex items-center gap-2 text-xs font-black text-slate-500 dark:text-slate-400 uppercase"><i data-lucide="syringe" class="w-3.5 h-3.5"></i> Insulina Basal</p>
      <span class="text-[10px] font-black uppercase px-2 py-1 rounded-full ${ui.cls}">${ui.badge}</span>
    </div>
    ${cuerpo}
    ${basal.estado === "virgen" || basal.estado === "establecida_no_en_metas" ? `<p class="text-[10px] text-slate-400 mt-2 pt-2 border-t border-slate-100 dark:border-slate-800">${basal.fuente}</p>` : ""}
    ${aplicar}
  </div>`;
}

/** Recuadro "Dosis de corrección calculada" — muestra el número YA
 * calculado con la glucosa pre/posprandial real del paciente (no solo el
 * rango de inicio por peso). Ver computeBolusCorrection para la fórmula y
 * las metas usadas. */
function buildCorreccionHTML(correccion) {
  if (!correccion || !correccion.disponible) {
    return `<p class="text-[10px] text-amber-600 dark:text-amber-400 mt-2 pt-2 border-t border-slate-100 dark:border-slate-800">Captura el peso y/o la TDD (panel de Titulación, más abajo) para que este recuadro calcule la dosis de corrección con la glucosa pre/posprandial ya registrada.</p>`;
  }
  const { pre, post, isf, tdd, tddEsEstimado } = correccion;
  if (!pre && !post) return "";
  const filas = [];
  if (pre) filas.push(`<p class="text-xs"><span class="font-bold text-slate-700 dark:text-slate-200">Preprandial ${pre.valor} mg/dL</span> (meta ≤${pre.meta}) → <span class="font-black text-violet-600 dark:text-violet-400">+${pre.dosisUI} UI de corrección</span></p>`);
  if (post) filas.push(`<p class="text-xs"><span class="font-bold text-slate-700 dark:text-slate-200">Posprandial ${post.valor} mg/dL</span> (meta ≤${post.meta}) → <span class="font-black text-violet-600 dark:text-violet-400">+${post.dosisUI} UI de corrección</span></p>`);
  return `<div class="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 space-y-1 bg-violet-50/50 dark:bg-violet-900/10 -mx-4 -mb-4 px-4 pb-4 rounded-b-2xl">
    <p class="text-[10px] font-black text-violet-600 dark:text-violet-400 uppercase mb-1 flex items-center gap-1.5"><i data-lucide="calculator" class="w-3 h-3"></i> Dosis de corrección — ya calculada</p>
    ${filas.join("")}
    <p class="text-[9px] text-slate-400">ISF ${isf} mg/dL por UI · TDD ${tdd} UI${tddEsEstimado ? " (estimada)" : ""} — misma fórmula y datos que la calculadora de Titulación.</p>
  </div>`;
}

function buildPrandialHTML(prandial, p) {
  if (!prandial.aplica) return "";
  if (prandial.estado === "sin_peso") {
    return `<div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 hover:shadow-lg hover:shadow-orange-200/40 dark:hover:shadow-orange-950/30 hover:border-orange-300 dark:hover:border-orange-700 hover:-translate-y-0.5 transition-all duration-200">
      <p class="flex items-center gap-2 text-xs font-black text-slate-500 dark:text-slate-400 uppercase mb-2"><i data-lucide="droplet" class="w-3.5 h-3.5"></i> Insulina Prandial (Bolo)</p>
      <p class="text-sm text-slate-500 dark:text-slate-400">Captura el peso del paciente para calcular la dosis.</p>
      ${buildCorreccionHTML(prandial.correccion)}
    </div>`;
  }
  const badge = prandial.estado === "activo_reevaluar" ? { t: "Reevaluar ajuste", c: "bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300" } : { t: "Sugerido — nuevo", c: "bg-violet-50 text-violet-600 dark:bg-violet-900/30 dark:text-violet-300" };
  const activos = activeIds(p, "antidiabetic").filter((id) => PRANDIAL_IDS.includes(id));
  const aplicar = buildAplicarHTML({ selectId: "insulinPrandialDrugSelect", applyFn: "applyPrandialDoseToEndoNote", idsList: PRANDIAL_IDS, activos });
  return `<div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 hover:shadow-lg hover:shadow-orange-200/40 dark:hover:shadow-orange-950/30 hover:border-orange-300 dark:hover:border-orange-700 hover:-translate-y-0.5 transition-all duration-200">
    <div class="flex items-center justify-between gap-2 mb-2">
      <p class="flex items-center gap-2 text-xs font-black text-slate-500 dark:text-slate-400 uppercase"><i data-lucide="droplet" class="w-3.5 h-3.5"></i> Insulina Prandial (Bolo)</p>
      <span class="text-[10px] font-black uppercase px-2 py-1 rounded-full ${badge.c}">${badge.t}</span>
    </div>
    <p class="text-2xl font-black text-slate-800 dark:text-white font-data">${prandial.dosisMinUI}–${prandial.dosisMaxUI} <span class="text-sm font-bold text-slate-400">UI/comida</span></p>
    <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">${prandial.detalle}</p>
    <p class="text-[10px] text-slate-400 mt-2 pt-2 border-t border-slate-100 dark:border-slate-800">${prandial.fuente}</p>
    ${buildCorreccionHTML(prandial.correccion)}
    ${aplicar}
  </div>`;
}

/** Determina a qué fármaco (id) aplica la dosis: si hay exactamente un
 * fármaco activo de ese tipo, se usa directo (no hay selector en el DOM);
 * si hay 0 o >1, se lee el <select> correspondiente. */
function resolveTargetId(selectId, activos) {
  if (activos.length === 1) return activos[0];
  const sel = document.getElementById(selectId);
  return sel ? sel.value : activos[0] || null;
}

function flashApplied(btnId) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  const original = btn.innerHTML;
  btn.innerHTML = `<i data-lucide="check" class="w-3.5 h-3.5"></i> Aplicado`;
  btn.disabled = true;
  if (typeof lucide !== "undefined") lucide.createIcons();
  setTimeout(() => {
    btn.innerHTML = original;
    btn.disabled = false;
    if (typeof lucide !== "undefined") lucide.createIcons();
  }, 1800);
}

/** Botón "Aplicar a EndoNote" de la insulina BASAL — escribe la dosis
 * sugerida/techo actual como la dosis de ese fármaco en EndoNote (crea la
 * entrada si no existía, o actualiza la dosis si ya estaba). Deliberadamente
 * NO automático: solo corre al hacer clic (ver comentario en rx.js). */
export function applyBasalDoseToEndoNote() {
  const p = getPatient();
  const basal = computeBasalInsulinDose(p);
  const activos = activeIds(p, "antidiabetic").filter((id) => BASAL_IDS.includes(id));
  const targetId = resolveTargetId("insulinBasalDrugSelect", activos);
  if (!targetId) return;
  let doseText = null;
  if (basal.estado === "virgen") doseText = `${basal.dosisMinUI}-${basal.dosisMaxUI} UI/día (dosis de inicio)`;
  else if (basal.estado === "establecida_no_en_metas") doseText = `hasta ${basal.dosisObjetivoUI} UI/día (escalar)`;
  if (!doseText) return;
  addOrUpdateRxDose(targetId, doseText);
  flashApplied("insulinBasalDrugSelectApplyBtn");
}

/** Botón "Aplicar a EndoNote" de la insulina PRANDIAL — mismo patrón que
 * applyBasalDoseToEndoNote. */
export function applyPrandialDoseToEndoNote() {
  const p = getPatient();
  const prandial = computePrandialInsulinDose(p);
  if (!prandial.aplica || prandial.dosisMinUI == null) return;
  const activos = activeIds(p, "antidiabetic").filter((id) => PRANDIAL_IDS.includes(id));
  const targetId = resolveTargetId("insulinPrandialDrugSelect", activos);
  if (!targetId) return;
  addOrUpdateRxDose(targetId, `${prandial.dosisMinUI}-${prandial.dosisMaxUI} UI/comida`);
  flashApplied("insulinPrandialDrugSelectApplyBtn");
}

const PUNTO_UI = {
  sin_dato: { label: "Sin dato", cls: "text-slate-400" },
  // Nivel 2 (<54): clínicamente significativa — un tono más oscuro/urgente
  // que Nivel 1, mismo criterio visual que el resto del proyecto usa para
  // distinguir severidad dentro de una misma familia de color (rose vs red).
  hipoglucemia_nivel2: { label: "Hipoglucemia Nivel 2", cls: "text-rose-700 dark:text-rose-300 font-black" },
  hipoglucemia_nivel1: { label: "Hipoglucemia Nivel 1", cls: "text-red-600 dark:text-red-400 font-black" },
  bajo: { label: "Bajo meta", cls: "text-amber-600 dark:text-amber-400 font-bold" },
  en_meta: { label: "En meta", cls: "text-emerald-600 dark:text-emerald-400 font-bold" },
  elevado: { label: "Elevado", cls: "text-red-600 dark:text-red-400 font-bold" },
};

function buildMonitoreoHTML(m) {
  const filas = [
    ["Ayuno", m.ayuno, "sunrise"],
    ["Nocturna", m.nocturna, "moon"],
    ["Preprandial", m.preprandial, "utensils"],
    ["Posprandial", m.posprandial, "utensils-crossed"],
  ];
  const INTERP_CLS = { slate: "bg-slate-50 dark:bg-slate-900/50 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800",
    red: "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800",
    amber: "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800",
    emerald: "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800" };

  return `<div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 hover:shadow-lg hover:shadow-orange-200/40 dark:hover:shadow-orange-950/30 hover:border-orange-300 dark:hover:border-orange-700 hover:-translate-y-0.5 transition-all duration-200 sm:col-span-2">
    <p class="flex items-center gap-2 text-xs font-black text-slate-500 dark:text-slate-400 uppercase mb-3"><i data-lucide="line-chart" class="w-3.5 h-3.5"></i> Triada de Automonitoreo Glucémico</p>
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
      ${filas.map(([label, punto, icon]) => `<div class="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-center">
        <i data-lucide="${icon}" class="w-3.5 h-3.5 mx-auto mb-1 text-slate-400"></i>
        <p class="text-[10px] font-bold text-slate-400 uppercase">${label}</p>
        <p class="font-data text-sm ${PUNTO_UI[punto.estado].cls}">${punto.valor ?? "--"}</p>
        <p class="text-[9px] ${PUNTO_UI[punto.estado].cls}">${PUNTO_UI[punto.estado].label}</p>
      </div>`).join("")}
    </div>
    <div class="p-3 rounded-xl border text-xs font-semibold ${INTERP_CLS[m.colorInterpretacion]}">${m.interpretacion}</div>
  </div>`;
}

function readNum(id) {
  const el = document.getElementById(id);
  if (!el || el.value.trim() === "") return null;
  const n = Number(el.value);
  return Number.isNaN(n) ? null : n;
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

/** Recalcula ISF/ICR al editar la TDD (input libre, ver buildTitulacionHTML)
 * — actualiza SOLO los spans de salida (no redibuja el panel completo) para
 * no perder el foco del input mientras el médico escribe, mismo criterio ya
 * usado en rx.js (setDoseAt vs renderAddedDrugsEditor). */
export function insulinRecalcTitulacion() {
  const tdd = readNum("insulinTDDInput");
  setTDDOverride(tdd);
  const isf = computeISF(tdd);
  const icr = computeICR(tdd);
  setText("insulinISFOut", isf != null ? `${isf} mg/dL por UI` : "Captura la TDD");
  setText("insulinICROut", icr != null ? `${icr} g de carbohidrato por UI` : "Captura la TDD");
  insulinRecalcCorreccion();
}

/** Recalcula la dosis de corrección al editar glucosa actual/meta — mismo
 * criterio de actualización puntual que insulinRecalcTitulacion. */
export function insulinRecalcCorreccion() {
  const tdd = readNum("insulinTDDInput");
  const isf = computeISF(tdd);
  const glucosa = readNum("insulinCorrGlucosa");
  const meta = readNum("insulinCorrMeta");
  const dosis = computeCorrectionDose(glucosa, meta, isf);
  setText("insulinCorrOut", dosis != null ? `${dosis} UI de corrección` : "Completa glucosa, meta y TDD");
}

function buildTitulacionHTML(a) {
  const t = a.titulacion;
  return `<div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 hover:shadow-lg hover:shadow-orange-200/40 dark:hover:shadow-orange-950/30 hover:border-orange-300 dark:hover:border-orange-700 hover:-translate-y-0.5 transition-all duration-200 sm:col-span-2">
    <p class="flex items-center gap-2 text-xs font-black text-slate-500 dark:text-slate-400 uppercase mb-3"><i data-lucide="calculator" class="w-3.5 h-3.5"></i> Calculadoras de Titulación</p>
    <div class="grid sm:grid-cols-3 gap-3 mb-4">
      <div>
        <label class="text-[10px] font-bold text-slate-400 uppercase block mb-1">Dosis Diaria Total (TDD)</label>
        <input id="insulinTDDInput" type="number" min="0" step="1" value="${t.tdd || ""}" oninput="insulinRecalcTitulacion()"
          class="w-full px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-data" />
        <p class="text-[9px] text-slate-400 mt-1">${t.tddEsEstimado ? "Estimación de partida — edítala si conoces la TDD real del paciente." : "Capturada manualmente."}</p>
      </div>
      <div>
        <label class="text-[10px] font-bold text-slate-400 uppercase block mb-1">Factor de Sensibilidad (ISF)</label>
        <p id="insulinISFOut" class="text-sm font-data font-bold text-slate-700 dark:text-slate-200 py-1.5">${t.isf != null ? `${t.isf} mg/dL por UI` : "Captura la TDD"}</p>
      </div>
      <div>
        <label class="text-[10px] font-bold text-slate-400 uppercase block mb-1">Relación Insulina:Carbohidratos (ICR)</label>
        <p id="insulinICROut" class="text-sm font-data font-bold text-slate-700 dark:text-slate-200 py-1.5">${t.icr != null ? `${t.icr} g de carbohidrato por UI` : "Captura la TDD"}</p>
      </div>
    </div>
    <div class="pt-3 border-t border-slate-100 dark:border-slate-800 grid sm:grid-cols-3 gap-3 items-end">
      <div>
        <label class="text-[10px] font-bold text-slate-400 uppercase block mb-1">Glucosa actual (mg/dL)</label>
        <input id="insulinCorrGlucosa" type="number" min="0" step="1" oninput="insulinRecalcCorreccion()"
          class="w-full px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-data" />
      </div>
      <div>
        <label class="text-[10px] font-bold text-slate-400 uppercase block mb-1">Meta de glucosa (mg/dL)</label>
        <input id="insulinCorrMeta" type="number" min="0" step="1" oninput="insulinRecalcCorreccion()"
          class="w-full px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-data" />
      </div>
      <div>
        <label class="text-[10px] font-bold text-slate-400 uppercase block mb-1">Dosis de corrección</label>
        <p id="insulinCorrOut" class="text-sm font-data font-black text-violet-600 dark:text-violet-400 py-1.5">Completa glucosa, meta y TDD</p>
      </div>
    </div>
    <p class="text-[10px] text-slate-400 mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">Reglas prácticas estándar de educación en diabetes: ISF = 1800/TDD (análogos rápidos) o 1500/TDD (Regular); ICR = 500/TDD; dosis de corrección = (glucosa actual − meta) / ISF. Punto de partida para ajuste fino por el médico tratante — no sustituye la titulación individualizada.</p>
  </div>`;
}

/* Desplegable (12-ago-2026, a petición del Dr. Ortega): "Consideraciones
 * Reales de Titulación" es contenido educativo denso y de referencia — no
 * un dato del paciente que se necesite ver siempre. Se usa <details> nativo
 * (colapsado por defecto) en vez de JS a medida, mismo patrón simple que
 * usa el navegador para accesibilidad (teclado, lectores de pantalla)
 * sin depender de main.js para el toggle. */
function buildEducativoHTML() {
  return `<details class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 hover:shadow-lg hover:shadow-orange-200/40 dark:hover:shadow-orange-950/30 hover:border-orange-300 dark:hover:border-orange-700 transition-all duration-200 sm:col-span-2 group">
    <summary class="flex items-center justify-between gap-2 cursor-pointer list-none">
      <span class="flex items-center gap-2 text-xs font-black text-slate-500 dark:text-slate-400 uppercase"><i data-lucide="graduation-cap" class="w-3.5 h-3.5"></i> Consideraciones Reales de Titulación</span>
      <i data-lucide="chevron-down" class="w-4 h-4 text-slate-400 transition-transform group-open:rotate-180"></i>
    </summary>
    <div class="space-y-3 text-xs text-slate-600 dark:text-slate-300 mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
      <div>
        <p class="font-bold text-slate-700 dark:text-slate-200">Ajuste de la dosis basal</p>
        <p>Ajustar cada 2-3 días con base en el PROMEDIO de glucosa en ayuno de esos días, no en un solo valor aislado. Ejemplo de escalonamiento simple: ayuno promedio &gt;130 mg/dL → subir ~2 UI (o ~10% de la dosis); cualquier hipoglucemia (&lt;70 mg/dL) o evento nocturno → bajar 10-20% de inmediato, sin esperar el ciclo de 2-3 días.</p>
      </div>
      <div>
        <p class="font-bold text-slate-700 dark:text-slate-200">Ajuste del bolo prandial / ICR</p>
        <p>Se evalúa con la glucosa posprandial a 2 horas de la comida correspondiente. Si está sistemáticamente elevada con carbohidratos bien contados, el ICR es insuficiente (cubre menos gramos de los que debería) — se reduce el número (ej. de 1:15 a 1:10). Hipoglucemia posprandial repetida → se aumenta el número.</p>
      </div>
      <div>
        <p class="font-bold text-slate-700 dark:text-slate-200">Dosis de corrección — riesgo de "apilamiento" ("stacking")</p>
        <p>No administrar una nueva dosis de corrección antes de 2-3 horas de la dosis rápida previa (tiempo de acción residual todavía activo) — apilar dosis es una causa frecuente y evitable de hipoglucemia iatrogénica.</p>
      </div>
      <div>
        <p class="font-bold text-slate-700 dark:text-slate-200">Situaciones que obligan a reducir la dosis</p>
        <p>Insuficiencia renal avanzada (el aclaramiento renal de insulina disminuye — el mismo eGFR que este expediente ya vigila), ejercicio intenso planeado, ingesta oral reducida/ayuno, y consumo de alcohol: todas aumentan el riesgo de hipoglucemia con la MISMA dosis que antes era segura.</p>
      </div>
      <div>
        <p class="font-bold text-slate-700 dark:text-slate-200">Días de enfermedad ("sick day rules")</p>
        <p>La insulina BASAL nunca se suspende por estar enfermo o no comer (riesgo real de cetoacidosis, especialmente en DM1) — se intensifica el automonitoreo, no se retira la basal.</p>
      </div>
      <div class="pt-2 border-t border-slate-100 dark:border-slate-800">
        <p class="font-bold text-amber-600 dark:text-amber-400">Límite de estas calculadoras</p>
        <p>TDD/ISF/ICR/dosis de corrección son un PUNTO DE PARTIDA educativo basado en reglas prácticas estándar (1800/1500/500) — no sustituyen la titulación individualizada del médico tratante a lo largo de varias semanas, ni son válidas sin ajuste adicional en insuficiencia renal avanzada, hepatopatía significativa, o esquemas de bomba de insulina.</p>
      </div>
    </div>
  </details>`;
}

/** Redibuja #insulinPanelRoot — ahora vive en su propia pestaña de nivel
 * superior del sidebar (`view-insulin`, ver navigation.js -> showInsulinTab
 * y render.js -> renderAll), no dentro de EndoManagement. Movido el
 * 11-ago-2026 a petición del Dr. Ortega ("me gustaría que apareciera
 * EndoInsulin en el Dashboard ya que es especial... con todas sus
 * funciones, más visual"): el panel es lo bastante importante (dosificación
 * + monitoreo + calculadoras de titulación + contenido educativo) para
 * merecer una pestaña dedicada en vez de vivir como una sección más de
 * EndoManagement.
 *
 * CORRECCIÓN previa (reportado por el Dr. Ortega: "EndoInsulin no está en
 * el Dashboard, ¿carga en otro lado?"): cuando no aplica (paciente sin
 * diagnóstico de diabetes, sin insulina activa, y A1c en el umbral vigente)
 * antes dejaba `root.innerHTML = ""` — indistinguible a simple vista de
 * "esto no está implementado". Se conserva el placeholder explícito. */
export function renderInsulinPanel(p) {
  const root = document.getElementById("insulinPanelRoot");
  if (!root) return;

  const a = computeInsulinAssessment(p || {});
  if (!a.aplica) {
    root.innerHTML = `<div class="bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 p-4 flex items-center gap-3 text-xs text-slate-400">
      <i data-lucide="syringe" class="w-4 h-4 shrink-0"></i>
      <span>EndoInsulin no aplica a este paciente todavía — aparece aquí en cuanto se capture diagnóstico de Diabetes Mellitus Tipo I/II, haya insulina activa en Medicación Actual, o A1c &gt;9%.</span>
    </div>`;
    if (typeof lucide !== "undefined") lucide.createIcons();
    return;
  }

  root.innerHTML = `
    <div class="grid sm:grid-cols-2 gap-3 mb-6">
      ${buildBasalHTML(a.basal, p || {})}
      ${buildPrandialHTML(a.prandial, p || {})}
      ${buildMonitoreoHTML(a.monitoreo)}
      ${buildTitulacionHTML(a)}
      ${buildEducativoHTML()}
    </div>`;

  if (typeof lucide !== "undefined") lucide.createIcons();
}
