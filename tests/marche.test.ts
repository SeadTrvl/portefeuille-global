import { describe, expect, it } from 'vitest';
import { lireCsvBCE } from '../src/donnees/marche';

const csv = `KEY,FREQ,CURRENCY,CURRENCY_DENOM,EXR_TYPE,EXR_SUFFIX,TIME_PERIOD,OBS_VALUE,OBS_STATUS
EXR.D.USD.EUR.SP00.A,D,USD,EUR,SP00,A,2026-10-30,1.1190,A
EXR.D.USD.EUR.SP00.A,D,USD,EUR,SP00,A,2026-11-02,1.1201,A
EXR.D.USD.EUR.SP00.A,D,USD,EUR,SP00,A,2026-11-03,1.1215,A`;

describe('Taux BCE', () => {
  it('prend le taux du jour demandé', () => {
    expect(lireCsvBCE(csv, '2026-11-02')).toEqual({ date: '2026-11-02', usdParEur: 1.1201 });
  });
  it('un dimanche : dernier taux publié avant', () => {
    expect(lireCsvBCE(csv, '2026-11-01')).toEqual({ date: '2026-10-30', usdParEur: 1.119 });
  });
  it('réponse vide : null', () => {
    expect(lireCsvBCE('', '2026-11-01')).toBeNull();
  });
});
