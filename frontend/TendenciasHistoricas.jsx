import React, { useEffect, useMemo, useState } from 'react';
import { History, Info } from 'lucide-react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts';
import { Card } from '@/components/ui/card';
import { fetchList } from '@/lib/guest';
import { escalarRegistro } from '@/hooks/useMedicionesReales';

const RANGOS = [
  { key: '24h', label: '24 h', ms: 24 * 60 * 60 * 1000 },
  { key: '7d', label: '7 días', ms: 7 * 24 * 60 * 60 * 1000 },
  { key: 'todo', label: 'Todo', ms: Infinity },
];

function avg(nums) {
  const vals = nums.filter((n) => typeof n === 'number');
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

function StatMinAvgMax({ label, unit, min, avgVal, max, decimals = 1 }) {
  const fmt = (v) => (typeof v === 'number' ? v.toFixed(decimals) : '—');
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">{label}</p>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div><p className="text-[10px] text-muted-foreground">Mín</p><p className="font-mono font-semibold text-sm">{fmt(min)}</p></div>
        <div><p className="text-[10px] text-muted-foreground">Prom</p><p className="font-mono font-semibold text-sm">{fmt(avgVal)}</p></div>
        <div><p className="text-[10px] text-muted-foreground">Máx</p><p className="font-mono font-semibold text-sm">{fmt(max)}</p></div>
      </div>
      <p className="text-[9px] text-muted-foreground text-center mt-1">{unit}</p>
    </div>
  );
}

// Tendencias reales persistentes: a diferencia de "Curvas en tiempo real"
// (que solo cubre lo acumulado desde que se abrió la página), esto lee de
// LecturaHistorica — snapshots reales guardados con el tiempo (sembrados con
// un backfill inicial real desde la tabla externa, y alimentados hacia
// adelante por guardarLecturaHistorica cada vez que hay una lectura real
// nueva). Nunca inventa puntos: si hay huecos reales sin lectura, el
// historial simplemente los refleja como huecos.
export default function TendenciasHistoricas({ tabla }) {
  const [registros, setRegistros] = useState(null);
  const [rango, setRango] = useState('7d');

  useEffect(() => {
    (async () => {
      try {
        const lista = await fetchList('LecturaHistorica');
        const delDispositivo = (lista || [])
          .filter((r) => r.tabla_bd_externa === tabla && r.fecha)
          .map((r) => ({ raw: r, fechaObj: new Date(r.fecha), ...escalarRegistro(r) }))
          .filter((r) => !Number.isNaN(r.fechaObj.getTime()))
          .sort((a, b) => a.fechaObj - b.fechaObj);
        setRegistros(delDispositivo);
      } catch {
        setRegistros([]);
      }
    })();
  }, [tabla]);

  const rangoActivo = RANGOS.find((r) => r.key === rango) || RANGOS[1];

  const filtrados = useMemo(() => {
    if (!registros) return [];
    if (rangoActivo.ms === Infinity) return registros;
    const corte = Date.now() - rangoActivo.ms;
    return registros.filter((r) => r.fechaObj.getTime() >= corte);
  }, [registros, rangoActivo]);

  const chartData = filtrados.map((r, idx) => ({
    idx,
    fechaLabel: r.fechaObj.toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }),
    voltajeProm: avg([r.v1, r.v2, r.v3]),
    frequency: r.frequency,
  }));

  const voltajesTodos = filtrados.map((r) => avg([r.v1, r.v2, r.v3]));
  const frecuencias = filtrados.map((r) => r.frequency);
  const corrientesTodas = filtrados.map((r) => [r.i1, r.i2, r.i3].filter((n) => typeof n === 'number').reduce((a, b) => a + b, 0));

  const min = (arr) => (arr.filter((n) => typeof n === 'number').length ? Math.min(...arr.filter((n) => typeof n === 'number')) : null);
  const max = (arr) => (arr.filter((n) => typeof n === 'number').length ? Math.max(...arr.filter((n) => typeof n === 'number')) : null);

  const primerFecha = filtrados[0]?.fechaObj;
  const ultimaFecha = filtrados[filtrados.length - 1]?.fechaObj;

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-3 mb-1 flex-wrap">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Tendencias históricas reales</h2>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
          {RANGOS.map((r) => (
            <button
              key={r.key}
              onClick={() => setRango(r.key)}
              className={`text-xs px-2.5 py-1 rounded-md transition-colors ${rango === r.key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-start gap-1.5 text-[11px] text-muted-foreground mb-4">
        <Info className="h-3 w-3 shrink-0 mt-0.5" />
        <span>
          Lecturas reales del TOV452 guardadas con el tiempo — {filtrados.length} en este rango
          {primerFecha && ultimaFecha ? ` (de ${primerFecha.toLocaleDateString('es-MX')} a ${ultimaFecha.toLocaleDateString('es-MX')})` : ''}.
          No es monitoreo continuo 24/7: solo se guarda una lectura cuando alguien tiene la app abierta (o del respaldo inicial), así que puede haber huecos reales.
        </span>
      </div>

      {registros === null ? (
        <p className="text-xs text-muted-foreground py-6 text-center">Cargando historial real…</p>
      ) : filtrados.length === 0 ? (
        <p className="text-xs text-muted-foreground py-6 text-center">Sin lecturas históricas guardadas en este rango todavía.</p>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            <StatMinAvgMax label="Voltaje promedio (V)" unit="Volts" min={min(voltajesTodos)} avgVal={avg(voltajesTodos)} max={max(voltajesTodos)} decimals={1} />
            <StatMinAvgMax label="Frecuencia (Hz)" unit="Hertz" min={min(frecuencias)} avgVal={avg(frecuencias)} max={max(frecuencias)} decimals={2} />
            <StatMinAvgMax label="Corriente total (A)" unit="Amperes" min={min(corrientesTodas)} avgVal={avg(corrientesTodas)} max={max(corrientesTodas)} decimals={2} />
          </div>

          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                <XAxis dataKey="fechaLabel" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
                <YAxis yAxisId="v" tick={{ fontSize: 10 }} width={36} domain={['auto', 'auto']} />
                <YAxis yAxisId="hz" orientation="right" tick={{ fontSize: 10 }} width={36} domain={['auto', 'auto']} />
                <Tooltip contentStyle={{ fontSize: 11 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line yAxisId="v" type="monotone" dataKey="voltajeProm" name="Voltaje prom. (V)" stroke="#f59e0b" strokeWidth={2} dot={{ r: 2 }} isAnimationActive={false} connectNulls />
                <Line yAxisId="hz" type="monotone" dataKey="frequency" name="Frecuencia (Hz)" stroke="hsl(var(--success))" strokeWidth={2} dot={{ r: 2 }} isAnimationActive={false} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </Card>
  );
}
