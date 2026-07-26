import type { VenueId } from '../shared/ids.js';
import type { ContentRef } from '../domain/option.js';

/**
 * ContentSource — de dónde salen las opciones de una ronda.
 *
 * El núcleo declara el contrato; los módulos lo implementan. Spotify, Apple
 * Music, una lista local, el catálogo de promociones del venue o un set de retos
 * son todos ContentSource. El Voting Engine jamás importa a ninguno.
 *
 * Esta es la inversión de dependencias que hace real la regla "no dependeremos
 * de Spotify": el día que Spotify cierre su API, se borra un archivo de
 * `packages/providers`. El núcleo no se entera.
 */
export interface ContentSource {
  readonly id: string;
  /** Qué `ContentRef.type` produce esta fuente ('song', 'promo', ...). */
  readonly contentType: string;
  readonly capabilities: ContentSourceCapabilities;

  /** Candidatos para abrir una ronda. */
  candidates(request: CandidateRequest): Promise<readonly ContentRef[]>;

  /** Búsqueda libre. Solo si `capabilities.search` es true. */
  search?(query: string, request: CandidateRequest): Promise<readonly ContentRef[]>;
}

export interface ContentSourceCapabilities {
  readonly search: boolean;
  /** Si puede recibir el resultado y ejecutarlo (ver ResultConsumer). */
  readonly playback: boolean;
  /** Si emite señales de cierre, ej. "la pista está por terminar". */
  readonly emitsCues: boolean;
}

export interface CandidateRequest {
  readonly venueId: VenueId;
  readonly limit: number;
  /** Filtros libres del módulo. El núcleo los pasa sin interpretarlos. */
  readonly hints?: Readonly<Record<string, unknown>>;
}
