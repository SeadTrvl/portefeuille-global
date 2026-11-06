import { describe, expect, it } from 'vitest';
import { PARAMETRES_DEFAUT as P, ciblesCourantes } from '../src/moteur/parametres';
import { repartirEpargne, type EntreeFlux } from '../src/moteur/flux';
import { cibleBO, plafondBO, montantBP, effortBP, moisRestants } from '../src/moteur/cibles';
import { avancerKrach, ETAT_KRACH_INITIAL, montantTranche, rejouerIndice } from '../src/moteur/krach';
import { calculerAlertes, venteCrypto, surplusBO } from '../src/moteur/alertes';
import type { Synthese } from '../src/moteur/positions';
import { xirr } from '../src/moteur/xirr';
import { formatEuros, formatPct, repartirAuProrata } from '../src/moteur/montants';

const e = (euros: number) => Math.round(euros * 100);

function syntheseC(C: Record<string, number>, A = 0, BO = 0): Synthese {
  const parSousPoche = { core: e(C.core ?? 0), satellite: e(C.satellite ?? 0), crypto: e(C.crypto ?? 0), matieres_premieres: e(C.matieres_premieres ?? 0), fun: e(C.fun ?? 0) };
  const total = Object.values(parSousPoche).reduce((s, v) => s + v, 0);
  return {
    parPoche: { A: e(A), BO: e(BO), BP: 0, C: total },
    C: total,
    parSousPoche,
    core: { world: 0, emergents: 0, europe: 0 },
    mp: { or: 0, panier: 0 },
    boMonetaire: 0,
    total: total + e(A) + e(BO)
  };
}

function entreeFlux(partiel: Partial<EntreeFlux>): EntreeFlux {
  const { ciblesC, ciblesCore, ciblesMP } = ciblesCourantes(P, P.satCibleDefaut);
  return {
    epargne: 0,
    A: 0,
    cibleA: 0,
    effortBP: null,
    BO: 0,
    cibleBO: 0,
    krachActif: false,
    valeursC: { core: 0, satellite: 0, crypto: 0, matieres_premieres: 0, fun: 0 },
    ciblesC,
    valeursCore: { world: 0, emergents: 0, europe: 0 },
    ciblesCore,
    valeursMP: { or: 0, panier: 0 },
    ciblesMP,
    ...partiel
  };
}

describe('Paramètres', () => {
  it('lit les fractions exactes 1/3', () => {
    expect(P.kTranche).toEqual({ num: 1, den: 3 });
    expect(P.boPartMone).toEqual({ num: 1, den: 3 });
  });
  it('les cibles de C font 100 %', () => {
    const s = Object.values(P.ciblesC).reduce((a, b) => a + b, 0);
    expect(s).toBeCloseTo(1, 10);
  });
  it('Satellite réduit à 15 % : les 10 points vont au Core au prorata', () => {
    const c = ciblesCourantes(P, 0.15);
    expect(c.ciblesC.core).toBeCloseTo(0.7, 10);
    expect(c.ciblesCore.world).toBeCloseTo(0.4375, 10);
    expect(c.ciblesCore.emergents).toBeCloseTo(0.175, 10);
    expect(c.ciblesCore.europe).toBeCloseTo(0.0875, 10);
  });
});

describe('Format français', () => {
  it('formate euros et pourcentages', () => {
    expect(formatEuros(123456).replace(/\s/g, ' ')).toBe('1 234,56 €');
    expect(formatPct(0.075).replace(/\s/g, ' ')).toBe('7,5 %');
  });
});

describe('Cas 1 — A sous sa cible', () => {
  it('1 500 € vers A, rien ailleurs', () => {
    const r = repartirEpargne(entreeFlux({ epargne: e(1500), A: e(5000), cibleA: e(7000), BO: 0, cibleBO: e(1000), valeursC: { core: e(100), satellite: 0, crypto: 0, matieres_premieres: 0, fun: 0 } }));
    expect(r.versA).toBe(e(1500));
    expect(r.versBP + r.versBO + r.resteC).toBe(0);
  });
});

