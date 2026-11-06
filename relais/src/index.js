// Relais privé pour l'application Portefeuille Global.
// Les sites de cours bloquent les requêtes venant d'une page web (CORS) : ce relais les fait à sa place.
// Entrée : un ISIN (ou un symbole Yahoo comme BTC-EUR), une devise et une date.
// Sortie : le cours de clôture à cette date (ou au dernier jour de cotation avant).
// Il ne reçoit jamais de montant ni de quantité.

const ORIGINES = ['https://seadtrvl.github.io', 'http://localhost:5173', 'http://localhost:4173'];

// Places préférées selon la devise de l'actif (codes de bourse Yahoo).
const PLACES = {
  EUR: ['PAR', 'AMS', 'GER', 'FRA', 'MIL', 'BRU', 'MCE', 'VIE', 'LIS', 'DUS', 'STU', 'MUN', 'HAM', 'BER', 'EBS'],
  USD: ['NMS', 'NYQ', 'NGM', 'NCM', 'ASE', 'PCX', 'BTS', 'NAS', 'NYS']
};

// Suffixes Yahoo des places à essayer quand la recherche ne trouve pas de cotation dans la devise voulue.
const SUFFIXES = { EUR: ['.AS', '.PA', '.DE', '.MI'], USD: [''] };

const ENTETES_YAHOO = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  Accept: 'application/json'
};

function reponse(corps, statut, origine) {
  const h = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
  if (origine && ORIGINES.includes(origine)) {
    h['Access-Control-Allow-Origin'] = origine;
    h['Vary'] = 'Origin';
  }
  return new Response(JSON.stringify(corps), { status: statut, headers: h });
}

async function yahoo(url, ctx, dureeCache) {
  const cache = caches.default;
  const cle = new Request(url);
  const enCache = await cache.match(cle);
  if (enCache) return enCache.json();
  const r = await fetch(url, { headers: ENTETES_YAHOO });
  if (!r.ok) throw new Error(`Yahoo a répondu ${r.status}`);
  const texte = await r.text();
  ctx.waitUntil(cache.put(cle, new Response(texte, { headers: { 'Cache-Control': `max-age=${dureeCache}` } })));
  return JSON.parse(texte);
}

/** Symboles Yahoo candidats pour un ISIN, classés selon la devise voulue. */
async function candidats(isin, devise, ctx) {
  const j = await yahoo(`https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(isin)}&quotesCount=15&newsCount=0&listsCount=0`, ctx, 7 * 86400);
  const quotes = (j.quotes || []).filter((q) => q.symbol && q.isYahooFinance !== false);
  const pref = PLACES[devise] || [];
  const rang = (q) => {
    const i = pref.indexOf(q.exchange);
    return i < 0 ? 100 : i;
  };
  return quotes.sort((a, b) => rang(a) - rang(b)).slice(0, 6);
}

/** Cours de clôture à une date (dernier jour de cotation ≤ date). */
async function coursA(symbole, date, ctx) {
  const fin = Math.floor(Date.parse(date + 'T23:59:59Z') / 1000) + 86400;
  const debut = fin - 15 * 86400;
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const j = await yahoo(
    `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbole)}?period1=${debut}&period2=${fin}&interval=1d&events=`,
    ctx,
    date >= aujourdhui ? 900 : 86400
  );
  const res = j.chart && j.chart.result && j.chart.result[0];
  if (!res) return null;
  const meta = res.meta || {};
  const ts = res.timestamp || [];
  const closes = (res.indicators && res.indicators.quote && res.indicators.quote[0] && res.indicators.quote[0].close) || [];
  const decalage = meta.gmtoffset || 0;
  let meilleur = null;
  for (let i = 0; i < ts.length; i++) {
    const c = closes[i];
    if (c === null || c === undefined) continue;
    const jour = new Date((ts[i] + decalage) * 1000).toISOString().slice(0, 10);
    if (jour <= date) meilleur = { date: jour, cours: c };
  }
  // Aujourd'hui, en séance : dernier prix connu.
  if (date >= aujourdhui && meta.regularMarketPrice && meta.regularMarketTime) {
    const jour = new Date((meta.regularMarketTime + decalage) * 1000).toISOString().slice(0, 10);
    if (!meilleur || jour >= meilleur.date) meilleur = { date: jour, cours: meta.regularMarketPrice };
  }
  if (!meilleur) return null;
  let devise = meta.currency;
  let cours = meilleur.cours;
  // Londres cote souvent en pence : conversion en livres.
  if (devise === 'GBp' || devise === 'GBX') {
    devise = 'GBP';
    cours = cours / 100;
  }
  return { symbole, bourse: meta.fullExchangeName || meta.exchangeName, devise, date: meilleur.date, cours, nom: meta.longName || meta.shortName };
}

/**
 * Dernier cours et plus haut historique (clôtures journalières depuis l'origine) à une date.
 * Sert à la règle de krach : baisse = cours / plus haut − 1 (§ 5 du guide).
 */
