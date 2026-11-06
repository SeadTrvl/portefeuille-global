#!/bin/sh
# Construit l'application et la publie sur la branche gh-pages (GitHub Pages).
set -e
cd "$(dirname "$0")"
npm test
npm run build
touch dist/.nojekyll
cd dist
rm -rf .git
git init -q -b gh-pages
git add -A
git -c user.name="Noé Perrier" -c user.email="noe.perrier@hotmail.com" commit -q -m "Publication $(date +%Y-%m-%d)"
git push -f -q "$(git -C .. remote get-url origin)" gh-pages
rm -rf .git
echo "Publié."
