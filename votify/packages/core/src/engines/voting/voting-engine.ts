import type { Instant } from '../../shared/clock.js';
import type { OptionId, VoteId } from '../../shared/ids.js';
import { err, ok, type Result } from '../../shared/result.js';
import type { VoteOption } from '../../domain/option.js';
import type { RoundOutcome, RoundResult, TallySnapshot, VotingRound } from '../../domain/round.js';
import type { Participant, Vote } from '../../domain/vote.js';
import type { VotingError } from './errors.js';
import { computeTally, leaders } from './tally.js';

/**
 * VOTING ENGINE — Engine #1.
 *
 * Reglas que este archivo cumple sin excepción:
 *
 *  1. No sabe qué es una canción, una promoción ni un karaoke. Solo opciones.
 *  2. No hace I/O. No lee reloj, no genera IDs, no toca red ni base de datos.
 *     Todo entra como parámetro. Por eso una noche entera se puede simular en
 *     milisegundos dentro de un test.
 *  3. No lanza excepciones. Todo fallo es un valor tipado.
 *  4. Es puro: mismas entradas, mismas salidas. Dos servidores calculando el
 *     mismo conteo llegan al mismo resultado, siempre.
 *
 * Estas cuatro reglas son las que permiten que este motor no se reescriba nunca,
 * aunque encima cambien la UI, la base de datos y el proveedor de música.
 */

export interface CastVoteInput {
  readonly round: VotingRound;
  readonly options: readonly VoteOption[];
  /** Votos ya existentes de esta ronda. */
  readonly votes: readonly Vote[];
  readonly participant: Participant;
  readonly optionId: OptionId;
  /** Obligatoria: la red de un bar es mala y la gente da doble tap. */
  readonly idempotencyKey: string;
  /** ID generado por la capa de infraestructura: el dominio no genera aleatoriedad. */
  readonly voteId: VoteId;
  readonly now: Instant;
  readonly tallyVersion: number;
}

export interface CastVoteOutcome {
  readonly vote: Vote;
  readonly votes: readonly Vote[];
  readonly tally: TallySnapshot;
  /** true si la llamada fue un reintento de una que ya se había aplicado. */
  readonly replayed: boolean;
}

export function castVote(input: CastVoteInput): Result<CastVoteOutcome, VotingError> {
  const { round, options, votes, participant, optionId, idempotencyKey, voteId, now, tallyVersion } = input;

  if (participant.venueId !== round.venueId) {
    return err({ code: 'TENANT_MISMATCH', expected: round.venueId, actual: participant.venueId });
  }

  // Idempotencia primero: un reintento debe tener éxito aunque la ronda ya haya
  // cerrado entre el envío original y el reintento. Castigar al usuario por una
  // red mala sería castigarlo por algo que no controla.
  const replay = votes.find((v) => v.idempotencyKey === idempotencyKey);
  if (replay !== undefined) {
    return ok({
      vote: replay,
      votes,
      tally: computeTally(round, options, votes, now, tallyVersion),
      replayed: true,
    });
  }

  if (round.status !== 'open') {
    return err({ code: 'ROUND_CLOSED' });
  }

  if (!options.some((o) => o.id === optionId)) {
    return err({ code: 'OPTION_NOT_IN_ROUND', optionId });
  }

  const own = votes.filter((v) => v.participantId === participant.id);

  if (own.length >= round.policy.budgetPerParticipant) {
    return err({
      code: 'BUDGET_EXHAUSTED',
      used: own.length,
      budget: round.policy.budgetPerParticipant,
    });
  }

  if (!round.policy.allowStacking && own.some((v) => v.optionId === optionId)) {
    return err({ code: 'STACKING_NOT_ALLOWED', optionId });
  }

  const vote: Vote = {
    id: voteId,
    venueId: round.venueId,
    roundId: round.id,
    optionId,
    participantId: participant.id,
    weight: participant.voteWeight,
    idempotencyKey,
    castAt: now,
  };

  const nextVotes = [...votes, vote];

  return ok({
    vote,
    votes: nextVotes,
    tally: computeTally(round, options, nextVotes, now, tallyVersion),
    replayed: false,
  });
}

export interface RetractVoteInput {
  readonly round: VotingRound;
  readonly options: readonly VoteOption[];
  readonly votes: readonly Vote[];
  readonly participant: Participant;
  readonly voteId: VoteId;
  readonly now: Instant;
  readonly tallyVersion: number;
}

export interface RetractVoteOutcome {
  readonly removed: Vote;
  readonly votes: readonly Vote[];
  readonly tally: TallySnapshot;
}

/**
 * Retira un voto y libera presupuesto.
 *
 * "Cambiar mi voto" en la UI es retract + cast, no una operación nueva: mantener
 * dos primitivas en lugar de tres deja un solo lugar donde vive la regla de
 * presupuesto.
 */
