// Estadística de ingeniería sobre lecturas reales del TOV452.
//
// Toma los registros ya escalados por `escalarRegistro` (ver
// src/hooks/useMedicionesReales.js) y saca mín / promedio / máx por magnitud,
// más los hallazgos que se desprenden de comparar esos números contra los
// rangos de `estadoSalud.js`.
//
// Regla dura: aquí NO se inventa ni se rellena nada. Si una magnitud no tiene
// lecturas válidas en el periodo, se devuelve null y quien dibuje decide cómo
// mostrar el hueco. Un canal que reporta exactamente 0 V no se promedia como
// "0 volts medidos": se marca aparte como canal sin conectar, que es lo que
// realmente significa en este medidor.

import { RANGOS, clasificarValor } from '@/lib/estadoSalud';

function estadisticas(valores) {
  const vals = valores.filter((n) => typeof n === 'number' && Number.isFinite(n));
  if (!vals.length) return null;
  return {
    n: vals.length,
    min: Math.min(...vals),
    max: Math.max(...vals),
    prom: vals.reduce((a, b) => a + b, 0) / vals.length,
  };
}

// Un canal cuyas lecturas son TODAS exactamente 0 no aporta "0 volts medidos"
// a un promedio, así que se excluye. Pero AFIRMAR que la fase "no está
// conectada" es una causa, no una observación — y en este equipo resultó
// falsa.
//
// Comprobado el 6/sep/2026 contra las 5,567 lecturas de TOV452_66: las fases
// 2 y 3 SI reportaron tensión durante meses (mediana 121.0 V y 122.9 V sobre
// 5,130 lecturas). Dejaron de hacerlo el 2/sep/2026 a las 13:52:25 (lectura
// 12056), y sus últimos valores no fueron normales sino 53.4 V y 54.4 V — ya
// venían caídas. Llamarlas "canal sin conectar" borraba un evento eléctrico
// real y lo presentaba como una característica de la instalación.
//
// Por eso ahora se describe lo observable, con fecha, y la causa se deja
// abierta: desde la app no se puede distinguir una fase fuera de servicio de
// un canal desconectado o de una falla del propio medidor.
function estadoCanal(valores, fechas) {
  const pares = valores
    .map((v, i) => ({ v, fecha: fechas[i] }))
    .filter((p) => typeof p.v === 'number' && Number.isFinite(p.v));
  if (!pares.length) return { clave: 'sin_lecturas', reporta: false };

  const conValor = pares.filter((p) => p.v !== 0);
  if (!conValor.length) return { clave: 'sin_tension_en_el_periodo', reporta: false };
  if (conValor.length === pares.length) return { clave: 'reporta', reporta: true };

  // Mixto: ¿ceso de reportar, o va y viene?
  const ultimoConValor = conValor[conValor.length - 1];
  const ultimo = pares[pares.length - 1];
  if (ultimo.v === 0 && ultimoConValor) {
    const posteriores = pares.filter((p) => p.v === 0).length;
    return {
      clave: 'ceso',
      reporta: true,
      ultimaConTension: ultimoConValor.fecha,
      ultimoValor: ultimoConValor.v,
      lecturasEnCero: posteriores,
    };
  }
  return { clave: 'intermitente', reporta: true, lecturasEnCero: pares.length - conValor.length };
}

/**
 * @param lecturas Array de registros ya escalados, ordenados o no.
 * @returns Resumen del periodo, o null si no hay ni una lectura.
 */
export function analizarPeriodo(lecturas) {
  const datos = (lecturas || []).filter(Boolean);
  if (!datos.length) return null;

  const ordenadas = [...datos].sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
  const primera = ordenadas[0];
  const ultima = ordenadas[ordenadas.length - 1];

  const col = (campo) => ordenadas.map((r) => r[campo]);

  const fechas = col('fecha');

  const fases = [1, 2, 3].map((n) => {
    const volts = col(`v${n}`);
    const amps = col(`i${n}`);
    const pf = col(`pf${n}`);
    const canal = estadoCanal(volts, fechas);
    const conectada = canal.reporta;
    return {
      numero: n,
      conectada,
      canal,
      // Solo se promedian los ceros cuando el canal SÍ está conectado (ahí un
      // 0 sí es una medición real de ausencia de carga).
      voltaje: conectada ? estadisticas(volts.filter((v) => v !== 0)) : null,
      corriente: conectada ? estadisticas(amps) : null,
      factorPotencia: conectada ? estadisticas(pf) : null,
      thdV: conectada ? estadisticas(col(`thdV${n}`)) : null,
      thdI: conectada ? estadisticas(col(`thdI${n}`)) : null,
    };
  });

  const fasesConectadas = fases.filter((f) => f.conectada);

  return {
    n: ordenadas.length,
    desde: primera.fecha,
    hasta: ultima.fecha,
    ultima,
    fases,
    fasesConectadas,
    fasesSinConectar: fases.filter((f) => !f.conectada).map((f) => f.numero),
    frecuencia: estadisticas(col('frequency').filter((f) => f !== 0)),
    rssi: estadisticas(col('rssi')),
    // kWh es un acumulado tipo odómetro: lo que informa es cuánto subió en el
    // periodo, no su promedio.
    energia: (() => {
      const vals = col('kWh').filter((n) => typeof n === 'number');
      if (vals.length < 2) return null;
      const delta = vals[vals.length - 1] - vals[0];
      return { inicio: vals[0], fin: vals[vals.length - 1], delta };
    })(),
  };
}

