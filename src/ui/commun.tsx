// Petits composants partagés : champs de saisie, cartes, libellés.
import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { tauxBCE } from '../donnees/marche';
import { Chart, registerables, type ChartConfiguration } from 'chart.js';
import { formatEuros, formatPct, lireMontant, lireNombre, type Centimes } from '../moteur/montants';
import type { Ligne, Poche, TypeOperation } from '../moteur/types';
import type { Niveau } from '../moteur/alertes';

Chart.register(...registerables);

export const LIBELLES_POCHES: Record<Poche, string> = {
  A: 'A — Sécurité',
  BO: 'B-Opportunité',
  BP: 'B-Projet',
  C: 'C — Long terme'
};

export const LIBELLES_LIGNES: Record<Ligne, string> = {
  world: 'MSCI World',
  emergents: 'Marchés émergents',
  europe: 'Europe',
  satellite: 'Satellite (action)',
  crypto: 'Crypto',
  or: 'Or',
  panier: 'Panier matières premières',
  fun: 'Fun / alternatifs',
  fonds_euros: 'Fonds euros',
  monetaire: 'Fonds monétaire',
  livret: 'Livret'
};

export const LIBELLES_TYPES: Record<TypeOperation, string> = {
  versement: 'Versement',
  achat: 'Achat',
  vente: 'Vente',
  arbitrage: 'Arbitrage',
  retrait: 'Retrait',
  dividende: 'Dividende',
  interets: 'Intérêts',
  frais: 'Frais'
};

/** Lignes possibles pour chaque poche. */
export const LIGNES_PAR_POCHE: Record<Poche, Ligne[]> = {
  A: ['livret'],
  BO: ['fonds_euros', 'monetaire', 'livret'],
  BP: ['livret', 'fonds_euros', 'monetaire'],
  C: ['world', 'emergents', 'europe', 'satellite', 'crypto', 'or', 'panier', 'fun']
};

export const Eur = ({ c }: { c: Centimes }) => <span class="nombre">{formatEuros(c)}</span>;
export const Pct = ({ x, d = 1 }: { x: number | null; d?: number }) => (
  <span class={'nombre ' + (x === null ? '' : x > 0 ? 'positif' : x < 0 ? 'negatif' : '')}>{x === null ? '—' : formatPct(x, d)}</span>
);

