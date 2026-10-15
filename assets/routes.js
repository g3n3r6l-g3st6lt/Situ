/*
  routes.js  -  the rules the Lab's route tool applies to the tables s1_streets/routes.py wrote.

  It is the JavaScript twin of route(), first_steps() and corridor() in s1_streets/routes.py, line for line.
  tools/test_lab.py (L5) runs both on the same pairs and checks they give the same segments.

    route(R, mode, o, t)            the shortest route: segment indexes from junction o to t, or null
    corridor(R, mode, o, t, slack)  every segment a trip at most slack % longer than the shortest can pass through

  R = window.SITU_S1_ROUTES; o and t are positions in R.junctions.
*/
(function (root) {
  function route(R, mode, o, t) {
    const via = R[mode].via[o];
    if (via[t] == null && o !== t) return null;
    const path = [];
    let here = t;
    while (here !== o) {
      const i = via[here], [a, b] = R.ends[i];
      path.push(i);
      here = b === here ? a : b;
    }
    return path.reverse();
  }

  function firstSteps(R, mode, t) {
    return R.junctions.map((_, v) => {
      const p = v !== t ? route(R, mode, v, t) : null;
      return p && p.length ? p[0] : null;
    });
  }

  function corridor(R, mode, o, t, slack) {
    const dist = R[mode].dist, via = R[mode].via, total = dist[o][t];
    if (total == null) return [];
    const first = firstSteps(R, mode, t), keep = new Set();
    for (const [u, v, i] of R[mode].arcs) {
      const du = dist[o][u], vt = dist[v][t];
      if (du == null || vt == null) continue;
      if (via[o][u] !== i && first[v] !== i && 100 * (du + R.length[i] + vt) <= (100 + slack) * total) keep.add(i);
    }
    return [...keep].sort((a, b) => a - b);
  }

  const SituRoutes = { route, corridor };
  if (typeof module !== "undefined" && module.exports) module.exports = SituRoutes;
  else root.SituRoutes = SituRoutes;
})(this);
