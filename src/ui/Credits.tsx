// Crédits en cours : saisie, capital restant dû, et prise en compte (ou non) dans le patrimoine net.
import { useState } from 'preact/hooks';
import { useApp } from './store';
import { Carte, ChampDate, ChampMontant, ChampNombre, ChampTexte, Eur, Vide, dateFr } from './commun';
import { etatCredit, estAmortissable, mensualite, type Credit } from '../moteur/credits';
import { nouvelId } from '../donnees/etat';
import { formatPct } from '../moteur/montants';

export function Credits() {
  const { etat, maj, calc } = useApp();
  const vide: Credit = { id: '', nom: '', inclus: true };
  const [c, setC] = useState<Credit>(vide);
  const credits = etat.credits ?? [];
  const inclure = etat.preferences?.inclureCredits !== false;

  const apercu = estAmortissable(c) ? mensualite(c.montant!, c.taux!, c.dureeMois!) : null;

  return (
    <>
      <Carte titre="Patrimoine et crédits">
        <div class="chiffres">
          <div><span>Patrimoine brut</span><strong><Eur c={calc.s.total} /></strong></div>
          <div><span>Crédits en cours</span><strong class="negatif">−<Eur c={calc.credits} /></strong></div>
          <div><span>Patrimoine net</span><strong><Eur c={calc.s.total - calc.credits} /></strong></div>
        </div>
        <label class="case">
          <input type="checkbox" checked={inclure} onChange={(e) => maj((x) => { x.preferences = { ...x.preferences, inclureCredits: (e.target as HTMLInputElement).checked }; })} />
          Déduire les crédits du patrimoine affiché sur le tableau de bord
        </label>
        <p class="doux">Les crédits ne changent aucune règle du guide (poches, flux, krach) : ils servent seulement à afficher le patrimoine net.</p>
      </Carte>

      <Carte titre="Crédits en cours">
        {credits.length === 0 ? (
          <Vide>Aucun crédit.</Vide>
        ) : (
          <ul class="liste">
            {credits.map((x) => {
              const s = etatCredit(x, calc.date);
              return (
                <li>
                  <div class="ligne-liste" onClick={() => setC(x)}>
                    <b>{x.nom}{x.etablissement ? ` · ${x.etablissement}` : ''}</b>
                    <Eur c={s.crd} />
                  </div>
                  <small onClick={() => setC(x)}>
                    {s.mensualite !== null ? `Mensualité ${((s.mensualite) / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}` : 'Capital restant dû saisi'}
                    {s.echeancesRestantes !== null ? ` · ${s.echeancesRestantes} échéances restantes` : ''}
                    {s.dateFin ? ` · fin ${dateFr(s.dateFin)}` : ''}
                    {s.rembourse !== null ? ` · ${formatPct(s.rembourse, 0)} remboursé` : ''}
                    {s.source === 'saisie' && x.dateCrdSaisi ? ` · recalé sur le relevé du ${dateFr(x.dateCrdSaisi)}` : ''}
                  </small>
                  {s.rembourse !== null && (
                    <div class="jauge"><div class="pleine" style={{ width: Math.min(100, s.rembourse * 100) + '%' }} /></div>
                  )}
                  <label class="case">
                    <input type="checkbox" checked={x.inclus} onChange={(e) => maj((et) => { et.credits = (et.credits ?? []).map((y) => (y.id === x.id ? { ...y, inclus: (e.target as HTMLInputElement).checked } : y)); })} />
                    Compté dans le patrimoine net
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </Carte>

      <Carte titre={c.id ? 'Modifier le crédit' : 'Nouveau crédit'}>
        <div class="formulaire">
          <ChampTexte libelle="Nom (ex. Prêt immobilier)" valeur={c.nom} onChange={(nom) => setC({ ...c, nom })} />
          <ChampTexte libelle="Établissement" valeur={c.etablissement ?? ''} onChange={(etablissement) => setC({ ...c, etablissement: etablissement || undefined })} />
          <ChampMontant libelle="Montant emprunté" valeur={c.montant ?? null} onChange={(m) => setC({ ...c, montant: m ?? undefined })} />
          <ChampNombre libelle="Taux nominal annuel (%)" valeur={c.taux !== undefined ? Math.round(c.taux * 100000) / 1000 : null} onChange={(n) => setC({ ...c, taux: n === null ? undefined : n / 100 })} />
          <ChampNombre libelle="Durée (mois)" valeur={c.dureeMois ?? null} onChange={(n) => setC({ ...c, dureeMois: n === null ? undefined : Math.round(n) })} />
          <ChampDate libelle="Date de la 1re échéance" valeur={c.premiereEcheance ?? ''} onChange={(d) => setC({ ...c, premiereEcheance: d || undefined })} />
          <ChampMontant libelle="Assurance mensuelle (facultatif)" valeur={c.assuranceMensuelle ?? null} onChange={(m) => setC({ ...c, assuranceMensuelle: m ?? undefined })} />
          <ChampMontant
            libelle="Capital restant dû selon la banque (facultatif)"
            valeur={c.crdSaisi ?? null}
            onChange={(m) => setC({ ...c, crdSaisi: m ?? undefined })}
            aide="Pour recaler le calcul (remboursement anticipé, différé…) ou pour un crédit sans tableau d'amortissement."
          />
          <ChampDate libelle="Date de ce capital restant dû" valeur={c.dateCrdSaisi ?? ''} onChange={(d) => setC({ ...c, dateCrdSaisi: d || undefined })} />
        </div>
        {apercu !== null && <p>Mensualité calculée (hors assurance) : <Eur c={apercu} /></p>}
        <div class="boutons">
          <button
            class="principal"
            disabled={!c.nom || (!estAmortissable(c) && c.crdSaisi === undefined)}
            onClick={() => {
              maj((e) => {
                e.credits = e.credits ?? [];
                if (c.id) e.credits = e.credits.map((x) => (x.id === c.id ? c : x));
                else e.credits.push({ ...c, id: nouvelId() });
              });
              setC(vide);
            }}
          >
            {c.id ? 'Enregistrer' : 'Ajouter'}
          </button>
          {c.id && (
            <>
              <button onClick={() => setC(vide)}>Annuler</button>
              <button
                class="danger"
                onClick={() => {
                  if (confirm('Supprimer ce crédit ?')) {
                    maj((e) => { e.credits = (e.credits ?? []).filter((x) => x.id !== c.id); });
                    setC(vide);
                  }
                }}
              >
                Supprimer
              </button>
            </>
          )}
        </div>
        <p class="doux">Renseigne soit le montant, le taux, la durée et la 1re échéance (le capital restant dû est alors calculé chaque mois), soit seulement le capital restant dû et sa date.</p>
      </Carte>
    </>
  );
}
