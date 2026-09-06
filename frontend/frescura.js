// Frescura y procedencia de una lectura — TGOne+
//
// Este módulo existe para separar tres cosas que la interfaz mostraba igual
// y que significan cosas muy distintas:
//
//   · CUÁNDO SE MIDIÓ      — el campo `fecha` que manda el propio medidor.
//   · CUÁNDO LO RECIBIMOS  — el instante en que la app obtuvo ese registro.
//   · SI LA ÚLTIMA CONSULTA FUE BIEN — el estado del último intento de red.
//
// Que una consulta acabe de responder NO significa que la medición sea
// reciente: el servidor puede devolver, sin ningún error, un registro de
// hace tres semanas. Antes ambas cosas se veían idénticas en pantalla, así
// que un dato viejo se leía como si estuviera vivo.
//
// Regla dura de todo el módulo: aquí no se afirma ninguna CAUSA. Que no
// lleguen lecturas puede ser el medidor, el enlace, el servidor o la
// instalación; desde la app no se puede distinguir, así que se describe el
// hecho observable y se deja el diagnóstico a quien pueda verificarlo.

const MIN = 60 * 1000;

// Umbrales de antigüedad. No son umbrales eléctricos ni configuración del
// equipo: son sólo cuándo esta interfaz deja de llamar "reciente" a un dato.
export const FRESCURA_RECIENTE_MS = 3 * MIN;
export const FRESCURA_ATRASADA_MS = 30 * MIN;

/**
 * Interpreta el estado de una lectura sin inventar causas.
 *
 * @param {object|null} p.reading   Lectura ya escalada (o null si no hay).
 * @param {Date|null}   p.recibidoEn  Cuándo llegó a la app ese registro.
 * @param {Date|null}   p.ultimaConsultaOk Último intento de red exitoso.
 * @param {string}      p.status    'idle' | 'cargando' | 'ok' | 'error'
 * @param {string|null} p.mensaje   Mensaje del error de consulta, si lo hubo.
 * @param {Date}        p.ahora     Inyectable para pruebas.
 */
export function evaluarFrescura({
  reading,
  recibidoEn = null,
  ultimaConsultaOk = null,
  status = 'idle',
  mensaje = null,
  ahora = new Date(),
} = {}) {
  const medidoEn = parseFecha(reading?.fecha);
  const edadMs = medidoEn ? ahora - medidoEn : null;

  const base = {
    medidoEn,
    recibidoEn,
    ultimaConsultaOk,
    edadMs,
    edadTexto: medidoEn ? hace(edadMs) : null,
    // Se expone por separado para que la interfaz pueda decir las dos cosas
    // sin confundirlas nunca.
    consultaTexto: ultimaConsultaOk ? hace(ahora - ultimaConsultaOk) : null,
    detalle: mensaje || null,
  };

  if (status === 'cargando' && !reading) {
    return { ...base, nivel: 'cargando', titulo: 'Consultando', descripcion: 'Pidiendo la lectura más reciente al medidor.' };
  }

  // Falló la consulta. Si ya teníamos una lectura, sigue mostrándose: lo que
  // cambia es la confianza, no el número. Nunca se borra un dato real.
  if (status === 'error') {
    return {
      ...base,
      nivel: 'error_consulta',
      titulo: 'No se pudo consultar',
      descripcion: reading
        ? 'El último intento de consulta falló. Se muestra la lectura anterior, con su hora original.'
        : 'El último intento de consulta falló y todavía no hay ninguna lectura que mostrar.',
    };
  }

  // La consulta fue bien pero no vino ninguna lectura.
  if (!reading) {
    return { ...base, nivel: 'sin_datos', titulo: 'Sin lecturas', descripcion: 'La consulta respondió, pero no hay ninguna lectura disponible para este equipo.' };
  }

  // Hay lectura, pero sin hora utilizable: no se puede afirmar su antigüedad.
  if (!medidoEn) {
    return { ...base, nivel: 'sin_hora', titulo: 'Sin hora de medición', descripcion: 'La lectura llegó sin una fecha que se pueda interpretar, así que no es posible saber de cuándo es.' };
  }

  if (edadMs > FRESCURA_ATRASADA_MS) {
    return { ...base, nivel: 'atrasado', titulo: 'Dato atrasado', descripcion: `La medición es de ${hace(edadMs)}. La consulta sí responde, pero el medidor no ha reportado una lectura nueva.` };
  }
  if (edadMs > FRESCURA_RECIENTE_MS) {
    return { ...base, nivel: 'rezagado', titulo: 'Dato rezagado', descripcion: `Medido ${hace(edadMs)}. Todavía no llega una lectura más nueva.` };
  }
  return { ...base, nivel: 'reciente', titulo: 'En vivo', descripcion: `Medido ${hace(edadMs)}.` };
}

// Los niveles usan los colores de estado ya definidos en el sistema visual.
// 'reciente' es neutro a propósito: que un dato sea nuevo no dice nada sobre
// si la medición está dentro de rango — esa es otra pregunta, y la responde
// estadoSalud.js con sus propios criterios.
export const ESTILO_FRESCURA = {
  reciente:      { clase: 'text-success',            punto: 'bg-success' },
  rezagado:      { clase: 'text-muted-foreground',   punto: 'bg-muted-foreground' },
  atrasado:      { clase: 'text-warning',            punto: 'bg-warning' },
  error_consulta:{ clase: 'text-destructive',        punto: 'bg-destructive' },
  sin_datos:     { clase: 'text-muted-foreground',   punto: 'bg-muted-foreground' },
  sin_hora:      { clase: 'text-warning',            punto: 'bg-warning' },
  cargando:      { clase: 'text-muted-foreground',   punto: 'bg-muted-foreground' },
};

/** El medidor manda "2026-09-02 18:23:47" (sin zona). Safari no acepta ese
 *  formato con espacio, así que se normaliza antes de interpretarlo. */
export function parseFecha(valor) {
  if (!valor) return null;
  if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? null : valor;
  const d = new Date(String(valor).trim().replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function hace(ms) {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return '—';
  if (ms < 0) return 'en el futuro';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `hace ${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h ${m % 60} min`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'hace 1 día' : `hace ${d} días`;
}

/** Fecha y hora completas, para cuando hace falta el sello exacto. */
export function selloCompleto(valor) {
  const d = parseFecha(valor);
  if (!d) return '—';
  return d.toLocaleString('es-MX', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}
