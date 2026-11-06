// Coquille de l'application : barre d'onglets, bandeau de synchronisation, écrans.
import { Fournisseur, useApp, type Ecran } from './store';
import { TableauDeBord } from './TableauDeBord';
import { CeMois } from './CeMois';
import { Performances, MiseAJourCours } from './Performances';
import { Krach } from './Krach';
import { Saisie } from './Saisie';
import { Satellite } from './Satellite';
import { Journal } from './Journal';
import { Reglages } from './Reglages';
import { Carte } from './commun';
import { useErrorBoundary } from 'preact/hooks';
import type { ComponentChildren } from 'preact';

const ONGLETS: { ecran: Ecran; libelle: string; icone: string }[] = [
  { ecran: 'tableau', libelle: 'Tableau', icone: 'M3 13h8V3H3zm10 8h8V11h-8zM3 21h8v-6H3zm10-18v6h8V3z' },
  { ecran: 'mois', libelle: 'Ce mois-ci', icone: 'M19 4h-1V2h-2v2H8V2H6v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 16H5V9h14z' },
  { ecran: 'performances', libelle: 'Perfs', icone: 'M3 17l6-6 4 4 8-8v4h2V3h-8v2h4l-6 6-4-4-8 8z' },
  { ecran: 'krach', libelle: 'Krach', icone: 'M3 7l6 6 4-4 8 8v-4h2v8h-8v-2h4l-6-6-4 4-8-8z' },
  { ecran: 'plus', libelle: 'Plus', icone: 'M4 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm8 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm8 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4z' }
];

const TITRES: Record<Ecran, string> = {
  tableau: 'Tableau de bord',
  mois: 'Ce mois-ci',
  performances: 'Performances',
  cours: 'Cours',
  krach: 'Krach',
  plus: 'Plus',
  saisie: 'Saisie',
  satellite: 'Satellite',
  journal: 'Journal et revues',
  reglages: 'Réglages'
};

function Contenu() {
  const { pret, nav, meta, aller } = useApp();
  if (!pret) return <p class="vide">Chargement…</p>;
  const ongletActif = (['saisie', 'satellite', 'journal', 'reglages'] as Ecran[]).includes(nav.ecran) ? 'plus' : nav.ecran === 'cours' ? 'performances' : nav.ecran;
  return (
    <>
      <header class="entete">
        <h1>{TITRES[nav.ecran]}</h1>
        {meta.nonSynchronise && (
          <button class="bandeau" onClick={() => aller('reglages')} title="Enregistrer dans iCloud">
            ● Non enregistré dans iCloud
          </button>
        )}
      </header>
      <main>
        {nav.ecran === 'tableau' && <TableauDeBord />}
        {nav.ecran === 'mois' && <CeMois />}
        {nav.ecran === 'performances' && <Performances />}
        {nav.ecran === 'cours' && <MiseAJourCours />}
        {nav.ecran === 'krach' && <Krach />}
        {nav.ecran === 'plus' && <Plus />}
        {nav.ecran === 'saisie' && <Saisie />}
        {nav.ecran === 'satellite' && <Satellite />}
        {nav.ecran === 'journal' && <Journal />}
        {nav.ecran === 'reglages' && <Reglages />}
        <p class="mention">Outil d'organisation personnel : il calcule et propose, il ne passe aucun ordre. Ce n'est pas un conseil en investissement.</p>
      </main>
      <nav class="onglets">
        {ONGLETS.map((o) => (
          <button class={ongletActif === o.ecran ? 'actif' : ''} onClick={() => aller(o.ecran)} aria-label={o.libelle}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d={o.icone} />
            </svg>
            <span>{o.libelle}</span>
          </button>
        ))}
      </nav>
    </>
  );
}

function Plus() {
  const { aller } = useApp();
  const items: [Ecran, string, string][] = [
    ['saisie', 'Saisie', 'Comptes, actifs et opérations'],
    ['satellite', 'Satellite', 'Fiches, watchlist, portefeuille fantôme'],
    ['journal', 'Journal et revues', 'Décisions, revue trimestrielle et annuelle'],
    ['reglages', 'Réglages', 'Synchronisation iCloud, profil, B-Projet, paramètres']
  ];
  return (
    <Carte>
      <ul class="liste menu">
        {items.map(([e, t, d]) => (
          <li onClick={() => aller(e)}>
            <b>{t}</b>
            <small>{d}</small>
          </li>
        ))}
      </ul>
    </Carte>
  );
}

/**
 * Filet de sécurité : si un écran plante, on affiche l'erreur au lieu d'une page blanche,
 * avec de quoi repartir (recharger, ou effacer les données de cet appareil — le fichier iCloud n'est pas touché).
 */
function Protection({ children }: { children: ComponentChildren }) {
  const [erreur, reinitialiser] = useErrorBoundary((e) => console.error(e));
  if (!erreur) return <>{children}</>;
  const texte = `${(erreur as Error).message ?? erreur}\n${((erreur as Error).stack ?? '').split('\n').slice(0, 6).join('\n')}\n${navigator.userAgent}`;
  return (
    <main>
      <Carte titre="Une erreur est survenue">
        <p>L'application a rencontré un problème. Tes données ne sont pas perdues.</p>
        <pre class="erreur">{texte}</pre>
        <div class="boutons">
          <button class="principal" onClick={() => location.reload()}>Recharger</button>
          <button onClick={() => reinitialiser()}>Réessayer</button>
          <button onClick={() => navigator.clipboard?.writeText(texte)}>Copier le message</button>
          <button
            class="danger"
            onClick={async () => {
              if (!confirm("Effacer les données de cet appareil ? Le fichier iCloud n'est pas touché : tu pourras le rouvrir.")) return;
              await new Promise((r) => {
                const q = indexedDB.deleteDatabase('portefeuille-global');
                q.onsuccess = q.onerror = q.onblocked = () => r(null);
              });
              location.reload();
            }}
          >
            Effacer les données de cet appareil
          </button>
        </div>
      </Carte>
    </main>
  );
}

export function App() {
  return (
    <Protection>
      <Fournisseur>
        <Contenu />
      </Fournisseur>
    </Protection>
  );
}
