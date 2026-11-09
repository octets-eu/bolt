// The brain as a three.js scene: the anatomy's cells as meshes, its contacts
// as two instanced markers, the neuropils and organs as translucent shells,
// labels in the DOM, bloom for the glow. One scene for the page's life; a
// view hosts its canvas (view.ts), as the plotter's.
//
// The look, docs/brain-view.plan.md: the dark field of a fluorescence
// microscope; colour has three jobs, excite blue, inhibit red, select aqua,
// all else is grey tissue that glows white by rate; a cell's grade is its
// material: natural solid, a product cell's gate field wire, a stand-in
// dashed and never brighter than grey.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Anatomy, Cell, V3 } from './anatomy';

/** The tokens of the plan's Look section, dark: the view's field is dark. */
export const TOKENS = { surface: '#1a1a19', ink: '#f0efec', muted: '#c3c2b7', excite: '#3987e5', inhibit: '#e66767', select: '#199e70' } as const;
const TISSUE = '#6f6e68';          // the muted ink as resting tissue, dimmed under the lights so a glow stands out
const GLOW_K = 1.25;               // emissive intensity at full glow, over the bloom's threshold
const DIM = 0.08;                  // the opacity of what a selection leaves out
const FRAME_MS = 1000 / 30;        // 30 frames a second: the glow decays over 300 ms, and a run shares the page's thread
const CONTACT_REST = 0.1, CONTACT_FLASH = 2.4;   // a contact's colour at rest and lit, times its hue

type ViewName = 'home' | 'above' | 'side' | 'ring';
const VIEWS: Record<ViewName, { pos: V3; target: V3 }> = {
  home:  { pos: [0, -10, 7.5], target: [0, 0, 0] },      // nose up, from above and behind
  above: { pos: [0, -0.01, 13], target: [0, 0, 0] },
  side:  { pos: [12.5, 0, 1], target: [0, 0, 0] },       // the right ear's side
  ring:  { pos: [0, -9, -0.3], target: [0, 0, -0.3] },   // into the ring along the nose
};

interface CellParts { mesh: THREE.Mesh; mat: THREE.MeshStandardMaterial; twigs?: THREE.LineSegments; twigPost?: Int32Array; hollow?: THREE.Mesh; dashed?: THREE.LineSegments }

export class BrainScene {

  readonly canvas: HTMLCanvasElement;
  /** Called once a frame with the ms since the last, before painting: the view feeds the light here. */
  onFrame: ((dtMs: number) => void) | null = null;
  /** Called with a cell's index, or null, when the user clicks the tissue. */
  onPick: ((index: number | null) => void) | null = null;

  private readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  private readonly controls: OrbitControls;
  private readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass;
  private readonly labels = new CSS2DRenderer();
  private readonly parts: CellParts[] = [];
  private readonly markers: { mesh: THREE.InstancedMesh; pre: Int32Array; post: Int32Array; w: Float32Array; hue: THREE.Color; place: THREE.Matrix4[] }[] = [];
  private host: HTMLElement | null = null;
  private resize: ResizeObserver | null = null;
  private raf = 0;
  private last = 0;
  private selected: number | null = null;
  private related = new Set<number>();
  private readonly color = new THREE.Color();
  private readonly tint = new THREE.Color();

