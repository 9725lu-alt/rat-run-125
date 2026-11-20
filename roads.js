// Streets as New York builds them: roadways with lanes in the right direction, parking lanes,
// crosswalks and a traffic signal at every intersection; cars that keep their lane, queue,
// stop at red lights and yield to a rat on a crosswalk with the walk signal.
//
// Geometry comes from the OpenStreetMap street centrelines in the place data (grid units: cells).
// Directions follow the real streets here: the avenues and W 125th St are two-way; Broadway is a
// divided boulevard; the numbered cross streets are one-way, even numbers eastbound and odd
// numbers westbound (Manhattan's usual pattern).

const LW = 0.55;              // lane width in cells (3.3 m)
const STEP = 0.25;            // resampling step along centrelines
// signal timing, read live from config.js when it is there
const CF = (k, d) => (window.CONFIG?.[k]?.value ?? d) * (window.TUNING_SCALE ? window.TUNING_SCALE(k) : 1);
const SIGNAL = { get G() { return CF('signal_green', 9); }, get Y() { return CF('signal_yellow', 2.5); }, AR: 1.5 };
const cycle = () => 2 * (SIGNAL.G + SIGNAL.Y + SIGNAL.AR);
const TAU = Math.PI * 2;

// lanes per direction and how the street runs
function specFor(name, kind) {
  const n = name || '';
  const num = n.match(/^West (\d+)(st|nd|rd|th) Street$/);
  if (n === 'West 125th Street') return { two: true, lanes: 2, park: 1, major: true };
  if (num) return { two: false, lanes: 1, park: 2, eastbound: Number(num[1]) % 2 === 0 };
  const big = { 'Broadway': 3, 'Amsterdam Avenue': 2, 'Saint Nicholas Avenue': 2, 'Frederick Douglass Boulevard': 2, 'Riverside Drive': 2 };
  if (big[n]) return { two: true, lanes: big[n], park: 1, major: true };
  if (kind === 'avenue' || /Avenue|Drive|Terrace/.test(n)) return { two: true, lanes: 1, park: 1, major: kind === 'avenue' };
  return { two: true, lanes: 1, park: 1 };
}

