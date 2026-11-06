// Modèle de données du guide (§ 10). Dates au format ISO « AAAA-MM-JJ ».
import type { Centimes } from './montants';

export type DateISO = string;

/** Les poches du guide (§ 1). */
export type Poche = 'A' | 'BO' | 'BP' | 'C';

/** Lignes de détail (§ 10, table Actifs, champ sous-poche). */
export type Ligne =
  | 'world'
  | 'emergents'
  | 'europe'
  | 'satellite'
  | 'crypto'
  | 'or'
  | 'panier'
  | 'fun'
  | 'fonds_euros'
  | 'monetaire'
  | 'livret';

/** Les cinq sous-poches de C, auxquelles s'appliquent les bandes (CLAUDE.md). */
export type SousPocheC = 'core' | 'satellite' | 'crypto' | 'matieres_premieres' | 'fun';
export const SOUS_POCHES_C: SousPocheC[] = ['core', 'satellite', 'crypto', 'matieres_premieres', 'fun'];

export type LigneCore = 'world' | 'emergents' | 'europe';
export const LIGNES_CORE: LigneCore[] = ['world', 'emergents', 'europe'];
export type LigneMP = 'or' | 'panier';
export const LIGNES_MP: LigneMP[] = ['or', 'panier'];

/** Rattachement d'une ligne de C à sa sous-poche. */
export function sousPocheDe(ligne: Ligne): SousPocheC | null {
  switch (ligne) {
    case 'world':
    case 'emergents':
    case 'europe':
      return 'core';
    case 'satellite':
      return 'satellite';
    case 'crypto':
      return 'crypto';
    case 'or':
    case 'panier':
      return 'matieres_premieres';
    case 'fun':
      return 'fun';
    default:
      return null;
  }
}

export type TypeCompte = 'livret' | 'pea' | 'assurance_vie' | 'compte_titres' | 'crypto' | 'autre';

export interface Compte {
  id: string;
  nom: string;
  type: TypeCompte;
  etablissement: string;
}

/**
 * « cours » : actif coté (quantité × cours).
 * « valeur » : fonds euros, livret, monétaire : on saisit directement la valeur du contrat.
 */
export type ModeValorisation = 'cours' | 'valeur';

export interface Actif {
  id: string;
  nom: string;
  isin?: string;
  poche: Poche;
  ligne: Ligne;
  compteId?: string;
  fraisCourants?: number; // décimal, 0.002 = 0,2 % par an
  mode: ModeValorisation;
  /** Vrai pour l'ETF MSCI World qui sert au portefeuille fantôme et à l'attente du Satellite. */
  etfWorldReference?: boolean;
  archive?: boolean;
}

export type TypeOperation =
  | 'versement'
  | 'achat'
  | 'vente'
  | 'arbitrage'
  | 'retrait'
  | 'dividende'
  | 'interets'
  | 'frais';

export interface Operation {
  id: string;
  date: DateISO;
  actifId: string;
  type: TypeOperation;
  quantite?: number;
  prix?: number; // en euros, par part
  montant: Centimes; // toujours positif ; le sens vient du type
  frais: Centimes;
  regle?: string; // règle déclenchée (ex. « § 4 flux mensuels »)
  /**
   * Sous-poche de rattachement si différente de celle de l'actif.
   * Ex. : argent du Satellite en attente, placé sur l'ETF World mais compté dans le Satellite (§ 4).
   */
  ligne?: Ligne;
  /** Opération en arbitrage : identifiant commun aux deux jambes. */
  groupe?: string;
}

export interface Valorisation {
  id: string;
  date: DateISO;
  actifId: string;
  quantite?: number;
  cours?: number; // euros par part
  valeur: Centimes;
}

export interface FluxMensuel {
  mois: string; // « AAAA-MM »
  revenuNet: Centimes;
  depensesEssentielles: Centimes;
  epargne: Centimes;
  versA: Centimes;
  versBP: Centimes;
  versBO: Centimes;
  versC: Record<SousPocheC, Centimes>;
  versLignes?: Partial<Record<Ligne, Centimes>>;
}

export interface ReleveIndice {
  id: string;
  date: DateISO;
  valeur: number; // MSCI World en euros
  /** Plus haut historique saisi à la main (utile au démarrage, avant d'avoir un historique). */
  plusHautSaisi?: number;
  /** Valeur de B-Opportunité ce jour-là (sert à figer BO_départ au début d'un épisode). */
  bo?: Centimes;
}

export type StatutFiche = 'watchlist' | 'detenue' | 'vendue';

export interface FicheSatellite {
  id: string;
  actifId: string;
  nom: string;
  score: number; // sur 100
  these: string;
  antiThese: string;
  conditionsSortie: string;
  statut: StatutFiche;
  dateDerniereRevue?: DateISO;
  aRenforcer?: boolean; // action à renforcer décidée lors de la dernière revue (§ 4)
  /** Poids de l'entreprise dans les ETF détenus, en décimal (ex. { idEtfWorld: 0.045 }). */
  poidsDansEtf?: Record<string, number>;
}

export interface OperationFantome {
  id: string;
  date: DateISO;
  montant: Centimes; // positif = achat, négatif = vente
  coursEtf: number;
  parts: number; // positif = achat, négatif = vente
  operationId?: string;
}

export interface Decision {
  id: string;
  date: DateISO;
  actifId?: string;
  action: string;
  montant?: Centimes;
  poidsAvant?: number;
  poidsApres?: number;
  motif: string;
  regle: string;
  prochaineRevue?: DateISO;
}

export type StatutProjet = 'sommeil' | 'actif' | 'realise';

export interface Projet {
  id: string;
  nom: string;
  cout: Centimes;
  frais: Centimes;
  dateUsage: DateISO;
  dateActivation?: DateISO;
  statut: StatutProjet;
}

/** État du Satellite (CLAUDE.md : variable d'état, 25 % par défaut, 15 % après une réduction). */
export interface EtatSatellite {
  cible: number;
  dateReduction?: DateISO;
}

export interface Profil {
  revenuVariable: boolean; // A_MOIS = 4 si vrai, 3 sinon
  depensesEssentielles: Centimes; // mensuelles
}
