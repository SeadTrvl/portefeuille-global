// Suivi des performances façon Portfolio Performance : liste, fiche par actif, comparaison, mise à jour des cours.
import { useState } from 'preact/hooks';
import { useApp } from './store';
import { BoutonTauxBCE, Carte, ChampDate, Eur, Pct, Graphique, couleurs, Vide, dateFr, LIBELLES_LIGNES, LIBELLES_POCHES } from './commun';
import { statsActif, serieGroupe, sansDebutVide, dividendesGroupe, twrGroupe, triGroupe, debutPeriode, LIBELLES_PERIODES, type Periode, type Selection } from '../moteur/performance';
import { lireNombre, lireMontant, formatEuros, formatDevise } from '../moteur/montants';
import { coursParIsin, tauxBCE } from '../donnees/marche';
import { LIBELLES_SOUS_POCHES } from '../moteur/alertes';
import { SOUS_POCHES_C, sousPocheDe, type Actif, type Poche, type SousPocheC } from '../moteur/types';
import { dernierDe, nouvelId } from '../donnees/etat';
import { aujourdhui } from '../donnees/calculs';

const PERIODES: Periode[] = ['1M', '3M', 'YTD', '1A', '3A', 'MAX'];

function ChoixPeriode({ p, set }: { p: Periode; set: (p: Periode) => void }) {
  return (
    <div class="segments petits">
      {PERIODES.map((k) => (
        <button class={p === k ? 'actif' : ''} onClick={() => set(k)} title={LIBELLES_PERIODES[k]}>
          {k === 'YTD' ? '1er janv.' : k === 'MAX' ? 'Max' : k}
        </button>
      ))}
    </div>
  );
}

