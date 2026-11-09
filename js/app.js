// Wiring: home screen, editor (top view + 3D measuring), saving, undo, export.
import { loadAll, saveAll, newSketch, History, uid } from './store.js';
import { SketchView, outlineThumbnail } from './sketch-view.js';
import { Keypad } from './keypad.js';
import { solveRoom } from './solver.js';
import { sketchedRoom } from './geometry.js';
import { describeSpot, groupOf, cornerName } from './names.js';
import { roomToDae } from './export-dae.js';

const $ = sel => document.querySelector(sel);

const state = {
    sketches: loadAll(),
    sketch: null,
    history: null,
    mode: 'sketch',
    room: null,
    selectedId: null,
    pending: null
};

let roomView = null; // created on first use (loads three.js)
const keypad = new Keypad($('#keypad'));

// ---------- Saving ----------

function persist() {
    if (state.sketch) {
        state.sketch.updatedAt = Date.now();
        const i = state.sketches.findIndex(s => s.id === state.sketch.id);
        if (i >= 0) state.sketches[i] = state.sketch;
        else state.sketches.push(state.sketch);
    }
    if (!saveAll(state.sketches)) toast('Could not save: browser storage is full or blocked');
}

// Every change: remember it for undo, save, re-solve, redraw
function commit() {
    state.history.record(state.sketch);
    persist();
    refresh();
}

function solve() {
    const s = state.sketch;
    if (!s?.outline) { state.room = null; return; }
    state.room = s.measurements.some(m => typeof m.value === 'number')
        ? solveRoom(s.outline, s.height, s.measurements).room
        : sketchedRoom(s.outline, s.height);
}

// ---------- Home ----------

function renderHome() {
    const list = $('#sketchList');
    list.replaceChildren();
    if (!state.sketches.length) {
        list.innerHTML = '<div class="empty">No sketches yet. Tap <b>+ New sketch</b> to start.</div>';
        return;
    }
    const byClient = new Map();
    [...state.sketches].sort((a, b) => b.updatedAt - a.updatedAt).forEach(s => {
        if (!byClient.has(s.client)) byClient.set(s.client, []);
        byClient.get(s.client).push(s);
    });
    for (const [client, sketches] of byClient) {
        const section = document.createElement('section');
        section.className = 'client';
        const h = document.createElement('h2');
        h.textContent = client || 'No client';
        const cards = document.createElement('div');
        cards.className = 'cards';
        for (const s of sketches) {
            const card = document.createElement('div');
            card.className = 'card';
            card.setAttribute('role', 'button');
            card.tabIndex = 0;
            card.append(outlineThumbnail(s.outline));
            const name = document.createElement('div');
            name.className = 'name';
            name.textContent = s.name;
            const meta = document.createElement('div');
            meta.className = 'meta';
            const count = s.measurements.filter(m => typeof m.value === 'number').length;
            meta.textContent = `${count} measurement${count === 1 ? '' : 's'} · ${new Date(s.updatedAt).toLocaleDateString()}`;
            const del = document.createElement('button');
            del.className = 'delete';
            del.type = 'button';
            del.textContent = '×';
            del.setAttribute('aria-label', `Delete ${s.name}`);
            del.addEventListener('click', e => {
                e.stopPropagation();
                if (!confirm(`Delete "${s.name}" for ${s.client}? This can't be undone.`)) return;
                state.sketches = state.sketches.filter(x => x.id !== s.id);
                saveAll(state.sketches);
                renderHome();
            });
            card.append(name, meta, del);
            card.addEventListener('click', () => openSketch(s.id));
            cards.append(card);
        }
        section.append(h, cards);
        list.append(section);
    }
}

$('#newSketch').addEventListener('click', () => {
    const dialog = $('#newDialog');
    const form = dialog.querySelector('form');
    form.reset();
    $('#clientNames').replaceChildren(...[...new Set(state.sketches.map(s => s.client))].map(c => {
        const o = document.createElement('option');
        o.value = c;
        return o;
    }));
    dialog.showModal();
});
$('#newCancel').addEventListener('click', () => $('#newDialog').close('cancel'));
$('#newDialog').addEventListener('close', () => {
    const dialog = $('#newDialog');
    if (dialog.returnValue !== 'ok') return;
    const data = new FormData(dialog.querySelector('form'));
    const s = newSketch({ client: data.get('client') || '', name: data.get('name') || 'Room' });
    state.sketches.push(s);
    saveAll(state.sketches);
    openSketch(s.id);
});

