/* --- ENDOSCREEN: Tamizaje de complicaciones crónicas de diabetes ---
 * Sección nueva, independiente (a petición del Dr. Ortega, 10-ago-2026),
 * al mismo nivel jerárquico que EndoFarma — NO modifica calculations.js,
 * individualization.js ni render.js de forma sustantiva (solo un import +
 * una línea en renderAll, ver render.js). Objetivo explícito: no tocar el
 * resto del motor.
 *
 * FUENTE CLÍNICA (verificada, no inventada — ver expediente técnico):
 * ADA Standards of Care in Diabetes — 2026, Sección 12 (Retinopathy,
 * Neuropathy, and Foot Care) y Sección 11 (Chronic Kidney Disease):
 *   - DM2: tamizaje de retinopatía, nefropatía (UACR + eGFR) y neuropatía
 *     periférica AL MOMENTO DEL DIAGNÓSTICO, luego anual.
 *   - DM1: los mismos 3 tamizajes inician A LOS 5 AÑOS del diagnóstico
 *     (fase silente mucho más corta que en DM2; la guía reconoce que un
 *     DM1 recién diagnosticado casi nunca tiene complicaciones aún
 *     establecidas), luego anual.
 *   - Pie diabético: examen visual en cada consulta + examen integral
 *     ANUAL para todos los pacientes con diabetes desde el diagnóstico
 *     (no aplica la regla de 5 años); cada 3-6 meses (aquí: 6) si el
 *     paciente es de alto riesgo (neuropatía periférica, EAP, deformidad,
 *     o úlcera/amputación previa).
 *   - Riesgo cardiovascular / perfil lipídico: al diagnóstico, luego
 *     periódico (aquí: anual, guía permite hasta 24 meses en bajo riesgo).
 *
 * IMPORTANTE — corrección clínica comunicada al Dr. Ortega: la regla de
 * "X años con diabetes dispara el tamizaje" que se pidió inicialmente es
 * la regla de DM1, NO de DM2 (en DM2 el tamizaje siempre inicia al
 * diagnóstico). Por eso `aplicaDesdeAnios` es 5 solo para DM1 y 0 para
 * cualquier otro caso (DM2/Prediabetes).
 *
 * ALCANCE HONESTO: este módulo indica CUÁNDO corresponde el tamizaje según
 * la guía, no sustituye el registro médico de que el examen se realizó.
 * Por eso cada tarjeta permite capturar la fecha del último tamizaje
 * (opcional) — sin esa fecha, el estado es "corresponde realizar" en vez
 * de "atrasado", porque no hay evidencia de que nunca se haya hecho.
 */

import { getPatient, updateScreeningLog, updateScreeningNote } from "./state.js";

const MS_DIA = 24 * 3600 * 1000;
const MS_ANIO = 365.25 * MS_DIA;
const MS_MES = 30.44 * MS_DIA;

function hoy() {
  return new Date();
}

function parseFecha(str) {
  if (!str) return null;
  const d = new Date(str + "T00:00:00");
  return isNaN(d.getTime()) ? null : d;
}

/** Años transcurridos con diabetes, priorizando fecha exacta de diagnóstico
 * sobre "años aproximados" (decisión del Dr. Ortega, 10-ago-2026: "fecha
 * exacta + años aprox., recomendado" — la fecha nunca se desactualiza). */
export function getAniosConDM(p) {
  const fecha = parseFecha(p.fechaDxDM);
  if (fecha) {
    const anios = (hoy() - fecha) / MS_ANIO;
    return anios >= 0 ? Math.round(anios * 10) / 10 : 0;
  }
  const aprox = p.aniosDxDM;
  if (aprox !== "" && aprox !== undefined && aprox !== null && !isNaN(aprox)) {
    return Number(aprox);
  }
  return null;
}

