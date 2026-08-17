/* --- ESTADO DEL PACIENTE Y SESIÓN ---
 * Único punto de verdad para `p`. Nada fuera de este módulo debe
 * mutar el paciente directamente: usa setPatient()/clearPatient().
 */

const STORAGE_KEY = "endoped_data";
const SESSION_TIMEOUT_MS = 2 * 60 * 60 * 1000; // 2 horas

let patient = {};
const listeners = new Set();

export function getPatient() {
  return patient;
}

export function setPatient(newPatient) {
  patient = newPatient;
  persist();
  notify();
}

export function clearPatient() {
  patient = {};
  localStorage.removeItem(STORAGE_KEY);
  notify();
}

/** Suscribirse a cambios del paciente (para refrescar UI reactivamente). */
export function onPatientChange(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

/**
 * EndoScreen: registra la fecha del último tamizaje realizado para una
 * complicación ("retinopatia" | "nefropatia" | "neuropatia" | "pie" |
 * "riesgoCV"). Deliberadamente NO llama a notify() — igual que
 * rx.js/setDoseAt, es un cambio local que screening.js redibuja por su
 * cuenta (ver renderScreening), sin disparar el renderAll completo del
 * resto del dashboard. Sí se persiste, para que sobreviva a un refresh.
 */
export function updateScreeningLog(category, dateValue) {
  if (!patient.screeningLog) patient.screeningLog = {};
  patient.screeningLog[category] = dateValue;
  persist();
}

/**
 * EndoScreen (12-ago-2026, a petición del Dr. Ortega): descripción/hallazgos
 * libres por ítem de tamizaje, para documentar lo encontrado cuando la
 * evaluación se realiza en la misma consulta — exportable al expediente
 * (ver pdfExport.js). Mismo patrón que updateScreeningLog: no dispara
 * notify()/renderAll, solo persiste.
 */
export function updateScreeningNote(category, text) {
  if (!patient.screeningNotes) patient.screeningNotes = {};
  patient.screeningNotes[category] = text;
  persist();
}

function notify() {
  listeners.forEach((cb) => cb(patient));
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ data: patient, timestamp: Date.now() }));
}

/** Intenta restaurar una sesión previa vigente. Regresa true si restauró datos. */
export function restoreSession() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return false;
  try {
    const stored = JSON.parse(raw);
    const isValid = stored.data && (Date.now() - (stored.timestamp || 0) < SESSION_TIMEOUT_MS);
    if (isValid) {
      patient = stored.data;
      return true;
    }
  } catch (e) {
    console.error("Error al cargar sesión:", e);
  }
  localStorage.removeItem(STORAGE_KEY);
  return false;
}

/**
 * Lee las casillas de "Medicación Actual" (fármaco ya en uso + si ya está a
 * dosis máxima tolerada + dosis/frecuencia en texto libre, opcional) para
 * una categoría dada ("antidiabetic" | "htn" | "lipid").
 * Estructura resultante: [{ id: "AMLO", isMax: true, dosis: "10 mg c/24h" }, ...]
 * Ver core/calculations.js -> getMedicationState() para cómo se consume esto
 * (esa función SOLO usa id/isMax para el motor de decisión; `dosis` es
 * puramente informativa/documental — se muestra en Medicación Actual y en
 * el Expediente Completo, pero no altera ninguna clasificación ni filtro).
 */
function getMedicacionActual(doc, categoria) {
  const checks = Array.from(doc.querySelectorAll(`input[name="medActual_${categoria}"]:checked`));
  return checks.map((el) => ({
    id: el.value,
    isMax: !!doc.getElementById(`medActualMax_${categoria}_${el.value}`)?.checked,
    dosis: doc.getElementById(`medActualDosis_${categoria}_${el.value}`)?.value?.trim() || "",
  }));
}

// Secciones del acordeón de Ingreso Clínico donde "nada marcado" es una
// respuesta clínica válida (Comorbilidades/Antecedentes Familiares/
// Medicación Actual — ver ingreso-progress.js CHECKBOX_SECTIONS). Mapeo
// clave-del-paciente -> número de sección, usado tanto para leer como para
// restaurar el estado "revisada" (ver seccionesRevisadas más abajo).
const CHECKBOX_SECTION_MAP = { comorbilidades: 5, antecedentesFamiliares: 6, medicacionActual: 7 };

function sectionWasVisited(doc, n) {
  return doc.getElementById(`body-section-${n}`)?.dataset.visited === "1";
}

