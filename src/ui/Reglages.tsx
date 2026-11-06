// Réglages : profil, synchronisation iCloud, B-Projet, paramètres du guide (§ 2).
import { useRef, useState } from 'preact/hooks';
import { useApp } from './store';
import { Carte, ChampChoix, ChampDate, ChampMontant, ChampNombre, ChampTexte, Eur, Vide, dateFr } from './commun';
import { exporterFichier, lireFichier, demanderPersistance, NOM_FICHIER } from '../donnees/stockage';
import { ErreurImport, etatVide, nouvelId } from '../donnees/etat';
import { aujourdhui } from '../donnees/calculs';
import { montantBP } from '../moteur/cibles';
import { lireParametres, type ParametresBruts } from '../moteur/parametres';
import type { Projet, StatutProjet } from '../moteur/types';

export function Reglages() {
  return (
    <>
      <Synchronisation />
      <Profil />
      <Projets />
      <Parametres />
      <Installation />
    </>
  );
}

function Synchronisation() {
  const { etat, meta, remplacer, marquerSynchro } = useApp();
  const entree = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function enregistrer() {
    const r = await exporterFichier(etat);
    if (r === 'annule') return;
    marquerSynchro();
    void demanderPersistance();
    setMessage(
      r === 'partage'
        ? `Choisis « Enregistrer dans Fichiers », puis iCloud Drive → Finance → Gestionnaire Personnel → donnees, et remplace ${NOM_FICHIER}.`
        : `Fichier téléchargé. Range-le dans iCloud Drive → Finance → Gestionnaire Personnel → donnees (remplace l'ancien ${NOM_FICHIER}).`
    );
  }

  async function ouvrir(f: File) {
    try {
      const nouveau = await lireFichier(f);
      if (meta.nonSynchronise && nouveau.modifie_le < etat.modifie_le) {
        if (!confirm(`Ce fichier (modifié le ${new Date(nouveau.modifie_le).toLocaleString('fr-FR')} sur ${nouveau.appareil}) est plus ancien que tes données locales non enregistrées. Les remplacer quand même ?`)) return;
      } else if (meta.nonSynchronise && !confirm('Tes modifications locales non enregistrées seront remplacées par le fichier. Continuer ?')) return;
      remplacer(nouveau, { derniereSynchro: new Date().toISOString(), nonSynchronise: false });
      void demanderPersistance();
      setMessage(`Fichier ouvert : données du ${new Date(nouveau.modifie_le).toLocaleString('fr-FR')} (${nouveau.appareil}).`);
    } catch (err) {
      setMessage(err instanceof ErreurImport ? err.message : "Impossible de lire ce fichier.");
    }
  }

  return (
    <Carte titre="Synchronisation iCloud Drive">
      <p>
        {meta.nonSynchronise ? <b class="negatif">Modifications non enregistrées dans iCloud.</b> : 'Données à jour.'}{' '}
        <span class="doux">Dernière synchronisation : {meta.derniereSynchro ? new Date(meta.derniereSynchro).toLocaleString('fr-FR') : 'jamais'}.</span>
      </p>
      <div class="boutons">
        <button class="principal" onClick={enregistrer}>Enregistrer dans iCloud</button>
        <button onClick={() => entree.current?.click()}>Ouvrir depuis iCloud</button>
        <input
          ref={entree}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => {
            const f = (e.target as HTMLInputElement).files?.[0];
            if (f) void ouvrir(f);
            (e.target as HTMLInputElement).value = '';
          }}
        />
      </div>
      {message && <p class="succes">{message}</p>}
      <p class="doux">
        Habitude simple : <b>ouvrir</b> en arrivant sur un appareil, <b>enregistrer</b> avant de le quitter. Les données restent sur tes appareils et dans ton iCloud ; rien n'est envoyé ailleurs.
      </p>
    </Carte>
  );
}

function Profil() {
  const { etat, maj, calc } = useApp();
  return (
    <Carte titre="Profil">
      <div class="formulaire">
        <ChampMontant libelle="Dépenses essentielles mensuelles" valeur={etat.profil.depensesEssentielles || null} onChange={(m) => maj((e) => { e.profil.depensesEssentielles = m ?? 0; })} />
        <ChampChoix
          libelle="Revenu"
          valeur={etat.profil.revenuVariable ? 'v' : 's'}
          options={[
            ['s', 'Stable (A = 3 mois)'],
            ['v', 'Variable, risque de change ou contrat précaire (A = 4 mois)']
          ]}
          onChange={(v) => maj((e) => { e.profil.revenuVariable = v === 'v'; })}
        />
      </div>
      <p>
        cible_A = <Eur c={calc.cibleA} /> ({calc.aMois} mois)
      </p>
    </Carte>
  );
}

