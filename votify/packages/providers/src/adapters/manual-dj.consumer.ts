import type { ConsumeAck, ConsumeInput, ContentRef, ResultConsumer, RoundResult } from '@votify/core';

/**
 * Consumidor de resultados para un DJ humano.
 *
 * Este adaptador es la prueba de que la arquitectura cumple lo que promete: el
 * núcleo funciona sin ninguna integración de reproducción. El ganador se
 * entrega a una cola que la pantalla del venue muestra, y una persona lo pone.
 *
 * Estratégicamente es el adaptador más importante que tenemos: es el que hace a
 * Votify instalable en cualquier establecimiento del mundo sin negociar con
 * Spotify, sin licencias de ejecución pública propias y sin hardware. Todos los
 * demás adaptadores son optimizaciones sobre este.
 */
export function createManualDjConsumer(options: ManualDjOptions = {}): ResultConsumer & ManualDjQueue {
  const queue: DjInstruction[] = [];
  const capacity = options.capacity ?? 50;

  return {
    id: 'consumer.manual_dj',

    accepts(result: RoundResult, content: ContentRef | null): boolean {
      // Solo hay algo que anunciar si hubo ganador con contenido resuelto.
      return result.outcome.kind === 'winner' && content !== null;
    },

    async consume({ result, content }: ConsumeInput): Promise<ConsumeAck> {
      if (content === null) {
        return { status: 'skipped', reason: 'la ronda no produjo un ganador con contenido' };
      }

      queue.push({
        roundId: result.roundId,
        momentId: result.momentId,
        content,
        votes: result.tally.totalVotes,
        voters: result.tally.totalVoters,
        decidedAt: result.decidedAt,
      });

      // Cola acotada: la pantalla del DJ muestra lo que sigue, no el historial
      // completo de la noche. Ese historial vive en analítica.
      if (queue.length > capacity) queue.splice(0, queue.length - capacity);

      return { status: 'handed_off', to: 'dj' };
    },

    pending() {
      return [...queue];
    },

    take() {
      return queue.shift() ?? null;
    },
  };
}

export interface ManualDjOptions {
  readonly capacity?: number;
}

export interface ManualDjQueue {
  /** Lo que la pantalla del venue debe mostrar. */
  pending(): readonly DjInstruction[];
  /** El DJ marca la siguiente como puesta. */
  take(): DjInstruction | null;
}

export interface DjInstruction {
  readonly roundId: string;
  readonly momentId: string;
  readonly content: ContentRef;
  readonly votes: number;
  readonly voters: number;
  readonly decidedAt: number;
}
