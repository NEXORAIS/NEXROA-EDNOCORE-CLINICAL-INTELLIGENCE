/* --- EXPEDIENTE COMPLETO (PDF) ---
 * Arma un HTML imprimible con TODOS los apartados de Ingreso Clínico
 * (separados igual que el formulario, 1 a 7) más el subconjunto del
 * Dashboard que pidió el Dr. Ortega: Estratificación Global, EndoPressure,
 * EndoLypids, EndoGoals, EndoManagement, EndoScreen, EndoInsulin y
 * EndoNote | Tratamiento Otorgado.
 *
 * Se construye SIEMPRE a partir del paciente (`p`) y las funciones de
 * cálculo puras (calculations.js/individualization.js) — NO se copia el
 * DOM ya renderizado — así el expediente es correcto aunque el médico
 * nunca haya visitado alguna de esas pestañas en esta sesión.
 *
 * Generación del PDF: no se agrega ninguna librería nueva. Se reutiliza el
 * mecanismo de impresión que ya existía para EndoNote (`window.print()` +
 * CSS `@media print`) — el médico elige "Guardar como PDF" en el diálogo
 * de impresión del navegador. Ver las reglas de `#expedienteContainer` y
 * `body.printing-expediente` en el <style> de index.html.
 */
import * as calc from "./calculations.js";
import {
  classifyEGFR,
  classifyBP,
  classifyFIB4,
  classifyABCD,
  deriveOrcdFromFlags,
  getA1cTarget,
  classifyA1cVsTarget,
  getCardiovascularSummary,
  getGlycemicAndBPGoals,
  TG_GOAL,
} from "./individualization.js";
import { DB_PHARMA } from "./pharma-db.js";
import { getAddedDrugs, getFreeTextNote } from "./rx.js";
import { getPatient } from "./state.js";
import { computeScreeningItems } from "./screening.js";
import { computeInsulinAssessment } from "./insulin.js";
import { computeDiagnosticsList } from "./diagnostics.js";

const esc = (s) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const fmt = (v, suffix = "") =>
  v === "" || v === null || v === undefined || (typeof v === "number" && isNaN(v)) ? "--" : `${v}${suffix}`;

/* --------------------- FORMATO EN TABLAS (12-ago-2026) ---------------------
 * El expediente impreso usaba divs con flexbox y borde punteado — al Dr.
 * Ortega le pareció poco ordenado ("necesito que venga en tablas"). Se
 * cambió a tablas HTML reales: cada sección es una <table>, cada dato una
 * <tr>, y los subtítulos internos (antes <h3> sueltos) ahora son filas
 * <tr> de ancho completo (subhead) para que el conjunto se lea como un
 * documento clínico tabulado, no como una lista de pares suelta. row(),
 * section() y los demás call-sites NO cambiaron de firma — solo lo que
 * generan internamente — para no tener que tocar cada función de sección. */
function row(label, value) {
  return `<tr class="exp-row"><td class="exp-label">${esc(label)}</td><td class="exp-value">${esc(value)}</td></tr>`;
}

/** Fila de ancho completo para un subtítulo dentro de una sección (antes un
 * <h3> suelto fuera de la tabla). */
function subhead(text) {
  return `<tr class="exp-subhead-row"><td colspan="2" class="exp-subhead">${esc(text)}</td></tr>`;
}

/** Fila de ancho completo para contenido que no es un par label/valor
 * (listas, notas de texto libre, tarjetas de fármaco). */
function wide(html) {
  return `<tr><td colspan="2" class="exp-wide">${html}</td></tr>`;
}

function section(title, bodyHtml) {
  return `<div class="exp-section"><h3 class="exp-section-title">${esc(title)}</h3><table class="exp-table"><tbody>${bodyHtml}</tbody></table></div>`;
}

