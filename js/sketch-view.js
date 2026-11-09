// Step 1: the top view, drawn with a finger. Coordinates are mm, on a 0.5 m grid.
import { straighten, wallsOf, signedArea } from './geometry.js';
import { cornerName } from './names.js';

const NS = 'http://www.w3.org/2000/svg';
const el = (name, attrs = {}) => {
    const node = document.createElementNS(NS, name);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    return node;
};

export class SketchView {
    constructor(svg, { onOutline, onCornerMove }) {
        this.svg = svg;
        this.onOutline = onOutline;
        this.onCornerMove = onCornerMove;
        this.view = { x: -1000, y: -1000, w: 8000, h: 6000 };
        this.outline = null;
        this.pointers = new Map();
        this.stroke = null;
        this.drag = null;
        this.pinch = null;

        this.gGrid = el('g');
        this.gOutline = el('g');
        this.live = el('polyline', { class: 'stroke-live' });
        svg.append(this.gGrid, this.gOutline, this.live);
        svg.setAttribute('preserveAspectRatio', 'none');

        svg.addEventListener('pointerdown', e => this.down(e));
        svg.addEventListener('pointermove', e => this.move(e));
        svg.addEventListener('pointerup', e => this.up(e));
        svg.addEventListener('pointercancel', e => this.up(e, true));
        svg.addEventListener('wheel', e => this.wheel(e), { passive: false });
        new ResizeObserver(() => this.resize()).observe(svg);
    }

    // mm per screen pixel
    get scale() {
        const r = this.svg.getBoundingClientRect();
        return this.view.w / (r.width || 1);
    }

    toMM(e) {
        const r = this.svg.getBoundingClientRect();
        return {
            x: this.view.x + ((e.clientX - r.left) / r.width) * this.view.w,
            y: this.view.y + ((e.clientY - r.top) / r.height) * this.view.h
        };
    }

    resize() {
        const r = this.svg.getBoundingClientRect();
        if (!r.width || !r.height) return;
        // Keep the visible width, match the height to the screen's shape
        const cx = this.view.x + this.view.w / 2;
        const cy = this.view.y + this.view.h / 2;
        this.view.h = this.view.w * (r.height / r.width);
        this.view.x = cx - this.view.w / 2;
        this.view.y = cy - this.view.h / 2;
        this.applyView();
    }

    fit() {
        const r = this.svg.getBoundingClientRect();
        const aspect = r.height && r.width ? r.height / r.width : 0.75;
        let minX = 0, minY = 0, maxX = 5000, maxY = 4000;
        if (this.outline) {
            const xs = this.outline.corners.map(c => c.x);
            const ys = this.outline.corners.map(c => c.y);
            minX = Math.min(...xs); maxX = Math.max(...xs);
            minY = Math.min(...ys); maxY = Math.max(...ys);
        }
        const pad = 1200;
        let w = maxX - minX + 2 * pad;
        let h = maxY - minY + 2 * pad;
        if (h / w > aspect) w = h / aspect;
        h = w * aspect;
        this.view = { x: (minX + maxX) / 2 - w / 2, y: (minY + maxY) / 2 - h / 2, w, h };
        this.applyView();
    }

    applyView() {
        const v = this.view;
        this.svg.setAttribute('viewBox', `${v.x} ${v.y} ${v.w} ${v.h}`);
        this.drawGrid();
        this.drawOutline();
    }

    setOutline(outline) {
        this.outline = outline;
        this.drawOutline();
    }

    drawGrid() {
        const g = this.gGrid;
        g.replaceChildren();
        const v = this.view;
        const step = 500;
        const x0 = Math.floor(v.x / step) * step;
        const y0 = Math.floor(v.y / step) * step;
        for (let x = x0; x <= v.x + v.w; x += step) {
            g.append(el('line', { x1: x, y1: v.y, x2: x, y2: v.y + v.h, class: x % 1000 === 0 ? 'grid-major' : 'grid-minor' }));
        }
        for (let y = y0; y <= v.y + v.h; y += step) {
            g.append(el('line', { x1: v.x, y1: y, x2: v.x + v.w, y2: y, class: y % 1000 === 0 ? 'grid-major' : 'grid-minor' }));
        }
    }