export function buildRoads(city, place, rng) {
  const { W, H, geo } = city;
  // 1. chain OSM pieces of each street end to end (keeping the drawn direction of the first piece)
  const byName = new Map();
  for (const l of place.lines) {
    if (l.kind !== 'avenue' && l.kind !== 'street') continue;
    const k = `${l.name ?? ''}|${l.kind}`; if (!byName.has(k)) byName.set(k, []);
    byName.get(k).push(l.pts.map((q) => geo.toGrid(q[0], q[1])));
  }
  const near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 1.5;
  const raw = [];
  for (const [k, segs] of byName) {
    const left = segs.slice();
    while (left.length) {
      let chain = left.shift(); let grew = true;
      while (grew) {
        grew = false;
        for (let j = 0; j < left.length; j++) {
          const g = left[j]; const a = chain[0]; const z = chain[chain.length - 1];
          if (near(z, g[0])) chain = chain.concat(g.slice(1));
          else if (near(z, g[g.length - 1])) chain = chain.concat(g.slice(0, -1).reverse());
          else if (near(a, g[g.length - 1])) chain = g.slice(0, -1).concat(chain);
          else if (near(a, g[0])) chain = g.slice(1).reverse().concat(chain);
          else continue;
          left.splice(j, 1); grew = true; break;
        }
      }
      const [name, kind] = k.split('|');
      const r = resample(chain);
      if (r.L < 6) continue;
      // keep only chains that reach the map
      if (!r.pts.some(([x, y]) => x > 0 && y > 0 && x < W && y < H)) continue;
      raw.push({ name, kind, ...r });
    }
  }
  // 2. divided roads: two chains of one name running side by side are one-way carriageways
  const roads = [];
  for (const c of raw) {
    const spec = { ...specFor(c.name, c.kind) };
    const twin = raw.find((o) => o !== c && o.name === c.name && sideBySide(c, o));
    if (twin) { spec.two = false; spec.divided = true; spec.park = 1; spec.forward = true; }
    else if (!spec.two) {
      // one-way: travel eastbound (x increasing) on even streets
      const dx = c.pts[c.pts.length - 1][0] - c.pts[0][0];
      spec.forward = spec.eastbound ? dx > 0 : dx < 0;
    }
    const total = spec.two ? 2 * spec.lanes + 2 * spec.park : spec.lanes + spec.park;
    const hw = (total * LW) / 2;
    roads.push({ id: roads.length, name: c.name, kind: c.kind, spec, hw, pts: c.pts, tan: c.tan, L: c.L, nodes: [] });
  }

  // 3. intersections (with a signal each)
  const nodes = [];
  for (let a = 0; a < roads.length; a++) for (let b = a + 1; b < roads.length; b++) {
    const A = roads[a]; const B = roads[b]; if (A.name === B.name) continue;
    for (const hit of crossings(A, B)) {
      let n = nodes.find((q) => Math.hypot(q.x - hit.x, q.y - hit.y) < Math.max(A.hw, B.hw) + 0.8);
      if (!n) { n = { id: nodes.length, x: hit.x, y: hit.y, legs: [], offset: rng() * cycle() }; nodes.push(n); }
      for (const [R, s] of [[A, hit.sa], [B, hit.sb]]) if (!n.legs.some((l) => l.road === R)) n.legs.push({ road: R, s });
    }
  }
  for (const n of nodes) {
    // two signal groups by the direction of the streets
    const a0 = angAt(n.legs[0].road, n.legs[0].s);
    for (const l of n.legs) { const d = Math.abs(Math.sin(angAt(l.road, l.s) - a0)); l.group = d < 0.5 ? 0 : 1; }
    for (const l of n.legs) {
      l.cross = Math.max(0.6, ...n.legs.filter((o) => o.group !== l.group).map((o) => o.road.hw)); // half the width of what it crosses
      l.road.nodes.push({ node: n, s: l.s, group: l.group, cross: l.cross });
    }
    n.box = Math.max(...n.legs.map((l) => l.road.hw)) + 0.15;
  }
  for (const r of roads) r.nodes.sort((p, q) => p.s - q.s);

  // 4. lanes and parking spots
  const lanes = [];
  for (const r of roads) {
    const sp = r.spec;
    const mk = (dir, off, k, n) => lanes.push({ id: lanes.length, road: r, dir, off, k, n, cars: [], spawn: rng() * 4 });
    if (sp.two) {
      for (let k = 0; k < sp.lanes; k++) { mk(1, (k + 0.5) * LW, k, sp.lanes); mk(-1, (k + 0.5) * LW, k, sp.lanes); }
    } else {
      const dir = sp.forward ? 1 : -1; const left = sp.divided ? 0 : 1; // divided: median on the left, parking on the right
      for (let k = 0; k < sp.lanes; k++) mk(dir, -r.hw + (left + k + 0.5) * LW, k, sp.lanes);
    }
    r.lanes = lanes.filter((l) => l.road === r);
  }
  const parked = [];
  for (const r of roads) {
    const sp = r.spec; const sides = [];
    if (sp.two) sides.push([1, r.hw - LW / 2], [-1, r.hw - LW / 2]);
    else { sides.push([1, r.hw - LW / 2]); if (!sp.divided) sides.push([1, -r.hw + LW / 2]); }
    for (const [dir, off] of sides) {
      for (let s = 1; s < r.L - 1; s += 0.95) {
        if (rng() > 0.32) continue;
        if (r.nodes.some((n) => Math.abs(n.s - s) < n.cross + 1.5)) continue;
        const p = at(r, s); const nx = -p.ty * dir; const ny = p.tx * dir;
        const x = p.x + nx * off; const y = p.y + ny * off;
        if (x < 1 || y < 1 || x > W - 1 || y > H - 1) continue;
        const i = Math.floor(y) * W + Math.floor(x); if (!city.walk[i]) continue;
        parked.push({ x, y, ang: Math.atan2(p.ty, p.tx), color: ['#3f4760', '#5a3f45', '#435a4a', '#6e6a66', '#2e2e38', '#5e5240'][Math.floor(rng() * 6)] });
      }
    }
  }

  // 5. masks at 4 samples per cell: 1 roadway, 2 crosswalk
  const S4 = 4; const MW = W * S4; const MH = H * S4; const mask = new Uint8Array(MW * MH);
  const crosswalks = [];
  for (const r of roads) for (let s = 0; s <= r.L; s += 0.15) {
    const p = at(r, s); const rad = r.hw * S4;
    const x0 = Math.floor(p.x * S4 - rad); const x1 = Math.ceil(p.x * S4 + rad); const y0 = Math.floor(p.y * S4 - rad); const y1 = Math.ceil(p.y * S4 + rad);
    for (let y = Math.max(0, y0); y <= Math.min(MH - 1, y1); y++) for (let x = Math.max(0, x0); x <= Math.min(MW - 1, x1); x++) {
      if (Math.hypot((x + 0.5) / S4 - p.x, (y + 0.5) / S4 - p.y) <= r.hw && !mask[y * MW + x]) mask[y * MW + x] = 1;
    }
  }
  for (const n of nodes) for (const l of n.legs) for (const side of [-1, 1]) {
    const s = l.s + side * (l.cross + 0.45); if (s < 0 || s > l.road.L) continue;
    const p = at(l.road, s); const cw = { x: p.x, y: p.y, tx: p.tx, ty: p.ty, hw: l.road.hw, road: l.road, node: n, group: l.group };
    crosswalks.push(cw);
    for (let k = -l.road.hw; k <= l.road.hw; k += 0.1) for (let u = -0.32; u <= 0.32; u += 0.1) {
      const x = Math.floor((p.x - p.ty * k + p.tx * u) * S4); const y = Math.floor((p.y + p.tx * k + p.ty * u) * S4);
      if (x >= 0 && y >= 0 && x < MW && y < MH) mask[y * MW + x] = 2;
    }
  }
  const maskAt = (x, y) => { const mx = Math.floor(x * S4); const my = Math.floor(y * S4); return mx < 0 || my < 0 || mx >= MW || my >= MH ? 0 : mask[my * MW + mx]; };

  return { roads, lanes, nodes, parked, crosswalks, maskAt, LW };
}

