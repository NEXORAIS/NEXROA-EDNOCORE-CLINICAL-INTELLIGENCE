/* --- RENDERIZADO DEL DASHBOARD ---
 * Estas funciones SÍ tocan el DOM. Se llaman únicamente cuando el
 * paciente cambia (ver main.js -> onPatientChange), nunca en cada
 * cambio de pestaña — así no se pierde el estado de EndoFarma/EndoSimulators
 * al navegar.
 */
import * as calc from "./calculations.js";
import { DB_PHARMA } from "./pharma-db.js";
import { renderWeightProjectionChart, renderPharmaPKChart } from "./charts.js";
import { buildPKCurve, archetypeLabel } from "./pk-curves.js";
import {
  ZONES,
  classifyEGFR,
  classifyBP,
  classifyFIB4,
  classifyASCVD,
  classifyABCD,
  deriveOrcdFromFlags,
  getA1cTarget,
  classifyA1cVsTarget,
  getCardiovascularSummary,
  getGlycemicAndBPGoals,
  TG_GOAL,
  renderIndividualizationCard,
  classifySodio,
  classifyPotasio,
  classifyCalcio,
  classifyFosforo,
  classifyMagnesio,
  classifyValueVsTarget,
  classifyBPVsGoal,
  ayunoEstadoToZona,
} from "./individualization.js";
import { renderScreening } from "./screening.js";
import { renderDiagnostics } from "./diagnostics.js";
import { renderInsulinPanel, computeMonitoreo, computeGlucoseGoals } from "./insulin.js";

const setText = (id, text) => {
  const el = document.getElementById(id);
  if (el) el.innerText = text;
};

const esc = (s) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function updatePatientHeader(p) {
  setText("headerPatientName", p.nombre || "Paciente");
  setText("headerPatientAge", (p.edad || "--") + " años");
}

export function renderGlobalStrat(p) {
  // CORRECCIÓN (11-ago-2026, rediseño de Estratificación Global — a petición
  // del Dr. Ortega): FIB-4 y eGFR vivían DUPLICADOS en esta vista — una vez
  // aquí como tarjeta de barra plana (usando además, para FIB-4, el corte
  // SIN ajustar por edad de calc.classifyFIB4, distinto del corte de
  // individualization.js que sí ajusta a 2.0 en ≥65 años — la inconsistencia
  // que ya documentaba el comentario original de esta función) y otra vez en
  // "Clasificación Individual" con zona/color. Se elimina la tarjeta
  // duplicada; la barra de progreso ahora vive DENTRO de la tarjeta de
  // Individualización (ver renderIndividualizationPanel/
  // buildIndividualizationCardHTML), con el corte correcto y un solo lugar
  // de verdad para este dato.
  setText("valHOMA_IR", calc.calcHOMA_IR(p));

  const a1c = calc.getA1cEfectiva(p);
  const a1cSourceLabel = a1c.source === "medida" ? "medida" : a1c.source === "estimada" ? "estimada por glucosa" : "--";
  setText("valA1c", (a1c.value || "--") + "%");
  setText("valeAG", calc.calcEAG(p) ?? "--");
  const a1cSrcEl = document.getElementById("valA1cSource");
  if (a1cSrcEl) a1cSrcEl.innerText = a1c.value ? `(${a1cSourceLabel})` : "";

  setText("valIMC", calc.calcIMC(p) ?? "--");
  setText("valICC", calc.calcICC(p) ?? "--");
  setText("valICA", calc.calcICA(p) ?? "--");
  const pam = calc.calcPAM(p);
  setText("valPAM", pam !== null ? pam + " mmHg" : "--");

  renderIndividualizationPanel(p);
}

/* --- PANEL DE INDIVIDUALIZACIÓN (valor + color) ---
 * Ver documento "Criterios_Individualizacion_Dashboard.md", sección 3.
 * Requiere un contenedor en el HTML con id="individualizationCards"
 * (ej. una grilla dentro de la vista "view-riesgo"):
 *   <div id="individualizationCards" class="grid grid-cols-2 md:grid-cols-3 gap-3"></div>
 *
 * Campos opcionales del paciente que este panel intenta leer y que hoy
 * probablemente NO existen todavía en state.js — si no existen, la
 * tarjeta correspondiente se muestra vacía ("Sin datos suficientes")
 * en vez de romper el render. `p.uacr` y las banderas de comorbilidad
 * (ic/erc/ascvd/masld vía calc.getPatientFlags) YA EXISTEN en el proyecto
 * y se usan automáticamente. Lo que SÍ falta todavía en state.js:
 *   p.ascvdRiskPct   -> % de riesgo ASCVD a 10 años (PREVENT). La ecuación
 *                       no está implementada (ver individualization.js);
 *                       si no existe el campo, la tarjeta queda vacía.
 *   p.vctLsm         -> resultado de elastografía (VCTE), en kPa. Sin él,
 *                       FIB-4 elevado se muestra como "indeterminado".
 *   p.saludStatus    -> "sano" | "complejo" | "muyComplejo" (≥65 años,
 *                       Tabla 13.2 ADA 2026). Ahora SÍ se captura en la
 *                       Ficha de Identificación (corrección de auditoría
 *                       8-ago-2026: antes este campo no existía en el
 *                       formulario y el vocabulario ni siquiera coincidía
 *                       con el que esperaba getA1cTarget en individualization.js
 *                       — la meta de A1c por edad/complejidad nunca funcionó).
 *   p.bajoRiesgoTratamiento -> bool, para la meta de A1c <6.5% (Rec. 6.4).
 *                       También se captura ahora en Ficha de Identificación.
 */
function renderIndividualizationPanel(p) {
  const egfr = calc.calcEGFR(p);
  const fib4 = calc.calcFIB4(p);
  const a1c = calc.getA1cEfectiva(p);
  const flags = calc.getPatientFlags(p);

  const a1cTarget = getA1cTarget({
    age: p.edad,
    healthStatus: p.saludStatus || "sano",
    lowTreatmentBurden: !!p.bajoRiesgoTratamiento,
  });

  // Orden clínico lógico: 1) control glucémico (el eje central de la consulta),
  // 2) riesgo cardiovascular global (la complicación que integra a las demás),
  // 3) presión arterial (factor de riesgo específico y modificable),
  // 4) función renal (órgano blanco microvascular),
  // 5) hígado (órgano blanco metabólico),
  // 6) estadificación de obesidad (contexto/causa metabólica de fondo).
  // barPercent (11-ago-2026, rediseño de Estratificación Global): antes eGFR
  // y FIB-4 tenían una barra de progreso en una tarjeta APARTE, duplicando el
  // mismo dato que ya se muestra aquí con su zona de color. Se calcula el
  // mismo % que usaba esa tarjeta (ver renderGlobalStrat, ahora simplificado)
  // y se pasa directamente a la tarjeta de clasificación — un solo lugar.
  const egfrBarPct = egfr !== null && egfr !== undefined && !isNaN(egfr) ? Math.min(100, (egfr / 120) * 100) : null;
  const fib4BarPct = fib4 !== null && fib4 !== undefined && !isNaN(fib4) ? Math.min(100, (fib4 / 3) * 100) : null;

  renderIndividualizationCard("individualizationCards", [
    { icon: "target", title: "A1c vs. meta individualizada", result: classifyA1cVsTarget(a1c.value ?? null, a1cTarget) },
    { icon: "activity", title: "Riesgo ASCVD (PREVENT)", result: classifyASCVD(p.ascvdRiskPct ?? null) },
    { icon: "heart", title: "Presión arterial", result: classifyBP(p.tas, p.tad) },
    { icon: "droplet", title: "eGFR renal", result: classifyEGFR(egfr, p.uacr || null), barPercent: egfrBarPct },
    { icon: "flask-conical", title: "FIB-4 hepático", result: classifyFIB4(fib4, p.edad, p.vctLsm ?? null), barPercent: fib4BarPct },
    { icon: "scale", title: "Estadio ABCD (obesidad)", result: classifyABCD(deriveOrcdFromFlags(flags), flags.obesidad) },
    // Electrolitos (12-ago-2026, a petición del Dr. Ortega): mismo tratamiento
    // de zona/color que el resto — "Sin dato" gris si no se capturó el lab
    // correspondiente, igual que ya hacían ASCVD/FIB-4 antes de tener datos.
    { icon: "beaker", title: "Sodio", result: classifySodio(p) },
    { icon: "beaker", title: "Potasio", result: classifyPotasio(p) },
    { icon: "beaker", title: "Calcio", result: classifyCalcio(p) },
    { icon: "beaker", title: "Fósforo", result: classifyFosforo(p) },
    { icon: "beaker", title: "Magnesio", result: classifyMagnesio(p) },
  ]);
}

