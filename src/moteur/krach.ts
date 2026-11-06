// Règle de krach : B-Opportunité vers C (§ 5 du guide).
// Machine à états (CLAUDE.md) : inactif → actif (tranches 0/1/2/3) → inactif.
import type { Centimes } from './montants';
import type { Parametres } from './parametres';
import type { DateISO, ReleveIndice } from './types';

const EPS = 1e-9;

export interface EtatKrach {
  actif: boolean;
  boDepart: Centimes | null; // figé au début de l'épisode
  tranchesDeclenchees: number; // 0 à 3
  dateDebut?: DateISO;
}

export const ETAT_KRACH_INITIAL: EtatKrach = { actif: false, boDepart: null, tranchesDeclenchees: 0 };

export type EvenementKrach =
  | { type: 'debut'; boDepart: Centimes }
  | { type: 'tranche'; numero: number; palier: number; montant: Centimes }
  | { type: 'fin' };

/**
 * Montant de la tranche n (1, 2 ou 3) : BO_départ × K_TRANCHE, arrondi au centime.
 * La dernière tranche prend le solde exact, pour déployer 100 % de BO_départ.
 */
export function montantTranche(p: Parametres, boDepart: Centimes, numero: number): Centimes {
  const nb = p.kPaliers.length;
  const tranche = Math.round((boDepart * p.kTranche.num) / p.kTranche.den);
  if (numero < nb) return tranche;
  return boDepart - tranche * (nb - 1);
}

/** § 5 : baisse = indice / plus haut historique − 1. */
export function calculerBaisse(valeur: number, plusHaut: number): number {
  return plusHaut > 0 ? valeur / plusHaut - 1 : 0;
}

/**
 * Applique un nouveau relevé de baisse à l'état de l'épisode.
 * - Début : la première fois que la baisse atteint le 1er palier (−15 %) ; BO_départ figé.
 * - Chaque palier ne se déclenche qu'une fois par épisode (un saut direct peut en déclencher plusieurs).
 * - Fin : quand la baisse remonte au-dessus de K_FIN (−10 %) ; remise à zéro.
 */
export function avancerKrach(
  p: Parametres,
  etat: EtatKrach,
  baisse: number,
  boActuel: Centimes,
  date?: DateISO
): { etat: EtatKrach; evenements: EvenementKrach[] } {
  const evenements: EvenementKrach[] = [];
  let e = { ...etat };

  if (e.actif && baisse > p.kFin + EPS) {
    evenements.push({ type: 'fin' });
    return { etat: { ...ETAT_KRACH_INITIAL }, evenements };
  }

  if (!e.actif && baisse <= p.kPaliers[0] + EPS) {
    e = { actif: true, boDepart: boActuel, tranchesDeclenchees: 0, dateDebut: date };
    evenements.push({ type: 'debut', boDepart: boActuel });
  }

  if (e.actif && e.boDepart !== null) {
    for (let i = e.tranchesDeclenchees; i < p.kPaliers.length; i++) {
      if (baisse <= p.kPaliers[i] + EPS) {
        const numero = i + 1;
        evenements.push({ type: 'tranche', numero, palier: p.kPaliers[i], montant: montantTranche(p, e.boDepart, numero) });
        e.tranchesDeclenchees = numero;
      } else break;
    }
  }
  return { etat: e, evenements };
}

export interface PointIndice {
  releve: ReleveIndice;
  plusHaut: number;
  baisse: number;
  etat: EtatKrach;
  evenements: EvenementKrach[];
}

/**
 * Rejoue toute la série de relevés (table Indice, § 10) dans l'ordre des dates.
 * Le plus haut est le maximum des valeurs relevées et des plus hauts saisis à la main.
 * `boA(date)` donne la valeur de B-Opportunité à une date (pour figer BO_départ).
 */
export function rejouerIndice(
  p: Parametres,
  releves: ReleveIndice[],
  boA: (date: DateISO, releve: ReleveIndice) => Centimes
): PointIndice[] {
  const tries = [...releves].sort((a, b) => a.date.localeCompare(b.date));
  let plusHaut = 0;
  let source: string | undefined;
  let etat: EtatKrach = { ...ETAT_KRACH_INITIAL };
  const points: PointIndice[] = [];
  for (const r of tries) {
    // Changement de source (saisie manuelle → ETF de référence, par exemple) : les échelles diffèrent,
    // le plus haut repart de cette source. L'état de l'épisode, lui, est conservé.
    if (r.source !== source) plusHaut = 0;
    source = r.source;
    plusHaut = Math.max(plusHaut, r.valeur, r.plusHautSaisi ?? 0);
    const baisse = calculerBaisse(r.valeur, plusHaut);
    const res = avancerKrach(p, etat, baisse, r.bo ?? boA(r.date, r), r.date);
    etat = res.etat;
    points.push({ releve: r, plusHaut, baisse, etat, evenements: res.evenements });
  }
  return points;
}

/** Prochain palier à surveiller et montant de la tranche correspondante. */
export function prochaineTranche(p: Parametres, etat: EtatKrach, boActuel: Centimes) {
  const n = etat.actif ? etat.tranchesDeclenchees : 0;
  if (n >= p.kPaliers.length) return null;
  const base = etat.actif && etat.boDepart !== null ? etat.boDepart : boActuel;
  return { numero: n + 1, palier: p.kPaliers[n], montant: montantTranche(p, base, n + 1) };
}

/** § 5 : conditions à vérifier avant de déployer une tranche. */
export function conditionsTranche(args: {
  A: Centimes;
  cibleA: Centimes;
  poidsCoreApres: number;
  plafondCore: number;
}) {
  return [
    { libelle: 'A est à sa cible', ok: args.A >= args.cibleA },
    { libelle: 'Le Core reste sous le haut de sa bande après le versement', ok: args.poidsCoreApres <= args.plafondCore + EPS },
    { libelle: 'La décision est notée au journal (fait à la confirmation)', ok: true }
  ];
}
