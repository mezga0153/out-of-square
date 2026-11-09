# Out of Square: measuring rooms on a tablet

Named for the main problem: no room is square, and the app records how far out of square it is instead of pretending otherwise.

## The problem

A carpenter who designs kitchens and bedrooms visits a client's home. He sketches the room, or the part that matters, on paper. Then he measures it with a laser and writes the numbers around the sketch, roughly in order. Back at the workshop he redraws everything in SketchUp from that sheet.

**No room is square.** Walls lean, corners aren't 90°, floors and ceilings slope. A wall can be 3412 mm long at the floor and 3428 mm under the ceiling, and the ceiling can be 2580 mm high in one corner and 2545 mm in the other. So he measures the same thing in several places, especially the **height to the ceiling**. Which spots he measures depends on the job. On paper these readings pile up around the sketch, and it's easy to lose track of which number belongs where.

## The idea

A web app on a tablet with two steps:

1. **Sketch the top view.** With a finger, draw the room outline roughly. The app straightens the strokes into walls. This only sets the layout (how many walls, which way they turn, rough proportions), not the sizes.
2. **Measure in 3D.** The app raises the sketch into a 3D room with a default ceiling height and shows it at an isometric angle. He taps where the laser sits, then where its dot landed, and types the number. The laser can be anywhere: on the floor, against a wall, in a corner, pointing across, up or at an angle. Every measurement is drawn in the room at the spot where it was taken.

As readings come in, the 3D room takes on the **real shape**: walls get their measured lengths, lean where they lean, and the ceiling follows the measured heights. The design and the SketchUp model are built from that shape.

Also:

- **The spots change per project, so marking them is quick.** He can tap spots one by one, add a row or grid in one go, or start from a saved set or a previous sketch.
- **No warnings for now.** The app records the measurements and builds the shape from them. It doesn't judge them.
- **Draw each wall face-on.** Windows, doors, sockets, pipes, radiators and beams are placed on walls and measured the same way.
- **Export.** The real shape goes to SketchUp, and a PDF report goes to the workshop or the client.
- **Organise by client and project.** One client can have several projects, and one project can have several sketches (kitchen, bedroom, a niche in the hallway).

## What we take from PartCatalog-3D

