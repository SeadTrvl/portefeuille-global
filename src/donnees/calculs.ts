// Assemble tous les calculs du guide à partir de l'état, pour une date donnée.
import { lireParametres, aMois, ciblesCourantes, type Parametres } from '../moteur/parametres';
import { Index, positionsA, synthese, type Position, type Synthese } from '../moteur/positions';
import { cibleA, cibleBO, plafondBO, montantBP, effortBP, moisRestants } from '../moteur/cibles';
import { rejouerIndice, ETAT_KRACH_INITIAL, type EtatKrach, type PointIndice } from '../moteur/krach';
import { repartirEpargne, type ResultatFlux } from '../moteur/flux';
import { calculerAlertes, type Alerte } from '../moteur/alertes';
import { mesurerSatellite, expositions, decisionSatellite, type MesureSatellite, type ExpositionAction } from '../moteur/satellite';
import type { Centimes } from '../moteur/montants';
import type { DateISO, Projet } from '../moteur/types';
import { ajouterAnnees } from '../moteur/xirr';
import { totalCredits } from '../moteur/credits';
import type { Etat } from './etat';

export function aujourdhui(): DateISO {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function moisEntre(a: DateISO, b: DateISO): number {
  const [a1, m1] = a.split('-').map(Number);
  const [a2, m2] = b.split('-').map(Number);
  return (a2 - a1) * 12 + (m2 - m1);
}

export interface InfoProjet {
  projet: Projet;
  montant: Centimes;
  BP: Centimes;
  mois: number;
  effort: Centimes;
  prevuADate: Centimes;
  tempsRestant: 'plus3ans' | '1a3ans' | 'moins12mois';
}

export interface Calculs {
  date: DateISO;
  p: Parametres;
  idx: Index;
  positions: Position[];
  s: Synthese;
  aMois: number;
  cibleA: Centimes;
  cibleBO: Centimes;
  plafondBO: Centimes;
  projet: InfoProjet | null;
  ciblesC: ReturnType<typeof ciblesCourantes>;
  pointsIndice: PointIndice[];
  krach: EtatKrach;
  baisse: number | null;
  mesureSatellite: MesureSatellite;
  decisionSatellite: { nouvelleCible: number; motif: string } | null;
  expositions: ExpositionAction[];
  fraisAnnuels: { frais: Centimes; patrimoineMoyen: Centimes };
  alertes: Alerte[];
  /** Capital restant dû des crédits inclus, et patrimoine net (brut − crédits si l'option est active). */
  credits: Centimes;
  patrimoineNet: Centimes;
  /** § 4 : répartition d'une épargne mensuelle. */
  repartir: (epargne: Centimes) => ResultatFlux;
}

export function calculer(etat: Etat, date: DateISO = aujourdhui()): Calculs {
  const p = lireParametres(etat.parametres);
  const idx = new Index(etat);
  const positions = positionsA(idx, date);
  const s = synthese(positions);
  const am = aMois(p, etat.profil.revenuVariable);
  const cA = cibleA(etat.profil.depensesEssentielles, am);
  const cBO = cibleBO(p, s.C);
  const plBO = plafondBO(p, s.C);
  const ciblesC = ciblesCourantes(p, etat.etatSatellite.cible);

  // B-Projet : seulement si un projet est au statut « actif » (CLAUDE.md).
  let projet: InfoProjet | null = null;
  const pa = etat.projets.find((x) => x.statut === 'actif');
  if (pa) {
    const montant = montantBP(p, pa.cout, pa.frais);
    const mois = moisRestants(date, pa.dateUsage);
    const debut = pa.dateActivation ?? date;
    const total = Math.max(1, moisEntre(debut, pa.dateUsage));
    const ecoules = Math.min(total, Math.max(0, moisEntre(debut, date)));
    const restants = moisEntre(date, pa.dateUsage);
    projet = {
      projet: pa,
      montant,
      BP: s.parPoche.BP,
      mois,
      effort: effortBP(montant, s.parPoche.BP, mois),
      prevuADate: Math.round((montant * ecoules) / total),
      tempsRestant: restants > 36 ? 'plus3ans' : restants >= 12 ? '1a3ans' : 'moins12mois'
    };
  }

  // § 5 : rejoue la série de l'indice ; BO_départ = valeur de B-Opportunité au jour du relevé.
  const pointsIndice = rejouerIndice(p, etat.indice, (d) => synthese(positionsA(idx, d)).parPoche.BO);
  const dernier = pointsIndice[pointsIndice.length - 1];
  const krach = dernier ? dernier.etat : { ...ETAT_KRACH_INITIAL };
  const baisse = dernier ? dernier.baisse : null;

  const mesure = mesurerSatellite(p, idx, date);
  const expo = expositions(p, idx, etat.fiches, s.C, date);

  // Frais annuels : frais payés sur 12 mois + frais courants estimés des fonds, rapportés au patrimoine moyen.
  const ilYaUnAn = ajouterAnnees(date, -1);
  let frais = 0;
  for (const op of etat.operations) {
    if (op.date > ilYaUnAn && op.date <= date) frais += op.frais + (op.type === 'frais' ? op.montant : 0);
  }
  for (const pos of positions) frais += Math.round(pos.valeur * (pos.actif.fraisCourants ?? 0));
  const totalAvant = synthese(positionsA(idx, ilYaUnAn)).total;
  const patrimoineMoyen = totalAvant > 0 ? Math.round((totalAvant + s.total) / 2) : s.total;

  const flux = [...etat.fluxMensuels].sort((a, b) => a.mois.localeCompare(b.mois));
  const nbWatchlist = etat.fiches.filter((f) => f.statut === 'watchlist').length;

  const alertes = calculerAlertes({
    p,
    s,
    ciblesC: ciblesC.ciblesC,
    depensesEssentielles: etat.profil.depensesEssentielles,
    aMois: am,
    historiqueFlux: flux,
    krach,
    baisse,
    mesureSatellite: mesure,
    expositions: expo,
    fraisAnnuels: { frais, patrimoineMoyen },
    projet: projet ? { prevuADate: projet.prevuADate, BP: projet.BP, effort: projet.effort } : null,
    nbWatchlist
  });

  const repartir = (epargne: Centimes) =>
    repartirEpargne({
      epargne,
      A: s.parPoche.A,
      cibleA: cA,
      effortBP: projet ? projet.effort : null,
      BO: s.parPoche.BO,
      cibleBO: cBO,
      krachActif: krach.actif,
      valeursC: s.parSousPoche,
      ciblesC: ciblesC.ciblesC,
      valeursCore: s.core,
      ciblesCore: ciblesC.ciblesCore,
      valeursMP: s.mp,
      ciblesMP: ciblesC.ciblesMP
    });

  return {
    date,
    p,
    idx,
    positions,
    s,
    aMois: am,
    cibleA: cA,
    cibleBO: cBO,
    plafondBO: plBO,
    projet,
    ciblesC,
    pointsIndice,
    krach,
    baisse,
    mesureSatellite: mesure,
    decisionSatellite: decisionSatellite(p, etat.etatSatellite, mesure),
    expositions: expo,
    fraisAnnuels: { frais, patrimoineMoyen },
    alertes,
    credits: totalCredits(etat.credits ?? [], date),
    patrimoineNet: s.total - (etat.preferences?.inclureCredits === false ? 0 : totalCredits(etat.credits ?? [], date)),
    repartir
  };
}