// ---- signals ---------------------------------------------------------------------------------
// 'G', 'Y' or 'R' for a signal group of a node at time t
export function light(node, group, t) {
  const CYCLE = cycle(); const c = (((t + node.offset) % CYCLE) + CYCLE) % CYCLE; const half = CYCLE / 2;
  const local = group === 0 ? c : (c + half) % CYCLE;
  return local < SIGNAL.G ? 'G' : local < SIGNAL.G + SIGNAL.Y ? 'Y' : 'R';
}
// seconds until the walk signal across a road of `group` ends (walk = that group's cars on red)
export function walkLeft(node, group, t) {
  const CYCLE = cycle(); const c = (((t + node.offset) % CYCLE) + CYCLE) % CYCLE; const half = CYCLE / 2;
  const local = group === 0 ? c : (c + half) % CYCLE; // this group's own phase
  const redFrom = SIGNAL.G + SIGNAL.Y; // red from here to CYCLE; walk from redFrom + AR to CYCLE - AR... keep it simple
  if (local < redFrom + 0.3 || local > CYCLE - SIGNAL.AR) return 0;
  return CYCLE - SIGNAL.AR - local;
}

// ---- geometry --------------------------------------------------------------------------------
function resample(chain) {
  const pts = []; const tan = []; let L = 0; let carry = 0;
  for (let k = 0; k + 1 < chain.length; k++) {
    const [ax, ay] = chain[k]; const [bx, by] = chain[k + 1]; const d = Math.hypot(bx - ax, by - ay); if (d < 1e-6) continue;
    for (let s = carry; s < d; s += STEP) pts.push([ax + ((bx - ax) * s) / d, ay + ((by - ay) * s) / d]);
    carry = STEP - ((d - carry) % STEP || STEP); if (carry >= STEP) carry -= STEP;
    L += d;
  }
  pts.push(chain[chain.length - 1].slice());
  // smooth tangents
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 3)]; const b = pts[Math.min(pts.length - 1, i + 3)];
    const dx = b[0] - a[0]; const dy = b[1] - a[1]; const l = Math.hypot(dx, dy) || 1; tan.push([dx / l, dy / l]);
  }
  return { pts, tan, L: (pts.length - 1) * STEP };
}
export function at(r, s) {
  const f = Math.max(0, Math.min(r.pts.length - 1.001, s / STEP)); const i = Math.floor(f); const u = f - i;
  const a = r.pts[i]; const b = r.pts[i + 1]; const ta = r.tan[i]; const tb = r.tan[i + 1];
  const tx = ta[0] + (tb[0] - ta[0]) * u; const ty = ta[1] + (tb[1] - ta[1]) * u; const tl = Math.hypot(tx, ty) || 1;
  return { x: a[0] + (b[0] - a[0]) * u, y: a[1] + (b[1] - a[1]) * u, tx: tx / tl, ty: ty / tl };
}
const angAt = (r, s) => { const p = at(r, s); return Math.atan2(p.ty, p.tx); };
function sideBySide(a, b) {
  let n = 0; let close = 0;
  for (let i = 0; i < a.pts.length; i += 8) {
    const [x, y] = a.pts[i]; let best = 1e9;
    for (let j = 0; j < b.pts.length; j += 2) best = Math.min(best, Math.hypot(b.pts[j][0] - x, b.pts[j][1] - y));
    n++; if (best < 4.5) close++;
  }
  return close / n > 0.6;
}
function crossings(A, B) {
  const out = []; const ext = 6; // let ends reach a bit (T junctions)
  const P = (r, i) => (i < 0 ? [r.pts[0][0] - r.tan[0][0] * STEP * -i, r.pts[0][1] - r.tan[0][1] * STEP * -i] : i >= r.pts.length ? [r.pts[r.pts.length - 1][0] + r.tan[r.pts.length - 1][0] * STEP * (i - r.pts.length + 1), r.pts[r.pts.length - 1][1] + r.tan[r.pts.length - 1][1] * STEP * (i - r.pts.length + 1)] : r.pts[i]);
  const k = 4; // coarse step
  for (let i = -ext; i < A.pts.length + ext - k; i += k) {
    const a0 = P(A, i); const a1 = P(A, i + k);
    for (let j = -ext; j < B.pts.length + ext - k; j += k) {
      const b0 = P(B, j); const b1 = P(B, j + k);
      const d = (a1[0] - a0[0]) * (b1[1] - b0[1]) - (a1[1] - a0[1]) * (b1[0] - b0[0]); if (Math.abs(d) < 1e-9) continue;
      const u = ((b0[0] - a0[0]) * (b1[1] - b0[1]) - (b0[1] - a0[1]) * (b1[0] - b0[0])) / d;
      const v = ((b0[0] - a0[0]) * (a1[1] - a0[1]) - (b0[1] - a0[1]) * (a1[0] - a0[0])) / d;
      if (u < 0 || u > 1 || v < 0 || v > 1) continue;
      const x = a0[0] + (a1[0] - a0[0]) * u; const y = a0[1] + (a1[1] - a0[1]) * u;
      const sa = Math.max(0, Math.min(A.L, (i + k * u) * STEP)); const sb = Math.max(0, Math.min(B.L, (j + k * v) * STEP));
      if (!out.some((o) => Math.hypot(o.x - x, o.y - y) < 2)) out.push({ x, y, sa, sb });
    }
  }
  return out;
}

