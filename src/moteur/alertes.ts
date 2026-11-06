// Tableau de bord et alertes (§ 9 du guide), rééquilibrage (§ 6).
import { formatEuros, formatPct, type Centimes } from './montants';
import type { Parametres } from './parametres';
import type { Synthese } from './positions';
import { cibleBO, plafondBO, monetaireAttenduBO } from './cibles';
import type { FluxMensuel, SousPocheC } from './types';
import { SOUS_POCHES_C } from './types';
import type { EtatKrach } from './krach';
import type { MesureSatellite, ExpositionAction } from './satellite';

export type Niveau = 'ok' | 'info' | 'attention' | 'action';

export interface Alerte {
  code: string;
  niveau: Niveau;
  titre: string;
  detail: string;
  /** Proposition chiffrée (l'outil propose, il ne passe jamais d'ordre). */
  proposition?: string;
}

export const LIBELLES_SOUS_POCHES: Record<SousPocheC, string> = {
  core: 'Core ETF',
  satellite: 'Satellite',
  crypto: 'Crypto',
  matieres_premieres: 'Matières premières',
  fun: 'Fun / alternatifs'
};

/** § 6 : vente de crypto proposée pour revenir à la cible (7,5 % de C). */
export function venteCrypto(p: Parametres, s: Synthese): Centimes {
  return Math.max(0, s.parSousPoche.crypto - Math.round(p.ciblesC.crypto * s.C));
}

/** § 6 et § 9 : surplus de B-Opportunité au-dessus de son plafond, à verser dans C à la revue annuelle. */
export function surplusBO(p: Parametres, s: Synthese): Centimes {
  return Math.max(0, s.parPoche.BO - plafondBO(p, s.C));
}

export interface EntreeAlertes {
  p: Parametres;
  s: Synthese;
  ciblesC: Record<SousPocheC, number>;
  depensesEssentielles: Centimes;
  aMois: number;
  historiqueFlux: FluxMensuel[]; // trié par mois croissant
  krach: EtatKrach;
  baisse: number | null;
  mesureSatellite: MesureSatellite | null;
  expositions: ExpositionAction[];
  fraisAnnuels: { frais: Centimes; patrimoineMoyen: Centimes } | null;
  projet: { prevuADate: Centimes; BP: Centimes; effort: Centimes } | null;
  nbWatchlist: number;
}

