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
    const { tabla, barrerDuplicados } = body;

    if (!tabla || typeof tabla !== 'string') {
      return Response.json({ error: "Falta 'tabla'" }, { status: 400 });
    }

    // Barrido de duplicados historicos.
    //
    // La auto-reparacion de mas abajo solo mira la lectura que acaba de
    // guardar, asi que no puede alcanzar a los duplicados que ya estaban en
    // la base de antes (se contaron al menos 9 pares el 6/sep/2026). Este
    // barrido los limpia; lo pide TelemetriaProvider una sola vez al arrancar
    // la sesion, no en cada pasada, porque recorre todo el historico de la
    // tabla y no hay razon para repetirlo cada minuto.
    let barridos = 0;
    if (barrerDuplicados) {
      try {
        let todas;
        try {
          todas = await base44.asServiceRole.entities.LecturaHistorica.filter(
            { tabla_bd_externa: tabla }, '-created_date', 1000
          );
        } catch {
          // Si esta version del SDK no acepta orden/limite, se pide sin ellos.
          todas = await base44.asServiceRole.entities.LecturaHistorica.filter({ tabla_bd_externa: tabla });
        }
        const porLectura = new Map();
        for (const r of todas || []) {
          if (r.lectura === null || r.lectura === undefined) continue;
          const g = porLectura.get(r.lectura) || [];
          g.push(r);
          porLectura.set(r.lectura, g);
        }
        for (const grupo of porLectura.values()) {
          if (grupo.length < 2) continue;
          // Mismo criterio estable que la auto-reparacion: gana la mas antigua.
          const clave = (r) => `${r.created_date || ''}|${r.id}`;
          const ordenadas = [...grupo].sort((a, b) => clave(a).localeCompare(clave(b)));
          for (const sobrante of ordenadas.slice(1)) {
            await base44.asServiceRole.entities.LecturaHistorica.delete(sobrante.id);
            barridos++;
          }
        }
      } catch {
        // Que falle el barrido no debe impedir archivar la lectura nueva.
      }
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
      return Response.json({ estado: 'ok', guardado: false, lectura: ultimaLectura, barridos });
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

    // Auto-reparacion contra la carrera.
    //
    // El `filter` de mas arriba comprueba y esta `create` escribe: entre las
    // dos cosas cabe otra llamada. No es teorico. El 6/sep/2026 se encontro
    // en la base la lectura 12425 guardada DOS veces, con 78 ms entre ambos
    // registros, y al menos 9 pares duplicados entre 379 historicos.
    //
    // La causa principal ya se corrigio del lado del cliente: hoy solo
    // TelemetriaProvider archiva, y recorre las tablas en serie. Pero dos
    // navegadores distintos con la app abierta siguen pudiendo chocar, y eso
    // no se arregla desde el cliente. Asi que despues de escribir se revisa
    // y se deja una sola fila.
    //
    // Se conserva la MAS ANTIGUA: es un criterio estable, todos los que
    // corran esta limpieza eligen la misma, asi que dos limpiezas simultaneas
    // no se borran la fila una a la otra.
    //
    // El borrado es sobre LecturaHistorica, entidad NUESTRA de Base44 — nunca
    // sobre la base del medidor. El servidor real sigue siendo de solo
    // lectura desde aqui, como quedo establecido tras el incidente de borrado.
    let duplicadosBorrados = 0;
    try {
      const todas = await base44.asServiceRole.entities.LecturaHistorica.filter({
        tabla_bd_externa: tabla,
        lectura: ultimaLectura,
      });
      if (todas.length > 1) {
        const clave = (r) => `${r.created_date || ''}|${r.id}`;
        const ordenadas = [...todas].sort((a, b) => clave(a).localeCompare(clave(b)));
        for (const sobrante of ordenadas.slice(1)) {
          await base44.asServiceRole.entities.LecturaHistorica.delete(sobrante.id);
          duplicadosBorrados++;
        }
      }
    } catch {
      // Si la limpieza falla no se pierde nada: el snapshot ya quedo
      // guardado. Solo sobrevive un duplicado, que la siguiente pasada
      // volvera a intentar limpiar.
    }

    return Response.json({
      estado: 'ok', guardado: true, id: nuevo.id, lectura: ultimaLectura, duplicadosBorrados, barridos,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
