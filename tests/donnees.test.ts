import { describe, expect, it } from 'vitest';
import { deserialiser, etatVide, serialiser, ErreurImport } from '../src/donnees/etat';

describe('Fichier portefeuille.json', () => {
  it('aller-retour sans perte', () => {
    const e = etatVide();
    e.modifie_le = '2026-11-06T10:00:00.000Z';
    e.profil = { revenuVariable: true, depensesEssentielles: 180000 };
    e.actifs.push({ id: 'a', nom: 'Livret A', poche: 'A', ligne: 'livret', mode: 'valeur' });
    e.operations.push({ id: 'o', date: '2026-11-01', actifId: 'a', type: 'versement', montant: 500000, frais: 0 });
    e.valorisations.push({ id: 'v', date: '2026-11-05', actifId: 'a', valeur: 501000 });
    e.indice.push({ id: 'i', date: '2026-11-05', valeur: 10000, plusHautSaisi: 10500 });
    e.etatSatellite = { cible: 0.15, dateReduction: '2026-01-01' };
    expect(deserialiser(serialiser(e))).toEqual(e);
  });
  it('complète un fichier ancien incomplet', () => {
    const e = deserialiser(JSON.stringify({ version_schema: 1, actifs: [] }));
    expect(e.operations).toEqual([]);
    expect(e.parametres.BO_MIN).toBe(1000);
  });
  it('refuse un fichier qui n’est pas un portefeuille', () => {
    expect(() => deserialiser('{"a":1}')).toThrow(ErreurImport);
    expect(() => deserialiser('pas du json')).toThrow(ErreurImport);
  });
});
