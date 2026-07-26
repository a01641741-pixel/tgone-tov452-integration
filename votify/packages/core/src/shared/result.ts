/**
 * Result: el dominio nunca lanza excepciones.
 *
 * Una regla de oro de v2.0 es que el núcleo debe poder mantenerse durante años.
 * Las excepciones son control de flujo invisible: no aparecen en la firma, no
 * obligan al llamador a manejarlas, y se filtran entre capas hasta convertirse
 * en un 500 genérico. Con Result, todo fallo del dominio es parte del tipo y el
 * compilador obliga a tratarlo.
 */

export type Result<T, E> = Ok<T> | Err<E>;

export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}

export interface Err<E> {
  readonly ok: false;
  readonly error: E;
}

export const ok = <T>(value: T): Ok<T> => ({ ok: true, value });

export const err = <E>(error: E): Err<E> => ({ ok: false, error });

export const isOk = <T, E>(r: Result<T, E>): r is Ok<T> => r.ok;

export const isErr = <T, E>(r: Result<T, E>): r is Err<E> => !r.ok;

/** Desenvuelve o lanza. Uso exclusivo en tests y scripts — nunca en runtime de producción. */
export function unwrap<T, E>(r: Result<T, E>): T {
  if (r.ok) return r.value;
  throw new Error(`unwrap() sobre Err: ${JSON.stringify(r.error)}`);
}
