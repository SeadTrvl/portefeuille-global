# Portefeuille Global

Application web personnelle (installable sur iPhone, iPad et Mac) qui applique les règles de `GUIDE_GESTION.md`.
Elle calcule et propose ; elle ne passe aucun ordre et ne se connecte à aucune banque.

## Utiliser
- Données : stockées sur chaque appareil, synchronisées à la main par le fichier
  `iCloud Drive/Finance/Gestionnaire Personnel/donnees/portefeuille.json`
  (Réglages → Synchronisation : « Ouvrir » en arrivant, « Enregistrer » avant de partir).
- iPhone / iPad : Safari → Partager → « Sur l'écran d'accueil ». Mac : Safari → Fichier → « Ajouter au Dock ».

## Développer
Node.js est installé dans `~/.local/node/bin` :

    export PATH="$HOME/.local/node/bin:$PATH"
    npm install
    npm run dev     # aperçu local sur http://localhost:5173
    npm test        # tests du moteur (5 cas du guide inclus)
    npm run build

## Organisation
- `src/moteur/` : calculs purs, un fichier par règle du guide (§ indiqué en commentaire).
- `src/donnees/` : état, stockage local (IndexedDB), import/export du fichier iCloud.
- `src/ui/` : écrans (Preact).
- Publication : GitHub Pages via `.github/workflows/pages.yml` (le dépôt doit s'appeler `portefeuille-global`).
  Seul le code est publié ; aucune donnée personnelle n'est dans le dépôt.
