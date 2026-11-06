import { describe, expect, it } from 'vitest';
import { crdApres, echeancesPayees, etatCredit, mensualite, totalCredits, type Credit } from '../src/moteur/credits';

const e = (euros: number) => Math.round(euros * 100);

describe('Crédits', () => {
  it('mensualité : 100 000 € à 3 % sur 20 ans = 554,60 €', () => {
    expect(mensualite(e(100000), 0.03, 240)).toBe(e(554.6));
  });
  it('capital restant dû après 12 échéances : 96 294,15 €', () => {
    expect(crdApres(e(100000), 0.03, 240, 12)).toBe(e(96294.15));
    expect(crdApres(e(100000), 0.03, 240, 240)).toBe(0);
  });
  it('échéances payées selon la date', () => {
    expect(echeancesPayees('2025-01-05', '2025-01-04', 240)).toBe(0);
    expect(echeancesPayees('2025-01-05', '2025-01-05', 240)).toBe(1);
    expect(echeancesPayees('2025-01-05', '2026-01-04', 240)).toBe(12);
    expect(echeancesPayees('2005-01-05', '2026-01-04', 240)).toBe(240);
  });
  it('prêt à taux zéro', () => {
    expect(mensualite(e(12000), 0, 24)).toBe(e(500));
    expect(crdApres(e(12000), 0, 24, 6)).toBe(e(9000));
  });
  it('saisie manuelle prioritaire et total des crédits inclus', () => {
    const immo: Credit = { id: 'i', nom: 'Immo', montant: e(100000), taux: 0.03, dureeMois: 240, premiereEcheance: '2025-11-10', inclus: true };
    const conso: Credit = { id: 'c', nom: 'Conso', crdSaisi: e(3000), dateCrdSaisi: '2026-10-01', inclus: false };
    expect(etatCredit(immo, '2026-11-06').crd).toBe(e(96294.15));
    expect(etatCredit({ ...immo, crdSaisi: e(96000), dateCrdSaisi: '2026-11-01' }, '2026-11-06').crd).toBe(e(96000));
    // Saisie d'il y a un an : on retranche l'amortissement des 12 échéances payées depuis.
    const ancienne = etatCredit({ ...immo, crdSaisi: e(99500), dateCrdSaisi: '2025-11-15' }, '2026-11-06').crd;
    expect(ancienne).toBe(e(99500) - (crdApres(e(100000), 0.03, 240, 1) - e(96294.15)));
    expect(totalCredits([immo, conso], '2026-11-06')).toBe(e(96294.15));
    expect(totalCredits([immo, { ...conso, inclus: true }], '2026-11-06')).toBe(e(99294.15));
  });
});