const COSTO_LABEL = { 1: "$", 2: "$$", 3: "$$$" };

const CATEGORIA_LABEL = { antidiabetic: "Antidiabéticos", htn: "Antihipertensivos", lipid: "Hipolipemiantes", obesity: "Farmacoterapia de Obesidad" };
const CATEGORIA_ICON = { antidiabetic: "syringe", htn: "heart-pulse", lipid: "flask-conical", obesity: "scale" };
const CATEGORIA_COLOR = { antidiabetic: "blue", htn: "rose", lipid: "purple", obesity: "cyan" };
const CATEGORIA_ORDER = ["antidiabetic", "htn", "lipid", "obesity"];

/** Traduce los códigos de `contra` (pharma-db.js) a contraindicaciones legibles. */
const CONTRAINDICACION_LABEL = {
  IC: "Insuficiencia cardíaca.",
  MEN2: "Antecedente personal/familiar de MEN2A o carcinoma medular de tiroides.",
  HIPOGLUCEMIA: "Antecedente de hipoglucemias severas.",
  GLP1_GIP: "Pancreatitis previa o gastroparesia.",
  // Agregados junto con el guard IECA/ARA-II y el de estimulantes CV en
  // obesidad (auditoría de escalonamiento) — antes existían en `contra` de
  // pharma-db.js pero esta tarjeta no sabía traducirlos a texto legible.
  ANGIOEDEMA: "Angioedema previo con IECA (efecto de clase — excluye TODA la clase IECA).",
  TOS_IECA: "Tos documentada con IECA (efecto de clase — excluye TODA la clase IECA).",
  ESTIMULANTE_CV: "Enfermedad cardiovascular establecida o HTA no controlada (estimulante simpaticomimético).",
  // 11-ago-2026 (auditoría de secuencia): nuevo flag de embarazo — ver
  // getPatientFlags/currentDrugIssue en calculations.js.
  EMBARAZO: "Contraindicado/no recomendado en embarazo.",
};

const BENEF_INDICACION_LABEL = { ic: "Insuficiencia cardíaca", erc: "Enfermedad renal crónica", ascvd: "ASCVD establecida", stroke: "Enfermedad cerebrovascular (stroke/TIA)", masld: "MASLD" };

/**
 * Clasifica la información de un fármaco en 4 categorías, en orden lógico de
 * mayor a menor "poder de veto" clínico: primero lo que IMPIDE usarlo
 * (Contraindicaciones), luego lo que obliga a tener cuidado (Precauciones),
 * luego lo que hay que verificar/monitorizar antes o durante el uso
 * (Consideraciones de uso), y por último el contexto de POR QUÉ se eligió
 * (Indicaciones — beneficio comprobado por comorbilidad, AACE Fig. 9).
 * Antes esto era una sola lista sin orden (mezclaba las 4 cosas); ahora cada
 * médico ve primero lo que bloquea el fármaco, no una advertencia genérica.
 */
function buildPrecaucionesInfo(drugMeta) {
  if (!drugMeta) return null;

  const contraindicaciones = (drugMeta.contra || [])
    .map((code) => CONTRAINDICACION_LABEL[code])
    .filter(Boolean);

  const precauciones = [];
  if (drugMeta.adv) precauciones.push(drugMeta.adv);

  const consideraciones = [];
  if (drugMeta.egfrMin) consideraciones.push(`Requiere eGFR ≥ ${drugMeta.egfrMin} mL/min/1.73m².`);
  if (drugMeta.hipo === "alto") consideraciones.push("Riesgo de hipoglucemia ALTO por sí solo — vigilar.");
  else if (drugMeta.hipo === "moderado") consideraciones.push("Riesgo de hipoglucemia MODERADO por sí solo.");

  const indicaciones = drugMeta.benef
    ? Object.entries(drugMeta.benef).filter(([, v]) => v).map(([k]) => BENEF_INDICACION_LABEL[k]).filter(Boolean)
    : [];

  return { contraindicaciones, precauciones, consideraciones, indicaciones };
}

const PRECAUCION_SECTIONS = [
  { key: "contraindicaciones", label: "Contraindicaciones", icon: "ban", color: "red" },
  { key: "precauciones", label: "Precauciones", icon: "alert-triangle", color: "amber" },
  { key: "consideraciones", label: "Consideraciones de uso", icon: "clipboard-list", color: "blue" },
  { key: "indicaciones", label: "Indicaciones (beneficio comprobado)", icon: "badge-check", color: "emerald" },
];

/* --- Citas de guía ocultas tras un ícono de información (12-ago-2026, a
 * petición del Dr. Ortega) ---
 * Muchos `reason` de calculations.js/geriatric.js/etc. incrustan la cita a
 * la guía a mitad de la frase (ej. "...meta individualizada (Tabla 13.2,
 * ADA 2026) y con agente(s)..."), lo cual se veía sobrecargado en la
 * tarjeta. En vez de tocar cada módulo que arma estos textos (son más de
 * diez: geriatric.js, perioperative.js, borderline-labs.js, etc.), se
 * intercepta aquí, en el único punto donde TODOS esos `reason` terminan
 * renderizándose como tarjeta — un paréntesis que luce como cita (contiene
 * un año 20XX, "Tabla N", o el nombre de una guía conocida) se reemplaza
 * por un ícono (i) pequeño con la cita completa en el atributo `title`
 * (aparece solo al pasar el cursor/enfocar, minimalista, esquinero dentro
 * del texto). Paréntesis clínicos normales (sin esas señales) no se tocan. */
const CITATION_RE = /\(([^()]*?(?:20\d{2}|Tabla\s*\d[\d.]*|Caso\s*\d+|ADA\/ACC|AHA\/ACC|A[DH]A|ACC\/HFSA|FDA|KDIGO|HFSA|PATHWAY-2|FIDELIO-DKD|FIGARO-DKD|Standards of Care|ACCORD|VADT)[^()]*?)\)/gi;

