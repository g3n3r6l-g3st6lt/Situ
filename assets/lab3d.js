/*
  Situ Lab  -  lab3d.js

  ONE JOB: show the Lab's map in 3D, on demand. Nothing here is computed from the data a second time:
    - the streets, surfaces and marks are read from the 2D map as it is drawn, with the colours the 2D map gives them,
      so the 3D view always shows the same tab, the same colouring and the same selection as the 2D view;
    - each building stands at the height G1 World chose for it (window.SITU_G1), on S4's outline; where G1 splits an outline
      into its measured parts (W36), the outline stands at its base height and each part at its own. A building with no
      height in any source stays a thin dashed-looking plate: unknown, never a guessed mass.
  Pointing and clicking work as in 2D, because they ARE the 2D map's: a 3D pointer is turned into the point on the ground
  it falls on, and the event is handed to the 2D element drawn there (its own handler runs) or to the 2D map at that point
  (the walk and minutes tools, and the objects found by nearness). Moving the 3D camera moves the hidden 2D view with it,
  so the marks drawn only when zoomed in (S6's icons, labels) appear in 3D too.

  Needs: three.js r160 (assets/vendor/three, MIT), lab.js (window.SituLab), outputs/s4 and outputs/g1 web data.
*/
import * as THREE from "./vendor/three/three.module.min.js";
import { OrbitControls } from "./vendor/three/OrbitControls.js";

const UNKNOWN_H = 0.6;          // metres: the plate that marks a building whose height no source gives
const M_PER_PX = 2.2;           // a 2D stroke of 1 px becomes a band this many metres wide on the 3D ground
const MIN_BAND_M = 3;           // and no band is narrower than this, so a coloured street stays readable from above
const LIFT = 0.04;              // metres between one 2D layer and the next, so they never flicker

function ready(fn) {
  if (window.SituLab) fn(window.SituLab);
  else window.addEventListener("situ-lab-ready", () => fn(window.SituLab), { once: true });
}

ready(L => {
  const map = L.map, host = map.host, svg = map.svg;
  const box = host.querySelector(".situ-map-controls");
  if (!box) return;
  const btn = document.createElement("button");
  btn.type = "button"; btn.className = "b3d"; btn.textContent = "3D";
  btn.title = "Show the map in 3D"; btn.setAttribute("aria-label", "Show the map in 3D"); btn.setAttribute("aria-pressed", "false");
  box.appendChild(btn);
  let view = null;
  btn.addEventListener("click", () => {
    if (!view) {
      try { view = new View3D(L); L.view3d = view; } catch (err) { btn.disabled = true; btn.title = "3D needs WebGL, which this browser does not offer"; return; }
    }
    const on = !host.classList.contains("is-3d");
    host.classList.toggle("is-3d", on);
    btn.setAttribute("aria-pressed", String(on));
    btn.textContent = on ? "2D" : "3D";
    btn.title = on ? "Back to the 2D map" : "Show the map in 3D";
    btn.setAttribute("aria-label", btn.title);
    if (on) view.show(); else view.hide();
  });
});

class View3D {
  constructor(L) {
    this.L = L; this.map = L.map; this.host = L.map.host; this.svg = L.map.svg;
    this.canvas = document.createElement("canvas");
    this.canvas.className = "lab3d";
    this.canvas.setAttribute("role", "img");
    this.canvas.setAttribute("aria-label", "The map in 3D: drag to turn, right-drag or two fingers to move, scroll or pinch to zoom. "
      + "Click a building or a street for its details, as in 2D.");
    this.host.insertBefore(this.canvas, this.host.querySelector(".situ-map-controls"));
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(getComputedStyle(this.host).backgroundColor || "#050505");
    this.camera = new THREE.PerspectiveCamera(40, 1, 2, 20000);
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.maxPolarAngle = Math.PI * 0.47;
    this.controls.screenSpacePanning = false;
    this.controls.addEventListener("change", () => this.draw());
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x202020, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(-0.5, 1, 0.35);
    this.scene.add(sun);
    this.world = new THREE.Group();
    this.scene.add(this.world);
    this.mats = new Map();
    this.picks = [];
    this.ray = new THREE.Raycaster();
    this.ray.params.Line = { threshold: 3 };
    this.fitted = false;
    new ResizeObserver(() => { if (this.on) { this.size(); this.draw(); } }).observe(this.host);
    // the 2D map changes (a tab, a colouring, a selection): build the 3D view again, once things settle
    this.watch = new MutationObserver(() => { if (this.on) { clearTimeout(this.t); this.t = setTimeout(() => this.build(), 120); } });
    this.watch.observe(this.svg, { subtree: true, childList: true, attributes: true, attributeFilter: ["class", "style", "d", "points"] });
    this.events();
  }

