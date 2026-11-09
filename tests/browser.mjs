// Drives the app in headless Chrome over the DevTools protocol. Uses only Node
// built-ins and a local Chrome; set CHROME_PATH if Chrome isn't in the default place.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const CHROME_PATHS = [
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser'
].filter(Boolean);

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.glb': 'model/gltf-binary', '.png': 'image/png', '.json': 'application/json' };

// Static file server for the project on a free port
function startServer() {
    const server = http.createServer((req, res) => {
        const file = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
        if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
            res.writeHead(404).end();
            return;
        }
        res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
        fs.createReadStream(file).pipe(res);
    });
    return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

export async function launch({ width = 1400, height = 900, mobile = false } = {}) {
    const chromePath = CHROME_PATHS.find(p => fs.existsSync(p));
    if (!chromePath) throw new Error('Chrome not found; set CHROME_PATH');
    
    const server = await startServer();
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'outofsquare-test-'));
    const downloads = path.join(profile, 'downloads');
    const chrome = spawn(chromePath, [
        '--headless=new', '--remote-debugging-port=0', `--window-size=${width},${height}`,
        '--use-angle=swiftshader', '--enable-unsafe-swiftshader', `--user-data-dir=${profile}`, 'about:blank'
    ], { stdio: 'ignore' });
    
    // Chrome writes the port it picked to DevToolsActivePort
    let port;
    for (let i = 0; i < 100 && !port; i++) {
        try {
            port = fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0];
        } catch {
            await sleep(100);
        }
    }
    let target;
    for (let i = 0; i < 50 && !target; i++) {
        try {
            target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(t => t.type === 'page');
        } catch {}
        if (!target) await sleep(100);
    }
    
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise(resolve => { ws.onopen = resolve; });
    
    let nextId = 0;
    const pending = new Map();
    const errors = [];
    ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.id && pending.has(message.id)) {
            pending.get(message.id)(message);
            pending.delete(message.id);
        } else if (message.method === 'Runtime.exceptionThrown') {
            const details = message.params.exceptionDetails;
            errors.push(details.exception?.description || details.text);
        } else if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
            errors.push(message.params.args.map(a => a.value ?? a.description).join(' '));
        }
    };
    
    const send = (method, params = {}) => new Promise(resolve => {
        const id = ++nextId;
        pending.set(id, resolve);
        ws.send(JSON.stringify({ id, method, params }));
    });
    
    // Evaluate an expression in the page and return its (JSON) value
    const ev = async (expression) => {
        const response = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
        if (response.error) throw new Error(`${response.error.message}\n${expression}`);
        if (response.result.exceptionDetails) {
            const details = response.result.exceptionDetails;
            throw new Error(`In page: ${details.exception?.description || details.text}\n${expression}`);
        }
        return response.result.result.value;
    };
    
    const waitFor = async (expression, timeout = 10000) => {
        const start = Date.now();
        while (Date.now() - start < timeout) {
            if (await ev(expression)) return;
            await sleep(50);
        }
        throw new Error(`Timed out waiting for: ${expression}`);
    };
    
    await send('Runtime.enable');
    await send('Page.enable');
    await send('DOM.enable');
    await send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads });
    if (mobile) await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile: true });
    
    const url = `http://127.0.0.1:${server.address().port}/index.html`;
    // Mark the current document so we wait for the new one, not the old one
    const open = async () => {
        await ev('window.__previousPage = true');
        await send('Page.navigate', { url });
        await waitFor(`!window.__previousPage && !!window.outOfSquare`, 20000);
    };
    const app = {
        send, ev, waitFor, errors, downloads,
        
        reload: open,
        
        // Drag with the mouse along a list of points (pointer events, like a finger)
        async drag(points) {
            const [first, ...rest] = points;
            await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: first.x, y: first.y, button: 'left', buttons: 1, clickCount: 1 });
            for (const p of rest) await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y, button: 'left', buttons: 1 });
            const last = points[points.length - 1];
            await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: last.x, y: last.y, button: 'left', buttons: 0, clickCount: 1 });
        },

        async click(x, y) {
            await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
            await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
        },
        
        async screenshot(file) {
            const shot = await send('Page.captureScreenshot');
            fs.writeFileSync(file, Buffer.from(shot.result.data, 'base64'));
        },
        
        async close() {
            ws.close();
            const exited = new Promise(resolve => chrome.once('exit', resolve));
            chrome.kill();
            await exited;
            server.closeAllConnections();
            server.close();
            fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
        }
    };
    // Don't leave Chrome running if the page never becomes ready
    try {
        await open();
    } catch (error) {
        await app.close();
        throw error;
    }
    return app;
}
