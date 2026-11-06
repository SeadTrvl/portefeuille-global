// Journal de décision (§ 10) et routine de gestion (§ 8).
import { useState } from 'preact/hooks';
import { useApp } from './store';
import { Carte, ChampDate, ChampMontant, ChampTexte, Eur, Vide, dateFr } from './commun';
import { nouvelId } from '../donnees/etat';
import { aujourdhui } from '../donnees/calculs';
import { surplusBO, venteCrypto } from '../moteur/alertes';
import { formatEuros } from '../moteur/montants';
import type { Decision } from '../moteur/types';

export function Journal() {
  const { calc, etat, maj } = useApp();
  const d = new Date();
  const annee = d.getFullYear();
  const trimestre = `${annee}-T${Math.floor(d.getMonth() / 3) + 1}`;
  const surplus = surplusBO(calc.p, calc.s);
  const crypto = venteCrypto(calc.p, calc.s);

  const trimestriel: [string, string][] = [
    ['valorisations', 'Mettre à jour les cours et le tableau de bord'],
    ['fiches', 'Relire les fiches des actions qui ont publié leurs résultats'],
    ['bandes', 'Vérifier les bandes de C (et la crypto sous 10 %' + (crypto > 0 ? ` : vendre ${formatEuros(crypto)}` : '') + ')'],
    ['krach', 'Saisir le MSCI World et vérifier les paliers de krach']
  ];
  const annuel: [string, string][] = [
    ['cible_a', `Recalculer cible_A à partir des dépenses essentielles réelles (actuelle : ${formatEuros(calc.cibleA)})`],
    ['reequilibrage', 'Rééquilibrer C : vendre ou acheter ce qui est encore hors bande, dans la même enveloppe si possible'],
    ['satellite', 'Mesurer le Satellite face au portefeuille fantôme'],
    ['bo', surplus > 0 ? `Ramener B-Opportunité sous son plafond : verser ${formatEuros(surplus)} dans C` : 'B-Opportunité sous son plafond : rien à faire'],
    ['frais', 'Revue des frais et de la fiscalité']
  ];

  const vide: Decision = { id: '', date: aujourdhui(), action: '', motif: '', regle: '' };
  const [dec, setDec] = useState<Decision>(vide);

  const cocher = (cle: string) => maj((e) => { e.revues[cle] = !e.revues[cle]; });

  return (
    <>
      <Carte titre={`Revue trimestrielle ${trimestre.replace('-T', ' · T')}`}>
        <Liste items={trimestriel} prefixe={trimestre} revues={etat.revues} cocher={cocher} />
        <p class="doux">30 à 45 min. Entre deux revues, la seule raison d'agir est une règle écrite qui se déclenche.</p>
      </Carte>
      <Carte titre={`Revue annuelle ${annee}`}>
        <Liste items={annuel} prefixe={`${annee}-A`} revues={etat.revues} cocher={cocher} />
      </Carte>

      <Carte titre={dec.id ? 'Modifier la décision' : 'Nouvelle décision'}>
        <div class="formulaire">
          <ChampDate libelle="Date" valeur={dec.date} onChange={(date) => setDec({ ...dec, date })} />
          <ChampTexte libelle="Action" valeur={dec.action} onChange={(action) => setDec({ ...dec, action })} />
          <ChampMontant libelle="Montant" valeur={dec.montant ?? null} onChange={(m) => setDec({ ...dec, montant: m ?? undefined })} />
          <ChampTexte libelle="Règle déclenchée" valeur={dec.regle} onChange={(regle) => setDec({ ...dec, regle })} />
          <ChampTexte libelle="Motif" valeur={dec.motif} onChange={(motif) => setDec({ ...dec, motif })} multi />
          <ChampDate libelle="Prochaine revue" valeur={dec.prochaineRevue ?? ''} onChange={(d) => setDec({ ...dec, prochaineRevue: d || undefined })} />
        </div>
        <div class="boutons">
          <button
            class="principal"
            disabled={!dec.action}
            onClick={() => {
              maj((e) => {
                if (dec.id) e.journal = e.journal.map((x) => (x.id === dec.id ? dec : x));
                else e.journal.push({ ...dec, id: nouvelId() });
              });
              setDec(vide);
            }}
          >
            {dec.id ? 'Enregistrer' : 'Ajouter au journal'}
          </button>
          {dec.id && <button onClick={() => setDec(vide)}>Annuler</button>}
        </div>
      </Carte>

      <Carte titre="Journal de décision">
        {etat.journal.length === 0 ? (
          <Vide>Aucune décision notée.</Vide>
        ) : (
          <ul class="liste">
            {[...etat.journal].sort((a, b) => b.date.localeCompare(a.date)).map((x) => (
              <li onClick={() => setDec(x)}>
                <div class="ligne-liste">
                  <b>{x.action}</b>
                  {x.montant !== undefined && <Eur c={x.montant} />}
                </div>
                <small>{dateFr(x.date)} · {x.regle}{x.motif ? ` · ${x.motif}` : ''}</small>
              </li>
            ))}
          </ul>
        )}
      </Carte>
    </>
  );
}

function Liste({ items, prefixe, revues, cocher }: { items: [string, string][]; prefixe: string; revues: Record<string, boolean>; cocher: (c: string) => void }) {
  return (
    <ul class="coches">
      {items.map(([k, l]) => {
        const cle = `${prefixe}:${k}`;
        return (
          <li>
            <label class="case">
              <input type="checkbox" checked={!!revues[cle]} onChange={() => cocher(cle)} />
              {l}
            </label>
          </li>
        );
      })}
    </ul>
  );
}
