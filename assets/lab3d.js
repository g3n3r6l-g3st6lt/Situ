/*
  Situ Lab  -  lab3d.js

  ONE JOB: show the Lab's map in 3D, on demand. Nothing here is computed from the data a second time:
    - the streets, surfaces and marks are read from the 2D map as it is drawn, with the colours the 2D map gives them,
      so the 3D view always shows the same tab, the same colouring and the same selection as the 2D view;
    - each building stands at the height G1 World chose for it (window.SITU_G1), on S4's outline; where G1 splits an outline
      into its measured parts (W36), the outline stands at its base height and each part at its own. A building with no
      height in any source stays a thin dashed-looking plate: unknown, never a guessed mass.
  Clicking a building or a street in 3D opens the same panel as in 2D.

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
      try { view = new View3D(L); } catch (err) { btn.disabled = true; btn.title = "3D needs WebGL, which this browser does not offer"; return; }
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
        if (op < 0.05 || el.classList.contains("sx-hit") || el.classList.contains("sx-jhit")) continue;
        const tag = el.tagName;
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
    const [css, op] = this.split(key), pos = [], idx = [], segOf = [];
    for (const it of list) {
      for (let i = 0; i < it.pts.length - 1; i++) {
        const [x1, z1] = it.pts[i], [x2, z2] = it.pts[i + 1], len = Math.hypot(x2 - x1, z2 - z1);
        if (!len) continue;
        const nx = -(z2 - z1) / len * it.w / 2, nz = (x2 - x1) / len * it.w / 2, b = pos.length / 3;
        pos.push(x1 + nx, it.y, z1 + nz, x1 - nx, it.y, z1 - nz, x2 + nx, it.y, z2 + nz, x2 - nx, it.y, z2 - nz);
        idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
        segOf.push(it.seg, it.seg);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
    const m = new THREE.Mesh(g, this.mat("flat", css, op));
    m.userData.segOf = segOf;
    if (segOf.some(Boolean)) this.picks.push(m);
    return m;
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
        this.picks.push(mesh);
      }
    }
    this.world.add(group);
  }

  // ---------------------------------------------------------------- pointing and clicking
  hit(e) {
    const r = this.canvas.getBoundingClientRect();
    const v = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(v, this.camera);
    const h = this.ray.intersectObjects(this.picks, false)[0];
    if (!h) return null;
    if (h.object.userData.b) return { b: h.object.userData.b };
    const s = h.object.userData.segOf && h.object.userData.segOf[Math.floor(h.faceIndex / 2)];
    return s ? { seg: s } : null;
  }
  events() {
    let down = null;
    this.canvas.addEventListener("pointerdown", e => { down = [e.clientX, e.clientY]; });
    this.canvas.addEventListener("pointermove", e => {
      if (e.buttons) { this.map.untip(); return; }
      const h = this.hit(e);
      if (h && h.b) {
        const S4 = window.SITU_S4, G1 = window.SITU_G1, b = S4.buildings.find(x => x.id === h.b), g = G1 && G1.blocks[h.b];
        this.map.tip(e, `${esc(b.name || b.id)}<br><span>${g && g.h != null ? g.h + " m, " + esc(g.source) : "height unknown"}</span>`);
        this.canvas.style.cursor = "pointer";
      } else if (h && h.seg) {
        const s = (window.SITU_S1.segments || []).find(x => x.id === h.seg);
        this.map.tip(e, `${esc((s && s.street) || "a path")} <span>${h.seg}</span>`);
        this.canvas.style.cursor = "pointer";
      } else { this.map.untip(); this.canvas.style.cursor = ""; }
    });
    this.canvas.addEventListener("pointerleave", () => this.map.untip());
    this.canvas.addEventListener("click", e => {
      if (down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4) return;      // a drag is never a click
      const h = this.hit(e);
      if (h && h.b) this.L.openBuilding(h.b);
      else if (h && h.seg) this.L.select({ kind: "segment", id: h.seg });
    });
  }
}

function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