// ---- drawing the streets into the world image (R pixels per cell) ----------------------------
export function drawRoads(g, net, R) {
  const { roads, nodes, crosswalks, LW } = net;
  const path = (r, off = 0) => { g.beginPath(); for (let s = 0; s <= r.L; s += STEP * 2) { const p = at(r, s); const x = (p.x - p.ty * off) * R; const y = (p.y + p.tx * off) * R; s ? g.lineTo(x, y) : g.moveTo(x, y); } };
  const pathPart = (r, off, s0, s1) => { g.beginPath(); let first = true; for (let s = s0; s <= s1; s += STEP) { const p = at(r, s); const x = (p.x - p.ty * off) * R; const y = (p.y + p.tx * off) * R; first ? g.moveTo(x, y) : g.lineTo(x, y); first = false; } };
  g.lineJoin = 'round'; g.lineCap = 'butt';
  // kerbs, then asphalt
  for (const r of roads) { path(r); g.strokeStyle = '#6d6796'; g.lineWidth = (r.hw * 2 + 0.16) * R; g.stroke(); }
  for (const r of roads) { path(r); g.strokeStyle = '#1b1930'; g.lineWidth = r.hw * 2 * R; g.stroke(); }
  // parking lanes a shade lighter
  for (const r of roads) {
    const offs = r.spec.two ? [r.hw - LW / 2, -(r.hw - LW / 2)] : r.spec.divided ? [r.hw - LW / 2] : [r.hw - LW / 2, -(r.hw - LW / 2)];
    for (const o of offs) { path(r, o); g.strokeStyle = '#211f3a'; g.lineWidth = LW * R; g.stroke(); }
  }
  // markings, between intersections
  for (const r of roads) {
    const gaps = r.nodes.map((n) => [n.s - n.cross - 0.95, n.s + n.cross + 0.95]);
    const runs = []; let s0 = 0;
    for (const [a, b] of gaps) { if (a > s0) runs.push([s0, a]); s0 = Math.max(s0, b); }
    if (s0 < r.L) runs.push([s0, r.L]);
    const sp = r.spec;
    for (const [a, b] of runs) {
      if (b - a < 0.5) continue;
      if (sp.two) {
        g.strokeStyle = '#f2c230'; g.lineWidth = 1.3; g.setLineDash([]);
        for (const o of [-0.05, 0.05]) { pathPart(r, o, a, b); g.stroke(); }
        g.strokeStyle = 'rgba(255,255,255,.55)'; g.setLineDash([0.5 * R, 0.6 * R]); g.lineWidth = 1.2;
        for (let k = 1; k < sp.lanes; k++) for (const sgn of [1, -1]) { pathPart(r, sgn * k * LW, a, b); g.stroke(); }
        g.setLineDash([]); g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 1;
        for (const sgn of [1, -1]) { pathPart(r, sgn * sp.lanes * LW, a, b); g.stroke(); }
      } else {
        const left = sp.divided ? 0 : 1; const edgeL = -r.hw + left * LW; const edgeR = edgeL + sp.lanes * LW;
        g.strokeStyle = 'rgba(255,255,255,.55)'; g.setLineDash([0.5 * R, 0.6 * R]); g.lineWidth = 1.2;
        for (let k = 1; k < sp.lanes; k++) { pathPart(r, edgeL + k * LW, a, b); g.stroke(); }
        g.setLineDash([]); g.lineWidth = 1;
        g.strokeStyle = sp.divided ? '#f2c230' : 'rgba(255,255,255,.35)'; pathPart(r, edgeL, a, b); g.stroke();
        g.strokeStyle = 'rgba(255,255,255,.35)'; pathPart(r, edgeR, a, b); g.stroke();
        // direction arrows along one-way streets
        const dir = sp.forward ? 1 : -1;
        for (let s = a + 2; s < b - 2; s += 7) {
          const p = at(r, s); const o = edgeL + LW * 0.5; const x = (p.x - p.ty * o) * R; const y = (p.y + p.tx * o) * R; const an = Math.atan2(p.ty, p.tx) + (dir < 0 ? Math.PI : 0);
          g.save(); g.translate(x, y); g.rotate(an); g.fillStyle = 'rgba(255,255,255,.4)'; g.fillRect(-5, -1, 7, 2); g.beginPath(); g.moveTo(5, 0); g.lineTo(1, -3.5); g.lineTo(1, 3.5); g.closePath(); g.fill(); g.restore();
        }
      }
    }
  }
  g.setLineDash([]);
  // intersection boxes clean, then stop lines and zebra crosswalks
  for (const n of nodes) { g.fillStyle = '#1b1930'; g.beginPath(); g.arc(n.x * R, n.y * R, n.box * R, 0, TAU); g.fill(); }
  for (const r of roads) for (const n of r.nodes) for (const side of [-1, 1]) {
    const s = n.s + side * (n.cross + 0.95); if (s < 0 || s > r.L) continue;
    const p = at(r, s); const sp = r.spec;
    // stop line across the lanes that approach from this side
    let o0; let o1;
    if (sp.two) { if (side < 0) { o0 = 0; o1 = sp.lanes * LW; } else { o0 = -sp.lanes * LW; o1 = 0; } }
    else { const left = sp.divided ? 0 : 1; const fwd = sp.forward ? -1 : 1; if (side !== fwd) continue; o0 = -r.hw + left * LW; o1 = o0 + sp.lanes * LW; }
    g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = 2.4; g.beginPath();
    g.moveTo((p.x - p.ty * o0) * R, (p.y + p.tx * o0) * R); g.lineTo((p.x - p.ty * o1) * R, (p.y + p.tx * o1) * R); g.stroke();
  }
  for (const c of crosswalks) {
    g.fillStyle = 'rgba(235,235,250,.78)';
    for (let k = -c.hw + 0.08; k < c.hw - 0.05; k += 0.18) {
      const x = c.x - c.ty * k; const y = c.y + c.tx * k;
      g.save(); g.translate(x * R, y * R); g.rotate(Math.atan2(c.ty, c.tx)); g.fillRect(-0.3 * R, -0.045 * R, 0.6 * R, 0.09 * R); g.restore();
    }
  }
}

