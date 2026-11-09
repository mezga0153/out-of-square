// Sketches, saved in the browser. The prototype keeps everything in localStorage;
// the real app moves to IndexedDB (see plan.md).

const KEY = 'outofsquare.sketches.v1';

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export function loadAll() {
    try {
        const list = JSON.parse(localStorage.getItem(KEY) || '[]');
        return Array.isArray(list) ? list : [];
    } catch {
        return [];
    }
}

export function saveAll(list) {
    try {
        localStorage.setItem(KEY, JSON.stringify(list));
        return true;
    } catch {
        return false;
    }
}

export function newSketch({ client, name }) {
    const now = Date.now();
    return {
        id: uid(),
        client: client.trim(),
        name: name.trim(),
        createdAt: now,
        updatedAt: now,
        height: 2500,
        outline: null,          // { corners: [{x, y}], closed }
        measurements: []        // { id, a: spot, b: spot, value: number | null }
    };
}

// Undo/redo by snapshots of the open sketch (sketches are small)
export class History {
    constructor(sketch) {
        this.past = [];
        this.future = [];
        this.current = JSON.stringify(sketch);
    }
    record(sketch) {
        const next = JSON.stringify(sketch);
        if (next === this.current) return;
        this.past.push(this.current);
        if (this.past.length > 200) this.past.shift();
        this.current = next;
        this.future = [];
    }
    undo() {
        if (!this.past.length) return null;
        this.future.push(this.current);
        this.current = this.past.pop();
        return JSON.parse(this.current);
    }
    redo() {
        if (!this.future.length) return null;
        this.past.push(this.current);
        this.current = this.future.pop();
        return JSON.parse(this.current);
    }
}