function Projets() {
  const { etat, maj, calc } = useApp();
  const vide: Projet = { id: '', nom: '', cout: 0, frais: 0, dateUsage: '', statut: 'sommeil' };
  const [pr, setPr] = useState<Projet>(vide);
  return (
    <Carte titre="B-Projet">
      <p class="doux">Tant qu'aucun projet n'est « actif », B-Projet vaut 0 et l'étape 2 des flux est ignorée.</p>
      {calc.projet && (
        <p>
          Projet actif : <b>{calc.projet.projet.nom}</b> — montant_BP <Eur c={calc.projet.montant} />, effort mensuel <Eur c={calc.projet.effort} /> sur {calc.projet.mois} mois.
        </p>
      )}
      <div class="formulaire">
        <ChampTexte libelle="Nom du projet" valeur={pr.nom} onChange={(nom) => setPr({ ...pr, nom })} />
        <ChampMontant libelle="Coût à financer" valeur={pr.cout || null} onChange={(m) => setPr({ ...pr, cout: m ?? 0 })} />
        <ChampMontant libelle="Frais" valeur={pr.frais || null} onChange={(m) => setPr({ ...pr, frais: m ?? 0 })} />
        <ChampDate libelle="Date d'usage" valeur={pr.dateUsage} onChange={(dateUsage) => setPr({ ...pr, dateUsage })} />
        <ChampChoix<StatutProjet> libelle="Statut" valeur={pr.statut} options={[['sommeil', 'En sommeil'], ['actif', 'Actif (concret et daté)'], ['realise', 'Réalisé']]} onChange={(statut) => setPr({ ...pr, statut })} />
      </div>
      {pr.cout > 0 && <p>montant_BP = <Eur c={montantBP(calc.p, pr.cout, pr.frais)} /> (marge de {calc.p.bpMarge * 100} %)</p>}
      <div class="boutons">
        <button
          class="principal"
          disabled={!pr.nom || !pr.dateUsage}
          onClick={() => {
            maj((e) => {
              const p = { ...pr };
              if (p.statut === 'actif') {
                p.dateActivation = p.dateActivation ?? aujourdhui();
                e.projets.forEach((x) => { if (x.id !== p.id && x.statut === 'actif') x.statut = 'sommeil'; });
              }
              if (p.id) e.projets = e.projets.map((x) => (x.id === p.id ? p : x));
              else e.projets.push({ ...p, id: nouvelId() });
            });
            setPr(vide);
          }}
        >
          {pr.id ? 'Enregistrer' : 'Ajouter'}
        </button>
        {pr.id && <button onClick={() => setPr(vide)}>Annuler</button>}
      </div>
      {etat.projets.length === 0 ? (
        <Vide>Aucun projet.</Vide>
      ) : (
        <ul class="liste">
          {etat.projets.map((x) => (
            <li onClick={() => setPr(x)}>
              <b>{x.nom}</b>
              <small>{{ sommeil: 'En sommeil', actif: 'Actif', realise: 'Réalisé' }[x.statut]} · usage le {dateFr(x.dateUsage)}</small>
            </li>
          ))}
        </ul>
      )}
    </Carte>
  );
}

