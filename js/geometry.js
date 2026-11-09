// Pure 2D/3D helpers: stroke straightening, polygon helpers, spot positions.
// Plan coordinates are mm: x to the right, y down (as drawn on screen). Heights (z) are mm up.

export const dist2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const dist3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
export const lerp3 = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });

// Ramer–Douglas–Peucker simplification
export function simplify(points, epsilon) {
    if (points.length < 3) return points.slice();
    const first = points[0];
    const last = points[points.length - 1];
    let maxD = -1;
    let index = 0;
    for (let i = 1; i < points.length - 1; i++) {
        const d = pointSegmentDistance(points[i], first, last);
        if (d > maxD) { maxD = d; index = i; }
    }
    if (maxD <= epsilon) return [first, last];
    const left = simplify(points.slice(0, index + 1), epsilon);
    const right = simplify(points.slice(index), epsilon);
    return left.slice(0, -1).concat(right);
}

export function pointSegmentDistance(p, a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) return dist2(p, a);
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

// Turn a freehand stroke into a tidy outline of corners.
// Segments within `snapDeg` of horizontal/vertical are snapped; closing the stroke near its start closes the room.
export function straighten(stroke, { epsilon = 120, snapDeg = 14, closeDistance = 400, minLength = 150 } = {}) {
    if (stroke.length < 2) return null;
    let pts = simplify(stroke, epsilon);
    let closed = pts.length > 3 && dist2(pts[0], pts[pts.length - 1]) < closeDistance;
    if (closed) pts = pts.slice(0, -1);

    pts = dropShortSegments(pts, closed, minLength);
    if (pts.length < 2 || (closed && pts.length < 3)) {
        closed = false;
        if (pts.length < 2) return null;
    }

    // Snap: a horizontal segment makes its two ends share y, a vertical one x.
    // Union-find over the coordinates keeps a closed room closed after snapping.
    const n = pts.length;
    const segCount = closed ? n : n - 1;
    const xs = new UnionFind(n);
    const ys = new UnionFind(n);
    const kinds = [];
    for (let i = 0; i < segCount; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % n];
        const angle = Math.abs(Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI);
        const fromHorizontal = Math.min(angle, 180 - angle);
        const fromVertical = Math.abs(90 - angle);
        if (fromHorizontal <= snapDeg) { ys.union(i, (i + 1) % n); kinds.push('h'); }
        else if (fromVertical <= snapDeg) { xs.union(i, (i + 1) % n); kinds.push('v'); }
        else kinds.push('free');
    }
    const avg = (uf, key) => {
        const sums = new Map();
        pts.forEach((p, i) => {
            const r = uf.find(i);
            const s = sums.get(r) || { sum: 0, count: 0 };
            s.sum += p[key];
            s.count++;
            sums.set(r, s);
        });
        return pts.map((p, i) => { const s = sums.get(uf.find(i)); return s.sum / s.count; });
    };
    const ax = avg(xs, 'x');
    const ay = avg(ys, 'y');
    let corners = pts.map((p, i) => ({ x: Math.round(ax[i] / 10) * 10, y: Math.round(ay[i] / 10) * 10 }));

    corners = mergeCollinear(corners, closed);
    if (closed && corners.length < 3) return null;
    if (corners.length < 2) return null;
    return { corners, closed };
}

function dropShortSegments(pts, closed, minLength) {
    let out = pts.slice();
    let changed = true;
    while (changed && out.length > 2) {
        changed = false;
        const n = out.length;
        const segCount = closed ? n : n - 1;
        for (let i = 0; i < segCount; i++) {
            const j = (i + 1) % n;
            if (dist2(out[i], out[j]) < minLength) {
                // Keep the end of an open outline in place; otherwise merge into the midpoint
                if (!closed && j === n - 1) out.splice(i, 1);
                else if (!closed && i === 0) out.splice(j, 1);
                else {
                    out[i] = { x: (out[i].x + out[j].x) / 2, y: (out[i].y + out[j].y) / 2 };
                    out.splice(j, 1);
                }
                changed = true;
                break;
            }
        }
    }
    return out;
}

function mergeCollinear(corners, closed) {
    let out = corners.slice();
    let changed = true;
    while (changed && out.length > (closed ? 3 : 2)) {
        changed = false;
        const n = out.length;
        for (let i = 0; i < n; i++) {
            if (!closed && (i === 0 || i === n - 1)) continue;
            const prev = out[(i - 1 + n) % n];
            const cur = out[i];
            const next = out[(i + 1) % n];
            const cross = (cur.x - prev.x) * (next.y - cur.y) - (cur.y - prev.y) * (next.x - cur.x);
            const scale = dist2(prev, cur) * dist2(cur, next) || 1;
            if (Math.abs(cross) / scale < 0.02 || dist2(prev, cur) < 1 || dist2(cur, next) < 1) {
                out.splice(i, 1);
                changed = true;
                break;
            }
        }
    }
    return out;
}

