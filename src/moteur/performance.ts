// Suivi des performances par actif et par groupe, façon Portfolio Performance.
// Ce module mesure ; il ne décide rien (aucune règle de gestion ici).
import type { Centimes } from './montants';
import type { Index } from './positions';
import { ligneEffective } from './positions';
import type { Actif, DateISO, Ligne, Operation } from './types';
import { xirr, type FluxDate, ecartJours } from './xirr';

/** Sélection d'un groupe : un actif, une sous-poche, une poche, le total… */
export type Selection = (actif: Actif, ligne: Ligne) => boolean;

/**
 * Apport d'argent dans l'actif du point de vue de l'investisseur (positif = argent mis, négatif = argent récupéré).
 * - achat / versement : montant + frais ;
 * - vente / retrait : −(montant − frais) ;
 * - dividende : −(montant − frais) (argent sorti de la ligne) ;
 * - frais payés à part sur un actif coté (droits de garde) : +montant ;
 * - intérêts et frais d'un contrat en mode « valeur » : internes, déjà dans la valeur.
 */
export function apport(actif: Actif, op: Operation): Centimes {
  switch (op.type) {
    case 'achat':
    case 'versement':
      return op.montant + op.frais;
    case 'vente':
    case 'retrait':
      return -(op.montant - op.frais);
    case 'dividende':
      return -(op.montant - op.frais);
    case 'frais':
      return actif.mode === 'cours' ? op.montant : 0;
    default:
      return 0;
  }
}

export interface StatsActif {
  quantite: number;
  pru: number | null; // euros par part, prix moyen pondéré frais inclus
  dernierCours: { cours: number; date: DateISO } | null;
  dateDernierReleve: DateISO | null;
  investi: Centimes; // prix de revient de ce qui est encore détenu
  valeur: Centimes;
  pvLatente: Centimes;
  pvLatentePct: number | null;
  pvRealisee: Centimes;
  dividendes: Centimes;
  interets: Centimes;
  frais: Centimes;
  /** Gain total = plus-value latente + réalisée + dividendes − frais payés à part. */
  gainTotal: Centimes;
  triDepuisAchat: number | null;
}

/** PRU au prix moyen pondéré (méthode fiscale française), plus-values latente et réalisée. */
export function statsActif(idx: Index, actif: Actif, date: DateISO): StatsActif {
  const ops = idx.ops(actif.id).filter((o) => o.date <= date);
  let q = 0;
  let cout = 0; // centimes
  let pvRealisee = 0;
  let dividendes = 0;
  let interets = 0;
  let frais = 0;
  let fraisAPart = 0;

  for (const op of ops) {
    frais += op.frais;
    if (actif.mode === 'cours') {
      if (op.type === 'achat') {
        q += op.quantite ?? 0;
        cout += op.montant + op.frais;
      } else if (op.type === 'vente') {
        const qv = op.quantite ?? 0;
        const coutSortie = q > 0 ? Math.round((cout * qv) / q) : 0;
        pvRealisee += op.montant - op.frais - coutSortie;
        cout -= coutSortie;
        q -= qv;
      } else if (op.type === 'dividende') {
        dividendes += op.montant - op.frais;
      } else if (op.type === 'frais') {
        frais += op.montant;
        fraisAPart += op.montant;
      }
    } else {
      if (op.type === 'versement' || op.type === 'achat') cout += op.montant + op.frais;
      else if (op.type === 'retrait' || op.type === 'vente') cout -= op.montant;
      else if (op.type === 'interets') interets += op.montant;
      else if (op.type === 'frais') frais += op.montant;
      else if (op.type === 'dividende') dividendes += op.montant - op.frais;
    }
  }
  if (Math.abs(q) < 1e-9) q = 0;
  const valeur = idx.valeur(actif.id, date);
  const pvLatente = valeur - cout;
  const valos = idx.valos(actif.id).filter((v) => v.date <= date);
  const premier = ops[0]?.date;
  const triDepuisAchat = premier ? triGroupe(idx, (a) => a.id === actif.id, premier, date) : null;
  return {
    quantite: q,
    pru: actif.mode === 'cours' && q > 0 ? cout / 100 / q : null,
    dernierCours: actif.mode === 'cours' ? idx.dernierCours(actif.id, date) : null,
    dateDernierReleve: valos.length ? valos[valos.length - 1].date : null,
    investi: cout,
    valeur,
    pvLatente,
    pvLatentePct: cout > 0 ? pvLatente / cout : null,
    pvRealisee,
    dividendes,
    interets,
    frais,
    gainTotal: pvLatente + pvRealisee + dividendes - fraisAPart,
    triDepuisAchat
  };
}

/** Valeur d'un groupe à une date (fin de journée). */
export function valeurGroupe(idx: Index, sel: Selection, date: DateISO): Centimes {
  let v = 0;
  for (const actif of idx.d.actifs) {
    for (const ligne of idx.lignes(actif.id)) {
      if (sel(actif, ligne)) v += idx.valeur(actif.id, date, ligne);
    }
  }
  return v;
}

