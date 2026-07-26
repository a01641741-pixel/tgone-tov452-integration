import type { OptionId, RoundId, VenueId } from '../shared/ids.js';

/**
 * Option — algo por lo que se puede votar.
 *
 * Aquí está la regla más importante del núcleo: **el core no sabe qué es una
 * canción.** Una Option apunta a contenido externo mediante una referencia
 * opaca. El motor de votación jamás inspecciona `content.payload`.
 *
 * Si mañana se vota entre tres DJs, dos promociones o cinco retos, el Voting
 * Engine no cambia ni una línea.
 */
export interface VoteOption {
  readonly id: OptionId;
  readonly venueId: VenueId;
  readonly roundId: RoundId;
  readonly content: ContentRef;
  /** Orden de presentación. El motor no lo usa; la UI sí. */
  readonly position: number;
}

/**
 * Referencia opaca a contenido de cualquier módulo.
 *
 * `type` identifica al módulo dueño ('song', 'promo', 'karaoke_slot', 'dj', ...).
 * `id` es el identificador dentro de ese módulo.
 * `display` es lo mínimo para pintar la opción sin que la UI tenga que resolver
 * la referencia — evita un N+1 en la pantalla más caliente del producto.
 */
export interface ContentRef {
  readonly type: string;
  readonly id: string;
  readonly display: ContentDisplay;
  /** Datos específicos del módulo. El núcleo nunca los lee. */
  readonly payload?: Readonly<Record<string, unknown>>;
}

export interface ContentDisplay {
  readonly title: string;
  readonly subtitle?: string;
  readonly imageUrl?: string;
}