[PartCatalog-3D](https://github.com/mezga0153/PartCatalog-3D) (in `~/dev/personal/PartCatalog-3D`) reads a GLB exported from SketchUp and turns it into a cut list for a board-cutting service. This app covers the step before it, so together they make a pipeline:

```text
measure on site (Out of Square) → design in SketchUp → cut list (PartCatalog-3D)
```

With a 3D measuring view, a lot of PartCatalog-3D carries over directly:

| PartCatalog-3D | Out of Square |
| --- | --- |
| Plain ES modules, import map, no build step | Same |
| Static site on GitHub Pages | Same, plus a service worker so it works offline |
| three.js scene, lighting, `camera.js` framing | The 3D room view |
| `interaction.js`: hover and click picking in 3D | Tapping spots on walls, floor and ceiling |
| `dimensions.js`: dimension lines with arrows that stay the same size on screen | Drawing each measurement in the room |
| `part-highlighter.js`: fading and isolating parts | Hiding the walls between the camera and the room, so you see inside |
| `parts-store.js` holds state; views subscribe to it | `sketch-store.js` holds the open sketch; the 2D sketch, 3D view, list and keypad subscribe |
| Analysis kept in pure functions | Geometry and the solver in pure functions (`geometry.js`, `solver.js`), testable in Node without a browser |
| `units.js`, `toast.js`, `html.js` | Reuse, with mm as the default |
| `print.js`: printable page, saved as PDF from the browser | Same for the report |
| `storage.js`: localStorage | IndexedDB, because sketches and photos are much larger |
| Bootstrap, Bootstrap Icons and three.js from a CDN | Same, but copied into the repo (`vendor/`) so the app also works without a connection |
| Tests: `node --test`, headless Chrome over DevTools, no dependencies | Same `tests/browser.mjs` approach, plus plain Node tests for the solver |

The 2D top-view sketch is drawn in SVG, which is simpler for freehand strokes and prints sharp.

## Users and setting

- One user, on a tablet, standing in a room, often holding the laser in the other hand. Large touch targets, few taps, nothing that needs two hands.
- Entering a reading must be as fast as writing it on paper: tap the spot, type, done.
- Often no signal (new builds, basements), so everything must work offline. Nothing can be lost if the browser closes.
- Later he may use it on a laptop at the workshop to look at sketches and export them.

## The two views

### 1. Top view sketch (2D)

1. With a finger or pen, draw the outline in one or more strokes. When he lifts his finger, the stroke is simplified (Ramer–Douglas–Peucker) into straight segments. Angles near 90° snap to 90° in the sketch, just to tidy it; the real angles come from the measurements. An end close to the start closes the room. An open outline (just the kitchen wall and its two returns) is fine too.
2. Drag corners, tap a wall to split it (for a jog or a chimney breast), long-press to delete.
3. Optionally type a rough ceiling height (default 2500 mm). Then tap **3D**.

He can go back to the sketch at any time to add a wall; measurements already taken stay attached to their walls.

### 2. Room view (3D)

The sketch becomes a room: floor, ceiling and a wall face for each line, shown from an isometric angle above. Walls between the camera and the inside are hidden, like a doll's house, so he always sees into the room.

**Moving around:** one finger orbits, two fingers pan and pinch to zoom. Buttons along the edge jump to set views: *Iso*, *Top*, *Ceiling from below*, and each wall *face-on*. Tapping a wall's name opens it face-on, which is easiest for precise tapping. The face-on view is the same 3D scene with the camera square to the wall, not a separate drawing.

**Marking a measurement:**

1. **Tap where the laser sits.** The tap snaps to corners (even ones hidden behind a wall), then to the floor and ceiling lines and wall edges when close to them, otherwise it lands where he tapped on the surface.
2. **Tap where the dot landed.** Any surface, from any view. For the most common shot there's a shortcut: from the floor, *straight up to the ceiling* (and from the ceiling, straight down).
3. A dashed line joins the two spots. **He types the value** on a large keypad, or taps *Later* to only mark it. The line becomes a dimension with the number, in the room, where it was taken.

He can mark all the spots first and then walk around shooting and typing, or mark and measure one at a time, whichever suits the job. Tapping a dimension (in the room or in the list) opens the keypad to change or delete it.

**Making spots quickly**, since they change from project to project:

- **Row:** repeat a measurement at several places (e.g. "wall 1 to wall 3 at 3 heights", "floor to ceiling at 4 points along this wall"). The app spreads them out evenly; he drags any of them to where he actually measured.
- **Grid:** ceiling heights in an n × m grid over the floor.
- **Repeat:** "do the same on every wall".
- **Sets:** save the current spots as a named set ("kitchen wall", "attic wardrobe") and apply it to a new sketch. Or copy the spots from another sketch.
- Every spot can be moved, deleted or given a note afterwards. The exact position of a spot (e.g. 120 mm from the corner, 900 mm up) can be typed when it matters.

**Walls face-on** are also where windows, doors, sockets, pipes, radiators and beams go: drag one in from a palette, then measure its position and size the same way (from the corner along the wall, from the floor up, its width and height).

A **list** beside the view shows every measurement grouped by wall, with its value. Tapping one highlights it in 3D. Empty ones are simply blank; there are no warnings or checks for now.

**Freehand on top:** a pen tool for notes and arrows, in either view, like on paper.

## The real shape (solver)

The room is described by its corners, each a vertical edge with a **bottom point** (on the floor) and a **top point** (at the ceiling), each with its own x, y and z. That way walls can lean, corners can be off 90°, and the floor and ceiling can slope. Extra ceiling-height readings in the middle of the room bend the ceiling between the corners.

Every measurement is **the distance between two spots on the room's surfaces**: where the laser sat and where its dot landed. The solver moves the corners until every distance fits, as closely as the readings allow:

- Start from the sketch and the default ceiling height.
- Fit with least squares (a few dozen unknowns at most, so a small Gauss–Newton loop in plain JS, no library).
- Anything nothing was measured for stays as sketched, so the room always has a complete shape, getting more accurate with every reading.
- The ceiling is a surface through the top points and the extra height readings (triangulated).

This is the riskiest part, so it gets its own Node tests from day one with made-up rooms: square, out of square, leaning wall, trapezoid, L-shape, sloping attic ceiling. Each test generates laser shots from a known room and checks that the solver gets the room back.

The solver only builds the shape. Showing how far off a room is, or spotting a misread, can be added later on top of it.

## Data model

```text
Client   { id, name, phone, email, address, notes, createdAt, updatedAt }
Project  { id, clientId, name, address, status, notes, createdAt, updatedAt }
Sketch   { id, projectId, name, defaultHeight,
           outline, measurements[], features[], annotations[], photos[], notes, updatedAt }
SpotSet  { id, name, spots[] }          // saved sets of measurement spots, reusable across projects
```

**Outline** (from the top view sketch):

```text
corners[] { id, x, y }                  // sketched position
walls[]   { id, from, to }
```

**Measurement**, the core of the app:

```text
Measurement { id, a: Spot, b: Spot, value, note, takenAt }   // value in mm, empty until measured

Spot = { kind: 'wall', wall, u, v }          // u: 0–1 along the wall from its first corner, v: 0–1 floor to ceiling
     | { kind: 'floor' | 'ceiling', w[] }    // weights of the corners (mean value coordinates)
```

- A corner is just a wall spot with `u` and `v` at 0 or 1.
- Spots are stored relative to the room's surfaces, not as fixed 3D points, so they stay where they belong when the shape changes. (The prototype uses fractions; the real app should keep mm from the nearest corner, so a spot 120 mm from a corner stays 120 mm from it.)
- The same quantity measured in several places is just several measurements. No averaging, no picking a value; the shape uses all of them.

**Feature** (window, door, socket…): `{ id, type, wall, note }`. Its position and size are measurements like any other, attached to it.

**Annotations**: the freehand layer, `{ id, view, points[], width, colour }`.
**Photos**: stored as blobs in IndexedDB and pinned to a spot.

Every change goes through the store as a small command, which gives undo/redo and saves to IndexedDB after each step.

## Exports

### SketchUp: the real shape

The model is the solved room: floor and ceiling as surfaces (split into triangles where they aren't flat), each wall as a face between its corners' bottom and top points, so leaning walls and sloping ceilings come through as measured. Window and door openings are cut out, and other features are simple boxes or markers. Each wall, the floor, the ceiling and each feature is its own named group.

We build the exports in steps, depending on what his SketchUp version imports:

1. **COLLADA (`.dae`)**: SketchUp desktop has imported it in every version, including the free Make. We write it ourselves; it's a short XML file for a mesh this simple. This is the first export to build.
2. **SketchUp extension (`.rbz`)**, best quality: a small Ruby extension that reads our `.outofsquare.json` and builds the room inside SketchUp, with real SketchUp dimension objects for every measurement, tags per feature type and groups per wall. It needs a one-time install, but the result is what he would draw himself, and he can still see every reading.
3. **DXF**, 2D: the plan and each wall face-on, with dimensions, for SketchUp Pro and other CAD programs. Only if he needs it.

Writing `.skp` files directly needs SketchUp's C SDK, so it isn't an option for a web app.

### PDF report

As in PartCatalog-3D, a print layout that the browser saves as PDF (on iPad: Share → Print → pinch → save). It contains:

- Header: client, address, project, date
- The top view, to scale, with lengths
- An isometric view of the room with all measurements
- Each wall face-on, in its real shape, with its measurements and features
- A table of every measurement: both spots, value
- Notes and photos

If saving from the print dialog proves awkward on the tablet, switch to generating the file directly (jsPDF + svg2pdf.js) so it can go straight to the share sheet.

### Backup

Export and import a project or everything as one `.outofsquare.json` (photos embedded). Use the Web Share API to send it by mail or messaging.

## Storage and offline

- IndexedDB with a tiny wrapper, no library. Stores: `clients`, `projects`, `sketches`, `spotSets`, `photos`.
- Call `navigator.storage.persist()`. **Safari on iPad can delete site data after 7 days without a visit unless the app is added to the Home Screen**, so the first screen asks him to install it, and the app reminds him to back up.
- A service worker caches the app and `vendor/` libraries; the app opens with no connection.
- No server in v1. Syncing between devices or with the workshop can come later (for example a small Cloudflare Worker + D1/R2) if he needs it.

## Project structure

```text
out-of-square/
├── index.html              # Shell, import map, routes
├── app.js                  # Wiring: store, views, router
├── sw.js                   # Service worker (offline cache)
├── manifest.webmanifest    # Installable app
├── vendor/                 # three.js, Bootstrap, icons (and jsPDF if used), copied in
├── js/
│   ├── db.js               # IndexedDB wrapper
│   ├── repo.js             # Clients / projects / sketches / spot sets, backup import/export
│   ├── sketch-store.js     # Open sketch state, commands, undo/redo, autosave
│   ├── geometry.js         # Pure: vectors, RDP simplify, angle snapping, surface coordinates
│   ├── solver.js           # Pure: laser shots → corner points, ceiling surface
│   ├── room-mesh.js        # Pure: solved room → floor, ceiling, wall faces, openings
│   ├── stroke-input.js     # Pointer events → strokes, palm rejection, pinch/pan
│   ├── sketch-view.js      # SVG top view sketch
│   ├── room-view.js        # three.js room: scene, camera presets, wall hiding
│   ├── picking.js          # Tap → surface spot, snapping (from PartCatalog's interaction.js)
│   ├── dimensions.js       # Measurement lines in 3D (from PartCatalog)
│   ├── spot-tools.js       # Row, grid, repeat, spot sets
│   ├── measurement-list.js # Side list grouped by wall
│   ├── keypad.js           # Number keypad, next empty measurement
│   ├── features.js         # Feature types, icons, default sizes
│   ├── photos.js           # Camera / file input, thumbnails
│   ├── units.js            # From PartCatalog
│   ├── export-dae.js       # COLLADA
│   ├── report.js           # Print/PDF report
│   ├── toast.js, html.js   # From PartCatalog
│   └── views/              # Client list, project list, sketch list screens
├── css/
├── sketchup/               # Ruby extension
└── tests/                  # node --test: solver/geometry tests + headless-Chrome tests
```

## Phases

Each phase leaves something he can use on site.

0. **Skeleton.** Static app, installable, offline, IndexedDB. Client → project → sketch lists with create, rename and delete. JSON backup/restore.
1. **Top view sketch.** Freehand drawing, straightening into walls, dragging corners, undo/redo, freehand notes.
2. **3D room + measurements.** Raise the sketch into a room, isometric/face-on/top views, wall hiding, tap where the laser sits and where it landed, type a value, measurement list. The room is not solved yet: measurements are drawn on the sketched shape. *Already better than paper: every number is legible and tied to where it was taken.*
3. **Real shape.** The solver, with its tests. The room updates as readings come in.
4. **Quick spots and features.** Row, grid, repeat, spot sets, copying from another sketch. Windows, doors and other features on walls. Photos.
5. **SketchUp.** DAE export of the real shape, then the Ruby extension.
6. **PDF report.**
7. **Later.** Showing deviations and possible misreads, Bluetooth laser (Bosch GLM / Leica DISTO send readings over BLE; Web Bluetooth only works in Chrome on Android, not on iPad), DXF, sync, a link to PartCatalog-3D.

Phases 2 and 3 are the heart of it. Before building the full UI, a quick throwaway prototype of the 3D view on his actual tablet would show whether tapping spots in 3D is comfortable with a finger, or whether he'd rather do it mostly face-on.

## Prototype (built)

What's in this folder now, to try on his tablet:

- Home screen with sketches grouped by client; new, open, delete, import a backup.
- Step 1: draw the outline with a finger, straightened and snapped; drag corners; pinch to zoom; corners lettered A, B, C…, walls numbered.
- Step 2: the 3D room (iso, top, ceiling and each wall face-on), doll's-house wall hiding, tap two spots, *straight up* shortcut, keypad, *Later*, edit or delete from the room or the list, list grouped by wall.
- The solver: the room takes its real shape after every reading (leaning walls, sloping ceiling).
- Undo/redo, autosave (localStorage), export to SketchUp (`.dae`) and a JSON backup.
- Tests: `node --test 'tests/*.test.mjs'` (solver, export, and the whole flow in headless Chrome).

Not yet: features (windows, doors…), spot tools (row/grid/sets), photos, PDF, offline/installable (three.js still loads from a CDN), IndexedDB.

## Open questions for the carpenter

1. **What else does he measure with?** A line laser for level and plumb, a tape for small things? Does he ever measure from something that isn't the room (a tripod, a cabinet already in place)?
2. **Which tablet?** iPad or Android, and does he use a pen? This decides whether Bluetooth from the laser is possible later and how much to optimise for pen versus finger.
3. **Which SketchUp?** Pro or Make/free, desktop or web, which year? This decides which export to build first and whether the Ruby extension can be installed.
4. **Which laser?** Model and whether it has Bluetooth.
5. **Language of the app?** Slovenian, English or both? Is mm the only unit he needs?
6. **Whole rooms or single walls?** If he mostly measures one or two walls, the sketch step can be a single line and the 3D view starts face-on.
7. **Who reads the PDF?** Only him and the workshop, or the client as well (then it needs branding)?
8. **One device or several?** Is a backup file enough, or does the workshop need to see sketches right away?
9. **Real examples.** Two or three of his paper sketches (photos) would show what he measures and how, and would make good test cases for the solver.