$('#importJson').addEventListener('click', () => $('#importFile').click());
$('#importFile').addEventListener('change', async e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
        const data = JSON.parse(await file.text());
        const items = Array.isArray(data) ? data : [data];
        let added = 0;
        for (const s of items) {
            if (!s || !Array.isArray(s.measurements)) continue;
            if (state.sketches.some(x => x.id === s.id)) s.id = uid();
            state.sketches.push(s);
            added++;
        }
        saveAll(state.sketches);
        renderHome();
        toast(`Imported ${added} sketch${added === 1 ? '' : 'es'}`);
    } catch {
        toast('That file is not an Out of Square backup');
    }
});

// ---------- Editor ----------

const sketchView = new SketchView($('#sketchSvg'), {
    onOutline(outline) {
        const s = state.sketch;
        if (s.measurements.length && !confirm(`Drawing a new outline removes the ${s.measurements.length} measurements on this sketch. Continue?`)) {
            sketchView.setOutline(s.outline);
            return;
        }
        s.outline = outline;
        s.measurements = [];
        commit();
        sketchView.setOutline(s.outline);
    },
    onCornerMove(i, pos, final) {
        state.sketch.outline.corners[i] = pos;
        if (final) commit();
    }
});

function openSketch(id) {
    const s = state.sketches.find(x => x.id === id);
    if (!s) return;
    state.sketch = JSON.parse(JSON.stringify(s));
    state.history = new History(state.sketch);
    state.selectedId = null;
    state.pending = null;
    $('#home').hidden = true;
    $('#editor').hidden = false;
    $('#sketchTitle').textContent = s.name;
    $('#sketchClient').textContent = s.client;
    $('#defaultHeight').value = s.height;
    solve();
    setMode(s.outline ? 'measure' : 'sketch', { fit: true });
}

function closeSketch() {
    if (keypad.isOpen) keypad.finish('cancel');
    persist();
    state.sketch = null;
    $('#editor').hidden = true;
    $('#home').hidden = false;
    renderHome();
}
$('#back').addEventListener('click', closeSketch);

async function setMode(mode, { fit = false } = {}) {
    if (mode === 'measure' && !state.sketch.outline) {
        toast('Draw the room first');
        mode = 'sketch';
    }
    if (keypad.isOpen) keypad.finish('cancel');
    state.mode = mode;
    state.pending = null;
    document.querySelectorAll('.segmented button').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
    $('#sketchPane').hidden = mode !== 'sketch';
    $('#measurePane').hidden = mode !== 'measure';
    if (mode === 'sketch') {
        sketchView.setOutline(state.sketch.outline);
        sketchView.resize();
        if (fit) sketchView.fit();
    } else {
        await ensureRoomView();
        roomView.resize();
        roomView.room = null; // re-frame
        refresh();
    }
    refresh();
}
document.querySelectorAll('.segmented button').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode, { fit: true })));

async function ensureRoomView() {
    if (roomView) return;
    const { RoomView } = await import('./room-view.js');
    roomView = new RoomView($('#roomView'), $('#roomLabels'), { onTap, onLabelTap: selectMeasurement });
}

$('#clearSketch').addEventListener('click', () => {
    const s = state.sketch;
    if (!s.outline) return;
    if (!confirm(s.measurements.length ? `Clear the outline and its ${s.measurements.length} measurements?` : 'Clear the outline?')) return;
    s.outline = null;
    s.measurements = [];
    commit();
    sketchView.setOutline(null);
});

$('#defaultHeight').addEventListener('change', e => {
    const v = parseFloat(e.target.value);
    if (v >= 1000 && v <= 6000) {
        state.sketch.height = v;
        commit();
    } else e.target.value = state.sketch.height;
});

