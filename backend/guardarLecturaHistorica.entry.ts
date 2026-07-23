import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

// ============================================================================
// Persiste snapshots reales de telemetría en la entidad LecturaHistorica,
// para tener tendencias históricas genuinas más allá de lo que guarda en
// vivo la tabla externa (que solo se puede leer por su cola reciente).
//
// A propósito esta función NUNCA confía en valores que mande el cliente —
// solo recibe { tabla } y ella misma vuelve a consultar la fuente real
// (el mismo contrato de solo lectura que usa medicionesReales) antes de
// guardar. Así nadie puede forjar datos "históricos" falsos llamando a
// esta función con un payload arbitrario.
//
// Se llama en segundo plano (fire-and-forget) desde useMedicionesReales.js
// cada vez que detecta una lectura real genuinamente nueva. No bloquea la
// UI ni reintenta — si falla, simplemente no se guarda ese snapshot y ya.
// ============================================================================

const DB_HOST_URL = 'http://monitor02.redirectme.net:3030/tgcommdev/dbcommapi0099.php';

const DB_CONFIG = {
  servidor: 'localhost',
  base_de_datos: 'tgv_dev',
  usuario: 'root',
  password: 'root',
  token: 'Tg#10982278ia123',
};

const CAMPOS = [
  'Frequency', 'VFase1', 'VFase2', 'VFase3', 'IFase1', 'IFase2', 'IFase3',
  'PF1', 'PF2', 'PF3', 'THD_VST1', 'THD_VST2', 'THD_VST3',
  'THD_IST1', 'THD_IST2', 'THD_IST3', 'kWh', 'rssi',
];

async function callDb(body) {
  const res = await fetch(DB_HOST_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { error: text || `Respuesta no-JSON (status ${res.status})` };
  }
}

async function consultarTabla(tabla, condiciones, displayfields) {
  const body = { ...DB_CONFIG, action: 'get', tabla };
  if (displayfields && displayfields.length) body.displayfields = displayfields;
  if (condiciones) body.condiciones = condiciones;
  return callDb(body);
}

function filasDe(respuesta) {
  return respuesta.datos || respuesta.data || respuesta.resultado || [];
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const { tabla } = body;

    if (!tabla || typeof tabla !== 'string') {
      return Response.json({ error: "Falta 'tabla'" }, { status: 400 });
    }

    // 1) ¿Cuál es la lectura real más reciente ahora mismo?
    const idsRes = await consultarTabla(tabla, undefined, ['lectura']);
    if (idsRes.error) return Response.json({ error: idsRes.error }, { status: 502 });
    const valores = filasDe(idsRes)
      .map((r) => r.lectura ?? r.Lectura)
      .filter((v) => typeof v === 'number');
    if (!valores.length) return Response.json({ estado: 'vacio' });
    const ultimaLectura = Math.max(...valores);

    // 2) ¿Ya la teníamos guardada? (dedup por tabla + lectura)
    const existentes = await base44.asServiceRole.entities.LecturaHistorica.filter({
      tabla_bd_externa: tabla,
      lectura: ultimaLectura,
    });
    if (existentes.length) {
      return Response.json({ estado: 'ok', guardado: false, lectura: ultimaLectura });
    }

    // 3) Traemos el detalle completo real y lo guardamos tal cual (crudo,
    //    sin escalar — la escala se aplica igual que en useMedicionesReales
    //    al momento de leer, para que ambas rutas compartan una sola fuente
    //    de verdad sobre las escalas).
    const full = await consultarTabla(tabla, { lectura: ultimaLectura }, ['lectura', 'fecha', ...CAMPOS]);
    if (full.error) return Response.json({ error: full.error }, { status: 502 });
    const registro = filasDe(full)[0];
    if (!registro) return Response.json({ estado: 'vacio' });

    // Dispositivo dueño de esta tabla (referencia denormalizada; no es
    // obligatorio que exista para poder guardar el snapshot).
    let dispositivoId = null;
    try {
      const disps = await base44.asServiceRole.entities.Dispositivo.filter({ tabla_bd_externa: tabla });
      dispositivoId = disps[0]?.id || null;
    } catch { /* no bloquea el guardado si falla esta parte */ }

    const nuevo = await base44.asServiceRole.entities.LecturaHistorica.create({
      tabla_bd_externa: tabla,
      dispositivo_id: dispositivoId,
      lectura: ultimaLectura,
      fecha: registro.fecha,
      Frequency: registro.Frequency, VFase1: registro.VFase1, VFase2: registro.VFase2, VFase3: registro.VFase3,
      IFase1: registro.IFase1, IFase2: registro.IFase2, IFase3: registro.IFase3,
      PF1: registro.PF1, PF2: registro.PF2, PF3: registro.PF3,
      THD_VST1: registro.THD_VST1, THD_VST2: registro.THD_VST2, THD_VST3: registro.THD_VST3,
      THD_IST1: registro.THD_IST1, THD_IST2: registro.THD_IST2, THD_IST3: registro.THD_IST3,
      kWh: registro.kWh, rssi: registro.rssi,
    });

    return Response.json({ estado: 'ok', guardado: true, id: nuevo.id, lectura: ultimaLectura });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
