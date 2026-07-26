import type { CandidateRequest, ContentRef, ContentSource } from '@votify/core';

/**
 * Fuente de contenido a partir de una lista curada por el venue.
 *
 * Es el proveedor por defecto, y no es un placeholder: resuelve tres problemas
 * reales que una integración con Spotify no resuelve.
 *
 *  1. Licenciamiento: el venue vota sobre lo que ya tiene derecho a reproducir.
 *  2. Moderación: nadie puede meter a votación algo ofensivo si el catálogo lo
 *     define el establecimiento. En una pantalla frente a cien personas, eso es
 *     una responsabilidad del venue, no un detalle.
 *  3. Cero integración: funciona en cualquier bar el primer día.
 */
export function createLocalPlaylistSource(input: LocalPlaylistInput): ContentSource {
  const { id, contentType = 'song', tracks } = input;

  const toRef = (t: LocalTrack): ContentRef => ({
    type: contentType,
    id: t.id,
    display: {
      title: t.title,
      ...(t.artist === undefined ? {} : { subtitle: t.artist }),
      ...(t.coverUrl === undefined ? {} : { imageUrl: t.coverUrl }),
    },
    payload: { durationMs: t.durationMs, tags: t.tags ?? [] },
  });

  return {
    id,
    contentType,
    capabilities: { search: true, playback: false, emitsCues: false },

    async candidates(request: CandidateRequest) {
      const tags = readTagHints(request.hints);
      const pool = tags.length === 0 ? tracks : tracks.filter((t) => (t.tags ?? []).some((tag) => tags.includes(tag)));
      return (pool.length === 0 ? tracks : pool).slice(0, request.limit).map(toRef);
    },

    async search(query: string, request: CandidateRequest) {
      const needle = query.trim().toLowerCase();
      if (needle === '') return [];
      return tracks
        .filter((t) => `${t.title} ${t.artist ?? ''}`.toLowerCase().includes(needle))
        .slice(0, request.limit)
        .map(toRef);
    },
  };
}

export interface LocalPlaylistInput {
  readonly id: string;
  readonly contentType?: string;
  readonly tracks: readonly LocalTrack[];
}

export interface LocalTrack {
  readonly id: string;
  readonly title: string;
  readonly artist?: string;
  readonly coverUrl?: string;
  readonly durationMs?: number;
  readonly tags?: readonly string[];
}

function readTagHints(hints: Readonly<Record<string, unknown>> | undefined): readonly string[] {
  const raw = hints?.['tags'];
  return Array.isArray(raw) ? raw.filter((v): v is string => typeof v === 'string') : [];
}
