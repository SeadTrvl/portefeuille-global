// Taux de rendement interne sur flux datés (XIRR / TRI.PAIEMENTS), utilisé aux § 7 et § 9.
import type { DateISO } from './types';

export interface FluxDate {
  date: DateISO;
  montant: number; // négatif = argent investi, positif = argent récupéré (ou valeur finale)
}

const JOUR = 86_400_000;

function jours(a: DateISO, b: DateISO): number {
  return (Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / JOUR;
}

/**
 * Renvoie le taux annuel r tel que Σ montant_i / (1 + r)^(jours_i / 365) = 0,
 * ou null si le calcul est impossible (pas de flux de signes opposés, pas de solution).
 */
export function xirr(flux: FluxDate[]): number | null {
  const f = flux.filter((x) => x.montant !== 0).sort((a, b) => a.date.localeCompare(b.date));
  if (f.length < 2) return null;
  if (!f.some((x) => x.montant < 0) || !f.some((x) => x.montant > 0)) return null;
  const d0 = f[0].date;
  const t = f.map((x) => jours(d0, x.date) / 365);
  if (t[t.length - 1] <= 0) return null;

  const vna = (r: number) => f.reduce((s, x, i) => s + x.montant / Math.pow(1 + r, t[i]), 0);
  const derivee = (r: number) => f.reduce((s, x, i) => s - (t[i] * x.montant) / Math.pow(1 + r, t[i] + 1), 0);

  // Newton depuis 10 %.
  let r = 0.1;
  for (let i = 0; i < 100; i++) {
    const v = vna(r);
    const d = derivee(r);
    if (!Number.isFinite(v) || !Number.isFinite(d) || d === 0) break;
    const suivant = r - v / d;
    if (suivant <= -0.999999) break;
    if (Math.abs(suivant - r) < 1e-10) return suivant;
    r = suivant;
  }

  // Repli par dichotomie sur ]−99,99 % ; 1 000 %].
  let bas = -0.9999;
  let haut = 10;
  let vBas = vna(bas);
  const vHaut = vna(haut);
  if (Number.isNaN(vBas) || Number.isNaN(vHaut) || vBas * vHaut > 0) return null;
  for (let i = 0; i < 300; i++) {
    const milieu = (bas + haut) / 2;
    const vMilieu = vna(milieu);
    if (Math.abs(vMilieu) < 1e-9 || haut - bas < 1e-12) return milieu;
    if (vBas * vMilieu < 0) haut = milieu;
    else {
      bas = milieu;
      vBas = vMilieu;
    }
  }
  return (bas + haut) / 2;
}

export function ajouterAnnees(date: DateISO, annees: number): DateISO {
  const [a, m, j] = date.split('-').map(Number);
  const d = new Date(Date.UTC(a + annees, m - 1, j));
  return d.toISOString().slice(0, 10);
}

export function ajouterMois(date: DateISO, mois: number): DateISO {
  const [a, m, j] = date.split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 1 + mois, j));
  return d.toISOString().slice(0, 10);
}

export function ecartJours(a: DateISO, b: DateISO): number {
  return jours(a, b);
}