function refresh() {
    if (!state.sketch) return;
    solve();
    $('#undo').disabled = !state.history.past.length;
    $('#redo').disabled = !state.history.future.length;
    if (state.mode === 'sketch') {
        $('#sketchHint').textContent = state.sketch.outline
            ? 'Drag a corner to move it · draw again to replace · then go to 2 · Measure'
            : 'Draw the room outline with your finger, in one go';
        return;
    }
    if (!roomView || !state.room) return;
    if (!roomView.room) {
        roomView.setRoom(state.room, state.sketch.measurements, { selectedId: state.selectedId, pending: state.pending });
        roomView.setView('iso');
    } else {
        roomView.setRoom(state.room, state.sketch.measurements, { selectedId: state.selectedId, pending: state.pending });
    }
    renderViewButtons();
    renderList();
    renderMeasureHint();
}

function renderViewButtons() {
    const box = $('#viewButtons');
    const key = `${state.room.walls.length}|${state.room.closed}`;
    if (box.dataset.key === key) return;
    box.dataset.key = key;
    box.replaceChildren();
    const add = (label, view, title) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn';
        b.textContent = label;
        b.title = title;
        b.addEventListener('click', () => roomView.setView(view));
        box.append(b);
    };
    add('Iso', 'iso', 'Look into the room from above');
    add('Top', 'top', 'Top view');
    if (state.room.closed) add('Ceiling', 'ceiling', 'Look up at the ceiling');
    const sep = document.createElement('div');
    sep.className = 'sep';
    box.append(sep);
    state.room.walls.forEach((w, i) => add(`Wall ${i + 1}`, i, `Wall ${i + 1}, ${cornerName(w.from)}–${cornerName(w.to)}, face-on`));
}

function renderMeasureHint() {
    const bar = $('#shortcutBar');
    bar.replaceChildren();
    bar.hidden = true;
    if (!state.pending) {
        $('#measureHint').textContent = state.sketch.measurements.length
            ? 'Tap where the laser sits to add a measurement'
            : 'Tap where the laser sits: a wall, the floor, the ceiling or a corner';
        return;
    }
    if (state.pending.b) {
        $('#measureHint').textContent = '';
        return;
    }
    $('#measureHint').textContent = 'Now tap where the laser dot landed';
    const a = state.pending.a;
    const opposite = verticalPartner(a);
    if (opposite) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn primary';
        b.textContent = opposite.kind === 'ceiling' || opposite.v === 1 ? '↑ Straight up to the ceiling' : '↓ Straight down to the floor';
        b.addEventListener('click', () => onTap(opposite));
        bar.append(b);
    }
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'btn';
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', () => { state.pending = null; refresh(); });
    bar.append(cancel);
    bar.hidden = false;
}

// The spot straight above (or below) a spot on the floor (or ceiling)
function verticalPartner(a) {
    if (a.kind === 'floor') return { kind: 'ceiling', w: a.w };
    if (a.kind === 'ceiling') return { kind: 'floor', w: a.w };
    if (a.kind === 'wall' && a.v === 0) return { ...a, v: 1 };
    if (a.kind === 'wall' && a.v === 1) return { ...a, v: 0 };
    return null;
}

function renderList() {
    const list = $('#measureList');
    const ms = state.sketch.measurements;
    $('#measureCount').textContent = ms.length ? `${ms.filter(m => typeof m.value === 'number').length} / ${ms.length}` : '';
    list.replaceChildren();
    if (!ms.length) {
        list.innerHTML = '<div class="empty">Nothing measured yet.<br>Tap where the laser sits, then where the dot lands, then type the reading.</div>';
        return;
    }
    const groups = new Map();
    ms.forEach((m, i) => {
        const g = groupOf(m);
        if (!groups.has(g)) groups.set(g, []);
        groups.get(g).push([m, i]);
    });
    const order = [...groups.keys()].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    for (const g of order) {
        const head = document.createElement('div');
        head.className = 'measure-group';
        head.textContent = g;
        list.append(head);
        for (const [m] of groups.get(g)) {
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'measure-item' + (m.id === state.selectedId ? ' selected' : '');
            const what = document.createElement('div');
            what.className = 'what';
            what.textContent = describeSpot(m.a, state.room);
            const where = document.createElement('div');
            where.className = 'where';
            where.textContent = '→ ' + describeSpot(m.b, state.room);
            const value = document.createElement('div');
            const empty = typeof m.value !== 'number';
            value.className = 'value' + (empty ? ' empty' : '');
            value.textContent = empty ? '—' : Math.round(m.value * 10) / 10;
            item.append(what, value, where);
            item.addEventListener('click', () => selectMeasurement(m.id));
            list.append(item);
        }
    }
}

