import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

// CRUD real contra la tabla "prueba" (creada por Boris en tgv_dev para este
// propósito) vía dbcommapi0099.php. Contrato de escritura confirmado en vivo
// el 22/jul/2026 probando sobre esta misma tabla (nunca sobre TOV452_66):
//   - Lectura:  action:'get'
//   - Alta:     action:'post'   + campos
//   - Cambio:   action:'put'    + condiciones (id) + campos
//   - Baja:     action:'delete' + condiciones (id)
// Los 4 requieren 'token'. El servidor NO pagina/ordena (ya lo confirmamos con
// TOV452_66), así que la paginación se hace aquí, en memoria, sobre la tabla
// completa — aceptable porque "prueba" es chica a propósito.
//
// Solo usuarios con sesión real de TG One (no invitados) pueden usar esta
// función — no expone nada a un visitante anónimo.

const DB_HOST_URL = 'http://monitor02.redirectme.net:3030/tgcommdev/dbcommapi0099.php';
const TABLA = 'prueba';

const DB_CONFIG = {
  servidor: 'localhost',
  base_de_datos: 'tgv_dev',
  usuario: 'root',
  password: 'root',
  token: 'Tg#10982278ia123',
};

// Reglas reales de la tabla `prueba` (ver CREATE TABLE de Boris):
//   Nombre char(30) NOT NULL · Descripcion char(30) · Status char(10) ·
//   nivel char(10) · boleano tinyint · numerico int · fecha date ·
//   doble tinyint (a pesar del nombre, la columna real es tinyint, no decimal)
function validarRegistro(registro, { esAlta }) {
  const errores = [];
  const limpio = {};

  const texto = (valor, campo, max, requerido) => {
    if (valor === undefined || valor === null || valor === '') {
      if (requerido) errores.push(`'${campo}' es obligatorio.`);
      return requerido ? undefined : null;
    }
    const s = String(valor);
    if (s.length > max) errores.push(`'${campo}' no puede tener más de ${max} caracteres (tiene ${s.length}).`);
    return s;
  };

  const entero = (valor, campo, min, max) => {
    if (valor === undefined || valor === null || valor === '') return null;
    const n = Number(valor);
    if (!Number.isInteger(n)) { errores.push(`'${campo}' debe ser un número entero.`); return undefined; }
    if (n < min || n > max) { errores.push(`'${campo}' debe estar entre ${min} y ${max} (columna ${max <= 127 ? 'tinyint' : 'int'}).`); return undefined; }
    return n;
  };

  limpio.Nombre = texto(registro.Nombre, 'Nombre', 30, true);
  limpio.Descripcion = texto(registro.Descripcion, 'Descripcion', 30, false);
  limpio.Status = texto(registro.Status, 'Status', 10, false);
  limpio.nivel = texto(registro.nivel, 'nivel', 10, false);
  limpio.boleano = entero(registro.boleano === true ? 1 : registro.boleano === false ? 0 : registro.boleano, 'boleano', 0, 1);
  limpio.numerico = entero(registro.numerico, 'numerico', -2147483648, 2147483647);
  limpio.doble = entero(registro.doble, 'doble', -128, 127);

  if (registro.fecha === undefined || registro.fecha === null || registro.fecha === '') {
    limpio.fecha = null;
  } else if (!/^\d{4}-\d{2}-\d{2}$/.test(registro.fecha) || Number.isNaN(new Date(registro.fecha).getTime())) {
    errores.push("'fecha' debe tener formato YYYY-MM-DD.");
  } else {
    limpio.fecha = registro.fecha;
  }

  if (esAlta && !limpio.Nombre) errores.push("'Nombre' es obligatorio.");

  return { errores, limpio };
}

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
    return { estado: 'error', mensaje: text || `Respuesta no-JSON (status ${res.status})` };
  }
}

function filasDe(respuesta) {
  return respuesta.datos || respuesta.data || respuesta.resultado || [];
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    try {
      await base44.auth.me();
    } catch {
      return Response.json({ error: 'Necesitas iniciar sesión en TG One para usar esta pantalla.' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { action } = body;

    if (action === 'list') {
      const page = Math.max(1, parseInt(body.page, 10) || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt(body.pageSize, 10) || 10));

      const res = await callDb({ ...DB_CONFIG, action: 'get', tabla: TABLA });
      if (res.estado === 'error') {
        return Response.json({ error: res.mensaje || 'No se pudo consultar la tabla.' }, { status: 502 });
      }
      const filas = filasDe(res).sort((a, b) => (b.id || 0) - (a.id || 0));
      const total = filas.length;
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      const start = (page - 1) * pageSize;
      const datos = filas.slice(start, start + pageSize);

      return Response.json({ estado: 'ok', datos, total, page, pageSize, totalPages });
    }

    if (action === 'create') {
      const { errores, limpio } = validarRegistro(body.registro || {}, { esAlta: true });
      if (errores.length) return Response.json({ error: errores.join(' ') }, { status: 400 });

      const res = await callDb({ ...DB_CONFIG, action: 'post', tabla: TABLA, campos: limpio });
      if (res.estado === 'error') return Response.json({ error: res.mensaje || 'No se pudo insertar.' }, { status: 502 });
      return Response.json({ estado: 'ok', datos: res.datos });
    }

    if (action === 'update') {
      const id = parseInt(body.id, 10);
      if (!Number.isInteger(id)) return Response.json({ error: "Falta 'id' válido." }, { status: 400 });

      const { errores, limpio } = validarRegistro(body.registro || {}, { esAlta: false });
      if (errores.length) return Response.json({ error: errores.join(' ') }, { status: 400 });

      const res = await callDb({ ...DB_CONFIG, action: 'put', tabla: TABLA, condiciones: { id }, campos: limpio });
      if (res.estado === 'error') return Response.json({ error: res.mensaje || 'No se pudo actualizar.' }, { status: 502 });
      return Response.json({ estado: 'ok', datos: res.datos });
    }

    if (action === 'delete') {
      const id = parseInt(body.id, 10);
      if (!Number.isInteger(id)) return Response.json({ error: "Falta 'id' válido." }, { status: 400 });

      const res = await callDb({ ...DB_CONFIG, action: 'delete', tabla: TABLA, condiciones: { id } });
      if (res.estado === 'error') return Response.json({ error: res.mensaje || 'No se pudo borrar.' }, { status: 502 });
      return Response.json({ estado: 'ok', datos: res.datos });
    }

    return Response.json({ error: "Acción inválida (usa 'list' | 'create' | 'update' | 'delete')." }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