  show() { this.on = true; this.size(); this.build(); if (!this.fitted) this.fit(); this.draw(); }
  hide() { this.on = false; this.map.untip(); }
  size() {
    const w = this.host.clientWidth || 600, h = this.host.clientHeight || 400;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }
  draw() { if (this.on) this.renderer.render(this.scene, this.camera); }

  // the whole area, seen from the south-west and above
  fit() {
    const b = this.map.bounds, a = this.map.P([b[0], b[1]]), c = this.map.P([b[2], b[3]]);
    const cx = (a[0] + c[0]) / 2, cz = (a[1] + c[1]) / 2, span = Math.max(Math.abs(c[0] - a[0]), Math.abs(c[1] - a[1]));
    this.controls.target.set(cx, 0, cz);
    this.camera.position.set(cx - span * 0.15, span * 0.42, cz + span * 0.55);
    this.controls.update();
    this.fitted = true;
  }

  // ---------------------------------------------------------------- materials, one per colour and look
  mat(kind, css, opacity) {
    const key = kind + "|" + css + "|" + opacity;
    if (!this.mats.has(key)) {
      const color = new THREE.Color(); color.setStyle(css);
      const o = { color, transparent: opacity < 1, opacity, side: THREE.DoubleSide, depthWrite: opacity >= 1 };
      this.mats.set(key, kind === "lit" ? new THREE.MeshLambertMaterial(o)
        : kind === "line" ? new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity })
        : new THREE.MeshBasicMaterial(o));
    }
    return this.mats.get(key);
  }

  clear() {
    for (const o of [...this.world.children]) {
      this.world.remove(o);
      o.traverse(x => { if (x.geometry) x.geometry.dispose(); });
    }
    this.picks = [];
    this.targets = [];
  }

  // ---------------------------------------------------------------- the scene, read from the 2D map
  build() {
    this.clear();
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(40000, 40000), this.mat("flat", "#0b0b0b", 1));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.05;
    this.world.add(ground);
    this.buildings();
    const bands = new Map(), discs = new Map(), plates = new Map();
    let level = 0;
    for (const g of this.svg.children) {
      if (g.tagName !== "g") continue;
      level++;
      if (g.classList.contains("layer-buildings") || g.classList.contains("layer-labels")) continue;
      if (g.style.display === "none") continue;
      const y = level * LIFT;
      for (const el of g.querySelectorAll("polyline, path, line, circle, rect, use")) {
        if (el.closest('[style*="display: none"]')) continue;
        const cs = getComputedStyle(el);
        if (cs.display === "none") continue;          // (visibility is hidden on purpose: the 2D map hides under the 3D one)
        const op = +cs.opacity || 0;
        const tag = el.tagName;
        if (el.classList.contains("sx-hit") || el.classList.contains("sx-jhit")) {        // the 2D map's own click targets
          if (cs.pointerEvents === "none") continue;                                        // switched off here, as in 2D
          if (tag === "circle") { const [x, z, r] = this.centre(el); this.targets.push(this.hitDisc(x, y, z, Math.max(r, 2), el)); }
          else { const pts = this.points(el); if (pts.length > 1) this.targets.push(this.hitBand(pts, y, Math.max(7, (parseFloat(cs.strokeWidth) || 14) * M_PER_PX * 0.5), el)); }
          continue;
        }
        if (op < 0.05) continue;
        if (tag === "circle" || tag === "rect" || tag === "use") {
          const fill = cs.fill !== "none" ? cs.fill : cs.stroke !== "none" ? cs.stroke : cs.color;
          if (!fill || fill === "none") continue;
          const [x, z, r] = this.centre(el);
          this.add(discs, fill, op * (+cs.fillOpacity || 1), { x, y, z, r: Math.max(r, 1.6) });
          continue;
        }
        const d = el.getAttribute("d") || "";
        if (tag === "path" && /h0/.test(d)) {                     // a layer of dots, drawn as one path
          const w = (parseFloat(cs.strokeWidth) || 3) * M_PER_PX / 2;
          if (cs.stroke === "none") continue;
          for (const m of d.matchAll(/M(-?[\d.]+),(-?[\d.]+)h0/g)) this.add(discs, cs.stroke, op * (+cs.strokeOpacity || 1), { x: +m[1], y, z: +m[2], r: Math.max(w, 1.4) });
          continue;
        }
        const pts = this.points(el);
        if (pts.length < 2) continue;
        const closed = tag === "path" && /z\s*$/i.test(d.trim());
        if (closed && cs.fill !== "none" && (+cs.fillOpacity || 0) > 0.02) {
          this.add(plates, cs.fill, op * (+cs.fillOpacity || 1), { pts, y });
          if (el.classList.contains("lab-surf6")) this.targets.push(this.hitPlate(pts, y, el));
        }
        if (cs.stroke !== "none" && (+cs.strokeOpacity || 1) > 0.02) {
          const w = Math.max((parseFloat(cs.strokeWidth) || 1) * M_PER_PX, MIN_BAND_M);
          const dashed = cs.strokeDasharray && cs.strokeDasharray !== "none";
          this.add(bands, cs.stroke, op * (+cs.strokeOpacity || 1) * (dashed ? 0.6 : 1),
            { pts, y: y + 0.01, w, seg: el.getAttribute("data-seg") });
        }
      }
    }
    for (const [key, list] of plates) this.world.add(this.plateMesh(key, list));
    for (const [key, list] of bands) this.world.add(this.bandMesh(key, list));
    for (const [key, list] of discs) this.world.add(this.discMesh(key, list));
    this.labels();
    for (const t of this.targets) this.world.add(t);
    this.draw();
  }

  add(groups, css, opacity, item) {
    const key = css + "|" + Math.round(Math.min(1, opacity) * 100) / 100;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  split(key) { const i = key.lastIndexOf("|"); return [key.slice(0, i), +key.slice(i + 1)]; }

  // an element's points, in the SVG's own units (metres from the map's origin, y down = 3D z)
  points(el) {
    if (el.tagName === "polyline") return [...el.points].map(p => [p.x, p.y]);
    if (el.tagName === "line") return [[+el.getAttribute("x1"), +el.getAttribute("y1")], [+el.getAttribute("x2"), +el.getAttribute("y2")]];
    const d = el.getAttribute("d") || "";
    if (/^[MLZ\d\s,.\-]+$/i.test(d)) {
      return [...d.matchAll(/(-?[\d.]+)[ ,](-?[\d.]+)/g)].map(m => [+m[1], +m[2]]);
    }
    try {                                                   // curves: follow the path every 4 m
      const n = el.getTotalLength(), k = Math.min(200, Math.max(2, Math.ceil(n / 4)));
      return Array.from({ length: k + 1 }, (_, i) => { const p = el.getPointAtLength(n * i / k); return [p.x, p.y]; });
    } catch (e) { return []; }
  }
  centre(el) {
    if (el.tagName === "circle") return [+el.getAttribute("cx"), +el.getAttribute("cy"), +el.getAttribute("r")];
    const x = +el.getAttribute("x"), y = +el.getAttribute("y"), w = +el.getAttribute("width") || 0, h = +el.getAttribute("height") || 0;
    return [x + w / 2, y + h / 2, Math.max(w, h) / 2];
  }

  bandMesh(key, list) {
    const [css, op] = this.split(key), pos = [], idx = [];
    for (const it of list) {
      for (let i = 0; i < it.pts.length - 1; i++) {
        const [x1, z1] = it.pts[i], [x2, z2] = it.pts[i + 1], len = Math.hypot(x2 - x1, z2 - z1);
        if (!len) continue;
        const nx = -(z2 - z1) / len * it.w / 2, nz = (x2 - x1) / len * it.w / 2, b = pos.length / 3;
        pos.push(x1 + nx, it.y, z1 + nz, x1 - nx, it.y, z1 - nz, x2 + nx, it.y, z2 + nz, x2 - nx, it.y, z2 - nz);
        idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
    return new THREE.Mesh(g, this.mat("flat", css, op));
  }
  // invisible copies of the 2D map's click targets, each naming its 2D element
  hitBand(pts, y, w, el) {
    const pos = [], idx = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const [x1, z1] = pts[i], [x2, z2] = pts[i + 1], len = Math.hypot(x2 - x1, z2 - z1);
      if (!len) continue;
      const nx = -(z2 - z1) / len * w / 2, nz = (x2 - x1) / len * w / 2, b = pos.length / 3;
      pos.push(x1 + nx, y, z1 + nz, x1 - nx, y, z1 - nz, x2 + nx, y, z2 + nz, x2 - nx, y, z2 - nz);
      idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
    return this.target(g, el);
  }
  hitDisc(x, y, z, r, el) {
    const g = new THREE.CircleGeometry(r, 12); g.rotateX(-Math.PI / 2); g.translate(x, y + 0.03, z);
    const m = this.target(g, el); m.userData.centre = [x, z]; return m;
  }
  hitPlate(pts, y, el) {
    const g = new THREE.ShapeGeometry(new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)))); g.rotateX(-Math.PI / 2); g.translate(0, y, 0);
    return this.target(g, el);
  }
  target(g, el) {
    const m = new THREE.Mesh(g, this.hidden || (this.hidden = new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide })));
    m.userData.el = el;
    return m;
  }

  // the 2D map's labels, as flat cards that always face the camera
  labels() {
    const g = this.svg.querySelector(".layer-labels");
    if (!g || g.style.display === "none") return;
    for (const t of g.querySelectorAll("text")) {
      const cs = getComputedStyle(t), str = t.textContent;
      if (!str || cs.display === "none") continue;
      const px = 22, c = document.createElement("canvas"), k = c.getContext("2d");
      k.font = `${px}px ${cs.fontFamily || "sans-serif"}`;
      c.width = Math.ceil(k.measureText(str).width) + 12; c.height = px + 12;
      k.font = `${px}px ${cs.fontFamily || "sans-serif"}`; k.textBaseline = "middle";
      k.lineWidth = 5; k.strokeStyle = "#000"; k.strokeText(str, 6, c.height / 2);
      k.fillStyle = cs.fill && cs.fill !== "none" ? cs.fill : "#ffffff"; k.fillText(str, 6, c.height / 2);
      const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, sizeAttenuation: false, depthTest: false, transparent: true }));
      const h = 0.032;                                         // a share of the view's height, the same size at any distance
      sp.scale.set(h * c.width / c.height, h, 1);
      sp.center.set(t.getAttribute("text-anchor") === "middle" ? 0.5 : t.getAttribute("text-anchor") === "end" ? 1 : 0, 0.5);
      sp.position.set(+t.getAttribute("x"), 2, +t.getAttribute("y"));
      sp.renderOrder = 10;
      this.world.add(sp);
    }
  }

  plateMesh(key, list) {
    const [css, op] = this.split(key), geos = [];
    for (const it of list) {
      const shape = new THREE.Shape(it.pts.map(([x, z]) => new THREE.Vector2(x, -z)));
      const g = new THREE.ShapeGeometry(shape); g.rotateX(-Math.PI / 2); g.translate(0, it.y, 0);
      geos.push(g);
    }
    return new THREE.Group().add(...geos.map(g => new THREE.Mesh(g, this.mat("flat", css, op))));
  }
  discMesh(key, list) {
    const [css, op] = this.split(key);
    const g = new THREE.CircleGeometry(1, 12); g.rotateX(-Math.PI / 2);
    const m = new THREE.InstancedMesh(g, this.mat("flat", css, op), list.length), o = new THREE.Object3D();
    list.forEach((it, i) => { o.position.set(it.x, it.y + 0.02, it.z); o.scale.set(it.r, 1, it.r); o.updateMatrix(); m.setMatrixAt(i, o.matrix); });
    return m;
  }

  // ---------------------------------------------------------------- buildings at G1's heights
  buildings() {
    const S4 = window.SITU_S4, G1 = window.SITU_G1;
    if (!S4) return;
    const layer = this.svg.querySelector(".layer-buildings"), shown = layer && layer.style.display !== "none";
    const group = new THREE.Group();
    for (const b of S4.buildings) {
      const g1 = G1 && G1.blocks[b.id], h = g1 && g1.h != null ? g1.h : null;
      let css = "#4a4a4a", op = 1;
      const el = layer && layer.querySelector(`[data-b="${b.id}"]`);
      const pick = shown && el && getComputedStyle(el).pointerEvents !== "none";   // only where 2D lets it be pointed at
      if (shown && el) {
        const cs = getComputedStyle(el);
        if (cs.fill && cs.fill !== "none") { css = cs.fill; op = Math.max(0.35, (+cs.fillOpacity || 1) * (+cs.opacity || 1)); }
        else if (cs.stroke && cs.stroke !== "none") css = cs.stroke;
      }
      const split = g1 && g1.massing === "parts" && g1.base != null;
      const masses = [[b.ring, split ? g1.base : h]].concat(split ? g1.parts.map(q => [q[2], q[1]]) : []);
      for (const [ring, hh] of masses) {
        const shape = new THREE.Shape(ring.map(p => { const [x, z] = this.map.P(p); return new THREE.Vector2(x, -z); }));
        const geo = new THREE.ExtrudeGeometry(shape, { depth: hh != null ? hh : UNKNOWN_H, bevelEnabled: false });
        geo.rotateX(-Math.PI / 2);
        const mesh = new THREE.Mesh(geo, this.mat("lit", hh != null ? css : "#ffb020", hh != null ? Math.min(op, 1) : 0.45));
        mesh.userData.b = b.id;
        group.add(mesh);
        group.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 20), this.mat("line", "#000000", 0.55)));
        if (pick) { mesh.userData.el = el; this.picks.push(mesh); }    // else the pointer passes through, as it does in 2D
      }
    }
    this.world.add(group);
  }

  // ---------------------------------------------------------------- pointing and clicking, handed to the 2D map
  // the first thing under the pointer: a building (it hides what lies behind it), else a 2D click target, else the ground
  hit(e) {
    const r = this.canvas.getBoundingClientRect();
    const v = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(v, this.camera);
    const all = this.ray.intersectObjects(this.picks.concat(this.targets), false);
    // targets lying on the same layer tie: as in 2D, the point nearest the pointer wins (the centre of a mark)
    const near = all.filter(x => x.distance <= (all[0] ? all[0].distance : 0) + 0.5);
    const h = near.find(x => x.object.userData.b) ||
      near.slice().sort((a, c) => this.off(a) - this.off(c))[0];
    let p = h ? h.point : null;
    if (!p) { const q = new THREE.Vector3(); p = this.ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), q); }
    return { el: h && h.object.userData.el || null, b: h && h.object.userData.b, p };
  }
  off(x) { const c = x.object.userData.centre; return c ? Math.hypot(x.point.x - c[0], x.point.z - c[1]) : 1e6; }
  // where a world point (the map's metres) stands on the 3D screen: for the browser tests
  screenOf(w, y = 0) {
    const v = new THREE.Vector3(w[0] - this.map.o[0], y, this.map.o[1] - w[1]).project(this.camera), r = this.canvas.getBoundingClientRect();
    return [r.left + (v.x + 1) / 2 * r.width, r.top + (1 - v.y) / 2 * r.height];
  }
  // where a ground point (3D) would be on screen in the hidden 2D map
  screen2d(p) {
    const w = [p.x + this.map.o[0], this.map.o[1] - p.z], [sx, sy] = this.map.toScreen(w), r = this.svg.getBoundingClientRect();
    return { clientX: r.left + sx, clientY: r.top + sy };
  }
  send(type, h, e) {
    if (h.el && !h.el.isConnected) { clearTimeout(this.t); this.build(); h = this.hit(e); }   // the 2D map was redrawn: catch up first
    if (!h.p) return false;
    const at = this.screen2d(h.p);
    const ev = new MouseEvent(type, Object.assign({ bubbles: true, cancelable: true, buttons: 0 }, at));
    (h.el || this.svg).dispatchEvent(ev);
    if (type === "pointermove" && this.map.tipEl.classList.contains("on")) {     // the tip goes where the 3D pointer is
      const r = this.host.getBoundingClientRect();
      this.map.tipEl.style.left = (e.clientX - r.left + 14) + "px"; this.map.tipEl.style.top = (e.clientY - r.top + 14) + "px";
    }
    return true;
  }
  events() {
    let down = null, last = null;
    this.canvas.addEventListener("pointerdown", e => { down = [e.clientX, e.clientY]; });
    this.canvas.addEventListener("pointermove", e => {
      if (e.buttons) { this.map.untip(); return; }
      const h = this.hit(e);
      if (last && last !== h.el) last.dispatchEvent(new MouseEvent("pointerleave"));
      last = h.el;
      if (!h.el) this.map.untip();
      this.send("pointermove", h, e);
      this.canvas.style.cursor = h.el || this.map.svg.style.cursor === "pointer" ? "pointer" : "";
    });
    this.canvas.addEventListener("pointerleave", () => { if (last) last.dispatchEvent(new MouseEvent("pointerleave")); last = null; this.map.untip(); });
    this.canvas.addEventListener("click", e => {
      if (down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4) return;      // a drag is never a click
      this.map.moved = false;
      this.send("click", this.hit(e), e);
    });
    // the hidden 2D view follows the 3D camera, so what the 2D map draws only when zoomed in is drawn here too
    this.controls.addEventListener("end", () => {
      const t = this.controls.target, d = this.camera.position.distanceTo(t);
      const w = 2 * d * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * this.camera.aspect;
      this.map.autoFit = false;
      this.map.view = { x: t.x + this.map.o[0], y: this.map.o[1] - t.z, w: Math.max(150, w) };
      this.map.apply(true);
    });
  }
}

function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
