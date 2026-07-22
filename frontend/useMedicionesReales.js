import { useState, useEffect, useCallback, useRef } from 'react';
import { base44 } from '@/api/base44Client';

const CAMPOS_COMPLETOS = [
  'Frequency', 'VFase1', 'VFase2', 'VFase3', 'IFase1', 'IFase2', 'IFase3',
  'PF1', 'PF2', 'PF3', 'THD_VST1', 'THD_VST2', 'THD_VST3',
  'THD_IST1', 'THD_IST2', 'THD_IST3', 'kWh', 'rssi', 'TOV452_ID', 'fecha',
];

const HISTORY_LEN = 30;

// Escala los campos crudos del TOV452 a unidades reales. Confirmado con una
// lectura real en producción (lectura #8375, 22/jul/2026): Frequency 5996 →
// 59.96 Hz, VFase1 1246 → 124.6 V, PF1 1000 → 1.000 — cuadra con valores
// físicos esperados. La escala de corriente (IFase1/2/3) se corrigió de ÷10
// a ÷1000 el 22/jul/2026 a petición explícita de Manuel Vega (Total Ground),
// quien confirmó que con ÷1000 el valor ya cuadra con la lectura real.
function escalarRegistro(raw) {
  if (!raw) return null;
  return {
    lectura: raw.Lectura,
    fecha: raw.fecha,
    dispositivoId: raw.TOV452_ID,
    rssi: raw.rssi,
    frequency: raw.Frequency != null ? raw.Frequency / 100 : null,
    v1: raw.VFase1 != null ? raw.VFase1 / 10 : null,
    v2: raw.VFase2 != null ? raw.VFase2 / 10 : null,
    v3: raw.VFase3 != null ? raw.VFase3 / 10 : null,
    i1: raw.IFase1 != null ? raw.IFase1 / 1000 : null,
    i2: raw.IFase2 != null ? raw.IFase2 / 1000 : null,
    i3: raw.IFase3 != null ? raw.IFase3 / 1000 : null,
    pf1: raw.PF1 != null ? raw.PF1 / 1000 : null,
    pf2: raw.PF2 != null ? raw.PF2 / 1000 : null,
    pf3: raw.PF3 != null ? raw.PF3 / 1000 : null,
    thdV1: raw.THD_VST1 != null ? raw.THD_VST1 / 10 : null,
    thdV2: raw.THD_VST2 != null ? raw.THD_VST2 / 10 : null,
    thdV3: raw.THD_VST3 != null ? raw.THD_VST3 / 10 : null,
    thdI1: raw.THD_IST1 != null ? raw.THD_IST1 / 10 : null,
    thdI2: raw.THD_IST2 != null ? raw.THD_IST2 / 10 : null,
    thdI3: raw.THD_IST3 != null ? raw.THD_IST3 / 10 : null,
    kWh: raw.kWh,
    raw,
  };
}

/**
 * Consume datos reales (no simulados) directamente de la tabla configurada
 * en el servidor de telemetría, vía la función Base44 `medicionesReales`.
 *
 * A diferencia de `useTovLive` (que sigue esperando confirmación del
 * contrato V2 con token de sesión), este hook ya usa el contrato confirmado
 * y activo — por eso los datos que regresa son mediciones reales del sitio.
 */
export function useMedicionesReales({ tabla, campos = CAMPOS_COMPLETOS, filtro = 'lectura', intervalMs = 15000 } = {}) {
  const [datos, setDatos] = useState(null);
  const [reading, setReading] = useState(null);
  const [history, setHistory] = useState([]);
  const [ultimaLectura, setUltimaLectura] = useState(null);
  const [status, setStatus] = useState('cargando'); // cargando | ok | vacio | error
  const [mensaje, setMensaje] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  const timerRef = useRef(null);
  const lecturaVistaRef = useRef(null);
  const primeraCargaRef = useRef(true);

  const consultar = useCallback(async () => {
    if (!tabla) return;
    const esPrimeraCarga = primeraCargaRef.current;
    try {
      const res = await base44.functions.invoke('medicionesReales', {
        tabla, campos, filtro, incluirHistorial: esPrimeraCarga,
      });
      const body = res?.data ?? res;
      if (body.error) {
        setStatus('error');
        setMensaje(body.error);
        return;
      }
      if (body.estado === 'vacio') {
        setStatus('vacio');
        setMensaje(body.mensaje);
        return;
      }
      const escalado = escalarRegistro(body.datos);
      setDatos(body.datos);
      setReading(escalado);
      setUltimaLectura(body.ultima_lectura);
      setStatus('ok');
      setMensaje(null);
      setLastUpdate(new Date());

      if (esPrimeraCarga && Array.isArray(body.historial) && body.historial.length) {
        // Sembramos el historial con lecturas reales ya existentes en el
        // servidor (nunca inventadas), para que la gráfica no dependa de
        // esperar a que el medidor físico mande algo nuevo desde cero.
        const historialEscalado = body.historial.map(escalarRegistro).filter(Boolean);
        setHistory(historialEscalado.slice(-HISTORY_LEN));
        lecturaVistaRef.current = body.ultima_lectura;
        primeraCargaRef.current = false;
      } else if (escalado && body.ultima_lectura !== lecturaVistaRef.current) {
        lecturaVistaRef.current = body.ultima_lectura;
        setHistory((prev) => [...prev, escalado].slice(-HISTORY_LEN));
        primeraCargaRef.current = false;
      } else {
        primeraCargaRef.current = false;
      }
    } catch (err) {
      setStatus('error');
      setMensaje(err.message);
    }
  }, [tabla, JSON.stringify(campos), filtro]);

  useEffect(() => {
    if (!tabla) return;
    consultar();
    timerRef.current = setInterval(consultar, intervalMs);
    return () => clearInterval(timerRef.current);
  }, [consultar, intervalMs, tabla]);

  return { datos, reading, history, ultimaLectura, status, mensaje, lastUpdate, refrescar: consultar };
}
