/*
  walk.js  -  the Lab's walk tools, apart from the page so they can be tested on their own (tools/test_lab.py, L12).

  Everything is in the Lab's turned metres. Nothing here reads counts or space syntax.

    graph(S1)                      the walkable S1 streets as a graph
    snap(G, p)                     the nearest point on a walkable street: {seg, along, xy}
    between(G, a, b)               the shortest walk between two snapped points: {length, pts}
    from(G, a)                     metres from a snapped point to every junction: {dist, a}
    timeAlong(G, D, i, x)          metres from that point to x metres along segment i
    outlines(packed)               building edges for sight lines, from outputs/s8/outlines_data.js
    cast(E, p, rays, radius, turn) how far each sight line goes before it meets an edge (S8's rule)
    polygon(p, r)                  the visible shape, as points
    area(r)                        its area, in m2, by the fan from the viewpoint (S8's formula)
    inside(poly, p)                is a point inside the shape?
*/
(function (root) {
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

  function graph(S1) {
    const segs = S1.segments.filter(s => s.walk);
    const adj = new Map(), cum = [];
    segs.forEach((s, i) => {
      const c = [0];
      for (let k = 1; k < s.pts.length; k++) c.push(c[k - 1] + dist(s.pts[k - 1], s.pts[k]));
      cum.push(c);
      for (const [u, v] of [[s.from, s.to], [s.to, s.from]]) {
        if (!adj.has(u)) adj.set(u, []);
        adj.get(u).push([v, i]);
      }
    });
    return { segs, adj, cum, len: cum.map(c => c[c.length - 1]) };
  }

  function snap(G, p) {
    let best = null;
    G.segs.forEach((s, i) => {
      for (let k = 1; k < s.pts.length; k++) {
        const a = s.pts[k - 1], b = s.pts[k], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
        const t = L2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2)) : 0;
        const q = [a[0] + t * dx, a[1] + t * dy], d = dist(p, q);
        if (!best || d < best.d) best = { seg: i, along: G.cum[i][k - 1] + t * Math.sqrt(L2), xy: q, d };
      }
    });
    return best;
  }

  // a small binary heap keeps the search quick
  function heap() {
    const h = [];
    return {
      size: () => h.length,
      push(x) { h.push(x); let i = h.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (h[p][0] <= h[i][0]) break; [h[p], h[i]] = [h[i], h[p]]; i = p; } },
      pop() { const top = h[0], last = h.pop(); if (h.length) { h[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < h.length && h[l][0] < h[m][0]) m = l; if (r < h.length && h[r][0] < h[m][0]) m = r; if (m === i) break; [h[m], h[i]] = [h[i], h[m]]; i = m; } } return top; },
    };
  }

  function from(G, a) {
    const s = G.segs[a.seg], D = new Map(), via = new Map(), H = heap();
    for (const [j, d] of [[s.from, a.along], [s.to, G.len[a.seg] - a.along]]) {
      if (!D.has(j) || d < D.get(j)) { D.set(j, d); via.set(j, null); H.push([d, j]); }
    }
    while (H.size()) {
      const [d, u] = H.pop();
      if (d > D.get(u) + 1e-9) continue;
      for (const [v, i] of G.adj.get(u) || []) {
        const nd = d + G.len[i];
        if (!D.has(v) || nd < D.get(v) - 1e-9) { D.set(v, nd); via.set(v, [u, i]); H.push([nd, v]); }
      }
    }
    return { dist: D, via, a };
  }

  // metres from the start to the point x metres along segment i (from its 'from' end)
  function timeAlong(G, R, i, x) {
    const s = G.segs[i], a = R.a;
    let best = Math.min((R.dist.get(s.from) ?? Infinity) + x, (R.dist.get(s.to) ?? Infinity) + G.len[i] - x);
    if (a.seg === i) best = Math.min(best, Math.abs(a.along - x));
    return best;
  }

  // the points of segment i between two distances along it, in that order
  function piece(G, i, x0, x1) {
    const s = G.segs[i], c = G.cum[i], pts = [], lo = Math.min(x0, x1), hi = Math.max(x0, x1);
    const at = x => { let k = 1; while (k < c.length - 1 && c[k] < x) k++; const t = (x - c[k - 1]) / ((c[k] - c[k - 1]) || 1);
      return [s.pts[k - 1][0] + t * (s.pts[k][0] - s.pts[k - 1][0]), s.pts[k - 1][1] + t * (s.pts[k][1] - s.pts[k - 1][1])]; };
    pts.push(at(lo));
    for (let k = 1; k < c.length - 1; k++) if (c[k] > lo && c[k] < hi) pts.push(s.pts[k]);
    pts.push(at(hi));
    return x0 <= x1 ? pts : pts.reverse();
  }

  function between(G, a, b) {
    if (a.seg === b.seg) {
      const direct = Math.abs(a.along - b.along);
      const R = from(G, a), other = timeAlong(G, R, b.seg, b.along);
      if (direct <= other + 1e-9) return { length: direct, pts: piece(G, a.seg, a.along, b.along) };
    }
    const R = from(G, a), s = G.segs[b.seg];
    const ends = [[s.from, b.along], [s.to, G.len[b.seg] - b.along]].map(([j, d]) => [j, (R.dist.get(j) ?? Infinity) + d]);
    const [j, total] = ends[0][1] <= ends[1][1] ? ends[0] : ends[1];
    if (!isFinite(total)) return null;
    const chain = [];
    let u = j;
    while (R.via.get(u)) { const [p, i] = R.via.get(u); chain.push([i, p, u]); u = p; }
    chain.reverse();
    const sa = G.segs[a.seg], pts = [];
    pts.push(...piece(G, a.seg, a.along, u === sa.from ? 0 : G.len[a.seg]));
    for (const [i, p] of chain) {
      const si = G.segs[i];
      pts.push(...piece(G, i, p === si.from ? 0 : G.len[i], p === si.from ? G.len[i] : 0).slice(1));
    }
    pts.push(...piece(G, b.seg, j === s.from ? 0 : G.len[b.seg], b.along).slice(1));
    return { length: total, pts };
  }

  // ---------------------------------------------------------------- sight lines
  function outlines(packed) {
    const e = [];
    for (const r of packed.rings) {
      let x = r[0] * packed.unit_m, y = r[1] * packed.unit_m;
      for (let k = 2; k < r.length; k += 2) {
        const nx = x + r[k] * packed.unit_m, ny = y + r[k + 1] * packed.unit_m;
        e.push(x, y, nx, ny);
        x = nx; y = ny;
      }
    }
    const E = new Float64Array(e), cell = 50, grid = new Map();
    for (let i = 0; i < E.length; i += 4) {
      const x0 = Math.floor(Math.min(E[i], E[i + 2]) / cell), x1 = Math.floor(Math.max(E[i], E[i + 2]) / cell);
      const y0 = Math.floor(Math.min(E[i + 1], E[i + 3]) / cell), y1 = Math.floor(Math.max(E[i + 1], E[i + 3]) / cell);
      for (let gx = x0; gx <= x1; gx++) for (let gy = y0; gy <= y1; gy++) {
        const k = gx + ":" + gy;
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(i);
      }
    }
    return { E, grid, cell };
  }

  const EDGE_EPS = 1e-9;                         // as S8: a sight line through a corner stops there
  function cast(O, p, rays, radius, turn) {           // turn: angle of the first sight line, in radians (S8's lines start due east before turning)
    const { E, grid, cell } = O, seen = new Set(), near = [];
    const gx0 = Math.floor((p[0] - radius) / cell), gx1 = Math.floor((p[0] + radius) / cell);
    const gy0 = Math.floor((p[1] - radius) / cell), gy1 = Math.floor((p[1] + radius) / cell);
    for (let gx = gx0; gx <= gx1; gx++) for (let gy = gy0; gy <= gy1; gy++)
      for (const i of grid.get(gx + ":" + gy) || []) if (!seen.has(i)) { seen.add(i); near.push(i); }
    const r = new Float64Array(rays);
    for (let k = 0; k < rays; k++) {
      const a = (turn || 0) + 2 * Math.PI * k / rays, dx = Math.cos(a), dy = Math.sin(a);
      let best = radius;
      for (const i of near) {
        const sx = E[i + 2] - E[i], sy = E[i + 3] - E[i + 1], den = dx * sy - dy * sx;
        if (den === 0) continue;
        const qx = E[i] - p[0], qy = E[i + 1] - p[1];
        const t = (qx * sy - qy * sx) / den, u = (qx * dy - qy * dx) / den;
        if (t > 1e-6 && u >= -EDGE_EPS && u <= 1 + EDGE_EPS && t < best) best = t;
      }
      r[k] = best;
    }
    return r;
  }
  const polygon = (p, r, turn) => Array.from(r, (v, k) => { const a = (turn || 0) + 2 * Math.PI * k / r.length; return [p[0] + v * Math.cos(a), p[1] + v * Math.sin(a)]; });
  function area(r) {
    let s = 0;
    for (let k = 0; k < r.length; k++) s += r[k] * r[(k + 1) % r.length];
    return 0.5 * Math.sin(2 * Math.PI / r.length) * s;
  }
  function inside(poly, p) {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > p[1]) !== (yj > p[1]) && p[0] < xi + (p[1] - yi) * (xj - xi) / (yj - yi)) c = !c;
    }
    return c;
  }

  const api = { graph, snap, from, timeAlong, piece, between, outlines, cast, polygon, area, inside };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.SituWalk = api;
})(this);
