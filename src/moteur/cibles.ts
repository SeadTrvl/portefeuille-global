// Cibles des poches (§ 3 du guide).
import type { Centimes } from './montants';
import type { Parametres } from './parametres';
import type { DateISO } from './types';

/** § 3 A : cible_A = dépenses essentielles mensuelles × A_MOIS. */
export function cibleA(depensesMensuelles: Centimes, aMois: number): Centimes {
  return Math.round(depensesMensuelles * aMois);
}

/** § 3 B-Opportunité : cible_BO = max(BO_MIN ; BO_CIBLE × C). */
export function cibleBO(p: Parametres, C: Centimes): Centimes {
  return Math.max(p.boMin, Math.round(p.boCible * C));
}

/** § 3 B-Opportunité : plafond_BO = max(BO_MIN ; BO_PLAFOND × C). */
export function plafondBO(p: Parametres, C: Centimes): Centimes {
  return Math.max(p.boMin, Math.round(p.boPlafond * C));
}

/** § 3 B-Projet : montant_BP = (coût à financer + frais) × (1 + BP_MARGE). */
export function montantBP(p: Parametres, cout: Centimes, frais: Centimes): Centimes {
  return Math.round((cout + frais) * (1 + p.bpMarge));
}

/** Nombre de mois restants entre le mois de `aujourdhui` (inclus) et celui de la date d'usage (exclu), au moins 1. */
export function moisRestants(aujourdhui: DateISO, dateUsage: DateISO): number {
  const [a1, m1] = aujourdhui.split('-').map(Number);
  const [a2, m2] = dateUsage.split('-').map(Number);
  return Math.max(1, (a2 - a1) * 12 + (m2 - m1));
}

/** § 3 B-Projet : effort_BP = max(0 ; montant_BP − BP) / mois restants. */
export function effortBP(montant: Centimes, BP: Centimes, mois: number): Centimes {
  return Math.round(Math.max(0, montant - BP) / Math.max(1, mois));
}

/** § 3 B-Opportunité : part attendue en fonds monétaire au-delà du seuil (consigne de placement). */
export function monetaireAttenduBO(p: Parametres, BO: Centimes): Centimes {
  if (BO <= p.boSeuilMone) return 0;
  return Math.round((BO * p.boPartMone.num) / p.boPartMone.den);
}