const SALUD_STATUS_LABEL = { sano: "Sano", complejo: "Complejo/intermedio", muyComplejo: "Muy complejo / mala salud" };
const FUMADOR_LABEL = { no: "No", ex: "Ex-fumador", si: "Sí" };
const ACTIVIDAD_LABEL = { "1.2": "Nula", "1.375": "Leve", "1.55": "Moderada", "1.725": "Intensa", "1.9": "Muy intensa" };
const ALCOHOL_TIPO_LABEL = { "": "No bebe", cerveza: "Cerveza", vino: "Vino", licor: "Licor destilado", otro: "Personalizado" };
/* CORRECCIÓN (10-ago-2026, auditoría final): este mapa se había quedado
 * desactualizado dos veces — nunca se agregaron ANGIOEDEMA_IECA/TOS_IECA/
 * HIPOGLUCEMIA_PERSONAL (rondas anteriores) ni NEUROPATIA_PERIFERICA/
 * PIE_ALTO_RIESGO (esta ronda). Sin la etiqueta, buildSeccion5 caía en su
 * fallback `COMORB_LABEL[c] || c` e imprimía el CÓDIGO crudo en el
 * expediente (ej. "ANGIOEDEMA_IECA" en vez de una frase legible) — un
 * paciente con esas comorbilidades marcadas tenía un expediente con texto
 * de programador, no de historia clínica. */
const COMORB_LABEL = {
  IC: "Insuficiencia Cardíaca", ERC: "Enfermedad Renal Crónica",
  IAM_ANGINA: "Enf. Coronaria (IAM previo/angina/revascularización)", EVC_AIT: "Enf. Cerebrovascular (ACV/AIT previo)",
  EAP: "Enf. Arterial Periférica", MASLD: "MASLD", OBESIDAD: "Obesidad",
  OSTEOARTRITIS: "Osteoartritis", SAOS: "SAOS",
  PANCREATITIS: "Pancreatitis previa", GASTROPARESIA: "Gastroparesia",
  ANGIOEDEMA_IECA: "Angioedema previo con IECA", TOS_IECA: "Tos documentada con IECA",
  HIPOGLUCEMIA_PERSONAL: "Hipoglucemia severa personal previa",
  NEUROPATIA_PERIFERICA: "Neuropatía Periférica diagnosticada",
  PIE_ALTO_RIESGO: "Úlcera/Amputación de pie previa o deformidad significativa",
  EMBARAZO_ACTUAL: "Embarazo actual", EMBARAZO_POSIBLE: "Posibilidad de embarazo",
};
const TIPO_DM_LABEL = { DM1: "Diabetes Mellitus Tipo I", DM2: "Diabetes Mellitus Tipo II", Prediabetes: "Prediabetes" };
const FAMHX_LABEL = {
  FAM_ASCVD: "ASCVD prematura en familiar de 1er grado", FAM_HIPERCOLESTEROLEMIA: "Hipercolesterolemia familiar",
  FAM_MEN2A: "Antecedente familiar de MEN2A", FAM_CA_MEDULAR: "Antecedente familiar de carcinoma medular de tiroides",
  FAM_HIPOGLUCEMIA: "Hipoglucemias severas en la familia",
};
const NIVEL_ACCESO_LABEL = { bajo: "Bajo", medio: "Medio", alto: "Alto" };
const MEDACTUAL_CAT_LABEL = { antidiabetic: "Antidiabéticos", htn: "Antihipertensivos", lipid: "Hipolipemiantes", obesity: "Farmacoterapia de Obesidad", otros: "Otros / Interacciones Relevantes" };

/* --------------------- Sección 1: Ficha de Identificación --------------------- */
function buildSeccion1(p) {
  return section("Ficha de Identificación", `
    ${row("Nombre", p.nombre || "--")}
    ${row("Sexo", p.sexo === "H" ? "Hombre" : p.sexo === "M" ? "Mujer" : "--")}
    ${row("Fecha de Nacimiento", p.fecha_nacimiento || "--")}
    ${row("Edad", fmt(p.edad, " años"))}
    ${row("Teléfono", p.telefono || "--")}
    ${row("Domicilio", p.domicilio || "--")}
    ${row("Estado de Salud", SALUD_STATUS_LABEL[p.saludStatus] || "--")}
    ${row("Bajo riesgo/carga de tratamiento", p.bajoRiesgoTratamiento ? "Sí" : "No")}
  `);
}

