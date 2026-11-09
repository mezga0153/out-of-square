// Ear-clipping triangulation of a simple polygon given by its plan points ({x, y}).
// Returns index triples. Works for either winding.
export function triangulate(points) {
    const n = points.length;
    if (n < 3) return [];
    let area = 0;
    for (let i = 0; i < n; i++) {
        const p = points[i], q = points[(i + 1) % n];
        area += p.x * q.y - q.x * p.y;
    }
    const sign = area >= 0 ? 1 : -1;
    const idx = Array.from({ length: n }, (_, i) => i);
    const tris = [];
    const cross = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    const inside = (p, a, b, c) => {
        const d1 = cross(a, b, p) * sign, d2 = cross(b, c, p) * sign, d3 = cross(c, a, p) * sign;
        return d1 >= 0 && d2 >= 0 && d3 >= 0;
    };
    let guard = 0;
    while (idx.length > 3 && guard++ < 10000) {
        let clipped = false;
        for (let i = 0; i < idx.length; i++) {
            const ia = idx[(i - 1 + idx.length) % idx.length], ib = idx[i], ic = idx[(i + 1) % idx.length];
            const a = points[ia], b = points[ib], c = points[ic];
            if (cross(a, b, c) * sign <= 1e-9) continue; // reflex or flat
            let ear = true;
            for (const j of idx) {
                if (j === ia || j === ib || j === ic) continue;
                if (inside(points[j], a, b, c)) { ear = false; break; }
            }
            if (!ear) continue;
            tris.push([ia, ib, ic]);
            idx.splice(i, 1);
            clipped = true;
            break;
        }
        if (!clipped) {
            // Degenerate polygon: fan out what's left
            for (let i = 1; i < idx.length - 1; i++) tris.push([idx[0], idx[i], idx[i + 1]]);
            return tris;
        }
    }
    tris.push([idx[0], idx[1], idx[2]]);
    return tris;
}
