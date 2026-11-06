# Projet : outil de gestion du Portefeuille Global

## Objectif

Construire un outil personnel (tableur ou application) qui applique **exactement** les règles de `GUIDE_GESTION.md`. Ce guide est la seule source de vérité : en cas de doute, il prime sur toute autre idée. Ne pas inventer de règle d'investissement ; si une règle manque, demander à l'utilisateur.

L'utilisateur est francophone : interface, libellés et messages en français. Montants en euros, format français (`1 234,56 €`, `7,5 %`).

## Fichiers

- `GUIDE_GESTION.md` : règles de gestion complètes (principes, paramètres, poches, algorithmes, tableau de bord, modèle de données).
- `parametres.json` : les paramètres de la section 2 du guide, en valeurs numériques. Le code les lit au lieu de les écrire en dur.

## Première étape

Avant de coder, demander à l'utilisateur quelle forme il veut :

1. **Tableur Excel ou Google Sheets** : un onglet par table de la section 10, formules natives, mise en forme conditionnelle pour les alertes.
2. **Application web locale** : par exemple Python + SQLite + une interface simple, ou une application web monopage avec stockage local.

Proposer une recommandation, mais laisser le choix.

## Fonctionnalités attendues (par priorité)

1. Saisie des comptes, actifs, opérations et valorisations ; calcul de la valeur de chaque poche et sous-poche.
2. Calcul des cibles : `cible_A`, `cible_BO`, `plafond_BO`, `montant_BP`, `effort_BP`.
3. **Répartition de l'épargne du mois** selon l'algorithme de la section 4, affichée comme une liste d'ordres à passer.
4. Tableau de bord de la section 9 avec alertes visuelles.
5. Suivi de l'épisode de krach (section 5) : baisse du MSCI World, tranche à déployer.
6. Portefeuille fantôme et TRI (XIRR) du Satellite sur 3 ans glissants (section 7).
7. Journal de décision et fiches Satellite.

L'outil **calcule et propose** ; il ne passe jamais d'ordre et ne se connecte à aucun compte bancaire ou courtier.

## Précisions d'implémentation (non ambiguës)

- **Pourcentages** : toujours en % de la poche concernée. Les cibles des sous-lignes de C sont exprimées en % de C : World 37,5 %, émergents 15 %, Europe 7,5 %, Satellite 25 %, crypto 7,5 %, or 3 %, panier de matières premières 2 %, Fun 2,5 %.
- **Bandes** : elles s'appliquent aux cinq sous-poches de C (Core, Satellite, Crypto, Matières premières, Fun), pas aux lignes internes.
- **Flux, étape 4** : si la somme des manques vaut 0, répartir `reste` au prorata des cibles. Arrondir au centime ; affecter l'écart d'arrondi à la plus grande ligne.
- **Cible du Satellite** : variable d'état (25 % par défaut, 15 % après une réduction). Les flux utilisent la cible courante ; la différence de 10 points va au Core au prorata de World / émergents / Europe.
- **Argent du Satellite en attente** : placé sur l'ETF MSCI World mais rattaché à la sous-poche Satellite (champ `sous_poche`).
- **B-Opportunité au-delà de 5 000 €** : la part de 1/3 en fonds monétaire est une consigne de placement ; signaler l'écart si elle n'est pas respectée.
- **Épisode de krach** : machine à états `inactif → actif (tranches 0/1/2/3) → inactif`. Début à −15 % ; `BO_départ` est figé au début ; chaque palier ne se déclenche qu'une fois ; fin quand la baisse remonte au-dessus de −10 %, puis remise à zéro. Pendant un épisode actif, l'étape 3 des flux est suspendue.
- **Indice** : la saisie manuelle de la valeur du MSCI World en euros doit suffire ; une récupération automatique éventuelle reste optionnelle.
- **TRI** : utiliser des flux datés (XIRR). Pas de décision Satellite avant 3 ans d'historique : afficher « historique insuffisant ».
- **Projet** : tant qu'aucun projet n'est au statut « actif », B-Projet vaut 0 et l'étape 2 des flux est ignorée.
- **Fractions exactes** (décision du 5 novembre 2026) : `K_TRANCHE` et `BO_PART_MONE` valent exactement 1/3 (stockés `{ "num": 1, "den": 3 }`). Trois tranches déploient 100 % de `BO_départ` ; la 3e tranche prend le solde exact.
- **Alerte de couverture de A** (décision du 5 novembre 2026) : alerte sous `A_MOIS` (3 ou 4 selon le profil), et non sous 3 mois fixes.
- **Taux d'épargne** (décision du 5 novembre 2026) : tant que `EPARGNE_TAUX` vaut `null`, l'alerte est désactivée.