// ---- traffic ---------------------------------------------------------------------------------
const COLORS = ['#ff6f6f', '#ffd36b', '#7fd0ff', '#e7e3ff', '#a7ff8f', '#ffffff', '#f2a65a'];

export function makeTraffic(net, rng, opts) {
  const T = { cars: [], max: opts.max, truckEvery: opts.truck ? 40 : 0, truckT: opts.truckAt ?? 60, time: rng() * cycle() * 4, rng };
  return T;
}

function spawn(T, net, lane, p, truck = false) {
  const r = lane.road; const sp = r.spec;
  const vmax = CF(sp.major ? 'car_speed_avenue' : 'car_speed_street', sp.major ? 4.4 : 3.4) * (truck ? 0.7 : 0.85 + T.rng() * 0.3);
  const car = { lane, p, v: vmax * 0.8, vmax, truck, L: truck ? 1.35 : 0.95, Wd: truck ? 0.48 : 0.42, color: COLORS[Math.floor(T.rng() * COLORS.length)], x: 0, y: 0, ang: 0, honk: 0, brake: 0 };
  place(car); lane.cars.push(car); T.cars.push(car); return car;
}
function place(c) {
  const r = c.lane.road; const s = c.lane.dir > 0 ? c.p : r.L - c.p; const q = at(r, s);
  const tx = q.tx * c.lane.dir; const ty = q.ty * c.lane.dir;
  // right of travel = (-ty, tx); the lane offset is measured to the right of the road's own direction
  const off = c.lane.dir > 0 ? c.lane.off : c.lane.off; const nx = -q.ty * c.lane.dir; const ny = q.tx * c.lane.dir;
  c.x = q.x + nx * off; c.y = q.y + ny * off; c.ang = Math.atan2(ty, tx); c.tx = tx; c.ty = ty;
}

