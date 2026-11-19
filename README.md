# Rat Run 125

Play: https://9725lu-alt.github.io/rat-run-125/

An arcade game on the real 125th Street & Amsterdam Avenue, Harlem, at night. You are a rat: carry trash back to your burrow before dawn, dodge flashlight inspectors, cars, the night garbage truck and the bodega cat, sniff out food, and dive through subway grates. Pick a perk after each night. Keyboard or touch, English / 中文.

Controls: WASD / arrows run · Shift dash · E sniff · Space dive · P pause · M sound.

The street grid (buildings, sidewalks, roads, lamps, trash sources, bins, subway entrances) comes from the Rat City simulation (Spatial AI, Columbia GSAPP; Ryan Fu, Lu Liu, Yifan Zhao): https://yz5149-stack.github.io/spatial_ai_gsapp/20261119_rats/ — built from NYC Open Data and OpenStreetMap (ODbL). `src/sim/` and `data/` are copied from that project.

Run locally: `python3 -m http.server`, then open http://localhost:8000/.
