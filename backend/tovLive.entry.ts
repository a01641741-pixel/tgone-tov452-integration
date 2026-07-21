import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

// ============================================================================
// Proxy hacia la API externa de telemetría (monitor02.redirectme.net) —
// VERSIÓN 2, construida sobre el contrato que Boris confirmó:
//
//   - Todo viaja por POST (ya no hay problema de "GET con body" — fetch()
//     soporta POST sin restricciones).
//   - El body incluye "Accion": "get" | "put" | "post" | "delete".
//   - Habrá un token de sesión que viaja dentro del JSON del body.
//   - El token se genera cifrando usuario+password+hora, se guarda en una
//     tabla de sesiones del lado de Boris, y su expiración se recorre hacia
//     adelante con cada transacción (idle timeout).
//
// LO QUE *NO* ESTÁ CONFIRMADO TODAVÍA (marcado abajo con TODO_CONFIRMAR):
//   - El mecanismo exacto para obtener el primer token (¿se manda
//     usuario/password una vez y regresa el token en la misma respuesta?
//     ¿hay una Accion especial tipo "login"? ¿el servidor lo regresa aunque
//     no se pida?).
//   - Qué código/mensaje regresa cuando el token ya expiró, para saber
//     cuándo hay que re-autenticar.
//
// Por seguridad (Accion "delete" es una operación real y ya tuvimos un
// incidente de borrado accidental antes), esta función NO debe activarse
// en producción hasta validar un ejemplo real de Postman con Boris. Mientras
// tanto queda detrás del flag DISABLED de abajo.
// ============================================================================

const DISABLED = true; // ⚠️ cambiar a false solo después de validar con Boris

const DB_HOST_URL = 'http://monitor02.redirectme.net:3030/tgcomm/dbcommapi0099.php';

// Credenciales de respaldo — solo se usan si no hay token en cache y el
// primer login efectivamente funciona mandando usuario/password directo.
// TODO_CONFIRMAR: ¿Boris sigue aceptando esto o ya exige token siempre?
const DB_CONFIG = {
  servidor: 'localhost',
  base_de_datos: 'tgv_dev',
  usuario: 'root',
  password: 'root',
};

async function getCachedSession(base44) {
  try {
    const rows = await base44.asServiceRole.entities.TovSesion.list('-created_date', 1);
    const row = rows?.[0];
    if (!row) return null;
    if (row.expira && new Date(row.expira).getTime() < Date.now()) return null;
    return row;
  } catch {
    return null; // la entidad TovSesion aún no existe o no hay filas — sin problema
  }
}

async function saveSession(base44, token, expira) {
  try {
    const rows = await base44.asServiceRole.entities.TovSesion.list('-created_date', 1);
    if (rows?.[0]) {
      await base44.asServiceRole.entities.TovSesion.update(rows[0].id, { token, expira });
    } else {
      await base44.asServiceRole.entities.TovSesion.create({ token, expira });
    }
  } catch {
    // Si la entidad no existe todavía, se ignora — no es crítico para el
    // proxy en sí, solo perdemos el ahorro de no re-loguear cada vez.
  }
}

async function callTov(body) {
  const res = await fetch(DB_HOST_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { estado: 'error', mensaje: text }; }
  return { status: res.status, json };
}

async function queryTov(base44, tabla, condiciones, displayfields) {
  const session = await getCachedSession(base44);

  const baseBody = { Accion: 'get', tabla };
  if (displayfields) baseBody.displayfields = displayfields;
  if (condiciones) baseBody.condiciones = condiciones;

  // Intento 1: con token si ya tenemos uno vigente; si no, con credenciales.
  const body1 = session ? { ...baseBody, token: session.token } : { ...baseBody, ...DB_CONFIG };
  let { json } = await callTov(body1);

  // TODO_CONFIRMAR: cuál es la señal real de "token vencido" para reintentar.
  const tokenRejected = session && (json.estado === 'error') &&
    /token|sesi[oó]n|expirad/i.test(json.mensaje || '');

  if (tokenRejected) {
    const retryBody = { ...baseBody, ...DB_CONFIG };
    ({ json } = await callTov(retryBody));
  }

  // Si el servidor nos regresó un token nuevo (login inicial o rotación),
  // lo guardamos para la siguiente llamada.
  if (json.token) {
    await saveSession(base44, json.token, json.expira || null);
  }

  return json;
}

Deno.serve(async (req) => {
  if (DISABLED) {
    return Response.json({
      error: 'Integración TOV live pendiente de validar — falta confirmar con Boris un ejemplo real de Postman del nuevo POST+Accion antes de activarla.',
    }, { status: 501 });
  }

  try {
    const base44 = createClientFromRequest(req);
    await base44.auth.me().catch(() => { throw new Error('No autenticado'); });

    const body = await req.json();
    const { tabla, action, lectura } = body;
    if (!tabla || typeof tabla !== 'string') {
      return Response.json({ error: "Falta 'tabla'" }, { status: 400 });
    }

    if (action === 'bootstrap') {
      const idsRes = await queryTov(base44, tabla, undefined, ['Lectura']);
      const ids = (idsRes.datos || []).map((r) => r.Lectura).filter((v) => typeof v === 'number');
      if (!ids.length) {
        return Response.json({ estado: 'vacio', ultima_lectura: null, total_registros: 0, datos: null });
      }
      const maxId = Math.max(...ids);
      const full = await queryTov(base44, tabla, { Lectura: maxId });
      return Response.json({
        estado: 'ok',
        ultima_lectura: maxId,
        total_registros: ids.length,
        datos: full.datos?.[0] || null,
      });
    }

    if (action === 'next') {
      if (typeof lectura !== 'number') {
        return Response.json({ error: "Falta 'lectura' (numero)" }, { status: 400 });
      }
      const nuevos = [];
      let cursor = lectura;
      for (let i = 0; i < 20; i++) {
        const probe = cursor + 1;
        const full = await queryTov(base44, tabla, { Lectura: probe });
        const record = full.datos?.[0];
        if (!record) break;
        nuevos.push(record);
        cursor = probe;
      }
      return Response.json({
        estado: nuevos.length ? 'nuevo' : 'sin_cambios',
        ultima_lectura: cursor,
        datos: nuevos,
      });
    }

    return Response.json({ error: 'accion invalida (usa bootstrap|next)' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