  constructor (private readonly anatomy: Anatomy, private readonly glow: Float32Array) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio || 1);
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.canvas = this.renderer.domElement;
    this.canvas.style.display = 'block';
    this.scene.background = new THREE.Color(TOKENS.surface);
    this.camera.up.set(0, 0, 1);
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.view('home');

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.45));
    const key = new THREE.DirectionalLight(0xffffff, 0.8); key.position.set(-3, -5, 8); this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.3); fill.position.set(4, 6, 2); this.scene.add(fill);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.35, 0.7);   // strength, radius, threshold: a halo, not a blur
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.labels.domElement.style.position = 'absolute';
    this.labels.domElement.style.top = '0';
    this.labels.domElement.style.pointerEvents = 'none';

    this.build();
    this.pickOnClick();
  }

  /** Put the canvas and the labels into `host` and run. */
  attach (host: HTMLElement): void {
    this.host = host;
    host.appendChild(this.canvas);
    host.appendChild(this.labels.domElement);
    this.resize = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const w = Math.max(1, Math.floor(entry.contentRect.width)), h = Math.max(1, Math.floor(entry.contentRect.height));
      this.renderer.setSize(w, h);
      this.composer.setSize(w, h);
      this.bloom.resolution.set(w, h);
      this.labels.setSize(w, h);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    });
    this.resize.observe(host);
    this.last = 0;
    this.raf = requestAnimationFrame(this.loop);
  }

  /** Stop and take the canvas out; the scene stays for the next host. */
  detach (): void {
    cancelAnimationFrame(this.raf);
    this.resize?.disconnect();
    this.resize = null;
    this.canvas.remove();
    this.labels.domElement.remove();
    this.host = null;
  }

  view (name: ViewName): void {
    const v = VIEWS[name];
    this.camera.position.set(...v.pos);
    this.controls.target.set(...v.target);
    this.controls.update();
  }

  /** Light one cell and its partners, dim the rest; null shows all. */
  select (index: number | null): void {
    this.selected = index;
    this.related = new Set(index === null ? [] : [index, ...this.anatomy.incoming[index]!.map(([p]) => p), ...this.anatomy.outgoing[index]!.map(([p]) => p)]);
    for (const [i, part] of this.parts.entries()) {
      const shown = index === null || this.related.has(i), cell = this.anatomy.cells[i]!;
      part.mat.color.set(i === index ? TOKENS.select : cell.grade === 'stand-in' ? '#6b6a64' : TISSUE);
      part.mat.opacity = shown ? 1 : DIM;
      part.mat.depthWrite = shown;
      for (const extra of [part.hollow, part.dashed]) {
        if (!extra) continue;
        const m = extra.material as THREE.Material;
        m.opacity = (shown ? 1 : DIM) * 0.8;
      }
    }
    // a selection keeps only the contacts of the selected cell, the rest shrink to nothing
    const none = new THREE.Matrix4().makeScale(0, 0, 0);
    for (const mk of this.markers) {
      for (let k = 0; k < mk.pre.length; k++) mk.mesh.setMatrixAt(k, index === null || mk.pre[k] === index || mk.post[k] === index ? mk.place[k]! : none);
      mk.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  // --- building

  private build (): void {
    const { cells, contacts, vis } = this.anatomy;
    for (const cell of cells) this.parts.push(this.grow(cell));
    for (const sign of [1, -1]) {
      const mine = contacts.filter((c) => Math.sign(c.w) === sign);
      const geo = sign > 0 ? new THREE.IcosahedronGeometry(0.022, 0) : new THREE.BoxGeometry(0.045, 0.045, 0.015);
      const mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ toneMapped: false }), mine.length);
      const q = new THREE.Quaternion(), e = new THREE.Euler();
      const place = mine.map((c, k) => new THREE.Matrix4().compose(new THREE.Vector3(...c.at), q.setFromEuler(e.set(k * 1.7, k * 2.3, k * 0.9)), new THREE.Vector3(1, 1, 1)));
      mine.forEach((_c, k) => {
        mesh.setMatrixAt(k, place[k]!);
        mesh.setColorAt(k, new THREE.Color(0, 0, 0));
      });
      this.scene.add(mesh);
      this.markers.push({ mesh, pre: Int32Array.from(mine, (c) => c.pre), post: Int32Array.from(mine, (c) => c.post), w: Float32Array.from(mine, (c) => Math.abs(c.w)), hue: new THREE.Color(sign > 0 ? TOKENS.excite : TOKENS.inhibit), place });
    }
    this.shells(vis);
  }

  private grow (cell: Cell): CellParts {
    const { vis } = this.anatomy;
    const geos: THREE.BufferGeometry[] = [new THREE.SphereGeometry(cell.somaR, 14, 10).translate(...cell.soma)];
    for (const t of cell.tubes) geos.push(tube(t.path, t.r));
    if (cell.wedge) {
      const { r, tube: tr, at } = vis.neuropils.ring, { azimuth, arc } = cell.wedge;
      geos.push(new THREE.TorusGeometry(r, tr * 0.92, 10, 4, rad(arc)).rotateZ(rad(90 - azimuth - arc / 2)).translate(...at));
    }
    if (cell.layer) {
      const { r, at } = vis.neuropils.column;
      geos.push(washer(r * 0.45, r, 0.035).translate(at[0], at[1], at[2] + cell.layer.z));   // a layer with room for the fibres through the column
    }
    if (cell.forgets) geos.push(new THREE.TorusGeometry(cell.somaR * 1.6, 0.007, 4, 24).translate(...cell.soma));
    const standIn = cell.grade === 'stand-in';
    const mat = new THREE.MeshStandardMaterial({ color: standIn ? '#6b6a64' : TISSUE, roughness: 0.75, metalness: 0, emissive: standIn ? TOKENS.muted : TOKENS.ink, emissiveIntensity: 0, transparent: true });
    const mesh = new THREE.Mesh(merge(geos), mat);
    mesh.userData.index = cell.index;
    this.scene.add(mesh);
    const part: CellParts = { mesh, mat };
    if (cell.twigs.length) {
      // per vertex RGBA: a selection keeps only the branches toward the selected cell
      const geo = segments(cell.twigs.map((t) => t.path)), count = geo.getAttribute('position').count;
      geo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(count * 4), 4));
      part.twigPost = Int32Array.from(cell.twigs.flatMap((t) => Array<number>(2 * (t.path.length - 1)).fill(t.post)));
      part.twigs = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true }));
      this.scene.add(part.twigs);
    }
    if (cell.hollow.length) {
      part.hollow = new THREE.Mesh(merge(cell.hollow.map((t) => tube(t.path, t.r))), new THREE.MeshBasicMaterial({ color: TISSUE, wireframe: true, transparent: true, opacity: 0.8 }));
      this.scene.add(part.hollow);
    }
    if (cell.dashed.length) {
      part.dashed = new THREE.LineSegments(segments(cell.dashed), new THREE.LineDashedMaterial({ color: '#6b6a64', dashSize: 0.08, gapSize: 0.06, transparent: true, opacity: 0.8 }));
      part.dashed.computeLineDistances();
      this.scene.add(part.dashed);
    }
    return part;
  }

  /** Neuropils and organs: translucent shells, named at their edge. */
  private shells (vis: Anatomy['vis']): void {
    const shell = (geo: THREE.BufferGeometry, opacity: number) => {
      const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: TOKENS.muted, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, roughness: 1 }));
      m.renderOrder = 1;
      this.scene.add(m);
    };
    const { ring, column, glomeruli, earNuclei, motor } = vis.neuropils, { ears, hearing, muscle, wheels } = vis.organs;
    shell(new THREE.TorusGeometry(ring.r, ring.tube * 1.3, 16, 72).translate(...ring.at), 0.06);
    const zs = Object.values(column.layers), z0 = Math.min(...zs) - 0.08, z1 = Math.max(...zs) + 0.08;
    shell(new THREE.CylinderGeometry(column.r + 0.05, column.r + 0.05, z1 - z0, 40, 1, true).rotateX(Math.PI / 2).translate(column.at[0], column.at[1], column.at[2] + (z0 + z1) / 2), 0.05);
    for (const at of Object.values(glomeruli.at)) shell(new THREE.IcosahedronGeometry(glomeruli.r, 2).translate(...at), 0.08);
    for (const at of Object.values(earNuclei.at)) shell(new THREE.IcosahedronGeometry(earNuclei.r, 2).translate(...at), 0.08);
    shell(new THREE.SphereGeometry(motor.r, 24, 12).scale(1, 1, motor.flat).translate(...motor.at), 0.06);
    shell(new THREE.SphereGeometry(hearing.r, 24, 12).translate(...hearing.at), 0.08);
    shell(new THREE.BoxGeometry(...muscle.size).translate(...muscle.at), 0.12);
    for (const at of wheels.at) shell(new THREE.CylinderGeometry(wheels.r, wheels.r, wheels.width, 32).rotateZ(Math.PI / 2).translate(...at), 0.14);
    for (const at of Object.values(ears.at)) {
      const n = new THREE.Vector3(...at).normalize();
      const cap = new THREE.CylinderGeometry(ears.r, ears.r, ears.depth, 24);
      cap.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), n));
      shell(cap.translate(...at), 0.22);
    }
    // the ball as an outline, its equator and the meridian through nose and tail: a filled shell greys the whole field
    const r = vis.ball.r, circle = (f: (a: number) => V3) => new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 96 }, (_, k) => new THREE.Vector3(...f(k * Math.PI / 48)))),
      new THREE.LineBasicMaterial({ color: TOKENS.muted, transparent: true, opacity: 0.25 }));
    this.scene.add(circle((a) => [r * Math.sin(a), r * Math.cos(a), 0]));
    this.scene.add(circle((a) => [0, r * Math.cos(a), r * Math.sin(a)]));

    const label = (text: string, at: V3, strong = false) => {
      const el = document.createElement('div');
      el.textContent = text;
      el.style.cssText = `font: 11px monospace; color: ${strong ? TOKENS.ink : TOKENS.muted}; white-space: nowrap; text-shadow: 0 0 3px ${TOKENS.surface};`;
      const o = new CSS2DObject(el);
      o.position.set(...at);
      this.scene.add(o);
    };
    label('nose', [0, vis.ball.r + 0.45, 0], true);
    label('ring', [ring.at[0] - ring.r * 0.75, ring.at[1] - ring.r * 0.75, ring.at[2] - ring.tube - 0.25]);
    label('distance', [column.at[0], column.at[1], column.at[2] + z1 + 0.3]);
    label('motor', [motor.at[0] - motor.r - 0.35, motor.at[1], motor.at[2]]);
    label('hearing', [hearing.at[0], hearing.at[1] + hearing.r + 0.35, hearing.at[2] - hearing.r]);
    label('muscle', [muscle.at[0], muscle.at[1] - muscle.size[1], muscle.at[2] - 0.35]);
    for (const [c, at] of Object.entries(ears.at)) label(c, [at[0] * 1.12, at[1] * 1.12, at[2]]);
    const frames = this.anatomy.cells.filter((c) => c.def.role === 'frame');
    for (const [ch, at] of Object.entries(glomeruli.at)) {
      const f = frames.find((c) => String(c.def.channel) === ch)?.def;
      if (f) label(`${(f.ladder ?? '?').charAt(0).toUpperCase()}${f.strength}`, [at[0], at[1], at[2] + glomeruli.r + 0.2]);
    }
  }

  // --- each frame

  private readonly loop = (t: number): void => {
    if (!this.host) return;
    if (this.last && t - this.last < FRAME_MS - 1) { this.raf = requestAnimationFrame(this.loop); return; }
    const dt = this.last ? Math.min(250, t - this.last) : FRAME_MS;
    this.last = t;
    this.onFrame?.(dt);
    this.paint();
    this.controls.update();
    this.composer.render();
    this.labels.render(this.scene, this.camera);
    this.raf = requestAnimationFrame(this.loop);
  };

  private paint (): void {
    const g = this.glow;
    for (const [i, part] of this.parts.entries()) {
      const v = g[i] ?? 0, standIn = this.anatomy.cells[i]!.grade === 'stand-in';
      part.mat.emissiveIntensity = standIn ? 0.5 * v : GLOW_K * v;
      if (part.twigs && part.twigPost) this.paintTwigs(i, part.twigs, part.twigPost, v);
      if (part.dashed) (part.dashed.material as THREE.LineDashedMaterial).color.set('#6b6a64').lerp(this.color.set(TOKENS.muted), v);
    }
    const s = this.selected;
    for (const mk of this.markers) {
      for (let k = 0; k < mk.pre.length; k++) {
        const pre = mk.pre[k]!, flash = Math.min(1, (g[pre] ?? 0) * mk.w[k]!);
        const shown = s === null || pre === s || mk.post[k] === s;
        this.color.copy(mk.hue).multiplyScalar(shown ? CONTACT_REST + CONTACT_FLASH * flash : 0);
        mk.mesh.setColorAt(k, this.color);
      }
      if (mk.mesh.instanceColor) mk.mesh.instanceColor.needsUpdate = true;
    }
  }

  /** A cell's twigs: tissue to ink by its glow; under a selection, only the branches of the selected cell or toward it. */
  private paintTwigs (i: number, twigs: THREE.LineSegments, post: Int32Array, v: number): void {
    const attr = twigs.geometry.getAttribute('color') as THREE.BufferAttribute, a = attr.array as Float32Array, s = this.selected;
    if (i === s) this.color.set(TOKENS.select); else this.color.set(TISSUE).lerp(this.tint.set(TOKENS.ink), v);
    for (let k = 0; k < post.length; k++) {
      const shown = s === null || i === s || post[k] === s;
      a[4 * k] = this.color.r; a[4 * k + 1] = this.color.g; a[4 * k + 2] = this.color.b; a[4 * k + 3] = shown ? 0.5 : DIM * 0.3;
    }
    attr.needsUpdate = true;
  }

  // --- picking: a click that did not drag

  private pickOnClick (): void {
    let down: { x: number, y: number } | null = null;
    const ray = new THREE.Raycaster(), at = new THREE.Vector2();
    this.canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
    this.canvas.addEventListener('pointerup', (e) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) return;
      const r = this.canvas.getBoundingClientRect();
      at.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(at, this.camera);
      const visible = this.parts.filter((p) => p.mat.opacity > DIM).map((p) => p.mesh);
      const hit = ray.intersectObjects(visible, false)[0];
      this.onPick?.(hit ? (hit.object.userData.index as number) : null);
    });
  }

}