// one step: signals, queues, yielding; returns the car that hit the rat (if any)
export function stepTraffic(T, net, dt, rat, opts = {}) {
  T.time += dt;
  const { lanes } = net;
  // spawn at the start of lanes
  for (const lane of lanes) {
    lane.spawn -= dt;
    if (lane.spawn > 0) continue;
    const sp = lane.road.spec;
    lane.spawn = (sp.major ? 3.2 : 7) * (0.6 + T.rng() * 0.9) / (opts.density ?? 1);
    if (T.cars.length >= T.max) continue;
    if (lane.cars.some((c) => c.p < 2.2)) continue;
    spawn(T, net, lane, 0, false);
  }
  if (T.truckEvery && opts.allowTruck) {
    T.truckT -= dt;
    if (T.truckT <= 0 && !T.cars.some((c) => c.truck)) {
      const ls = lanes.filter((l) => !l.road.spec.major && l.k === l.n - 1 && !l.cars.some((c) => c.p < 3));
      if (ls.length) { spawn(T, net, ls[Math.floor(T.rng() * ls.length)], 0, true); T.truckT = T.truckEvery; opts.onTruck?.(); }
    }
  }
  let hit = null;
  for (const lane of lanes) {
    lane.cars.sort((a, b) => a.p - b.p);
    const r = lane.road; const dir = lane.dir;
    for (let k = 0; k < lane.cars.length; k++) {
      const c = lane.cars[k]; let limit = c.vmax;
      // the car ahead
      const lead = lane.cars[k + 1];
      if (lead) { const gap = lead.p - c.p - (lead.L + c.L) / 2 - 0.45; limit = Math.min(limit, Math.sqrt(Math.max(0, 2 * 7 * gap)), gap < 0.05 ? 0 : limit); }
      // signals ahead
      for (const n of r.nodes) {
        const pn = dir > 0 ? n.s : r.L - n.s; const stop = pn - n.cross - 1.0 - c.L / 2; const d = stop - c.p;
        if (d < -0.05 || d > 12) continue;
        const st = light(n.node, n.group, T.time);
        if (st === 'R' || (st === 'Y' && d > 1.6)) limit = Math.min(limit, Math.sqrt(Math.max(0, 2 * 6 * (d - 0.02))), d < 0.08 ? 0 : limit);
        break;
      }
      // the rat in the lane ahead: yield on a crosswalk, slow and honk elsewhere
      if (rat && !rat.hidden) {
        const rx = rat.x - c.x; const ry = rat.y - c.y; const u = rx * c.tx + ry * c.ty; const v = -rx * c.ty + ry * c.tx;
        if (u > 0 && u < 4.5 && Math.abs(v) < 0.55) {
          if (rat.onCrosswalk) limit = Math.min(limit, Math.sqrt(Math.max(0, 2 * 9 * (u - c.L / 2 - 0.5))));
          else { limit = Math.min(limit, c.vmax * 0.75); if (c.honk <= 0 && u < 3.5) { c.honk = 2.5; opts.onHonk?.(c); } }
        }
        if (Math.abs(u) < c.L / 2 + 0.12 && Math.abs(v) < c.Wd / 2 + 0.12 && c.v > 0.6) hit = c;
      }
      c.honk -= dt;
      const target = Math.max(0, limit);
      c.brake = target < c.v - 0.2 ? 1 : Math.max(0, c.brake - dt * 3);
      c.v = target < c.v ? Math.max(target, c.v - 14 * dt) : Math.min(target, c.v + 3.2 * dt);
      c.p += c.v * dt;
      place(c);
      if (c.truck) opts.onTruckAt?.(c);
    }
    // leave at the end of the street
    for (let k = lane.cars.length - 1; k >= 0; k--) if (lane.cars[k].p > lane.road.L + 1) { const c = lane.cars[k]; lane.cars.splice(k, 1); T.cars.splice(T.cars.indexOf(c), 1); }
  }
  return hit;
}

