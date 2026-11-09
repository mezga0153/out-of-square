# Out of Square (prototype)

**Try it:** <https://outofsquare.tinetov.net>

Measure a room on a tablet: sketch the top view with a finger, then mark and type laser measurements in 3D. The room takes its real shape from the measurements and exports to SketchUp. See [plan.md](plan.md).

## Run

No build step. Serve the folder and open it in a browser (on the tablet: same Wi-Fi, use the computer's IP):

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

three.js loads from a CDN, so the prototype needs a connection.

## Tests

```bash
node --test 'tests/*.test.mjs'
```

Node 22+ and Google Chrome (set `CHROME_PATH` if it's elsewhere). The browser test drives the whole flow in headless Chrome.

## Deploy

```bash
./deploy.sh
```

Publishes what's committed (`index.html`, `css/`, `js/`) to <https://outofsquare.tinetov.net>, a Cloudflare Worker serving static files (see `wrangler.jsonc`). Needs `wrangler` logged in to the personal Cloudflare account.
