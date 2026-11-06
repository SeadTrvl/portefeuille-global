// Écran Krach (§ 5) : relevés du MSCI World en euros, état de l'épisode, tranches à déployer.
import { useState } from 'preact/hooks';
import { useApp } from './store';
import { Carte, ChampDate, ChampNombre, Eur, Pct, Graphique, couleurs, Vide, dateFr, LIBELLES_LIGNES } from './commun';
import { montantTranche, prochaineTranche, conditionsTranche } from '../moteur/krach';
import { repartirSelonManques } from '../moteur/flux';
import { nouvelId } from '../donnees/etat';
import { aujourdhui } from '../donnees/calculs';
import { formatPct } from '../moteur/montants';
import type { LigneCore } from '../moteur/types';

export function Krach() {
  const { calc, etat, maj } = useApp();
  const { p, krach } = calc;
  const [date, setDate] = useState(aujourdhui());
  const [valeur, setValeur] = useState<number | null>(null);
  const [plusHaut, setPlusHaut] = useState<number | null>(null);

  const points = calc.pointsIndice;
  const dernier = points.at(-1);
  const BO = calc.s.parPoche.BO;
  const prochaine = prochaineTranche(p, krach, BO);

  // Tranches de l'épisode en cours : déclenchées, déployées (notées au journal) ou à venir.
  const deployees = new Set(
    etat.journal.filter((d) => d.tranche && krach.dateDebut && d.tranche.dateDebutEpisode === krach.dateDebut).map((d) => d.tranche!.numero)
  );

  function ajouter() {
    if (valeur === null) return;
    maj((e) => {
      e.indice.push({ id: nouvelId(), date, valeur, plusHautSaisi: plusHaut ?? undefined, bo: BO });
    });
    setValeur(null);
    setPlusHaut(null);
  }

  return (
    <>
      <Carte titre="Baisse du MSCI World (en euros)">
        {dernier ? (
          <div class="chiffres">
            <div><span>Dernier relevé</span><strong>{dernier.releve.valeur.toLocaleString('fr-FR')}</strong><small>{dateFr(dernier.releve.date)}</small></div>
            <div><span>Plus haut historique</span><strong>{dernier.plusHaut.toLocaleString('fr-FR')}</strong></div>
            <div><span>Baisse</span><strong><Pct x={dernier.baisse} /></strong></div>
            <div><span>Épisode</span><strong>{krach.actif ? `Actif depuis le ${dateFr(krach.dateDebut)}` : 'Inactif'}</strong></div>
          </div>
        ) : (
          <Vide>Aucun relevé. Saisis la valeur actuelle du MSCI World en euros et son plus haut historique.</Vide>
        )}
        <p class="doux">Paliers : {p.kPaliers.map((k) => formatPct(k, 0)).join(', ')} · fin d'épisode au-dessus de {formatPct(p.kFin, 0)}. Une baisse seule ne suffit jamais : seule la règle écrite déclenche.</p>
      </Carte>

      <Carte titre="Tranches">
        {krach.actif && krach.boDepart !== null ? (
          <>
            <p>
              BO_départ figé au début de l'épisode : <Eur c={krach.boDepart} />
            </p>
            <ul class="ordres">
              {p.kPaliers.map((palier, i) => {
                const n = i + 1;
                const montant = montantTranche(p, krach.boDepart!, n);
                const declenchee = krach.tranchesDeclenchees >= n;
                const deployee = deployees.has(n);
                return (
                  <li>
                    <div>
                      <b>Tranche {n} — palier {formatPct(palier, 0)}</b>
                      <small>{deployee ? 'Déployée (notée au journal)' : declenchee ? 'Déclenchée : à déployer' : 'Pas encore atteinte'}</small>
                    </div>
                    <strong><Eur c={montant} /></strong>
                  </li>
                );
              })}
            </ul>
            {p.kPaliers.map((_, i) => i + 1).filter((n) => krach.tranchesDeclenchees >= n && !deployees.has(n)).map((n) => (
              <Deploiement numero={n} montant={montantTranche(p, krach.boDepart!, n)} />
            ))}
          </>
        ) : (
          <>
            <Vide>Pas d'épisode de krach en cours.</Vide>
            {prochaine && (
              <p>
                Si la baisse atteint {formatPct(prochaine.palier, 0)}, la 1re tranche serait de <Eur c={prochaine.montant} /> (1/3 de B-Opportunité, aujourd'hui <Eur c={BO} />).
              </p>
            )}
          </>
        )}
      </Carte>

      <Carte titre="Nouveau relevé">
        <div class="formulaire">
          <ChampDate libelle="Date" valeur={date} onChange={setDate} />
          <ChampNombre libelle="MSCI World en euros" valeur={valeur} onChange={setValeur} />
          <ChampNombre libelle="Plus haut historique (facultatif)" valeur={plusHaut} onChange={setPlusHaut} aide="À saisir au premier relevé ; ensuite il est suivi automatiquement" />
        </div>
        <div class="boutons">
          <button class="principal" disabled={valeur === null} onClick={ajouter}>Ajouter le relevé</button>
        </div>
      </Carte>

      {points.length > 1 && (
        <Carte titre="Historique de la baisse">
          <Graphique
            config={() => {
              const c = couleurs();
              return {
                type: 'line',
                data: {
                  labels: points.map((x) => dateFr(x.releve.date)),
                  datasets: [
                    { label: 'Baisse', data: points.map((x) => Math.round(x.baisse * 1000) / 10), borderColor: c.serie[0], backgroundColor: c.serie[0], pointRadius: 2 },
                    ...p.kPaliers.map((k, i) => ({ label: `Palier ${formatPct(k, 0)}`, data: points.map(() => k * 100), borderColor: c.negatif, borderDash: [2 + i * 2, 4], pointRadius: 0, borderWidth: 1 }))
                  ]
                },
                options: { maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { ticks: { callback: (v) => v + ' %' } } } }
              };
            }}
          />
        </Carte>
      )}

      {points.length > 0 && (
        <Carte titre="Relevés">
          <table class="tableau">
            <thead><tr><th>Date</th><th>Indice</th><th>Baisse</th><th /></tr></thead>
            <tbody>
              {[...points].reverse().map((x) => (
                <tr>
                  <td>{dateFr(x.releve.date)}</td>
                  <td>{x.releve.valeur.toLocaleString('fr-FR')}</td>
                  <td><Pct x={x.baisse} /> {x.evenements.map((ev) => (ev.type === 'debut' ? ' · début' : ev.type === 'fin' ? ' · fin' : ` · T${ev.numero}`)).join('')}</td>
                  <td>
                    <button class="lien" onClick={() => confirm('Supprimer ce relevé ?') && maj((e) => { e.indice = e.indice.filter((r) => r.id !== x.releve.id); })}>Suppr.</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Carte>
      )}
    </>
  );
}

/** Déploiement d'une tranche : conditions du § 5, répartition dans le Core, note au journal. */
function Deploiement({ numero, montant }: { numero: number; montant: number }) {
  const { calc, maj } = useApp();
  const { s, p, krach } = calc;
  const { vers } = repartirSelonManques(montant, s.C, s.core, calc.ciblesC.ciblesCore);
  const poidsCoreApres = s.C + montant > 0 ? (s.parSousPoche.core + montant) / (s.C + montant) : 0;
  const conditions = conditionsTranche({ A: s.parPoche.A, cibleA: calc.cibleA, poidsCoreApres, plafondCore: p.bandesC.core[1] });
  const ok = conditions.every((c) => c.ok);

  return (
    <div class="deploiement">
      <h3>Déployer la tranche {numero}</h3>
      <ul class="conditions">
        {conditions.map((c) => (
          <li class={c.ok ? 'ok' : 'ko'}>{c.ok ? '✓' : '✗'} {c.libelle}</li>
        ))}
      </ul>
      <p>Destination : sous-poches du Core sous leur cible (même formule que les flux).</p>
      <ul class="ordres">
        {(Object.keys(vers) as LigneCore[]).filter((k) => vers[k] > 0).map((k) => (
          <li><b>{LIBELLES_LIGNES[k]}</b><strong><Eur c={vers[k]} /></strong></li>
        ))}
      </ul>
      <p class="doux">Arbitrage depuis le fonds euros de l'assurance-vie. Une action Satellite n'est possible que si sa fiche est à jour, son score ≥ {p.satScoreMin} et sa taille sous {formatPct(p.satMax, 0)}.</p>
      {!ok && <p class="avertissement">Une condition n'est pas remplie : la règle ne permet pas de déployer cette tranche maintenant.</p>}
      <button
        class="principal"
        disabled={!ok}
        onClick={() =>
          maj((e) => {
            e.journal.push({
              id: nouvelId(),
              date: aujourdhui(),
              action: `Tranche de krach n° ${numero} : B-Opportunité vers Core`,
              montant,
              motif: `Palier ${formatPct(p.kPaliers[numero - 1], 0)} atteint`,
              regle: '§ 5 règle de krach',
              tranche: { dateDebutEpisode: krach.dateDebut!, numero }
            });
          })
        }
      >
        Noter le déploiement au journal
      </button>
    </div>
  );
}
