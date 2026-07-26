import type { MomentId, OptionId, RoundId, VenueId } from '../shared/ids.js';
import type { Instant } from '../shared/clock.js';

/**
 * VotingRound — una ventana de votación con frontera definida.
 *
 * La frontera es lo que hace que un porcentaje signifique algo: sin ronda, el
 * denominador flota y "34% de los votos" no es comparable contra nada, ni entre
 * momentos ni entre noches.
 *
 * La ronda es la mecánica `vote` de un Moment. No existe fuera de un Moment.
 */
export interface VotingRound {
  readonly id: RoundId;
  readonly venueId: VenueId;
  readonly momentId: MomentId;
  readonly status: RoundStatus;
  readonly policy: VotingPolicy;
  readonly openedAt: Instant;
  readonly closedAt: Instant | null;
}

export type RoundStatus = 'open' | 'closed';

/**
 * Política de votación — configuración, no código.
 *
 * Cada decisión de producto que dependa del tipo de venue vive aquí. Un antro y
 * un hotel quieren reglas distintas; ninguno de los dos justifica una rama en
 * el motor.
 */
export interface VotingPolicy {
  /**
   * Presupuesto de votos por participante en esta ronda.
   *
   * Con valor 1 obtienes voto exclusivo (escasez, porcentaje legible). Modelarlo
   * como presupuesto desde hoy es lo que permite que mañana los votos extra sean
   * moneda de gamificación o recompensa por consumo, sin migrar el esquema.
   */
  readonly budgetPerParticipant: number;

  /** Si un participante puede acumular más de un voto en la misma opción. */
  readonly allowStacking: boolean;

  /** Si puede retirar un voto ya emitido mientras la ronda está abierta. */
  readonly allowRetract: boolean;

  readonly closing: ClosingPolicy;
  readonly tieBreak: TieBreakPolicy;
}

export type ClosingPolicy =
  /** El host cierra cuando quiere. Siempre disponible como override. */
  | { readonly kind: 'manual' }
  /** Cierra a una hora concreta. */
  | { readonly kind: 'scheduled'; readonly closesAt: Instant }
  /**
   * Cierra cuando un módulo externo emite una señal.
   *
   * Así el cierre "cuando a la canción le queden 40 segundos" no mete el
   * concepto de canción en el núcleo: el Music Provider Engine emite el cue y
   * el motor solo compara strings.
   */
  | { readonly kind: 'external_cue'; readonly cue: string };

export type TieBreakPolicy =
  /** Gana quien recibió su primer voto antes. Premia al que se adelantó. */
  | 'earliest_first_vote'
  /** Determinista dada la semilla; auditable y reproducible. */
  | { readonly kind: 'seeded_random'; readonly seed: string }
  /** No se resuelve solo: el resultado queda `tied` y el host decide. */
  | 'host_decides';

export const DEFAULT_POLICY: VotingPolicy = {
  budgetPerParticipant: 1,
  allowStacking: false,
  allowRetract: true,
  closing: { kind: 'manual' },
  tieBreak: 'earliest_first_vote',
};

/** Resultado de una ronda. Es un hecho inmutable: se calcula una vez y se archiva. */
export interface RoundResult {
  readonly roundId: RoundId;
  readonly venueId: VenueId;
  readonly momentId: MomentId;
  readonly outcome: RoundOutcome;
  readonly tally: TallySnapshot;
  readonly decidedAt: Instant;
}

export type RoundOutcome =
  | { readonly kind: 'winner'; readonly optionId: OptionId }
  /** Empate que la política decidió no romper. Requiere intervención del host. */
  | { readonly kind: 'tied'; readonly optionIds: readonly OptionId[] }
  /** Nadie votó. Un dato valiosísimo para el Experience Engine. */
  | { readonly kind: 'no_votes' };

/** Foto del conteo en un instante. Lo que se transmite a la sala. */
export interface TallySnapshot {
  readonly roundId: RoundId;
  /** Monotónica. El cliente descarta cualquier snapshot con version menor. */
  readonly version: number;
  readonly totalVotes: number;
  readonly totalVoters: number;
  readonly entries: readonly TallyEntry[];
  readonly at: Instant;
}

export interface TallyEntry {
  readonly optionId: OptionId;
  readonly votes: number;
  /** 0..1 sobre el total de votos de la ronda. 0 si no hay votos. */
  readonly share: number;
  readonly firstVoteAt: Instant | null;
}