/**
 * Calcula el estado de un ítem de tamizaje individual.
 * Estados posibles:
 *   "sin_dato"            -> no se capturó tipo de diabetes / duración.
 *   "no_indicado"         -> aún no corresponde (regla de 5 años, DM1).
 *   "indicado_sin_registro" -> corresponde, pero no hay fecha de último
 *                              tamizaje capturada (no es "atrasado": no
 *                              hay evidencia de que nunca se hizo).
 *   "al_dia"               -> hay fecha reciente, dentro del intervalo.
 *   "atrasado"              -> hay fecha, pero superó el intervalo.
 */
function computeItemStatus({ aplicaDesdeAnios, aniosDM, ultimaFecha, intervaloMeses }) {
  if (aniosDM === null) return { estado: "sin_dato" };
  if (aniosDM < aplicaDesdeAnios) {
    return { estado: "no_indicado", faltanAnios: Math.round((aplicaDesdeAnios - aniosDM) * 10) / 10 };
  }
  const fecha = parseFecha(ultimaFecha);
  if (!fecha) return { estado: "indicado_sin_registro" };
  const mesesDesde = (hoy() - fecha) / MS_MES;
  if (mesesDesde > intervaloMeses) {
    return { estado: "atrasado", mesesAtraso: Math.round(mesesDesde - intervaloMeses) };
  }
  return { estado: "al_dia", proximoEnMeses: Math.max(0, Math.round(intervaloMeses - mesesDesde)) };
}

const FUENTE_5_ANIOS = "ADA Standards of Care 2026 — inicia a los 5 años del diagnóstico en Diabetes Mellitus Tipo I (fase silente corta), luego anual.";
const FUENTE_AL_DX = "ADA Standards of Care 2026 — inicia AL DIAGNÓSTICO en Diabetes Mellitus Tipo II, luego anual.";

/** Lógica pura (sin DOM) — testeable directamente. */
export function computeScreeningItems(p) {
  const tipoDM = p.tipoDM || "";
  const aniosDM = getAniosConDM(p);
  const esDM1 = tipoDM === "DM1";
  const umbralComplicMicro = esDM1 ? 5 : 0;
  const log = p.screeningLog || {};

  const altoRiesgoPie = (p.comorbilidades || []).some((c) => c === "NEUROPATIA_PERIFERICA" || c === "PIE_ALTO_RIESGO" || c === "EAP");

  const items = [
    {
      key: "retinopatia",
      nombre: "Retinopatía Diabética",
      icono: "eye",
      color: "sky",
      fuente: esDM1 ? FUENTE_5_ANIOS : FUENTE_AL_DX,
      ...computeItemStatus({ aplicaDesdeAnios: umbralComplicMicro, aniosDM, ultimaFecha: log.retinopatia, intervaloMeses: 12 }),
    },
    {
      key: "nefropatia",
      nombre: "Nefropatía Diabética",
      icono: "droplets",
      color: "cyan",
      fuente: esDM1 ? FUENTE_5_ANIOS : FUENTE_AL_DX,
      ...computeItemStatus({ aplicaDesdeAnios: umbralComplicMicro, aniosDM, ultimaFecha: log.nefropatia, intervaloMeses: 12 }),
    },
    {
      key: "neuropatia",
      nombre: "Neuropatía Periférica",
      icono: "zap",
      color: "violet",
      fuente: esDM1 ? FUENTE_5_ANIOS : FUENTE_AL_DX,
      ...computeItemStatus({ aplicaDesdeAnios: umbralComplicMicro, aniosDM, ultimaFecha: log.neuropatia, intervaloMeses: 12 }),
    },
    {
      key: "pie",
      nombre: "Pie Diabético",
      icono: "footprints",
      color: "amber",
      fuente: `ADA Standards of Care 2026 — examen integral ANUAL para todos desde el diagnóstico (no aplica regla de 5 años); cada 6 meses si alto riesgo.${altoRiesgoPie ? " Paciente marcado como ALTO RIESGO." : ""}`,
      ...computeItemStatus({ aplicaDesdeAnios: 0, aniosDM, ultimaFecha: log.pie, intervaloMeses: altoRiesgoPie ? 6 : 12 }),
    },
    {
      key: "riesgoCV",
      nombre: "Riesgo Cardiovascular",
      icono: "heart-pulse",
      color: "rose",
      fuente: "ADA Standards of Care 2026 — perfil lipídico y riesgo CV al diagnóstico, luego periódico (anual si en tratamiento o LDL fuera de meta).",
      ...computeItemStatus({ aplicaDesdeAnios: 0, aniosDM, ultimaFecha: log.riesgoCV, intervaloMeses: 12 }),
    },
  ];

  return { tipoDM, aniosDM, altoRiesgoPie, items };
}

