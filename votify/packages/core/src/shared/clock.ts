/**
 * El tiempo es una dependencia, no un global.
 *
 * `Date.now()` dentro del dominio hace que el cierre de rondas sea imposible de
 * probar de forma determinista. El motor recibe el instante como dato.
 */

export type Instant = number; // epoch millis, UTC

export interface Clock {
  now(): Instant;
}

export const systemClock: Clock = {
  now: () => Date.now(),
};

/** Reloj controlable, para tests y para simular una noche completa. */
export function fixedClock(start: Instant): Clock & { advance(ms: number): void; set(t: Instant): void } {
  let current = start;
  return {
    now: () => current,
    advance: (ms: number) => {
      current += ms;
    },
    set: (t: Instant) => {
      current = t;
    },
  };
}
