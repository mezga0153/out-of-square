// Fits the room's real shape to the measurements.
//
// Unknowns: for every corner a bottom point (on the floor) and a top point (at the ceiling), x/y/z each.
// Every measurement says: the distance between spot A and spot B is `value`.
// Weak "prior" terms keep whatever wasn't measured close to the sketch: walls upright, floor and ceiling
// flat, corner angles and wall lengths as drawn, ceiling at the default height. They are weak enough that
// measurements always win, so the room takes the measured shape and only falls back to the sketch where
// nothing says otherwise.

import { spotPoint, sketchedRoom, dist3, cornerAngle } from './geometry.js';

const W = {
    measurement: 1,
    upright: 0.03,      // top point straight above bottom point
    floorFlat: 0.2,     // floor level from corner to corner (a height reading moves the ceiling, not the floor)
    flat: 0.03,         // ceiling level from corner to corner
    angle: 0.03,        // corner angles as sketched (residual in mm over 1 m)
    anchor: 0.03,       // first corner stays put, first wall keeps its direction
    height: 0.003,      // ceiling at the default height
    length: 0.003       // wall lengths in the sketch's proportions (the overall scale is free)
};

export function solveRoom(outline, height, measurements, { iterations = 60 } = {}) {
    const prior = sketchedRoom(outline, height);
    const n = outline.corners.length;
    const walls = prior.walls;
    const used = measurements.filter(m => typeof m.value === 'number' && isFinite(m.value) && m.value > 0);

    // Pack/unpack: [b0x,b0y,b0z,t0x,t0y,t0z, b1x, ...]
    const pack = room => {
        const v = new Float64Array(6 * n + 1);
        v[6 * n] = 1; // scale of the sketch
        for (let i = 0; i < n; i++) {
            const b = room.bottoms[i];
            const t = room.tops[i];
            v.set([b.x, b.y, b.z, t.x, t.y, t.z], 6 * i);
        }
        return v;
    };
    const unpack = v => {
        const bottoms = [];
        const tops = [];
        for (let i = 0; i < n; i++) {
            bottoms.push({ x: v[6 * i], y: v[6 * i + 1], z: v[6 * i + 2] });
            tops.push({ x: v[6 * i + 3], y: v[6 * i + 4], z: v[6 * i + 5] });
        }
        return { bottoms, tops, walls, closed: outline.closed };
    };

    const sketchAngles = [];
    const angleCorners = [];
    for (let i = 0; i < n; i++) {
        if (!outline.closed && (i === 0 || i === n - 1)) continue;
        const prev = outline.corners[(i - 1 + n) % n];
        const next = outline.corners[(i + 1) % n];
        angleCorners.push(i);
        sketchAngles.push(cornerAngle(prev, outline.corners[i], next));
    }
    const sketchLengths = walls.map(w => Math.hypot(
        outline.corners[w.to].x - outline.corners[w.from].x,
        outline.corners[w.to].y - outline.corners[w.from].y));
    const w0 = walls[0];
    const sketchDir = Math.atan2(
        outline.corners[w0.to].y - outline.corners[w0.from].y,
        outline.corners[w0.to].x - outline.corners[w0.from].x);
    const c0 = outline.corners[0];

    const residuals = v => {
        const room = unpack(v);
        const r = [];
        for (const m of used) {
            r.push(W.measurement * (dist3(spotPoint(m.a, room), spotPoint(m.b, room)) - m.value));
        }
        for (let i = 0; i < n; i++) {
            const b = room.bottoms[i];
            const t = room.tops[i];
            r.push(W.upright * (t.x - b.x), W.upright * (t.y - b.y));
            r.push(W.height * (t.z - b.z - height));
        }
        for (const w of walls) {
            const bf = room.bottoms[w.from], bt = room.bottoms[w.to];
            const tf = room.tops[w.from], tt = room.tops[w.to];
            r.push(W.floorFlat * (bt.z - bf.z), W.flat * (tt.z - tf.z));
        }
        angleCorners.forEach((i, k) => {
            const prev = room.bottoms[(i - 1 + n) % n];
            const next = room.bottoms[(i + 1) % n];
            let d = cornerAngle(prev, room.bottoms[i], next) - sketchAngles[k];
            while (d > Math.PI) d -= 2 * Math.PI;
            while (d < -Math.PI) d += 2 * Math.PI;
            r.push(W.angle * 1000 * d);
        });
        walls.forEach((w, k) => {
            const len = Math.hypot(room.bottoms[w.to].x - room.bottoms[w.from].x, room.bottoms[w.to].y - room.bottoms[w.from].y);
            r.push(W.length * (len - v[6 * n] * sketchLengths[k]));
        });
        const b0 = room.bottoms[0];
        r.push(W.anchor * (b0.x - c0.x), W.anchor * (b0.y - c0.y), W.anchor * b0.z);
        const b1 = room.bottoms[w0.to];
        let dd = Math.atan2(b1.y - b0.y, b1.x - b0.x) - sketchDir;
        while (dd > Math.PI) dd -= 2 * Math.PI;
        while (dd < -Math.PI) dd += 2 * Math.PI;
        r.push(W.anchor * 1000 * dd);
        return r;
    };

    let x = pack(prior);
    if (used.length === 0) return { room: unpack(x), rms: 0 };

    // Levenberg–Marquardt with a numeric Jacobian (a few dozen unknowns, so this is quick)
    const cost = r => r.reduce((s, e) => s + e * e, 0);
    let r = residuals(x);
    let c = cost(r);
    let lambda = 1e-3;
    const h = 1e-3;
    const nv = x.length;
    for (let iter = 0; iter < iterations; iter++) {
        const nr = r.length;
        const J = new Array(nv);
        for (let j = 0; j < nv; j++) {
            const xj = x[j];
            x[j] = xj + h;
            const rp = residuals(x);
            x[j] = xj;
            const col = new Float64Array(nr);
            for (let k = 0; k < nr; k++) col[k] = (rp[k] - r[k]) / h;
            J[j] = col;
        }
        const JTJ = Array.from({ length: nv }, () => new Float64Array(nv));
        const JTr = new Float64Array(nv);
        for (let a = 0; a < nv; a++) {
            const ca = J[a];
            let s = 0;
            for (let k = 0; k < nr; k++) s += ca[k] * r[k];
            JTr[a] = s;
            for (let b = a; b < nv; b++) {
                const cb = J[b];
                let t = 0;
                for (let k = 0; k < nr; k++) t += ca[k] * cb[k];
                JTJ[a][b] = t;
                JTJ[b][a] = t;
            }
        }
        let improved = false;
        for (let attempt = 0; attempt < 10; attempt++) {
            const A = JTJ.map((row, i) => {
                const copy = Float64Array.from(row);
                copy[i] += lambda * (row[i] + 1e-9);
                return copy;
            });
            const delta = solveLinear(A, Array.from(JTr, v => -v));
            if (!delta) { lambda *= 10; continue; }
            const xn = x.map((v, i) => v + delta[i]);
            const rn = residuals(xn);
            const cn = cost(rn);
            if (cn < c) {
                const gain = c - cn;
                x = xn; r = rn; c = cn;
                lambda = Math.max(lambda / 3, 1e-9);
                improved = true;
                if (gain < 1e-10 * (1 + c)) iter = iterations;
                break;
            }
            lambda *= 10;
        }
        if (!improved) break;
    }

    const room = unpack(x);
    const misfits = used.map(m => dist3(spotPoint(m.a, room), spotPoint(m.b, room)) - m.value);
    const rms = misfits.length ? Math.sqrt(misfits.reduce((s, e) => s + e * e, 0) / misfits.length) : 0;
    return { room, rms };
}

// Gaussian elimination with partial pivoting
function solveLinear(A, b) {
    const n = b.length;
    const M = A.map((row, i) => { const r = Array.from(row); r.push(b[i]); return r; });
    for (let col = 0; col < n; col++) {
        let pivot = col;
        for (let row = col + 1; row < n; row++) if (Math.abs(M[row][col]) > Math.abs(M[pivot][col])) pivot = row;
        if (Math.abs(M[pivot][col]) < 1e-14) return null;
        [M[col], M[pivot]] = [M[pivot], M[col]];
        for (let row = col + 1; row < n; row++) {
            const f = M[row][col] / M[col][col];
            if (f === 0) continue;
            for (let k = col; k <= n; k++) M[row][k] -= f * M[col][k];
        }
    }
    const x = new Array(n).fill(0);
    for (let row = n - 1; row >= 0; row--) {
        let s = M[row][n];
        for (let k = row + 1; k < n; k++) s -= M[row][k] * x[k];
        x[row] = s / M[row][row];
    }
    return x;
}
