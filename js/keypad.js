// Large number pad for typing laser readings. Also takes a hardware keyboard.

export class Keypad {
    constructor(root) {
        this.root = root;
        this.title = root.querySelector('#keypadTitle');
        this.display = root.querySelector('#keypadDisplay');
        this.text = '';
        this.resolve = null;

        root.querySelectorAll('[data-key]').forEach(b => b.addEventListener('click', () => this.key(b.dataset.key)));
        root.querySelectorAll('[data-action]').forEach(b => b.addEventListener('click', () => this.finish(b.dataset.action)));
        document.addEventListener('keydown', e => {
            if (!this.resolve) return;
            if (/^[0-9]$/.test(e.key) || e.key === '.' || e.key === ',') this.key(e.key === ',' ? '.' : e.key);
            else if (e.key === 'Backspace') this.key('back');
            else if (e.key === 'Enter') this.finish('save');
            else if (e.key === 'Escape') this.finish('cancel');
            else return;
            e.preventDefault();
        });
    }

    get isOpen() { return !!this.resolve; }

    // Resolves with { action: 'save' | 'later' | 'cancel' | 'delete', value }
    open({ title, value = null, existing = false }) {
        if (this.resolve) this.finish('cancel');
        this.title.textContent = title;
        this.text = typeof value === 'number' ? String(value) : '';
        this.fresh = true; // first key press replaces an existing value
        this.root.querySelector('[data-action="delete"]').hidden = !existing;
        this.root.querySelector('[data-action="later"]').hidden = existing;
        this.root.querySelector('.keypad-actions').style.gridTemplateColumns = '1fr 1fr 1.4fr';
        this.update();
        this.root.hidden = false;
        return new Promise(resolve => { this.resolve = resolve; });
    }

    key(k) {
        if (this.fresh && k !== 'back') this.text = '';
        this.fresh = false;
        if (k === 'back') this.text = this.text.slice(0, -1);
        else if (k === '.') { if (!this.text.includes('.')) this.text = (this.text || '0') + '.'; }
        else if (this.text.length < 7) this.text = (this.text === '0' ? '' : this.text) + k;
        this.update();
    }

    update() {
        this.display.textContent = this.text || '';
        this.root.querySelector('[data-action="save"]').disabled = !(parseFloat(this.text) > 0);
    }

    finish(action) {
        if (!this.resolve) return;
        const value = parseFloat(this.text);
        if (action === 'save' && !(value > 0)) return;
        const resolve = this.resolve;
        this.resolve = null;
        this.root.hidden = true;
        resolve({ action, value: value > 0 ? value : null });
    }
}