export function Performances() {
  const { calc, etat, nav, aller } = useApp();
  const [periode, setPeriode] = useState<Periode>('1A');
  const [comparer, setComparer] = useState<string[]>([]);

  if (nav.param) {
    const actif = etat.actifs.find((a) => a.id === nav.param);
    if (actif) return <FicheActif actif={actif} periode={periode} setPeriode={setPeriode} />;
  }

  const detenus = etat.actifs.filter((a) => calc.idx.ops(a.id).length > 0 || calc.idx.valos(a.id).length > 0);
  const groupes: { cle: string; libelle: string; sel: Selection }[] = [
    { cle: 'total', libelle: 'Patrimoine total', sel: () => true },
    ...(['A', 'BO', 'BP', 'C'] as Poche[]).map((k) => ({ cle: k, libelle: LIBELLES_POCHES[k], sel: ((a: Actif, l) => (sousPocheDe(l) ? 'C' : a.poche) === k) as Selection })),
    ...SOUS_POCHES_C.map((k: SousPocheC) => ({ cle: k, libelle: '· ' + LIBELLES_SOUS_POCHES[k], sel: ((_a: Actif, l) => sousPocheDe(l) === k) as Selection }))
  ];

  return (
    <>
      <Carte titre="Performances" action={<button class="principal petit" onClick={() => aller('cours')}>Mettre à jour les cours</button>}>
        <ChoixPeriode p={periode} set={setPeriode} />
        {detenus.length === 0 ? (
          <Vide>Aucun actif avec des opérations.</Vide>
        ) : (
          <div class="defilement">
            <table class="tableau perf">
              <thead>
                <tr>
                  <th />
                  <th>Valeur</th>
                  <th>+/− latente</th>
                  <th title="Performance pondérée par le temps sur la période">Perf.</th>
                  <th title="Taux de rendement interne : annualisé si la période dépasse un an">TRI</th>
                  <th title="Dividendes nets reçus sur la période">Div.</th>
                </tr>
              </thead>
              <tbody>
                {detenus.map((a) => {
                  const st = statsActif(calc.idx, a, calc.date);
                  const sel: Selection = (x) => x.id === a.id;
                  const debut = debutPeriode(calc.idx, sel, periode, calc.date);
                  const twr = twrGroupe(calc.idx, sel, debut, calc.date);
                  const tri = triGroupe(calc.idx, sel, debut, calc.date);
                  return (
                    <tr class="cliquable" onClick={() => aller('performances', a.id)}>
                      <td>
                        <label class="case-ligne" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={comparer.includes(a.id)}
                            onChange={(e) => setComparer((e.target as HTMLInputElement).checked ? [...comparer, a.id] : comparer.filter((x) => x !== a.id))}
                          />
                        </label>
                        <b>{a.nom}</b>
                        <small>{LIBELLES_LIGNES[a.ligne]}{a.devise === 'USD' ? ' · en $' : ''}{st.dernierCours ? ` · cours du ${dateFr(st.dernierCours.date)}` : st.dateDernierReleve ? ` · relevé du ${dateFr(st.dateDernierReleve)}` : ''}</small>
                      </td>
                      <td><Eur c={st.valeur} /></td>
                      <td>
                        <Eur c={st.pvLatente} />
                        <small><Pct x={st.pvLatentePct} /></small>
                      </td>
                      <td><Pct x={twr.total} /></td>
                      <td><Pct x={tri} /></td>
                      <td>{(() => { const d = dividendesGroupe(calc.idx, sel, debut, calc.date); return d ? <Eur c={d} /> : '—'; })()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p class="doux">Coche des lignes pour les comparer sur une même courbe en base 100. Touche une ligne pour sa fiche détaillée.</p>
      </Carte>

      {comparer.length > 0 && <Comparaison ids={comparer} periode={periode} />}

      <Carte titre="Par poche et sous-poche">
        <div class="defilement">
          <table class="tableau perf">
            <thead>
              <tr>
                <th />
                <th>Valeur</th>
                <th>Perf.</th>
                <th>TRI</th>
                <th title="Dividendes nets reçus sur la période">Div.</th>
              </tr>
            </thead>
            <tbody>
              {groupes.map((g) => {
                const debut = debutPeriode(calc.idx, g.sel, periode, calc.date);
                const v = serieGroupe(calc.idx, g.sel, debut, calc.date);
                const fin = v[v.length - 1];
                if (fin.valeur === 0 && v.every((x) => x.valeur === 0)) return null;
                return (
                  <tr>
                    <td><b>{g.libelle}</b></td>
                    <td><Eur c={fin.valeur} /></td>
                    <td><Pct x={fin.indice / 100 - 1} /></td>
                    <td><Pct x={triGroupe(calc.idx, g.sel, debut, calc.date)} /></td>
                    <td>{(() => { const d = dividendesGroupe(calc.idx, g.sel, debut, calc.date); return d ? <Eur c={d} /> : '—'; })()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p class="doux">
          <b>Perf.</b> : performance pondérée par le temps (indépendante de tes dates de versement, pour comparer des actifs). <b>TRI</b> : rendement de ton argent compte tenu de tes versements, annualisé au-delà d’un an (sur une période plus courte, rendement de la période). <b>Div.</b> : dividendes nets reçus sur la période (en euros).
        </p>
      </Carte>
    </>
  );
}

function Comparaison({ ids, periode }: { ids: string[]; periode: Periode }) {
  const { calc, etat } = useApp();
  // Période commune : on part de la date la plus récente parmi les débuts.
  const debuts = ids.map((id) => debutPeriode(calc.idx, (a) => a.id === id, periode, calc.date));
  const debut = dernierDe(debuts.sort())!;
  const series = ids.map((id) => ({ actif: etat.actifs.find((a) => a.id === id)!, s: sansDebutVide(serieGroupe(calc.idx, (a) => a.id === id, debut, calc.date)) }));
  return (
    <Carte titre={`Comparaison en base 100 depuis le ${dateFr(debut)}`}>
      <Graphique
        hauteur={260}
        config={() => {
          const c = couleurs();
          return {
            type: 'line',
            data: {
              datasets: series.map(({ actif, s }, i) => ({
                label: actif.nom,
                data: s.map((p) => ({ x: Date.parse(p.date), y: p.indice })),
                borderColor: c.serie[i % c.serie.length],
                backgroundColor: c.serie[i % c.serie.length],
                pointRadius: 2,
                tension: 0.1
              }))
            },
            options: {
              maintainAspectRatio: false,
              plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { title: (it) => dateFr(new Date(it[0].parsed.x).toISOString()) } } },
              scales: { x: { type: 'linear', ticks: { maxTicksLimit: 5, callback: (v) => dateFr(new Date(Number(v)).toISOString()) } } }
            }
          };
        }}
      />
    </Carte>
  );
}

function FicheActif({ actif, periode, setPeriode }: { actif: Actif; periode: Periode; setPeriode: (p: Periode) => void }) {
  const { calc, aller } = useApp();
  const st = statsActif(calc.idx, actif, calc.date);
  const sel: Selection = (a) => a.id === actif.id;
  const debut = debutPeriode(calc.idx, sel, periode, calc.date);
  const serie = sansDebutVide(serieGroupe(calc.idx, sel, debut, calc.date));
  const twr = twrGroupe(calc.idx, sel, debut, calc.date);
  const tri = triGroupe(calc.idx, sel, debut, calc.date);
  const ops = calc.idx.ops(actif.id);
  const taux = actif.devise === 'USD' ? calc.idx.tauxA(calc.date) : null;
  const cours = [
    ...calc.idx.valos(actif.id).filter((v) => v.cours !== undefined).map((v) => ({ date: v.date, cours: v.cours! })),
    ...ops.filter((o) => o.prix !== undefined).map((o) => ({ date: o.date, cours: o.prix! }))
  ].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <>
      <button class="lien retour" onClick={() => aller('performances')}>← Performances</button>
      <Carte titre={actif.nom}>
        <p class="doux">
          {LIBELLES_POCHES[actif.poche]} · {LIBELLES_LIGNES[actif.ligne]}
          {actif.isin ? ` · ${actif.isin}` : ''}
        </p>
        <div class="chiffres">
          <div><span>Valeur</span><strong><Eur c={st.valeur} /></strong></div>
          {actif.mode === 'cours' ? (
            <>
              <div><span>Quantité</span><strong>{st.quantite.toLocaleString('fr-FR', { maximumFractionDigits: 6 })}</strong></div>
              <div><span>PRU en euros</span><strong>{st.pru !== null ? formatEuros(Math.round(st.pru * 100)) : '—'}</strong><small>frais inclus, prix de revient fiscal</small></div>
              {st.devise && <div><span>PRU en dollars</span><strong>{st.devise.pru !== null ? formatDevise(Math.round(st.devise.pru * 100), 'USD') : '—'}</strong></div>}
              <div><span>Dernier cours</span><strong>{st.dernierCours ? formatDevise(Math.round(st.dernierCours.cours * 100), actif.devise) : '—'}</strong><small>{dateFr(st.dernierCours?.date)}</small></div>
              {taux && <div><span>Taux EUR/USD</span><strong>1 € = {taux.usdParEur.toLocaleString('fr-FR', { maximumFractionDigits: 4 })} $</strong><small>{dateFr(taux.date)}</small></div>}
            </>
          ) : (
            <div><span>Dernier relevé</span><strong>{dateFr(st.dateDernierReleve)}</strong></div>
          )}
          <div><span>Investi</span><strong><Eur c={st.investi} /></strong></div>
          <div><span>+/− latente{st.devise ? ' en euros' : ''}</span><strong><Eur c={st.pvLatente} /></strong><small><Pct x={st.pvLatentePct} /></small></div>
          {st.devise && (
            <div><span>+/− latente en dollars</span><strong>{formatDevise(st.devise.pvLatente, 'USD')}</strong><small><Pct x={st.devise.pvLatentePct} /> hors effet de change</small></div>
          )}
          <div><span>+/− réalisée</span><strong><Eur c={st.pvRealisee} /></strong></div>
          <div><span>{actif.mode === 'cours' ? 'Dividendes' : 'Intérêts'}</span><strong><Eur c={actif.mode === 'cours' ? st.dividendes : st.interets} /></strong></div>
          <div><span>Frais</span><strong><Eur c={st.frais} /></strong></div>
          <div><span>Gain total</span><strong><Eur c={st.gainTotal} /></strong></div>
          <div><span>TRI depuis l'achat</span><strong><Pct x={st.triDepuisAchat} /></strong></div>
        </div>
      </Carte>

      <Carte titre="Évolution">
        <ChoixPeriode p={periode} set={setPeriode} />
        <div class="chiffres deux">
          <div><span>Performance ({LIBELLES_PERIODES[periode]})</span><strong><Pct x={twr.total} /></strong>{twr.annualise !== null && <small>soit <Pct x={twr.annualise} /> par an</small>}</div>
          <div><span>TRI sur la période</span><strong><Pct x={tri} /></strong></div>
        </div>
        <h3>Valeur et montant investi</h3>
        <Graphique
          config={() => {
            const c = couleurs();
            return {
              type: 'line',
              data: {
                datasets: [
                  { label: 'Valeur', data: serie.map((p) => ({ x: Date.parse(p.date), y: p.valeur / 100 })), borderColor: c.serie[0], backgroundColor: c.serie[0], pointRadius: 2, tension: 0.1 },
                  { label: 'Investi', data: serie.map((p) => ({ x: Date.parse(p.date), y: p.investi / 100 })), borderColor: c.texte, borderDash: [4, 4], pointRadius: 0, stepped: true }
                ]
              },
              options: optionsTemps()
            };
          }}
        />
        {actif.mode === 'cours' && cours.length > 0 && (
          <>
            <h3>Cours, achats et ventes{actif.devise === 'USD' ? ' (en dollars)' : ''}</h3>
            <Graphique
              config={() => {
                const c = couleurs();
                return {
                  type: 'line',
                  data: {
                    datasets: [
                      { label: 'Cours', data: cours.map((p) => ({ x: Date.parse(p.date), y: p.cours })), borderColor: c.serie[1], backgroundColor: c.serie[1], pointRadius: 0, tension: 0.1 },
                      { type: 'scatter', label: 'Achats', data: ops.filter((o) => o.type === 'achat' && o.prix).map((o) => ({ x: Date.parse(o.date), y: o.prix! })), backgroundColor: c.positif, pointRadius: 5 },
                      { type: 'scatter', label: 'Ventes', data: ops.filter((o) => o.type === 'vente' && o.prix).map((o) => ({ x: Date.parse(o.date), y: o.prix! })), backgroundColor: c.negatif, pointRadius: 5 }
                    ]
                  },
                  options: optionsTemps()
                };
              }}
            />
          </>
        )}
        <h3>Performance cumulée (pondérée par le temps)</h3>
        <Graphique
          config={() => {
            const c = couleurs();
            return {
              type: 'line',
              data: { datasets: [{ label: 'Performance', data: serie.map((p) => ({ x: Date.parse(p.date), y: Math.round((p.indice - 100) * 100) / 100 })), borderColor: c.serie[2], backgroundColor: c.serie[2], pointRadius: 2, fill: false }] },
              options: { ...optionsTemps(), plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => `${(ctx.parsed.y as number).toLocaleString('fr-FR')} %` } } } }
            };
          }}
        />
        <p class="doux">
          Entre deux relevés, la valeur reste celle du dernier cours connu.
          {actif.devise === 'USD' && ' Valeurs, performance et TRI en euros (effet de change inclus) ; cours en dollars.'}
        </p>
      </Carte>
    </>
  );
}

function optionsTemps() {
  return {
    maintainAspectRatio: false,
    interaction: { mode: 'nearest' as const, intersect: false },
    plugins: { legend: { position: 'bottom' as const }, tooltip: { callbacks: { title: (it: { parsed: { x: number } }[]) => dateFr(new Date(it[0].parsed.x).toISOString()) } } },
    scales: { x: { type: 'linear' as const, ticks: { maxTicksLimit: 5, callback: (v: string | number) => dateFr(new Date(Number(v)).toISOString()) } } }
  };
}

/** Écran « Mettre à jour les cours » : un champ par actif détenu, puis « Tout enregistrer ». */
export function MiseAJourCours() {
  const { calc, etat, maj, aller } = useApp();
  const [date, setDate] = useState(aujourdhui());
  const [saisies, setSaisies] = useState<Record<string, string>>({});
  const [fait, setFait] = useState(0);
  const [taux, setTaux] = useState('');
  const dernierTaux = calc.idx.tauxA(calc.date);
  const detenus = etat.actifs.filter((a) => !a.archive && (calc.idx.valeur(a.id, calc.date) !== 0 || calc.idx.quantite(a.id, calc.date) !== 0));
  const [infos, setInfos] = useState<Record<string, { texte: string; erreur: boolean }>>({});
  const [chargement, setChargement] = useState(false);
  const automatiques = detenus.filter((a) => a.mode === 'cours' && (a.isin || a.symbole));

  /** Récupère par le relais le cours de chaque actif coté (ISIN ou symbole), et le taux BCE s'il y a des actifs en dollars. */
  async function recuperer() {
    setChargement(true);
    setInfos({});
    const nouvellesSaisies: Record<string, string> = {};
    const nouvellesInfos: Record<string, { texte: string; erreur: boolean }> = {};
    const taches: Promise<void>[] = automatiques.map(async (a) => {
      const devise = a.devise ?? 'EUR';
      try {
        const c = await coursParIsin({ isin: a.isin, symbole: a.symbole, devise, date });
        if (c.devise !== devise) {
          nouvellesInfos[a.id] = { erreur: true, texte: `${c.symbole} cote en ${c.devise}, pas en ${devise} : indique un symbole Yahoo dans l'actif (ex. ${c.symbole.split('.')[0]}.AS).` };
          return;
        }
        nouvellesSaisies[a.id] = c.cours.toLocaleString('fr-FR', { maximumFractionDigits: 4, useGrouping: false });
        nouvellesInfos[a.id] = { erreur: false, texte: `${c.symbole}${c.bourse ? ' · ' + c.bourse : ''} · cours du ${dateFr(c.date)}` };
      } catch (e) {
        nouvellesInfos[a.id] = { erreur: true, texte: (e as Error).message };
      }
    });
    if (detenus.some((a) => a.devise === 'USD') && !taux) {
      taches.push(
        tauxBCE(date)
          .then((t) => setTaux(t.usdParEur.toLocaleString('fr-FR', { maximumFractionDigits: 6 })))
          .catch(() => undefined)
      );
    }
    await Promise.all(taches);
    setSaisies((s) => ({ ...s, ...nouvellesSaisies }));
    setInfos(nouvellesInfos);
    setChargement(false);
  }

  function toutEnregistrer() {
    let n = 0;
    const t = lireNombre(taux);
    const tauxJour = t && t > 0 ? t : null;
    maj((e) => {
      if (tauxJour) {
        e.tauxChange = (e.tauxChange ?? []).filter((x) => x.date !== date);
        e.tauxChange.push({ id: nouvelId(), date, usdParEur: tauxJour });
      }
      for (const a of detenus) {
        const t = saisies[a.id];
        if (!t) continue;
        if (a.mode === 'cours') {
          const cours = lireNombre(t);
          if (cours === null || cours <= 0) continue;
          const q = calc.idx.quantite(a.id, date);
          // Actif en dollars : valeur en euros au taux du jour (ou au dernier taux connu).
          const tx = a.devise === 'USD' ? tauxJour ?? calc.idx.tauxA(date)?.usdParEur ?? null : null;
          if (a.devise === 'USD' && !tx) continue;
          e.valorisations = e.valorisations.filter((v) => !(v.actifId === a.id && v.date === date));
          e.valorisations.push({ id: nouvelId(), date, actifId: a.id, quantite: q, cours, taux: tx ?? undefined, valeur: Math.round(((q * cours) / (tx ?? 1)) * 100) });
        } else {
          const valeur = lireMontant(t);
          if (valeur === null) continue;
          e.valorisations = e.valorisations.filter((v) => !(v.actifId === a.id && v.date === date));
          e.valorisations.push({ id: nouvelId(), date, actifId: a.id, valeur });
        }
        n++;
      }
    });
    setFait(n);
    setSaisies({});
  }

  return (
    <>
      <button class="lien retour" onClick={() => aller('performances')}>← Performances</button>
      <Carte titre="Mettre à jour les cours">
        <ChampDate libelle="Date du relevé" valeur={date} onChange={setDate} />
        {detenus.some((a) => a.devise === 'USD') && (
          <label class="champ">
            <span>Taux de change du jour : 1 € = … $</span>
            <input inputMode="decimal" placeholder={dernierTaux ? dernierTaux.usdParEur.toLocaleString('fr-FR') : 'ex. 1,08'} value={taux} onInput={(e) => setTaux((e.target as HTMLInputElement).value)} />
            <BoutonTauxBCE date={date} onTaux={(t) => setTaux(t.toLocaleString('fr-FR', { maximumFractionDigits: 6 }))} />
            <small>
              {dernierTaux ? `Dernier taux : ${dernierTaux.usdParEur.toLocaleString('fr-FR')} le ${dateFr(dernierTaux.date)}. Laisse vide pour le garder.` : 'Obligatoire pour valoriser les actifs en dollars.'}
            </small>
          </label>
        )}
        {detenus.length === 0 ? (
          <Vide>Aucun actif détenu.</Vide>
        ) : (
          <ul class="liste saisie-cours">
            {detenus.map((a) => {
              const dc = a.mode === 'cours' ? calc.idx.dernierCours(a.id, calc.date) : null;
              const derniereValo = dernierDe(calc.idx.valos(a.id));
              return (
                <li>
                  <div>
                    <b>{a.nom}</b>
                    <small>
                      {a.mode === 'cours'
                        ? dc
                          ? `Dernier cours : ${formatDevise(Math.round(dc.cours * 100), a.devise)} le ${dateFr(dc.date)}`
                          : 'Aucun cours'
                        : `Valeur actuelle : ${formatEuros(calc.idx.valeur(a.id, calc.date))}${derniereValo ? ` (relevé du ${dateFr(derniereValo.date)})` : ''}`}
                    </small>
                    {infos[a.id] && <small class={infos[a.id].erreur ? 'negatif' : 'positif'}>{infos[a.id].texte}</small>}
                  </div>
                  <input
                    inputMode="decimal"
                    placeholder={a.mode === 'cours' ? (a.devise === 'USD' ? 'Cours $' : 'Cours €') : 'Valeur €'}
                    value={saisies[a.id] ?? ''}
                    onInput={(e) => setSaisies({ ...saisies, [a.id]: (e.target as HTMLInputElement).value })}
                  />
                </li>
              );
            })}
          </ul>
        )}
        {automatiques.length > 0 && (
          <div class="boutons">
            <button onClick={recuperer} disabled={chargement}>
              {chargement ? 'Récupération…' : `Récupérer les cours (${automatiques.length})`}
            </button>
          </div>
        )}
        <p class="doux">
          « Récupérer les cours » remplit les actifs qui ont un ISIN ou un symbole Yahoo (clôture à la date du relevé ou dernier jour de cotation avant ; aujourd’hui, dernier cours connu). Vérifie puis enregistre.
        </p>
        <p class="doux">Actifs cotés : saisis le cours par part. Fonds euros, livrets, monétaire : saisis la valeur totale du contrat.</p>
        <div class="boutons">
          <button class="principal" onClick={toutEnregistrer} disabled={Object.values(saisies).every((x) => !x) && !taux}>
            Tout enregistrer
          </button>
        </div>
        {fait > 0 && <p class="succes">{fait} relevé(s) enregistré(s).</p>}
        {detenus.some((a) => a.devise === 'USD') && !dernierTaux && !taux && Object.entries(saisies).some(([id, v]) => v && etat.actifs.find((a) => a.id === id)?.devise === 'USD') && (
          <p class="avertissement">Saisis le taux du jour : sans lui, les cours en dollars ne peuvent pas être convertis en euros.</p>
        )}
      </Carte>
    </>
  );
}