/* --------------------- Sección 2: Signos Vitales --------------------- */
function buildSeccion2(p) {
  const pam = calc.calcPAM(p);
  const imc = calc.calcIMC(p);
  const icc = calc.calcICC(p);
  const ica = calc.calcICA(p);
  return section("Signos Vitales", `
    ${row("TA Sistólica / Diastólica", `${fmt(p.tas)} / ${fmt(p.tad)} mmHg`)}
    ${row("PAM (calculada)", pam !== null ? pam + " mmHg" : "--")}
    ${row("Peso / Estatura", `${fmt(p.peso, " kg")} / ${fmt(p.talla, " cm")}`)}
    ${row("IMC (calculado)", imc ?? "--")}
    ${row("Cintura / Cadera", `${fmt(p.cintura, " cm")} / ${fmt(p.cadera, " cm")}`)}
    ${row("ICC / ICA", `${icc ?? "--"} / ${ica ?? "--"}`)}
  `);
}

/* --------------------- Sección 3: Antecedentes Personales ---------------------
 * Renombrada de "Factores de Riesgo" (12-ago-2026, a petición del Dr.
 * Ortega) — ahora agrupa los 4 antecedentes de estilo de vida en un solo
 * lugar: Tabaco, Alcohol, Dieta y Ejercicio. Dieta Habitual vivía antes en
 * Signos Vitales; se movió aquí porque es un antecedente personal, no un
 * signo vital medido. */
function buildSeccion3(p) {
  const indiceTabaquico = calc.calcIndiceTabaquico(p);
  const gAlcohol = calc.calcAlcoholSemanal(p);
  return section("Antecedentes Personales", `
    ${subhead("Tabaco")}
    ${row("Fumador", FUMADOR_LABEL[p.fumador] || "No")}
    ${row("Cigarrillos/día — Años fumando", `${fmt(p.cigarrillosDia)} — ${fmt(p.aniosFumando)}`)}
    ${row("Índice Tabáquico (paq/año)", indiceTabaquico ?? "--")}
    ${subhead("Alcohol")}
    ${row("Tipo de bebida", ALCOHOL_TIPO_LABEL[p.alcoholTipo] || "No bebe")}
    ${row("Bebidas/semana", fmt(p.alcoholBebidasSemana))}
    ${row("Alcohol total (g/semana, calculado)", gAlcohol ?? "--")}
    ${subhead("Dieta Habitual")}
    ${row("Desayuno", p.dietaDesayuno || "--")}
    ${row("Comida", p.dietaComida || "--")}
    ${row("Cena", p.dietaCena || "--")}
    ${row("Colaciones", p.dietaColaciones || "--")}
    ${subhead("Ejercicio")}
    ${row("Actividad Física", ACTIVIDAD_LABEL[String(p.actividad)] || "--")}
  `);
}

