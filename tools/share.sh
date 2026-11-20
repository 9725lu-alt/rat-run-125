#!/usr/bin/env bash
# Builds the shareable copy of the game in dist/ (no tweak panel) and zips it for itch.io
# as rat-run-125-web.zip. Run from the repository root: bash tools/share.sh
set -eu
cd "$(dirname "$0")/.."
rm -rf dist && mkdir -p dist/src/sim dist/data
cp index.html game.css game.js roads.js config.js dist/
cp src/sim/city.js src/sim/rng.js src/sim/config.js dist/src/sim/
cp data/manhattanville.json dist/data/
# the shared build has no tweak panel
grep -v 'src="tune.js' index.html > dist/index.html
bash tools/itch-zip.sh --root . --dist dist --out rat-run-125-web.zip
