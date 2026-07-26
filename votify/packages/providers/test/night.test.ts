import { describe, expect, it } from 'vitest';
import {
  DEFAULT_POLICY,
  MomentId,
  OptionId,
  ParticipantId,
  RoomId,
  RoundId,
  VenueId,
  VoteId,
  castVote,
  closeRound,
  createInMemoryEventBus,
  unwrap,
} from '@votify/core';
import type { ContentRef, DomainEvent, Participant, VoteOption, VotingRound } from '@votify/core';
import { createLocalPlaylistSource, createManualDjConsumer } from '../src/index.js';

const VENUE = VenueId('venue_bar_x');
const ROOM = RoomId('room_viernes');
const MOMENT = MomentId('moment_song_1');
const T0 = 1_700_000_000_000;

function participant(id: string): Participant {
  return {
    id: ParticipantId(id),
    venueId: VENUE,
    roomId: ROOM,
    profileId: null,
    displayName: null,
    joinedAt: T0,
    voteWeight: 1,
  };
}

/**
 * Recorre el ciclo completo de un Momento tal como ocurriría en un bar real,
 * usando únicamente las abstracciones públicas.
 *
 * Lo que este test demuestra, y que es el argumento central de la arquitectura:
 * Votify decide y entrega el resultado a un DJ humano. No reproduce nada, no
 * habla con Spotify, y aun así el producto funciona de punta a punta. Esa es la
 * propiedad que lo hace instalable en cualquier establecimiento sin heredar
 * riesgo de licenciamiento.
 */
describe('una noche completa, sin ninguna integración de reproducción', () => {
  it('lista curada → votación → cierre → evento → cola del DJ', async () => {
    const errors: unknown[] = [];
    const bus = createInMemoryEventBus({ onHandlerError: (_e, cause) => errors.push(cause) });

    const source = createLocalPlaylistSource({
      id: 'source.local',
      tracks: [
        { id: 't1', title: 'Bailando', artist: 'A', tags: ['cumbia'] },
        { id: 't2', title: 'Fiesta', artist: 'B', tags: ['reggaeton'] },
        { id: 't3', title: 'Lento', artist: 'C', tags: ['balada'] },
      ],
    });

    const dj = createManualDjConsumer();

    // El consumidor se entera por evento. Nunca lo llama el motor de votación.
    const contentByOption = new Map<string, ContentRef>();
    bus.subscribe('round.settled', async (event) => {
      const { result } = event;
      const content =
        result.outcome.kind === 'winner' ? contentByOption.get(result.outcome.optionId) ?? null : null;
      if (dj.accepts(result, content)) {
        await dj.consume({ venueId: event.venueId, result, content });
      }
    });

    // 1. El venue arma la ronda desde su catálogo licenciado.
    const refs = await source.candidates({ venueId: VENUE, limit: 3 });
    expect(refs).toHaveLength(3);

    const round: VotingRound = {
      id: RoundId('round_1'),
      venueId: VENUE,
      momentId: MOMENT,
      status: 'open',
      policy: DEFAULT_POLICY,
      openedAt: T0,
      closedAt: null,
    };

    const options: VoteOption[] = refs.map((content, i) => {
      const option: VoteOption = {
        id: OptionId(`opt_${i}`),
        venueId: VENUE,
        roundId: round.id,
        content,
        position: i,
      };
      contentByOption.set(option.id, content);
      return option;
    });

    // 2. La gente vota.
    const voters: Array<[string, number]> = [
      ['ana', 1],
      ['beto', 1],
      ['caro', 0],
      ['dani', 1],
    ];

    let votes = unwrap(
      castVote({
        round,
        options,
        votes: [],
        participant: participant(voters[0]![0]),
        optionId: options[voters[0]![1]]!.id,
        idempotencyKey: `${voters[0]![0]}:1`,
        voteId: VoteId('v0'),
        now: T0 + 1000,
        tallyVersion: 1,
      }),
    ).votes;

    for (let i = 1; i < voters.length; i++) {
      const [name, choice] = voters[i]!;
      votes = unwrap(
        castVote({
          round,
          options,
          votes,
          participant: participant(name),
          optionId: options[choice]!.id,
          idempotencyKey: `${name}:1`,
          voteId: VoteId(`v${i}`),
          now: T0 + 1000 * (i + 1),
          tallyVersion: i + 1,
        }),
      ).votes;
    }

    // 3. Cierra la ronda y se publica el resultado.
    const closed = unwrap(
      closeRound({ round, options, votes, now: T0 + 30_000, tallyVersion: 5, forcedByHost: true }),
    );

    expect(closed.result.outcome).toEqual({ kind: 'winner', optionId: options[1]!.id });
    expect(closed.result.tally.totalVoters).toBe(4);

    const settled: DomainEvent = {
      type: 'round.settled',
      id: 'evt_1',
      venueId: VENUE,
      at: T0 + 30_000,
      result: closed.result,
    };
    await bus.publish(settled);

    // 4. El DJ ve qué poner. Ninguna API de música intervino.
    const pending = dj.pending();
    expect(pending).toHaveLength(1);
    expect(pending[0]?.content.display.title).toBe('Fiesta');
    expect(pending[0]?.voters).toBe(4);
    expect(errors).toEqual([]);
  });

  it('una ronda sin votos no le entrega nada al DJ', async () => {
    const bus = createInMemoryEventBus({ onHandlerError: () => {} });
    const dj = createManualDjConsumer();

    bus.subscribe('round.settled', async (event) => {
      if (dj.accepts(event.result, null)) {
        await dj.consume({ venueId: event.venueId, result: event.result, content: null });
      }
    });

    const round: VotingRound = {
      id: RoundId('round_2'),
      venueId: VENUE,
      momentId: MOMENT,
      status: 'open',
      policy: DEFAULT_POLICY,
      openedAt: T0,
      closedAt: null,
    };

    const closed = unwrap(
      closeRound({ round, options: [], votes: [], now: T0 + 1000, tallyVersion: 1, forcedByHost: true }),
    );

    await bus.publish({
      type: 'round.settled',
      id: 'evt_2',
      venueId: VENUE,
      at: T0 + 1000,
      result: closed.result,
    });

    expect(closed.result.outcome).toEqual({ kind: 'no_votes' });
    expect(dj.pending()).toHaveLength(0);
  });
});
