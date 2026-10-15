/*
  situ-map.js  -  a small pan-and-zoom map for the Situ explorers. No libraries.

  Coordinates are metres, turned like every Situ sheet. SVG counts y downwards,
  so every point is drawn at (x, -y), measured from the area's corner: browsers draw
  in single precision, and coordinates in the millions blur and vanish when zoomed in.

  Sizes that should stay the same on screen (dots, text) are given in pixels and
  converted with px(): pixels / (pixels per metre). Lines use non-scaling strokes.

  Labels never overlap: free(box) keeps the boxes already drawn in this frame and
  refuses a new one that touches them.
*/
(function () {
  const NS = "http://www.w3.org/2000/svg";

  function el(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs || {}) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  function ease(t) { return t * t * (3 - 2 * t); }

  class SituMap {
    constructor(host, points) {
      this.host = host;
      host.classList.add("situ-map");
      this.svg = el("svg", { class: "situ-map-svg" }, host);
      this.layers = {};
      this.redraws = [];
      this.boxes = [];
      const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
      this.bounds = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
      this.o = [this.bounds[0], this.bounds[1]];       // the origin every point is measured from
      this.cover = () => 0;          // pixels hidden on the right by a floating panel; an explorer may set this
      this.tipEl = document.createElement("div");
      this.tipEl.className = "situ-map-tip";
      host.appendChild(this.tipEl);
      this.controls();
      this.fit(false);           // a first view; the explorer fits again once its panel exists
      this.events();
      this.autoFit = true;                       // until someone zooms or drags, a resize refits the whole area
      new ResizeObserver(() => this.autoFit ? this.fit(false) : this.apply()).observe(host);
    }

    // ---------------------------------------------------------------- layers and drawing
    layer(name) {
      if (!this.layers[name]) this.layers[name] = el("g", { class: "layer-" + name }, this.svg);
      return this.layers[name];
    }
    clear(name) { const g = this.layer(name); while (g.firstChild) g.removeChild(g.firstChild); return g; }
    onRedraw(fn) { this.redraws.push(fn); }

    k() { return (this.svg.clientWidth || 600) / this.view.w; }      // pixels per metre
    px(p) { return p / this.k(); }                                    // p pixels, in metres

    // world metres to SVG units: from the origin, y flipped
    P(p) { return [+(p[0] - this.o[0]).toFixed(2), +(-(p[1] - this.o[1])).toFixed(2)]; }

    line(g, pts, attrs) {
      return el("polyline", Object.assign({ points: pts.map(p => this.P(p).join(",")).join(" "),
        fill: "none", "vector-effect": "non-scaling-stroke" }, attrs), g);
    }
    path(g, d, attrs) { return el("path", Object.assign({ d, fill: "none", "vector-effect": "non-scaling-stroke" }, attrs), g); }
    curve(g, a, c, b, attrs) {                          // from a to b, bending towards c
      const [A, C, B] = [a, c, b].map(p => this.P(p));
      return this.path(g, `M${A} Q${C} ${B}`, attrs);
    }
    dot(g, p, rpx, attrs) { const [x, y] = this.P(p); return el("circle", Object.assign({ cx: x, cy: y, r: this.px(rpx) }, attrs), g); }
    square(g, p, spx, attrs) {
      const s = this.px(spx), [x, y] = this.P(p);
      return el("rect", Object.assign({ x: x - s / 2, y: y - s / 2, width: s, height: s }, attrs), g);
    }
    text(g, p, str, sizepx, attrs) {
      const [x, y] = this.P(p);
      const t = el("text", Object.assign({ x, y, "font-size": this.px(sizepx),
        "stroke-width": this.px(3) }, attrs), g);                       // the dark halo, 3 px wide
      t.textContent = str;
      return t;
    }
    // a label that only appears where it overlaps nothing already placed
    label(g, p, str, sizepx, attrs, anchor) {
      const w = str.length * sizepx * 0.58, h = sizepx * 1.3;
      const [sx, sy] = this.toScreen(p);
      const x0 = anchor === "middle" ? sx - w / 2 : anchor === "end" ? sx - w : sx;
      if (!this.free([x0 - 3, sy - h / 2 - 2, x0 + w + 3, sy + h / 2 + 2])) return null;
      return this.text(g, p, str, sizepx, Object.assign({ "text-anchor": anchor || "start",
        "dominant-baseline": "central", class: "situ-map-label" }, attrs));
    }
    free(b) {
      for (const o of this.boxes) if (b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]) return false;
      this.boxes.push(b);
      return true;
    }
    reserve(p, rpx) { const [x, y] = this.toScreen(p); this.boxes.push([x - rpx, y - rpx, x + rpx, y + rpx]); }

    // ---------------------------------------------------------------- the view
    toScreen(p) {
      const k = this.k();
      return [(p[0] - (this.view.x - this.view.w / 2)) * k, (-p[1] - (-this.view.y - this.viewH() / 2)) * k];
    }
    toWorld(sx, sy) {
      const k = this.k();
      return [this.view.x - this.view.w / 2 + sx / k, -(-this.view.y - this.viewH() / 2 + sy / k)];
    }
    viewH() { return this.view.w * (this.svg.clientHeight || 400) / (this.svg.clientWidth || 600); }
    apply() {
      const h = this.viewH();
      const [cx, cy] = this.P([this.view.x, this.view.y]);
      this.svg.setAttribute("viewBox", [cx - this.view.w / 2, cy - h / 2, this.view.w, h].join(" "));
      this.boxes = [];
      for (const fn of this.redraws) fn();
    }
    // the whole area, in the part of the map a floating panel leaves free
    fit(animate) {
      const [x0, y0, x1, y1] = this.bounds, pad = 1.06;
      const W = this.svg.clientWidth || 600, H = this.svg.clientHeight || 400, free = Math.max(W - this.cover(), W * 0.4);
      const wFree = Math.max((x1 - x0) * pad, (y1 - y0) * pad * free / H);
      const w = wFree * W / free;
      this.go({ x: (x0 + x1) / 2 + (W - free) / 2 * w / W, y: (y0 + y1) / 2, w }, animate);
    }
    // centre p in the part of the map not covered by a side panel `coverPx` wide on the right
    zoomTo(p, w, coverPx) {
      this.autoFit = false;
      if (coverPx === undefined) coverPx = this.cover();
      const shift = coverPx / 2 * w / (this.svg.clientWidth || 600);
      this.go({ x: p[0] + shift, y: p[1], w }, true);
    }
    go(target, animate) {
      if (!animate || !this.view) { this.view = target; this.apply(); return; }
      const from = Object.assign({}, this.view), t0 = performance.now(), ms = 450;
      cancelAnimationFrame(this.anim);
      const step = now => {
        const t = ease(Math.min(1, (now - t0) / ms));
        this.view = { x: from.x + (target.x - from.x) * t, y: from.y + (target.y - from.y) * t,
                      w: from.w * Math.pow(target.w / from.w, t) };
        this.apply();
        if (t < 1) this.anim = requestAnimationFrame(step);
      };
      this.anim = requestAnimationFrame(step);
    }
    zoomBy(f, sx, sy) {
      this.autoFit = false;
      const r = this.svg.getBoundingClientRect();
      if (sx === undefined) { sx = r.width / 2; sy = r.height / 2; }
      const before = this.toWorld(sx, sy);
      const w = Math.min(Math.max(this.view.w * f, 40), (this.bounds[2] - this.bounds[0]) * 3);
      this.view.w = w;
      const after = this.toWorld(sx, sy);
      this.view.x += before[0] - after[0];
      this.view.y += before[1] - after[1];
      this.apply();
    }

    // ---------------------------------------------------------------- pointer
    events() {
      let drag = null;
      this.moved = false;
      this.svg.addEventListener("wheel", e => {
        e.preventDefault();
        const r = this.svg.getBoundingClientRect();
        this.zoomBy(Math.exp(e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
      }, { passive: false });
      // two fingers: pinch to zoom around the point between them
      const touches = new Map();
      let pinch = null;
      const gap = () => { const [a, b] = [...touches.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
      const middle = () => { const [a, b] = [...touches.values()], r = this.svg.getBoundingClientRect(); return [(a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top]; };
      this.svg.addEventListener("pointerdown", e => {
        touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (touches.size === 2) { pinch = gap(); drag = null; this.moved = true; return; }
        drag = { x: e.clientX, y: e.clientY, vx: this.view.x, vy: this.view.y };
        this.moved = false;
      });
      window.addEventListener("pointermove", e => {
        if (touches.has(e.pointerId)) touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pinch && touches.size === 2) {
          const now = gap(), [mx, my] = middle();
          if (now > 0) this.zoomBy(pinch / now, mx, my);
          pinch = now;
          return;
        }
        if (!drag) return;
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 4) this.moved = true;
        if (!this.moved) return;
        this.autoFit = false;
        const k = this.k();
        this.view.x = drag.vx - dx / k;
        this.view.y = drag.vy + dy / k;
        this.apply();
      });
      const end = e => { touches.delete(e.pointerId); if (touches.size < 2) pinch = null; drag = null; };
      window.addEventListener("pointerup", end);
      window.addEventListener("pointercancel", end);
    }
    // click handlers call this first: a drag is never a click
    wasDrag() { return this.moved; }

    controls() {
      const box = document.createElement("div");
      box.className = "situ-map-controls";
      for (const [label, title, fn] of [["+", "Zoom in", () => this.zoomBy(0.6)],
                                        ["−", "Zoom out", () => this.zoomBy(1 / 0.6)],
                                        ["⤢", "Whole area", () => { this.autoFit = true; this.fit(true); }]]) {
        const b = document.createElement("button");
        b.type = "button"; b.textContent = label; b.title = title; b.setAttribute("aria-label", title);
        b.addEventListener("click", fn);
        box.appendChild(b);
      }
      this.host.appendChild(box);
    }

    // ---------------------------------------------------------------- tooltip
    tip(e, html) {
      const r = this.host.getBoundingClientRect();
      this.tipEl.innerHTML = html;
      this.tipEl.style.left = (e.clientX - r.left + 14) + "px";
      this.tipEl.style.top = (e.clientY - r.top + 14) + "px";
      this.tipEl.classList.add("on");
    }
    untip() { this.tipEl.classList.remove("on"); }
  }

  window.SituMap = SituMap;
  window.SituMap.el = el;
})();
