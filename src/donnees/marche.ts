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

/** Relais privé (Cloudflare) qui interroge Yahoo Finance à la place de l'application. */
export const RELAIS = 'https://portefeuille-relais.seadtrvl.workers.dev';

export interface CoursRelais {
  symbole: string;
  bourse?: string;
  devise: string;
  date: DateISO; // jour de cotation (≤ date demandée)
  cours: number;
  nom?: string;
  avertissement?: string;
}

/**
 * Cours d'un actif à une date, par son ISIN ou son symbole Yahoo.
 * Seuls l'ISIN (ou le symbole), la devise et la date sont envoyés : jamais de montant.
 */
export async function coursParIsin(args: { isin?: string; symbole?: string; devise: string; date: DateISO }): Promise<CoursRelais> {
  const p = new URLSearchParams({ devise: args.devise, date: args.date });
  if (args.symbole) p.set('symbole', args.symbole);
  else if (args.isin) p.set('isin', args.isin.replace(/\s/g, '').toUpperCase());
  else throw new Error('Ni ISIN ni symbole');
  let r: Response;
  try {
    r = await fetch(`${RELAIS}/cours?${p}`);
  } catch {
    throw new Error(navigator.onLine === false ? 'Pas de connexion internet.' : 'Relais injoignable.');
  }
  const j = (await r.json().catch(() => ({}))) as Partial<CoursRelais> & { erreur?: string };
  if (!r.ok || j.erreur || typeof j.cours !== 'number') throw new Error(j.erreur ?? `Erreur ${r.status}`);
  return j as CoursRelais;
}

/**
 * Indicateur de la règle de krach (§ 5) : MSCI World en euros, dividendes réinvestis.
 * On suit l'ETF iShares Core MSCI World capitalisant coté à Amsterdam en euros (IWDA.AS).
 */
export const SOURCE_MSCI = 'IWDA.AS';
export const LIBELLE_SOURCE_MSCI = 'iShares Core MSCI World (IWDA, Amsterdam, en euros, dividendes réinvestis)';

export interface PlusHautRelais {
  symbole: string;
  date: DateISO;
  cours: number;
  plusHaut: number;
  datePlusHaut: DateISO;
}

export async function msciWorld(date: DateISO): Promise<PlusHautRelais> {
  let r: Response;
  try {
    r = await fetch(`${RELAIS}/plushaut?symbole=${SOURCE_MSCI}&date=${date}`);
  } catch {
    throw new Error(navigator.onLine === false ? 'Pas de connexion internet.' : 'Relais injoignable.');
  }
  const j = (await r.json().catch(() => ({}))) as Partial<PlusHautRelais> & { erreur?: string };
  if (!r.ok || j.erreur || typeof j.cours !== 'number' || typeof j.plusHaut !== 'number') throw new Error(j.erreur ?? `Erreur ${r.status}`);
  return j as PlusHautRelais;
}
