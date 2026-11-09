// Drives the app in headless Chrome: new sketch → draw a room → measure in 3D → export
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { launch, sleep } from './browser.mjs';

test('sketch a room, measure it in 3D and export it', async () => {
    const app = await launch({ width: 1280, height: 860 });
    const tapSpot = async spot => {
        const p = await app.ev(`(() => { const r = document.querySelector('#roomView').getBoundingClientRect(); const s = outOfSquare.roomView.screenOfSpot(${JSON.stringify(spot)}); return { x: r.left + s.x, y: r.top + s.y }; })()`);
        await app.click(p.x, p.y);
        await sleep(100);
    };
    const type = async value => {
        for (const d of String(value)) await app.ev(`document.querySelector('[data-key="${d}"]').click()`);
        await app.ev(`document.querySelector('[data-action="save"]').click()`);
        await sleep(200);
    };
    try {
        await app.ev(`document.querySelector('#newSketch').click()`);
        await app.ev(`(() => { const f = document.querySelector('#newDialog form'); f.client.value = 'Novak'; f.name.value = 'Kitchen'; document.querySelector('#newDialog').close('ok'); })()`);
        await sleep(200);

        // A rough rectangle, drawn in one stroke
        const pts = [];
        const X0 = 300, Y0 = 220, W = 600, H = 420;
        const wob = i => Math.sin(i * 1.3) * 4;
        for (let i = 0; i <= 30; i++) pts.push({ x: X0 + i * W / 30, y: Y0 + wob(i) });
        for (let i = 0; i <= 20; i++) pts.push({ x: X0 + W + wob(i), y: Y0 + i * H / 20 });
        for (let i = 0; i <= 30; i++) pts.push({ x: X0 + W - i * W / 30, y: Y0 + H + wob(i) });
        for (let i = 0; i <= 19; i++) pts.push({ x: X0 + 3 + wob(i), y: Y0 + H - i * H / 20 });
        await app.drag(pts);
        await sleep(200);
        const outline = await app.ev(`outOfSquare.state.sketch.outline`);
        assert.equal(outline.closed, true);
        assert.equal(outline.corners.length, 4);

        await app.ev(`document.querySelector('[data-mode=measure]').click()`);
        await app.waitFor(`!!outOfSquare.roomView?.room`, 20000);
        await sleep(300);

        // Wall 1 at the floor, snapped to its corners
        await tapSpot({ kind: 'wall', wall: 0, u: 0.02, v: 0.02 });
        await tapSpot({ kind: 'wall', wall: 0, u: 0.98, v: 0.02 });
        assert.equal(await app.ev(`document.querySelector('#keypadTitle').textContent`), 'Corner A, floor  →  Corner B, floor');
        await type(3412);
        // Ceiling height in corner B, using the straight-up shortcut
        await tapSpot({ kind: 'wall', wall: 1, u: 0, v: 0 });
        await app.ev(`document.querySelector('#shortcutBar .btn.primary').click()`);
        await sleep(100);
        await type(2580);
        // Marked now, measured later
        await tapSpot({ kind: 'wall', wall: 1, u: 0.02, v: 0.02 });
        await tapSpot({ kind: 'wall', wall: 1, u: 0.98, v: 0.02 });
        await app.ev(`document.querySelector('[data-action="later"]').click()`);
        await sleep(200);

        const ms = await app.ev(`outOfSquare.state.sketch.measurements.map(m => m.value)`);
        assert.deepEqual(ms, [3412, 2580, null]);
        const room = await app.ev(`outOfSquare.state.room`);
        const len = Math.hypot(room.bottoms[1].x - room.bottoms[0].x, room.bottoms[1].y - room.bottoms[0].y);
        assert.ok(Math.abs(len - 3412) < 1, `wall 1 is ${len}`);
        assert.ok(Math.abs(room.tops[1].z - room.bottoms[1].z - 2580) < 1);
        assert.equal(await app.ev(`document.querySelectorAll('.measure-item').length`), 3);

        // Fill in the one left for later from the list
        await app.ev(`[...document.querySelectorAll('.measure-item')].find(i => i.querySelector('.value.empty')).click()`);
        await sleep(100);
        await type(2805);
        assert.deepEqual(await app.ev(`outOfSquare.state.sketch.measurements.map(m => m.value)`), [3412, 2580, 2805]);

        // Undo brings the empty one back; redo fills it again
        await app.ev(`document.querySelector('#undo').click()`);
        assert.deepEqual(await app.ev(`outOfSquare.state.sketch.measurements.map(m => m.value)`), [3412, 2580, null]);
        await app.ev(`document.querySelector('#redo').click()`);

        // Saved: survives a reload
        await app.reload();
        assert.equal(await app.ev(`document.querySelectorAll('#sketchList .card').length`), 1);

        await app.ev(`document.querySelector('#sketchList .card').click()`);
        await app.waitFor(`!!outOfSquare.roomView?.room`, 20000);
        await app.ev(`document.querySelector('#exportBtn').click()`);
        await app.ev(`document.querySelector('[data-export=dae]').click()`);
        await app.waitFor(`true`);
        await sleep(800);
        const file = `${app.downloads}/Novak - Kitchen.dae`;
        assert.ok(fs.existsSync(file), 'DAE downloaded');
        assert.match(fs.readFileSync(file, 'utf8'), /name="Wall 1 \(A–B\)"/);
        assert.deepEqual(app.errors, []);
    } finally {
        await app.close();
    }
});
