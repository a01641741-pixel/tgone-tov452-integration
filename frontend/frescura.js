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

// ---------------------------------------------------------------------------
// Cadencia y umbrales de antigüedad
// ---------------------------------------------------------------------------
//
// Estos NO son umbrales eléctricos ni configuración del equipo: son sólo
// cuándo esta interfaz deja de llamar "al día" a un dato.
//
// La primera versión usaba un umbral fijo de 3 min y estaba mal calibrada.
// Medido el 6/sep/2026 sobre 60 lecturas reales consecutivas de TOV452_66
// (6 h 16 min de cobertura): el medidor reporta con una MEDIANA de 382 s
// (~6.4 min), y **58 de 59 intervalos superaban los 3 min**. O sea, la app
// decía "rezagado" prácticamente siempre aunque el equipo estuviera
// perfecto. Un umbral fijo no puede servir: cada medidor que se dé de alta
// puede reportar a su propio ritmo.
//
// Por eso los umbrales se derivan de la cadencia REAL observada de ese
// equipo, y sólo se cae al valor de abajo cuando todavía no hay historial
// suficiente para medirla.
export const CADENCIA_POR_OMISION_MS = 384 * 1000; // mediana medida en TOV452_66

/**
 * Cadencia real de un equipo: mediana de los intervalos entre lecturas
 * consecutivas de su historial.
 *
 * Se descartan los intervalos absurdos (negativos o de más de 6 h) porque
 * el medidor sí emite registros con la fecha desfasada — verificado: la
 * lectura 12459 de TOV452_66 trae `2026-09-02 18:30:10` mientras sus
 * vecinas inmediatas traen `2026-09-06 01:33` y `01:46`. Un solo registro
 * así arrastraría el promedio; la mediana sobre intervalos filtrados no.
 *
 * @param lecturas Historial ya escalado (cada uno con `fecha`).
 * @returns milisegundos, o null si no hay material para medirlo.
 */
export function cadenciaDe(lecturas) {
  const fechas = (lecturas || [])
    .map((l) => parseFecha(l?.fecha))
    .filter(Boolean)
    .sort((a, b) => a - b);
  if (fechas.length < 3) return null;

  const saltos = [];
  for (let i = 1; i < fechas.length; i++) {
    const d = fechas[i] - fechas[i - 1];
    if (d > 0 && d < 6 * 60 * MIN) saltos.push(d);
  }
  if (saltos.length < 2) return null;

  saltos.sort((a, b) => a - b);
  const m = Math.floor(saltos.length / 2);
  return saltos.length % 2 ? saltos[m] : (saltos[m - 1] + saltos[m]) / 2;
}

/**
 * Umbrales derivados de la cadencia. Un dato está "al día" mientras no se
 * haya saltado un ciclo completo, y "atrasado" cuando ya se perdieron
 * varios. Los pisos existen para que un equipo muy rápido no acabe con una
 * ventana de segundos, donde cualquier hipo de red se leería como falla.
 */
export function umbralesDe(cadenciaMs) {
  const c = typeof cadenciaMs === 'number' && cadenciaMs > 0 ? cadenciaMs : CADENCIA_POR_OMISION_MS;
  return {
    cadencia: c,
    reciente: Math.max(2 * c, 5 * MIN),   // aún no se salta un ciclo
    atrasado: Math.max(5 * c, 30 * MIN),  // ya se perdieron varios
  };
}

/**
 * Interpreta el estado de una lectura sin inventar causas.
 *
 * @param {object|null} p.reading   Lectura ya escalada (o null si no hay).
 * @param {Date|null}   p.recibidoEn  Cuándo llegó a la app ese registro.
 * @param {Date|null}   p.ultimaConsultaOk Último intento de red exitoso.
 * @param {string}      p.status    'idle' | 'cargando' | 'ok' | 'error'
 * @param {string|null} p.mensaje   Mensaje del error de consulta, si lo hubo.
 * @param {Array}       p.historial Lecturas previas reales, para medir la
 *                                  cadencia de ESTE equipo. Sin esto se usa
 *                                  la cadencia por omisión, que es la medida
 *                                  en TOV452_66 y puede no aplicar a otro.
 * @param {number|null} p.cadenciaMs Cadencia ya calculada, si quien llama la
 *                                  tiene a la mano (evita recalcularla).
 * @param {Date}        p.ahora     Inyectable para pruebas.
 */
export function evaluarFrescura({
  reading,
  recibidoEn = null,
  ultimaConsultaOk = null,
  status = 'idle',
  mensaje = null,
  historial = null,
  cadenciaMs = null,
  ahora = new Date(),
} = {}) {
  const medidoEn = parseFecha(reading?.fecha);
  const edadMs = medidoEn ? ahora - medidoEn : null;

  // La cadencia sale del historial real cuando lo hay. `medida` distingue
  // "esto lo observamos en este equipo" de "esto es el valor de arranque",
  // para no presentar un supuesto como si fuera una medición.
  const cadenciaObservada = typeof cadenciaMs === 'number' ? cadenciaMs : cadenciaDe(historial);
  const u = umbralesDe(cadenciaObservada);
  const cadenciaMedida = !!cadenciaObservada;

  const base = {
    medidoEn,
    recibidoEn,
    ultimaConsultaOk,
    edadMs,
    edadTexto: medidoEn ? hace(edadMs) : null,
    cadenciaMs: u.cadencia,
    cadenciaMedida,
    cadenciaTexto: `${Math.round(u.cadencia / 1000 / 60 * 10) / 10} min`,
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

  // El ritmo esperado se cita siempre, para que "atrasado" signifique algo
  // comprobable y no una opinión de la interfaz.
  const ritmo = cadenciaMedida
    ? `Este equipo reporta cada ~${base.cadenciaTexto}.`
    : `Aún sin historial para medir su ritmo; se asume ~${base.cadenciaTexto}.`;

  if (edadMs > u.atrasado) {
    return { ...base, nivel: 'atrasado', titulo: 'Dato atrasado', descripcion: `La medición es de ${hace(edadMs)}. La consulta sí responde, pero el medidor no ha reportado una lectura nueva. ${ritmo}` };
  }
  if (edadMs > u.reciente) {
    return { ...base, nivel: 'rezagado', titulo: 'Se saltó un ciclo', descripcion: `Medido ${hace(edadMs)}, más de lo habitual. ${ritmo}` };
  }
  return { ...base, nivel: 'reciente', titulo: 'Al día', descripcion: `Medido ${hace(edadMs)}. ${ritmo}` };
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