/* ==================== RENDER (DOM) ==================== */

const ESTADO_UI = {
  sin_dato: { badge: "Sin datos", cls: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400", dot: "bg-slate-300" },
  no_indicado: { badge: "Aún no indicado", cls: "bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300", dot: "bg-blue-400" },
  indicado_sin_registro: { badge: "Corresponde realizar", cls: "bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300", dot: "bg-amber-400" },
  al_dia: { badge: "Al día", cls: "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300", dot: "bg-emerald-500" },
  atrasado: { badge: "Atrasado", cls: "bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-300", dot: "bg-red-500" },
};

function detalleTexto(item) {
  switch (item.estado) {
    case "sin_dato":
      return "Captura el tipo de diabetes y la fecha de diagnóstico en Ingreso Clínico.";
    case "no_indicado":
      return `Faltan ~${item.faltanAnios} años para el primer tamizaje (regla Tipo I: 5 años).`;
    case "indicado_sin_registro":
      return "Ya corresponde según guía — sin fecha de último tamizaje registrada.";
    case "al_dia":
      return item.proximoEnMeses > 0 ? `Próximo control en ~${item.proximoEnMeses} meses.` : "Próximo control: este mes.";
    case "atrasado":
      return `Atrasado ~${item.mesesAtraso} ${item.mesesAtraso === 1 ? "mes" : "meses"} sobre el intervalo de guía.`;
    default:
      return "";
  }
}

function buildTimelineHTML(tipoDM, aniosDM) {
  if (aniosDM === null) return "";
  const esDM1 = tipoDM === "DM1";
  const umbral = esDM1 ? 5 : 0;
  const escalaMax = Math.max(aniosDM, umbral, 5) * 1.15;
  const pctPaciente = Math.min(100, (aniosDM / escalaMax) * 100);
  const pctUmbral = esDM1 ? Math.min(100, (umbral / escalaMax) * 100) : null;
  return `
    <div class="mt-4">
      <div class="relative h-2.5 w-full bg-white/10 rounded-full overflow-hidden">
        <div class="absolute inset-y-0 left-0 bg-gradient-to-r from-cyan-400 to-sky-500" style="width:${pctPaciente}%"></div>
        ${pctUmbral !== null ? `<div class="absolute -top-1 w-0.5 h-4 bg-white/70" style="left:${pctUmbral}%" title="Umbral Diabetes Mellitus Tipo I (5 años)"></div>` : ""}
        <div class="absolute -top-1.5 w-3 h-5 bg-white rounded shadow" style="left:calc(${pctPaciente}% - 6px)"></div>
      </div>
      <div class="flex justify-between text-[9px] font-bold text-white/40 uppercase mt-1">
        <span>Diagnóstico</span>
        ${esDM1 ? `<span>5 años (umbral Tipo I)</span>` : ""}
        <span>Hoy — ${aniosDM} años</span>
      </div>
    </div>`;
}

function buildCardHTML(item) {
  const ui = ESTADO_UI[item.estado] || ESTADO_UI.sin_dato;
  return `<div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 hover:shadow-lg hover:shadow-${item.color}-200/50 dark:hover:shadow-${item.color}-950/30 hover:border-${item.color}-300 dark:hover:border-${item.color}-700 hover:-translate-y-0.5 transition-all duration-200">
    <div class="flex items-start justify-between gap-2 mb-2">
      <div class="flex items-center gap-2.5 min-w-0">
        <div class="w-9 h-9 rounded-xl bg-gradient-to-br from-${item.color}-100 to-${item.color}-50 dark:from-${item.color}-900/40 dark:to-${item.color}-900/20 flex items-center justify-center shrink-0">
          <i data-lucide="${item.icono}" class="w-4.5 h-4.5 text-${item.color}-600 dark:text-${item.color}-400"></i>
        </div>
        <h4 class="font-bold text-sm text-slate-800 dark:text-white leading-tight">${item.nombre}</h4>
      </div>
      <span class="shrink-0 flex items-center gap-1.5 text-[10px] font-black uppercase px-2 py-1 rounded-full ${ui.cls}">
        <span class="w-1.5 h-1.5 rounded-full ${ui.dot}"></span>${ui.badge}
      </span>
    </div>
    <p class="text-xs text-slate-500 dark:text-slate-400 mb-3">${detalleTexto(item)}</p>
    <div class="flex items-center gap-2 mb-2">
      <label class="text-[10px] font-bold text-slate-400 uppercase shrink-0">Último tamizaje:</label>
      <input type="date" data-screening-date="${item.key}"
        class="flex-1 px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs focus:outline-none focus:ring-2 focus:ring-${item.color}-400" />
    </div>
    <div class="mb-3">
      <label class="text-[10px] font-bold text-slate-400 uppercase shrink-0 block mb-1">Descripción / hallazgos <span class="normal-case font-normal text-slate-400">(si se realizó en esta consulta)</span></label>
      <textarea data-screening-note="${item.key}" rows="2" placeholder="Ej. fondo de ojo sin retinopatía, ITB normal, sensibilidad conservada..."
        class="w-full px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs focus:outline-none focus:ring-2 focus:ring-${item.color}-400"></textarea>
    </div>
    <p class="text-[10px] text-slate-400 leading-relaxed border-t border-slate-100 dark:border-slate-800 pt-2">${item.fuente}</p>
  </div>`;
}

/* SIMPLIFICADO (12-ago-2026, a petición del Dr. Ortega): la versión previa
 * de este recuadro se veía sobrecargada — dos tarjetas con párrafos largos
 * repitiendo casi el mismo texto. Se redujo a una sola tira compacta con la
 * cita a la guía (ADA Standards of Care 2026) al frente y el contraste
 * Tipo I vs. Tipo II en una sola línea por cada uno. */
const REFERENCIA_DM1_DM2 = `
  <div class="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 p-4">
    <p class="flex items-center gap-2 text-[11px] font-black text-slate-500 dark:text-slate-400 uppercase mb-2.5"><i data-lucide="book-open-check" class="w-3.5 h-3.5"></i> ADA Standards of Care 2026</p>
    <div class="space-y-1.5 text-xs text-slate-500 dark:text-slate-400">
      <p class="flex items-start gap-2"><span class="font-black text-indigo-600 dark:text-indigo-400 shrink-0">Tipo I —</span> primer tamizaje a los 5 años del diagnóstico, luego anual.</p>
      <p class="flex items-start gap-2"><span class="font-black text-cyan-600 dark:text-cyan-400 shrink-0">Tipo II —</span> tamizaje al momento del diagnóstico, luego anual.</p>
      <p class="flex items-start gap-2"><span class="font-black text-amber-600 dark:text-amber-400 shrink-0">Pie diabético —</span> anual desde el diagnóstico en ambos tipos (no aplica la regla de 5 años).</p>
    </div>
  </div>`;

function buildEmptyStateHTML() {
  return `<div class="text-center py-16">
    <i data-lucide="shield-check" class="w-10 h-10 mx-auto mb-3 text-slate-300 dark:text-slate-700"></i>
    <p class="font-bold text-slate-500 dark:text-slate-400">Sin antecedente diabetológico capturado</p>
    <p class="text-xs text-slate-400 mt-1 max-w-md mx-auto">Ve a Ingreso Clínico → Comorbilidades → "Antecedente Diabetológico" y captura el tipo de diabetes y la fecha (o años aproximados) de diagnóstico para activar el calendario de tamizaje.</p>
  </div>
  ${REFERENCIA_DM1_DM2}`;
}

/** Redibuja TODO #screeningRoot a partir del paciente actual. Se llama desde
 * render.renderAll() (paciente cambia) y desde el propio handler de
 * "último tamizaje" en main.js (re-render local, mismo patrón que rx.js). */
export function renderScreening(p) {
  const root = document.getElementById("screeningRoot");
  if (!root) return;

  const { tipoDM, aniosDM, items } = computeScreeningItems(p || {});

  if (aniosDM === null) {
    root.innerHTML = buildEmptyStateHTML();
    if (typeof lucide !== "undefined") lucide.createIcons();
    return;
  }

  const tipoLabel = { DM1: "Diabetes Mellitus Tipo I", DM2: "Diabetes Mellitus Tipo II", Prediabetes: "Prediabetes" }[tipoDM] || "Sin tipo especificado";
  const tipoBadgeColor = tipoDM === "DM1" ? "indigo" : tipoDM === "DM2" ? "cyan" : "slate";

  root.innerHTML = `
    <div class="bg-gradient-to-br from-slate-900 to-slate-800 dark:from-slate-950 dark:to-black rounded-2xl border border-slate-700/50 p-6 shadow-lg">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p class="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Calendario de Tamizaje — ${p.nombre || "Paciente"}</p>
          <div class="flex items-center gap-3 mt-1">
            <span class="text-lg font-black text-white">${tipoLabel}</span>
            <span class="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase bg-${tipoBadgeColor}-500/20 text-${tipoBadgeColor}-300">${aniosDM} años de evolución</span>
          </div>
        </div>
        <i data-lucide="shield-check" class="w-9 h-9 text-cyan-400/70"></i>
      </div>
      ${buildTimelineHTML(tipoDM, aniosDM)}
    </div>

    <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
      ${items.map(buildCardHTML).join("")}
    </div>

    <div class="mt-6">${REFERENCIA_DM1_DM2}</div>
  `;

  // Precarga las fechas de "último tamizaje" ya guardadas (screeningLog) sin
  // pisar lo que el médico esté escribiendo — igual que rx.js hace con la
  // prescripción libre.
  const log = p.screeningLog || {};
  Object.keys(log).forEach((key) => {
    const input = root.querySelector(`[data-screening-date="${key}"]`);
    if (input && document.activeElement !== input) input.value = log[key] || "";
  });
  const notes = p.screeningNotes || {};
  Object.keys(notes).forEach((key) => {
    const textarea = root.querySelector(`[data-screening-note="${key}"]`);
    if (textarea && document.activeElement !== textarea) textarea.value = notes[key] || "";
  });

  if (typeof lucide !== "undefined") lucide.createIcons();
}

/** Handler de conveniencia para el listener de "change" en main.js. */
export function onScreeningDateChange(category, value) {
  updateScreeningLog(category, value);
  renderScreening(getPatient());
}

/** Handler para la descripción/hallazgos de cada ítem (12-ago-2026, a
 * petición del Dr. Ortega — que el médico pueda documentar lo encontrado
 * si el tamizaje se realiza en la misma consulta, exportable al expediente).
 * Usa "input" en main.js (no "change") para no perder texto al perder foco
 * antes de terminar de escribir, y NO redibuja todo el panel (evita perder
 * el cursor mientras se escribe) — solo persiste. */
export function onScreeningNoteChange(category, value) {
  updateScreeningNote(category, value);
}
