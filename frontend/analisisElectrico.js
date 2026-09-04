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

// Un canal cuyas lecturas son TODAS exactamente 0 no es "0 volts medidos":
// es el patrón con el que este medidor reporta una fase que no está
// conectada (ej. un tablero monofásico monitoreado con un equipo trifásico).
// Distinguirlo evita meter ceros falsos en los promedios.
function canalConectado(valores) {
  const vals = valores.filter((n) => typeof n === 'number' && Number.isFinite(n));
  return vals.length > 0 && vals.some((v) => v !== 0);
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

  const fases = [1, 2, 3].map((n) => {
    const volts = col(`v${n}`);
    const amps = col(`i${n}`);
    const pf = col(`pf${n}`);
    const conectada = canalConectado(volts);
    return {
      numero: n,
      conectada,
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

  // Corriente en cero con tensión presente: es un hecho medido que merece
  // explicarse, no una alerta eléctrica. Puede ser ausencia real de carga o
  // una pinza amperimétrica mal instalada — el reporte lo dice tal cual, sin
  // afirmar cuál de las dos es.
  analisis.fasesConectadas.forEach((f) => {
    if (f.corriente && f.corriente.max === 0) {
      out.push({
        estado: 'revisar',
        titulo: `Sin corriente medida en Fase ${f.numero}`,
        detalle: `Hay tensión presente (promedio ${f.voltaje ? f.voltaje.prom.toFixed(1) : '—'} V) pero la corriente se mantuvo en 0.000 A durante las ${analisis.n} lecturas del periodo.`,
        referencia: 'Verificación de instrumentación',
        accion: 'Confirmar físicamente la instalación de la pinza amperimétrica (CT): orientación, cierre del núcleo y conexión al medidor. Si el circuito realmente está sin carga, no requiere acción.',
      });
    }
  });

  return out;
}
