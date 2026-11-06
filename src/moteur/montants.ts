// Montants : tous les calculs se font en centimes entiers pour éviter les erreurs d'arrondi.

export type Centimes = number;

/** Convertit des euros (nombre décimal) en centimes entiers. */
export function versCentimes(euros: number): Centimes {
  return Math.round(euros * 100);
}

/** Convertit des centimes en euros. */
export function versEuros(c: Centimes): number {
  return c / 100;
}

const formatEurosFr = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });

/** Format français : 1 234,56 € */
export function formatEuros(c: Centimes): string {
  return formatEurosFr.format(c / 100);
}

/** Format français d'un pourcentage : 0.075 → « 7,5 % ». */
export function formatPct(x: number, decimales = 1): string {
  if (!Number.isFinite(x)) return '—';
  return (
    new Intl.NumberFormat('fr-FR', {
      minimumFractionDigits: decimales,
      maximumFractionDigits: decimales
    }).format(x * 100) + ' %'
  );
}

/** Lit un montant saisi en français (« 1 234,56 ») et renvoie des centimes, ou null. */
export function lireMontant(texte: string): Centimes | null {
  const n = lireNombre(texte);
  return n === null ? null : versCentimes(n);
}

/** Lit un nombre saisi en français (virgule ou point décimal, espaces ignorés). */
export function lireNombre(texte: string): number | null {
  const propre = texte.replace(/[\s  €%]/g, '').replace(',', '.');
  if (propre === '' || propre === '-' ) return null;
  const n = Number(propre);
  return Number.isFinite(n) ? n : null;
}

/**
 * Répartit `total` centimes entre des lignes au prorata de leurs poids.
 * Règle (CLAUDE.md, flux étape 4) : arrondir chaque ligne au centime,
 * puis affecter l'écart d'arrondi à la plus grande ligne.
 * Si tous les poids sont nuls, renvoie 0 partout.
 */
export function repartirAuProrata<K extends string>(
  total: Centimes,
  poids: Record<K, number>
): Record<K, Centimes> {
  const cles = Object.keys(poids) as K[];
  const resultat = {} as Record<K, Centimes>;
  const somme = cles.reduce((s, k) => s + Math.max(0, poids[k]), 0);
  for (const k of cles) resultat[k] = 0;
  if (total === 0 || somme <= 0) return resultat;

  let distribue = 0;
  for (const k of cles) {
    resultat[k] = Math.round((total * Math.max(0, poids[k])) / somme);
    distribue += resultat[k];
  }
  const ecart = total - distribue;
  if (ecart !== 0) {
    // Plus grande ligne = celle qui reçoit le plus.
    let plusGrande = cles[0];
    for (const k of cles) if (resultat[k] > resultat[plusGrande]) plusGrande = k;
    resultat[plusGrande] += ecart;
  }
  return resultat;
}