export function retractVote(input: RetractVoteInput): Result<RetractVoteOutcome, VotingError> {
  const { round, options, votes, participant, voteId, now, tallyVersion } = input;

  if (participant.venueId !== round.venueId) {
    return err({ code: 'TENANT_MISMATCH', expected: round.venueId, actual: participant.venueId });
  }

  if (round.status !== 'open') return err({ code: 'ROUND_CLOSED' });
  if (!round.policy.allowRetract) return err({ code: 'RETRACT_NOT_ALLOWED' });

  const target = votes.find((v) => v.id === voteId && v.participantId === participant.id);
  if (target === undefined) return err({ code: 'VOTE_NOT_FOUND' });

  const nextVotes = votes.filter((v) => v.id !== voteId);

  return ok({
    removed: target,
    votes: nextVotes,
    tally: computeTally(round, options, nextVotes, now, tallyVersion),
  });
}

export interface CloseRoundInput {
  readonly round: VotingRound;
  readonly options: readonly VoteOption[];
  readonly votes: readonly Vote[];
  readonly now: Instant;
  readonly tallyVersion: number;
  /**
   * Señal recibida de un módulo externo, si la hay.
   *
   * Así el cierre "cuando la canción esté por terminar" no introduce el concepto
   * de canción en el núcleo: el motor solo compara este string contra la
   * política.
   */
  readonly cue?: string;
  /** El host siempre puede forzar el cierre, sin importar la política. */
  readonly forcedByHost?: boolean;
}

export interface CloseRoundOutcome {
  readonly round: VotingRound;
  readonly result: RoundResult;
}

export function closeRound(input: CloseRoundInput): Result<CloseRoundOutcome, VotingError> {
  const { round, options, votes, now, tallyVersion, cue, forcedByHost = false } = input;

  if (round.status !== 'open') return err({ code: 'ROUND_CLOSED' });

  if (!forcedByHost) {
    const due = closingDue(round, now, cue);
    if (!due.ok) return due;
  }

  const tally = computeTally(round, options, votes, now, tallyVersion);
  const outcome = decideOutcome(round, tally);

  return ok({
    round: { ...round, status: 'closed', closedAt: now },
    result: {
      roundId: round.id,
      venueId: round.venueId,
      momentId: round.momentId,
      outcome,
      tally,
      decidedAt: now,
    },
  });
}

/** ¿Corresponde cerrar ya, según la política de la ronda? */
export function closingDue(round: VotingRound, now: Instant, cue?: string): Result<true, VotingError> {
  const policy = round.policy.closing;

  switch (policy.kind) {
    case 'manual':
      return err({ code: 'CLOSING_NOT_DUE', reason: 'la política es manual; requiere acción del host' });

    case 'scheduled':
      return now >= policy.closesAt
        ? ok(true)
        : err({ code: 'CLOSING_NOT_DUE', reason: `cierra en ${policy.closesAt - now}ms` });

    case 'external_cue':
      return cue === policy.cue
        ? ok(true)
        : err({ code: 'CLOSING_NOT_DUE', reason: `esperando la señal "${policy.cue}"` });
  }
}

function decideOutcome(round: VotingRound, tally: TallySnapshot): RoundOutcome {
  const top = leaders(tally);

  if (top.length === 0) return { kind: 'no_votes' };

  const first = top[0];
  if (first === undefined) return { kind: 'no_votes' };
  if (top.length === 1) return { kind: 'winner', optionId: first.optionId };

  const rule = round.policy.tieBreak;

  // `earliest_first_vote` ya está resuelto por el orden canónico del tally:
  // entre empatados en votos, el primero de la lista es el que recibió su voto
  // inicial antes (y a igualdad exacta, el de id menor — determinista).
  if (rule === 'earliest_first_vote') {
    return { kind: 'winner', optionId: first.optionId };
  }

  if (rule === 'host_decides') {
    return { kind: 'tied', optionIds: top.map((e) => e.optionId) };
  }

  const ids = [...top].map((e) => e.optionId).sort();
  const index = fnv1a(`${rule.seed}:${round.id}:${ids.join(',')}`) % ids.length;
  const picked = ids[index];
  return picked === undefined
    ? { kind: 'tied', optionIds: ids }
    : { kind: 'winner', optionId: picked };
}

/**
 * FNV-1a de 32 bits.
 *
 * El desempate aleatorio debe ser reproducible: dada la misma semilla y las
 * mismas opciones, cualquier servidor y cualquier auditoría posterior llegan al
 * mismo ganador. `Math.random()` haría el resultado indefendible ante un venue
 * que reclame que su concurso salió mal.
 */
function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}
