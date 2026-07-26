/**
 * Identificadores tipados (branded types).
 *
 * Todos los IDs son string en runtime, pero distintos en tiempo de compilación.
 * Esto hace imposible pasar un RoomId donde se espera un MomentId — un error
 * que en un sistema multi-tenant no es un bug de tipos, es una fuga de datos
 * entre establecimientos.
 */

declare const brand: unique symbol;

type Brand<T, B extends string> = T & { readonly [brand]: B };

export type VenueId = Brand<string, 'VenueId'>;
export type RoomId = Brand<string, 'RoomId'>;
export type MomentId = Brand<string, 'MomentId'>;
export type RoundId = Brand<string, 'RoundId'>;
export type OptionId = Brand<string, 'OptionId'>;
export type VoteId = Brand<string, 'VoteId'>;
export type ParticipantId = Brand<string, 'ParticipantId'>;
export type ProfileId = Brand<string, 'ProfileId'>;

export const VenueId = (v: string): VenueId => v as VenueId;
export const RoomId = (v: string): RoomId => v as RoomId;
export const MomentId = (v: string): MomentId => v as MomentId;
export const RoundId = (v: string): RoundId => v as RoundId;
export const OptionId = (v: string): OptionId => v as OptionId;
export const VoteId = (v: string): VoteId => v as VoteId;
export const ParticipantId = (v: string): ParticipantId => v as ParticipantId;
export const ProfileId = (v: string): ProfileId => v as ProfileId;
