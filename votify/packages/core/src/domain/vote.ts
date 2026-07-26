import type { OptionId, ParticipantId, ProfileId, RoomId, RoundId, VenueId, VoteId } from '../shared/ids.js';
import type { Instant } from '../shared/clock.js';

/**
 * Participant — identidad dentro de una Room.
 *
 * Escanear QR → entrar → votar. Tres pasos, cero registro. El participante nace
 * anónimo y atado a una sola Room.
 *
 * `profileId` es opcional y es el puente al activo real de Votify: si la persona
 * ya tiene perfil, sus rachas, badges y gustos viajan con ella entre
 * establecimientos. Modelarlo desde hoy evita la migración de "anónimo a
 * cuenta", que es exactamente el tipo de rewrite que la regla de oro prohíbe.
 */
export interface Participant {
  readonly id: ParticipantId;
  readonly venueId: VenueId;
  readonly roomId: RoomId;
  readonly profileId: ProfileId | null;
  readonly displayName: string | null;
  readonly joinedAt: Instant;
  /**
   * Peso del voto. Siempre 1 hoy.
   *
   * Existe porque la gamificación y las promociones ("consume y obtén voto
   * doble") lo van a necesitar, y agregarlo después implicaría recalcular
   * históricos de conteo.
   */
  readonly voteWeight: number;
}

/**
 * Vote — pertenece a una ronda, nunca a una canción.
 *
 * `idempotencyKey` es obligatoria por una razón concreta: en un bar, la red es
 * mala y la gente da doble tap. Sin ella, un reintento del cliente cuenta dos
 * veces y la votación pierde credibilidad — que es lo único que este producto
 * no puede perder.
 */
export interface Vote {
  readonly id: VoteId;
  readonly venueId: VenueId;
  readonly roundId: RoundId;
  readonly optionId: OptionId;
  readonly participantId: ParticipantId;
  readonly weight: number;
  readonly idempotencyKey: string;
  readonly castAt: Instant;
}
