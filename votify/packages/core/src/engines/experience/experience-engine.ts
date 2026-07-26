import type { Instant } from '../../shared/clock.js';
import type { RoomId, VenueId } from '../../shared/ids.js';
import type { MomentMechanic, MomentOrigin } from '../../domain/moment.js';

/**
 * EXPERIENCE ENGINE — Engine #2.
 *
 * Su trabajo NO es abrir rondas. Es decidir **qué Momento lanzar**. Por eso
 * Moment tenía que ser una entidad de primera clase: sin ella, este motor no
 * tendría sustantivo sobre el cual operar.
 *
 * NOTA DE ARQUITECTURA — por qué esto no usa IA todavía:
 *
 * v2.0 pide diseñarlo "pensando en IA". Diseñado, sí; construido con IA, no —
 * y la razón es de negocio, no de pereza. Un modelo necesita datos de
 * entrenamiento que hoy no existen: nadie ha usado Votify en un bar real. Un
 * modelo entrenado con cero noches reales produce sugerencias inventadas, y una
 * sugerencia mala en vivo le cuesta al venue una hora muerta.
 *
 * La solución correcta es la interfaz `ExperienceStrategy`. Hoy la implementa un
 * conjunto de reglas legibles y auditables. Cuando existan mil noches
 * registradas, se escribe `AIExperienceStrategy` con la misma firma y se cambia
 * la inyección. Cero refactor.
 *
 * Y hay un detalle que hace posible esa transición: cada `Suggestion` guarda su
 * `rationale` y su `confidence`, y cada Moment guarda su `origin`. Es decir, el
 * sistema registra desde el día uno qué sugirió, por qué, y si funcionó. Eso ES
 * el dataset de entrenamiento. Construirlo ahora es lo que hace que la IA sea
 * posible después.
 */

/** Estado observable de la sala. La entrada de toda decisión. */
export interface ExperienceSignals {
  readonly venueId: VenueId;
  readonly roomId: RoomId;
  readonly now: Instant;
  /** Hora local del venue, 0-23. Precalculada: el núcleo no maneja zonas horarias. */
  readonly localHour: number;
  readonly participantsOnline: number;
  /** Participantes que votaron en el último Momento / total presentes. 0..1 */
  readonly participationRate: number;
  readonly msSinceLastInteraction: number;
  readonly msSinceLastMoment: number;
  readonly recentMomentKinds: readonly string[];
  readonly activePromotions: number;
}

export interface Suggestion {
  readonly kind: string;
  readonly mechanic: MomentMechanic;
  readonly title: string;
  /** Legible por un humano. Se muestra al host y se archiva para medir aciertos. */
  readonly rationale: string;
  /** 0..1 */
  readonly confidence: number;
}

export interface ExperienceStrategy {
  readonly id: string;
  suggest(signals: ExperienceSignals): readonly Suggestion[];
}

/**
 * Estrategia por reglas. Explicable, determinista, y depurable por un humano a
 * las 11 de la noche en un bar — cosa que un modelo no es.
 */
export function createRuleBasedStrategy(config: RuleConfig = DEFAULT_RULES): ExperienceStrategy {
  return {
    id: 'rules.v1',
    suggest(signals) {
      const out: Suggestion[] = [];

      if (signals.msSinceLastInteraction > config.idleMs && signals.participantsOnline >= config.minCrowdForRescue) {
        out.push({
          kind: 'challenge',
          mechanic: 'vote',
          title: 'Dinámica sorpresa',
          rationale: `Sin interacción hace ${Math.round(signals.msSinceLastInteraction / 1000)}s con ${signals.participantsOnline} personas conectadas.`,
          confidence: 0.7,
        });
      }

      if (signals.participationRate < config.lowParticipation && signals.participantsOnline >= config.minCrowdForRescue) {
        out.push({
          kind: 'promo',
          mechanic: 'vote',
          title: 'Promoción a votación',
          rationale: `Participación baja (${Math.round(signals.participationRate * 100)}%): una promoción suele recuperar atención.`,
          confidence: 0.6,
        });
      }

      if (signals.participantsOnline >= config.bigCrowd && signals.activePromotions === 0) {
        out.push({
          kind: 'promo',
          mechanic: 'vote',
          title: 'Promoción para sala llena',
          rationale: `${signals.participantsOnline} personas conectadas y ninguna promoción activa.`,
          confidence: 0.75,
        });
      }

      if (config.peakHours.includes(signals.localHour) && !signals.recentMomentKinds.includes('dj_battle')) {
        out.push({
          kind: 'dj_battle',
          mechanic: 'vote',
          title: 'DJ Battle',
          rationale: `Hora pico local (${signals.localHour}:00) y no ha habido DJ Battle esta noche.`,
          confidence: 0.65,
        });
      }

      // Nunca repetir el tipo de Momento inmediatamente anterior: la repetición
      // es la forma más rápida de que la gente cierre la app.
      const last = signals.recentMomentKinds[0];
      const filtered = last === undefined ? out : out.filter((s) => s.kind !== last);

      return filtered.sort((a, b) => b.confidence - a.confidence);
    },
  };
}

export interface RuleConfig {
  readonly idleMs: number;
  readonly lowParticipation: number;
  readonly minCrowdForRescue: number;
  readonly bigCrowd: number;
  readonly peakHours: readonly number[];
}

export const DEFAULT_RULES: RuleConfig = {
  idleMs: 4 * 60 * 1000,
  lowParticipation: 0.15,
  minCrowdForRescue: 10,
  bigCrowd: 60,
  peakHours: [23, 0],
};

/** Convierte una sugerencia en el `origin` que se archiva junto al Moment. */
export function suggestionOrigin(s: Suggestion): MomentOrigin {
  return { by: 'experience_engine', rationale: s.rationale, confidence: s.confidence };
}
