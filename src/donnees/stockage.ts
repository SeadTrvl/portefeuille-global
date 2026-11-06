// Stockage local (IndexedDB) et synchronisation manuelle par fichier iCloud Drive.
import { openDB } from 'idb';
import { deserialiser, etatVide, nomAppareil, serialiser, type Etat } from './etat';

const BASE = 'portefeuille-global';
const MAGASIN = 'etat';

async function base() {
  return openDB(BASE, 1, {
    upgrade(db) {
      db.createObjectStore(MAGASIN);
    }
  });
}

export interface Meta {
  /** Horodatage du dernier enregistrement vers / ouverture depuis le fichier iCloud. */
  derniereSynchro: string | null;
  /** Vrai si des modifications locales n'ont pas encore été enregistrées dans le fichier. */
  nonSynchronise: boolean;
}

export async function charger(): Promise<{ etat: Etat; meta: Meta }> {
  try {
    const db = await base();
    const etat = (await db.get(MAGASIN, 'etat')) as Etat | undefined;
    const meta = ((await db.get(MAGASIN, 'meta')) as Meta | undefined) ?? { derniereSynchro: null, nonSynchronise: false };
    return { etat: etat ? deserialiser(JSON.stringify(etat)) : etatVide(), meta };
  } catch {
    return { etat: etatVide(), meta: { derniereSynchro: null, nonSynchronise: false } };
  }
}

export async function sauver(etat: Etat, meta: Meta): Promise<void> {
  const db = await base();
  await db.put(MAGASIN, etat, 'etat');
  await db.put(MAGASIN, meta, 'meta');
}

/** Demande au navigateur de ne pas effacer les données (utile sur iOS). */
export async function demanderPersistance(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

export const NOM_FICHIER = 'portefeuille.json';

/**
 * Enregistre l'état dans un fichier.
 * Sur iPhone / iPad : feuille de partage → « Enregistrer dans Fichiers » → iCloud Drive.
 * Sur Mac : téléchargement (à déplacer ou à enregistrer dans le dossier iCloud).
 */
export async function exporterFichier(etat: Etat): Promise<'partage' | 'telechargement' | 'annule'> {
  // modifie_le = date de la dernière modification des données (mise à jour à chaque changement).
  const texte = serialiser({ ...etat, appareil: nomAppareil() });
  const fichier = new File([texte], NOM_FICHIER, { type: 'application/json' });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  const tactile = navigator.maxTouchPoints > 1;
  if (tactile && nav.canShare?.({ files: [fichier] })) {
    try {
      await navigator.share({ files: [fichier], title: 'Portefeuille Global' });
      return 'partage';
    } catch (err) {
      if ((err as Error).name === 'AbortError') return 'annule';
    }
  }
  const url = URL.createObjectURL(fichier);
  const a = document.createElement('a');
  a.href = url;
  a.download = NOM_FICHIER;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return 'telechargement';
}

export async function lireFichier(f: File): Promise<Etat> {
  return deserialiser(await f.text());
}
