// How corners, walls and spots are named on screen and in exports
import { spotPoint } from './geometry.js';

export const cornerName = i => String.fromCharCode(65 + (i % 26)) + (i >= 26 ? Math.floor(i / 26) : '');

// Short description of a spot, e.g. "Wall 2 · 1200 from B · 900 up" or "Corner C, ceiling"
export function describeSpot(spot, room) {
    if (!spot || !room) return '';
    if (spot.kind === 'floor' || spot.kind === 'ceiling') {
        // Say where it is by its distance to the two nearest walls
        const p = spotPoint(spot, room);
        const label = spot.kind === 'floor' ? 'Floor' : 'Ceiling';
        const near = room.walls.map((w, i) => {
            const a = room.bottoms[w.from], b = room.bottoms[w.to];
            const dx = b.x - a.x, dy = b.y - a.y;
            const len = Math.hypot(dx, dy) || 1;
            return { i, d: Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / len };
        }).sort((x, y) => x.d - y.d).slice(0, 2);
        return `${label} · ${near.map(n => `${Math.round(n.d)} from wall ${n.i + 1}`).join(', ')}`;
    }
    const w = room.walls[spot.wall];
    if (!w) return '?';
    const atCorner = spot.u === 0 || spot.u === 1;
    const level = spot.v === 0 ? 'floor' : spot.v === 1 ? 'ceiling' : null;
    if (atCorner && level) return `Corner ${cornerName(spot.u === 0 ? w.from : w.to)}, ${level}`;
    const bf = room.bottoms[w.from], bt = room.bottoms[w.to];
    const along = Math.round(spot.u * Math.hypot(bt.x - bf.x, bt.y - bf.y));
    const p = spotPoint(spot, room);
    const base = spotPoint({ ...spot, v: 0 }, room);
    const up = Math.round(p.z - base.z);
    const where = atCorner ? `corner ${cornerName(spot.u === 0 ? w.from : w.to)}` : `${along} from ${cornerName(w.from)}`;
    return `Wall ${spot.wall + 1} · ${where} · ${level || up + ' up'}`;
}

// Which group a measurement is listed under
export function groupOf(m) {
    const s = m.a.kind === 'wall' ? m.a : m.b.kind === 'wall' ? m.b : null;
    return s ? `Wall ${s.wall + 1}` : 'Floor & ceiling';
}
