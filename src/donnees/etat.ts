// État complet de l'application : les 11 tables du § 10, plus le profil et les réglages.
// C'est exactement ce qui est écrit dans portefeuille.json sur iCloud Drive.
import { PARAMETRES_BRUTS_DEFAUT, type ParametresBruts } from '../moteur/parametres';
import type {
  Actif,
  Compte,
  Decision,
  EtatSatellite,
  FicheSatellite,
  FluxMensuel,
  Operation,
  Profil,
  TauxChange,
  Projet,
  ReleveIndice,
  Valorisation
} from '../moteur/types';
import type { Credit } from '../moteur/credits';

export const VERSION_SCHEMA = 1;

/** Copie profonde compatible avec les anciens Safari (structuredClone n'existe qu'à partir d'iOS 15.4). */
export function copie<T>(x: T): T {
  return typeof structuredClone === 'function' ? structuredClone(x) : (JSON.parse(JSON.stringify(x)) as T);
}

/** Dernier élément d'un tableau (Array.prototype.at n'existe qu'à partir d'iOS 15.4). */
export function dernierDe<T>(t: T[]): T | undefined {
  return t.length ? t[t.length - 1] : undefined;
}

export interface Etat {
  version_schema: number;
  modifie_le: string; // horodatage ISO complet
  appareil: string;
  parametres: ParametresBruts;
  parametresModifies: Record<string, string>; // code → date de modification
  profil: Profil;
  comptes: Compte[];
  actifs: Actif[];
  operations: Operation[];
  valorisations: Valorisation[];
  /** Taux EUR/USD saisis à la main (1 € = x $). */
  tauxChange: TauxChange[];
  fluxMensuels: FluxMensuel[];
  indice: ReleveIndice[];
  fiches: FicheSatellite[];
  journal: Decision[];
  projets: Projet[];
  etatSatellite: EtatSatellite;
  /** Revues cochées : clé « 2026-T4:item » ou « 2026-A:item ». */
  revues: Record<string, boolean>;
  /** Crédits en cours (hors guide : seulement pour le patrimoine net). */
  credits: Credit[];
  preferences: { inclureCredits: boolean };
}

export function etatVide(): Etat {
  return {
    version_schema: VERSION_SCHEMA,
    modifie_le: new Date(0).toISOString(),
    appareil: nomAppareil(),
    parametres: copie(PARAMETRES_BRUTS_DEFAUT),
    parametresModifies: {},
    profil: { revenuVariable: false, depensesEssentielles: 0 },
    comptes: [],
    actifs: [],
    operations: [],
    valorisations: [],
    tauxChange: [],
    fluxMensuels: [],
    indice: [],
    fiches: [],
    journal: [],
    projets: [],
    etatSatellite: { cible: PARAMETRES_BRUTS_DEFAUT.SAT_CIBLE_DEFAUT },
    revues: {},
    credits: [],
    preferences: { inclureCredits: true }
  };
}

export function nomAppareil(): string {
  if (typeof navigator === 'undefined') return 'inconnu';
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'iPad';
  if (/Macintosh/.test(ua)) return 'Mac';
  return 'Navigateur';
}

export function nouvelId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/** Sérialise l'état pour le fichier iCloud. */
export function serialiser(etat: Etat): string {
  return JSON.stringify(etat, null, 1);
}

export class ErreurImport extends Error {}

/** Lit un fichier portefeuille.json ; complète les champs manquants (fichiers plus anciens). */
export function deserialiser(texte: string): Etat {
  let brut: unknown;
  try {
    brut = JSON.parse(texte);
  } catch {
    throw new ErreurImport("Ce fichier n'est pas un fichier JSON valide.");
  }
  if (!brut || typeof brut !== 'object' || !('version_schema' in brut)) {
    throw new ErreurImport("Ce fichier n'est pas un fichier Portefeuille Global.");
  }
  const e = brut as Partial<Etat>;
  if ((e.version_schema ?? 0) > VERSION_SCHEMA) {
    throw new ErreurImport("Ce fichier vient d'une version plus récente de l'application : mettez-la à jour.");
  }
  const vide = etatVide();
  return { ...vide, ...e, parametres: { ...vide.parametres, ...(e.parametres ?? {}) }, version_schema: VERSION_SCHEMA } as Etat;
}