/* --------------------- Sección 4: Laboratorios --------------------- */
function buildSeccion4(p) {
  const egfr = calc.calcEGFR(p);
  const homaIr = calc.calcHOMA_IR(p);
  const fib4 = calc.calcFIB4(p);
  return section("Laboratorios", `
    ${subhead("Perfil de Lípidos")}
    ${row("Colesterol Total / HDL / LDL / VLDL", `${fmt(p.col_total)} / ${fmt(p.hdl)} / ${fmt(p.ldl)} / ${fmt(p.vldl)} mg/dL`)}
    ${row("Triglicéridos", fmt(p.trigliceridos, " mg/dL"))}
    ${subhead("Función Renal")}
    ${row("Creatinina / Urea", `${fmt(p.creatinina)} mg/dL / ${fmt(p.urea)} mg/dL`)}
    ${row("UACR", fmt(p.uacr, " mg/g"))}
    ${row("eGFR (CKD-EPI 2021, calculado)", egfr || "--")}
    ${subhead("Glucemia")}
    ${row("Glucosa en Ayuno", fmt(p.glucosa, " mg/dL"))}
    ${row("HbA1c Medida", fmt(p.hba1c, " %"))}
    ${row("Insulina", fmt(p.insulina, " µU/mL"))}
    ${row("HOMA-IR (calculado)", homaIr || "--")}
    ${subhead("Electrolitos")}
    ${row("Na / K / Ca / Mg / P", `${fmt(p.sodio)} / ${fmt(p.potasio)} / ${fmt(p.calcio)} / ${fmt(p.magnesio)} / ${fmt(p.fosforo)}`)}
    ${subhead("Función Hepática y Otros")}
    ${row("AST / ALT / GGT", `${fmt(p.ast)} / ${fmt(p.alt)} / ${fmt(p.ggt)}`)}
    ${row("Plaquetas / ITB", `${fmt(p.plaquetas)} / ${fmt(p.itb)}`)}
    ${row("FIB-4 (calculado)", fib4 || "--")}
  `);
}

