// Semáforo único de "salud" para TG One: normal (verde) / revisar (amarillo)
// / alerta (rojo). No inventa umbrales nuevos — reutiliza exactamente los
// mismos rangos que ya se dibujan en los medidores analógicos reales de
// TotalView.jsx (VOLT_ZONES 114-127V, zonas de frecuencia 59.5-60.5Hz y
// factor de potencia 0.90/0.95) y los mismos "bien"/"mal" de THD que ya usa
// src/lib/riesgoPredictivo.js (IEEE 519 / NEMA MG1). Un solo lugar para que
// todas las pantallas cuenten la misma historia con los mismos números.

const VOLT_MIN = 114;
const VOLT_MAX = 127;
const FREQ_NORMAL_MIN = 59.5;
const FREQ_NORMAL_MAX = 60.5;
const FREQ_ALERTA_MIN = 55;
const FREQ_ALERTA_MAX = 65;
const PF_ALERTA = 0.90;
const PF_REVISAR = 0.95;
// Mismos "bien"/"mal" que riesgoPredictivo.js para THD-V y THD-I.
const THD_V_BIEN = 3, THD_V_MAL = 10;
const THD_I_BIEN = 5, THD_I_MAL = 20;

function peor(a, b) {
  const orden = { normal: 0, revisar: 1, alerta: 2 };
  return orden[a] >= orden[b] ? a : b;
}

/**
 * Evalúa una lectura ya escalada (ver escalarRegistro en useMedicionesReales)
 * contra los rangos reales de operación normal.
 * @returns {{estado: 'normal'|'revisar'|'alerta'|'sin_datos', motivos: Array<{campo:string, mensaje:string}>}}
 */
export function evaluarLectura(reading) {
  if (!reading) return { estado: 'sin_datos', motivos: [] };

  const motivos = [];
  let estado = 'normal';

  [['Fase 1', reading.v1], ['Fase 2', reading.v2], ['Fase 3', reading.v3]].forEach(([nombre, v]) => {
    if (typeof v !== 'number') return;
    if (v < VOLT_MIN || v > VOLT_MAX) {
      motivos.push({ campo: `Voltaje ${nombre}`, mensaje: `Voltaje ${nombre} fuera de rango normal (114–127V): ${v.toFixed(1)}V` });
      estado = peor(estado, 'alerta');
    }
  });

  if (typeof reading.frequency === 'number') {
    const f = reading.frequency;
    if (f < FREQ_ALERTA_MIN || f > FREQ_ALERTA_MAX) {
      motivos.push({ campo: 'Frecuencia', mensaje: `Frecuencia fuera de rango seguro: ${f.toFixed(2)}Hz` });
      estado = peor(estado, 'alerta');
    } else if (f < FREQ_NORMAL_MIN || f > FREQ_NORMAL_MAX) {
      motivos.push({ campo: 'Frecuencia', mensaje: `Frecuencia fuera del rango normal (59.5–60.5Hz): ${f.toFixed(2)}Hz` });
      estado = peor(estado, 'revisar');
    }
  }

  [['Fase 1', reading.pf1], ['Fase 2', reading.pf2], ['Fase 3', reading.pf3]].forEach(([nombre, pf]) => {
    if (typeof pf !== 'number') return;
    if (pf < PF_ALERTA) {
      motivos.push({ campo: `Factor de potencia ${nombre}`, mensaje: `Factor de potencia ${nombre} bajo: ${pf.toFixed(2)}` });
      estado = peor(estado, 'alerta');
    } else if (pf < PF_REVISAR) {
      motivos.push({ campo: `Factor de potencia ${nombre}`, mensaje: `Factor de potencia ${nombre} conviene revisarlo: ${pf.toFixed(2)}` });
      estado = peor(estado, 'revisar');
    }
  });

  const thdV = [reading.thdV1, reading.thdV2, reading.thdV3].filter((n) => typeof n === 'number');
  const thdVMax = thdV.length ? Math.max(...thdV) : null;
  if (thdVMax != null) {
    if (thdVMax > THD_V_MAL) { motivos.push({ campo: 'Armónicos de voltaje (THD-V)', mensaje: `Distorsión armónica de voltaje alta: ${thdVMax.toFixed(1)}%` }); estado = peor(estado, 'alerta'); }
    else if (thdVMax > THD_V_BIEN) { motivos.push({ campo: 'Armónicos de voltaje (THD-V)', mensaje: `Distorsión armónica de voltaje conviene revisarla: ${thdVMax.toFixed(1)}%` }); estado = peor(estado, 'revisar'); }
  }

  const thdI = [reading.thdI1, reading.thdI2, reading.thdI3].filter((n) => typeof n === 'number');
  const thdIMax = thdI.length ? Math.max(...thdI) : null;
  if (thdIMax != null) {
    if (thdIMax > THD_I_MAL) { motivos.push({ campo: 'Armónicos de corriente (THD-I)', mensaje: `Distorsión armónica de corriente alta: ${thdIMax.toFixed(1)}%` }); estado = peor(estado, 'alerta'); }
    else if (thdIMax > THD_I_BIEN) { motivos.push({ campo: 'Armónicos de corriente (THD-I)', mensaje: `Distorsión armónica de corriente conviene revisarla: ${thdIMax.toFixed(1)}%` }); estado = peor(estado, 'revisar'); }
  }

  return { estado, motivos };
}

/**
 * Evalúa el estado general de la operación (para Inicio), reusando las
 * mismas reglas reales que ya calculan Home.jsx y monitorStatus.js — no
 * inventa criterios nuevos, solo los traduce al mismo semáforo de 3 estados.
 * @param {{monitorStatuses?: Record<string,string>, dispositivosOffline?: number, ticketsCriticos?: number}} datos
 */
export function evaluarSistema({ monitorStatuses = {}, dispositivosOffline = 0, ticketsCriticos = 0 } = {}) {
  const motivos = [];
  let estado = 'normal';

  if (dispositivosOffline > 0) {
    motivos.push({ campo: 'Dispositivos', mensaje: `${dispositivosOffline} dispositivo${dispositivosOffline === 1 ? '' : 's'} con falla o inactivo${dispositivosOffline === 1 ? '' : 's'}` });
    estado = peor(estado, 'alerta');
  }
  if (ticketsCriticos > 0) {
    motivos.push({ campo: 'Tickets', mensaje: `${ticketsCriticos} ticket${ticketsCriticos === 1 ? '' : 's'} crítico${ticketsCriticos === 1 ? '' : 's'} sin resolver` });
    estado = peor(estado, 'alerta');
  }
  Object.entries(monitorStatuses).forEach(([, valor]) => {
    if (valor === 'red') estado = peor(estado, 'alerta');
    else if (valor === 'amber') estado = peor(estado, 'revisar');
  });

  return { estado, motivos };
}
