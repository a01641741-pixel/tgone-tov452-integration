import type { VenueId } from '../shared/ids.js';
import type { ContentRef } from '../domain/option.js';
import type { RoundResult } from '../domain/round.js';

/**
 * ResultConsumer — qué pasa cuando una ronda produce un ganador.
 *
 * v2.0 fija que la ronda produce un resultado y no decide qué hacer con él. Aquí
 * está esa separación hecha código: un resultado puede tener cero, uno o muchos
 * consumidores, y ninguno sabe de los otros.
 *
 *   - Pantalla del venue → lo muestra
 *   - DJ humano          → lo lee y lo pone
 *   - Spotify comercial  → lo encola por API
 *   - Motor de luces     → cambia el ambiente
 *   - Analítica          → lo archiva
 *
 * Que un venue con DJ humano y un venue con integración automática usen
 * exactamente el mismo núcleo es lo que hace a Votify vendible desde el día uno,
 * sin heredar el riesgo de licenciamiento de ejecución pública.
 */
export interface ResultConsumer {
  readonly id: string;

  /** Si este consumidor debe atender un resultado dado. */
  accepts(result: RoundResult, content: ContentRef | null): boolean;

  consume(input: ConsumeInput): Promise<ConsumeAck>;
}

export interface ConsumeInput {
  readonly venueId: VenueId;
  readonly result: RoundResult;
  /** El contenido ganador ya resuelto. `null` si la ronda quedó sin votos o empatada. */
  readonly content: ContentRef | null;
}

export type ConsumeAck =
  /** Ejecutado automáticamente (ej. encolado en el reproductor). */
  | { readonly status: 'executed'; readonly detail?: string }
  /** Entregado a un humano; la ejecución ocurre fuera del sistema. */
  | { readonly status: 'handed_off'; readonly to: string }
  /** No aplicaba. No es un error. */
  | { readonly status: 'skipped'; readonly reason: string }
  | { readonly status: 'failed'; readonly reason: string };
