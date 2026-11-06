// Tableau de bord (§ 9) : poches, bandes de C, alertes, répartition et évolution.
import { useApp } from './store';
import { Carte, Eur, Pastille, Graphique, couleurs, LIBELLES_POCHES, Vide, dateFr } from './commun';
import { LIBELLES_SOUS_POCHES } from '../moteur/alertes';
import { SOUS_POCHES_C, type Poche } from '../moteur/types';
import { serieGroupe, debutPeriode, sansDebutVide } from '../moteur/performance';
import { formatEuros, formatPct } from '../moteur/montants';

export function TableauDeBord() {
  const { calc, etat, aller } = useApp();
  const { s, p } = calc;

  if (etat.actifs.length === 0) {
    return (
      <Carte titre="Bienvenue">
        <p>Pour commencer :</p>
        <ol>
          <li>
            Dans <b>Réglages</b>, indique tes dépenses essentielles mensuelles et si ton revenu est stable.
          </li>
          <li>
            Dans <b>Saisie</b>, crée tes comptes (Livret A, PEA, assurance-vie…) puis tes actifs, et saisis tes opérations.
          </li>
          <li>
            Chaque mois, ouvre <b>Ce mois-ci</b> pour savoir où placer ton épargne.
          </li>
        </ol>
        <p>
          Si tu as déjà un fichier <code>portefeuille.json</code> dans iCloud Drive, ouvre-le depuis <b>Réglages → Synchronisation</b>.
        </p>
        <div class="boutons">
          <button class="principal" onClick={() => aller('reglages')}>Ouvrir les réglages</button>
          <button onClick={() => aller('saisie')}>Saisir mes comptes</button>
        </div>
      </Carte>
    );
  }

  const alertes = calc.alertes.filter((a) => a.niveau !== 'ok');
  const poches: { k: Poche; cible?: number; detail?: string }[] = [
    { k: 'A', cible: calc.cibleA, detail: `cible ${formatEuros(calc.cibleA)}` },
    { k: 'BO', cible: calc.cibleBO, detail: `cible ${formatEuros(calc.cibleBO)} · plafond ${formatEuros(calc.plafondBO)}` },
    { k: 'BP', detail: calc.projet ? `${calc.projet.projet.nom} : ${formatEuros(calc.projet.montant)}` : 'en sommeil' },
    { k: 'C' }
  ];

  const sel = () => true;
  const debut = debutPeriode(calc.idx, sel, 'MAX', calc.date);
  const serie = sansDebutVide(serieGroupe(calc.idx, sel, debut, calc.date));

  return (
    <>
      <Carte>
        <div class="patrimoine">
          <span>Patrimoine total</span>
          <strong>
            <Eur c={s.total} />
          </strong>
        </div>
        <div class="grille-poches">
          {poches.map(({ k, cible, detail }) => (
            <div class="poche">
              <span class="etiquette">{LIBELLES_POCHES[k]}</span>
              <strong>
                <Eur c={s.parPoche[k]} />
              </strong>
              {detail && <small>{detail}</small>}
              {cible !== undefined && cible > 0 && <Jauge x={s.parPoche[k] / cible} />}
            </div>
          ))}
        </div>
      </Carte>

      <Carte titre="Alertes" action={<button class="lien" onClick={() => aller('mois')}>Ce mois-ci →</button>}>
        {alertes.length === 0 ? (
          <Vide>Aucune règle ne se déclenche : rien à faire.</Vide>
        ) : (
          <ul class="alertes">
            {alertes.map((a) => (
              <li class={a.niveau}>
                <div class="ligne-alerte">
                  <Pastille niveau={a.niveau} />
                  <b>{a.titre}</b>
                </div>
                <p>{a.detail}</p>
                {a.proposition && <p class="proposition">→ {a.proposition}</p>}
              </li>
            ))}
          </ul>
        )}
      </Carte>

      <Carte titre="C — Long terme : poids et bandes">
        {s.C === 0 ? (
          <Vide>Aucun actif dans C pour l'instant.</Vide>
        ) : (
          <div class="bandes">
            {SOUS_POCHES_C.map((k) => {
              const poids = s.parSousPoche[k] / s.C;
              const [bas, haut] = p.bandesC[k];
              const cible = calc.ciblesC.ciblesC[k];
              const hors = poids < bas - 1e-9 || poids > haut + 1e-9;
              const echelle = 0.7; // 70 % = largeur pleine
              return (
                <div class="bande">
                  <div class="bande-tete">
                    <span>{LIBELLES_SOUS_POCHES[k]}</span>
                    <span>
                      {/* Poids réel : rouge hors de la bande, vert dans la bande. */}
                      <b class={'nombre ' + (hors ? 'negatif' : 'positif')}>{formatPct(poids)}</b> <small>/ {formatPct(cible)}</small>
                    </span>
                  </div>
                  <div class="piste" aria-label={`Bande de ${bas * 100} à ${haut * 100} %`}>
                    <div class="zone" style={{ left: (bas / echelle) * 100 + '%', width: ((haut - bas) / echelle) * 100 + '%' }} />
                    <div class="cible" style={{ left: (cible / echelle) * 100 + '%' }} />
                    <div class={'valeur ' + (hors ? 'hors' : '')} style={{ left: Math.min(100, (poids / echelle) * 100) + '%' }} />
                  </div>
                  <small class="doux">
                    <Eur c={s.parSousPoche[k]} /> · bande {bas * 100}–{haut * 100} %
                  </small>
                </div>
              );
            })}
          </div>
        )}
      </Carte>

      <div class="deux-colonnes">
        <Carte titre="Répartition">
          <Graphique
            config={() => {
              const c = couleurs();
              const donnees = [s.parPoche.A, s.parPoche.BO, s.parPoche.BP, ...SOUS_POCHES_C.map((k) => s.parSousPoche[k])];
              const libelles = ['A', 'B-Opportunité', 'B-Projet', ...SOUS_POCHES_C.map((k) => LIBELLES_SOUS_POCHES[k])];
              return {
                type: 'doughnut',
                data: { labels: libelles, datasets: [{ data: donnees.map((x) => x / 100), backgroundColor: c.serie, borderWidth: 0 }] },
                options: {
                  maintainAspectRatio: false,
                  plugins: {
                    legend: { position: 'right', labels: { boxWidth: 12 } },
                    tooltip: { callbacks: { label: (ctx) => `${ctx.label} : ${formatEuros(Math.round((ctx.raw as number) * 100))}` } }
                  }
                }
              };
            }}
          />
        </Carte>
        <Carte titre="Évolution du patrimoine">
          {serie.length < 3 ? (
            <Vide>La courbe apparaîtra après quelques opérations et relevés.</Vide>
          ) : (
            <Graphique
              config={() => {
                const c = couleurs();
                return {
                  type: 'line',
                  data: {
                    labels: serie.map((x) => dateFr(x.date)),
                    datasets: [
                      { label: 'Valeur', data: serie.map((x) => x.valeur / 100), borderColor: c.serie[0], backgroundColor: c.serie[0], pointRadius: 0, tension: 0.2 },
                      { label: 'Investi', data: serie.map((x) => x.investi / 100), borderColor: c.texte, borderDash: [4, 4], pointRadius: 0, stepped: true }
                    ]
                  },
                  options: { maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { position: 'bottom' } }, scales: { x: { ticks: { maxTicksLimit: 5 } } } }
                };
              }}
            />
          )}
        </Carte>
      </div>
    </>
  );
}

function Jauge({ x }: { x: number }) {
  return (
    <div class="jauge" title={Math.round(x * 100) + ' %'}>
      <div style={{ width: Math.min(100, x * 100) + '%' }} class={x >= 1 ? 'pleine' : ''} />
    </div>
  );
}
