/* --- CURVAS FARMACOCINÉTICAS (PK/PD) DE 24 HORAS, ENDOFARMA ---
 * A petición del Dr. Ortega (10-ago-2026, imagen de referencia de curvas de
 * insulina — human insulin/lispro/NPH/premezcla/glargina/detemir): quiere
 * que la gráfica de cada fármaco muestre su comportamiento en sangre a lo
 * largo de las 24 horas del día, con la forma real (pico marcado vs. acción
 * plana prolongada), no los pasos de titulación de dosis que se mostraban
 * antes.
 *
 * ALCANCE CONFIRMADO CON EL DR. ORTEGA (11-ago-2026, tras pregunta directa):
 * "por clase/grupo farmacológico" — NO se investigó el Tmax/vida media
 * exacto de cada uno de los ~65 fármacos del catálogo publicado en
 * literatura primaria (eso habría requerido varias sesiones). En su lugar:
 *
 *  1. La vida media de eliminación (`vidaMediaHoras`) YA es un dato real,
 *     documentado y citado por fármaco en pharma-db.js desde el inicio del
 *     proyecto — NO es nuevo, no se inventó nada aquí. Se usa para derivar
 *     la constante de eliminación ke = ln(2) / vidaMediaHoras.
 *  2. La forma de la curva (qué tan marcado es el pico vs. qué tan plana es
 *     la meseta) se modela con la ecuación de Bateman — el modelo
 *     farmacocinético estándar de un compartimento con absorción de primer
 *     orden — usando una razón ka/ke característica por ARQUETIPO de
 *     formulación (insulina rápida, insulina basal plana, oral de liberación
 *     inmediata, oral de liberación prolongada, inyectable semanal, etc.),
 *     no por fármaco individual. Esa razón SÍ es una simplificación
 *     deliberada (no es "el Tmax exacto medido" de cada fármaco) — se
 *     documenta así explícitamente, en vez de presentarla como precisión que
 *     no se tiene.
 *  3. Para los 3 casos donde el propio catálogo YA describe explícitamente
 *     un comportamiento cualitativo distinto dentro del mismo grupo
 *     ("Insulina Basal" mezcla NPH -pico marcado documentado en su `adv`-
 *     con Glargina/Degludec/Detemir -descritas como "sin pico pronunciado"
 *     en la literatura de insulinas basales modernas-), se usa un override
 *     por `id` en vez de por `grp`, para no aplanar una diferencia clínica
 *     real y ya documentada en el propio archivo.
 *
 * Fórmula (Bateman, normalizada a pico=100 para graficar sin unidades,
 * igual que el eje Y sin escala de la imagen de referencia):
 *   C(t) ∝ e^(-ke·t) − e^(-ka·t)          (ka ≠ ke)
 *   C(t) ∝ t · e^(-ke·t)                  (caso límite ka → ke — así es,
 *                                           matemáticamente, como este mismo
 *                                           modelo estándar predice la curva
 *                                           casi plana de una insulina basal
 *                                           "sin pico": cuando la absorción
 *                                           es casi tan lenta como la
 *                                           eliminación, el pico se
 *                                           difumina — no es un caso
 *                                           especial inventado, es el
 *                                           comportamiento matemático normal
 *                                           de Bateman en ese límite)
 *
 * LÍMITE: esto es una visualización EDUCATIVA de la forma esperada de la
 * curva por tipo de formulación, no una curva de concentración plasmática
 * medida ni individualizada al paciente — no se usa en ningún cálculo de
 * dosis del motor (calculations.js no importa este archivo).
 */

// Razón ka/ke por arquetipo de formulación (no por grupo farmacológico
// exacto de pharma-db.js — varios grupos comparten arquetipo).
const KA_KE_RATIO = {
  insulina_rapida: 9, // Lispro/Aspart/Regular — pico marcado y corto
  insulina_intermedia: 3, // NPH — pico presente pero más ancho (4-8h)
  insulina_plana: 1.15, // Glargina/Degludec/Detemir — "sin pico pronunciado"
  meglitinida: 6, // acción rápida y corta preprandial (ya descrito así en adv)
  sulfonilurea: 4,
  oral_estandar: 3.2, // biguanidas, iSGLT2, iDPP-4, TZD, AINE, antipsicóticos, litio, TARV, la mayoría de antihipertensivos/estatinas
  oral_local: 5, // AGI (acarbosa/miglitol) — acción local, absorción sistémica mínima pero pico rápido posprandial
  inyectable_diario: 3, // GLP-1 RA diario (liraglutida), setmelanotida
  inyectable_semanal: 1.3, // GLP-1/GIP RA semanal, PCSK9i siRNA — vidaMediaHoras ya es tan grande (120-168h+) que 24h es una fracción mínima; casi plana de forma natural
  mab_prolongado: 1.2, // PCSK9i mAb (vida media de días-semanas)
};

