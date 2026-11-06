// Saisie : comptes, actifs et opérations (§ 10).
import { useEffect, useState } from 'preact/hooks';
import { useApp } from './store';
import {
  Carte,
  ChampChoix,
  ChampDate,
  ChampMontant,
  ChampNombre,
  ChampTexte,
  Eur,
  Vide,
  dateFr,
  LIBELLES_LIGNES,
  LIBELLES_POCHES,
  LIBELLES_TYPES,
  LIGNES_PAR_POCHE
} from './commun';
import { nouvelId } from '../donnees/etat';
import { aujourdhui } from '../donnees/calculs';
import { versCentimes } from '../moteur/montants';
import type { Actif, Compte, Ligne, Operation, Poche, TypeCompte, TypeOperation } from '../moteur/types';

type Onglet = 'operation' | 'actifs' | 'comptes';

export function Saisie() {
  const { nav } = useApp();
  const [onglet, setOnglet] = useState<Onglet>((nav.param as Onglet) ?? 'operation');
  useEffect(() => {
    if (nav.param) setOnglet(nav.param as Onglet);
  }, [nav.param]);
  return (
    <>
      <div class="segments">
        {(
          [
            ['operation', 'Opérations'],
            ['actifs', 'Actifs'],
            ['comptes', 'Comptes']
          ] as [Onglet, string][]
        ).map(([k, l]) => (
          <button class={onglet === k ? 'actif' : ''} onClick={() => setOnglet(k)}>
            {l}
          </button>
        ))}
      </div>
      {onglet === 'operation' && <Operations />}
      {onglet === 'actifs' && <Actifs />}
      {onglet === 'comptes' && <Comptes />}
    </>
  );
}

const TYPES_COMPTE: [TypeCompte, string][] = [
  ['livret', 'Livret'],
  ['pea', 'PEA'],
  ['assurance_vie', 'Assurance-vie'],
  ['compte_titres', 'Compte-titres'],
  ['crypto', 'Plateforme crypto'],
  ['autre', 'Autre']
];

function Comptes() {
  const { etat, maj } = useApp();
  const vide: Compte = { id: '', nom: '', type: 'livret', etablissement: '' };
  const [c, setC] = useState<Compte>(vide);
  return (
    <>
      <Carte titre={c.id ? 'Modifier le compte' : 'Nouveau compte'}>
        <div class="formulaire">
          <ChampTexte libelle="Nom" valeur={c.nom} onChange={(nom) => setC({ ...c, nom })} />
          <ChampChoix libelle="Type d'enveloppe" valeur={c.type} options={TYPES_COMPTE} onChange={(type) => setC({ ...c, type })} />
          <ChampTexte libelle="Établissement" valeur={c.etablissement} onChange={(etablissement) => setC({ ...c, etablissement })} />
        </div>
        <div class="boutons">
          <button
            class="principal"
            disabled={!c.nom}
            onClick={() => {
              maj((e) => {
                if (c.id) e.comptes = e.comptes.map((x) => (x.id === c.id ? c : x));
                else e.comptes.push({ ...c, id: nouvelId() });
              });
              setC(vide);
            }}
          >
            {c.id ? 'Enregistrer' : 'Ajouter'}
          </button>
          {c.id && <button onClick={() => setC(vide)}>Annuler</button>}
        </div>
      </Carte>
      <Carte titre="Comptes">
        {etat.comptes.length === 0 ? (
          <Vide>Aucun compte.</Vide>
        ) : (
          <ul class="liste">
            {etat.comptes.map((x) => (
              <li onClick={() => setC(x)}>
                <b>{x.nom}</b>
                <small>
                  {TYPES_COMPTE.find((t) => t[0] === x.type)?.[1]} · {x.etablissement}
                </small>
              </li>
            ))}
          </ul>
        )}
      </Carte>
    </>
  );
}