export function calculerAlertes(e: EntreeAlertes): Alerte[] {
  const { p, s } = e;
  const res: Alerte[] = [];

  // Taux d'épargne : alerte si sous la cible 3 mois de suite ; désactivée tant que EPARGNE_TAUX est vide.
  if (e.p.epargneTaux !== null) {
    const trois = e.historiqueFlux.slice(-3);
    const sous = trois.length === 3 && trois.every((f) => f.revenuNet > 0 && f.epargne / f.revenuNet < e.p.epargneTaux!);
    res.push({
      code: 'epargne',
      niveau: sous ? 'attention' : 'ok',
      titre: "Taux d'épargne",
      detail: sous ? `Sous la cible de ${formatPct(e.p.epargneTaux)} trois mois de suite` : `Cible ${formatPct(e.p.epargneTaux)}`
    });
  }

  // Couverture de A : alerte sous A_MOIS (décision du 5 novembre 2026).
  if (e.depensesEssentielles > 0) {
    const mois = s.parPoche.A / e.depensesEssentielles;
    res.push({
      code: 'couverture_a',
      niveau: mois < e.aMois ? 'attention' : 'ok',
      titre: 'Couverture de A',
      detail: `${mois.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} mois de dépenses essentielles (cible ${e.aMois})`,
      proposition: mois < e.aMois ? '100 % de l\'épargne va à A jusqu\'à sa cible (§ 3)' : undefined
    });
  } else {
    res.push({ code: 'couverture_a', niveau: 'info', titre: 'Couverture de A', detail: 'Renseigner les dépenses essentielles mensuelles dans les réglages' });
  }

  // B-Opportunité : sous la cible hors krach, ou au-dessus du plafond.
  const cBO = cibleBO(p, s.C);
  const plBO = plafondBO(p, s.C);
  const surplus = surplusBO(p, s);
  let niveauBO: Niveau = 'ok';
  let detailBO = `${formatEuros(s.parPoche.BO)} pour une cible de ${formatEuros(cBO)} (${formatPct(cBO > 0 ? s.parPoche.BO / cBO : 0, 0)})`;
  let propBO: string | undefined;
  if (surplus > 0) {
    niveauBO = 'attention';
    detailBO += ` ; au-dessus du plafond de ${formatEuros(plBO)}`;
    propBO = `Verser le surplus de ${formatEuros(surplus)} dans C à la revue annuelle (§ 6)`;
  } else if (!e.krach.actif && s.parPoche.BO < cBO) {
    niveauBO = 'attention';
    detailBO += ' ; sous la cible';
    propBO = 'Reconstitution par l\'étape 3 des flux mensuels (§ 4)';
  }
  res.push({ code: 'bo', niveau: niveauBO, titre: 'B-Opportunité', detail: detailBO, proposition: propBO });

  // Consigne de placement : au-delà de BO_SEUIL_MONE, BO_PART_MONE en fonds monétaire hors assurance-vie.
  const moneAttendu = monetaireAttenduBO(p, s.parPoche.BO);
  if (moneAttendu > 0 && s.boMonetaire + 100 < moneAttendu) {
    res.push({
      code: 'bo_monetaire',
      niveau: 'attention',
      titre: 'B-Opportunité : part monétaire',
      detail: `${formatEuros(s.boMonetaire)} en fonds monétaire pour ${formatEuros(moneAttendu)} attendus (1/3 au-delà de ${formatEuros(p.boSeuilMone)})`,
      proposition: `Placer ${formatEuros(moneAttendu - s.boMonetaire)} sur un fonds monétaire euro hors assurance-vie (§ 3)`
    });
  }

  // Poids des sous-poches de C par rapport à leur bande.
  if (s.C > 0) {
    for (const k of SOUS_POCHES_C) {
      const poids = s.parSousPoche[k] / s.C;
      const [bas, haut] = p.bandesC[k];
      if (k === 'crypto' && poids > p.cryptoPlafondDur) {
        res.push({
          code: 'crypto',
          niveau: 'action',
          titre: 'Crypto : action immédiate',
          detail: `${formatPct(poids)} de C, au-delà du plafond dur de ${formatPct(p.cryptoPlafondDur)}`,
          proposition: `Vendre ${formatEuros(venteCrypto(p, s))} de crypto pour revenir à ${formatPct(p.ciblesC.crypto)} dans le trimestre (§ 6)`
        });
        continue;
      }
      const horsBande = poids < bas - 1e-9 || poids > haut + 1e-9;
      res.push({
        code: 'bande_' + k,
        niveau: horsBande ? 'attention' : 'ok',
        titre: LIBELLES_SOUS_POCHES[k],
        detail: `${formatPct(poids)} de C (cible ${formatPct(e.ciblesC[k])}, bande ${formatPct(bas, 0)}–${formatPct(haut, 0)})`,
        proposition: horsBande ? 'Les flux mensuels corrigent d\'abord ; vente ou achat à la revue annuelle si toujours hors bande (§ 6)' : undefined
      });
    }
  }

  // Plus grosse position Satellite.
  for (const x of e.expositions) {
    if (x.alertes.length) {
      res.push({ code: 'position_' + x.fiche.id, niveau: 'attention', titre: `Position : ${x.fiche.nom}`, detail: `${formatPct(x.poidsDirect)} en direct, ${formatPct(x.poidsTotal)} avec les ETF`, proposition: x.alertes.join(' ; ') });
    }
  }

  // Baisse du MSCI World.
  if (e.baisse !== null) {
    const atteint = p.kPaliers.filter((k) => e.baisse! <= k + 1e-9);
    res.push({
      code: 'krach',
      niveau: e.krach.actif ? 'action' : 'ok',
      titre: 'Baisse du MSCI World',
      detail: `${formatPct(e.baisse)} depuis le plus haut` + (e.krach.actif ? ` ; épisode de krach en cours (${e.krach.tranchesDeclenchees} tranche(s) déclenchée(s))` : ''),
      proposition: atteint.length ? `Palier de ${formatPct(atteint[atteint.length - 1], 0)} atteint : voir l'écran Krach (§ 5)` : undefined
    });
  }

  // Écart du Satellite.
  if (e.mesureSatellite) {
    const m = e.mesureSatellite;
    if (m.statut === 'historique_insuffisant') {
      res.push({ code: 'satellite', niveau: 'info', titre: 'Écart du Satellite', detail: 'Historique insuffisant (moins de 3 ans)' });
    } else if (m.ecart !== null) {
      res.push({
        code: 'satellite',
        niveau: m.ecart < -p.satEcart ? 'attention' : 'ok',
        titre: 'Écart du Satellite',
        detail: `${(m.ecart * 100).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} points par an face au portefeuille fantôme sur 3 ans`
      });
    }
  }

  // Frais annuels.
  if (e.fraisAnnuels && e.fraisAnnuels.patrimoineMoyen > 0) {
    const t = e.fraisAnnuels.frais / e.fraisAnnuels.patrimoineMoyen;
    res.push({
      code: 'frais',
      niveau: t > p.fraisAlerte ? 'attention' : t > p.fraisCible ? 'info' : 'ok',
      titre: 'Frais annuels',
      detail: `${formatPct(t, 2)} du patrimoine moyen (objectif : moins de ${formatPct(p.fraisCible)})`
    });
  }

  // B-Projet (si actif) : retard de plus de 3 mois d'effort.
  if (e.projet) {
    const retard = e.projet.prevuADate - e.projet.BP;
    const enRetard = e.projet.effort > 0 && retard > 3 * e.projet.effort;
    res.push({
      code: 'projet',
      niveau: enRetard ? 'attention' : 'ok',
      titre: 'B-Projet',
      detail: `${formatEuros(e.projet.BP)} pour ${formatEuros(e.projet.prevuADate)} prévus à date`,
      proposition: enRetard ? 'Retard de plus de 3 mois d\'effort : en dernier recours, transfert de C par tiers entre 18 et 6 mois avant l\'usage (§ 3)' : undefined
    });
  }

  if (e.nbWatchlist > p.watchlistMax) {
    res.push({ code: 'watchlist', niveau: 'attention', titre: 'Watchlist', detail: `${e.nbWatchlist} entreprises pour un maximum de ${p.watchlistMax}` });
  }

  return res;
}
