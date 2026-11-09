// « Ce mois-ci » : répartition de l'épargne du mois (§ 4), présentée comme une liste d'ordres à passer.
import { useState } from 'preact/hooks';
import { useApp } from './store';
import { BUDGET_DEFAUT } from '../donnees/etat';
import { Carte, ChampMontant, Eur, Pct, Vide, LIBELLES_LIGNES, dateFr } from './commun';
import { formatDollars, formatEuros, formatPct, type Centimes } from '../moteur/montants';
import type { Actif, Ligne, Operation, Poche } from '../moteur/types';
import { LIBELLES_SOUS_POCHES } from '../moteur/alertes';

interface Ordre {
  libelle: string;
  detail: string;
  montant: Centimes;
  actif?: Actif;
  ligne?: Ligne; // rattachement si différent de l'actif (Satellite en attente)
}

export function CeMois() {
  const { calc, etat, maj, saisirOperation } = useApp();
  const maintenant = new Date();
  const moisDefaut = `${maintenant.getFullYear()}-${String(maintenant.getMonth() + 1).padStart(2, '0')}`;
  const [mois, setMois] = useState(moisDefaut);
  const [revenu, setRevenu] = useState<Centimes | null>(null);
  const [depenses, setDepenses] = useState<Centimes | null>(etat.profil.depensesEssentielles || null);
  const [epargne, setEpargne] = useState<Centimes | null>(null);
  const [enregistre, setEnregistre] = useState(false);

  const E = epargne ?? 0;
  const r = calc.repartir(E);
  const actifs = etat.actifs.filter((a) => !a.archive);
  const trouver = (poche: Poche, lignes: Ligne[]) => actifs.find((a) => a.poche === poche && lignes.includes(a.ligne));

  const ordres: Ordre[] = [];
  if (r.versA > 0) ordres.push({ libelle: 'A — Sécurité', detail: 'Livret A, puis LDDS au-delà du plafond', montant: r.versA, actif: trouver('A', ['livret']) });
  if (r.versBP > 0 && calc.projet) {
    const support = { plus3ans: 'fonds euros majoritaire + livrets', '1a3ans': 'livrets + fonds euros', moins12mois: 'livrets ou fonds monétaire, 100 % disponible' }[calc.projet.tempsRestant];
    ordres.push({ libelle: `B-Projet — ${calc.projet.projet.nom}`, detail: support, montant: r.versBP, actif: trouver('BP', ['livret', 'fonds_euros', 'monetaire']) });
  }
  if (r.versBO > 0) ordres.push({ libelle: 'B-Opportunité', detail: "Fonds euros de l'assurance-vie", montant: r.versBO, actif: trouver('BO', ['fonds_euros']) });

  const lignesC: [Ligne, Centimes][] = [
    ['world', r.versCore.world],
    ['emergents', r.versCore.emergents],
    ['europe', r.versCore.europe]
  ];
  for (const [l, m] of lignesC) if (m > 0) ordres.push({ libelle: `C — ${LIBELLES_LIGNES[l]}`, detail: 'Core ETF', montant: m, actif: trouver('C', [l]) });
  if (r.versC.satellite > 0) {
    const fiche = etat.fiches.find((f) => f.aRenforcer && f.statut !== 'vendue');
    const actifFiche = fiche ? etat.actifs.find((a) => a.id === fiche.actifId) : undefined;
    if (actifFiche) {
      ordres.push({ libelle: `C — Satellite : ${actifFiche.nom}`, detail: 'Action à renforcer décidée à la dernière revue', montant: r.versC.satellite, actif: actifFiche });
    } else {
      const world = etat.actifs.find((a) => a.etfWorldReference) ?? trouver('C', ['world']);
      ordres.push({ libelle: 'C — Satellite (en attente)', detail: "Pas d'action à renforcer : ETF MSCI World, compté dans le Satellite jusqu'à l'achat", montant: r.versC.satellite, actif: world, ligne: 'satellite' });
    }
  }
  if (r.versC.crypto > 0) ordres.push({ libelle: 'C — Crypto', detail: 'BTC, éventuellement ETH', montant: r.versC.crypto, actif: trouver('C', ['crypto']) });
  if (r.versMP.or > 0) ordres.push({ libelle: 'C — Or', detail: 'Matières premières', montant: r.versMP.or, actif: trouver('C', ['or']) });
  if (r.versMP.panier > 0) ordres.push({ libelle: 'C — Panier matières premières', detail: 'Matières premières', montant: r.versMP.panier, actif: trouver('C', ['panier']) });
  if (r.versC.fun > 0) ordres.push({ libelle: 'C — Fun / alternatifs', detail: 'Peut perdre 100 %', montant: r.versC.fun, actif: trouver('C', ['fun']) });

  const tauxUsd = calc.idx.tauxA(calc.date);
  const dejaFait = etat.fluxMensuels.find((f) => f.mois === mois);

  function enregistrer() {
    maj((e) => {
      e.fluxMensuels = e.fluxMensuels.filter((f) => f.mois !== mois);
      e.fluxMensuels.push({
        mois,
        revenuNet: revenu ?? 0,
        depensesEssentielles: depenses ?? 0,
        epargne: E,
        versA: r.versA,
        versBP: r.versBP,
        versBO: r.versBO,
        versC: r.versC,
        versLignes: { ...r.versCore, ...r.versMP }
      });
      if (depenses) e.profil.depensesEssentielles = depenses;
    });
    setEnregistre(true);
  }

  function saisir(o: Ordre) {
    if (!o.actif) return;
    const b: Partial<Operation> = {
      actifId: o.actif.id,
      type: o.actif.mode === 'valeur' ? 'versement' : 'achat',
      montant: o.montant,
      regle: '§ 4 flux mensuels'
    };
    if (o.ligne) b.ligne = o.ligne;
    saisirOperation(b);
  }

  return (
    <>
      <Carte titre="Épargne du mois">
        <div class="formulaire">
          <label class="champ">
            <span>Mois</span>
            <input type="month" value={mois} onChange={(e) => setMois((e.target as HTMLInputElement).value)} />
          </label>
          <ChampMontant libelle="Revenu net" valeur={revenu} onChange={setRevenu} />
          <ChampMontant libelle="Dépenses essentielles" valeur={depenses} onChange={setDepenses} aide="Sert à la cible de A" />
          <ChampMontant libelle="Épargne à répartir" valeur={epargne} onChange={setEpargne} />
        </div>
        {revenu && epargne ? (
          <p class="doux">
            Taux d'épargne : <Pct x={epargne / revenu} />
          </p>
        ) : null}
        {calc.krach.actif && <p class="avertissement">Épisode de krach en cours : la reconstitution de B-Opportunité (étape 3) est suspendue.</p>}
      </Carte>

      {revenu ? <RepartitionBudget revenu={revenu} depenses={depenses} epargne={epargne} /> : null}

      {calc.projet && (
        <Carte titre={`B-Projet — ${calc.projet.projet.nom}`}>
          <p>
            effort_BP = max(0 ; montant_BP − BP) / mois restants = max(0 ; <Eur c={calc.projet.montant} /> − <Eur c={calc.projet.BP} />) / {calc.projet.mois} ={' '}
            <b><Eur c={calc.projet.effort} /></b> par mois
          </p>
          <p class="doux">Prélevé sur l'épargne après A et avant B-Opportunité (§ 4, étape 2). Usage prévu le {dateFr(calc.projet.projet.dateUsage)}.</p>
        </Carte>
      )}

      <Carte titre="Ordres à passer">
        {E === 0 ? (
          <Vide>Indique ton épargne du mois pour obtenir la liste.</Vide>
        ) : (
          <>
            <ul class="ordres">
              {ordres.map((o) => (
                <li>
                  <div>
                    <b>{o.libelle}</b>
                    <small>{o.actif ? `${o.actif.nom} · ${o.detail}` : `${o.detail} · aucun actif créé pour cette ligne`}</small>
                  </div>
                  <div class="ordre-droite">
                    <strong>
                      <Eur c={o.montant} />
                      {o.actif?.devise === 'USD' && tauxUsd && <small>≈ {formatDollars(Math.round(o.montant * tauxUsd.usdParEur))}</small>}
                    </strong>
                    {o.actif && (
                      <button class="petit" onClick={() => saisir(o)}>
                        Saisir
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            <details>
              <summary>Détail du calcul (§ 4)</summary>
              <table class="tableau">
                <tbody>
                  <tr><td>1. Vers A</td><td><Eur c={r.versA} /></td></tr>
                  <tr><td>2. Vers B-Projet {calc.projet ? `(effort_BP ${formatEuros(calc.projet.effort)})` : '(aucun projet actif)'}</td><td><Eur c={r.versBP} /></td></tr>
                  <tr><td>3. Vers B-Opportunité {calc.krach.actif ? '(suspendu)' : ''}</td><td><Eur c={r.versBO} /></td></tr>
                  <tr><td>4. Reste vers C</td><td><Eur c={r.resteC} /></td></tr>
                  {Object.entries(r.manquesC).map(([k, m]) => (
                    <tr class="doux"><td>Manque {LIBELLES_SOUS_POCHES[k as keyof typeof LIBELLES_SOUS_POCHES]}</td><td><Eur c={m} /></td></tr>
                  ))}
                </tbody>
              </table>
            </details>
            <p class="doux">Le virement est programmé le jour de la paie, avant toute dépense. L'application ne passe aucun ordre : utilise « Saisir » une fois l'opération faite.</p>
            <div class="boutons">
              <button class="principal" onClick={enregistrer}>
                {dejaFait ? 'Remplacer le mois enregistré' : 'Enregistrer le mois'}
              </button>
            </div>
            {enregistre && <p class="succes">Mois enregistré.</p>}
          </>
        )}
      </Carte>
    </>
  );
}

/**
 * Répartition indicative du revenu (information seulement, hors guide) :
 * dépenses essentielles, épargne, autres dépenses — 60 / 20 / 20 par défaut, réglable dans les Réglages.
 */
function RepartitionBudget({ revenu, depenses, epargne }: { revenu: Centimes; depenses: Centimes | null; epargne: Centimes | null }) {
  const { etat } = useApp();
  const b = etat.preferences?.budget ?? BUDGET_DEFAUT;
  const lignes: { libelle: string; part: number; reel: Centimes | null; ok: (reel: Centimes, cible: Centimes) => boolean; sens: string }[] = [
    { libelle: 'Dépenses essentielles', part: b.essentiels, reel: depenses, ok: (x, c) => x <= c, sens: 'au plus' },
    { libelle: 'Épargne', part: b.epargne, reel: epargne, ok: (x, c) => x >= c, sens: 'au moins' },
    { libelle: 'Autres dépenses, loisirs', part: b.autres, reel: depenses !== null && epargne !== null ? Math.max(0, revenu - depenses - epargne) : null, ok: (x, c) => x <= c, sens: 'au plus' }
  ];
  return (
    <Carte titre="Répartition indicative du revenu">
      <ul class="liste budget">
        {lignes.map((l) => {
          const cible = Math.round(revenu * l.part);
          const ok = l.reel === null ? null : l.ok(l.reel, cible);
          return (
            <li>
              <div class="ligne-liste">
                <b>{l.libelle}</b>
                <span>{l.reel !== null ? <b class={ok ? 'positif' : 'negatif'}>{formatEuros(l.reel)}</b> : '—'}</span>
              </div>
              <small class={ok === null ? '' : ok ? 'positif' : 'negatif'}>
                {formatPct(l.part, 0)} du revenu = {formatEuros(cible)} ({l.sens})
                {l.reel !== null && revenu > 0 ? ` · réel ${formatPct(l.reel / revenu, 0)}` : ''}
              </small>
            </li>
          );
        })}
      </ul>
      <p class="doux">Information seulement : cette répartition ne change pas la règle des flux du guide. Proportions réglables dans Réglages → Budget.</p>
    </Carte>
  );
}
