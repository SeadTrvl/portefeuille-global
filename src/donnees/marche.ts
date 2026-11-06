// Données de marché publiques récupérées à la demande (jamais de données personnelles envoyées).
// Taux de change EUR/USD : taux de référence de la Banque centrale européenne.
import type { DateISO } from '../moteur/types';

export interface TauxBCE {
  date: DateISO; // date de publication du taux (jour ouvré ≤ date demandée)
  usdParEur: number;
}

function moinsJours(date: DateISO, n: number): DateISO {
  const t = Date.parse(date + 'T00:00:00Z') - n * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

/**
 * Lit la réponse CSV de l'API de la BCE et renvoie la dernière observation à la date demandée ou avant.
 * Colonnes utiles : TIME_PERIOD et OBS_VALUE.
 */
export function lireCsvBCE(csv: string, date: DateISO): TauxBCE | null {
  const lignes = csv.trim().split(/\r?\n/);
  if (lignes.length < 2) return null;
  const entetes = lignes[0].split(',');
  const iDate = entetes.indexOf('TIME_PERIOD');
  const iValeur = entetes.indexOf('OBS_VALUE');
  if (iDate < 0 || iValeur < 0) return null;
  let meilleur: TauxBCE | null = null;
  for (const l of lignes.slice(1)) {
    const c = l.split(',');
    const d = c[iDate];
    const v = Number(c[iValeur]);
    if (!d || !(v > 0) || d > date) continue;
    if (!meilleur || d > meilleur.date) meilleur = { date: d, usdParEur: v };
  }
  return meilleur;
}

/**
 * Taux de référence BCE EUR/USD à une date (1 € = x $).
 * Le week-end et les jours fériés, on prend le dernier taux publié avant.
 * Source : API de la BCE ; en secours, Frankfurter (qui republie les taux BCE).
 */
export async function tauxBCE(date: DateISO): Promise<TauxBCE> {
  const debut = moinsJours(date, 10);
  try {
    const url = `https://data-api.ecb.europa.eu/service/data/EXR/D.USD.EUR.SP00.A?startPeriod=${debut}&endPeriod=${date}&format=csvdata`;
    const r = await fetch(url);
    if (r.ok) {
      const t = lireCsvBCE(await r.text(), date);
      if (t) return t;
    }
  } catch {
    /* on essaie la source de secours */
  }
  try {
    const r = await fetch(`https://api.frankfurter.dev/v1/${date}?base=EUR&symbols=USD`);
    if (r.ok) {
      const j = (await r.json()) as { date?: string; rates?: { USD?: number } };
      if (j.rates?.USD && j.date) return { date: j.date, usdParEur: j.rates.USD };
    }
  } catch {
    /* rien */
  }
  throw new Error(navigator.onLine === false ? 'Pas de connexion internet.' : `Aucun taux BCE trouvé pour le ${date}.`);
}