const rad = (d: number) => d * Math.PI / 180;

function tube (path: V3[], r: number): THREE.BufferGeometry {
  const pts = path.map((p) => new THREE.Vector3(...p));
  let len = 0;
  for (let k = 1; k < pts.length; k++) len += pts[k]!.distanceTo(pts[k - 1]!);
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  return new THREE.TubeGeometry(curve, Math.min(64, Math.max(2, Math.round(len / 0.12))), r, 5, false);
}

/** A flat ring of thickness `h` about the z axis, a lathe of its cross-section. */
function washer (inner: number, outer: number, h: number): THREE.BufferGeometry {
  const profile = [[inner, -h / 2], [outer, -h / 2], [outer, h / 2], [inner, h / 2], [inner, -h / 2]].map(([x, y]) => new THREE.Vector2(x, y));
  return new THREE.LatheGeometry(profile, 48).rotateX(Math.PI / 2);
}

function merge (geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeGeometries(geos, false);
  if (!g) throw new Error('brain view: geometries do not merge');
  return g;
}

/** Polylines as line-segment pairs. */
function segments (lines: V3[][]): THREE.BufferGeometry {
  const pos: number[] = [];
  for (const l of lines) for (let k = 1; k < l.length; k++) pos.push(...l[k - 1]!, ...l[k]!);
  return new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
}