function Actifs() {
  const { etat, maj, calc } = useApp();
  const vide: Actif = { id: '', nom: '', poche: 'C', ligne: 'world', mode: 'cours' };
  const [a, setA] = useState<Actif>(vide);
  const poches: [Poche, string][] = (Object.keys(LIBELLES_POCHES) as Poche[]).map((k) => [k, LIBELLES_POCHES[k]]);
  const lignes: [Ligne, string][] = LIGNES_PAR_POCHE[a.poche].map((l) => [l, LIBELLES_LIGNES[l]]);

  function changerPoche(poche: Poche) {
    const ligne = LIGNES_PAR_POCHE[poche][0];
    setA({ ...a, poche, ligne, mode: poche === 'C' ? 'cours' : 'valeur' });
  }

  return (
    <>
      <Carte titre={a.id ? "Modifier l'actif" : 'Nouvel actif'}>
        <div class="formulaire">
          <ChampTexte libelle="Nom" valeur={a.nom} onChange={(nom) => setA({ ...a, nom })} />
          <ChampTexte libelle="ISIN ou ticker" valeur={a.isin ?? ''} onChange={(isin) => setA({ ...a, isin })} />
          <ChampChoix libelle="Poche" valeur={a.poche} options={poches} onChange={changerPoche} />
          <ChampChoix libelle="Sous-poche" valeur={a.ligne} options={lignes} onChange={(ligne) => setA({ ...a, ligne })} />
          <ChampChoix
            libelle="Valorisation"
            valeur={a.mode}
            options={[
              ['cours', 'Par cours (quantité × cours)'],
              ['valeur', 'Par valeur du contrat (fonds euros, livret)']
            ]}
            onChange={(mode) => setA({ ...a, mode })}
          />
          <ChampChoix
            libelle="Compte"
            valeur={a.compteId ?? ''}
            options={[['', '—'], ...etat.comptes.map((c) => [c.id, c.nom] as [string, string])]}
            onChange={(compteId) => setA({ ...a, compteId: compteId || undefined })}
          />
          <ChampNombre
            libelle="Frais courants (% par an)"
            valeur={a.fraisCourants !== undefined ? Math.round(a.fraisCourants * 10000) / 100 : null}
            onChange={(n) => setA({ ...a, fraisCourants: n === null ? undefined : n / 100 })}
          />
          {a.ligne === 'world' && a.mode === 'cours' && (
            <label class="case">
              <input type="checkbox" checked={!!a.etfWorldReference} onChange={(e) => setA({ ...a, etfWorldReference: (e.target as HTMLInputElement).checked })} />
              ETF MSCI World de référence (portefeuille fantôme et attente du Satellite)
            </label>
          )}
          {a.id && (
            <label class="case">
              <input type="checkbox" checked={!!a.archive} onChange={(e) => setA({ ...a, archive: (e.target as HTMLInputElement).checked })} />
              Archivé (n'est plus proposé dans les ordres)
            </label>
          )}
        </div>
        <div class="boutons">
          <button
            class="principal"
            disabled={!a.nom}
            onClick={() => {
              maj((e) => {
                if (a.etfWorldReference) e.actifs.forEach((x) => (x.etfWorldReference = false));
                if (a.id) e.actifs = e.actifs.map((x) => (x.id === a.id ? a : x));
                else e.actifs.push({ ...a, id: nouvelId() });
              });
              setA(vide);
            }}
          >
            {a.id ? 'Enregistrer' : 'Ajouter'}
          </button>
          {a.id && <button onClick={() => setA(vide)}>Annuler</button>}
        </div>
      </Carte>
      <Carte titre="Actifs">
        {etat.actifs.length === 0 ? (
          <Vide>Aucun actif.</Vide>
        ) : (
          <ul class="liste">
            {etat.actifs.map((x) => (
              <li onClick={() => setA(x)} class={x.archive ? 'archive' : ''}>
                <div class="ligne-liste">
                  <b>{x.nom}</b>
                  <Eur c={calc.idx.valeur(x.id, calc.date)} />
                </div>
                <small>
                  {LIBELLES_POCHES[x.poche]} · {LIBELLES_LIGNES[x.ligne]}
                  {x.etfWorldReference ? ' · référence fantôme' : ''}
                </small>
              </li>
            ))}
          </ul>
        )}
      </Carte>
    </>
  );
}

const TYPES_OP: TypeOperation[] = ['achat', 'vente', 'versement', 'retrait', 'dividende', 'interets', 'frais'];

function Operations() {
  const { etat, maj, brouillon, viderBrouillon } = useApp();
  const nouvelle = (): Operation => ({ id: '', date: aujourdhui(), actifId: etat.actifs[0]?.id ?? '', type: 'achat', montant: 0, frais: 0 });
  const [o, setO] = useState<Operation>(nouvelle());
  const [filtre, setFiltre] = useState('');

  useEffect(() => {
    if (brouillon) {
      setO({ ...nouvelle(), ...brouillon });
      viderBrouillon();
    }
  }, [brouillon]);

  const actif = etat.actifs.find((x) => x.id === o.actifId);
  const avecQuantite = actif?.mode === 'cours' && (o.type === 'achat' || o.type === 'vente');

  function changerQuantitePrix(q: number | null, prix: number | null) {
    const n = { ...o, quantite: q ?? undefined, prix: prix ?? undefined };
    if (q !== null && prix !== null) n.montant = versCentimes(q * prix);
    setO(n);
  }

  const valide = !!actif && o.montant > 0 && (!avecQuantite || (o.quantite ?? 0) > 0);
  const liste = [...etat.operations]
    .filter((x) => !filtre || x.actifId === filtre)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 100);

  if (etat.actifs.length === 0) {
    return (
      <Carte titre="Opérations">
        <Vide>Crée d'abord un actif (onglet Actifs).</Vide>
      </Carte>
    );
  }

  return (
    <>
      <Carte titre={o.id ? "Modifier l'opération" : 'Nouvelle opération'}>
        <div class="formulaire">
          <ChampDate libelle="Date" valeur={o.date} onChange={(date) => setO({ ...o, date })} />
          <ChampChoix libelle="Actif" valeur={o.actifId} options={etat.actifs.filter((x) => !x.archive || x.id === o.actifId).map((x) => [x.id, x.nom])} onChange={(actifId) => setO({ ...o, actifId })} />
          <ChampChoix libelle="Type" valeur={o.type} options={TYPES_OP.map((t) => [t, LIBELLES_TYPES[t]])} onChange={(type) => setO({ ...o, type })} />
          {avecQuantite && (
            <>
              <ChampNombre libelle="Quantité" valeur={o.quantite} onChange={(q) => changerQuantitePrix(q, o.prix ?? null)} />
              <ChampNombre libelle="Prix unitaire (€)" valeur={o.prix} onChange={(p) => changerQuantitePrix(o.quantite ?? null, p)} />
            </>
          )}
          <ChampMontant libelle="Montant" valeur={o.montant || null} onChange={(m) => setO({ ...o, montant: m ?? 0 })} aide={avecQuantite ? 'Calculé : quantité × prix' : undefined} />
          <ChampMontant libelle="Frais" valeur={o.frais || null} onChange={(m) => setO({ ...o, frais: m ?? 0 })} />
          {actif?.ligne === 'world' && actif.poche === 'C' && (
            <label class="case">
              <input type="checkbox" checked={o.ligne === 'satellite'} onChange={(e) => setO({ ...o, ligne: (e.target as HTMLInputElement).checked ? 'satellite' : undefined })} />
              Argent du Satellite en attente (compté dans le Satellite)
            </label>
          )}
          <ChampTexte libelle="Règle déclenchée (facultatif)" valeur={o.regle ?? ''} onChange={(regle) => setO({ ...o, regle: regle || undefined })} />
        </div>
        <div class="boutons">
          <button
            class="principal"
            disabled={!valide}
            onClick={() => {
              maj((e) => {
                if (o.id) e.operations = e.operations.map((x) => (x.id === o.id ? o : x));
                else e.operations.push({ ...o, id: nouvelId() });
              });
              setO({ ...nouvelle(), actifId: o.actifId, type: o.type });
            }}
          >
            {o.id ? 'Enregistrer' : 'Ajouter'}
          </button>
          {o.id && (
            <>
              <button onClick={() => setO(nouvelle())}>Annuler</button>
              <button
                class="danger"
                onClick={() => {
                  if (confirm('Supprimer cette opération ?')) {
                    maj((e) => {
                      e.operations = e.operations.filter((x) => x.id !== o.id);
                    });
                    setO(nouvelle());
                  }
                }}
              >
                Supprimer
              </button>
            </>
          )}
        </div>
      </Carte>
      <Carte
        titre="Dernières opérations"
        action={
          <select class="filtre" value={filtre} onChange={(e) => setFiltre((e.target as HTMLSelectElement).value)}>
            <option value="">Tous les actifs</option>
            {etat.actifs.map((x) => (
              <option value={x.id}>{x.nom}</option>
            ))}
          </select>
        }
      >
        {liste.length === 0 ? (
          <Vide>Aucune opération.</Vide>
        ) : (
          <ul class="liste">
            {liste.map((x) => {
              const a = etat.actifs.find((y) => y.id === x.actifId);
              return (
                <li onClick={() => setO(x)}>
                  <div class="ligne-liste">
                    <b>
                      {LIBELLES_TYPES[x.type]} · {a?.nom ?? '?'}
                    </b>
                    <Eur c={x.montant} />
                  </div>
                  <small>
                    {dateFr(x.date)}
                    {x.quantite ? ` · ${x.quantite.toLocaleString('fr-FR')} × ${x.prix?.toLocaleString('fr-FR')} €` : ''}
                    {x.ligne === 'satellite' ? ' · Satellite en attente' : ''}
                    {x.regle ? ` · ${x.regle}` : ''}
                  </small>
                </li>
              );
            })}
          </ul>
        )}
      </Carte>
    </>
  );
}