/** Lee todos los campos del formulario de ingreso y arma el objeto paciente. */
export function buildPatientFromForm(doc = document) {
  const getVal = (id) => doc.getElementById(id)?.value ?? "";
  const getNum = (id) => {
    const el = doc.getElementById(id);
    if (!el || el.value.trim() === "") return "";
    return parseFloat(el.value);
  };
  const getChecked = (name) =>
    Array.from(doc.querySelectorAll(`input[name="${name}"]:checked`)).map((el) => el.value);

  const actividad = getNum("actividad");

  return {
    // --- Ficha de Identificación ---
    nombre: getVal("nombre") || "Paciente",
    edad: getNum("edad"),
    sexo: getVal("sexo"),
    fecha_nacimiento: getVal("fecha_nacimiento"),
    telefono: getVal("telefono"),
    domicilio: getVal("domicilio"),
    // Estado de salud (≥65 años, Tabla 13.2 ADA 2026) + bajo riesgo/carga de
    // tratamiento (Rec. 6.4 ADA): alimentan getA1cTarget() en individualization.js.
    // Corrección de auditoría 8-ago-2026: estos campos NO existían antes en el
    // formulario, por lo que la meta de A1c individualizada por edad/complejidad
    // nunca reflejaba al paciente real (ver detalle en individualization.js).
    saludStatus: getVal("saludStatus") || "sano",
    bajoRiesgoTratamiento: !!doc.getElementById("bajoRiesgoTratamiento")?.checked,
    // --- Signos Vitales ---
    tas: getNum("tas"),
    tad: getNum("tad"),
    peso: getNum("peso"),
    talla: getNum("talla"),
    cintura: getNum("cintura"),
    cadera: getNum("cadera"),
    // --- Factores de Riesgo ---
    actividad: actividad === "" ? 1.2 : actividad,
    fumador: getVal("fumador"),
    cigarrillosDia: getNum("cigarrillosDia"),
    aniosFumando: getNum("aniosFumando"),
    dietaDesayuno: getVal("dietaDesayuno"),
    dietaComida: getVal("dietaComida"),
    dietaCena: getVal("dietaCena"),
    dietaColaciones: getVal("dietaColaciones"),
    alcoholTipo: getVal("alcoholTipo"),
    alcoholMlCustom: getNum("alcoholMlCustom"),
    alcoholPctCustom: getNum("alcoholPctCustom"),
    alcoholBebidasSemana: getNum("alcoholBebidasSemana"),
    // --- Laboratorios ---
    col_total: getNum("col_total"),
    hdl: getNum("hdl"),
    ldl: getNum("ldl"),
    vldl: getNum("vldl"),
    trigliceridos: getNum("trigliceridos"),
    creatinina: getNum("creatinina"),
    urea: getNum("urea"),
    glucosa: getNum("glucosa"), // Glucosa en AYUNO (ver js/insulin.js)
    hba1c: getNum("hba1c"), // HbA1c MEDIDA (ver calcHbA1cEstimada/getA1cEfectiva)
    // Triada de automonitoreo para EndoInsulin (js/insulin.js) — ayuno ya
    // existe arriba como `glucosa`; estos 3 completan nocturna/pre/pos.
    glucosaNocturna: getNum("glucosaNocturna"),
    glucosaPreprandial: getNum("glucosaPreprandial"),
    glucosaPosprandial: getNum("glucosaPosprandial"),
    insulina: getNum("insulina"),
    uacr: getNum("uacr"),
    // Riesgo PREVENT (AHA 2023/2025), ingresado manualmente por el médico
    // desde la calculadora oficial (heart.org/prevent, MDCalc) — ver
    // classifyLipidRisk/buildHTNPlan en calculations.js para la
    // justificación de por qué el motor no reimplementa la fórmula.
    preventAscvd10: getNum("preventAscvd10"),
    preventCvd10: getNum("preventCvd10"),
    sodio: getNum("sodio"),
    potasio: getNum("potasio"),
    calcio: getNum("calcio"),
    magnesio: getNum("magnesio"),
    fosforo: getNum("fosforo"),
    ast: getNum("ast"),
    alt: getNum("alt"),
    ggt: getNum("ggt"),
    plaquetas: getNum("plaquetas"),
    itb: getNum("itb"),
    hemoglobina: getNum("hemoglobina"),
    // eGFR ya NO se captura manualmente: se calcula siempre vía CKD-EPI 2021
    // (calcEGFR en core/calculations.js) a partir de creatinina + edad + sexo,
    // y se muestra en Estratificación Global.
    // --- Antecedente Diabetológico (EndoScreen: tamizaje de complicaciones
    // crónicas, DM1 vs DM2 — ver js/screening.js). Fecha de diagnóstico
    // preferida sobre años aproximados (Dr. Ortega, 10-ago-2026).
    tipoDM: getVal("tipoDM"),
    fechaDxDM: getVal("fechaDxDM"),
    aniosDxDM: getNum("aniosDxDM"),
    // --- Contexto Agudo/Perioperatorio (casos de borde 38-57, Dr. Ortega
    // 10-ago-2026 — ver js/redflags.js, js/individualization.js geriátrico,
    // y los guards nuevos en calculations.js/interactions.js). AINE/Litio/
    // Antipsicótico-alto-riesgo/TARV-potenciado YA NO se leen como banderas
    // aquí (10-ago-2026, corrección tras pregunta del Dr. Ortega sobre dónde
    // registrar CUÁL fármaco específico) — ahora son entradas de Medicación
    // Actual, categoría "otros" (ver getMedicacionActual abajo). ---
    sintomasOrtostaticos: !!doc.getElementById("sintomasOrtostaticos")?.checked,
    enfermedadAguda: !!doc.getElementById("enfermedadAguda")?.checked,
    cirugiaProgramada: !!doc.getElementById("cirugiaProgramada")?.checked,
    diasCirugia: getNum("diasCirugia"),
    corticoideDosis: getNum("corticoideDosis"),
    // --- Comorbilidades y Antecedentes Familiares (checkboxes de selección múltiple) ---
    comorbilidades: getChecked("comorbilidades"),
    antecedentesFamiliares: getChecked("antecedentesFamiliares"),
    // Registro de "último tamizaje realizado" por complicación (EndoScreen),
    // capturado directamente en esa vista (no en el formulario de ingreso) —
    // se preserva explícitamente aquí para que reenviar el formulario de
    // Ingreso Clínico (ej. al actualizar un dato) NO borre este registro.
    screeningLog: patient.screeningLog || {},
    screeningNotes: patient.screeningNotes || {},
    // Nivel de acceso económico del paciente ("bajo" | "medio" | "alto").
    // Alimenta el motor de decisión terapéutica (ver core/calculations.js)
    // para ponderar costo vs. beneficio clínico y maximizar el apego.
    nivelAcceso: getVal("nivelAcceso") || "medio",
    // --- Medicación Actual (fármaco ya en uso + dosis máxima tolerada) ---
    // Ausencia total = paciente "virgen" de tratamiento en esa categoría;
    // getMedicationState() en calculations.js maneja ese caso por defecto.
    medicacionActual: {
      antidiabetic: getMedicacionActual(doc, "antidiabetic"),
      htn: getMedicacionActual(doc, "htn"),
      lipid: getMedicacionActual(doc, "lipid"),
      // "obesity": categoría agregada junto con buildObesityPlan() en
      // calculations.js (auditoría de escalonamiento) — antes pharma-db.js
      // ya tenía estos fármacos (Fentermina, Orlistat, Semaglutida 2.4mg,
      // etc.) pero no había forma de registrar que un paciente YA estuviera
      // en uno de ellos, así que el motor los trataba como "virgen" siempre.
      obesity: getMedicacionActual(doc, "obesity"),
      // "otros": AINE/Litio/Antipsicótico alto riesgo/TARV potenciado
      // (10-ago-2026) — mismo patrón id/isMax/dosis que las demás categorías,
      // pero NINGÚN build*Plan la usa para recomendar un fármaco nuevo; solo
      // se lee para derivar flags de interacción (ver getPatientFlags en
      // calculations.js).
      otros: getMedicacionActual(doc, "otros"),
    },
    // --- Secciones revisadas (16-ago-2026, cierre de hueco de la auditoría
    // de precisión a petición del Dr. Ortega) ---
    // ingreso-progress.js/navigation.js ya sabían si el médico ABRIÓ las
    // secciones 5-7 (data-visited en el DOM), pero esa señal nunca llegaba
    // al objeto patient ni al motor de decisión (calculations.js): un
    // checklist vacío por "nunca se abrió esa sección" y uno vacío por
    // "se abrió, se revisó, nada aplica" producían exactamente el mismo
    // plan de tratamiento, sin ninguna distinción. Se persiste aquí para que
    // buildTreatmentPlan pueda advertir (reviewCautions, no bloqueante,
    // mismo principio de "permitir pero marcar" ya usado en
    // annotateRenalCaution) cuando genera un plan basado en una sección que
    // el médico nunca llegó a abrir.
    seccionesRevisadas: {
      comorbilidades: sectionWasVisited(doc, CHECKBOX_SECTION_MAP.comorbilidades),
      antecedentesFamiliares: sectionWasVisited(doc, CHECKBOX_SECTION_MAP.antecedentesFamiliares),
      medicacionActual: sectionWasVisited(doc, CHECKBOX_SECTION_MAP.medicacionActual),
    },
  };
}

