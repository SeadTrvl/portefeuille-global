// Valeur des actifs, poches et sous-poches à partir des opérations et des valorisations (§ 10, calcul 1).
import type { Centimes } from './montants';
import type { Actif, DateISO, Ligne, LigneCore, LigneMP, Operation, Poche, SousPocheC, Valorisation } from './types';
import { LIGNES_CORE, LIGNES_MP, SOUS_POCHES_C, sousPocheDe } from './types';

export interface Donnees {
  actifs: Actif[];
  operations: Operation[];
  valorisations: Valorisation[];
}

/** Ligne de rattachement d'une opération (CLAUDE.md : champ sous_poche, ex. Satellite en attente sur l'ETF World). */
export function ligneEffective(actif: Actif, op: Operation): Ligne {
  return op.ligne ?? actif.ligne;
}

function trierParDate<T extends { date: DateISO }>(liste: T[]): T[] {
  return [...liste].sort((a, b) => a.date.localeCompare(b.date));
}

/** Indexe opérations et valorisations par actif, triées par date. */
export class Index {
  opsParActif = new Map<string, Operation[]>();
  valosParActif = new Map<string, Valorisation[]>();
  actifsParId = new Map<string, Actif>();

  constructor(public d: Donnees) {
    for (const a of d.actifs) this.actifsParId.set(a.id, a);
    for (const op of trierParDate(d.operations)) {
      if (!this.opsParActif.has(op.actifId)) this.opsParActif.set(op.actifId, []);
      this.opsParActif.get(op.actifId)!.push(op);
    }
    for (const v of trierParDate(d.valorisations)) {
      if (!this.valosParActif.has(v.actifId)) this.valosParActif.set(v.actifId, []);
      this.valosParActif.get(v.actifId)!.push(v);
    }
  }

  ops(actifId: string): Operation[] {
    return this.opsParActif.get(actifId) ?? [];
  }

  valos(actifId: string): Valorisation[] {
    return this.valosParActif.get(actifId) ?? [];
  }

  /** Dernier cours connu à une date : dernière valorisation ou, à défaut, prix de la dernière opération. */
  dernierCours(actifId: string, date: DateISO): { cours: number; date: DateISO } | null {
    let meilleur: { cours: number; date: DateISO } | null = null;
    for (const v of this.valos(actifId)) {
      if (v.date > date) break;
      if (v.cours !== undefined) meilleur = { cours: v.cours, date: v.date };
    }
    for (const op of this.ops(actifId)) {
      if (op.date > date) break;
      if (op.prix !== undefined && (op.type === 'achat' || op.type === 'vente')) {
        if (!meilleur || op.date > meilleur.date) meilleur = { cours: op.prix, date: op.date };
      }
    }
    return meilleur;
  }

  /** Quantité détenue à une date, éventuellement limitée à une ligne de rattachement. */
  quantite(actifId: string, date: DateISO, ligne?: Ligne): number {
    const actif = this.actifsParId.get(actifId);
    if (!actif) return 0;
    let q = 0;
    for (const op of this.ops(actifId)) {
      if (op.date > date) break;
      if (ligne && ligneEffective(actif, op) !== ligne) continue;
      if (op.type === 'achat') q += op.quantite ?? 0;
      else if (op.type === 'vente') q -= op.quantite ?? 0;
    }
    return Math.abs(q) < 1e-9 ? 0 : q;
  }

  /** Lignes de rattachement présentes sur un actif (une seule hors cas du Satellite en attente). */
  lignes(actifId: string): Ligne[] {
    const actif = this.actifsParId.get(actifId);
    if (!actif) return [];
    const s = new Set<Ligne>([actif.ligne]);
    for (const op of this.ops(actifId)) s.add(ligneEffective(actif, op));
    return [...s];
  }

