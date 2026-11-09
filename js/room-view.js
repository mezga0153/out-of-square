// Step 2: the room in 3D. three.js coordinates: X = plan x, Y = height, Z = plan y.
// Walls, floor and ceiling only show their inside face, so whatever is between the camera and the
// room is invisible, like a doll's house, and can't be tapped.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { spotPoint, meanValueWeights, inwardNormal, signedArea } from './geometry.js';
import { triangulate } from './triangulate.js';
import { cornerName } from './names.js';

const v3 = p => new THREE.Vector3(p.x, p.z, p.y);

const COLORS = {
    floor: 0xd9c3a0,
    ceiling: 0xf3f1ed,
    walls: [0xe9e3d8, 0xdfe6e8, 0xe8dfdc, 0xe1e5da],
    edge: 0x1f2a30,
    dim: 0x1d6fb8,
    dimEmpty: 0x8a9399,
    selected: 0xc4561b,
    pending: 0xc4561b
};

export class RoomView {
    constructor(container, labels, { onTap, onLabelTap }) {
        this.container = container;
        this.labels = labels;
        this.onTap = onTap;
        this.onLabelTap = onLabelTap;
        this.room = null;
        this.measurements = [];
        this.selectedId = null;
        this.pending = null;
        this.viewName = 'iso';

        this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setClearColor(0xf4f1ec, 1);
        container.append(this.renderer.domElement);

        this.scene = new THREE.Scene();
        this.scene.add(new THREE.AmbientLight(0xffffff, 1.6));
        this.scene.add(new THREE.HemisphereLight(0xffffff, 0xb0a490, 1.2));
        const sun = new THREE.DirectionalLight(0xffffff, 0.8);
        sun.position.set(0.4, 1, 0.7);
        this.scene.add(sun);

        this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 100000);
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = false;
        this.controls.screenSpacePanning = true;
        this.controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
        this.controls.addEventListener('change', () => this.requestRender());

        this.roomGroup = new THREE.Group();
        this.dimGroup = new THREE.Group();
        this.scene.add(this.roomGroup, this.dimGroup);
        this.markerGeometry = new THREE.SphereGeometry(1, 16, 12);
        this.lineMaterials = [];
        this.markers = [];
        this.labelEls = new Map();