/** Apports du groupe, datés, dans l'intervalle ]debut ; fin]. */
export function apportsGroupe(idx: Index, sel: Selection, debut: DateISO | null, fin: DateISO): { date: DateISO; montant: Centimes }[] {
  const res: { date: DateISO; montant: Centimes }[] = [];
  for (const actif of idx.d.actifs) {
    for (const op of idx.ops(actif.id)) {
      if (op.date > fin) break;
      if (debut !== null && op.date <= debut) continue;
      if (!sel(actif, ligneEffective(actif, op))) continue;
      const m = apport(actif, op);
      if (m !== 0) res.push({ date: op.date, montant: m });
    }
  }
  return res.sort((a, b) => a.date.localeCompare(b.date));
}

function datesPoints(idx: Index, sel: Selection, debut: DateISO, fin: DateISO): DateISO[] {
  const s = new Set<DateISO>();
  for (const actif of idx.d.actifs) {
    const lignes = idx.lignes(actif.id).filter((l) => sel(actif, l));
    if (lignes.length === 0) continue;
    for (const op of idx.ops(actif.id)) if (op.date > debut && op.date <= fin) s.add(op.date);
    for (const v of idx.valos(actif.id)) if (v.date > debut && v.date <= fin) s.add(v.date);
  }
  s.add(fin);
  return [...s].sort();
}

export interface PointSerie {
  date: DateISO;
  valeur: Centimes;
  investi: Centimes; // valeur de départ + apports cumulés
  indice: number; // performance TWR cumulée, base 100
}

/**
 * Série pour les graphiques et performance pondérée par le temps (TWR, équivalent du TTWROR).
 * On découpe la période à chaque date d'opération ou de relevé :
 * r = (V_fin − apports du jour) / V_début − 1, puis on chaîne les r.
 */
export function serieGroupe(idx: Index, sel: Selection, debut: DateISO, fin: DateISO): PointSerie[] {
  const v0 = valeurGroupe(idx, sel, debut);
  const apports = apportsGroupe(idx, sel, debut, fin);
  const parDate = new Map<DateISO, Centimes>();
  for (const a of apports) parDate.set(a.date, (parDate.get(a.date) ?? 0) + a.montant);

  const points: PointSerie[] = [{ date: debut, valeur: v0, investi: v0, indice: 100 }];
  let precedente = v0;
  let indice = 100;
  let investi = v0;
  for (const d of datesPoints(idx, sel, debut, fin)) {
    const v = valeurGroupe(idx, sel, d);
    const f = parDate.get(d) ?? 0;
    investi += f;
    if (precedente > 0) indice *= (v - f) / precedente;
    precedente = v;
    points.push({ date: d, valeur: v, investi, indice });
  }
  return points;
}

/** Performance TWR sur la période (en décimal) et sa version annualisée. */
export function twrGroupe(idx: Index, sel: Selection, debut: DateISO, fin: DateISO) {
  const s = serieGroupe(idx, sel, debut, fin);
  const total = s[s.length - 1].indice / 100 - 1;
  const ans = ecartJours(debut, fin) / 365;
  const annualise = ans >= 1 ? Math.pow(1 + total, 1 / ans) - 1 : null;
  return { total, annualise };
}

/** TRI (XIRR) du groupe sur la période : valeur de départ investie, apports, valeur finale récupérée. */
export function triGroupe(idx: Index, sel: Selection, debut: DateISO, fin: DateISO): number | null {
  const flux: FluxDate[] = [];
  const v0 = valeurGroupe(idx, sel, debut);
  // Pour « depuis l'achat », on part de la veille : les apports du premier jour sont pris en compte.
  const debutEffectif = v0 === 0 ? veille(debut) : debut;
  if (v0 > 0) flux.push({ date: debut, montant: -v0 });
  for (const a of apportsGroupe(idx, sel, debutEffectif, fin)) flux.push({ date: a.date, montant: -a.montant });
  flux.push({ date: fin, montant: valeurGroupe(idx, sel, fin) });
  return xirr(flux);
}

function veille(d: DateISO): DateISO {
  const t = Date.parse(d + 'T00:00:00Z') - 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

export type Periode = '1M' | '3M' | 'YTD' | '1A' | '3A' | 'MAX';

export const LIBELLES_PERIODES: Record<Periode, string> = {
  '1M': '1 mois',
  '3M': '3 mois',
  YTD: 'Depuis le 1er janvier',
  '1A': '1 an',
  '3A': '3 ans',
  MAX: "Depuis l'achat"
};

/** Date de début d'une période ; « MAX » part de la veille de la première opération du groupe. */
export function debutPeriode(idx: Index, sel: Selection, periode: Periode, fin: DateISO): DateISO {
  const [a, m, j] = fin.split('-').map(Number);
  const moins = (mois: number) => new Date(Date.UTC(a, m - 1 - mois, j)).toISOString().slice(0, 10);
  switch (periode) {
    case '1M':
      return moins(1);
    case '3M':
      return moins(3);
    case 'YTD':
      return `${a - 1}-12-31`;
    case '1A':
      return moins(12);
    case '3A':
      return moins(36);
    case 'MAX': {
      let premiere: DateISO | null = null;
      for (const actif of idx.d.actifs) {
        for (const op of idx.ops(actif.id)) {
          if (sel(actif, ligneEffective(actif, op))) {
            if (!premiere || op.date < premiere) premiere = op.date;
            break;
          }
        }
      }
      return premiere ? veille(premiere) : moins(12);
    }
  }
}
