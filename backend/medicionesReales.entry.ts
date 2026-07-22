// ============================================================================
// Proxy de SOLO LECTURA hacia el servidor real de telemetría
// (monitor02.redirectme.net), usando el contrato más reciente confirmado
// el 21/jul/2026: cada llamada viaja como POST e incluye "action":"get" y un
// "token" fijo, además de las credenciales de siempre. Ya no depende del
// flujo de login/sesión que se dejó pendiente para tovLive V2 — este es más
// simple y ya está confirmado con datos reales.
//
// A propósito esta función SOLO sabe hacer lecturas (action fijo en 'get').
// No expone ninguna vía para insertar, actualizar ni borrar — eso sigue
// bloqueado tras el incidente previo, y cualquier escritura real seguirá
// pasando exclusivamente por la consola ya existente con su candado de admin.
// ============================================================================

const DB_HOST_URL = 'http://monitor02.redirectme.net:3030/tgcommdev/dbcommapi0099.php';

const DB_CONFIG = {
  servidor: 'localhost',
  base_de_datos: 'tgv_dev',
  usuario: 'root',
  password: 'root',
  token: 'Tg#10982278ia123',
};

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
    // Lectura pública: este proxy es de SOLO LECTURA (action fijo en 'get') y
    // no usa datos del usuario, por lo que se permite acceso sin autenticación
    // para que invitados y usuarios autenticados puedan ver las mediciones reales.
    const body = await req.json().catch(() => ({}));
    const { tabla, campos, filtro } = body;

    if (!tabla || typeof tabla !== 'string') {
      return Response.json({ error: "Falta 'tabla'" }, { status: 400 });
    }

    const camposDeseados = Array.isArray(campos) && campos.length ? campos : [
      'Frequency', 'VFase1', 'VFase2', 'VFase3', 'IFase1', 'IFase2', 'IFase3',
      'PF1', 'PF2', 'PF3', 'THD_VST1', 'THD_VST2', 'THD_VST3',
      'THD_IST1', 'THD_IST2', 'THD_IST3', 'kWh', 'rssi', 'TOV452_ID', 'fecha',
    ];
    const campoFiltro = filtro || 'lectura';

    // 1) Traemos solo el campo de filtro de todos los registros disponibles,
    //    para ubicar la lectura más reciente (el mayor valor).
    const idsRes = await consultarTabla(tabla, undefined, [campoFiltro]);
    if (idsRes.error) {
      return Response.json({ estado: 'error', tabla, mensaje: idsRes.error }, { status: 502 });
    }

    const filasIds = filasDe(idsRes);
    const valores = filasIds
      .map((r) => r[campoFiltro] ?? r[campoFiltro.charAt(0).toUpperCase() + campoFiltro.slice(1)])
      .filter((v) => typeof v === 'number');

    if (!valores.length) {
      return Response.json({ estado: 'vacio', tabla, mensaje: 'Sin registros para esta tabla' });
    }

    const ultimaLectura = Math.max(...valores);

    // 2) Con esa lectura máxima, pedimos los campos reales que queremos mostrar.
    const condiciones = { [campoFiltro]: ultimaLectura };
    const full = await consultarTabla(tabla, condiciones, [campoFiltro, ...camposDeseados]);
    if (full.error) {
      return Response.json({ estado: 'error', tabla, mensaje: full.error }, { status: 502 });
    }

    const registro = filasDe(full)[0] || null;

    return Response.json({
      estado: 'ok',
      tabla,
      ultima_lectura: ultimaLectura,
      datos: registro,
      consultado: new Date().toISOString(),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