async function onTap(spot) {
    if (keypad.isOpen) return;
    if (!spot) {
        if (state.selectedId) { state.selectedId = null; refresh(); }
        return;
    }
    state.selectedId = null;
    if (!state.pending) {
        state.pending = { a: spot };
        refresh();
        return;
    }
    const a = state.pending.a;
    if (sameSpot(a, spot)) return;
    state.pending.b = spot;
    refresh();
    const result = await keypad.open({ title: `${describeSpot(a, state.room)}  →  ${describeSpot(spot, state.room)}` });
    const pending = state.pending;
    state.pending = null;
    if (result.action === 'save' || result.action === 'later') {
        const m = { id: uid(), a: pending.a, b: pending.b, value: result.action === 'save' ? result.value : null, takenAt: Date.now() };
        state.sketch.measurements.push(m);
        commit();
    } else refresh();
}

async function selectMeasurement(id) {
    if (keypad.isOpen) keypad.finish('cancel');
    const m = state.sketch.measurements.find(x => x.id === id);
    if (!m) return;
    state.pending = null;
    state.selectedId = id;
    refresh();
    const result = await keypad.open({ title: `${describeSpot(m.a, state.room)}  →  ${describeSpot(m.b, state.room)}`, value: m.value, existing: true });
    if (result.action === 'save') {
        m.value = result.value;
        m.takenAt = Date.now();
        state.selectedId = null;
        commit();
    } else if (result.action === 'delete') {
        state.sketch.measurements = state.sketch.measurements.filter(x => x.id !== id);
        state.selectedId = null;
        commit();
    } else {
        state.selectedId = null;
        refresh();
    }
}

const sameSpot = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---------- Undo, export ----------

function applySnapshot(snap) {
    if (!snap) return;
    if (keypad.isOpen) keypad.finish('cancel');
    state.sketch = snap;
    state.pending = null;
    state.selectedId = null;
    persist();
    $('#defaultHeight').value = snap.height;
    if (state.mode === 'measure' && !snap.outline) setMode('sketch');
    sketchView.setOutline(snap.outline);
    refresh();
}
$('#undo').addEventListener('click', () => applySnapshot(state.history.undo()));
$('#redo').addEventListener('click', () => applySnapshot(state.history.redo()));
document.addEventListener('keydown', e => {
    if (!state.sketch || keypad.isOpen) return;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        applySnapshot(e.shiftKey ? state.history.redo() : state.history.undo());
    } else if (e.key === 'Escape' && state.pending) {
        state.pending = null;
        refresh();
    }
});

$('#exportBtn').addEventListener('click', e => {
    e.stopPropagation();
    $('#exportMenu').hidden = !$('#exportMenu').hidden;
});
document.addEventListener('click', () => { $('#exportMenu').hidden = true; });
$('#exportMenu').addEventListener('click', e => {
    const kind = e.target.dataset.export;
    if (!kind) return;
    const s = state.sketch;
    const base = `${s.client} - ${s.name}`.replace(/[\\/:*?"<>|]+/g, '-');
    if (kind === 'json') {
        download(`${base}.outofsquare.json`, JSON.stringify(s, null, 2), 'application/json');
    } else if (kind === 'dae') {
        if (!s.outline) return toast('Draw the room first');
        solve();
        download(`${base}.dae`, roomToDae(state.room, s.measurements, { title: base }), 'model/vnd.collada+xml');
    }
});

function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast(`Saved ${name}`);
}

let toastTimer;
function toast(text) {
    const t = $('#toast');
    t.textContent = text;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2500);
}

// Debug/test hook
window.outOfSquare = { state, openSketch, setMode, refresh, get roomView() { return roomView; } };

renderHome();
