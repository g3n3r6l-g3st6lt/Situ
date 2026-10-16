/*
  lab.js  -  the Situ Lab: one map, one system at a time, tried and tested.

  It reads the files the systems' web.py scripts wrote:
    window.SITU_S1   outputs/s1/web_data.js   streets, junctions, reach from every junction
    window.SITU_S2   outputs/s2/web_data.js   space syntax values per segment
    window.SITU_S3   outputs/s3/web_data.js   rules, signs, lights, speed
    window.SITU_S4   outputs/s4/web_data.js   buildings, their uses and sources, places
    window.SITU_S5   outputs/s5/web_data.js   counts by hour at counted junctions, each place's week
    window.SITU_S6   outputs/s6/web_data.js   trees, hydrants, furniture, lights, cameras, crossings, road works, sidewalks and islands
    window.SITU_S1_ROUTES  outputs/s1/routes_data.js  shortest distances and routes between every pair of junctions

  It computes nothing about the city. Every colour and every value shows what the Python code already
  produced, and tools/test_lab.py checks that these files match the tables. One exception, kept small:
  the route tool applies the rules in assets/routes.js to the distances routes.py wrote (test L5).

  The page: six tabs, one per system. Each tab paints the map its own way, has at most two controls,
  lists its checkpoints with the reason each one matters, and shows its tests. Clicking a street,
  a junction, a sign or a building opens its details in every tab.

  Structure
    1 data and indexes      4 overlays             7 the side: tabs, controls, checkpoints, tests
    2 the page              5 tools: reach, route  8 selection and start-up
    3 painting              6 the detail panel
*/
(function () {
  const S1 = window.SITU_S1, S2 = window.SITU_S2, S3 = window.SITU_S3, S4 = window.SITU_S4, S5 = window.SITU_S5, S6 = window.SITU_S6, RT = window.SITU_S1_ROUTES, SR = window.SituRoutes;
  const host = document.getElementById("situ-lab");
  if (!host || !S1 || !window.SituMap) return;

  // ================================================================ 1 data and indexes
  const seg = {}, jun = {};
  S1.segments.forEach(s => seg[s.id] = s);
  S1.junctions.forEach(j => jun[j.id] = j);
  const jpos = {};
  if (RT) RT.junctions.forEach((j, k) => jpos[j] = k);

  const r3 = { jun: {}, appsAt: {}, app: {}, exit: {}, movFrom: {}, panel: {}, lightsAt: {}, speed: {} };
  if (S3) {
    S3.junctions.forEach(j => r3.jun[j.id] = j);
    S3.approaches.forEach(a => { (r3.appsAt[a.junction] = r3.appsAt[a.junction] || []).push(a); r3.app[a.segment + "@" + a.junction] = a; });
    S3.exits.forEach(e => r3.exit[e.segment + "@" + e.junction] = e);
    S3.movements.forEach(m => (r3.movFrom[m.from + "@" + m.junction] = r3.movFrom[m.from + "@" + m.junction] || []).push(m));
    S3.signs.forEach(s => r3.panel[s.panel] = s);
    S3.lights.forEach(l => { if (l.junction) (r3.lightsAt[l.junction] = r3.lightsAt[l.junction] || []).push(l); });
    S3.segments.forEach(s => r3.speed[s.id] = s);
  }
  const b4 = {}, place4 = {}, placesIn = {};
  if (S4) {
    S4.buildings.forEach(b => b4[b.id] = b);
    S4.places.forEach(p => { place4[p.id] = p; if (p.building) (placesIn[p.building] = placesIn[p.building] || []).push(p); });
  }

  const o6 = {}, s6 = {};
  if (S6) { S6.objects.forEach(o => o6[o.id] = o); S6.surfaces.forEach(s => s6[s.id] = s); }
  const FURN6 = ["bench", "waste basket", "bicycle parking", "picnic table", "drinking water", "shelter", "fountain"];
  const S6_SEEN = S6 && S6.meta.seen_since || "";
  const PHOTO6 = { lights: "street light", cameras: "surveillance camera", crossings: "crossing" };
  const SLUG6 = { "street light": "light", "surveillance camera": "camera", crossing: "crossing" };
  const DAY5 = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
  const MODE5 = { pedestrian: "people crossing", bicycle: "bicycles", vehicle: "cars, buses and trucks" };
  const max5 = {};
  if (S5) Object.keys(MODE5).forEach(m => max5[m] = Math.max(1, ...Object.values(S5.junctions).flatMap(j => j[m].filter(x => x != null))));

  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const short = n => n.replace(/^(Rue|Boulevard|Avenue|Place|Allée|Autoroute) (de la |de l'|des |du |de )?/, "");
  const add = (a, b, k) => [a[0] + b[0] * k, a[1] + b[1] * k];
  const car = s => s.car_ft || s.car_tf;
  const fmt = x => x == null ? "none" : Math.abs(x) >= 10 ? x.toFixed(1) : x.toFixed(3);
  const TURN_WORD = { S: "straight on", L: "left", R: "right" };
  const CONTROL = { lights: "traffic lights", all_way_stop: "all-way stop", stop: "stop on some streets", none: "no stop, no lights" };

  // Why each kind of checkpoint matters, in one or two sentences. The list on the side groups them by kind.
  const WHY = {
    "dead end": "The city's map ends this street here. If people or cars can in fact go on, every route and every reach through this corner is wrong.",
    "missing link": "OpenStreetMap shows a path here that the city's network lacks. A missing path changes who can reach what on foot.",
    "crossing": "Two streets cross on the map. If one passes over the other, they must not meet at a junction.",
    "rule": "The city's road class leaves it unclear who may use this street. The answer decides whether cars can drive through.",
    "sign without a street": "A turn sign stands here, but it fits none of the streets arriving nearby. It may face a street beyond my area, or its position may be off.",
    "photo decision open": "Street photos could not settle which way this sign faces. Until someone looks on site, the rule here rests on the desk alone.",
    "light without a junction": "A traffic light stands just beyond the edge of my network, so no junction can carry it yet.",
    "no entry at an added path": "A no-entry sign stands where only a path I added myself fits. It may mean the path is closed to the public.",
    "car street without a speed": "Cars may drive here, but the city's speed file gives no limit. A simulated driver would have no rule to follow.",
    "use unknown": "No source says what this building is used for. It stays unknown: later systems will not guess.",
    "tie": "Two uses have the same number of properties here. That often means two buildings share one outline, or an address point stands in the wrong building.",
    "far from a street": "The nearest street people may walk on is far away, so the link that stands in for the door is weak.",
    "storeys too low?": "The storeys the sources give cannot hold the dwellings the tax roll counts here. The outline probably carries only its podium's storeys.",
    "lot and address disagree": "The city's lot outline and its address point name different buildings. When the lot holds one building, the lot decides; when it holds several and the address point stands in another, the address point decides. Either way it is a choice, so it is asked.",
    "hours to read": "These opening hours can be read two ways, or leave a time open. S5 follows the tag's own grammar and keeps what it cannot settle unknown; a person should read the text.",
    "work already over": "The city still lists this road work although its permit has ended. It may have been extended, or the list may lag behind the street.",
    "very wide sidewalk": "This sidewalk piece is much wider on average than the others. It may be a plaza or forecourt, or one drawing that joins several pieces.",
    "missing outline?": "Hundreds of properties sit at one address point with no building drawn. OpenStreetMap may not have this building yet."
  };

  // ================================================================ 2 the page
  const RADII = { ped: ["200", "400", "800", "n"], veh: ["1200", "2000"] };
  const RADIUS_NAME = r => r === "n" ? "whole island" : r + " m";
  const TABS = [
    { id: "s1", name: "Streets", ok: true },
    { id: "s2", name: "Scores", ok: !!S2 },
    { id: "s3", name: "Rules", ok: !!S3 },
    { id: "s4", name: "Buildings", ok: !!S4 },
    { id: "s5", name: "Rhythm", ok: !!S5 && !!S4 },
    { id: "s6", name: "Streetscape", ok: !!S6 },
  ];
  const state = {
    tab: "s1",
    s1try: "details", s1mode: "walk", reachStart: null, reachStep: 0, routeA: null, routeB: null, routeSlack: 2,
    s2net: "ped", s2measure: "NACH", s2radius: 2,
    s3view: "rules",
    s4colour: "use", s4places: false,
    s5day: "1", s5hour: 17, s5mode: "pedestrian", s5season: "summer",
    s6show: "all", s6colour: "material",
    pick: null,                      // {kind: "junction"|"segment"|"building"|"place"|"check", id}
    approach: null,
  };

  host.innerHTML = `
  <div class="lab-tabs" role="tablist" aria-label="Systems">${TABS.map(t =>
    `<button type="button" role="tab" data-tab="${t.id}"${t.ok ? "" : " disabled"}><span>${t.id.toUpperCase()}</span>${t.name}</button>`).join("")}</div>
  <div class="lab-main">
    <div class="lab-map"></div>
    <aside class="sx-panel lab-panel" hidden></aside>
    <div class="lab-key"></div>
  </div>
  <div class="lab-side"></div>`;

  const $ = q => host.querySelector(q);
  const side = $(".lab-panel"), key = $(".lab-key"), info = $(".lab-side");
  const narrow = () => window.matchMedia("(max-width: 900px)").matches;
  const map = new SituMap($(".lab-map"), S1.segments.flatMap(s => s.pts));
  map.cover = () => side.hidden || narrow() ? 0 : side.offsetWidth + 16;

  // ================================================================ 3 painting
  const USE_CLASS = u => u ? "u-" + u.replace(/ /g, "-") : "u-unknown";
  const bLayer = map.layer("buildings");             // made first, so the streets lie on top
  const bEl = {};
  if (S4) S4.buildings.forEach(b => {
    const e = map.path(bLayer, "M" + b.ring.map(p => map.P(p).join(",")).join("L") + "Z", { class: "lab-bld" });
    e.addEventListener("pointermove", ev => map.tip(ev, `${esc(b.name || b.id)}<br><span>${esc(b.use || "use unknown")}${b.dwellings ? " · " + b.dwellings + " dwellings" : ""}</span>`));
    e.addEventListener("pointerleave", () => map.untip());
    e.addEventListener("click", () => { if (!map.wasDrag()) select({ kind: "building", id: b.id }); });
    bEl[b.id] = e;
  });

  const sLayer = map.layer("surfaces");            // sidewalks and islands, under the streets
  const sfEl = {};
  if (S6) S6.surfaces.forEach(s => {
    const e = map.path(sLayer, "M" + s.ring.map(p => map.P(p).join(",")).join("L") + "Z", { class: "lab-surf6" });
    e.addEventListener("pointermove", ev => map.tip(ev, `${s.kind} ${s.id}<br><span>${esc(s.material || "material not given")}${s.built ? " · built " + s.built : ""}${s.width != null ? " · about " + s.width.toFixed(1) + " m wide" : ""}</span>`));
    e.addEventListener("pointerleave", () => map.untip());
    e.addEventListener("click", () => { if (!map.wasDrag()) select({ kind: "surf6", id: s.id }); });
    sfEl[s.id] = e;
  });

  const streets = map.layer("streets");
  const segEl = {};
  S1.segments.forEach(s => {
    segEl[s.id] = map.line(streets, s.pts, { class: "lab-street" });
    const hit = map.line(streets, s.pts, { class: "sx-hit" });
    hit.addEventListener("pointermove", ev => map.tip(ev, esc(s.street) + ` <span>${s.id}</span>` + tipValue(s)));
    hit.addEventListener("pointerleave", () => map.untip());
    hit.addEventListener("click", () => { if (!map.wasDrag()) select({ kind: "segment", id: s.id }); });
  });

  function s2col() { return `${state.s2net}_${state.s2measure}_${RADII[state.s2net][state.s2radius]}`; }

  // rank colouring, as on the S2 sheets: values bunch up, ranks spread them evenly
  function ranks(col) {
    const vals = S1.segments.map(s => S2.scores[s.id] && S2.scores[s.id][col]).filter(v => v != null).sort((a, b) => a - b);
    const rank = v => { let lo = 0, hi = vals.length; while (lo < hi) { const m = (lo + hi) >> 1; vals[m] < v ? lo = m + 1 : hi = m; } return lo / Math.max(1, vals.length - 1); };
    return { rank, vals };
  }
  function ramp(t) {                         // dark grey to white to pink
    const stops = [[60, 60, 60], [235, 235, 235], [254, 131, 204]];
    const k = t < 0.5 ? 0 : 1, u = t < 0.5 ? t / 0.5 : (t - 0.5) / 0.5;
    const c = stops[k].map((x, i) => Math.round(x + (stops[k + 1][i] - x) * u));
    return `rgb(${c.join(",")})`;
  }

  function tipValue(s) {
    if (state.tab === "s2" && S2) { const v = S2.scores[s.id] && S2.scores[s.id][s2col()]; return `<br><span>${esc(s2col())}: ${fmt(v)}</span>`; }
    if (state.tab === "s3" && state.s3view === "speed") { const r = r3.speed[s.id]; return `<br><span>${r && r.speed ? r.speed + " km/h" : "no limit"}</span>`; }
    return "";
  }

  function paint() {
    const col = state.tab === "s2" ? s2col() : null, rk = col ? ranks(col) : null;
    const reach = reachSteps(), rt = routeNow();
    S1.segments.forEach((s, i) => {
      const e = segEl[s.id];
      let cls = "lab-street", style = "";
      if (state.tab === "s1") {
        cls += !car(s) ? " walk" : !s.walk ? " drive" : " both";
        if (s.source !== "geobase") cls += " added";
        if (reach) cls += reach[i] && reach[i] <= state.reachStep ? " reached" : " unreached";     // the reach replaces the paint
        if (rt) cls += rt.path.has(i) ? " route" : rt.wide.has(i) ? " corridor" : " unreached";      // so does a route
      }
      if (state.tab === "s2") {
        const v = S2.scores[s.id] && S2.scores[s.id][col];
        if (v == null) cls += " novalue";
        else { const t = rk.rank(v); style = `stroke:${ramp(t)};stroke-width:${(1.2 + 2.6 * t).toFixed(2)}px`; }
      }
      if (state.tab === "s3") {
        if (state.s3view === "speed") {
          const r = r3.speed[s.id];
          cls += r && r.speed ? " v" + r.speed + (r.speed_status === "by_shape" ? " shaped" : "") : car(s) ? " v-gap" : " v-none";
        } else cls += " plain";
      }
      if (state.tab === "s4" || state.tab === "s5" || state.tab === "s6") cls += " plain faint";
      if (state.pick && state.pick.kind === "segment" && state.pick.id === s.id) cls += " picked";
      if (state.approach === s.id) cls += " picked";
      e.setAttribute("class", cls);
      e.setAttribute("style", style);
    });
    paintBuildings();
    paintSurfaces();
    drawKey(rk);
  }

  function paintBuildings() {
    const on = state.tab === "s4" && S4;
    bLayer.style.display = on ? "" : "none";
    if (!on) return;
    S4.buildings.forEach(b => {
      let cls = "lab-bld " + (state.s4colour === "use" ? USE_CLASS(b.use) : "src-" + (b.use_source || "none"));
      if (state.pick && state.pick.kind === "building" && state.pick.id === b.id) cls += " picked";
      bEl[b.id].setAttribute("class", cls);
    });
  }

  function paintSurfaces() {
    const on = state.tab === "s6" && S6;
    sLayer.style.display = on ? "" : "none";
    if (!on) return;
    const band = s => state.s6colour === "material" ? "m-" + (s.material || "none").toLowerCase().replace(/[^a-z]+/g, "-")
      : !s.built ? "b-none" : s.built >= "2020" ? "b-new" : s.built >= "2010" ? "b-mid" : "b-old";
    S6.surfaces.forEach(s => sfEl[s.id].setAttribute("class", "lab-surf6 " + band(s) + (s.kind === "island" ? " island" : "") +
      (state.pick && state.pick.kind === "surf6" && state.pick.id === s.id ? " picked" : "")));
  }

  function drawKey(rk) {
    let html = "";
    if (state.tab === "s1") {
      if (state.s1try === "reach" && reachSteps()) html = `<span><i class="k both"></i>reached by this step</span><span><i class="k faint"></i>not yet</span>`;
      else if (state.s1try === "route" && routeNow()) html = `<span><i class="k route"></i>shortest route</span><span><i class="k corridor"></i>a trip at most ${RT.meta.slacks[state.routeSlack]} % longer can pass here</span>`;
      else html = `<span><i class="k both"></i>walk and drive</span><span><i class="k walk"></i>walk only</span><span><i class="k drive"></i>drive only</span><span><i class="k added"></i>path I added</span><span><i class="kd gate"></i>gate</span><span><i class="kd dead"></i>dead end</span>`;
    }
    if (state.tab === "s2" && rk) {
      const q = p => rk.vals[Math.min(rk.vals.length - 1, Math.round(p * (rk.vals.length - 1)))];
      html = `<span class="lab-ramp"><em>${fmt(q(0))}</em><i></i><em>${fmt(q(0.5))}</em><i></i><em>${fmt(q(1))}</em></span>
        <span>lowest grey, highest pink</span><span><i class="k novalue"></i>no value</span>`;
    }
    if (state.tab === "s3") html = state.s3view === "speed"
      ? `<span><i class="k v40"></i>40 km/h</span><span><i class="k v30"></i>30</span><span><i class="k v20"></i>20</span><span><i class="k gap"></i>cars allowed, no limit</span>`
      : `<span><i class="kd lights"></i>traffic lights</span><span><i class="kd allway"></i>all-way stop</span><span><i class="kb2"></i>a street that must stop</span>`;
    if (state.tab === "s4" && S4) {
      const n = f => S4.buildings.filter(f).length;
      html = state.s4colour === "use"
        ? ["residential", "commerce", "services", "industry"].map(u => `<span><i class="kb ${USE_CLASS(u)}"></i>${u} ${n(b => b.use === u)}</span>`).join("") +
          `<span><i class="kb u-minor-structure"></i>other ${n(b => b.use && !["residential", "commerce", "services", "industry"].includes(b.use))}</span>` +
          `<span><i class="kb u-unknown"></i>unknown ${n(b => !b.use)}</span>`
        : `<span><i class="kb src-roll"></i>from the tax roll ${n(b => b.use_source === "roll")}</span><span><i class="kb src-osm_tag"></i>from OpenStreetMap ${n(b => b.use_source === "osm_tag")}</span><span><i class="kb src-none"></i>no source ${n(b => !b.use_source)}</span>`;
      if (state.s4places) html += `<span><i class="kp"></i>place</span><span><i class="kp hours"></i>with opening hours</span>`;
    }
    if (state.tab === "s5" && S5) html = `<span><i class="kp5 o"></i>open</span><span><i class="kp5 c"></i>closed</span><span><i class="kp5 u"></i>no hours given</span>` +
      (state.s5mode === "bicycle" && S5.bikes ? `<span><i class="kb5"></i>bicycle detector, sized by this hour</span>` : "") +
      `<span><i class="kj5"></i>counted junction, sized by this hour's count</span><span><i class="kj5 none"></i>not counted at this hour</span>`;
    if (state.tab === "s6" && S6) html = (state.s6colour === "material"
        ? `<span><i class="kb6 m-b-ton"></i>concrete</span><span><i class="kb6 m-asphalte"></i>asphalt</span><span><i class="kb6 m-pav-"></i>pavers</span>`
        : `<span><i class="kb6 b-new"></i>built since 2020</span><span><i class="kb6 b-mid"></i>2010s</span><span><i class="kb6 b-old"></i>before 2010</span><span><i class="kb6 b-none"></i>no date</span>`) +
      `<span><i class="kt6"></i>tree, sized by trunk</span><span><i class="kh6"></i>hydrant</span><span><i class="kf6"></i>furniture</span><span><i class="kw6"></i>road work</span>` +
      `<span><i class="km6"></i>light, camera, crossing found in photos</span><span><i class="ko6"></i>the same in OpenStreetMap</span>`;
    key.innerHTML = html + `<span class="lab-check-key"><i class="kc"></i>checkpoint</span>`;
  }

  // ================================================================ 4 overlays
  map.onRedraw(draw);
  function draw() {
    map.boxes = [];
    for (const n of ["marks", "focus", "labels"]) map.clear(n);
    const marks = map.layer("marks"), focus = map.layer("focus"), labels = map.layer("labels");
    if (state.tab === "s1") {
      if (state.s1mode === "drive" && state.s1try !== "details") onewayArrows(marks);
      S1.junctions.forEach(j => {
        if (j.kind === "gate") map.square(marks, j.xy, 7, { class: "lab-gate" });
        if (j.kind === "dead_end") map.dot(marks, j.xy, 5, { class: "lab-dead " + (j.status === "confirmed" ? "ok" : "open") });
      });
      if (state.s1try === "reach" && state.reachStart) map.dot(marks, jun[state.reachStart].xy, 7, { class: "lab-start" });
      if (state.s1try === "route") routeMarks(marks, labels);
    }
    if (state.tab === "s3" && S3 && state.s3view === "rules") s3Control(marks);
    if (state.tab === "s4" && S4 && state.s4places) placeMarks(marks);
    if (state.tab === "s5" && S5) s5Marks(marks, labels);
    if (state.tab === "s6" && S6) s6Marks(marks);
    const checks = checksOf(state.tab);
    if (checks.length) checkMarks(marks, labels, checks);
    junctionHits(marks);
    if (state.pick && state.pick.kind === "junction" && S3) junctionFocus(focus, labels);
  }

  function onewayArrows(g) {
    S1.segments.forEach(s => {
      if (s.car_ft === s.car_tf) return;
      const pts = s.car_ft ? s.pts : s.pts.slice().reverse();
      const a = pts[0], b = pts[pts.length - 1], m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], n = [-u[1], u[0]], h = map.px(6);
      map.line(g, [add(add(m, u, -h), n, h * 0.7), add(m, u, h), add(add(m, u, -h), n, -h * 0.7)], { class: "lab-arrow" });
    });
  }

  function s3Control(g) {
    S3.approaches.forEach(a => {
      if (!a.stop) return;
      const j = r3.jun[a.junction].xy, h = a.heading, p = add(j, h, -7), n = [-h[1], h[0]];
      map.line(g, [add(p, n, 6), add(p, n, -6)], { class: "sx-stopbar" });
    });
    S3.junctions.forEach(j => {
      const r = { lights: 6, all_way_stop: 6, stop: 0, none: 0 }[j.control];
      if (r) { map.dot(g, j.xy, r, { class: "sx-j " + j.control }); map.reserve(j.xy, r + 2); }
    });
  }

  function junctionHits(g) {
    S1.junctions.forEach(j => {
      const hit = map.dot(g, j.xy, 10, { class: "sx-jhit", "data-junction": j.id });
      hit.addEventListener("pointermove", ev => map.tip(ev, `${j.id}${S3 && r3.jun[j.id] ? " · " + esc(CONTROL[r3.jun[j.id].control]) : ""}<br><span>${esc((r3.jun[j.id] ? r3.jun[j.id].streets : []).map(short).join(" × "))}</span>`));
      hit.addEventListener("pointerleave", () => map.untip());
      hit.addEventListener("click", () => { if (!map.wasDrag()) clickJunction(j.id); });
    });
    if (state.pick && state.pick.kind === "junction") map.dot(g, jun[state.pick.id].xy, 7, { class: "lab-picked-j" });
  }

  // checkpoints of one system, with their system name kept in the pick
  function checksOf(tab) {
    const src = { s1: S1, s3: S3, s4: S4, s5: S5, s6: S6 }[tab];
    return src && src.checkpoints ? src.checkpoints : [];
  }
  const settled = c => c.status === "confirmed";            // S1 checkpoints carry what the photos and checks decided
  function checkMarks(g, labels, list) {
    list.forEach(c => {
      const picked = state.pick && state.pick.kind === "check" && state.pick.id === c.id;
      map.dot(g, c.xy, picked ? 11 : settled(c) ? 5 : 8, { class: "sx-check" + (settled(c) ? " settled" : "") + (picked ? " picked" : "") });
      const hit = map.dot(g, c.xy, 12, { class: "sx-jhit" });
      hit.addEventListener("pointermove", ev => map.tip(ev, `${c.id} · ${esc(c.kind)}`));
      hit.addEventListener("pointerleave", () => map.untip());
      hit.addEventListener("click", () => { if (!map.wasDrag()) select({ kind: "check", id: c.id }); });
    });
    list.filter(c => !settled(c)).forEach(c => map.label(labels, c.xy, c.id, 9, { class: "situ-map-label num" }, "middle"));
  }

  function placeMarks(g) {
    S4.places.forEach(p => {
      if (p.same_as) return;                       // the same place, listed by a second source: drawn once
      const picked = state.pick && state.pick.kind === "place" && state.pick.id === p.id;
      map.dot(g, p.xy, picked ? 6 : 3, { class: "lab-place" + (p.hours ? " hours" : "") + (picked ? " picked" : "") });
      const hit = map.dot(g, p.xy, 7, { class: "sx-jhit" });
      hit.addEventListener("pointermove", ev => map.tip(ev, `${esc(p.name || "(no name)")}<br><span>${esc(p.kind)}</span>`));
      hit.addEventListener("pointerleave", () => map.untip());
      hit.addEventListener("click", () => { if (!map.wasDrag()) select({ kind: "place", id: p.id }); });
    });
  }

  // S5: places open or closed at the chosen hour, and what was counted at the junctions
  const letter5 = (id, d, h) => { const p = S5.places[id]; return p ? p.week[d][h] : "?"; };
  const word5 = l => l === "o" ? "open" : l === "c" ? "closed" : "no hours given";
  function s5Marks(g, labels) {
    const d = +state.s5day, h = state.s5hour;
    S4.places.forEach(p => {
      if (p.same_as) return;
      const l = letter5(p.id, d, h), picked = state.pick && state.pick.kind === "place" && state.pick.id === p.id;
      map.dot(g, p.xy, picked ? 6 : l === "o" ? 4 : l === "c" ? 3 : 2.5, { class: "lab-p5 " + (l === "o" ? "o" : l === "c" ? "c" : "u") + (picked ? " picked" : "") });
      const hit = map.dot(g, p.xy, 7, { class: "sx-jhit" });
      hit.addEventListener("pointermove", ev => map.tip(ev, `${esc(p.name || "(no name)")}<br><span>${word5(l)} · ${DAY5[d]} ${h}h</span>`));
      hit.addEventListener("pointerleave", () => map.untip());
      hit.addEventListener("click", () => { if (!map.wasDrag()) select({ kind: "place", id: p.id }); });
    });
    if (S5.bikes && state.s5mode === "bicycle") {
      const kind = d < 5 ? "weekday" : DAY5[d] === "Sa" ? "Saturday" : "Sunday", sh = S5.bikes.shape[kind][state.s5season];
      S5.bikes.sites.forEach(s => {
        const v = sh.index[h];
        const r = v == null ? 5 : 4 + 9 * Math.sqrt(v);
        map.square(g, s.xy, r * 2, { class: "lab-b5" + (v == null ? " none" : "") });
        const hit = map.dot(g, s.xy, 9, { class: "sx-jhit" });
        hit.addEventListener("pointermove", ev => map.tip(ev, `bicycle detector ${esc(s.id)}<br><span>${esc(s.name)}, ${esc(s.direction.toLowerCase())}bound · ${v == null ? "no day" : v.toFixed(2)}</span>`));
        hit.addEventListener("pointerleave", () => map.untip());
      });
    }
    Object.entries(S5.junctions).forEach(([j, by]) => {
      if (!jun[j]) return;
      const v = d < 5 ? by[state.s5mode][h] : null;
      if (v == null) { map.dot(g, jun[j].xy, 9, { class: "lab-j5 none" }); return; }
      const r = 5 + 22 * Math.sqrt(v / max5[state.s5mode]);
      map.dot(g, jun[j].xy, r, { class: "lab-j5" });
      map.label(labels, add(jun[j].xy, [0, 1], map.px(r + 9)), String(Math.round(v)), 10, { class: "situ-map-label accent" }, "middle");
    });
  }
  function s5Text() {
    const d = +state.s5day, h = state.s5hour, o = S5.open[S5.meta.days[d]][h], w = S5.weekday[state.s5mode];
    let t = `<b>${S5.meta.days[d]}, ${h}h to ${h + 1}h</b><br>${o.open} of the ${S5.with_hours} places that give hours are open. ` +
      `The other ${S5.places_once - S5.with_hours} give none, so they stay unknown.<br>`;
    if (state.s5mode === "bicycle" && S5.bikes) {
      const kind = d < 5 ? "weekday" : DAY5[d] === "Sa" ? "Saturday" : "Sunday", sh = S5.bikes.shape[kind][state.s5season];
      t += sh.index[h] == null ? `<span class="warn">No complete ${kind} in ${state.s5season}.</span>`
        : `On a ${kind} in ${state.s5season}, the bicycle detectors at this hour run at <b>${sh.index[h].toFixed(2)}</b> of an ordinary hour of the same day ` +
          `(the middle half of ${sh.days} days: ${sh.q25[h].toFixed(2)} to ${sh.q75[h].toFixed(2)}).`;
      if (d < 5 && w.index[h] != null) t += ` <span class="sub">The intersection counts, on weekdays, give ${w.index[h].toFixed(2)}.</span>`;
      return t;
    }
    if (d >= 5) return t + `<span class="warn">${esc(S5.meta.weekend.charAt(0).toUpperCase() + S5.meta.weekend.slice(1))}. The streets have no measured rhythm on this day.</span>`;
    if (w.index[h] == null) return t + `<span class="warn">No counted weekday covers this hour.</span>`;
    return t + `On a weekday, ${MODE5[state.s5mode]} at this hour run at <b>${w.index[h].toFixed(2)}</b> of an ordinary daytime hour ` +
      `(${w.low[h].toFixed(2)} to ${w.high[h].toFixed(2)} over ${w.days[h]} counted day${w.days[h] > 1 ? "s" : ""})` +
      (w.alone[h] ? `, <span class="warn">from J040 alone</span>.` : ".") + (d === 0 || d === 4 ? ` <span class="sub">No ${S5.meta.days[d]} was counted; the counted weekdays stand in.</span>` : "");
  }
  const kind5 = () => +state.s5day < 5 ? "weekday" : DAY5[+state.s5day] === "Sa" ? "Saturday" : "Sunday";
  function s5Curve() {
    const bk = state.s5mode === "bicycle" && S5.bikes, sh = bk ? S5.bikes.shape[kind5()][state.s5season] : null;
    const w = bk ? { index: sh.index, low: sh.q25, high: sh.q75, alone: sh.index.map(() => false) } : S5.weekday[state.s5mode], W = 260, Hh = 70, top = Math.max(...w.high.filter(x => x != null), 1);
    const X = h => 4 + (W - 8) * (h + 0.5) / 24, Y = v => Hh - 4 - (Hh - 12) * v / top, f = x => x.toFixed(1);
    const hrs = [...Array(24).keys()].filter(h => w.index[h] != null);
    const band = hrs.map(h => f(X(h)) + "," + f(Y(w.high[h]))).concat(hrs.slice().reverse().map(h => f(X(h)) + "," + f(Y(w.low[h])))).join(" ");
    const line = hrs.map((h, i) => `${i ? "L" : "M"}${f(X(h))},${f(Y(w.index[h]))}`).join("");
    const ref = S5.meta.reference_hours.map(h => `<rect x="${f(X(h) - (W - 8) / 48)}" y="0" width="${f((W - 8) / 24)}" height="${Hh}" class="ref"/>`).join("");
    const dots = hrs.filter(h => w.alone[h]).map(h => `<circle cx="${f(X(h))}" cy="${f(Y(w.index[h]))}" r="2" class="alone"/>`).join("");
    const now = bk || +state.s5day < 5 ? `<line x1="${f(X(state.s5hour))}" x2="${f(X(state.s5hour))}" y1="0" y2="${Hh}" class="now"/>`
      : `<text x="${W / 2}" y="9" text-anchor="middle" class="none">no count on this day: a weekday shown</text>`;
    return `<svg class="lab-curve" viewBox="0 0 ${W} ${Hh + 12}" role="img" aria-label="A weekday, hour by hour">${ref}<polygon points="${band}" class="band"/>` +
      `<path d="${line}" class="line"/>${dots}${now}<text x="4" y="${Hh + 10}">0h</text><text x="${W / 2}" y="${Hh + 10}" text-anchor="middle">12h</text>` +
      `<text x="${W - 4}" y="${Hh + 10}" text-anchor="end">24h</text></svg><p class="sub">${bk ? `The detectors' ${kind5()} in ${state.s5season}: the mean, and the middle half of ${sh.days} days. Dark bands: the reference hours.`
      : "A weekday's shape. Dark bands: the hours counted at every junction. Pink dots: hours counted at J040 alone."}</p>`;
  }
  function weekHTML(id) {
    const p = S5 && S5.places[id];
    if (!p) return "";
    const rows = p.week.map((w, d) => `<tr><td>${DAY5[d]}</td>${w.split("").map(l => `<td class="w5 ${l === "o" ? "o" : l === "c" ? "c" : "u"}"></td>`).join("")}</tr>`).join("");
    return `<h5>S5 · its week</h5><table class="lab-week">${rows}</table><p class="sub">${p.status === "no hours" ? "No hours given, so every hour is unknown, never closed." : "White: open at half past the hour. Dark: closed."}` +
      `${p.season ? " Seasonal: " + esc(p.season) + "." : ""}${p.notes ? " " + esc(p.notes) + "." : ""}</p>`;
  }
  function count5HTML(id) {
    const by = S5.junctions[id], days = S5.meta.counted_days.filter(d => d.junction === id);
    const hrs = [...Array(24).keys()].filter(h => by.pedestrian[h] != null);
    return `<h5>S5 · counted here</h5><p class="sub">${days.map(d => esc(d.weekday + " " + d.date)).join(", ")}. Mean per full hour counted:</p>
      <table class="lab-vals"><tr><th></th><th>on foot</th><th>bicycles</th><th>vehicles</th></tr>${hrs.map(h =>
        `<tr><td>${h}h</td><td>${Math.round(by.pedestrian[h])}</td><td>${Math.round(by.bicycle[h])}</td><td>${Math.round(by.vehicle[h])}</td></tr>`).join("")}</table>`;
  }

  // S6: what stands on the streets
  const show6 = o => state.s6show === "all" || (state.s6show === "trees" && o.kind === "tree") ||
    (state.s6show === "hydrants" && o.kind === "hydrant") || (state.s6show === "furniture" && FURN6.includes(o.kind)) ||
    (state.s6show === "works" && o.kind === "road work") || PHOTO6[state.s6show] === o.kind;
  function s6Marks(g) {
    S6.objects.forEach(o => {
      if (!show6(o)) return;
      const picked = state.pick && state.pick.kind === "obj6" && state.pick.id === o.id;
      let e;
      if (o.kind === "tree") e = map.dot(g, o.xy, Math.min(14, 1.5 + Math.sqrt(o.size || 1) * 0.9), { class: "lab-t6" + (o.date && o.date >= "2013" ? " young" : "") + (picked ? " picked" : "") });
      else if (o.kind === "hydrant") e = map.square(g, o.xy, 6, { class: "lab-h6" + (picked ? " picked" : "") });
      else if (o.kind === "road work") e = map.square(g, o.xy, 10, { class: "lab-w6" + (picked ? " picked" : "") });
      else if (SLUG6[o.kind] && o.source === "osm") e = map.dot(g, o.xy, 4, { class: "lab-o6 k-" + SLUG6[o.kind] + (picked ? " picked" : "") });
      else if (SLUG6[o.kind]) e = map.dot(g, o.xy, o.kind === "surveillance camera" ? 3 : 1.8,
        { class: "lab-m6 k-" + SLUG6[o.kind] + (o.surveyed < S6_SEEN ? " old" : "") + (picked ? " picked" : "") });
      else e = map.square(g, o.xy, 4, { class: "lab-f6" + (picked ? " picked" : "") });
      const hit = map.dot(g, o.xy, 6, { class: "sx-jhit" });
      hit.addEventListener("pointermove", ev => map.tip(ev, `${esc(o.kind)} ${o.id}<br><span>${esc(o.detail || "")}${o.kind === "tree" && o.size ? " · " + o.size + " cm" : ""}</span>`));
      hit.addEventListener("pointerleave", () => map.untip());
      hit.addEventListener("click", () => { if (!map.wasDrag()) select({ kind: "obj6", id: o.id }); });
    });
  }
  const SRC6 = { city_trees: "the city's public tree inventory", city_hydrants: "the city's fire hydrant file", osm: "OpenStreetMap", city_works: "the city's list of road works",
    mapillary: "Mapillary's object detection in street photos" };
  function vision6() {
    const h = S6.meta.vision["hydrant (the city's file)"];
    return `<p class="sub">A machine reading of photos, to check, never truth. As a measure of trust: of the city's ${h.recorded} hydrants,
      Mapillary's software found ${h.recorded_near_detected}, and ${h.detected_near_recorded} of its ${h.detected} hydrant detections stand at one.</p>`;
  }
  function obj6HTML(o) {
    if (!o) return "";
    let h = `<h4>${esc(o.kind)}${o.detail ? ": " + esc(o.detail) : ""}</h4><p class="sub">${o.id} · from ${esc(SRC6[o.source] || o.source)} (${esc(o.source_id)})</p>`;
    if (o.kind === "tree") h += `<p>${o.detail_latin ? `<i>${esc(o.detail_latin)}</i>, ` : ""}trunk <b>${o.size} cm</b> across at breast height.</p>
      <p>${o.date ? `Planted ${esc(o.date)}.` : `<span class="warn">Planting date unknown</span> <span class="sub">${esc(o.date_reason)}</span>`}</p><p class="sub">${esc(o.setting)}</p>`;
    else if (o.kind === "hydrant") h += `<p>Status: ${esc(o.status)}. ${o.date ? "Installed " + esc(o.date) + "." : `<span class="sub">${esc(o.date_reason)}</span>`}</p><p class="sub">${esc(o.setting)}</p>`;
    else if (o.kind === "road work") h += `<p>Permit: ${esc(o.date)}. ${esc(o.setting)}.</p><p class="sub">Listed on ${esc(S6.meta.snapshot)}; a road work is a moment, and the list changes every day.</p>`;
    else if (SLUG6[o.kind] && o.source === "mapillary") h += `<p>${o.date === o.surveyed ? `Seen in photos taken on <b>${esc(o.date)}</b>` : `Seen in photos from <b>${esc(o.date)}</b> to <b>${esc(o.surveyed)}</b>`}${o.surveyed < S6_SEEN ? ` <span class="warn">not since ${S6_SEEN}</span>` : ""};
      ${o.size} detection${o.size > 1 ? "s" : ""} merged within ${S6.meta.vision.merge_m} m.</p>
      <p>${o.same_as ? `OpenStreetMap records a ${esc(o.kind)} within ${S6.meta.vision.match_m} m: ${esc(o.same_as)}.` : `<span class="sub">No ${esc(o.kind)} in OpenStreetMap within ${S6.meta.vision.match_m} m.</span>`}</p>` + vision6();
    else if (SLUG6[o.kind]) h += `<p class="sub">${esc(o.setting || "no further tags")}</p>
      <p>${o.same_as ? `Mapillary's software found a ${esc(o.kind)} within ${S6.meta.vision.match_m} m: ${esc(o.same_as)}.` : `<span class="sub">No Mapillary detection within ${S6.meta.vision.match_m} m; the photos may not reach here.</span>`}</p>`;
    else h += `<p class="sub">${esc(o.setting || "no further tags")}</p>`;
    h += `<h5>Street</h5>` + (o.segment ? `<p><button type="button" class="sx-link" data-seg="${o.segment}">${esc(o.street)} (${o.segment})</button>, ${o.segment_m} m away</p>`
      : `<p class="sub">${esc(o.link_reason)} (${o.segment_m} m from the nearest S1 street)</p>`);
    return h;
  }
  function surf6HTML(s) {
    if (!s) return "";
    return `<h4>${esc(s.kind)} ${s.id}</h4><p class="sub">city asset ${esc(s.source_id)} · ${esc(s.type)}</p>
      <p>${esc(s.material || "material not given")}${s.built ? `, built ${esc(s.built)} <span class="sub">(${esc(s.built_precision)})</span>` : ", <span class='sub'>no construction date</span>"}.</p>
      <p>${Math.round(s.area)} m²${s.width != null ? `, about <b>${s.width.toFixed(1)} m</b> wide on average <span class="sub">(estimated: twice the area over the perimeter)</span>` : ""}.</p>
      <p class="sub">curb extension: ${esc(s.curb_extension)} · cycling: ${esc(s.cycling)} · trees: ${esc(s.trees)}</p>` +
      (s.segment ? `<p>Along <button type="button" class="sx-link" data-seg="${s.segment}">${esc(s.street)} (${s.segment})</button></p>` : "");
  }

  // the S3 rules at one junction: arrows for the picked street, its signs, the street names
  function junctionFocus(g, labels) {
    const J = r3.jun[state.pick.id];
    if (!J) return;
    (r3.lightsAt[J.id] || []).forEach(l => map.dot(g, l.xy, 4, { class: "sx-light" }));
    if (state.approach) {
      const a = r3.app[state.approach + "@" + J.id];
      const start = add(J.xy, a.heading, -26);
      (r3.movFrom[a.segment + "@" + J.id] || []).forEach(m => {
        const out = r3.exit[m.to + "@" + J.id].heading, end = add(J.xy, out, -26), cls = m.allowed ? "sx-move ok" : "sx-move no";
        map.curve(g, start, J.xy, end, { class: cls });
        const n = [-out[1], out[0]], L = map.px(10);
        map.line(g, [add(add(end, out, L), n, L * 0.6), end, add(add(end, out, L), n, -L * 0.6)], { class: cls + " head" });
        map.label(labels, add(end, out, -map.px(14)), (m.allowed ? "" : "✕ ") + m.turn, 12, { class: "situ-map-label " + (m.allowed ? "" : "accent") }, "middle");
      });
      map.dot(g, start, 4, { class: "sx-start" });
      a.signs.map(p => r3.panel[p]).filter(Boolean).forEach(s => {
        if (s.along !== null) map.line(g, [s.xy, add(J.xy, a.heading, -Math.max(s.along, 0))], { class: "sx-sign-link" });
        map.square(g, s.xy, 9, { class: "sx-sign mine" });
      });
    }
    const named = {};
    (r3.appsAt[J.id] || []).forEach(a => {
      const st = seg[a.segment].street;
      if (named[st]) return;
      named[st] = 1;
      const p = add(J.xy, a.heading, -40), n = [-a.heading[1], a.heading[0]];
      map.label(labels, add(p, n, map.px(10)), short(st), 12, {}, "middle");
    });
  }

  // ================================================================ 5 tools: reach and route (S1)
  function reachSteps() {
    if (state.tab !== "s1" || state.s1try !== "reach" || !state.reachStart) return null;
    return S1.reach[`${state.s1mode}_inside`][state.reachStart];
  }
  function reachText() {
    const steps = reachSteps();
    if (!steps) return "Click a junction on the map. The streets light up one step at a time, one more junction away each step.";
    const max = Math.max(...steps);
    if (state.reachStep > max) state.reachStep = max;
    const usable = S1.segments.filter(s => state.s1mode === "walk" ? s.walk : car(s)).length;
    const now = steps.filter(x => x && x <= state.reachStep).length, ever = steps.filter(x => x).length;
    return `From <b>${state.reachStart}</b> ${state.s1mode === "walk" ? "on foot" : "by car"}: step ${state.reachStep} of ${max}, ${now} streets reached. ` +
      (ever < usable ? `<span class="warn">${usable - ever} streets are never reached without leaving the area.</span>` : "In the end every street is reached.");
  }

  let routeMemo = { key: null, val: null };
  function routeNow() {
    if (state.tab !== "s1" || state.s1try !== "route" || !RT || !SR || !state.routeA || !state.routeB) return null;
    const k = [state.s1mode, state.routeA, state.routeB, state.routeSlack].join("|");
    if (routeMemo.key === k) return routeMemo.val;
    const o = jpos[state.routeA], t = jpos[state.routeB], path = SR.route(RT, state.s1mode, o, t);
    const val = path ? { path: new Set(path), list: path, wide: new Set(SR.corridor(RT, state.s1mode, o, t, RT.meta.slacks[state.routeSlack])) } : null;
    routeMemo = { key: k, val };
    return val;
  }
  function routeMarks(g, labels) {
    [[state.routeA, "A"], [state.routeB, "B"]].forEach(([id, name]) => {
      if (!id) return;
      map.dot(g, jun[id].xy, 7, { class: "lab-start" });
      map.label(labels, add(jun[id].xy, [0, 1], map.px(16)), name, 12, { class: "situ-map-label accent" }, "middle");
    });
  }
  const metres = dm => Math.round(dm / 10).toLocaleString("en") + " m";
  function streetsOf(path) {
    const names = [];
    path.forEach(i => { const n = /connector|footway|path/i.test(S1.segments[i].street) ? "path" : short(S1.segments[i].street); if (names[names.length - 1] !== n) names.push(n); });
    return names.join(", ");
  }
  function routeText() {
    if (!RT || !SR) return "";
    if (!state.routeA) return "Click a start junction on the map, then an end junction.";
    if (!state.routeB) return `Start <b>A</b> = ${state.routeA}. Now click the end.`;
    const o = jpos[state.routeA], t = jpos[state.routeB], a = jun[state.routeA].xy, b = jun[state.routeB].xy;
    const line = Math.hypot(b[0] - a[0], b[1] - a[1]) * 10, d = RT[state.s1mode].dist[o][t];
    if (d == null) return `<span class="warn">No route ${state.s1mode === "walk" ? "on foot" : "by car"} without leaving the area.</span>`;
    const rt = routeNow(), wide = [...rt.wide], extra = wide.filter(i => !rt.path.has(i)).length;
    let h = `<b>${metres(d)}</b> ${state.s1mode === "walk" ? "on foot" : "by car"}, ${(d / line).toFixed(2)} times the straight line.<br><span class="sub">along ${esc(streetsOf(rt.list))}</span><br>`;
    const other = state.s1mode === "walk" ? "drive" : "walk", od = RT[other].dist[o][t];
    if (od != null && od !== d) h += `<span class="sub">${other === "walk" ? "On foot" : "By car"} it is ${metres(od)}.</span><br>`;
    h += extra ? `Accept a trip ${RT.meta.slacks[state.routeSlack]} % longer and ${extra} more streets (pink) become possible ways.` : `At ${RT.meta.slacks[state.routeSlack]} % there is only one way.`;
    return h;
  }

  // ================================================================ 6 the detail panel
  function panelHTML() {
    const p = state.pick;
    if (!p) return "";
    const back = `<p class="sx-crumb"><button type="button" class="sx-link" data-close="1">close</button></p>`;
    if (p.kind === "check") return back + checkHTML(checksOf(state.tab).find(x => x.id === p.id) || allChecks().find(x => x.id === p.id));
    if (p.kind === "building") return back + buildingHTML(b4[p.id]);
    if (p.kind === "place") return back + placeHTML(place4[p.id]);
    if (p.kind === "obj6") return back + obj6HTML(o6[p.id]);
    if (p.kind === "surf6") return back + surf6HTML(s6[p.id]);
    if (p.kind === "segment") return back + segmentHTML(seg[p.id]);
    if (p.kind === "junction") return back + junctionHTML(p.id);
    return "";
  }
  const allChecks = () => [...checksOf("s1"), ...checksOf("s3"), ...checksOf("s4"), ...checksOf("s5"), ...checksOf("s6")];

  function checkHTML(c) {
    if (!c) return "";
    const b = c.where && b4[c.where];
    const now = c.status === "confirmed" ? `<p class="ok-line"><b>Settled.</b> ${esc(c.decision)}</p>`
      : c.status === "assumed" ? `<p class="warn"><b>Assumed for now.</b> ${esc(c.decision.replace(/^Assumed:\s*/, ""))} It still needs a look on site.</p>` : "";
    return `<h4>${c.id} · ${esc(c.kind)}</h4>${now}<p>${esc(WHY[c.kind] || "")}</p>` +
      (c.place ? `<p class="sub">${esc(c.place)}</p>` : "") +
      `<h5>What I need to know</h5><p>${esc(c.question)}</p>` +
      (c.link ? `<p><a href="${esc(c.link)}" target="_blank" rel="noopener">Look at this place in Street View</a></p>` : "") +
      (b ? `<p><button type="button" class="sx-link" data-b="${b.id}">Open the building ${esc(b.name || b.id)}</button></p>` : "");
  }

  function segmentHTML(s) {
    let h = `<h4>${esc(s.street)}</h4><p class="sub">${s.id} · ${s.length} m · ${esc(s.class)}</p>
      <h5>S1 · who may use it</h5><p>${s.walk ? "On foot" : "Not on foot"}; ${!car(s) ? "closed to cars" : s.car_ft && s.car_tf ? "cars both ways" : "cars one way"}.${s.source !== "geobase" ? " A path I added after the S1 checks." : ""}</p>`;
    const v = S2 && S2.scores[s.id];
    if (v) {
      const row = (net, m) => RADII[net].map(r => `<td>${fmt(v[`${net}_${m}_${r}`])}</td>`).join("");
      h += `<h5>S2 · space syntax</h5><p class="sub">walking: ${esc(v.ped_status)}${v.ped_reason ? " · " + esc(v.ped_reason) : ""} · driving: ${esc(v.veh_status)}${v.veh_note ? " · " + esc(v.veh_note) : ""}</p>
        <table class="lab-vals"><tr><th></th>${RADII.ped.map(r => `<th>${r}</th>`).join("")}</tr>
        <tr><td>walk choice</td>${row("ped", "NACH")}</tr><tr><td>walk integr.</td>${row("ped", "NAIN")}</tr></table>
        <table class="lab-vals"><tr><th></th>${RADII.veh.map(r => `<th>${r}</th>`).join("")}</tr>
        <tr><td>car choice</td>${row("veh", "NACH")}</tr><tr><td>car integr.</td>${row("veh", "NAIN")}</tr></table>`;
    }
    const r = S3 && r3.speed[s.id];
    if (r) {
      const how = { by_id: `from the speed file, street id ${esc(r.speed_id)}`, by_shape: `borrowed from line ${esc(r.speed_id)} of the same name`,
                    zero_in_file: "the file gives 0: no limit", missing: "not in the speed file", not_a_road: "a path: not in the speed file" }[r.speed_status] || "";
      h += `<h5>S3 · speed</h5><p><b>${r.speed ? r.speed + " km/h" : "no limit"}</b> · ${how}</p>${r.speed_note ? `<p class="sub">${esc(r.speed_note)}</p>` : ""}`;
    }
    return h;
  }

  function signLine(s) {
    const where = s.along === null ? "" : ` · ${Math.abs(s.along).toFixed(0)} m ${s.along >= 0 ? "before" : "past"} the junction, ${Math.abs(s.side).toFixed(0)} m to the ${s.side >= 0 ? "right" : "left"}`;
    const sure = { high: "only street it fits", medium: "best of several streets", redundant: "repeats what the street allows", none: "fits no street" }[s.confidence] || s.confidence;
    return `<li><b>${esc(s.meaning || s.text)}</b> <span class="fr">${esc(s.text)}</span><br><span class="sub">post ${esc(s.post)}${where} · ${esc(sure)}${s.timed ? " · holds only at some hours" : ""}</span></li>`;
  }

  function junctionHTML(id) {
    const j = jun[id];
    let h = `<h4>${id}</h4><p class="sub">S1 · ${esc(j.kind.replace("_", " "))}${j.status ? " (" + esc(j.status) + ")" : ""}</p>`;
    if (S5 && S5.junctions[id]) h += count5HTML(id);
    if (!S3 || !r3.jun[id]) return h;
    const J = r3.jun[id], list = r3.appsAt[id] || [];
    h += `<p class="sub">${esc(J.streets.join(" × "))}</p><h5>S3 · ${esc(CONTROL[J.control])}</h5>`;
    if (J.control === "lights") h += `<p>${(r3.lightsAt[id] || []).map(l => `Light ${esc(l.id)} (${esc(l.streets)}), ${l.distance} m away${l.kind === "temporary" ? ", temporary" : ""}.`).join(" ")}</p>`;
    if (J.note) h += `<p class="sub">${esc(J.note)}</p>`;
    h += `<p class="sub">Pick a street arriving here to see where a car may go.</p><ul class="sx-apps">` + list.map(a => {
      const rule = a.conflict ? "signs contradict: set aside" : a.allowed === "SLR" ? "every turn open" : a.allowed.split("").map(t => TURN_WORD[t]).join(", ") + " only";
      return `<li><button type="button" class="sx-app${state.approach === a.segment ? " on" : ""}" data-app="${a.segment}">${esc(short(a.street))} <span class="sub">${a.segment}</span><br>
        <span class="tag${a.stop ? " stop" : ""}">${a.stop ? "STOP" : "no stop"}</span> <span class="tag">${esc(rule)}</span></button></li>`;
    }).join("") + (list.length ? "" : `<li class="sub">No car may arrive here.</li>`) + `</ul>`;
    if (state.approach) {
      const a = r3.app[state.approach + "@" + id], moves = r3.movFrom[a.segment + "@" + id] || [];
      h += `<h5>From ${esc(a.street)}</h5><p><b>Must stop?</b> ${a.stop ? "Yes." : "No stop sign found for this street."}</p>
        <ul class="sx-moves">${moves.map(m => `<li class="${m.allowed ? "ok" : "no"}">${m.allowed ? "✓" : "✕"} ${esc(m.turn)} onto ${esc(short(m.to_street))} <span class="sub">${m.angle > 0 ? "+" : ""}${m.angle}°${m.reason ? " · " + esc(m.reason) : ""}</span></li>`).join("")}</ul>`;
      if (a.conflict) h += `<p class="warn">The turn signs found here would leave no turn at all, so S3 set them aside. A checkpoint.</p>`;
      const signs = a.signs.map(p => r3.panel[p]).filter(Boolean);
      h += `<p><b>Signs given to this street</b></p>` + (signs.length ? `<ul class="sx-signs">${signs.map(signLine).join("")}</ul>` : `<p class="sub">None, so every turn the layout allows stays open.</p>`);
    }
    return h;
  }

  const SRC4 = { roll: "the city tax roll", osm_tag: "the OpenStreetMap tag", osm: "OpenStreetMap", osm_part: "an OpenStreetMap building part", premises_2025: "the city's commercial survey, 2025", city_places: "the city's list of public places" };
  const said = (v, src, why) => v != null && v !== "" ? `<b>${esc(v)}</b>${src ? ` <span class="sub">from ${esc(SRC4[src] || src)}</span>` : ""}` : `<span class="warn">unknown</span> <span class="sub">${esc(why)}</span>`;
  function buildingHTML(b) {
    const inside = (placesIn[b.id] || []).filter(p => !p.same_as);
    let h = `<h4>${esc(b.name || "A building with no name")}</h4><p class="sub">${b.id} · building=${esc(b.tag)} · ${Math.round(b.area)} m² on the ground</p>
      <h5>Used for</h5><p>${said(b.use, b.use_source, b.use_reason)}</p>`;
    if (b.use && b.use_reason) h += `<p class="sub">${esc(b.use_reason)}</p>`;
    if (b.use_mix) h += `<p class="sub">Tax-roll properties by class: ${esc(b.use_mix)}</p>`;
    h += `<h5>Size</h5><p>Storeys: ${said(b.storeys, b.storeys_source, b.storeys_reason)}${b.height != null ? ` · height ${b.height} m` : ""}</p>` +
      (b.storeys != null && b.storeys_reason ? `<p class="sub">${esc(b.storeys_reason)}. A building is as tall as its tallest known part.</p>` : "") +
      (b.parts ? `<p class="sub">${b.parts} part${b.parts > 1 ? "s" : ""} drawn in OpenStreetMap inside this outline.</p>` : "") + `
      <p>Dwellings: ${b.dwellings != null ? `<b>${b.dwellings}</b> <span class="sub">from the tax roll, ${b.properties} properties${b.condo_units ? `, ${b.condo_units} condo units` : ""}${b.year ? `, built ${esc(b.year)}` : ""}</span>` : `<span class="warn">unknown</span> <span class="sub">${esc(b.roll_reason)}</span>`}</p>`;
    if (b.premises) h += `<h5>Ground floor</h5><p>${b.premises} commercial spaces in the 2025 survey, ${b.vacant} vacant.</p>${b.ground_floor ? `<p class="sub">${esc(b.ground_floor)}</p>` : ""}`;
    if (inside.length) h += `<h5>Places inside (${inside.length})</h5><ul class="lab-places">${inside.map(p =>
      `<li><button type="button" class="sx-link" data-place="${p.id}">${esc(p.name || "(no name)")}</button> <span class="sub">${esc(p.kind)}${p.hours ? " · has hours" : ""}</span></li>`).join("")}</ul>`;
    h += `<h5>Reached from</h5>` + (b.access ? `<p><button type="button" class="sx-link" data-seg="${b.access}">${esc(b.access_street)} (${b.access})</button>, ${b.access_m} m away</p>
      <p class="sub">An assumption: the nearest street people may walk on. Where the doors are is not known yet.</p>` : `<p class="warn">No street people may walk on within ${S4.meta.access_max_m} m.</p>`);
    return h;
  }
  function placeHTML(p) {
    const b = p.building && b4[p.building];
    return `<h4>${esc(p.name || "(no name)")}</h4><p class="sub">${p.id} · ${esc(p.kind)}</p>
      <p>From ${esc(SRC4[p.source] || p.source)}</p>
      <p>${p.hours ? `Opening hours: ${esc(p.hours)}` : `<span class="sub">No opening hours given.</span>`}</p>` +
      (p.same_as ? `<p class="sub">The same name in the same building as <button type="button" class="sx-link" data-place="${p.same_as}">${esc(place4[p.same_as].name)}</button>: probably one place, listed by two sources.</p>` : "") +
      (b ? `<p>In <button type="button" class="sx-link" data-b="${b.id}">${esc(b.name || b.id)}</button>${p.placed === "near" ? ` <span class="sub">(next to it: the nearest outline within ${S4.meta.near_m} m)</span>` : ""}</p>` : `<p class="sub">${esc(p.reason)}</p>`) + weekHTML(p.id);
  }

  // ================================================================ 7 the side: one system at a time
  const seg2 = (k, opts) => `<div class="lab-seg" data-key="${k}">${opts.map(([v, label]) => `<button type="button" data-v="${v}"${state[k] === v ? ' class="on"' : ""}>${label}</button>`).join("")}</div>`;

  function sideHTML() {
    const t = state.tab;
    let h = "";
    if (t === "s1") {
      h += `<h3>S1 · Streets</h3><p>Which streets connect, and who may use them. White streets take people and cars, dashed ones only people. Click a street or a junction for its details, or try the network.</p>
        <h5>Try it</h5>${seg2("s1try", [["details", "details"], ["reach", "how far can I get?"], ["route", "from here to there"]])}`;
      if (state.s1try !== "details") h += seg2("s1mode", [["walk", "on foot"], ["drive", "by car"]]);
      if (state.s1try === "reach") h += `<label class="lab-range">step <b class="lab-step-label">${state.reachStep}</b><input type="range" class="lab-step" min="0" max="${reachSteps() ? Math.max(...reachSteps()) : 1}" value="${state.reachStep}"></label>
        <button type="button" class="lab-play" data-play="reach">▶ play</button><p class="lab-out">${reachText()}</p>`;
      if (state.s1try === "route") h += `<label class="lab-range">allow a detour of <b>${RT ? RT.meta.slacks[state.routeSlack] : 0} %</b><input type="range" class="lab-slack" min="0" max="4" value="${state.routeSlack}"></label><p class="lab-out">${routeText()}</p>`;
    }
    if (t === "s2") {
      const what = state.s2measure === "NACH" ? "Choice: how often a street lies on the way between other places." : "Integration: how easy a street is to reach from everywhere else.";
      h += `<h3>S2 · Scores</h3><p>The space syntax values of each street, coloured by rank: grey lowest, pink highest. ${what}</p>
        ${seg2("s2net", [["ped", "walking"], ["veh", "driving"]])}${seg2("s2measure", [["NACH", "choice"], ["NAIN", "integration"]])}
        <label class="lab-range">within <b class="lab-radius-label">${RADIUS_NAME(RADII[state.s2net][state.s2radius])}</b>
        <input type="range" class="lab-radius" min="0" max="${RADII[state.s2net].length - 1}" value="${state.s2radius}"></label>
        <button type="button" class="lab-play" data-play="radius">▶ play the distances</button>
        <p class="sub">Dashed streets have no value: the analysis did not cover them. They stay empty and are never set to zero.</p>`;
    }
    if (t === "s3") {
      h += `<h3>S3 · Rules</h3><p>Where a driver must stop, where the lights are, where a car may turn and how fast it may go. Click a junction, then a street arriving at it, to see each rule with the sign behind it.</p>
        ${seg2("s3view", [["rules", "stops and lights"], ["speed", "speed limits"]])}`;
    }
    if (t === "s4") {
      h += `<h3>S4 · Buildings</h3><p>What each building is used for, and where that answer came from. Click a building for everything S4 knows about it. Unknown stays unknown.</p>
        ${seg2("s4colour", [["use", "used for"], ["source", "where that came from"]])}
        <label class="lab-check"><input type="checkbox" class="lab-places-on"${state.s4places ? " checked" : ""}> show the places people go to</label>`;
    }
    if (t === "s5" && S5) {
      h += `<h3>S5 · Rhythm</h3><p>When the streets are busy, and which places say they are open. The busyness is measured: the city's counts at seven junctions, on weekdays only. The hours are what the places promise, and most places give none.</p>
        ${seg2("s5day", DAY5.map((d, i) => [String(i), d]))}${seg2("s5mode", [["pedestrian", "on foot"], ["bicycle", "by bicycle"], ["vehicle", "by car"]])}
        ${state.s5mode === "bicycle" && S5.bikes ? seg2("s5season", [["winter", "winter"], ["spring", "spring"], ["summer", "summer"], ["autumn", "autumn"]]) +
          `<p class="sub">By bicycle, three city detectors on Peel and William measure every day since ${esc(S5.bikes.first)}, weekends and seasons included.</p>` : ""}
        <label class="lab-range">hour <b class="lab-hour-label">${state.s5hour}h</b><input type="range" class="lab-hour" min="0" max="23" value="${state.s5hour}"></label>
        <button type="button" class="lab-play" data-play="day">▶ play the day</button><div class="lab-out">${s5Text()}</div><div class="lab-curve-box">${s5Curve()}</div>`;
    }
    if (t === "s6" && S6) {
      const n = k => S6.objects.filter(o => o.kind === k).length;
      h += `<h3>S6 · Streetscape</h3><p>What stands on the streets besides the buildings: ${n("tree")} public trees, ${n("hydrant")} fire hydrants,
        ${S6.objects.filter(o => FURN6.includes(o.kind)).length} pieces of furniture mapped in OpenStreetMap, and the ${n("road work")} road works listed on ${esc(S6.meta.snapshot)}.
        Street lights, surveillance cameras and crossings come from two readers, Mapillary's software looking at street photos and the people who map OpenStreetMap:
        ${Object.entries(S6.meta.photo_kinds).map(([k, s]) => `${s.either} ${k === "street light" ? "street lights" : k === "surveillance camera" ? "cameras" : k + "s"} (${s.both} in both)`).join(", ")}.
        Sidewalks and islands are drawn under the streets. Click anything for its source and values.</p>
        ${seg2("s6show", [["all", "everything"], ["trees", "trees"], ["hydrants", "hydrants"], ["furniture", "furniture"], ["lights", "lights"], ["cameras", "cameras"], ["crossings", "crossings"], ["works", "road works"]])}
        <h5>Sidewalks by</h5>${seg2("s6colour", [["material", "material"], ["built", "year built"]])}
        <p class="sub">S6 records what the objects are and where. What they block, slow or forbid is for the systems after it, as written assumptions.</p>`;
    }
    h += checksHTML(t) + testsHTML(t);
    return h;
  }

  function checksHTML(t) {
    const list = checksOf(t);
    if (t === "s2") return `<h5>Checkpoints</h5><p class="sub">S2 has none of its own. Its open questions are the streets without a value, drawn dashed.</p>`;
    if (!list.length) return "";
    const open = list.filter(c => !settled(c)), done = list.filter(settled);
    const groups = {};
    open.forEach(c => (groups[c.kind] = groups[c.kind] || []).push(c));
    const doneHTML = done.length ? `<details class="lab-cgroup done"><summary>settled <span class="sub">${done.length}</span></summary>
      <p class="why">Checked against photos or other sources; each one says what was decided.</p><ul class="lab-clist">${done.map(c =>
        `<li><button type="button" class="sx-link" data-check="${c.id}">${c.id}</button> <span class="sub">${esc(c.kind)} · ${esc(c.place)}</span></li>`).join("")}</ul></details>` : "";
    return `<h5>Checkpoints still open (${open.length})</h5><p class="sub">Places I cannot settle from the desk. Each one needs a look on site or in photos.</p>` +
      Object.entries(groups).map(([k, cs]) => `<details class="lab-cgroup"><summary>${esc(k)} <span class="sub">${cs.length}</span></summary>
        <p class="why">${esc(WHY[k] || "")}</p><ul class="lab-clist">${cs.map(c =>
          `<li><button type="button" class="sx-link" data-check="${c.id}">${c.id}</button> <span class="sub">${esc(c.place || (b4[c.where] && b4[c.where].name) || c.where || "")}</span></li>`).join("")}</ul></details>`).join("") + doneHTML;
  }

  function testsHTML(t) {
    const D = { s1: S1, s2: S2, s3: S3, s4: S4, s5: S5, s6: S6 }[t];
    if (!D) return "";
    const ts = D.tests || [], f = ts.filter(x => x.status === "fail").length, p = ts.filter(x => x.status === "pass").length;
    return `<details class="lab-tests"><summary>Tests <span class="st ${f ? "fail" : "pass"}">${f ? f + " FAIL" : p + " PASS"}</span> <span class="sub">last run ${esc(D.meta.made)}</span></summary>
      <ul class="lab-testlist">${ts.map(x => `<li><span class="st ${x.status}">${x.status === "pass" ? "PASS" : x.status === "fail" ? "FAIL" : "info"}</span> ${esc(x.title)}</li>`).join("")}</ul></details>`;
  }

  // ================================================================ 8 selection and start-up
  function render(keepSide) {
    const html = panelHTML();
    side.innerHTML = html;
    side.hidden = !html;
    host.querySelectorAll(".lab-tabs button").forEach(b => b.classList.toggle("on", b.dataset.tab === state.tab));
    if (!keepSide) info.innerHTML = sideHTML();
    paint();
    draw();
  }
  function refreshOut() {        // only the moving parts of the side, so a slider being dragged is not rebuilt
    const out = info.querySelector(".lab-out");
    if (out) out.innerHTML = state.tab === "s5" ? s5Text() : state.s1try === "reach" ? reachText() : routeText();
    const hl = info.querySelector(".lab-hour-label"); if (hl) hl.textContent = state.s5hour + "h";
    const hr = info.querySelector(".lab-hour"); if (hr) hr.value = state.s5hour;
    const cb = info.querySelector(".lab-curve-box"); if (cb && state.tab === "s5") cb.innerHTML = s5Curve();
    const sl = info.querySelector(".lab-step-label"); if (sl) sl.textContent = state.reachStep;
    const st = info.querySelector(".lab-step"); if (st) { st.max = reachSteps() ? Math.max(...reachSteps()) : 1; st.value = state.reachStep; }
    const rl = info.querySelector(".lab-radius-label"); if (rl) rl.textContent = RADIUS_NAME(RADII[state.s2net][state.s2radius]);
  }

  function centreOf(pick) {
    const mid = r => [r.reduce((a, p) => a + p[0], 0) / r.length, r.reduce((a, p) => a + p[1], 0) / r.length];
    if (pick.kind === "junction") return jun[pick.id].xy;
    if (pick.kind === "segment") return seg[pick.id].pts[Math.floor(seg[pick.id].pts.length / 2)];
    if (pick.kind === "building") return mid(b4[pick.id].ring);
    if (pick.kind === "place") return place4[pick.id].xy;
    if (pick.kind === "obj6") return o6[pick.id].xy;
    if (pick.kind === "surf6") return mid(s6[pick.id].ring);
    const c = allChecks().find(x => x.id === pick.id);
    return c ? c.xy : null;
  }
  function select(pick, approach) {
    const before = state.pick;
    state.pick = pick; state.approach = approach || null;
    render(true);
    if (!pick) return;
    if (before && before.kind === pick.kind && before.id === pick.id) return;
    const xy = centreOf(pick);
    if (xy) map.zoomTo(xy, pick.kind === "junction" ? 220 : 380);
    if (narrow() && pick.kind !== "junction") side.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function setTab(t) {
    if (!TABS.find(x => x.id === t && x.ok)) return;
    state.tab = t; state.pick = null; state.approach = null;
    clearInterval(timer);
    render();
  }

  function clickJunction(id) {
    if (state.tab === "s1" && state.s1try === "reach") { state.reachStart = id; state.reachStep = 0; render(); playReach(); return; }
    if (state.tab === "s1" && state.s1try === "route") {
      if (!state.routeA || state.routeB) { state.routeA = id; state.routeB = null; }
      else if (id !== state.routeA) state.routeB = id;
      render(); return;
    }
    select({ kind: "junction", id });
  }

  // controls
  host.addEventListener("change", e => {
    if (e.target.classList.contains("lab-places-on")) { state.s4places = e.target.checked; render(true); }
  });
  host.addEventListener("input", e => {
    const t = e.target;
    if (t.classList.contains("lab-radius")) { state.s2radius = +t.value; paint(); refreshOut(); }
    if (t.classList.contains("lab-step")) { state.reachStep = +t.value; paint(); refreshOut(); }
    if (t.classList.contains("lab-slack")) { state.routeSlack = +t.value; render(); }
    if (t.classList.contains("lab-hour")) { state.s5hour = +t.value; clearInterval(timer); draw(); refreshOut(); }
  });
  host.addEventListener("click", e => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.tab) { setTab(b.dataset.tab); return; }
    const group = b.closest(".lab-seg");
    if (group) {
      state[group.dataset.key] = b.dataset.v;
      if (group.dataset.key === "s2net" && state.s2radius > RADII[state.s2net].length - 1) state.s2radius = RADII[state.s2net].length - 1;
      if (group.dataset.key === "s1mode") state.reachStep = 0;
      render();
      if (group.dataset.key === "s1mode" && state.s1try === "reach") playReach();
      return;
    }
    if (b.dataset.close) select(null);
    if (b.dataset.check) select({ kind: "check", id: b.dataset.check });
    if (b.dataset.app) select(state.pick, b.dataset.app === state.approach ? null : b.dataset.app);
    if (b.dataset.b) { if (state.tab !== "s4") { state.tab = "s4"; render(); } select({ kind: "building", id: b.dataset.b }); }
    if (b.dataset.place) { if (state.tab !== "s4") state.tab = "s4"; state.s4places = true; render(); select({ kind: "place", id: b.dataset.place }); }
    if (b.dataset.seg) select({ kind: "segment", id: b.dataset.seg });
    if (b.dataset.play === "radius") playRadius();
    if (b.dataset.play === "reach") playReach();
    if (b.dataset.play === "day") playDay();
  });

  // sliders that play: one step at a time, so the change is easy to follow
  let timer = null;
  function playRadius() {
    clearInterval(timer);
    state.s2radius = 0; render();
    timer = setInterval(() => {
      if (state.s2radius >= RADII[state.s2net].length - 1) { clearInterval(timer); return; }
      state.s2radius += 1; paint(); refreshOut();
      const r = info.querySelector(".lab-radius"); if (r) r.value = state.s2radius;
    }, 1400);
  }
  function playDay() {
    clearInterval(timer);
    state.s5hour = 0; draw(); refreshOut();
    timer = setInterval(() => {
      if (state.s5hour >= 23) { clearInterval(timer); return; }
      state.s5hour += 1; draw(); refreshOut();
    }, 700);
  }
  function playReach() {
    clearInterval(timer);
    const steps = reachSteps();
    if (!steps) return;
    const max = Math.max(...steps);
    state.reachStep = 0; paint(); refreshOut();
    timer = setInterval(() => {
      if (state.reachStep >= max) { clearInterval(timer); return; }
      state.reachStep += 1; paint(); refreshOut();
    }, 450);
  }

  // links from the book: #s1 to #s6, #radius, #reach-J080, #route-J093-J130, #J027-S020, #w201008914
  function fromHash() {
    const h = location.hash;
    let m;
    if ((m = /^#(s[1-6])$/.exec(h))) { setTab(m[1]); return; }
    if (h === "#radius") { setTab("s2"); playRadius(); return; }
    if ((m = /^#reach(?:-(J\d{3}))?$/.exec(h))) {
      state.tab = "s1"; state.s1try = "reach";
      if (m[1] && jun[m[1]]) state.reachStart = m[1];
      render(); playReach(); return;
    }
    if ((m = /^#route-(J\d{3})-(J\d{3})$/.exec(h)) && jun[m[1]] && jun[m[2]]) {
      state.tab = "s1"; state.s1try = "route"; state.routeA = m[1]; state.routeB = m[2]; render(); return;
    }
    if ((m = /^#([wr]\d+)$/.exec(h)) && S4 && b4[m[1]]) { state.tab = "s4"; render(); select({ kind: "building", id: m[1] }); return; }
    if ((m = /^#(J\d{3})(?:-(S\d{3}))?$/.exec(h)) && jun[m[1]]) {
      state.tab = "s3"; state.s3view = "rules"; render();
      select({ kind: "junction", id: m[1] }, m[2] && r3.app[m[2] + "@" + m[1]] ? m[2] : null);
    }
  }
  window.addEventListener("hashchange", fromHash);

  render();
  map.fit(false);
  fromHash();
})();
