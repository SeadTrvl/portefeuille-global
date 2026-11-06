// Satellite (§ 7) : mesure face au portefeuille fantôme, fiches, watchlist, tailles de position.
import { useState } from 'preact/hooks';
import { useApp } from './store';
import { Carte, ChampChoix, ChampDate, ChampNombre, ChampTexte, Eur, Pct, Vide, dateFr } from './commun';
import { portefeuilleFantome } from '../moteur/satellite';
import { formatPct } from '../moteur/montants';
import { nouvelId } from '../donnees/etat';
import { aujourdhui } from '../donnees/calculs';
import type { FicheSatellite, StatutFiche } from '../moteur/types';

export function Satellite() {
  const { calc, etat, maj } = useApp();
  const { p } = calc;
  const m = calc.mesureSatellite;
  const fantome = portefeuilleFantome(calc.idx);
  const vide: FicheSatellite = { id: '', actifId: '', nom: '', score: 0, these: '', antiThese: '', conditionsSortie: '', statut: 'watchlist' };
  const [f, setF] = useState<FicheSatellite>(vide);
  const nbWatch = etat.fiches.filter((x) => x.statut === 'watchlist').length;
  const actifsSat = etat.actifs.filter((a) => a.ligne === 'satellite');
  const etfs = etat.actifs.filter((a) => a.poche === 'C' && a.mode === 'cours' && a.ligne !== 'satellite');

  return (
    <>
      <Carte titre="Mesure du Satellite">
        <p>
          Cible actuelle : <b>{formatPct(etat.etatSatellite.cible, 0)} de C</b>
          {etat.etatSatellite.dateReduction ? ` (réduite le ${dateFr(etat.etatSatellite.dateReduction)})` : ''} · plafond absolu {formatPct(p.satPlafond, 0)}.
        </p>
        {m.statut === 'historique_insuffisant' ? (
          <p class="avertissement">
            Historique insuffisant : aucune décision avant {p.satFenetreAns} ans d'historique
            {m.dateDisponible ? ` (mesure possible à partir du ${dateFr(m.dateDisponible)})` : ''}.
          </p>
        ) : (
          <div class="chiffres">
            <div><span>TRI Satellite</span><strong><Pct x={m.triSatellite} /></strong></div>
            <div><span>TRI fantôme</span><strong><Pct x={m.triFantome} /></strong></div>
            <div><span>Écart (points / an)</span><strong><Pct x={m.ecart} d={2} /></strong><small>seuil −{p.satEcart * 100} points</small></div>
            <div><span>Fenêtre</span><strong>{dateFr(m.debut)} → {dateFr(m.fin)}</strong></div>
          </div>
        )}
        {calc.decisionSatellite && (
          <div class="deploiement">
            <p>
              <b>Règle déclenchée :</b> {calc.decisionSatellite.motif}. Nouvelle cible : {formatPct(calc.decisionSatellite.nouvelleCible, 0)}.
            </p>
            <button
              class="principal"
              onClick={() =>
                maj((e) => {
                  const d = calc.decisionSatellite!;
                  const reduction = d.nouvelleCible < e.etatSatellite.cible;
                  e.etatSatellite = { cible: d.nouvelleCible, dateReduction: reduction ? aujourdhui() : undefined };
                  e.journal.push({ id: nouvelId(), date: aujourdhui(), action: `Cible du Satellite : ${formatPct(d.nouvelleCible, 0)}`, motif: d.motif, regle: '§ 7 mesure du Satellite' });
                })
              }
            >
              Appliquer et noter au journal
            </button>
          </div>
        )}
      </Carte>

      <Carte titre="Positions détenues">
        {calc.expositions.length === 0 ? (
          <Vide>Aucune fiche au statut « détenue ».</Vide>
        ) : (
          <table class="tableau">
            <thead><tr><th>Action</th><th>Direct</th><th>+ via ETF</th><th /></tr></thead>
            <tbody>
              {calc.expositions.map((x) => (
                <tr>
                  <td><b>{x.fiche.nom}</b><small><Eur c={x.direct} /></small></td>
                  <td><Pct x={x.poidsDirect} /></td>
                  <td><Pct x={x.poidsTotal} /></td>
                  <td>{x.alertes.length ? <span class="pastille attention" title={x.alertes.join(' ; ')}>!</span> : <span class="pastille ok">OK</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p class="doux">
          Entrée {formatPct(p.satEntree, 0)} · normale {formatPct(p.satNormale[0], 0)}–{formatPct(p.satNormale[1])} · maximum {formatPct(p.satMax, 0)} · revue au-delà de {formatPct(p.satExpoRevue)} (direct + via ETF). Pas de stop-loss mécanique.
        </p>
        <p class="question">« Si je ne possédais pas cette action, l'achèterais-je au prix actuel ? »</p>
      </Carte>

      <Carte titre={f.id ? 'Modifier la fiche' : 'Nouvelle fiche'}>
        {nbWatch >= p.watchlistMax && f.statut === 'watchlist' && !f.id && <p class="avertissement">La watchlist compte déjà {nbWatch} entreprises (maximum {p.watchlistMax}).</p>}
        <div class="formulaire">
          <ChampTexte libelle="Entreprise" valeur={f.nom} onChange={(nom) => setF({ ...f, nom })} />
          <ChampChoix libelle="Actif lié" valeur={f.actifId} options={[['', '— (watchlist sans actif)'], ...actifsSat.map((a) => [a.id, a.nom] as [string, string])]} onChange={(actifId) => setF({ ...f, actifId })} />
          <ChampNombre libelle="Score (sur 100)" valeur={f.score} onChange={(score) => setF({ ...f, score: score ?? 0 })} aide={`Achat possible à partir de ${p.satScoreMin}`} />
          <ChampChoix<StatutFiche> libelle="Statut" valeur={f.statut} options={[['watchlist', 'Watchlist'], ['detenue', 'Détenue'], ['vendue', 'Vendue']]} onChange={(statut) => setF({ ...f, statut })} />
          <ChampTexte libelle="Thèse" valeur={f.these} onChange={(these) => setF({ ...f, these })} multi />
          <ChampTexte libelle="Anti-thèse" valeur={f.antiThese} onChange={(antiThese) => setF({ ...f, antiThese })} multi />
          <ChampTexte libelle="Conditions de sortie" valeur={f.conditionsSortie} onChange={(conditionsSortie) => setF({ ...f, conditionsSortie })} multi />
          <ChampDate libelle="Dernière revue" valeur={f.dateDerniereRevue ?? ''} onChange={(d) => setF({ ...f, dateDerniereRevue: d || undefined })} />
          {etfs.map((etf) => (
            <ChampNombre
              libelle={`Poids dans ${etf.nom} (%)`}
              valeur={f.poidsDansEtf?.[etf.id] !== undefined ? Math.round(f.poidsDansEtf[etf.id] * 10000) / 100 : null}
              onChange={(n) => {
                const poids = { ...(f.poidsDansEtf ?? {}) };
                if (n === null) delete poids[etf.id];
                else poids[etf.id] = n / 100;
                setF({ ...f, poidsDansEtf: poids });
              }}
            />
          ))}
          <label class="case">
            <input type="checkbox" checked={!!f.aRenforcer} onChange={(e) => setF({ ...f, aRenforcer: (e.target as HTMLInputElement).checked })} />
            Action à renforcer (décidée à la dernière revue)
          </label>
        </div>
        {f.statut === 'detenue' && f.score < p.satScoreMin && <p class="avertissement">Score sous {p.satScoreMin} : l'achat n'est pas permis par le guide.</p>}
        {f.statut === 'detenue' && (!f.these || !f.antiThese || !f.conditionsSortie) && <p class="avertissement">Thèse, anti-thèse et conditions de sortie doivent être écrites avant l'achat.</p>}
        <div class="boutons">
          <button
            class="principal"
            disabled={!f.nom}
            onClick={() => {
              maj((e) => {
                if (f.aRenforcer) e.fiches.forEach((x) => (x.aRenforcer = false));
                if (f.id) e.fiches = e.fiches.map((x) => (x.id === f.id ? f : x));
                else e.fiches.push({ ...f, id: nouvelId() });
              });
              setF(vide);
            }}
          >
            {f.id ? 'Enregistrer' : 'Ajouter'}
          </button>
          {f.id && <button onClick={() => setF(vide)}>Annuler</button>}
        </div>
      </Carte>

      <Carte titre={`Fiches (${nbWatch}/${p.watchlistMax} en watchlist)`}>
        {etat.fiches.length === 0 ? (
          <Vide>Aucune fiche.</Vide>
        ) : (
          <ul class="liste">
            {etat.fiches.map((x) => (
              <li onClick={() => setF(x)}>
                <div class="ligne-liste">
                  <b>{x.nom}{x.aRenforcer ? ' · à renforcer' : ''}</b>
                  <span class={'pastille ' + (x.score >= p.satScoreMin ? 'ok' : 'attention')}>{x.score}/100</span>
                </div>
                <small>{{ watchlist: 'Watchlist', detenue: 'Détenue', vendue: 'Vendue' }[x.statut]} · revue {dateFr(x.dateDerniereRevue)}</small>
              </li>
            ))}
          </ul>
        )}
      </Carte>

      <Carte titre="Portefeuille fantôme">
        {fantome.coursManquants.length > 0 && <p class="avertissement">Cours de l'ETF World manquant pour {fantome.coursManquants.length} opération(s) : marque un ETF MSCI World de référence et saisis son cours.</p>}
        {fantome.operations.length === 0 ? (
          <Vide>Les opérations miroir apparaissent automatiquement à chaque achat ou vente Satellite.</Vide>
        ) : (
          <table class="tableau">
            <thead><tr><th>Date</th><th>Montant</th><th>Cours ETF</th><th>Parts</th></tr></thead>
            <tbody>
              {fantome.operations.map((o) => (
                <tr>
                  <td>{dateFr(o.date)}</td>
                  <td><Eur c={o.montant} /></td>
                  <td>{o.coursEtf.toLocaleString('fr-FR')} €</td>
                  <td>{o.parts.toLocaleString('fr-FR', { maximumFractionDigits: 4 })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Carte>
    </>
  );
}
