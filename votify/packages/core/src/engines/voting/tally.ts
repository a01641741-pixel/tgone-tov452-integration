import type { Instant } from '../../shared/clock.js';
import type { OptionId } from '../../shared/ids.js';
import type { VoteOption } from '../../domain/option.js';
import type { TallyEntry, TallySnapshot, VotingRound } from '../../domain/round.js';
import type { Vote } from '../../domain/vote.js';

/**
 * Conteo de una ronda.
 *
 * Incluye las opciones con cero votos a propósito: la UI necesita filas
 * estables para poder animar las barras en lugar de montar y desmontar nodos.
 *
 * El orden es totalmente determinista (votos ↓, primer voto ↑, id ↑). Sin ese
 * tercer criterio, dos servidores podrían transmitir el mismo conteo en orden
 * distinto y la lista brincaría en la pantalla de la gente.
 */
export function computeTally(
  round: VotingRound,
  options: readonly VoteOption[],
  votes: readonly Vote[],
  at: Instant,
  version: number,
): TallySnapshot {
  const weightByOption = new Map<OptionId, number>();
  const firstVoteByOption = new Map<OptionId, Instant>();
  const voters = new Set<string>();

  let totalVotes = 0;

  for (const vote of votes) {
    if (vote.roundId !== round.id) continue;

    weightByOption.set(vote.optionId, (weightByOption.get(vote.optionId) ?? 0) + vote.weight);
    totalVotes += vote.weight;
    voters.add(vote.participantId);

    const currentFirst = firstVoteByOption.get(vote.optionId);
    if (currentFirst === undefined || vote.castAt < currentFirst) {
      firstVoteByOption.set(vote.optionId, vote.castAt);
    }
  }

  const entries: TallyEntry[] = options.map((option) => {
    const optionVotes = weightByOption.get(option.id) ?? 0;
    return {
      optionId: option.id,
      votes: optionVotes,
      share: totalVotes === 0 ? 0 : optionVotes / totalVotes,
      firstVoteAt: firstVoteByOption.get(option.id) ?? null,
    };
  });

  entries.sort(compareEntries);

  return {
    roundId: round.id,
    version,
    totalVotes,
    totalVoters: voters.size,
    entries,
    at,
  };
}

/** Orden canónico de resultados. Exportado porque el desempate reusa el mismo criterio. */
export function compareEntries(a: TallyEntry, b: TallyEntry): number {
  if (a.votes !== b.votes) return b.votes - a.votes;

  const aFirst = a.firstVoteAt ?? Number.POSITIVE_INFINITY;
  const bFirst = b.firstVoteAt ?? Number.POSITIVE_INFINITY;
  if (aFirst !== bFirst) return aFirst - bFirst;

  return a.optionId < b.optionId ? -1 : a.optionId > b.optionId ? 1 : 0;
}

/** Las opciones que empatan en el primer lugar. Vacío si nadie votó. */
export function leaders(tally: TallySnapshot): readonly TallyEntry[] {
  if (tally.totalVotes === 0) return [];
  const top = tally.entries[0];
  if (top === undefined || top.votes === 0) return [];
  return tally.entries.filter((e) => e.votes === top.votes);
}