describe('Cas 2 — flux complet', () => {
  const valeursC = { core: e(7000), satellite: e(3000), crypto: e(1000), matieres_premieres: e(600), fun: e(400) };
  const C = e(12000);
  it('cible_BO = max(1 000 ; 600) = 1 000 €', () => {
    expect(cibleBO(P, C)).toBe(e(1000));
  });
  it('400 € vers BO puis Core 454,06 / Satellite 121,62 / MP 24,32', () => {
    const r = repartirEpargne(entreeFlux({ epargne: e(1000), A: e(7000), cibleA: e(7000), BO: e(600), cibleBO: cibleBO(P, C), valeursC }));
    expect(r.versA).toBe(0);
    expect(r.versBO).toBe(e(400));
    expect(r.resteC).toBe(e(600));
    expect(r.manquesC).toEqual({ core: e(560), satellite: e(150), crypto: 0, matieres_premieres: e(30), fun: 0 });
    expect(r.versC).toEqual({ core: 45406, satellite: 12162, crypto: 0, matieres_premieres: 2432, fun: 0 });
    expect(Object.values(r.versC).reduce((a, b) => a + b, 0)).toBe(e(600));
  });
  it('étape 3 suspendue pendant un krach', () => {
    const r = repartirEpargne(entreeFlux({ epargne: e(1000), A: e(7000), cibleA: e(7000), BO: e(600), cibleBO: e(1000), valeursC, krachActif: true }));
    expect(r.versBO).toBe(0);
    expect(r.resteC).toBe(e(1000));
  });
  it('somme des manques nulle : prorata des cibles', () => {
    const r = repartirEpargne(entreeFlux({ epargne: e(100), A: 0, cibleA: 0, BO: e(5000), cibleBO: e(1000), valeursC: { core: e(60000), satellite: e(30000), crypto: e(9000), matieres_premieres: e(7000), fun: e(4000) } }));
    expect(Object.values(r.versC).reduce((a, b) => a + b, 0)).toBe(e(100));
  });
  it('B-Projet actif : prélevé avant B-Opportunité', () => {
    const r = repartirEpargne(entreeFlux({ epargne: e(1000), A: e(7000), cibleA: e(7000), effortBP: e(300), BO: e(600), cibleBO: e(1000), valeursC }));
    expect(r.versBP).toBe(e(300));
    expect(r.versBO).toBe(e(400));
    expect(r.resteC).toBe(e(300));
  });
});

describe('Répartition au prorata', () => {
  it("affecte l'écart d'arrondi à la plus grande ligne", () => {
    expect(repartirAuProrata(100, { a: 1, b: 1, c: 1 })).toEqual({ a: 34, b: 33, c: 33 });
  });
});

describe('Cas 3 — krach', () => {
  it('−12, −16, −22, −27, −18, −9 %', () => {
    let etat = { ...ETAT_KRACH_INITIAL };
    const bo = e(3000);
    const journal: string[] = [];
    for (const b of [-0.12, -0.16, -0.22, -0.27, -0.18, -0.09]) {
      const r = avancerKrach(P, etat, b, bo);
      etat = r.etat;
      journal.push(r.evenements.map((x) => (x.type === 'tranche' ? `T${x.numero}:${x.montant}` : x.type)).join(','));
    }
    expect(journal).toEqual(['', `debut,T1:${e(1000)}`, '', `T2:${e(1000)}`, '', 'fin']);
    expect(etat).toEqual(ETAT_KRACH_INITIAL);
  });
  it('les trois tranches déploient exactement 100 % de BO_départ', () => {
    const bo = 100000;
    const total = montantTranche(P, bo, 1) + montantTranche(P, bo, 2) + montantTranche(P, bo, 3);
    expect(total).toBe(bo);
  });
  it('un saut direct à −36 % déclenche les trois tranches une seule fois', () => {
    const r1 = avancerKrach(P, ETAT_KRACH_INITIAL, -0.36, e(3000));
    expect(r1.evenements.filter((x) => x.type === 'tranche').length).toBe(3);
    const r2 = avancerKrach(P, r1.etat, -0.4, e(3000));
    expect(r2.evenements.length).toBe(0);
  });
  it('rejoue une série de relevés avec plus haut historique', () => {
    const releves = [100, 88, 84, 78, 73, 82, 91].map((v, i) => ({ id: String(i), date: `2027-0${i + 1}-01`, valeur: v }));
    const pts = rejouerIndice(P, releves, () => e(3000));
    expect(pts[2].etat.actif).toBe(true);
    expect(pts[2].etat.boDepart).toBe(e(3000));
    expect(pts[4].etat.tranchesDeclenchees).toBe(2);
    expect(pts[6].etat.actif).toBe(false);
  });
});