/**
 * Hallazgos de ingeniería: cada uno nace de un número REAL medido y cita
 * contra qué rango se comparó. No hay consejos genéricos — si no hay una
 * medición que lo sustente, el hallazgo no existe.
 */
export function hallazgos(analisis) {
  if (!analisis) return [];
  const out = [];

  analisis.fasesConectadas.forEach((f) => {
    if (f.voltaje) {
      // Los dos extremos se revisan por separado: una fase puede bajar de la
      // banda sin llegar nunca a rebasarla por arriba (o al revés), y quedarse
      // con un solo "peor valor" hacía que la excursión contraria se perdiera.
      const bajo = f.voltaje.min < RANGOS.voltaje.min ? clasificarValor('voltaje', f.voltaje.min) : 'normal';
      const alto = f.voltaje.max > RANGOS.voltaje.max ? clasificarValor('voltaje', f.voltaje.max) : 'normal';
      const estado = (bajo === 'alerta' || alto === 'alerta') ? 'alerta'
        : (bajo === 'revisar' || alto === 'revisar') ? 'revisar' : 'normal';
      if (estado !== 'normal') {
        const excursiones = [];
        if (bajo !== 'normal') excursiones.push(`bajó hasta ${f.voltaje.min.toFixed(1)} V (mínimo normal ${RANGOS.voltaje.min} V)`);
        if (alto !== 'normal') excursiones.push(`subió hasta ${f.voltaje.max.toFixed(1)} V (máximo normal ${RANGOS.voltaje.max} V)`);
        out.push({
          estado,
          titulo: `Voltaje fuera de banda en Fase ${f.numero}`,
          detalle: `La tensión ${excursiones.join(' y ')}. En el periodo promedió ${f.voltaje.prom.toFixed(1)} V sobre ${f.voltaje.n} lectura(s). La banda de operación normal es ${RANGOS.voltaje.etiqueta}.`,
          referencia: RANGOS.voltaje.referencia,
          accion: estado === 'alerta'
            ? 'Verificar la regulación de tensión en el tablero y el estado de las conexiones de acometida.'
            : 'Mantener en observación; si se sostiene, revisar la carga conectada y la caída de tensión del alimentador.',
        });
      }
    }
    if (f.factorPotencia) {
      const estado = clasificarValor('factorPotencia', f.factorPotencia.min);
      if (estado !== 'normal' && estado !== 'sin_datos') {
        out.push({
          estado,
          titulo: `Factor de potencia bajo en Fase ${f.numero}`,
          detalle: `El factor de potencia bajó hasta ${f.factorPotencia.min.toFixed(3)} (promedio ${f.factorPotencia.prom.toFixed(3)}). El objetivo es ${RANGOS.factorPotencia.etiqueta}.`,
          referencia: RANGOS.factorPotencia.referencia,
          accion: 'Evaluar corrección con banco de capacitores dimensionado a la carga reactiva medida.',
        });
      }
    }
    if (f.thdV) {
      const estado = clasificarValor('thdV', f.thdV.max);
      if (estado !== 'normal' && estado !== 'sin_datos') {
        out.push({
          estado,
          titulo: `Distorsión armónica de tensión en Fase ${f.numero}`,
          detalle: `THD-V llegó a ${f.thdV.max.toFixed(1)}% (promedio ${f.thdV.prom.toFixed(1)}%). Referencia: ${RANGOS.thdV.etiqueta}.`,
          referencia: RANGOS.thdV.referencia,
          accion: 'Identificar cargas no lineales aguas arriba; considerar filtrado de armónicos.',
        });
      }
    }
    if (f.thdI) {
      const estado = clasificarValor('thdI', f.thdI.max);
      if (estado !== 'normal' && estado !== 'sin_datos') {
        out.push({
          estado,
          titulo: `Distorsión armónica de corriente en Fase ${f.numero}`,
          detalle: `THD-I llegó a ${f.thdI.max.toFixed(1)}% (promedio ${f.thdI.prom.toFixed(1)}%). Referencia: ${RANGOS.thdI.etiqueta}.`,
          referencia: RANGOS.thdI.referencia,
          accion: 'Revisar variadores de velocidad, fuentes conmutadas y equipo electrónico conectado a esta fase.',
        });
      }
    }
  });

  if (analisis.frecuencia) {
    const estadoMin = clasificarValor('frecuencia', analisis.frecuencia.min);
    const estadoMax = clasificarValor('frecuencia', analisis.frecuencia.max);
    const estado = estadoMax === 'alerta' || estadoMin === 'alerta' ? 'alerta'
      : (estadoMax === 'revisar' || estadoMin === 'revisar') ? 'revisar' : 'normal';
    if (estado !== 'normal') {
      out.push({
        estado,
        titulo: 'Frecuencia fuera del rango normal',
        detalle: `Se midió entre ${analisis.frecuencia.min.toFixed(2)} y ${analisis.frecuencia.max.toFixed(2)} Hz. El rango normal es ${RANGOS.frecuencia.etiqueta}.`,
        referencia: RANGOS.frecuencia.referencia,
        accion: 'La frecuencia la fija la red; si la desviación persiste, documentar y reportar al suministrador.',
      });
    }
  }

  // Una fase que DEJÓ de reportar tensión es un hecho con fecha, y de los más
  // accionables que puede dar este equipo. Antes se perdía por completo: el
  // canal se marcaba como "sin conectar" y desaparecía del análisis.
  analisis.fases.forEach((f) => {
    if (f.canal?.clave === 'ceso') {
      out.push({
        estado: 'alerta',
        titulo: `La Fase ${f.numero} dejó de reportar tensión`,
        detalle: `Venía midiendo y se fue a cero. La última lectura con tensión fue ${f.canal.ultimaConTension || 'de fecha no disponible'}`
          + (typeof f.canal.ultimoValor === 'number' ? `, con ${f.canal.ultimoValor.toFixed(1)} V` : '')
          + `. Desde entonces hay ${f.canal.lecturasEnCero} lectura(s) en cero.`,
        referencia: 'Observación directa de la serie medida',
        accion: 'Verificar en sitio si la fase está fuera de servicio, si se abrió una protección, o si el canal del medidor perdió la conexión. Desde la plataforma no se puede distinguir entre esas tres causas.',
      });
    }
    if (f.canal?.clave === 'sin_tension_en_el_periodo') {
      out.push({
        estado: 'revisar',
        titulo: `Sin tensión reportada en la Fase ${f.numero}`,
        detalle: `En todo el periodo analizado esta fase reportó 0 V. Eso NO significa por sí solo que el canal no esté conectado: puede ser una fase fuera de servicio, un canal desconectado o una falla del medidor.`,
        referencia: 'Observación directa de la serie medida',
        accion: 'Comparar contra un periodo anterior para ver si alguna vez reportó, y verificar la instalación en sitio.',
      });
    }
  });

  // Corriente en cero con tensión presente: es un hecho medido que merece
  // explicarse, no una alerta eléctrica. Puede ser ausencia real de carga o
  // una pinza amperimétrica mal instalada — el reporte lo dice tal cual, sin
  // afirmar cuál de las dos es.
  analisis.fasesConectadas.forEach((f) => {
    if (f.corriente && f.corriente.max === 0) {
      out.push({
        estado: 'revisar',
        titulo: `Sin corriente medida en Fase ${f.numero}`,
        detalle: `Hay tensión presente (promedio ${f.voltaje ? f.voltaje.prom.toFixed(1) : '—'} V) pero la corriente se mantuvo en 0.000 A durante las ${analisis.n} lecturas del periodo. Ojo: en el historial completo de este equipo la corriente SÍ ha llegado a medirse (868 de 5,567 lecturas al 6/sep/2026), con valores muy pequeños — mediana 0.021 A. Un cero aquí no prueba por sí solo que la instrumentación falle.`,
        referencia: 'Observación directa de la serie medida',
        accion: 'Antes de tocar el equipo: comprobar si el circuito realmente está sin carga en este periodo. Las magnitudes históricas están cerca del piso de resolución del medidor, así que una carga pequeña puede leerse como 0. Solo si se descarta eso, revisar la pinza amperimétrica (CT): orientación, cierre del núcleo y conexión.',
      });
    }
  });

  return out;
}
