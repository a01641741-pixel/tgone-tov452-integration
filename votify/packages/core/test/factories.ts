import {
  DEFAULT_POLICY,
  MomentId,
  OptionId,
  ParticipantId,
  RoomId,
  RoundId,
  VenueId,
  VoteId,
} from '../src/index.js';
import type { ContentRef, Participant, VoteOption, VotingPolicy, VotingRound } from '../src/index.js';

export const T0 = 1_700_000_000_000;

export const VENUE = VenueId('venue_bar_x');
export const OTHER_VENUE = VenueId('venue_hotel_y');
export const ROOM = RoomId('room_viernes_532');
export const MOMENT = MomentId('moment_1');

export function round(overrides: Partial<VotingRound> = {}): VotingRound {
  return {
    id: RoundId('round_1'),
    venueId: VENUE,
    momentId: MOMENT,
    status: 'open',
    policy: DEFAULT_POLICY,
    openedAt: T0,
    closedAt: null,
    ...overrides,
  };
}

export function policy(overrides: Partial<VotingPolicy> = {}): VotingPolicy {
  return { ...DEFAULT_POLICY, ...overrides };
}

/**
 * Construye opciones de CUALQUIER tipo de contenido.
 *
 * Los tests usan 'song', 'promo' y 'karaoke_slot' con la misma función a
 * propósito: si el motor tuviera lógica específica de música, estos helpers no
 * podrían ser uno solo.
 */
export function options(contentType: string, ...ids: string[]): VoteOption[] {
  return ids.map((id, i) => ({
    id: OptionId(`opt_${id}`),
    venueId: VENUE,
    roundId: RoundId('round_1'),
    content: contentRef(contentType, id),
    position: i,
  }));
}

export function contentRef(type: string, id: string): ContentRef {
  return { type, id, display: { title: `${type}:${id}` } };
}

export function participant(id: string, overrides: Partial<Participant> = {}): Participant {
  return {
    id: ParticipantId(id),
    venueId: VENUE,
    roomId: ROOM,
    profileId: null,
    displayName: null,
    joinedAt: T0,
    voteWeight: 1,
    ...overrides,
  };
}

export const opt = (id: string): ReturnType<typeof OptionId> => OptionId(`opt_${id}`);
export const vid = (n: number): ReturnType<typeof VoteId> => VoteId(`vote_${n}`);
