// COLLADA export of the measured room, for SketchUp (File → Import → .dae).
// Units are mm, Z up. Floor, ceiling and every wall are separate named groups, built from the real
// (solved) corner points, so leaning walls and sloping ceilings come through as measured.
// Each measurement is an edge between the two spots, in its own group.
import { spotPoint, signedArea, inwardNormal } from './geometry.js';
import { triangulate } from './triangulate.js';
import { cornerName } from './names.js';

// Plan (x, y down) + height → SketchUp (x, y up, z up): a rotation, so face windings stay valid
const out = p => [p.x, -p.y, p.z];

export function roomToDae(room, measurements, { title = 'Room' } = {}) {
    const side = signedArea(room.bottoms) >= 0 ? 1 : -1;
    const nodes = [];
    const geometries = [];

    const addMesh = (name, tris, inward) => {
        const id = `g${geometries.length}`;
        const positions = [];
        for (const [a, b, c] of tris) {
            // Face normals point into the room, so SketchUp shows the front faces from inside
            const n = cross(sub(b, a), sub(c, a));
            const ordered = dot(n, inward) >= 0 ? [a, b, c] : [a, c, b];
            ordered.forEach(p => positions.push(...out(p)));
        }
        const count = positions.length / 3;
        geometries.push(`
    <geometry id="${id}" name="${esc(name)}">
      <mesh>
        <source id="${id}-pos">
          <float_array id="${id}-pos-array" count="${positions.length}">${positions.map(fmt).join(' ')}</float_array>
          <technique_common>
            <accessor source="#${id}-pos-array" count="${count}" stride="3">
              <param name="X" type="float"/><param name="Y" type="float"/><param name="Z" type="float"/>
            </accessor>
          </technique_common>
        </source>
        <vertices id="${id}-vtx"><input semantic="POSITION" source="#${id}-pos"/></vertices>
        <triangles count="${count / 3}" material="mat">
          <input semantic="VERTEX" source="#${id}-vtx" offset="0"/>
          <p>${Array.from({ length: count }, (_, i) => i).join(' ')}</p>
        </triangles>
      </mesh>
    </geometry>`);
        nodes.push(`
      <node id="n${id}" name="${esc(name)}">
        <instance_geometry url="#${id}"><bind_material><technique_common><instance_material symbol="mat" target="#material"/></technique_common></bind_material></instance_geometry>
      </node>`);
    };

    room.walls.forEach((w, i) => {
        const bf = room.bottoms[w.from], bt = room.bottoms[w.to], tf = room.tops[w.from], tt = room.tops[w.to];
        const n = inwardNormal(bf, bt, side);
        addMesh(`Wall ${i + 1} (${cornerName(w.from)}–${cornerName(w.to)})`, [[bf, bt, tt], [bf, tt, tf]], { x: n.x, y: n.y, z: 0 });
    });
    if (room.closed) {
        const faces = triangulate(room.bottoms);
        addMesh('Floor', faces.map(f => f.map(k => room.bottoms[k])), { x: 0, y: 0, z: 1 });
        addMesh('Ceiling', faces.map(f => f.map(k => room.tops[k])), { x: 0, y: 0, z: -1 });
    }

    // Measurements as edges
    const measured = measurements.filter(m => typeof m.value === 'number');
    if (measured.length) {
        const id = 'dims';
        const positions = [];
        measured.forEach(m => positions.push(...out(spotPoint(m.a, room)), ...out(spotPoint(m.b, room))));
        geometries.push(`
    <geometry id="${id}" name="Measurements">
      <mesh>
        <source id="${id}-pos">
          <float_array id="${id}-pos-array" count="${positions.length}">${positions.map(fmt).join(' ')}</float_array>
          <technique_common>
            <accessor source="#${id}-pos-array" count="${positions.length / 3}" stride="3">
              <param name="X" type="float"/><param name="Y" type="float"/><param name="Z" type="float"/>
            </accessor>
          </technique_common>
        </source>
        <vertices id="${id}-vtx"><input semantic="POSITION" source="#${id}-pos"/></vertices>
        <lines count="${measured.length}" material="mat">
          <input semantic="VERTEX" source="#${id}-vtx" offset="0"/>
          <p>${Array.from({ length: positions.length / 3 }, (_, i) => i).join(' ')}</p>
        </lines>
      </mesh>
    </geometry>`);
        nodes.push(`
      <node id="n${id}" name="Measurements">
        <instance_geometry url="#${id}"><bind_material><technique_common><instance_material symbol="mat" target="#material"/></technique_common></bind_material></instance_geometry>
      </node>`);
    }

    const now = new Date().toISOString();
    return `<?xml version="1.0" encoding="utf-8"?>
<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">
  <asset>
    <contributor><authoring_tool>Out of Square</authoring_tool></contributor>
    <created>${now}</created>
    <modified>${now}</modified>
    <unit name="millimeter" meter="0.001"/>
    <up_axis>Z_UP</up_axis>
  </asset>
  <library_effects>
    <effect id="effect"><profile_COMMON><technique sid="common"><lambert>
      <diffuse><color>0.92 0.90 0.86 1</color></diffuse>
    </lambert></technique></profile_COMMON></effect>
  </library_effects>
  <library_materials>
    <material id="material" name="Room"><instance_effect url="#effect"/></material>
  </library_materials>
  <library_geometries>${geometries.join('')}
  </library_geometries>
  <library_visual_scenes>
    <visual_scene id="scene" name="${esc(title)}">
      <node id="room" name="${esc(title)}">${nodes.join('')}
      </node>
    </visual_scene>
  </library_visual_scenes>
  <scene><instance_visual_scene url="#scene"/></scene>
</COLLADA>
`;
}

const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const fmt = v => (Math.round(v * 10) / 10).toString();
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
