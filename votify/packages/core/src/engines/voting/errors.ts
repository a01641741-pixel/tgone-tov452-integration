import type { OptionId, VenueId } from '../../shared/ids.js';

/**
 * Todos los fallos del Voting Engine, como unión cerrada.
 *
 * Cerrada a propósito: cuando se agregue un caso nuevo, el compilador señalará
 * cada lugar que deba traducirlo a HTTP y a copy de UI. Un `Error` genérico
 * habría dejado esos lugares en silencio.
 */
export type VotingError =
  | { readonly code: 'ROUND_CLOSED' }
  | { readonly code: 'OPTION_NOT_IN_ROUND'; readonly optionId: OptionId }
  | { readonly code: 'BUDGET_EXHAUSTED'; readonly used: number; readonly budget: number }
  | { readonly code: 'STACKING_NOT_ALLOWED'; readonly optionId: OptionId }
  | { readonly code: 'RETRACT_NOT_ALLOWED' }
  | { readonly code: 'VOTE_NOT_FOUND' }
  | { readonly code: 'CLOSING_NOT_DUE'; readonly reason: string }
  /**
   * Aislamiento entre establecimientos. En multi-tenant esto no es un error de
   * validación, es un incidente de seguridad: se rechaza y se audita.
   */
  | { readonly code: 'TENANT_MISMATCH'; readonly expected: VenueId; readonly actual: VenueId };

export function describeVotingError(e: VotingError): string {
  switch (e.code) {
    case 'ROUND_CLOSED':
      return 'La votación ya cerró.';
    case 'OPTION_NOT_IN_ROUND':
      return `La opción ${e.optionId} no pertenece a esta ronda.`;
    case 'BUDGET_EXHAUSTED':
      return `Ya usaste tus ${e.budget} voto(s) en esta ronda.`;
    case 'STACKING_NOT_ALLOWED':
      return 'No puedes votar dos veces por la misma opción.';
    case 'RETRACT_NOT_ALLOWED':
      return 'Esta votación no permite cambiar tu voto.';
    case 'VOTE_NOT_FOUND':
      return 'No se encontró el voto que intentas retirar.';
    case 'CLOSING_NOT_DUE':
      return `La ronda todavía no debe cerrar: ${e.reason}`;
    case 'TENANT_MISMATCH':
      return 'Operación rechazada por aislamiento de establecimiento.';
  }
}
