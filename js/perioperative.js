/* --- CAPA 2: SEGURIDAD PERIOPERATORIA (casos 40-41) ---
 * Casos de borde propuestos por el Dr. Ortega (10-ago-2026, ronda de 20
 * casos 38-57). Ambos casos comparten la misma estructura: un fármaco que es
 * seguro y beneficioso en consulta externa se vuelve un riesgo agudo
 * específico en el contexto de una cirugía/procedimiento programado, y el
 * motor ambulatorio no tenía forma de saberlo porque no capturaba fecha de
 * cirugía.
 *
 * Caso 40 — iSGLT2 + cirugía próxima: riesgo de Cetoacidosis Diabética
 *   Euglucémica (CAD-e) perioperatoria — el estrés quirúrgico/ayuno puede
 *   desencadenar cetosis con glucosa normal o solo levemente elevada,
 *   fácil de pasar por alto si no se piensa en ello explícitamente. FDA
 *   (2020, actualización de etiquetado) y guías de anestesia (ADA
 *   Standards of Care 2026, sección perioperatoria) recomiendan suspender
 *   iSGLT2 al menos 3 días antes de cirugía (4 días para agentes de
 *   eliminación más lenta, ej. ertugliflozina) — se usa el umbral
 *   conservador de 4 días para las 4 moléculas del catálogo por igual, sin
 *   diferenciar entre ellas (simplificación explícita).
 *
 * Caso 41 — GLP-1/GIP + procedimiento con sedación/anestesia: riesgo de
 *   aspiración pulmonar por vaciamiento gástrico retardado (mecanismo de
 *   acción de la clase). La guía de consenso ASA 2023 (American Society of
 *   Anesthesiologists) recomienda suspender el día del procedimiento si la
 *   dosis es diaria, o la semana completa (7 días) si la dosis es semanal
 *   — la enorme mayoría del catálogo de este proyecto en esta clase es de
 *   dosificación semanal (Semaglutida SC, Dulaglutida, Tirzepatida), así
 *   que se usa el umbral de 7 días de forma uniforme (simplificación
 *   explícita, documentada aquí).
 *
 * LÍMITE: al igual que redflags.js/geriatric.js, esto SOLO alerta y sugiere
 * suspensión temporal — no calcula un protocolo de puente/reinicio
 * perioperatorio (manejo de glucosa intrahospitalario), que es decisión del
 * equipo quirúrgico/anestesiología presencial.
 */

const SGLT2_HOLD_DAYS = 4;
const INCRETIN_HOLD_DAYS = 7;
const INCRETIN_GROUPS = new Set(["GLP-1 RA", "GIP/GLP-1 RA"]);

/**
 * Recibe el paciente y el `state` de medicación antidiabética ya calculado
 * por getMedicationState(p, "antidiabetic"). Regresa un arreglo (0-2
 * elementos) de alertas de suspensión perioperatoria.
 */
export function checkPerioperativeSafety(p, state) {
  if (!p?.cirugiaProgramada) return [];
  const dias = Number(p?.diasCirugia);
  if (!(dias >= 0)) return []; // sin fecha capturada -> no se puede evaluar la ventana

  const alerts = [];

  const sglt2Entries = state.entries.filter((e) => e.drug.grp === "iSGLT2");
  if (sglt2Entries.length > 0 && dias <= SGLT2_HOLD_DAYS) {
    const names = sglt2Entries.map((e) => e.drug.name).join(", ");
    alerts.push({
      id: "PERIOP_SGLT2_SUSPEND",
      drugs: sglt2Entries.map((e) => e.drug.id),
      drugLabel: names,
      reason: `Cirugía programada en ${dias} día(s) — SUSPENDER iSGLT2 (${names}): riesgo de Cetoacidosis Diabética Euglucémica perioperatoria (glucosa puede verse normal). Guías perioperatorias (FDA/ADA Standards of Care 2026) recomiendan suspender al menos 3-4 días antes de cirugía.`,
    });
  }

  const incretinEntries = state.entries.filter((e) => INCRETIN_GROUPS.has(e.drug.grp));
  if (incretinEntries.length > 0 && dias <= INCRETIN_HOLD_DAYS) {
    const names = incretinEntries.map((e) => e.drug.name).join(", ");
    alerts.push({
      id: "PERIOP_INCRETIN_SUSPEND",
      drugs: incretinEntries.map((e) => e.drug.id),
      drugLabel: names,
      reason: `Procedimiento con sedación/anestesia en ${dias} día(s) — SUSPENDER agonista GLP-1/GIP (${names}): riesgo de aspiración pulmonar por vaciamiento gástrico retardado. Consenso ASA 2023: suspender el día del procedimiento si es dosis diaria, o la semana completa antes si es dosis semanal.`,
    });
  }

  return alerts;
}
