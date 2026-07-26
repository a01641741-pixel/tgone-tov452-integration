import type { Instant } from '../shared/clock.js';
import type { MomentId, RoomId, RoundId, VenueId } from '../shared/ids.js';
import type { MomentMechanic } from '../domain/moment.js';
import type { RoundResult, TallySnapshot } from '../domain/round.js';

/**
 * Eventos de dominio — el único acoplamiento permitido entre motores.
 *
 * v2.0: "todos comunicándose mediante eventos, nunca mediante dependencias
 * fuertes". En la práctica eso significa que el Voting Engine no importa al
 * Notification Engine, ni al Analytics Engine, ni al Music Provider Engine.
 * Emite `round.settled` y termina su trabajo.
 *
 * La consecuencia concreta: agregar el motor de gamificación es escribir un
 * suscriptor nuevo. No se toca una sola línea de los motores existentes.
 */

interface EventBase {
  readonly id: string;
  readonly venueId: VenueId;
  readonly at: Instant;
}

export type DomainEvent =
  | ({ readonly type: 'room.opened'; readonly roomId: RoomId } & EventBase)
  | ({ readonly type: 'room.closed'; readonly roomId: RoomId } & EventBase)
  | ({
      readonly type: 'participant.joined';
      readonly roomId: RoomId;
      readonly participantId: string;
    } & EventBase)
  | ({
      readonly type: 'moment.started';
      readonly roomId: RoomId;
      readonly momentId: MomentId;
      readonly kind: string;
      readonly mechanic: MomentMechanic;
    } & EventBase)
  | ({ readonly type: 'moment.settled'; readonly momentId: MomentId } & EventBase)
  | ({
      readonly type: 'round.opened';
      readonly momentId: MomentId;
      readonly roundId: RoundId;
    } & EventBase)
  /** Alta frecuencia. Se agrega y se emite con coalescing, nunca por voto. */
  | ({ readonly type: 'round.tally_changed'; readonly tally: TallySnapshot } & EventBase)
  /**
   * El evento más importante de la plataforma.
   *
   * La ronda produce un resultado y NO decide qué hacer con él. Lo consumen, en
   * paralelo y sin conocerse entre sí: la pantalla del venue, el proveedor de
   * música, el motor de promociones, las luces, la analítica.
   */
  | ({ readonly type: 'round.settled'; readonly result: RoundResult } & EventBase);

export type DomainEventType = DomainEvent['type'];

export type EventOfType<T extends DomainEventType> = Extract<DomainEvent, { type: T }>;
