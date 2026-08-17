/* --- REGISTRO DE PRECISIÓN (investigación) ---
 * (16-ago-2026, a petición del Dr. Ortega: "de esa manera estamos
 * advirtiendo del posible error, y a manera de investigación posteriormente
 * que deberemos hacer también, son datos medibles que nos ayudarán para
 * evaluar nuestra app")
 *
 * Cada vez que el médico pasa de Ingreso Clínico al Dashboard (procesar(),
 * ver onSubmitForm en main.js), se registra QUÉ campos de precisión ALTO
 * (PRECISION_FIELDS en precision-compass.js) seguían vacíos en ese momento.
 *
 * SIN PHI, a propósito: no se guarda nombre, fecha de nacimiento, ni ningún
 * valor clínico crudo — solo IDs de campo (ej. "uacr", "ldl"), un
 * timestamp, y si Modo Rápido estaba activo. Todo vive en localStorage,
 * nunca sale del navegador salvo que el propio médico exporte el CSV.
 *
 * PROPÓSITO (explícitamente de investigación, no clínico): con el tiempo
 * esto convierte la clasificación ALTO/MEDIO/BAJO de la auditoría de
 * precisión (hoy basada en lectura de código) en algo verificable con datos
 * reales de uso — qué campos se omiten más en la práctica. El siguiente
 * paso natural (fuera de alcance aquí: depende de la clave única de
 * paciente que se está desarrollando por aparte) sería comparar el plan de
 * tratamiento antes/después de que un campo omitido se complete en una
 * consulta posterior del MISMO paciente, para medir el impacto real de cada
 * dato, no solo el potencial. Este log queda listo para conectarse a esa
 * clave única después — por ahora `sessionId` es lo único disponible para
 * agrupar registros, y es deliberadamente anónimo (aleatorio por sesión de
 * navegador, no por paciente ni por médico).
 */
import { computeMissingPrecisionFields } from "./precision-compass.js";

const LOG_KEY = "endoped_precision_log";
const SESSION_KEY = "endoped_precision_session_id";

function getSessionId() {
  let id = sessionStorage.getItem(SESSION_KEY);
  if (!id) {
    id = `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    sessionStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

function readLog() {
  try {
    const raw = JSON.parse(localStorage.getItem(LOG_KEY) || "[]");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function writeLog(entries) {
  localStorage.setItem(LOG_KEY, JSON.stringify(entries));
}

/**
 * Registra un snapshot de campos ALTO vacíos al pasar a resultados. No
 * agrega nada al log si no falta ningún campo ALTO — un registro solo tiene
 * valor de investigación cuando SÍ hubo algo omitido; una consulta completa
 * no necesita dejar rastro.
 */
export function logPrecisionSnapshot(doc = document) {
  const missing = computeMissingPrecisionFields(doc);
  if (missing.length === 0) return null;
  const entry = {
    timestamp: new Date().toISOString(),
    sessionId: getSessionId(),
    quickModeActive: !!doc.getElementById("admissionForm")?.classList.contains("quick-mode"),
    missingCount: missing.length,
    missingFields: missing.map((f) => f.field).join(";"),
  };
  const entries = readLog();
  entries.push(entry);
  writeLog(entries);
  return entry;
}

export function getPrecisionLog() {
  return readLog();
}

export function clearPrecisionLog() {
  localStorage.removeItem(LOG_KEY);
}

/** Exporta el log completo a CSV y dispara la descarga — formato simple,
 * abrible directamente en Excel/Sheets para análisis posterior. */
export function exportPrecisionLogCSV() {
  const entries = readLog();
  if (entries.length === 0) {
    alert("Todavía no hay registros de precisión que exportar — se genera uno cada vez que se pasa a Dashboard con algún dato de alto impacto sin capturar.");
    return;
  }
  const header = "timestamp,sessionId,quickModeActive,missingCount,missingFields";
  const rows = entries.map((e) =>
    [e.timestamp, e.sessionId, e.quickModeActive, e.missingCount, `"${e.missingFields}"`].join(",")
  );
  const csv = [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `nexora_registro_precision_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
