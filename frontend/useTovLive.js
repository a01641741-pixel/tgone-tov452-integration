import { useState, useEffect, useRef, useCallback } from 'react';
import { base44 } from '@/api/base44Client';

// Escala los campos crudos del TOV452 a unidades reales.
// ⚠️ Escalas basadas en inspección de valores en reposo (sin carga real) —
// hay que confirmar con una lectura bajo carga antes de confiar en ellas
// para una demo con inversionistas/clientes.
const HISTORY_LEN = 30;

function scaleRecord(raw) {
  if (!raw) return null;
  return {
    lectura: raw.Lectura,
    fecha: raw.fecha,
    frequency: raw.Frequency != null ? raw.Frequency / 100 : null,
    v1: raw.VFase1 != null ? raw.VFase1 / 10 : null,
    v2: raw.VFase2 != null ? raw.VFase2 / 10 : null,
    v3: raw.VFase3 != null ? raw.VFase3 / 10 : null,
    i1: raw.IFase1 != null ? raw.IFase1 / 10 : null,
    i2: raw.IFase2 != null ? raw.IFase2 / 10 : null,
    i3: raw.IFase3 != null ? raw.IFase3 / 10 : null,
    pf1: raw.PF1 != null ? raw.PF1 / 1000 : null,
    pf2: raw.PF2 != null ? raw.PF2 / 1000 : null,
    pf3: raw.PF3 != null ? raw.PF3 / 1000 : null,
    thdV: raw.THD_V != null ? raw.THD_V / 10 : null,
    thdI: raw.THD_I != null ? raw.THD_I / 10 : null,
    kWh: raw.kWh,
    rssi: raw.rssi,
    raw,
  };
}

/**
 * Consume telemetría real vía la función Base44 `tovLive`.
 * Mientras esa función tenga DISABLED=true, esto simplemente reporta
 * status: 'no_disponible' y el llamador debe caer de vuelta a datos
 * simulados (ver useRealtimeMonitor).
 */
export function useTovLive(tabla, { intervalMs = 20000 } = {}) {
  const [reading, setReading] = useState(null);
  const [history, setHistory] = useState([]);
  const [status, setStatus] = useState('conectando'); // conectando | en_vivo | sin_datos | no_disponible | error
  const [lastUpdate, setLastUpdate] = useState(null);
  const lecturaRef = useRef(null);

  const callFn = useCallback(async (payload) => {
    const res = await base44.functions.invoke('tovLive', payload);
    return res?.data ?? res;
  }, []);

  useEffect(() => {
    if (!tabla) return;
    let cancelled = false;
    let timer;

    async function bootstrap() {
      try {
        const res = await callFn({ tabla, action: 'bootstrap' });
        if (cancelled) return;
        if (res.error) { setStatus('no_disponible'); return; }
        if (res.datos) {
          const scaled = scaleRecord(res.datos);
          setReading(scaled);
          setHistory([scaled]);
          lecturaRef.current = res.ultima_lectura;
          setStatus('en_vivo');
          setLastUpdate(new Date());
          timer = setTimeout(poll, intervalMs);
        } else {
          setStatus('sin_datos');
        }
      } catch {
        if (!cancelled) setStatus('error');
      }
    }

    async function poll() {
      try {
        const res = await callFn({ tabla, action: 'next', lectura: lecturaRef.current });
        if (cancelled) return;
        if (res.estado === 'nuevo' && Array.isArray(res.datos) && res.datos.length) {
          const scaledNew = res.datos.map(scaleRecord);
          setReading(scaledNew[scaledNew.length - 1]);
          setHistory(prev => [...prev, ...scaledNew].slice(-HISTORY_LEN));
          lecturaRef.current = res.ultima_lectura;
          setLastUpdate(new Date());
        }
        setStatus('en_vivo');
      } catch {
        if (!cancelled) setStatus('error');
      }
      if (!cancelled) timer = setTimeout(poll, intervalMs);
    }

    bootstrap();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [tabla, intervalMs, callFn]);

  return { reading, history, status, lastUpdate };
}
