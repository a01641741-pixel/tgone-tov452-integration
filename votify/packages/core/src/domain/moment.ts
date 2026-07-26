import type { MomentId, RoomId, VenueId } from '../shared/ids.js';
import type { Instant } from '../shared/clock.js';

/**
 * Moment — la unidad de experiencia colectiva. El ADN de Votify.
 *
 * Un Momento es cualquier cosa que le pasa a un grupo de personas en un lugar:
 * una votación, un brindis, un concurso, un gol, una promoción, un karaoke.
 *
 * Votar NO es lo que define un Momento — votar es una de sus mecánicas. Por eso
 * VotingRound cuelga de Moment y no al revés: si el contenedor de primer nivel
 * fuera la ronda de votación, toda experiencia sin votos quedaría fuera del
 * modelo y habría que inventarle una jerarquía paralela.
 *
 * Moment es además la unidad de analítica. "¿Qué experiencia genera mayor
 * permanencia?" es una pregunta sobre Momentos, no sobre rondas.
 */
export interface Moment {
  readonly id: MomentId;
  readonly venueId: VenueId;
  readonly roomId: RoomId;

  /**
   * Qué tipo de experiencia es. Deliberadamente `string` y no una unión cerrada:
   * agregar 'trivia' o 'beer_pong' no debe requerir tocar el núcleo ni una
   * migración de enum. El catálogo de kinds vive en configuración por Venue.
   */
  readonly kind: string;

  /** Cómo participa la gente. Esto sí es cerrado: cada mecánica es un motor. */
  readonly mechanic: MomentMechanic;

  readonly status: MomentStatus;
  readonly title: string;

  /** Quién lo originó. Alimenta al Experience Engine: ¿aciertan sus sugerencias? */
  readonly origin: MomentOrigin;

  readonly startedAt: Instant | null;
  readonly endedAt: Instant | null;
  readonly createdAt: Instant;
}

export type MomentMechanic =
  /** La gente vota entre opciones. Activa el Voting Engine. */
  | 'vote'
  /** Se anuncia algo a la sala. Sin participación. Ej: brindis, gol, aviso. */
  | 'broadcast'
  /** Participación continua sin ganador. Ej: aplausos, emojis en vivo. */
  | 'reaction'
  /** Ambiente. Ej: iluminación, playlist de fondo. No se muestra como evento. */
  | 'ambient';

export type MomentStatus = 'draft' | 'scheduled' | 'live' | 'settled' | 'cancelled';

export type MomentOrigin =
  | { readonly by: 'host'; readonly actor: string }
  | { readonly by: 'schedule' }
  /** Sugerido por el Experience Engine. `rationale` es auditable y medible. */
  | { readonly by: 'experience_engine'; readonly rationale: string; readonly confidence: number };