const ARCHETYPE_BY_GRP = {
  "Insulina Prandial": "insulina_rapida",
  "Insulina Basal": "insulina_intermedia", // override por id abajo para Glargina/Degludec/Detemir
  Meglitinida: "meglitinida",
  Sulfonilurea: "sulfonilurea",
  AGI: "oral_local",
  "GLP-1 RA": "inyectable_semanal", // override por id abajo para las diarias (LIRA/LIRA3)
  "GIP/GLP-1 RA": "inyectable_semanal",
  "Agonista MC4R": "inyectable_diario",
  "PCSK9i (mAb)": "mab_prolongado",
  "PCSK9i (siRNA)": "inyectable_semanal",
};

// Overrides por fármaco específico — solo donde el propio pharma-db.js YA
// documenta (en `adv`/`vidaMediaLabel`) un comportamiento cualitativo
// distinto al resto de su grupo.
const ARCHETYPE_OVERRIDE_BY_ID = {
  GLAR: "insulina_plana",
  DEGLU: "insulina_plana",
  DETE: "insulina_plana", // vidaMediaLabel: "duración ~12-20 h" — más corta que Glargina/Degludec, pero clínicamente sigue clasificada como basal "sin pico marcado" (a diferencia de NPH)
  NPH: "insulina_intermedia",
  LIRA: "inyectable_diario",
  LIRA3: "inyectable_diario",
};

function archetypeFor(drug) {
  return ARCHETYPE_OVERRIDE_BY_ID[drug.id] || ARCHETYPE_BY_GRP[drug.grp] || "oral_estandar";
}

/**
 * Pura, testeable. Regresa 49 puntos {h, level} (cada 0.5 h, de 0 a 24),
 * `level` normalizado 0-100 (100 = pico de la curva).
 */
export function buildPKCurve(drug) {
  const halfLifeH = Number(drug?.vidaMediaHoras) > 0 ? Number(drug.vidaMediaHoras) : 4;
  const ke = Math.LN2 / halfLifeH;
  const ratio = KA_KE_RATIO[archetypeFor(drug)] || KA_KE_RATIO.oral_estandar;
  const ka = ke * ratio;

  const raw = [];
  for (let h = 0; h <= 24; h += 0.5) {
    let level;
    if (Math.abs(ka - ke) < 1e-9) {
      level = h * Math.exp(-ke * h);
    } else {
      level = (Math.exp(-ke * h) - Math.exp(-ka * h)) * (ka / (ka - ke));
    }
    raw.push({ h, level: Math.max(0, level) });
  }
  const peak = Math.max(...raw.map((p) => p.level)) || 1;
  return raw.map((p) => ({ h: p.h, level: Math.round((p.level / peak) * 1000) / 10 }));
}

/** Solo para mostrar en la UI qué arquetipo se usó (transparencia con el
 * médico, evita que la curva se vea como si fuera un dato medido). */
export function archetypeLabel(drug) {
  const labels = {
    insulina_rapida: "Insulina de acción rápida — pico marcado y corto",
    insulina_intermedia: "Insulina de acción intermedia — pico presente (~4-8 h)",
    insulina_plana: "Insulina basal — sin pico pronunciado, acción prolongada",
    meglitinida: "Acción rápida preprandial",
    sulfonilurea: "Acción oral moderada",
    oral_estandar: "Acción oral estándar",
    oral_local: "Acción local, pico posprandial rápido",
    inyectable_diario: "Inyectable diario",
    inyectable_semanal: "Inyectable/acción prolongada (días-semanas)",
    mab_prolongado: "Anticuerpo monoclonal — acción muy prolongada",
  };
  return labels[archetypeFor(drug)] || "Acción oral estándar";
}
