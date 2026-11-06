// État global de l'interface : données, sauvegarde locale automatique, navigation.
import { createContext, type ComponentChildren } from 'preact';
import { useContext, useEffect, useMemo, useState } from 'preact/hooks';
import { charger, sauver, type Meta } from '../donnees/stockage';
import { copie, etatVide, type Etat } from '../donnees/etat';
import { calculer, type Calculs } from '../donnees/calculs';
import type { Operation } from '../moteur/types';

export type Ecran =
  | 'tableau'
  | 'mois'
  | 'performances'
  | 'cours'
  | 'krach'
  | 'plus'
  | 'saisie'
  | 'satellite'
  | 'journal'
  | 'reglages';

export interface Navigation {
  ecran: Ecran;
  /** Paramètre facultatif (ex. identifiant d'actif pour la fiche de performance). */
  param?: string;
}

interface Contexte {
  pret: boolean;
  etat: Etat;
  meta: Meta;
  calc: Calculs;
  maj: (f: (e: Etat) => void) => void;
  remplacer: (e: Etat, meta: Meta) => void;
  marquerSynchro: () => void;
  nav: Navigation;
  aller: (ecran: Ecran, param?: string) => void;
  /** Opération pré-remplie à ouvrir dans le formulaire de saisie. */
  brouillon: Partial<Operation> | null;
  saisirOperation: (b: Partial<Operation>) => void;
  viderBrouillon: () => void;
}

const Ctx = createContext<Contexte | null>(null);

export function useApp(): Contexte {
  const c = useContext(Ctx);
  if (!c) throw new Error('Contexte absent');
  return c;
}

export function Fournisseur({ children }: { children: ComponentChildren }) {
  const [pret, setPret] = useState(false);
  const [etat, setEtat] = useState<Etat>(etatVide());
  const [meta, setMeta] = useState<Meta>({ derniereSynchro: null, nonSynchronise: false });
  const [nav, setNav] = useState<Navigation>({ ecran: 'tableau' });
  const [brouillon, setBrouillon] = useState<Partial<Operation> | null>(null);

  useEffect(() => {
    charger().then(({ etat, meta }) => {
      setEtat(etat);
      setMeta(meta);
      setPret(true);
    });
  }, []);

  const calc = useMemo(() => calculer(etat), [etat]);

  const valeur: Contexte = {
    pret,
    etat,
    meta,
    calc,
    maj(f) {
      const nouvel = copie(etat);
      f(nouvel);
      nouvel.modifie_le = new Date().toISOString();
      const m = { ...meta, nonSynchronise: true };
      setEtat(nouvel);
      setMeta(m);
      void sauver(nouvel, m);
    },
    remplacer(e, m) {
      setEtat(e);
      setMeta(m);
      void sauver(e, m);
    },
    marquerSynchro() {
      const m = { derniereSynchro: new Date().toISOString(), nonSynchronise: false };
      setMeta(m);
      void sauver(etat, m);
    },
    nav,
    aller(ecran, param) {
      setNav({ ecran, param });
      window.scrollTo(0, 0);
    },
    brouillon,
    saisirOperation(b) {
      setBrouillon(b);
      setNav({ ecran: 'saisie', param: 'operation' });
      window.scrollTo(0, 0);
    },
    viderBrouillon() {
      setBrouillon(null);
    }
  };

  return <Ctx.Provider value={valeur}>{children}</Ctx.Provider>;
}
