import type { VenueId, RoomId } from '../shared/ids.js';
import type { Instant } from '../shared/clock.js';

/**
 * Venue — el negocio. Nunca el usuario.
 *
 * Es nuestro cliente que paga. Multi-tenant desde el primer commit: toda
 * entidad del sistema cuelga de un VenueId, sin excepción.
 */
export interface Venue {
  readonly id: VenueId;
  readonly name: string;
  readonly timezone: string; // IANA, ej. 'America/Monterrey'
  readonly createdAt: Instant;
}

/**
 * Room — una sesión, no un lugar.
 *
 * Viernes 8PM en Bar X es una Room. El sábado es otra Room completamente
 * distinta. Esto es lo que hace que la analítica pueda comparar noches entre sí
 * y que un código QR pueda expirar sin arrastrar historial.
 */
export interface Room {
  readonly id: RoomId;
  readonly venueId: VenueId;
  readonly name: string;
  readonly status: RoomStatus;
  readonly joinCode: string; // lo que codifica el QR de la mesa
  readonly openedAt: Instant;
  readonly closedAt: Instant | null;
}

export type RoomStatus = 'scheduled' | 'live' | 'closed';