  /**
   * Valeur d'un actif à une date (en fin de journée).
   * - Mode « cours » : quantité × dernier cours connu.
   * - Mode « valeur » : dernière valeur relevée + mouvements postérieurs au relevé.
   */
  valeur(actifId: string, date: DateISO, ligne?: Ligne): Centimes {
    const actif = this.actifsParId.get(actifId);
    if (!actif) return 0;
    if (actif.mode === 'cours') {
      const q = this.quantite(actifId, date, ligne);
      if (q === 0) return 0;
      const c = this.dernierCours(actifId, date);
      return c ? Math.round(q * c.cours * 100) : 0;
    }
    if (ligne && ligne !== actif.ligne) return 0;
    let base = 0;
    let dateBase = '';
    for (const v of this.valos(actifId)) {
      if (v.date > date) break;
      base = v.valeur;
      dateBase = v.date;
    }
    for (const op of this.ops(actifId)) {
      if (op.date > date) break;
      if (op.date <= dateBase) continue;
      base += effetSurValeur(op);
    }
    return base;
  }
}

/** Effet d'une opération sur la valeur d'un contrat en mode « valeur » (fonds euros, livret, monétaire). */
export function effetSurValeur(op: Operation): Centimes {
  switch (op.type) {
    case 'versement':
    case 'achat':
    case 'interets':
      return op.montant;
    case 'retrait':
    case 'vente':
    case 'frais':
      return -op.montant;
    default:
      return 0;
  }
}

export interface Position {
  actif: Actif;
  ligne: Ligne;
  poche: Poche;
  quantite: number;
  valeur: Centimes;
}

/** Toutes les positions non nulles à une date, découpées par ligne de rattachement. */
export function positionsA(idx: Index, date: DateISO): Position[] {
  const res: Position[] = [];
  for (const actif of idx.d.actifs) {
    for (const ligne of idx.lignes(actif.id)) {
      const valeur = idx.valeur(actif.id, date, ligne);
      const quantite = actif.mode === 'cours' ? idx.quantite(actif.id, date, ligne) : 0;
      if (valeur === 0 && quantite === 0) continue;
      // L'argent rattaché à une ligne de C reste dans C.
      const poche: Poche = sousPocheDe(ligne) ? 'C' : actif.poche;
      res.push({ actif, ligne, poche, quantite, valeur });
    }
  }
  return res;
}

export interface Synthese {
  parPoche: Record<Poche, Centimes>;
  C: Centimes;
  parSousPoche: Record<SousPocheC, Centimes>;
  core: Record<LigneCore, Centimes>;
  mp: Record<LigneMP, Centimes>;
  boMonetaire: Centimes;
  total: Centimes;
}

/** § 10 calcul 1 : valeur de chaque poche et sous-poche. */
export function synthese(positions: Position[]): Synthese {
  const parPoche: Record<Poche, Centimes> = { A: 0, BO: 0, BP: 0, C: 0 };
  const parSousPoche = Object.fromEntries(SOUS_POCHES_C.map((k) => [k, 0])) as Record<SousPocheC, Centimes>;
  const core = Object.fromEntries(LIGNES_CORE.map((k) => [k, 0])) as Record<LigneCore, Centimes>;
  const mp = Object.fromEntries(LIGNES_MP.map((k) => [k, 0])) as Record<LigneMP, Centimes>;
  let boMonetaire = 0;
  for (const p of positions) {
    parPoche[p.poche] += p.valeur;
    const sp = sousPocheDe(p.ligne);
    if (p.poche === 'C' && sp) parSousPoche[sp] += p.valeur;
    if (p.poche === 'C' && (LIGNES_CORE as string[]).includes(p.ligne)) core[p.ligne as LigneCore] += p.valeur;
    if (p.poche === 'C' && (LIGNES_MP as string[]).includes(p.ligne)) mp[p.ligne as LigneMP] += p.valeur;
    if (p.poche === 'BO' && p.ligne === 'monetaire') boMonetaire += p.valeur;
  }
  const C = parPoche.C;
  return { parPoche, C, parSousPoche, core, mp, boMonetaire, total: parPoche.A + parPoche.BO + parPoche.BP + C };
}