/* --------------------- Sección 5: Comorbilidades --------------------- */
function buildSeccion5(p) {
  const list = (p.comorbilidades || []).map((c) => COMORB_LABEL[c] || c);
  const tieneDM = p.tipoDM === "DM1" || p.tipoDM === "DM2" || p.tipoDM === "Prediabetes";
  const antecedenteDM = tieneDM
    ? `${subhead("Antecedente Diabetológico")}
       ${row("Tipo", TIPO_DM_LABEL[p.tipoDM] || p.tipoDM)}
       ${row("Fecha de Diagnóstico", p.fechaDxDM || "--")}
       ${row("Años desde Diagnóstico (si no hay fecha exacta)", fmt(p.aniosDxDM, " años"))}`
    : "";
  return section("Comorbilidades", `
    ${antecedenteDM}
    ${antecedenteDM ? subhead("Comorbilidades") : ""}
    ${wide(list.length
      ? `<ul class="exp-list">${list.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>`
      : `<p class="exp-muted">Ninguna registrada.</p>`)}
  `);
}

/* --------------------- Sección 6: Antecedentes Familiares --------------------- */
function buildSeccion6(p) {
  const list = (p.antecedentesFamiliares || []).map((c) => FAMHX_LABEL[c] || c);
  return section("Antecedentes Familiares", `
    ${wide(list.length
      ? `<ul class="exp-list">${list.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>`
      : `<p class="exp-muted">Ninguno registrado.</p>`)}
    ${row("Nivel de Acceso Económico", NIVEL_ACCESO_LABEL[p.nivelAcceso] || "Medio")}
  `);
}

/* --------------------- Sección 7: Medicación Actual --------------------- */
function buildSeccion7(p) {
  const categorias = ["antidiabetic", "htn", "lipid", "obesity", "otros"];
  const blocks = categorias.map((cat) => {
    const entries = p.medicacionActual?.[cat] || [];
    if (!entries.length) return "";
    const items = entries.map((e) => {
      const f = DB_PHARMA.find((d) => d.id === e.id);
      const detalle = [e.dosis, e.isMax ? "dosis máxima tolerada" : ""].filter(Boolean).join(" — ");
      return `<li>${esc(f?.name || e.id)}${detalle ? " — " + esc(detalle) : ""}</li>`;
    }).join("");
    return subhead(MEDACTUAL_CAT_LABEL[cat]) + wide(`<ul class="exp-list">${items}</ul>`);
  }).join("");
  return section("Medicación Actual", blocks.trim()
    ? blocks
    : wide(`<p class="exp-muted">Sin medicación previa registrada (paciente virgen de tratamiento).</p>`));
}

/* --------------------- DASHBOARD: Estratificación Global --------------------- */
function buildEstratificacionGlobal(p) {
  const egfr = calc.calcEGFR(p);
  const fib4 = calc.calcFIB4(p);
  const a1c = calc.getA1cEfectiva(p);
  const flags = calc.getPatientFlags(p);
  const a1cTarget = getA1cTarget({ age: p.edad, healthStatus: p.saludStatus || "sano", lowTreatmentBurden: !!p.bajoRiesgoTratamiento });

  const cards = [
    { title: "A1c vs. meta individualizada", r: classifyA1cVsTarget(a1c.value ?? null, a1cTarget) },
    { title: "Riesgo ASCVD (PREVENT)", r: getCardiovascularSummary(p, flags) },
    { title: "Presión arterial", r: classifyBP(p.tas, p.tad) },
    { title: "eGFR renal", r: classifyEGFR(egfr, p.uacr || null) },
    { title: "FIB-4 hepático", r: classifyFIB4(fib4, p.edad, p.vctLsm ?? null) },
    { title: "Estadio ABCD (obesidad)", r: classifyABCD(deriveOrcdFromFlags(flags), flags.obesidad) },
  ];
  return section("Estratificación Global (Individualización)", `
    ${subhead("Vitales")}
    ${row("FIB-4 / HOMA-IR / eGFR", `${fib4 || "--"} / ${calc.calcHOMA_IR(p) || "--"} / ${egfr || "--"}`)}
    ${row("HbA1c efectiva (" + (a1c.source || "--") + ") / eAG", `${fmt(a1c.value, "%")} / ${fmt(calc.calcEAG(p), " mg/dL")}`)}
    ${row("IMC / ICC / ICA / PAM", `${calc.calcIMC(p) ?? "--"} / ${calc.calcICC(p) ?? "--"} / ${calc.calcICA(p) ?? "--"} / ${calc.calcPAM(p) ?? "--"}`)}
    ${subhead("Clasificación Individual")}
    ${cards.filter((c) => c.r).map((c) => row(c.title, `${c.r.texto}${c.r.valor !== null && c.r.valor !== undefined ? " (" + c.r.valor + (c.r.label ? " " + c.r.label : "") + ")" : ""}`)).join("")}
  `);
}

/* --------------------- DASHBOARD: EndoPressure ---------------------
 * "Presión de Pulso" se retiró (12-ago-2026, a petición del Dr. Ortega) —
 * el dato quedaba sin ninguna clasificación de zona/riesgo asociada en el
 * motor (a diferencia de PAM, que sí alimenta cálculos aguas abajo), así
 * que solo ocupaba espacio sin aportar una decisión clínica accionable. */
function buildEndoPressureSection(p) {
  const { label } = calc.classifyBP(p);
  const pam = calc.calcPAM(p);
  return section("EndoPressure", `
    ${row("Presión Arterial Actual", p.tas && p.tad ? `${p.tas}/${p.tad} mmHg` : "--/--")}
    ${row("Categoría (AHA/ACC 2025)", label)}
    ${row("Presión Arterial Media", pam !== null ? pam + " mmHg" : "--")}
  `);
}

/* --------------------- DASHBOARD: EndoLypids --------------------- */
function buildEndoLypidsSection(p) {
  const { label, target } = calc.classifyLipidRisk(p);
  return section("EndoLypids", `
    ${row("Riesgo Cardiovascular (lipídico)", label)}
    ${row("LDL Actual / Meta", `${fmt(p.ldl, " mg/dL")} / <${target} mg/dL`)}
    ${row("No-HDL / ApoB estimada", `${calc.calcNonHDL(p) ?? "--"} / ${calc.calcApoBEst(p) ?? "--"}`)}
    ${row("Triglicéridos", fmt(p.trigliceridos, " mg/dL"))}
  `);
}

/* --------------------- DASHBOARD: EndoGoals --------------------- */
function buildEndoGoalsSection(p) {
  const goals = getGlycemicAndBPGoals({ age: p.edad, healthStatus: p.saludStatus || "sano", lowTreatmentBurden: !!p.bajoRiesgoTratamiento });
  const a1c = calc.getA1cEfectiva(p);
  const { label: riesgoLDL, target: metaLDL } = calc.classifyLipidRisk(p);
  return section("EndoGoals (Metas Consolidadas)", `
    ${row("HbA1c — Actual / Meta", `${fmt(a1c.value, "%")} / ${goals.a1c}`)}
    ${row("Glucosa en Ayuno — Actual / Meta", `${fmt(p.glucosa, " mg/dL")} / ${goals.ayuno}`)}
    ${row("Presión Arterial — Actual / Meta", `${p.tas && p.tad ? p.tas + "/" + p.tad : "--/--"} / ${goals.bp}`)}
    ${row("Colesterol Total — Actual", fmt(p.col_total, " mg/dL"))}
    ${row("LDL — Actual / Riesgo / Meta", `${fmt(p.ldl, " mg/dL")} / ${riesgoLDL} / <${metaLDL} mg/dL`)}
    ${row("Triglicéridos — Actual / Meta", `${fmt(p.trigliceridos, " mg/dL")} / ${TG_GOAL.label}`)}
  `);
}

/* --------------------- DASHBOARD: EndoManagement --------------------- */
function buildEndoManagementSection(p) {
  const { items, dmNote, interactionWarnings, redFlags } = calc.buildTreatmentPlan(p);

  // GUARDRAIL: mismo bloqueo que en pantalla (ver render.js) — si hay un
  // extremo fisiológico, el expediente impreso tampoco debe mostrar un plan
  // ambulatorio, para no quedar como constancia de una recomendación que
  // nunca debió calcularse.
  if (redFlags && redFlags.activo) {
    const body = wide(`<p class="exp-alert">${esc(redFlags.mensaje)}</p>
      <ul class="exp-list">${redFlags.flags.map((f) => `<li><b>${esc(f.label)}:</b> ${esc(f.detalle)}</li>`).join("")}</ul>`);
    return section("EndoManagement (Manejo Sugerido)", body);
  }

  const CATEGORIA_LABEL = { antidiabetic: "Antidiabéticos", htn: "Antihipertensivos", lipid: "Hipolipemiantes", obesity: "Farmacoterapia de Obesidad" };
  const CATEGORIA_ORDER = ["antidiabetic", "htn", "lipid", "obesity"];
  const groups = {};
  items.forEach((s) => { const cat = s.categoria || "antidiabetic"; (groups[cat] = groups[cat] || []).push(s); });

  let body = dmNote ? wide(`<p class="exp-warn">${esc(dmNote)}</p>`) : "";
  if (interactionWarnings && interactionWarnings.length > 0) {
    body += interactionWarnings.map((w) => {
      const cls = w.severidad === "mayor" ? "exp-alert" : "exp-warn";
      const badge = w.severidad === "mayor" ? "INTERACCIÓN MAYOR" : "INTERACCIÓN — VIGILAR";
      return wide(`<p class="${cls}">${badge}: ${esc(w.farmacoA)} + ${esc(w.farmacoB)} — ${esc(w.riesgo)}. ${esc(w.accion)}</p>`);
    }).join("");
  }
  if (items.length === 0) {
    body += wide(`<p class="exp-muted">Sin recomendaciones adicionales por ahora.</p>`);
  } else {
    CATEGORIA_ORDER.forEach((cat) => {
      const list = groups[cat];
      if (!list || !list.length) return;
      body += subhead(CATEGORIA_LABEL[cat]);
      body += list.map((s) => row(`${s.drug} ${s.dose || ""}`.trim(), s.reason)).join("");
    });
  }
  return section("EndoManagement (Manejo Sugerido)", body);
}

/* --------------------- DASHBOARD: EndoScreen (Tamizaje de Complicaciones) ---------------------
 * Agregado en la auditoría final (10-ago-2026): EndoScreen se construyó como
 * sección independiente del dashboard, pero se quedó fuera del expediente
 * impreso — un médico que revisara el PDF no vería el calendario de
 * tamizaje. Reutiliza computeScreeningItems (misma función pura que usa la
 * pantalla), no reimplementa nada. */
const SCREEN_ESTADO_LABEL = {
  sin_dato: "Sin datos", no_indicado: "Aún no indicado", indicado_sin_registro: "Corresponde realizar",
  al_dia: "Al día", atrasado: "Atrasado",
};
function buildEndoScreenSection(p) {
  const { tipoDM, aniosDM, items } = computeScreeningItems(p);
  if (aniosDM === null) {
    return section("EndoScreen (Tamizaje de Complicaciones Crónicas)", wide(`<p class="exp-muted">Sin antecedente diabetológico capturado.</p>`));
  }
  const notes = p.screeningNotes || {};
  const body = `
    ${row("Tipo de Diabetes / Años de Evolución", `${TIPO_DM_LABEL[tipoDM] || "--"} / ${aniosDM} años`)}
    ${subhead("Calendario de Tamizaje")}
    ${items.map((it) => {
      const estadoTxt = `${SCREEN_ESTADO_LABEL[it.estado]}${it.mesesAtraso ? ` (atraso ~${it.mesesAtraso}m)` : ""}`;
      const nota = (notes[it.key] || "").trim();
      return row(it.nombre, estadoTxt) + (nota ? row(`↳ Descripción / hallazgos`, nota) : "");
    }).join("")}
  `;
  return section("EndoScreen (Tamizaje de Complicaciones Crónicas)", body);
}

/* --------------------- DASHBOARD: EndoInsulin (Dosificación de Insulina) ---------------------
 * Agregado en la misma auditoría — mismo motivo que EndoScreen arriba.
 * Reutiliza computeInsulinAssessment (misma función pura que usa la pantalla). */
function buildEndoInsulinSection(p) {
  const a = computeInsulinAssessment(p);
  if (!a.aplica) {
    return section("EndoInsulin (Dosificación de Insulina)", wide(`<p class="exp-muted">No aplica (sin diagnóstico de diabetes ni insulina activa registrada).</p>`));
  }
  let body = "";
  if (a.basal.estado === "virgen") body += row("Basal (virgen de insulina)", `${a.basal.dosisMinUI}-${a.basal.dosisMaxUI} UI/día`);
  else if (a.basal.estado === "establecida_no_en_metas") body += row("Basal (NO en metas)", `considerar hasta ${a.basal.dosisObjetivoUI} UI/día`);
  else body += row("Basal", a.basal.fuente || "--");

  if (a.prandial.aplica && a.prandial.estado !== "sin_peso") {
    body += row("Prandial / Bolo", `${a.prandial.dosisMinUI}-${a.prandial.dosisMaxUI} UI/comida (${a.prandial.estado === "activo_reevaluar" ? "reevaluar ajuste" : "sugerido, nuevo"})`);
  }
  body += subhead("Automonitoreo (Ayuno / Nocturna / Preprandial / Posprandial)");
  body += row("Valores", `${fmt(a.monitoreo.ayuno.valor)} / ${fmt(a.monitoreo.nocturna.valor)} / ${fmt(a.monitoreo.preprandial.valor)} / ${fmt(a.monitoreo.posprandial.valor)} mg/dL`);
  body += row("Interpretación", a.monitoreo.interpretacion);
  return section("EndoInsulin (Dosificación de Insulina)", body);
}

/* --------------------- DASHBOARD: EndoDiagnostics (Lista de Diagnósticos) ---------------------
 * FIX (13-ago-2026): la sección EndoDiagnostics se agregó a la app pero se
 * quedó fuera del expediente impreso — el Dr. Ortega lo notó de inmediato
 * al probarlo. Reutiliza computeDiagnosticsList (misma función pura que
 * alimenta la vista, sin tocar DOM), colocada al final del Dashboard —
 * después de que todo lo demás ya fue detectado y clasificado — justo
 * antes de EndoNote (el tratamiento otorgado). */
function buildEndoDiagnosticsSection(p) {
  const list = computeDiagnosticsList(p);
  if (list.length === 0) {
    return section("EndoDiagnostics (Lista de Diagnósticos)", wide(`<p class="exp-muted">Sin diagnósticos detectados por ahora.</p>`));
  }
  const body = list.map((d) => row(d.label, d.detalle || "--")).join("");
  return section("EndoDiagnostics (Lista de Diagnósticos)", body);
}

/* --------------------- DASHBOARD: EndoNote | Tratamiento Otorgado --------------------- */
function buildEndoNoteSection() {
  const added = getAddedDrugs();
  const note = getFreeTextNote();
  let body = added.length
    ? added.map((f) => row(f.name, f.dosis || f.ini)).join("")
    : wide(`<p class="exp-muted">Sin fármacos agregados a esta consulta.</p>`);
  if (note.trim()) {
    body += subhead("Indicaciones / Notas Adicionales") + wide(`<div class="exp-note">${esc(note)}</div>`);
  }
  return section("EndoNote | Tratamiento Otorgado", body);
}

/* --------------------- Ensamblado completo --------------------- */
function buildExpedienteHTML(p) {
  const fecha = new Date().toLocaleDateString("es-MX", { day: "2-digit", month: "long", year: "numeric" });
  return `
    <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #0f172a;padding-bottom:0.5rem;margin-bottom:0.5rem">
      <div style="display:flex;align-items:center;gap:0.6rem">
        <img src="./logo.svg" alt="NEXORA" style="width:2rem;height:2rem;border-radius:0.5rem" />
        <div>
          <p style="font-weight:900;font-size:1rem">NEXORA</p>
          <p style="font-size:0.75rem;color:#64748b">EndoCore | Clinical Intelligence — Expediente Clínico Completo</p>
        </div>
      </div>
      <div style="text-align:right;font-size:0.75rem;color:#64748b">
        <p><b>${esc(p.nombre || "Paciente")}</b> — ${fmt(p.edad, " años")}</p>
        <p>Generado: ${fecha}</p>
      </div>
    </div>

    <h2>Ingreso Clínico</h2>
    ${buildSeccion1(p)}
    ${buildSeccion2(p)}
    ${buildSeccion3(p)}
    ${buildSeccion4(p)}
    ${buildSeccion5(p)}
    ${buildSeccion6(p)}
    ${buildSeccion7(p)}

    <h2>Dashboard</h2>
    ${buildEstratificacionGlobal(p)}
    ${buildEndoPressureSection(p)}
    ${buildEndoLypidsSection(p)}
    ${buildEndoGoalsSection(p)}
    ${buildEndoManagementSection(p)}
    ${buildEndoScreenSection(p)}
    ${buildEndoInsulinSection(p)}
    ${buildEndoDiagnosticsSection(p)}
    ${buildEndoNoteSection()}
  `;
}

/** Punto de entrada (ver botón "Expediente Completo (PDF)" en EndoNote). */
export function generarExpediente() {
  const p = getPatient();
  if (!p || !p.nombre) {
    alert("Primero ingresa y guarda los datos de un paciente en Ingreso Clínico.");
    return;
  }
  const container = document.getElementById("expedienteContainer");
  if (!container) return;
  container.innerHTML = buildExpedienteHTML(p);

  document.body.classList.add("printing-expediente");
  window.print();
}

window.addEventListener("afterprint", () => {
  document.body.classList.remove("printing-expediente");
});
