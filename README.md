# Rat Run 125

Play: https://9725lu-alt.github.io/rat-run-125/

An arcade game on the real 125th Street & Amsterdam Avenue, Harlem, at night. You are a rat: carry trash back to your burrow before dawn, dodge flashlight inspectors, cars, the night garbage truck and the bodega cat, sniff out food, and dive through subway grates. Pick a perk after each night. Keyboard or touch, English / 中文.

Streets follow the real layout: the avenues and W 125th St are two-way, Broadway is a divided boulevard, and the numbered cross streets are one-way (even numbers eastbound, odd westbound). Every intersection has traffic signals and crosswalks; cars keep their lanes, queue at red lights and stop for you on a crosswalk with the WALK signal. Jaywalk and they honk — and don't stop in time. Hide under parked cars.

Controls: WASD / arrows run · Shift dash · E sniff · Space dive · P pause · M sound.

The street grid (buildings, sidewalks, roads, lamps, trash sources, bins, subway entrances) comes from the Rat City simulation (Spatial AI, Columbia GSAPP; Ryan Fu, Lu Liu, Yifan Zhao): https://yz5149-stack.github.io/spatial_ai_gsapp/20261119_rats/ — built from NYC Open Data and OpenStreetMap (ODbL). `src/sim/` and `data/` are copied from that project.

Tuning: every gameplay number lives in `config.js`. Open the game with `?tune` (https://9725lu-alt.github.io/rat-run-125/?tune), or press the backquote key when running it locally, to get a slider for each value; *Save* copies the changed values as a block to paste to Claude.

itch.io: `bash tools/share.sh` builds `dist/` without the tweak panel and zips it as `rat-run-125-web.zip`, checked against itch.io's limits for HTML games. Upload the zip as an HTML game.

The tweak panel (`tune.js`) and `tools/itch-zip.sh` are adapted from [Claude Code Game Studios](https://github.com/donchitos/claude-code-game-studios) (MIT License, © 2026 Donchitos).

Run locally: `python3 -m http.server`, then open http://localhost:8000/.
