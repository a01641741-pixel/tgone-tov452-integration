/**
 * @votify/core — el núcleo de la plataforma.
 *
 * Cero dependencias de runtime. Cero I/O. Cero conocimiento de música.
 * Si algo aquí adentro llegara a mencionar Spotify, la arquitectura falló.
 */

export * from './shared/result.js';
export * from './shared/ids.js';
export * from './shared/clock.js';

export type * from './domain/tenancy.js';
export type * from './domain/moment.js';
export type * from './domain/option.js';
export type * from './domain/round.js';
export type * from './domain/vote.js';
export { DEFAULT_POLICY } from './domain/round.js';

export * from './engines/voting/voting-engine.js';
export * from './engines/voting/tally.js';
export * from './engines/voting/errors.js';
export * from './engines/experience/experience-engine.js';

export * from './events/events.js';
export * from './events/event-bus.js';

export type * from './ports/content-source.js';
export type * from './ports/result-consumer.js';
