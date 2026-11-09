// Pure tests for the geometry and the solver: make a known room, take "laser shots" in it,
// give the solver only a rough sketch plus the shots, and check it finds the room again.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { straighten, spotPoint, meanValueWeights, dist3 } from '../js/geometry.js';
import { solveRoom } from '../js/solver.js';

const corner = (i, end) => ({ kind: 'wall', wall: end === 'from' ? i : (i - 1 + 4) % 4, u: end === 'from' ? 0 : 1, v: 0 });
const wallSpot = (wall, u, v) => ({ kind: 'wall', wall, u, v });

function shots(trueRoom, pairs) {
    return pairs.map(([a, b], i) => ({ id: 'm' + i, a, b, value: dist3(spotPoint(a, trueRoom), spotPoint(b, trueRoom)) }));
}

// All pairwise distances between the corner points: the same for the same shape, wherever it sits
function shapeError(a, b) {
    const pa = [...a.bottoms, ...a.tops];
    const pb = [...b.bottoms, ...b.tops];
    let worst = 0;
    for (let i = 0; i < pa.length; i++) {
        for (let j = i + 1; j < pa.length; j++) {
            worst = Math.max(worst, Math.abs(dist3(pa[i], pa[j]) - dist3(pb[i], pb[j])));
        }
    }
    return worst;
}

const quadWalls = [{ from: 0, to: 1 }, { from: 1, to: 2 }, { from: 2, to: 3 }, { from: 3, to: 0 }];

test('straightens a rough rectangle into four square corners', () => {
    const stroke = [];
    const wobble = i => Math.sin(i) * 40;
    for (let i = 0; i <= 20; i++) stroke.push({ x: i * 200, y: wobble(i) });
    for (let i = 0; i <= 15; i++) stroke.push({ x: 4000 + wobble(i), y: i * 200 });
    for (let i = 0; i <= 20; i++) stroke.push({ x: 4000 - i * 200, y: 3000 + wobble(i) });
    for (let i = 0; i <= 14; i++) stroke.push({ x: wobble(i) + 30, y: 3000 - i * 200 });
    const out = straighten(stroke);
    assert.equal(out.closed, true);
    assert.equal(out.corners.length, 4);
    for (let i = 0; i < 4; i++) {
        const a = out.corners[i];
        const b = out.corners[(i + 1) % 4];
        assert.ok(a.x === b.x || a.y === b.y, 'every wall is horizontal or vertical');
    }
});

test('keeps an open outline open', () => {
    const stroke = [{ x: 0, y: 0 }, { x: 0, y: 1500 }, { x: 0, y: 3000 }, { x: 1500, y: 3010 }, { x: 3000, y: 2990 }];
    const out = straighten(stroke);
    assert.equal(out.closed, false);
    assert.equal(out.corners.length, 3);
});

test('mean value weights reproduce the point', () => {
    const poly = [{ x: 0, y: 0 }, { x: 4000, y: 0 }, { x: 4000, y: 2000 }, { x: 2000, y: 2000 }, { x: 2000, y: 3000 }, { x: 0, y: 3000 }];
    const p = { x: 1000, y: 2500 };
    const w = meanValueWeights(p, poly);
    const x = w.reduce((s, wi, i) => s + wi * poly[i].x, 0);
    const y = w.reduce((s, wi, i) => s + wi * poly[i].y, 0);
    assert.ok(Math.abs(x - p.x) < 1e-6 && Math.abs(y - p.y) < 1e-6);
});

test('with no measurements the room is the sketch', () => {
    const outline = { corners: [{ x: 0, y: 0 }, { x: 3000, y: 0 }, { x: 3000, y: 3000 }, { x: 0, y: 3000 }], closed: true };
    const { room } = solveRoom(outline, 2500, []);
    assert.equal(room.tops[2].z, 2500);
    assert.equal(room.bottoms[1].x, 3000);
});

test('one wall length rescales that wall and keeps the corners square', () => {
    const outline = { corners: [{ x: 0, y: 0 }, { x: 3000, y: 0 }, { x: 3000, y: 2000 }, { x: 0, y: 2000 }], closed: true };
    const m = [{ id: 'a', a: wallSpot(0, 0, 0), b: wallSpot(0, 1, 0), value: 3412 }];
    const { room } = solveRoom(outline, 2500, m);
    const len = dist3(room.bottoms[0], room.bottoms[1]);
    assert.ok(Math.abs(len - 3412) < 0.5, `floor length ${len}`);
    // Opposite wall follows, because the corners stay square
    const opposite = dist3(room.bottoms[2], room.bottoms[3]);
    assert.ok(Math.abs(opposite - 3412) < 1, `opposite ${opposite}`);
    // The top follows the bottom
    assert.ok(Math.abs(dist3(room.tops[0], room.tops[1]) - 3412) < 5);
});