## Choix techniques retenus

- Application web installable (PWA) : Vite + TypeScript + Preact, tests Vitest. Node.js est installé dans `~/.local/node/bin` (le préfixer au `PATH`).
- Moteur de calcul pur dans `src/moteur/`, sans interface ; montants en centimes entiers.
- Données en local (IndexedDB) ; synchronisation manuelle par un fichier `portefeuille.json` dans iCloud Drive (`Finance/Gestionnaire Personnel/donnees/`).
- Suivi des performances par actif (PRU, plus-values, TRI, TWR, graphiques), à partir des cours saisis à la main.
- Actifs en dollars : cours en $, taux EUR/USD saisi à la main (1 € = x $) ; tous les calculs du guide restent en euros, effet de change inclus. Le même jour, le taux saisi pour la journée prime sur celui d'un relevé, puis sur celui d'une opération.
- Données de marché à la demande (jamais de montant envoyé) : taux BCE (API data-api.ecb.europa.eu, secours Frankfurter) ; cours par ISIN ou symbole Yahoo via le relais Cloudflare `relais/` (https://portefeuille-relais.seadtrvl.workers.dev, source Yahoo Finance non officielle). Redéployer le relais : `cd relais && npx wrangler deploy`.

## Cas de test à faire passer

1. **A sous sa cible** : `cible_A` = 7 000 €, A = 5 000 €, épargne = 1 500 € → 1 500 € vers A, rien ailleurs.
2. **Flux complet** : A à sa cible ; aucun projet actif ; BO = 600 € ; C = 12 000 € (Core 7 000, Satellite 3 000, Crypto 1 000, Matières premières 600, Fun 400) ; épargne = 1 000 €, pas de krach.
   - `cible_BO` = max(1 000 ; 600) = 1 000 € → 400 € vers BO, reste 600 €.
   - Base C + reste = 12 600 € ; manques : Core 560, Satellite 150, Crypto 0, Matières premières 30, Fun 0 (somme 740).
   - Résultat : Core 454,06 €, Satellite 121,62 €, Matières premières 24,32 €, Crypto 0, Fun 0 (écart d'arrondi de 0,01 € affecté à la plus grande ligne, total 600,00 €).
3. **Krach** : BO = 3 000 € au début ; baisse successive −12 %, −16 %, −22 %, −27 %, −18 %, −9 %.
   - −16 % : tranche 1 de 1 000 € ; −27 % : tranche 2 de 1 000 € ; −18 % : rien ; −9 % : fin d'épisode, remise à zéro, reconstitution de BO reprise.
4. **Crypto au-delà du plafond** : crypto = 11 % de C → alerte « action immédiate », proposition de vente pour revenir à 7,5 %.
5. **Plafond BO** : C = 50 000 €, BO = 6 000 € → `plafond_BO` = 5 000 € → surplus de 1 000 € proposé vers C à la revue annuelle.

## Qualité

- Code simple et lisible, commenté en français pour les règles de gestion (référence à la section du guide).
- Tests automatisés pour les calculs (cibles, flux, krach, alertes) si l'option application est choisie.
- Données personnelles stockées uniquement en local.