class UnionFind {
    constructor(n) { this.p = Array.from({ length: n }, (_, i) => i); }
    find(i) { while (this.p[i] !== i) { this.p[i] = this.p[this.p[i]]; i = this.p[i]; } return i; }
    union(a, b) { this.p[this.find(a)] = this.find(b); }
}

// Signed area, positive when the corners run clockwise on screen (y down)
export function signedArea(corners) {
    let a = 0;
    for (let i = 0; i < corners.length; i++) {
        const p = corners[i];
        const q = corners[(i + 1) % corners.length];
        a += p.x * q.y - q.x * p.y;
    }
    return a / 2;
}

// Walls of an outline: index pairs
export function wallsOf(outline) {
    const n = outline.corners.length;
    const walls = [];
    for (let i = 0; i < (outline.closed ? n : n - 1); i++) walls.push({ from: i, to: (i + 1) % n });
    return walls;
}

// Which side of each wall is the inside: +1 = left of the direction from→to (on screen, y down), -1 = right
export function insideSide(outline) {
    // A positive area means the corners run clockwise on screen, and then (-dy, dx) points inside
    return signedArea(outline.corners) >= 0 ? 1 : -1;
}

// Unit normal (in plan) pointing into the room for wall from a to b
export function inwardNormal(a, b, side) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    // (-dy, dx) is the normal on the right of travel in a y-down frame
    return { x: (-dy / len) * side, y: (dx / len) * side };
}

// Mean value coordinates of point p inside polygon `poly` (any simple polygon)
export function meanValueWeights(p, poly) {
    const n = poly.length;
    const s = poly.map(v => ({ x: v.x - p.x, y: v.y - p.y }));
    const r = s.map(v => Math.hypot(v.x, v.y));
    for (let i = 0; i < n; i++) {
        if (r[i] < 1e-6) return poly.map((_, j) => (j === i ? 1 : 0));
    }
    const tanHalf = [];
    for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const cross = s[i].x * s[j].y - s[i].y * s[j].x;
        const dot = s[i].x * s[j].x + s[i].y * s[j].y;
        const angle = Math.atan2(cross, dot);
        tanHalf.push(Math.tan(angle / 2));
    }
    const w = [];
    for (let i = 0; i < n; i++) {
        const prev = (i - 1 + n) % n;
        w.push((tanHalf[prev] + tanHalf[i]) / r[i]);
    }
    const sum = w.reduce((a, b) => a + b, 0);
    if (!isFinite(sum) || Math.abs(sum) < 1e-12) return poly.map(() => 1 / n);
    return w.map(v => v / sum);
}

// Where a spot is, given the room's corner points.
// room: { bottoms: [{x,y,z}], tops: [{x,y,z}], walls: [{from,to}] }
// spot: { kind: 'wall', wall, u, v } | { kind: 'floor' | 'ceiling', w: [weights] }
export function spotPoint(spot, room) {
    if (spot.kind === 'wall') {
        const wall = room.walls[spot.wall];
        const b = lerp3(room.bottoms[wall.from], room.bottoms[wall.to], spot.u);
        const t = lerp3(room.tops[wall.from], room.tops[wall.to], spot.u);
        return lerp3(b, t, spot.v);
    }
    const pts = spot.kind === 'floor' ? room.bottoms : room.tops;
    const out = { x: 0, y: 0, z: 0 };
    spot.w.forEach((w, i) => {
        out.x += w * pts[i].x;
        out.y += w * pts[i].y;
        out.z += w * pts[i].z;
    });
    return out;
}

// The room as drawn: corners at floor level and at the default height
export function sketchedRoom(outline, height) {
    return {
        bottoms: outline.corners.map(c => ({ x: c.x, y: c.y, z: 0 })),
        tops: outline.corners.map(c => ({ x: c.x, y: c.y, z: height })),
        walls: wallsOf(outline),
        closed: outline.closed
    };
}

// Turn of the outline at each corner (angle between incoming and outgoing wall), radians
export function cornerAngle(prev, cur, next) {
    const a1 = Math.atan2(cur.y - prev.y, cur.x - prev.x);
    const a2 = Math.atan2(next.y - cur.y, next.x - cur.x);
    let d = a2 - a1;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return d;
}