async function plusHaut(symbole, date, ctx) {
  const fin = Math.floor(Date.parse(date + 'T23:59:59Z') / 1000) + 86400;
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const j = await yahoo(
    `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbole)}?period1=0&period2=${fin}&interval=1d&events=`,
    ctx,
    date >= aujourdhui ? 900 : 86400
  );
  const res = j.chart && j.chart.result && j.chart.result[0];
  if (!res) return null;
  const meta = res.meta || {};
  const ts = res.timestamp || [];
  const closes = (res.indicators && res.indicators.quote && res.indicators.quote[0] && res.indicators.quote[0].close) || [];
  const decalage = meta.gmtoffset || 0;
  let dernier = null;
  let haut = null;
  for (let i = 0; i < ts.length; i++) {
    const c = closes[i];
    if (c === null || c === undefined) continue;
    const jour = new Date((ts[i] + decalage) * 1000).toISOString().slice(0, 10);
    if (jour > date) continue;
    dernier = { date: jour, cours: c };
    if (!haut || c > haut.cours) haut = { date: jour, cours: c };
  }
  if (date >= aujourdhui && meta.regularMarketPrice && meta.regularMarketTime) {
    const jour = new Date((meta.regularMarketTime + decalage) * 1000).toISOString().slice(0, 10);
    if (!dernier || jour >= dernier.date) dernier = { date: jour, cours: meta.regularMarketPrice };
    if (!haut || meta.regularMarketPrice > haut.cours) haut = { date: jour, cours: meta.regularMarketPrice };
  }
  if (!dernier) return null;
  return {
    symbole,
    devise: meta.currency,
    nom: meta.longName || meta.shortName,
    date: dernier.date,
    cours: dernier.cours,
    plusHaut: haut.cours,
    datePlusHaut: haut.date,
    debutHistorique: ts.length ? new Date((ts[0] + decalage) * 1000).toISOString().slice(0, 10) : null
  };
}

export default {
  async fetch(req, env, ctx) {
    const origine = req.headers.get('Origin');
    if (req.method === 'OPTIONS') return reponse({}, 204, origine);
    const url = new URL(req.url);
    if (url.pathname === '/plushaut') {
      const sym = (url.searchParams.get('symbole') || '').trim();
      const d = url.searchParams.get('date') || new Date().toISOString().slice(0, 10);
      if (!sym || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return reponse({ erreur: 'Paramètres invalides' }, 400, origine);
      try {
        const r = await plusHaut(sym, d, ctx);
        return r ? reponse(r, 200, origine) : reponse({ erreur: `Aucun cours pour ${sym}` }, 404, origine);
      } catch (e) {
        return reponse({ erreur: String(e.message || e) }, 502, origine);
      }
    }
    if (url.pathname !== '/cours') return reponse({ erreur: 'Utiliser /cours?isin=…&devise=EUR&date=AAAA-MM-JJ' }, 404, origine);

    const isin = (url.searchParams.get('isin') || '').trim().toUpperCase();
    const symbole = (url.searchParams.get('symbole') || '').trim();
    const devise = (url.searchParams.get('devise') || 'EUR').toUpperCase();
    const date = url.searchParams.get('date') || new Date().toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return reponse({ erreur: 'Date invalide' }, 400, origine);
    if (!symbole && !/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin)) return reponse({ erreur: 'ISIN invalide' }, 400, origine);

    try {
      if (symbole) {
        const c = await coursA(symbole, date, ctx);
        return c ? reponse(c, 200, origine) : reponse({ erreur: `Aucun cours pour ${symbole}` }, 404, origine);
      }
      const liste = await candidats(isin, devise, ctx);
      if (liste.length === 0) return reponse({ erreur: `ISIN ${isin} introuvable` }, 404, origine);
      let premier = null;
      for (const q of liste) {
        const c = await coursA(q.symbol, date, ctx);
        if (!c) continue;
        if (c.devise === devise) return reponse({ isin, ...c }, 200, origine);
        if (!premier) premier = c;
      }
      // Yahoo ne renvoie parfois que la cotation principale (ex. IWDA.L à Londres en dollars) :
      // on essaie le même code sur les places de la devise voulue (IWDA.AS, IWDA.PA, IWDA.DE, IWDA.MI…).
      const racines = [...new Set(liste.map((q) => q.symbol.split('.')[0]))].slice(0, 2);
      for (const r of racines) {
        for (const s of SUFFIXES[devise] || []) {
          const sym = r + s;
          if (liste.some((q) => q.symbol === sym)) continue;
          try {
            const c = await coursA(sym, date, ctx);
            if (c && c.devise === devise) return reponse({ isin, ...c }, 200, origine);
          } catch {
            /* symbole inexistant sur cette place : on continue */
          }
        }
      }
      if (premier) return reponse({ isin, ...premier, avertissement: `Pas de cotation en ${devise} trouvée` }, 200, origine);
      return reponse({ erreur: `Aucun cours trouvé pour ${isin}` }, 404, origine);
    } catch (e) {
      return reponse({ erreur: String(e.message || e) }, 502, origine);
    }
  }
};