// fill the streets before play, so the night starts with traffic already moving
export function warmTraffic(T, net, seconds) { for (let t = 0; t < seconds; t += 0.1) stepTraffic(T, net, 0.1, null, {}); }

// ---- drawing signals (per frame) -------------------------------------------------------------
export function drawSignals(ctx, net, t, visible) {
  for (const n of net.nodes) {
    if (!visible(n.x, n.y)) continue;
    for (const l of n.legs) {
      const st = light(n, l.group, t); const col = st === 'G' ? '#3dff8a' : st === 'Y' ? '#ffcc33' : '#ff3b4d';
      // a signal head at the far-right corner for each approach
      for (const side of [-1, 1]) {
        const s = l.s - side * (l.cross + 0.2); if (s < 0 || s > l.road.L) continue;
        const p = at(l.road, s); const nx = -p.ty * side; const ny = p.tx * side; const o = l.road.hw + 0.3;
        const x = p.x + nx * o; const y = p.y + ny * o;
        ctx.globalCompositeOperation = 'lighter';
        const gg = ctx.createRadialGradient(x, y, 0, x, y, 0.9); gg.addColorStop(0, `${col}55`); gg.addColorStop(1, `${col}00`); ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(x, y, 0.9, 0, TAU); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = '#111018'; ctx.beginPath(); ctx.arc(x, y, 0.17, 0, TAU); ctx.fill();
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, 0.11, 0, TAU); ctx.fill();
      }
    }
  }
  // walk / don't walk at both ends of each crosswalk
  for (const c of net.crosswalks) {
    if (!visible(c.x, c.y)) continue;
    const st = light(c.node, c.group, t); const left = walkLeft(c.node, c.group, t);
    const walk = st === 'R' && left > 0; const blink = walk && left < 3 && Math.sin(t * 12) > 0;
    for (const e of [-1, 1]) {
      const o = (c.hw + 0.22) * e; const x = c.x - c.ty * o; const y = c.y + c.tx * o;
      ctx.fillStyle = 'rgba(10,8,20,.85)'; ctx.fillRect(x - 0.16, y - 0.16, 0.32, 0.32);
      ctx.fillStyle = walk && !blink ? '#f4f7ff' : '#ff8a2a';
      if (walk && !blink) { // little walking figure
        ctx.beginPath(); ctx.arc(x, y - 0.08, 0.035, 0, TAU); ctx.fill();
        ctx.fillRect(x - 0.02, y - 0.05, 0.04, 0.1); ctx.save(); ctx.translate(x, y + 0.05); ctx.rotate(0.4); ctx.fillRect(-0.015, 0, 0.03, 0.08); ctx.rotate(-0.8); ctx.fillRect(-0.015, 0, 0.03, 0.08); ctx.restore();
      } else { ctx.beginPath(); ctx.arc(x, y, 0.08, 0, TAU); ctx.fill(); ctx.fillRect(x - 0.08, y - 0.12, 0.16, 0.08); }
    }
  }
}

// what the rat should know about the crossing it stands at
export function crossingAt(net, x, y, t) {
  let best = null; let bd = 1.4;
  for (const c of net.crosswalks) { const d = Math.hypot(c.x - x, c.y - y); if (d < bd + c.hw) { const u = Math.abs((x - c.x) * c.tx + (y - c.y) * c.ty); const v = Math.abs(-(x - c.x) * c.ty + (y - c.y) * c.tx); if (u < 1.3 && v < c.hw + 0.9) { best = c; bd = d - c.hw; } } }
  if (!best) return null;
  const st = light(best.node, best.group, t); const left = walkLeft(best.node, best.group, t);
  return { walk: st === 'R' && left > 0, left, road: best.road.name };
}