        this.setupTap();
        new ResizeObserver(() => this.resize()).observe(container);
        this.resize();
    }

    setupTap() {
        const canvas = this.renderer.domElement;
        let start = null;
        let touches = 0;
        canvas.addEventListener('pointerdown', e => {
            touches++;
            start = touches === 1 ? { x: e.clientX, y: e.clientY, t: performance.now() } : null;
        });
        const end = e => {
            touches = Math.max(0, touches - 1);
            if (!start) return;
            const moved = Math.hypot(e.clientX - start.x, e.clientY - start.y);
            const quick = performance.now() - start.t < 600;
            start = null;
            if (moved < 8 && quick && e.type === 'pointerup') {
                const spot = this.pick(e);
                this.onTap(spot);
            }
        };
        canvas.addEventListener('pointerup', end);
        canvas.addEventListener('pointercancel', end);
    }

    resize() {
        const w = this.container.clientWidth;
        const h = this.container.clientHeight;
        if (!w || !h) return;
        this.renderer.setSize(w, h);
        this.lineMaterials.forEach(m => m.resolution.set(w, h));
        this.updateFrustum();
        this.requestRender();
    }

    updateFrustum() {
        const w = this.container.clientWidth || 1;
        const h = this.container.clientHeight || 1;
        const half = this.halfHeight || 3000;
        this.camera.top = half;
        this.camera.bottom = -half;
        this.camera.left = -half * (w / h);
        this.camera.right = half * (w / h);
        this.camera.updateProjectionMatrix();
    }

    // Plan direction into the room for every wall
    inwards() {
        const r = this.room;
        const side = signedArea(r.bottoms) >= 0 ? 1 : -1;
        return r.walls.map(w => inwardNormal(r.bottoms[w.from], r.bottoms[w.to], side));
    }

    setRoom(room, measurements, { selectedId = null, pending = null } = {}) {
        const first = !this.room;
        this.room = room;
        this.measurements = measurements;
        this.selectedId = selectedId;
        this.pending = pending;
        this.buildRoom();
        this.buildDims();
        if (first) this.setView('iso');
        this.requestRender();
    }

    setOverlay({ selectedId = this.selectedId, pending = this.pending } = {}) {
        this.selectedId = selectedId;
        this.pending = pending;
        this.buildDims();
        this.requestRender();
    }

    clear(group) {
        for (const child of [...group.children]) {
            group.remove(child);
            child.geometry?.dispose?.();
            child.material?.dispose?.();
        }
    }

    buildRoom() {
        this.clear(this.roomGroup);
        const r = this.room;
        const inwards = this.inwards();
        this.meshes = [];

        const addFaces = (tris, normal, color, userData) => {
            const pos = [];
            for (const [a, b, c] of tris) {
                const A = v3(a), B = v3(b), C = v3(c);
                const n = new THREE.Vector3().subVectors(B, A).cross(new THREE.Vector3().subVectors(C, A));
                if (n.dot(normal) >= 0) pos.push(A, B, C);
                else pos.push(A, C, B);
            }
            const geo = new THREE.BufferGeometry().setFromPoints(pos);
            geo.computeVertexNormals();
            const mat = new THREE.MeshLambertMaterial({
                color, side: THREE.FrontSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1
            });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.userData = userData;
            this.roomGroup.add(mesh);
            this.meshes.push(mesh);
        };

        r.walls.forEach((w, i) => {
            const bf = r.bottoms[w.from], bt = r.bottoms[w.to], tf = r.tops[w.from], tt = r.tops[w.to];
            const n = new THREE.Vector3(inwards[i].x, 0, inwards[i].y);
            addFaces([[bf, bt, tt], [bf, tt, tf]], n, COLORS.walls[i % COLORS.walls.length], { kind: 'wall', wall: i });
        });

        if (r.closed) {
            const faces = triangulate(r.bottoms);
            addFaces(faces.map(f => f.map(k => r.bottoms[k])), new THREE.Vector3(0, 1, 0), COLORS.floor, { kind: 'floor' });
            addFaces(faces.map(f => f.map(k => r.tops[k])), new THREE.Vector3(0, -1, 0), COLORS.ceiling, { kind: 'ceiling' });
        }

        // Every edge, so the hidden walls still show where they are
        const pts = [];
        const n = r.bottoms.length;
        r.walls.forEach(w => {
            pts.push(v3(r.bottoms[w.from]), v3(r.bottoms[w.to]), v3(r.tops[w.from]), v3(r.tops[w.to]));
        });
        for (let i = 0; i < n; i++) pts.push(v3(r.bottoms[i]), v3(r.tops[i]));
        const edges = new THREE.LineSegments(
            new THREE.BufferGeometry().setFromPoints(pts),
            new THREE.LineBasicMaterial({ color: COLORS.edge, transparent: true, opacity: 0.55 })
        );
        this.roomGroup.add(edges);

        // Size of the room, for framing
        const box = new THREE.Box3();
        [...r.bottoms, ...r.tops].forEach(p => box.expandByPoint(v3(p)));
        this.box = box;
    }

    makeLine(a, b, color, { dashed = false, width = 3 } = {}) {
        const geo = new LineGeometry();
        geo.setPositions([a.x, a.y, a.z, b.x, b.y, b.z]);
        const mat = new LineMaterial({
            color, linewidth: width, dashed, dashSize: 60, gapSize: 40, depthTest: false, transparent: true
        });
        mat.resolution.set(this.container.clientWidth, this.container.clientHeight);
        this.lineMaterials.push(mat);
        const line = new Line2(geo, mat);
        line.computeLineDistances();
        line.renderOrder = 10;
        return line;
    }

    makeMarker(p, color) {
        const mesh = new THREE.Mesh(this.markerGeometry, new THREE.MeshBasicMaterial({ color, depthTest: false }));
        mesh.position.copy(p);
        mesh.renderOrder = 11;
        this.markers.push(mesh);
        return mesh;
    }

    buildDims() {
        this.lineMaterials = [];
        this.markers = [];
        this.clear(this.dimGroup);
        if (!this.room) return;
        const r = this.room;
        this.dimLabels = [];
        for (const m of this.measurements) {
            const A = v3(spotPoint(m.a, r));
            const B = v3(spotPoint(m.b, r));
            const empty = typeof m.value !== 'number';
            const color = m.id === this.selectedId ? COLORS.selected : empty ? COLORS.dimEmpty : COLORS.dim;
            this.dimGroup.add(this.makeLine(A, B, color, { dashed: empty, width: m.id === this.selectedId ? 5 : 3 }));
            this.dimGroup.add(this.makeMarker(A, color), this.makeMarker(B, color));
            this.dimLabels.push({ id: m.id, at: A.clone().add(B).multiplyScalar(0.5), text: empty ? '?' : String(Math.round(m.value)), empty, selected: m.id === this.selectedId });
        }
        if (this.pending?.a) {
            const A = v3(spotPoint(this.pending.a, r));
            this.dimGroup.add(this.makeMarker(A, COLORS.pending));
            if (this.pending.b) {
                const B = v3(spotPoint(this.pending.b, r));
                this.dimGroup.add(this.makeLine(A, B, COLORS.pending, { dashed: true, width: 4 }));
                this.dimGroup.add(this.makeMarker(B, COLORS.pending));
            }
        }
    }

    setView(name) {
        if (!this.room || !this.box) return;
        this.viewName = name;
        const center = this.box.getCenter(new THREE.Vector3());
        const size = this.box.getSize(new THREE.Vector3());
        const radius = Math.max(size.length() / 2, 500);
        const w = this.container.clientWidth || 1;
        const h = this.container.clientHeight || 1;
        const aspect = w / h;
        let dir;
        let target = center;
        let half;
        if (name === 'iso') {
            dir = new THREE.Vector3(-0.9, 1.05, 1.25).normalize();
            half = radius * 1.0;
        } else if (name === 'top') {
            dir = new THREE.Vector3(0, 1, 0.0001);
            half = Math.max(size.z / 2, size.x / 2 / aspect) * 1.2;
        } else if (name === 'ceiling') {
            dir = new THREE.Vector3(0, -1, 0.0001);
            half = Math.max(size.z / 2, size.x / 2 / aspect) * 1.2;
        } else if (typeof name === 'number') {
            const r = this.room;
            const wall = r.walls[name];
            const inward = this.inwards()[name];
            dir = new THREE.Vector3(inward.x, 0, inward.y).normalize();
            const pts = [r.bottoms[wall.from], r.bottoms[wall.to], r.tops[wall.from], r.tops[wall.to]].map(v3);
            target = pts.reduce((s, p) => s.add(p), new THREE.Vector3()).multiplyScalar(0.25);
            const len = Math.hypot(r.bottoms[wall.to].x - r.bottoms[wall.from].x, r.bottoms[wall.to].y - r.bottoms[wall.from].y);
            const hgt = Math.max(r.tops[wall.from].z - r.bottoms[wall.from].z, r.tops[wall.to].z - r.bottoms[wall.to].z);
            half = Math.max(hgt / 2, len / 2 / aspect) * 1.25;
        }
        this.halfHeight = half;
        this.camera.zoom = 1;
        this.camera.position.copy(target).addScaledVector(dir, radius * 6 + 2000);
        this.camera.near = 1;
        this.camera.far = radius * 20 + 10000;
        this.controls.target.copy(target);
        this.updateFrustum();
        this.camera.lookAt(target);
        this.controls.update();
        this.requestRender();
    }

    // World units per screen pixel
    unitsPerPixel() {
        return (this.camera.top - this.camera.bottom) / (this.camera.zoom * (this.container.clientHeight || 1));
    }

    toScreen(p) {
        const v = p.clone().project(this.camera);
        return { x: (v.x + 1) / 2 * this.container.clientWidth, y: (1 - v.y) / 2 * this.container.clientHeight };
    }

    // Tap → a spot on a wall, the floor or the ceiling, snapped to corners and edges
    pick(e) {
        if (!this.room) return null;
        const rect = this.renderer.domElement.getBoundingClientRect();
        const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
        const ray = new THREE.Raycaster();
        ray.setFromCamera(ndc, this.camera);
        const tap = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        const r0 = this.room;

        // Corners first, even behind a wall: they're what gets measured most
        let corner = null;
        [['bottoms', 0], ['tops', 1]].forEach(([key, v]) => r0[key].forEach((p, k) => {
            const s = this.toScreen(v3(p));
            const d = Math.hypot(s.x - tap.x, s.y - tap.y);
            if (d < 24 && (!corner || d < corner.d)) corner = { k, v, d };
        }));
        if (corner) return cornerSpot(r0, corner.k, corner.v);

        const hit = ray.intersectObjects(this.meshes, false)[0];
        if (!hit) return null;
        const screenDist = spot => {
            const s = this.toScreen(v3(spotPoint(spot, this.room)));
            return Math.hypot(s.x - tap.x, s.y - tap.y);
        };
        const r = this.room;
        const P = hit.point;
        const plan = { x: P.x, y: P.z };
        const kind = hit.object.userData.kind;

        if (kind === 'wall') {
            const i = hit.object.userData.wall;
            const w = r.walls[i];
            const bf = r.bottoms[w.from], bt = r.bottoms[w.to];
            const dx = bt.x - bf.x, dy = bt.y - bf.y;
            let u = ((plan.x - bf.x) * dx + (plan.y - bf.y) * dy) / (dx * dx + dy * dy || 1);
            u = Math.min(1, Math.max(0, u));
            const zb = bf.z + (bt.z - bf.z) * u;
            const zt = r.tops[w.from].z + (r.tops[w.to].z - r.tops[w.from].z) * u;
            let v = Math.min(1, Math.max(0, (P.y - zb) / ((zt - zb) || 1)));
            const corners = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([cu, cv]) => ({ kind: 'wall', wall: i, u: cu, v: cv }));
            const nearCorner = corners.map(s => [s, screenDist(s)]).sort((a, b) => a[1] - b[1])[0];
            if (nearCorner[1] < 30) return nearCorner[0];
            const edges = [{ u, v: 0 }, { u, v: 1 }, { u: 0, v }, { u: 1, v }].map(s => ({ kind: 'wall', wall: i, ...s }));
            const nearEdge = edges.map(s => [s, screenDist(s)]).sort((a, b) => a[1] - b[1])[0];
            if (nearEdge[1] < 22) return round(nearEdge[0]);
            return round({ kind: 'wall', wall: i, u, v });
        }

        // Floor or ceiling: snap to a corner, otherwise a point inside
        const pts = kind === 'floor' ? r.bottoms : r.tops;
        const vEdge = kind === 'floor' ? 0 : 1;
        let best = null;
        pts.forEach((p, k) => {
            const s = this.toScreen(v3(p));
            const d = Math.hypot(s.x - tap.x, s.y - tap.y);
            if (d < 30 && (!best || d < best.d)) best = { k, d };
        });
        if (best) return cornerSpot(r, best.k, vEdge);
        return { kind, w: meanValueWeights(plan, pts.map(p => ({ x: p.x, y: p.y }))) };
    }

    requestRender() {
        if (this.frame) return;
        this.frame = requestAnimationFrame(() => {
            this.frame = null;
            this.render();
        });
    }

    render() {
        const upp = this.unitsPerPixel();
        this.markers.forEach(m => m.scale.setScalar(upp * 6));
        this.renderer.render(this.scene, this.camera);
        this.drawLabels();
    }

    drawLabels() {
        if (!this.room) return;
        const seen = new Set();
        const put = (key, at, text, cls, onClick) => {
            seen.add(key);
            let node = this.labelEls.get(key);
            if (!node) {
                node = document.createElement('div');
                if (onClick) node.addEventListener('click', onClick);
                this.labels.append(node);
                this.labelEls.set(key, node);
            }
            node.className = 'label ' + cls;
            node.textContent = text;
            const s = this.toScreen(at);
            node.style.left = s.x + 'px';
            node.style.top = s.y + 'px';
        };

        const r = this.room;
        const look = this.camera.getWorldDirection(new THREE.Vector3());
        const inwards = this.inwards();
        r.walls.forEach((w, i) => {
            const n = new THREE.Vector3(inwards[i].x, 0, inwards[i].y);
            if (n.dot(look) > -0.05 && this.viewName !== 'top' && this.viewName !== 'ceiling') return;
            const zb = (r.bottoms[w.from].z + r.bottoms[w.to].z) / 2;
            const zt = (r.tops[w.from].z + r.tops[w.to].z) / 2;
            const mid = v3({
                x: (r.bottoms[w.from].x + r.bottoms[w.to].x) / 2 + inwards[i].x * 150,
                y: (r.bottoms[w.from].y + r.bottoms[w.to].y) / 2 + inwards[i].y * 150,
                z: zb + 0.75 * (zt - zb)
            });
            put('w' + i, mid, String(i + 1), 'wall');
        });
        r.bottoms.forEach((p, k) => put('c' + k, v3(p), cornerName(k), 'corner'));
        for (const d of this.dimLabels || []) {
            put('d' + d.id, d.at, d.text, 'dim' + (d.empty ? ' empty' : '') + (d.selected ? ' selected' : ''), () => this.onLabelTap(d.id));
        }
        for (const [key, node] of this.labelEls) {
            if (!seen.has(key)) {
                node.remove();
                this.labelEls.delete(key);
            }
        }
    }

    // Screen position (in the view) of a spot; used by tests
    screenOfSpot(spot) {
        return this.toScreen(v3(spotPoint(spot, this.room)));
    }

    // The 3D view as a PNG, for the report later
    snapshot() {
        this.render();
        return this.renderer.domElement.toDataURL('image/png');
    }
}

const round = s => ({ ...s, u: Math.round(s.u * 10000) / 10000, v: Math.round(s.v * 10000) / 10000 });

// A corner as a spot on one of its walls
export function cornerSpot(room, k, v) {
    const i = room.walls.findIndex(w => w.from === k);
    if (i >= 0) return { kind: 'wall', wall: i, u: 0, v };
    const j = room.walls.findIndex(w => w.to === k);
    return { kind: 'wall', wall: j, u: 1, v };
}
