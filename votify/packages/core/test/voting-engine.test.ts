import { describe, expect, it } from 'vitest';
import { castVote, closeRound, computeTally, retractVote, unwrap } from '../src/index.js';
import type { Vote } from '../src/index.js';
import { MOMENT, OTHER_VENUE, T0, opt, options, participant, policy, round, vid } from './factories.js';

/**
 * Helper: emite un voto y devuelve el nuevo arreglo, o falla el test.
 * Mantiene los casos legibles sin esconder el manejo de errores del dominio.
 */
function vote(
  r: ReturnType<typeof round>,
  opts: ReturnType<typeof options>,
  votes: readonly Vote[],
  who: string,
  optionKey: string,
  n: number,
  at = T0,
): readonly Vote[] {
  const outcome = unwrap(
    castVote({
      round: r,
      options: opts,
      votes,
      participant: participant(who),
      optionId: opt(optionKey),
      idempotencyKey: `${who}:${n}`,
      voteId: vid(n),
      now: at,
      tallyVersion: n,
    }),
  );
  return outcome.votes;
}

describe('presupuesto de votos', () => {
  it('con presupuesto 1, el segundo voto se rechaza', () => {
    const r = round();
    const opts = options('song', 'a', 'b');
    const votes = vote(r, opts, [], 'ana', 'a', 1);

    const second = castVote({
      round: r,
      options: opts,
      votes,
      participant: participant('ana'),
      optionId: opt('b'),
      idempotencyKey: 'ana:2',
      voteId: vid(2),
      now: T0 + 1000,
      tallyVersion: 2,
    });

    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.error).toEqual({ code: 'BUDGET_EXHAUSTED', used: 1, budget: 1 });
    }
  });

  it('con presupuesto 3, se permiten tres votos y se rechaza el cuarto', () => {
    const r = round({ policy: policy({ budgetPerParticipant: 3 }) });
    const opts = options('promo', 'a', 'b', 'c', 'd');

    let votes = vote(r, opts, [], 'ana', 'a', 1);
    votes = vote(r, opts, votes, 'ana', 'b', 2);
    votes = vote(r, opts, votes, 'ana', 'c', 3);

    const fourth = castVote({
      round: r,
      options: opts,
      votes,
      participant: participant('ana'),
      optionId: opt('d'),
      idempotencyKey: 'ana:4',
      voteId: vid(4),
      now: T0,
      tallyVersion: 4,
    });

    expect(fourth.ok).toBe(false);
  });

  it('sin allowStacking, no se puede votar dos veces la misma opción', () => {
    const r = round({ policy: policy({ budgetPerParticipant: 2, allowStacking: false }) });
    const opts = options('song', 'a', 'b');
    const votes = vote(r, opts, [], 'ana', 'a', 1);

    const again = castVote({
      round: r,
      options: opts,
      votes,
      participant: participant('ana'),
      optionId: opt('a'),
      idempotencyKey: 'ana:2',
      voteId: vid(2),
      now: T0,
      tallyVersion: 2,
    });

    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error.code).toBe('STACKING_NOT_ALLOWED');
  });
});

describe('idempotencia', () => {
  it('el doble tap no cuenta dos veces', () => {
    const r = round();
    const opts = options('song', 'a', 'b');
    const votes = vote(r, opts, [], 'ana', 'a', 1);

    const retry = unwrap(
      castVote({
        round: r,
        options: opts,
        votes,
        participant: participant('ana'),
        optionId: opt('a'),
        idempotencyKey: 'ana:1', // misma llave
        voteId: vid(99),
        now: T0 + 200,
        tallyVersion: 2,
      }),
    );

    expect(retry.replayed).toBe(true);
    expect(retry.votes).toHaveLength(1);
    expect(retry.tally.totalVotes).toBe(1);
  });

  it('un reintento tardío tiene éxito aunque la ronda ya haya cerrado', () => {
    const r = round();
    const opts = options('song', 'a', 'b');
    const votes = vote(r, opts, [], 'ana', 'a', 1);
    const closed = { ...r, status: 'closed' as const, closedAt: T0 + 5000 };

    const retry = castVote({
      round: closed,
      options: opts,
      votes,
      participant: participant('ana'),
      optionId: opt('a'),
      idempotencyKey: 'ana:1',
      voteId: vid(99),
      now: T0 + 6000,
      tallyVersion: 2,
    });

    expect(retry.ok).toBe(true);
    if (retry.ok) expect(retry.value.replayed).toBe(true);
  });
});