describe('Cas 4 — crypto au-delà du plafond', () => {
  it('alerte « action immédiate » et vente pour revenir à 7,5 %', () => {
    const s = syntheseC({ core: 60000, satellite: 24000, crypto: 11000, matieres_premieres: 3000, fun: 2000 });
    expect(s.parSousPoche.crypto / s.C).toBeCloseTo(0.11, 10);
    const al = calculerAlertes({ p: P, s, ciblesC: P.ciblesC, depensesEssentielles: e(2000), aMois: 3, historiqueFlux: [], krach: ETAT_KRACH_INITIAL, baisse: null, mesureSatellite: null, expositions: [], fraisAnnuels: null, projet: null, nbWatchlist: 0 });
    const crypto = al.find((a) => a.code === 'crypto')!;
    expect(crypto.niveau).toBe('action');
    expect(venteCrypto(P, s)).toBe(e(11000 - 7500));
  });
});

describe('Cas 5 — plafond BO', () => {
  it('C = 50 000 €, BO = 6 000 € → plafond 5 000 €, surplus 1 000 €', () => {
    const s = syntheseC({ core: 30000, satellite: 12500, crypto: 3750, matieres_premieres: 2500, fun: 1250 }, 0, 6000);
    expect(s.C).toBe(e(50000));
    expect(plafondBO(P, s.C)).toBe(e(5000));
    expect(surplusBO(P, s)).toBe(e(1000));
  });
});

describe('Alertes — décisions du 5 novembre 2026', () => {
  const base = { p: P, ciblesC: P.ciblesC, depensesEssentielles: e(2000), historiqueFlux: [], krach: ETAT_KRACH_INITIAL, baisse: null, mesureSatellite: null, expositions: [], fraisAnnuels: null, projet: null, nbWatchlist: 0 };
  it('couverture de A : alerte sous A_MOIS = 4', () => {
    const s = syntheseC({ core: 1000 }, 7000);
    expect(calculerAlertes({ ...base, s, aMois: 4 }).find((a) => a.code === 'couverture_a')!.niveau).toBe('attention');
    expect(calculerAlertes({ ...base, s, aMois: 3 }).find((a) => a.code === 'couverture_a')!.niveau).toBe('ok');
  });
  it("taux d'épargne vide : pas d'alerte", () => {
    const s = syntheseC({ core: 1000 }, 7000);
    expect(calculerAlertes({ ...base, s, aMois: 3 }).find((a) => a.code === 'epargne')).toBeUndefined();
  });
});

describe('Cibles B-Projet', () => {
  it('montant_BP et effort_BP', () => {
    const m = montantBP(P, e(20000), e(2000));
    expect(m).toBe(e(24200));
    expect(moisRestants('2026-11-06', '2028-11-01')).toBe(24);
    expect(effortBP(m, e(2200), 24)).toBe(Math.round(e(22000) / 24));
  });
});

describe('XIRR', () => {
  it("reproduit l'exemple de référence d'Excel (37,34 %)", () => {
    const r = xirr([
      { date: '2008-01-01', montant: -10000 },
      { date: '2008-03-01', montant: 2750 },
      { date: '2008-10-30', montant: 4250 },
      { date: '2009-02-15', montant: 3250 },
      { date: '2009-04-01', montant: 2750 }
    ]);
    expect(r!).toBeCloseTo(0.373362535, 6);
  });
  it('un an à +10 %', () => {
    expect(xirr([{ date: '2025-01-01', montant: -1000 }, { date: '2026-01-01', montant: 1100 }])!).toBeCloseTo(0.1, 6);
  });
  it('aucun flux positif : null', () => {
    expect(xirr([{ date: '2025-01-01', montant: -1000 }])).toBeNull();
  });
});
