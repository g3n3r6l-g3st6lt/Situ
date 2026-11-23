/*
  lab.js  -  the Situ Lab: one map, one system at a time, tried and tested.

  It reads the files the systems' web.py scripts wrote:
    window.SITU_S1   outputs/s1/web_data.js   streets, junctions, reach from every junction
    window.SITU_S2   outputs/s2/web_data.js   space syntax values per segment
    window.SITU_S3   outputs/s3/web_data.js   rules, signs, lights, speed
    window.SITU_S4   outputs/s4/web_data.js   buildings, their uses and sources, places
    window.SITU_S5   outputs/s5/web_data.js   counts by hour at counted junctions, each place's week
    window.SITU_S6   outputs/s6/web_data.js   trees, hydrants, furniture, lights, cameras, crossings, road works, sidewalks and islands
    window.SITU_S7   outputs/s7/web_data.js   commuters from each building with homes, the census's hour bands, the STM stops
    window.SITU_S8   outputs/s8/web_data.js   what can be seen from each walkable street: isovist measures, one view per segment
    window.SITU_S9   outputs/s9/web_data.js   the morning on foot, imagined under three readings, and the counted junctions
    window.SITU_S1_ROUTES  outputs/s1/routes_data.js  shortest distances and routes between every pair of junctions
    window.SITU_G1   outputs/g1/web_data.js   each building's height as G1 World chose it, and the heights it discarded, with why
    window.SITU_MATERIALS  outputs/materials/web_data.js  the materials library: entries recorded on a building, with the photo's credit
    window.SITU_HIST outputs/hist/web_data.js     the past era: the 1912 segment map (H-S1) and its space syntax values (H-S2)

  It computes nothing about the city. Every colour and every value shows what the Python code already
  produced, and tools/test_lab.py checks that these files match the tables. One exception, kept small:
  the route tool applies the rules in assets/routes.js to the distances routes.py wrote (test L5).

  The page: an era switch (today, 1912, or the two compared), an Overview, and one tab per system. Each system tab
  paints the map its own way, has at most two controls, lists its checkpoints with the reason each one matters,
  and shows its tests. Clicking a street, a junction or a building on a system's tab shows only what that system
  knows about it; the Overview collects what every system knows about it in one panel (added 2026-11-23).

  Structure
    1 data and indexes      4 overlays             7 the side: tabs, controls, checkpoints, tests
    2 the page              5 tools: reach, route  8 selection and start-up
    3 painting              6 the detail panel
*/
(function () {
  const S1 = window.SITU_S1, S2 = window.SITU_S2, S3 = window.SITU_S3, S4 = window.SITU_S4, S5 = window.SITU_S5, S6 = window.SITU_S6, S7 = window.SITU_S7, S8 = window.SITU_S8, S9 = window.SITU_S9, RT = window.SITU_S1_ROUTES, SR = window.SituRoutes, G1 = window.SITU_G1, MAT = window.SITU_MATERIALS, H = window.SITU_HIST;
  const mat4 = {};                                 // building -> materials library entries recorded on it
  if (MAT) MAT.entries.forEach(m => (mat4[m.building] = mat4[m.building] || []).push(m));
  const gen4 = {};                                 // building -> colour studies an image model made from a photo of it
  if (MAT && MAT.generated) MAT.generated.forEach(m => (gen4[m.building] = gen4[m.building] || []).push(m));
  if (MAT && MAT.sets) MAT.sets.forEach(m => (gen4[m.building] = gen4[m.building] || []).push(m));     // map sets drawn by a script from references
  const WALL = MAT && MAT.walls ? MAT.walls.buildings : {};      // building -> [material, sure, photo, date, why empty]
  const WALL_COL = { "brick, red": "#b5523b", "brick, brown": "#8a5a3c", "brick, buff or cream": "#d8c49a", "brick, dark": "#4a3a36",
    "stone, dressed": "#a8a39a", "stone, rough-faced": "#7f7a70", "concrete or render": "#c9c9c9", "metal cladding": "#5b8fb3",
    "panels": "#9fb5a5", "glass": "#6fc1d6", "siding": "#b08fc0", "under construction": "#e0a030" };
  const wallOf = id => WALL[id] && WALL[id][0] ? WALL[id] : null;
  const host = document.getElementById("situ-lab");
  if (!host) return;
  if (!S1 || !window.SituMap) {                 // the streets or the map code did not load: say so, never a blank page
    host.innerHTML = `<p class="lab-loading lab-failed" role="alert">The Lab could not load ${!S1 ? "the streets (outputs/s1/web_data.js)" : "the map code (assets/situ-map.js)"}. Reload the page; if this stays, the file is missing from the site.</p>`;
    return;
  }

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
  if (S6) S6.objects.forEach(o => {                         // the file leaves empty fields out; here they are empty again
    for (const k of S6.meta.fields || []) if (o[k] === undefined) o[k] = "";
    if (o.size === undefined) o.size = null;
    o.size_unit = (S6.meta.size_unit || {})[o.kind] || "";
  });
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
    "missing outline?": "Hundreds of properties sit at one address point with no building drawn. OpenStreetMap may not have this building yet.",
    "not seen lately": "Mapillary's software found this object only in photos taken before 2023. Griffintown has been rebuilt street by street since, and it may be gone.",
    "homes in a tract with no 2021 residents": "These homes stand in a tract where nobody lived at the 2021 census, probably because the building is newer. S7 gives them the rates of the lived-in tracts.",
    "viewpoint inside a building": "A viewpoint on this street falls inside a building outline. The street may pass under a building, or the outline may be drawn over the street. Its view is measured from inside the outline, so it is near zero.",
"workers with no workplace": "People arrive to work in this part of a census tract, but S4 lists no building with business premises in it. S9 cannot send them anywhere, so it leaves them out.",
    "counted, but no commuter passes": "The city counted many pedestrians here, and none of S9's commuters walks through in any reading. Whoever they are, they come from outside this slice of S9.",
    "view beyond the mapped buildings": "Many sight lines from this street leave the box of buildings S8 read. Past that box the view is unknown, not open."
  };

  // ================================================================ 2 the page
  const RADII = { ped: ["200", "400", "800", "n"], veh: ["1200", "2000"] };
  const RADIUS_NAME = r => r === "n" ? "whole island" : r + " m";
  const TABS = [
    { id: "all", tag: "ALL", name: "Overview: every system at once", ok: true, past: true },
    { id: "s1", name: "Streets", ok: true, past: true },
    { id: "s2", name: "Scores", ok: !!S2, past: true },
    { id: "s3", name: "Rules", ok: !!S3 },
    { id: "s4", name: "Buildings", ok: !!S4, past: true },
    { id: "s5", name: "Rhythm", ok: !!S5 && !!S4 },
    { id: "s6", name: "Streetscape", ok: !!S6 },
    { id: "s7", name: "Commuters", ok: !!S7 },
    { id: "s8", name: "Views", ok: !!S8 },
    { id: "s9", name: "Observer", ok: !!S9 },
    { id: "mat", tag: "M", name: "Materials", ok: !!MAT && !!S4 },   // the materials library: not a system, a record of the walls
  ];
  const state = {
    era: "now",                      // "now", "1912" or "compare" (1912 above, today below, moving together)
    hmeasure: "nach", hradius: "800", hbld: "1912",     // the past's buildings: outlines on the 1912 atlas, the May 1918 plan, or carried to c1927
    tab: "s1",
    s1try: "details", s1mode: "walk", reachStart: null, reachStep: 0, routeA: null, routeB: null, routeSlack: 2,
    s2net: "ped", s2measure: "NACH", s2radius: 2, s2view: "one",
    s3view: "rules",
    s4colour: "use", s4places: false, s4odb: false,
    matPanels: false, matView: "walls",               // Materials tab: every building's wall as read from photos, or the library's entries                                  // show a building's recorded materials in its panel on every tab
    s5day: "1", s5hour: 17, s5mode: "pedestrian", s5season: "summer",
    s6show: "all", s6colour: "material", s6canopy: false,
    s7show: "all",
    s8measure: "area_m2",
    s9reading: "shortest", s9hour: "all", s9view: "walkers", s9against: "ped_NACH_n",
    onlyOpen: false,
    s8tool: "colour", walkA: null, walkB: null, walkPos: 0, minA: null,
    pick: null,                      // {kind: "junction"|"segment"|"building"|"place"|"check", id}
    approach: null,
  };

  host.innerHTML = `
  <div class="lab-top">
  <div class="lab-era" role="group" aria-label="Era">${[["now", "Today"], ["1912", "1912"], ["compare", "Compare"]].map(([v, l]) =>
    `<button type="button" data-era="${v}"${v !== "now" && !H ? ' disabled title="The past era\'s data did not load (outputs/hist/web_data.js)"' : ""} aria-pressed="${v === "now"}">${l}</button>`).join("")}</div>
  <div class="lab-tabs" role="tablist" aria-label="Systems">${TABS.map(t =>
    `<button type="button" role="tab" data-tab="${t.id}"${t.id === "all" ? ' class="lab-all"' : ""}${t.ok ? "" : ` disabled title="This system's data did not load (outputs/${t.id}/web_data.js)"`}><span>${t.tag || t.id.toUpperCase()}</span>${t.name}</button>`).join("")}</div>
  </div>
  <div class="lab-main">
    <div class="lab-maps">
      <div class="lab-pmap" hidden><span class="lab-maptag">1912</span></div>
      <div class="lab-map"><span class="lab-maptag">today</span></div>
    </div>
    <form class="lab-find" role="search" autocomplete="off">
      <label for="lab-find-in">Find a street</label>
      <input id="lab-find-in" type="search" list="lab-find-list" placeholder="a street, or an id like S101">
      <datalist id="lab-find-list">${[...new Set(S1.segments.map(s => s.street).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr")).map(n => `<option value="${esc(n)}"></option>`).join("")}</datalist>
      <span class="lab-find-out" role="status"></span>
    </form>
    <aside class="sx-panel lab-panel" hidden aria-live="polite" aria-label="Details of what is selected"></aside>
    <div class="lab-key"></div>
  </div>
  <div class="lab-side"></div>`;

  const $ = q => host.querySelector(q);
  const side = $(".lab-panel"), key = $(".lab-key"), info = $(".lab-side");
  const narrow = () => window.matchMedia("(max-width: 900px)").matches;
  const map = new SituMap($(".lab-map"), S1.segments.flatMap(s => s.pts));
  // icons, drawn in a 24-unit box around 0,0 and coloured by their class (currentColor)
  const ICONS = {
    tree: '<circle r="8" fill="currentColor" fill-opacity="0.3" stroke="currentColor" stroke-width="2"/><circle r="2" fill="currentColor"/>',
    hydrant: '<path d="M-4 9V-4a4 4 0 0 1 8 0V9ZM-7-1h3M4-1h3M-5-7h10" fill="currentColor" stroke="currentColor" stroke-width="1.5"/>',
    bench: '<path d="M-10-3h20M-10 2h20M-8 2v7M8 2v7" fill="none" stroke="currentColor" stroke-width="2.4"/>',
    bin: '<path d="M-7-6h14M-5-6l1.5 14h7L5-6M-2-9h4" fill="none" stroke="currentColor" stroke-width="2"/>',
    bike: '<g fill="none" stroke="currentColor" stroke-width="2"><circle cx="-5" cy="3" r="4.5"/><circle cx="5" cy="3" r="4.5"/><path d="M-5 3l4-8h6l1 8M-1-5h-3"/></g>',
    table: '<path d="M-10-3h20M-6-3l-3 11M6-3l3 11M-8 3h16" fill="none" stroke="currentColor" stroke-width="2.2"/>',
    water: '<path d="M0-10C5-3 7 0 7 3A7 7 0 0 1-7 3C-7 0-5-3 0-10Z" fill="currentColor" fill-opacity="0.5" stroke="currentColor" stroke-width="1.8"/>',
    shelter: '<path d="M-10-4L0-9 10-4M-8-4v12M8-4v12" fill="none" stroke="currentColor" stroke-width="2.2"/>',
    light: '<path d="M-2 10V-6h7" fill="none" stroke="currentColor" stroke-width="2.2"/><circle cx="6" cy="-4" r="3.2" fill="currentColor"/>',
    camera: '<path d="M-9-5h11v10H-9ZM2-2l7-4v12l-7-4" fill="currentColor" fill-opacity="0.35" stroke="currentColor" stroke-width="1.8"/>',
    crossing: '<path d="M-8-8v16M-3-8v16M2-8v16M7-8v16" fill="none" stroke="currentColor" stroke-width="2.6"/>',
    work: '<path d="M0-10L10 8H-10Z" fill="currentColor" fill-opacity="0.3" stroke="currentColor" stroke-width="2"/><path d="M-5 2h10" stroke="currentColor" stroke-width="2"/>',
    other: '<rect x="-5" y="-5" width="10" height="10" fill="currentColor"/>',
  };
  map.defs().innerHTML = Object.entries(ICONS).map(([k, v]) => `<symbol id="i-${k}" viewBox="-12 -12 24 24" overflow="visible">${v}</symbol>`).join("");
  map.cover = () => side.hidden || narrow() ? 0 : side.offsetWidth + 16;
  // the past era has a map of its own, on the same ground and origin: alone in 1912, above today's in Compare.
  // The two move together, so a place sits at the same spot on both and each can be clicked on its own.
  const pmap = new SituMap($(".lab-pmap"), S1.segments.flatMap(s => s.pts));
  pmap.cover = map.cover;
  const link = (a, b) => { const own = a.apply.bind(a); a.apply = function (later) { own(later);
    if (link.busy || b.host.hidden) return; link.busy = true; b.view = Object.assign({}, a.view); b.autoFit = a.autoFit; b.apply(later); link.busy = false; }; };
  link(map, pmap); link(pmap, map);
  const shownMap = () => state.era === "1912" ? pmap : map;

  // ================================================================ 3 painting
  const USE_CLASS = u => u ? "u-" + u.replace(/ /g, "-") : "u-unknown";
  const bLayer = map.layer("buildings");             // made first, so the streets lie on top
  const bEl = {};
  if (S4) S4.buildings.forEach(b => {
    const e = map.path(bLayer, "M" + b.ring.map(p => map.P(p).join(",")).join("L") + "Z", { class: "lab-bld", "data-b": b.id });
    e.addEventListener("pointermove", ev => map.tip(ev, `${esc(b.name || b.id)}<br><span>${esc(b.use || "use unknown")}${b.dwellings ? " · " + b.dwellings + " dwellings" : ""}</span>`));
    e.addEventListener("pointerleave", () => map.untip());
    e.addEventListener("click", () => { if (!map.wasDrag()) select({ kind: "building", id: b.id }); });
    bEl[b.id] = e;
  });

  const sLayer = map.layer("surfaces");            // sidewalks, islands and road surfaces, under the streets
  const cLayer = map.layer("canopy");              // the 2019 canopy (S6), over the surfaces, under the streets
  if (S6 && S6.canopy) S6.canopy.forEach(c => map.path(cLayer, c.rings.map(r => "M" + r.map(p => map.P(p).join(",")).join("L") + "Z").join(""),
    { class: "lab-canopy", "fill-rule": "evenodd" }));
  const sfEl = {};
  if (S6) S6.surfaces.forEach(s => {
    const e = map.path(sLayer, "M" + s.ring.map(p => map.P(p).join(",")).join("L") + "Z", { class: "lab-surf6" });
    e.addEventListener("pointermove", ev => map.tip(ev, `${s.kind} ${s.id}<br><span>${esc(s.material || "material not given")}${s.built ? " · built " + s.built : ""}${s.width != null ? " · about " + s.width.toFixed(1) + " m wide" : ""}</span>`));
    e.addEventListener("pointerleave", () => map.untip());
    e.addEventListener("click", () => { if (!map.wasDrag()) select({ kind: "surf6", id: s.id }); });
    sfEl[s.id] = e;
  });

  // the past era (H-S1, H-S2): two layers of its own, under today's streets, shown only in the 1912 and compare views
  const hbLayer = pmap.layer("histb"), h1Layer = pmap.layer("hist1"), h2Layer = pmap.layer("hist2");
  const hbEl = {}, hbRec = {};
  const HB_COL = { brick: "brick", "brick or stone": "brick", frame: "frame", "stone or concrete": "stone" };
  if (H && H.buildings) Object.entries(H.buildings).forEach(([yr, list]) => list.forEach(b => {
    const id = b.footprint_id || b.building_id;
    hbRec[id] = Object.assign({ year: yr, id }, b);
    const e = pmap.path(hbLayer, "M" + b.ring.map(p => pmap.P(p).join(",")).join("L") + "Z", { class: "lab-hbld", "data-yr": yr });
    e.addEventListener("pointermove", ev => pmap.tip(ev, `${esc(b.occupant || id)}<br><span>${yr === "c1927" ? "carried to c1927" : yr} · ${esc(b.construction || "construction unknown")}${b.storeys_raw || b.storeys ? " · " + esc(b.storeys_raw || b.storeys) + " storeys" : ""}</span>`));
    e.addEventListener("pointerleave", () => pmap.untip());
    e.addEventListener("click", () => { if (!pmap.wasDrag()) select({ kind: "hbld", id }); });
    hbEl[id] = e;
  }));
  const hseg = {}, hnet = {}, h1El = {}, h2El = {};
  const HZONE = { core: "inside the study area", halo: "in the 150 m halo", ring: "in the ring beyond the halo" };
  const HCLS = { street: "street", lane: "lane or court", open_area: "open area" };
  if (H) {
    H.segments.forEach(s => {
      hseg[s.id] = s;
      h1El[s.id] = pmap.line(h1Layer, s.pts, { class: "lab-hist" });
      const hit = pmap.line(h1Layer, s.pts, { class: "sx-hit" });
      hit.addEventListener("pointermove", ev => pmap.tip(ev, `${esc(s.name || "no name")} <span>${s.id} · 1912</span><br><span>${esc(HCLS[s.cls] || s.cls)}, name ${esc(s.status)}</span>`));
      hit.addEventListener("pointerleave", () => pmap.untip());
      hit.addEventListener("click", () => { if (!pmap.wasDrag()) select({ kind: "hseg", id: s.id }); });
    });
    H.net.forEach(n => {
      hnet[n.id] = n;
      h2El[n.id] = pmap.line(h2Layer, n.pts, { class: "lab-hist" });
      const hit = pmap.line(h2Layer, n.pts, { class: "sx-hit" });
      hit.addEventListener("pointermove", ev => pmap.tip(ev, `${esc(n.name || "no name")} <span>${n.id} · 1912</span><br><span>${n.report ? hcol() + ": " + fmt(n.v[hcol()]) : "ring: not reported"}</span>`));
      hit.addEventListener("pointerleave", () => pmap.untip());
      hit.addEventListener("click", () => { if (!pmap.wasDrag()) select({ kind: "hnet", id: n.id }); });
    });
  }
  const hcol = () => state.hmeasure + "_" + state.hradius;
  // in Compare, both eras are shown on the same footprint: the study area. Outside it, each era has its own context
  // (today's edge streets, 1912's halo and ring), drawn faint and left out of the ranking, so like is set beside like.
  const insideB = (p, ring) => { let ins = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j]; if ((yi > p[1]) !== (yj > p[1]) && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) ins = !ins; } return ins; };
  const inArea = {};
  if (H) S1.segments.forEach(s => inArea[s.id] = insideB(s.pts[Math.floor(s.pts.length / 2)], H.boundary));
  const past = () => state.era !== "now";

  const streets = map.layer("streets");
  const segEl = {};
  S1.segments.forEach(s => {
    segEl[s.id] = map.line(streets, s.pts, { class: "lab-street", "data-seg": s.id });
    const hit = map.line(streets, s.pts, { class: "sx-hit" });
    hit.addEventListener("pointermove", ev => map.tip(ev, esc(s.street) + ` <span>${s.id}</span>` + tipValue(s)));
    hit.addEventListener("pointerleave", () => map.untip());
    hit.addEventListener("click", () => { if (!map.wasDrag()) select({ kind: "segment", id: s.id }); });
  });

  function s2col() { return `${state.s2net}_${state.s2measure}_${RADII[state.s2net][state.s2radius]}`; }

  // rank colouring, as on the S2 sheets: values bunch up, ranks spread them evenly
  function ranks(col) {
    if (state.era === "compare" && H) return ranksIn(col);
    const vals = S1.segments.map(s => S2.scores[s.id] && S2.scores[s.id][col]).filter(v => v != null).sort((a, b) => a - b);
    const rank = v => { let lo = 0, hi = vals.length; while (lo < hi) { const m = (lo + hi) >> 1; vals[m] < v ? lo = m + 1 : hi = m; } return lo / Math.max(1, vals.length - 1); };
    return { rank, vals };
  }
  function ranksIn(col) {           // Compare: today's streets ranked among those inside the study area only
    const vals = S1.segments.filter(s => inArea[s.id]).map(s => S2.scores[s.id] && S2.scores[s.id][col]).filter(v => v != null).sort((a, b) => a - b);
    return { vals, rank: v => vals.filter(x => x < v).length / Math.max(1, vals.length - 1) };
  }
  function ranks8(col) {
    const vals = Object.values(S8.segments).map(v => v[col]).sort((a, b) => a - b);
    const rank = v => { let lo = 0, hi = vals.length; while (lo < hi) { const m = (lo + hi) >> 1; vals[m] < v ? lo = m + 1 : hi = m; } return lo / Math.max(1, vals.length - 1); };
    return { rank, vals };
  }
  const flow9 = (id, rd) => { const f = S9 && S9.flows[id] && S9.flows[id][rd || state.s9reading]; if (!f) return 0;
    return state.s9hour === "all" ? f.reduce((a, b) => a + b, 0) : f[S9.meta.hours.indexOf(+state.s9hour)]; };
  const hour9 = () => state.s9hour === "7" ? "7" : "8";          // the counts are compared at 7 and 8 h
  const MEASURE8 = { area_m2: ["area seen", "m²"], longest_m: ["longest sight line", "m"], compactness: ["compactness", ""] };
  function ramp(t) {                         // blue, through teal, to yellow: low to high
    const stops = [[70, 90, 170], [46, 196, 182], [250, 225, 100]];
    const k = t < 0.5 ? 0 : 1, u = t < 0.5 ? t / 0.5 : (t - 0.5) / 0.5;
    const c = stops[k].map((x, i) => Math.round(x + (stops[k + 1][i] - x) * u));
    return `rgb(${c.join(",")})`;
  }

  // Two orders on one map (added 2026-10-21). For each street: its place in one order minus its place in the other,
  // from -1 to 1, worked out in Python (common/ranks.py) and only shown here. Yellow: higher in the first, blue: higher
  // in the second, grey: about the same; the line also widens with the gap, so colour is not the only cue.
  const AGAINST = { ped_NACH_n: "walking choice, whole island", ped_NACH_800: "walking choice, 800 m", ped_NAIN_n: "walking integration, whole island" };
  function s2changeCol() { const R = RADII[state.s2net]; return `${state.s2net}_${state.s2measure}_${R[Math.min(state.s2radius, R.length - 2)]}`; }
  function diffNow() {
    if (state.tab === "s2" && state.s2view === "change" && S2.change) return S2.change[s2changeCol()] || null;
    if (state.tab === "s9" && state.s9view === "against" && S9 && S9.against) return S9.against[state.s9against + "|" + state.s9reading] || null;
    return null;
  }
  function divStyle(d) {
    const t = Math.min(1, Math.abs(d) / 0.6), a = [105, 105, 105], b = d > 0 ? [255, 196, 61] : [61, 155, 255];
    return `stroke:rgb(${a.map((x, i) => Math.round(x + (b[i] - x) * t)).join(",")});stroke-width:${(1 + 4.5 * t).toFixed(2)}px`;
  }
  const sgn = d => (d > 0 ? "+" : d < 0 ? "−" : "") + Math.abs(d).toFixed(2);
  function diffLists(d, upLabel, downLabel) {
    const e = Object.entries(d), li = ([id, v]) => `<li><button type="button" class="sx-link" data-seg="${id}">${esc(seg[id].street || "a path")} (${id})</button> <span class="sub">${sgn(v)}</span></li>`;
    const up = e.filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, 5), down = e.filter(x => x[1] < 0).sort((a, b) => a[1] - b[1]).slice(0, 5);
    return `<h3 class="lab-s">${upLabel}</h3><ul class="lab-clist lab-diff">${up.map(li).join("")}</ul><h3 class="lab-s">${downLabel}</h3><ul class="lab-clist lab-diff">${down.map(li).join("")}</ul>`;
  }
  // what is still open on this tab, for "only what is unresolved"
  function openCount() {
    const t = state.tab;
    let n = checksOf(t).filter(c => !settled(c)).length;
    if (t === "s2") { const d = diffNow(); n += S1.segments.filter(x => d ? d[x.id] == null : !(S2.scores[x.id] && S2.scores[x.id][s2col()] != null)).length; }
    if (t === "s4" && S4) n += S4.buildings.filter(b => !b.use).length;
    if (t === "s6" && S6) n += S6.objects.filter(o => SLUG6[o.kind] && o.source !== "osm" && o.surveyed < S6_SEEN).length;
    if (t === "s8" && S8 && state.s8tool !== "walk") n += S1.segments.filter(x => !S8.segments[x.id]).length;
    return n;
  }

  function tipValue(s) {
    const dd = diffNow();
    if (dd) return `<br><span>${dd[s.id] == null ? "not compared" : (state.tab === "s2" ? "place within " + RADIUS_NAME(s2changeCol().split("_")[2]) + " minus place on the whole island: " : "place among walkers minus place in " + AGAINST[state.s9against] + ": ") + (dd[s.id] == null ? "" : sgn(dd[s.id]))}</span>`;
    if (state.tab === "s2" && S2) { const v = S2.scores[s.id] && S2.scores[s.id][s2col()]; return `<br><span>${esc(s2col())}: ${fmt(v)}</span>`; }
    if (state.tab === "s3" && state.s3view === "speed") { const r = r3.speed[s.id]; return `<br><span>${r && r.speed ? r.speed + " km/h" : "no limit"}</span>`; }
    if (state.tab === "s9" && S9) return `<br><span>${Math.round(flow9(s.id))} walkers${state.s9hour === "all" ? " between 6 and 10 h" : " at " + state.s9hour + " h"}, ${state.s9reading}</span>`;
    if (state.tab === "s8" && S8) { const v = S8.segments[s.id]; return `<br><span>${v ? MEASURE8[state.s8measure][0] + ": " + fmt8(v[state.s8measure]) : "no viewpoint: not walkable, or outside the area"}</span>`; }
    return "";
  }

  function paintPast() {
    const on1 = H && past() && state.tab !== "s2", on2 = H && past() && state.tab === "s2", onb = H && H.buildings && past() && (state.tab === "s4" || state.tab === "all");

    h1Layer.style.display = on1 ? "" : "none";
    hbLayer.style.display = onb ? "" : "none";
    if (onb) Object.values(hbRec).forEach(b => hbEl[b.id].setAttribute("class", b.year !== state.hbld ? "lab-hbld off" :
      "lab-hbld " + (state.tab === "all" ? "ov" : HB_COL[b.construction] || "unknown") + (b.nested_in ? " nested" : "") + (state.pick && state.pick.kind === "hbld" && state.pick.id === b.id ? " picked" : "")));
    h2Layer.style.display = on2 ? "" : "none";
    $(".lab-pmap").hidden = !past(); $(".lab-map").hidden = state.era === "1912";
    $(".lab-maps").classList.toggle("split", state.era === "compare");
    if (on1) H.segments.forEach(s => h1El[s.id].setAttribute("class", "lab-hist " + (state.tab === "s4" ? "ring" : s.zone === "ring" || (state.era === "compare" && s.zone !== "core") ? "ring" : s.cls) + (state.tab !== "s4" && s.status !== "documented" ? " named-" + s.status : "") +
      (state.pick && state.pick.kind === "hseg" && state.pick.id === s.id ? " picked" : "")));
    if (on2) {
      const cmpArea = state.era === "compare";
      const counted = n => n.report && n.v[hcol()] != null && (!cmpArea || n.zone === "core");
      const vals = H.net.filter(counted).map(n => n.v[hcol()]).sort((a, b) => a - b);
      const rank = v => vals.filter(x => x < v).length / Math.max(1, vals.length - 1);
      H.net.forEach(n => {
        const e = h2El[n.id], v = counted(n) ? n.v[hcol()] : null;
        let style = "";
        if (v != null) { const t = rank(v); style = `stroke:${ramp(t)};stroke-width:${(1.2 + 2.6 * t).toFixed(2)}px`; }
        e.setAttribute("class", "lab-hist " + (n.report && (!cmpArea || n.zone === "core") ? (v == null ? "novalue" : "val") : "ring") + (state.pick && state.pick.kind === "hnet" && state.pick.id === n.id ? " picked" : ""));
        e.setAttribute("style", style);
      });
      return vals.length;
    }
    return 0;
  }

  function paint() {
    const hn = paintPast();
    if (state.era === "1912") { paintBuildings(); paintSurfaces(); drawKey(null, hn); return; }
    const col = state.tab === "s2" ? (state.era === "compare" ? "ped_" + state.hmeasure.toUpperCase() + "_" + state.hradius : s2col()) : null, rk = col ? ranks(col) : state.tab === "s8" && S8 ? ranks8(state.s8measure) : null;
    const dd = diffNow();
    const top9 = state.tab === "s9" && S9 ? Math.max(1, ...S1.segments.map(x => flow9(x.id))) : 1;
    const reach = reachSteps(), rt = routeNow();
    S1.segments.forEach((s, i) => {
      const e = segEl[s.id];
      let cls = "lab-street", style = "";
      if (state.tab === "all") cls += !car(s) ? " walk" : !s.walk ? " drive" : " both";
      if (state.tab === "s1") {
        cls += !car(s) ? " walk" : !s.walk ? " drive" : " both";
        if (s.source !== "geobase") cls += " added";
        if (reach) cls += reach[i] && reach[i] <= state.reachStep ? " reached" : " unreached";     // the reach replaces the paint
        if (rt) cls += rt.path.has(i) ? " route" : rt.wide.has(i) ? " corridor" : " unreached";      // so does a route
        if (state.s1try === "minutes" && state.minA) cls += " unreached";                             // and the minutes on foot
      }
      if (state.tab === "s2" && dd && state.era === "now") {
        if (dd[s.id] == null) cls += " novalue"; else style = divStyle(dd[s.id]);
      } else if (state.tab === "s2") {
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
      if (state.tab === "s7") cls += " plain faint";
      if (state.tab === "s9" && dd) {
        if (dd[s.id] == null) cls += " plain faint"; else style = divStyle(dd[s.id]);
      } else if (state.tab === "s9") {
        const v = flow9(s.id), top = top9;
        if (v < 0.5) cls += " plain faint";
        else { const t = Math.pow(v / top, 0.6); style = `stroke:${ramp(0.5 + t / 2)};stroke-width:${(1 + 6 * t).toFixed(2)}px`; }
      }
      if (state.tab === "s8" && state.s8tool === "walk") cls += " plain faint";
      else if (state.tab === "s8") {
        const v = S8.segments[s.id];
        if (!v) cls += " novalue";
        else { const t = rk.rank(v[state.s8measure]); style = `stroke:${ramp(t)};stroke-width:${(1.2 + 2.6 * t).toFixed(2)}px`; }
      }
      if (state.era === "compare" && H && !inArea[s.id]) { cls = "lab-street plain faint"; style = ""; }      // outside the study area: context only
      if (state.pick && state.pick.kind === "segment" && state.pick.id === s.id) cls += " picked";
      if (state.approach === s.id) cls += " picked";
      e.setAttribute("class", cls);
      e.setAttribute("style", style);
    });
    paintBuildings();
    paintSurfaces();
    drawKey(rk, hn);
  }

  function paintBuildings() {
    const cmp4 = state.era === "compare" && state.tab === "s4" && S4;
    const on = ((state.tab === "s4" || state.tab === "s8" || state.tab === "mat" || state.tab === "all") && S4 && state.era === "now") || cmp4;
    bLayer.style.display = on ? "" : "none";

    if (!on) return;
    if (cmp4) { S4.buildings.forEach(b => { bEl[b.id].style.fill = ""; bEl[b.id].setAttribute("class", "lab-bld ov" + (state.pick && state.pick.kind === "building" && state.pick.id === b.id ? " picked" : "")); }); return; }
    if (state.tab === "s8") { S4.buildings.forEach(b => bEl[b.id].setAttribute("class", "lab-bld view8")); return; }   // what stops a sight line
    if (state.tab === "all") { S4.buildings.forEach(b => { bEl[b.id].style.fill = ""; bEl[b.id].setAttribute("class", "lab-bld ov" + (state.pick && state.pick.kind === "building" && state.pick.id === b.id ? " picked" : "")); }); return; }
    S4.buildings.forEach(b => {
      const wl = state.tab === "mat" && state.matView === "walls" && wallOf(b.id);
      const m = state.tab === "mat" && (state.matView === "walls" ? (wl ? [{ colour: WALL_COL[wl[0]] }] : null) : mat4[b.id] || gen4[b.id]);
      let cls = "lab-bld " + (state.tab === "mat" ? (m ? "mat-yes" : "mat-none")
        : state.s4colour === "use" ? USE_CLASS(b.use) : state.s4colour === "height" ? "h-" + HEIGHT4(b) : "src-" + (b.use_source || "none"));
      bEl[b.id].style.fill = m ? m[0].colour : "";          // a recorded wall shows its measured mean colour
      if (state.pick && state.pick.kind === "building" && state.pick.id === b.id) cls += " picked";
      bEl[b.id].setAttribute("class", cls);
    });
  }

  function paintSurfaces() {
    const on = state.tab === "s6" && S6 && state.era === "now";
    sLayer.style.display = on ? "" : "none";
    cLayer.style.display = on && state.s6canopy ? "" : "none";
    if (!on) return;
    const band = s => state.s6colour === "material" ? "m-" + (s.material || "none").toLowerCase().replace(/[^a-z]+/g, "-")
      : !s.built ? "b-none" : s.built >= "2020" ? "b-new" : s.built >= "2010" ? "b-mid" : "b-old";
    S6.surfaces.forEach(s => sfEl[s.id].setAttribute("class", "lab-surf6 " + band(s) + (s.kind === "island" ? " island" : "") +
      (state.pick && state.pick.kind === "surf6" && state.pick.id === s.id ? " picked" : "")));
  }

  function drawKey(rk, hn) {
    if (past() && state.tab === "s4") {
      const M = H.meta.buildings[state.hbld];
      key.innerHTML = `<span><i class="kb hb-brick"></i>brick${state.hbld === "1912" ? " or stone" : ""}</span><span><i class="kb hb-frame"></i>frame</span>${state.hbld !== "1912" ? `<span><i class="kb hb-stone"></i>stone or concrete</span>` : ""}` +
        `<span><i class="kb hb-nested"></i>inside a larger outline</span><span>${state.hbld === "c1927" ? (M.outlines ? M.outlines + " outlines carried, on " + (M.blocks_1949 || []).length + " of " + H.blocks.length + " blocks; the rest is unknown in c1927" : "none carried yet: waiting for the 1949 plans") : M.outlines + " outlines on " + H.blocks.length + " blocks; the rest of the area is not traced yet"}</span>` + (state.era === "compare" ? `<span><i class="kb ov"></i>today's buildings (S4)</span>` : "");
      return;
    }
    if (past() && (state.tab === "s1" || state.tab === "all" || state.tab === "s2")) {
      const today = state.era === "compare" ? `<span><i class="k both"></i>today (S1)</span>` : "";
      const html = state.tab === "s2"
        ? (state.era === "compare"
          ? `<span class="lab-ramp"><i></i><i></i></span><span><b>walking ${state.hmeasure === "nach" ? "choice" : "integration"}, ${state.hradius} m</b>, each era ranked among its own streets inside the study area (1912: ${hn}): lowest blue, highest yellow</span><span><i class="k faint"></i>outside the study area: context, not ranked</span>`
          : `<span class="lab-ramp"><i></i><i></i></span><span><b>1912 walking ${state.hmeasure === "nach" ? "choice" : "integration"}, ${state.hradius} m</b>, by rank among the ${hn} reported segments: lowest blue, highest yellow</span><span><i class="k hring"></i>ring: analysed, not reported</span>`)
        : `<span><i class="k hstreet"></i>1912 street</span><span><i class="k hlane"></i>lane or court</span><span><i class="k hopen"></i>open area</span><span><i class="k hinfer"></i>name inferred or unknown</span><span><i class="k hring"></i>${state.era === "compare" ? "outside the study area (both eras): context" : "ring"}</span>` + today;
      key.innerHTML = html;
      return;
    }
    let html = "";
    if (state.tab === "s1") {
      if (state.s1try === "minutes") html = BANDS.map((m, b) => `<span><i class="k min${b}"></i>${b ? BANDS[b - 1] + " to " : "within "}${m} minutes</span>`).join("") + `<span><i class="k minbeyond"></i>further</span>`;
      else if (state.s1try === "reach" && reachSteps()) html = `<span><i class="k both"></i>reached by this step</span><span><i class="k faint"></i>not yet</span>`;
      else if (state.s1try === "route" && routeNow()) html = `<span><i class="k route"></i>shortest route</span><span><i class="k corridor"></i>a trip at most ${RT.meta.slacks[state.routeSlack]} % longer can pass here</span>`;
      else html = `<span><i class="k both"></i>walk and drive</span><span><i class="k walk"></i>walk only</span><span><i class="k drive"></i>drive only</span><span><i class="k added"></i>path I added</span><span><i class="kd gate"></i>gate</span><span><i class="kd dead"></i>dead end</span>`;
    }
    if (state.tab === "s2" && rk) {
      const q = p => rk.vals[Math.min(rk.vals.length - 1, Math.round(p * (rk.vals.length - 1)))];
      html = `<span class="lab-ramp"><em>${fmt(q(0))}</em><i></i><em>${fmt(q(0.5))}</em><i></i><em>${fmt(q(1))}</em></span>
        <span><b>${state.s2net === "ped" ? "walking" : "driving"} ${state.s2measure === "NACH" ? "choice" : "integration"}, ${RADIUS_NAME(RADII[state.s2net][state.s2radius])}</b>, by rank among ${rk.vals.length} segments: lowest blue, highest yellow</span><span><i class="k novalue"></i>no value (${S1.segments.length - rk.vals.length})</span>`;
    }
    if (state.tab === "mat" && MAT && S4 && state.matView === "walls" && MAT.walls) html = Object.entries(MAT.walls.counts).filter(([k]) => k).sort((a, b) => b[1] - a[1])
      .map(([k, n]) => `<span><i class="kb" style="background:${WALL_COL[k]}"></i>${esc(k)} ${n}</span>`).join("") + `<span><i class="kb mat-none"></i>not read ${MAT.walls.counts[""] || 0}</span>`;
    else if (state.tab === "mat" && MAT && S4) html = MAT.entries.concat((MAT.generated || []).concat(MAT.sets || []).filter(m => !mat4[m.building])).map(m => `<span><i class="kb" style="background:${m.colour}"></i>${esc(m.id)} ${esc(m.name)}</span>`).join("") +
      `<span><i class="kb mat-none"></i>no material recorded yet ${S4.buildings.filter(b => !mat4[b.id] && !gen4[b.id]).length}</span>`;
    if (state.tab === "s3") html = state.s3view === "speed"
      ? `<span><i class="k v40"></i>40 km/h</span><span><i class="k v30"></i>30</span><span><i class="k v20"></i>20</span><span><i class="k gap"></i>cars allowed, no limit</span><span>the wider the line, the higher the limit</span>`
      : `<span><i class="kd lights"></i>traffic lights</span><span><i class="kd allway"></i>all-way stop</span><span><i class="kb2"></i>a street that must stop</span>`;
    if (state.tab === "s8" && state.s8tool === "walk") html = `<span><i class="kd walka"></i>start and end</span><span><i class="k walkpath"></i>the walk</span><span><i class="kv8"></i>what the walker sees now</span><span><i class="kb8"></i>building outline</span>`;
    else if (state.tab === "s8" && rk) {
      const q = p => rk.vals[Math.min(rk.vals.length - 1, Math.round(p * (rk.vals.length - 1)))];
      html = `<span class="lab-ramp"><em>${fmt8(q(0))}</em><i></i><em>${fmt8(q(0.5))}</em><i></i><em>${fmt8(q(1))}</em></span>
        <span>${MEASURE8[state.s8measure][0]}: lowest blue, highest yellow</span><span><i class="k novalue"></i>no viewpoint</span><span><i class="kb8"></i>building outline</span>` +
        (state.pick && state.pick.kind === "segment" && S8.segments[state.pick.id] ? `<span><i class="kv8"></i>what the middle viewpoint sees</span>` : "");
    }
    if (state.tab === "s9" && S9) html = `<span><i class="k s9w"></i>commuters walking, wider for more</span><span><i class="k faint"></i>none</span>` +
      `<span><i class="kd count9"></i>junction the city counted, sized by pedestrians at ${hour9()} h</span><span><i class="kr9"></i>counted outside the area (weekdays)</span>`;
    const dd = diffNow();
    if (dd) {
      const first = state.tab === "s2" ? "within " + RADIUS_NAME(s2changeCol().split("_")[2]) : "among the walkers";
      const second = state.tab === "s2" ? (state.s2net === "ped" ? "on the whole island" : "within 2000 m") : "in " + AGAINST[state.s9against];
      html = `<span><i class="k dpos"></i>higher ${first}</span><span><i class="k dneg"></i>higher ${second}</span><span><i class="k dmid"></i>about the same</span>` +
        `<span>a wider line is a larger gap, over ${Object.keys(dd).length} streets</span>` + (state.tab === "s2" ? `<span><i class="k novalue"></i>no value</span>` : "");
    }
    if (state.tab === "s7" && S7) html = `<span><i class="kd home7"></i>building with homes, sized by its commuters</span><span><i class="kd metro7"></i>metro entrance</span><span><i class="kd stop7"></i>bus stop</span>`;
    if (state.tab === "s4" && S4) {
      const n = f => S4.buildings.filter(f).length;
      html = state.s4colour === "height"
        ? `<span><i class="kb h-agree"></i>two sources agree within one storey (${S4.evidence.tolerance_m} m) ${n(b => HEIGHT4(b) === "agree")}</span><span><i class="kb h-disagree"></i>two sources disagree ${n(b => HEIGHT4(b) === "disagree")}</span>` +
          `<span><i class="kb h-one"></i>one source only ${n(b => HEIGHT4(b) === "one")}</span><span><i class="kb h-none"></i>no height ${n(b => HEIGHT4(b) === "none")}</span>`
        : state.s4colour === "use"
        ? ["residential", "commerce", "services", "industry"].map(u => `<span><i class="kb ${USE_CLASS(u)}"></i>${u} ${n(b => b.use === u)}</span>`).join("") +
          `<span><i class="kb u-minor-structure"></i>other ${n(b => b.use && !["residential", "commerce", "services", "industry"].includes(b.use))}</span>` +
          `<span><i class="kb u-unknown"></i>unknown ${n(b => !b.use)}</span>`
        : `<span><i class="kb src-roll"></i>from the tax roll ${n(b => b.use_source === "roll")}</span><span><i class="kb src-osm_tag"></i>from OpenStreetMap ${n(b => b.use_source === "osm_tag")}</span><span><i class="kb src-none"></i>no source ${n(b => !b.use_source)}</span>`;
      if (state.s4places) html += `<span><i class="kp"></i>place</span><span><i class="kp hours"></i>with opening hours</span>`;
      if (state.s4odb && S4.odb_alone) html += `<span><i class="ko yes"></i>only in the Open Database of Buildings, standing in 2023</span><span><i class="ko"></i>only in it, not standing in 2023 or unclear</span>`;
    }
    if (state.tab === "s5" && S5) html = `<span><i class="kp5 o"></i>open</span><span><i class="kp5 c"></i>closed</span><span><i class="kp5 u"></i>unknown at this time</span>` +
      (state.s5mode === "bicycle" && S5.bikes ? `<span><i class="kb5"></i>bicycle detector, sized by this hour</span>` : "") +
      `<span><i class="kj5"></i>counted junction, sized by this hour's count</span><span><i class="kj5 none"></i>not counted at this hour</span>` +
      (S5.ring ? `<span><i class="kr5"></i>counted outside the area, for comparison</span>` : "");
    if (state.tab === "s6" && S6) html = (state.s6colour === "material"
        ? `<span><i class="kb6 m-b-ton"></i>concrete</span><span><i class="kb6 m-asphalte"></i>asphalt</span><span><i class="kb6 m-pav-"></i>pavers</span>`
        : `<span><i class="kb6 b-new"></i>built since 2020</span><span><i class="kb6 b-mid"></i>2010s</span><span><i class="kb6 b-old"></i>before 2010</span><span><i class="kb6 b-none"></i>no date</span>`) +
      [["tree", "tree", "tree, sized by its trunk"], ["tree young", "tree", "planted since 2013"], ["hydrant", "hydrant", "hydrant"],
       ["bench", "bench", "bench and other furniture"], ["light", "light", "street light"], ["camera", "camera", "camera"],
       ["crossing", "crossing", "crossing"], ["work", "work", "road work"]].map(([c, i, w]) =>
        `<span><svg class="ki lab-i6 k-${c}" viewBox="-12 -12 24 24"><use href="#i-${i}"/></svg>${w}</span>`).join("") +
      (state.s6canopy ? `<span><i class="kcan"></i>canopy 2019</span>` : "") +
      `<span class="sub">round: seen in street photos · square: mapped in OpenStreetMap · faint and smaller: not seen since ${esc(S6_SEEN)}</span>`;
    const open = openCount();
    key.innerHTML = html + `<span class="lab-check-key"><i class="kc"></i>checkpoint</span>` +
      (open ? `<button type="button" class="lab-open-btn${state.onlyOpen ? " on" : ""}" data-open="1" aria-pressed="${state.onlyOpen}">only what is unresolved (${open})</button>` : "");
    $(".lab-map").classList.toggle("only-open", state.onlyOpen && open > 0);
  }

  // ================================================================ 4 overlays
  map.onRedraw(draw);
  pmap.onRedraw(drawPast);
  function drawPast() {                        // the past map's own marks: the study area, and the blocks traced so far
    pmap.clear("pmarks");
    if (!H || !past()) return;
    const g = pmap.layer("pmarks");
    pmap.line(g, H.boundary, { class: "lab-hbound" });
    if (H.blocks && (state.tab === "s4" || state.tab === "all")) H.blocks.forEach(b => pmap.line(g, b.ring.concat([b.ring[0]]), { class: "lab-hblock" }));
  }
  function draw() {
    drawPast();
    map.boxes = [];
    map.clearHits();
    for (const n of ["marks", "focus", "labels"]) map.clear(n);
    const marks = map.layer("marks"), focus = map.layer("focus"), labels = map.layer("labels");
    if (past()) { if (H && state.era === "compare") map.line(marks, H.boundary, { class: "lab-hbound" }); return; }
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
    if (state.tab === "s4" && S4 && state.s4odb && S4.odb_alone) odbMarks(marks);
    if (state.tab === "s5" && S5) s5Marks(marks, labels);
    if (state.tab === "s6" && S6) s6Marks(marks);
    if (state.tab === "s7" && S7) s7Marks(marks);
    if (state.tab === "s8" && S8 && state.s8tool !== "walk") s8View(focus);
    if (state.tab === "s8" && state.s8tool === "walk") walkMarks(focus);
    if (state.tab === "s1" && state.s1try === "minutes") minutesMarks(marks);
    if (state.tab === "s9" && S9) s9Marks(marks, labels);
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

  // S8: the view from the middle viewpoint of the picked street, drawn from its sight lines
  const fmt8 = v => v == null ? "none" : v >= 100 ? Math.round(v).toLocaleString("en") : (+v).toFixed(v < 1 ? 2 : 1);
  function viewPolygon(view) {
    const m = S8.meta, n = view.rays.length;
    return view.rays.map((r, k) => {
      const a = (k * m.view_step_deg + m.turn_deg) * Math.PI / 180;
      return [view.xy[0] + r * Math.cos(a), view.xy[1] + r * Math.sin(a)];
    });
  }
  function s8View(g) {
    if (!state.pick || state.pick.kind !== "segment") return;
    const v = S8.segments[state.pick.id];
    if (!v || !v.view) return;
    const poly = viewPolygon(v.view);
    map.line(g, [...poly, poly[0]], { class: "lab-view8" });
    map.dot(g, v.view.xy, 4, { class: "lab-viewpt8" });
  }

  // S9: the counted junctions, with the commuters each reading sends through them
  function s9Marks(g, labels) {
    (S9.ring || []).filter(r => String(r.hour) === hour9() && r.counted != null).forEach(r => {
      const xy = S5 && S5.ring && (S5.ring.sites.find(s => s.id === r.site) || {}).xy;
      if (!xy) return;
      map.square(g, xy, 2 * (4 + Math.sqrt(r.counted) * 0.7), { class: "lab-count9 ring" });
      map.label(labels, xy, `${Math.round(r.commuters)} / ${Math.round(r.counted)}`, 9, { class: "situ-map-label num" }, "start");
    });
    S9.counted.forEach(c => {
      const h = c.hours[hour9()];
      if (!h) return;
      map.dot(g, c.xy, 4 + Math.sqrt(h.counted) * 0.7, { class: "lab-count9" });
      map.label(labels, c.xy, `${Math.round(h[state.s9reading])} / ${Math.round(h.counted)}`, 9, { class: "situ-map-label num" }, "start");
    });
  }

  // checkpoints of one system, with their system name kept in the pick
  function checksOf(tab) {
    const src = { s1: S1, s3: S3, s4: S4, s5: S5, s6: S6, s7: S7, s8: S8, s9: S9 }[tab];
    return src && src.checkpoints ? src.checkpoints : [];
  }
  const settled = c => c.status === "confirmed";            // S1 checkpoints carry what the photos and checks decided
  function checkMarks(g, labels, list) {
    list = list.filter(c => c.xy);                 // a checkpoint about a whole tract has no point to draw
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

  // S4: footprints the Open Database of Buildings has where S4 has no building
  function odbMarks(g) {
    S4.odb_alone.forEach(o => {
      const picked = state.pick && state.pick.kind === "odb" && state.pick.id === o.id;
      map.square(g, o.xy, picked ? 9 : 6, { class: "lab-odb" + (o.standing_2023 === "yes" ? " yes" : "") + (picked ? " picked" : "") });
      const hit = map.dot(g, o.xy, 7, { class: "sx-jhit" });
      hit.addEventListener("pointermove", ev => map.tip(ev, `Only in the Open Database of Buildings<br><span>${Math.round(o.area)} m² · standing in 2015: ${esc(o.standing_2015)}, in 2023: ${esc(o.standing_2023)}</span>`));
      hit.addEventListener("pointerleave", () => map.untip());
      hit.addEventListener("click", () => { if (!map.wasDrag()) select({ kind: "odb", id: o.id }); });
    });
  }

  // S5: places open or closed at the chosen hour, and what was counted at the junctions
  const letter5 = (id, d, h) => { const p = S5.places[id]; return p ? p.week[d][h] : "?"; };
  const word5 = l => l === "o" ? "open" : l === "c" ? "closed" : "unknown at this time";
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
    if (S5.ring) S5.ring.sites.forEach(s => {               // the ring outside the area: compared with, never built from
      const day = d < 5 ? s.weekday : DAY5[d] === "Sa" ? s.weekend : null, v = day ? day[state.s5mode][h] : null;
      const r = v == null ? 4 : 4 + 22 * Math.sqrt(v / max5[state.s5mode]);
      map.square(g, s.xy, r * 2, { class: "lab-r5" + (v == null ? " none" : "") });
      if (v != null) map.label(labels, add(s.xy, [0, 1], map.px(r + 9)), String(Math.round(v)), 10, { class: "situ-map-label" }, "middle");
      const hit = map.dot(g, s.xy, 9, { class: "sx-jhit" });
      hit.addEventListener("pointermove", ev => map.tip(ev, `${esc(s.name)} · outside the area, ${Math.round(s.edge_m)} m<br><span>${v == null ? "not counted at this hour" : Math.round(v) + " " + state.s5mode + "s"} · counted ${esc(s.days.join(", "))}</span>`));
      hit.addEventListener("pointerleave", () => map.untip());
    });
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
    if (d >= 5) return t + `<span class="warn">No weekend intersection counts inside the study area support this profile. ${d === 5 ? "The squares show available Saturday counts outside the boundary." : "The recent comparison ring also lacks Sunday counts."}</span>`;
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
      : "A weekday's shape. Dark bands: the hours counted at every junction. Teal dots: hours counted at J040 alone."}</p>`;
  }
  function weekHTML(id) {
    const p = S5 && S5.places[id];
    if (!p) return "";
    const rows = p.week.map((w, d) => `<tr><td>${DAY5[d]}</td>${w.split("").map(l => `<td class="w5 ${l === "o" ? "o" : l === "c" ? "c" : "u"}"></td>`).join("")}</tr>`).join("");
    return `<h3 class="lab-s"><a href="s5-rhythm.html" title="the S5 page">S5</a> · its week</h3><table class="lab-week">${rows}</table><p class="sub">${p.status === "no hours" ? "No hours given, so every hour is unknown, never closed." : "Green: open at half past the hour. Dark: closed."}` +
      `${p.season ? " Seasonal: " + esc(p.season) + "." : ""}${p.notes ? " " + esc(p.notes) + "." : ""}</p>`;
  }
  function count5HTML(id) {
    const by = S5.junctions[id], days = S5.meta.counted_days.filter(d => d.junction === id);
    const hrs = [...Array(24).keys()].filter(h => by.pedestrian[h] != null);
    return `<h3 class="lab-s"><a href="s5-rhythm.html" title="the S5 page">S5</a> · counted here</h3><p class="sub">${days.map(d => esc(d.weekday + " " + d.date)).join(", ")}. Mean per full hour counted:</p>
      <table class="lab-vals"><tr><th></th><th>on foot</th><th>bicycles</th><th>vehicles</th></tr>${hrs.map(h =>
        `<tr><td>${h}h</td><td>${Math.round(by.pedestrian[h])}</td><td>${Math.round(by.bicycle[h])}</td><td>${Math.round(by.vehicle[h])}</td></tr>`).join("")}</table>` + years5HTML(id);
  }
  // the same junction counted in other years, and the weather of each counted day (years.py)
  function years5HTML(id) {
    const ys = (S5.years || []).filter(y => y.junction === id);
    if (!ys.length) return "";
    return `<p class="sub">Every day counted here, today's and earlier: people on foot per hour over the reference hours, how closely the day's shape follows S5's weekday (r), and the weather from 7 to 18 h at McTavish.</p>
      <table class="lab-vals"><tr><th>day</th><th>on foot</th><th>r</th><th>°C</th><th>mm</th></tr>${ys.map(y =>
        `<tr><td>${esc(y.date)}${y.period === "today (S5)" ? "" : " *"}</td><td>${y.pedestrians_per_ref_hour || "none"}</td><td>${y.shape_r_with_s5 || "none"}</td><td>${y.temp_7_18_c}</td><td>${y.precip_7_18_mm}</td></tr>`).join("")}</table>
      <p class="sub">* an earlier year: compared, never used in S5's shape.</p>`;
  }

  // S6: what stands on the streets
  const show6 = o => state.s6show === "all" || (state.s6show === "trees" && o.kind === "tree") ||
    (state.s6show === "hydrants" && o.kind === "hydrant") || (state.s6show === "furniture" && FURN6.includes(o.kind)) ||
    (state.s6show === "works" && o.kind === "road work") || PHOTO6[state.s6show] === o.kind;
  const ICON6 = { tree: "tree", hydrant: "hydrant", bench: "bench", "waste basket": "bin", "bicycle parking": "bike", "picnic table": "table",
                  "drinking water": "water", fountain: "water", shelter: "shelter", "street light": "light", "surveillance camera": "camera",
                  crossing: "crossing", "road work": "work" };
  const ICON_W = 650;                                  // icons appear once the view is narrower than this many metres
  const trunk6 = o => !o.size ? "s" : o.size <= 20 ? "s" : o.size <= 40 ? "m" : "l";
  function s6Marks(g) {
    const shown = S6.objects.filter(show6);
    const close = map.view.w < ICON_W;
    if (!close) {
      // far: one path per kind, sized dots; nothing to redraw when the view moves
      const groups = {};
      shown.forEach(o => {
        const base = o.kind === "tree" ? "tree-" + trunk6(o) : SLUG6[o.kind] || (o.kind === "hydrant" ? "hydrant" : o.kind === "road work" ? "work" : "furniture");
        const flags = [o.kind === "tree" && o.date >= "2013" ? "young" : "", SLUG6[o.kind] && o.source === "osm" ? "osm" : "",
                       SLUG6[o.kind] && o.source !== "osm" && o.surveyed < S6_SEEN ? "old" : ""].filter(Boolean);
        const key = [base, ...flags].join(" ");
        (groups[key] = groups[key] || []).push(o.xy);
      });
      const SIZE = { "tree-s": 3, "tree-m": 5, "tree-l": 8, hydrant: 5, work: 9, light: 3, camera: 4.5, crossing: 3.5, furniture: 4 };
      Object.entries(groups).forEach(([key, pts]) => {
        const [base, ...flags] = key.split(" ");
        map.dots(g, pts, (SIZE[base] || 4) * (flags.includes("old") ? 0.7 : 1), { class: ["lab-d6", "k-" + base.replace(/-[sml]$/, ""), ...flags].join(" "),
          "stroke-linecap": flags.includes("osm") || base === "hydrant" || base === "work" ? "square" : "round" });
      });
    } else {
      // near: an icon for every object in view
      const [x0, y0] = map.toWorld(-40, map.ch + 40), [x1, y1] = map.toWorld(map.cw + 40, -40);
      shown.forEach(o => {
        if (o.xy[0] < x0 || o.xy[0] > x1 || o.xy[1] < y0 || o.xy[1] > y1) return;
        const size = o.kind === "tree" ? { s: 12, m: 16, l: 22 }[trunk6(o)] : o.kind === "road work" ? 18 : 15;
        map.icon(g, o.xy, "i-" + (ICON6[o.kind] || "other"), size, { class: "lab-i6 k-" + (ICON6[o.kind] || "other") +
          (o.kind === "tree" && o.date >= "2013" ? " young" : "") + (o.source === "osm" ? " osm" : "") +
          (SLUG6[o.kind] && o.source !== "osm" && o.surveyed < S6_SEEN ? " old" : "") });
      });
    }
    if (state.pick && state.pick.kind === "obj6" && o6[state.pick.id]) {
      const o = o6[state.pick.id];
      map.dot(g, o.xy, 14, { class: "lab-pick-ring" });
      map.icon(g, o.xy, "i-" + (ICON6[o.kind] || "other"), 22, { class: "lab-i6 k-" + (ICON6[o.kind] || "other") });
    }
    map.setHits(shown.map(o => ({ xy: o.xy,
      tip: () => `${esc(o.kind)} ${o.id}<br><span>${esc(o.detail || "")}${o.kind === "tree" && o.size ? " · trunk " + o.size + " cm" : ""}</span>`,
      click: () => select({ kind: "obj6", id: o.id }) })));
  }
  // S7: who commutes, from the census, and how far each home is from the metro and the bus
  const h7 = {};
  if (S7) S7.homes.forEach(h => h7[h.id] = h);
  const MODES7 = { all: ["commuters"], walk: ["walk"], transit: ["metro", "bus", "train"], car: ["car"] };
  const show7 = h => MODES7[state.s7show].reduce((a, m) => a + (h[m] || 0), 0);
  function s7Marks(g) {
    S7.stops.forEach(s => {
      if (s.kind === "metro entrance") map.dot(g, s.xy, 4.5, { class: "lab-metro7" });
      else if (s.inside) map.square(g, s.xy, 4, { class: "lab-stop7" });
      const hit = map.dot(g, s.xy, 6, { class: "sx-jhit" });
      hit.addEventListener("pointermove", ev => map.tip(ev, `${esc(s.name)}<br><span>${esc(s.kind)} · ${s.departures} departures on a weekday · nearest for ${s.homes} buildings with homes</span>`));
      hit.addEventListener("pointerleave", () => map.untip());
    });
    S7.homes.forEach(h => {
      const picked = state.pick && state.pick.kind === "home7" && state.pick.id === h.id;
      map.dot(g, h.xy, 2 + Math.sqrt(show7(h)) * 0.9, { class: "lab-home7" + (picked ? " picked" : "") });
      const hit = map.dot(g, h.xy, 7, { class: "sx-jhit" });
      hit.addEventListener("pointermove", ev => map.tip(ev, `${h.id}<br><span>${Math.round(show7(h))} ${state.s7show === "all" ? "commuters" : "commuters " + (state.s7show === "walk" ? "on foot" : state.s7show === "car" ? "by car" : "by transit")}</span>`));
      hit.addEventListener("pointerleave", () => map.untip());
      hit.addEventListener("click", () => { if (!map.wasDrag()) select({ kind: "home7", id: h.id }); });
    });
  }
  function home7HTML(h) {
    if (!h) return "";
    const pct = m => h.commuters ? Math.round(100 * h[m] / h.commuters) + " %" : "";
    return `<h2 class="lab-pt">Homes · ${h.id}</h2><p class="sub">census tract ${esc(h.tract)} · ${h.dwellings} homes in S4</p>
      <p>About <b>${Math.round(h.commuters)}</b> residents commute on a weekday today.</p>
      <table class="lab-vals"><tr><th></th><th>people</th><th>share</th></tr>${[["walk", "on foot"], ["metro", "metro"], ["bus", "bus"], ["car", "car"], ["bicycle", "bicycle"], ["other", "other"]]
        .map(([m, w]) => `<tr><td>${w}</td><td>${h[m].toFixed(1)}</td><td>${pct(m)}</td></tr>`).join("")}</table>
      <h3 class="lab-s">Nearest stops, along the streets</h3><p>${esc(h.metro_name.replace("STATION ", "").toLowerCase().replace(/(^|[ -'])\w/g, c => c.toUpperCase()))} metro: <b>${Math.round(h.metro_m)} m</b>
      ${h.metro_out ? `<span class="sub">(${Math.round(h.metro_out)} m of it beyond the area, as a straight line)</span>` : ""}</p>
      <p>${esc(h.bus_name)} bus stop: <b>${Math.round(h.bus_m)} m</b></p>
      <p class="sub">The tract's census rates, corrected once for working from home today. Where these people go is not known.</p>`;
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
    let h = `<h2 class="lab-pt">${esc(o.kind)}${o.detail ? ": " + esc(o.detail) : ""}</h2><p class="sub">${o.id} · from ${esc(SRC6[o.source] || o.source)} (${esc(o.source_id)})</p>`;
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
    h += `<h3 class="lab-s">Street</h3>` + (o.segment ? `<p><button type="button" class="sx-link" data-seg="${o.segment}">${esc(o.street)} (${o.segment})</button>, ${o.segment_m} m away</p>`
      : `<p class="sub">${esc(o.link_reason)} (${o.segment_m} m from the nearest S1 street)</p>`);
    return h;
  }
  function surf6HTML(s) {
    if (!s) return "";
    return `<h2 class="lab-pt">${esc(s.kind)} ${s.id}</h2><p class="sub">city asset ${esc(s.source_id)} · ${esc(s.type)}</p>
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
    h += extra ? `Accept a trip ${RT.meta.slacks[state.routeSlack]} % longer and ${extra} more streets (blue) become possible ways.` : `At ${RT.meta.slacks[state.routeSlack]} % there is only one way.`;
    return h;
  }

  // ================================================================ 6 the detail panel
  // what a panel may show on this tab: on a system's tab, only that system; on the Overview, everything
  let PARTS = 0;
  const shows = sys => state.tab === "all" || state.tab === sys || (sys === "mat" && state.tab === "s4" && state.matPanels);
  const part = (sys, html) => { if (!html || !shows(sys)) return ""; PARTS++; return html; };
  const TABNAME = t => { const x = TABS.find(y => y.id === t); return x ? (x.tag || x.id.toUpperCase()) + " " + x.name : t; };
  function onlyNote(what) {
    if (state.tab === "all") return "";
    return (PARTS ? "" : `<p class="sub lab-none">${esc(TABNAME(state.tab))} says nothing about this ${what}.</p>`) +
      `<p class="lab-ovlink"><button type="button" class="sx-link" data-overview="1">Everything the systems know about it: Overview</button></p>`;
  }
  function panelHTML() {
    const p = state.pick;
    if (!p) return "";
    PARTS = 0;
    const back = `<p class="sx-crumb"><button type="button" class="sx-link" data-close="1">close</button></p>`;
    if (p.kind === "check") return back + checkHTML(checksOf(state.tab).find(x => x.id === p.id) || allChecks().find(x => x.id === p.id));
    if (p.kind === "building") { const h = buildingHTML(b4[p.id]); return back + h + onlyNote("building") + PROV; }
    if (p.kind === "odb") return back + odbHTML(S4.odb_alone.find(o => o.id === p.id)) + PROV;
    if (p.kind === "place") return back + placeHTML(place4[p.id]) + PROV;
    if (p.kind === "obj6") return back + obj6HTML(o6[p.id]) + PROV;
    if (p.kind === "surf6") return back + surf6HTML(s6[p.id]) + PROV;
    if (p.kind === "home7") return back + home7HTML(h7[p.id]) + PROV;
    if (p.kind === "segment") { const h = segmentHTML(seg[p.id]); return back + h + onlyNote("street") + PROV; }
    if (p.kind === "junction") { const h = junctionHTML(p.id); return back + h + onlyNote("junction") + PROV; }
    if (p.kind === "hseg") return back + hsegHTML(hseg[p.id]) + PROVH;
    if (p.kind === "hnet") return back + hnetHTML(hnet[p.id]) + PROVH;
    if (p.kind === "hbld") return back + hbldHTML(hbRec[p.id]) + PROVH;
    return "";
  }
  const PROVH = `<p class="sx-prov">The past era repeats the historical workspace's files exactly (the Lab's tests check it). How the 1912 network was read: <a href="h1-streets.html">S1 · past</a>; its values: <a href="h2-scores.html">S2 · past</a>.</p>`;
  const NAMEW = { documented: "documented: printed on the plate, or listed in a 1912 directory", inferred: "inferred: read as the same street, not printed on this stretch", unknown: "unknown: no name found" };
  function hsegHTML(s) {
    return `<h2 class="lab-pt">${esc(s.name || "A street with no name")}</h2><p class="sub">${s.id} · ${s.len} m · ${esc(HCLS[s.cls] || s.cls)} · ${esc(HZONE[s.zone])} · 1912</p>
      <h3 class="lab-s"><a href="h1-streets.html" title="the S1 past page">S1 · past</a> · the street in 1912</h3>
      <p>Name ${esc(NAMEW[s.status] || s.status)}${s.src ? ` <span class="sub">(${esc(s.src)})</span>` : ""}</p>` +
      (s.alt ? `<p class="sub">Also called ${esc(s.alt)}</p>` : "") +
      (s.width != null ? `<p class="sub">About ${s.width} m between the lot lines on the plate.</p>` : "") +
      `<p class="sub">Read from the 1912 Goad atlas, plate by plate, and registered onto today's ground: my reading, so an assumption until it is reviewed. Who could use it in 1912 is not known.</p>` +
      (state.tab === "all" && H.net.some(n => n.seg === s.id && n.report) ? `<h3 class="lab-s"><a href="h2-scores.html" title="the S2 past page">S2 · past</a> · space syntax</h3>` + hvals(H.net.filter(n => n.seg === s.id && n.report)) : "") +
      (state.tab !== "all" ? `<p class="lab-ovlink"><button type="button" class="sx-link" data-overview="1">Everything the past era knows about it: Overview</button></p>` : "");
  }
  function hvals(list) {
    return list.map(n => `<table class="lab-vals"><tr><th>${list.length > 1 ? esc(n.id) : ""}</th><th>400</th><th>800</th></tr>
      <tr><td>walk choice</td><td>${fmt(n.v.nach_400)}</td><td>${fmt(n.v.nach_800)}</td></tr><tr><td>walk integr.</td><td>${fmt(n.v.nain_400)}</td><td>${fmt(n.v.nain_800)}</td></tr></table>`).join("") +
      `<p class="sub">Normalised values, with no unit, from PlanX 4.19.0 on the 1912 network. A street's rank moves by ${list.map(n => n.es800 == null ? "none" : n.es800.toFixed(2)).join(", ")} at 800 m when the ring around the halo is removed${list.some(n => n.es800 > 0.2) ? ": more than 0.2, so this value leans on the edge" : ""}.</p>`;
  }
  const BLOCK = id => { const b = H.blocks.find(x => x.id === id); return b ? b.name : id || "block not recorded"; };
  function hbldHTML(b) {
    const src = b.year === "1912" ? "the 1912 Goad atlas" : b.year === "1918" ? "the May 1918 insurance plan" : "the May 1918 plan, carried to c1927";
    let h = `<h2 class="lab-pt">${esc(b.occupant || (b.year === "c1927" ? "A building carried to c1927" : "A building in " + b.year))}</h2>
      <p class="sub">${esc(b.id)} · ${Math.round(b.area_m2)} m² · ${esc(BLOCK(b.block_id))}</p>
      <h3 class="lab-s"><a href="h4-buildings.html" title="the S4 past page">S4 · past</a> · ${b.year === "c1927" ? "c1927" : b.year}</h3>
      <p>Outline traced from the coloured fills of ${src}${b.pos_error_m ? `, placed to about ${b.pos_error_m} m` : ""}: a reading, so an assumption.</p>
      <p>Construction: <b>${esc(b.construction || "unknown")}</b> <span class="sub">read from the fill colour; the legend of this edition is not read yet, so provisional</span></p>`;
    if (b.year === "1918") h += `<p>Storeys: ${b.storeys_raw ? `<b>${esc(b.storeys_raw)}</b> <span class="sub">as printed on the plan</span>` : `<span class="warn">not read yet</span>`}</p>` +
      (b.use_raw ? `<p>Use: <b>${esc(b.use_raw)}</b> <span class="sub">as printed</span></p>` : "") + (b.occupant ? `<p>Occupant: <b>${esc(b.occupant)}</b></p>` : "") +
      `<p class="sub">Carried to c1927: ${esc(b.carried_to_c1927 || "no")}</p>`;
    if (b.year === "1912") h += `<p class="sub">Carried to c1927: ${esc(b.carried_to_c1927 || "no")}. The 1912 outlines are compared with 1918, not carried directly.</p>`;
    if (b.year === "c1927") h += `<p>Storeys: ${b.storeys ? `<b>${esc(b.storeys)}</b> <span class="sub">from 1918</span>` : `<span class="warn">unknown</span>`}</p>
      <p>Why it is carried: ${esc(b.basis)} <span class="sub">(${esc(b.strength)})</span></p>${b.addresses_1927 ? `<p class="sub">1927 directory: ${esc(b.addresses_1927)}</p>` : ""}
      <p class="sub">Every value here is inferred from 1918, bracketed by 1949 (D039). From 1918 outline ${esc(b.footprint_1918)}.</p>`;
    if (b.nested_in) h += `<p class="sub">Inside the larger outline ${esc(b.nested_in)}: an addition, or a shed in a yard.</p>`;
    return h + (state.tab !== "all" ? "" : "");
  }
  function hnetHTML(n) {
    return `<h2 class="lab-pt">${esc(n.name || "A street with no name")}</h2><p class="sub">${n.id} · ${n.len} m · ${esc(HZONE[n.zone])} · 1912</p>
      <h3 class="lab-s"><a href="h2-scores.html" title="the S2 past page">S2 · past</a> · space syntax</h3>` +
      (n.report ? hvals([n]) : `<p class="sub">Analysed so the streets inside have a city around them, and not reported: values out here depend on where the plates stop.</p>`) +
      (hseg[n.seg] ? `<p><button type="button" class="sx-link" data-hseg="${n.seg}">The street in 1912 (${n.seg})</button></p>` : "");
  }
  const PROV = `<p class="sx-prov">Each value here repeats a system's results exactly (the Lab's tests check it). To follow one to its source file: <a href="provenance.html#trace">Tracing a result</a>.</p>`;
  const allChecks = () => [...checksOf("s1"), ...checksOf("s3"), ...checksOf("s4"), ...checksOf("s5"), ...checksOf("s6"), ...checksOf("s7"), ...checksOf("s8"), ...checksOf("s9")];

  function checkHTML(c) {
    if (!c) return "";
    const b = c.where && b4[c.where];
    const now = c.status === "confirmed" ? `<p class="ok-line"><b>Settled.</b> ${esc(c.decision)}</p>`
      : c.status === "assumed" ? `<p class="warn"><b>Assumed for now.</b> ${esc(c.decision.replace(/^Assumed:\s*/, ""))} It still needs a look on site.</p>` : "";
    return `<h2 class="lab-pt">${c.id} · ${esc(c.kind)}</h2>${now}<p>${esc(WHY[c.kind] || "")}</p>` +
      (c.place ? `<p class="sub">${esc(c.place)}</p>` : "") +
      `<h3 class="lab-s">What I need to know</h3><p>${esc(c.question)}</p>` +
      (c.link ? `<p><a href="${esc(c.link)}" target="_blank" rel="noopener">Look at this place in Street View</a></p>` : "") +
      (b ? `<p><button type="button" class="sx-link" data-b="${b.id}">Open the building ${esc(b.name || b.id)}</button></p>` : "");
  }

  function segmentHTML(s) {
    let h = `<h2 class="lab-pt">${esc(s.street)}</h2><p class="sub">${s.id} · ${s.length} m · ${esc(s.class)}</p>` +
      part("s1", `<h3 class="lab-s"><a href="s1-streets.html" title="the S1 page">S1</a> · who may use it</h3><p>${s.walk ? "On foot" : "Not on foot"}; ${!car(s) ? "closed to cars" : s.car_ft && s.car_tf ? "cars both ways" : "cars one way"}.${s.source !== "geobase" ? " A path I added after the S1 checks." : ""}</p>`);
    const v = S2 && S2.scores[s.id];
    if (!shows("s2")) { }
    else if (v) { PARTS++;
      const row = (net, m) => RADII[net].map(r => `<td>${fmt(v[`${net}_${m}_${r}`])}</td>`).join("");
      h += `<h3 class="lab-s"><a href="s2-scores.html" title="the S2 page">S2</a> · space syntax</h3><p class="sub">walking: ${esc(v.ped_status)}${v.ped_reason ? " · " + esc(v.ped_reason) : ""} · driving: ${esc(v.veh_status)}${v.veh_note ? " · " + esc(v.veh_note) : ""}</p>
        <p class="sub">Normalised values, with no unit. Each column is a radius in metres; n is the whole island. "none" means no value, never zero.</p>
        <table class="lab-vals"><tr><th></th>${RADII.ped.map(r => `<th>${r}</th>`).join("")}</tr>
        <tr><td>walk choice</td>${row("ped", "NACH")}</tr><tr><td>walk integr.</td>${row("ped", "NAIN")}</tr></table>
        <table class="lab-vals"><tr><th></th>${RADII.veh.map(r => `<th>${r}</th>`).join("")}</tr>
        <tr><td>car choice</td>${row("veh", "NACH")}</tr><tr><td>car integr.</td>${row("veh", "NAIN")}</tr></table>`;
    } else if (S2) { PARTS++; h += `<h3 class="lab-s"><a href="s2-scores.html" title="the S2 page">S2</a> · space syntax</h3><p class="sub">S2 holds no row for this segment.</p>`; }
    const r = S3 && r3.speed[s.id];
    if (r && shows("s3")) { PARTS++;
      const how = { by_id: `from the speed file, street id ${esc(r.speed_id)}`, by_shape: `borrowed from line ${esc(r.speed_id)} of the same name`,
                    zero_in_file: "the file gives 0: no limit", missing: "not in the speed file", not_a_road: "a path: not in the speed file" }[r.speed_status] || "";
      h += `<h3 class="lab-s"><a href="s3-rules.html" title="the S3 page">S3</a> · speed</h3><p><b>${r.speed ? r.speed + " km/h" : "no limit"}</b> · ${how}</p>${r.speed_note ? `<p class="sub">${esc(r.speed_note)}</p>` : ""}`;
    }
    if (!shows("s9")) { }
    else if (S9 && S9.flows[s.id]) { PARTS++;
      const f = S9.flows[s.id], hs = S9.meta.hours;
      h += `<h3 class="lab-s"><a href="s9-observer.html" title="the S9 page">S9</a> · commuters walking here, imagined</h3><table class="lab-vals"><tr><th></th>${hs.map(x => `<th>${x}h</th>`).join("")}</tr>${S9.meta.readings.map(rd =>
        `<tr><td>${rd}</td>${(f[rd] || hs.map(() => 0)).map(v => `<td>${Math.round(v)}</td>`).join("")}</tr>`).join("")}</table>
        <p class="sub">Imagined, from the rules in the <a href="s9-build.html#ledger">ledger</a> (assumption). 0: no imagined walker in that reading.</p>`;
    } else if (S9) { PARTS++; h += `<h3 class="lab-s"><a href="s9-observer.html" title="the S9 page">S9</a> · commuters walking here, imagined</h3><p class="sub">No imagined walker passes here in any reading.</p>`; }
    const w = S8 && S8.segments[s.id];
    if (!shows("s8")) { }
    else if (w) PARTS++, h += `<h3 class="lab-s"><a href="s8-views.html" title="the S8 page">S8</a> · views</h3><p class="sub">mean of its ${w.points} viewpoint${w.points > 1 ? "s" : ""}, about one every ${S8.meta.step_m} m${w.in_building ? ` · ${w.in_building} inside a building outline` : ""}</p>
      <table class="lab-vals"><tr><td>area seen</td><td>${fmt8(w.area_m2)} m²</td></tr><tr><td>longest sight line</td><td>${fmt8(w.longest_m)} m</td></tr>
      <tr><td>mean sight line</td><td>${fmt8(w.mean_m)} m</td></tr><tr><td>compactness</td><td>${fmt8(w.compactness)}</td></tr>
      <tr><td>lines open to ${S8.meta.radius_m} m</td><td>${Math.round(100 * w.open_share)} %</td></tr>
      <tr><td>lines leaving the map</td><td>${Math.round(100 * w.beyond_share)} %</td></tr></table>` +
      (state.tab === "s8" ? `<p class="sub">The green shape is what can be seen from ${esc(w.view.point)}, the middle viewpoint, past no building outline.</p>` : "");
    else if (S8) PARTS++, h += `<h3 class="lab-s"><a href="s8-views.html" title="the S8 page">S8</a> · views</h3><p class="sub">No viewpoint: not walkable, or outside the area.</p>`;
    return h;
  }

  function signLine(s) {
    const where = s.along === null ? "" : ` · ${Math.abs(s.along).toFixed(0)} m ${s.along >= 0 ? "before" : "past"} the junction, ${Math.abs(s.side).toFixed(0)} m to the ${s.side >= 0 ? "right" : "left"}`;
    const sure = { high: "only street it fits", medium: "best of several streets", redundant: "repeats what the street allows", none: "fits no street" }[s.confidence] || s.confidence;
    return `<li><b>${esc(s.meaning || s.text)}</b> <span class="fr">${esc(s.text)}</span><br><span class="sub">post ${esc(s.post)}${where} · ${esc(sure)}${s.timed ? " · holds only at some hours" : ""}</span></li>`;
  }

  function junctionHTML(id) {
    const j = jun[id];
    let h = `<h2 class="lab-pt">${id}</h2><p class="sub">S1 · ${esc(j.kind.replace("_", " "))}${j.status ? " (" + esc(j.status) + ")" : ""}</p>`;
    if (shows("s1")) PARTS++;
    if (S5 && S5.junctions[id]) h += part("s5", count5HTML(id));
    const c9 = S9 && S9.counted.find(c => c.id === id);
    if (c9 && shows("s9")) PARTS++, h += `<h3 class="lab-s"><a href="s9-observer.html" title="the S9 page">S9</a> · commuters against the count</h3><table class="lab-vals"><tr><th></th><th>counted</th>${S9.meta.readings.map(rd => `<th>${rd}</th>`).join("")}</tr>${Object.entries(c9.hours).map(([hh, v]) =>
      `<tr><td>${hh}h</td><td>${Math.round(v.counted)}</td>${S9.meta.readings.map(rd => `<td>${Math.round(v[rd])}</td>`).join("")}</tr>`).join("")}</table>`;
    if (!S3 || !r3.jun[id] || !shows("s3")) return h;
    PARTS++;
    const J = r3.jun[id], list = r3.appsAt[id] || [];
    h += `<p class="sub">${esc(J.streets.join(" × "))}</p><h3 class="lab-s"><a href="s3-rules.html" title="the S3 page">S3</a> · ${esc(CONTROL[J.control])}</h3>`;
    if (J.control === "lights") h += `<p>${(r3.lightsAt[id] || []).map(l => `Light ${esc(l.id)} (${esc(l.streets)}), ${l.distance} m away${l.kind === "temporary" ? ", temporary" : ""}.`).join(" ")}</p>`;
    if (J.note) h += `<p class="sub">${esc(J.note)}</p>`;
    h += `<p class="sub">Pick a street arriving here to see where a car may go.</p><ul class="sx-apps">` + list.map(a => {
      const rule = a.conflict ? "signs contradict: set aside" : a.allowed === "SLR" ? "every turn open" : a.allowed.split("").map(t => TURN_WORD[t]).join(", ") + " only";
      return `<li><button type="button" class="sx-app${state.approach === a.segment ? " on" : ""}" data-app="${a.segment}">${esc(short(a.street))} <span class="sub">${a.segment}</span><br>
        <span class="tag${a.stop ? " stop" : ""}">${a.stop ? "STOP" : "no stop"}</span> <span class="tag">${esc(rule)}</span></button></li>`;
    }).join("") + (list.length ? "" : `<li class="sub">No car may arrive here.</li>`) + `</ul>`;
    if (state.approach) {
      const a = r3.app[state.approach + "@" + id], moves = r3.movFrom[a.segment + "@" + id] || [];
      h += `<h3 class="lab-s">From ${esc(a.street)}</h3><p><b>Must stop?</b> ${a.stop ? "Yes." : "No stop sign found for this street."}</p>
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
    let h = `<h2 class="lab-pt">${esc(b.name || "A building with no name")}</h2><p class="sub">${b.id} · building=${esc(b.tag)} · ${Math.round(b.area)} m² on the ground</p>`;
    const s4 = shows("s4");
    if (s4) PARTS++, h += `<h3 class="lab-s"><a href="s4-buildings.html" title="the S4 page">S4</a> · used for</h3><p>${said(b.use, b.use_source, b.use_reason)}</p>`;
    if (s4 && b.use && b.use_reason) h += `<p class="sub">${esc(b.use_reason)}</p>`;
    if (s4 && b.use_mix) h += `<p class="sub">Tax-roll properties by class: ${esc(b.use_mix)}</p>`;
    if (s4) h += `<h3 class="lab-s">Size</h3><p>Storeys: ${said(b.storeys, b.storeys_source, b.storeys_reason)}${b.height != null ? ` · height ${b.height} m` : ""}</p>` +
      (b.storeys != null && b.storeys_reason ? `<p class="sub">${esc(b.storeys_reason)}. A building is as tall as its tallest known part.</p>` : "") +
      (b.parts ? `<p class="sub">${b.parts} part${b.parts > 1 ? "s" : ""} drawn in OpenStreetMap inside this outline.</p>` : "") + `
      <p>Dwellings: ${b.dwellings != null ? `<b>${b.dwellings}</b> <span class="sub">from the tax roll, ${b.properties} properties${b.condo_units ? `, ${b.condo_units} condo units` : ""}${b.year ? `, built ${esc(b.year)}` : ""}</span>` : `<span class="warn">unknown</span> <span class="sub">${esc(b.roll_reason)}</span>`}</p>`;
    if (s4) h += heightHTML(b);
    h += (state.tab === "all" ? g1HTML(b) : "") + part("mat", matHTML(b));
    if (state.tab === "s8") PARTS++, h += `<h3 class="lab-s"><a href="s8-views.html" title="the S8 page">S8</a> · views</h3><p class="sub">S8 reads this outline only as something a sight line cannot pass.</p>`;
    if (!s4) return h;
    if (b.premises) h += `<h3 class="lab-s">Ground floor</h3><p>${b.premises} commercial spaces in the 2025 survey, ${b.vacant} vacant.</p>${b.ground_floor ? `<p class="sub">${esc(b.ground_floor)}</p>` : ""}`;
    if (inside.length) h += `<h3 class="lab-s">Places inside (${inside.length})</h3><ul class="lab-places">${inside.map(p =>
      `<li><button type="button" class="sx-link" data-place="${p.id}">${esc(p.name || "(no name)")}</button> <span class="sub">${esc(p.kind)}${p.hours ? " · has hours" : ""}</span></li>`).join("")}</ul>`;
    h += `<h3 class="lab-s">Reached from</h3>` + (b.access ? `<p><button type="button" class="sx-link" data-seg="${b.access}">${esc(b.access_street)} (${b.access})</button>, ${b.access_m} m away</p>
      <p class="sub">An assumption: the nearest street people may walk on. Where the doors are is not known yet.</p>` : `<p class="warn">No street people may walk on within ${S4.meta.access_max_m} m.</p>`);
    return h;
  }
  // the height each source gives, set side by side (evidence.py); nothing here chooses one
  const VERDICT4 = { agree: "agree", disagree: "disagree" };
  function HEIGHT4(b) {
    const e = b.ev || {}, v = [e.osm_vs_2015, e.y2016_vs_2015, e.osm_vs_2016, e.y2023_vs_2015, e.y2023_vs_2016, e.osm_vs_2023];
    if (v.includes("disagree")) return "disagree";
    if (v.includes("agree")) return "agree";
    return [e.h_osm, e.h_2015, e.h_2016, e.h_2023].some(x => x != null) ? "one" : "none";   // evidence.py leaves a height empty where its source does not count
  }
  function heightHTML(b) {
    const e = b.ev;
    if (!e) return "";
    const m = x => x != null ? `<b>${x} m</b>` : `<span class="sub">none</span>`;
    const pct = x => `${Math.round(x * 100)} %`;
    const rows = [
      ["OpenStreetMap", m(e.h_osm), e.h_osm != null ? `from ${esc(SRC4[e.h_osm_source] || e.h_osm_source)}` : "no height tag"],
      ["Surface model, 2015", m(e.h_2015), `standing in 2015: ${esc(e.present_2015)}`],
      ["3D buildings, 2016", m(e.h_2016),
        e.cover_2016 ? `parts' ground area ${pct(e.cover_2016)} of the outline's${e.roof_2016 ? ", roof " + esc(e.roof_2016) : ""}` : "nothing on this outline"],
      ["Lidar, 2023", m(e.h_2023), `standing in 2023: ${esc(e.present_2023)}`],
    ];
    const pairs = [["OpenStreetMap and 2015", e.osm_vs_2015], ["2016 and 2015", e.y2016_vs_2015], ["OpenStreetMap and 2016", e.osm_vs_2016],
      ["2023 and 2015", e.y2023_vs_2015], ["2023 and 2016", e.y2023_vs_2016], ["OpenStreetMap and 2023", e.osm_vs_2023]]
      .filter(([, v]) => VERDICT4[v]);
    return `<h3 class="lab-s">Height, by source</h3><table class="lab-vals">${rows.map(([s, h, n]) => `<tr><td>${s}</td><td>${h}</td><td class="sub">${n}</td></tr>`).join("")}</table>` +
      (pairs.length ? `<p class="sub">Within one storey (${S4.evidence.tolerance_m} m): ${pairs.map(([w, v]) => `${w} <b class="${v === "disagree" ? "warn" : ""}">${v}</b>`).join(" · ")}</p>` : "") +
      `<p class="sub">Outline in the Open Database of Buildings: <b>${esc(e.in_odb)}</b> (${pct(e.odb_cover)} covered)</p>`;
  }
  // how far two measurements of one building lie apart, on buildings the roll dates before a year: what a tolerance is chosen from
  function spreadHTML(ev) {
    const sp = ev.spread_unchanged, tol = Object.keys(sp["2023_vs_2015"].disagree_at || {});
    const rows = [["2023 and 2015", "2023_vs_2015"], ["2016 and 2015", "2016_vs_2015"], ["2023 and 2016", "2023_vs_2016"]].filter(([, k]) => sp[k] && sp[k].buildings);
    return `<p class="sub">Agree means within one storey: ${ev.tolerance_m} m, the median height per storey the ${ev.storey.year} survey measures on ${ev.storey.buildings} buildings. On the ${sp.buildings} buildings the tax roll dates before ${sp.built_before}, two measurements differ by:</p>
      <table class="lab-vals"><tr><th></th><th>n</th><th>half within</th><th>95 % within</th></tr>${rows.map(([w, k]) =>
        `<tr><td>${w}</td><td>${sp[k].buildings}</td><td>${sp[k].abs_p50_m} m</td><td>${sp[k].abs_p95_m} m</td></tr>`).join("")}</table>
      <p class="sub">Pairs that disagree at each tolerance:</p>
      <table class="lab-vals"><tr><th></th>${tol.map(t => `<th>${t} m</th>`).join("")}</tr>${rows.map(([w, k]) =>
        `<tr><td>${w}</td>${tol.map(t => `<td>${sp[k].disagree_at[t]}</td>`).join("")}</tr>`).join("")}</table>`;
  }
  // what G1 World keeps for the game: the newest measurement, and every other height it discarded, with why (W32 to W35)
  function wallHTML(b) {
    const w = WALL[b.id];
    if (!w) return "";
    if (!w[0]) return `<p class="sub">Wall material: not read. ${esc(w[4].charAt(0).toUpperCase() + w[4].slice(1))}.</p>`;
    return `<p>Wall material: <b>${esc(w[0])}</b> <span class="sub">(${esc(w[1])}; read by eye from a <a href="https://www.mapillary.com/app/?pKey=${esc(w[2])}">street photo of ${esc(w[3])}</a>, Mapillary, CC BY-SA 4.0; an assumption)</span></p>`;
  }
  function matHTML(b) {
    if (!MAT) return "";
    const ms = mat4[b.id] || [], gs = gen4[b.id] || [];
    if (!ms.length && !gs.length) return `<h3 class="lab-s"><a href="materials.html" title="the materials library">Materials</a></h3>${wallHTML(b)}<p class="sub">No library entry for this building yet.</p>`;
    return `<h3 class="lab-s"><a href="materials.html" title="the materials library">Materials</a></h3>` + wallHTML(b) + ms.map(m => `<div class="lab-mat">

      <img src="${esc(m.preview)}" alt="${esc(m.name)}: colour map, tiled 3 by 3" loading="lazy">
      <p><a href="${esc(m.anchor)}"><b>${esc(m.id)}</b> ${esc(m.name)}</a></p>
      <p class="sub">${esc(m.face)}</p>
      <p>One brick course ${m.course_cm} cm <span class="sub">(${m.course_range[0]} to ${m.course_range[1]}), about ${m.per_m} to the metre</span></p>
      <p class="sub">Mean colour ${esc(m.colour)} · colour map observed; height and normal estimated, so assumptions; no roughness map</p>
      <p class="sub">Photo: ${esc(m.credit)}, ${esc(m.taken)}, <a href="${esc(m.page)}">Wikimedia Commons</a>, <a href="${esc(m.licence_url)}">${esc(m.licence)}</a></p></div>`).join("") + gs.map(genHTML).join("");
  }
  function setLine(m) {
    return `<div class="lab-mat lab-gen">
      <img src="${esc(m.preview)}" alt="${esc(m.name)}: authored colour map, tiled 3 by 3" loading="lazy">
      <p><b>${esc(m.id)}</b> ${esc(m.name)} · <button type="button" class="sx-link" data-b="${esc(m.building)}">${esc(b4[m.building] && b4[m.building].name || m.building)}</button></p>
      <p class="sub">${esc(m.component)} Tile ${m.tile_m[0]} × ${m.tile_m[1]} m (authored) · mean colour ${esc(m.colour)} · <a href="${esc(m.anchor)}">map set</a></p></div>`;
  }
  function genHTML(m) {
    if (m.render) return setLine(m);
    const cv = m.colour_vs_photo;
    return `<div class="lab-mat lab-gen">
      <img src="${esc(m.preview)}" alt="${esc(m.name)}: generated colour study, tiled 3 by 3" loading="lazy">
      <p><a href="${esc(m.anchor)}"><b>${esc(m.id)}</b> ${esc(m.name)}</a> <span class="sub">generated from a photo</span></p>
      <p class="sub">${esc(m.face)}</p>
      <p class="sub">Made by an image model from the photo, so its pattern is authored. Repeat edge: ${esc(m.seam_reads)}. ${m.tile_m ? `Tile about ${m.tile_m} m (${esc(m.scale_how)}).` : "No measured scale."}${cv ? ` Mean colour ${esc(m.colour)}, ${cv.delta_e76} from the colour measured on the photo (${esc(cv.photo_colour)}).` : ` Mean colour ${esc(m.colour)}.`}${m.maps.height === "assumption" ? " Height and normal estimated from its mortar joints, roughness set by hand: assumptions." : " Colour only: no height, normal or roughness yet."}</p>
      <p class="sub">From the photo by ${esc(m.credit)}, ${esc(m.taken)}, <a href="${esc(m.page)}">Wikimedia Commons</a>, <a href="${esc(m.licence_url)}">${esc(m.licence)}</a></p></div>`;
  }
  function g1HTML(b) {
    const g = G1 && G1.blocks[b.id];
    if (!g) return "";
    const what = g.h != null ? `<b>${g.h} m</b> <span class="sub">from ${esc(g.source)} (${esc(g.status)})</span>` : `<span class="warn">unknown</span>`;
    return `<p>In the game world (<a href="g1-world.html#heights">G1</a>): ${what}</p>` +
      (g.massing === "parts" ? `<p class="sub">Drawn as its outline at ${g.base} m with ${g.parts.length} part${g.parts.length > 1 ? "s" : ""} standing on it, from ${esc(g.massing_source)}: ${g.parts.map(q => q[1] + " m").join(", ")} (W36).</p>` : "") +
      (g.discarded.length ? `<p class="sub">Discarded:</p><ul class="lab-places">${g.discarded.map(([s, h, why]) =>
        `<li>${esc(s)} ${h} m <span class="sub">${esc(why)}</span></li>`).join("")}</ul>` : "");
  }
  function odbHTML(o) {
    return `<h2 class="lab-pt">A footprint with no S4 building</h2><p class="sub">Open Database of Buildings · ${esc(o.id)}</p>
      <p>From ${esc(o.source)}, ${esc(o.dataset)}. ${Math.round(o.area)} m² on the ground; S4 outlines cover ${Math.round(o.s4_cover * 100)} % of it.</p>
      <p>Standing in 2015: <b>${esc(o.standing_2015)}</b>${o.h_2015 != null ? ` <span class="sub">median height above the ground inside it, ${o.h_2015} m</span>` : ""}</p>
      <p>Standing in 2023: <b>${esc(o.standing_2023)}</b>${o.h_2023 != null ? ` <span class="sub">median height above the ground inside it, ${o.h_2023} m</span>` : ""}</p>`;
  }
  function placeHTML(p) {
    const b = p.building && b4[p.building];
    return `<h2 class="lab-pt">${esc(p.name || "(no name)")}</h2><p class="sub">${p.id} · ${esc(p.kind)}</p>
      <p>From ${esc(SRC4[p.source] || p.source)}</p>
      <p>${p.hours ? `Opening hours: ${esc(p.hours)}` : `<span class="sub">No opening hours given.</span>`}</p>` +
      (p.same_as ? `<p class="sub">The same name in the same building as <button type="button" class="sx-link" data-place="${p.same_as}">${esc(place4[p.same_as].name)}</button>: probably one place, listed by two sources.</p>` : "") +
      (b ? `<p>In <button type="button" class="sx-link" data-b="${b.id}">${esc(b.name || b.id)}</button>${p.placed === "near" ? ` <span class="sub">(next to it: the nearest outline within ${S4.meta.near_m} m)</span>` : ""}</p>` : `<p class="sub">${esc(p.reason)}</p>`) + weekHTML(p.id);
  }

  // ================================================================ 7 the side: one system at a time
  const seg2 = (k, opts) => `<div class="lab-seg" data-key="${k}">${opts.map(([v, label]) => `<button type="button" data-v="${v}"${state[k] === v ? ' class="on"' : ""}>${label}</button>`).join("")}</div>`;

  // the status of each system as the site states it (option C, 2026-11-23): its tests, and its readings where it has any
  const STATUS = { s1: ["tests pass", "readings: reviewed"], s2: ["tests pass"], s3: ["tests pass", "readings: reviewed"], s4: ["tests pass"],
    s5: ["tests pass"], s6: ["tests pass", "detections: Mapillary's"], s7: ["tests pass"], s8: ["tests pass"], s9: ["partial"] };
  function overviewSide() {
    if (past()) return `<h2 class="lab-t">Overview · ${state.era === "1912" ? "1912" : "1912 and today"}</h2><p>Click a street or a building for everything the past era knows about it. So far the past era has the streets (H-S1), their space syntax values (H-S2) and the building outlines traced on three blocks (H-S4). The others are not started.</p>` + pastSide();
    const rows = TABS.filter(t => /^s\d$/.test(t.id)).map(t => { const D = { s1: S1, s2: S2, s3: S3, s4: S4, s5: S5, s6: S6, s7: S7, s8: S8, s9: S9 }[t.id];
      const ts = D && D.tests ? D.tests : [], f = ts.filter(x => x.status === "fail").length;
      return `<li><button type="button" class="sx-link" data-tab="${t.id}"><b>${t.id.toUpperCase()}</b> ${esc(t.name)}</button> ${(STATUS[t.id] || []).map((w, i) =>
        `<span class="lab-badge${i ? " read" : f ? " fail" : ""}">${i === 0 && w === "tests pass" ? (f ? f + " tests fail" : "tests ✓") : esc(w)}</span>`).join(" ")}${t.past ? ' <span class="lab-badge past">1912</span>' : ""}</li>`; }).join("");
    return `<h2 class="lab-t">Overview · every system at once</h2><p>Click a street, a junction or a building: its panel collects what every system knows about it. Pick a system's tab to see only that system, with its colours and its tools.</p>
      <ul class="lab-ovlist">${rows}</ul><p class="sub">tests ✓: the system's own tests pass, a fact about its code. readings: what was read on photos or plates; reviewed means I looked at them again as the researcher. A passing test does not make a reading verified.</p>`;
  }
  function pastSide() {
    const t = state.tab, M = H.meta;
    let h = state.era === "compare"
      ? `<p class="sub">1912 above, today below, on the same ground: the two maps move together, so a place sits at the same spot on both. Click either one.</p>`
      : "";
    if (t === "s4") {
      const B = M.buildings, b = B[state.hbld];
      h += seg2("hbld", [["1912", "1912 atlas"], ["1918", "May 1918 plan"], ["c1927", "carried to c1927"]]) +
        `<p class="sub">${b.outlines} outlines, ${b.m2.toLocaleString("en")} m², on ${state.hbld === "c1927" && b.blocks_1949 ? `${b.blocks_1949.length} of the ${B.blocks.length} traced blocks: ${b.blocks_1949.map(esc).join("; ")}` : `${B.blocks.length} blocks so far: ${B.blocks.map(esc).join("; ")}`}. The rest of the study area is not traced yet: empty there means not read, never no building.</p>` +
        (state.hbld === "1912" ? `<p class="sub">Construction from the fill colour: pink brick or stone, yellow frame. This atlas does not tell brick from stone.</p>`
         : state.hbld === "1918" ? `<p class="sub">The insurance plan prints storeys and uses: read so far for ${B["1918"].with_storeys} outlines. ${B["1918"].nested} outlines sit inside a larger one (additions, yard sheds).</p>`
         : `<p class="sub">A 1918 outline is carried to the represented period only when it passes the 1912 to 1927 test (D020) and is still drawn on the 1949 land-use plans, so 1918 and 1949 bracket the 1920s (D039). ${B.c1927.outlines ? `${B.c1927.meet_d020} of the ${B.c1927.top_1918} main 1918 outlines pass the first test. ${B.c1927.read_1949} of them are read on the 1949 sheet covering ${(B.c1927.blocks_1949 || []).map(esc).join(" and ")}: ${B.c1927.carried} are still drawn and carried. ${B.c1927.wait_1949 ? `${B.c1927.wait_1949} on ${(B.c1927.blocks_wait_1949 || []).map(esc).join(" and ")} wait for a 1949 sheet not read yet. ` : ""}The 1949 readings wait for review. Every value carried is inferred; an outline not carried is unknown in c1927, never absent.` : `${B.c1927.meet_d020} of the ${B.c1927.top_1918} main 1918 outlines pass the first test; the 1949 plans are not read yet, so none is carried and c1927 buildings stay unknown.`}</p>`) +
        (state.era === "compare" ? `<p class="sub">Below: today's buildings (S4), in grey.</p>` : "");
    } else if (t === "s2") h += seg2("hmeasure", [["nach", "choice"], ["nain", "integration"]]) + seg2("hradius", [["400", "400 m"], ["800", "800 m"]]) +
      `<p class="sub">${M.reported.segments} segments inside the study area and its halo carry values (${M.reported.km} km). The ring beyond the halo is analysed so they have a city around them, and is not reported.${state.era === "compare" ? " To set like beside like, Compare colours only the streets inside the study area, in both eras, each ranked among its own; the rest is drawn faint as context. Each era was analysed with its own city around it, so a rank compares a street's place in its own network." : ""}</p>`;
    else h += `<p class="sub">${M.segmap.segments} segments, ${M.segmap.km} km: ${M.segmap.class.street} streets, ${M.segmap.class.lane} lanes or courts and ${M.segmap.class.open_area} open areas. Names: ${M.segmap.name_status.documented} documented, ${M.segmap.name_status.inferred} inferred, ${M.segmap.name_status.unknown} unknown.</p>`;
    return h + `<p class="sub">Read from the ${esc(M.atlas)}, registered onto today's ground. The past era's represented period is ${esc(M.represented)}. Status: partial; ${t === "s4" ? "the outlines are traced from the plans" : "the network is read from the plates"}, so readings: assumption.</p>
      <p><a href="h1-streets.html">S1 · past</a> · <a href="h2-scores.html">S2 · past</a> · <a href="h4-buildings.html">S4 · past</a> · <a href="past-sources.html">past sources</a></p>`;
  }

  function sideHTML() {
    const t = state.tab;
    let h = "";
    if (t === "all") return overviewSide();
    if (past()) {
      const nm = t === "s2" ? "S2 · Scores, 1912" : t === "s4" ? "S4 · Buildings, 1912 to c1927" : "S1 · Streets, 1912";
      return `<h2 class="lab-t">${state.era === "compare" ? (t === "s4" ? "S4 · Buildings: the past and today" : nm.replace(", 1912", ": 1912 and today")) : nm}</h2>` + pastSide();
    }
    if (t === "s1") {
      h += `<h2 class="lab-t">S1 · Streets</h2><p>Which streets connect, and who may use them. White streets are for people and cars, green dashed ones for people only, grey ones for cars only. Click a street or a junction for its details, or try one of the tools.</p>
        <h3 class="lab-s">Try it</h3>${seg2("s1try", [["details", "details"], ["reach", "how far can I get?"], ["minutes", "minutes on foot"], ["route", "from here to there"]])}`;
      if (state.s1try === "reach" || state.s1try === "route") h += seg2("s1mode", [["walk", "on foot"], ["drive", "by car"]]);
      if (state.s1try === "minutes") h += `<p class="lab-out lab-min-out">${minutesText()}</p>`;
      if (state.s1try === "reach") h += `<label class="lab-range">step <b class="lab-step-label">${state.reachStep}</b><input type="range" class="lab-step" min="0" max="${reachSteps() ? Math.max(...reachSteps()) : 1}" value="${state.reachStep}"></label>
        <button type="button" class="lab-play" data-play="reach">▶ play</button><p class="lab-out">${reachText()}</p>`;
      if (state.s1try === "route") h += `<label class="lab-range">allow a detour of <b>${RT ? RT.meta.slacks[state.routeSlack] : 0} %</b><input type="range" class="lab-slack" min="0" max="4" value="${state.routeSlack}"></label><p class="lab-out">${routeText()}</p>`;
    }
    if (t === "s2") {
      const what = state.s2measure === "NACH" ? "Choice: how often a street lies on the way between other places." : "Integration: how easy a street is to reach from everywhere else.";
      h += `<h2 class="lab-t">S2 · Scores</h2><p>Space syntax gives every street a number for how it sits in the whole street network. Here each street is coloured by its rank in Griffintown: blue lowest, yellow highest. ${what}</p>
        ${seg2("s2net", [["ped", "walking"], ["veh", "driving"]])}${seg2("s2measure", [["NACH", "choice"], ["NAIN", "integration"]])}
        ${seg2("s2view", [["one", "one radius"], ["change", "local or whole"]])}` +
        (state.s2view === "change" && S2.change
          ? `<label class="lab-range">within <b class="lab-radius-label">${RADIUS_NAME(s2changeCol().split("_")[2])}</b>, against ${state.s2net === "ped" ? "the whole island" : "2000 m"}
             ${state.s2net === "ped" ? `<input type="range" class="lab-radius" min="0" max="${RADII.ped.length - 2}" value="${Math.min(state.s2radius, RADII.ped.length - 2)}">` : ""}</label>
             <p class="sub">A street can be central within a short walk and remote across the island, or the reverse. Here each street shows the gap between its place in the two orders.</p>
             ${diffLists(S2.change[s2changeCol()], "Higher within " + RADIUS_NAME(s2changeCol().split("_")[2]), "Higher " + (state.s2net === "ped" ? "on the whole island" : "within 2000 m"))}`
          : `<label class="lab-range">within <b class="lab-radius-label">${RADIUS_NAME(RADII[state.s2net][state.s2radius])}</b>
        <input type="range" class="lab-radius" min="0" max="${RADII[state.s2net].length - 1}" value="${state.s2radius}"></label>
        <button type="button" class="lab-play" data-play="radius">▶ play the distances</button>`) + `
        <p class="sub">Dashed streets have no value: the analysis did not cover them. They stay empty and are never set to zero.</p>`;
    }
    if (t === "s3") {
      h += `<h2 class="lab-t">S3 · Rules</h2><p>Where a driver must stop, where the lights are, where a car may turn and how fast it may go. Click a junction, then a street arriving at it, to see each rule with the sign behind it.</p>
        ${seg2("s3view", [["rules", "stops and lights"], ["speed", "speed limits"]])}`;
    }
    if (t === "s4") {
      h += `<h2 class="lab-t">S4 · Buildings</h2><p>What each building is used for, and where that answer comes from. Click a building to see everything S4 knows about it. When no source says, the use stays unknown.</p>
        ${seg2("s4colour", [["use", "used for"], ["source", "where that came from"], ["height", "height, by source"]])}
        <label class="lab-check"><input type="checkbox" class="lab-places-on"${state.s4places ? " checked" : ""}> show the places people go to</label>` +
        (state.s4colour === "height" && S4.evidence && S4.evidence.spread_unchanged ? spreadHTML(S4.evidence) : "") +
        (S4.odb_alone ? `<label class="lab-check"><input type="checkbox" class="lab-odb-on"${state.s4odb ? " checked" : ""}> show footprints only the Open Database of Buildings has (${S4.odb_alone.length})</label>` : "");
    }
    if (t === "s5" && S5) {
      h += `<h2 class="lab-t">S5 · Rhythm</h2><p>When the streets are busy, and which places say they are open. How busy is measured: the city counted people at seven junctions inside the area, on weekdays, and at a ring of crossings around it. Opening hours are what places promise, and most places give none.</p>
        ${seg2("s5day", DAY5.map((d, i) => [String(i), d]))}${seg2("s5mode", [["pedestrian", "on foot"], ["bicycle", "by bicycle"], ["vehicle", "by car"]])}
        ${state.s5mode === "bicycle" && S5.bikes ? seg2("s5season", [["winter", "winter"], ["spring", "spring"], ["summer", "summer"], ["autumn", "autumn"]]) +
          `<p class="sub">By bicycle, three city detectors on Peel and William measure every day since ${esc(S5.bikes.first)}, weekends and seasons included.</p>` : ""}
        <label class="lab-range">hour <b class="lab-hour-label">${state.s5hour}h</b><input type="range" class="lab-hour" min="0" max="23" value="${state.s5hour}"></label>
        <button type="button" class="lab-play" data-play="day">▶ play the day</button><div class="lab-out">${s5Text()}</div><div class="lab-curve-box">${s5Curve()}</div>`;
    }
    if (t === "s6" && S6) {
      const n = k => S6.objects.filter(o => o.kind === k).length;
      h += `<h2 class="lab-t">S6 · Streetscape</h2><p>What stands on the streets besides the buildings: ${n("tree")} public trees, ${n("hydrant")} fire hydrants,
        ${S6.objects.filter(o => FURN6.includes(o.kind)).length} benches and other pieces of furniture, and the ${n("road work")} road works the city listed on ${esc(S6.meta.snapshot)}.
        Lights, cameras and crossings were found two ways: by software reading street photos (Mapillary), and by the people who map OpenStreetMap.
        That gives ${Object.entries(S6.meta.photo_kinds).map(([k, s]) => `${s.either} ${k === "street light" ? "street lights" : k === "surveillance camera" ? "cameras" : k + "s"} (${s.both} found both ways)`).join(", ")}.
        Sidewalks, islands and the city's road surfaces are drawn under the streets. Zoom in to see each object's icon, and click anything for its source.</p>
        ${seg2("s6show", [["all", "everything"], ["trees", "trees"], ["hydrants", "hydrants"], ["furniture", "furniture"], ["lights", "lights"], ["cameras", "cameras"], ["crossings", "crossings"], ["works", "road works"]])}
        <h3 class="lab-s">Sidewalks and roadways by</h3>${seg2("s6colour", [["material", "material"], ["built", "year built"]])}
        ${S6.canopy && S6.canopy.length ? `<label class="lab-check"><input type="checkbox" class="lab-canopy-on"${state.s6canopy ? " checked" : ""}> show the 2019 canopy</label>
        <p class="sub">The canopy covers ${Math.round(100 * S6.canopy_summary.share * 10) / 10} % of the study area. ${S6.canopy_summary.public_trees_under_canopy} of the ${S6.canopy_summary.public_trees} public trees stand under it; ${S6.canopy_summary.pieces_with_no_public_tree} of its ${S6.canopy_summary.canopy_pieces} pieces (${Math.round(S6.canopy_summary.canopy_m2_with_no_public_tree).toLocaleString("en")} m²) hold no public tree.</p>` : ""}
        <p class="sub">S6 only records what each object is and where it stands. Whether it slows anyone down is left to later systems, as a written assumption.</p>`;
    }
    if (t === "mat" && MAT) {
      h += `<h2 class="lab-t">Materials</h2><p>What Griffintown's walls are made of. Every building's wall as read from a street photo, or the <a href="materials.html">materials library</a>'s entries, each measured from a published photo straightened to a known scale, the colour studies an image model made from photos, and the map sets drawn by a script from references, each shown in its mean colour. Click a building for everything the systems know about it, its materials included.</p>
        ${MAT.walls ? seg2("matView", [["walls", "every building's wall, from street photos"], ["entries", "library entries"]]) : ""}
        ${state.matView === "walls" && MAT.walls ? `<p class="sub">Read by eye from the nearest street panorama taken since 2023 (${esc(MAT.walls.source)}), blind to each building's use and age: an assumption, each tied to its photo. A photo older than the year the tax roll gives a building is not used.</p>` : ""}
        <label class="lab-check"><input type="checkbox" class="lab-matpanels-on"${state.matPanels ? " checked" : ""}> also show materials in S4's building panels</label>
        <h3 class="lab-s">Entries (${MAT.entries.length})</h3>` + MAT.entries.map(m => `<div class="lab-mat">
          <img src="${esc(m.preview)}" alt="${esc(m.name)}: colour map, tiled 3 by 3" loading="lazy">
          <p><b>${esc(m.id)}</b> ${esc(m.name)} · <button type="button" class="sx-link" data-b="${esc(m.building)}">${esc(b4[m.building] && b4[m.building].name || m.building)}</button></p>
          <p class="sub">course ${m.course_cm} cm (${m.course_range[0]} to ${m.course_range[1]}) · mean colour ${esc(m.colour)} · <a href="${esc(m.anchor)}">entry</a></p></div>`).join("") +
        ((MAT.generated || []).length ? `<h3 class="lab-s">Generated from photos (${MAT.generated.length})</h3><p class="sub">Colour studies an image model made from a published photo of the building, for control over the pattern. Their pattern is authored; each is checked against its photo where a measurement exists.</p>` + MAT.generated.map(m => `<div class="lab-mat lab-gen">
          <img src="${esc(m.preview)}" alt="${esc(m.name)}: generated colour study, tiled 3 by 3" loading="lazy">
          <p><b>${esc(m.id)}</b> ${esc(m.name)} · <button type="button" class="sx-link" data-b="${esc(m.building)}">${esc(b4[m.building] && b4[m.building].name || m.building)}</button></p>
          <p class="sub">${m.tile_m ? `tile about ${m.tile_m} m` : "no measured scale"} · repeat edge ${esc(m.seam_reads)} · mean colour ${esc(m.colour)} · <a href="${esc(m.anchor)}">entry</a></p></div>`).join("") : "") +
        ((MAT.sets || []).length ? `<h3 class="lab-s">Map sets (${MAT.sets.length})</h3><p class="sub">Full sets of texture maps drawn by a script from reference photos and documents, each for one part of a building. Every map is authored: an assumption.</p>` + MAT.sets.map(setLine).join("") : "") +
        (MAT.set_aside.length ? `<h3 class="lab-s">Set aside (${MAT.set_aside.length})</h3>` + MAT.set_aside.map(a => `<p class="sub"><b>${esc(a.id)}</b> ${esc(a.name)}: ${esc(a.why)}</p>`).join("") : "") +
        `<p class="sub">${S4.buildings.filter(b => !mat4[b.id] && !gen4[b.id]).length} of ${S4.buildings.length} buildings have no library entry or study yet.</p>`;
    }
    if (t === "s9" && S9) {
      const m = S9.meta, k = m.people_by_kind, e = m.explained_share, pc = v => (v < 0.1 ? (100 * v).toFixed(1) : Math.round(100 * v)) + " %";
      const rows = S9.counted.slice().sort((a, b) => (b.hours[hour9()] || {}).counted - (a.hours[hour9()] || {}).counted).map(c => {
        const v = c.hours[hour9()]; return v ? `<tr><td>${c.id}</td><td>${Math.round(v.counted)}</td>${m.readings.map(rd => `<td>${Math.round(v[rd])}</td>`).join("")}</tr>` : ""; }).join("");
      h += `<h2 class="lab-t">S9 · Observer</h2><p>S9 puts the other systems together and imagines a weekday morning on foot: about ${(Math.round(m.people / 100) * 100).toLocaleString("en")} walks between 6 and 10 h.
        Residents walk to the metro, the bus and work; workers walk in from the metro and the bus.
        You can switch the rule for the route. The walkers and where they go stay the same, so any difference comes from the route alone.</p>
        <h3 class="lab-s">Route</h3>${seg2("s9reading", [["shortest", "shortest"], ["open", "open views"], ["straight", "fewest turns"]])}
        <h3 class="lab-s">Show</h3>${seg2("s9view", [["walkers", "the walkers"], ["against", "against space syntax"]])}` +
        (state.s9view === "against" && S9.against
          ? `${seg2("s9against", Object.entries(AGAINST))}
             <p class="sub">Each street's place among the imagined walkers (6 to 10 h, route "${state.s9reading}") minus its place in ${AGAINST[state.s9against]},
             over the ${m.rho_s2[state.s9against].segments} walkable streets inside the area. Over all of them, the two orders agree weakly: rank correlation ${m.rho_s2[state.s9against][state.s9reading]}.
             Where they part, something besides the layout may be at work, or the imagined morning may be wrong (assumption).</p>
             ${diffLists(S9.against[state.s9against + "|" + state.s9reading], "Higher among the walkers", "Higher in " + AGAINST[state.s9against])}`
          : `<h3 class="lab-s">Hour</h3>${seg2("s9hour", [["all", "6 to 10"], ["6", "6h"], ["7", "7h"], ["8", "8h"], ["9", "9h"]])}`) + `
        <h3 class="lab-s">At the counted junctions, ${hour9()} h</h3><table class="lab-vals"><tr><th></th><th>counted</th>${m.readings.map(rd => `<th>${rd}</th>`).join("")}</tr>${rows}</table>
        <p class="sub">The imagined commuters make up ${m.readings.map(rd => pc(e[rd][hour9()]) + " (" + rd + ")").join(", ")} of the people the city counted. Seven junctions, most counted on one day,
        are enough to see where the imagined morning falls short, and too few to say which route rule is right. S9 never looked at the counts or space syntax while making its walks.</p>
        <h3 class="lab-s">The ring outside the area, ${hour9()} h</h3><p class="sub">Around the area, the imagined commuters make up only ${pc(m.ring.explained_share[hour9()])} of the people counted on weekdays at ${m.ring.sites} crossings,
        and reach ${m.ring.sites_reached.length} of them. Before looking at those counts, I wrote down what I expected:</p><ul class="lab-clist">${S9.expected.map(x => `<li><b>${x.id}</b> ${esc(x.expected)}</li>`).join("")}</ul>
        <details class="lab-cgroup"><summary>What S9 assumes <span class="sub">${S9.ledger.filter(x => x.kind === "assumption").length}</span></summary><ul class="lab-clist">${S9.ledger.map(x =>
          `<li><b>${x.id}</b> ${esc(x.rule)}<br><span class="sub">${esc(x.source)}</span></li>`).join("")}</ul></details>`;
    }
    if (t === "s8" && S8) {
      const m = S8.meta;
      h += `<h2 class="lab-t">S8 · Views</h2><p>How much of the city could be seen from each street if only buildings blocked the view. Trees and slopes stop nothing here, so a real view is smaller. Every ${m.step_m} m, ${m.rays} lines of sight go out until they hit a building or reach ${m.radius_m} m;
        the shape they draw is what can be seen from that spot. A typical spot sees about ${fmt8(m.area_median)} m², and most spots see between ${fmt8(m.area_p10)} and ${fmt8(m.area_p90)} m².
        Click a street to draw its view, or take a walk.</p>
        ${seg2("s8tool", [["colour", "colour the streets"], ["walk", "walk and look"]])}
        ${state.s8tool === "walk" ? `<p class="sub">Click two points near the streets. A walker takes the shortest way between them, thirty times faster than walking, and the map shows what it can see at each step: the open space around it, and the trees, lights, cameras, benches and places in view.</p>
          <button type="button" class="lab-play" data-play="walk">▶ walk</button> <button type="button" class="lab-play" data-play="walkstop">❚❚ pause</button>
          ${walk && !walk.none ? `<label class="lab-range">where the walker is<input type="range" class="lab-walkpos" min="0" max="${Math.round(walk.L)}" value="${Math.round(state.walkPos)}"></label>` : ""}
          <div class="lab-out lab-walk-out">${walkText()}</div>` : seg2("s8measure", [["area_m2", "area seen"], ["longest_m", "longest line"], ["compactness", "compactness"]])}
        <p class="sub">Compactness is 1 for a round view and gets smaller as the view stretches into a corridor. Only buildings block the view here; trees, viaducts, fences and parked trucks do not.
        A building missing from the map opens a view that is not really there, so trust the order of the streets more than any single number.
        S8 only measures; what a view means to someone walking is left to S9.</p>`;
    }
    if (t === "s7" && S7) {
      const m = S7.meta, mm = m.commuters_by_mode, tot = Object.values(mm).reduce((a, b) => a + b, 0), pc = k => Math.round(100 * mm[k] / tot);
      const row = (b, keys) => keys.reduce((a, k) => a + (b[k] || 0), 0);
      const table = (list, label) => `<table class="lab-vals"><tr><th>${label}</th><th>on foot</th><th>transit</th><th>car</th><th>all</th></tr>${list.map(b =>
        `<tr><td>${esc(b.band.replace("Between ", "").replace(/ and /, " to "))}</td><td>${Math.round(row(b, ["walk"]))}</td><td>${Math.round(row(b, ["metro", "bus", "train"]))}</td>
        <td>${Math.round(row(b, ["car"]))}</td><td>${Math.round(row(b, ["walk", "metro", "bus", "train", "car", "bicycle", "other"]))}</td></tr>`).join("")}</table>`;
      h += `<h2 class="lab-t">S7 · Commuters</h2><p>A weekday commuting scenario for Griffintown, using the 2021 census and a national working-from-home adjustment from May 2025.
        The scenario estimates about ${(Math.round(m.commuters / 100) * 100).toLocaleString("en")} commuters in ${m.homes} residential buildings. ${pc("car")} % go by car; ${pc("walk")} % walk, and ${pc("metro") + pc("bus")} % take the bus or the metro.
        Click a building for its modelled commuters and transit distances. Outside the study area, those distances use straight lines and can underestimate a walk.</p>
        ${seg2("s7show", [["all", "everyone"], ["walk", "on foot"], ["transit", "transit"], ["car", "car"]])}
        <h3 class="lab-s">Residents leaving for work</h3>${table(S7.bands.leaving, "hour")}
        <h3 class="lab-s">People arriving to work here</h3>${table(S7.bands.arriving, "hour")}
        <p class="sub">The hours are the census's own groupings, for the three census areas that cover most of Griffintown. S7 draws no walks: where people go, and by which street, is left to S9.</p>`;
    }
    h += checksHTML(t) + testsHTML(t);
    return h;
  }

  function checksHTML(t) {
    const list = checksOf(t);
    if (t === "s2") return `<h3 class="lab-s">Checkpoints</h3><p class="sub">S2 has none of its own. Its open questions are the streets without a value, drawn dashed.</p>`;
    if (!list.length) return "";
    const open = list.filter(c => !settled(c)), done = list.filter(settled);
    const groups = {};
    open.forEach(c => (groups[c.kind] = groups[c.kind] || []).push(c));
    const doneHTML = done.length ? `<details class="lab-cgroup done"><summary>settled <span class="sub">${done.length}</span></summary>
      <p class="why">Checked against photos or other sources; each one says what was decided.</p><ul class="lab-clist">${done.map(c =>
        `<li><button type="button" class="sx-link" data-check="${c.id}">${c.id}</button> <span class="sub">${esc(c.kind)} · ${esc(c.place)}</span></li>`).join("")}</ul></details>` : "";
    return `<h3 class="lab-s">Checkpoints still open (${open.length})</h3><p class="sub">Questions I cannot answer from my desk. Each one needs a look on site or in photos.</p>` +
      Object.entries(groups).map(([k, cs]) => `<details class="lab-cgroup"><summary>${esc(k)} <span class="sub">${cs.length}</span></summary>
        <p class="why">${esc(WHY[k] || "")}</p><ul class="lab-clist">${cs.map(c =>
          `<li><button type="button" class="sx-link" data-check="${c.id}">${c.id}</button> <span class="sub">${esc(c.place || (b4[c.where] && b4[c.where].name) || c.where || "")}</span></li>`).join("")}</ul></details>`).join("") + doneHTML;
  }

  function testsHTML(t) {
    const D = { s1: S1, s2: S2, s3: S3, s4: S4, s5: S5, s6: S6, s7: S7, s8: S8, s9: S9 }[t];
    if (!D) return "";
    const ts = D.tests || [], f = ts.filter(x => x.status === "fail").length, p = ts.filter(x => x.status === "pass").length;
    return `<details class="lab-tests"><summary>Tests <span class="st ${f ? "fail" : "pass"}">${f ? f + " FAIL" : p + " PASS"}</span> <span class="sub">last run ${esc(D.meta.tests_made || D.meta.made)}</span></summary>
      <ul class="lab-testlist">${ts.map(x => `<li><span class="st ${x.status}">${x.status === "pass" ? "PASS" : x.status === "fail" ? "FAIL" : "info"}</span> ${esc(x.title)}</li>`).join("")}</ul></details>`;
  }

  // ================================================================ 7b walk tools: minutes on foot (S1) and walk and look (S8)
  // An ordinary walking pace, used only to turn metres into minutes. Many people walk slower.
  const PACE = 1.3, BANDS = [5, 10, 15];
  const WK = window.SituWalk;
  let WG = null, OUT8 = null, walkEls = {}, walkAnim = null;
  const wgraph = () => WG || (WG = WK.graph(S1));
  function needOutlines(then) {
    if (window.SITU_S8_OUTLINES) { OUT8 = OUT8 || WK.outlines(window.SITU_S8_OUTLINES); then(); return; }
    const s = document.createElement("script");
    s.src = "outputs/s8/outlines_data.js";
    s.onload = () => { OUT8 = WK.outlines(window.SITU_S8_OUTLINES); then(); };
    document.head.appendChild(s);
  }
  const toolOn = () => state.tab === "s8" && state.s8tool === "walk" ? "walk" : state.tab === "s1" && state.s1try === "minutes" ? "minutes" : null;
  map.svg.addEventListener("click", e => {
    const tool = toolOn();
    if (!tool || !WK || map.wasDrag()) return;
    e.stopPropagation(); e.preventDefault();
    const r = map.svg.getBoundingClientRect(), p = map.toWorld(e.clientX - r.left, e.clientY - r.top), s = WK.snap(wgraph(), p);
    if (tool === "minutes") { state.minA = s; minutesCompute(); render(true); refreshOut(); return; }
    if (!state.walkA || state.walkB) { stopWalk(); state.walkA = s; state.walkB = null; walk = null; render(true); refreshOut(); }
    else { state.walkB = s; needOutlines(() => { walkCompute(); render(true); refreshOut(); playWalk(); }); }
  }, true);

  // ---- minutes on foot
  let minutes = null;
  function minutesCompute() {
    const G = wgraph(), R = WK.from(G, state.minA), pieces = BANDS.map(() => []), beyond = [];
    G.segs.forEach((s, i) => {
      const L = G.len[i], n = Math.max(1, Math.ceil(L / 8));
      for (let k = 0; k < n; k++) {
        const x0 = L * k / n, x1 = L * (k + 1) / n, t = WK.timeAlong(G, R, i, (x0 + x1) / 2) / PACE / 60;
        const b = BANDS.findIndex(m => t <= m);
        (b < 0 ? beyond : pieces[b]).push(WK.piece(G, i, x0, x1));
      }
    });
    const at = p => { const q = WK.snap(G, p); return WK.timeAlong(G, R, q.seg, q.along) / PACE / 60; };
    const within = BANDS.map(m => ({ m, homes: 0, places: 0, stops: 0 }));
    if (S4) S4.buildings.forEach(b => { if (!b.dwellings) return; const t = at(b.ring[0]); within.forEach(w => { if (t <= w.m) w.homes += b.dwellings; }); });
    if (S4) S4.places.forEach(p => { if (p.same_as) return; const t = at(p.xy); within.forEach(w => { if (t <= w.m) w.places += 1; }); });
    if (S7) S7.stops.filter(s => s.inside).forEach(s => { const t = at(s.xy); within.forEach(w => { if (t <= w.m) w.stops += 1; }); });
    minutes = { pieces, beyond, within, street: G.segs[state.minA.seg].street };
  }
  function minutesMarks(g) {
    if (!state.minA) return;
    if (!minutes) minutesCompute();
    const d = list => list.map(pts => "M" + pts.map(p => map.P(p).join(",")).join("L")).join("");
    map.path(g, d(minutes.beyond), { class: "lab-min beyond" });
    minutes.pieces.forEach((list, b) => map.path(g, d(list), { class: "lab-min b" + b }));
    map.dot(g, state.minA.xy, 6, { class: "lab-walk-a" });
  }
  function minutesText() {
    if (!state.minA) return "Click anywhere near a street to start from there.";
    const w = minutes.within;
    return `From ${esc(minutes.street)}, at ${PACE} m a second:<table class="lab-vals"><tr><th></th>${w.map(x => `<th>${x.m} min</th>`).join("")}</tr>` +
      `<tr><td>homes</td>${w.map(x => `<td>${x.homes.toLocaleString("en")}</td>`).join("")}</tr>` +
      `<tr><td>places</td>${w.map(x => `<td>${x.places}</td>`).join("")}</tr>` +
      `<tr><td>bus and metro stops</td>${w.map(x => `<td>${x.stops}</td>`).join("")}</tr></table>` +
      `<span class="sub">Only the streets of the area are walked: a place just past its edge may be closer than it looks here.</span>`;
  }

  // ---- walk and look
  let walk = null;
  const STEP8 = 8, RAYS8 = 144, R8 = 300;
  function walkCompute() {
    const G = wgraph(), path = WK.between(G, state.walkA, state.walkB);
    if (!path) { walk = { none: true }; return; }
    const pts = path.pts, cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const L = cum[cum.length - 1];
    const at = d => { let i = 1; while (i < cum.length - 1 && cum[i] < d) i++; const t = (d - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1);
      return [pts[i - 1][0] + t * (pts[i][0] - pts[i - 1][0]), pts[i - 1][1] + t * (pts[i][1] - pts[i - 1][1])]; };
    const things = [];
    if (S6) S6.objects.forEach(o => things.push({ id: o.id, kind: ICON6[o.kind] ? o.kind : "furniture", xy: o.xy, o }));
    if (S4) S4.places.forEach(p => { if (!p.same_as) things.push({ id: p.id, kind: "place", xy: p.xy, name: p.name }); });
    const samples = [], seen = new Map();
    for (let d = 0; d <= L + 1e-6; d += STEP8) {
      const p = at(Math.min(d, L)), r = WK.cast(OUT8, p, RAYS8, R8), poly = WK.polygon(p, r);
      const inView = things.filter(t => Math.abs(t.xy[0] - p[0]) < R8 && Math.abs(t.xy[1] - p[1]) < R8 && WK.inside(poly, t.xy));
      inView.forEach(t => { if (!seen.has(t.id)) seen.set(t.id, { t, at: samples.length }); });
      const q = WK.snap(G, p);
      samples.push({ d, p, poly, area: WK.area(r), far: Math.max(...r), inView, street: G.segs[q.seg].street, seenSoFar: seen.size });
    }
    walk = { pts, L, samples, seen, at };
    state.walkPos = 0;
  }
  const sampleAt = d => walk.samples[Math.min(walk.samples.length - 1, Math.round(d / STEP8))];
  function walkMarks(g) {
    if (state.walkA) map.dot(g, state.walkA.xy, 6, { class: "lab-walk-a" });
    if (state.walkB) map.dot(g, state.walkB.xy, 6, { class: "lab-walk-a" });
    if (!walk || walk.none) return;
    map.line(g, walk.pts, { class: "lab-walk-path" });
    walkEls.poly = map.path(g, "", { class: "lab-view8 walk" });
    walkEls.icons = map.layer("focus").appendChild(document.createElementNS("http://www.w3.org/2000/svg", "g"));
    walkEls.dot = map.dot(g, walk.samples[0].p, 6, { class: "lab-walk-dot" });
    walkEls.shown = null;
    walkShow();
  }
  function walkShow() {
    if (!walk || walk.none || !walkEls.poly) return;
    const s = sampleAt(state.walkPos);
    const [x, y] = map.P(walk.at(state.walkPos)); walkEls.dot.setAttribute("cx", x); walkEls.dot.setAttribute("cy", y);   // the dot glides
    if (walkEls.shown === s && walkEls.zoom === map.view.w) return;   // a new view only every 8 m
    walkEls.shown = s; walkEls.zoom = map.view.w;
    walkEls.poly.setAttribute("d", "M" + s.poly.map(p => map.P(p).join(",")).join("L") + "Z");
    const g = walkEls.icons; while (g.firstChild) g.removeChild(g.firstChild);
    if (map.view.w < ICON_W) s.inView.forEach(t => {               // close: icons
      if (t.kind === "place") map.dot(g, t.xy, 3.5, { class: "lab-walk-place" });
      else map.icon(g, t.xy, "i-" + (ICON6[t.kind] || "other"), 14, { class: "lab-i6 k-" + (ICON6[t.kind] || "other") });
    });
    else {                                                           // far: one path of dots per kind
      const by = {};
      s.inView.forEach(t => { const k = t.kind === "place" ? "place" : (ICON6[t.kind] || "furniture"); (by[k] = by[k] || []).push(t.xy); });
      Object.entries(by).forEach(([k, pts]) => map.dots(g, pts, k === "place" ? 5 : 4,
        { class: k === "place" ? "lab-walk-place-d" : "lab-d6 k-" + ({ bench: "furniture", bin: "furniture", bike: "furniture", table: "furniture", water: "furniture", shelter: "furniture" }[k] || k) }));
    }
    const out = info.querySelector(".lab-walk-out"); if (out) out.innerHTML = walkText();
    const sl = info.querySelector(".lab-walkpos"); if (sl) sl.value = state.walkPos;
  }
  function count(list) {
    const c = {};
    list.forEach(t => { const k = t.kind === "place" ? "places" : t.kind === "tree" ? "trees" : t.kind === "street light" ? "street lights"
      : t.kind === "surveillance camera" ? "cameras" : t.kind === "crossing" ? "crossings" : t.kind === "hydrant" ? "hydrants" : t.kind === "road work" ? "road works" : "benches and other furniture";
      c[k] = (c[k] || 0) + 1; });
    const one = { trees: "tree", "street lights": "street light", cameras: "camera", crossings: "crossing", hydrants: "hydrant",
                  "road works": "road work", places: "place", "benches and other furniture": "bench or other piece of furniture" };
    return Object.entries(c).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${n} ${n === 1 ? one[k] : k}`).join(", ") || "nothing on the list";
  }
  function walkText() {
    if (!state.walkA) return "Click a first point near a street.";
    if (!state.walkB) return "Now click a second point.";
    if (!walk || walk.none) return walk && walk.none ? "No walk joins these two points." : "Loading the buildings…";
    const s = sampleAt(state.walkPos), mins = state.walkPos / PACE / 60, total = walk.L / PACE / 60;
    const names = s.inView.filter(t => t.kind === "place" && t.name).slice(0, 4).map(t => esc(t.name));
    const spark = (() => {
      const w = 260, h = 46, max = Math.max(...walk.samples.map(x => x.area)), X = d => w * d / walk.L, Y = a => h - 4 - (h - 8) * a / max;
      const line = walk.samples.map((x, i) => (i ? "L" : "M") + X(x.d).toFixed(1) + "," + Y(x.area).toFixed(1)).join("");
      return `<svg class="lab-spark" viewBox="0 0 ${w} ${h}" width="100%" height="${h}"><path d="${line}" class="l"/><line x1="${X(state.walkPos)}" x2="${X(state.walkPos)}" y1="0" y2="${h}" class="now"/></svg>`;
    })();
    return `<b>${Math.round(state.walkPos)} m</b> of ${Math.round(walk.L)} m · ${mins.toFixed(1)} of ${total.toFixed(1)} minutes · ${esc(s.street)}
      <br>You can see <b>${Math.round(s.area).toLocaleString("en")} m²</b> around you, and as far as ${Math.round(s.far)} m.
      <br>In view now: ${count(s.inView)}.${names.length ? `<br><span class="sub">Places in view: ${names.join(", ")}</span>` : ""}
      ${spark}<span class="sub">How much you can see along the walk, from start to end.</span>
      <br>Seen so far along the way: ${count([...walk.seen.values()].filter(x => x.at <= Math.round(state.walkPos / STEP8)).map(x => x.t))}.`;
  }
  function playWalk() {
    stopWalk();
    if (!walk || walk.none) return;
    if (state.walkPos >= walk.L) state.walkPos = 0;
    let last = performance.now();
    const tick = now => {
      state.walkPos = Math.min(walk.L, state.walkPos + (now - last) / 1000 * PACE * 30);   // thirty times faster than walking
      last = now;
      walkShow();
      if (state.walkPos < walk.L) walkAnim = requestAnimationFrame(tick); else walkAnim = null;
    };
    walkAnim = requestAnimationFrame(tick);
  }
  function stopWalk() { if (walkAnim) cancelAnimationFrame(walkAnim); walkAnim = null; }

  // ================================================================ 8 selection and start-up
  function render(keepSide) {
    const html = panelHTML();
    side.innerHTML = html;
    side.hidden = !html;
    host.querySelectorAll(".lab-tabs button").forEach(b => { b.classList.toggle("on", b.dataset.tab === state.tab); b.setAttribute("aria-selected", b.dataset.tab === state.tab ? "true" : "false");
      const t = TABS.find(x => x.id === b.dataset.tab); b.disabled = !t.ok || (past() && !t.past);
      if (t.ok) b.title = past() && !t.past ? "Not started in the past era" : ""; });
    host.querySelectorAll(".lab-era button").forEach(b => { b.classList.toggle("on", b.dataset.era === state.era); b.setAttribute("aria-pressed", String(b.dataset.era === state.era)); });
    host.classList.toggle("lab-past", past());
    if (!keepSide) info.innerHTML = sideHTML();
    paint();
    draw();
  }
  function refreshOut() {        // only the moving parts of the side, so a slider being dragged is not rebuilt
    const out = info.querySelector(".lab-out");
    if (out) out.innerHTML = state.tab === "s5" ? s5Text() : state.tab === "s8" ? walkText() : state.s1try === "minutes" ? minutesText() : state.s1try === "reach" ? reachText() : routeText();
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
    if (pick.kind === "home7") return h7[pick.id].xy;
    if (pick.kind === "odb") return S4.odb_alone.find(o => o.id === pick.id).xy;
    if (pick.kind === "hseg") return hseg[pick.id].pts[Math.floor(hseg[pick.id].pts.length / 2)];
    if (pick.kind === "hnet") return hnet[pick.id].pts[Math.floor(hnet[pick.id].pts.length / 2)];
    if (pick.kind === "hbld") { const r = hbRec[pick.id].ring; return [r.reduce((a, p) => a + p[0], 0) / r.length, r.reduce((a, p) => a + p[1], 0) / r.length]; }
    const c = checksOf(state.tab).find(x => x.id === pick.id) || allChecks().find(x => x.id === pick.id);   // ids repeat across systems
    return c ? c.xy : null;
  }
  function select(pick, approach) {
    const before = state.pick;
    state.pick = pick; state.approach = approach || null;
    render(true);
    if (!pick) return;
    if (before && before.kind === pick.kind && before.id === pick.id) return;
    const v8 = state.tab === "s8" && S8 && pick.kind === "segment" && S8.segments[pick.id] && S8.segments[pick.id].view;
    if (v8) {                                   // frame the whole view, so its far ends stay on screen
      const poly = viewPolygon(v8), xs = poly.map(q => q[0]), ys = poly.map(q => q[1]);
      if (!map.cw) map.measure();
      const cw = map.cw, free = Math.max(200, cw - map.cover());          // the part of the map the side panel leaves open
      const w = Math.max((Math.max(...xs) - Math.min(...xs)) * cw / free, (Math.max(...ys) - Math.min(...ys)) * cw / map.ch);
      map.zoomTo([(Math.max(...xs) + Math.min(...xs)) / 2, (Math.max(...ys) + Math.min(...ys)) / 2], Math.max(380, w * 1.1));
    } else {
      const xy = centreOf(pick);
      if (xy) shownMap().zoomTo(xy, pick.kind === "junction" ? 220 : 380);
    }
    if (narrow() && pick.kind !== "junction") side.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  // find a street by name, or a segment or junction by its id, without the pointer (added 2026-10-21)
  function find(q) {
    q = (q || "").trim();
    if (!q) return "";
    if (past()) setEra("now");
    const id = q.toUpperCase();
    if (seg[id]) { select({ kind: "segment", id }); return `${seg[id].street || "a path"}, ${id}`; }
    if (jun[id]) { select({ kind: "junction", id }); return `junction ${id}`; }
    const low = q.toLowerCase();
    let list = S1.segments.filter(x => x.street && x.street.toLowerCase() === low);
    if (!list.length) list = S1.segments.filter(x => x.street && x.street.toLowerCase().includes(low));
    if (!list.length) return `no street or id matches "${q}"`;
    const name = list[0].street, all = list.filter(x => x.street === name), pts = all.flatMap(x => x.pts);
    const c = [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length];
    const d = x => { const m = centreOf({ kind: "segment", id: x.id }); return Math.hypot(m[0] - c[0], m[1] - c[1]); };
    const best = all.reduce((a, b) => d(b) < d(a) ? b : a);         // the piece nearest the middle of the street
    select({ kind: "segment", id: best.id });
    return `${name}: ${all.length} segment${all.length > 1 ? "s" : ""}, showing ${best.id}`;
  }
  const findForm = $(".lab-find"), findIn = $("#lab-find-in"), findOut = $(".lab-find-out");
  findForm.addEventListener("submit", e => { e.preventDefault(); findOut.textContent = find(findIn.value); });
  findIn.addEventListener("change", () => { findOut.textContent = find(findIn.value); });
  // Escape closes the detail panel, wherever the focus is in the Lab (added 2026-10-21)
  host.addEventListener("keydown", e => { if (e.key === "Escape" && state.pick) { select(null); e.preventDefault(); } });

  function setEra(e) {
    if (e !== "now" && !H) return;
    const b3 = host.querySelector(".b3d[aria-pressed='true']"); if (b3) b3.click();      // the 3D view stands on today's buildings
    state.era = e; state.pick = null; state.approach = null;
    if (past() && !TABS.find(x => x.id === state.tab).past) state.tab = "s1";
    clearInterval(timer); stopWalk();
    render();
    if (past()) { pmap.view = Object.assign({}, map.view); pmap.measure(); }
    shownMap().fit(true);                       // the whole area, so the two networks are seen as wholes
  }
  function setTab(t) {
    if (!TABS.find(x => x.id === t && x.ok && (!past() || x.past))) return;
    state.tab = t; state.pick = null; state.approach = null;
    clearInterval(timer); stopWalk();
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
    if (e.target.classList.contains("lab-matpanels-on")) { state.matPanels = e.target.checked; render(true); }
    if (e.target.classList.contains("lab-odb-on")) { state.s4odb = e.target.checked; render(true); }
    if (e.target.classList.contains("lab-canopy-on")) { state.s6canopy = e.target.checked; render(true); }
  });
  host.addEventListener("input", e => {
    const t = e.target;
    if (t.classList.contains("lab-radius")) { state.s2radius = +t.value; paint(); refreshOut(); }
    if (t.classList.contains("lab-step")) { state.reachStep = +t.value; paint(); refreshOut(); }
    if (t.classList.contains("lab-slack")) { state.routeSlack = +t.value; render(); }
    if (t.classList.contains("lab-hour")) { state.s5hour = +t.value; clearInterval(timer); draw(); refreshOut(); }
    if (t.classList.contains("lab-walkpos")) { stopWalk(); state.walkPos = +t.value; walkShow(); }
  });
  host.addEventListener("click", e => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.tab) { setTab(b.dataset.tab); return; }
    if (b.dataset.era) { setEra(b.dataset.era); return; }
    if (b.dataset.overview) { const p = state.pick; state.tab = "all"; render(); select(p); return; }
    if (b.dataset.hseg) { select({ kind: "hseg", id: b.dataset.hseg }); return; }
    const group = b.closest(".lab-seg");
    if (group) {
      state[group.dataset.key] = b.dataset.v;
      if (group.dataset.key === "s2net" && state.s2radius > RADII[state.s2net].length - 1) state.s2radius = RADII[state.s2net].length - 1;
      if (group.dataset.key === "s1mode") state.reachStep = 0;
      if (group.dataset.key === "s8tool") stopWalk();
      render();
      if (group.dataset.key === "s1mode" && state.s1try === "reach") playReach();
      return;
    }
    if (b.dataset.open) { state.onlyOpen = !state.onlyOpen; render(true); return; }
    if (b.dataset.close) select(null);
    if (b.dataset.check) select({ kind: "check", id: b.dataset.check });
    if (b.dataset.app) select(state.pick, b.dataset.app === state.approach ? null : b.dataset.app);
    if (b.dataset.b) { if (state.tab !== "s4" && state.tab !== "mat" && state.tab !== "all") { state.tab = "s4"; render(); } select({ kind: "building", id: b.dataset.b }); }
    if (b.dataset.place) { if (state.tab !== "s4") state.tab = "s4"; state.s4places = true; render(); select({ kind: "place", id: b.dataset.place }); }
    if (b.dataset.seg) select({ kind: "segment", id: b.dataset.seg });
    if (b.dataset.play === "radius") playRadius();
    if (b.dataset.play === "reach") playReach();
    if (b.dataset.play === "day") playDay();
    if (b.dataset.play === "walk") playWalk();
    if (b.dataset.play === "walkstop") stopWalk();
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

  // links from the book: #s1 to #s9, #radius, #reach-J080, #route-J093-J130, #J027-S020, #w201008914
  function fromHash() {
    const h = location.hash;
    let m;
    if ((m = /^#(past|compare)(?:-(s[124]|all))?$/.exec(h)) && H) { state.era = m[1] === "past" ? "1912" : "compare"; state.tab = m[2] || "s1"; state.pick = null; render(); return; }
    if (h === "#overview") { setEra("now"); setTab("all"); return; }
    if ((m = /^#(s[1-9])$/.exec(h))) { if (past()) setEra("now"); setTab(m[1]); return; }
    if (h === "#radius") { setTab("s2"); playRadius(); return; }
    if ((m = /^#reach(?:-(J\d{3}))?$/.exec(h))) {
      state.tab = "s1"; state.s1try = "reach";
      if (m[1] && jun[m[1]]) state.reachStart = m[1];
      render(); playReach(); return;
    }
    if ((m = /^#route-(J\d{3})-(J\d{3})$/.exec(h)) && jun[m[1]] && jun[m[2]]) {
      state.tab = "s1"; state.s1try = "route"; state.routeA = m[1]; state.routeB = m[2]; render(); return;
    }
    if ((m = /^#([wr]\d+)$/.exec(h)) && S4 && b4[m[1]]) { state.era = "now"; state.tab = "s4"; render(); select({ kind: "building", id: m[1] }); return; }
    if ((m = /^#(J\d{3})(?:-(S\d{3}))?$/.exec(h)) && jun[m[1]]) {
      state.tab = "s3"; state.s3view = "rules"; render();
      select({ kind: "junction", id: m[1] }, m[2] && r3.app[m[2] + "@" + m[1]] ? m[2] : null);
    }
  }
  window.addEventListener("hashchange", fromHash);

  // for the 3D view (lab3d.js): it reads the map as drawn, and picks through the same select()
  window.SituLab = {
    map, host, select: p => select(p),
    openBuilding: id => { if (state.tab !== "s4" && state.tab !== "s8" && state.tab !== "mat" && state.tab !== "all") { state.tab = "s4"; render(); } select({ kind: "building", id }); },
    tab: () => state.tab,
    // S6 for the 3D view: the objects the 2D map shows now (same filter), and how it sizes and flags them
    s6: () => S6 ? { shown: S6.objects.filter(show6), trunk: trunk6, seen: S6_SEEN, light: SLUG6, pick: state.pick } : null,
    segment: id => seg[id],
  };
  window.dispatchEvent(new Event("situ-lab-ready"));

  render();
  map.fit(false);
  fromHash();
})();