    drawOutline() {
        const g = this.gOutline;
        g.replaceChildren();
        const o = this.outline;
        if (!o) return;
        const s = this.scale;
        const pts = o.corners.map(c => `${c.x},${c.y}`).join(' ');
        if (o.closed) g.append(el('polygon', { points: pts, class: 'outline-fill' }));
        const side = signedArea(o.corners) >= 0 ? 1 : -1;
        wallsOf(o).forEach((w, i) => {
            const a = o.corners[w.from];
            const b = o.corners[w.to];
            g.append(el('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: 'wall-line' }));
            // Wall number, just inside the room
            const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
            const nx = (-(b.y - a.y) / len) * side;
            const ny = ((b.x - a.x) / len) * side;
            const tx = (a.x + b.x) / 2 + nx * 34 * s;
            const ty = (a.y + b.y) / 2 + ny * 34 * s;
            const tag = el('g', { class: 'wall-tag' });
            tag.append(el('circle', { cx: tx, cy: ty, r: 14 * s }));
            const t = el('text', { x: tx, y: ty, 'font-size': 15 * s });
            t.textContent = i + 1;
            tag.append(t);
            g.append(tag);
        });
        const n = o.corners.length;
        o.corners.forEach((c, i) => {
            // Corner letter just outside the room, along the bisector of its walls
            let ox = 0, oy = 0;
            for (const j of [i - 1, i + 1]) {
                if (!o.closed && (j < 0 || j >= n)) continue;
                const q = o.corners[(j + n) % n];
                const len = Math.hypot(q.x - c.x, q.y - c.y) || 1;
                ox -= (q.x - c.x) / len;
                oy -= (q.y - c.y) / len;
            }
            const ol = Math.hypot(ox, oy) || 1;
            const t = el('text', { x: c.x + (ox / ol) * 30 * s, y: c.y + (oy / ol) * 30 * s, 'font-size': 14 * s, class: 'corner-tag' });
            t.textContent = cornerName(i);
            g.append(t);
        });
        o.corners.forEach((c, i) => {
            g.append(el('circle', { cx: c.x, cy: c.y, r: 13 * s, class: 'corner-handle', 'data-corner': i }));
        });
    }

    down(e) {
        this.svg.setPointerCapture(e.pointerId);
        this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (this.pointers.size === 2) {
            // Second finger: pinch/pan instead of drawing
            this.stroke = null;
            this.live.setAttribute('points', '');
            if (this.drag) { this.finishDrag(false); }
            this.startPinch();
            return;
        }
        if (this.pointers.size > 2) return;
        const corner = e.target.getAttribute?.('data-corner');
        if (corner !== null && corner !== undefined) {
            this.drag = { index: Number(corner), moved: false };
            return;
        }
        this.stroke = [this.toMM(e)];
    }

    move(e) {
        if (!this.pointers.has(e.pointerId)) return;
        this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (this.pinch) return this.updatePinch();
        if (this.drag) {
            const p = this.toMM(e);
            const snapped = { x: Math.round(p.x / 10) * 10, y: Math.round(p.y / 10) * 10 };
            this.drag.moved = true;
            this.outline.corners[this.drag.index] = snapped;
            this.drawOutline();
            this.onCornerMove(this.drag.index, snapped, false);
            return;
        }
        if (this.stroke) {
            const p = this.toMM(e);
            const last = this.stroke[this.stroke.length - 1];
            if (Math.hypot(p.x - last.x, p.y - last.y) > 2 * this.scale) {
                this.stroke.push(p);
                this.live.setAttribute('points', this.stroke.map(q => `${q.x},${q.y}`).join(' '));
            }
        }
    }

    up(e, cancelled = false) {
        this.pointers.delete(e.pointerId);
        if (this.pinch) {
            if (this.pointers.size < 2) this.pinch = null;
            return;
        }
        if (this.drag) return this.finishDrag(!cancelled);
        if (this.stroke && !cancelled) {
            const stroke = this.stroke;
            this.stroke = null;
            this.live.setAttribute('points', '');
            // Scale the straightening to what the finger can do on screen
            const s = this.scale;
            const result = straighten(stroke, { epsilon: 18 * s, closeDistance: 60 * s, minLength: 30 * s });
            if (result) this.onOutline(result);
        }
        this.stroke = null;
        this.live.setAttribute('points', '');
    }

    finishDrag(commit) {
        const d = this.drag;
        this.drag = null;
        if (commit && d.moved) this.onCornerMove(d.index, this.outline.corners[d.index], true);
    }

    startPinch() {
        const [a, b] = [...this.pointers.values()];
        this.pinch = {
            d: Math.hypot(a.x - b.x, a.y - b.y) || 1,
            mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
            view: { ...this.view }
        };
    }

    updatePinch() {
        const [a, b] = [...this.pointers.values()];
        if (!a || !b) return;
        const p = this.pinch;
        const r = this.svg.getBoundingClientRect();
        const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const k = p.d / d;
        const w = Math.min(60000, Math.max(800, p.view.w * k));
        const h = w * (r.height / r.width);
        // The mm point under the first midpoint stays under the fingers
        const fx = (p.mid.x - r.left) / r.width;
        const fy = (p.mid.y - r.top) / r.height;
        const mmX = p.view.x + fx * p.view.w;
        const mmY = p.view.y + fy * p.view.h;
        const nx = (mid.x - r.left) / r.width;
        const ny = (mid.y - r.top) / r.height;
        this.view = { x: mmX - nx * w, y: mmY - ny * h, w, h };
        this.applyView();
    }

    wheel(e) {
        e.preventDefault();
        const r = this.svg.getBoundingClientRect();
        const k = Math.exp(e.deltaY * 0.0015);
        const p = this.toMM(e);
        const w = Math.min(60000, Math.max(800, this.view.w * k));
        const h = w * (r.height / r.width);
        const fx = (e.clientX - r.left) / r.width;
        const fy = (e.clientY - r.top) / r.height;
        this.view = { x: p.x - fx * w, y: p.y - fy * h, w, h };
        this.applyView();
    }
}

// Small preview of an outline for the sketch cards
export function outlineThumbnail(outline) {
    const svg = el('svg', { viewBox: '0 0 100 60', preserveAspectRatio: 'xMidYMid meet' });
    if (!outline) return svg;
    const xs = outline.corners.map(c => c.x);
    const ys = outline.corners.map(c => c.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const w = Math.max(maxX - minX, 1), h = Math.max(maxY - minY, 1);
    const k = Math.min(90 / w, 50 / h);
    const pts = outline.corners.map(c => `${5 + (c.x - minX) * k + (90 - w * k) / 2},${5 + (c.y - minY) * k + (50 - h * k) / 2}`).join(' ');
    svg.append(el(outline.closed ? 'polygon' : 'polyline', {
        points: pts, fill: outline.closed ? 'rgba(196,86,27,0.08)' : 'none', stroke: '#1f2a30', 'stroke-width': 2, 'stroke-linejoin': 'round'
    }));
    return svg;
}
