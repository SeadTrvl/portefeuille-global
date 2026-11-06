// Satellite : portefeuille fantôme, mesure sur 3 ans glissants et tailles de position (§ 7 du guide).
import type { Centimes } from './montants';
import type { Parametres } from './parametres';
import type { Index } from './positions';
import { ligneEffective } from './positions';
import { triGroupe, type Selection } from './performance';
import type { Actif, DateISO, EtatSatellite, FicheSatellite, OperationFantome } from './types';
import { ajouterAnnees, xirr, type FluxDate } from './xirr';

export const selectionSatellite: Selection = (_a, ligne) => ligne === 'satellite';

/** Actif ETF MSCI World de référence (portefeuille fantôme, attente du Satellite). */
export function etfWorld(idx: Index): Actif | undefined {
  return idx.d.actifs.find((a) => a.etfWorldReference) ?? idx.d.actifs.find((a) => a.ligne === 'world' && a.mode === 'cours');
}

/**
 * § 7 : à chaque achat ou vente Satellite, la même opération (même montant, même date)
 * est enregistrée sur un ETF MSCI World fictif. Le cours de l'ETF est le dernier connu à cette date.
 */
export function portefeuilleFantome(idx: Index): { operations: OperationFantome[]; coursManquants: DateISO[] } {
  const ref = etfWorld(idx);
  const operations: OperationFantome[] = [];
  const coursManquants: DateISO[] = [];
  for (const actif of idx.d.actifs) {
    for (const op of idx.ops(actif.id)) {
      if (ligneEffective(actif, op) !== 'satellite') continue;
      if (op.type !== 'achat' && op.type !== 'vente') continue;
      const signe = op.type === 'achat' ? 1 : -1;
      const c = ref ? idx.dernierCours(ref.id, op.date) : null;
      if (!c) {
        coursManquants.push(op.date);
        continue;
      }
      const montant = signe * op.montant;
      operations.push({ id: 'f-' + op.id, date: op.date, montant, coursEtf: c.cours, parts: montant / 100 / c.cours, operationId: op.id });
    }
  }
  operations.sort((a, b) => a.date.localeCompare(b.date));
  return { operations, coursManquants };
}

function valeurFantome(idx: Index, ops: OperationFantome[], date: DateISO): Centimes {
  const ref = etfWorld(idx);
  const c = ref ? idx.dernierCours(ref.id, date) : null;
  if (!c) return 0;
  const parts = ops.filter((o) => o.date <= date).reduce((s, o) => s + o.parts, 0);
  return Math.round(parts * c.cours * 100);
}

/** TRI du portefeuille fantôme sur une fenêtre. */
export function triFantome(idx: Index, ops: OperationFantome[], debut: DateISO, fin: DateISO): number | null {
  const flux: FluxDate[] = [];
  const v0 = valeurFantome(idx, ops, debut);
  if (v0 > 0) flux.push({ date: debut, montant: -v0 });
  for (const o of ops) if (o.date > debut && o.date <= fin) flux.push({ date: o.date, montant: -o.montant });
  flux.push({ date: fin, montant: valeurFantome(idx, ops, fin) });
  return xirr(flux);
}

export type MesureSatellite =
  | { statut: 'historique_insuffisant'; premiereOperation: DateISO | null; dateDisponible: DateISO | null }
  | { statut: 'mesure'; debut: DateISO; fin: DateISO; triSatellite: number | null; triFantome: number | null; ecart: number | null };

/** § 7 : écart = TRI_Satellite − TRI_fantôme sur SAT_FENETRE (3 ans glissants). Aucune décision avant 3 ans. */
export function mesurerSatellite(p: Parametres, idx: Index, fin: DateISO): MesureSatellite {
  const { operations } = portefeuilleFantome(idx);
  let premiere: DateISO | null = null;
  for (const actif of idx.d.actifs)
    for (const op of idx.ops(actif.id))
      if (ligneEffective(actif, op) === 'satellite' && (!premiere || op.date < premiere)) premiere = op.date;
  const debut = ajouterAnnees(fin, -p.satFenetreAns);
  if (!premiere || premiere > debut) {
    return { statut: 'historique_insuffisant', premiereOperation: premiere, dateDisponible: premiere ? ajouterAnnees(premiere, p.satFenetreAns) : null };
  }
  const ts = triGroupe(idx, selectionSatellite, debut, fin);
  const tf = triFantome(idx, operations, debut, fin);
  return { statut: 'mesure', debut, fin, triSatellite: ts, triFantome: tf, ecart: ts !== null && tf !== null ? ts - tf : null };
}

/**
 * § 7 : si écart < −SAT_ECART → cible du Satellite à SAT_PLANCHER (15 %).
 * Après une réduction, si l'écart redevient ≥ 0 sur une nouvelle fenêtre complète de 3 ans → retour à 25 %.
 */
export function decisionSatellite(
  p: Parametres,
  etat: EtatSatellite,
  mesure: MesureSatellite
): { nouvelleCible: number; motif: string } | null {
  if (mesure.statut !== 'mesure' || mesure.ecart === null) return null;
  const reduite = etat.cible < p.satCibleDefaut;
  if (!reduite && mesure.ecart < -p.satEcart) {
    return { nouvelleCible: p.satPlancher, motif: 'Écart du Satellite inférieur à −2 points par an sur 3 ans (§ 7)' };
  }
  if (reduite && mesure.ecart >= 0 && (!etat.dateReduction || mesure.debut >= etat.dateReduction)) {
    return { nouvelleCible: p.satCibleDefaut, motif: 'Écart redevenu positif ou nul sur une nouvelle fenêtre de 3 ans (§ 7)' };
  }
  return null;
}

export interface ExpositionAction {
  fiche: FicheSatellite;
  direct: Centimes;
  viaEtf: Centimes;
  poidsDirect: number;
  poidsTotal: number;
  alertes: string[];
}

/** § 7 et § 9 : taille des positions Satellite (directe et directe + via ETF) en % de C. */
export function expositions(p: Parametres, idx: Index, fiches: FicheSatellite[], C: Centimes, date: DateISO): ExpositionAction[] {
  return fiches
    .filter((f) => f.statut === 'detenue')
    .map((fiche) => {
      const direct = idx.valeur(fiche.actifId, date);
      let viaEtf = 0;
      for (const [etfId, poids] of Object.entries(fiche.poidsDansEtf ?? {})) viaEtf += Math.round(idx.valeur(etfId, date) * poids);
      const poidsDirect = C > 0 ? direct / C : 0;
      const poidsTotal = C > 0 ? (direct + viaEtf) / C : 0;
      const alertes: string[] = [];
      if (poidsDirect > p.satMax) alertes.push(`Au-dessus de ${pct(p.satMax)} de C : réduire pour revenir entre ${pct(p.satNormale[0])} et ${pct(p.satNormale[1])}`);
      if (poidsTotal > p.satExpoRevue) alertes.push(`Exposition directe + via ETF au-delà de ${pct(p.satExpoRevue)} : revue obligatoire`);
      if (fiche.score < p.satScoreMin) alertes.push(`Score ${fiche.score}/100 sous le minimum de ${p.satScoreMin}`);
      return { fiche, direct, viaEtf, poidsDirect, poidsTotal, alertes };
    });
}

function pct(x: number) {
  return (x * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' %';
}
