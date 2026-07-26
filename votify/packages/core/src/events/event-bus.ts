import type { DomainEvent, DomainEventType, EventOfType } from './events.js';

export type EventHandler<T extends DomainEventType> = (event: EventOfType<T>) => void | Promise<void>;

export interface EventBus {
  publish(event: DomainEvent): Promise<void>;
  subscribe<T extends DomainEventType>(type: T, handler: EventHandler<T>): Unsubscribe;
}

export type Unsubscribe = () => void;

export interface EventBusOptions {
  /**
   * Obligatorio a propósito.
   *
   * El núcleo no tiene `console`: no hace I/O, ni siquiera para registrar. Y un
   * fallo tragado en silencio dentro de un bus es de los bugs más caros que
   * existen, porque el sistema sigue pareciendo sano. Exigirlo en el tipo obliga
   * a cada punto de composición a decidir explícitamente a dónde va ese error.
   */
  readonly onHandlerError: (event: DomainEvent, cause: unknown) => void;
}

export interface InMemoryEventBus extends EventBus {
  /** Todo lo publicado, en orden. Para tests y para depurar una noche completa. */
  readonly seen: readonly DomainEvent[];
}

/**
 * Bus en memoria. Suficiente para un proceso; deliberadamente reemplazable.
 *
 * Cuando haga falta escalar horizontalmente, esta implementación se cambia por
 * una sobre Postgres LISTEN/NOTIFY, Redis Streams o un broker. Los motores no se
 * enteran, porque solo conocen la interfaz `EventBus`.
 *
 * Un handler que falla no tumba a los demás ni al emisor: el aislamiento de
 * fallos entre suscriptores es la razón de ser de un bus. Si el motor de
 * notificaciones truena, la votación sigue.
 */
export function createInMemoryEventBus(options: EventBusOptions): InMemoryEventBus {
  /**
   * Los handlers se guardan ya normalizados a la unión completa. El estrechamiento
   * ocurre una sola vez, en `subscribe`, donde sí es correcto: quien se suscribe a
   * 'round.settled' solo puede recibir eventos de ese tipo, y eso lo garantiza el
   * despacho por clave del Map.
   */
  const handlers = new Map<DomainEventType, Set<(event: DomainEvent) => void | Promise<void>>>();
  const seen: DomainEvent[] = [];

  return {
    get seen() {
      return seen;
    },

    async publish(event) {
      seen.push(event);
      const subscribers = handlers.get(event.type);
      if (subscribers === undefined || subscribers.size === 0) return;

      await Promise.all(
        [...subscribers].map(async (handler) => {
          try {
            await handler(event);
          } catch (cause) {
            options.onHandlerError(event, cause);
          }
        }),
      );
    },

    subscribe<T extends DomainEventType>(type: T, handler: EventHandler<T>): Unsubscribe {
      const wrapped = (event: DomainEvent): void | Promise<void> => handler(event as EventOfType<T>);

      const set = handlers.get(type) ?? new Set();
      set.add(wrapped);
      handlers.set(type, set);

      return () => {
        set.delete(wrapped);
      };
    },
  };
}
