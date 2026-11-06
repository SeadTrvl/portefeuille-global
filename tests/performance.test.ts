import { describe, expect, it } from 'vitest';
import { Index, positionsA, synthese } from '../src/moteur/positions';
import { statsActif, twrGroupe, triGroupe, serieGroupe } from '../src/moteur/performance';
import { mesurerSatellite, portefeuilleFantome } from '../src/moteur/satellite';
import { PARAMETRES_DEFAUT as P } from '../src/moteur/parametres';
import type { Actif, Operation, Valorisation } from '../src/moteur/types';

const e = (euros: number) => Math.round(euros * 100);

const action: Actif = { id: 'x', nom: 'Action X', poche: 'C', ligne: 'satellite', mode: 'cours' };
const etf: Actif = { id: 'w', nom: 'ETF MSCI World', poche: 'C', ligne: 'world', mode: 'cours', etfWorldReference: true };
const fe: Actif = { id: 'fe', nom: 'Fonds euros', poche: 'BO', ligne: 'fonds_euros', mode: 'valeur' };

const ops: Operation[] = [
  { id: '1', date: '2026-01-10', actifId: 'x', type: 'achat', quantite: 10, prix: 100, montant: e(1000), frais: e(2) },
  { id: '2', date: '2026-03-10', actifId: 'x', type: 'achat', quantite: 10, prix: 120, montant: e(1200), frais: e(2) },
  { id: '3', date: '2026-06-10', actifId: 'x', type: 'vente', quantite: 5, prix: 130, montant: e(650), frais: e(2) },
  { id: '4', date: '2026-01-01', actifId: 'fe', type: 'versement', montant: e(10000), frais: 0 },
  { id: '5', date: '2027-02-01', actifId: 'fe', type: 'versement', montant: e(1000), frais: 0 },
  { id: '6', date: '2026-01-10', actifId: 'w', type: 'achat', quantite: 1, prix: 50, montant: e(50), frais: 0 }
];
const valos: Valorisation[] = [
  { id: 'v1', date: '2026-09-30', actifId: 'x', cours: 140, quantite: 15, valeur: e(2100) },
  { id: 'v2', date: '2026-12-31', actifId: 'fe', valeur: e(10250) },
  { id: 'v3', date: '2026-09-30', actifId: 'w', cours: 55, valeur: e(55) }
];
const idx = new Index({ actifs: [action, etf, fe], operations: ops, valorisations: valos });

describe('Performance par actif', () => {
  it('PRU au prix moyen pondéré, frais inclus', () => {
    const s = statsActif(idx, action, '2026-03-31');
    expect(s.quantite).toBe(20);
    expect(s.pru).toBeCloseTo(110.2, 10);
  });
  it('plus-values réalisée et latente après une vente partielle', () => {
    const s = statsActif(idx, action, '2026-09-30');
    expect(s.quantite).toBe(15);
    expect(s.pvRealisee).toBe(e(650 - 2 - 551));
    expect(s.investi).toBe(e(1653));
    expect(s.valeur).toBe(e(2100));
    expect(s.pvLatente).toBe(e(447));
    expect(s.dernierCours).toEqual({ cours: 140, date: '2026-09-30' });
  });
  it('TWR chaîné à chaque opération et relevé', () => {
    const t = twrGroupe(idx, (a) => a.id === 'x', '2026-01-09', '2026-09-30');
    const attendu = ((2400 - 1202) / 1000) * ((1950 + 648) / 2400) * (2100 / 1950) - 1;
    expect(t.total).toBeCloseTo(attendu, 10);
  });
  it('TRI positif depuis l’achat', () => {
    const r = triGroupe(idx, (a) => a.id === 'x', '2026-01-10', '2026-09-30');
    expect(r).not.toBeNull();
    expect(r!).toBeGreaterThan(0);
  });
  it('fonds euros valorisé sans cours', () => {
    const s = statsActif(idx, fe, '2026-12-31');
    expect(s.valeur).toBe(e(10250));
    expect(s.pvLatente).toBe(e(250));
    expect(twrGroupe(idx, (a) => a.id === 'fe', '2025-12-31', '2026-12-31').total).toBeCloseTo(0.025, 10);
    // Un versement après le relevé s'ajoute à la valeur.
    expect(idx.valeur('fe', '2027-02-01')).toBe(e(11250));
  });
  it('série pour les graphiques : valeur et investi', () => {
    const s = serieGroupe(idx, (a) => a.id === 'x', '2026-01-09', '2026-09-30');
    expect(s[s.length - 1].valeur).toBe(e(2100));
    expect(s[s.length - 1].investi).toBe(e(1002 + 1202 - 648));
  });
});

describe('Poches', () => {
  it('Satellite en attente sur l’ETF World compté dans le Satellite', () => {
    const op: Operation = { id: 's', date: '2026-02-01', actifId: 'w', type: 'achat', quantite: 2, prix: 50, montant: e(100), frais: 0, ligne: 'satellite' };
    const i2 = new Index({ actifs: [etf], operations: [ops[5], op], valorisations: [valos[2]] });
    const s = synthese(positionsA(i2, '2026-09-30'));
    expect(s.core.world).toBe(e(55));
    expect(s.parSousPoche.satellite).toBe(e(110));
  });
});

describe('Satellite', () => {
  it('portefeuille fantôme : même montant, même date, au cours de l’ETF World', () => {
    const f = portefeuilleFantome(idx);
    expect(f.operations.length).toBe(3);
    expect(f.operations[0].parts).toBeCloseTo(1000 / 50, 10);
  });
  it('historique insuffisant avant 3 ans', () => {
    const m = mesurerSatellite(P, idx, '2026-11-06');
    expect(m.statut).toBe('historique_insuffisant');
  });
});