// Paramètres scalaires modifiables (§ 2). Les pourcentages sont saisis en %.
const SCALAIRES: { code: keyof ParametresBruts; libelle: string; pct?: boolean; euros?: boolean }[] = [
  { code: 'BO_MIN', libelle: 'Montant minimum de B-Opportunité', euros: true },
  { code: 'BO_CIBLE', libelle: 'Cible de B-Opportunité (% de C)', pct: true },
  { code: 'BO_PLAFOND', libelle: 'Plafond de B-Opportunité (% de C)', pct: true },
  { code: 'BO_SEUIL_MONE', libelle: 'Seuil de la part monétaire', euros: true },
  { code: 'K_FIN', libelle: "Fin d'épisode de krach (%)", pct: true },
  { code: 'BP_MARGE', libelle: 'Marge de B-Projet (%)', pct: true },
  { code: 'SAT_SCORE_MIN', libelle: 'Score minimal pour acheter (/100)' },
  { code: 'SAT_ENTREE', libelle: "Taille d'entrée d'une action (% de C)", pct: true },
  { code: 'SAT_MAX', libelle: "Taille maximale d'une action (% de C)", pct: true },
  { code: 'SAT_EXPO_REVUE', libelle: 'Exposition déclenchant une revue (% de C)', pct: true },
  { code: 'SAT_ECART', libelle: 'Sous-performance déclenchant la réduction (points/an)', pct: true },
  { code: 'SAT_PLANCHER', libelle: 'Cible réduite du Satellite (% de C)', pct: true },
  { code: 'SAT_PLAFOND', libelle: 'Plafond absolu du Satellite (% de C)', pct: true },
  { code: 'WATCHLIST_MAX', libelle: 'Entreprises maximum en watchlist' },
  { code: 'FRAIS_CIBLE', libelle: 'Frais annuels cible (%)', pct: true },
  { code: 'FRAIS_ALERTE', libelle: 'Frais annuels : alerte au-delà de (%)', pct: true },
  { code: 'EPARGNE_TAUX', libelle: "Taux d'épargne cible (%) — vide = alerte désactivée", pct: true }
];

function Parametres() {
  const { etat, maj } = useApp();
  const [ouvert, setOuvert] = useState(false);
  const p = lireParametres(etat.parametres);
  return (
    <Carte titre="Paramètres du guide (§ 2)" action={<button class="lien" onClick={() => setOuvert(!ouvert)}>{ouvert ? 'Masquer' : 'Afficher'}</button>}>
      {!ouvert ? (
        <p class="doux">Les seuls chiffres du guide. Modifiables sans toucher aux calculs ; chaque modification est datée.</p>
      ) : (
        <>
          <div class="formulaire">
            {SCALAIRES.map(({ code, libelle, pct }) => {
              const v = etat.parametres[code] as number | null;
              return (
                <ChampNombre
                  libelle={libelle}
                  valeur={v === null ? null : pct ? Math.round(v * 100000) / 1000 : v}
                  aide={etat.parametresModifies[code] ? `Modifié le ${dateFr(etat.parametresModifies[code])}` : undefined}
                  onChange={(n) =>
                    maj((e) => {
                      (e.parametres as unknown as Record<string, number | null>)[code] = n === null ? (code === 'EPARGNE_TAUX' ? null : v) : pct ? n / 100 : n;
                      e.parametresModifies[code] = aujourdhui();
                    })
                  }
                />
              );
            })}
          </div>
          <p class="doux">
            Fixes : A_MOIS {p.aMoisStable} / {p.aMoisVariable} mois · paliers de krach {p.kPaliers.map((k) => k * 100 + ' %').join(', ')} · tranche {p.kTranche.num}/{p.kTranche.den} · part monétaire {p.boPartMone.num}/{p.boPartMone.den} · cibles et bandes de C selon le § 3.
          </p>
          <div class="boutons">
            <button
              onClick={() =>
                confirm('Revenir aux paramètres du guide ?') &&
                maj((e) => {
                  e.parametres = etatVide().parametres;
                  e.parametresModifies = {};
                })
              }
            >
              Revenir aux valeurs du guide
            </button>
          </div>
        </>
      )}
    </Carte>
  );
}

function Installation() {
  const { maj } = useApp();
  return (
    <Carte titre="Installer l'application">
      <ul>
        <li><b>iPhone / iPad</b> : ouvre la page dans Safari → bouton Partager → « Sur l'écran d'accueil ». Indispensable : sans cela, iOS peut effacer les données au bout de quelques semaines sans visite.</li>
        <li><b>Mac</b> : dans Safari, menu Fichier → « Ajouter au Dock ».</li>
      </ul>
      <details>
        <summary>Zone sensible</summary>
        <p class="doux">Efface les données de cet appareil seulement (le fichier iCloud n'est pas touché).</p>
        <button class="danger" onClick={() => confirm('Effacer toutes les données de cet appareil ?') && confirm('Vraiment ? Enregistre d\'abord dans iCloud si besoin.') && maj((e) => Object.assign(e, etatVide()))}>
          Effacer les données de cet appareil
        </button>
      </details>
    </Carte>
  );
}