function citeIcon(citation) {
  const safe = String(citation).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<span class="cite-info" tabindex="0" title="${safe}"><i data-lucide="info" class="w-2.5 h-2.5"></i></span>`;
}

/** Envuelve un `reason`/texto de motivo clínico, ocultando cualquier cita a
 * guía que contenga dentro tras un ícono de información. Ver CITATION_RE. */
function formatReasonHTML(text) {
  if (!text) return "";
  return String(text).replace(CITATION_RE, (_, inner) => citeIcon(inner));
}

/** Tarjeta individual de fármaco recomendado dentro de "Manejo Sugerido". */
function buildManagementCardHTML(s) {
  const costoLabel = s.costo ? COSTO_LABEL[s.costo] : "";
  const drugMeta = DB_PHARMA.find((f) => f.id === s.id);
  const info = buildPrecaucionesInfo(drugMeta);

  const seccionesHTML = info
    ? PRECAUCION_SECTIONS.map((sec) => {
        const items = info[sec.key];
        if (!items || items.length === 0) return "";
        return `<div class="mt-2 pt-2 border-t border-slate-100 dark:border-slate-700">
          <p class="text-[10px] font-black uppercase tracking-wide text-${sec.color}-600 dark:text-${sec.color}-400 flex items-center gap-1"><i data-lucide="${sec.icon}" class="w-3 h-3"></i> ${sec.label}</p>
          <ul class="list-disc list-inside mt-1 space-y-0.5 text-[11px] text-slate-500 dark:text-slate-400">${items.map((x) => `<li>${x}</li>`).join("")}</ul>
        </div>`;
      }).join("")
    : "";

  // Color insignia del fármaco (rose/blue/amber/cyan/purple/emerald según el
  // motivo clínico — ya lo decidía calculations.js) reutilizado también para
  // la sombra de hover (11-ago-2026, rediseño visual general): cada tarjeta
  // "brilla" en SU propio color al pasar el cursor, en vez del gris genérico
  // de antes — más vívido sin inventar un color nuevo por tarjeta.
  const accent = s.color === "neon" ? "cyan" : s.color;
  return `<div class="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 hover:shadow-lg hover:shadow-${accent}-200/50 dark:hover:shadow-${accent}-950/30 hover:border-${accent}-300 dark:hover:border-${accent}-700 hover:-translate-y-0.5 transition-all duration-200">
    <div class="flex items-start justify-between gap-3">
      <div class="flex items-center gap-3 min-w-0">
        <div class="w-2 self-stretch rounded-full bg-${accent}-500 shrink-0"></div>
        <div class="min-w-0">
          <h4 class="font-bold text-slate-800 dark:text-white truncate">${s.drug}</h4>
          <p class="text-xs font-data font-bold text-slate-500 dark:text-slate-400">${s.dose || ""}</p>
          <p class="text-[11px] text-slate-400 mt-0.5">${formatReasonHTML(s.reason)}</p>
        </div>
      </div>
      <div class="flex flex-col items-end gap-2 shrink-0">
        ${costoLabel ? `<span class="text-[10px] font-black text-slate-400" title="Costo relativo">${costoLabel}</span>` : ""}
        ${s.id
          ? `<button data-add-rx-id="${s.id}" class="p-2 bg-${accent}-50 dark:bg-${accent}-900/20 rounded-lg text-${accent}-500 hover:bg-${accent}-500 hover:text-white transition-all" title="Agregar a EndoNote"><i data-lucide="plus" class="w-4 h-4"></i></button>`
          : `<button data-add-rx-name="${s.drug}" class="p-2 bg-${accent}-50 dark:bg-${accent}-900/20 rounded-lg text-${accent}-500 hover:bg-${accent}-500 hover:text-white transition-all" title="Agregar a EndoNote"><i data-lucide="plus" class="w-4 h-4"></i></button>`}
      </div>
    </div>
    ${seccionesHTML ? `<details class="mt-1 text-[11px]"><summary class="cursor-pointer select-none font-bold text-slate-400 dark:text-slate-500 pt-1">Ver detalle clínico</summary>${seccionesHTML}</details>` : ""}
  </div>`;
}

/** Tarjeta de "combinación de inicio" (11-ago-2026, a petición del Dr.
 * Ortega): funde 2+ fármacos que comparten `comboGroup` (asignado en
 * buildHTNPlan/buildAntidiabeticPlan cuando el motor determina que deben
 * iniciarse EN CONJUNTO, ej. Losartán+Amlodipino en HTA Etapa 2, o
 * Metformina+Empagliflozina+Semaglutida por cobertura de comorbilidades) en
 * una sola tarjeta en vez de mostrarlos como sugerencias sueltas — el mismo
 * fármaco individual sigue siendo una entrada normal del plan (EndoNote,
 * tests, etc. no cambian), esto es solo la presentación visual. */
function buildComboCardHTML(itemsInCombo) {
  const rows = itemsInCombo.map((s, i) => `
    ${i > 0 ? `<div class="flex justify-center"><span class="text-slate-300 dark:text-slate-600 font-black text-sm leading-none">+</span></div>` : ""}
    <div class="flex items-start gap-3">
      <div class="w-2 self-stretch rounded-full bg-${s.color === "neon" ? "cyan" : s.color}-500 shrink-0"></div>
      <div class="min-w-0 flex-1">
        <div class="flex items-center justify-between gap-2">
          <h4 class="font-bold text-slate-800 dark:text-white truncate">${s.drug}</h4>
          ${s.costo ? `<span class="text-[10px] font-black text-slate-400 shrink-0" title="Costo relativo">${COSTO_LABEL[s.costo]}</span>` : ""}
        </div>
        <p class="text-xs font-data font-bold text-slate-500 dark:text-slate-400">${s.dose || ""}</p>
        <p class="text-[11px] text-slate-400 mt-0.5">${formatReasonHTML(s.reason)}</p>
      </div>
    </div>`).join("");

  const ids = itemsInCombo.map((s) => s.id).filter(Boolean);

  return `<div class="sm:col-span-2 bg-gradient-to-br from-blue-50/60 dark:from-blue-950/20 to-white dark:to-slate-800 p-4 rounded-2xl border-2 border-blue-200 dark:border-blue-800/60 hover:shadow-lg hover:shadow-blue-200/50 dark:hover:shadow-blue-950/30 hover:-translate-y-0.5 transition-all duration-200">
    <p class="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wide text-blue-600 dark:text-blue-400 mb-2">
      <i data-lucide="link-2" class="w-3 h-3"></i> Combinación de inicio — iniciar en conjunto
    </p>
    <div class="space-y-1.5">${rows}</div>
    ${ids.length > 0
      ? `<button data-add-rx-ids="${ids.join(",")}" class="mt-3 w-full py-2 bg-gradient-to-r from-blue-600 to-cyan-500 text-white font-bold rounded-xl shadow-sm hover:shadow-lg hover:shadow-blue-300/50 dark:hover:shadow-blue-950/40 transition-all text-xs flex items-center justify-center gap-2"><i data-lucide="plus" class="w-4 h-4"></i> Agregar los ${ids.length} a EndoNote</button>`
      : ""}
  </div>`;
}

export function renderManagement(p) {
  const container = document.getElementById("rxContainer");
  if (container) {
    container.innerHTML = "";

    const { items, dmNote, interactionWarnings, redFlags } = calc.buildTreatmentPlan(p);

    // GUARDRAIL: extremo fisiológico -> bloquear TODO el algoritmo
    // ambulatorio, incluido EndoInsulin, y mostrar solo la derivación.
    if (redFlags && redFlags.activo) {
      container.innerHTML = `<div class="p-5 rounded-2xl bg-red-600 text-white shadow-lg">
        <p class="font-black uppercase tracking-wide text-sm flex items-center gap-2"><i data-lucide="siren" class="w-5 h-5"></i> ${esc(redFlags.mensaje)}</p>
        <ul class="mt-3 space-y-1 text-sm">
          ${redFlags.flags.map((f) => `<li class="flex items-start gap-2"><i data-lucide="alert-octagon" class="w-4 h-4 shrink-0 mt-0.5"></i><span><b>${esc(f.label)}:</b> ${esc(f.detalle)}</span></li>`).join("")}
        </ul>
      </div>`;
      if (typeof lucide !== "undefined") lucide.createIcons();
      setText("summName", p.nombre || "Paciente");
      setText("summAge", `${p.edad || "--"} años (${p.sexo || "--"})`);
      return;
    }

    renderInsulinPanel(p); // EndoInsulin — ver js/insulin.js, panel independiente (solo si NO hay red flag activo)

    if (dmNote) {
      container.innerHTML += `<div class="p-3 mb-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-xs font-bold text-red-700 dark:text-red-300">${dmNote}</div>`;
    }

    // Advertencias de interacciones fármaco-fármaco cruzadas entre categorías
    // (ver interactions.js) — "mayor" en rojo (evitar/sustituir), "monitorizar"
    // en ámbar (combinación a menudo intencional, requiere vigilancia).
    if (interactionWarnings && interactionWarnings.length > 0) {
      container.innerHTML += interactionWarnings.map((w) => {
        const isMayor = w.severidad === "mayor";
        const cls = isMayor
          ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300"
          : "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300";
        const badge = isMayor ? "INTERACCIÓN MAYOR — EVITAR/SUSTITUIR" : "INTERACCIÓN — VIGILAR";
        return `<div class="p-3 mb-3 rounded-xl border text-xs ${cls}">
          <p class="font-black uppercase tracking-wide mb-1">${badge}: ${w.farmacoA} + ${w.farmacoB}</p>
          <p class="mb-1"><b>Riesgo:</b> ${w.riesgo} — ${w.mecanismo}</p>
          <p><b>Conducta:</b> ${w.accion}</p>
        </div>`;
      }).join("");
    }

    if (items.length === 0) {
      container.innerHTML += `<div class="text-center text-sm text-slate-400 py-10"><i data-lucide="clipboard-check" class="w-8 h-8 mx-auto mb-2 opacity-40"></i>Sin recomendaciones adicionales por ahora.</div>`;
    } else {
      const groups = {};
      items.forEach((s) => {
        const cat = s.categoria || "antidiabetic";
        (groups[cat] = groups[cat] || []).push(s);
      });

      CATEGORIA_ORDER.forEach((cat) => {
        const list = groups[cat];
        if (!list || list.length === 0) return;

        // Combinaciones de inicio (comboGroup) primero, como tarjeta fundida;
        // el resto de fármacos de la categoría se muestran individuales como
        // siempre — ver buildComboCardHTML.
        const comboClusters = new Map();
        const singles = [];
        list.forEach((s) => {
          if (s.comboGroup) {
            if (!comboClusters.has(s.comboGroup)) comboClusters.set(s.comboGroup, []);
            comboClusters.get(s.comboGroup).push(s);
          } else {
            singles.push(s);
          }
        });
        // CORRECCIÓN (11-ago-2026, auditoría de secuencia — Dr. Ortega): un
        // comboGroup puede quedar con un solo integrante si otra capa del motor
        // (ej. la alerta perioperatoria en buildAntidiabeticPlan) elimina a su
        // pareja del plan DESPUÉS de que ambos ya fueron etiquetados como
        // combinación de inicio — el otro fármaco se suspende, pero la etiqueta
        // comboGroup se queda en el que sobrevive. Sin este filtro, ese fármaco
        // solitario se renderizaba como "Combinación de inicio — iniciar en
        // conjunto" con un solo renglón. Un cluster de 1 se trata como tarjeta
        // individual normal.
        const realCombos = [];
        comboClusters.forEach((clusterItems) => {
          if (clusterItems.length >= 2) realCombos.push(clusterItems);
          else singles.push(...clusterItems);
        });
        const cardsHTML = [
          ...realCombos.map(buildComboCardHTML),
          ...singles.map(buildManagementCardHTML),
        ].join("");

        const catColor = CATEGORIA_COLOR[cat] || "slate";
        container.innerHTML += `<div class="mb-4">
          <p class="flex items-center gap-2 text-[11px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">
            <span class="w-6 h-6 rounded-lg bg-${catColor}-100 dark:bg-${catColor}-900/40 flex items-center justify-center shrink-0"><i data-lucide="${CATEGORIA_ICON[cat]}" class="w-3.5 h-3.5 text-${catColor}-600 dark:text-${catColor}-400"></i></span> ${CATEGORIA_LABEL[cat]}
          </p>
          <div class="grid sm:grid-cols-2 gap-3">${cardsHTML}</div>
        </div>`;
      });
    }
    if (typeof lucide !== "undefined") lucide.createIcons();
  }

  // --- Barra de resumen del paciente ---
  setText("summName", p.nombre || "Paciente");
  setText("summAge", `${p.edad || "--"} años (${p.sexo || "--"})`);
  setText("summBP", p.tas && p.tad ? `${p.tas}/${p.tad} mmHg` : "--/--");

  const egfr = calc.calcEGFR(p);
  setText("summTFG", egfr ? `${egfr} mL/min` : "--");

  const flags = calc.getPatientFlags(p);
  const cardio = getCardiovascularSummary(p, flags);
  setText("summCardio", cardio.valor !== null && cardio.valor !== undefined ? `${cardio.valor}${cardio.label ? " " + cardio.label : ""}` : "--");

  const fib4 = calc.calcFIB4(p);
  const fib4Result = classifyFIB4(fib4, p.edad, p.vctLsm ?? null);
  setText("summFIB4", fib4Result.valor !== null && fib4Result.valor !== undefined ? `${fib4Result.valor}` : "--");
}

/** Color hexadecimal por zona para el trazo del anillo SVG (Tailwind no
 * puede aplicar clases dark: a un atributo stroke, así que se usa el mismo
 * tono medio de cada familia de color de ZONES en ambos modos — funciona
 * bien en claro y oscuro por igual, ver splashLogoShine arriba en el
 * <style> del <head> para el mismo criterio ya usado en el splash). */
const ZONA_HEX = { verde: "#10b981", amarillo: "#f59e0b", naranja: "#f97316", rojo: "#f43f5e", gris: "#94a3b8" };
const ZONA_STATUS_TEXT = { verde: "En meta", amarillo: "Cerca de meta", naranja: "Sobre meta", rojo: "Fuera de meta", gris: "Sin dato" };

/** Anillo de progreso SVG hacia la meta — ver comentario de
 * classifyValueVsTarget en individualization.js para qué significa
 * `percent` (heurístico visual, no un porcentaje clínico). */
function buildGoalRingSVG(percent, zona, valueLabel) {
  const r = 27;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - Math.max(0, Math.min(100, percent)) / 100);
  const urgent = zona === "rojo";
  return `<div class="relative w-16 h-16 shrink-0">
    <svg width="64" height="64" viewBox="0 0 64 64" style="transform:rotate(-90deg)">
      <circle class="goal-track" cx="32" cy="32" r="${r}" fill="none" stroke-width="6"></circle>
      <circle class="goal-ring${urgent ? " goal-ring-urgent" : ""}" cx="32" cy="32" r="${r}" fill="none" stroke="${ZONA_HEX[zona] || ZONA_HEX.gris}" stroke-width="6" stroke-linecap="round" stroke-dasharray="${circumference.toFixed(1)}" stroke-dashoffset="${offset.toFixed(1)}"></circle>
    </svg>
    <div class="absolute inset-0 flex items-center justify-center text-[12px] font-black font-data text-slate-800 dark:text-white text-center leading-none px-1">${valueLabel}</div>
  </div>`;
}

/** Tarjeta de una meta individual — icono + anillo + meta + estado, con la
 * línea de flujo animada (.goal-flow, ver <style> del <head>) que "recorre"
 * el borde superior en el color de la zona, como señal de que esta sección
 * está viva y requiere atención (a petición del Dr. Ortega: "es una zona
 * demasiado importante que debe llamar la atención"). */
function buildGoalCardHTML({ icon, title, valueLabel, metaLine, zona, percent, note }) {
  const c = ZONES[zona] || ZONES.gris;
  const hex = ZONA_HEX[zona] || ZONA_HEX.gris;
  return `<div class="goal-card p-5 rounded-2xl border ${c.border} bg-white dark:bg-slate-900">
    <div class="goal-flow" style="background:linear-gradient(90deg, transparent, ${hex}99, transparent);"></div>
    <div class="flex items-center gap-2 mb-4">
      <span class="w-7 h-7 rounded-lg ${c.chip} flex items-center justify-center shrink-0"><i data-lucide="${icon}" class="w-3.5 h-3.5 ${c.text}"></i></span>
      <span class="text-[11px] font-bold text-slate-400 uppercase tracking-wide">${title}</span>
    </div>
    <div class="flex items-center gap-4">
      ${buildGoalRingSVG(percent, zona, valueLabel)}
      <div class="min-w-0">
        <p class="text-[11px] text-slate-400">${metaLine}</p>
        <p class="text-sm font-bold ${c.text} mt-0.5">${ZONA_STATUS_TEXT[zona]}</p>
        ${note ? `<p class="text-[10px] text-slate-400 mt-1 leading-snug">${note}</p>` : ""}
      </div>
    </div>
  </div>`;
}

/**
 * EndoGoals: todas las metas del paciente consolidadas en un solo lugar,
 * cada una con su anillo de progreso real hacia la meta (rediseño
 * 16-ago-2026). No agrega criterios clínicos nuevos — solo reutiliza los ya
 * verificados en individualization.js/insulin.js/calculations.js para que
 * el médico los vea juntos, con color y movimiento cuando algo requiere
 * atención.
 */
export function renderGoals(p) {
  const goals = getGlycemicAndBPGoals({
    age: p.edad,
    healthStatus: p.saludStatus || "sano",
    lowTreatmentBurden: !!p.bajoRiesgoTratamiento,
  });
  const a1cTargetNum = getA1cTarget({
    age: p.edad,
    healthStatus: p.saludStatus || "sano",
    lowTreatmentBurden: !!p.bajoRiesgoTratamiento,
  });

  const cards = [];

  // 1) HbA1c — reutiliza classifyA1cVsTarget (misma función que Estratificación Global).
  const a1c = calc.getA1cEfectiva(p);
  const a1cClass = classifyA1cVsTarget(a1c.value > 0 ? a1c.value : null, a1cTargetNum);
  const a1cPercent = a1c.value > 0 ? Math.max(0, Math.min(100, Math.round((a1cTargetNum / a1c.value) * 100))) : 0;
  cards.push(buildGoalCardHTML({
    icon: "activity", title: "HbA1c",
    valueLabel: a1c.value > 0 ? `${a1c.value}%` : "--",
    metaLine: `Meta ${goals.a1c}`, zona: a1cClass.zona, percent: a1cPercent,
  }));

  // 2) Glucosa en Ayuno — reutiliza computeMonitoreo (insulin.js), la MISMA
  // fuente que ya usa EndoInsulin para este dato, para nunca mostrar un
  // estado distinto del mismo valor en dos pantallas.
  const monitoreo = computeMonitoreo(p);
  const ayunoGoals = computeGlucoseGoals(p);
  const ayunoZona = ayunoEstadoToZona(monitoreo.ayuno.estado);
  let ayunoPercent = 0;
  if (monitoreo.ayuno.estado === "en_meta") ayunoPercent = 100;
  else if (monitoreo.ayuno.estado === "elevado") ayunoPercent = Math.max(0, Math.min(100, Math.round((ayunoGoals.ayunoMax / monitoreo.ayuno.valor) * 100)));
  else if (monitoreo.ayuno.valor) ayunoPercent = Math.max(0, Math.min(100, Math.round((monitoreo.ayuno.valor / ayunoGoals.ayunoMin) * 100)));
  cards.push(buildGoalCardHTML({
    icon: "droplet", title: "Glucosa en Ayuno",
    valueLabel: monitoreo.ayuno.valor !== null ? `${monitoreo.ayuno.valor}` : "--",
    metaLine: `Meta ${goals.ayuno}`, zona: ayunoZona.zona, percent: ayunoPercent,
  }));

  // 3) Presión Arterial — vs. la meta INDIVIDUALIZADA (no el corte
  // poblacional de classifyBP, ver comentario de classifyBPVsGoal).
  const bpClass = classifyBPVsGoal(p.tas, p.tad, goals.bp);
  cards.push(buildGoalCardHTML({
    icon: "heart-pulse", title: "Presión Arterial",
    valueLabel: p.tas && p.tad ? `${p.tas}/${p.tad}` : "--",
    metaLine: `Meta ${goals.bp}`, zona: bpClass.zona, percent: bpClass.percent,
  }));

  // 4) Colesterol Total — sin meta única (LDL-C/no-HDL son los objetivos
  // primarios); se muestra informativo, sin anillo de progreso.
  cards.push(buildGoalCardHTML({
    icon: "flask-conical", title: "Colesterol Total",
    valueLabel: p.col_total || "--",
    metaLine: "Sin meta única", zona: "gris", percent: 0,
    note: "LDL-C y no-HDL son los objetivos primarios.",
  }));

  // 5) LDL-C — meta viene de classifyLipidRisk (Guía de Dislipidemia 2026,
  // igual que EndoLypids); classifyValueVsTarget solo decide el % del anillo.
  const { label: riesgoLDL, target: metaLDL } = calc.classifyLipidRisk(p);
  const ldlClass = classifyValueVsTarget(p.ldl, metaLDL);
  cards.push(buildGoalCardHTML({
    icon: "shield-half", title: "LDL-C",
    valueLabel: p.ldl || "--",
    metaLine: `Meta (${riesgoLDL}): <${metaLDL} mg/dL`, zona: ldlClass.zona, percent: ldlClass.percent,
  }));

  // 6) Triglicéridos — meta fija TG_GOAL (ATP III/ACC-AHA, ver constante).
  const tgClass = classifyValueVsTarget(p.trigliceridos, TG_GOAL.target);
  cards.push(buildGoalCardHTML({
    icon: "waves", title: "Triglicéridos",
    valueLabel: p.trigliceridos || "--",
    metaLine: `Meta ${TG_GOAL.label}`, zona: tgClass.zona, percent: tgClass.percent,
  }));

  const root = document.getElementById("goalsCards");
  if (root) {
    root.innerHTML = cards.join("");
    if (typeof lucide !== "undefined") lucide.createIcons();
  }
}

/** Orden clínico de subgrupos farmacológicos dentro de cada categoría de
 * EndoFarma. Cualquier `grp` presente en DB_PHARMA que no esté listado aquí
 * se agrega al final automáticamente (para no perder fármacos silenciosamente
 * si se añade una clase nueva a la base de datos). */
const GROUP_ORDER = {
  antidiabetic: ["Biguanidas", "iSGLT2", "GLP-1 RA", "GIP/GLP-1 RA", "iDPP-4", "TZD", "Sulfonilurea", "Meglitinida", "AGI", "Insulina Basal", "Insulina Prandial"],
  obesity: ["GLP-1 RA", "GIP/GLP-1 RA", "Simpaticomimético/GABAérgico", "Antagonista Opioide/NDRI", "Agonista MC4R", "Inhibidor Lipasa GI"],
  htn: ["IECA", "ARA-II", "BCC Dihidropiridínico", "BCC No Dihidropiridínico", "Diurético tipo Tiazida", "Diurético de Asa", "MRA Esteroidea", "MRA No Esteroidea", "Beta-bloqueante Cardioselectivo", "Beta-bloqueante combinado α-β", "Alfabloqueante", "Vasodilatador Directo", "Agente Central"],
  lipid: ["Estatina Alta Intensidad", "Estatina Baja/Moderada Intensidad", "Inhibidor de Absorción", "Inhibidor ATP-Citrato Liasa", "PCSK9i (mAb)", "PCSK9i (siRNA)", "Ácido Icosapentaenoico", "Fibrato", "Secuestrante de Ácidos Biliares"],
};

/** Convierte un nombre de subgrupo en un slug seguro para usar como id/data-attr. */
function slugifyGroup(cat, grp) {
  return `${cat}-${grp.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`;
}

/** Recuerda qué categoría de EndoFarma está activa, para que la búsqueda
 * (searchPharmaLib) sepa sobre qué lista de fármacos filtrar. */
let currentPharmaCat = "antidiabetic";

/** Tarjeta HTML de un fármaco dentro de la lista de EndoFarma. */
function buildDrugCardHTML(f) {
  const costoLabel = f.costo ? COSTO_LABEL[f.costo] : "";
  return `<div class="drug-card" data-drug-id="${f.id}">
    <div class="flex items-start justify-between gap-2">
      <h4 class="font-bold text-base text-slate-800 dark:text-white leading-tight">${f.name}</h4>
      ${costoLabel ? `<span class="text-[11px] font-black text-slate-400 shrink-0">${costoLabel}</span>` : ""}
    </div>
    <p class="text-sm text-slate-500 dark:text-slate-400 mt-1 leading-snug">${f.adv}</p>
  </div>`;
}

/**
 * EndoFarma: Grupo (tab) -> Subgrupo farmacológico (grp, en un menú
 * desplegable/acordeón) -> Fármaco.
 *
 * CORRECCIÓN (ampliación por Compendio 2026): con la base de datos ampliada
 * a ~80 fármacos, una lista plana de subgrupos siempre visibles se volvía
 * inmanejable para navegar (antidiabéticos e hipertensión superan los 25-30
 * fármacos cada uno). Cada subgrupo ahora es un menú desplegable colapsable
 * (ver toggle en main.js -> [data-toggle-pharma-group]) que arranca cerrado,
 * más un buscador (searchPharmaLib) que expande automáticamente solo los
 * subgrupos con resultados.
 */
export function renderPharmaLib(cat, tabEl, opts = {}) {
  const { expandAll = false, filterFn = null } = opts;
  if (tabEl) {
    document.querySelectorAll(".cat-tab").forEach((t) => t.classList.remove("active"));
    tabEl.classList.add("active");
    const searchEl = document.getElementById("pharmaSearchInput");
    if (searchEl) searchEl.value = "";
  }
  if (cat) currentPharmaCat = cat;
  const activeCat = cat || currentPharmaCat;

  const list = document.getElementById("listLibrary");
  if (!list) return;

  const drugs = DB_PHARMA.filter((d) => d.cat === activeCat && (!filterFn || filterFn(d)));
  const groups = {};
  drugs.forEach((f) => { (groups[f.grp] = groups[f.grp] || []).push(f); });

  const order = GROUP_ORDER[activeCat] || [];
  const orderedGroupNames = [...order.filter((g) => groups[g]), ...Object.keys(groups).filter((g) => !order.includes(g))];

  if (orderedGroupNames.length === 0) {
    list.innerHTML = `<p class="text-sm text-slate-400 text-center py-8">Ningún fármaco coincide con la búsqueda.</p>`;
    return;
  }

  list.innerHTML = orderedGroupNames.map((grp) => {
    const slug = slugifyGroup(activeCat, grp);
    const isOpen = expandAll;
    return `<div>
      <button type="button" data-toggle-pharma-group="${slug}" class="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all">
        <span class="text-xs font-black uppercase tracking-wide text-blue-600 dark:text-blue-400 text-left">${grp}</span>
        <span class="flex items-center gap-2 shrink-0">
          <span class="text-[10px] font-bold text-slate-400">${groups[grp].length}</span>
          <i data-lucide="chevron-down" class="w-3.5 h-3.5 text-slate-400 transition-transform" id="chev-${slug}" style="${isOpen ? "transform:rotate(180deg)" : ""}"></i>
        </span>
      </button>
      <div id="group-${slug}" class="space-y-2 pt-2 pb-1 px-0.5 ${isOpen ? "" : "hidden"}">
        ${groups[grp].map(buildDrugCardHTML).join("")}
      </div>
    </div>`;
  }).join("");

  if (typeof lucide !== "undefined") lucide.createIcons();
}

/** Alterna un subgrupo de EndoFarma entre colapsado/expandido (llamado desde
 * main.js vía delegación de eventos en [data-toggle-pharma-group]). */
export function togglePharmaGroup(slug) {
  const body = document.getElementById(`group-${slug}`);
  const chev = document.getElementById(`chev-${slug}`);
  if (!body) return;
  const nowHidden = body.classList.toggle("hidden");
  if (chev) chev.style.transform = nowHidden ? "" : "rotate(180deg)";
}

/** Buscador de EndoFarma: filtra por nombre dentro de la categoría activa y
 * expande automáticamente todos los subgrupos para que los resultados sean
 * visibles de inmediato (sin esto, un resultado dentro de un subgrupo
 * colapsado quedaría invisible aunque la búsqueda sí lo haya encontrado). */
export function searchPharmaLib(query) {
  const q = (query || "").trim().toLowerCase();
  if (!q) {
    renderPharmaLib(currentPharmaCat);
    return;
  }
  renderPharmaLib(currentPharmaCat, null, {
    expandAll: true,
    filterFn: (f) => f.name.toLowerCase().includes(q) || f.grp.toLowerCase().includes(q),
  });
}

/** Construye la lista de pasos de titulación relabeleados (Titulación Inicial, 2ª...) o "Dosis Fija". */
function buildTitulacionSteps(titr) {
  if (!titr || !titr.d || titr.d.length === 0) return null;
  const allEqual = titr.d.every((d) => d === titr.d[0]);
  if (allEqual || titr.d.length === 1) return { fija: true, dosis: titr.d[0] };
  const ordinales = ["Titulación Inicial", "2ª Titulación", "3ª Titulación", "4ª Titulación", "5ª Titulación"];
  const steps = titr.d.map((dosis, i) => ({
    label: ordinales[i] || `${i + 1}ª Titulación`,
    momento: titr.l[i] || "",
    dosis,
  }));
  return { fija: false, steps };
}

const HIPO_LABEL = { bajo: "Bajo", moderado: "Moderado", alto: "Alto" };
const HIPO_COLOR = { bajo: "emerald", moderado: "amber", alto: "red" };

/** Diagrama esquemático (desplegable) del mecanismo de acción, a partir de una
 * lista corta de pasos textuales (f.mecanismoPasos). No es una imagen fija por
 * fármaco (no se dispone de generador de imágenes) sino un flujo de pasos
 * generado en HTML/Tailwind, consistente con el resto de la app y reutilizable
 * para cualquier fármaco/grupo con solo definir su lista de pasos. */
function buildMoaDiagramHTML(pasos) {
  if (!pasos || !pasos.length) return "";
  return `<div class="space-y-1">
    ${pasos.map((paso, i) => `
      <div class="p-2.5 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-900/40 text-xs font-semibold text-indigo-700 dark:text-indigo-300 leading-snug">${paso}</div>
      ${i < pasos.length - 1 ? `<div class="flex justify-center"><i data-lucide="arrow-down" class="w-3.5 h-3.5 text-indigo-300 dark:text-indigo-700"></i></div>` : ""}
    `).join("")}
  </div>`;
}

/** Sección "Mecanismo Molecular / Fisiológico" — desplegable (<details>), solo
 * se muestra si el fármaco ya tiene el campo ampliado (mecanismoDetalle). Los
 * fármacos que aún no se han migrado a la ficha ampliada simplemente no
 * muestran esta sección (fallback seguro, sin romper la ficha existente). */
function buildMecanismoDetalleHTML(f) {
  if (!f.mecanismoDetalle) return "";
  return `<details class="rounded-xl border border-indigo-100 dark:border-indigo-900/40 overflow-hidden">
    <summary class="cursor-pointer select-none px-3 py-2.5 bg-indigo-50/60 dark:bg-indigo-900/10 flex items-center gap-2 text-[11px] font-black text-indigo-500 uppercase"><i data-lucide="dna" class="w-3.5 h-3.5"></i> Mecanismo Molecular / Fisiológico (detallado)</summary>
    <div class="p-3 space-y-3">
      <p class="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">${f.mecanismoDetalle}</p>
      ${buildMoaDiagramHTML(f.mecanismoPasos)}
    </div>
  </details>`;
}

/** Sección "Efectos Adversos" en listas (frecuentes / graves), solo si el
 * fármaco ya tiene el campo f.efectosAdversos. */
function buildEfectosAdversosHTML(f) {
  const ea = f.efectosAdversos;
  if (!ea || (!ea.frecuentes?.length && !ea.graves?.length)) return "";
  const buildList = (items, color) => items?.length ? `<ul class="space-y-1">
    ${items.map((it) => `<li class="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-300"><span class="mt-1.5 w-1 h-1 rounded-full bg-${color}-500 shrink-0"></span><span>${it}</span></li>`).join("")}
  </ul>` : "";
  return `<div class="p-3 rounded-xl border border-slate-100 dark:border-slate-800 space-y-3">
    <p class="flex items-center gap-2 text-[11px] font-black text-slate-500 dark:text-slate-400 uppercase"><i data-lucide="alert-triangle" class="w-3.5 h-3.5"></i> Efectos Adversos</p>
    ${ea.frecuentes?.length ? `<div><p class="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase mb-1">Frecuentes</p>${buildList(ea.frecuentes, "amber")}</div>` : ""}
    ${ea.graves?.length ? `<div><p class="text-[10px] font-bold text-rose-600 dark:text-rose-400 uppercase mb-1">Raros / Graves</p>${buildList(ea.graves, "rose")}</div>` : ""}
  </div>`;
}

/** Sección "Contraindicaciones Detalladas" (condición + razón clínica), solo
 * si el fármaco ya tiene f.contraindicacionesDetalle. Distinta de `f.contra`
 * (códigos usados internamente por el motor de alertas de calculations.js). */
function buildContraindicacionesDetalleHTML(f) {
  const list = f.contraindicacionesDetalle;
  if (!list || !list.length) return "";
  return `<div class="p-3 rounded-xl bg-rose-50/60 dark:bg-rose-900/10 border border-rose-100 dark:border-rose-900/30 space-y-2">
    <p class="flex items-center gap-2 text-[11px] font-black text-rose-500 uppercase"><i data-lucide="shield-x" class="w-3.5 h-3.5"></i> Contraindicaciones Detalladas</p>
    ${list.map((c) => `<div class="flex items-start justify-between gap-3 text-xs">
      <span class="font-bold text-slate-700 dark:text-slate-200">${c.condicion}</span>
      <span class="text-slate-400 text-right">${c.razon}</span>
    </div>`).join("")}
  </div>`;
}

/** Sección "Monitoreo" en lista (parámetro + frecuencia), solo si el fármaco
 * ya tiene f.monitoreo. */
function buildMonitoreoHTML(f) {
  const list = f.monitoreo;
  if (!list || !list.length) return "";
  return `<div class="p-3 rounded-xl border border-slate-100 dark:border-slate-800 space-y-2">
    <p class="flex items-center gap-2 text-[11px] font-black text-slate-500 dark:text-slate-400 uppercase"><i data-lucide="clipboard-check" class="w-3.5 h-3.5"></i> Monitoreo</p>
    ${list.map((m) => `<div class="text-xs">
      <span class="font-bold text-slate-700 dark:text-slate-200">${m.parametro}</span>
      <p class="text-slate-400 mt-0.5 leading-snug">${m.frecuencia}</p>
    </div>`).join("")}
  </div>`;
}

/** Sección "Educación al Paciente" en lenguaje simple, solo si el fármaco ya
 * tiene f.educacionPaciente. */
function buildEducacionPacienteHTML(f) {
  const ep = f.educacionPaciente;
  if (!ep) return "";
  const rows = [
    ["¿Qué es?", ep.queEs],
    ["¿Cómo tomarla?", ep.comoTomarlo],
    ["Si olvida una dosis", ep.siOlvidaDosis],
  ].filter(([, v]) => v);
  return `<div class="p-3 rounded-xl bg-violet-50/60 dark:bg-violet-900/10 border border-violet-100 dark:border-violet-900/30 space-y-2">
    <p class="flex items-center gap-2 text-[11px] font-black text-violet-500 uppercase"><i data-lucide="heart-handshake" class="w-3.5 h-3.5"></i> Educación al Paciente</p>
    ${rows.map(([label, val]) => `<p class="text-xs text-slate-600 dark:text-slate-300"><b class="text-violet-600 dark:text-violet-300">${label}:</b> ${val}</p>`).join("")}
    ${ep.senalesAlarma?.length ? `<div class="pt-1">
      <p class="text-[10px] font-bold text-violet-600 dark:text-violet-300 uppercase mb-1">Cuándo buscar ayuda</p>
      <ul class="space-y-1">${ep.senalesAlarma.map((s) => `<li class="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-300"><span class="mt-1.5 w-1 h-1 rounded-full bg-violet-500 shrink-0"></span><span>${s}</span></li>`).join("")}</ul>
    </div>` : ""}
  </div>`;
}

/** Leyenda de fuentes al final de la ficha, solo si el fármaco ya tiene
 * f.fuentes. */
function buildFuentesHTML(f) {
  const list = f.fuentes;
  if (!list || !list.length) return "";
  return `<div class="pt-2 border-t border-slate-100 dark:border-slate-800">
    <p class="text-[9px] font-bold text-slate-400 uppercase mb-1">Fuentes</p>
    <ul class="space-y-0.5">${list.map((s) => `<li class="text-[9.5px] text-slate-400 leading-snug">${s.texto}</li>`).join("")}</ul>
  </div>`;
}

// Color de la curva PK/PD por categoría — mismos colores ya usados en
// Medicación Actual (antidiabetic=emerald, htn=rose, lipid=purple,
// obesity=fuchsia) para que el fármaco se vea consistente en toda la app.
// "otros" (AINE/litio/antipsicótico/TARV, 10-ago-2026) no es navegable
// desde EndoFarma (ver CATEGORIA_ORDER más abajo) pero se incluye el color
// por si acaso.
const PK_CURVE_COLOR = { antidiabetic: "#10b981", htn: "#e11d48", lipid: "#9333ea", obesity: "#d946ef", otros: "#6366f1" };

export function showPharmaDetail(id, cardEl) {
  document.querySelectorAll(".drug-card").forEach((c) => c.classList.remove("active"));
  if (cardEl) cardEl.classList.add("active");
  const f = DB_PHARMA.find((x) => x.id === id);
  if (!f) return;
  const panel = document.getElementById("pharmaDetailPanel");
  if (!panel) return;

  const benefLabels = { ic: "IC", erc: "ERC", ascvd: "ASCVD", stroke: "Stroke/TIA", masld: "MASLD" };
  const benefChips = f.benef
    ? Object.entries(f.benef).filter(([, v]) => v).map(([k]) => `<span class="text-[10px] font-bold px-2 py-1 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 rounded">${benefLabels[k] || k}</span>`).join("")
    : "";
  const costoLabel = f.costo ? COSTO_LABEL[f.costo] : "";
  const hipoColor = HIPO_COLOR[f.hipo] || "slate";

  // --- 5. Titulación en función de semanas + relación con HbA1c ---
  const tit = buildTitulacionSteps(f.titr);
  let titulacionHtml = "";
  if (tit) {
    if (tit.fija) {
      titulacionHtml = `<div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800 flex items-center justify-between">
        <span class="text-sm font-bold text-slate-700 dark:text-slate-200">Dosis Fija</span>
        <span class="font-data font-bold text-slate-800 dark:text-white">${tit.dosis} ${typeof f.ini === "string" && f.ini.match(/[a-zA-Z%]+/) ? f.ini.match(/[a-zA-Z%\/]+.*/)[0] : ""}</span>
      </div>`;
    } else {
      titulacionHtml = `<div class="space-y-2">${tit.steps.map((s) => `
        <div class="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800">
          <div>
            <span class="text-xs font-bold text-slate-700 dark:text-slate-200">${s.label}</span>
            <span class="text-[10px] text-slate-400 ml-1">(${s.momento})</span>
          </div>
          <span class="font-data font-bold text-blue-600 dark:text-blue-400 text-sm">${s.dosis}</span>
        </div>`).join("")}</div>`;
    }
  }
  const reduccionHtml = f.reduccionA1c ? `<p class="text-[11px] text-slate-400 mt-2">Reducción esperada de HbA1c en monoterapia: <b class="text-slate-600 dark:text-slate-300">${f.reduccionA1c}</b></p>` : "";

  panel.innerHTML = `<div class="w-full text-left space-y-4">
    <!-- 1 y 2: Nombre y Grupo -->
    <div class="flex items-center justify-between"><h2 class="text-xl font-black text-blue-600 dark:text-blue-400">${f.name}</h2><span class="text-[10px] font-bold px-2 py-1 bg-slate-100 dark:bg-slate-700 rounded uppercase text-slate-500">${f.grp}</span></div>

    <!-- 3: Mecanismo de acción -->
    <div class="p-3 rounded-xl bg-blue-50/60 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30">
      <p class="flex items-center gap-2 text-[11px] font-black text-blue-500 uppercase mb-1"><i data-lucide="dna" class="w-3.5 h-3.5"></i> Mecanismo de Acción</p>
      <p class="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">${f.mecanismo || "No especificado."}</p>
    </div>

    <p class="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">${f.adv}</p>
    ${benefChips ? `<div class="flex flex-wrap gap-1">${benefChips}</div>` : ""}

    <!-- 3b: Mecanismo molecular/fisiológico detallado, desplegable (REDISEÑO 16-ago-2026) -->
    ${buildMecanismoDetalleHTML(f)}

    <!-- 4: Curva PK/PD 24h (Dr. Ortega, 10/11-ago-2026; gauge de vida media
    retirado el 16-ago-2026 a petición del Dr. Ortega — la curva ya proyecta
    la duración real sobre 24h con forma exacta, el gauge lineal era redundante) -->
    <div class="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800">
      <div class="flex items-center justify-between mb-2">
        <span class="flex items-center gap-2 text-[11px] font-black text-indigo-500 uppercase"><i data-lucide="activity" class="w-3.5 h-3.5"></i> Curva PK/PD (24 h)</span>
        <span class="flex items-center gap-2 text-[10px] font-bold text-slate-400">${f.vidaMediaLabel ? `<span class="text-indigo-600 dark:text-indigo-400 font-data">t½ ${f.vidaMediaLabel}</span> · ` : ""}${archetypeLabel(f)}</span>
      </div>
      <div class="h-32"><canvas id="pharmaPkChart"></canvas></div>
      <p class="text-[9px] text-slate-400 mt-1.5">Modelo de un compartimento (ecuación de Bateman) a partir de la vida media documentada — forma representativa por tipo de formulación, no una concentración plasmática medida.</p>
    </div>

    <!-- 5: Titulación -->
    <div>
      <p class="flex items-center gap-2 text-[11px] font-black text-slate-500 dark:text-slate-400 uppercase mb-2"><i data-lucide="list-ordered" class="w-3.5 h-3.5"></i> Titulación</p>
      ${titulacionHtml}
      ${reduccionHtml}
    </div>

    <div class="grid grid-cols-2 gap-3">
      <!-- 6: Hipoglucemia (riesgo del fármaco por sí solo) -->
      <div class="p-3 rounded-xl bg-${hipoColor}-50 dark:bg-${hipoColor}-900/20 border border-${hipoColor}-100 dark:border-${hipoColor}-900/40">
        <span class="text-[10px] font-bold text-${hipoColor}-600 dark:text-${hipoColor}-400 uppercase block">Riesgo de Hipoglucemia<br/><span class="normal-case font-normal opacity-70">(fármaco por sí solo)</span></span>
        <span class="font-bold text-${hipoColor}-700 dark:text-${hipoColor}-300">${HIPO_LABEL[f.hipo] || "--"}</span>
      </div>
      ${costoLabel ? `<div class="p-3 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-800"><span class="text-[10px] font-bold text-slate-400 uppercase block">Costo</span><span class="font-bold text-slate-800 dark:text-white">${costoLabel}</span></div>` : ""}
    </div>

    <!-- REDISEÑO (16-ago-2026, a petición del Dr. Ortega): efectos adversos en
    listas, contraindicaciones detalladas, monitoreo y educación al paciente.
    Cada bloque se auto-oculta si el fármaco aún no tiene el campo (piloto:
    solo Metformina por ahora). -->
    ${buildEfectosAdversosHTML(f)}
    ${buildContraindicacionesDetalleHTML(f)}
    ${buildMonitoreoHTML(f)}
    ${buildEducacionPacienteHTML(f)}

    <button data-add-rx-id="${f.id}" class="w-full py-3 bg-gradient-to-r from-blue-600 to-sky-500 text-white font-bold rounded-xl shadow-lg hover:shadow-xl hover:shadow-blue-300/50 dark:hover:shadow-blue-950/40 hover:-translate-y-0.5 transition-all duration-200">AGREGAR A ENDONOTE</button>

    ${buildFuentesHTML(f)}
  </div>`;
  if (typeof lucide !== "undefined") lucide.createIcons();
  renderPharmaPKChart("pharmaPkChart", buildPKCurve(f), PK_CURVE_COLOR[f.cat] || "#3b82f6");
}

/* CORRECCIÓN (12-ago-2026, hallazgo al revisar el color del badge): el
 * criterio previo (`label.includes("ALTO") ? rojo : verde`) pintaba
 * MODERADO y LIMITROFE en el mismo verde que BAJO — un riesgo intermedio
 * se veía visualmente idéntico a "todo bien". Se agrega el mapa completo
 * de las 5 zonas reales que devuelve classifyLipidRisk. */
const LIPID_ZONE_STYLE = {
  "MUY ALTO": { badge: "bg-red-600 text-white", border: "border-red-300 dark:border-red-800/60", grad: "from-red-50/80 dark:from-red-950/30" },
  "ALTO": { badge: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-300", border: "border-red-200 dark:border-red-800/60", grad: "from-red-50/70 dark:from-red-950/20" },
  "MODERADO": { badge: "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300", border: "border-amber-200 dark:border-amber-800/60", grad: "from-amber-50/70 dark:from-amber-950/20" },
  "LIMITROFE": { badge: "bg-amber-50 text-amber-500 dark:bg-amber-900/20 dark:text-amber-400", border: "border-amber-200 dark:border-amber-800/60", grad: "from-amber-50/60 dark:from-amber-950/10" },
  "BAJO": { badge: "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300", border: "border-emerald-200 dark:border-emerald-800/60", grad: "from-emerald-50/70 dark:from-emerald-950/20" },
};

export function renderLipids(p) {
  const { label, target } = calc.classifyLipidRisk(p);
  const zone = LIPID_ZONE_STYLE[label] || LIPID_ZONE_STYLE.BAJO;
  const badge = document.getElementById("lipidRiskBadge");
  if (badge) {
    badge.innerText = "RIESGO " + label;
    badge.className = `px-4 py-2 rounded-lg font-black text-sm uppercase tracking-wide ${zone.badge}`;
  }
  const hero = document.getElementById("lipidHeroCard");
  if (hero) {
    hero.className = `rounded-2xl border p-6 bg-gradient-to-br ${zone.grad} to-white dark:to-slate-900 ${zone.border} transition-all duration-300`;
  }
  setText("curLDL", p.ldl || "--");
  setText("tarLDL", target);

  const gapBar = document.getElementById("ldlGapBar");
  const marker = document.getElementById("ldlGoalMarker");
  if (gapBar && marker) {
    const ldl = calc.v(p.ldl);
    gapBar.style.width = Math.min(100, (ldl / 200) * 100) + "%";
    marker.style.left = Math.min(100, (target / 200) * 100) + "%";
    gapBar.className = ldl <= target ? "h-full bg-emerald-500 transition-all duration-1000" : "h-full bg-red-500 transition-all duration-1000";
  }

  setText("valNonHDL", calc.calcNonHDL(p) ?? "--");
  setText("valApoB", calc.calcApoBEst(p) ?? "--");
  setText("valTri", p.trigliceridos || "--");
}

export function renderNutrition(p, deficit = 500) {
  setText("finalTMB", calc.calcTMB(p) + " kcal");
  setText("valGET", calc.calcGET(p) + " kcal");
  updateWeightChart(p, deficit);
}

export function updateWeightChart(p, deficit) {
  setText("deficitVal", deficit);
  const { labels, data } = calc.projectWeightLoss(p, deficit);
  renderWeightProjectionChart(labels, data);
}

/* Colores de "zona" por categoría AHA/ACC 2025 (mismo criterio que
 * classifyBP en calculations.js) — se reutilizan aquí para pintar tanto el
 * badge como la tarjeta hero completa del mismo color de riesgo, a
 * petición del Dr. Ortega ("que la tabla de metas y riesgo esté del color
 * correspondiente"). */
const BP_ZONE_STYLE = {
  "CRISIS HIPERTENSIVA": { border: "border-red-300 dark:border-red-800/60", grad: "from-red-50/80 dark:from-red-950/30" },
  "HTA ETAPA 2": { border: "border-red-200 dark:border-red-800/60", grad: "from-red-50/70 dark:from-red-950/20" },
  "HTA ETAPA 1": { border: "border-orange-200 dark:border-orange-800/60", grad: "from-orange-50/70 dark:from-orange-950/20" },
  "ELEVADA": { border: "border-amber-200 dark:border-amber-800/60", grad: "from-amber-50/70 dark:from-amber-950/20" },
  "NORMAL": { border: "border-emerald-200 dark:border-emerald-800/60", grad: "from-emerald-50/70 dark:from-emerald-950/20" },
};

export function renderPressure(p) {
  const { label, color } = calc.classifyBP(p);
  const badge = document.getElementById("bpBadge");
  if (badge) {
    badge.innerText = label;
    badge.className = `px-6 py-3 rounded-full font-black text-white ${color} shadow-lg text-lg`;
  }
  const hero = document.getElementById("bpHeroCard");
  if (hero) {
    const zone = BP_ZONE_STYLE[label] || BP_ZONE_STYLE.NORMAL;
    hero.className = `rounded-2xl border p-6 text-center bg-gradient-to-br ${zone.grad} to-white dark:to-slate-900 ${zone.border} transition-all duration-300`;
  }
  setText("curBP", p.tas && p.tad ? `${p.tas}/${p.tad}` : "--/--");
  setText("valBPCategoria", label);
  const pam = calc.calcPAM(p);
  setText("valPAM_New", pam !== null ? pam + " mmHg" : "--");
}

/** Recalcula y pinta TODAS las vistas del dashboard. Llamar solo cuando `p` cambia. */
export function renderAll(p) {
  updatePatientHeader(p);
  renderGlobalStrat(p);
  renderGoals(p);
  renderManagement(p);
  renderLipids(p);
  renderNutrition(p);
  renderPressure(p);
  renderScreening(p); // EndoScreen — ver js/screening.js, sección independiente
  renderDiagnostics(p); // EndoDiagnostics — ver js/diagnostics.js, sección independiente
}