export function Carte({ titre, children, action }: { titre?: string; children: ComponentChildren; action?: ComponentChildren }) {
  return (
    <section class="carte">
      {(titre || action) && (
        <div class="carte-tete">
          {titre && <h2>{titre}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Pastille({ niveau }: { niveau: Niveau }) {
  const t = { ok: 'OK', info: 'Info', attention: 'À surveiller', action: 'Action' }[niveau];
  return <span class={'pastille ' + niveau}>{t}</span>;
}

export function ChampMontant({ libelle, valeur, onChange, aide }: { libelle: string; valeur: Centimes | null; onChange: (c: Centimes | null) => void; aide?: string }) {
  return (
    <label class="champ">
      <span>{libelle}</span>
      <input
        inputMode="decimal"
        placeholder="0,00"
        value={valeur === null ? '' : (valeur / 100).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2, useGrouping: false })}
        onChange={(e) => onChange(lireMontant((e.target as HTMLInputElement).value))}
      />
      {aide && <small>{aide}</small>}
    </label>
  );
}

export function ChampNombre({ libelle, valeur, onChange, aide, pas }: { libelle: string; valeur: number | null | undefined; onChange: (n: number | null) => void; aide?: string; pas?: string }) {
  return (
    <label class="champ">
      <span>{libelle}</span>
      <input
        inputMode="decimal"
        step={pas}
        value={valeur === null || valeur === undefined ? '' : String(valeur).replace('.', ',')}
        onChange={(e) => onChange(lireNombre((e.target as HTMLInputElement).value))}
      />
      {aide && <small>{aide}</small>}
    </label>
  );
}

export function ChampTexte({ libelle, valeur, onChange, multi }: { libelle: string; valeur: string; onChange: (s: string) => void; multi?: boolean }) {
  return (
    <label class="champ">
      <span>{libelle}</span>
      {multi ? (
        <textarea rows={3} value={valeur} onInput={(e) => onChange((e.target as HTMLTextAreaElement).value)} />
      ) : (
        <input value={valeur} onInput={(e) => onChange((e.target as HTMLInputElement).value)} />
      )}
    </label>
  );
}

export function ChampDate({ libelle, valeur, onChange }: { libelle: string; valeur: string; onChange: (s: string) => void }) {
  return (
    <label class="champ">
      <span>{libelle}</span>
      <input type="date" value={valeur} onChange={(e) => onChange((e.target as HTMLInputElement).value)} />
    </label>
  );
}

export function ChampChoix<T extends string>({ libelle, valeur, options, onChange }: { libelle: string; valeur: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <label class="champ">
      <span>{libelle}</span>
      <select value={valeur} onChange={(e) => onChange((e.target as HTMLSelectElement).value as T)}>
        {options.map(([v, l]) => (
          <option value={v}>{l}</option>
        ))}
      </select>
    </label>
  );
}

export function Vide({ children }: { children: ComponentChildren }) {
  return <p class="vide">{children}</p>;
}

/** Couleurs des graphiques, lues dans les variables CSS (clair / sombre). */
export function couleurs() {
  const s = getComputedStyle(document.documentElement);
  const v = (n: string) => s.getPropertyValue(n).trim();
  return {
    serie: [v('--serie-1'), v('--serie-2'), v('--serie-3'), v('--serie-4'), v('--serie-5'), v('--serie-6'), v('--serie-7'), v('--serie-8')],
    texte: v('--texte-doux'),
    grille: v('--grille'),
    positif: v('--positif'),
    negatif: v('--negatif')
  };
}

/** Graphique Chart.js ; recréé quand la configuration change. */
export function Graphique({ config, hauteur = 220 }: { config: () => ChartConfiguration; hauteur?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const c = couleurs();
    Chart.defaults.color = c.texte;
    Chart.defaults.borderColor = c.grille;
    Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
    const g = new Chart(ref.current, config());
    return () => g.destroy();
  });
  return (
    <div class="graphique" style={{ height: hauteur + 'px' }}>
      <canvas ref={ref} />
    </div>
  );
}

export function dateFr(d: string | null | undefined): string {
  if (!d) return '—';
  const [a, m, j] = d.slice(0, 10).split('-');
  return `${j}/${m}/${a}`;
}

/** Bouton « Taux BCE » : récupère le taux de référence EUR/USD de la BCE à la date donnée. */
export function BoutonTauxBCE({ date, onTaux }: { date: string; onTaux: (usdParEur: number) => void }) {
  const [etat, setEtat] = useState<{ chargement: boolean; message: string | null; erreur: boolean }>({ chargement: false, message: null, erreur: false });
  async function charger() {
    setEtat({ chargement: true, message: null, erreur: false });
    try {
      const t = await tauxBCE(date);
      onTaux(t.usdParEur);
      setEtat({ chargement: false, erreur: false, message: `Taux BCE du ${dateFr(t.date)} : 1 € = ${t.usdParEur.toLocaleString('fr-FR', { maximumFractionDigits: 4 })} $` });
    } catch (e) {
      setEtat({ chargement: false, erreur: true, message: (e as Error).message });
    }
  }
  return (
    <div class="taux-bce">
      <button type="button" class="petit" onClick={charger} disabled={etat.chargement || !date}>
        {etat.chargement ? 'Recherche…' : 'Taux BCE à cette date'}
      </button>
      {etat.message && <small class={etat.erreur ? 'negatif' : ''}>{etat.message}</small>}
    </div>
  );
}
