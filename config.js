// Every number worth tuning, with its range. The game reads CONFIG.<name>.value each time it
// needs one, so the tweak panel (tune.js: press ` or open the page with ?tune) changes it live.
window.CONFIG = {
  seed: 20261119,
  // the rat
  rat_speed: { value: 5.2, min: 3, max: 9, step: 0.1 },            // cells per second (1 cell = 6 m)
  dash_boost: { value: 1.65, min: 1.2, max: 2.5, step: 0.05 },
  stamina_drain: { value: 0.45, min: 0.1, max: 1, step: 0.05 },     // share of the bar per second
  stamina_regen: { value: 0.22, min: 0.05, max: 0.6, step: 0.01 },
  load_slowdown: { value: 0.05, min: 0, max: 0.12, step: 0.01 },    // slower per bite carried
  vision: { value: 6, min: 3, max: 12, step: 0.5 },                 // cells of light around the rat
  carry_start: { value: 4, min: 2, max: 10, step: 1 },
  lives: { value: 3, min: 1, max: 6, step: 1 },
  sniff_range: { value: 18, min: 8, max: 40, step: 1 },
  sniff_cooldown: { value: 6, min: 1, max: 15, step: 0.5 },
  // the night
  night_seconds: { value: 150, min: 60, max: 300, step: 10 },
  quota_first: { value: 12, min: 4, max: 40, step: 1 },
  quota_step: { value: 6, min: 0, max: 15, step: 1 },
  // the patrol and the cat
  inspector_patrol_speed: { value: 2.5, min: 1, max: 5, step: 0.1 },
  inspector_chase_speed: { value: 4.4, min: 2, max: 7, step: 0.1 },
  spot_rate: { value: 1.4, min: 0.4, max: 3, step: 0.1 },
  flashlight_range: { value: 9.5, min: 4, max: 14, step: 0.5 },
  cat_chase_speed: { value: 6.6, min: 3, max: 9, step: 0.1 },
  // the streets
  car_speed_avenue: { value: 4.4, min: 2, max: 8, step: 0.1 },
  car_speed_street: { value: 3.4, min: 2, max: 8, step: 0.1 },
  traffic_density: { value: 1, min: 0.2, max: 3, step: 0.1 },
  signal_green: { value: 9, min: 4, max: 20, step: 0.5 },          // seconds of green for each direction
  signal_yellow: { value: 2.5, min: 1, max: 5, step: 0.5 },
};
