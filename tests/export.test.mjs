import { test } from 'node:test';
import assert from 'node:assert/strict';
import { roomToDae } from '../js/export-dae.js';
import { sketchedRoom } from '../js/geometry.js';
import { triangulate } from '../js/triangulate.js';

test('triangulates an L-shaped floor into n - 2 triangles', () => {
    const L = [{ x: 0, y: 0 }, { x: 4000, y: 0 }, { x: 4000, y: 2000 }, { x: 2000, y: 2000 }, { x: 2000, y: 3000 }, { x: 0, y: 3000 }];
    assert.equal(triangulate(L).length, 4);
    assert.equal(triangulate([...L].reverse()).length, 4);
});

test('exports walls, floor, ceiling and measurements to COLLADA in mm, Z up', () => {
    const outline = { corners: [{ x: 0, y: 0 }, { x: 3000, y: 0 }, { x: 3000, y: 2000 }, { x: 0, y: 2000 }], closed: true };
    const room = sketchedRoom(outline, 2500);
    const m = [
        { id: 'a', a: { kind: 'wall', wall: 0, u: 0, v: 0 }, b: { kind: 'wall', wall: 0, u: 1, v: 0 }, value: 3000 },
        { id: 'b', a: { kind: 'wall', wall: 1, u: 0, v: 0 }, b: { kind: 'wall', wall: 1, u: 1, v: 0 }, value: null }
    ];
    const dae = roomToDae(room, m, { title: 'Test & <room>' });
    assert.match(dae, /<unit name="millimeter" meter="0.001"\/>/);
    assert.match(dae, /<up_axis>Z_UP<\/up_axis>/);
    for (const name of ['Wall 1 (A–B)', 'Wall 4 (D–A)', 'Floor', 'Ceiling', 'Measurements']) assert.ok(dae.includes(`name="${name}"`), name);
    assert.ok(dae.includes('Test &amp; &lt;room&gt;'));
    // Only measured values become edges
    assert.match(dae, /<lines count="1"/);
    // Sketch y (down) becomes SketchUp -y: corner C (3000, 2000) at floor is 3000 -2000 0
    assert.ok(dae.includes('3000 -2000 0'));
});
