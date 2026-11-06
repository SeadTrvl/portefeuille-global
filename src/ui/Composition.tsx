// Composition détaillée d'une poche (A, B-Opportunité, B-Projet, C) ou d'une sous-poche de C.
import { useApp } from './store';
import { Carte, Eur, Pct, Vide, LIBELLES_LIGNES, LIBELLES_POCHES } from './commun';
import { LIBELLES_SOUS_POCHES } from '../moteur/alertes';
import { statsActif } from '../moteur/performance';
import { formatEuros, formatPct, type Centimes } from '../moteur/montants';
import { SOUS_POCHES_C, sousPocheDe, type Ligne, type Poche, type SousPocheC } from '../moteur/types';
import type { Position } from '../moteur/positions';

const POCHES: Poche[] = ['A', 'BO', 'BP', 'C'];

export function Composition() {
  const { nav, calc, aller, etat } = useApp();
  const comptes = new Map(etat.comptes.map((c) => [c.id, c.nom]));
  const cle = nav.param ?? 'C';
  const estSousPoche = (SOUS_POCHES_C as string[]).includes(cle);
  const poche: Poche = estSousPoche ? 'C' : POCHES.includes(cle as Poche) ? (cle as Poche) : 'C';
  const sousPoche = estSousPoche ? (cle as SousPocheC) : null;

  const positions = calc.positions.filter((p) => p.poche === poche && (!sousPoche || sousPocheDe(p.ligne) === sousPoche));
  const total = positions.reduce((s, p) => s + p.valeur, 0);
  const titre = sousPoche ? `C — ${LIBELLES_SOUS_POCHES[sousPoche]}` : LIBELLES_POCHES[poche];

  // Repères de la poche (cibles et bandes du guide).
  let reperes: string | null = null;
  if (poche === 'A') reperes = `Cible : ${formatEuros(calc.cibleA)} (${calc.aMois} mois de dépenses essentielles)`;
  if (poche === 'BO') reperes = `Cible : ${formatEuros(calc.cibleBO)} · plafond : ${formatEuros(calc.plafondBO)}`;
  if (poche === 'BP') reperes = calc.projet ? `${calc.projet.projet.nom} : ${formatEuros(calc.projet.montant)} prévus` : 'En sommeil : aucun projet actif';
  if (sousPoche && calc.s.C > 0) {
    const [bas, haut] = calc.p.bandesC[sousPoche];
    reperes = `${formatPct(total / calc.s.C)} de C · cible ${formatPct(calc.ciblesC.ciblesC[sousPoche])} · bande ${formatPct(bas, 0)}–${formatPct(haut, 0)}`;
  }

  // Groupes : sous-poches de C pour la poche C entière, sinon lignes (World, émergents… ou fonds euros, livret…).
  const groupes = new Map<string, { libelle: string; positions: Position[]; cible?: number }>();
  for (const p of positions.sort((a, b) => b.valeur - a.valeur)) {
    const sp = sousPocheDe(p.ligne);
    const k = poche === 'C' && !sousPoche && sp ? sp : p.ligne;
    const libelle = poche === 'C' && !sousPoche && sp ? LIBELLES_SOUS_POCHES[sp] : LIBELLES_LIGNES[p.ligne as Ligne];
    if (!groupes.has(k)) {
      const cible =
        poche === 'C' && !sousPoche && sp ? calc.ciblesC.ciblesC[sp]
        : sousPoche === 'core' ? calc.ciblesC.ciblesCore[p.ligne as 'world' | 'emergents' | 'europe']
        : sousPoche === 'matieres_premieres' ? calc.ciblesC.ciblesMP[p.ligne as 'or' | 'panier']
        : undefined;
      groupes.set(k, { libelle, positions: [], cible });
    }
    groupes.get(k)!.positions.push(p);
  }

  const nomCompte = (id?: string) => (id ? comptes.get(id) ?? '' : '');

  return (
    <>
      <button class="lien retour" onClick={() => aller('tableau')}>← Tableau de bord</button>
      <Carte titre={titre}>
        <div class="patrimoine">
          <span>Valeur</span>
          <strong><Eur c={total} /></strong>
        </div>
        {reperes && <p class="doux">{reperes}</p>}
        {!sousPoche && poche !== 'C' && (
          <div class="segments petits">
            {POCHES.map((k) => (
              <button class={k === poche ? 'actif' : ''} onClick={() => aller('composition', k)}>{k === 'BO' ? 'B-Opp.' : k === 'BP' ? 'B-Projet' : k}</button>
            ))}
          </div>
        )}
        {(poche === 'C' || sousPoche) && (
          <div class="segments petits">
            <button class={!sousPoche ? 'actif' : ''} onClick={() => aller('composition', 'C')}>Tout C</button>
            {SOUS_POCHES_C.map((k) => (
              <button class={k === sousPoche ? 'actif' : ''} onClick={() => aller('composition', k)}>{LIBELLES_SOUS_POCHES[k].split(' ')[0]}</button>
            ))}
          </div>
        )}
      </Carte>

      {positions.length === 0 ? (
        <Carte><Vide>Aucun actif dans cette poche.</Vide></Carte>
      ) : (
        [...groupes.values()].map((g) => {
          const sousTotal = g.positions.reduce((s, p) => s + p.valeur, 0);
          const base = poche === 'C' ? calc.s.C : total;
          return (
            <Carte
              titre={g.libelle}
              action={
                <span class="doux">
                  <Eur c={sousTotal} /> · {formatPct(base > 0 ? sousTotal / base : 0)}
                  {g.cible !== undefined ? ` / ${formatPct(g.cible)}` : ''}
                </span>
              }
            >
              <ul class="liste">
                {g.positions.map((p) => (
                  <LignePosition p={p} total={sousTotal} compte={nomCompte(p.actif.compteId)} onClick={() => aller('performances', p.actif.id)} />
                ))}
              </ul>
            </Carte>
          );
        })
      )}
      <p class="doux">Touche une ligne pour sa fiche de performance. Les pourcentages des groupes sont exprimés en % de {poche === 'C' ? 'C' : 'la poche'}, comme dans le guide.</p>
    </>
  );
}

function LignePosition({ p, total, compte, onClick }: { p: Position; total: Centimes; compte: string; onClick: () => void }) {
  const { calc } = useApp();
  const st = statsActif(calc.idx, p.actif, calc.date);
  const enAttente = p.ligne === 'satellite' && p.actif.ligne !== 'satellite';
  return (
    <li onClick={onClick}>
      <div class="ligne-liste">
        <b>{p.actif.nom}{enAttente ? ' (Satellite en attente)' : ''}</b>
        <Eur c={p.valeur} />
      </div>
      <small>
        {compte ? compte + ' · ' : ''}
        {formatPct(total > 0 ? p.valeur / total : 0)} du groupe
        {p.actif.mode === 'cours' && !enAttente ? <> · +/− <Pct x={st.pvLatentePct} /></> : null}
      </small>
    </li>
  );
}
