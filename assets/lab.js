/*
  lab.js  -  the Situ Lab: one map, every system, shown or hidden, tried and tested.

  It reads the files the systems' web.py scripts wrote:
    window.SITU_S1   outputs/s1/web_data.js   streets, junctions, reach from every junction
    window.SITU_S2   outputs/s2/web_data.js   space syntax values per segment
    window.SITU_S3   outputs/s3/web_data.js   rules, signs, lights, speed, stress variants
    window.SITU_S1_ROUTES  outputs/s1/routes_data.js  shortest distances and routes between every pair of junctions
    window.SITU_S4   outputs/s4/web_data.js   buildings, their uses and sources, places, checkpoints

  It computes nothing about the city. Every slider picks between results the Python code
  already produced, and tools/test_lab.py checks that these files match the tables.
  One exception, kept small: the route tool applies the rules in assets/routes.js to the distances
  s1_streets/routes.py wrote. They are the same rules as in routes.py, and test L5 checks both agree.

  Structure
    1 data and indexes        5 tools: reach, route, sign shake, light distance, speed distance
    2 the page                6 the detail panel
    3 painting the streets    7 tests
    4 overlays                8 selection and start-up
*/
(function () {
  const S1 = window.SITU_S1, S2 = window.SITU_S2, S3 = window.SITU_S3, S4 = window.SITU_S4, RT = window.SITU_S1_ROUTES, SR = window.SituRoutes;
  const host = document.getElementById("situ-lab");
  if (!host || !S1 || !window.SituMap) return;

  // ================================================================ 1 data and indexes
  const seg = {}, jun = {}, segIndex = {};
  S1.segments.forEach((s, i) => { seg[s.id] = s; segIndex[s.id] = i; });
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

  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const short = n => n.replace(/^(Rue|Boulevard|Avenue|Place|Allée|Autoroute) (de la |de l'|des |du |de )?/, "");
  const add = (a, b, k) => [a[0] + b[0] * k, a[1] + b[1] * k];
  const car = s => s.car_ft || s.car_tf;
  const fmt = x => x == null ? "none" : Math.abs(x) >= 10 ? x.toFixed(1) : x.toFixed(3);
  const TURN_WORD = { S: "straight on", L: "left", R: "right" };
  const CONTROL = { lights: "traffic lights", all_way_stop: "all-way stop", stop: "stop on some streets", none: "no stop, no lights" };

  // ================================================================ 2 the page
  const RADII = { ped: ["200", "400", "800", "n"], veh: ["1200", "2000"] };
  const RADIUS_NAME = r => r === "n" ? "whole island" : r + " m";
  const state = {
    paint: "s1", s2net: "ped", s2measure: "NACH", s2radius: 2,
    show: { s1junctions: true, oneway: false, s3control: !!S3, checks1: false, checks3: false, s4: false, places4: false, checks4: false },
    s4colour: "use",
    tool: null, reachMode: "walk", reachOutside: false, reachStart: null, reachStep: 0,
    routeMode: "walk", routeA: null, routeB: null, routeSlack: 2,
    shake: 0, lightNear: 2, speedTol: 3,
    pick: null,                      // {kind: "junction"|"segment"|"check1"|"check3", id}
    approach: null,
  };
  const LIGHT_STEPS = ["5", "10", "25", "40", "80"], SPEED_STEPS = ["1", "2", "3", "5", "8"], SHAKE_STEPS = ["0", "1", "2", "4", "8"];

  host.innerHTML = `
  <div class="lab-side">
    <p class="lab-note">Everything here replays what the Python systems computed. A slider picks between runs the code already made. The route tool applies two rules that are also written in Python, and a test checks both agree.</p>

    <section><h5>Paint the streets</h5>
      <label><input type="radio" name="paint" value="s1" checked> S1 · who may use each street</label>
      <label><input type="radio" name="paint" value="s2"> S2 · space syntax</label>
      <div class="lab-sub" data-for="s2">
        <div class="lab-seg" data-key="s2net"><button data-v="ped" class="on">walking</button><button data-v="veh">driving</button></div>
        <div class="lab-seg" data-key="s2measure"><button data-v="NACH" class="on">choice</button><button data-v="NAIN">integration</button></div>
        <label class="lab-range">radius <b class="lab-radius-label"></b>
          <input type="range" class="lab-radius" min="0" max="3" step="1" value="2"></label>
        <button type="button" class="lab-play" data-play="radius">▶ play the radii</button>
      </div>
      <label><input type="radio" name="paint" value="s3"${S3 ? "" : " disabled"}> S3 · speed limit</label>
      <label><input type="radio" name="paint" value="plain"> plain</label>
    </section>

    <section><h5>Show</h5>
      <label><input type="checkbox" data-show="s1junctions" checked> S1 · gates and dead ends</label>
      <label><input type="checkbox" data-show="oneway"> S1 · one-way arrows</label>
      <label><input type="checkbox" data-show="s3control"${S3 ? " checked" : " disabled"}> S3 · stops and lights (click a junction)</label>
      <label><input type="checkbox" data-show="checks1"> S1 · checkpoints</label>
      <label><input type="checkbox" data-show="checks3"${S3 ? "" : " disabled"}> S3 · checkpoints</label>
      <label><input type="checkbox" data-show="s4"${S4 ? "" : " disabled"}> S4 · buildings (click one)</label>
      <div class="lab-sub lab-s4sub" hidden>
        <div class="lab-seg" data-key="s4colour"><button data-v="use" class="on">what it is used for</button><button data-v="source">where that came from</button></div>
      </div>
      <label><input type="checkbox" data-show="places4"${S4 ? "" : " disabled"}> S4 · places</label>
      <label><input type="checkbox" data-show="checks4"${S4 ? "" : " disabled"}> S4 · checkpoints</label>
    </section>

    <section><h5>Try a system</h5>
      <details data-tool="reach"><summary>S1 · how far can I get?</summary>
        <p>Click a junction on the map, then move the slider. One step is one more junction away.</p>
        <div class="lab-seg" data-key="reachMode"><button data-v="walk" class="on">on foot</button><button data-v="drive">by car</button></div>
        <label class="lab-check"><input type="checkbox" class="lab-outside"> the city outside the gates counts</label>
        <label class="lab-range">step <b class="lab-step-label">0</b><input type="range" class="lab-step" min="0" max="1" value="0"></label>
        <button type="button" class="lab-play" data-play="reach">▶ play</button>
        <p class="lab-out lab-reach-out">No junction picked yet.</p>
      </details>
      <details data-tool="route"${RT && SR ? "" : " hidden"}><summary>S1 · from here to there</summary>
        <p>Click a start junction, then an end junction. A third click starts again.</p>
        <div class="lab-seg" data-key="routeMode"><button data-v="walk" class="on">on foot</button><button data-v="drive">by car</button></div>
        <label class="lab-range">allow a detour of <b class="lab-slack-label">10 %</b><input type="range" class="lab-slack" min="0" max="4" value="2"></label>
        <p class="lab-out lab-route-out">No start picked yet.</p>
      </details>
      <details data-tool="shake"${S3 ? "" : " hidden"}><summary>S3 · move every sign a little</summary>
        <p>Stress test X2. Every sign post moved at random by up to:</p>
        <label class="lab-range"><b class="lab-shake-label">0 m</b><input type="range" class="lab-shake" min="0" max="4" value="0"></label>
        <p class="lab-out lab-shake-out"></p>
      </details>
      <details data-tool="lights"${S3 ? "" : " hidden"}><summary>S3 · how close must a light be?</summary>
        <p>Stress test X6. A light belongs to a junction closer than:</p>
        <label class="lab-range"><b class="lab-light-label">25 m</b><input type="range" class="lab-light" min="0" max="4" value="2"></label>
        <p class="lab-out lab-light-out"></p>
      </details>
      <details data-tool="speedtol"${S3 ? "" : " hidden"}><summary>S3 · borrowing a speed limit</summary>
        <p>Stress test X7. A street missing from the speed file may borrow from a line of the same name within:</p>
        <label class="lab-range"><b class="lab-tol-label">5 m</b><input type="range" class="lab-tol" min="0" max="4" value="3"></label>
        <p class="lab-out lab-tol-out"></p>
      </details>
    </section>

    <section><h5>Tests, last run</h5><div class="lab-tests"></div></section>
  </div>
  <div class="lab-main">
    <div class="lab-map"></div>
    <aside class="sx-panel lab-panel" hidden></aside>
    <div class="lab-key"></div>
  </div>`;

  const $ = q => host.querySelector(q);
  const side = $(".lab-panel"), key = $(".lab-key");
  const map = new SituMap($(".lab-map"), S1.segments.flatMap(s => s.pts));
  map.cover = () => side.hidden ? 0 : side.offsetWidth + 16;

  // ================================================================ 3 painting the streets
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
  function paintBuildings() {
    bLayer.style.display = state.show.s4 && S4 ? "" : "none";
    if (!S4 || !state.show.s4) return;
    S4.buildings.forEach(b => {
      let cls = "lab-bld " + (state.s4colour === "use" ? USE_CLASS(b.use) : "src-" + (b.use_source || "none"));
      if (state.pick && state.pick.kind === "building" && state.pick.id === b.id) cls += " picked";
      bEl[b.id].setAttribute("class", cls);
    });
  }

  const streets = map.layer("streets");
  const segEl = {};
  S1.segments.forEach(s => {
    segEl[s.id] = map.line(streets, s.pts, { class: "lab-street" });
    const hit = map.line(streets, s.pts, { class: "sx-hit" });
    hit.addEventListener("pointermove", ev => map.tip(ev, esc(s.street) + ` <span>${s.id}</span>` + tipValue(s)));
    hit.addEventListener("pointerleave", () => map.untip());
    hit.addEventListener("click", () => { if (!map.wasDrag()) clickSegment(s); });
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
    if (state.paint === "s2") { const v = S2.scores[s.id] && S2.scores[s.id][s2col()]; return `<br><span>${esc(s2col())}: ${fmt(v)}</span>`; }
    if (state.paint === "s3") { const r = r3.speed[s.id]; return `<br><span>${r && r.speed ? r.speed + " km/h" : "no limit"}</span>`; }
    return "";
  }

  function paint() {
    const col = state.paint === "s2" ? s2col() : null, rk = col ? ranks(col) : null;
    const reach = reachSteps(), rt = routeNow();
    S1.segments.forEach((s, i) => {
      const e = segEl[s.id];
      let cls = "lab-street", style = "";
      if (state.paint === "s1") cls += !car(s) ? " walk" : !s.walk ? " drive" : " both";
      if (state.paint === "s1" && s.source !== "geobase") cls += " added";
      if (state.paint === "s2") {
        const v = S2.scores[s.id] && S2.scores[s.id][col];
        if (v == null) cls += " novalue";
        else { const t = rk.rank(v); style = `stroke:${ramp(t)};stroke-width:${(1.2 + 2.6 * t).toFixed(2)}px`; }
      }
      if (state.paint === "s3") {
        const r = r3.speed[s.id];
        cls += r && r.speed ? " v" + r.speed + (r.speed_status === "by_shape" ? " shaped" : "") : car(s) ? " v-gap" : " v-none";
      }
      if (state.paint === "plain") cls += " plain";
      if (reach) { cls += reach[i] && reach[i] <= state.reachStep ? " reached" : " unreached"; style = ""; }   // the reach replaces the paint
      if (rt) { cls += rt.path.has(i) ? " route" : rt.wide.has(i) ? " corridor" : " unreached"; style = ""; }  // so does a route
      if (state.tool === "speedtol" && S3) {
        const v = S3.variants.speed_tol[SPEED_STEPS[state.speedTol]];
        if (v.by_shape.includes(s.id)) cls += " flag-ok";
        if (v.car_gaps.includes(s.id)) cls += " flag-gap";
      }
      if (state.pick && state.pick.kind === "segment" && state.pick.id === s.id) cls += " picked";
      if (state.approach === s.id) cls += " picked";
      e.setAttribute("class", cls);
      e.setAttribute("style", style);
    });
    paintBuildings();
    drawKey(rk, col);
  }

  function drawKey(rk, col) {
    let html = "";
    if (state.paint === "s1") html = `<span><i class="k both"></i>walk and drive</span><span><i class="k walk"></i>walk only</span><span><i class="k drive"></i>drive only</span><span><i class="k added"></i>path added after the S1 checks</span>`;
    if (state.paint === "s2" && rk) {
      const q = p => rk.vals[Math.min(rk.vals.length - 1, Math.round(p * (rk.vals.length - 1)))];
      html = `<span>${state.s2net === "ped" ? "walking" : "driving"} ${state.s2measure === "NACH" ? "choice" : "integration"}, ${RADIUS_NAME(RADII[state.s2net][state.s2radius])}</span>
        <span class="lab-ramp"><em>${fmt(q(0))}</em><i></i><em>${fmt(q(0.5))}</em><i></i><em>${fmt(q(1))}</em></span>
        <span>colour by rank: lowest grey, middle white, highest pink</span><span><i class="k novalue"></i>no value</span>`;
    }
    if (state.paint === "s3") html = `<span><i class="k v40"></i>40 km/h</span><span><i class="k v30"></i>30</span><span><i class="k v20"></i>20</span><span><i class="k shaped"></i>borrowed from the same name</span><span><i class="k gap"></i>cars allowed, no limit</span>`;
    if (state.tool === "reach") html = `<span><i class="k both"></i>reached by this step</span><span><i class="k faint"></i>not yet</span>` + html;
    if (state.tool === "route" && routeNow()) html = `<span><i class="k route"></i>shortest route</span><span><i class="k corridor"></i>a trip at most ${RT.meta.slacks[state.routeSlack]} % longer can pass here</span>` + html;
    if (state.show.s4 && S4) {
      const n = f => S4.buildings.filter(f).length;
      html += state.s4colour === "use"
        ? ["residential", "commerce", "services", "culture and leisure", "industry", "transport and parking", "vacant land", "under construction", "minor structure"]
            .filter(u => n(b => b.use === u)).map(u => `<span><i class="kb ${USE_CLASS(u)}"></i>${u} ${n(b => b.use === u)}</span>`).join("") +
          `<span><i class="kb u-unknown"></i>use unknown ${n(b => !b.use)}</span>`
        : `<span><i class="kb src-roll"></i>use from the tax roll ${n(b => b.use_source === "roll")}</span><span><i class="kb src-osm_tag"></i>from the OpenStreetMap tag ${n(b => b.use_source === "osm_tag")}</span><span><i class="kb src-none"></i>no source ${n(b => !b.use_source)}</span>`;
    }
    if (state.show.places4 && S4) html += `<span><i class="kp"></i>place</span><span><i class="kp hours"></i>place with opening hours</span>`;
    key.innerHTML = html + `<span class="lab-hint">scroll to zoom · drag to move · hover for names</span>`;
  }

  // ================================================================ 4 overlays
  map.onRedraw(draw);
  function draw() {
    map.boxes = [];
    for (const n of ["marks", "focus", "labels"]) map.clear(n);
    const marks = map.layer("marks"), focus = map.layer("focus"), labels = map.layer("labels");
    if (state.show.oneway) onewayArrows(marks);
    if (state.show.s3control && S3 && state.tool !== "route") s3Control(marks);   // pink lights would read as a corridor
    if (state.show.s1junctions) S1.junctions.forEach(j => {
      if (j.kind === "gate") map.square(marks, j.xy, 7, { class: "lab-gate" });
      if (j.kind === "dead_end") map.dot(marks, j.xy, 5, { class: "lab-dead " + (j.status === "confirmed" ? "ok" : "open") });
    });
    if (state.tool === "reach") reachMarks(marks);
    if (state.tool === "route") routeMarks(marks, labels);
    if (state.tool === "shake" && S3) shakeMarks(marks);
    if (state.tool === "lights" && S3) lightMarks(marks);
    if (state.show.checks1) checkMarks(marks, labels, S1.checkpoints, "check1");
    if (state.show.checks3 && S3) checkMarks(marks, labels, S3.checkpoints, "check3");
    if (state.show.places4 && S4) placeMarks(marks);
    if (state.show.checks4 && S4) checkMarks(marks, labels, S4.checkpoints, "check4");
    junctionHits(marks);
    if (state.pick && state.pick.kind === "junction" && S3 && state.show.s3control) junctionFocus(focus, labels);
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
      if (state.tool === "lights") return;                 // the light tool draws its own
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

  function checkMarks(g, labels, list, kind) {
    list.forEach(c => {
      const picked = state.pick && state.pick.kind === kind && state.pick.id === c.id;
      map.dot(g, c.xy, picked ? 11 : 9, { class: "sx-check " + kind + (picked ? " picked" : "") });
      const hit = map.dot(g, c.xy, 12, { class: "sx-jhit" });
      hit.addEventListener("pointermove", ev => map.tip(ev, `${c.id} · ${esc(c.kind)}`));
      hit.addEventListener("pointerleave", () => map.untip());
      hit.addEventListener("click", () => { if (!map.wasDrag()) select({ kind, id: c.id }); });
    });
    list.forEach(c => map.label(labels, c.xy, c.id, 9, { class: "situ-map-label num" + (kind === "check1" ? " s1" : "") }, "middle"));
  }

  function placeMarks(g) {
    S4.places.forEach(p => {
      const picked = state.pick && state.pick.kind === "place" && state.pick.id === p.id;
      map.dot(g, p.xy, picked ? 6 : 3, { class: "lab-place" + (p.hours ? " hours" : "") + (picked ? " picked" : "") });
      const hit = map.dot(g, p.xy, 7, { class: "sx-jhit" });
      hit.addEventListener("pointermove", ev => map.tip(ev, `${esc(p.name || "(no name)")}<br><span>${esc(p.kind)}</span>`));
      hit.addEventListener("pointerleave", () => map.untip());
      hit.addEventListener("click", () => { if (!map.wasDrag()) select({ kind: "place", id: p.id }); });
    });
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

  // ================================================================ 5 tools
  function reachSteps() {
    if (state.tool !== "reach" || !state.reachStart) return null;
    return S1.reach[`${state.reachMode}_${state.reachOutside ? "outside" : "inside"}`][state.reachStart];
  }
  function reachMarks(g) {
    if (state.reachStart) map.dot(g, jun[state.reachStart].xy, 7, { class: "lab-start" });
  }
  function updateReach() {
    const steps = reachSteps(), out = $(".lab-reach-out"), slider = $(".lab-step");
    if (!steps) { out.textContent = "No junction picked yet. Click one on the map."; return; }
    const max = Math.max(...steps);
    slider.max = max;
    if (state.reachStep > max) state.reachStep = max;
    slider.value = state.reachStep;
    $(".lab-step-label").textContent = state.reachStep + " of " + max;
    const usable = S1.segments.filter(s => state.reachMode === "walk" ? s.walk : car(s)).length;
    const now = steps.filter(x => x && x <= state.reachStep).length, ever = steps.filter(x => x).length;
    out.innerHTML = `From <b>${state.reachStart}</b> ${state.reachMode === "walk" ? "on foot" : "by car"}: ${now} segments reached at this step, ` +
      `${ever} of ${usable} usable in the end.` + (ever < usable ? ` <span class="warn">${usable - ever} never reached${state.reachOutside ? "" : " without leaving the area"}.</span>` : " Everything is reached.");
  }

  // the route tool: the shortest route and its corridor, from the tables routes.py wrote
  let routeMemo = { key: null, val: null };
  function routeNow() {
    if (state.tool !== "route" || !RT || !SR || !state.routeA || !state.routeB) return null;
    const key = [state.routeMode, state.routeA, state.routeB, state.routeSlack].join("|");
    if (routeMemo.key === key) return routeMemo.val;
    const o = jpos[state.routeA], t = jpos[state.routeB], path = SR.route(RT, state.routeMode, o, t);
    const val = path ? { path: new Set(path), list: path, wide: new Set(SR.corridor(RT, state.routeMode, o, t, RT.meta.slacks[state.routeSlack])) } : null;
    routeMemo = { key, val };
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
  function updateRoute() {
    const out = $(".lab-route-out"), k = RT ? RT.meta.slacks[state.routeSlack] : 0;
    $(".lab-slack-label").textContent = k + " %";
    $(".lab-slack").value = state.routeSlack;
    if (!RT || !SR) return;
    if (!state.routeA) { out.textContent = "No start picked yet. Click a junction on the map."; return; }
    if (!state.routeB) { out.innerHTML = `Start <b>A</b> = ${state.routeA}. Now click the end junction.`; return; }
    const o = jpos[state.routeA], t = jpos[state.routeB], a = jun[state.routeA].xy, b = jun[state.routeB].xy;
    const line = Math.hypot(b[0] - a[0], b[1] - a[1]) * 10;
    const walk = RT.walk.dist[o][t], drive = RT.drive.dist[o][t];
    const ratio = d => (d / line).toFixed(2) + " × the straight line";
    const one = (mode, d) => {
      const word = mode === "walk" ? "On foot" : "By car";
      if (d == null) return `<b>${word}:</b> <span class="warn">no route without leaving the area</span>`;
      const path = SR.route(RT, mode, o, t);
      let h = `<b>${word}:</b> ${metres(d)}, ${ratio(d)}<br><span class="sub">along ${esc(streetsOf(path))}</span>`;
      if (mode === "drive" && walk != null && d > walk) h += `<br><span class="sub">one-way streets add ${metres(d - walk)} (+${Math.round(100 * (d - walk) / walk)} %) to the walk</span>`;
      return h;
    };
    let h = `<b>A</b> ${state.routeA} → <b>B</b> ${state.routeB} · straight line ${metres(line)}<br>${one("walk", walk)}<br>${one("drive", drive)}`;
    const rt = routeNow();
    if (rt) {
      const wide = [...rt.wide], len = wide.reduce((s, i) => s + RT.length[i], 0), streets = new Set(wide.map(i => S1.segments[i].street));
      const extra = wide.filter(i => !rt.path.has(i)).length;
      h += `<br><b>Variety ${state.routeMode === "walk" ? "on foot" : "by car"}:</b> trips at most ${k} % longer than the shortest can pass through ${wide.length} segments (${metres(len)} of street, ${streets.size} streets). ` +
        (extra ? `${extra} of them lie off the shortest route (pink).` : `Nothing lies off the shortest route: at this slack there is one way.`);
    }
    out.innerHTML = h;
  }

  function shakeMarks(g) {
    const changes = S3.variants.shake[SHAKE_STEPS[state.shake]] || [];
    changes.forEach(c => {
      const J = r3.jun[c.junction], a = r3.app[c.segment + "@" + c.junction];
      map.dot(g, add(J.xy, a.heading, -14), 7, { class: "lab-flag" });
    });
  }
  function updateShake() {
    const m = SHAKE_STEPS[state.shake], changes = S3.variants.shake[m] || [];
    $(".lab-shake-label").textContent = m + " m";
    $(".lab-shake-out").innerHTML = changes.length ? `${changes.length} streets change their rule (pink rings):<br>` + changes.map(c => {
      const what = c.stop[0] !== c.stop[1] ? `stop ${c.stop[0] ? "yes" : "no"} → ${c.stop[1] ? "yes" : "no"}` : `turns ${c.allowed[0]} → ${c.allowed[1]}`;
      return `<button type="button" class="sx-link" data-j="${c.junction}" data-a="${c.segment}">${esc(short(seg[c.segment].street))} at ${c.junction}</button>: ${what}`;
    }).join("<br>") : "No rule changes.";
  }

  function lightMarks(g) {
    const lit = new Set(S3.variants.light_near[LIGHT_STEPS[state.lightNear]] || []), now = new Set(S3.variants.light_near["25"] || []);
    S3.junctions.forEach(j => {
      if (lit.has(j.id)) map.dot(g, j.xy, 6, { class: "sx-j lights" + (now.has(j.id) ? "" : " extra") });
      else if (now.has(j.id)) map.dot(g, j.xy, 6, { class: "lab-lost" });
    });
    S3.lights.forEach(l => map.dot(g, l.xy, 2.5, { class: "lab-lightpoint" }));
  }
  function updateLights() {
    const d = LIGHT_STEPS[state.lightNear], lit = S3.variants.light_near[d] || [], now = S3.variants.light_near["25"] || [];
    const gained = lit.filter(x => !now.includes(x)), lost = now.filter(x => !lit.includes(x));
    $(".lab-light-label").textContent = d + " m";
    $(".lab-light-out").innerHTML = `${lit.length} junctions with lights. ` +
      (gained.length ? `New: ${gained.join(", ")} (pink with a white ring). ` : "") + (lost.length ? `Lost: ${lost.join(", ")} (grey rings). ` : "") +
      `Small dots are the lights in the city file.`;
  }

  function updateTol() {
    const t = SPEED_STEPS[state.speedTol], v = S3.variants.speed_tol[t];
    $(".lab-tol-label").textContent = t + " m";
    $(".lab-tol-out").innerHTML = `Borrowed (white glow): ${v.by_shape.join(", ") || "none"}.<br>Open to cars with no limit (pink): ${v.car_gaps.join(", ") || "none"}.`;
  }

  // ================================================================ 6 the detail panel
  function panelHTML() {
    const p = state.pick;
    if (!p) return "";
    const back = `<p class="sx-crumb"><button type="button" class="sx-link" data-close="1">close</button></p>`;
    if (p.kind === "check1" || p.kind === "check3") {
      const c = (p.kind === "check1" ? S1 : S3).checkpoints.find(x => x.id === p.id);
      return back + `<h4>${c.id} · ${esc(c.kind)}</h4><p class="sub">${p.kind === "check1" ? "S1 Streets" : "S3 Rules"}</p><p>${esc(c.place)}</p><p>${esc(c.question)}</p>
        <p><a href="${esc(c.link)}" target="_blank" rel="noopener">Open this place in Street View</a></p>`;
    }
    if (p.kind === "check4") {
      const c = S4.checkpoints.find(x => x.id === p.id), b = b4[c.where];
      return back + `<h4>${c.id} · ${esc(c.kind)}</h4><p class="sub">S4 Buildings</p><p>${esc(c.question)}</p>` +
        (b ? `<p><button type="button" class="sx-link" data-b="${b.id}">Open the building ${esc(b.name || b.id)}</button></p>` : "");
    }
    if (p.kind === "building") return back + buildingHTML(b4[p.id]);
    if (p.kind === "place") return back + placeHTML(place4[p.id]);
    if (p.kind === "segment") return back + segmentHTML(seg[p.id]);
    if (p.kind === "junction") return back + junctionHTML(p.id);
    return "";
  }

  function segmentHTML(s) {
    let h = `<h4>${esc(s.street)}</h4><p class="sub">${s.id} · ${s.length} m · ${esc(s.class)}</p>
      <h5>S1 · who may use it</h5><p>${s.walk ? "On foot" : "Not on foot"}; ${!car(s) ? "closed to cars" : s.car_ft && s.car_tf ? "cars both ways" : "cars one way"}.${s.source !== "geobase" ? " A path added after the S1 checks." : ""}</p>`;
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

  const SRC4 = { roll: "the city tax roll", osm_tag: "the OpenStreetMap tag", osm: "OpenStreetMap", premises_2025: "the city's commercial survey, 2025", city_places: "the city's list of public places" };
  const said = (v, src, why, unit) => v != null && v !== "" ? `<b>${esc(v)}</b>${unit || ""}${src ? ` <span class="sub">from ${esc(SRC4[src] || src)}</span>` : ""}` : `<span class="warn">unknown</span> <span class="sub">${esc(why)}</span>`;
  function buildingHTML(b) {
    const inside = placesIn[b.id] || [];
    let h = `<h4>${esc(b.name || "A building with no name")}</h4><p class="sub">${b.id} · ${esc(b.osm)} · building=${esc(b.tag)} · ${Math.round(b.area)} m² on the ground</p>
      <h5>S4 · use</h5><p>${said(b.use, b.use_source, b.use_reason)}</p>`;
    if (b.use && b.use_reason) h += `<p class="sub">${esc(b.use_reason)}</p>`;
    if (b.use_mix) h += `<p class="sub">Tax-roll properties by class: ${esc(b.use_mix)}</p>`;
    h += `<h5>S4 · size</h5><p>Storeys: ${said(b.storeys, b.storeys_source === "osm" ? "osm" : b.storeys_source, b.storeys_reason)}${b.height != null ? ` · height ${b.height} m` : ""}</p>
      <p>Dwellings: ${b.dwellings != null ? `<b>${b.dwellings}</b> <span class="sub">from the tax roll, ${b.properties} properties${b.condo_units ? `, ${b.condo_units} condo units` : ""}${b.year ? `, built ${esc(b.year)}` : ""}</span>` : `<span class="warn">unknown</span> <span class="sub">${esc(b.roll_reason)}</span>`}</p>`;
    if (b.premises) h += `<h5>S4 · ground floor</h5><p>${b.premises} commercial premises in the 2025 survey, ${b.vacant} vacant.</p>${b.ground_floor ? `<p class="sub">${esc(b.ground_floor)}</p>` : ""}`;
    if (inside.length) h += `<h5>S4 · places inside (${inside.length})</h5><ul class="lab-places">${inside.map(p =>
      `<li><button type="button" class="sx-link" data-place="${p.id}">${esc(p.name || "(no name)")}</button> <span class="sub">${esc(p.kind)}${p.hours ? " · has hours" : ""}</span></li>`).join("")}</ul>`;
    h += `<h5>S4 · reached from</h5>` + (b.access ? `<p><button type="button" class="sx-link" data-seg="${b.access}">${esc(b.access_street)} (${b.access})</button>, ${b.access_m} m away</p>
      <p class="sub">An assumption: the nearest street people may walk on. Where the doors are is not known yet.</p>` : `<p class="warn">No street people may walk on within ${S4.meta.access_max_m} m.</p>`);
    return h;
  }
  function placeHTML(p) {
    const b = p.building && b4[p.building];
    return `<h4>${esc(p.name || "(no name)")}</h4><p class="sub">${p.id} · ${esc(p.kind)}</p>
      <p>From ${esc(SRC4[p.source] || p.source)} <span class="sub">${esc(p.source_id)}</span></p>
      <p>${p.hours ? `Opening hours: ${esc(p.hours)}` : `<span class="sub">No opening hours given.</span>`}</p>` +
      (p.same_as ? `<p class="sub">The same name in the same building as <button type="button" class="sx-link" data-place="${p.same_as}">${esc(place4[p.same_as].name)}</button> from OpenStreetMap: probably one place, listed by two sources.</p>` : "") +
      (b ? `<p>In <button type="button" class="sx-link" data-b="${b.id}">${esc(b.name || b.id)}</button>${p.placed === "near" ? ` <span class="sub">(next to it: the nearest outline within ${S4.meta.near_m} m)</span>` : ""}</p>` : `<p class="sub">${esc(p.reason)}</p>`);
  }

  function signLine(s) {
    const where = s.along === null ? "" : ` · ${Math.abs(s.along).toFixed(0)} m ${s.along >= 0 ? "before" : "past"} the junction, ${Math.abs(s.side).toFixed(0)} m to the ${s.side >= 0 ? "right" : "left"}`;
    const sure = { high: "only street it fits", medium: "best of several streets", redundant: "repeats what the street allows", none: "fits no street" }[s.confidence] || s.confidence;
    return `<li><b>${esc(s.meaning || s.text)}</b> <span class="fr">${esc(s.text)}</span><br><span class="sub">post ${esc(s.post)}${where} · ${esc(sure)}${s.timed ? " · holds only at some hours" : ""}</span></li>`;
  }

  function junctionHTML(id) {
    const j = jun[id];
    let h = `<h4>${id}</h4><p class="sub">S1 · ${esc(j.kind.replace("_", " "))}${j.status ? " (" + esc(j.status) + ")" : ""}</p>`;
    if (!S3 || !r3.jun[id]) return h;
    const J = r3.jun[id], list = r3.appsAt[id] || [];
    h += `<p class="sub">${esc(J.streets.join(" × "))}</p><h5>S3 · ${esc(CONTROL[J.control])}</h5>`;
    if (J.control === "lights") h += `<p>${(r3.lightsAt[id] || []).map(l => `Light ${esc(l.id)} (${esc(l.streets)}), ${l.distance} m away${l.kind === "temporary" ? ", temporary" : ""}.`).join(" ")}</p>`;
    if (J.note) h += `<p class="sub">${esc(J.note)}</p>`;
    h += `<p class="sub">Pick a street arriving here.</p><ul class="sx-apps">` + list.map(a => {
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

  // ================================================================ 7 tests
  function testsHTML() {
    const block = (name, made, tests, stress) => `<details><summary>${name} <span class="sub">${made}</span> ${badge(tests)}</summary>
      <ul class="lab-testlist">${tests.map(t => `<li><span class="st ${t.status}">${t.status === "pass" ? "PASS" : t.status === "fail" ? "FAIL" : "info"}</span> <b>${t.id}</b> ${esc(t.title)}${t.lines.length ? `<pre>${esc(t.lines.join("\n"))}</pre>` : ""}</li>`).join("")}</ul>
      ${stress && stress.length ? `<p class="sub">Stress tests</p><ul class="lab-testlist">${stress.map(t => `<li><b>${t.id}</b> ${esc(t.title)}<pre>${esc(t.lines.join("\n"))}</pre></li>`).join("")}</ul>` : ""}</details>`;
    const badge = ts => { const f = ts.filter(t => t.status === "fail").length, p = ts.filter(t => t.status === "pass").length; return f ? `<span class="st fail">${f} FAIL</span>` : `<span class="st pass">${p} PASS</span>`; };
    return block("S1 Streets", S1.meta.made, S1.tests || [], null) + (S2 ? block("S2 Scores", S2.meta.made, S2.tests || [], S2.stress) : "") +
      (S3 ? block("S3 Rules", S3.meta.made, S3.tests || [], S3.stress) : "") +
      (S4 ? block("S4 Buildings", S4.meta.made, S4.tests || [], S4.stress) : "") +
      `<p class="sub">Run them yourself: <a href="setup.html">Run it yourself</a>. The Lab's own checks: <a href="lab-notes.html">Lab notes</a>.</p>`;
  }

  // ================================================================ 8 selection and start-up
  function render() {
    const html = panelHTML();
    side.innerHTML = html;
    side.hidden = !html;
    host.querySelectorAll(".lab-sub[data-for]").forEach(d => d.hidden = d.dataset.for !== state.paint);
    $(".lab-s4sub").hidden = !state.show.s4;
    $(".lab-radius").max = RADII[state.s2net].length - 1;
    if (state.s2radius > RADII[state.s2net].length - 1) state.s2radius = RADII[state.s2net].length - 1;
    $(".lab-radius").value = state.s2radius;
    $(".lab-radius-label").textContent = RADIUS_NAME(RADII[state.s2net][state.s2radius]);
    updateReach();
    updateRoute();
    if (S3) { updateShake(); updateLights(); updateTol(); }
    paint();
    draw();
  }

  function select(pick, approach) {
    const before = state.pick;
    state.pick = pick; state.approach = approach || null;
    render();
    if (!pick) return;
    const same = before && before.kind === pick.kind && before.id === pick.id;
    if (same) return;
    const mid = r => [r.reduce((a, p) => a + p[0], 0) / r.length, r.reduce((a, p) => a + p[1], 0) / r.length];
    const xy = pick.kind === "junction" ? jun[pick.id].xy : pick.kind === "segment" ? seg[pick.id].pts[Math.floor(seg[pick.id].pts.length / 2)]
      : pick.kind === "building" ? mid(b4[pick.id].ring) : pick.kind === "place" ? place4[pick.id].xy
      : ({ check1: S1, check3: S3, check4: S4 })[pick.kind].checkpoints.find(c => c.id === pick.id).xy;
    map.zoomTo(xy, pick.kind === "junction" ? 200 : 360);
  }

  function clickJunction(id) {
    if (state.tool === "reach") { state.reachStart = id; state.reachStep = 0; render(); playReach(); return; }
    if (state.tool === "route") {
      if (!state.routeA || state.routeB) { state.routeA = id; state.routeB = null; }
      else if (id !== state.routeA) state.routeB = id;
      render(); return;
    }
    select({ kind: "junction", id });
  }
  function clickSegment(s) { select({ kind: "segment", id: s.id }); }

  // controls
  host.addEventListener("change", e => {
    const t = e.target;
    if (t.name === "paint") { state.paint = t.value; render(); }
    if (t.dataset.show) { state.show[t.dataset.show] = t.checked; render(); }
    if (t.classList.contains("lab-outside")) { state.reachOutside = t.checked; render(); }
  });
  host.addEventListener("input", e => {
    const t = e.target;
    if (t.classList.contains("lab-radius")) { state.s2radius = +t.value; render(); }
    if (t.classList.contains("lab-step")) { state.reachStep = +t.value; render(); }
    if (t.classList.contains("lab-shake")) { state.shake = +t.value; render(); }
    if (t.classList.contains("lab-light")) { state.lightNear = +t.value; render(); }
    if (t.classList.contains("lab-tol")) { state.speedTol = +t.value; render(); }
    if (t.classList.contains("lab-slack")) { state.routeSlack = +t.value; render(); }
  });
  host.addEventListener("click", e => {
    const b = e.target.closest("button");
    if (!b) return;
    const seg_ = b.closest(".lab-seg");
    if (seg_) {
      state[seg_.dataset.key] = b.dataset.v;
      seg_.querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b));
      if (seg_.dataset.key === "reachMode") state.reachStep = 0;
      render();
      if (seg_.dataset.key === "reachMode") playReach();
    }
    if (b.dataset.close) select(null);
    if (b.dataset.b) { if (!state.show.s4) $('[data-show="s4"]').click(); select({ kind: "building", id: b.dataset.b }); }
    if (b.dataset.place) { if (!state.show.places4) $('[data-show="places4"]').click(); select({ kind: "place", id: b.dataset.place }); }
    if (b.dataset.seg) select({ kind: "segment", id: b.dataset.seg });
    if (b.dataset.app) select(state.pick, b.dataset.app === state.approach ? null : b.dataset.app);
    if (b.dataset.j) { if (!state.show.s3control) $('[data-show="s3control"]').click(); select({ kind: "junction", id: b.dataset.j }, b.dataset.a); }
    if (b.dataset.play === "radius") playRadius();
    if (b.dataset.play === "reach") playReach();
  });
  // opening a tool makes it the active one; only one at a time
  host.querySelectorAll("details[data-tool]").forEach(d => d.addEventListener("toggle", () => {
    if (d.open) {
      host.querySelectorAll("details[data-tool]").forEach(o => { if (o !== d) o.open = false; });
      state.tool = d.dataset.tool;
    } else if (state.tool === d.dataset.tool) state.tool = null;
    render();
  }));

  // sliders that play: one step at a time, so the change is easy to follow
  let timer = null;
  function playRadius() {
    clearInterval(timer);
    state.paint = "s2"; $('input[name="paint"][value="s2"]').checked = true;
    state.s2radius = 0; render();
    timer = setInterval(() => {
      if (state.s2radius >= RADII[state.s2net].length - 1) { clearInterval(timer); return; }
      state.s2radius += 1; render();
    }, 1400);
  }
  function playReach() {
    clearInterval(timer);
    const steps = reachSteps();
    if (!steps) return;
    const max = Math.max(...steps);
    state.reachStep = 0; render();
    timer = setInterval(() => {
      if (state.reachStep >= max) { clearInterval(timer); return; }
      state.reachStep += 1; render();
    }, 450);
  }

  // a link like lab.html#J027-S020 opens a junction, and a street arriving at it
  function fromHash() {
    if (location.hash === "#radius") { $('input[name="paint"][value="s2"]').click(); return; }
    const r = /^#reach(?:-(J\d{3}))?$/.exec(location.hash);
    if (r) {
      $('details[data-tool="reach"]').open = true;
      state.tool = "reach";
      if (r[1] && jun[r[1]]) { state.reachStart = r[1]; render(); playReach(); }
      return;
    }
    const q = /^#route-(J\d{3})-(J\d{3})$/.exec(location.hash);
    if (q && jun[q[1]] && jun[q[2]]) {
      $('details[data-tool="route"]').open = true;
      state.tool = "route"; state.routeA = q[1]; state.routeB = q[2]; render();
      return;
    }
    if (location.hash === "#stress") { $('details[data-tool="shake"]').open = true; return; }
    const w = /^#(s4|[wr]\d+)$/.exec(location.hash);
    if (w && S4) {
      if (!state.show.s4) $('[data-show="s4"]').click();
      if (b4[w[1]]) select({ kind: "building", id: w[1] });
      return;
    }
    const m = /^#(J\d{3})(?:-(S\d{3}))?$/.exec(location.hash);
    if (!m || !jun[m[1]]) return;
    if (S3 && !state.show.s3control) $('[data-show="s3control"]').click();
    select({ kind: "junction", id: m[1] }, m[2] && r3.app[m[2] + "@" + m[1]] ? m[2] : null);
  }
  window.addEventListener("hashchange", fromHash);

  $(".lab-tests").innerHTML = testsHTML();
  render();
  map.fit(false);
  fromHash();
})();