/** Rellena el formulario de ingreso con los datos del paciente actual. */
export function populateForm(doc = document) {
  if (!patient.nombre) return;
  const fields = [
    "nombre", "edad", "sexo", "fecha_nacimiento", "telefono", "domicilio",
    "saludStatus",
    "tas", "tad", "peso", "talla", "cintura", "cadera", "actividad", "fumador",
    "cigarrillosDia", "aniosFumando", "dietaDesayuno", "dietaComida", "dietaCena",
    "dietaColaciones", "alcoholTipo", "alcoholMlCustom", "alcoholPctCustom", "alcoholBebidasSemana",
    "col_total", "hdl", "ldl", "vldl", "trigliceridos", "creatinina", "urea",
    "glucosa", "hba1c", "insulina", "uacr", "preventAscvd10", "preventCvd10",
    "glucosaNocturna", "glucosaPreprandial", "glucosaPosprandial",
    "sodio", "potasio", "calcio",
    "magnesio", "fosforo", "ast", "alt", "ggt", "plaquetas", "itb", "hemoglobina",
    "nivelAcceso",
    "tipoDM", "fechaDxDM", "aniosDxDM",
    "diasCirugia", "corticoideDosis",
  ];
  fields.forEach((f) => {
    const el = doc.getElementById(f);
    if (el) el.value = patient[f] !== undefined && patient[f] !== null ? patient[f] : "";
  });

  const checkGroup = (name, values) => {
    doc.querySelectorAll(`input[name="${name}"]`).forEach((el) => {
      el.checked = !!(values && values.includes(el.value));
    });
  };
  checkGroup("comorbilidades", patient.comorbilidades);
  checkGroup("antecedentesFamiliares", patient.antecedentesFamiliares);

  const bajoRiesgoEl = doc.getElementById("bajoRiesgoTratamiento");
  if (bajoRiesgoEl) bajoRiesgoEl.checked = !!patient.bajoRiesgoTratamiento;

  // Contexto Agudo/Perioperatorio (casos de borde 38-57) — mismo patrón
  // simple que bajoRiesgoTratamiento. AINE/Litio/Antipsicótico/TARV se
  // restauran más abajo junto con el resto de Medicación Actual.
  ["sintomasOrtostaticos", "enfermedadAguda", "cirugiaProgramada"].forEach((id) => {
    const el = doc.getElementById(id);
    if (el) el.checked = !!patient[id];
  });
  const diasCirugiaEl = doc.getElementById("diasCirugia");
  if (diasCirugiaEl) diasCirugiaEl.disabled = !patient.cirugiaProgramada;

  // Medicación actual: marca la casilla del fármaco, la de "dosis máxima" y
  // restaura el texto libre de dosis/frecuencia (mostrándolo ya desplegado
  // si tenía contenido, para no esconder un dato que el médico ya capturó).
  ["antidiabetic", "htn", "lipid", "obesity", "otros"].forEach((categoria) => {
    const entries = patient.medicacionActual?.[categoria] || [];
    doc.querySelectorAll(`input[name="medActual_${categoria}"]`).forEach((el) => {
      const entry = entries.find((e) => e.id === el.value);
      el.checked = !!entry;
      const maxEl = doc.getElementById(`medActualMax_${categoria}_${el.value}`);
      if (maxEl) {
        maxEl.checked = !!entry?.isMax;
        maxEl.disabled = !entry; // habilitada solo si el fármaco está marcado
      }
      const dosisEl = doc.getElementById(`medActualDosis_${categoria}_${el.value}`);
      if (dosisEl) {
        dosisEl.value = entry?.dosis || "";
        dosisEl.classList.toggle("hidden", !entry?.dosis);
      }
    });
  });

  // Restaura el estado "revisada" de las secciones 5-7 (ver seccionesRevisadas
  // en buildPatientFromForm) — sin esto, reabrir un paciente ya capturado
  // perdería la distinción "nunca revisada" vs "revisada, nada aplica" y
  // buildTreatmentPlan volvería a advertir de un hueco que en realidad ya
  // fue cerrado en una consulta anterior. No dispara renderIngresoProgress()
  // aquí — el llamador de populateForm ya redibuja todo el dashboard después.
  Object.entries(CHECKBOX_SECTION_MAP).forEach(([key, n]) => {
    const body = doc.getElementById(`body-section-${n}`);
    if (!body) return;
    if (patient.seccionesRevisadas?.[key]) body.dataset.visited = "1";
    else delete body.dataset.visited;
  });
}
