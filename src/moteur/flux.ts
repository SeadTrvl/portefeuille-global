// Algorithme des flux mensuels (§ 4 du guide).
import { repartirAuProrata, type Centimes } from './montants';
import type { LigneCore, LigneMP, SousPocheC } from './types';
import { SOUS_POCHES_C } from './types';

export interface EntreeFlux {
  epargne: Centimes; // E
  A: Centimes;
  cibleA: Centimes;
  /** Effort B-Projet du mois si un projet est actif ; null sinon (étape 2 ignorée). */
  effortBP: Centimes | null;
  BO: Centimes;
  cibleBO: Centimes;
  /** Pendant un épisode de krach, l'étape 3 est suspendue (§ 5). */
  krachActif: boolean;
  valeursC: Record<SousPocheC, Centimes>;
  ciblesC: Record<SousPocheC, number>;
  valeursCore: Record<LigneCore, Centimes>;
  ciblesCore: Record<LigneCore, number>; // en % de C
  valeursMP: Record<LigneMP, Centimes>;
  ciblesMP: Record<LigneMP, number>; // en % de C
}

export interface ResultatFlux {
  versA: Centimes;
  versBP: Centimes;
  versBO: Centimes;
  resteC: Centimes;
  versC: Record<SousPocheC, Centimes>;
  versCore: Record<LigneCore, Centimes>;
  versMP: Record<LigneMP, Centimes>;
  /** Détail des manques de l'étape 4, pour l'affichage. */
  manquesC: Record<SousPocheC, Centimes>;
}

/**
 * § 4 étape 4 : répartition au prorata des manques.
 * manque_i = max(0 ; cible_i × (base + reste) − valeur_i) ; vers_i = reste × manque_i / Σ manques.
 * Si Σ manques = 0 : prorata des cibles (CLAUDE.md). Arrondi au centime, écart à la plus grande ligne.
 */
export function repartirSelonManques<K extends string>(
  reste: Centimes,
  base: Centimes,
  valeurs: Record<K, Centimes>,
  cibles: Record<K, number>
): { vers: Record<K, Centimes>; manques: Record<K, Centimes> } {
  const cles = Object.keys(cibles) as K[];
  const manques = {} as Record<K, Centimes>;
  let somme = 0;
  for (const k of cles) {
    manques[k] = Math.max(0, Math.round(cibles[k] * (base + reste)) - (valeurs[k] ?? 0));
    somme += manques[k];
  }
  const vers = somme > 0 ? repartirAuProrata(reste, manques) : repartirAuProrata(reste, cibles);
  return { vers, manques };
}

export function repartirEpargne(e: EntreeFlux): ResultatFlux {
  let reste = Math.max(0, e.epargne);

  // Étape 1 — A : vers_A = min(E ; max(0 ; cible_A − A)).
  const versA = Math.min(reste, Math.max(0, e.cibleA - e.A));
  reste -= versA;

  // Étape 2 — B-Projet, seulement s'il est actif : vers_BP = min(reste ; effort_BP).
  const versBP = e.effortBP === null ? 0 : Math.min(reste, Math.max(0, e.effortBP));
  reste -= versBP;

  // Étape 3 — B-Opportunité, hors épisode de krach : vers_BO = min(reste ; max(0 ; cible_BO − BO)).
  const versBO = e.krachActif ? 0 : Math.min(reste, Math.max(0, e.cibleBO - e.BO));
  reste -= versBO;

  // Étape 4 — C : prorata des manques des sous-poches.
  const C = SOUS_POCHES_C.reduce((s, k) => s + e.valeursC[k], 0);
  const { vers: versC, manques: manquesC } = repartirSelonManques(reste, C, e.valeursC, e.ciblesC);

  // La même règle répartit le Core entre World / émergents / Europe (cibles en % de C),
  // et les matières premières entre or et panier.
  const versCore = repartirSelonManques(versC.core, C + reste - versC.core, e.valeursCore, e.ciblesCore).vers;
  const versMP = repartirSelonManques(versC.matieres_premieres, C + reste - versC.matieres_premieres, e.valeursMP, e.ciblesMP).vers;

  return { versA, versBP, versBO, resteC: reste, versC, versCore, versMP, manquesC };
}
