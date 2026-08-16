/* --- BARRA DE PROGRESO: Ingreso Clínico (11-ago-2026, a petición del Dr.
 * Ortega) ---
 * Heurística de "sección completa":
 *  - Secciones 1-4 (con valores numéricos/texto): se consideran completas
 *    cuando sus campos "núcleo" tienen algo capturado. No exigimos TODOS
 *    los campos de la sección porque muchos son explícitamente opcionales
 *    (ver limpieza de textos de aviso "opcional"/"si aplica") — solo los
 *    mínimos clínicamente indispensables de esa sección.
 *  - Secciones 5-7 (solo checkboxes: Comorbilidades, Antecedentes
 *    Familiares, Medicación Actual): "nada marcado" es una respuesta
 *    clínica válida (paciente sano, sin antecedentes, sin fármacos), así
 *    que no podemos exigir que algo esté marcado para contarla como
 *    completa. En su lugar la contamos como "revisada" la primera vez que
 *    el usuario la abre (toggleSection le pone data-visited="1" al abrir
 *    — ver navigation.js).
 */

const SECTION_CORE_FIELDS = {
  1: ["nombre", "sexo", "fecha_nacimiento"],
  2: ["peso", "talla", "tas", "tad"],
  3: ["actividad", "fumador"],
  4: ["glucosa", "hba1c", "creatinina"],
};

const CHECKBOX_SECTIONS = [5, 6, 7];

function fieldHasValue(id) {
  const el = document.getElementById(id);
  if (!el) return false;
  if (el.tagName === "SELECT") return el.value !== "";
  return el.value != null && el.value.trim() !== "";
}

function sectionComplete(n) {
  if (CHECKBOX_SECTIONS.includes(n)) {
    return document.getElementById(`body-section-${n}`)?.dataset.visited === "1";
  }
  const fields = SECTION_CORE_FIELDS[n] || [];
  return fields.length > 0 && fields.every(fieldHasValue);
}

/** Recalcula y pinta la barra. Se llama con cada input/change del
 * formulario y cada vez que se abre una sección por primera vez. */
export function renderIngresoProgress() {
  const bar = document.getElementById("ingresoProgressBar");
  const label = document.getElementById("ingresoProgressLabel");
  if (!bar || !label) return;

  let completed = 0;
  for (let i = 1; i <= 7; i++) if (sectionComplete(i)) completed++;
  const pct = Math.round((completed / 7) * 100);

  bar.style.width = pct + "%";
  label.innerText = `${completed} de 7 secciones · ${pct}%`;
}

/** Se llama una vez al cargar la página. Engancha el recálculo a
 * cualquier input/change dentro del formulario de Ingreso Clínico. */
export function initIngresoProgress() {
  const form = document.getElementById("admissionForm");
  if (!form) return;
  form.addEventListener("input", renderIngresoProgress);
  form.addEventListener("change", renderIngresoProgress);
  renderIngresoProgress();
}

/** Se llama desde onClearForm (main.js) para reiniciar el estado
 * "revisada" de las secciones 5-7 junto con el resto del formulario. */
export function resetIngresoProgress() {
  CHECKBOX_SECTIONS.forEach((n) => {
    const body = document.getElementById(`body-section-${n}`);
    if (body) delete body.dataset.visited;
  });
  renderIngresoProgress();
}
