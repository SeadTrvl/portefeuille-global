// Crédits en cours : capital restant dû, pour afficher le patrimoine avec ou sans les dettes.
// Hors du guide de gestion : aucune règle des poches n'utilise les crédits.
import type { Centimes } from './montants';
import type { DateISO } from './types';

export interface Credit {
  id: string;
  nom: string;
  etablissement?: string;
  /** Prêt amortissable classique : montant emprunté, taux nominal annuel, durée et date de 1re échéance. */
  montant?: Centimes;
  taux?: number; // décimal, 0.035 = 3,5 %
  dureeMois?: number;
  premiereEcheance?: DateISO;
  /** À défaut (ou pour corriger), capital restant dû saisi à la main à une date. */
  crdSaisi?: Centimes;
  dateCrdSaisi?: DateISO;
  assuranceMensuelle?: Centimes;
  /** Compté dans le patrimoine net. */
  inclus: boolean;
}

/** Mensualité hors assurance d'un prêt à échéances constantes. */
export function mensualite(montant: Centimes, taux: number, dureeMois: number): Centimes {
  if (dureeMois <= 0) return 0;
  const r = taux / 12;
  if (r === 0) return Math.round(montant / dureeMois);
  return Math.round((montant * r) / (1 - Math.pow(1 + r, -dureeMois)));
}

/** Nombre d'échéances payées à une date (1re échéance comprise si elle est passée), entre 0 et la durée. */
export function echeancesPayees(premiere: DateISO, date: DateISO, dureeMois: number): number {
  const [a1, m1, j1] = premiere.split('-').map(Number);
  const [a2, m2, j2] = date.split('-').map(Number);
  let k = (a2 - a1) * 12 + (m2 - m1) + (j2 >= j1 ? 1 : 0);
  if (k < 0) k = 0;
  return Math.min(dureeMois, k);
}

/** Capital restant dû après k échéances : P(1+r)^k − M((1+r)^k − 1)/r. */
export function crdApres(montant: Centimes, taux: number, dureeMois: number, k: number): Centimes {
  if (k >= dureeMois) return 0;
  const r = taux / 12;
  if (r === 0) return Math.max(0, Math.round(montant - (montant / dureeMois) * k));
  const M = (montant * r) / (1 - Math.pow(1 + r, -dureeMois));
  const f = Math.pow(1 + r, k);
  return Math.max(0, Math.round(montant * f - (M * (f - 1)) / r));
}

export function estAmortissable(c: Credit): boolean {
  return !!(c.montant && c.dureeMois && c.premiereEcheance && c.taux !== undefined);
}

export interface EtatCredit {
  crd: Centimes;
  mensualite: Centimes | null; // assurance comprise si renseignée
  echeancesRestantes: number | null;
  dateFin: DateISO | null;
  rembourse: number | null; // part du capital déjà remboursée (0 à 1)
  source: 'tableau' | 'saisie';
}

function ajouterMois(date: DateISO, n: number): DateISO {
  const [a, m, j] = date.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1 + n, j)).toISOString().slice(0, 10);
}

/** Situation d'un crédit à une date. La saisie manuelle prime si elle est plus récente que le calcul n'est fiable. */
export function etatCredit(c: Credit, date: DateISO): EtatCredit {
  if (estAmortissable(c)) {
    const k = echeancesPayees(c.premiereEcheance!, date, c.dureeMois!);
    const M = mensualite(c.montant!, c.taux!, c.dureeMois!);
    const calcule = crdApres(c.montant!, c.taux!, c.dureeMois!, k);
    const saisieRecente = c.crdSaisi !== undefined && c.dateCrdSaisi && c.dateCrdSaisi <= date;
    // CRD saisi à la main (relevé de la banque) : on lui applique l'amortissement des échéances payées depuis.
    let crd = calcule;
    if (saisieRecente) {
      const kSaisie = echeancesPayees(c.premiereEcheance!, c.dateCrdSaisi!, c.dureeMois!);
      crd = Math.max(0, c.crdSaisi! - (crdApres(c.montant!, c.taux!, c.dureeMois!, kSaisie) - calcule));
    }
    return {
      crd,
      mensualite: M + (c.assuranceMensuelle ?? 0),
      echeancesRestantes: c.dureeMois! - k,
      dateFin: ajouterMois(c.premiereEcheance!, c.dureeMois! - 1),
      rembourse: c.montant! > 0 ? 1 - crd / c.montant! : null,
      source: saisieRecente ? 'saisie' : 'tableau'
    };
  }
  return { crd: c.crdSaisi ?? 0, mensualite: c.assuranceMensuelle ?? null, echeancesRestantes: null, dateFin: null, rembourse: null, source: 'saisie' };
}

/** Total des capitaux restant dus des crédits inclus. */
export function totalCredits(credits: Credit[], date: DateISO): Centimes {
  return credits.filter((c) => c.inclus).reduce((s, c) => s + etatCredit(c, date).crd, 0);
}
