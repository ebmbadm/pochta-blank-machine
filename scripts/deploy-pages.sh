#!/usr/bin/env bash
# Деплой статического экспорта в ветку gh-pages (GitHub Pages, source = branch).
# Использование: npm run deploy
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

REPO_URL="$(git remote get-url origin)"
BASE_PATH="${NEXT_PUBLIC_BASE_PATH:-/pochta-blank-machine}"

echo "▶ Сборка статического экспорта (basePath=$BASE_PATH)…"
NEXT_PUBLIC_BASE_PATH="$BASE_PATH" npx next build

echo "▶ Публикация out/ в ветку gh-pages…"
cd out
touch .nojekyll
rm -rf .git
git init -q
git checkout -q -b gh-pages
git add -A
git commit -q -m "Deploy static export"
git remote add origin "$REPO_URL"
git push -f -q origin gh-pages

echo "✓ Готово. Сайт обновится через ~1 минуту."
