// Paramètres du guide (§ 2), lus depuis parametres.json : aucune valeur n'est écrite en dur ailleurs.
import brut from '../../parametres.json';
import type { LigneCore, LigneMP, SousPocheC } from './types';

export interface Fraction {
  num: number;
  den: number;
}

type NombreOuFraction = number | Fraction;

export interface ParametresBruts {
  A_MOIS: { revenu_stable: number; revenu_variable: number };
  BO_MIN: number;
  BO_CIBLE: number;
  BO_PLAFOND: number;
  BO_SEUIL_MONE: number;
  BO_PART_MONE: NombreOuFraction;
  K_PALIERS: number[];
  K_TRANCHE: NombreOuFraction;
  K_FIN: number;
  BP_MARGE: number;
  SAT_SCORE_MIN: number;
  SAT_ENTREE: number;
  SAT_NORMALE: [number, number];
  SAT_MAX: number;
  SAT_EXPO_REVUE: number;
  SAT_FENETRE_ANS: number;
  SAT_ECART: number;
  SAT_CIBLE_DEFAUT: number;
  SAT_PLANCHER: number;
  SAT_PLAFOND: number;
  WATCHLIST_MAX: number;
  FRAIS_CIBLE: number;
  FRAIS_ALERTE: number;
  EPARGNE_TAUX: number | null;
  C_SOUS_POCHES: {
    core: { cible: number; bande: [number, number]; lignes: Record<'msci_world' | 'emergents' | 'europe', number> };
    satellite: { cible: number; bande: [number, number] };
    crypto: { cible: number; bande: [number, number]; plafond_dur: number };
    matieres_premieres: { cible: number; bande: [number, number]; lignes: Record<'or' | 'panier', number> };
    fun: { cible: number; bande: [number, number] };
  };
}

/** Paramètres prêts à l'emploi : fractions converties, montants en centimes. */
export interface Parametres {
  aMoisStable: number;
  aMoisVariable: number;
  boMin: number; // centimes
  boCible: number;
  boPlafond: number;
  boSeuilMone: number; // centimes
  boPartMone: Fraction;
  kPaliers: number[];
  kTranche: Fraction;
  kFin: number;
  bpMarge: number;
  satScoreMin: number;
  satEntree: number;
  satNormale: [number, number];
  satMax: number;
  satExpoRevue: number;
  satFenetreAns: number;
  satEcart: number;
  satCibleDefaut: number;
  satPlancher: number;
  satPlafond: number;
  watchlistMax: number;
  fraisCible: number;
  fraisAlerte: number;
  epargneTaux: number | null;
  /** Cibles et bandes des sous-poches de C, avec la cible Satellite par défaut. */
  ciblesC: Record<SousPocheC, number>;
  bandesC: Record<SousPocheC, [number, number]>;
  cryptoPlafondDur: number;
  /** Cibles des lignes internes, en % de C (CLAUDE.md). */
  ciblesCore: Record<LigneCore, number>;
  ciblesMP: Record<LigneMP, number>;
}

function versFraction(v: NombreOuFraction): Fraction {
  if (typeof v === 'number') return { num: v, den: 1 };
  return v;
}

export function valeurFraction(f: Fraction): number {
  return f.num / f.den;
}

export function lireParametres(p: ParametresBruts): Parametres {
  const c = p.C_SOUS_POCHES;
  return {
    aMoisStable: p.A_MOIS.revenu_stable,
    aMoisVariable: p.A_MOIS.revenu_variable,
    boMin: Math.round(p.BO_MIN * 100),
    boCible: p.BO_CIBLE,
    boPlafond: p.BO_PLAFOND,
    boSeuilMone: Math.round(p.BO_SEUIL_MONE * 100),
    boPartMone: versFraction(p.BO_PART_MONE),
    kPaliers: [...p.K_PALIERS].sort((a, b) => b - a), // −15 %, −25 %, −35 %
    kTranche: versFraction(p.K_TRANCHE),
    kFin: p.K_FIN,
    bpMarge: p.BP_MARGE,
    satScoreMin: p.SAT_SCORE_MIN,
    satEntree: p.SAT_ENTREE,
    satNormale: p.SAT_NORMALE,
    satMax: p.SAT_MAX,
    satExpoRevue: p.SAT_EXPO_REVUE,
    satFenetreAns: p.SAT_FENETRE_ANS,
    satEcart: p.SAT_ECART,
    satCibleDefaut: p.SAT_CIBLE_DEFAUT,
    satPlancher: p.SAT_PLANCHER,
    satPlafond: p.SAT_PLAFOND,
    watchlistMax: p.WATCHLIST_MAX,
    fraisCible: p.FRAIS_CIBLE,
    fraisAlerte: p.FRAIS_ALERTE,
    epargneTaux: p.EPARGNE_TAUX,
    ciblesC: {
      core: c.core.cible,
      satellite: c.satellite.cible,
      crypto: c.crypto.cible,
      matieres_premieres: c.matieres_premieres.cible,
      fun: c.fun.cible
    },
    bandesC: {
      core: c.core.bande,
      satellite: c.satellite.bande,
      crypto: c.crypto.bande,
      matieres_premieres: c.matieres_premieres.bande,
      fun: c.fun.bande
    },
    cryptoPlafondDur: c.crypto.plafond_dur,
    ciblesCore: { world: c.core.lignes.msci_world, emergents: c.core.lignes.emergents, europe: c.core.lignes.europe },
    ciblesMP: { or: c.matieres_premieres.lignes.or, panier: c.matieres_premieres.lignes.panier }
  };
}

export const PARAMETRES_BRUTS_DEFAUT = brut as unknown as ParametresBruts;
export const PARAMETRES_DEFAUT: Parametres = lireParametres(PARAMETRES_BRUTS_DEFAUT);

/** A_MOIS selon le profil (§ 2). */
export function aMois(p: Parametres, revenuVariable: boolean): number {
  return revenuVariable ? p.aMoisVariable : p.aMoisStable;
}

/**
 * Cibles courantes de C selon la cible du Satellite (CLAUDE.md) :
 * si le Satellite passe à 15 %, les 10 points vont au Core,
 * au prorata de World / émergents / Europe.
 */
export function ciblesCourantes(p: Parametres, cibleSatellite: number) {
  const difference = p.ciblesC.satellite - cibleSatellite;
  const core = p.ciblesC.core + difference;
  const facteur = core / p.ciblesC.core;
  const ciblesC: Record<SousPocheC, number> = { ...p.ciblesC, satellite: cibleSatellite, core };
  const ciblesCore: Record<LigneCore, number> = {
    world: p.ciblesCore.world * facteur,
    emergents: p.ciblesCore.emergents * facteur,
    europe: p.ciblesCore.europe * facteur
  };
  return { ciblesC, ciblesCore, ciblesMP: { ...p.ciblesMP } };
}
