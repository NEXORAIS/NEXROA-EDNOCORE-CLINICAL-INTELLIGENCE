/* --- DATABASE UNIFICADA Y EXPANDIDA (V4.0) ---
 * Fuente: AACE Algorithm for Management of Adults With T2D — 2026 Update
 * (Endocrine Practice 32 (2026) 473–518), Algorithm Figs. 4, 5, 6, 7, 9, 10.
 * Vida media y mecanismo de acción: farmacología general (monografías/FDA labels).
 *
 * Campos:
 *  - mecanismo: mecanismo de acción, 1-2 frases.
 *  - vidaMediaHoras: vida media de eliminación aproximada, en HORAS (para graficar).
 *  - vidaMediaLabel: vida media en texto legible (ej. "~7 días").
 *  - reduccionA1c: reducción esperada de HbA1c con monoterapia (solo antidiabéticos/obesidad
 *    con efecto glucémico relevante; null si no aplica, ej. estatinas/antihipertensivos).
 *  - benef: { ic, erc, ascvd, stroke, masld } -> true si el fármaco tiene beneficio de
 *    desenlace PROBADO (no solo teórico) para esa comorbilidad, según AACE Fig. 9.
 *  - hipo: "bajo" | "moderado" | "alto"  -> riesgo de que el fármaco POR SÍ SOLO cause hipoglucemia.
 *  - peso: "perdida" | "neutro" | "ganancia" -> efecto sobre el peso.
 *  - costo: 1 ($) | 2 ($$) | 3 ($$$)  -> acceso/costo relativo.
 *  - egfrMin: eGFR mínimo (mL/min/1.73m²) para uso; null/0 = sin restricción relevante.
 *  - contra: array de códigos de comorbilidad/antecedente en los que está contraindicado.
 *  - titr: { l: [...etiquetas...], d: [...dosis...] }. Si todas las dosis son iguales,
 *    la UI muestra "Dosis Fija"; si no, se relabelan como "Titulación Inicial", "2ª...", etc.
 *  - efectoCurva (solo antidiabéticos/insulina): { peakReduction, baselineReduction,
 *    delayHoras } — modelo SIMPLIFICADO Y EDUCATIVO usado únicamente por el simulador
 *    EndoSimulators (sub-pestaña Glucosa) para contrastar visualmente "curva basal"
 *    vs. "curva con tratamiento actual" según el mecanismo de acción general de cada
 *    clase. NO es una predicción farmacocinética validada para el paciente individual.
 *      peakReduction: 0-1, fracción de reducción del pico posprandial (ej. 0.45 = 45% menos alto).
 *      baselineReduction: mg/dL de reducción de la glucosa basal/ayuno.
 *      delayHoras: cuánto retrasa el pico (ej. GLP-1/GIP y acarbosa, por enlentecer
 *      el vaciamiento gástrico o la absorción de carbohidratos).
 *  - efectoPA (solo antihipertensivos): { onsetHoras, picoHoras, duracionHoras,
 *    reduccionSistolica, reduccionDiastolica, tomasPorDia } — modelo SIMPLIFICADO Y
 *    EDUCATIVO análogo a efectoCurva, usado por EndoSimulators (sub-pestaña Presión
 *    Arterial) para proyectar cómo la hora de toma se relaciona con la cobertura
 *    antihipertensiva a lo largo de un día de 24 h. NO es una predicción
 *    farmacocinética validada para el paciente individual.
 *      onsetHoras: horas desde la toma hasta que el efecto empieza a notarse.
 *      picoHoras: horas desde la toma hasta el efecto máximo.
 *      duracionHoras: horas desde la toma hasta que el efecto se agota (ventana de
 *      cobertura VISIBLE para esta gráfica educativa — no es literalmente la vida
 *      media terminal, que ya vive por separado en vidaMediaHoras).
 *      reduccionSistolica/reduccionDiastolica: reducción máxima (mmHg) por toma.
 *      tomasPorDia: 1 (QD) o 2 (BID) — coincide con la frecuencia real de dosificación
 *      ya reflejada en `mant` (ej. Carvedilol "25 mg BID", Enalapril "20 mg BID").
 */
export const DB_PHARMA = [
  // ============ ANTIDIABÉTICOS ============
  { id: "MET", cat: "antidiabetic", grp: "Biguanidas", name: "Metformina", ini: "500 mg", mant: "2000 mg",
    adv: "Base de la terapia. Efectos GI; iniciar dosis baja y titular.",
    mecanismo: "Reduce la gluconeogénesis hepática y aumenta la sensibilidad periférica a la insulina; efecto incretina leve.",
    // REDISEÑO DE FICHA (16-ago-2026, a petición del Dr. Ortega): campos ampliados
    // para educación clínica + del paciente. Fuentes: Goodman & Gilman, Bases
    // Farmacológicas de la Terapéutica 13ª ed., cap. 47 (mecanismo/ADME/reacciones
    // adversas); FDA Prescribing Information — Metformin HCl (DailyMed); ADA
    // Standards of Care in Diabetes 2026 (monitoreo de B12). Piloto de la nueva
    // estructura antes de escalar al resto del catálogo (~80 fármacos).
    mecanismoDetalle: "Ejerce su acción principal en el hígado. Inhibe el Complejo I de la cadena respiratoria mitocondrial, lo que reduce el ATP intracelular y aumenta el AMP, activando la cinasa dependiente de AMP (AMPK). La AMPK activada estimula la oxidación de ácidos grasos, la captación de glucosa y el metabolismo no oxidativo de la glucosa, y reduce la lipogénesis y la gluconeogénesis. También inhibe la deshidrogenasa de glicerol-3-fosfato mitocondrial, alterando el estado redox celular y limitando la conversión de lactato/glicerol en glucosa; evidencia más reciente implica además la atenuación de los efectos del glucagón. La mayoría de los efectos son hepáticos, con poco efecto directo sobre la señalización de insulina o la captación periférica de glucosa (músculo esquelético, tejido adiposo). En estado normoglucémico no reduce mucho la glucosa ni estimula la secreción de insulina — por eso no causa hipoglucemia por sí sola.",
    mecanismoPasos: [
      "Metformina ingresa al hepatocito (transportador OCT1)",
      "Inhibe el Complejo I de la cadena respiratoria mitocondrial",
      "↓ ATP intracelular / ↑ AMP",
      "Activación de la cinasa dependiente de AMP (AMPK)",
      "↓ Gluconeogénesis hepática y ↓ lipogénesis",
      "↓ Producción hepática de glucosa (HGP) → ↓ glucemia",
    ],
    efectosAdversos: {
      frecuentes: [
        "Náusea, indigestión (10-25% — dosis-dependiente)",
        "Diarrea",
        "Dolor o cólico abdominal",
        "Pérdida de apetito",
      ],
      graves: [
        "Acidosis láctica (rara; ↑ riesgo con ERC avanzada, sepsis, IAM, ICC descompensada, hipoxia tisular o alcoholismo)",
        "Deficiencia de vitamina B12 (uso prolongado; reducción de 20-30% en niveles séricos)",
      ],
    },
    contraindicacionesDetalle: [
      { condicion: "eGFR < 30 mL/min/1.73m²", razon: "Acumulación del fármaco y mayor riesgo de acidosis láctica" },
      { condicion: "Acidosis metabólica aguda (incl. cetoacidosis diabética)", razon: "Riesgo de agravar la acidosis" },
      { condicion: "Enfermedad hepática extrema", razon: "Menor aclaramiento de lactato" },
      { condicion: "Insuficiencia cardiaca descompensada / hipoxia tisular", razon: "Mayor riesgo de acidosis láctica por mala perfusión" },
      { condicion: "Alcoholismo crónico", razon: "Potencia el riesgo de acidosis láctica" },
    ],
    monitoreo: [
      { parametro: "Función renal (eGFR)", frecuencia: "Basal y al menos 1 vez al año (más frecuente si eGFR reducida o riesgo de deterioro; suspender antes de estudios con contraste yodado)" },
      { parametro: "Vitamina B12 sérica", frecuencia: "Considerar basal; monitoreo periódico con uso prolongado — anual si >4-5 años de tratamiento, dosis ≥1500 mg/día, o factores de riesgo (anemia, neuropatía periférica, dieta vegana, cirugía gástrica previa). NOTA: la evidencia muestra caídas medibles de B12 desde el primer año de uso, pero el umbral de monitoreo ANUAL sistemático que citan ADA 2026 y la literatura es >4-5 años — no 6-12 meses; ver nota al Dr. Ortega en el chat." },
    ],
    educacionPaciente: {
      queEs: "Ayuda a que el cuerpo controle mejor el azúcar en la sangre; no provoca bajas de azúcar (hipoglucemia) por sí sola.",
      comoTomarlo: "Tomarla con alimentos para reducir molestias estomacales; se inicia con dosis baja y se aumenta gradualmente según indicación médica.",
      siOlvidaDosis: "Tomarla en cuanto se recuerde; si ya casi es hora de la siguiente dosis, omitir la olvidada — no duplicar.",
      senalesAlarma: [
        "Respiración rápida o dificultad para respirar",
        "Cansancio extremo o debilidad inusual",
        "Dolor muscular sin causa aparente",
        "Frío en manos o pies, latido cardiaco lento o irregular",
      ],
    },
    fuentes: [
      { texto: "Goodman & Gilman — Bases Farmacológicas de la Terapéutica, 13ª ed., cap. 47" },
      { texto: "FDA Prescribing Information — Metformin HCl (DailyMed)" },
      { texto: "ADA Standards of Care in Diabetes — 2026 (monitoreo de vitamina B12)" },
    ],
    vidaMediaHoras: 5, vidaMediaLabel: "~5 h", reduccionA1c: "1.0-1.5%",
    titr: { l: ["Inicio", "Sem 2", "Sem 4"], d: [500, 1000, 2000] },
    benef: { ic: false, erc: false, ascvd: false, stroke: false, masld: false },
    hipo: "bajo", peso: "neutro", costo: 1, egfrMin: 30, contra: [],
    efectoCurva: { peakReduction: 0.10, baselineReduction: 5, delayHoras: 0 } },

  { id: "DAPA", cat: "antidiabetic", grp: "iSGLT2", name: "Dapagliflozina", ini: "10 mg", mant: "10 mg",
    adv: "Beneficio probado en IC (HFrEF/HFpEF) y ERC. 1a línea si hay IC o ERC.",
    mecanismo: "Inhibe SGLT2 en el túbulo contorneado proximal renal, bloqueando la reabsorción de glucosa filtrada (glucosuria).",
    vidaMediaHoras: 13, vidaMediaLabel: "~13 h", reduccionA1c: "0.5-0.8%",
    titr: { l: ["Inicio", "Mes 1"], d: [10, 10] },
    benef: { ic: true, erc: true, ascvd: false, stroke: false, masld: true },
    // evid (11-ago-2026): fuerza de evidencia POR comorbilidad — "fuerte" =
    // ensayo dedicado de desenlace duro citado en `adv`; "clase" = beneficio
    // de clase/indirecto sin ensayo dedicado propio. Usado por el desempate
    // del algoritmo de cobertura máxima en buildAntidiabeticPlan para
    // preferir evidencia sobre costo/acceso entre candidatos con la misma
    // cobertura de comorbilidades.
    evid: { ic: "fuerte", erc: "fuerte", masld: "clase" },
    // REDISEÑO DE FICHA (16-ago-2026): ver nota completa en la entrada de
    // Metformina (id "MET") para metodología/fuentes. Grupo iSGLT2 — mecanismo,
    // ADME y reacciones adversas de clase tomados de Goodman & Gilman cap. 47;
    // riesgos específicos por fármaco (amputación/fractura en canagliflozina)
    // y umbrales eGFR de FDA Prescribing Information (DailyMed).
    mecanismoDetalle: "Inhibe el cotransportador SGLT2 en el túbulo contorneado proximal renal, responsable de ~90% de la reabsorción de glucosa filtrada. Al bloquearlo, reduce el umbral renal de excreción de glucosa (de ~180 a ~50 mg/dL), promoviendo glucosuria y con ello una pérdida calórica y de peso moderada. Es un mecanismo insulino-independiente: no estimula la secreción de insulina ni depende de la función de la célula β, por lo que no causa hipoglucemia por sí solo. Su eficacia depende de la filtración glomerular, por lo que la potencia disminuye 40-80% conforme cae el eGFR (ERC estadio 3). También favorece diuresis osmótica ligera (efecto natriurético) que contribuye al beneficio cardiorrenal observado en ensayos de desenlaces duros.",
    mecanismoPasos: [
      "Inhibición del cotransportador SGLT2 en túbulo proximal renal",
      "↓ Reabsorción tubular de glucosa filtrada",
      "↓ Umbral renal de excreción de glucosa (180 → ~50 mg/dL)",
      "Glucosuria + diuresis osmótica ligera",
      "↓ Glucemia + pérdida de peso + efecto natriurético/hemodinámico renal",
    ],
    efectosAdversos: {
      frecuentes: [
        "Infecciones micóticas genitales (3-5%)",
        "Infección de tracto urinario bajo (1-2%)",
        "Poliuria/depleción de volumen leve — riesgo de hipotensión, más en adultos mayores o con diuréticos",
      ],
      graves: [
        "Cetoacidosis diabética euglucémica (rara; glucosa puede estar solo levemente elevada — mantener sospecha clínica)",
        "Riesgo de fractura y posible efecto sobre metabolismo mineral/PTH (bajo estudio)",
      ],
    },
    monitoreo: [
      { parametro: "Función renal (eGFR)", frecuencia: "Basal y periódico — la eficacia glucémica cae con eGFR bajo, aunque el beneficio cardiorrenal se mantiene a eGFR más bajos" },
      { parametro: "Signos de depleción de volumen", frecuencia: "Vigilar en adultos mayores, uso concomitante de diuréticos, o enfermedad intercurrente" },
      { parametro: "Cetonas/estado ácido-base", frecuencia: "Ante náusea/vómito/malestar aunque la glucosa no esté muy elevada (sospecha de CAD euglucémica); suspender temporalmente en enfermedad aguda, ayuno prolongado o cirugía (regla de días de enfermedad)" },
    ],
    educacionPaciente: {
      queEs: "Ayuda a eliminar azúcar extra por la orina; suele acompañarse de pérdida de peso y beneficia al corazón y al riñón.",
      comoTomarlo: "Una vez al día, con o sin alimentos, de preferencia en la mañana (por el efecto diurético leve).",
      siOlvidaDosis: "Tomarla en cuanto se recuerde ese mismo día; si ya es casi hora de la siguiente, omitir la olvidada — no duplicar.",
      senalesAlarma: [
        "Comezón, ardor o flujo genital inusual (posible infección micótica)",
        "Ardor al orinar o necesidad urgente de orinar (posible infección urinaria)",
        "Náusea, vómito, dolor abdominal o cansancio extremo — puede ser cetoacidosis aunque el azúcar no esté muy alta: buscar atención",
        "Mareo o desmayo al levantarse (posible baja de presión)",
      ],
    },
    contraindicacionesDetalle: [
      { condicion: "eGFR < 25 mL/min/1.73m² (dapagliflozina)", razon: "Pérdida de eficacia glucémica y datos limitados de seguridad" },
      { condicion: "Diabetes tipo 1", razon: "No indicado; mayor riesgo de cetoacidosis euglucémica" },
      { condicion: "Depleción de volumen no corregida", razon: "El efecto diurético osmótico puede agravar la hipotensión" },
      { condicion: "Infecciones genitourinarias recurrentes activas", razon: "La glucosuria favorece el crecimiento micótico/bacteriano" },
    ],
    fuentes: [
      { texto: "Goodman & Gilman — Bases Farmacológicas de la Terapéutica, 13ª ed., cap. 47" },
      { texto: "FDA Prescribing Information (DailyMed) — por fármaco" },
      { texto: "AACE Algorithm for Management of Adults With T2D — 2026 Update" },
    ],
    hipo: "bajo", peso: "perdida", costo: 3, egfrMin: 25, contra: ["EMBARAZO"],
    efectoCurva: { peakReduction: 0.12, baselineReduction: 10, delayHoras: 0 } },

  { id: "EMPA", cat: "antidiabetic", grp: "iSGLT2", name: "Empagliflozina", ini: "10 mg", mant: "25 mg",
    adv: "Beneficio probado en IC, ERC y reducción de muerte CV en ASCVD establecida.",
    mecanismo: "Inhibe SGLT2 renal, reduciendo la reabsorción tubular de glucosa y favoreciendo su excreción urinaria.",
    vidaMediaHoras: 12, vidaMediaLabel: "~12 h", reduccionA1c: "0.6-0.9%",
    titr: { l: ["Inicio", "Mes 1"], d: [10, 25] },
    benef: { ic: true, erc: true, ascvd: true, stroke: false, masld: true },
    evid: { ic: "fuerte", erc: "fuerte", ascvd: "fuerte", masld: "clase" },
    mecanismoDetalle: "Inhibe el cotransportador SGLT2 en el túbulo contorneado proximal renal, responsable de ~90% de la reabsorción de glucosa filtrada. Al bloquearlo, reduce el umbral renal de excreción de glucosa (de ~180 a ~50 mg/dL), promoviendo glucosuria y con ello una pérdida calórica y de peso moderada. Es un mecanismo insulino-independiente: no estimula la secreción de insulina ni depende de la función de la célula β, por lo que no causa hipoglucemia por sí solo. Su eficacia depende de la filtración glomerular, por lo que la potencia disminuye 40-80% conforme cae el eGFR (ERC estadio 3). Empagliflozina cuenta con el ensayo dedicado de reducción de mortalidad CV en ASCVD establecida (EMPA-REG OUTCOME).",
    mecanismoPasos: [
      "Inhibición del cotransportador SGLT2 en túbulo proximal renal",
      "↓ Reabsorción tubular de glucosa filtrada",
      "↓ Umbral renal de excreción de glucosa (180 → ~50 mg/dL)",
      "Glucosuria + diuresis osmótica ligera",
      "↓ Glucemia + pérdida de peso + efecto natriurético/hemodinámico renal",
    ],
    efectosAdversos: {
      frecuentes: [
        "Infecciones micóticas genitales (3-5%)",
        "Infección de tracto urinario bajo (1-2%)",
        "Poliuria/depleción de volumen leve — riesgo de hipotensión, más en adultos mayores o con diuréticos",
      ],
      graves: [
        "Cetoacidosis diabética euglucémica (rara; mantener sospecha clínica aunque la glucosa esté solo levemente elevada)",
        "Riesgo de fractura y posible efecto sobre metabolismo mineral/PTH (bajo estudio, menor señal que canagliflozina)",
      ],
    },
    monitoreo: [
      { parametro: "Función renal (eGFR)", frecuencia: "Basal y periódico — el beneficio cardiorrenal se mantiene incluso con eGFR bajo, la eficacia glucémica no" },
      { parametro: "Signos de depleción de volumen", frecuencia: "Vigilar en adultos mayores, uso concomitante de diuréticos, o enfermedad intercurrente" },
      { parametro: "Cetonas/estado ácido-base", frecuencia: "Ante náusea/vómito/malestar aunque la glucosa no esté muy elevada; suspender temporalmente en enfermedad aguda, ayuno prolongado o cirugía" },
    ],
    educacionPaciente: {
      queEs: "Ayuda a eliminar azúcar extra por la orina; suele acompañarse de pérdida de peso y beneficia al corazón y al riñón.",
      comoTomarlo: "Una vez al día, con o sin alimentos, de preferencia en la mañana (por el efecto diurético leve).",
      siOlvidaDosis: "Tomarla en cuanto se recuerde ese mismo día; si ya es casi hora de la siguiente, omitir la olvidada — no duplicar.",
      senalesAlarma: [
        "Comezón, ardor o flujo genital inusual (posible infección micótica)",
        "Ardor al orinar o necesidad urgente de orinar (posible infección urinaria)",
        "Náusea, vómito, dolor abdominal o cansancio extremo — puede ser cetoacidosis aunque el azúcar no esté muy alta: buscar atención",
        "Mareo o desmayo al levantarse (posible baja de presión)",
      ],
    },
    contraindicacionesDetalle: [
      { condicion: "eGFR < 20 mL/min/1.73m² (empagliflozina)", razon: "Pérdida de eficacia glucémica y datos limitados de seguridad" },
      { condicion: "Diabetes tipo 1", razon: "No indicado; mayor riesgo de cetoacidosis euglucémica" },
      { condicion: "Depleción de volumen no corregida", razon: "El efecto diurético osmótico puede agravar la hipotensión" },
      { condicion: "Infecciones genitourinarias recurrentes activas", razon: "La glucosuria favorece el crecimiento micótico/bacteriano" },
    ],
    fuentes: [
      { texto: "Goodman & Gilman — Bases Farmacológicas de la Terapéutica, 13ª ed., cap. 47" },
      { texto: "FDA Prescribing Information — Empagliflozina (DailyMed)" },
      { texto: "EMPA-REG OUTCOME; AACE Algorithm 2026" },
    ],
    hipo: "bajo", peso: "perdida", costo: 3, egfrMin: 20, contra: ["EMBARAZO"],
    efectoCurva: { peakReduction: 0.12, baselineReduction: 10, delayHoras: 0 } },

  { id: "CANA", cat: "antidiabetic", grp: "iSGLT2", name: "Canagliflozina", ini: "100 mg", mant: "300 mg",
    adv: "Beneficio renal robusto (CREDENCE) y reducción de MACE en ASCVD establecida.",
    mecanismo: "Inhibe SGLT2 renal, disminuyendo la reabsorción de glucosa filtrada; inhibición leve de SGLT1 intestinal a dosis altas.",
    vidaMediaHoras: 11, vidaMediaLabel: "~10-13 h", reduccionA1c: "0.7-1.0%",
    titr: { l: ["Inicio", "Mes 1"], d: [100, 300] },
    benef: { ic: true, erc: true, ascvd: true, stroke: false, masld: true },
    evid: { erc: "fuerte", ascvd: "fuerte", ic: "clase", masld: "clase" },
    mecanismoDetalle: "Inhibe el cotransportador SGLT2 en el túbulo contorneado proximal renal; a dosis altas (300 mg) también inhibe modestamente SGLT1 intestinal, retrasando la absorción de glucosa post-prandial. Reduce el umbral renal de excreción de glucosa (~180 a ~50 mg/dL), promoviendo glucosuria insulino-independiente. Cuenta con el ensayo dedicado de desenlace renal duro CREDENCE (reducción de progresión de ERC/diálisis) y reducción de MACE en ASCVD establecida (CANVAS).",
    mecanismoPasos: [
      "Inhibición de SGLT2 (renal) y SGLT1 intestinal a dosis altas",
      "↓ Reabsorción tubular de glucosa filtrada",
      "↓ Umbral renal de excreción de glucosa (180 → ~50 mg/dL)",
      "Glucosuria + diuresis osmótica ligera",
      "↓ Glucemia + pérdida de peso + protección renal (CREDENCE)",
    ],
    efectosAdversos: {
      frecuentes: [
        "Infecciones micóticas genitales (3-5%)",
        "Infección de tracto urinario bajo (1-2%)",
        "Poliuria/depleción de volumen leve — riesgo de hipotensión, más en adultos mayores o con diuréticos",
      ],
      graves: [
        "Cetoacidosis diabética euglucémica (rara)",
        "↑ Riesgo de amputación de extremidades inferiores (señal específica de canagliflozina en CANVAS) — vigilar pie diabético",
        "↑ Riesgo de fractura (advertencia de FDA) — mayor señal que otros iSGLT2",
      ],
    },
    monitoreo: [
      { parametro: "Función renal (eGFR)", frecuencia: "Basal y periódico — beneficio renal (CREDENCE) documentado hasta eGFR bajo" },
      { parametro: "Exploración de pie / riesgo de amputación", frecuencia: "Reforzar vigilancia de pie diabético dada la señal de amputación en CANVAS" },
      { parametro: "Signos de depleción de volumen y cetonas", frecuencia: "Igual que el resto de la clase; suspender temporalmente en enfermedad aguda, ayuno prolongado o cirugía" },
    ],
    educacionPaciente: {
      queEs: "Ayuda a eliminar azúcar extra por la orina; suele acompañarse de pérdida de peso y protege al riñón.",
      comoTomarlo: "Una vez al día, antes de la primera comida del día.",
      siOlvidaDosis: "Tomarla en cuanto se recuerde ese mismo día; si ya es casi hora de la siguiente, omitir la olvidada — no duplicar.",
      senalesAlarma: [
        "Comezón, ardor o flujo genital inusual (posible infección micótica)",
        "Ardor al orinar o necesidad urgente de orinar (posible infección urinaria)",
        "Cualquier herida, dolor o cambio de color en pies — revisar los pies a diario",
        "Náusea, vómito o cansancio extremo — buscar atención por posible cetoacidosis",
      ],
    },
    contraindicacionesDetalle: [
      { condicion: "eGFR < 30 mL/min/1.73m² (canagliflozina, salvo indicación renal específica ya establecida)", razon: "Pérdida de eficacia glucémica y datos limitados de seguridad" },
      { condicion: "Diabetes tipo 1", razon: "No indicado; mayor riesgo de cetoacidosis euglucémica" },
      { condicion: "Antecedente de amputación o enfermedad arterial periférica avanzada", razon: "Señal de mayor riesgo de amputación en CANVAS — valorar alternativa" },
      { condicion: "Depleción de volumen no corregida", razon: "El efecto diurético osmótico puede agravar la hipotensión" },
    ],
    fuentes: [
      { texto: "Goodman & Gilman — Bases Farmacológicas de la Terapéutica, 13ª ed., cap. 47" },
      { texto: "FDA Prescribing Information — Canagliflozina (DailyMed)" },
      { texto: "CREDENCE; CANVAS; AACE Algorithm 2026" },
    ],
    hipo: "bajo", peso: "perdida", costo: 3, egfrMin: 30, contra: ["EMBARAZO"],
    efectoCurva: { peakReduction: 0.15, baselineReduction: 10, delayHoras: 0 } },

  { id: "SEMA", cat: "antidiabetic", grp: "GLP-1 RA", name: "Semaglutida SC", ini: "0.25 mg", mant: "1.0-2.0 mg",
    adv: "Pérdida de peso superior. Reduce MACE, stroke y progresión renal (FLOW).",
    mecanismo: "Agonista del receptor de GLP-1: potencia la secreción de insulina glucosa-dependiente, suprime el glucagón, enlentece el vaciamiento gástrico y aumenta la saciedad central.",
    vidaMediaHoras: 168, vidaMediaLabel: "~7 días", reduccionA1c: "1.5-1.8%",
    titr: { l: ["Sem 4", "Sem 8", "Sem 12", "Sem 16"], d: [0.25, 0.5, 1.0, 2.0] },
    benef: { ic: false, erc: true, ascvd: true, stroke: true, masld: true },
    evid: { erc: "fuerte", ascvd: "fuerte", stroke: "fuerte", masld: "clase" },
    // REDISEÑO DE FICHA (16-ago-2026): ver metodología en la entrada "MET".
    // Grupo GLP-1 RA — mecanismo y reacciones adversas de clase (G&G cap. 47);
    // riesgo de tumores de células C/MEN2 (advertencia de clase, extrapolada de
    // estudios en roedores, sin asociación clínica establecida en humanos según
    // G&G) ya reflejado en `contra: MEN2`.
    mecanismoDetalle: "Agonista del receptor de GLP-1 (GPCR clase B, familia del receptor de glucagón), expresado en células β pancreáticas, SNC/SNP, corazón, vasculatura, riñón, pulmón y mucosa GI. Su activación desencadena la vía AMP-PKA y señalización PI3K/PKC, aumentando la biosíntesis y exocitosis de insulina de forma GLUCOSA-DEPENDIENTE (por eso el riesgo de hipoglucemia por sí solo es bajo). Suprime la secreción de glucagón, retrasa el vaciamiento gástrico (vía activación de receptores GLP-1 en el SNC) y aumenta la saciedad central — de ahí su efecto sobre el peso. La semaglutida SC tiene una vida media prolongada (~7 días) que permite dosificación semanal.",
    mecanismoPasos: [
      "Activación del receptor GLP-1 (GPCR) en célula β pancreática",
      "↑ AMPc/PKA → ↑ secreción de insulina GLUCOSA-DEPENDIENTE",
      "↓ Secreción de glucagón",
      "↓ Vaciamiento gástrico (vía SNC) + ↑ saciedad central",
      "↓ Glucemia posprandial + pérdida de peso",
    ],
    efectosAdversos: {
      frecuentes: [
        "Náusea (hasta 30-50% al inicio; disminuye con el tiempo y con titulación lenta)",
        "Vómito, diarrea o estreñimiento",
        "Reacciones en el sitio de inyección (formas SC)",
      ],
      graves: [
        "Pancreatitis aguda (posible asociación; suspender ante dolor abdominal intenso sugestivo)",
        "Enfermedad de vesícula biliar (colelitiasis/colecistitis) — efecto de clase",
        "Riesgo teórico de tumores de células C tiroideas/MEN2 (extrapolado de estudios en roedores; sin asociación causal establecida en humanos, pero contraindicado en antecedente personal/familiar de carcinoma medular de tiroides o MEN2)",
      ],
    },
    contraindicacionesDetalle: [
      { condicion: "Antecedente personal/familiar de carcinoma medular de tiroides o MEN2", razon: "Señal de tumores de células C en estudios animales — advertencia de clase" },
      { condicion: "Antecedente de pancreatitis", razon: "Posible asociación con pancreatitis aguda" },
      { condicion: "Gastroparesia o trastorno grave de motilidad GI", razon: "El retraso del vaciamiento gástrico puede agravar los síntomas" },
      { condicion: "Embarazo", razon: "Datos insuficientes de seguridad; suspender antes de buscar embarazo" },
    ],
    monitoreo: [
      { parametro: "Tolerancia GI y peso", frecuencia: "En cada ajuste de dosis durante la titulación" },
      { parametro: "Síntomas de pancreatitis (dolor abdominal intenso irradiado a espalda)", frecuencia: "Educar al paciente para consulta inmediata si aparecen" },
      { parametro: "Uso concomitante con sulfonilurea/insulina", frecuencia: "Vigilar hipoglucemia — el riesgo del GLP-1 RA solo es bajo, pero aumenta al combinarse" },
    ],
    educacionPaciente: {
      queEs: "Imita una hormona intestinal (GLP-1) que ayuda a liberar insulina cuando hay azúcar en la sangre, frena el apetito y enlentece la digestión — por eso también ayuda a bajar de peso.",
      comoTomarlo: "Inyección subcutánea (semanal o diaria según el fármaco); iniciar con dosis baja e ir aumentando gradualmente para reducir las molestias estomacales.",
      siOlvidaDosis: "Depende de la frecuencia (semanal vs. diaria) — seguir la indicación específica del médico o el instructivo del fabricante para ese producto; no duplicar dosis.",
      senalesAlarma: [
        "Dolor abdominal intenso que no mejora, especialmente si se irradia a la espalda (posible pancreatitis)",
        "Dolor en la parte superior derecha del abdomen, náusea o color amarillento de piel/ojos (posible problema de vesícula)",
        "Vómito o diarrea que no permiten mantener líquidos",
        "Signos de baja de azúcar si se combina con otros medicamentos para la diabetes",
      ],
    },
    fuentes: [
      { texto: "Goodman & Gilman — Bases Farmacológicas de la Terapéutica, 13ª ed., cap. 47" },
      { texto: "FDA Prescribing Information — Semaglutida SC (DailyMed)" },
      { texto: "Ensayo SUSTAIN-6/FLOW; AACE Algorithm 2026" },
    ],
    hipo: "bajo", peso: "perdida", costo: 3, egfrMin: 15, contra: ["MEN2", "GLP1_GIP", "EMBARAZO"],
    efectoCurva: { peakReduction: 0.45, baselineReduction: 5, delayHoras: 1 } },

  { id: "SEMA_ORAL", cat: "antidiabetic", grp: "GLP-1 RA", name: "Semaglutida Oral", ini: "3 mg", mant: "14 mg",
    adv: "Única GLP-1 RA oral. Indicación FDA para prevención primaria de MACE (SOUL).",
    mecanismo: "Igual que la forma inyectable (agonismo del receptor GLP-1), coformulada con SNAC para permitir absorción gástrica.",
    vidaMediaHoras: 168, vidaMediaLabel: "~7 días", reduccionA1c: "1.0-1.4%",
    titr: { l: ["Mes 1", "Mes 2", "Mes 3"], d: [3, 7, 14] },
    benef: { ic: false, erc: false, ascvd: true, stroke: false, masld: false },
    evid: { ascvd: "fuerte" },
    mecanismoDetalle: "Mismo mecanismo que la semaglutida inyectable (agonismo del receptor GLP-1: ↑insulina glucosa-dependiente, ↓glucagón, ↓vaciamiento gástrico, ↑saciedad central), coformulada con SNAC (salcaprozato de sodio) — un potenciador de absorción que protege transitoriamente al péptido de la degradación gástrica y facilita su paso a través de la mucosa gástrica. Debe tomarse en ayuno con muy poca agua (≤120 mL) y esperar 30 min antes de comer/beber/tomar otros medicamentos, ya que alimentos o mayor volumen de líquido reducen drásticamente su absorción.",
    mecanismoPasos: [
      "Coformulación con SNAC protege el péptido de la degradación gástrica",
      "Absorción a través de la mucosa gástrica (requiere ayuno estricto)",
      "Activación del receptor GLP-1 → ↑ insulina glucosa-dependiente",
      "↓ Glucagón + ↓ vaciamiento gástrico + ↑ saciedad central",
      "↓ Glucemia posprandial + pérdida de peso",
    ],
    efectosAdversos: {
      frecuentes: [
        "Náusea, dolor abdominal, diarrea (similar a la clase, algo menor biodisponibilidad que la vía SC)",
        "Reducción de eficacia si no se respeta el ayuno estricto de administración",
      ],
      graves: [
        "Pancreatitis aguda (posible asociación; efecto de clase)",
        "Enfermedad de vesícula biliar — efecto de clase",
        "Riesgo teórico de tumores de células C tiroideas/MEN2 — efecto de clase",
      ],
    },
    contraindicacionesDetalle: [
      { condicion: "Antecedente personal/familiar de carcinoma medular de tiroides o MEN2", razon: "Advertencia de clase (estudios en roedores)" },
      { condicion: "Antecedente de pancreatitis", razon: "Posible asociación con pancreatitis aguda" },
      { condicion: "Incapacidad de cumplir el ayuno estricto de administración", razon: "La absorción cae drásticamente con alimentos/líquido — pierde eficacia, no es solo preferencia" },
      { condicion: "Embarazo", razon: "Datos insuficientes de seguridad" },
    ],
    monitoreo: [
      { parametro: "Técnica de administración (ayuno, volumen de agua, espera de 30 min)", frecuencia: "Reforzar en cada consulta — es la causa más común de 'falla' aparente del fármaco" },
      { parametro: "Tolerancia GI y peso", frecuencia: "En cada ajuste de dosis durante la titulación" },
    ],
    educacionPaciente: {
      queEs: "Es la única GLP-1 en pastilla; funciona igual que la inyectable pero necesita tomarse en ayuno para absorberse bien.",
      comoTomarlo: "Con el estómago vacío, a primera hora del día, con un trago de agua simple (no más de medio vaso) — esperar 30 minutos antes de comer, beber cualquier otra cosa, o tomar otros medicamentos.",
      siOlvidaDosis: "Omitir la dosis olvidada y tomar la siguiente al día siguiente, en ayuno, como de costumbre — no duplicar.",
      senalesAlarma: [
        "Dolor abdominal intenso que se irradia a la espalda (posible pancreatitis)",
        "Dolor en la parte superior derecha del abdomen o color amarillento de piel/ojos (posible problema de vesícula)",
        "Sensación de que 'no está haciendo efecto' — revisar primero la técnica de toma antes de asumir falla del medicamento",
      ],
    },
    fuentes: [
      { texto: "Goodman & Gilman — Bases Farmacológicas de la Terapéutica, 13ª ed., cap. 47" },
      { texto: "FDA Prescribing Information — Semaglutida Oral (DailyMed)" },
      { texto: "Ensayo SOUL; AACE Algorithm 2026" },
    ],
    hipo: "bajo", peso: "perdida", costo: 3, egfrMin: 15, contra: ["MEN2", "GLP1_GIP", "EMBARAZO"],
    efectoCurva: { peakReduction: 0.35, baselineReduction: 5, delayHoras: 0.75 } },

  { id: "DULA", cat: "antidiabetic", grp: "GLP-1 RA", name: "Dulaglutida", ini: "0.75 mg", mant: "4.5 mg",
    adv: "Indicación FDA prevención primaria de MACE (REWIND). Reduce stroke 24%.",
    mecanismo: "Agonista del receptor de GLP-1 fusionado a un fragmento Fc de IgG4, que prolonga su vida media; mismo efecto incretina que otros GLP-1 RA.",
    vidaMediaHoras: 120, vidaMediaLabel: "~5 días", reduccionA1c: "1.1-1.6%",
    titr: { l: ["Inicio", "Mes 1", "Mes 2"], d: [0.75, 1.5, 4.5] },
    benef: { ic: false, erc: true, ascvd: true, stroke: true, masld: false },
    evid: { ascvd: "fuerte", stroke: "fuerte", erc: "clase" },
    mecanismoDetalle: "Proteína de fusión: dos copias modificadas de GLP-1 humano (resistentes a degradación por DPP-4) unidas a un fragmento Fc de IgG4, lo que prolonga notablemente su vida media (~5 días) permitiendo dosis semanal. Comparte el mecanismo de clase: agonismo del receptor GLP-1 → ↑insulina glucosa-dependiente, ↓glucagón, ↓vaciamiento gástrico, ↑saciedad central. Cuenta con el ensayo dedicado de prevención primaria de MACE (REWIND) — el más incluyente en pacientes sin ASCVD establecida previa entre los GLP-1 RA.",
    mecanismoPasos: [
      "Fusión Fc-IgG4 prolonga la vida media (~5 días, dosis semanal)",
      "Activación del receptor GLP-1 → ↑ insulina glucosa-dependiente",
      "↓ Glucagón + ↓ vaciamiento gástrico + ↑ saciedad central",
      "↓ Glucemia posprandial + pérdida de peso",
      "Reducción de MACE (REWIND) incluso en prevención primaria",
    ],
    efectosAdversos: {
      frecuentes: [
        "Náusea, vómito, diarrea (más frecuentes en las primeras semanas)",
        "Reacciones en el sitio de inyección",
      ],
      graves: [
        "Pancreatitis aguda (posible asociación; efecto de clase)",
        "Enfermedad de vesícula biliar — efecto de clase",
        "Riesgo teórico de tumores de células C tiroideas/MEN2 — efecto de clase",
      ],
    },
    contraindicacionesDetalle: [
      { condicion: "Antecedente personal/familiar de carcinoma medular de tiroides o MEN2", razon: "Advertencia de clase (estudios en roedores)" },
      { condicion: "Antecedente de pancreatitis", razon: "Posible asociación con pancreatitis aguda" },
      { condicion: "Gastroparesia o trastorno grave de motilidad GI", razon: "El retraso del vaciamiento gástrico puede agravar los síntomas" },
      { condicion: "Embarazo", razon: "Datos insuficientes de seguridad" },
    ],
    monitoreo: [
      { parametro: "Tolerancia GI y peso", frecuencia: "En cada ajuste de dosis durante la titulación" },
      { parametro: "Síntomas de pancreatitis", frecuencia: "Educar al paciente para consulta inmediata si aparecen" },
    ],
    educacionPaciente: {
      queEs: "Imita una hormona intestinal (GLP-1) que ayuda a liberar insulina cuando hay azúcar en la sangre, frena el apetito y protege el corazón, incluso antes de tener un problema cardiovascular conocido.",
      comoTomarlo: "Inyección subcutánea una vez por semana, cualquier día y hora, con o sin alimentos.",
      siOlvidaDosis: "Aplicarla en cuanto se recuerde si faltan más de 3 días para la siguiente dosis programada; si faltan menos de 3 días, omitirla y continuar con el horario habitual.",
      senalesAlarma: [
        "Dolor abdominal intenso que se irradia a la espalda (posible pancreatitis)",
        "Dolor en la parte superior derecha del abdomen o color amarillento de piel/ojos (posible problema de vesícula)",
        "Vómito o diarrea que no permiten mantener líquidos",
      ],
    },
    fuentes: [
      { texto: "Goodman & Gilman — Bases Farmacológicas de la Terapéutica, 13ª ed., cap. 47" },
      { texto: "FDA Prescribing Information — Dulaglutida (DailyMed)" },
      { texto: "Ensayo REWIND; AACE Algorithm 2026" },
    ],
    hipo: "bajo", peso: "perdida", costo: 3, egfrMin: 15, contra: ["MEN2", "GLP1_GIP", "EMBARAZO"],
    efectoCurva: { peakReduction: 0.40, baselineReduction: 5, delayHoras: 1 } },

  { id: "LIRA", cat: "antidiabetic", grp: "GLP-1 RA", name: "Liraglutida", ini: "0.6 mg", mant: "1.8 mg",
    adv: "Beneficio CV en prevención secundaria (LEADER). Requiere dosis diaria.",
    mecanismo: "Agonista del receptor de GLP-1 con unión reversible a albúmina que retrasa su degradación; acción incretina clásica.",
    vidaMediaHoras: 13, vidaMediaLabel: "~13 h", reduccionA1c: "1.0-1.5%",
    titr: { l: ["Sem 1", "Sem 2", "Sem 3"], d: [0.6, 1.2, 1.8] },
    benef: { ic: false, erc: false, ascvd: true, stroke: false, masld: true },
    evid: { ascvd: "fuerte", masld: "clase" },
    mecanismoDetalle: "Análogo de GLP-1 con sustitución de un aminoácido y unión reversible a albúmina sérica, lo que retrasa su degradación y proteólisis (t½ ~13 h) — requiere dosificación diaria, a diferencia de las formas semanales. Comparte el mecanismo de clase: agonismo del receptor GLP-1 → ↑insulina glucosa-dependiente, ↓glucagón, ↓vaciamiento gástrico, ↑saciedad central. Cuenta con el ensayo dedicado de reducción de mortalidad cardiovascular en prevención secundaria (LEADER).",
    mecanismoPasos: [
      "Unión reversible a albúmina retrasa la degradación (t½ ~13 h)",
      "Activación del receptor GLP-1 → ↑ insulina glucosa-dependiente",
      "↓ Glucagón + ↓ vaciamiento gástrico + ↑ saciedad central",
      "↓ Glucemia posprandial + pérdida de peso",
      "Reducción de mortalidad CV en prevención secundaria (LEADER)",
    ],
    efectosAdversos: {
      frecuentes: [
        "Náusea, vómito, diarrea (más frecuentes en las primeras semanas)",
        "Reacciones en el sitio de inyección",
      ],
      graves: [
        "Pancreatitis aguda (posible asociación; efecto de clase)",
        "Enfermedad de vesícula biliar — efecto de clase",
        "Riesgo teórico de tumores de células C tiroideas/MEN2 — efecto de clase",
      ],
    },
    contraindicacionesDetalle: [
      { condicion: "Antecedente personal/familiar de carcinoma medular de tiroides o MEN2", razon: "Advertencia de clase (estudios en roedores)" },
      { condicion: "Antecedente de pancreatitis", razon: "Posible asociación con pancreatitis aguda" },
      { condicion: "Gastroparesia o trastorno grave de motilidad GI", razon: "El retraso del vaciamiento gástrico puede agravar los síntomas" },
      { condicion: "Embarazo", razon: "Datos insuficientes de seguridad" },
    ],
    monitoreo: [
      { parametro: "Adherencia a la dosis diaria", frecuencia: "En cada consulta — a diferencia de las formas semanales, el olvido de dosis es más frecuente" },
      { parametro: "Tolerancia GI y peso", frecuencia: "En cada ajuste de dosis durante la titulación" },
    ],
    educacionPaciente: {
      queEs: "Imita una hormona intestinal (GLP-1) que ayuda a liberar insulina cuando hay azúcar en la sangre, frena el apetito y protege el corazón en quienes ya tuvieron un evento cardiovascular.",
      comoTomarlo: "Inyección subcutánea una vez AL DÍA, a la misma hora, con o sin alimentos.",
      siOlvidaDosis: "Aplicarla en cuanto se recuerde ese mismo día; si ya se acerca la hora de la siguiente dosis, omitir la olvidada — no duplicar.",
      senalesAlarma: [
        "Dolor abdominal intenso que se irradia a la espalda (posible pancreatitis)",
        "Dolor en la parte superior derecha del abdomen o color amarillento de piel/ojos (posible problema de vesícula)",
        "Vómito o diarrea que no permiten mantener líquidos",
      ],
    },
    fuentes: [
      { texto: "Goodman & Gilman — Bases Farmacológicas de la Terapéutica, 13ª ed., cap. 47" },
      { texto: "FDA Prescribing Information — Liraglutida (DailyMed)" },
      { texto: "Ensayo LEADER; AACE Algorithm 2026" },
    ],
    hipo: "bajo", peso: "perdida", costo: 3, egfrMin: 15, contra: ["MEN2", "GLP1_GIP", "EMBARAZO"],
    efectoCurva: { peakReduction: 0.35, baselineReduction: 5, delayHoras: 0.75 } },

  { id: "TIRZ", cat: "antidiabetic", grp: "GIP/GLP-1 RA", name: "Tirzepatida", ini: "2.5 mg", mant: "15 mg",
    adv: "Mayor eficacia glucémica y pérdida de peso. Beneficio en MASLD/MASH y HFpEF obesidad.",
    mecanismo: "Agonista dual de los receptores GIP y GLP-1; la coactivación GIP potencia el efecto incretina y la pérdida de peso más allá de un GLP-1 RA solo.",
    vidaMediaHoras: 120, vidaMediaLabel: "~5 días", reduccionA1c: "1.9-2.5%",
    titr: { l: ["Sem 4", "Sem 8", "Sem 12", "Sem 16", "Sem 20"], d: [2.5, 5, 7.5, 10, 15] },
    benef: { ic: true, erc: false, ascvd: true, stroke: true, masld: true },
    evid: { ic: "fuerte", masld: "fuerte", ascvd: "clase", stroke: "clase" },
    mecanismoDetalle: "Péptido sintético de cadena única que actúa como agonista dual de los receptores de GIP (polipéptido insulinotrópico dependiente de glucosa) y de GLP-1, con mayor afinidad relativa por el receptor GIP. La coactivación de ambos receptores potencia la secreción de insulina glucosa-dependiente y la supresión de glucagón más allá de lo que logra un GLP-1 RA solo; el componente GIP también parece contribuir a un efecto adicional sobre el metabolismo de lípidos y la sensibilidad a la insulina en tejido adiposo, lo que explicaría la mayor pérdida de peso observada frente a semaglutida. Comparte con la clase GLP-1 el retraso del vaciamiento gástrico y el aumento de saciedad central.",
    mecanismoPasos: [
      "Agonismo dual: receptor GIP (mayor afinidad) + receptor GLP-1",
      "↑↑ Secreción de insulina glucosa-dependiente (efecto potenciado GIP+GLP-1)",
      "↓ Glucagón + ↓ vaciamiento gástrico + ↑ saciedad central",
      "Efecto adicional GIP sobre metabolismo lipídico/tejido adiposo",
      "↓ Glucemia posprandial + pérdida de peso superior a GLP-1 RA solo",
    ],
    efectosAdversos: {
      frecuentes: [
        "Náusea (12-30%), diarrea (13-24%), vómito (6-12%), estreñimiento (6-17%) — dosis-dependientes, disminuyen con titulación lenta",
        "Reacciones en el sitio de inyección",
      ],
      graves: [
        "Pancreatitis aguda (reportada; vigilar dolor abdominal intenso)",
        "Enfermedad de vesícula biliar (colelitiasis/colecistitis) — efecto de clase, señal similar o mayor que otros GLP-1 RA por la mayor pérdida de peso",
        "Riesgo teórico de tumores de células C tiroideas/MEN2 — efecto de clase",
      ],
    },
    contraindicacionesDetalle: [
      { condicion: "Antecedente personal/familiar de carcinoma medular de tiroides o MEN2", razon: "Advertencia de clase (estudios en roedores)" },
      { condicion: "Antecedente de pancreatitis", razon: "Riesgo reportado de pancreatitis aguda" },
      { condicion: "Gastroparesia o trastorno grave de motilidad GI", razon: "El retraso del vaciamiento gástrico puede agravar los síntomas" },
      { condicion: "Embarazo", razon: "Datos insuficientes de seguridad" },
    ],
    monitoreo: [
      { parametro: "Tolerancia GI y peso", frecuencia: "En cada ajuste de dosis durante la titulación (5 escalones hasta 15 mg)" },
      { parametro: "Síntomas de pancreatitis y de vesícula biliar", frecuencia: "Educar al paciente para consulta inmediata si aparecen, dado el mayor grado de pérdida de peso" },
    ],
    educacionPaciente: {
      queEs: "Actúa sobre DOS hormonas intestinales (GIP y GLP-1) para controlar el azúcar, frenar el apetito y lograr una pérdida de peso mayor que otros medicamentos similares.",
      comoTomarlo: "Inyección subcutánea una vez por semana, cualquier día y hora, con o sin alimentos.",
      siOlvidaDosis: "Aplicarla en cuanto se recuerde si faltan más de 4 días para la siguiente dosis programada; si faltan menos de 4 días, omitirla y continuar con el horario habitual.",
      senalesAlarma: [
        "Dolor abdominal intenso que se irradia a la espalda (posible pancreatitis)",
        "Dolor en la parte superior derecha del abdomen o color amarillento de piel/ojos (posible problema de vesícula)",
        "Vómito o diarrea que no permiten mantener líquidos",
        "Pérdida de peso muy rápida o descontrolada — comentarlo en consulta",
      ],
    },
    fuentes: [
      { texto: "FDA Prescribing Information — Tirzepatida (DailyMed)" },
      { texto: "Ensayos SURPASS/SURMOUNT; AACE Algorithm 2026" },
    ],
    hipo: "bajo", peso: "perdida", costo: 3, egfrMin: 15, contra: ["MEN2", "GLP1_GIP", "EMBARAZO"],
    efectoCurva: { peakReduction: 0.55, baselineReduction: 8, delayHoras: 1.25 } },

  { id: "SITA", cat: "antidiabetic", grp: "iDPP-4", name: "Sitagliptina", ini: "100 mg", mant: "100 mg",
    adv: "Neutro en peso, seguro pero neutro en desenlaces CV/renales. Ajustar dosis en ERC.",
    mecanismo: "Inhibe la enzima DPP-4, prolongando la vida media de las incretinas endógenas (GLP-1/GIP) circulantes.",
    vidaMediaHoras: 12, vidaMediaLabel: "~12 h", reduccionA1c: "0.5-0.8%",
    titr: { l: ["Inicio"], d: [100] },
    benef: { ic: false, erc: false, ascvd: false, stroke: false, masld: false },
    // REDISEÑO DE FICHA (16-ago-2026): metodología en entrada "MET". Clase
    // iDPP-4 — mecanismo/ADME/reacciones adversas de G&G cap. 47 (incluye la
    // alerta FDA de artralgia grave, no específica de un solo fármaco).
    mecanismoDetalle: "Inhibe la dipeptidil peptidasa-4 (DPP-4), la enzima que degrada rápidamente las incretinas endógenas GLP-1 y GIP liberadas tras la comida. Al bloquearla, prolonga la vida media activa de estas hormonas, potenciando su efecto natural: aumento de la secreción de insulina glucosa-dependiente y supresión de glucagón. No tiene efecto directo sobre el vaciamiento gástrico ni la saciedad (a diferencia de los GLP-1 RA), por eso su reducción de A1c es más modesta y es neutro en peso.",
    mecanismoPasos: [
      "Inhibición de la enzima DPP-4",
      "↑ Vida media de GLP-1/GIP endógenos post-prandiales",
      "↑ Secreción de insulina glucosa-dependiente",
      "↓ Secreción de glucagón",
      "↓ Glucemia posprandial (efecto modesto, neutro en peso)",
    ],
    efectosAdversos: {
      frecuentes: [
        "Generalmente bien tolerado; sin patrón consistente de efectos adversos frecuentes en ensayos clínicos",
        "Cefalea, síntomas de vías respiratorias altas (nasofaringitis)",
      ],
      graves: [
        "Artralgia grave e incapacitante (alerta de la FDA, efecto de clase, puede iniciar días a años después de empezar el fármaco)",
        "Pancreatitis aguda (reportes post-comercialización)",
        "Penfigoide ampolloso (lesiones cutáneas ampollosas, efecto de clase, más reportado con vildagliptina)",
      ],
    },
    contraindicacionesDetalle: [
      { condicion: "Antecedente de pancreatitis", razon: "Reportes post-comercialización de pancreatitis aguda" },
      { condicion: "Antecedente de penfigoide ampolloso", razon: "Riesgo de recurrencia/exacerbación" },
      { condicion: "Embarazo", razon: "Datos insuficientes de seguridad" },
    ],
    monitoreo: [
      { parametro: "Dolor articular de nueva aparición", frecuencia: "Preguntar en cada consulta; suspender si es grave e incapacitante" },
      { parametro: "Función renal", frecuencia: "Basal — la mayoría de los iDPP-4 (excepto linagliptina) requieren ajuste de dosis según eGFR" },
    ],
    educacionPaciente: {
      queEs: "Ayuda a que las hormonas naturales del cuerpo que regulan el azúcar duren más tiempo activas después de comer.",
      comoTomarlo: "Una vez al día, con o sin alimentos, a dosis fija (no requiere titulación).",
      siOlvidaDosis: "Tomarla en cuanto se recuerde ese mismo día; si ya casi es hora de la siguiente, omitir la olvidada — no duplicar.",
      senalesAlarma: [
        "Dolor articular intenso o incapacitante de aparición nueva",
        "Ampollas en la piel",
        "Dolor abdominal intenso irradiado a la espalda (posible pancreatitis)",
      ],
    },
    fuentes: [
      { texto: "Goodman & Gilman — Bases Farmacológicas de la Terapéutica, 13ª ed., cap. 47" },
      { texto: "FDA Drug Safety Communication — artralgia grave con inhibidores de DPP-4" },
      { texto: "AACE Algorithm 2026" },
    ],
    hipo: "bajo", peso: "neutro", costo: 2, egfrMin: 0, contra: ["EMBARAZO"],
    efectoCurva: { peakReduction: 0.15, baselineReduction: 3, delayHoras: 0 } },

  { id: "LINA", cat: "antidiabetic", grp: "iDPP-4", name: "Linagliptina", ini: "5 mg", mant: "5 mg",
    adv: "No requiere ajuste renal (excreción biliar). Útil en ERC avanzada.",
    mecanismo: "Inhibe DPP-4 de forma competitiva y saturable, prolongando la actividad de GLP-1/GIP endógenos; eliminación predominantemente biliar.",
    vidaMediaHoras: 12, vidaMediaLabel: "~12 h (efectiva)", reduccionA1c: "0.5-0.7%",
    titr: { l: ["Inicio"], d: [5] },
    benef: { ic: false, erc: false, ascvd: false, stroke: false, masld: false },
    mecanismoDetalle: "Igual mecanismo de clase que el resto de los iDPP-4 (inhibición de DPP-4 → prolonga GLP-1/GIP endógenos), pero con una diferencia farmacocinética clave: se elimina predominantemente por vía biliar/entérica en lugar de renal, por lo que NO requiere ajuste de dosis en insuficiencia renal, incluso en ERC avanzada o diálisis — la única de la clase con esta ventaja.",
    mecanismoPasos: [
      "Inhibición de la enzima DPP-4",
      "↑ Vida media de GLP-1/GIP endógenos post-prandiales",
      "↑ Secreción de insulina glucosa-dependiente + ↓ glucagón",
      "Eliminación predominantemente biliar (no renal)",
      "↓ Glucemia posprandial sin necesidad de ajuste renal",
    ],
    efectosAdversos: {
      frecuentes: ["Generalmente bien tolerada; sin patrón consistente de efectos adversos frecuentes", "Nasofaringitis"],
      graves: [
        "Artralgia grave e incapacitante (alerta de la FDA, efecto de clase)",
        "Pancreatitis aguda (reportes post-comercialización)",
        "Penfigoide ampolloso (efecto de clase)",
      ],
    },
    contraindicacionesDetalle: [
      { condicion: "Antecedente de pancreatitis", razon: "Reportes post-comercialización de pancreatitis aguda" },
      { condicion: "Antecedente de penfigoide ampolloso", razon: "Riesgo de recurrencia/exacerbación" },
      { condicion: "Embarazo", razon: "Datos insuficientes de seguridad" },
    ],
    monitoreo: [
      { parametro: "Dolor articular de nueva aparición", frecuencia: "Preguntar en cada consulta; suspender si es grave e incapacitante" },
    ],
    educacionPaciente: {
      queEs: "Ayuda a que las hormonas naturales del cuerpo que regulan el azúcar duren más tiempo activas después de comer; es segura aunque el riñón esté muy dañado.",
      comoTomarlo: "Una vez al día, con o sin alimentos, a dosis fija (no requiere titulación ni ajuste por función renal).",
      siOlvidaDosis: "Tomarla en cuanto se recuerde ese mismo día; si ya casi es hora de la siguiente, omitir la olvidada — no duplicar.",
      senalesAlarma: [
        "Dolor articular intenso o incapacitante de aparición nueva",
        "Ampollas en la piel",
        "Dolor abdominal intenso irradiado a la espalda (posible pancreatitis)",
      ],
    },
    fuentes: [
      { texto: "Goodman & Gilman — Bases Farmacológicas de la Terapéutica, 13ª ed., cap. 47" },
      { texto: "FDA Prescribing Information — Linagliptina (DailyMed)" },
    ],
    hipo: "bajo", peso: "neutro", costo: 2, egfrMin: 0, contra: ["EMBARAZO"],
    efectoCurva: { peakReduction: 0.15, baselineReduction: 3, delayHoras: 0 } },

  { id: "PIO", cat: "antidiabetic", grp: "TZD", name: "Pioglitazona", ini: "15 mg", mant: "45 mg",
    adv: "Beneficio en MASH y reducción de stroke recurrente (IRIS). Evitar en IC III/IV.",
    mecanismo: "Agonista de PPAR-γ en tejido adiposo, muscular y hepático; mejora la sensibilidad periférica a la insulina y redistribuye grasa visceral a subcutánea.",
    vidaMediaHoras: 20, vidaMediaLabel: "~16-24 h", reduccionA1c: "1.0-1.4%",
    titr: { l: ["Inicio", "Sem 4"], d: [15, 45] },
    benef: { ic: false, erc: false, ascvd: false, stroke: true, masld: true },
    evid: { stroke: "fuerte", masld: "fuerte" },
    mecanismoDetalle: "Agonista de PPAR-γ (receptor nuclear activado por proliferadores de peroxisomas, subtipo γ), expresado principalmente en tejido adiposo, con expresión también en músculo esquelético e hígado. Su activación promueve diferenciación adipocítica y redirige la captura de ácidos grasos circulantes hacia el tejido adiposo subcutáneo (alejándolos de sitios ectópicos como hígado y músculo), lo que mejora la sensibilidad periférica a la insulina — aumenta la captura de glucosa mediada por insulina 30-50% en el músculo esquelético, sitio principal de eliminación de glucosa. Requiere presencia de insulina endógena/exógena para funcionar (no sirve en DM1). Su inicio de acción es lento, con efecto máximo sobre la glucemia en 1-3 meses.",
    mecanismoPasos: [
      "Activación del receptor nuclear PPAR-γ",
      "Diferenciación adipocítica + redistribución de grasa (visceral → subcutánea)",
      "↑ Captura de glucosa mediada por insulina en músculo esquelético (30-50%)",
      "↓ Producción hepática de glucosa",
      "↓ Glucemia (efecto máximo en 1-3 meses, requiere insulina presente)",
    ],
    efectosAdversos: {
      frecuentes: [
        "Ganancia de peso",
        "Edema periférico",
        "Anemia dilucional leve",
      ],
      graves: [
        "Insuficiencia cardiaca — retención de líquidos, contraindicada en IC clase III/IV NYHA",
        "↑ Riesgo de fracturas óseas, particularmente en mujeres postmenopáusicas",
        "Señal de ↑ riesgo de cáncer de vejiga con uso prolongado (>1 año) — controvertido, vigilar hematuria",
      ],
    },
    contraindicacionesDetalle: [
      { condicion: "Insuficiencia cardiaca clase III/IV NYHA", razon: "Retención de líquidos puede precipitar/agravar edema pulmonar" },
      { condicion: "Enfermedad hepática activa", razon: "Aunque menos hepatotóxica que troglitazona (retirada del mercado), requiere precaución" },
      { condicion: "Cáncer de vejiga activo o antecedente", razon: "Señal epidemiológica de asociación con uso prolongado" },
      { condicion: "Embarazo", razon: "Datos insuficientes de seguridad" },
    ],
    monitoreo: [
      { parametro: "Signos de retención de líquidos/IC (edema, disnea, ganancia rápida de peso)", frecuencia: "En cada consulta, especialmente los primeros meses" },
      { parametro: "Función hepática", frecuencia: "Basal; reevaluar si hay síntomas de daño hepático" },
      { parametro: "Densidad ósea/riesgo de fractura", frecuencia: "Considerar en mujeres postmenopáusicas con uso prolongado" },
    ],
    educacionPaciente: {
      queEs: "Ayuda a que el cuerpo use mejor su propia insulina; el efecto tarda semanas a meses en notarse por completo.",
      comoTomarlo: "Una vez al día, con o sin alimentos.",
      siOlvidaDosis: "Tomarla en cuanto se recuerde ese mismo día; si ya casi es hora de la siguiente, omitir la olvidada — no duplicar.",
      senalesAlarma: [
        "Hinchazón de piernas/tobillos, dificultad para respirar, o subir de peso rápidamente (posible retención de líquidos)",
        "Sangre en la orina (comentarlo con el médico)",
        "Fracturas con traumatismos menores",
      ],
    },
    fuentes: [
      { texto: "Goodman & Gilman — Bases Farmacológicas de la Terapéutica, 13ª ed., cap. 47" },
      { texto: "Ensayo IRIS (stroke); FDA Prescribing Information — Pioglitazona (DailyMed)" },
    ],
    hipo: "bajo", peso: "ganancia", costo: 1, egfrMin: 0, contra: ["IC", "EMBARAZO"],
    efectoCurva: { peakReduction: 0.10, baselineReduction: 12, delayHoras: 0 } },

  { id: "GLIM", cat: "antidiabetic", grp: "Sulfonilurea", name: "Glimepirida", ini: "1 mg", mant: "4 mg",
    adv: "Económica pero riesgo de hipoglucemia moderado-alto. Considerar solo por acceso/costo.",
    mecanismo: "Cierra los canales KATP de la célula beta pancreática, despolarizando la membrana y estimulando la secreción de insulina de forma NO glucosa-dependiente.",
    vidaMediaHoras: 7, vidaMediaLabel: "~5-9 h", reduccionA1c: "1.0-1.5%",
    titr: { l: ["Inicio", "Sem 2"], d: [1, 4] },
    benef: { ic: false, erc: false, ascvd: false, stroke: false, masld: false },
    mecanismoDetalle: "Cierra los canales de potasio dependientes de ATP (KATP, subunidad SUR1) en la membrana de la célula β pancreática, causando despolarización, apertura de canales de Ca2+ voltaje-dependientes y exocitosis de insulina almacenada. A diferencia de los GLP-1 RA/iDPP-4, este estímulo es NO glucosa-dependiente — la célula β secreta insulina aunque la glucosa ya esté en meta o baja, lo que explica el riesgo alto de hipoglucemia de la clase. Con el uso prolongado, hasta cierto punto de pacientes experimentan 'falla secundaria' (pérdida de eficacia) por progresión de la falla de células β.",
    mecanismoPasos: [
      "Cierre de canales KATP (SUR1) en la célula β pancreática",
      "Despolarización de la membrana",
      "Apertura de canales de Ca2+ voltaje-dependientes",
      "Exocitosis de insulina almacenada (NO glucosa-dependiente)",
      "↓ Glucemia — con riesgo de hipoglucemia si la ingesta no acompaña la dosis",
    ],
    efectosAdversos: {
      frecuentes: [
        "Hipoglucemia (la más frecuente y clínicamente relevante de la clase)",
        "Ganancia de peso 1-3 kg",
      ],
      graves: [
        "Hipoglucemia severa/coma, especialmente en adultos mayores, ERC o ayuno prolongado",
        "Reacción tipo disulfiram con alcohol (enrojecimiento facial)",
        "Raramente: ictericia colestática, discrasias sanguíneas, hipersensibilidad generalizada",
      ],
    },
    contraindicacionesDetalle: [
      { condicion: "Antecedente de hipoglucemias severas", razon: "Riesgo NO glucosa-dependiente de hipoglucemia" },
      { condicion: "eGFR < 30 mL/min/1.73m²", razon: "Acumulación del fármaco/metabolitos activos, mayor riesgo de hipoglucemia prolongada" },
      { condicion: "Diabetes tipo 1", razon: "Requiere función de célula β residual para funcionar" },
      { condicion: "Embarazo", razon: "No es de elección; preferir insulina" },
    ],
    monitoreo: [
      { parametro: "Episodios de hipoglucemia (sintomáticos y asintomáticos)", frecuencia: "En cada consulta; educar en reconocimiento y manejo" },
      { parametro: "Función renal", frecuencia: "Basal y periódica — el riesgo de hipoglucemia aumenta al caer el eGFR" },
    ],
    educacionPaciente: {
      queEs: "Estimula al páncreas a liberar más insulina; a diferencia de otros medicamentos para la diabetes, SÍ puede causar bajas de azúcar si no come lo suficiente.",
      comoTomarlo: "Con la primera comida principal del día; no omitir comidas después de tomarla.",
      siOlvidaDosis: "Si olvida la dosis Y también la comida, no tomarla después sin alimento — consultar con su médico si esto ocurre seguido.",
      senalesAlarma: [
        "Temblor, sudoración fría, confusión, hambre repentina (signos de baja de azúcar) — tratar de inmediato con azúcar de acción rápida",
        "Piel u ojos amarillentos (posible daño hepático)",
        "Moretones o sangrados inusuales",
      ],
    },
    fuentes: [
      { texto: "Goodman & Gilman — Bases Farmacológicas de la Terapéutica, 13ª ed., cap. 47" },
      { texto: "FDA Prescribing Information — Glimepirida (DailyMed)" },
    ],
    hipo: "alto", peso: "ganancia", costo: 1, egfrMin: 30, contra: ["HIPOGLUCEMIA", "EMBARAZO"],
    efectoCurva: { peakReduction: 0.30, baselineReduction: 8, delayHoras: 0 } },

  { id: "ACARB", cat: "antidiabetic", grp: "AGI", name: "Acarbosa", ini: "25 mg", mant: "100 mg",
    adv: "Reduce glucosa posprandial. Efectos GI (flatulencia) limitan apego.",
    mecanismo: "Inhibe competitivamente las alfa-glucosidasas del borde en cepillo intestinal, retrasando la digestión y absorción de carbohidratos complejos.",
    vidaMediaHoras: 2, vidaMediaLabel: "~2 h (acción local)", reduccionA1c: "0.5-0.8%",
    titr: { l: ["Inicio", "Sem 4"], d: [25, 100] },
    benef: { ic: false, erc: false, ascvd: false, stroke: false, masld: false },
    mecanismoDetalle: "Inhibe competitiva y reversiblemente las alfa-glucosidasas del borde en cepillo del intestino delgado, las enzimas que fragmentan disacáridos/oligosacáridos en monosacáridos absorbibles. Al retrasar esta digestión, aplana y retrasa el pico de glucosa posprandial sin aumentar la insulina circulante. Su acción es local (mínima absorción sistémica), por lo que no causa hipoglucemia por sí sola — pero SÍ interfiere con el tratamiento de una hipoglucemia causada por OTRO fármaco (insulina/sulfonilurea), porque bloquea la digestión de sacarosa (azúcar de mesa).",
    mecanismoPasos: [
      "Inhibición competitiva de alfa-glucosidasas intestinales (borde en cepillo)",
      "↓ Digestión de disacáridos/oligosacáridos a monosacáridos absorbibles",
      "Retraso y aplanamiento de la absorción de carbohidratos",
      "↓ Pico de glucosa posprandial (acción local, mínima absorción sistémica)",
    ],
    efectosAdversos: {
      frecuentes: [
        "Flatulencia (muy frecuente, principal causa de abandono)",
        "Diarrea, distensión/dolor abdominal",
      ],
      graves: [
        "Elevación leve-moderada de transaminasas hepáticas (raro; enfermedad hepática sintomática muy rara)",
        "Obstrucción intestinal en predispuestos (enfermedad inflamatoria intestinal, úlceras, hernias grandes)",
      ],
    },
    contraindicacionesDetalle: [
      { condicion: "Enfermedad inflamatoria intestinal, obstrucción o predisposición a obstrucción", razon: "El fármaco enlentece el tránsito intestinal de carbohidratos no digeridos" },
      { condicion: "Cirrosis hepática", razon: "Precaución — se han reportado elevaciones de transaminasas" },
      { condicion: "eGFR < 25 mL/min/1.73m²", razon: "Datos limitados de seguridad" },
      { condicion: "Embarazo", razon: "Datos insuficientes de seguridad" },
    ],
    monitoreo: [
      { parametro: "Tolerancia GI", frecuencia: "En cada ajuste de dosis — iniciar bajo y titular lento minimiza el abandono" },
      { parametro: "Transaminasas hepáticas", frecuencia: "Periódico, especialmente a dosis altas" },
    ],
    educacionPaciente: {
      queEs: "Retrasa la absorción de los carbohidratos de la comida para evitar picos de azúcar después de comer.",
      comoTomarlo: "Con el PRIMER bocado de cada comida principal (no antes ni después) — si se toma sin alimento no funciona.",
      siOlvidaDosis: "Si olvida tomarla al inicio de la comida y ya avanzó, omitir esa dosis y tomar la siguiente en la próxima comida.",
      senalesAlarma: [
        "Distensión o dolor abdominal muy intenso (poco frecuente, pero valorar obstrucción)",
        "Piel u ojos amarillentos",
        "IMPORTANTE: si tiene una baja de azúcar mientras toma este medicamento junto con insulina o sulfonilurea, debe tratarla con GLUCOSA PURA (tabletas o gel de glucosa), NO con azúcar de mesa — este medicamento bloquea su absorción",
      ],
    },
    fuentes: [
      { texto: "Goodman & Gilman — Bases Farmacológicas de la Terapéutica, 13ª ed., cap. 47" },
      { texto: "FDA Prescribing Information — Acarbosa (DailyMed)" },
    ],
    hipo: "bajo", peso: "neutro", costo: 1, egfrMin: 0, contra: ["EMBARAZO"],
    efectoCurva: { peakReduction: 0.35, baselineReduction: 0, delayHoras: 0.5 } },

  { id: "GLAR", cat: "antidiabetic", grp: "Insulina Basal", name: "Insulina Glargina", ini: "0.1-0.2 U/kg/día", mant: "Titular c/2-5 días",
    adv: "Preferir análogo sobre NPH (menor hipoglucemia). Iniciar si A1c >10% o glucosa >300.",
    mecanismo: "Análogo de insulina de acción prolongada que precipita en el tejido subcutáneo, liberándose lentamente para un perfil basal ~24 h sin picos marcados.",
    vidaMediaHoras: 12, vidaMediaLabel: "~12 h (duración ~24 h)", reduccionA1c: "1.5-3.5%",
    titr: { l: ["Inicio", "Sem 1", "Sem 2"], d: [10, 14, 18] },
    benef: { ic: false, erc: false, ascvd: false, stroke: false, masld: false },
    // REDISEÑO DE FICHA (16-ago-2026): metodología en entrada "MET". Insulinas
    // basales — farmacocinética de G&G cap. 47 y FDA labels; educación al
    // paciente enfocada en manejo de hipoglucemia (regla de 15), rotación de
    // sitios de inyección y almacenamiento, temas ausentes en fármacos orales.
    mecanismoDetalle: "Análogo de insulina humana de acción prolongada (sustitución de aminoácidos que altera su punto isoeléctrico). Al inyectarse en el tejido subcutáneo (pH neutro), precipita formando microprecipitados que se disuelven y liberan monómeros de insulina lentamente y de forma relativamente constante, generando un perfil basal ~24 h sin pico pronunciado — a diferencia de la insulina NPH. Actúa como el resto de las insulinas: se une al receptor de insulina (tirosina-cinasa) en hígado, músculo y tejido adiposo, activando la translocación de GLUT4 y la captación celular de glucosa, además de suprimir la producción hepática de glucosa y la lipólisis.",
    mecanismoPasos: [
      "Inyección subcutánea → precipitación a pH tisular neutro",
      "Liberación lenta y sostenida de monómeros de insulina",
      "Unión al receptor de insulina (hígado, músculo, tejido adiposo)",
      "↑ Translocación de GLUT4 → ↑ captación celular de glucosa",
      "↓ Producción hepática de glucosa — perfil basal ~24 h sin pico marcado",
    ],
    efectosAdversos: {
      frecuentes: [
        "Hipoglucemia (el efecto adverso más frecuente de cualquier insulina)",
        "Ganancia de peso",
        "Reacciones/lipohipertrofia en el sitio de inyección si no se rota el sitio",
      ],
      graves: [
        "Hipoglucemia severa (confusión, convulsiones, pérdida de conciencia)",
        "Hipopotasemia (la insulina desplaza K+ al espacio intracelular)",
        "Reacción alérgica sistémica (rara)",
      ],
    },
    contraindicacionesDetalle: [
      { condicion: "Hipoglucemia activa", razon: "No administrar durante un episodio de hipoglucemia" },
      { condicion: "Hipersensibilidad al producto específico", razon: "Reacción alérgica documentada a esa insulina/excipiente" },
    ],
    monitoreo: [
      { parametro: "Glucosa capilar/sensor (ayuno y pre-dosis)", frecuencia: "Diario durante titulación; ajustar dosis cada 2-5 días según el patrón" },
      { parametro: "Episodios de hipoglucemia (sintomáticos y nocturnos)", frecuencia: "En cada consulta — guía los ajustes de dosis" },
      { parametro: "Potasio sérico", frecuencia: "Si hay factores de riesgo de hipopotasemia (ERC, diuréticos, dosis altas)" },
    ],
    educacionPaciente: {
      queEs: "Reemplaza o complementa la insulina que el cuerpo ya no produce lo suficiente; esta es de acción prolongada ('basal'), cubre las 24 horas del día sin importar la comida.",
      comoTomarlo: "Inyección subcutánea, aproximadamente a la misma hora cada día; rotar el sitio de inyección (abdomen, muslo, brazo) para evitar bultos bajo la piel que hacen que el medicamento se absorba de forma irregular.",
      siOlvidaDosis: "Aplicarla en cuanto se recuerde; si ya casi es hora de la siguiente dosis, consultar con su médico el ajuste — no duplicar sin indicación.",
      senalesAlarma: [
        "Temblor, sudoración fría, confusión, hambre repentina, latido rápido (hipoglucemia) — regla de 15: tomar 15 g de azúcar de acción rápida, esperar 15 min, repetir si persiste",
        "Confusión severa, convulsiones o pérdida de conciencia — es una urgencia, buscar ayuda inmediata",
        "Bulto duro o hundimiento en la piel donde se inyecta habitualmente (rotar el sitio)",
      ],
    },
    fuentes: [
      { texto: "Goodman & Gilman — Bases Farmacológicas de la Terapéutica, 13ª ed., cap. 47" },
      { texto: "FDA Prescribing Information — Insulina Glargina (DailyMed)" },
      { texto: "ADA Standards of Care in Diabetes — 2026" },
    ],
    hipo: "moderado", peso: "ganancia", costo: 2, egfrMin: 0, contra: [],
    efectoCurva: { peakReduction: 0.05, baselineReduction: 30, delayHoras: 0 } },

  { id: "DEGLU", cat: "antidiabetic", grp: "Insulina Basal", name: "Insulina Degludec", ini: "0.1-0.2 U/kg/día", mant: "Titular c/3-5 días",
    adv: "Menor incidencia de hipoglucemia nocturna que glargina.",
    mecanismo: "Forma multihexámeros solubles en el tejido subcutáneo que liberan monómeros de insulina de forma ultra-lenta y estable, prolongando su duración de acción.",
    vidaMediaHoras: 25, vidaMediaLabel: "~25 h (ultra-larga)", reduccionA1c: "1.5-3.5%",
    titr: { l: ["Inicio", "Sem 1", "Sem 2"], d: [10, 14, 18] },
    benef: { ic: false, erc: false, ascvd: false, stroke: false, masld: false },
    mecanismoDetalle: "Análogo de insulina de acción ultra-larga: forma multihexámeros solubles en el tejido subcutáneo (mediante una cadena lateral de ácido graso que promueve auto-asociación) que se disocian muy lentamente, liberando monómeros de insulina de forma estable durante más de 24 horas (t½ ~25 h, duración >42 h). Este perfil más plano y estable frente a glargina se traduce en menor variabilidad día a día y menor incidencia de hipoglucemia nocturna. Mismo mecanismo celular que el resto de las insulinas (receptor de insulina → translocación de GLUT4 → captación de glucosa).",
    mecanismoPasos: [
      "Inyección subcutánea → formación de multihexámeros solubles",
      "Disociación ultra-lenta → liberación estable de monómeros (>24-42 h)",
      "Unión al receptor de insulina (hígado, músculo, tejido adiposo)",
      "↑ Translocación de GLUT4 → ↑ captación celular de glucosa",
      "Perfil basal más plano que glargina — menor hipoglucemia nocturna",
    ],
    efectosAdversos: {
      frecuentes: ["Hipoglucemia (menor riesgo nocturno que glargina)", "Ganancia de peso", "Reacciones/lipohipertrofia en el sitio de inyección"],
      graves: ["Hipoglucemia severa", "Hipopotasemia", "Reacción alérgica sistémica (rara)"],
    },
    contraindicacionesDetalle: [
      { condicion: "Hipoglucemia activa", razon: "No administrar durante un episodio de hipoglucemia" },
      { condicion: "Hipersensibilidad al producto específico", razon: "Reacción alérgica documentada" },
    ],
    monitoreo: [
      { parametro: "Glucosa capilar/sensor (ayuno y pre-dosis)", frecuencia: "Diario durante titulación" },
      { parametro: "Episodios de hipoglucemia, especialmente nocturnos", frecuencia: "En cada consulta" },
    ],
    educacionPaciente: {
      queEs: "Insulina de acción muy prolongada que cubre las 24 horas del día con menor riesgo de bajas de azúcar durante la noche que otras insulinas basales.",
      comoTomarlo: "Inyección subcutánea, aproximadamente a la misma hora cada día (permite algo más de flexibilidad de horario que glargina); rotar el sitio de inyección.",
      siOlvidaDosis: "Aplicarla en cuanto se recuerde, siempre que hayan pasado al menos 8 horas desde la última dosis — consultar con su médico el ajuste específico.",
      senalesAlarma: [
        "Temblor, sudoración fría, confusión, hambre repentina (hipoglucemia) — regla de 15",
        "Confusión severa, convulsiones o pérdida de conciencia — urgencia",
        "Bulto duro o hundimiento en la piel donde se inyecta habitualmente",
      ],
    },
    fuentes: [
      { texto: "Goodman & Gilman — Bases Farmacológicas de la Terapéutica, 13ª ed., cap. 47" },
      { texto: "FDA Prescribing Information — Insulina Degludec (DailyMed)" },
    ],
    hipo: "bajo", peso: "ganancia", costo: 3, egfrMin: 0, contra: [],
    efectoCurva: { peakReduction: 0.05, baselineReduction: 30, delayHoras: 0 } },

  // ---- Ampliación por subgrupo (Compendio de Fármacos por Grupos Terapéuticos,
  // verificado ADA/AACE/AHA 2026) — 1-3 fármacos nuevos por cada subgrupo que
  // el motor aún no cubría, sin duplicar los que ya existían arriba. ----
  { id: "GLIB", cat: "antidiabetic", grp: "Sulfonilurea", name: "Glibenclamida", ini: "2.5 mg", mant: "10 mg",
    adv: "Sulfonilurea de mayor riesgo de hipoglucemia de la clase (vida media más larga). Evitar en adultos mayores o ERC.",
    mecanismo: "Cierra los canales KATP de la célula beta pancreática, estimulando la secreción de insulina de forma NO glucosa-dependiente; sus metabolitos activos prolongan el riesgo de hipoglucemia.",
    vidaMediaHoras: 10, vidaMediaLabel: "~10 h (metabolitos activos prolongan el efecto)", reduccionA1c: "1.0-1.5%",
    titr: { l: ["Inicio", "Sem 2"], d: [2.5, 10] },
    benef: { ic: false, erc: false, ascvd: false, stroke: false, masld: false },
    mecanismoDetalle: "Igual mecanismo de clase que el resto de las sulfonilureas (cierre de canales KATP-SUR1 en célula β → secreción de insulina NO glucosa-dependiente), pero con metabolitos activos que prolongan su efecto más allá de la vida media del fármaco original, lo que la convierte en la sulfonilurea de MAYOR riesgo de hipoglucemia de la clase — especialmente en adultos mayores o con función renal reducida, donde los metabolitos se acumulan.",
    mecanismoPasos: [
      "Cierre de canales KATP (SUR1) en la célula β pancreática",
      "Despolarización + apertura de canales de Ca2+",
      "Exocitosis de insulina (NO glucosa-dependiente)",
      "Metabolitos activos prolongan el efecto más allá de la vida media del fármaco",
      "↓ Glucemia — con el MAYOR riesgo de hipoglucemia de la clase",
    ],
    efectosAdversos: {
      frecuentes: ["Hipoglucemia (mayor riesgo de la clase)", "Ganancia de peso"],
      graves: [
        "Hipoglucemia severa prolongada (por acumulación de metabolitos activos, especialmente en adultos mayores/ERC)",
        "Reacción tipo disulfiram con alcohol",
      ],
    },
    contraindicacionesDetalle: [
      { condicion: "Adultos mayores (uso preferentemente evitado)", razon: "Mayor riesgo de hipoglucemia severa/prolongada por acumulación de metabolitos" },
      { condicion: "eGFR < 30 mL/min/1.73m²", razon: "Acumulación de metabolitos activos" },
      { condicion: "Antecedente de hipoglucemias severas", razon: "Riesgo NO glucosa-dependiente" },
      { condicion: "Embarazo", razon: "Preferir insulina" },
    ],
    monitoreo: [
      { parametro: "Episodios de hipoglucemia", frecuencia: "En cada consulta — es la sulfonilurea de mayor riesgo; considerar cambio a gliclazida si hay hipoglucemias" },
    ],
    educacionPaciente: {
      queEs: "Estimula al páncreas a liberar más insulina; entre los medicamentos de este tipo, es el que más riesgo tiene de causar bajas de azúcar.",
      comoTomarlo: "Con la primera comida principal del día; no omitir comidas después de tomarla.",
      siOlvidaDosis: "Si olvida la dosis Y también la comida, no tomarla después sin alimento.",
      senalesAlarma: [
        "Temblor, sudoración fría, confusión, hambre repentina — tratar de inmediato con azúcar de acción rápida",
        "Bajas de azúcar que se repiten varias horas después de tomarla (por los metabolitos activos)",
      ],
    },
    fuentes: [
      { texto: "Goodman & Gilman — Bases Farmacológicas de la Terapéutica, 13ª ed., cap. 47" },
      { texto: "FDA Prescribing Information — Glibenclamida (DailyMed)" },
    ],
    hipo: "alto", peso: "ganancia", costo: 1, egfrMin: 30, contra: ["HIPOGLUCEMIA", "EMBARAZO"],
    efectoCurva: { peakReduction: 0.30, baselineReduction: 8, delayHoras: 0 } },

  { id: "GLICLA", cat: "antidiabetic", grp: "Sulfonilurea", name: "Gliclazida", ini: "30 mg", mant: "120 mg",
    adv: "Menor riesgo de hipoglucemia que glibenclamida dentro de la clase. Liberación prolongada permite toma única diaria.",
    mecanismo: "Cierre de canales KATP igual que el resto de la clase, con mayor selectividad por el receptor SUR1 pancreático, lo que reduce el riesgo de hipoglucemia frente a glibenclamida.",
    vidaMediaHoras: 10, vidaMediaLabel: "~10-12 h", reduccionA1c: "1.0-1.5%",
    titr: { l: ["Inicio", "Sem 4"], d: [30, 120] },
    benef: { ic: false, erc: false, ascvd: false, stroke: false, masld: false },
    mecanismoDetalle: "Igual mecanismo de clase (cierre de canales KATP-SUR1 → secreción de insulina NO glucosa-dependiente), pero con mayor selectividad por el receptor SUR1 pancreático frente a los canales KATP cardiovasculares, y formulación de liberación prolongada que da un perfil de liberación más gradual — ambas características reducen el riesgo de hipoglucemia frente a glibenclamida, siendo la sulfonilurea de menor riesgo relativo dentro de la clase.",
    mecanismoPasos: [
      "Cierre de canales KATP (SUR1, mayor selectividad pancreática) en célula β",
      "Despolarización + apertura de canales de Ca2+",
      "Exocitosis de insulina (NO glucosa-dependiente)",
      "Liberación prolongada → perfil más gradual que glibenclamida",
      "↓ Glucemia — menor riesgo de hipoglucemia dentro de la clase",
    ],
    efectosAdversos: {
      frecuentes: ["Hipoglucemia (menor riesgo que glibenclamida, pero presente)", "Ganancia de peso"],
      graves: ["Hipoglucemia severa, especialmente en ayuno prolongado o ERC avanzada", "Reacción tipo disulfiram con alcohol"],
    },
    contraindicacionesDetalle: [
      { condicion: "eGFR < 30 mL/min/1.73m²", razon: "Menor margen de seguridad con acumulación" },
      { condicion: "Antecedente de hipoglucemias severas", razon: "Riesgo NO glucosa-dependiente, aunque menor que glibenclamida" },
      { condicion: "Embarazo", razon: "Preferir insulina" },
    ],
    monitoreo: [
      { parametro: "Episodios de hipoglucemia", frecuencia: "En cada consulta" },
    ],
    educacionPaciente: {
      queEs: "Estimula al páncreas a liberar más insulina; dentro de este tipo de medicamentos, tiene menor riesgo de bajas de azúcar.",
      comoTomarlo: "Una vez al día, con la primera comida principal (liberación prolongada).",
      siOlvidaDosis: "Tomarla en cuanto se recuerde ese mismo día, con alimento; si ya casi es hora de la siguiente, omitir la olvidada.",
      senalesAlarma: [
        "Temblor, sudoración fría, confusión, hambre repentina — tratar de inmediato con azúcar de acción rápida",
      ],
    },
    fuentes: [
      { texto: "Goodman & Gilman — Bases Farmacológicas de la Terapéutica, 13ª ed., cap. 47" },
      { texto: "FDA Prescribing Information — Gliclazida" },
    ],
    hipo: "moderado", peso: "ganancia", costo: 1, egfrMin: 30, contra: ["HIPOGLUCEMIA", "EMBARAZO"],
    efectoCurva: { peakReduction: 0.30, baselineReduction: 8, delayHoras: 0 } },

  { id: "REPA", cat: "antidiabetic", grp: "Meglitinida", name: "Repaglinida", ini: "0.5 mg por comida", mant: "4 mg por comida",
    adv: "Acción rápida y corta preprandial; alternativa a sulfonilurea en horarios de comida irregulares o ERC (metabolismo hepático).",
    mecanismo: "Cierra los canales KATP de la célula beta, con unión e inicio/fin de acción mucho más rápidos que las sulfonilureas, limitando su efecto al periodo posprandial.",
    vidaMediaHoras: 1, vidaMediaLabel: "~1 h", reduccionA1c: "0.5-1.0%",
    titr: { l: ["Inicio", "Sem 2"], d: [0.5, 4] },
    benef: { ic: false, erc: false, ascvd: false, stroke: false, masld: false },
    mecanismoDetalle: "Secretagogo de insulina de la clase meglitinida: cierra los canales KATP de la célula β en un sitio de unión distinto al de las sulfonilureas, con inicio y fin de acción mucho más rápidos (t½ ~1 h). Esto limita su efecto casi exclusivamente al periodo posprandial inmediato, lo que la hace útil en pacientes con horarios de comida irregulares — si se omite la comida, se omite la dosis. Se metaboliza principalmente por CYP3A4 hepático, por lo que es una alternativa razonable a sulfonilurea en ERC.",
    mecanismoPasos: [
      "Cierre rápido de canales KATP en célula β (sitio de unión distinto a sulfonilureas)",
      "Despolarización + apertura de canales de Ca2+",
      "Exocitosis de insulina — inicio y fin de acción muy rápidos",
      "Efecto limitado al periodo posprandial (t½ ~1 h)",
      "↓ Glucemia posprandial con menor riesgo de hipoglucemia interprandial",
    ],
    efectosAdversos: {
      frecuentes: ["Hipoglucemia (menor riesgo que sulfonilureas, pero presente si se toma sin comer)", "Ganancia de peso leve"],
      graves: ["Hipoglucemia si se toma la dosis y se omite la comida"],
    },
    contraindicacionesDetalle: [
      { condicion: "Insuficiencia hepática significativa", razon: "Metabolismo principalmente hepático (CYP3A4)" },
      { condicion: "Uso concomitante de gemfibrozilo", razon: "Inhibe su metabolismo — puede aumentar niveles casi al doble, riesgo de hipoglucemia" },
      { condicion: "Embarazo", razon: "Preferir insulina" },
    ],
    monitoreo: [
      { parametro: "Relación entre horario de comidas y dosis", frecuencia: "Reforzar en cada consulta — es la causa más común de hipoglucemia con este fármaco" },
    ],
    educacionPaciente: {
      queEs: "Ayuda al páncreas a liberar insulina rápido justo cuando se come, para controlar el pico de azúcar después de la comida.",
      comoTomarlo: "0-30 minutos antes de cada comida principal — si se salta una comida, se salta esa dosis (regla simple: 'sin comida, sin pastilla').",
      siOlvidaDosis: "Si ya empezó a comer sin haberla tomado, omitir esa dosis y tomarla antes de la siguiente comida.",
      senalesAlarma: [
        "Temblor, sudoración fría, confusión (posible baja de azúcar, sobre todo si tomó la dosis sin comer)",
      ],
    },
    fuentes: [
      { texto: "Goodman & Gilman — Bases Farmacológicas de la Terapéutica, 13ª ed., cap. 47" },
      { texto: "FDA Prescribing Information — Repaglinida" },
    ],
    hipo: "moderado", peso: "ganancia", costo: 1, egfrMin: 0, contra: ["EMBARAZO"],
    efectoCurva: { peakReduction: 0.30, baselineReduction: 3, delayHoras: 0 } },

  { id: "NATE", cat: "antidiabetic", grp: "Meglitinida", name: "Nateglinida", ini: "60 mg por comida", mant: "120 mg por comida",
    adv: "Efecto posprandial predecible pero reducción de A1c menor que repaglinida.",
    mecanismo: "Estimula la secreción de insulina cerrando canales KATP, con inicio de acción muy rápido (minutos) y vida media corta.",
    vidaMediaHoras: 1.5, vidaMediaLabel: "~1.5 h", reduccionA1c: "0.5-0.8%",
    titr: { l: ["Inicio", "Sem 2"], d: [60, 120] },
    benef: { ic: false, erc: false, ascvd: false, stroke: false, masld: false },
    mecanismoDetalle: "Secretagogo de insulina derivado de la D-fenilalanina, mecanismo similar a repaglinida (cierre de canales KATP en célula β en un sitio distinto a las sulfonilureas), con un inicio de acción aún más rápido (minutos) y vida media más corta (~1.5 h). Produce una secreción de insulina más rápida pero menos sostenida que otros secretagogos, por lo que su efecto principal es reducir el pico posprandial más que la glucosa basal — de ahí su menor reducción de A1c frente a repaglinida.",
    mecanismoPasos: [
      "Cierre rápido de canales KATP en célula β",
      "Secreción de insulina rápida pero poco sostenida",
      "Efecto limitado casi exclusivamente al pico posprandial inmediato",
      "↓ Glucemia posprandial (efecto menor sobre A1c que repaglinida)",
    ],
    efectosAdversos: {
      frecuentes: ["Hipoglucemia leve (menos frecuente que con repaglinida)", "Síntomas gripales/infección respiratoria en ensayos clínicos"],
      graves: ["Hipoglucemia si se toma sin alimento"],
    },
    contraindicacionesDetalle: [
      { condicion: "Insuficiencia hepática significativa", razon: "Metabolismo hepático (CYP2C9/3A4)" },
      { condicion: "Embarazo", razon: "Preferir insulina" },
    ],
    monitoreo: [
      { parametro: "Relación entre horario de comidas y dosis", frecuencia: "Reforzar en cada consulta" },
    ],
    educacionPaciente: {
      queEs: "Ayuda al páncreas a liberar insulina muy rápido justo al comer, para controlar el pico de azúcar después de la comida.",
      comoTomarlo: "1-10 minutos antes de cada comida principal — si se salta una comida, se salta esa dosis.",
      siOlvidaDosis: "Si ya empezó a comer sin haberla tomado, omitir esa dosis.",
      senalesAlarma: ["Temblor, sudoración fría, confusión (posible baja de azúcar)"],
    },
    fuentes: [
      { texto: "Goodman & Gilman — Bases Farmacológicas de la Terapéutica, 13ª ed., cap. 47" },
      { texto: "FDA Prescribing Information — Nateglinida" },
    ],
    hipo: "moderado", peso: "ganancia", costo: 1, egfrMin: 0, contra: ["EMBARAZO"],
    efectoCurva: { peakReduction: 0.25, baselineReduction: 2, delayHoras: 0 } },

  { id: "ROSI", cat: "antidiabetic", grp: "TZD", name: "Rosiglitazona", ini: "4 mg", mant: "8 mg",
    adv: "Uso reservado por señal histórica de riesgo isquémico coronario (meta-análisis Nissen 2007); pioglitazona es preferida dentro de la clase. Evitar en IC.",
    mecanismo: "Agonista de PPAR-γ, mismo mecanismo que pioglitazona (mejora la sensibilidad periférica a la insulina), con perfil lipídico menos favorable.",
    vidaMediaHoras: 4, vidaMediaLabel: "~3-4 h", reduccionA1c: "1.0-1.4%",
    titr: { l: ["Inicio", "Sem 4"], d: [4, 8] },
    benef: { ic: false, erc: false, ascvd: false, stroke: false, masld: false },
    mecanismoDetalle: "Mismo mecanismo que pioglitazona (agonismo de PPAR-γ → redistribución de grasa y ↑ sensibilidad periférica a la insulina), pero con perfil lipídico menos favorable (↑LDL-C, sin el beneficio en triglicéridos de pioglitazona) y una señal histórica de ↑ riesgo isquémico coronario (meta-análisis Nissen 2007) que llevó a restricciones de prescripción en varios países. Por esto, pioglitazona es preferida dentro de la clase cuando se necesita un agonista PPAR-γ.",
    mecanismoPasos: [
      "Activación del receptor nuclear PPAR-γ",
      "Diferenciación adipocítica + redistribución de grasa",
      "↑ Captura de glucosa mediada por insulina en músculo esquelético",
      "↑ LDL-C (a diferencia de pioglitazona)",
      "↓ Glucemia (efecto máximo en 1-3 meses)",
    ],
    efectosAdversos: {
      frecuentes: ["Ganancia de peso", "Edema periférico", "↑ LDL-C"],
      graves: [
        "Insuficiencia cardiaca — retención de líquidos, contraindicada en IC clase III/IV NYHA",
        "Señal histórica de ↑ riesgo isquémico coronario (meta-análisis Nissen 2007) — uso reservado",
        "↑ Riesgo de fracturas óseas",
      ],
    },
    contraindicacionesDetalle: [
      { condicion: "Insuficiencia cardiaca clase III/IV NYHA", razon: "Retención de líquidos puede precipitar/agravar edema pulmonar" },
      { condicion: "Enfermedad coronaria activa o alto riesgo isquémico", razon: "Señal histórica de riesgo isquémico — preferir pioglitazona" },
      { condicion: "Embarazo", razon: "Datos insuficientes de seguridad" },
    ],
    monitoreo: [
      { parametro: "Signos de retención de líquidos/IC", frecuencia: "En cada consulta, especialmente los primeros meses" },
      { parametro: "Perfil lipídico (LDL-C)", frecuencia: "Periódico, dado el efecto desfavorable sobre LDL-C" },
    ],
    educacionPaciente: {
      queEs: "Ayuda a que el cuerpo use mejor su propia insulina; su uso es menos frecuente hoy por dudas sobre seguridad cardiovascular.",
      comoTomarlo: "Una vez al día, con o sin alimentos.",
      siOlvidaDosis: "Tomarla en cuanto se recuerde ese mismo día; si ya casi es hora de la siguiente, omitir la olvidada — no duplicar.",
      senalesAlarma: [
        "Hinchazón de piernas/tobillos o dificultad para respirar (posible retención de líquidos)",
        "Dolor en el pecho (comentarlo de inmediato)",
      ],
    },
    fuentes: [
      { texto: "Goodman & Gilman — Bases Farmacológicas de la Terapéutica, 13ª ed., cap. 47" },
      { texto: "Meta-análisis Nissen 2007 (NEJM); FDA Prescribing Information — Rosiglitazona" },
    ],
    hipo: "bajo", peso: "ganancia", costo: 1, egfrMin: 0, contra: ["IC", "EMBARAZO"],
    efectoCurva: { peakReduction: 0.10, baselineReduction: 12, delayHoras: 0 } },

  { id: "ALOG", cat: "antidiabetic", grp: "iDPP-4", name: "Alogliptina", ini: "25 mg", mant: "25 mg",
    adv: "Perfil de seguridad CV neutro (EXAMINE). Ajustar dosis en ERC.",
    mecanismo: "Inhibe DPP-4, prolongando la actividad de las incretinas endógenas GLP-1/GIP.",
    vidaMediaHoras: 21, vidaMediaLabel: "~21 h", reduccionA1c: "0.5-0.8%",
    titr: { l: ["Inicio"], d: [25] },
    benef: { ic: false, erc: false, ascvd: false, stroke: false, masld: false },
    mecanismoDetalle: "Mismo mecanismo de clase que sitagliptina/linagliptina (inhibición de DPP-4 → prolonga GLP-1/GIP endógenos). Cuenta con el ensayo dedicado de seguridad cardiovascular EXAMINE, con resultado neutro (sin aumento ni reducción de eventos CV mayores), a diferencia de saxagliptina que mostró señal de mayor hospitalización por IC.",
    mecanismoPasos: [
      "Inhibición de la enzima DPP-4",
      "↑ Vida media de GLP-1/GIP endógenos post-prandiales",
      "↑ Secreción de insulina glucosa-dependiente + ↓ glucagón",
      "↓ Glucemia posprandial (efecto modesto, neutro en peso, perfil CV neutro)",
    ],
    efectosAdversos: {
      frecuentes: ["Generalmente bien tolerada", "Nasofaringitis, cefalea"],
      graves: [
        "Artralgia grave e incapacitante (alerta de la FDA, efecto de clase)",
        "Pancreatitis aguda (reportes post-comercialización)",
        "Penfigoide ampolloso (efecto de clase)",
      ],
    },
    contraindicacionesDetalle: [
      { condicion: "Antecedente de pancreatitis", razon: "Reportes post-comercialización" },
      { condicion: "Embarazo", razon: "Datos insuficientes de seguridad" },
    ],
    monitoreo: [
      { parametro: "Dolor articular de nueva aparición", frecuencia: "Preguntar en cada consulta" },
      { parametro: "Función renal", frecuencia: "Requiere ajuste de dosis según eGFR" },
    ],
    educacionPaciente: {
      queEs: "Ayuda a que las hormonas naturales del cuerpo que regulan el azúcar duren más tiempo activas después de comer.",
      comoTomarlo: "Una vez al día, con o sin alimentos.",
      siOlvidaDosis: "Tomarla en cuanto se recuerde ese mismo día; si ya casi es hora de la siguiente, omitir la olvidada.",
      senalesAlarma: ["Dolor articular intenso de aparición nueva", "Ampollas en la piel", "Dolor abdominal intenso irradiado a la espalda"],
    },
    fuentes: [
      { texto: "Goodman & Gilman — Bases Farmacológicas de la Terapéutica, 13ª ed., cap. 47" },
      { texto: "Ensayo EXAMINE; FDA Prescribing Information — Alogliptina" },
    ],
    hipo: "bajo", peso: "neutro", costo: 2, egfrMin: 0, contra: ["EMBARAZO"],
    efectoCurva: { peakReduction: 0.15, baselineReduction: 3, delayHoras: 0 } },

  { id: "SAXA", cat: "antidiabetic", grp: "iDPP-4", name: "Saxagliptina", ini: "5 mg", mant: "5 mg",
    adv: "SAVOR-TIMI 53 mostró más hospitalizaciones por IC — evitar si hay IC o alto riesgo de IC.",
    mecanismo: "Inhibe DPP-4 de forma selectiva y reversible, prolongando la actividad de GLP-1/GIP endógenos.",
    vidaMediaHoras: 3, vidaMediaLabel: "~2-4 h (metabolito activo prolonga el efecto)", reduccionA1c: "0.5-0.8%",
    titr: { l: ["Inicio"], d: [5] },
    benef: { ic: false, erc: false, ascvd: false, stroke: false, masld: false },
    mecanismoDetalle: "Mismo mecanismo de clase (inhibición de DPP-4 → prolonga GLP-1/GIP endógenos). Se distingue del resto de la clase por la señal de seguridad del ensayo SAVOR-TIMI 53: mayor tasa de hospitalización por insuficiencia cardiaca frente a placebo, por lo que debe evitarse en pacientes con IC establecida o alto riesgo de IC — a diferencia de sitagliptina/alogliptina/linagliptina, que tuvieron ensayos CV neutros sin esta señal.",
    mecanismoPasos: [
      "Inhibición de la enzima DPP-4",
      "↑ Vida media de GLP-1/GIP endógenos post-prandiales",
      "↑ Secreción de insulina glucosa-dependiente + ↓ glucagón",
      "↓ Glucemia posprandial — con señal de ↑ hospitalización por IC (SAVOR-TIMI 53)",
    ],
    efectosAdversos: {
      frecuentes: ["Generalmente bien tolerada", "Nasofaringitis, cefalea"],
      graves: [
        "↑ Hospitalización por insuficiencia cardiaca (SAVOR-TIMI 53) — evitar en IC o alto riesgo de IC",
        "Artralgia grave e incapacitante (alerta de la FDA, efecto de clase)",
        "Pancreatitis aguda (reportes post-comercialización)",
      ],
    },
    contraindicacionesDetalle: [
      { condicion: "Insuficiencia cardiaca establecida o alto riesgo de IC", razon: "Señal de mayor hospitalización por IC en SAVOR-TIMI 53 — preferir otro iDPP-4" },
      { condicion: "Antecedente de pancreatitis", razon: "Reportes post-comercialización" },
      { condicion: "Embarazo", razon: "Datos insuficientes de seguridad" },
    ],
    monitoreo: [
      { parametro: "Signos de insuficiencia cardiaca (edema, disnea)", frecuencia: "En cada consulta, dada la señal de SAVOR-TIMI 53" },
      { parametro: "Dolor articular de nueva aparición", frecuencia: "Preguntar en cada consulta" },
    ],
    educacionPaciente: {
      queEs: "Ayuda a que las hormonas naturales del cuerpo que regulan el azúcar duren más tiempo activas después de comer.",
      comoTomarlo: "Una vez al día, con o sin alimentos.",
      siOlvidaDosis: "Tomarla en cuanto se recuerde ese mismo día; si ya casi es hora de la siguiente, omitir la olvidada.",
      senalesAlarma: [
        "Hinchazón de piernas/tobillos o dificultad para respirar (posible insuficiencia cardiaca)",
        "Dolor articular intenso de aparición nueva",
      ],
    },
    fuentes: [
      { texto: "Goodman & Gilman — Bases Farmacológicas de la Terapéutica, 13ª ed., cap. 47" },
      { texto: "Ensayo SAVOR-TIMI 53; FDA Prescribing Information — Saxagliptina" },
    ],
    hipo: "bajo", peso: "neutro", costo: 2, egfrMin: 0, contra: ["IC", "EMBARAZO"],
    efectoCurva: { peakReduction: 0.15, baselineReduction: 3, delayHoras: 0 } },

  { id: "ERTU", cat: "antidiabetic", grp: "iSGLT2", name: "Ertugliflozina", ini: "5 mg", mant: "15 mg",
    adv: "Menos evidencia de desenlaces duros (VERTIS-CV neutro para MACE) frente a otros iSGLT2 — preferir dapa/empa/cana si hay IC/ERC/ASCVD.",
    mecanismo: "Inhibe SGLT2 renal, reduciendo la reabsorción tubular de glucosa filtrada.",
    vidaMediaHoras: 17, vidaMediaLabel: "~17 h", reduccionA1c: "0.6-0.9%",
    titr: { l: ["Inicio", "Mes 1"], d: [5, 15] },
    benef: { ic: false, erc: false, ascvd: false, stroke: false, masld: false },
    mecanismoDetalle: "Mismo mecanismo de clase que dapa/empa/cana (inhibición de SGLT2 renal → glucosuria insulino-independiente). Su diferenciador clínico es que el ensayo dedicado de desenlaces CV (VERTIS-CV) fue neutro para MACE (no mostró el mismo beneficio de reducción de eventos cardiovasculares mayores que empagliflozina o canagliflozina), por lo que dentro de la clase se prefieren dapa/empa/cana cuando el objetivo es cobertura de IC, ERC o ASCVD.",
    mecanismoPasos: [
      "Inhibición del cotransportador SGLT2 en túbulo proximal renal",
      "↓ Reabsorción tubular de glucosa filtrada",
      "Glucosuria insulino-independiente",
      "↓ Glucemia + pérdida de peso (sin el mismo beneficio CV/renal duro que otros iSGLT2)",
    ],
    efectosAdversos: {
      frecuentes: [
        "Infecciones micóticas genitales (3-5%)",
        "Infección de tracto urinario bajo",
        "Poliuria/depleción de volumen leve",
      ],
      graves: [
        "Cetoacidosis diabética euglucémica (rara; efecto de clase)",
        "Riesgo de fractura/amputación bajo vigilancia (efecto de clase, menos estudiado que canagliflozina)",
      ],
    },
    contraindicacionesDetalle: [
      { condicion: "eGFR < 30 mL/min/1.73m²", razon: "Pérdida de eficacia glucémica" },
      { condicion: "Diabetes tipo 1", razon: "No indicado; mayor riesgo de cetoacidosis euglucémica" },
      { condicion: "Depleción de volumen no corregida", razon: "El efecto diurético osmótico puede agravar la hipotensión" },
    ],
    monitoreo: [
      { parametro: "Función renal (eGFR)", frecuencia: "Basal y periódico" },
      { parametro: "Signos de depleción de volumen y cetonas", frecuencia: "Igual que el resto de la clase" },
    ],
    educacionPaciente: {
      queEs: "Ayuda a eliminar azúcar extra por la orina; suele acompañarse de pérdida de peso, aunque tiene menos evidencia de protección cardiovascular que otros de su tipo.",
      comoTomarlo: "Una vez al día, en la mañana, con o sin alimentos.",
      siOlvidaDosis: "Tomarla en cuanto se recuerde ese mismo día; si ya casi es hora de la siguiente, omitir la olvidada.",
      senalesAlarma: [
        "Comezón o ardor genital inusual (posible infección micótica)",
        "Ardor al orinar (posible infección urinaria)",
        "Náusea, vómito o cansancio extremo (posible cetoacidosis)",
      ],
    },
    fuentes: [
      { texto: "Goodman & Gilman — Bases Farmacológicas de la Terapéutica, 13ª ed., cap. 47" },
      { texto: "Ensayo VERTIS-CV; FDA Prescribing Information — Ertugliflozina" },
    ],
    hipo: "bajo", peso: "perdida", costo: 3, egfrMin: 30, contra: ["EMBARAZO"],
    efectoCurva: { peakReduction: 0.12, baselineReduction: 10, delayHoras: 0 } },

  { id: "MIGL", cat: "antidiabetic", grp: "AGI", name: "Miglitol", ini: "25 mg", mant: "100 mg",
    adv: "Alternativa a acarbosa con perfil de efectos GI similar; se absorbe sistémicamente (acarbosa no).",
    mecanismo: "Inhibe las alfa-glucosidasas intestinales, retrasando la digestión de carbohidratos complejos y aplanando el pico posprandial.",
    vidaMediaHoras: 2, vidaMediaLabel: "~2 h", reduccionA1c: "0.5-0.8%",
    titr: { l: ["Inicio", "Sem 4"], d: [25, 100] },
    benef: { ic: false, erc: false, ascvd: false, stroke: false, masld: false },
    mecanismoDetalle: "Mismo mecanismo que acarbosa (inhibición de alfa-glucosidasas intestinales → retraso de la digestión/absorción de carbohidratos), pero a diferencia de acarbosa SÍ se absorbe sistémicamente (50-100% de la dosis), eliminándose casi en su totalidad por vía renal — por lo que requiere reducción de dosis con eliminación de creatinina <30 mL/min, una precaución que acarbosa no necesita.",
    mecanismoPasos: [
      "Inhibición de alfa-glucosidasas intestinales (borde en cepillo)",
      "↓ Digestión de disacáridos/oligosacáridos a monosacáridos absorbibles",
      "Retraso y aplanamiento de la absorción de carbohidratos",
      "Absorción sistémica parcial (50-100%) → eliminación renal",
      "↓ Pico de glucosa posprandial",
    ],
    efectosAdversos: {
      frecuentes: ["Flatulencia, distensión abdominal", "Diarrea"],
      graves: ["Elevación de transaminasas hepáticas (rara)"],
    },
    contraindicacionesDetalle: [
      { condicion: "Enfermedad inflamatoria intestinal u obstrucción", razon: "Enlentece el tránsito intestinal de carbohidratos no digeridos" },
      { condicion: "eGFR < 30 mL/min/1.73m² (eliminación de creatinina <30 mL/min)", razon: "Eliminación predominantemente renal — requiere reducción de dosis" },
      { condicion: "Embarazo", razon: "Datos insuficientes de seguridad" },
    ],
    monitoreo: [
      { parametro: "Tolerancia GI", frecuencia: "En cada ajuste de dosis" },
      { parametro: "Función renal", frecuencia: "Basal — a diferencia de acarbosa, sí requiere ajuste renal" },
    ],
    educacionPaciente: {
      queEs: "Retrasa la absorción de los carbohidratos de la comida para evitar picos de azúcar después de comer.",
      comoTomarlo: "Con el PRIMER bocado de cada comida principal.",
      siOlvidaDosis: "Si olvida tomarla al inicio de la comida y ya avanzó, omitir esa dosis.",
      senalesAlarma: [
        "IMPORTANTE: si tiene una baja de azúcar mientras toma este medicamento junto con insulina o sulfonilurea, trátela con GLUCOSA PURA, NO con azúcar de mesa",
        "Distensión o dolor abdominal muy intenso",
      ],
    },
    fuentes: [
      { texto: "Goodman & Gilman — Bases Farmacológicas de la Terapéutica, 13ª ed., cap. 47" },
      { texto: "FDA Prescribing Information — Miglitol" },
    ],
    hipo: "bajo", peso: "neutro", costo: 1, egfrMin: 0, contra: ["EMBARAZO"],
    efectoCurva: { peakReduction: 0.35, baselineReduction: 0, delayHoras: 0.5 } },

  { id: "DETE", cat: "antidiabetic", grp: "Insulina Basal", name: "Insulina Detemir", ini: "0.1-0.2 U/kg/día", mant: "Titular c/3-5 días",
    adv: "Menor ganancia de peso que NPH/glargina en algunos estudios; puede requerir 2 dosis/día en algunos pacientes.",
    mecanismo: "Análogo de insulina unido a albúmina vía cadena de ácido graso, lo que retrasa su absorción y prolonga su acción de forma más plana que la NPH.",
    vidaMediaHoras: 6, vidaMediaLabel: "~5-7 h (duración ~12-20 h)", reduccionA1c: "1.5-3.5%",
    titr: { l: ["Inicio", "Sem 1", "Sem 2"], d: [10, 14, 18] },
    benef: { ic: false, erc: false, ascvd: false, stroke: false, masld: false },
    mecanismoDetalle: "Análogo de insulina modificado con una cadena lateral de ácido graso (miristoil) que le permite unirse reversiblemente a la albúmina sérica tras la inyección subcutánea. Solo la fracción libre (no unida a albúmina) es biológicamente activa, lo que retrasa su absorción/acción y genera un perfil más plano que la NPH, aunque su duración (~12-20 h) suele ser menor que la de glargina/degludec, por lo que algunos pacientes requieren dos dosis al día para cobertura completa de 24 h.",
    mecanismoPasos: [
      "Cadena de ácido graso permite unión reversible a albúmina sérica",
      "Solo la fracción libre (no unida) es biológicamente activa",
      "Liberación retardada y perfil más plano que NPH",
      "Unión al receptor de insulina → ↑ captación celular de glucosa",
      "Duración ~12-20 h — puede requerir 2 dosis/día para cobertura de 24 h",
    ],
    efectosAdversos: {
      frecuentes: ["Hipoglucemia", "Menor ganancia de peso que NPH/glargina en algunos estudios", "Reacciones en el sitio de inyección"],
      graves: ["Hipoglucemia severa", "Hipopotasemia"],
    },
    contraindicacionesDetalle: [
      { condicion: "Hipoglucemia activa", razon: "No administrar durante un episodio de hipoglucemia" },
      { condicion: "Hipersensibilidad al producto específico", razon: "Reacción alérgica documentada" },
    ],
    monitoreo: [
      { parametro: "Glucosa capilar/sensor (ayuno y pre-dosis)", frecuencia: "Diario durante titulación; valorar necesidad de 2ª dosis si no cubre 24 h" },
      { parametro: "Episodios de hipoglucemia", frecuencia: "En cada consulta" },
    ],
    educacionPaciente: {
      queEs: "Insulina de acción prolongada; en algunas personas se necesita aplicar dos veces al día para cubrir todo el día.",
      comoTomarlo: "Inyección subcutánea, una o dos veces al día según indicación; rotar el sitio de inyección.",
      siOlvidaDosis: "Aplicarla en cuanto se recuerde — consultar con su médico el ajuste específico si usa 2 dosis al día.",
      senalesAlarma: [
        "Temblor, sudoración fría, confusión, hambre repentina (hipoglucemia) — regla de 15",
        "Confusión severa, convulsiones o pérdida de conciencia — urgencia",
      ],
    },
    fuentes: [
      { texto: "Goodman & Gilman — Bases Farmacológicas de la Terapéutica, 13ª ed., cap. 47" },
      { texto: "FDA Prescribing Information — Insulina Detemir" },
    ],
    hipo: "moderado", peso: "ganancia", costo: 2, egfrMin: 0, contra: [],
    efectoCurva: { peakReduction: 0.05, baselineReduction: 28, delayHoras: 0 } },

  { id: "NPH", cat: "antidiabetic", grp: "Insulina Basal", name: "Insulina NPH", ini: "0.1-0.2 U/kg/día", mant: "Titular según glucemia",
    adv: "Opción de menor costo cuando el acceso a análogos es limitado; mayor riesgo de hipoglucemia nocturna por su pico marcado (~4-8h).",
    mecanismo: "Insulina humana en suspensión con protamina que retrasa su absorción subcutánea, generando un perfil con pico marcado (a diferencia del perfil plano de los análogos).",
    vidaMediaHoras: 6, vidaMediaLabel: "~6 h (duración 12-18 h, con pico)", reduccionA1c: "1.5-3.5%",
    titr: { l: ["Inicio", "Sem 1", "Sem 2"], d: [10, 14, 18] },
    benef: { ic: false, erc: false, ascvd: false, stroke: false, masld: false },
    mecanismoDetalle: "Insulina humana (no análoga) en suspensión con protamina y zinc, lo que retarda su absorción desde el tejido subcutáneo. A diferencia de los análogos de acción prolongada, su perfil de liberación NO es plano: tiene un pico de acción marcado entre 4-8 horas después de la inyección y una duración total de 12-18 h, por lo que suele requerir dos dosis al día. El pico marcado es la causa directa de su mayor riesgo de hipoglucemia, especialmente nocturna si se administra antes de dormir. Es la insulina basal de menor costo, relevante donde el acceso a análogos es limitado.",
    mecanismoPasos: [
      "Suspensión con protamina y zinc retarda la absorción subcutánea",
      "Absorción con pico marcado (4-8 h post-inyección)",
      "Unión al receptor de insulina → ↑ captación celular de glucosa",
      "Duración total 12-18 h (requiere habitualmente 2 dosis/día)",
      "El pico marcado explica el mayor riesgo de hipoglucemia frente a análogos",
    ],
    efectosAdversos: {
      frecuentes: ["Hipoglucemia (mayor riesgo que análogos, por el pico marcado)", "Ganancia de peso", "Reacciones en el sitio de inyección"],
      graves: ["Hipoglucemia severa, especialmente nocturna si se administra antes de dormir", "Hipopotasemia"],
    },
    contraindicacionesDetalle: [
      { condicion: "Hipoglucemia activa", razon: "No administrar durante un episodio de hipoglucemia" },
      { condicion: "Hipersensibilidad al producto/protamina", razon: "Reacción alérgica documentada" },
    ],
    monitoreo: [
      { parametro: "Glucosa capilar/sensor, especialmente en el horario del pico (4-8 h post-dosis)", frecuencia: "Diario durante titulación" },
      { parametro: "Episodios de hipoglucemia nocturna", frecuencia: "En cada consulta — el riesgo es mayor que con análogos" },
    ],
    educacionPaciente: {
      queEs: "Insulina de acción intermedia; a diferencia de las más modernas, tiene un momento de mayor efecto (pico) unas horas después de aplicarla, por lo que es más importante comer a tiempo tras la inyección.",
      comoTomarlo: "Inyección subcutánea, habitualmente dos veces al día; agitar suavemente el frasco/pluma antes de usar (es una suspensión, no una solución transparente) — NO agitar fuerte, rodar entre las manos.",
      siOlvidaDosis: "Aplicarla en cuanto se recuerde — consultar con su médico el ajuste si ya pasó mucho tiempo.",
      senalesAlarma: [
        "Temblor, sudoración fría, confusión, hambre repentina — más probable 4-8 horas después de la inyección (el pico)",
        "Bajas de azúcar durante la noche o al despertar (posible dosis nocturna mal ajustada)",
      ],
    },
    fuentes: [
      { texto: "Goodman & Gilman — Bases Farmacológicas de la Terapéutica, 13ª ed., cap. 47" },
      { texto: "FDA Prescribing Information — Insulina NPH" },
    ],
    hipo: "alto", peso: "ganancia", costo: 1, egfrMin: 0, contra: [],
    efectoCurva: { peakReduction: 0.05, baselineReduction: 28, delayHoras: 0 } },

  { id: "LISPRO", cat: "antidiabetic", grp: "Insulina Prandial", name: "Insulina Lispro", ini: "0.05-0.1 U/kg/comida", mant: "Ajustar según glucemia posprandial",
    adv: "Análogo de acción rápida; aplicar 0-15 min antes de la comida.",
    mecanismo: "Análogo de insulina con inversión de dos aminoácidos que acelera su disociación en hexámeros, permitiendo absorción e inicio de acción más rápidos que la insulina regular.",
    vidaMediaHoras: 1, vidaMediaLabel: "~1 h (duración 3-5 h)", reduccionA1c: "N/A (ajuste posprandial)",
    titr: { l: ["Inicio"], d: [4] },
    benef: { ic: false, erc: false, ascvd: false, stroke: false, masld: false },
    mecanismoDetalle: "Análogo de insulina de acción rápida: la inversión de las posiciones B28-B29 (prolina-lisina → lisina-prolina) reduce la tendencia natural de la insulina a auto-asociarse en hexámeros en el tejido subcutáneo. Al disociarse más rápido en monómeros absorbibles, su inicio de acción (10-15 min) y su pico (~1 h) son mucho más rápidos que los de la insulina regular, imitando mejor la respuesta fisiológica a una comida. Es la base del cálculo de corrección prandial (bolo) y del ICR (relación insulina:carbohidratos) usados en EndoInsulin.",
    mecanismoPasos: [
      "Inversión B28-B29 reduce la auto-asociación en hexámeros",
      "Disociación rápida en monómeros absorbibles tras la inyección subcutánea",
      "Inicio de acción rápido (10-15 min), pico ~1 h",
      "Unión al receptor de insulina → ↑ captación celular de glucosa posprandial",
      "Duración corta (3-5 h) — imita la respuesta fisiológica a la comida",
    ],
    efectosAdversos: {
      frecuentes: ["Hipoglucemia si la dosis no corresponde a lo comido o se retrasa la comida", "Ganancia de peso", "Reacciones en el sitio de inyección"],
      graves: ["Hipoglucemia severa (mayor riesgo de la insulinoterapia si se aplica sin comer o se calcula mal el bolo)"],
    },
    contraindicacionesDetalle: [
      { condicion: "Hipoglucemia activa", razon: "No administrar durante un episodio de hipoglucemia" },
      { condicion: "Hipersensibilidad al producto específico", razon: "Reacción alérgica documentada" },
    ],
    monitoreo: [
      { parametro: "Glucosa posprandial (1-2 h después de comer)", frecuencia: "Guía el ajuste de la dosis prandial/ICR" },
      { parametro: "Concordancia entre dosis aplicada y carbohidratos consumidos", frecuencia: "En cada consulta — la causa más común de hipoglucemia con esta insulina" },
    ],
    educacionPaciente: {
      queEs: "Insulina de acción rápida que cubre el azúcar que sube al comer; actúa muy parecido a como el cuerpo respondería normalmente a una comida.",
      comoTomarlo: "Inyectar 0-15 minutos antes de empezar a comer — asegurarse de tener la comida lista o comer inmediatamente después de aplicarla.",
      siOlvidaDosis: "Si ya comió sin aplicarla, consultar con su médico — no aplicarla tarde sin ajustar, puede causar una baja de azúcar más adelante.",
      senalesAlarma: [
        "Temblor, sudoración fría, confusión, hambre repentina 1-3 horas después de la inyección (posible hipoglucemia)",
        "No comer después de aplicarla — riesgo alto de baja de azúcar",
      ],
    },
    fuentes: [
      { texto: "Goodman & Gilman — Bases Farmacológicas de la Terapéutica, 13ª ed., cap. 47" },
      { texto: "FDA Prescribing Information — Insulina Lispro" },
    ],
    hipo: "alto", peso: "ganancia", costo: 2, egfrMin: 0, contra: [],
    efectoCurva: { peakReduction: 0.40, baselineReduction: 0, delayHoras: 0 } },

  { id: "ASPART", cat: "antidiabetic", grp: "Insulina Prandial", name: "Insulina Aspart", ini: "0.05-0.1 U/kg/comida", mant: "Ajustar según glucemia posprandial",
    adv: "Análogo de acción rápida, perfil equivalente a lispro; aplicar 0-15 min antes de la comida.",
    mecanismo: "Análogo de insulina con sustitución de un aminoácido que reduce la auto-asociación en hexámeros, acelerando la absorción subcutánea frente a la insulina regular.",
    vidaMediaHoras: 1, vidaMediaLabel: "~1 h (duración 3-5 h)", reduccionA1c: "N/A (ajuste posprandial)",
    titr: { l: ["Inicio"], d: [4] },
    benef: { ic: false, erc: false, ascvd: false, stroke: false, masld: false },
    mecanismoDetalle: "Análogo de insulina de acción rápida: la sustitución de un solo aminoácido (prolina B28 → ácido aspártico) introduce una carga negativa que reduce la auto-asociación en hexámeros, acelerando la disociación en monómeros absorbibles. Perfil farmacocinético prácticamente equivalente a lispro (inicio 10-15 min, pico ~1 h, duración 3-5 h) — ambas son intercambiables en la práctica clínica para el cálculo de bolo/ICR.",
    mecanismoPasos: [
      "Sustitución B28 (prolina → ácido aspártico) reduce la auto-asociación en hexámeros",
      "Disociación rápida en monómeros absorbibles",
      "Inicio de acción rápido (10-15 min), pico ~1 h",
      "Unión al receptor de insulina → ↑ captación celular de glucosa posprandial",
      "Duración corta (3-5 h) — perfil equivalente a lispro",
    ],
    efectosAdversos: {
      frecuentes: ["Hipoglucemia si la dosis no corresponde a lo comido o se retrasa la comida", "Ganancia de peso", "Reacciones en el sitio de inyección"],
      graves: ["Hipoglucemia severa"],
    },
    contraindicacionesDetalle: [
      { condicion: "Hipoglucemia activa", razon: "No administrar durante un episodio de hipoglucemia" },
      { condicion: "Hipersensibilidad al producto específico", razon: "Reacción alérgica documentada" },
    ],
    monitoreo: [
      { parametro: "Glucosa posprandial (1-2 h después de comer)", frecuencia: "Guía el ajuste de la dosis prandial/ICR" },
      { parametro: "Concordancia entre dosis aplicada y carbohidratos consumidos", frecuencia: "En cada consulta" },
    ],
    educacionPaciente: {
      queEs: "Insulina de acción rápida que cubre el azúcar que sube al comer; funciona igual que lispro.",
      comoTomarlo: "Inyectar 0-15 minutos antes de empezar a comer.",
      siOlvidaDosis: "Si ya comió sin aplicarla, consultar con su médico — no aplicarla tarde sin ajustar.",
      senalesAlarma: [
        "Temblor, sudoración fría, confusión, hambre repentina 1-3 horas después de la inyección",
        "No comer después de aplicarla — riesgo alto de baja de azúcar",
      ],
    },
    fuentes: [
      { texto: "Goodman & Gilman — Bases Farmacológicas de la Terapéutica, 13ª ed., cap. 47" },
      { texto: "FDA Prescribing Information — Insulina Aspart" },
    ],
    hipo: "alto", peso: "ganancia", costo: 2, egfrMin: 0, contra: [],
    efectoCurva: { peakReduction: 0.40, baselineReduction: 0, delayHoras: 0 } },

  { id: "REGULAR", cat: "antidiabetic", grp: "Insulina Prandial", name: "Insulina Regular (Humana)", ini: "0.05-0.1 U/kg/comida", mant: "Ajustar según glucemia posprandial",
    adv: "Opción de menor costo; requiere aplicarse 30-60 min antes de la comida (inicio más lento que los análogos).",
    mecanismo: "Insulina humana no modificada; se autoasocia en hexámeros en el tejido subcutáneo, lo que retrasa su absorción frente a los análogos de acción rápida.",
    vidaMediaHoras: 1.5, vidaMediaLabel: "~1.5 h (duración 5-8 h)", reduccionA1c: "N/A (ajuste posprandial)",
    titr: { l: ["Inicio"], d: [4] },
    benef: { ic: false, erc: false, ascvd: false, stroke: false, masld: false },
    mecanismoDetalle: "Insulina humana recombinante sin modificar (secuencia idéntica a la insulina endógena). Sin las modificaciones estructurales de los análogos, se autoasocia naturalmente en hexámeros en el tejido subcutáneo, y debe disociarse en dímeros/monómeros antes de absorberse — un proceso más lento que retrasa su inicio de acción (30-60 min) y prolonga su duración (5-8 h) frente a lispro/aspart. Es la única insulina prandial que puede administrarse por vía intravenosa (p. ej. en cetoacidosis diabética o manejo hospitalario), justamente porque su cinética está bien caracterizada y no depende de la absorción subcutánea en ese contexto.",
    mecanismoPasos: [
      "Auto-asociación natural en hexámeros en el tejido subcutáneo",
      "Disociación gradual en dímeros/monómeros (más lenta que análogos)",
      "Inicio de acción más lento (30-60 min), pico 2-4 h",
      "Unión al receptor de insulina → ↑ captación celular de glucosa",
      "Duración más prolongada (5-8 h) — requiere aplicarse con más anticipación a la comida",
    ],
    efectosAdversos: {
      frecuentes: [
        "Hipoglucemia — mayor riesgo de hipoglucemia tardía (2-4 h) que con análogos, por su duración más prolongada",
        "Ganancia de peso",
      ],
      graves: ["Hipoglucemia severa, incluyendo tardía/nocturna si se aplicó cerca de la cena"],
    },
    contraindicacionesDetalle: [
      { condicion: "Hipoglucemia activa", razon: "No administrar durante un episodio de hipoglucemia" },
      { condicion: "Hipersensibilidad al producto específico", razon: "Reacción alérgica documentada" },
    ],
    monitoreo: [
      { parametro: "Glucosa posprandial y 3-4 h después de la comida", frecuencia: "Vigilar hipoglucemia tardía por la duración más prolongada" },
    ],
    educacionPaciente: {
      queEs: "Insulina de acción rápida de menor costo; a diferencia de las más modernas, tarda más en empezar a actuar y dura más tiempo.",
      comoTomarlo: "Inyectar 30-60 minutos ANTES de empezar a comer (más anticipación que lispro/aspart) — planear el horario de la comida con cuidado.",
      siOlvidaDosis: "Si ya está por comer y no alcanza el tiempo de anticipación, consultar con su médico el ajuste.",
      senalesAlarma: [
        "Temblor, sudoración fría, confusión — puede ocurrir varias horas después de la inyección, no solo al comer",
        "Bajas de azúcar tardías (varias horas después de la comida)",
      ],
    },
    fuentes: [
      { texto: "Goodman & Gilman — Bases Farmacológicas de la Terapéutica, 13ª ed., cap. 47" },
      { texto: "FDA Prescribing Information — Insulina Regular Humana" },
    ],
    hipo: "alto", peso: "ganancia", costo: 1, egfrMin: 0, contra: [],
    efectoCurva: { peakReduction: 0.35, baselineReduction: 0, delayHoras: 0.25 } },

  // ============ OBESIDAD ============
  { id: "SEMA24", cat: "obesity", grp: "GLP-1 RA", name: "Semaglutida 2.4 mg", ini: "0.25 mg", mant: "2.4 mg",
    adv: "12-15% pérdida de peso. FDA: IMC≥30 o ≥27 con comorbilidad, ASCVD, MASH.",
    mecanismo: "Agonista del receptor de GLP-1 a nivel hipotalámico: reduce el apetito, aumenta la saciedad y enlentece el vaciamiento gástrico.",
    vidaMediaHoras: 168, vidaMediaLabel: "~7 días", reduccionA1c: "1.0-1.4%",
    titr: { l: ["Sem 4", "Sem 8", "Sem 12", "Sem 16", "Sem 20"], d: [0.25, 0.5, 1.0, 1.7, 2.4] },
    benef: { ic: false, erc: false, ascvd: true, stroke: false, masld: true },
    // REDISEÑO DE FICHA (16-ago-2026): metodología en entrada "MET". Misma
    // molécula/mecanismo que "SEMA" (antidiabético) — contenido reutilizado y
    // adaptado al uso primario de peso (dosis máxima mayor: 2.4 mg vs 2.0 mg).
    mecanismoDetalle: "Agonista del receptor de GLP-1 con acción central predominante a dosis de obesidad: activa receptores GLP-1 hipotalámicos (núcleo arcuato) que regulan el apetito, reduciendo las señales de hambre y potenciando la saciedad, además de enlentecer el vaciamiento gástrico. Mismo mecanismo molecular que en su uso antidiabético, pero titulado a una dosis máxima mayor (2.4 mg) específicamente para maximizar la pérdida de peso.",
    mecanismoPasos: [
      "Activación del receptor GLP-1 en el núcleo arcuato hipotalámico",
      "↓ Señales de hambre + ↑ saciedad central",
      "↓ Vaciamiento gástrico → mayor sensación de plenitud",
      "↓ Ingesta calórica sostenida en el tiempo",
      "Pérdida de peso de 12-15% con tratamiento prolongado",
    ],
    efectosAdversos: {
      frecuentes: ["Náusea, vómito, diarrea, estreñimiento (más frecuentes a dosis altas de obesidad que a dosis de diabetes)", "Reacciones en el sitio de inyección"],
      graves: [
        "Pancreatitis aguda (posible asociación)",
        "Enfermedad de vesícula biliar — señal más marcada con la pérdida de peso rápida",
        "Riesgo teórico de tumores de células C tiroideas/MEN2",
      ],
    },
    contraindicacionesDetalle: [
      { condicion: "Antecedente personal/familiar de carcinoma medular de tiroides o MEN2", razon: "Advertencia de clase" },
      { condicion: "Antecedente de pancreatitis", razon: "Posible asociación" },
      { condicion: "Trastorno de la conducta alimentaria activo (anorexia/bulimia)", razon: "No es el tratamiento indicado y puede agravar la relación con la comida" },
      { condicion: "Embarazo", razon: "Suspender antes de buscar embarazo" },
    ],
    monitoreo: [
      { parametro: "Peso y tolerancia GI", frecuencia: "En cada ajuste de dosis" },
      { parametro: "Pérdida de masa magra", frecuencia: "Considerar en pérdidas de peso muy rápidas — reforzar ingesta proteica y actividad física" },
    ],
    educacionPaciente: {
      queEs: "Imita una hormona intestinal que frena el apetito a nivel del cerebro, ayudando a comer menos de forma sostenida.",
      comoTomarlo: "Inyección subcutánea una vez por semana, con o sin alimentos.",
      siOlvidaDosis: "Aplicarla en cuanto se recuerde si faltan más de 2 días para la siguiente dosis; si faltan menos de 2 días, omitirla y continuar con el horario habitual.",
      senalesAlarma: [
        "Dolor abdominal intenso irradiado a la espalda (posible pancreatitis)",
        "Dolor en la parte superior derecha del abdomen o color amarillento de piel/ojos (posible problema de vesícula)",
        "Pérdida de peso muy rápida, debilidad marcada o mareo — comentarlo en consulta",
      ],
    },
    fuentes: [
      { texto: "FDA Prescribing Information — Semaglutida 2.4 mg (Wegovy, DailyMed)" },
      { texto: "AACE/ADA Guidelines Obesidad 2026" },
    ],
    hipo: "bajo", peso: "perdida", costo: 3, egfrMin: 15, contra: ["MEN2", "GLP1_GIP", "EMBARAZO"] },

  { id: "TIRZ_OB", cat: "obesity", grp: "GIP/GLP-1 RA", name: "Tirzepatida (Obesidad)", ini: "2.5 mg", mant: "15 mg",
    adv: "13-20% pérdida de peso, la mayor eficacia disponible. Aprobado para OSA moderada-severa.",
    mecanismo: "Coagonismo de receptores GIP y GLP-1 que potencia la saciedad, retrasa el vaciamiento gástrico y mejora la partición energética.",
    vidaMediaHoras: 120, vidaMediaLabel: "~5 días", reduccionA1c: "N/A (uso primario: peso)",
    titr: { l: ["Sem 4", "Sem 8", "Sem 12", "Sem 16", "Sem 20"], d: [2.5, 5, 7.5, 10, 15] },
    benef: { ic: true, erc: false, ascvd: false, stroke: false, masld: true },
    mecanismoDetalle: "Misma molécula y mecanismo dual GIP/GLP-1 que en su uso antidiabético (agonismo con mayor afinidad relativa por el receptor GIP, potenciando saciedad y efecto sobre metabolismo lipídico/tejido adiposo), aquí aprovechado como uso primario para pérdida de peso — con la mayor eficacia disponible en la clase (13-20%). Aprobado también específicamente para apnea obstructiva del sueño moderada-severa asociada a obesidad.",
    mecanismoPasos: [
      "Agonismo dual: receptor GIP (mayor afinidad) + receptor GLP-1",
      "↓ Señales de hambre + ↑ saciedad central (potenciado por el componente GIP)",
      "↓ Vaciamiento gástrico",
      "Efecto adicional GIP sobre metabolismo lipídico/tejido adiposo",
      "Pérdida de peso 13-20% — la mayor eficacia disponible en la clase",
    ],
    efectosAdversos: {
      frecuentes: ["Náusea, diarrea, vómito, estreñimiento (dosis-dependientes)", "Reacciones en el sitio de inyección"],
      graves: [
        "Pancreatitis aguda",
        "Enfermedad de vesícula biliar — señal más marcada con la mayor pérdida de peso",
        "Riesgo teórico de tumores de células C tiroideas/MEN2",
      ],
    },
    contraindicacionesDetalle: [
      { condicion: "Antecedente personal/familiar de carcinoma medular de tiroides o MEN2", razon: "Advertencia de clase" },
      { condicion: "Antecedente de pancreatitis", razon: "Riesgo reportado" },
      { condicion: "Trastorno de la conducta alimentaria activo", razon: "No es el tratamiento indicado" },
      { condicion: "Embarazo", razon: "Suspender antes de buscar embarazo" },
    ],
    monitoreo: [
      { parametro: "Peso y tolerancia GI", frecuencia: "En cada ajuste de dosis (5 escalones hasta 15 mg)" },
      { parametro: "Pérdida de masa magra", frecuencia: "Reforzar ingesta proteica y actividad física dada la magnitud de la pérdida de peso" },
    ],
    educacionPaciente: {
      queEs: "Actúa sobre DOS hormonas intestinales para frenar el apetito de forma muy efectiva; es el medicamento con mayor pérdida de peso disponible actualmente.",
      comoTomarlo: "Inyección subcutánea una vez por semana, con o sin alimentos.",
      siOlvidaDosis: "Aplicarla en cuanto se recuerde si faltan más de 4 días para la siguiente dosis; si faltan menos, omitirla.",
      senalesAlarma: [
        "Dolor abdominal intenso irradiado a la espalda (posible pancreatitis)",
        "Dolor en la parte superior derecha del abdomen o color amarillento de piel/ojos",
        "Pérdida de peso muy rápida o debilidad marcada — comentarlo en consulta",
      ],
    },
    fuentes: [
      { texto: "FDA Prescribing Information — Tirzepatida (Zepbound, DailyMed)" },
      { texto: "Ensayo SURMOUNT; AACE/ADA Guidelines Obesidad 2026" },
    ],
    hipo: "bajo", peso: "perdida", costo: 3, egfrMin: 15, contra: ["MEN2", "GLP1_GIP", "EMBARAZO"] },

  { id: "LIRA3", cat: "obesity", grp: "GLP-1 RA", name: "Liraglutida 3 mg", ini: "0.6 mg", mant: "3 mg",
    adv: "5-6% pérdida de peso. Requiere inyección diaria (menor apego vs. semanales).",
    mecanismo: "Agonismo del receptor GLP-1 central, reduciendo señales de hambre y aumentando saciedad; requiere administración diaria por su vida media corta.",
    vidaMediaHoras: 13, vidaMediaLabel: "~13 h", reduccionA1c: "N/A (uso primario: peso)",
    titr: { l: ["Sem 1", "Sem 2", "Sem 3", "Sem 4", "Sem 5"], d: [0.6, 1.2, 1.8, 2.4, 3.0] },
    benef: { ic: false, erc: false, ascvd: false, stroke: false, masld: false },
    mecanismoDetalle: "Misma molécula y mecanismo (unión reversible a albúmina, agonismo del receptor GLP-1 central) que en su uso antidiabético, titulada aquí a una dosis máxima mayor (3 mg vs. 1.8 mg) específicamente para maximizar la pérdida de peso. Su eficacia (5-6%) es menor que semaglutida/tirzepatida en dosis de obesidad, y al requerir inyección DIARIA (vida media corta, ~13 h) suele tener menor apego a largo plazo que las formulaciones semanales.",
    mecanismoPasos: [
      "Unión reversible a albúmina retrasa la degradación (t½ ~13 h)",
      "Activación del receptor GLP-1 hipotalámico",
      "↓ Señales de hambre + ↑ saciedad central",
      "↓ Vaciamiento gástrico",
      "Pérdida de peso 5-6% (menor que semaglutida/tirzepatida en dosis de obesidad)",
    ],
    efectosAdversos: {
      frecuentes: ["Náusea, vómito, diarrea (más frecuentes en las primeras semanas)", "Reacciones en el sitio de inyección"],
      graves: ["Pancreatitis aguda", "Enfermedad de vesícula biliar", "Riesgo teórico de tumores de células C tiroideas/MEN2"],
    },
    contraindicacionesDetalle: [
      { condicion: "Antecedente personal/familiar de carcinoma medular de tiroides o MEN2", razon: "Advertencia de clase" },
      { condicion: "Antecedente de pancreatitis", razon: "Riesgo reportado" },
      { condicion: "Embarazo", razon: "Suspender antes de buscar embarazo" },
    ],
    monitoreo: [
      { parametro: "Adherencia a la dosis diaria", frecuencia: "En cada consulta — el olvido de dosis es más frecuente que con formulaciones semanales" },
      { parametro: "Peso y tolerancia GI", frecuencia: "En cada ajuste de dosis" },
    ],
    educacionPaciente: {
      queEs: "Imita una hormona intestinal que frena el apetito; a diferencia de otras opciones más nuevas, se aplica todos los días.",
      comoTomarlo: "Inyección subcutánea una vez AL DÍA, a la misma hora, con o sin alimentos.",
      siOlvidaDosis: "Aplicarla en cuanto se recuerde ese mismo día; si ya se acerca la hora de la siguiente, omitir la olvidada.",
      senalesAlarma: [
        "Dolor abdominal intenso irradiado a la espalda (posible pancreatitis)",
        "Dolor en la parte superior derecha del abdomen o color amarillento de piel/ojos",
      ],
    },
    fuentes: [
      { texto: "FDA Prescribing Information — Liraglutida 3 mg (Saxenda, DailyMed)" },
      { texto: "AACE/ADA Guidelines Obesidad 2026" },
    ],
    hipo: "bajo", peso: "perdida", costo: 3, egfrMin: 15, contra: ["MEN2", "GLP1_GIP", "EMBARAZO"] },

  { id: "PHEN_TOP", cat: "obesity", grp: "Simpaticomimético/GABAérgico", name: "Fentermina/Topiramato ER", ini: "3.75/23 mg", mant: "15/92 mg",
    adv: "8-10% pérdida de peso. Alternativa oral de menor costo. Contraindicado en embarazo/glaucoma/enfermedad cardiovascular/HTA no controlada (componente fentermina, simpaticomimético).",
    mecanismo: "Fentermina libera noradrenalina hipotalámica (supresión de apetito); topiramato modula canales GABA/glutamato aumentando saciedad y termogénesis.",
    vidaMediaHoras: 20, vidaMediaLabel: "~20 h (combinado)", reduccionA1c: "N/A (uso primario: peso)",
    titr: { l: ["Sem 1", "Sem 2", "Sem 12"], d: [3.75, 7.5, 15] },
    benef: { ic: false, erc: false, ascvd: false, stroke: false, masld: false },
    mecanismoDetalle: "Combinación de dos mecanismos complementarios: la fentermina es un simpaticomimético que libera noradrenalina en el hipotálamo, suprimiendo el apetito por estimulación del centro de saciedad; el topiramato (a estas dosis bajas) potencia la neurotransmisión GABAérgica e inhibe receptores de glutamato (AMPA/kainato), lo que aumenta adicionalmente la saciedad y puede favorecer un leve efecto termogénico. La combinación logra mayor pérdida de peso que cualquiera de los dos componentes solos, con dosis de topiramato mucho menores que las usadas en epilepsia/migraña (menos efectos cognitivos).",
    mecanismoPasos: [
      "Fentermina: ↑ liberación de noradrenalina hipotalámica → supresión del apetito",
      "Topiramato: potencia GABA + inhibe receptores de glutamato",
      "↑ Saciedad adicional + posible efecto termogénico leve",
      "Efecto combinado supresor del apetito mayor que cada componente solo",
      "Pérdida de peso 8-10%",
    ],
    efectosAdversos: {
      frecuentes: [
        "Insomnio, sequedad de boca, estreñimiento (fentermina)",
        "Parestesias, alteración del gusto, dificultad de concentración (topiramato)",
      ],
      graves: [
        "Elevación de frecuencia cardiaca y presión arterial (componente fentermina)",
        "Teratogenicidad — labio/paladar hendido (topiramato); requiere anticoncepción efectiva",
        "Glaucoma agudo de ángulo cerrado (raro)",
        "Ideación suicida (alerta de clase de anticonvulsivantes)",
      ],
    },
    contraindicacionesDetalle: [
      { condicion: "ASCVD o hipertensión no controlada", razon: "Componente simpaticomimético (fentermina) puede elevar PA/FC" },
      { condicion: "Glaucoma", razon: "Riesgo de glaucoma agudo de ángulo cerrado con topiramato" },
      { condicion: "Embarazo o falta de anticoncepción efectiva", razon: "Topiramato es teratogénico (labio/paladar hendido) — categoría de alto riesgo" },
      { condicion: "Hipertiroidismo, uso de IMAO en los últimos 14 días", razon: "Riesgo de crisis hipertensiva con el componente simpaticomimético" },
    ],
    monitoreo: [
      { parametro: "Frecuencia cardiaca y presión arterial", frecuencia: "Basal y en cada ajuste de dosis" },
      { parametro: "Estado de ánimo/ideación suicida", frecuencia: "En cada consulta — alerta de clase de los anticonvulsivantes" },
      { parametro: "Uso de anticoncepción efectiva en personas con capacidad de gestar", frecuencia: "Confirmar antes de iniciar y durante el tratamiento" },
    ],
    educacionPaciente: {
      queEs: "Combina dos medicamentos que juntos reducen el apetito más de lo que lograría cada uno por separado.",
      comoTomarlo: "Una cápsula al día en la mañana (evitar tomarla en la noche por el efecto estimulante que puede afectar el sueño).",
      siOlvidaDosis: "Si lo olvida en la mañana, no tomarla más tarde en el día — esperar al día siguiente.",
      senalesAlarma: [
        "Palpitaciones, dolor en el pecho o presión arterial muy elevada",
        "Dolor ocular intenso o visión borrosa repentina (posible glaucoma agudo)",
        "Cambios de ánimo, tristeza profunda o pensamientos de hacerse daño",
        "IMPORTANTE: usar un método anticonceptivo efectivo mientras lo toma, por el riesgo en el embarazo",
      ],
    },
    fuentes: [
      { texto: "FDA Prescribing Information — Fentermina/Topiramato ER (Qsymia, DailyMed)" },
      { texto: "AACE/ADA Guidelines Obesidad 2026" },
    ],
    // CORRECCIÓN (misma ronda de auditoría — la ficha YA advertía en texto
    // libre "contraindicado en ASCVD/HTA no controlada" pero `contra` estaba
    // vacío, así que `filterSafe`/`currentDrugIssue` nunca aplicaban esa
    // contraindicación de verdad; el motor podía elegir este fármaco por
    // costo sin revisar riesgo cardiovascular).
    hipo: "bajo", peso: "perdida", costo: 2, egfrMin: 0, contra: ["ESTIMULANTE_CV", "EMBARAZO"] },

  { id: "NALTREX_BUP", cat: "obesity", grp: "Antagonista Opioide/NDRI", name: "Naltrexona/Bupropion ER", ini: "8/90 mg", mant: "16/180 mg BID",
    adv: "4-5% pérdida de peso. Opción si GLP-1/GIP no toleradas o no accesibles. Contraindicado en HTA no controlada (bupropion — riesgo de elevación de PA/FC).",
    mecanismo: "Naltrexona bloquea receptores opioides mu (reduce el componente hedónico/recompensa de comer); bupropion inhibe la recaptura de dopamina/noradrenalina en el hipotálamo (saciedad).",
    vidaMediaHoras: 21, vidaMediaLabel: "~21 h (bupropion)", reduccionA1c: "N/A (uso primario: peso)",
    titr: { l: ["Sem 1", "Sem 2", "Sem 3", "Sem 4"], d: [8, 16, 24, 32] },
    benef: { ic: false, erc: false, ascvd: false, stroke: false, masld: false },
    mecanismoDetalle: "Combinación de dos mecanismos centrales sobre las vías de recompensa/apetito hipotalámicas: la naltrexona bloquea los receptores opioides mu, reduciendo el componente hedónico ('placer de comer') y contrarrestando la retroalimentación negativa que normalmente limita la activación de neuronas POMC; el bupropión inhibe la recaptura de dopamina y noradrenalina, activando neuronas POMC hipotalámicas que aumentan la saciedad. Juntos potencian la activación de la vía POMC más de lo que logra cada uno solo.",
    mecanismoPasos: [
      "Naltrexona: bloqueo de receptores opioides mu",
      "Bupropión: inhibición de recaptura de dopamina/noradrenalina",
      "Potenciación combinada de neuronas POMC hipotalámicas",
      "↓ Componente hedónico de comer + ↑ saciedad",
      "Pérdida de peso 4-5%",
    ],
    efectosAdversos: {
      frecuentes: ["Náusea (muy frecuente al inicio)", "Cefalea, estreñimiento, insomnio, sequedad de boca"],
      graves: [
        "Convulsiones (riesgo dosis-dependiente del bupropión — contraindicado en antecedente de convulsiones o trastorno de la conducta alimentaria)",
        "Elevación de presión arterial",
        "Ideación suicida (alerta de clase de antidepresivos, más relevante en menores de 24 años)",
        "Precipitación de síndrome de abstinencia si el paciente usa opioides",
      ],
    },
    contraindicacionesDetalle: [
      { condicion: "Uso crónico de opioides o dependencia a opioides", razon: "La naltrexona precipita un síndrome de abstinencia agudo" },
      { condicion: "Antecedente de convulsiones o trastorno de la conducta alimentaria (bulimia/anorexia)", razon: "El bupropión reduce el umbral convulsivo" },
      { condicion: "Hipertensión no controlada", razon: "Puede elevar la presión arterial" },
      { condicion: "Uso de IMAO en los últimos 14 días, suspensión abrupta de alcohol/benzodiacepinas", razon: "Riesgo de interacción grave/convulsiones" },
    ],
    monitoreo: [
      { parametro: "Presión arterial", frecuencia: "Basal y en cada ajuste de dosis" },
      { parametro: "Estado de ánimo/ideación suicida", frecuencia: "En cada consulta, especialmente en los primeros meses" },
      { parametro: "Uso concomitante de opioides", frecuencia: "Confirmar ausencia antes de iniciar" },
    ],
    educacionPaciente: {
      queEs: "Combina dos medicamentos que actúan en el cerebro para reducir tanto el hambre como el 'antojo' de comer por placer.",
      comoTomarlo: "Se inicia con dosis baja y se aumenta gradualmente durante 4 semanas, dos veces al día, con alimentos (para reducir la náusea).",
      siOlvidaDosis: "Tomarla en cuanto se recuerde; si ya casi es hora de la siguiente, omitir la olvidada — no duplicar.",
      senalesAlarma: [
        "Convulsiones o movimientos anormales — buscar atención inmediata",
        "Cambios de ánimo, tristeza profunda o pensamientos de hacerse daño",
        "Presión arterial elevada",
        "IMPORTANTE: no usar si toma medicamentos opioides para el dolor — puede causar un síndrome de abstinencia grave",
      ],
    },
    fuentes: [
      { texto: "FDA Prescribing Information — Naltrexona/Bupropion ER (Contrave, DailyMed)" },
      { texto: "AACE/ADA Guidelines Obesidad 2026" },
    ],
    hipo: "bajo", peso: "perdida", costo: 2, egfrMin: 0, contra: ["ESTIMULANTE_CV", "EMBARAZO"] },

  { id: "ORLI", cat: "obesity", grp: "Inhibidor Lipasa GI", name: "Orlistat", ini: "60 mg", mant: "120 mg TID",
    adv: "Menor eficacia (3-4%). Efectos GI (esteatorrea) limitan apego. Costo bajo.",
    mecanismo: "Inhibe irreversiblemente las lipasas gástrica y pancreática, bloqueando la hidrólisis de triglicéridos dietéticos y reduciendo su absorción ~30%.",
    vidaMediaHoras: 2, vidaMediaLabel: "~2 h (acción local, mínima absorción)", reduccionA1c: "N/A (uso primario: peso)",
    titr: { l: ["Inicio"], d: [120] },
    benef: { ic: false, erc: false, ascvd: false, stroke: false, masld: false },
    mecanismoDetalle: "Inhibidor irreversible de las lipasas gástrica y pancreática, las enzimas responsables de hidrolizar los triglicéridos de la dieta en ácidos grasos libres y monoglicéridos absorbibles. Al bloquear esta hidrólisis, aproximadamente 30% de la grasa ingerida no se digiere y se elimina intacta por las heces (esteatorrea) en lugar de absorberse — es el único agente de la clase que actúa completamente a nivel local/intestinal, con mínima absorción sistémica, por lo que no tiene el perfil de efectos adversos centrales de los demás fármacos de obesidad.",
    mecanismoPasos: [
      "Inhibición irreversible de lipasa gástrica y pancreática",
      "↓ Hidrólisis de triglicéridos dietéticos en el intestino",
      "~30% de la grasa ingerida no se absorbe (se elimina en heces)",
      "↓ Absorción calórica de la grasa dietética",
      "Pérdida de peso 3-4% (la menor eficacia de la clase, acción local)",
    ],
    efectosAdversos: {
      frecuentes: [
        "Esteatorrea, urgencia fecal, flatulencia con manchado — muy frecuentes, especialmente con comidas altas en grasa",
        "Dolor abdominal",
      ],
      graves: [
        "Deficiencia de vitaminas liposolubles (A, D, E, K) con uso prolongado",
        "Daño hepático severo (raro, reportes post-comercialización) — vigilar síntomas",
      ],
    },
    contraindicacionesDetalle: [
      { condicion: "Síndrome de malabsorción crónica o colestasis", razon: "El fármaco reduce aún más la absorción de grasas/vitaminas liposolubles" },
      { condicion: "Embarazo", razon: "Riesgo de deficiencia de vitaminas liposolubles esenciales para el desarrollo fetal" },
    ],
    monitoreo: [
      { parametro: "Vitaminas liposolubles (A, D, E, K)", frecuencia: "Considerar suplementación multivitamínica separada por al menos 2 horas de la dosis, y vigilar niveles con uso prolongado" },
      { parametro: "Función hepática", frecuencia: "Ante síntomas de daño hepático (ictericia, orina oscura, fatiga)" },
    ],
    educacionPaciente: {
      queEs: "Bloquea la digestión de una parte de la grasa que come, para que se elimine en lugar de absorberse.",
      comoTomarlo: "Con cada comida principal que contenga grasa (hasta 3 veces al día); si una comida no tiene grasa, se puede omitir esa dosis.",
      siOlvidaDosis: "Si ya pasó 1 hora desde la comida, omitir esa dosis.",
      senalesAlarma: [
        "Manchado fecal oleoso, urgencia intensa para evacuar — es esperado, mejora al reducir grasa en la dieta",
        "Piel u ojos amarillentos, orina oscura, cansancio extremo (posible daño hepático)",
        "IMPORTANTE: tomar un multivitamínico separado por al menos 2 horas de este medicamento",
      ],
    },
    fuentes: [
      { texto: "Goodman & Gilman — Bases Farmacológicas de la Terapéutica, 13ª ed." },
      { texto: "FDA Prescribing Information — Orlistat (DailyMed)" },
    ],
    hipo: "bajo", peso: "perdida", costo: 1, egfrMin: 0, contra: ["EMBARAZO"] },

  { id: "PHEN", cat: "obesity", grp: "Simpaticomimético/GABAérgico", name: "Fentermina", ini: "15 mg", mant: "30 mg",
    adv: "Monoterapia simpaticomimética; uso aprobado solo a corto plazo (≤12 semanas) por regulación histórica de la FDA. Contraindicado en ASCVD/HTA no controlada.",
    mecanismo: "Libera noradrenalina a nivel hipotalámico, suprimiendo el apetito por estimulación simpática central.",
    vidaMediaHoras: 20, vidaMediaLabel: "~19-24 h", reduccionA1c: "N/A (uso primario: peso)",
    titr: { l: ["Inicio", "Sem 2"], d: [15, 30] },
    benef: { ic: false, erc: false, ascvd: false, stroke: false, masld: false },
    mecanismoDetalle: "Simpaticomimético que libera noradrenalina (y en menor medida dopamina) desde terminales nerviosas hipotalámicas, suprimiendo el apetito por estimulación del centro de saciedad. Es de la misma familia farmacológica que las anfetaminas, aunque con menor potencial de abuso. Debido a su mecanismo estimulante, la FDA restringe históricamente su aprobación a uso a CORTO PLAZO (≤12 semanas), a diferencia de los agentes más nuevos (GLP-1 RA) aprobados para uso crónico.",
    mecanismoPasos: [
      "Liberación de noradrenalina (y dopamina) en terminales hipotalámicas",
      "Estimulación del centro de saciedad hipotalámico",
      "↓ Apetito por estimulación simpática central",
      "Uso aprobado solo a corto plazo (≤12 semanas) por regulación histórica de la FDA",
    ],
    efectosAdversos: {
      frecuentes: ["Insomnio, sequedad de boca, nerviosismo/ansiedad", "Estreñimiento"],
      graves: [
        "Elevación de frecuencia cardiaca y presión arterial",
        "Palpitaciones — evitar en enfermedad cardiovascular",
        "Potencial de dependencia/abuso (sustancia controlada)",
      ],
    },
    contraindicacionesDetalle: [
      { condicion: "ASCVD o hipertensión no controlada", razon: "Efecto simpaticomimético puede elevar PA/FC y precipitar eventos" },
      { condicion: "Hipertiroidismo, glaucoma, uso de IMAO en los últimos 14 días", razon: "Riesgo de crisis hipertensiva o interacción grave" },
      { condicion: "Antecedente de abuso de sustancias", razon: "Potencial de dependencia" },
      { condicion: "Embarazo", razon: "No indicado" },
    ],
    monitoreo: [
      { parametro: "Frecuencia cardiaca y presión arterial", frecuencia: "Basal y periódico durante las 12 semanas de uso" },
      { parametro: "Duración total del tratamiento", frecuencia: "No exceder el uso aprobado a corto plazo sin reevaluación" },
    ],
    educacionPaciente: {
      queEs: "Reduce el apetito estimulando el sistema nervioso; se usa solo por un tiempo corto, no de forma indefinida.",
      comoTomarlo: "Una vez al día en la mañana, con el estómago vacío o después del desayuno — evitar tomarla en la tarde/noche por su efecto estimulante.",
      siOlvidaDosis: "Si lo olvida en la mañana, no tomarla más tarde en el día.",
      senalesAlarma: ["Palpitaciones, dolor en el pecho o presión arterial muy elevada", "Ansiedad intensa o insomnio severo"],
    },
    fuentes: [
      { texto: "Goodman & Gilman — Bases Farmacológicas de la Terapéutica, 13ª ed." },
      { texto: "FDA Prescribing Information — Fentermina (DailyMed)" },
    ],
    hipo: "bajo", peso: "perdida", costo: 1, egfrMin: 0, contra: ["ESTIMULANTE_CV", "EMBARAZO"] },

  { id: "SETME", cat: "obesity", grp: "Agonista MC4R", name: "Setmelanotida", ini: "1 mg/día", mant: "3 mg/día",
    adv: "Indicación específica: obesidad genética por deficiencia de POMC, PCSK1 o receptor de leptina (LEPR) — no es un agente de uso general.",
    mecanismo: "Agonista del receptor de melanocortina-4 (MC4R) hipotalámico, restaurando la señal de saciedad en pacientes con defectos genéticos de la vía leptina-melanocortina.",
    vidaMediaHoras: 11, vidaMediaLabel: "~11 h", reduccionA1c: "N/A (uso primario: peso)",
    titr: { l: ["Inicio", "Sem 2"], d: [1, 3] },
    benef: { ic: false, erc: false, ascvd: false, stroke: false, masld: false },
    mecanismoDetalle: "Agonista del receptor de melanocortina-4 (MC4R) en el núcleo paraventricular hipotalámico, el punto final de la vía leptina-POMC-MC4R que regula el balance energético. En personas con obesidad genética por deficiencia de POMC, PCSK1 o del receptor de leptina (LEPR), esta vía está interrumpida corriente arriba del MC4R (la leptina no logra activar POMC, o POMC no se procesa correctamente); setmelanotida evita el defecto activando MC4R DIRECTAMENTE, restaurando la señal de saciedad independientemente del paso genético defectuoso. Por esto NO es un agente de uso general — solo funciona en estos subtipos genéticos específicos, que deben confirmarse antes de prescribir.",
    mecanismoPasos: [
      "En obesidad genética (POMC/PCSK1/LEPR), la vía leptina→POMC→MC4R está interrumpida",
      "Setmelanotida activa el receptor MC4R DIRECTAMENTE, evitando el defecto genético",
      "Restauración de la señal de saciedad en el núcleo paraventricular hipotalámico",
      "↓ Apetito + ↑ gasto energético",
      "Solo eficaz en los subtipos genéticos confirmados — no es de uso general",
    ],
    efectosAdversos: {
      frecuentes: ["Reacciones en el sitio de inyección (muy frecuentes)", "Hiperpigmentación cutánea generalizada (por activación de MC1R)", "Náusea"],
      graves: [
        "Eventos de disfunción sexual/erección espontánea (activación de receptores de melanocortina relacionados)",
        "Ideación/comportamiento suicida — requiere vigilancia",
        "Reacciones alérgicas graves",
      ],
    },
    contraindicacionesDetalle: [
      { condicion: "Obesidad sin confirmación genética de deficiencia de POMC/PCSK1/LEPR", razon: "No es eficaz — el mecanismo depende específicamente de estos defectos genéticos" },
      { condicion: "Embarazo", razon: "Datos insuficientes de seguridad" },
    ],
    monitoreo: [
      { parametro: "Confirmación genética antes de iniciar", frecuencia: "Requisito previo obligatorio — prueba genética que confirme deficiencia de POMC, PCSK1 o LEPR" },
      { parametro: "Estado de ánimo/ideación suicida", frecuencia: "En cada consulta" },
      { parametro: "Piel (hiperpigmentación) y sitios de inyección", frecuencia: "Vigilancia rutinaria" },
    ],
    educacionPaciente: {
      queEs: "Un medicamento diseñado específicamente para un tipo raro de obesidad causada por un defecto genético — no funciona para la obesidad común.",
      comoTomarlo: "Inyección subcutánea una vez al día.",
      siOlvidaDosis: "Aplicarla en cuanto se recuerde ese mismo día.",
      senalesAlarma: [
        "Cambios de ánimo, tristeza profunda o pensamientos de hacerse daño",
        "Oscurecimiento notable de la piel en todo el cuerpo (esperado, pero comentarlo)",
        "Erecciones prolongadas o espontáneas no deseadas",
      ],
    },
    fuentes: [
      { texto: "FDA Prescribing Information — Setmelanotida (Imcivree, DailyMed)" },
    ],
    hipo: "bajo", peso: "perdida", costo: 3, egfrMin: 0, contra: ["EMBARAZO"] },

  // ============ HIPERTENSIÓN ============
  { id: "LOSA", cat: "htn", grp: "ARA-II", name: "Losartan", ini: "50 mg", mant: "100 mg",
    adv: "1a línea si UACR>30 mg/g. Uricosúrico leve. No combinar con IECA.",
    mecanismo: "Bloquea selectivamente el receptor AT1 de angiotensina II, impidiendo la vasoconstricción y la liberación de aldosterona.",
    vidaMediaHoras: 2, vidaMediaLabel: "~2 h (metabolito activo 6-9 h)", reduccionA1c: null,
    titr: { l: ["Inicio", "Sem 4"], d: [50, 100] },
    benef: { ic: false, erc: true, ascvd: false, stroke: false, masld: false },
    // REDISEÑO DE FICHA (16-ago-2026): metodología en entrada "MET". Clase
    // ARA-II — mecanismo/efectos adversos de G&G + FDA labels. A diferencia
    // de IECA, no inhibe la degradación de bradicinina, por lo que casi no
    // produce tos ni angioedema (diferenciador clínico clave de la clase).
    mecanismoDetalle: "Bloquea selectiva y competitivamente el receptor AT1 de angiotensina II en el músculo liso vascular, la corteza suprarrenal y otros tejidos, impidiendo la vasoconstricción, la liberación de aldosterona y la remodelación cardiovascular mediadas por AT1 — sin inhibir la enzima convertidora de angiotensina (ECA). Al no bloquear la ECA, no interfiere con la degradación de bradicinina, lo que explica por qué los ARA-II casi no producen tos seca ni angioedema, a diferencia de los IECA (aunque el angioedema no está completamente excluido).",
    mecanismoPasos: [
      "Bloqueo competitivo del receptor AT1 de angiotensina II",
      "↓ Vasoconstricción arterial mediada por AT1",
      "↓ Liberación de aldosterona (↓ retención de Na⁺/agua)",
      "No bloquea la ECA → no acumula bradicinina (por eso casi no da tos)",
      "↓ Presión arterial + protección renal (↓ presión intraglomerular)",
    ],
    efectosAdversos: {
      frecuentes: ["Mareo, cefalea", "Hiperpotasemia leve"],
      graves: [
        "Hiperpotasemia significativa (más en ERC, uso concomitante con IECA/MRA/suplementos de K+)",
        "Deterioro agudo de función renal (sospechar estenosis bilateral de arteria renal si la creatinina sube >30%)",
        "Angioedema (raro, mucho menos frecuente que con IECA)",
        "Teratogenicidad — contraindicado en embarazo (2º/3er trimestre especialmente)",
      ],
    },
    contraindicacionesDetalle: [
      { condicion: "Embarazo", razon: "Teratogénico — daño renal fetal, oligohidramnios" },
      { condicion: "Estenosis bilateral de arteria renal (o unilateral en riñón único)", razon: "Riesgo de falla renal aguda al bloquear la vasoconstricción compensadora de la arteriola eferente" },
      { condicion: "Uso concomitante con IECA", razon: "Doble bloqueo del SRAA — mayor riesgo de hiperpotasemia e insuficiencia renal sin beneficio adicional" },
      { condicion: "Hiperpotasemia significativa preexistente", razon: "El fármaco puede agravarla" },
    ],
    monitoreo: [
      { parametro: "Creatinina/eGFR y potasio sérico", frecuencia: "Basal, 1-2 semanas tras iniciar o ajustar dosis, luego periódico" },
      { parametro: "Presión arterial", frecuencia: "En cada ajuste de dosis" },
    ],
    educacionPaciente: {
      queEs: "Bloquea la acción de una hormona (angiotensina II) que contrae los vasos sanguíneos, ayudando a bajar la presión y proteger el riñón.",
      comoTomarlo: "Una vez al día, con o sin alimentos, a la misma hora.",
      siOlvidaDosis: "Tomarla en cuanto se recuerde ese mismo día; si ya casi es hora de la siguiente, omitir la olvidada.",
      senalesAlarma: [
        "Hinchazón de labios, lengua o garganta, dificultad para respirar (angioedema, raro pero urgente)",
        "Debilidad muscular importante o latido cardiaco irregular (posible potasio alto)",
        "Mareo intenso al levantarse",
        "IMPORTANTE: informar de inmediato si sospecha embarazo — este medicamento no se puede usar en el embarazo",
      ],
    },
    fuentes: [
      { texto: "Goodman & Gilman — Bases Farmacológicas de la Terapéutica, 13ª ed." },
      { texto: "FDA Prescribing Information — Losartán (DailyMed)" },
      { texto: "Guía de Hipertensión Arterial 2025 AHA/ACC" },
    ],
    hipo: "bajo", peso: "neutro", costo: 1, egfrMin: 0, contra: ["EMBARAZO"],
    efectoPA: { onsetHoras: 1.5, picoHoras: 5, duracionHoras: 20, reduccionSistolica: 10, reduccionDiastolica: 6, tomasPorDia: 1 } },

  { id: "TELM", cat: "htn", grp: "ARA-II", name: "Telmisartan", ini: "40 mg", mant: "80 mg",
    adv: "Vida media larga (24h+), buena cobertura nocturna.",
    mecanismo: "Bloquea el receptor AT1 de angiotensina II con alta lipofilia, lo que le da su vida media prolongada y cobertura de 24 h.",
    vidaMediaHoras: 24, vidaMediaLabel: "~24 h (la más larga de su clase)", reduccionA1c: null,
    titr: { l: ["Inicio", "Sem 4"], d: [40, 80] },
    benef: { ic: false, erc: true, ascvd: false, stroke: false, masld: false },
    mecanismoDetalle: "Mismo mecanismo de clase que losartán (bloqueo competitivo del receptor AT1), pero con la mayor lipofilia de los ARA-II disponibles, lo que le da un gran volumen de distribución tisular y la vida media más larga de la clase (~24 h), asegurando cobertura de presión arterial completa incluso en las horas previas a la siguiente dosis (importante para el control de la presión matutina).",
    mecanismoPasos: [
      "Bloqueo competitivo del receptor AT1 (alta lipofilia → mayor duración)",
      "↓ Vasoconstricción arterial mediada por AT1",
      "↓ Liberación de aldosterona",
      "No bloquea la ECA → no acumula bradicinina",
      "↓ Presión arterial sostenida 24 h, incluyendo cobertura matutina",
    ],
    efectosAdversos: {
      frecuentes: ["Mareo, cefalea", "Hiperpotasemia leve"],
      graves: [
        "Hiperpotasemia significativa",
        "Deterioro agudo de función renal (sospechar estenosis de arteria renal)",
        "Angioedema (raro)",
        "Teratogenicidad — contraindicado en embarazo",
      ],
    },
    contraindicacionesDetalle: [
      { condicion: "Embarazo", razon: "Teratogénico" },
      { condicion: "Estenosis bilateral de arteria renal", razon: "Riesgo de falla renal aguda" },
      { condicion: "Uso concomitante con IECA", razon: "Doble bloqueo del SRAA sin beneficio adicional" },
    ],
    monitoreo: [
      { parametro: "Creatinina/eGFR y potasio sérico", frecuencia: "Basal, 1-2 semanas tras iniciar/ajustar, luego periódico" },
    ],
    educacionPaciente: {
      queEs: "Bloquea una hormona que contrae los vasos sanguíneos; su efecto dura todo el día, incluso hasta antes de la siguiente dosis.",
      comoTomarlo: "Una vez al día, con o sin alimentos.",
      siOlvidaDosis: "Tomarla en cuanto se recuerde; si ya casi es hora de la siguiente, omitir la olvidada.",
      senalesAlarma: [
        "Hinchazón de labios/lengua/garganta o dificultad para respirar (angioedema, raro)",
        "Debilidad muscular importante (posible potasio alto)",
        "IMPORTANTE: informar de inmediato si sospecha embarazo",
      ],
    },
    fuentes: [
      { texto: "Goodman & Gilman — Bases Farmacológicas de la Terapéutica, 13ª ed." },
      { texto: "FDA Prescribing Information — Telmisartán" },
    ],
    hipo: "bajo", peso: "neutro", costo: 1, egfrMin: 0, contra: ["EMBARAZO"],
    efectoPA: { onsetHoras: 1, picoHoras: 4, duracionHoras: 24, reduccionSistolica: 12, reduccionDiastolica: 7, tomasPorDia: 1 } },

  { id: "ENAL", cat: "htn", grp: "IECA", name: "Enalapril", ini: "5 mg", mant: "20 mg BID",
    adv: "1a línea alternativa a ARA-II. Tos como efecto de clase (sustituir por ARA-II si aparece, no por otro IECA — reactividad cruzada de clase). Angioedema previo con CUALQUIER IECA: contraindicación absoluta a toda la clase.",
    mecanismo: "Prodroga que se convierte en enalaprilato, inhibiendo la enzima convertidora de angiotensina y reduciendo la formación de angiotensina II.",
    vidaMediaHoras: 11, vidaMediaLabel: "~11 h (enalaprilato)", reduccionA1c: null,
    titr: { l: ["Inicio", "Sem 4"], d: [5, 20] },
    // CORRECCIÓN: benef.ic estaba en false pese a que enalapril es uno de los
    // IECA con evidencia FUNDACIONAL en insuficiencia cardíaca (CONSENSUS 1987,
    // SOLVD 1991 — reducción de mortalidad en IC con FEVI reducida), al mismo
    // nivel de evidencia que lisinopril (ATLAS) y ramipril (HOPE). No hay razón
    // clínica para que solo esos dos tuvieran benef.ic=true.
    benef: { ic: true, erc: true, ascvd: false, stroke: false, masld: false },
    mecanismoDetalle: "Prodroga que se hidroliza hepáticamente a enalaprilato, el metabolito activo que inhibe la enzima convertidora de angiotensina (ECA), bloqueando la conversión de angiotensina I a angiotensina II. Al inhibir la ECA, también reduce la degradación de bradicinina (la ECA es idéntica a la cininasa II), lo que potencia el efecto vasodilatador pero es responsable del efecto adverso característico de la clase: tos seca (por acumulación de bradicinina/sustancia P en el epitelio bronquial) y el riesgo, más raro pero grave, de angioedema.",
    mecanismoPasos: [
      "Hidrólisis hepática a enalaprilato (metabolito activo)",
      "Inhibición de la ECA → ↓ conversión de angiotensina I a II",
      "↓ Vasoconstricción + ↓ aldosterona",
      "↑ Bradicinina (por inhibición de su degradación) → efecto vasodilatador adicional, pero causa tos/angioedema",
      "↓ Presión arterial + protección cardiorrenal (evidencia fundacional en IC-FEr)",
    ],
    efectosAdversos: {
      frecuentes: ["Tos seca no productiva (efecto de clase, 5-20%)", "Mareo, cefalea", "Hiperpotasemia leve"],
      graves: [
        "Angioedema (raro pero potencialmente fatal — contraindicación absoluta a TODA la clase si ocurre una vez)",
        "Hiperpotasemia significativa",
        "Deterioro agudo de función renal (sospechar estenosis bilateral de arteria renal)",
        "Teratogenicidad — contraindicado en embarazo",
      ],
    },
    contraindicacionesDetalle: [
      { condicion: "Angioedema previo con cualquier IECA", razon: "Contraindicación absoluta a TODA la clase — no solo al fármaco específico" },
      { condicion: "Embarazo", razon: "Teratogénico — daño renal fetal" },
      { condicion: "Estenosis bilateral de arteria renal", razon: "Riesgo de falla renal aguda" },
      { condicion: "Uso concomitante con ARA-II o inhibidores de renina", razon: "Doble bloqueo del SRAA sin beneficio adicional" },
    ],
    monitoreo: [
      { parametro: "Creatinina/eGFR y potasio sérico", frecuencia: "Basal, 1-2 semanas tras iniciar/ajustar, luego periódico" },
      { parametro: "Tos persistente", frecuencia: "Preguntar en cada consulta — si aparece, cambiar a ARA-II (no a otro IECA)" },
    ],
    educacionPaciente: {
      queEs: "Bloquea la formación de una hormona (angiotensina II) que contrae los vasos sanguíneos, ayudando a bajar la presión y proteger el corazón y el riñón.",
      comoTomarlo: "Dos veces al día, con o sin alimentos.",
      siOlvidaDosis: "Tomarla en cuanto se recuerde; si ya casi es hora de la siguiente, omitir la olvidada.",
      senalesAlarma: [
        "Hinchazón de labios, lengua o garganta, dificultad para respirar — es una urgencia, buscar atención inmediata",
        "Tos seca persistente que no mejora — comentarlo, puede requerir cambio de medicamento",
        "Debilidad muscular importante (posible potasio alto)",
        "IMPORTANTE: informar de inmediato si sospecha embarazo",
      ],
    },
    fuentes: [
      { texto: "Goodman & Gilman — Bases Farmacológicas de la Terapéutica, 13ª ed." },
      { texto: "FDA Prescribing Information — Enalapril (DailyMed)" },
      { texto: "Estudios CONSENSUS/SOLVD; Guía de Hipertensión Arterial 2025 AHA/ACC" },
    ],
    hipo: "bajo", peso: "neutro", costo: 1, egfrMin: 0, contra: ["ANGIOEDEMA", "TOS_IECA", "EMBARAZO"],
    efectoPA: { onsetHoras: 1, picoHoras: 4, duracionHoras: 10, reduccionSistolica: 8, reduccionDiastolica: 5, tomasPorDia: 2 } },

  { id: "AMLO", cat: "htn", grp: "BCC Dihidropiridínico", name: "Amlodipino", ini: "5 mg", mant: "10 mg",
    adv: "1a línea si no hay albuminuria/ERC. Edema maleolar dosis-dependiente.",
    mecanismo: "Bloquea los canales de calcio tipo L en el músculo liso vascular, produciendo vasodilatación arterial periférica.",
    vidaMediaHoras: 40, vidaMediaLabel: "~30-50 h (la más larga de su clase)", reduccionA1c: null,
    titr: { l: ["Inicio", "Sem 4"], d: [5, 10] },
    benef: { ic: false, erc: false, ascvd: false, stroke: false, masld: false },
    // REDISEÑO DE FICHA (16-ago-2026): metodología en entrada "MET". Clase BCC
    // dihidropiridínico — vasoselectivo, sin efecto relevante en el nodo AV
    // (a diferencia de verapamilo/diltiazem), por eso SÍ es compatible con
    // betabloqueante.
    mecanismoDetalle: "Bloquea los canales de calcio tipo L (voltaje-dependientes) en el músculo liso de la pared arterial, impidiendo la entrada de Ca2+ necesaria para la contracción del músculo liso vascular. A diferencia de verapamilo/diltiazem, las dihidropiridinas son altamente selectivas por el músculo liso vascular sobre el tejido de conducción cardiaco, por lo que prácticamente no afectan el nodo sinoauricular ni el nodo AV — son compatibles con betabloqueantes, a diferencia de los no-dihidropiridínicos.",
    mecanismoPasos: [
      "Bloqueo de canales de calcio tipo L en músculo liso arterial",
      "↓ Entrada de Ca2+ intracelular",
      "Relajación del músculo liso vascular → vasodilatación arterial",
      "↓ Resistencia vascular periférica",
      "↓ Presión arterial (sin efecto relevante sobre el nodo AV/SA)",
    ],
    efectosAdversos: {
      frecuentes: [
        "Edema periférico maleolar (dosis-dependiente, por vasodilatación arteriolar precapilar sin venodilatación equivalente)",
        "Cefalea, rubor facial (por vasodilatación)",
        "Mareo",
      ],
      graves: ["Hipotensión sintomática (raro a dosis estándar)"],
    },
    contraindicacionesDetalle: [
      { condicion: "Estenosis aórtica severa sintomática", razon: "La vasodilatación puede agravar la hipotensión en obstrucción fija del tracto de salida" },
    ],
    monitoreo: [
      { parametro: "Edema periférico", frecuencia: "En cada consulta — principal motivo de cambio/reducción de dosis" },
      { parametro: "Presión arterial", frecuencia: "En cada ajuste de dosis" },
    ],
    educacionPaciente: {
      queEs: "Relaja los vasos sanguíneos para bajar la presión, dilatándolos directamente.",
      comoTomarlo: "Una vez al día, con o sin alimentos, a la misma hora.",
      siOlvidaDosis: "Tomarla en cuanto se recuerde; si ya casi es hora de la siguiente, omitir la olvidada.",
      senalesAlarma: [
        "Hinchazón notable de tobillos/piernas (efecto conocido, comentarlo si es molesto)",
        "Mareo intenso al levantarse",
      ],
    },
    fuentes: [
      { texto: "Goodman & Gilman — Bases Farmacológicas de la Terapéutica, 13ª ed." },
      { texto: "FDA Prescribing Information — Amlodipino" },
      { texto: "Guía de Hipertensión Arterial 2025 AHA/ACC" },
    ],
    hipo: "bajo", peso: "neutro", costo: 1, egfrMin: 0, contra: [],
    efectoPA: { onsetHoras: 6, picoHoras: 10, duracionHoras: 24, reduccionSistolica: 10, reduccionDiastolica: 6, tomasPorDia: 1 } },

  { id: "CLOR", cat: "htn", grp: "Diurético tipo Tiazida", name: "Clortalidona", ini: "12.5 mg", mant: "25 mg",
    adv: "2a línea. Más potente que HCTZ dosis-equivalente.",
    mecanismo: "Inhibe el cotransportador Na⁺-Cl⁻ en el túbulo contorneado distal, aumentando la excreción de sodio y agua.",
    vidaMediaHoras: 50, vidaMediaLabel: "~40-60 h (permite toma única diaria)", reduccionA1c: null,
    titr: { l: ["Inicio", "Sem 4"], d: [12.5, 25] },
    benef: { ic: false, erc: false, ascvd: false, stroke: false, masld: false },
    // REDISEÑO DE FICHA (16-ago-2026): metodología en entrada "MET". Clase
    // tiazídica — mecanismo/electrolitos de G&G. Clortalidona tiene vida
    // media más larga y mayor evidencia de desenlaces duros (ALLHAT) que HCTZ
    // a dosis equivalente, por eso suele preferirse dentro de la clase.
    mecanismoDetalle: "Inhibe el cotransportador Na⁺-Cl⁻ (NCC) en el túbulo contorneado distal, reduciendo la reabsorción de sodio y aumentando su excreción junto con agua (efecto diurético inicial). Con el uso crónico, el efecto antihipertensivo se mantiene aunque el efecto diurético se atenúa, por un mecanismo adicional de vasodilatación arterial directa. Tiene la vida media más larga de los diuréticos tiazídicos, lo que permite una sola toma diaria con cobertura de 24 h, y cuenta con la evidencia de desenlaces cardiovasculares más robusta de la clase (ALLHAT).",
    mecanismoPasos: [
      "Inhibición del cotransportador Na⁺-Cl⁻ (NCC) en túbulo contorneado distal",
      "↓ Reabsorción de sodio → ↑ excreción de Na⁺ y agua",
      "Efecto diurético inicial + vasodilatación arterial directa (efecto crónico)",
      "↓ Volumen circulante y resistencia vascular",
      "↓ Presión arterial sostenida (evidencia robusta de reducción de eventos CV, ALLHAT)",
    ],
    efectosAdversos: {
      frecuentes: ["Hipopotasemia", "Hiponatremia", "Hiperuricemia (puede precipitar gota)", "Hiperglucemia leve"],
      graves: [
        "Hipopotasemia severa (arritmias)",
        "Hiponatremia severa, especialmente en adultos mayores",
        "Crisis de gota aguda",
        "Fotosensibilidad cutánea",
      ],
    },
    contraindicacionesDetalle: [
      { condicion: "Gota activa o antecedente de crisis frecuentes", razon: "Reduce la excreción renal de ácido úrico" },
      { condicion: "Hiponatremia significativa preexistente", razon: "El fármaco la puede agravar" },
      { condicion: "Embarazo", razon: "No recomendado de primera línea" },
    ],
    monitoreo: [
      { parametro: "Electrolitos (Na⁺, K⁺) y ácido úrico", frecuencia: "Basal, 2-4 semanas tras iniciar/ajustar, luego periódico (más frecuente en adultos mayores)" },
      { parametro: "Glucosa", frecuencia: "Periódico — puede elevar levemente la glucosa" },
    ],
    educacionPaciente: {
      queEs: "Ayuda a eliminar sal y agua extra del cuerpo por la orina, bajando la presión.",
      comoTomarlo: "Una vez al día, en la mañana (para no interrumpir el sueño con ganas de orinar).",
      siOlvidaDosis: "Tomarla en cuanto se recuerde ese mismo día; si ya es tarde, mejor esperar al día siguiente para no interrumpir el sueño.",
      senalesAlarma: [
        "Calambres musculares, debilidad importante o palpitaciones (posible potasio o sodio bajo)",
        "Dolor articular intenso de aparición súbita, especialmente en el dedo gordo del pie (posible crisis de gota)",
        "Quemaduras solares con facilidad inusual",
      ],
    },
    fuentes: [
      { texto: "Goodman & Gilman — Bases Farmacológicas de la Terapéutica, 13ª ed." },
      { texto: "Ensayo ALLHAT; FDA Prescribing Information — Clortalidona" },
    ],
    hipo: "bajo", peso: "neutro", costo: 1, egfrMin: 0, contra: ["EMBARAZO"],
    efectoPA: { onsetHoras: 2, picoHoras: 6, duracionHoras: 22, reduccionSistolica: 9, reduccionDiastolica: 4, tomasPorDia: 1 } },

  { id: "ESPI", cat: "htn", grp: "MRA Esteroidea", name: "Espironolactona", ini: "25 mg", mant: "50 mg",
    adv: "Add-on para HTA resistente (>140/90 con 3 fármacos). Monitorizar K+ y función renal.",
    mecanismo: "Antagonista competitivo del receptor mineralocorticoide (aldosterona) en el túbulo colector, reduciendo la retención de sodio y agua.",
    vidaMediaHoras: 1.5, vidaMediaLabel: "~1.5 h (metabolitos activos hasta 20 h)", reduccionA1c: null,
    titr: { l: ["Inicio", "Sem 4"], d: [25, 50] },
    benef: { ic: true, erc: false, ascvd: false, stroke: false, masld: false },
    mecanismoDetalle: "Antagonista competitivo del receptor mineralocorticoide (aldosterona) en el túbulo colector renal, bloqueando la reabsorción de sodio/agua y la secreción de potasio mediadas por aldosterona. Al ser un esteroide sintético, tiene afinidad cruzada relevante por los receptores androgénicos (antagonista) y de progesterona (agonista parcial), lo que explica sus efectos endocrinos característicos (ginecomastia, mastodinia, irregularidades menstruales) — a diferencia de eplerenona/finerenona, más selectivos. Es diurético 'ahorrador de potasio' (efecto opuesto a tiazidas/diuréticos de asa).",
    mecanismoPasos: [
      "Bloqueo competitivo del receptor mineralocorticoide en el túbulo colector",
      "↓ Reabsorción de Na⁺/agua + ↓ secreción de K⁺ (ahorrador de potasio)",
      "Afinidad cruzada con receptores androgénicos/progesterona (efectos endocrinos)",
      "↓ Presión arterial + beneficio adicional en HTA resistente/IC",
    ],
    efectosAdversos: {
      frecuentes: ["Ginecomastia/mastodinia (por afinidad androgénica/progestágena)", "Irregularidades menstruales", "Hiperpotasemia"],
      graves: ["Hiperpotasemia severa (especialmente en ERC o con IECA/ARA-II concomitante)", "Insuficiencia renal aguda en depleción de volumen"],
    },
    contraindicacionesDetalle: [
      { condicion: "eGFR < 30 mL/min/1.73m² o hiperpotasemia significativa", razon: "Alto riesgo de hiperpotasemia severa" },
      { condicion: "Uso concomitante con suplementos de potasio o múltiples fármacos ahorradores de K⁺", razon: "Riesgo aditivo de hiperpotasemia" },
      { condicion: "Embarazo", razon: "Datos insuficientes de seguridad" },
    ],
    monitoreo: [
      { parametro: "Potasio sérico y función renal", frecuencia: "Basal, 1 semana tras iniciar/ajustar, luego periódico — el más estrecho de los antihipertensivos" },
      { parametro: "Síntomas endocrinos (ginecomastia, mastodinia, irregularidad menstrual)", frecuencia: "Preguntar en cada consulta — motivo frecuente de cambio a eplerenona" },
    ],
    educacionPaciente: {
      queEs: "Bloquea una hormona (aldosterona) que retiene sal y elimina potasio; se usa cuando otros medicamentos para la presión no son suficientes.",
      comoTomarlo: "Una vez al día, con alimentos.",
      siOlvidaDosis: "Tomarla en cuanto se recuerde; si ya casi es hora de la siguiente, omitir la olvidada.",
      senalesAlarma: [
        "Debilidad muscular importante o latido cardiaco irregular (posible potasio alto — es la alerta más importante con este medicamento)",
        "Crecimiento o dolor en el tejido mamario (en hombres, efecto conocido — comentarlo)",
        "IMPORTANTE: evitar suplementos de potasio y sustitutos de sal (contienen potasio) sin autorización médica",
      ],
    },
    fuentes: [
      { texto: "Goodman & Gilman — Bases Farmacológicas de la Terapéutica, 13ª ed." },
      { texto: "FDA Prescribing Information — Espironolactona" },
    ],
    hipo: "bajo", peso: "neutro", costo: 1, egfrMin: 30, contra: ["EMBARAZO"],
    efectoPA: { onsetHoras: 8, picoHoras: 16, duracionHoras: 24, reduccionSistolica: 6, reduccionDiastolica: 3, tomasPorDia: 1 } },

  { id: "FINE", cat: "htn", grp: "MRA No Esteroidea", name: "Finerenona", ini: "10 mg", mant: "20 mg",
    adv: "ERC+T2D con UACR≥30 mg/g y eGFR≥25: reduce progresión renal, IC y muerte CV (FIDELIO/FIGARO).",
    mecanismo: "Antagonista no esteroideo, altamente selectivo, del receptor mineralocorticoide; reduce inflamación y fibrosis renal/cardíaca inducidas por aldosterona.",
    vidaMediaHoras: 2.5, vidaMediaLabel: "~2-3 h", reduccionA1c: null,
    titr: { l: ["Inicio", "Mes 1"], d: [10, 20] },
    benef: { ic: true, erc: true, ascvd: false, stroke: false, masld: false },
    hipo: "bajo", peso: "neutro", costo: 3, egfrMin: 25, contra: ["EMBARAZO"],
    // Finerenona: efecto antihipertensivo modesto — su beneficio principal es
    // renal/CV (FIDELIO/FIGARO), no el control tensional en sí.
    mecanismoDetalle: "Antagonista NO esteroideo, altamente selectivo, del receptor mineralocorticoide — a diferencia de espironolactona/eplerenona (esteroideos), su estructura química evita casi por completo la afinidad cruzada con receptores androgénicos/progesterona (sin ginecomastia) y tiene una distribución tisular más equilibrada entre riñón y corazón, lo que se traduce en un beneficio antiinflamatorio y antifibrótico renal/cardiaco documentado en ensayos dedicados (FIDELIO-DKD, FIGARO-DKD) independiente de su efecto antihipertensivo, que es modesto.",
    mecanismoPasos: [
      "Bloqueo NO esteroideo, altamente selectivo, del receptor mineralocorticoide",
      "↓ Inflamación y fibrosis renal/cardiaca mediadas por aldosterona",
      "Mínima afinidad cruzada androgénica/progestágena (sin ginecomastia)",
      "Reducción de progresión de ERC, IC y muerte CV en DKD (FIDELIO/FIGARO) — efecto antihipertensivo secundario/modesto",
    ],
    efectosAdversos: {
      frecuentes: ["Hiperpotasemia (el efecto adverso más relevante)", "Hipotensión"],
      graves: ["Hiperpotasemia severa (especialmente con IECA/ARA-II concomitante o eGFR bajo)"],
    },
    contraindicacionesDetalle: [
      { condicion: "eGFR < 25 mL/min/1.73m² o hiperpotasemia significativa", razon: "Alto riesgo de hiperpotasemia" },
      { condicion: "Insuficiencia suprarrenal", razon: "El bloqueo mineralocorticoide puede agravarla" },
      { condicion: "Uso concomitante con inhibidores potentes de CYP3A4", razon: "Aumenta significativamente los niveles plasmáticos" },
      { condicion: "Embarazo", razon: "Datos insuficientes de seguridad" },
    ],
    monitoreo: [
      { parametro: "Potasio sérico y eGFR", frecuencia: "Basal, 4 semanas tras iniciar/ajustar dosis, luego periódico" },
    ],
    educacionPaciente: {
      queEs: "Protege al riñón y al corazón del daño causado por una hormona (aldosterona), en personas con diabetes y enfermedad renal; su efecto sobre la presión es secundario.",
      comoTomarlo: "Una vez al día, con o sin alimentos.",
      siOlvidaDosis: "Tomarla en cuanto se recuerde; si ya casi es hora de la siguiente, omitir la olvidada.",
      senalesAlarma: ["Debilidad muscular importante o latido cardiaco irregular (posible potasio alto)"],
    },
    fuentes: [
      { texto: "Ensayos FIDELIO-DKD/FIGARO-DKD; FDA Prescribing Information — Finerenona" },
    ],
    efectoPA: { onsetHoras: 2, picoHoras: 5, duracionHoras: 14, reduccionSistolica: 3, reduccionDiastolica: 2, tomasPorDia: 1 } },

  { id: "CARV", cat: "htn", grp: "Beta-bloqueante combinado α-β", name: "Carvedilol", ini: "6.25 mg BID", mant: "25 mg BID",
    adv: "Más weight-sparing que atenolol/metoprolol. Útil si coexiste IC/angina.",
    mecanismo: "Bloquea receptores beta-1, beta-2 (reduce frecuencia cardíaca y contractilidad) y alfa-1 (vasodilatación periférica adicional).",
    vidaMediaHoras: 8, vidaMediaLabel: "~7-10 h", reduccionA1c: null,
    titr: { l: ["Inicio", "Sem 2", "Sem 4"], d: [6.25, 12.5, 25] },
    benef: { ic: true, erc: false, ascvd: false, stroke: false, masld: false },
    // REDISEÑO DE FICHA (16-ago-2026): metodología en entrada "MET". Betabloq
    // combinado α-β — mecanismo/adversos de G&G; suspensión abrupta puede
    // causar taquicardia/HTA de rebote y angina en cardiopatía isquémica,
    // efecto de clase de TODOS los betabloqueantes de esta sección.
    mecanismoDetalle: "Bloquea los receptores adrenérgicos beta-1 (cardiacos: ↓frecuencia cardiaca y contractilidad), beta-2 (músculo liso bronquial/vascular) y alfa-1 (vasodilatación periférica adicional) de forma no selectiva. Esta combinación de bloqueo beta y alfa reduce tanto el gasto cardiaco como la resistencia vascular periférica, dándole un perfil más 'weight-sparing' y con menos empeoramiento de la resistencia a la insulina que los betabloqueantes puros — por eso se prefiere sobre atenolol/metoprolol cuando coexiste síndrome metabólico, además de su beneficio establecido en IC.",
    mecanismoPasos: [
      "Bloqueo de receptores beta-1 (↓ frecuencia cardiaca y contractilidad)",
      "Bloqueo de receptores beta-2 (broncoconstricción/vasoconstricción — precaución en asma)",
      "Bloqueo de receptores alfa-1 (vasodilatación periférica adicional)",
      "↓ Gasto cardiaco + ↓ resistencia vascular periférica",
      "↓ Presión arterial + beneficio de mortalidad en IC-FEr",
    ],
    efectosAdversos: {
      frecuentes: ["Fatiga, mareo", "Bradicardia", "Hipotensión ortostática (por el componente alfa)"],
      graves: [
        "Broncoespasmo en asma/EPOC (componente beta-2)",
        "Bradicardia severa/bloqueo AV",
        "Enmascaramiento de síntomas de hipoglucemia en diabetes (taquicardia)",
        "Descompensación de IC o angina/HTA de rebote si se SUSPENDE ABRUPTAMENTE",
      ],
    },
    contraindicacionesDetalle: [
      { condicion: "Asma o broncoespasmo severo activo", razon: "El bloqueo beta-2 puede precipitar broncoespasmo" },
      { condicion: "Bradicardia severa o bloqueo AV de 2º/3er grado (sin marcapasos)", razon: "Puede agravar el bloqueo" },
      { condicion: "IC descompensada aguda", razon: "Iniciar solo cuando el paciente está euvolémico y estable" },
    ],
    monitoreo: [
      { parametro: "Frecuencia cardiaca y presión arterial (incluyendo ortostatismo)", frecuencia: "Basal y en cada ajuste de dosis" },
      { parametro: "Nunca suspender abruptamente", frecuencia: "Reducir de forma gradual siempre — riesgo de rebote" },
    ],
    educacionPaciente: {
      queEs: "Frena el corazón y relaja los vasos sanguíneos al mismo tiempo, bajando la presión y protegiendo al corazón si está debilitado.",
      comoTomarlo: "Dos veces al día, con alimentos (reduce el riesgo de mareo).",
      siOlvidaDosis: "Tomarla en cuanto se recuerde; si ya casi es hora de la siguiente, omitir la olvidada.",
      senalesAlarma: [
        "Mareo intenso al levantarse",
        "Latido muy lento o desmayo",
        "Dificultad para respirar o silbido en el pecho (si tiene asma)",
        "IMPORTANTE: NUNCA dejar de tomarlo de golpe — puede causar palpitaciones, dolor en el pecho o subida de presión de rebote; siempre reducirlo gradualmente con supervisión médica",
      ],
    },
    fuentes: [
      { texto: "Goodman & Gilman — Bases Farmacológicas de la Terapéutica, 13ª ed." },
      { texto: "FDA Prescribing Information — Carvedilol" },
    ],
    hipo: "bajo", peso: "neutro", costo: 2, egfrMin: 0, contra: [],
    efectoPA: { onsetHoras: 1, picoHoras: 3, duracionHoras: 10, reduccionSistolica: 8, reduccionDiastolica: 5, tomasPorDia: 2 } },

  { id: "LISI", cat: "htn", grp: "IECA", name: "Lisinopril", ini: "10 mg", mant: "40 mg",
    adv: "No requiere activación hepática (a diferencia de enalapril/ramipril) — preferible si hay disfunción hepática. Evidencia de reducción de mortalidad en IC (ATLAS).",
    mecanismo: "Inhibe directamente la ECA sin necesitar biotransformación hepática, reduciendo la formación de angiotensina II.",
    vidaMediaHoras: 12, vidaMediaLabel: "~12 h", reduccionA1c: null,
    titr: { l: ["Inicio", "Sem 4"], d: [10, 40] },
    benef: { ic: true, erc: true, ascvd: false, stroke: false, masld: false },
    mecanismoDetalle: "Mismo mecanismo de clase que enalapril (inhibición de la ECA → ↓angiotensina II, ↑bradicinina), pero es un inhibidor DIRECTO de la ECA que no requiere biotransformación hepática a un metabolito activo — ventaja relevante en pacientes con disfunción hepática. Cuenta con evidencia dedicada de reducción de mortalidad en IC-FEr (ATLAS) al mismo nivel que enalapril.",
    mecanismoPasos: [
      "Inhibición DIRECTA de la ECA (sin necesitar activación hepática)",
      "↓ Conversión de angiotensina I a II",
      "↓ Vasoconstricción + ↓ aldosterona",
      "↑ Bradicinina → efecto vasodilatador adicional, pero causa tos/angioedema",
      "↓ Presión arterial + protección cardiorrenal",
    ],
    efectosAdversos: {
      frecuentes: ["Tos seca no productiva (efecto de clase)", "Mareo, cefalea", "Hiperpotasemia leve"],
      graves: ["Angioedema (contraindicación absoluta a toda la clase)", "Hiperpotasemia significativa", "Deterioro agudo de función renal", "Teratogenicidad"],
    },
    contraindicacionesDetalle: [
      { condicion: "Angioedema previo con cualquier IECA", razon: "Contraindicación absoluta a TODA la clase" },
      { condicion: "Embarazo", razon: "Teratogénico" },
      { condicion: "Estenosis bilateral de arteria renal", razon: "Riesgo de falla renal aguda" },
      { condicion: "Uso concomitante con ARA-II", razon: "Doble bloqueo del SRAA sin beneficio adicional" },
    ],
    monitoreo: [
      { parametro: "Creatinina/eGFR y potasio sérico", frecuencia: "Basal, 1-2 semanas tras iniciar/ajustar, luego periódico" },
      { parametro: "Tos persistente", frecuencia: "Preguntar en cada consulta" },
    ],
    educacionPaciente: {
      queEs: "Bloquea la formación de una hormona que contrae los vasos sanguíneos, ayudando a bajar la presión y proteger el corazón y el riñón.",
      comoTomarlo: "Una vez al día, con o sin alimentos.",
      siOlvidaDosis: "Tomarla en cuanto se recuerde; si ya casi es hora de la siguiente, omitir la olvidada.",
      senalesAlarma: [
        "Hinchazón de labios, lengua o garganta — urgencia, buscar atención inmediata",
        "Tos seca persistente",
        "Debilidad muscular importante",
        "IMPORTANTE: informar si sospecha embarazo",
      ],
    },
    fuentes: [
      { texto: "Goodman & Gilman — Bases Farmacológicas de la Terapéutica, 13ª ed." },
      { texto: "Ensayo ATLAS; FDA Prescribing Information — Lisinopril" },
    ],
    hipo: "bajo", peso: "neutro", costo: 1, egfrMin: 0, contra: ["ANGIOEDEMA", "TOS_IECA", "EMBARAZO"],
    efectoPA: { onsetHoras: 1, picoHoras: 6, duracionHoras: 24, reduccionSistolica: 9, reduccionDiastolica: 5, tomasPorDia: 1 } },

  { id: "RAMI", cat: "htn", grp: "IECA", name: "Ramipril", ini: "2.5 mg", mant: "10 mg",
    adv: "Evidencia robusta de reducción de eventos CV en alto riesgo (HOPE), incluso con PA basal cercana a la meta.",
    mecanismo: "Prodroga que se convierte en ramiprilato, inhibiendo la ECA y reduciendo angiotensina II.",
    vidaMediaHoras: 14, vidaMediaLabel: "~13-17 h (ramiprilato)", reduccionA1c: null,
    titr: { l: ["Inicio", "Sem 4"], d: [2.5, 10] },
    benef: { ic: true, erc: true, ascvd: true, stroke: false, masld: false },
    mecanismoDetalle: "Prodroga que se hidroliza hepáticamente a ramiprilato, el metabolito activo que inhibe la ECA (mismo mecanismo de clase que enalapril/lisinopril). Cuenta con la evidencia más robusta de reducción de eventos cardiovasculares mayores en pacientes de alto riesgo (HOPE), incluso con presión arterial basal ya cercana a la meta — beneficio que se atribuye a un efecto vascular protector más allá del simple descenso tensional.",
    mecanismoPasos: [
      "Hidrólisis hepática a ramiprilato (metabolito activo)",
      "Inhibición de la ECA → ↓ conversión de angiotensina I a II",
      "↓ Vasoconstricción + ↓ aldosterona",
      "↑ Bradicinina → efecto vasodilatador adicional, pero causa tos/angioedema",
      "↓ Presión arterial + reducción de eventos CV mayores en alto riesgo (HOPE)",
    ],
    efectosAdversos: {
      frecuentes: ["Tos seca no productiva", "Mareo, cefalea", "Hiperpotasemia leve"],
      graves: ["Angioedema (contraindicación absoluta a toda la clase)", "Hiperpotasemia significativa", "Deterioro agudo de función renal", "Teratogenicidad"],
    },
    contraindicacionesDetalle: [
      { condicion: "Angioedema previo con cualquier IECA", razon: "Contraindicación absoluta a TODA la clase" },
      { condicion: "Embarazo", razon: "Teratogénico" },
      { condicion: "Estenosis bilateral de arteria renal", razon: "Riesgo de falla renal aguda" },
      { condicion: "Uso concomitante con ARA-II", razon: "Doble bloqueo del SRAA sin beneficio adicional" },
    ],
    monitoreo: [
      { parametro: "Creatinina/eGFR y potasio sérico", frecuencia: "Basal, 1-2 semanas tras iniciar/ajustar, luego periódico" },
      { parametro: "Tos persistente", frecuencia: "Preguntar en cada consulta" },
    ],
    educacionPaciente: {
      queEs: "Bloquea la formación de una hormona que contrae los vasos sanguíneos; en personas de alto riesgo cardiovascular ayuda a prevenir infartos y derrames incluso si la presión ya está controlada.",
      comoTomarlo: "Una vez al día, con o sin alimentos.",
      siOlvidaDosis: "Tomarla en cuanto se recuerde; si ya casi es hora de la siguiente, omitir la olvidada.",
      senalesAlarma: [
        "Hinchazón de labios, lengua o garganta — urgencia",
        "Tos seca persistente",
        "Debilidad muscular importante",
        "IMPORTANTE: informar si sospecha embarazo",
      ],
    },
    fuentes: [
      { texto: "Goodman & Gilman — Bases Farmacológicas de la Terapéutica, 13ª ed." },
      { texto: "Ensayo HOPE; FDA Prescribing Information — Ramipril" },
    ],
    hipo: "bajo", peso: "neutro", costo: 1, egfrMin: 0, contra: ["ANGIOEDEMA", "TOS_IECA", "EMBARAZO"],
    efectoPA: { onsetHoras: 1, picoHoras: 5, duracionHoras: 24, reduccionSistolica: 9, reduccionDiastolica: 5, tomasPorDia: 1 } },

  { id: "VALS", cat: "htn", grp: "ARA-II", name: "Valsartán", ini: "80 mg", mant: "320 mg",
    adv: "Evidencia en IC con fracción de eyección reducida (Val-HeFT) además del efecto antihipertensivo.",
    mecanismo: "Bloquea selectivamente el receptor AT1 de angiotensina II.",
    vidaMediaHoras: 6, vidaMediaLabel: "~6 h", reduccionA1c: null,
    titr: { l: ["Inicio", "Sem 4"], d: [80, 320] },
    benef: { ic: true, erc: true, ascvd: false, stroke: false, masld: false },
    mecanismoDetalle: "Mismo mecanismo de clase (bloqueo competitivo del receptor AT1 de angiotensina II), con evidencia dedicada de reducción de hospitalización por insuficiencia cardiaca en IC con fracción de eyección reducida (Val-HeFT), además del efecto antihipertensivo estándar de la clase.",
    mecanismoPasos: [
      "Bloqueo competitivo del receptor AT1",
      "↓ Vasoconstricción arterial + ↓ liberación de aldosterona",
      "No bloquea la ECA → no acumula bradicinina",
      "↓ Presión arterial + beneficio en remodelación cardiaca (IC-FEr)",
    ],
    efectosAdversos: {
      frecuentes: ["Mareo, cefalea", "Hiperpotasemia leve"],
      graves: ["Hiperpotasemia significativa", "Deterioro agudo de función renal", "Angioedema (raro)", "Teratogenicidad"],
    },
    contraindicacionesDetalle: [
      { condicion: "Embarazo", razon: "Teratogénico" },
      { condicion: "Estenosis bilateral de arteria renal", razon: "Riesgo de falla renal aguda" },
      { condicion: "Uso concomitante con IECA", razon: "Doble bloqueo del SRAA sin beneficio adicional" },
    ],
    monitoreo: [
      { parametro: "Creatinina/eGFR y potasio sérico", frecuencia: "Basal, 1-2 semanas tras iniciar/ajustar, luego periódico" },
    ],
    educacionPaciente: {
      queEs: "Bloquea una hormona que contrae los vasos sanguíneos; en personas con el corazón debilitado también ayuda a que trabaje mejor.",
      comoTomarlo: "Una vez al día, con o sin alimentos.",
      siOlvidaDosis: "Tomarla en cuanto se recuerde; si ya casi es hora de la siguiente, omitir la olvidada.",
      senalesAlarma: ["Hinchazón de labios/lengua/garganta (angioedema, raro)", "Debilidad muscular importante (posible potasio alto)", "IMPORTANTE: informar si sospecha embarazo"],
    },
    fuentes: [
      { texto: "Goodman & Gilman — Bases Farmacológicas de la Terapéutica, 13ª ed." },
      { texto: "Ensayo Val-HeFT; FDA Prescribing Information — Valsartán" },
    ],
    hipo: "bajo", peso: "neutro", costo: 1, egfrMin: 0, contra: ["EMBARAZO"],
    efectoPA: { onsetHoras: 2, picoHoras: 4, duracionHoras: 24, reduccionSistolica: 10, reduccionDiastolica: 6, tomasPorDia: 1 } },

  { id: "NIFE", cat: "htn", grp: "BCC Dihidropiridínico", name: "Nifedipino (liberación prolongada)", ini: "30 mg", mant: "90 mg",
    adv: "Evitar la presentación de liberación inmediata (riesgo de hipotensión brusca/taquicardia refleja) — usar solo la forma de liberación prolongada.",
    mecanismo: "Bloquea canales de calcio tipo L en músculo liso vascular, produciendo vasodilatación arterial.",
    vidaMediaHoras: 10, vidaMediaLabel: "~10 h (liberación prolongada, cobertura 24 h)", reduccionA1c: null,
    titr: { l: ["Inicio", "Sem 4"], d: [30, 90] },
    benef: { ic: false, erc: false, ascvd: false, stroke: false, masld: false },
    mecanismoDetalle: "Mismo mecanismo de clase que amlodipino (bloqueo de canales de calcio tipo L en músculo liso arterial). La formulación de LIBERACIÓN PROLONGADA es obligatoria en HTA crónica: la presentación de liberación inmediata (ya no recomendada) produce una caída tensional muy rápida con taquicardia refleja marcada, asociada a mayor riesgo de eventos isquémicos coronarios en estudios observacionales — la liberación prolongada evita este pico brusco.",
    mecanismoPasos: [
      "Bloqueo de canales de calcio tipo L en músculo liso arterial",
      "↓ Entrada de Ca2+ intracelular",
      "Vasodilatación arterial (liberación prolongada = ascenso gradual, sin pico brusco)",
      "↓ Resistencia vascular periférica",
      "↓ Presión arterial sostenida 24 h",
    ],
    efectosAdversos: {
      frecuentes: ["Edema periférico maleolar", "Cefalea, rubor facial", "Taquicardia refleja (mínima con la formulación de liberación prolongada)"],
      graves: ["Hipotensión brusca con taquicardia refleja SI se usa por error la formulación de liberación inmediata"],
    },
    contraindicacionesDetalle: [
      { condicion: "Uso de la formulación de liberación INMEDIATA en HTA crónica", razon: "Riesgo de hipotensión brusca y taquicardia refleja — usar solo liberación prolongada" },
      { condicion: "Estenosis aórtica severa sintomática", razon: "La vasodilatación puede agravar la hipotensión" },
    ],
    monitoreo: [
      { parametro: "Confirmar formulación de liberación prolongada en cada receta", frecuencia: "Verificar siempre — es un error de prescripción frecuente y peligroso" },
      { parametro: "Edema periférico", frecuencia: "En cada consulta" },
    ],
    educacionPaciente: {
      queEs: "Relaja los vasos sanguíneos para bajar la presión de forma gradual durante todo el día.",
      comoTomarlo: "Una vez al día — NO partir, triturar ni masticar la tableta (es de liberación prolongada, romperla libera todo el medicamento de golpe).",
      siOlvidaDosis: "Tomarla en cuanto se recuerde; si ya casi es hora de la siguiente, omitir la olvidada.",
      senalesAlarma: ["Hinchazón de tobillos/piernas", "Palpitaciones o mareo intenso"],
    },
    fuentes: [
      { texto: "Goodman & Gilman — Bases Farmacológicas de la Terapéutica, 13ª ed." },
      { texto: "FDA Prescribing Information — Nifedipino de liberación prolongada" },
    ],
    hipo: "bajo", peso: "neutro", costo: 1, egfrMin: 0, contra: [],
    efectoPA: { onsetHoras: 4, picoHoras: 8, duracionHoras: 24, reduccionSistolica: 9, reduccionDiastolica: 5, tomasPorDia: 1 } },

  { id: "FELO", cat: "htn", grp: "BCC Dihidropiridínico", name: "Felodipino", ini: "5 mg", mant: "10 mg",
    adv: "Alternativa a amlodipino, ligeramente menor duración de acción.",
    mecanismo: "Bloquea canales de calcio tipo L, con alta selectividad vascular sobre la cardíaca.",
    vidaMediaHoras: 13, vidaMediaLabel: "~11-16 h", reduccionA1c: null,
    titr: { l: ["Inicio", "Sem 4"], d: [5, 10] },
    benef: { ic: false, erc: false, ascvd: false, stroke: false, masld: false },
    mecanismoDetalle: "Mismo mecanismo de clase que amlodipino/nifedipino (bloqueo de canales de calcio tipo L en músculo liso arterial), con la mayor selectividad vascular sobre la cardíaca de la clase dihidropiridínica. Alternativa razonable a amlodipino con duración de acción ligeramente menor.",
    mecanismoPasos: [
      "Bloqueo de canales de calcio tipo L en músculo liso arterial",
      "↓ Entrada de Ca2+ intracelular",
      "Vasodilatación arterial (alta selectividad vascular)",
      "↓ Presión arterial",
    ],
    efectosAdversos: {
      frecuentes: ["Edema periférico maleolar", "Cefalea, rubor facial"],
      graves: ["Hipotensión sintomática (raro)"],
    },
    contraindicacionesDetalle: [
      { condicion: "Estenosis aórtica severa sintomática", razon: "La vasodilatación puede agravar la hipotensión" },
    ],
    monitoreo: [
      { parametro: "Edema periférico", frecuencia: "En cada consulta" },
    ],
    educacionPaciente: {
      queEs: "Relaja los vasos sanguíneos para bajar la presión.",
      comoTomarlo: "Una vez al día, con o sin alimentos.",
      siOlvidaDosis: "Tomarla en cuanto se recuerde; si ya casi es hora de la siguiente, omitir la olvidada.",
      senalesAlarma: ["Hinchazón de tobillos/piernas", "Mareo intenso al levantarse"],
    },
    fuentes: [
      { texto: "Goodman & Gilman — Bases Farmacológicas de la Terapéutica, 13ª ed." },
      { texto: "FDA Prescribing Information — Felodipino" },
    ],
    hipo: "bajo", peso: "neutro", costo: 1, egfrMin: 0, contra: [],
    efectoPA: { onsetHoras: 3, picoHoras: 6, duracionHoras: 22, reduccionSistolica: 8, reduccionDiastolica: 5, tomasPorDia: 1 } },

  { id: "VERA", cat: "htn", grp: "BCC No Dihidropiridínico", name: "Verapamilo (liberación prolongada)", ini: "120 mg", mant: "240 mg",
    adv: "Útil si coexiste taquiarritmia supraventricular. Evitar combinar con betabloqueante (riesgo de bloqueo AV/bradicardia severa).",
    mecanismo: "Bloquea canales de calcio tipo L con efecto adicional cronotrópico e inotrópico negativo (acción sobre el nodo AV), a diferencia de las dihidropiridinas.",
    vidaMediaHoras: 6, vidaMediaLabel: "~4-8 h (liberación prolongada: cobertura 24 h)", reduccionA1c: null,
    titr: { l: ["Inicio", "Sem 4"], d: [120, 240] },
    benef: { ic: false, erc: false, ascvd: false, stroke: false, masld: false },
    mecanismoDetalle: "Bloquea los canales de calcio tipo L, pero a diferencia de las dihidropiridinas tiene una afinidad relevante también por el tejido de conducción cardiaco (nodo SA y AV), produciendo un efecto cronotrópico e inotrópico NEGATIVO significativo — reduce la frecuencia cardiaca y la conducción a través del nodo AV, además del efecto vasodilatador periférico. Por esta acción dual (vascular + cardiaca), es útil en taquiarritmias supraventriculares, pero peligroso combinarlo con betabloqueantes (ambos deprimen el nodo AV).",
    mecanismoPasos: [
      "Bloqueo de canales de calcio tipo L en músculo liso vascular Y tejido de conducción cardiaco",
      "↓ Conducción a través del nodo AV (efecto dromotrópico negativo)",
      "↓ Frecuencia cardiaca (efecto cronotrópico negativo)",
      "Vasodilatación arterial periférica",
      "↓ Presión arterial + control de frecuencia en taquiarritmias supraventriculares",
    ],
    efectosAdversos: {
      frecuentes: ["Estreñimiento (característico de verapamilo)", "Edema periférico", "Mareo, cefalea"],
      graves: [
        "Bradicardia significativa / bloqueo AV (especialmente combinado con betabloqueante)",
        "Empeoramiento de insuficiencia cardiaca con FEVI reducida (efecto inotrópico negativo)",
      ],
    },
    contraindicacionesDetalle: [
      { condicion: "Insuficiencia cardiaca con FEVI reducida", razon: "Efecto inotrópico negativo puede descompensarla" },
      { condicion: "Uso concomitante con betabloqueante", razon: "Riesgo aditivo de bradicardia severa/bloqueo AV" },
      { condicion: "Bloqueo AV de 2º/3er grado o enfermedad del nodo sinusal (sin marcapasos)", razon: "Puede agravar el bloqueo" },
    ],
    monitoreo: [
      { parametro: "Frecuencia cardiaca / ECG", frecuencia: "Basal y en cada ajuste de dosis, especialmente si hay otros fármacos que afectan el nodo AV" },
      { parametro: "Función hepática", frecuencia: "Metabolismo hepático — considerar en insuficiencia hepática" },
    ],
    educacionPaciente: {
      queEs: "Relaja los vasos sanguíneos y también hace que el corazón lata más despacio; útil si además hay palpitaciones o arritmias.",
      comoTomarlo: "Una vez al día — NO partir ni triturar (liberación prolongada).",
      siOlvidaDosis: "Tomarla en cuanto se recuerde; si ya casi es hora de la siguiente, omitir la olvidada.",
      senalesAlarma: [
        "Latido muy lento, mareo intenso o desmayo",
        "Estreñimiento importante — aumentar fibra/líquidos",
        "Hinchazón de tobillos/piernas",
      ],
    },
    fuentes: [
      { texto: "Goodman & Gilman — Bases Farmacológicas de la Terapéutica, 13ª ed." },
      { texto: "FDA Prescribing Information — Verapamilo" },
    ],
    hipo: "bajo", peso: "neutro", costo: 1, egfrMin: 0, contra: ["IC"],
    efectoPA: { onsetHoras: 2, picoHoras: 5, duracionHoras: 24, reduccionSistolica: 8, reduccionDiastolica: 5, tomasPorDia: 1 } },

  { id: "DILT", cat: "htn", grp: "BCC No Dihidropiridínico", name: "Diltiazem (liberación prolongada)", ini: "120 mg", mant: "360 mg",
    adv: "Alternativa a verapamilo, algo menos inotrópico negativo. Evitar combinar con betabloqueante.",
    mecanismo: "Bloquea canales de calcio tipo L con efecto sobre el nodo AV/SA además de la vasodilatación periférica.",
    vidaMediaHoras: 6, vidaMediaLabel: "~4-6 h (liberación prolongada: cobertura 24 h)", reduccionA1c: null,
    titr: { l: ["Inicio", "Sem 4"], d: [120, 360] },
    benef: { ic: false, erc: false, ascvd: false, stroke: false, masld: false },
    mecanismoDetalle: "Mismo mecanismo dual que verapamilo (bloqueo de canales de calcio tipo L en músculo liso vascular Y tejido de conducción cardiaco), con efecto inotrópico negativo algo menos marcado. Comparte las mismas precauciones cardíacas: útil en taquiarritmias supraventriculares, pero peligroso combinado con betabloqueantes.",
    mecanismoPasos: [
      "Bloqueo de canales de calcio tipo L en músculo liso vascular Y nodo AV/SA",
      "↓ Conducción a través del nodo AV",
      "↓ Frecuencia cardiaca (efecto algo menor que verapamilo)",
      "Vasodilatación arterial periférica",
      "↓ Presión arterial + control de frecuencia en taquiarritmias",
    ],
    efectosAdversos: {
      frecuentes: ["Edema periférico", "Mareo, cefalea", "Estreñimiento (menos que verapamilo)"],
      graves: ["Bradicardia / bloqueo AV (especialmente con betabloqueante)", "Empeoramiento de IC con FEVI reducida"],
    },
    contraindicacionesDetalle: [
      { condicion: "Insuficiencia cardiaca con FEVI reducida", razon: "Efecto inotrópico negativo" },
      { condicion: "Uso concomitante con betabloqueante", razon: "Riesgo aditivo de bradicardia/bloqueo AV" },
      { condicion: "Bloqueo AV de 2º/3er grado (sin marcapasos)", razon: "Puede agravar el bloqueo" },
    ],
    monitoreo: [
      { parametro: "Frecuencia cardiaca / ECG", frecuencia: "Basal y en cada ajuste de dosis" },
    ],
    educacionPaciente: {
      queEs: "Relaja los vasos sanguíneos y hace que el corazón lata más despacio.",
      comoTomarlo: "Una vez al día — NO partir ni triturar (liberación prolongada).",
      siOlvidaDosis: "Tomarla en cuanto se recuerde; si ya casi es hora de la siguiente, omitir la olvidada.",
      senalesAlarma: ["Latido muy lento, mareo intenso o desmayo", "Hinchazón de tobillos/piernas"],
    },
    fuentes: [
      { texto: "Goodman & Gilman — Bases Farmacológicas de la Terapéutica, 13ª ed." },
      { texto: "FDA Prescribing Information — Diltiazem" },
    ],
    hipo: "bajo", peso: "neutro", costo: 1, egfrMin: 0, contra: ["IC"],
    efectoPA: { onsetHoras: 2, picoHoras: 5, duracionHoras: 24, reduccionSistolica: 8, reduccionDiastolica: 5, tomasPorDia: 1 } },

  { id: "HCTZ", cat: "htn", grp: "Diurético tipo Tiazida", name: "Hidroclorotiazida", ini: "12.5 mg", mant: "25 mg",
    adv: "El diurético tiazídico más usado; clortalidona tiene evidencia de mayor reducción de eventos CV a dosis equivalente.",
    mecanismo: "Inhibe el cotransportador Na⁺-Cl⁻ en el túbulo contorneado distal.",
    vidaMediaHoras: 10, vidaMediaLabel: "~6-15 h", reduccionA1c: null,
    titr: { l: ["Inicio", "Sem 4"], d: [12.5, 25] },
    benef: { ic: false, erc: false, ascvd: false, stroke: false, masld: false },
    mecanismoDetalle: "Mismo mecanismo de clase que clortalidona (inhibición del cotransportador Na⁺-Cl⁻ en el túbulo contorneado distal), es el tiazídico más recetado en el mundo por costo y familiaridad, pero con vida media más corta y menor evidencia de desenlaces duros a dosis equivalente frente a clortalidona en comparaciones directas.",
    mecanismoPasos: [
      "Inhibición del cotransportador Na⁺-Cl⁻ en túbulo contorneado distal",
      "↓ Reabsorción de sodio → ↑ excreción de Na⁺ y agua",
      "Efecto diurético + vasodilatación arterial directa (efecto crónico)",
      "↓ Presión arterial",
    ],
    efectosAdversos: {
      frecuentes: ["Hipopotasemia", "Hiponatremia", "Hiperuricemia", "Hiperglucemia leve"],
      graves: ["Hipopotasemia severa", "Hiponatremia severa (más en adultos mayores)", "Crisis de gota"],
    },
    contraindicacionesDetalle: [
      { condicion: "Gota activa", razon: "Reduce la excreción renal de ácido úrico" },
      { condicion: "Hiponatremia significativa preexistente", razon: "El fármaco la puede agravar" },
    ],
    monitoreo: [
      { parametro: "Electrolitos (Na⁺, K⁺) y ácido úrico", frecuencia: "Basal, 2-4 semanas tras iniciar/ajustar, luego periódico" },
    ],
    educacionPaciente: {
      queEs: "Ayuda a eliminar sal y agua extra del cuerpo por la orina, bajando la presión.",
      comoTomarlo: "Una vez al día, en la mañana.",
      siOlvidaDosis: "Tomarla en cuanto se recuerde ese mismo día; si ya es tarde, mejor esperar al día siguiente.",
      senalesAlarma: [
        "Calambres musculares, debilidad importante o palpitaciones",
        "Dolor articular intenso de aparición súbita (posible gota)",
      ],
    },
    fuentes: [
      { texto: "Goodman & Gilman — Bases Farmacológicas de la Terapéutica, 13ª ed." },
      { texto: "FDA Prescribing Information — Hidroclorotiazida" },
    ],
    hipo: "bajo", peso: "neutro", costo: 1, egfrMin: 0, contra: ["EMBARAZO"],
    efectoPA: { onsetHoras: 2, picoHoras: 4, duracionHoras: 12, reduccionSistolica: 8, reduccionDiastolica: 4, tomasPorDia: 1 } },

  { id: "INDA", cat: "htn", grp: "Diurético tipo Tiazida", name: "Indapamida", ini: "1.25 mg", mant: "2.5 mg",
    adv: "Evidencia de reducción de stroke (PROGRESS, HYVET) en adultos mayores.",
    mecanismo: "Similar a las tiazidas (inhibe el cotransportador Na⁺-Cl⁻), con efecto vasodilatador adicional independiente de su acción diurética.",
    vidaMediaHoras: 16, vidaMediaLabel: "~14-18 h", reduccionA1c: null,
    titr: { l: ["Inicio", "Sem 4"], d: [1.25, 2.5] },
    benef: { ic: false, erc: false, ascvd: false, stroke: true, masld: false },
    mecanismoDetalle: "Tipo similar a las tiazidas (inhibe el cotransportador Na⁺-Cl⁻ en el túbulo contorneado distal), con un efecto vasodilatador adicional independiente de su acción diurética (bloqueo de canales de calcio y aumento de prostaglandinas vasodilatadoras), lo que le confiere un buen perfil metabólico a dosis bajas. Cuenta con evidencia dedicada de reducción de stroke en adultos mayores (PROGRESS, HYVET).",
    mecanismoPasos: [
      "Inhibición del cotransportador Na⁺-Cl⁻ en túbulo contorneado distal",
      "↓ Reabsorción de sodio → ↑ excreción de Na⁺ y agua",
      "Efecto vasodilatador adicional (independiente del efecto diurético)",
      "↓ Presión arterial + reducción de stroke en adultos mayores",
    ],
    efectosAdversos: {
      frecuentes: ["Hipopotasemia (menos marcada a dosis bajas)", "Hiponatremia"],
      graves: ["Hipopotasemia/hiponatremia severa, especialmente en adultos mayores"],
    },
    contraindicacionesDetalle: [
      { condicion: "Hiponatremia significativa preexistente", razon: "El fármaco la puede agravar" },
      { condicion: "Gota activa", razon: "Reduce la excreción renal de ácido úrico" },
    ],
    monitoreo: [
      { parametro: "Electrolitos (Na⁺, K⁺)", frecuencia: "Basal, 2-4 semanas tras iniciar/ajustar, luego periódico" },
    ],
    educacionPaciente: {
      queEs: "Ayuda a eliminar sal y agua extra del cuerpo por la orina, bajando la presión y reduciendo el riesgo de derrame cerebral en adultos mayores.",
      comoTomarlo: "Una vez al día, en la mañana.",
      siOlvidaDosis: "Tomarla en cuanto se recuerde ese mismo día; si ya es tarde, esperar al día siguiente.",
      senalesAlarma: ["Calambres musculares, debilidad importante o palpitaciones"],
    },
    fuentes: [
      { texto: "Goodman & Gilman — Bases Farmacológicas de la Terapéutica, 13ª ed." },
      { texto: "Ensayos PROGRESS/HYVET; FDA Prescribing Information — Indapamida" },
    ],
    hipo: "bajo", peso: "neutro", costo: 1, egfrMin: 0, contra: ["EMBARAZO"],
    efectoPA: { onsetHoras: 2, picoHoras: 6, duracionHoras: 24, reduccionSistolica: 9, reduccionDiastolica: 4, tomasPorDia: 1 } },

  { id: "FURO", cat: "htn", grp: "Diurético de Asa", name: "Furosemida", ini: "20 mg", mant: "80 mg",
    adv: "Reservado para sobrecarga de volumen (IC, ERC avanzada) — poco eficaz como antihipertensivo puro en función renal normal por su vida media corta.",
    mecanismo: "Inhibe el cotransportador Na⁺-K⁺-2Cl⁻ en el asa ascendente de Henle, generando diuresis potente pero de acción corta.",
    vidaMediaHoras: 2, vidaMediaLabel: "~1.5-2 h", reduccionA1c: null,
    titr: { l: ["Inicio", "Sem 2"], d: [20, 80] },
    benef: { ic: true, erc: false, ascvd: false, stroke: false, masld: false },
    mecanismoDetalle: "Inhibe el cotransportador Na⁺-K⁺-2Cl⁻ (NKCC2) en la rama ascendente gruesa del asa de Henle, el segmento de mayor capacidad de reabsorción de sodio del nefrón — por eso genera una diuresis mucho más potente que las tiazidas, pero de acción corta (t½ ~1.5-2 h). Al bloquear NKCC2 también se pierde el gradiente osmótico medular necesario para concentrar la orina, y se pierde K+/Ca2+/Mg2+ adicionales. Por su vida media corta y acción intensa pero breve, es POCO eficaz como antihipertensivo puro en función renal normal — su indicación principal es la sobrecarga de volumen (IC, ERC avanzada, edema).",
    mecanismoPasos: [
      "Inhibición del cotransportador Na⁺-K⁺-2Cl⁻ (NKCC2) en el asa ascendente de Henle",
      "↓ Reabsorción de Na⁺/K⁺/Cl⁻ (el segmento de mayor capacidad reabsortiva)",
      "Diuresis potente pero de acción corta",
      "Pérdida adicional de K⁺, Ca2+, Mg2+",
      "Alivio de sobrecarga de volumen (indicación principal, más que antihipertensivo puro)",
    ],
    efectosAdversos: {
      frecuentes: ["Hipopotasemia", "Hipomagnesemia", "Deshidratación/hipovolemia"],
      graves: [
        "Ototoxicidad (dosis altas, IV rápida, o combinado con otros ototóxicos)",
        "Hipopotasemia severa (arritmias)",
        "Hipovolemia severa/hipotensión con diuresis excesiva",
      ],
    },
    contraindicacionesDetalle: [
      { condicion: "Depleción de volumen o deshidratación no corregida", razon: "El fármaco agrava la hipovolemia" },
      { condicion: "Alergia a sulfonamidas (precaución, no contraindicación absoluta)", razon: "Reactividad cruzada posible, aunque el riesgo real es bajo" },
      { condicion: "Embarazo", razon: "Usar solo si el beneficio supera el riesgo" },
    ],
    monitoreo: [
      { parametro: "Electrolitos (K⁺, Mg2+, Na⁺) y función renal", frecuencia: "Frecuente al iniciar/ajustar dosis, luego periódico" },
      { parametro: "Peso diario y signos de deshidratación", frecuencia: "En pacientes con manejo de sobrecarga de volumen" },
    ],
    educacionPaciente: {
      queEs: "Elimina el exceso de líquido del cuerpo de forma potente; se usa principalmente cuando hay hinchazón por retención de líquidos, no solo para la presión.",
      comoTomarlo: "Según indicación, habitualmente 1-2 veces al día — evitar tomar la última dosis muy tarde para no interrumpir el sueño.",
      siOlvidaDosis: "Tomarla en cuanto se recuerde ese mismo día.",
      senalesAlarma: [
        "Calambres musculares, debilidad importante o palpitaciones (posible potasio/magnesio bajo)",
        "Mareo intenso, sed excesiva o muy poca orina (posible deshidratación)",
        "Zumbido en los oídos o pérdida de audición (raro, más con dosis altas)",
      ],
    },
    fuentes: [
      { texto: "Goodman & Gilman — Bases Farmacológicas de la Terapéutica, 13ª ed." },
      { texto: "FDA Prescribing Information — Furosemida" },
    ],
    hipo: "bajo", peso: "neutro", costo: 1, egfrMin: 0, contra: ["EMBARAZO"],
    efectoPA: { onsetHoras: 1, picoHoras: 2, duracionHoras: 6, reduccionSistolica: 5, reduccionDiastolica: 3, tomasPorDia: 2 } },

  { id: "TORSE", cat: "htn", grp: "Diurético de Asa", name: "Torsemida", ini: "5 mg", mant: "20 mg",
    adv: "Mayor biodisponibilidad y vida media más predecible que furosemida — preferido en ERC/IC cuando la absorción de furosemida es errática.",
    mecanismo: "Inhibe el cotransportador Na⁺-K⁺-2Cl⁻ en el asa de Henle, con mayor biodisponibilidad oral y duración de acción más prolongada que furosemida.",
    vidaMediaHoras: 3.5, vidaMediaLabel: "~3-4 h", reduccionA1c: null,
    titr: { l: ["Inicio", "Sem 2"], d: [5, 20] },
    benef: { ic: true, erc: false, ascvd: false, stroke: false, masld: false },
    mecanismoDetalle: "Mismo mecanismo que furosemida (inhibición del cotransportador Na⁺-K⁺-2Cl⁻ en el asa ascendente de Henle), pero con biodisponibilidad oral mucho más alta y predecible (~80-90% vs. 10-100% variable de furosemida) y vida media más larga, lo que da una diuresis más estable y evita los picos/valles característicos de furosemida — especialmente relevante en IC/ERC donde la absorción intestinal de furosemida puede ser errática por congestión de la pared intestinal.",
    mecanismoPasos: [
      "Inhibición del cotransportador Na⁺-K⁺-2Cl⁻ (NKCC2) en el asa ascendente de Henle",
      "↓ Reabsorción de Na⁺/K⁺/Cl⁻",
      "Diuresis potente con absorción oral más predecible que furosemida",
      "Alivio de sobrecarga de volumen con perfil más estable",
    ],
    efectosAdversos: {
      frecuentes: ["Hipopotasemia", "Hipomagnesemia", "Mareo"],
      graves: ["Ototoxicidad (menos frecuente que furosemida)", "Hipopotasemia severa", "Hipovolemia severa"],
    },
    contraindicacionesDetalle: [
      { condicion: "Depleción de volumen no corregida", razon: "El fármaco agrava la hipovolemia" },
      { condicion: "Embarazo", razon: "Usar solo si el beneficio supera el riesgo" },
    ],
    monitoreo: [
      { parametro: "Electrolitos (K⁺, Mg2+) y función renal", frecuencia: "Frecuente al iniciar/ajustar, luego periódico" },
    ],
    educacionPaciente: {
      queEs: "Elimina el exceso de líquido del cuerpo; se absorbe de forma más constante que otros diuréticos similares.",
      comoTomarlo: "Una vez al día, en la mañana.",
      siOlvidaDosis: "Tomarla en cuanto se recuerde ese mismo día.",
      senalesAlarma: ["Calambres musculares o debilidad importante", "Mareo intenso o muy poca orina"],
    },
    fuentes: [
      { texto: "Goodman & Gilman — Bases Farmacológicas de la Terapéutica, 13ª ed." },
      { texto: "FDA Prescribing Information — Torsemida" },
    ],
    hipo: "bajo", peso: "neutro", costo: 2, egfrMin: 0, contra: ["EMBARAZO"],
    efectoPA: { onsetHoras: 1, picoHoras: 3, duracionHoras: 12, reduccionSistolica: 6, reduccionDiastolica: 3, tomasPorDia: 1 } },

  { id: "EPLE", cat: "htn", grp: "MRA Esteroidea", name: "Eplerenona", ini: "25 mg", mant: "50 mg",
    adv: "Menor incidencia de ginecomastia/mastodinia que espironolactona (mayor selectividad). Evidencia en IC post-IAM (EPHESUS) y HFrEF (EMPHASIS-HF).",
    mecanismo: "Antagonista selectivo del receptor mineralocorticoide, con menor afinidad cruzada por receptores androgénicos/progestágenos que espironolactona.",
    vidaMediaHoras: 5, vidaMediaLabel: "~4-6 h", reduccionA1c: null,
    titr: { l: ["Inicio", "Sem 4"], d: [25, 50] },
    benef: { ic: true, erc: false, ascvd: false, stroke: false, masld: false },
    mecanismoDetalle: "Mismo mecanismo de clase que espironolactona (antagonismo del receptor mineralocorticoide en el túbulo colector), pero con mayor selectividad estructural que reduce marcadamente la afinidad cruzada con receptores androgénicos/progesterona — por eso causa mucha menos ginecomastia/mastodinia que espironolactona. Cuenta con evidencia dedicada de reducción de mortalidad en IC post-infarto (EPHESUS) y en IC-FEr leve (EMPHASIS-HF).",
    mecanismoPasos: [
      "Bloqueo selectivo del receptor mineralocorticoide en el túbulo colector",
      "↓ Reabsorción de Na⁺/agua + ↓ secreción de K⁺",
      "Mínima afinidad cruzada androgénica/progestágena (menos ginecomastia que espironolactona)",
      "↓ Presión arterial + beneficio en IC post-IAM y IC-FEr leve",
    ],
    efectosAdversos: {
      frecuentes: ["Hiperpotasemia", "Mareo"],
      graves: ["Hiperpotasemia severa (especialmente con IECA/ARA-II concomitante o eGFR bajo)"],
    },
    contraindicacionesDetalle: [
      { condicion: "eGFR < 30 mL/min/1.73m² o hiperpotasemia significativa", razon: "Alto riesgo de hiperpotasemia" },
      { condicion: "Uso concomitante con inhibidores potentes de CYP3A4", razon: "Aumenta significativamente los niveles plasmáticos" },
      { condicion: "Embarazo", razon: "Datos insuficientes de seguridad" },
    ],
    monitoreo: [
      { parametro: "Potasio sérico y función renal", frecuencia: "Basal, 1 semana tras iniciar/ajustar, luego periódico" },
    ],
    educacionPaciente: {
      queEs: "Bloquea una hormona que retiene sal y elimina potasio; a diferencia de la espironolactona, casi no causa crecimiento del tejido mamario.",
      comoTomarlo: "Una vez al día, con o sin alimentos.",
      siOlvidaDosis: "Tomarla en cuanto se recuerde; si ya casi es hora de la siguiente, omitir la olvidada.",
      senalesAlarma: [
        "Debilidad muscular importante o latido cardiaco irregular (posible potasio alto)",
        "IMPORTANTE: evitar suplementos de potasio y sustitutos de sal sin autorización médica",
      ],
    },
    fuentes: [
      { texto: "Goodman & Gilman — Bases Farmacológicas de la Terapéutica, 13ª ed." },
      { texto: "Ensayos EPHESUS/EMPHASIS-HF; FDA Prescribing Information — Eplerenona" },
    ],
    hipo: "bajo", peso: "neutro", costo: 2, egfrMin: 30, contra: ["EMBARAZO"],
    efectoPA: { onsetHoras: 4, picoHoras: 10, duracionHoras: 24, reduccionSistolica: 6, reduccionDiastolica: 3, tomasPorDia: 1 } },

  { id: "LABE", cat: "htn", grp: "Beta-bloqueante combinado α-β", name: "Labetalol", ini: "100 mg BID", mant: "600 mg/día",
    adv: "Antihipertensivo de elección en HTA gestacional/preeclampsia (junto con metildopa).",
    mecanismo: "Bloquea receptores beta-1, beta-2 y alfa-1, combinando reducción de frecuencia cardíaca con vasodilatación periférica.",
    vidaMediaHoras: 7, vidaMediaLabel: "~6-8 h", reduccionA1c: null,
    titr: { l: ["Inicio", "Sem 2", "Sem 4"], d: [200, 400, 600] },
    benef: { ic: false, erc: false, ascvd: false, stroke: false, masld: false },
    mecanismoDetalle: "Mismo mecanismo de clase que carvedilol (bloqueo no selectivo de receptores beta-1, beta-2 y alfa-1), pero con un perfil de seguridad establecido específicamente en el embarazo (categoría de uso preferida en HTA gestacional/preeclampsia junto con metildopa), a diferencia de IECA/ARA-II que están contraindicados.",
    mecanismoPasos: [
      "Bloqueo de receptores beta-1 (↓ frecuencia cardiaca y contractilidad)",
      "Bloqueo de receptores beta-2 (precaución en asma)",
      "Bloqueo de receptores alfa-1 (vasodilatación periférica adicional)",
      "↓ Gasto cardiaco + ↓ resistencia vascular periférica",
      "↓ Presión arterial — perfil de seguridad establecido en embarazo",
    ],
    efectosAdversos: {
      frecuentes: ["Fatiga, mareo", "Hipotensión ortostática"],
      graves: [
        "Broncoespasmo en asma/EPOC",
        "Bradicardia severa/bloqueo AV",
        "HTA/taquicardia de rebote si se SUSPENDE ABRUPTAMENTE",
      ],
    },
    contraindicacionesDetalle: [
      { condicion: "Asma o broncoespasmo severo activo", razon: "El bloqueo beta-2 puede precipitar broncoespasmo" },
      { condicion: "Bradicardia severa o bloqueo AV avanzado", razon: "Puede agravar el bloqueo" },
    ],
    monitoreo: [
      { parametro: "Frecuencia cardiaca y presión arterial", frecuencia: "Basal y en cada ajuste de dosis" },
      { parametro: "Nunca suspender abruptamente", frecuencia: "Reducir de forma gradual siempre" },
    ],
    educacionPaciente: {
      queEs: "Frena el corazón y relaja los vasos sanguíneos al mismo tiempo; es de los medicamentos preferidos para la presión alta durante el embarazo.",
      comoTomarlo: "Dos veces al día, con alimentos.",
      siOlvidaDosis: "Tomarla en cuanto se recuerde; si ya casi es hora de la siguiente, omitir la olvidada.",
      senalesAlarma: [
        "Mareo intenso al levantarse",
        "Latido muy lento",
        "IMPORTANTE: NUNCA dejar de tomarlo de golpe — reducirlo siempre gradualmente con supervisión médica",
      ],
    },
    fuentes: [
      { texto: "Goodman & Gilman — Bases Farmacológicas de la Terapéutica, 13ª ed." },
      { texto: "FDA Prescribing Information — Labetalol" },
    ],
    hipo: "bajo", peso: "neutro", costo: 1, egfrMin: 0, contra: [],
    efectoPA: { onsetHoras: 1, picoHoras: 3, duracionHoras: 12, reduccionSistolica: 8, reduccionDiastolica: 5, tomasPorDia: 2 } },

  { id: "BISO", cat: "htn", grp: "Beta-bloqueante Cardioselectivo", name: "Bisoprolol", ini: "2.5 mg", mant: "10 mg",
    adv: "Evidencia de reducción de mortalidad en HFrEF (CIBIS-II). Cardioselectivo — menor efecto en receptores beta-2 (broncoespasmo) que betabloqueantes no selectivos.",
    mecanismo: "Bloquea selectivamente receptores beta-1 cardíacos, reduciendo frecuencia cardíaca y contractilidad con menor efecto sobre el músculo liso bronquial/vascular periférico.",
    vidaMediaHoras: 11, vidaMediaLabel: "~10-12 h", reduccionA1c: null,
    titr: { l: ["Inicio", "Sem 4"], d: [2.5, 10] },
    benef: { ic: true, erc: false, ascvd: false, stroke: false, masld: false },
    mecanismoDetalle: "Bloquea selectivamente los receptores beta-1 cardiacos (relación de selectividad beta-1:beta-2 la más alta de los cardioselectivos disponibles), reduciendo la frecuencia cardiaca, la contractilidad y la conducción del nodo AV, con mínimo efecto sobre los receptores beta-2 del músculo liso bronquial/vascular a dosis terapéuticas habituales — por eso es mejor tolerado que los no selectivos en pacientes con EPOC leve/asma leve controlada (aunque la selectividad se pierde a dosis altas). Cuenta con evidencia dedicada de reducción de mortalidad en IC-FEr (CIBIS-II).",
    mecanismoPasos: [
      "Bloqueo SELECTIVO de receptores beta-1 cardiacos",
      "↓ Frecuencia cardiaca + ↓ contractilidad + ↓ conducción AV",
      "Mínimo efecto beta-2 (bronquial/vascular) a dosis terapéuticas",
      "↓ Presión arterial + beneficio de mortalidad en IC-FEr (CIBIS-II)",
    ],
    efectosAdversos: {
      frecuentes: ["Fatiga", "Bradicardia", "Extremidades frías (vasoconstricción periférica leve)"],
      graves: [
        "Bradicardia severa/bloqueo AV",
        "Broncoespasmo (posible a dosis altas, donde se pierde la cardioselectividad)",
        "HTA/taquicardia de rebote si se SUSPENDE ABRUPTAMENTE",
        "Enmascaramiento de síntomas de hipoglucemia",
      ],
    },
    contraindicacionesDetalle: [
      { condicion: "Bradicardia severa o bloqueo AV avanzado (sin marcapasos)", razon: "Puede agravar el bloqueo" },
      { condicion: "IC descompensada aguda", razon: "Iniciar solo cuando el paciente está euvolémico y estable" },
    ],
    monitoreo: [
      { parametro: "Frecuencia cardiaca y presión arterial", frecuencia: "Basal y en cada ajuste de dosis" },
      { parametro: "Nunca suspender abruptamente", frecuencia: "Reducir de forma gradual siempre" },
    ],
    educacionPaciente: {
      queEs: "Frena el corazón de forma selectiva, bajando la presión y protegiéndolo si está debilitado, con menos efecto en los pulmones que otros de su tipo.",
      comoTomarlo: "Una vez al día, con o sin alimentos.",
      siOlvidaDosis: "Tomarla en cuanto se recuerde; si ya casi es hora de la siguiente, omitir la olvidada.",
      senalesAlarma: [
        "Latido muy lento o mareo intenso",
        "IMPORTANTE: NUNCA dejar de tomarlo de golpe — reducirlo siempre gradualmente con supervisión médica",
      ],
    },
    fuentes: [
      { texto: "Goodman & Gilman — Bases Farmacológicas de la Terapéutica, 13ª ed." },
      { texto: "Ensayo CIBIS-II; FDA Prescribing Information — Bisoprolol" },
    ],
    hipo: "bajo", peso: "neutro", costo: 1, egfrMin: 0, contra: [],
    efectoPA: { onsetHoras: 2, picoHoras: 4, duracionHoras: 24, reduccionSistolica: 7, reduccionDiastolica: 4, tomasPorDia: 1 } },

  { id: "METOS", cat: "htn", grp: "Beta-bloqueante Cardioselectivo", name: "Metoprolol Succinato", ini: "25 mg", mant: "200 mg",
    adv: "Evidencia de reducción de mortalidad en HFrEF (MERIT-HF). Preferir la forma succinato (liberación prolongada) sobre tartrato para dosis única diaria.",
    mecanismo: "Bloquea selectivamente receptores beta-1 cardíacos; la formulación succinato libera el fármaco de forma prolongada, dando cobertura de 24 h.",
    vidaMediaHoras: 7, vidaMediaLabel: "~3-7 h (liberación prolongada: cobertura 24 h)", reduccionA1c: null,
    titr: { l: ["Inicio", "Sem 4"], d: [25, 200] },
    benef: { ic: true, erc: false, ascvd: false, stroke: false, masld: false },
    mecanismoDetalle: "Mismo mecanismo de clase que bisoprolol (bloqueo selectivo de receptores beta-1 cardiacos). La formulación SUCCINATO (liberación prolongada) es la que debe preferirse para HTA/IC: libera el fármaco de forma gradual dando cobertura de 24 h con una sola toma, a diferencia de la formulación TARTRATO (liberación inmediata, uso más frecuente en angina/arritmias agudas con dosis múltiples). Cuenta con evidencia dedicada de reducción de mortalidad en IC-FEr (MERIT-HF).",
    mecanismoPasos: [
      "Bloqueo SELECTIVO de receptores beta-1 cardiacos",
      "↓ Frecuencia cardiaca + ↓ contractilidad + ↓ conducción AV",
      "Formulación succinato: liberación prolongada → cobertura 24 h",
      "↓ Presión arterial + beneficio de mortalidad en IC-FEr (MERIT-HF)",
    ],
    efectosAdversos: {
      frecuentes: ["Fatiga", "Bradicardia", "Extremidades frías"],
      graves: [
        "Bradicardia severa/bloqueo AV",
        "Broncoespasmo (a dosis altas)",
        "HTA/taquicardia de rebote si se SUSPENDE ABRUPTAMENTE",
      ],
    },
    contraindicacionesDetalle: [
      { condicion: "Bradicardia severa o bloqueo AV avanzado", razon: "Puede agravar el bloqueo" },
      { condicion: "IC descompensada aguda", razon: "Iniciar solo cuando el paciente está euvolémico y estable" },
    ],
    monitoreo: [
      { parametro: "Frecuencia cardiaca y presión arterial", frecuencia: "Basal y en cada ajuste de dosis" },
      { parametro: "Confirmar formulación succinato (no tartrato) para dosis única diaria", frecuencia: "Verificar en cada receta" },
    ],
    educacionPaciente: {
      queEs: "Frena el corazón de forma selectiva, bajando la presión y protegiéndolo si está debilitado.",
      comoTomarlo: "Una vez al día (formulación de liberación prolongada) — NO partir ni triturar.",
      siOlvidaDosis: "Tomarla en cuanto se recuerde; si ya casi es hora de la siguiente, omitir la olvidada.",
      senalesAlarma: [
        "Latido muy lento o mareo intenso",
        "IMPORTANTE: NUNCA dejar de tomarlo de golpe",
      ],
    },
    fuentes: [
      { texto: "Goodman & Gilman — Bases Farmacológicas de la Terapéutica, 13ª ed." },
      { texto: "Ensayo MERIT-HF; FDA Prescribing Information — Metoprolol Succinato" },
    ],
    hipo: "bajo", peso: "neutro", costo: 1, egfrMin: 0, contra: [],
    efectoPA: { onsetHoras: 2, picoHoras: 4, duracionHoras: 24, reduccionSistolica: 7, reduccionDiastolica: 4, tomasPorDia: 1 } },

  { id: "DOXA", cat: "htn", grp: "Alfabloqueante", name: "Doxazosina", ini: "1 mg", mant: "8 mg",
    adv: "Útil si coexiste hiperplasia prostática benigna. No es de primera línea en monoterapia (ALLHAT: más eventos de IC vs. clortalidona) — reservar para HTA resistente/add-on.",
    mecanismo: "Bloquea selectivamente receptores alfa-1 postsinápticos, produciendo vasodilatación arterial y venosa periférica.",
    vidaMediaHoras: 22, vidaMediaLabel: "~22 h", reduccionA1c: null,
    titr: { l: ["Inicio", "Sem 4"], d: [1, 8] },
    benef: { ic: false, erc: false, ascvd: false, stroke: false, masld: false },
    // REDISEÑO DE FICHA (16-ago-2026): metodología en entrada "MET". Clase
    // alfabloqueante — ALLHAT (2000) mostró más eventos de IC frente a
    // clortalidona, por lo que ya NO es de primera línea en monoterapia; se
    // reserva para HTA resistente o add-on, salvo indicación urológica.
    mecanismoDetalle: "Bloquea selectivamente los receptores alfa-1 postsinápticos en el músculo liso vascular (arterial y venoso), impidiendo la vasoconstricción mediada por noradrenalina y produciendo vasodilatación periférica. También bloquea receptores alfa-1 en el cuello vesical/próstata, relajando el músculo liso allí — de ahí su utilidad adicional en hiperplasia prostática benigna. El estudio ALLHAT (2000) mostró más del doble de riesgo de insuficiencia cardiaca con doxazosina frente a clortalidona en monoterapia de primera línea, por lo que su uso se reserva hoy para HTA resistente (add-on) o cuando coexiste HPB sintomática.",
    mecanismoPasos: [
      "Bloqueo selectivo de receptores alfa-1 postsinápticos",
      "Vasodilatación arterial y venosa periférica",
      "Relajación adicional del músculo liso del cuello vesical/próstata (beneficio en HPB)",
      "↓ Presión arterial — NO de primera línea en monoterapia (señal de IC en ALLHAT)",
    ],
    efectosAdversos: {
      frecuentes: ["Mareo, especialmente con la primera dosis ('efecto de primera dosis')", "Hipotensión ortostática", "Cefalea"],
      graves: ["Síncope con la primera dosis (iniciar siempre con la dosis más baja, al acostarse)", "↑ Riesgo de insuficiencia cardiaca en monoterapia de primera línea (ALLHAT)"],
    },
    contraindicacionesDetalle: [
      { condicion: "Insuficiencia cardiaca (como agente de primera línea)", razon: "Señal de mayor riesgo de IC en el estudio ALLHAT" },
      { condicion: "Hipotensión ortostática preexistente o antecedente de síncope", razon: "El efecto de primera dosis puede agravarla" },
    ],
    monitoreo: [
      { parametro: "Presión arterial en decúbito y de pie (ortostatismo)", frecuencia: "Especialmente con la primera dosis y en cada ajuste" },
    ],
    educacionPaciente: {
      queEs: "Relaja los vasos sanguíneos; también ayuda si hay dificultad para orinar por crecimiento de la próstata.",
      comoTomarlo: "La PRIMERA dosis debe tomarse al acostarse, por el riesgo de mareo intenso o desmayo — las siguientes dosis según indicación.",
      siOlvidaDosis: "Tomarla en cuanto se recuerde; si ya casi es hora de la siguiente, omitir la olvidada.",
      senalesAlarma: ["Mareo intenso o desmayo al levantarse, especialmente las primeras veces", "Hinchazón de piernas o dificultad para respirar"],
    },
    fuentes: [
      { texto: "Goodman & Gilman — Bases Farmacológicas de la Terapéutica, 13ª ed." },
      { texto: "Ensayo ALLHAT; FDA Prescribing Information — Doxazosina" },
    ],
    hipo: "bajo", peso: "neutro", costo: 1, egfrMin: 0, contra: ["IC"],
    efectoPA: { onsetHoras: 2, picoHoras: 4, duracionHoras: 24, reduccionSistolica: 7, reduccionDiastolica: 4, tomasPorDia: 1 } },

  { id: "PRAZ", cat: "htn", grp: "Alfabloqueante", name: "Prazosina", ini: "1 mg BID", mant: "20 mg/día",
    adv: "Relevancia endocrina: fármaco de elección para el bloqueo alfa preoperatorio en feocromocitoma/paraganglioma antes de cirugía.",
    mecanismo: "Bloquea receptores alfa-1 postsinápticos, con vida media corta que requiere dosificación múltiple.",
    vidaMediaHoras: 2.5, vidaMediaLabel: "~2-3 h", reduccionA1c: null,
    titr: { l: ["Inicio", "Sem 2", "Sem 4"], d: [2, 6, 20] },
    benef: { ic: false, erc: false, ascvd: false, stroke: false, masld: false },
    mecanismoDetalle: "Mismo mecanismo que doxazosina (bloqueo selectivo de receptores alfa-1 postsinápticos → vasodilatación), pero con vida media mucho más corta que requiere dosificación múltiple. Su relevancia endocrinológica específica es como fármaco de elección para el bloqueo alfa PREOPERATORIO en feocromocitoma/paraganglioma antes de la resección quirúrgica — debe iniciarse 10-14 días antes de la cirugía y SIEMPRE antes de agregar un betabloqueante (nunca al revés, por riesgo de crisis hipertensiva por vasoconstricción alfa sin oposición).",
    mecanismoPasos: [
      "Bloqueo selectivo de receptores alfa-1 postsinápticos",
      "Vasodilatación arterial y venosa periférica",
      "En feocromocitoma: bloqueo alfa preoperatorio ANTES de agregar betabloqueante",
      "↓ Presión arterial + prevención de crisis hipertensiva intraoperatoria",
    ],
    efectosAdversos: {
      frecuentes: ["Mareo, especialmente con la primera dosis", "Hipotensión ortostática", "Cefalea"],
      graves: ["Síncope con la primera dosis"],
    },
    contraindicacionesDetalle: [
      { condicion: "Iniciar betabloqueante ANTES del bloqueo alfa en feocromocitoma", razon: "Riesgo de crisis hipertensiva por vasoconstricción alfa sin oposición — el orden es obligatorio: alfa primero" },
      { condicion: "Hipotensión ortostática preexistente", razon: "El efecto de primera dosis puede agravarla" },
    ],
    monitoreo: [
      { parametro: "Presión arterial en decúbito y de pie", frecuencia: "Especialmente con la primera dosis" },
      { parametro: "En preparación preoperatoria de feocromocitoma: PA y frecuencia cardiaca", frecuencia: "Seguimiento estrecho 10-14 días antes de cirugía" },
    ],
    educacionPaciente: {
      queEs: "Relaja los vasos sanguíneos; en el contexto de cirugía de un tumor de la glándula suprarrenal, se usa para preparar el cuerpo antes de la operación.",
      comoTomarlo: "La primera dosis al acostarse; las siguientes 2 veces al día según indicación.",
      siOlvidaDosis: "Tomarla en cuanto se recuerde; si ya casi es hora de la siguiente, omitir la olvidada.",
      senalesAlarma: ["Mareo intenso o desmayo al levantarse", "Palpitaciones importantes"],
    },
    fuentes: [
      { texto: "Goodman & Gilman — Bases Farmacológicas de la Terapéutica, 13ª ed." },
      { texto: "FDA Prescribing Information — Prazosina" },
    ],
    hipo: "bajo", peso: "neutro", costo: 1, egfrMin: 0, contra: [],
    efectoPA: { onsetHoras: 1, picoHoras: 3, duracionHoras: 8, reduccionSistolica: 6, reduccionDiastolica: 4, tomasPorDia: 2 } },

  { id: "HIDRA", cat: "htn", grp: "Vasodilatador Directo", name: "Hidralazina", ini: "10 mg QID", mant: "300 mg/día",
    adv: "Combinada con nitrato de acción prolongada: reduce mortalidad en IC con FEVI reducida en pacientes afrodescendientes (A-HeFT). Taquicardia refleja — combinar con betabloqueante.",
    mecanismo: "Vasodilatador arterial directo por relajación del músculo liso vascular, mecanismo independiente del sistema renina-angiotensina.",
    vidaMediaHoras: 5, vidaMediaLabel: "~2-8 h (variable según acetilación)", reduccionA1c: null,
    titr: { l: ["Inicio", "Sem 2", "Sem 4"], d: [40, 100, 300] },
    benef: { ic: true, erc: false, ascvd: false, stroke: false, masld: false },
    mecanismoDetalle: "Vasodilatador arterial DIRECTO por relajación del músculo liso vascular (mecanismo no completamente elucidado, pero independiente del sistema renina-angiotensina y de receptores adrenérgicos) — actúa predominantemente sobre arteriolas, con mínimo efecto venoso. Al reducir bruscamente la resistencia vascular sin bloquear los reflejos compensadores, activa el barorreflejo y produce taquicardia refleja marcada y retención de sodio/agua (activación secundaria del SRAA), por lo que SIEMPRE debe combinarse con un betabloqueante (controla la taquicardia refleja) y un diurético (controla la retención de volumen). Combinada con un nitrato de acción prolongada, reduce la mortalidad en IC-FEr específicamente en pacientes afrodescendientes (A-HeFT).",
    mecanismoPasos: [
      "Relajación directa del músculo liso arteriolar (mecanismo independiente del SRAA)",
      "Vasodilatación arterial predominante (mínimo efecto venoso)",
      "Activación refleja del barorreflejo → taquicardia refleja + retención de Na⁺/agua",
      "Requiere SIEMPRE combinación con betabloqueante + diurético",
      "↓ Presión arterial + beneficio en IC-FEr en afrodescendientes (combinado con nitrato, A-HeFT)",
    ],
    efectosAdversos: {
      frecuentes: ["Taquicardia refleja, palpitaciones", "Cefalea, rubor facial", "Retención de líquidos"],
      graves: [
        "Síndrome tipo lupus inducido por fármaco (dosis-dependiente, más frecuente en acetiladores lentos, generalmente reversible al suspender)",
        "Angina/isquemia miocárdica por taquicardia refleja si no se controla con betabloqueante",
      ],
    },
    contraindicacionesDetalle: [
      { condicion: "Uso en monoterapia sin betabloqueante ni diurético", razon: "Taquicardia refleja y retención de volumen sin control" },
      { condicion: "Enfermedad coronaria/angina no controlada", razon: "La taquicardia refleja puede precipitar isquemia" },
      { condicion: "Lupus eritematoso sistémico", razon: "Riesgo de síndrome tipo lupus inducido por fármaco" },
    ],
    monitoreo: [
      { parametro: "Frecuencia cardiaca", frecuencia: "En cada consulta — confirma que el betabloqueante controla la taquicardia refleja" },
      { parametro: "Síntomas de síndrome tipo lupus (artralgia, rash, fiebre)", frecuencia: "Con uso prolongado a dosis altas" },
    ],
    educacionPaciente: {
      queEs: "Relaja directamente los vasos sanguíneos; casi siempre se usa junto con otros dos medicamentos que controlan sus efectos secundarios (uno para el latido rápido, otro para la retención de líquidos).",
      comoTomarlo: "Varias veces al día según indicación (4 veces al día es común), con o sin alimentos.",
      siOlvidaDosis: "Tomarla en cuanto se recuerde; si ya casi es hora de la siguiente, omitir la olvidada.",
      senalesAlarma: [
        "Palpitaciones intensas o dolor en el pecho",
        "Dolor articular, erupción en la piel o fiebre sin causa clara (posible reacción tipo lupus)",
      ],
    },
    fuentes: [
      { texto: "Goodman & Gilman — Bases Farmacológicas de la Terapéutica, 13ª ed." },
      { texto: "Ensayo A-HeFT; FDA Prescribing Information — Hidralazina" },
    ],
    hipo: "bajo", peso: "neutro", costo: 1, egfrMin: 0, contra: [],
    efectoPA: { onsetHoras: 1, picoHoras: 2, duracionHoras: 6, reduccionSistolica: 7, reduccionDiastolica: 5, tomasPorDia: 2 } },

  { id: "MINOX", cat: "htn", grp: "Vasodilatador Directo", name: "Minoxidil", ini: "2.5 mg", mant: "40 mg",
    adv: "Reservado para HTA resistente refractaria a combinaciones estándar; causa retención de líquidos e hirsutismo — combinar siempre con diurético de asa y betabloqueante.",
    mecanismo: "Abre canales de potasio ATP-dependientes en el músculo liso vascular, produciendo vasodilatación arterial potente.",
    vidaMediaHoras: 4, vidaMediaLabel: "~4 h", reduccionA1c: null,
    titr: { l: ["Inicio", "Sem 4"], d: [2.5, 40] },
    benef: { ic: false, erc: false, ascvd: false, stroke: false, masld: false },
    mecanismoDetalle: "Vasodilatador arterial DIRECTO, mecanismo distinto a hidralazina: se metaboliza a minoxidil sulfato, que abre canales de potasio ATP-dependientes (KATP) en el músculo liso vascular, hiperpolarizando la membrana y relajando el músculo liso arteriolar — es el vasodilatador oral más potente disponible para HTA. Como con hidralazina, la vasodilatación intensa activa el barorreflejo (taquicardia refleja) y el SRAA (retención marcada de sodio/agua), por lo que SIEMPRE requiere combinación con betabloqueante Y diurético de asa (las tiazidas suelen ser insuficientes). Se reserva para HTA resistente refractaria a combinaciones estándar.",
    mecanismoPasos: [
      "Metabolización a minoxidil sulfato (metabolito activo)",
      "Apertura de canales de K⁺ ATP-dependientes en músculo liso arteriolar",
      "Hiperpolarización de la membrana → relajación del músculo liso",
      "Vasodilatación arterial potente → taquicardia refleja + retención marcada de Na⁺/agua",
      "Requiere SIEMPRE combinación con betabloqueante + diurético de asa",
    ],
    efectosAdversos: {
      frecuentes: ["Hipertricosis (crecimiento excesivo de vello, muy frecuente y a veces motivo de suspensión)", "Retención de líquidos/edema", "Taquicardia refleja"],
      graves: [
        "Derrame pericárdico (raro pero grave, más en ERC)",
        "Insuficiencia cardiaca por retención masiva de volumen si no se controla con diurético de asa adecuado",
        "Angina/isquemia por taquicardia refleja no controlada",
      ],
    },
    contraindicacionesDetalle: [
      { condicion: "Uso en monoterapia sin betabloqueante ni diurético de asa", razon: "Retención de volumen y taquicardia refleja severas sin control" },
      { condicion: "Feocromocitoma", razon: "Puede estimular la liberación de catecolaminas" },
      { condicion: "Insuficiencia cardiaca no controlada", razon: "Riesgo de descompensación por retención de líquidos" },
    ],
    monitoreo: [
      { parametro: "Peso diario y signos de retención de líquidos", frecuencia: "Frecuente al iniciar/ajustar dosis" },
      { parametro: "Ecocardiograma si hay sospecha de derrame pericárdico", frecuencia: "Ante disnea/dolor torácico inexplicado" },
      { parametro: "Frecuencia cardiaca", frecuencia: "Confirma que el betabloqueante controla la taquicardia refleja" },
    ],
    educacionPaciente: {
      queEs: "El medicamento más potente en pastilla para bajar la presión cuando otros no han funcionado; casi siempre se combina con otros dos medicamentos para controlar sus efectos.",
      comoTomarlo: "Una vez al día, con o sin alimentos.",
      siOlvidaDosis: "Tomarla en cuanto se recuerde; si ya casi es hora de la siguiente, omitir la olvidada.",
      senalesAlarma: [
        "Hinchazón importante, aumento rápido de peso o dificultad para respirar (posible retención de líquidos/derrame)",
        "Crecimiento excesivo de vello corporal (efecto conocido, comentarlo si es muy molesto)",
        "Palpitaciones o dolor en el pecho",
      ],
    },
    fuentes: [
      { texto: "Goodman & Gilman — Bases Farmacológicas de la Terapéutica, 13ª ed." },
      { texto: "FDA Prescribing Information — Minoxidil" },
    ],
    hipo: "bajo", peso: "neutro", costo: 1, egfrMin: 0, contra: ["IC"],
    efectoPA: { onsetHoras: 1, picoHoras: 3, duracionHoras: 24, reduccionSistolica: 10, reduccionDiastolica: 6, tomasPorDia: 1 } },

  { id: "CLONI", cat: "htn", grp: "Agente Central", name: "Clonidina", ini: "0.1 mg BID", mant: "1.2 mg/día",
    adv: "Riesgo de hipertensión de rebote si se suspende abruptamente — retirar de forma gradual. Reservada para HTA resistente/add-on.",
    mecanismo: "Agonista alfa-2 adrenérgico central, que reduce el flujo simpático eferente desde el tronco encefálico.",
    vidaMediaHoras: 7, vidaMediaLabel: "~6-8 h", reduccionA1c: null,
    titr: { l: ["Inicio", "Sem 2", "Sem 4"], d: [0.2, 0.6, 1.2] },
    benef: { ic: false, erc: false, ascvd: false, stroke: false, masld: false },
    mecanismoDetalle: "Agonista de los receptores alfa-2 adrenérgicos presinápticos en el tronco encefálico (núcleo del tracto solitario), donde normalmente la noradrenalina activa estos receptores como retroalimentación negativa para frenar su propia liberación. Al activarlos farmacológicamente, la clonidina reduce el flujo simpático eferente desde el sistema nervioso central hacia la periferia, disminuyendo la resistencia vascular, la frecuencia cardiaca y el gasto cardiaco. Debido a que el cuerpo compensa con up-regulation de receptores adrenérgicos periféricos durante el tratamiento crónico, la SUSPENSIÓN ABRUPTA libera un rebote simpático exagerado (hipertensión de rebote, a veces crisis hipertensiva), por lo que debe retirarse siempre de forma gradual.",
    mecanismoPasos: [
      "Agonismo de receptores alfa-2 adrenérgicos presinápticos centrales (tronco encefálico)",
      "↓ Flujo simpático eferente del SNC hacia la periferia",
      "↓ Resistencia vascular + ↓ frecuencia cardiaca + ↓ gasto cardiaco",
      "↓ Presión arterial",
      "Uso crónico → up-regulation de receptores periféricos → riesgo de rebote si se suspende abruptamente",
    ],
    efectosAdversos: {
      frecuentes: ["Sedación/somnolencia (muy frecuente)", "Sequedad de boca", "Estreñimiento"],
      graves: ["Hipertensión de rebote/crisis hipertensiva con suspensión abrupta", "Bradicardia"],
    },
    contraindicacionesDetalle: [
      { condicion: "Suspensión abrupta sin reducción gradual", razon: "Riesgo de hipertensión de rebote severa/crisis hipertensiva" },
      { condicion: "Bradicardia significativa o bloqueo AV", razon: "Puede agravarlos" },
      { condicion: "Necesidad de alerta mental plena (p. ej. operadores de maquinaria)", razon: "Sedación marcada" },
    ],
    monitoreo: [
      { parametro: "Presión arterial al suspender/reducir dosis", frecuencia: "Vigilar de cerca durante la retirada gradual" },
      { parametro: "Nivel de sedación", frecuencia: "En cada consulta, especialmente al iniciar" },
    ],
    educacionPaciente: {
      queEs: "Actúa en el cerebro para reducir las señales que elevan la presión arterial; se reserva para cuando otros medicamentos no son suficientes.",
      comoTomarlo: "Dos veces al día, con o sin alimentos.",
      siOlvidaDosis: "Tomarla en cuanto se recuerde; si ya casi es hora de la siguiente, omitir la olvidada.",
      senalesAlarma: [
        "IMPORTANTE: NUNCA dejar de tomarlo de golpe, aunque se le olviden varias dosis seguidas — puede causar una subida peligrosa de presión; siempre debe reducirse gradualmente con supervisión médica",
        "Somnolencia excesiva que interfiere con actividades diarias",
      ],
    },
    fuentes: [
      { texto: "Goodman & Gilman — Bases Farmacológicas de la Terapéutica, 13ª ed." },
      { texto: "FDA Prescribing Information — Clonidina" },
    ],
    hipo: "bajo", peso: "neutro", costo: 1, egfrMin: 0, contra: [],
    efectoPA: { onsetHoras: 1, picoHoras: 3, duracionHoras: 8, reduccionSistolica: 7, reduccionDiastolica: 5, tomasPorDia: 2 } },

  { id: "METILD", cat: "htn", grp: "Agente Central", name: "Metildopa", ini: "250 mg BID", mant: "3 g/día",
    adv: "Relevancia endocrina: antihipertensivo de primera línea en el embarazo por su extenso perfil de seguridad establecido.",
    mecanismo: "Se convierte en alfa-metilnoradrenalina, un agonista alfa-2 central que reduce el tono simpático, mecanismo análogo a clonidina.",
    vidaMediaHoras: 2, vidaMediaLabel: "~2 h (efecto prolongado por metabolito activo)", reduccionA1c: null,
    titr: { l: ["Inicio", "Sem 2", "Sem 4"], d: [500, 1000, 3000] },
    benef: { ic: false, erc: false, ascvd: false, stroke: false, masld: false },
    mecanismoDetalle: "Prodroga que se descarboxila e hidroxila en las terminales nerviosas centrales a alfa-metilnoradrenalina, un falso neurotransmisor que actúa como agonista alfa-2 adrenérgico central — mecanismo análogo a clonidina (↓flujo simpático eferente desde el tronco encefálico). Su relevancia clínica principal hoy es el extenso perfil de seguridad establecido durante DÉCADAS de uso en el embarazo (décadas de seguimiento de recién nacidos sin efectos adversos documentados), por lo que sigue siendo antihipertensivo de primera línea en HTA gestacional pese a haber sido reemplazada por agentes más modernos en la población general.",
    mecanismoPasos: [
      "Descarboxilación/hidroxilación a alfa-metilnoradrenalina (falso neurotransmisor)",
      "Agonismo de receptores alfa-2 adrenérgicos centrales (tronco encefálico)",
      "↓ Flujo simpático eferente del SNC",
      "↓ Resistencia vascular + ↓ presión arterial",
      "Perfil de seguridad establecido en embarazo (primera línea en HTA gestacional)",
    ],
    efectosAdversos: {
      frecuentes: ["Sedación/somnolencia", "Sequedad de boca", "Mareo"],
      graves: [
        "Hepatotoxicidad (elevación de transaminasas, hepatitis rara)",
        "Anemia hemolítica autoinmune (prueba de Coombs positiva — puede aparecer con uso prolongado)",
        "Hipertensión de rebote con suspensión abrupta (menos marcada que clonidina)",
      ],
    },
    contraindicacionesDetalle: [
      { condicion: "Enfermedad hepática activa o antecedente de hepatotoxicidad con metildopa", razon: "Riesgo de hepatotoxicidad" },
      { condicion: "Anemia hemolítica", razon: "El fármaco puede causarla (Coombs positivo)" },
    ],
    monitoreo: [
      { parametro: "Función hepática", frecuencia: "Basal y periódico, especialmente en las primeras semanas" },
      { parametro: "Hemograma (signos de anemia hemolítica)", frecuencia: "Con uso prolongado o si aparecen síntomas" },
    ],
    educacionPaciente: {
      queEs: "Actúa en el cerebro para bajar la presión; tiene un largo historial de uso seguro durante el embarazo.",
      comoTomarlo: "Dos veces al día, con o sin alimentos.",
      siOlvidaDosis: "Tomarla en cuanto se recuerde; si ya casi es hora de la siguiente, omitir la olvidada.",
      senalesAlarma: [
        "Piel u ojos amarillentos, orina oscura o cansancio extremo (posible daño hepático)",
        "Palidez, cansancio inusual o dificultad para respirar (posible anemia)",
        "Somnolencia excesiva",
      ],
    },
    fuentes: [
      { texto: "Goodman & Gilman — Bases Farmacológicas de la Terapéutica, 13ª ed." },
      { texto: "FDA Prescribing Information — Metildopa" },
    ],
    hipo: "bajo", peso: "neutro", costo: 1, egfrMin: 0, contra: [],
    efectoPA: { onsetHoras: 4, picoHoras: 8, duracionHoras: 12, reduccionSistolica: 6, reduccionDiastolica: 4, tomasPorDia: 2 } },

  // ============ DISLIPIDEMIA ============
  { id: "ATOR", cat: "lipid", grp: "Estatina Alta Intensidad", name: "Atorvastatina", ini: "20 mg", mant: "40-80 mg",
    adv: "Alta intensidad (50-60% reducción LDL). 1a línea en riesgo alto/muy alto.",
    mecanismo: "Inhibe competitivamente la HMG-CoA reductasa hepática, enzima limitante de la síntesis de colesterol; aumenta receptores LDL hepáticos.",
    vidaMediaHoras: 14, vidaMediaLabel: "~14 h (metabolitos activos hasta 20-30 h)", reduccionA1c: null,
    titr: { l: ["Inicio", "4 Sem", "8 Sem"], d: [20, 40, 80] },
    benef: { ic: false, erc: false, ascvd: true, stroke: false, masld: false },
    // REDISEÑO DE FICHA (16-ago-2026): metodología en entrada "MET". Clase
    // estatinas — mecanismo/miopatía-rabdomiólisis de G&G + FDA labels.
    mecanismoDetalle: "Inhibe competitivamente la HMG-CoA reductasa hepática, la enzima limitante de la vía de síntesis de colesterol (mevalonato). Al reducir la síntesis hepática de colesterol, el hepatocito compensa aumentando la expresión de receptores de LDL en su superficie, lo que incrementa la captación de LDL circulante desde el plasma — este es el mecanismo principal de reducción de LDL-C, más que la reducción de síntesis en sí. Es de alta intensidad (reduce LDL-C ≥50%), la mayor potencia junto con rosuvastatina.",
    mecanismoPasos: [
      "Inhibición competitiva de la HMG-CoA reductasa hepática",
      "↓ Síntesis hepática de colesterol (vía del mevalonato)",
      "↑ Expresión de receptores de LDL en la superficie del hepatocito (compensatorio)",
      "↑ Captación de LDL circulante desde el plasma",
      "↓ LDL-C ≥50% (alta intensidad) + reducción de eventos cardiovasculares mayores",
    ],
    efectosAdversos: {
      frecuentes: ["Mialgia leve (sin elevación de CK)", "Elevación leve de transaminasas hepáticas"],
      graves: [
        "Miopatía/rabdomiólisis (rara pero grave — dolor muscular con CK muy elevada, riesgo de daño renal)",
        "Elevación significativa de transaminasas (rara)",
        "Nuevo diagnóstico de diabetes (efecto de clase, pequeño pero real, no contraindica su uso dado el beneficio CV)",
      ],
    },
    contraindicacionesDetalle: [
      { condicion: "Enfermedad hepática activa o elevación inexplicada de transaminasas", razon: "Riesgo de hepatotoxicidad" },
      { condicion: "Embarazo/lactancia", razon: "El colesterol es esencial para el desarrollo fetal — contraindicado" },
      { condicion: "Uso concomitante de inhibidores potentes de CYP3A4 a dosis altas", razon: "Aumenta el riesgo de miopatía por elevación de niveles plasmáticos" },
    ],
    monitoreo: [
      { parametro: "Perfil lipídico (LDL-C)", frecuencia: "4-12 semanas tras iniciar/ajustar, luego anual" },
      { parametro: "Transaminasas hepáticas", frecuencia: "Basal; repetir solo si hay síntomas de hepatotoxicidad (ya no se requiere monitoreo rutinario según guías actuales)" },
      { parametro: "CK (creatina cinasa)", frecuencia: "Solo si hay síntomas musculares significativos — no de rutina en pacientes asintomáticos" },
    ],
    educacionPaciente: {
      queEs: "Reduce el colesterol 'malo' (LDL) bloqueando su producción en el hígado; es de los medicamentos más estudiados y con mayor evidencia para prevenir infartos y derrames.",
      comoTomarlo: "Una vez al día, a cualquier hora, con o sin alimentos.",
      siOlvidaDosis: "Tomarla en cuanto se recuerde; si ya casi es hora de la siguiente, omitir la olvidada.",
      senalesAlarma: [
        "Dolor, sensibilidad o debilidad muscular importante e inexplicable, especialmente si se acompaña de orina oscura (posible daño muscular grave)",
        "Piel u ojos amarillentos, orina oscura (posible daño hepático)",
      ],
    },
    fuentes: [
      { texto: "Goodman & Gilman — Bases Farmacológicas de la Terapéutica, 13ª ed." },
      { texto: "FDA Prescribing Information — Atorvastatina" },
      { texto: "Guía de Dislipidemia 2026" },
    ],
    hipo: "bajo", peso: "neutro", costo: 1, egfrMin: 0, contra: ["EMBARAZO"] },

  { id: "ROSU", cat: "lipid", grp: "Estatina Alta Intensidad", name: "Rosuvastatina", ini: "10 mg", mant: "20-40 mg",
    adv: "Máxima potencia de reducción de LDL-C entre estatinas.",
    mecanismo: "Inhibe la HMG-CoA reductasa con alta afinidad hepatoselectiva, maximizando la reducción de LDL-C con baja exposición sistémica.",
    vidaMediaHoras: 19, vidaMediaLabel: "~19 h", reduccionA1c: null,
    titr: { l: ["Inicio", "4 Sem", "8 Sem"], d: [10, 20, 40] },
    benef: { ic: false, erc: false, ascvd: true, stroke: false, masld: false },
    mecanismoDetalle: "Mismo mecanismo de clase que atorvastatina (inhibición de la HMG-CoA reductasa → ↑receptores LDL hepáticos), con la mayor afinidad hepatoselectiva de las estatinas disponibles, lo que le da la máxima potencia de reducción de LDL-C de la clase con relativamente baja exposición sistémica (menor penetración a tejidos periféricos).",
    mecanismoPasos: [
      "Inhibición competitiva de la HMG-CoA reductasa hepática (alta afinidad hepatoselectiva)",
      "↓ Síntesis hepática de colesterol",
      "↑ Expresión de receptores de LDL hepáticos",
      "↑ Captación de LDL circulante",
      "↓ LDL-C — la mayor potencia de reducción entre las estatinas",
    ],
    efectosAdversos: {
      frecuentes: ["Mialgia leve", "Elevación leve de transaminasas"],
      graves: ["Miopatía/rabdomiólisis (rara)", "Proteinuria/hematuria leve reportada a dosis altas (mecanismo no claro, generalmente benigno)"],
    },
    contraindicacionesDetalle: [
      { condicion: "Enfermedad hepática activa", razon: "Riesgo de hepatotoxicidad" },
      { condicion: "Embarazo/lactancia", razon: "Contraindicado" },
      { condicion: "Población asiática (dosis altas)", razon: "Mayor exposición plasmática documentada — considerar dosis más bajas" },
    ],
    monitoreo: [
      { parametro: "Perfil lipídico (LDL-C)", frecuencia: "4-12 semanas tras iniciar/ajustar, luego anual" },
      { parametro: "CK", frecuencia: "Solo si hay síntomas musculares" },
    ],
    educacionPaciente: {
      queEs: "Reduce el colesterol 'malo' (LDL) bloqueando su producción en el hígado; es la estatina más potente disponible.",
      comoTomarlo: "Una vez al día, a cualquier hora, con o sin alimentos.",
      siOlvidaDosis: "Tomarla en cuanto se recuerde; si ya casi es hora de la siguiente, omitir la olvidada.",
      senalesAlarma: [
        "Dolor o debilidad muscular importante, especialmente con orina oscura",
        "Piel u ojos amarillentos",
      ],
    },
    fuentes: [
      { texto: "Goodman & Gilman — Bases Farmacológicas de la Terapéutica, 13ª ed." },
      { texto: "FDA Prescribing Information — Rosuvastatina" },
    ],
    hipo: "bajo", peso: "neutro", costo: 1, egfrMin: 0, contra: ["EMBARAZO"] },

  { id: "PRAVA", cat: "lipid", grp: "Estatina Baja/Moderada Intensidad", name: "Pravastatina", ini: "20 mg", mant: "80 mg",
    adv: "Hidrofílica, menor riesgo de miopatía. Útil si hay intolerancia a otras estatinas.",
    mecanismo: "Inhibe la HMG-CoA reductasa; su hidrofilia limita la penetración muscular, reduciendo el riesgo de miopatía frente a estatinas lipofílicas.",
    vidaMediaHoras: 1.8, vidaMediaLabel: "~1.5-2 h", reduccionA1c: null,
    titr: { l: ["Inicio", "4 Sem"], d: [20, 80] },
    benef: { ic: false, erc: false, ascvd: true, stroke: false, masld: false },
    mecanismoDetalle: "Mismo mecanismo de clase (inhibición de la HMG-CoA reductasa → ↑receptores LDL hepáticos), pero es una estatina HIDROFÍLICA (a diferencia de atorvastatina/simvastatina, que son lipofílicas), lo que limita su penetración pasiva al tejido muscular periférico y reduce el riesgo de miopatía — la opción preferida cuando un paciente ha tenido intolerancia muscular a otras estatinas. Su potencia de reducción de LDL-C es menor (intensidad baja/moderada).",
    mecanismoPasos: [
      "Inhibición competitiva de la HMG-CoA reductasa hepática",
      "Hidrofilia limita la penetración a tejido muscular periférico (menor riesgo de miopatía)",
      "↑ Expresión de receptores de LDL hepáticos",
      "↓ LDL-C (intensidad baja/moderada)",
    ],
    efectosAdversos: {
      frecuentes: ["Mialgia leve (menos frecuente que con estatinas lipofílicas)", "Elevación leve de transaminasas"],
      graves: ["Miopatía/rabdomiólisis (riesgo bajo, la más segura de la clase en este aspecto)"],
    },
    contraindicacionesDetalle: [
      { condicion: "Enfermedad hepática activa", razon: "Riesgo de hepatotoxicidad" },
      { condicion: "Embarazo/lactancia", razon: "Contraindicado" },
    ],
    monitoreo: [
      { parametro: "Perfil lipídico (LDL-C)", frecuencia: "4-12 semanas tras iniciar/ajustar, luego anual" },
    ],
    educacionPaciente: {
      queEs: "Reduce el colesterol 'malo' (LDL); es una buena opción si otras estatinas causaron dolor muscular.",
      comoTomarlo: "Una vez al día, con o sin alimentos.",
      siOlvidaDosis: "Tomarla en cuanto se recuerde; si ya casi es hora de la siguiente, omitir la olvidada.",
      senalesAlarma: ["Dolor o debilidad muscular importante", "Piel u ojos amarillentos"],
    },
    fuentes: [
      { texto: "Goodman & Gilman — Bases Farmacológicas de la Terapéutica, 13ª ed." },
      { texto: "FDA Prescribing Information — Pravastatina" },
    ],
    hipo: "bajo", peso: "neutro", costo: 1, egfrMin: 0, contra: ["EMBARAZO"] },

  { id: "EZE", cat: "lipid", grp: "Inhibidor de Absorción", name: "Ezetimibe", ini: "10 mg", mant: "10 mg",
    adv: "Add-on de 1a elección si no se alcanza meta con estatina a dosis máxima tolerada.",
    mecanismo: "Bloquea la proteína transportadora NPC1L1 en el borde en cepillo intestinal, inhibiendo la absorción de colesterol dietético y biliar.",
    vidaMediaHoras: 22, vidaMediaLabel: "~22 h (glucurónido activo)", reduccionA1c: null,
    titr: { l: ["Inicio"], d: [10] },
    benef: { ic: false, erc: false, ascvd: true, stroke: false, masld: false },
    mecanismoDetalle: "Bloquea selectivamente la proteína transportadora NPC1L1 (Niemann-Pick C1-Like 1) en el borde en cepillo del enterocito, la proteína responsable de captar el colesterol dietético y biliar de la luz intestinal. Al inhibirla, reduce la absorción de colesterol ~50%, lo que lleva al hepatocito a compensar aumentando la expresión de receptores de LDL — mecanismo COMPLEMENTARIO al de las estatinas (que actúan sobre la síntesis, no la absorción), por eso la combinación estatina+ezetimibe reduce LDL-C más que cualquiera de los dos solos, y es la primera opción de add-on cuando la estatina a dosis máxima tolerada no alcanza la meta.",
    mecanismoPasos: [
      "Bloqueo de la proteína transportadora NPC1L1 en el borde en cepillo intestinal",
      "↓ Absorción de colesterol dietético y biliar (~50%)",
      "↓ Colesterol disponible para el hepatocito",
      "↑ Expresión compensatoria de receptores de LDL hepáticos",
      "↓ LDL-C — efecto complementario (no redundante) al de las estatinas",
    ],
    efectosAdversos: {
      frecuentes: ["Generalmente muy bien tolerado", "Diarrea leve, cefalea"],
      graves: ["Elevación de transaminasas (más si se combina con estatina)", "Mialgia (rara en monoterapia, algo más frecuente combinado con estatina)"],
    },
    contraindicacionesDetalle: [
      { condicion: "Enfermedad hepática activa (en combinación con estatina)", razon: "Riesgo aditivo de hepatotoxicidad" },
      { condicion: "Embarazo/lactancia", razon: "Contraindicado" },
    ],
    monitoreo: [
      { parametro: "Perfil lipídico (LDL-C)", frecuencia: "4-12 semanas tras iniciar" },
    ],
    educacionPaciente: {
      queEs: "Bloquea la absorción del colesterol de los alimentos en el intestino; se agrega cuando la estatina sola no baja suficiente el colesterol.",
      comoTomarlo: "Una vez al día, con o sin alimentos.",
      siOlvidaDosis: "Tomarla en cuanto se recuerde; si ya casi es hora de la siguiente, omitir la olvidada.",
      senalesAlarma: ["Dolor muscular importante (si se combina con estatina)", "Piel u ojos amarillentos"],
    },
    fuentes: [
      { texto: "Goodman & Gilman — Bases Farmacológicas de la Terapéutica, 13ª ed." },
      { texto: "FDA Prescribing Information — Ezetimibe" },
    ],
    hipo: "bajo", peso: "neutro", costo: 1, egfrMin: 0, contra: ["EMBARAZO"] },

  { id: "BEMP", cat: "lipid", grp: "Inhibidor ATP-Citrato Liasa", name: "Ácido Bempedoico", ini: "180 mg", mant: "180 mg",
    adv: "Add-on si meta no alcanzada con estatina+ezetimibe. Precaución: gota, riesgo de rotura tendinosa.",
    mecanismo: "Inhibe la ATP-citrato liasa, un paso previo a la HMG-CoA reductasa en la síntesis de colesterol; se activa selectivamente en hígado (evita miopatía).",
    vidaMediaHoras: 21, vidaMediaLabel: "~21 h", reduccionA1c: null,
    titr: { l: ["Inicio"], d: [180] },
    benef: { ic: false, erc: false, ascvd: true, stroke: false, masld: false },
    mecanismoDetalle: "Inhibe la ATP-citrato liasa (ACL), una enzima de la vía de síntesis de colesterol que actúa un paso ANTES de la HMG-CoA reductasa (el blanco de las estatinas) — mecanismo complementario, no redundante. Es una prodroga que requiere activación por la enzima ACSVL1, presente casi exclusivamente en el hígado y AUSENTE en el músculo esquelético — este es el fundamento de su diseño: al no activarse en tejido muscular, tiene un riesgo de miopatía mucho menor que las estatinas, lo que lo hace especialmente útil en pacientes con intolerancia estatínica.",
    mecanismoPasos: [
      "Activación selectiva por la enzima ACSVL1 (presente en hígado, AUSENTE en músculo)",
      "Inhibición de la ATP-citrato liasa (un paso antes de la HMG-CoA reductasa)",
      "↓ Síntesis hepática de colesterol",
      "↑ Expresión de receptores de LDL hepáticos",
      "↓ LDL-C — con bajo riesgo de miopatía por su activación hepatoselectiva",
    ],
    efectosAdversos: {
      frecuentes: ["Generalmente bien tolerado", "Dolor abdominal, anemia leve"],
      graves: ["↑ Ácido úrico (puede precipitar gota)", "↑ Riesgo de rotura tendinosa (raro, más en >60 años, uso previo/concomitante de corticoides o antecedente de trastornos tendinosos)"],
    },
    contraindicacionesDetalle: [
      { condicion: "Antecedente de gota o hiperuricemia significativa", razon: "El fármaco eleva el ácido úrico" },
      { condicion: "Antecedente de rotura/trastorno tendinoso", razon: "Señal de mayor riesgo de rotura tendinosa" },
      { condicion: "Embarazo/lactancia", razon: "Contraindicado" },
    ],
    monitoreo: [
      { parametro: "Ácido úrico", frecuencia: "Basal y periódico, especialmente si hay antecedente de gota" },
      { parametro: "Perfil lipídico (LDL-C)", frecuencia: "8-12 semanas tras iniciar" },
    ],
    educacionPaciente: {
      queEs: "Reduce el colesterol 'malo' actuando en el hígado, con menor riesgo de dolor muscular que las estatinas.",
      comoTomarlo: "Una vez al día, con o sin alimentos.",
      siOlvidaDosis: "Tomarla en cuanto se recuerde; si ya casi es hora de la siguiente, omitir la olvidada.",
      senalesAlarma: [
        "Dolor articular intenso de aparición súbita (posible gota)",
        "Dolor o hinchazón repentina en un tendón, especialmente talón de Aquiles",
      ],
    },
    fuentes: [
      { texto: "FDA Prescribing Information — Ácido Bempedoico" },
      { texto: "Guía de Dislipidemia 2026" },
    ],
    hipo: "bajo", peso: "neutro", costo: 3, egfrMin: 0, contra: ["EMBARAZO"] },

  { id: "EVOLO", cat: "lipid", grp: "PCSK9i (mAb)", name: "Evolocumab", ini: "140 mg c/2sem", mant: "140 mg c/2sem",
    adv: "Reduce MACE. Indicado en alto riesgo ASCVD con LDL sobre meta pese a terapia máxima.",
    mecanismo: "Anticuerpo monoclonal que inhibe PCSK9, impidiendo la degradación del receptor de LDL hepático y aumentando su reciclaje/densidad en superficie.",
    vidaMediaHoras: 312, vidaMediaLabel: "~11-17 días", reduccionA1c: null,
    titr: { l: ["Inicio"], d: [140] },
    benef: { ic: false, erc: false, ascvd: true, stroke: false, masld: false },
    mecanismoDetalle: "Anticuerpo monoclonal humano IgG2 que se une y neutraliza a PCSK9 (proproteína convertasa subtilisina/kexina tipo 9) circulante, una proteína que normalmente se une al receptor de LDL en la superficie del hepatocito y lo marca para degradación lisosomal. Al bloquear PCSK9, el receptor de LDL escapa de la degradación y se recicla de vuelta a la superficie celular en lugar de destruirse, aumentando dramáticamente la densidad de receptores LDL disponibles — mecanismo completamente distinto e independiente del de las estatinas, por eso la reducción de LDL-C es aditiva (hasta 60% adicional sobre estatina+ezetimibe).",
    mecanismoPasos: [
      "Unión y neutralización del PCSK9 circulante",
      "El receptor de LDL escapa de la degradación lisosomal mediada por PCSK9",
      "El receptor de LDL se recicla a la superficie del hepatocito en lugar de destruirse",
      "↑↑ Densidad de receptores de LDL disponibles",
      "↓ LDL-C hasta 60% adicional — mecanismo independiente de las estatinas",
    ],
    efectosAdversos: {
      frecuentes: ["Reacciones en el sitio de inyección", "Síntomas gripales/nasofaringitis"],
      graves: ["Reacciones alérgicas (raras)"],
    },
    contraindicacionesDetalle: [
      { condicion: "Hipersensibilidad al producto", razon: "Reacción alérgica documentada" },
      { condicion: "Embarazo/lactancia", razon: "Datos insuficientes de seguridad" },
    ],
    monitoreo: [
      { parametro: "Perfil lipídico (LDL-C)", frecuencia: "4-8 semanas tras iniciar" },
    ],
    educacionPaciente: {
      queEs: "Bloquea una proteína (PCSK9) que normalmente destruye los receptores que el hígado usa para eliminar el colesterol 'malo' de la sangre; logra reducciones muy grandes de colesterol.",
      comoTomarlo: "Inyección subcutánea cada 2 semanas, en casa o en el consultorio.",
      siOlvidaDosis: "Aplicarla en cuanto se recuerde; consultar con su médico el ajuste del calendario.",
      senalesAlarma: ["Reacción en el sitio de inyección que no mejora", "Hinchazón facial o dificultad para respirar (alergia, rara)"],
    },
    fuentes: [
      { texto: "FDA Prescribing Information — Evolocumab" },
      { texto: "Guía de Dislipidemia 2026" },
    ],
    hipo: "bajo", peso: "neutro", costo: 3, egfrMin: 0, contra: ["EMBARAZO"] },

  { id: "ALIRO", cat: "lipid", grp: "PCSK9i (mAb)", name: "Alirocumab", ini: "75 mg c/2sem", mant: "150 mg c/2sem",
    adv: "Aprobado para ASCVD ya establecida (prevención secundaria).",
    mecanismo: "Anticuerpo monoclonal anti-PCSK9; mismo mecanismo que evolocumab, aumentando la disponibilidad de receptores LDL hepáticos.",
    vidaMediaHoras: 432, vidaMediaLabel: "~17-20 días", reduccionA1c: null,
    titr: { l: ["Inicio", "Sem 4"], d: [75, 150] },
    benef: { ic: false, erc: false, ascvd: true, stroke: false, masld: false },
    mecanismoDetalle: "Mismo mecanismo que evolocumab (anticuerpo monoclonal anti-PCSK9 → recicla el receptor de LDL en lugar de dejarlo degradar → ↑captación de LDL hepática). Aprobado específicamente en pacientes con ASCVD ya establecida (prevención secundaria) además de hipercolesterolemia familiar.",
    mecanismoPasos: [
      "Unión y neutralización del PCSK9 circulante",
      "El receptor de LDL escapa de la degradación mediada por PCSK9",
      "↑↑ Densidad de receptores de LDL en el hepatocito",
      "↓ LDL-C — mecanismo independiente de las estatinas, efecto aditivo",
    ],
    efectosAdversos: {
      frecuentes: ["Reacciones en el sitio de inyección", "Síntomas gripales"],
      graves: ["Reacciones alérgicas (raras)"],
    },
    contraindicacionesDetalle: [
      { condicion: "Hipersensibilidad al producto", razon: "Reacción alérgica documentada" },
      { condicion: "Embarazo/lactancia", razon: "Datos insuficientes de seguridad" },
    ],
    monitoreo: [
      { parametro: "Perfil lipídico (LDL-C)", frecuencia: "4-8 semanas tras iniciar" },
    ],
    educacionPaciente: {
      queEs: "Bloquea una proteína que destruye los receptores que el hígado usa para eliminar el colesterol 'malo'; se usa en personas que ya tuvieron un evento cardiovascular.",
      comoTomarlo: "Inyección subcutánea cada 2 semanas.",
      siOlvidaDosis: "Aplicarla en cuanto se recuerde; consultar con su médico el ajuste.",
      senalesAlarma: ["Reacción en el sitio de inyección que no mejora", "Hinchazón facial o dificultad para respirar"],
    },
    fuentes: [
      { texto: "FDA Prescribing Information — Alirocumab" },
    ],
    hipo: "bajo", peso: "neutro", costo: 3, egfrMin: 0, contra: ["EMBARAZO"] },

  { id: "IPE", cat: "lipid", grp: "Ácido Icosapentaenoico", name: "Icosapent Etilo", ini: "2 g BID", mant: "2 g BID",
    adv: "TG 150-499 con ASCVD o ≥2 factores de riesgo en estatina a dosis máxima: reduce CVD 25% (REDUCE-IT).",
    mecanismo: "Éster etílico de EPA purificado que se incorpora a membranas celulares y lipoproteínas, reduciendo triglicéridos y ejerciendo efectos antiinflamatorios/antitrombóticos pleiotrópicos.",
    vidaMediaHoras: 89, vidaMediaLabel: "~89 h", reduccionA1c: null,
    titr: { l: ["Inicio"], d: [4] },
    benef: { ic: false, erc: false, ascvd: true, stroke: false, masld: false },
    mecanismoDetalle: "Éster etílico purificado de ácido eicosapentaenoico (EPA, un ácido graso omega-3), administrado a dosis mucho más altas (4 g/día) que las presentaciones de venta libre de aceite de pescado. Se incorpora a las membranas celulares y a las lipoproteínas, reduciendo la síntesis hepática de triglicéridos y VLDL. Más allá de su efecto sobre triglicéridos, ejerce efectos pleiotrópicos antiinflamatorios, antitrombóticos y estabilizadores de placa que se cree explican la reducción del 25% en eventos cardiovasculares observada en el ensayo REDUCE-IT — un beneficio mayor al esperable solo por la reducción de triglicéridos, y NO replicado con formulaciones mixtas EPA+DHA (que incluso mostraron un pequeño aumento de fibrilación auricular).",
    mecanismoPasos: [
      "Incorporación de EPA purificado a membranas celulares y lipoproteínas",
      "↓ Síntesis hepática de triglicéridos y VLDL",
      "Efectos pleiotrópicos: antiinflamatorio, antitrombótico, estabilización de placa",
      "↓ Triglicéridos + reducción de eventos CV mayores 25% (REDUCE-IT) — beneficio más allá del efecto lipídico",
    ],
    efectosAdversos: {
      frecuentes: ["Dolor articular (artralgia)", "Molestias GI leves, sabor a pescado"],
      graves: ["Fibrilación auricular (ligero aumento observado en REDUCE-IT)", "↑ Riesgo de sangrado (efecto antiplaquetario leve, precaución con anticoagulantes)"],
    },
    contraindicacionesDetalle: [
      { condicion: "Alergia conocida al pescado/mariscos", razon: "Riesgo de reacción alérgica" },
      { condicion: "Fibrilación auricular activa o alto riesgo", razon: "Señal de aumento de FA en REDUCE-IT — valorar riesgo/beneficio" },
      { condicion: "Uso concomitante de anticoagulantes", razon: "Efecto antiplaquetario aditivo — vigilar sangrado" },
    ],
    monitoreo: [
      { parametro: "Triglicéridos", frecuencia: "4-12 semanas tras iniciar" },
      { parametro: "Ritmo cardiaco (síntomas de palpitaciones)", frecuencia: "En cada consulta" },
    ],
    educacionPaciente: {
      queEs: "Un derivado purificado de omega-3 a dosis alta que reduce los triglicéridos y, en estudios grandes, también redujo el riesgo de infartos y derrames.",
      comoTomarlo: "2 gramos dos veces al día, con alimentos.",
      siOlvidaDosis: "Tomarla en cuanto se recuerde; si ya casi es hora de la siguiente, omitir la olvidada.",
      senalesAlarma: ["Palpitaciones o latido irregular", "Sangrado inusual o moretones frecuentes"],
    },
    fuentes: [
      { texto: "Ensayo REDUCE-IT; FDA Prescribing Information — Icosapent Etilo" },
      { texto: "Guía de Dislipidemia 2026" },
    ],
    hipo: "bajo", peso: "neutro", costo: 3, egfrMin: 0, contra: ["EMBARAZO"] },

  { id: "FENO", cat: "lipid", grp: "Fibrato", name: "Fenofibrato", ini: "145 mg", mant: "145 mg",
    adv: "Reservado para TG≥500 mg/dL (prevención de pancreatitis), no para reducir ASCVD.",
    mecanismo: "Agonista de PPAR-α que induce la lipoproteín-lipasa y reduce la síntesis de apoC-III, acelerando el catabolismo de partículas ricas en triglicéridos.",
    vidaMediaHoras: 20, vidaMediaLabel: "~20 h", reduccionA1c: null,
    titr: { l: ["Inicio"], d: [145] },
    benef: { ic: false, erc: false, ascvd: false, stroke: false, masld: false },
    mecanismoDetalle: "Agonista del receptor nuclear PPAR-α (predominantemente en hígado y músculo), que al activarse induce la transcripción de la lipoproteín-lipasa (acelerando el catabolismo de partículas ricas en triglicéridos) y reduce la síntesis de apolipoproteína C-III (un inhibidor natural de la lipoproteín-lipasa) — el resultado neto es una reducción marcada de triglicéridos (hasta 50%) con aumento variable de HDL-C. Su indicación principal NO es reducir eventos cardiovasculares (no hay evidencia robusta de esto), sino prevenir la pancreatitis aguda por hipertrigliceridemia severa (TG ≥500 mg/dL).",
    mecanismoPasos: [
      "Activación del receptor nuclear PPAR-α",
      "↑ Transcripción de la lipoproteín-lipasa",
      "↓ Síntesis de apolipoproteína C-III (inhibidor natural de la lipoproteín-lipasa)",
      "↑ Catabolismo de partículas ricas en triglicéridos (VLDL/quilomicrones)",
      "↓ Triglicéridos hasta 50% — previene pancreatitis por hipertrigliceridemia severa",
    ],
    efectosAdversos: {
      frecuentes: ["Molestias GI leves", "Elevación leve de transaminasas"],
      graves: [
        "Miopatía (riesgo aumenta al combinarse con estatina, aunque menos que gemfibrozilo)",
        "↑ Creatinina (reversible, mecanismo no relacionado con daño renal verdadero, pero requiere vigilancia)",
        "Colelitiasis (cálculos biliares) con uso prolongado",
      ],
    },
    contraindicacionesDetalle: [
      { condicion: "Enfermedad hepática o de vesícula biliar activa", razon: "El fármaco puede afectar la función hepatobiliar" },
      { condicion: "eGFR < 30 mL/min/1.73m²", razon: "Requiere ajuste de dosis o evitar" },
      { condicion: "Embarazo", razon: "Contraindicado" },
    ],
    monitoreo: [
      { parametro: "Triglicéridos", frecuencia: "4-8 semanas tras iniciar" },
      { parametro: "Función renal y transaminasas", frecuencia: "Basal y periódico" },
    ],
    educacionPaciente: {
      queEs: "Reduce los triglicéridos muy altos, principalmente para prevenir una inflamación grave del páncreas (pancreatitis).",
      comoTomarlo: "Una vez al día, con alimentos.",
      siOlvidaDosis: "Tomarla en cuanto se recuerde; si ya casi es hora de la siguiente, omitir la olvidada.",
      senalesAlarma: ["Dolor muscular importante", "Dolor abdominal intenso irradiado a la espalda (posible pancreatitis o cálculo biliar)"],
    },
    fuentes: [
      { texto: "Goodman & Gilman — Bases Farmacológicas de la Terapéutica, 13ª ed." },
      { texto: "FDA Prescribing Information — Fenofibrato" },
    ],
    hipo: "bajo", peso: "neutro", costo: 1, egfrMin: 30, contra: ["EMBARAZO"] },

  { id: "SIMVA", cat: "lipid", grp: "Estatina Baja/Moderada Intensidad", name: "Simvastatina", ini: "20 mg", mant: "40 mg",
    adv: "Interacción relevante con amlodipino/verapamilo/diltiazem (limitar a 20 mg/día en combinación) por riesgo de miopatía. Dosis de 80 mg ya no se recomienda (FDA, riesgo de rabdomiólisis).",
    mecanismo: "Inhibe la HMG-CoA reductasa hepática, reduciendo la síntesis de colesterol y aumentando la expresión de receptores LDL.",
    vidaMediaHoras: 3, vidaMediaLabel: "~2-3 h", reduccionA1c: null,
    titr: { l: ["Inicio", "4 Sem"], d: [20, 40] },
    benef: { ic: false, erc: false, ascvd: true, stroke: false, masld: false },
    mecanismoDetalle: "Mismo mecanismo de clase (inhibición de la HMG-CoA reductasa → ↑receptores LDL hepáticos), pero con metabolismo casi exclusivo por CYP3A4, lo que la hace la estatina con MÁS interacciones farmacológicas clínicamente relevantes de la clase. La FDA restringió la dosis de 80 mg (ya no se recomienda) por señal de rabdomiólisis dosis-dependiente, y estableció límites estrictos de dosis al combinarse con amlodipino, verapamilo o diltiazem (todos inhibidores de CYP3A4) por el mismo riesgo.",
    mecanismoPasos: [
      "Inhibición competitiva de la HMG-CoA reductasa hepática",
      "Metabolismo casi exclusivo por CYP3A4 (alto potencial de interacciones)",
      "↑ Expresión de receptores de LDL hepáticos",
      "↓ LDL-C — riesgo de miopatía dosis-dependiente, mayor que otras estatinas",
    ],
    efectosAdversos: {
      frecuentes: ["Mialgia leve", "Elevación leve de transaminasas"],
      graves: ["Miopatía/rabdomiólisis (mayor riesgo dosis-dependiente que otras estatinas, especialmente combinada con inhibidores de CYP3A4)"],
    },
    contraindicacionesDetalle: [
      { condicion: "Uso concomitante con inhibidores potentes de CYP3A4 (itraconazol, claritromicina, inhibidores de proteasa, etc.)", razon: "Riesgo alto de miopatía/rabdomiólisis" },
      { condicion: "Dosis de 80 mg/día", razon: "Ya no se recomienda por la FDA — riesgo de rabdomiólisis" },
      { condicion: "Combinación con amlodipino/verapamilo/diltiazem", razon: "Limitar a 20 mg/día — riesgo de miopatía por inhibición de CYP3A4" },
      { condicion: "Enfermedad hepática activa / Embarazo", razon: "Contraindicado" },
    ],
    monitoreo: [
      { parametro: "Revisar SIEMPRE interacciones con CYP3A4 antes de prescribir o agregar un nuevo fármaco", frecuencia: "En cada consulta y al agregar cualquier medicamento nuevo" },
      { parametro: "Perfil lipídico (LDL-C)", frecuencia: "4-12 semanas tras iniciar" },
    ],
    educacionPaciente: {
      queEs: "Reduce el colesterol 'malo'; requiere más cuidado que otras estatinas porque interactúa con más medicamentos y algunos alimentos.",
      comoTomarlo: "Una vez al día, en la noche — evitar toronja/pomelo en grandes cantidades.",
      siOlvidaDosis: "Tomarla en cuanto se recuerde; si ya casi es hora de la siguiente, omitir la olvidada.",
      senalesAlarma: ["Dolor o debilidad muscular importante, especialmente con orina oscura", "IMPORTANTE: avisar siempre sobre este medicamento antes de que le receten algo nuevo"],
    },
    fuentes: [
      { texto: "Goodman & Gilman — Bases Farmacológicas de la Terapéutica, 13ª ed." },
      { texto: "FDA Drug Safety Communication — Simvastatina y riesgo de miopatía" },
    ],
    hipo: "bajo", peso: "neutro", costo: 1, egfrMin: 0, contra: ["EMBARAZO"] },

  { id: "PITA", cat: "lipid", grp: "Estatina Baja/Moderada Intensidad", name: "Pitavastatina", ini: "2 mg", mant: "4 mg",
    adv: "Mínima interacción con CYP3A4 — útil en pacientes polimedicados. Perfil neutro sobre glucemia (relevante en T2D).",
    mecanismo: "Inhibe la HMG-CoA reductasa; metabolismo mínimo por CYP450, lo que reduce el riesgo de interacciones farmacológicas frente a otras estatinas.",
    vidaMediaHoras: 5, vidaMediaLabel: "~5 h", reduccionA1c: null,
    titr: { l: ["Inicio", "4 Sem"], d: [2, 4] },
    benef: { ic: false, erc: false, ascvd: true, stroke: false, masld: false },
    mecanismoDetalle: "Mismo mecanismo de clase (inhibición de la HMG-CoA reductasa → ↑receptores LDL hepáticos), con metabolismo mínimo por el sistema CYP450 (a diferencia de la mayoría de las estatinas), lo que le da el menor potencial de interacciones farmacológicas de la clase — útil en pacientes polimedicados. También tiene un perfil neutro documentado sobre la glucemia, relevante en pacientes con diabetes tipo 2 (algunas estatinas tienen un pequeño efecto hiperglucemiante de clase).",
    mecanismoPasos: [
      "Inhibición competitiva de la HMG-CoA reductasa hepática",
      "Metabolismo mínimo por CYP450 (bajo potencial de interacciones)",
      "↑ Expresión de receptores de LDL hepáticos",
      "↓ LDL-C — perfil neutro sobre la glucemia",
    ],
    efectosAdversos: {
      frecuentes: ["Mialgia leve", "Elevación leve de transaminasas"],
      graves: ["Miopatía/rabdomiólisis (rara)"],
    },
    contraindicacionesDetalle: [
      { condicion: "Enfermedad hepática activa", razon: "Riesgo de hepatotoxicidad" },
      { condicion: "Embarazo/lactancia", razon: "Contraindicado" },
    ],
    monitoreo: [
      { parametro: "Perfil lipídico (LDL-C)", frecuencia: "4-12 semanas tras iniciar" },
    ],
    educacionPaciente: {
      queEs: "Reduce el colesterol 'malo' con bajo riesgo de interactuar con otros medicamentos que ya toma.",
      comoTomarlo: "Una vez al día, con o sin alimentos.",
      siOlvidaDosis: "Tomarla en cuanto se recuerde; si ya casi es hora de la siguiente, omitir la olvidada.",
      senalesAlarma: ["Dolor o debilidad muscular importante", "Piel u ojos amarillentos"],
    },
    fuentes: [
      { texto: "Goodman & Gilman — Bases Farmacológicas de la Terapéutica, 13ª ed." },
      { texto: "FDA Prescribing Information — Pitavastatina" },
    ],
    hipo: "bajo", peso: "neutro", costo: 2, egfrMin: 0, contra: ["EMBARAZO"] },

  { id: "INCLI", cat: "lipid", grp: "PCSK9i (siRNA)", name: "Inclisirán", ini: "284 mg SC", mant: "284 mg SC c/6 meses",
    adv: "Administración cada 6 meses (tras dosis de refuerzo a los 3 meses) — máxima adherencia posible dentro de la clase PCSK9i. Mismo escalón que evolocumab/alirocumab.",
    mecanismo: "ARN de interferencia pequeño (siRNA) que silencia la síntesis hepática de PCSK9, aumentando la disponibilidad de receptores LDL de forma sostenida.",
    vidaMediaHoras: 0, vidaMediaLabel: "Efecto sostenido ~6 meses (no aplica vida media plasmática convencional)", reduccionA1c: null,
    titr: { l: ["Inicio", "Mes 3", "Mes 9"], d: [284, 284, 284] },
    benef: { ic: false, erc: false, ascvd: true, stroke: false, masld: false },
    mecanismoDetalle: "ARN de interferencia pequeño (siRNA) conjugado con GalNAc (que dirige su captación específicamente a hepatocitos vía el receptor de asialoglicoproteína). Una vez dentro del hepatocito, se incorpora al complejo RISC (RNA-induced silencing complex) y guía la degradación catalítica del ARN mensajero de PCSK9, silenciando su síntesis en el origen — a diferencia de los anticuerpos monoclonales (que neutralizan PCSK9 ya producido), inclisirán impide que se fabrique. Este mecanismo catalítico (una molécula de siRNA puede degradar múltiples copias de ARNm) explica su efecto sostenido de ~6 meses con solo 2 inyecciones al año tras la dosis de refuerzo inicial.",
    mecanismoPasos: [
      "Conjugación con GalNAc dirige la captación específica a hepatocitos",
      "Incorporación al complejo RISC dentro de la célula",
      "Degradación catalítica del ARNm de PCSK9 (silenciamiento génico)",
      "↓ Síntesis hepática de PCSK9 → el receptor de LDL no se degrada",
      "↑ Receptores de LDL disponibles → ↓ LDL-C sostenido ~6 meses",
    ],
    efectosAdversos: {
      frecuentes: ["Reacciones en el sitio de inyección (las más frecuentes de la clase PCSK9i)", "Síntomas gripales"],
      graves: ["Reacciones alérgicas (raras)"],
    },
    contraindicacionesDetalle: [
      { condicion: "Hipersensibilidad al producto", razon: "Reacción alérgica documentada" },
      { condicion: "Embarazo/lactancia", razon: "Datos insuficientes de seguridad" },
    ],
    monitoreo: [
      { parametro: "Perfil lipídico (LDL-C)", frecuencia: "A los 3 meses de la dosis inicial, luego con cada dosis semestral" },
      { parametro: "Adherencia al calendario de refuerzo (día 1, mes 3, luego cada 6 meses)", frecuencia: "Confirmar en cada visita — el esquema exacto es clave para el efecto sostenido" },
    ],
    educacionPaciente: {
      queEs: "'Apaga' la fábrica en el hígado que produce una proteína (PCSK9) que destruye los receptores de colesterol; su efecto dura 6 meses con cada aplicación.",
      comoTomarlo: "Inyección subcutánea aplicada por personal de salud: dosis inicial, refuerzo a los 3 meses, y luego cada 6 meses.",
      siOlvidaDosis: "Reagendar lo antes posible con su médico — no es una dosis que se aplique usted mismo en casa habitualmente.",
      senalesAlarma: ["Reacción en el sitio de inyección que no mejora", "Hinchazón facial o dificultad para respirar"],
    },
    fuentes: [
      { texto: "FDA Prescribing Information — Inclisirán" },
      { texto: "Guía de Dislipidemia 2026" },
    ],
    hipo: "bajo", peso: "neutro", costo: 3, egfrMin: 0, contra: ["EMBARAZO"] },

  { id: "GEMFI", cat: "lipid", grp: "Fibrato", name: "Gemfibrozilo", ini: "600 mg BID", mant: "1200 mg/día",
    adv: "NO combinar con estatinas (inhibe su glucuronidación, riesgo alto de rabdomiólisis) — si se requiere fibrato + estatina, usar fenofibrato.",
    mecanismo: "Agonista de PPAR-α que reduce la síntesis hepática de triglicéridos y aumenta el catabolismo de lipoproteínas ricas en triglicéridos.",
    vidaMediaHoras: 1.5, vidaMediaLabel: "~1-2 h", reduccionA1c: null,
    titr: { l: ["Inicio"], d: [1200] },
    benef: { ic: false, erc: false, ascvd: false, stroke: false, masld: false },
    mecanismoDetalle: "Mismo mecanismo de clase que fenofibrato (agonismo de PPAR-α → ↑lipoproteín-lipasa, ↓apoC-III → ↑catabolismo de triglicéridos). Su diferencia clínica CRÍTICA es farmacocinética: gemfibrozilo inhibe la glucuronidación hepática (vía UGT1A1/UGT1A3) de las estatinas, lo que eleva sus niveles plasmáticos hasta varias veces y multiplica el riesgo de miopatía/rabdomiólisis si se combinan — interacción mucho más peligrosa que la de fenofibrato con estatinas, por lo que NUNCA deben combinarse gemfibrozilo+estatina (si se requiere fibrato+estatina, usar fenofibrato).",
    mecanismoPasos: [
      "Activación del receptor nuclear PPAR-α",
      "↑ Lipoproteín-lipasa + ↓ apolipoproteína C-III",
      "↑ Catabolismo de partículas ricas en triglicéridos",
      "↓ Triglicéridos — PERO inhibe la glucuronidación hepática de estatinas (riesgo alto de interacción)",
    ],
    efectosAdversos: {
      frecuentes: ["Molestias GI leves", "Elevación leve de transaminasas"],
      graves: [
        "Miopatía/rabdomiólisis grave SI se combina con estatina (interacción de alto riesgo, la más peligrosa de la clase)",
        "Colelitiasis con uso prolongado",
      ],
    },
    contraindicacionesDetalle: [
      { condicion: "Uso concomitante con CUALQUIER estatina", razon: "Inhibe la glucuronidación de estatinas — riesgo alto de rabdomiólisis; usar fenofibrato en su lugar si se necesita un fibrato con estatina" },
      { condicion: "Enfermedad hepática o de vesícula biliar activa", razon: "Puede afectar la función hepatobiliar" },
      { condicion: "eGFR < 30 mL/min/1.73m² / Embarazo", razon: "Contraindicado" },
    ],
    monitoreo: [
      { parametro: "Revisar SIEMPRE que no se esté combinando con una estatina", frecuencia: "En cada consulta — es la interacción medicamentosa más importante de este fármaco" },
      { parametro: "Triglicéridos", frecuencia: "4-8 semanas tras iniciar" },
    ],
    educacionPaciente: {
      queEs: "Reduce los triglicéridos altos.",
      comoTomarlo: "Dos veces al día, 30 minutos antes del desayuno y la cena.",
      siOlvidaDosis: "Tomarla en cuanto se recuerde; si ya casi es hora de la siguiente, omitir la olvidada.",
      senalesAlarma: [
        "Dolor muscular importante, especialmente si también toma una estatina — IMPORTANTE: informar de inmediato si le recetan una estatina mientras toma este medicamento",
        "Dolor abdominal intenso (posible cálculo biliar)",
      ],
    },
    fuentes: [
      { texto: "Goodman & Gilman — Bases Farmacológicas de la Terapéutica, 13ª ed." },
      { texto: "FDA Drug Safety Communication — interacción gemfibrozilo-estatinas" },
    ],
    hipo: "bajo", peso: "neutro", costo: 1, egfrMin: 30, contra: ["EMBARAZO"] },

  { id: "COLESEV", cat: "lipid", grp: "Secuestrante de Ácidos Biliares", name: "Colesevelam", ini: "1.875 g/día", mant: "4.375 g/día",
    adv: "Mejor tolerabilidad GI que colestiramina/colestipol. Beneficio adicional: reduce HbA1c ~0.5% — opción útil si coexiste dislipidemia + T2D con estatina no tolerada.",
    mecanismo: "Se une a ácidos biliares en el intestino, interrumpiendo su recirculación enterohepática y forzando al hígado a usar colesterol para sintetizar más ácidos biliares.",
    vidaMediaHoras: 0, vidaMediaLabel: "No se absorbe sistémicamente (acción local intestinal)", reduccionA1c: "0.3-0.5% (efecto adicional, no es su indicación primaria)",
    titr: { l: ["Inicio", "Sem 4"], d: [1.875, 4.375] },
    benef: { ic: false, erc: false, ascvd: false, stroke: false, masld: false },
    mecanismoDetalle: "Polímero no absorbible que se une a los ácidos biliares en la luz intestinal, interrumpiendo su recirculación enterohepática normal (los ácidos biliares se reabsorben habitualmente en el íleon terminal y regresan al hígado). Al perderse por las heces en lugar de reciclarse, el hígado detecta la deficiencia y compensa aumentando la conversión de colesterol hepático en NUEVOS ácidos biliares (vía la enzima 7-alfa-hidroxilasa) — esto consume colesterol hepático, lo que a su vez aumenta la expresión de receptores de LDL para reponerlo desde el plasma. Al no absorberse sistémicamente, actúa completamente a nivel local intestinal, con mejor tolerabilidad GI que colestiramina/colestipol (secuestrantes de generación anterior); además reduce la A1c ~0.3-0.5% por un mecanismo no completamente dilucidado, relacionado con la señalización de ácidos biliares sobre el receptor FXR.",
    mecanismoPasos: [
      "Unión a ácidos biliares en la luz intestinal (no se absorbe sistémicamente)",
      "Interrupción de la recirculación enterohepática de ácidos biliares",
      "El hígado compensa: ↑ conversión de colesterol en NUEVOS ácidos biliares",
      "↑ Expresión de receptores de LDL hepáticos para reponer el colesterol consumido",
      "↓ LDL-C + efecto adicional de ↓ A1c ~0.3-0.5% (útil si coexiste T2D)",
    ],
    efectosAdversos: {
      frecuentes: ["Estreñimiento (menos que colestiramina/colestipol)", "Distensión abdominal, flatulencia"],
      graves: ["↑ Triglicéridos (puede empeorar hipertrigliceridemia preexistente)", "Interferencia con la absorción de otros fármacos si se toman juntos"],
    },
    contraindicacionesDetalle: [
      { condicion: "Triglicéridos ≥500 mg/dL o antecedente de pancreatitis por hipertrigliceridemia", razon: "El fármaco puede elevar aún más los triglicéridos" },
      { condicion: "Obstrucción intestinal completa o antecedente", razon: "El polímero puede agravar la obstrucción" },
      { condicion: "Embarazo (precaución, no contraindicación absoluta como otros hipolipemiantes)", razon: "No se absorbe sistémicamente — perfil más favorable, pero consultar antes de usar" },
    ],
    monitoreo: [
      { parametro: "Triglicéridos", frecuencia: "Basal y periódico — vigilar elevación" },
      { parametro: "Horario de administración de otros medicamentos", frecuencia: "Separar al menos 4 horas — puede reducir su absorción" },
    ],
    educacionPaciente: {
      queEs: "Atrapa los ácidos biliares en el intestino, obligando al hígado a usar más colesterol para fabricar nuevos — así baja el colesterol 'malo'. También ayuda un poco a bajar el azúcar si tiene diabetes.",
      comoTomarlo: "Con alimentos y abundante líquido, 1-2 veces al día — tomar otros medicamentos al menos 4 horas antes o después.",
      siOlvidaDosis: "Tomarla en cuanto se recuerde con la siguiente comida; si ya casi es hora de la siguiente dosis, omitir la olvidada.",
      senalesAlarma: ["Estreñimiento severo o dolor abdominal intenso", "Distensión abdominal marcada"],
    },
    fuentes: [
      { texto: "Goodman & Gilman — Bases Farmacológicas de la Terapéutica, 13ª ed." },
      { texto: "FDA Prescribing Information — Colesevelam" },
    ],
    hipo: "bajo", peso: "neutro", costo: 2, egfrMin: 0, contra: ["EMBARAZO"] },

  // ============ OTROS / INTERACCIONES RELEVANTES ============
  // Categoría nueva (10-ago-2026, a petición del Dr. Ortega): antes AINE/
  // Litio/Antipsicótico-alto-riesgo/TARV-potenciado vivían como banderas sí/no
  // en el formulario ("¿usa AINE?"), sin fármaco específico — el médico no
  // tenía dónde registrar CUÁL, y el expediente/PDF tampoco lo mostraba. Se
  // migran aquí como fármacos concretos dentro de Medicación Actual, mismo
  // patrón (checkbox + dosis máxima + dosis/frecuencia) que antidiabetic/htn/
  // lipid/obesity. NO se agregan a EndoFarma (catálogo de consulta libre,
  // CATEGORIA_ORDER en render.js) — el alcance de este cambio es solo
  // Medicación Actual + los checks de interacción de las Capas 1-4/Dominios
  // 1/3/5 (polypharmacy.js/psychiatry.js/hiv-art.js), no el catálogo de
  // prescripción nueva (ninguno de estos fármacos se RECOMIENDA desde el
  // motor, solo se detecta si ya están en uso). `benef` va todo en false y
  // `hipo`/`peso` quedan neutros porque no participan del algoritmo de
  // selección/ranking — solo currentDrugIssue/checks dedicados los leen.
  { id: "IBU", cat: "otros", grp: "AINE", name: "Ibuprofeno", ini: "N/A", mant: "N/A",
    adv: "AINE no selectivo de uso libre/frecuente. Riesgo renal/GI de clase — ver Casos 45 y 47 (Tríada Mortal / nefrotoxicidad en ERC).",
    mecanismo: "Inhibe COX-1/COX-2, reduciendo síntesis de prostaglandinas — incluidas las que mantienen la perfusión de la arteriola aferente renal.",
    vidaMediaHoras: 2, vidaMediaLabel: "~2 h", reduccionA1c: null,
    titr: { l: ["Uso actual"], d: [1] },
    benef: { ic: false, erc: false, ascvd: false, stroke: false, masld: false },
    // REDISEÑO DE FICHA (16-ago-2026): metodología en entrada "MET". Esta
    // categoría "otros" no es un fármaco recetado desde EndoFarma sino un
    // registro de medicación actual del paciente para el motor de
    // interacciones (calculations.js) — la ficha ampliada documenta el
    // riesgo relevante para la práctica endocrinológica (nefrotoxicidad,
    // interacción con litio/IECA/diuréticos), no un perfil completo de
    // prescripción de un AINE.
    mecanismoDetalle: "Inhibe de forma no selectiva las ciclooxigenasas COX-1 y COX-2, bloqueando la síntesis de prostaglandinas. En el riñón, las prostaglandinas (especialmente PGE2 y PGI2) mantienen la vasodilatación de la arteriola AFERENTE glomerular, compensando la vasoconstricción de la arteriola eferente inducida por angiotensina II — este equilibrio es crítico quien ya usa IECA/ARA-II (que vasodilatan la eferente) y/o diuréticos (que reducen el volumen circulante). Al bloquear las prostaglandinas, el AINE elimina la vasodilatación compensadora de la aferente, y la combinación con IECA/ARA-II + diurético puede colapsar la presión de filtración glomerular — la llamada 'tríada mortal' o 'triple whammy', causa reconocida de lesión renal aguda.",
    mecanismoPasos: [
      "Inhibición no selectiva de COX-1/COX-2",
      "↓ Síntesis de prostaglandinas vasodilatadoras (PGE2, PGI2) en la arteriola aferente renal",
      "Pierde la vasodilatación compensadora de la aferente",
      "En combinación con IECA/ARA-II (vasodilata eferente) + diurético (↓volumen): colapso de la presión de filtración glomerular",
      "Riesgo de lesión renal aguda ('tríada mortal') — relevante en pacientes con ERC/diabetes que ya usan IECA/ARA-II",
    ],
    efectosAdversos: {
      frecuentes: ["Dispepsia, dolor abdominal", "Retención de líquidos leve, elevación de presión arterial"],
      graves: [
        "Lesión renal aguda, especialmente combinado con IECA/ARA-II + diurético ('tríada mortal')",
        "Sangrado GI/úlcera péptica",
        "Descompensación de insuficiencia cardiaca por retención de líquidos",
      ],
    },
    contraindicacionesDetalle: [
      { condicion: "Uso concomitante de IECA/ARA-II + diurético", razon: "Combinación de alto riesgo de lesión renal aguda ('tríada mortal')" },
      { condicion: "ERC avanzada", razon: "Mayor vulnerabilidad a la nefrotoxicidad por AINE" },
      { condicion: "Insuficiencia cardiaca", razon: "Retención de líquidos puede descompensarla" },
      { condicion: "Embarazo (3er trimestre especialmente)", razon: "Riesgo de cierre prematuro del ductus arterioso" },
    ],
    monitoreo: [
      { parametro: "Función renal (creatinina/eGFR)", frecuencia: "Antes de iniciar y tras 1-2 semanas si el paciente usa IECA/ARA-II/diurético, o tiene ERC/diabetes" },
      { parametro: "Presión arterial", frecuencia: "Con uso regular/prolongado" },
    ],
    educacionPaciente: {
      queEs: "Un antiinflamatorio de uso común para dolor; puede afectar al riñón si ya toma medicamentos para la presión o diuréticos.",
      comoTomarlo: "Según indicación, con alimentos para reducir molestias estomacales.",
      siOlvidaDosis: "No aplica de forma estricta — se usa según necesidad de dolor/inflamación.",
      senalesAlarma: [
        "Disminución notable de la cantidad de orina o hinchazón (posible daño renal)",
        "Dolor abdominal intenso o heces oscuras (posible sangrado digestivo)",
        "IMPORTANTE: avisar siempre a su médico que toma este medicamento si también usa pastillas para la presión o diuréticos",
      ],
    },
    fuentes: [
      { texto: "Goodman & Gilman — Bases Farmacológicas de la Terapéutica, 13ª ed." },
      { texto: "FDA Prescribing Information — Ibuprofeno" },
    ],
    hipo: "bajo", peso: "neutro", costo: 1, egfrMin: 0, contra: ["EMBARAZO"] },

  { id: "NAPRO", cat: "otros", grp: "AINE", name: "Naproxeno", ini: "N/A", mant: "N/A",
    adv: "AINE no selectivo de vida media más larga (BID) — mismo riesgo renal/GI de clase.",
    mecanismo: "Inhibe COX-1/COX-2, reduciendo síntesis de prostaglandinas — incluidas las que mantienen la perfusión de la arteriola aferente renal.",
    vidaMediaHoras: 14, vidaMediaLabel: "~12-17 h", reduccionA1c: null,
    titr: { l: ["Uso actual"], d: [1] },
    benef: { ic: false, erc: false, ascvd: false, stroke: false, masld: false },
    mecanismoDetalle: "Mismo mecanismo de clase que ibuprofeno (inhibición no selectiva de COX-1/COX-2 → ↓prostaglandinas vasodilatadoras de la arteriola aferente renal), con vida media más larga que permite dosificación BID, pero el mismo riesgo de 'tríada mortal' al combinarse con IECA/ARA-II + diurético.",
    mecanismoPasos: [
      "Inhibición no selectiva de COX-1/COX-2",
      "↓ Prostaglandinas vasodilatadoras en la arteriola aferente renal",
      "Riesgo de 'tríada mortal' con IECA/ARA-II + diurético",
      "Riesgo de lesión renal aguda",
    ],
    efectosAdversos: {
      frecuentes: ["Dispepsia", "Retención de líquidos leve"],
      graves: ["Lesión renal aguda ('tríada mortal')", "Sangrado GI/úlcera péptica"],
    },
    contraindicacionesDetalle: [
      { condicion: "Uso concomitante de IECA/ARA-II + diurético", razon: "Riesgo de lesión renal aguda" },
      { condicion: "ERC avanzada", razon: "Mayor vulnerabilidad a nefrotoxicidad" },
    ],
    monitoreo: [
      { parametro: "Función renal", frecuencia: "Si el paciente usa IECA/ARA-II/diurético o tiene ERC/diabetes" },
    ],
    educacionPaciente: {
      queEs: "Antiinflamatorio de acción más prolongada; mismo riesgo renal que otros de su tipo si toma medicamentos para la presión.",
      comoTomarlo: "Según indicación, con alimentos.",
      siOlvidaDosis: "No aplica de forma estricta.",
      senalesAlarma: ["Disminución de orina o hinchazón", "IMPORTANTE: avisar si toma pastillas para la presión o diuréticos"],
    },
    fuentes: [
      { texto: "Goodman & Gilman — Bases Farmacológicas de la Terapéutica, 13ª ed." },
    ],
    hipo: "bajo", peso: "neutro", costo: 1, egfrMin: 0, contra: ["EMBARAZO"] },

  { id: "DICLO", cat: "otros", grp: "AINE", name: "Diclofenaco", ini: "N/A", mant: "N/A",
    adv: "AINE no selectivo, disponible oral/tópico/parenteral — mismo riesgo renal/GI de clase.",
    mecanismo: "Inhibe COX-1/COX-2, reduciendo síntesis de prostaglandinas — incluidas las que mantienen la perfusión de la arteriola aferente renal.",
    vidaMediaHoras: 1.5, vidaMediaLabel: "~1-2 h", reduccionA1c: null,
    titr: { l: ["Uso actual"], d: [1] },
    benef: { ic: false, erc: false, ascvd: false, stroke: false, masld: false },
    mecanismoDetalle: "Mismo mecanismo de clase (inhibición no selectiva de COX-1/COX-2 → ↓prostaglandinas vasodilatadoras de la arteriola aferente renal), disponible en formulación oral, tópica y parenteral. La forma tópica tiene menor absorción sistémica y por tanto menor riesgo renal que la oral, pero el riesgo no es cero en ERC avanzada.",
    mecanismoPasos: [
      "Inhibición no selectiva de COX-1/COX-2",
      "↓ Prostaglandinas vasodilatadoras en la arteriola aferente renal",
      "Riesgo de 'tríada mortal' con IECA/ARA-II + diurético (formulación oral/parenteral)",
      "Riesgo de lesión renal aguda",
    ],
    efectosAdversos: {
      frecuentes: ["Dispepsia (oral)", "Irritación local (tópico)"],
      graves: ["Lesión renal aguda (oral/parenteral)", "Sangrado GI/úlcera péptica (oral)"],
    },
    contraindicacionesDetalle: [
      { condicion: "Uso concomitante de IECA/ARA-II + diurético (formulación oral/parenteral)", razon: "Riesgo de lesión renal aguda" },
      { condicion: "ERC avanzada", razon: "Mayor vulnerabilidad, incluso con la forma tópica a dosis altas" },
    ],
    monitoreo: [
      { parametro: "Función renal (formas oral/parenteral)", frecuencia: "Si el paciente usa IECA/ARA-II/diurético o tiene ERC/diabetes" },
    ],
    educacionPaciente: {
      queEs: "Antiinflamatorio disponible en pastilla, gel o inyección; la forma en gel tiene menor riesgo para el riñón que la pastilla.",
      comoTomarlo: "Según indicación y formulación.",
      siOlvidaDosis: "No aplica de forma estricta.",
      senalesAlarma: ["Disminución de orina o hinchazón (formas oral/inyectable)", "IMPORTANTE: avisar si toma pastillas para la presión o diuréticos"],
    },
    fuentes: [
      { texto: "Goodman & Gilman — Bases Farmacológicas de la Terapéutica, 13ª ed." },
    ],
    hipo: "bajo", peso: "neutro", costo: 1, egfrMin: 0, contra: ["EMBARAZO"] },

  { id: "KETOR", cat: "otros", grp: "AINE", name: "Ketorolaco", ini: "N/A", mant: "N/A",
    adv: "AINE de mayor potencia analgésica, uso típicamente corto (≤5 días) — mismo riesgo renal/GI de clase, más marcado por su potencia.",
    mecanismo: "Inhibe COX-1/COX-2, reduciendo síntesis de prostaglandinas — incluidas las que mantienen la perfusión de la arteriola aferente renal.",
    vidaMediaHoras: 5, vidaMediaLabel: "~5 h", reduccionA1c: null,
    titr: { l: ["Uso actual"], d: [1] },
    benef: { ic: false, erc: false, ascvd: false, stroke: false, masld: false },
    mecanismoDetalle: "Mismo mecanismo de clase (inhibición no selectiva de COX-1/COX-2 → ↓prostaglandinas vasodilatadoras de la arteriola aferente renal), pero es el AINE de MAYOR potencia analgésica disponible, por lo que su uso se limita típicamente a ≤5 días (post-quirúrgico/dolor agudo severo) — el riesgo renal/GI de clase es el mismo, pero más marcado por su potencia y por el contexto de uso (frecuentemente perioperatorio, con depleción de volumen concomitante).",
    mecanismoPasos: [
      "Inhibición no selectiva de COX-1/COX-2 (alta potencia)",
      "↓ Prostaglandinas vasodilatadoras en la arteriola aferente renal",
      "Riesgo de 'tríada mortal' con IECA/ARA-II + diurético, potenciado en contexto perioperatorio",
      "Riesgo de lesión renal aguda — uso limitado a ≤5 días",
    ],
    efectosAdversos: {
      frecuentes: ["Dispepsia", "Retención de líquidos"],
      graves: ["Lesión renal aguda (mayor riesgo que otros AINE por su potencia y contexto de uso)", "Sangrado GI/úlcera péptica"],
    },
    contraindicacionesDetalle: [
      { condicion: "Uso concomitante de IECA/ARA-II + diurético", razon: "Riesgo de lesión renal aguda, potenciado en contexto perioperatorio" },
      { condicion: "Uso por más de 5 días", razon: "No recomendado — mayor riesgo acumulado" },
      { condicion: "ERC avanzada", razon: "Contraindicación relativa fuerte" },
    ],
    monitoreo: [
      { parametro: "Función renal", frecuencia: "Especialmente en contexto perioperatorio con IECA/ARA-II/diurético" },
      { parametro: "Duración total de uso", frecuencia: "No exceder 5 días" },
    ],
    educacionPaciente: {
      queEs: "Un antiinflamatorio muy potente de uso corto, típicamente después de una cirugía o para dolor severo.",
      comoTomarlo: "Solo por el tiempo indicado por su médico (máximo 5 días).",
      siOlvidaDosis: "No aplica de forma estricta.",
      senalesAlarma: ["Disminución de orina o hinchazón", "IMPORTANTE: avisar si toma pastillas para la presión o diuréticos"],
    },
    fuentes: [
      { texto: "Goodman & Gilman — Bases Farmacológicas de la Terapéutica, 13ª ed." },
    ],
    hipo: "bajo", peso: "neutro", costo: 1, egfrMin: 0, contra: ["EMBARAZO"] },

  { id: "CELEC", cat: "otros", grp: "AINE", name: "Celecoxib", ini: "N/A", mant: "N/A",
    adv: "AINE COX-2 selectivo — menor riesgo GI que los no selectivos, pero el riesgo RENAL de clase (arteriola aferente) se mantiene igual.",
    mecanismo: "Inhibe selectivamente COX-2, reduciendo síntesis de prostaglandinas — incluidas las que mantienen la perfusión de la arteriola aferente renal.",
    vidaMediaHoras: 11, vidaMediaLabel: "~11 h", reduccionA1c: null,
    titr: { l: ["Uso actual"], d: [1] },
    benef: { ic: false, erc: false, ascvd: false, stroke: false, masld: false },
    mecanismoDetalle: "Inhibe SELECTIVAMENTE la COX-2 (respeta la COX-1, responsable de la protección de la mucosa gástrica y la función plaquetaria), por lo que tiene menor riesgo de sangrado GI que los AINE no selectivos. Sin embargo, la COX-2 también participa en la producción de prostaglandinas vasodilatadoras de la arteriola aferente renal, por lo que el riesgo RENAL de clase (incluida la 'tríada mortal' con IECA/ARA-II + diurético) se mantiene IGUAL que con los AINE no selectivos — la selectividad COX-2 protege el estómago, no el riñón.",
    mecanismoPasos: [
      "Inhibición SELECTIVA de COX-2 (respeta COX-1 gástrica/plaquetaria)",
      "Menor riesgo GI que AINE no selectivos",
      "↓ Prostaglandinas vasodilatadoras de la arteriola aferente renal (COX-2 renal, sin protección)",
      "Riesgo renal de clase IGUAL que AINE no selectivos ('tríada mortal' con IECA/ARA-II + diurético)",
    ],
    efectosAdversos: {
      frecuentes: ["Dispepsia (menos que AINE no selectivos)", "Retención de líquidos"],
      graves: ["Lesión renal aguda (mismo riesgo que AINE no selectivos)", "↑ Riesgo cardiovascular (señal de clase de los inhibidores COX-2 selectivos)"],
    },
    contraindicacionesDetalle: [
      { condicion: "Uso concomitante de IECA/ARA-II + diurético", razon: "El riesgo renal NO se reduce por ser COX-2 selectivo" },
      { condicion: "ASCVD establecida o alto riesgo cardiovascular", razon: "Señal de clase de mayor riesgo CV con inhibidores COX-2 selectivos" },
      { condicion: "ERC avanzada", razon: "Mismo riesgo renal que AINE no selectivos" },
    ],
    monitoreo: [
      { parametro: "Función renal", frecuencia: "Igual vigilancia que con cualquier AINE si usa IECA/ARA-II/diurético" },
    ],
    educacionPaciente: {
      queEs: "Un antiinflamatorio que cuida más el estómago que otros de su tipo, pero el riesgo para el riñón es el mismo.",
      comoTomarlo: "Según indicación, con o sin alimentos.",
      siOlvidaDosis: "No aplica de forma estricta.",
      senalesAlarma: ["Disminución de orina o hinchazón", "IMPORTANTE: avisar si toma pastillas para la presión o diuréticos — el riesgo renal es el mismo que con otros antiinflamatorios"],
    },
    fuentes: [
      { texto: "Goodman & Gilman — Bases Farmacológicas de la Terapéutica, 13ª ed." },
    ],
    hipo: "bajo", peso: "neutro", costo: 2, egfrMin: 0, contra: ["EMBARAZO"] },

  { id: "LITIO", cat: "otros", grp: "Estabilizador del Ánimo", name: "Litio", ini: "N/A", mant: "N/A",
    adv: "Ventana terapéutica estrecha. IECA/ARA-II/Tiazidas reducen su depuración renal — riesgo de litemia tóxica sin cambiar la dosis de litio (Caso 51).",
    mecanismo: "Mecanismo de acción como estabilizador del ánimo no completamente dilucidado; se elimina casi exclusivamente por vía renal (reabsorción proximal ligada a sodio).",
    vidaMediaHoras: 21, vidaMediaLabel: "~18-24 h (más prolongada si hay daño renal)", reduccionA1c: null,
    titr: { l: ["Uso actual"], d: [1] },
    benef: { ic: false, erc: false, ascvd: false, stroke: false, masld: false },
    mecanismoDetalle: "Su mecanismo de acción como estabilizador del ánimo no está completamente dilucidado (se proponen efectos sobre la señalización de inositol, inhibición de GSK-3β, y modulación de neurotransmisores), pero su relevancia endocrinológica es puramente FARMACOCINÉTICA: el litio se elimina casi exclusivamente por el riñón, siendo reabsorbido en el túbulo proximal por el mismo transportador que reabsorbe sodio. Cualquier fármaco que reduzca el sodio circulante o el flujo sanguíneo renal (IECA/ARA-II, diuréticos tiazídicos especialmente, AINE) aumenta la reabsorción proximal de litio JUNTO con el sodio, elevando la litemia a niveles tóxicos SIN que se haya cambiado la dosis de litio — su ventana terapéutica es muy estrecha (0.6-1.2 mEq/L habitual, toxicidad desde ~1.5 mEq/L).",
    mecanismoPasos: [
      "Reabsorción tubular proximal de litio ligada al mismo transportador que el sodio",
      "IECA/ARA-II/tiazidas/AINE reducen el sodio circulante o el flujo renal",
      "↑ Reabsorción proximal de litio JUNTO con el sodio (mecanismo compensador)",
      "↑ Litemia SIN cambio en la dosis de litio prescrita",
      "Riesgo de litemia tóxica — ventana terapéutica muy estrecha (0.6-1.2 mEq/L)",
    ],
    efectosAdversos: {
      frecuentes: ["Temblor fino de manos", "Poliuria/polidipsia (diabetes insípida nefrogénica inducida por litio)", "Hipotiroidismo"],
      graves: [
        "Litemia tóxica (temblor grueso, confusión, ataxia, convulsiones, arritmias) — riesgo aumentado por IECA/ARA-II/tiazidas/AINE sin cambiar la dosis",
        "Nefropatía crónica por litio con uso prolongado",
      ],
    },
    contraindicacionesDetalle: [
      { condicion: "Inicio de IECA/ARA-II, tiazida o AINE sin ajustar/vigilar litemia", razon: "Riesgo de litemia tóxica sin cambio en la dosis de litio" },
      { condicion: "Deshidratación o dieta baja en sodio no supervisada", razon: "Aumenta la reabsorción proximal de litio por el mismo mecanismo" },
    ],
    monitoreo: [
      { parametro: "Litemia", frecuencia: "En cada cambio de IECA/ARA-II/diurético/AINE en un paciente con litio — no asumir que la dosis de litio sigue siendo segura" },
      { parametro: "Función renal y tiroidea", frecuencia: "Periódico con uso crónico" },
    ],
    educacionPaciente: {
      queEs: "Un estabilizador del ánimo cuyo nivel en la sangre puede subir a niveles peligrosos si empieza otro medicamento nuevo, sin que se haya cambiado la dosis de litio.",
      comoTomarlo: "Según indicación del psiquiatra, con niveles en sangre monitoreados regularmente.",
      siOlvidaDosis: "Consultar con su médico — no duplicar dosis.",
      senalesAlarma: [
        "Temblor marcado, confusión, dificultad para caminar o hablar (posible nivel tóxico) — buscar atención inmediata",
        "IMPORTANTE: avisar SIEMPRE al médico que receta litio si le recetan un nuevo medicamento para la presión, diurético, o antiinflamatorio",
      ],
    },
    fuentes: [
      { texto: "Goodman & Gilman — Bases Farmacológicas de la Terapéutica, 13ª ed." },
    ],
    hipo: "bajo", peso: "neutro", costo: 1, egfrMin: 0, contra: ["EMBARAZO"] },

  { id: "OLANZ", cat: "otros", grp: "Antipsicótico Alto Riesgo Metabólico", name: "Olanzapina", ini: "N/A", mant: "N/A",
    adv: "Antipsicótico 2ª gen. de mayor riesgo metabólico de la clase (aumento de peso, dislipidemia, resistencia a la insulina) — consenso ADA/APA/AACE/NAASO 2004. Ver Caso 50.",
    mecanismo: "Antagonista de receptores dopaminérgicos D2 y serotoninérgicos 5-HT2A, con afinidad adicional por receptores histaminérgicos H1 (contribuye al aumento de peso).",
    vidaMediaHoras: 30, vidaMediaLabel: "~30 h (rango 21-54 h)", reduccionA1c: null,
    titr: { l: ["Uso actual"], d: [1] },
    benef: { ic: false, erc: false, ascvd: false, stroke: false, masld: false },
    mecanismoDetalle: "Antagoniza los receptores dopaminérgicos D2 (efecto antipsicótico) y serotoninérgicos 5-HT2A (mejora síntomas negativos, menos efectos extrapiramidales que antipsicóticos de 1ª generación), pero también tiene afinidad significativa por receptores histaminérgicos H1 y muscarínicos — el bloqueo H1 hipotalámico estimula directamente el apetito y altera la regulación central del peso, mientras que el antagonismo de receptores 5-HT2C y dopaminérgicos hipotalámicos contribuye a resistencia a la insulina independiente de la ganancia de peso. Es el antipsicótico de 2ª generación de MAYOR riesgo metabólico de la clase, según el consenso ADA/APA/AACE/NAASO 2004 (aún vigente como referencia).",
    mecanismoPasos: [
      "Antagonismo de receptores D2 (efecto antipsicótico) y 5-HT2A",
      "Antagonismo H1 hipotalámico → ↑ apetito directo",
      "Antagonismo 5-HT2C/dopaminérgico → resistencia a la insulina independiente del peso",
      "↑ Peso + dislipidemia + resistencia a la insulina — el mayor riesgo metabólico de su clase",
    ],
    efectosAdversos: {
      frecuentes: ["Ganancia de peso marcada", "Sedación", "Sequedad de boca (efecto anticolinérgico)"],
      graves: [
        "Diabetes de novo o descompensación de diabetes preexistente",
        "Dislipidemia significativa (↑triglicéridos, ↑LDL-C)",
        "Cetoacidosis diabética (reportada incluso sin ganancia de peso marcada, por el efecto directo sobre la resistencia a la insulina)",
      ],
    },
    contraindicacionesDetalle: [
      { condicion: "Diabetes descompensada o alto riesgo metabólico ya establecido", razon: "Este fármaco tiene el mayor riesgo metabólico de su clase — considerar alternativas con menor riesgo si es clínicamente posible" },
    ],
    monitoreo: [
      { parametro: "Peso/IMC", frecuencia: "Basal, 4, 8, 12 semanas, luego trimestral (consenso ADA/APA/AACE/NAASO)" },
      { parametro: "Glucosa en ayuno y perfil lipídico", frecuencia: "Basal, 3 meses, luego anual (más frecuente si hay factores de riesgo)" },
      { parametro: "Circunferencia de cintura y presión arterial", frecuencia: "Basal y en cada control metabólico" },
    ],
    educacionPaciente: {
      queEs: "Un antipsicótico eficaz que, en algunas personas, puede aumentar el apetito y el peso, y afectar el azúcar y el colesterol en sangre.",
      comoTomarlo: "Según indicación del psiquiatra.",
      siOlvidaDosis: "Consultar con su médico — no duplicar dosis.",
      senalesAlarma: [
        "Sed excesiva, orinar mucho, cansancio extremo (posibles signos de azúcar alta)",
        "Aumento de peso notable — comentarlo en cada consulta para vigilancia conjunta",
      ],
    },
    fuentes: [
      { texto: "Consenso ADA/APA/AACE/NAASO 2004 sobre antipsicóticos y riesgo metabólico" },
      { texto: "Goodman & Gilman — Bases Farmacológicas de la Terapéutica, 13ª ed." },
    ],
    hipo: "bajo", peso: "neutro", costo: 2, egfrMin: 0, contra: [] },

  { id: "CLOZA", cat: "otros", grp: "Antipsicótico Alto Riesgo Metabólico", name: "Clozapina", ini: "N/A", mant: "N/A",
    adv: "Antipsicótico 2ª gen. de alto riesgo metabólico, reservado típicamente para esquizofrenia resistente a tratamiento — mismo riesgo de ganancia de peso/dislipidemia/resistencia a la insulina. Ver Caso 50.",
    mecanismo: "Antagonista de múltiples receptores (D1-D4, 5-HT2A, H1, muscarínicos, α-adrenérgicos) — perfil de baja afinidad D2 es lo que la distingue de otros antipsicóticos.",
    vidaMediaHoras: 12, vidaMediaLabel: "~12 h (rango 8-16 h)", reduccionA1c: null,
    titr: { l: ["Uso actual"], d: [1] },
    benef: { ic: false, erc: false, ascvd: false, stroke: false, masld: false },
    mecanismoDetalle: "Antagoniza múltiples receptores simultáneamente (D1-D4 dopaminérgicos, 5-HT2A/2C serotoninérgicos, H1 histaminérgico, muscarínicos, alfa-adrenérgicos) — su perfil de BAJA afinidad D2 relativa a los otros receptores es precisamente lo que la distingue de otros antipsicóticos y explica su eficacia única en esquizofrenia resistente a tratamiento, pero el mismo perfil multirreceptor (especialmente H1 y 5-HT2C) le confiere un riesgo metabólico igual de alto que olanzapina — reservada típicamente para casos refractarios donde el beneficio psiquiátrico supera el riesgo metabólico.",
    mecanismoPasos: [
      "Antagonismo multirreceptor (D1-D4, 5-HT2A/2C, H1, muscarínicos, alfa-adrenérgicos)",
      "Baja afinidad D2 relativa — eficacia en esquizofrenia resistente",
      "Antagonismo H1/5-HT2C → ↑ apetito + resistencia a la insulina",
      "↑ Peso + dislipidemia + resistencia a la insulina — riesgo metabólico tan alto como olanzapina",
    ],
    efectosAdversos: {
      frecuentes: ["Ganancia de peso marcada", "Sedación intensa", "Sialorrea (salivación excesiva, característica de clozapina)"],
      graves: [
        "Agranulocitosis (requiere monitoreo hematológico obligatorio y registro especial — motivo por el que se reserva para casos resistentes)",
        "Diabetes de novo o descompensación",
        "Miocarditis (rara pero grave, más en las primeras semanas)",
      ],
    },
    contraindicacionesDetalle: [
      { condicion: "Antecedente de agranulocitosis con clozapina", razon: "Contraindicación absoluta a reexposición" },
      { condicion: "Recuento de neutrófilos bajo no explicado", razon: "Requiere evaluación hematológica antes de iniciar/continuar" },
    ],
    monitoreo: [
      { parametro: "Recuento absoluto de neutrófilos", frecuencia: "Semanal las primeras 6 meses, luego según protocolo de registro obligatorio — requisito NO negociable para continuar el fármaco" },
      { parametro: "Peso/IMC, glucosa, perfil lipídico", frecuencia: "Igual esquema que otros antipsicóticos de alto riesgo metabólico (basal, 12 semanas, luego periódico)" },
    ],
    educacionPaciente: {
      queEs: "Un antipsicótico reservado para casos que no responden a otros tratamientos; requiere análisis de sangre frecuentes por seguridad, además de vigilancia del peso y el azúcar.",
      comoTomarlo: "Según indicación del psiquiatra, con análisis de sangre programados obligatorios.",
      siOlvidaDosis: "Consultar con su médico — no duplicar dosis.",
      senalesAlarma: [
        "Fiebre, dolor de garganta o infección que no mejora (posible alteración de las defensas — buscar atención inmediata)",
        "Sed excesiva o cansancio extremo (posible azúcar alta)",
        "IMPORTANTE: no faltar a los análisis de sangre programados — son obligatorios para seguir tomando este medicamento con seguridad",
      ],
    },
    fuentes: [
      { texto: "Consenso ADA/APA/AACE/NAASO 2004" },
      { texto: "Goodman & Gilman — Bases Farmacológicas de la Terapéutica, 13ª ed." },
    ],
    hipo: "bajo", peso: "neutro", costo: 2, egfrMin: 0, contra: [] },

  { id: "RITON", cat: "otros", grp: "TARV Potenciado", name: "Ritonavir (potenciador)", ini: "N/A", mant: "N/A",
    adv: "Usado casi siempre en dosis bajas como POTENCIADOR farmacocinético de otro inhibidor de proteasa (ej. Darunavir/r, Atazanavir/r), no como antirretroviral principal. Inhibidor potente de CYP3A4 — ver Caso 54 (Simvastatina contraindicada; Atorvastatina deprioritada).",
    mecanismo: "Inhibidor potente de CYP3A4 (y de la glicoproteína-P) — eleva marcadamente los niveles plasmáticos de fármacos metabolizados por esa vía, incluidas varias estatinas.",
    vidaMediaHoras: 4, vidaMediaLabel: "~3-5 h", reduccionA1c: null,
    titr: { l: ["Uso actual"], d: [1] },
    benef: { ic: false, erc: false, ascvd: false, stroke: false, masld: false },
    mecanismoDetalle: "A dosis bajas (100 mg), su función clínica NO es antirretroviral directa sino como POTENCIADOR FARMACOCINÉTICO: inhibe potente e irreversiblemente el CYP3A4 intestinal y hepático (y en menor medida la glicoproteína-P), lo que bloquea el metabolismo de primer paso de otro inhibidor de proteasa co-administrado (p. ej. darunavir/r, atazanavir/r), elevando y prolongando sus niveles plasmáticos para permitir dosificación menos frecuente. Este mismo bloqueo de CYP3A4 eleva DRAMÁTICAMENTE los niveles de cualquier otro fármaco metabolizado por esa vía — incluidas simvastatina/lovastatina (contraindicación absoluta por riesgo de rabdomiólisis) y, en menor grado, atorvastatina (requiere reducir dosis).",
    mecanismoPasos: [
      "Inhibición potente e irreversible del CYP3A4 intestinal y hepático",
      "Bloquea el metabolismo de primer paso del inhibidor de proteasa acompañante",
      "↑↑ Niveles plasmáticos de CUALQUIER fármaco metabolizado por CYP3A4",
      "Riesgo crítico con estatinas: simvastatina/lovastatina contraindicadas; atorvastatina requiere reducir dosis",
    ],
    efectosAdversos: {
      frecuentes: ["Náusea, diarrea", "Alteración del gusto"],
      graves: ["Interacciones farmacológicas graves por inhibición de CYP3A4 (rabdomiólisis con estatinas contraindicadas, sedación excesiva con benzodiacepinas, etc.)"],
    },
    contraindicacionesDetalle: [
      { condicion: "Uso concomitante de simvastatina o lovastatina", razon: "Elevación masiva de niveles — riesgo alto de rabdomiólisis, contraindicación absoluta" },
      { condicion: "Cualquier fármaco nuevo metabolizado por CYP3A4", razon: "Revisar SIEMPRE interacciones antes de agregar cualquier medicamento" },
    ],
    monitoreo: [
      { parametro: "Revisión de TODA la medicación concomitante en cada consulta", frecuencia: "Obligatorio — el riesgo de interacción es la consideración clínica más importante de este fármaco" },
      { parametro: "Si requiere estatina: usar atorvastatina a dosis reducida o pitavastatina/pravastatina (menor interacción)", frecuencia: "Al momento de indicar cualquier estatina" },
    ],
    educacionPaciente: {
      queEs: "Un medicamento que potencia a otro medicamento del tratamiento contra el VIH; interactúa con muchos otros medicamentos, incluidas algunas pastillas para el colesterol.",
      comoTomarlo: "Según indicación del especialista en VIH.",
      siOlvidaDosis: "Consultar con su médico — no duplicar dosis.",
      senalesAlarma: [
        "Dolor muscular importante si toma alguna pastilla para el colesterol",
        "IMPORTANTE: avisar SIEMPRE a cualquier médico que le recete algo nuevo que usted toma este medicamento",
      ],
    },
    fuentes: [
      { texto: "Goodman & Gilman — Bases Farmacológicas de la Terapéutica, 13ª ed." },
      { texto: "FDA Prescribing Information — Ritonavir" },
    ],
    hipo: "bajo", peso: "neutro", costo: 2, egfrMin: 0, contra: [] },

  { id: "COBI", cat: "otros", grp: "TARV Potenciado", name: "Cobicistat (potenciador)", ini: "N/A", mant: "N/A",
    adv: "Potenciador farmacocinético sin actividad antirretroviral propia (a diferencia de ritonavir) — se usa junto a un inhibidor de proteasa o integrasa. Mismo riesgo de interacción CYP3A4 que ritonavir — ver Caso 54.",
    mecanismo: "Inhibidor potente y selectivo de CYP3A4, sin actividad antirretroviral — eleva marcadamente los niveles plasmáticos de fármacos metabolizados por esa vía, incluidas varias estatinas.",
    vidaMediaHoras: 3.5, vidaMediaLabel: "~3-4 h", reduccionA1c: null,
    titr: { l: ["Uso actual"], d: [1] },
    benef: { ic: false, erc: false, ascvd: false, stroke: false, masld: false },
    mecanismoDetalle: "Inhibidor potente y SELECTIVO del CYP3A4, diseñado específicamente como potenciador farmacocinético SIN actividad antirretroviral propia (a diferencia de ritonavir, que sí tiene actividad anti-VIH residual). Se usa junto a un inhibidor de proteasa o de integrasa para elevar y prolongar sus niveles plasmáticos. Comparte el mismo riesgo crítico de interacción por CYP3A4 que ritonavir — incluidas las mismas contraindicaciones con simvastatina/lovastatina.",
    mecanismoPasos: [
      "Inhibición potente y selectiva del CYP3A4 (sin actividad antirretroviral propia)",
      "Bloquea el metabolismo de primer paso del antirretroviral acompañante",
      "↑↑ Niveles plasmáticos de fármacos metabolizados por CYP3A4",
      "Mismo riesgo crítico con estatinas que ritonavir",
    ],
    efectosAdversos: {
      frecuentes: ["Náusea", "↑ Creatinina (inhibe su secreción tubular, sin daño renal verdadero, pero puede confundir la interpretación del eGFR)"],
      graves: ["Interacciones farmacológicas graves por inhibición de CYP3A4"],
    },
    contraindicacionesDetalle: [
      { condicion: "Uso concomitante de simvastatina o lovastatina", razon: "Riesgo alto de rabdomiólisis, contraindicación absoluta" },
      { condicion: "Cualquier fármaco nuevo metabolizado por CYP3A4", razon: "Revisar SIEMPRE interacciones antes de agregar cualquier medicamento" },
    ],
    monitoreo: [
      { parametro: "Revisión de TODA la medicación concomitante en cada consulta", frecuencia: "Obligatorio" },
      { parametro: "Interpretar el eGFR con cautela", frecuencia: "El fármaco eleva la creatinina sin reflejar daño renal real — no confundir con progresión de ERC" },
    ],
    educacionPaciente: {
      queEs: "Un medicamento que potencia a otro medicamento del tratamiento contra el VIH; interactúa con muchos otros medicamentos, incluidas algunas pastillas para el colesterol.",
      comoTomarlo: "Según indicación del especialista en VIH.",
      siOlvidaDosis: "Consultar con su médico — no duplicar dosis.",
      senalesAlarma: [
        "Dolor muscular importante si toma alguna pastilla para el colesterol",
        "IMPORTANTE: avisar SIEMPRE a cualquier médico que le recete algo nuevo que usted toma este medicamento",
      ],
    },
    fuentes: [
      { texto: "FDA Prescribing Information — Cobicistat" },
    ],
    hipo: "bajo", peso: "neutro", costo: 2, egfrMin: 0, contra: [] },
];