describe('cambiar el voto', () => {
  it('retirar libera presupuesto y permite votar por otra opción', () => {
    const r = round({ policy: policy({ allowRetract: true }) });
    const opts = options('song', 'a', 'b');
    const votes = vote(r, opts, [], 'ana', 'a', 1);

    const afterRetract = unwrap(
      retractVote({
        round: r,
        options: opts,
        votes,
        participant: participant('ana'),
        voteId: vid(1),
        now: T0 + 500,
        tallyVersion: 2,
      }),
    );
    expect(afterRetract.votes).toHaveLength(0);

    const moved = vote(r, opts, afterRetract.votes, 'ana', 'b', 3, T0 + 600);
    expect(moved).toHaveLength(1);
    expect(moved[0]?.optionId).toBe(opt('b'));
  });

  it('con allowRetract false, se rechaza', () => {
    const r = round({ policy: policy({ allowRetract: false }) });
    const opts = options('song', 'a', 'b');
    const votes = vote(r, opts, [], 'ana', 'a', 1);

    const result = retractVote({
      round: r,
      options: opts,
      votes,
      participant: participant('ana'),
      voteId: vid(1),
      now: T0,
      tallyVersion: 2,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('RETRACT_NOT_ALLOWED');
  });
});

describe('aislamiento multi-tenant', () => {
  it('un participante de otro venue no puede votar', () => {
    const r = round();
    const opts = options('song', 'a', 'b');

    const result = castVote({
      round: r,
      options: opts,
      votes: [],
      participant: participant('intruso', { venueId: OTHER_VENUE }),
      optionId: opt('a'),
      idempotencyKey: 'x:1',
      voteId: vid(1),
      now: T0,
      tallyVersion: 1,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('TENANT_MISMATCH');
  });
});

describe('conteo', () => {
  it('calcula porcentajes e incluye opciones sin votos', () => {
    const r = round();
    const opts = options('song', 'a', 'b', 'c');

    let votes = vote(r, opts, [], 'ana', 'a', 1, T0 + 100);
    votes = vote(r, opts, votes, 'beto', 'a', 2, T0 + 200);
    votes = vote(r, opts, votes, 'caro', 'b', 3, T0 + 300);

    const tally = computeTally(r, opts, votes, T0 + 400, 3);

    expect(tally.totalVotes).toBe(3);
    expect(tally.totalVoters).toBe(3);
    expect(tally.entries).toHaveLength(3);
    expect(tally.entries[0]?.optionId).toBe(opt('a'));
    expect(tally.entries[0]?.votes).toBe(2);
    expect(tally.entries[0]?.share).toBeCloseTo(2 / 3);
    expect(tally.entries[2]?.votes).toBe(0);
    expect(tally.entries[2]?.share).toBe(0);
  });

  it('respeta el peso del voto (base de la gamificación futura)', () => {
    const r = round();
    const opts = options('song', 'a', 'b');

    const outcome = unwrap(
      castVote({
        round: r,
        options: opts,
        votes: [],
        participant: participant('vip', { voteWeight: 3 }),
        optionId: opt('a'),
        idempotencyKey: 'vip:1',
        voteId: vid(1),
        now: T0,
        tallyVersion: 1,
      }),
    );

    expect(outcome.tally.totalVotes).toBe(3);
    expect(outcome.tally.totalVoters).toBe(1);
  });
});

describe('cierre de ronda', () => {
  it('la política manual no cierra sola, pero el host siempre puede forzar', () => {
    const r = round({ policy: policy({ closing: { kind: 'manual' } }) });
    const opts = options('song', 'a', 'b');
    const votes = vote(r, opts, [], 'ana', 'a', 1);

    const auto = closeRound({ round: r, options: opts, votes, now: T0 + 999_999, tallyVersion: 1 });
    expect(auto.ok).toBe(false);

    const forced = unwrap(
      closeRound({ round: r, options: opts, votes, now: T0 + 1000, tallyVersion: 1, forcedByHost: true }),
    );
    expect(forced.round.status).toBe('closed');
    expect(forced.result.outcome).toEqual({ kind: 'winner', optionId: opt('a') });
  });

  it('la política programada respeta la hora', () => {
    const closesAt = T0 + 60_000;
    const r = round({ policy: policy({ closing: { kind: 'scheduled', closesAt } }) });
    const opts = options('song', 'a', 'b');

    expect(closeRound({ round: r, options: opts, votes: [], now: closesAt - 1, tallyVersion: 1 }).ok).toBe(false);
    expect(closeRound({ round: r, options: opts, votes: [], now: closesAt, tallyVersion: 1 }).ok).toBe(true);
  });

  it('la señal externa cierra sin que el núcleo sepa qué la produjo', () => {
    const r = round({ policy: policy({ closing: { kind: 'external_cue', cue: 'track_ending' } }) });
    const opts = options('song', 'a', 'b');

    const wrong = closeRound({ round: r, options: opts, votes: [], now: T0, tallyVersion: 1, cue: 'otra_cosa' });
    expect(wrong.ok).toBe(false);

    const right = closeRound({ round: r, options: opts, votes: [], now: T0, tallyVersion: 1, cue: 'track_ending' });
    expect(right.ok).toBe(true);
  });

  it('una ronda sin votos produce no_votes, no un ganador arbitrario', () => {
    const r = round();
    const opts = options('song', 'a', 'b');
    const closed = unwrap(closeRound({ round: r, options: opts, votes: [], now: T0, tallyVersion: 1, forcedByHost: true }));
    expect(closed.result.outcome).toEqual({ kind: 'no_votes' });
  });

  it('no se puede cerrar dos veces', () => {
    const r = round({ status: 'closed', closedAt: T0 });
    const opts = options('song', 'a', 'b');
    const result = closeRound({ round: r, options: opts, votes: [], now: T0 + 1, tallyVersion: 1, forcedByHost: true });
    expect(result.ok).toBe(false);
  });
});

describe('desempate', () => {
  const opts = options('song', 'a', 'b');

  function tiedVotes(r: ReturnType<typeof round>): readonly Vote[] {
    let votes = vote(r, opts, [], 'ana', 'b', 1, T0 + 500);
    votes = vote(r, opts, votes, 'beto', 'a', 2, T0 + 900);
    return votes;
  }

  it('earliest_first_vote premia a quien se adelantó', () => {
    const r = round({ policy: policy({ tieBreak: 'earliest_first_vote' }) });
    const closed = unwrap(
      closeRound({ round: r, options: opts, votes: tiedVotes(r), now: T0 + 2000, tallyVersion: 2, forcedByHost: true }),
    );
    // 'b' recibió su primer voto en T0+500, antes que 'a' en T0+900.
    expect(closed.result.outcome).toEqual({ kind: 'winner', optionId: opt('b') });
  });

  it('host_decides deja el empate explícito en lugar de inventar un ganador', () => {
    const r = round({ policy: policy({ tieBreak: 'host_decides' }) });
    const closed = unwrap(
      closeRound({ round: r, options: opts, votes: tiedVotes(r), now: T0 + 2000, tallyVersion: 2, forcedByHost: true }),
    );
    expect(closed.result.outcome.kind).toBe('tied');
  });

  it('seeded_random es reproducible: misma semilla, mismo ganador', () => {
    const r = round({ policy: policy({ tieBreak: { kind: 'seeded_random', seed: 'noche-del-15' } }) });
    const votes = tiedVotes(r);

    const a = unwrap(closeRound({ round: r, options: opts, votes, now: T0 + 2000, tallyVersion: 2, forcedByHost: true }));
    const b = unwrap(closeRound({ round: r, options: opts, votes, now: T0 + 9999, tallyVersion: 7, forcedByHost: true }));

    expect(a.result.outcome).toEqual(b.result.outcome);
    expect(a.result.outcome.kind).toBe('winner');
  });
});

/**
 * LA PRUEBA ARQUITECTÓNICA.
 *
 * Si el motor tuviera una sola línea de lógica específica de música, este bloque
 * no compilaría o fallaría. Es el test que protege la regla #2 de v2.0 y el que
 * debe romperse el día que alguien intente meter una canción en el núcleo.
 */
describe('el motor es agnóstico al contenido', () => {
  const scenarios = ['song', 'promo', 'karaoke_slot', 'dj_battle', 'challenge', 'lighting_preset'];

  for (const contentType of scenarios) {
    it(`corre una ronda de "${contentType}" con el mismo motor y cero código específico`, () => {
      const r = round();
      const opts = options(contentType, 'x', 'y');

      let votes = vote(r, opts, [], 'ana', 'x', 1, T0 + 10);
      votes = vote(r, opts, votes, 'beto', 'x', 2, T0 + 20);
      votes = vote(r, opts, votes, 'caro', 'y', 3, T0 + 30);

      const closed = unwrap(
        closeRound({ round: r, options: opts, votes, now: T0 + 100, tallyVersion: 3, forcedByHost: true }),
      );

      expect(closed.result.outcome).toEqual({ kind: 'winner', optionId: opt('x') });
      expect(closed.result.momentId).toBe(MOMENT);
      expect(closed.result.tally.totalVoters).toBe(3);
      // El resultado no menciona el tipo de contenido: resolverlo es trabajo del
      // módulo dueño, no del motor.
      expect(JSON.stringify(closed.result)).not.toContain(contentType);
    });
  }
});