test('one ceiling height lifts the whole ceiling', () => {
    const outline = { corners: [{ x: 0, y: 0 }, { x: 3000, y: 0 }, { x: 3000, y: 2000 }, { x: 0, y: 2000 }], closed: true };
    const w = meanValueWeights({ x: 1500, y: 1000 }, outline.corners);
    const m = [{ id: 'h', a: { kind: 'floor', w }, b: { kind: 'ceiling', w }, value: 2612 }];
    const { room } = solveRoom(outline, 2500, m);
    room.tops.forEach((t, i) => assert.ok(Math.abs(t.z - room.bottoms[i].z - 2612) < 3, `corner ${i}: ${t.z}`));
});

test('finds an out-of-square room with a leaning wall and a sloping ceiling from a rough sketch', () => {
    // The real room: not square, wall 1 leans out 25 mm at the top, ceiling drops 40 mm towards corner 2
    const trueRoom = {
        walls: quadWalls,
        bottoms: [{ x: 0, y: 0, z: 0 }, { x: 3412, y: 18, z: 0 }, { x: 3390, y: 2805, z: 6 }, { x: -12, y: 2790, z: 3 }],
        tops: [{ x: 0, y: 4, z: 2580 }, { x: 3437, y: 20, z: 2571 }, { x: 3415, y: 2808, z: 2546 }, { x: -10, y: 2793, z: 2562 }]
    };
    // His sketch: a 3 × 3 m square
    const outline = { corners: [{ x: 0, y: 0 }, { x: 3000, y: 0 }, { x: 3000, y: 3000 }, { x: 0, y: 3000 }], closed: true };
    const B = i => wallSpot(i, 0, 0);
    const T = i => wallSpot(i, 0, 1);
    const pairs = [];
    for (let i = 0; i < 4; i++) {
        const j = (i + 1) % 4;
        pairs.push([B(i), B(j)]);   // wall length at the floor
        pairs.push([T(i), T(j)]);   // wall length at the ceiling
        pairs.push([B(i), T(i)]);   // height in each corner
        pairs.push([B(i), T(j)]);   // wall diagonal
    }
    pairs.push([B(0), B(2)], [B(1), B(3)], [T(0), T(2)], [T(1), T(3)]);
    const m = shots(trueRoom, pairs);
    const { room, rms } = solveRoom(outline, 2500, m);
    assert.ok(rms < 0.5, `measurements fit to ${rms.toFixed(2)} mm`);
    const err = shapeError(room, trueRoom);
    assert.ok(err < 2, `shape within ${err.toFixed(2)} mm`);
});

test('an L-shaped room measured along its walls', () => {
    const real = [{ x: 0, y: 0 }, { x: 4210, y: 0 }, { x: 4205, y: 1830 }, { x: 2140, y: 1835 }, { x: 2150, y: 3320 }, { x: 5, y: 3310 }];
    const trueRoom = {
        walls: real.map((_, i) => ({ from: i, to: (i + 1) % 6 })),
        bottoms: real.map(c => ({ ...c, z: 0 })),
        tops: real.map(c => ({ ...c, z: 2600 }))
    };
    const outline = { corners: [{ x: 0, y: 0 }, { x: 4000, y: 0 }, { x: 4000, y: 2000 }, { x: 2000, y: 2000 }, { x: 2000, y: 3000 }, { x: 0, y: 3000 }], closed: true };
    const pairs = [];
    for (let i = 0; i < 6; i++) pairs.push([wallSpot(i, 0, 0), wallSpot(i, 1, 0)]);
    pairs.push([wallSpot(0, 0, 0), wallSpot(0, 0, 1)]);
    const { room } = solveRoom(outline, 2500, shots(trueRoom, pairs));
    for (let i = 0; i < 6; i++) {
        const got = dist3(room.bottoms[i], room.bottoms[(i + 1) % 6]);
        const want = dist3(trueRoom.bottoms[i], trueRoom.bottoms[(i + 1) % 6]);
        assert.ok(Math.abs(got - want) < 3, `wall ${i}: ${got.toFixed(1)} vs ${want.toFixed(1)}`);
    }
});
