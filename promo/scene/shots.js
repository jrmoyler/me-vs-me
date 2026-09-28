// The eight shots of the film. Each builds a scene once and poses it for any shot-local time.
import {
  THREE, clamp, lerp, smooth, easeInOut, easeOut, easeIn, expoOut, rng, wobble, track, tex,
  Fighter, loadFighter, wetFloor, lightCone, floorGlow, glowSprite, dust, bokehField, hazeDome,
  Bursts, shockwave, textMesh,
} from './core.js';
import { W, H, text, cine, slam, win, rule } from './hud.js';
import { FIGHT, impactTime } from './timeline.js';

// ---------- shared helpers ----------
function camera(fov = 32) {
  return new THREE.PerspectiveCamera(fov, 16 / 9, 0.1, 300);
}
// Camera keys: {t, p:[x,y,z], l:[x,y,z], fov, cut}. A key marked cut starts a new setup without easing into it.
function camAt(keys, t) {
  let i = 0;
  while (i < keys.length - 1 && keys[i + 1].t <= t) i++;
  const a = keys[i], b = keys[i + 1];
  if (!b || b.cut) return { p: a.p, l: a.l, fov: a.fov ?? 32 };
  const k = (b.ease ?? easeInOut)(clamp((t - a.t) / (b.t - a.t)));
  return {
    p: a.p.map((v, j) => lerp(v, b.p[j], k)),
    l: a.l.map((v, j) => lerp(v, b.l[j], k)),
    fov: lerp(a.fov ?? 32, b.fov ?? 32, k),
  };
}
function applyCam(cam, c, t, { hand = 0.02, shake = 0 } = {}) {
  cam.position.set(c.p[0] + wobble(t, 1) * hand, c.p[1] + wobble(t, 2) * hand * 0.7, c.p[2]);
  const lx = c.l[0] + wobble(t * 0.8, 4) * hand * 0.5 + (shake ? (Math.sin(t * 91) + Math.sin(t * 137)) * shake : 0);
  const ly = c.l[1] + wobble(t * 0.8, 5) * hand * 0.5 + (shake ? (Math.cos(t * 83) + Math.sin(t * 121)) * shake : 0);
  cam.lookAt(lx, ly, c.l[2]);
  if (cam.fov !== c.fov) { cam.fov = c.fov; cam.updateProjectionMatrix(); }
}
const faceCam = (f, cam) => { const o = f.object; o.rotation.y = Math.atan2(cam.position.x - o.position.x, cam.position.z - o.position.z); };
function fogAll(fighters, color, density) {
  for (const f of fighters) { f.uniforms.fogColor.value.set(color); f.uniforms.fogDensity.value = density; }
}
function stage({ fog = '#020203', density = 0.05, dome = {}, floorTint = '#ffffff', floorStrength = 0.8, blur = 0.02, scale = 1 } = {}) {
  const scene = new THREE.Scene();
  scene.add(hazeDome(dome));
  const floor = wetFloor(80, scale);
  floor.material.uniforms.fogColor.value.set(fog);
  floor.material.uniforms.fogDensity.value = density;
  floor.material.uniforms.tint.value.set(floorTint);
  floor.material.uniforms.strength.value = floorStrength;
  floor.material.uniforms.blur.value = blur;
  scene.add(floor);
  return { scene, floor };
}
const distTo = (cam, v) => cam.position.distanceTo(new THREE.Vector3(...v));

// Shards of glass: thin triangular slivers, chrome-like so they catch the studio env.
function shardMesh(count, env, seed = 7) {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0.5); shape.lineTo(-0.28, -0.4); shape.lineTo(0.35, -0.2); shape.lineTo(0, 0.5);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.015, bevelEnabled: false });
  geo.center();
  const mat = new THREE.MeshStandardMaterial({ color: '#b8c4d6', metalness: 1, roughness: 0.04, envMap: env, envMapIntensity: 1.6 });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.frustumCulled = false;
  const r = rng(seed);
  mesh.userData.parts = Array.from({ length: count }, () => ({
    u: r(), v: r(), s: 0.04 + Math.pow(r(), 2.2) * 0.26, sx: 0.6 + r() * 0.8,
    axis: new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize(), spin: (r() - 0.5) * 9, rot0: r() * 6.28,
    push: 0.4 + r() * 1.6, out: r(), jitter: [r() - 0.5, r() - 0.5, r() - 0.5],
  }));
  return mesh;
}

// ---------- 1. cold open: a single light finds the original ----------
export async function buildOpen(ctx) {
  const { scene, floor } = stage({ density: 0.07, dome: { top: '#030306', glow: '#0b0608' }, scale: ctx.scale });
  const hero = await ctx.fighter('hataalii', { height: 1.8 });
  scene.add(hero.object);
  hero.uniforms.rimColor.value.set('#ffb48a');
  hero.uniforms.rimDir.value.set(-0.4, 1);
  const cone = lightCone({ color: '#ffe2c4', radius: 1.35, height: 5.6, intensity: 0 });
  cone.position.set(0, 5.6, 0);
  scene.add(cone);
  const pool = floorGlow({ color: '#ffd9b8', radius: 1.6, intensity: 0 });
  scene.add(pool);
  const lamp = glowSprite({ color: '#fff0e0', size: 0.6, intensity: 0, stretch: 1 });
  lamp.position.set(0, 5.6, 0);
  scene.add(lamp);
  // Distant arena lights that wake one by one.
  const far = [];
  for (let i = 0; i < 6; i++) {
    const x = (i - 2.5) * 3.2;
    const c = lightCone({ color: '#ff4a30', radius: 1.1, height: 6.5, intensity: 0 });
    c.position.set(x, 6.5, -13 - (i % 2) * 2);
    scene.add(c);
    const g = floorGlow({ color: '#ff3a20', radius: 1.4, intensity: 0 });
    g.position.set(x, 0.004, -13 - (i % 2) * 2);
    scene.add(g);
    far.push([c, g]);
  }
  const motes = dust({ count: 1800, box: [8, 5.5, 8], center: [0, 2.75, 0], beams: [[0, 0, 5.6, 1.35, '#ffe6cc']], size: 16, seed: 11 });
  scene.add(motes);
  const bokeh = bokehField({ count: 40, center: [0, 3, -22], spread: [30, 6, 4], colors: ['#ff5a3c', '#ff9a5a', '#5a7cff'], intensity: 0 });
  scene.add(bokeh);
  fogAll([hero], '#020203', 0.07);
  const cam = camera(30);
  const keys = [
    { t: 0, p: [-0.9, 0.3, 9], l: [0, 1.0, 0], fov: 30 },
    { t: 7.5, p: [0.35, 1.02, 5.3], l: [0, 0.98, 0], fov: 27, ease: (x) => x },
  ];
  return {
    scene, camera: cam,
    update(t) {
      // Light strikes at 0.85s with a sodium-lamp flicker.
      const on = t < 0.85 ? 0 : t < 1.25 ? [1, 0.2, 0.9, 0.1, 1, 0.6, 1, 1][Math.floor((t - 0.85) * 20) % 8] : 1;
      const lvl = on * (0.55 + 0.05 * Math.sin(t * 3));
      cone.material.uniforms.intensity.value = lvl;
      cone.material.uniforms.time.value = t;
      pool.material.uniforms.intensity.value = lvl * 0.7;
      lamp.material.uniforms.intensity.value = on * 3;
      lamp.lookAt(cam.position);
      motes.material.uniforms.time.value = t + 10;
      motes.material.uniforms.brightness.value = 0.3 + on * 0.9;
      far.forEach(([c, g], i) => {
        const k = smooth(2.6 + i * 0.35, 2.9 + i * 0.35, t);
        c.material.uniforms.intensity.value = k * 0.22;
        c.material.uniforms.time.value = t;
        g.material.uniforms.intensity.value = k * 0.35;
      });
      bokeh.material.uniforms.intensity.value = smooth(2.5, 5, t) * 0.25;
      hero.idle(t, 0.8);
      hero.uniforms.silhouette.value = 1 - smooth(1.2, 4.2, t) * 0.97;
      hero.uniforms.exposure.value = 0.15 + on * 1.05;
      hero.uniforms.rimStrength.value = on * 3.5;
      hero.uniforms.tint.value.setRGB(1.05, 0.92, 0.82);
      applyCam(cam, camAt(keys, t), t, { hand: 0.03 });
      faceCam(hero, cam);
    },
    post(t) {
      return { focus: distTo(cam, [0, 1, 0]), aperture: 70, bloom: 0.9, bloomRadius: 0.7, bloomThreshold: 0.6, fade: 1 - smooth(0.0, 0.5, t), exposure: 1.1 };
    },
    hud(g, t) {
      cine(g, 'EVERY VERSION OF ME', t, 1.9, 4.3, { font: 'Oswald', weight: 300, size: 46, y: 850, track0: 10, track1: 20 });
      cine(g, 'STARTED AS THIS ONE.', t, 4.5, 7.2, { font: 'Oswald', weight: 300, size: 46, y: 850, track0: 10, track1: 20 });
      cine(g, 'HATAALII  ·  THE ORIGINAL', t, 5.0, 7.2, { font: 'Inter', weight: 500, size: 17, y: 905, color: '#ff6148', track0: 6, track1: 9 });
    },
  };
}

// ---------- 2. the mirror: the reflection is not you ----------
const glassFrag = /* glsl */`
uniform float crack; uniform vec2 impact; uniform float time; uniform vec3 tint; uniform float gone;
varying vec2 vUv; varying vec3 vN; varying vec3 vWorld;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec2 hash2(vec2 p) { return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
float voronoiEdge(vec2 x) {
  vec2 n = floor(x), f = fract(x); vec2 mg, mr; float md = 8.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) { vec2 g = vec2(i, j); vec2 o = hash2(n + g); vec2 r = g + o - f; float d = dot(r, r); if (d < md) { md = d; mr = r; mg = g; } }
  md = 8.0;
  for (int j = -2; j <= 2; j++) for (int i = -2; i <= 2; i++) { vec2 g = mg + vec2(i, j); vec2 o = hash2(n + g); vec2 r = g + o - f;
    if (dot(mr - r, mr - r) > 0.00001) md = min(md, dot(0.5 * (mr + r), normalize(r - mr))); }
  return md;
}
void main() {
  vec2 p = vUv;
  vec3 V = normalize(cameraPosition - vWorld);
  float fres = pow(1.0 - abs(dot(normalize(vN), V)), 3.0);
  float sweep = smoothstep(0.06, 0.0, abs(p.x * 0.8 + p.y * 0.55 - 0.2 - fract(time * 0.12) * 1.8)) * 0.35;
  float grime = noise(p * vec2(7.0, 12.0)) * 0.05 + noise(p * 40.0) * 0.02;
  float e = min(min(p.x, 1.0 - p.x), min(p.y, 1.0 - p.y));
  float frame = smoothstep(0.012, 0.0, e);
  vec2 q = (p - impact) * vec2(0.57, 1.0);
  float d = length(q);
  float ang = atan(q.y, q.x);
  float radial = smoothstep(0.93, 1.0, abs(sin(ang * 8.0 + noise(vec2(ang * 3.0, d * 4.0)) * 2.5)));
  float cells = smoothstep(0.035, 0.0, voronoiEdge(p * vec2(4.0, 7.0) + noise(p * 6.0) * 0.4));
  float reach = crack * 1.2;
  float lines = (radial * step(d, reach) + cells * step(d, reach * 0.7)) * (1.0 - smoothstep(0.0, reach + 0.001, d) * 0.6);
  lines += smoothstep(0.03, 0.0, d) * step(0.001, crack) * 2.0;
  vec3 col = tint * (0.03 + fres * 0.6 + sweep + grime) + vec3(0.9, 0.95, 1.0) * lines * 3.0 + vec3(1.0, 0.3, 0.2) * frame * 2.0;
  float a = clamp(0.1 + fres * 0.5 + sweep + grime + lines + frame, 0.0, 1.0) * (1.0 - gone);
  gl_FragColor = vec4(col, a);
}`;

export async function buildMirror(ctx) {
  const { scene } = stage({ density: 0.06, dome: { top: '#040510', glow: '#0a0716', glowDir: [0.5, 0.1, -1] }, floorTint: '#dfe6ff', scale: ctx.scale });
  const hero = await ctx.fighter('hataalii', { height: 1.8 });
  hero.object.position.set(-1.3, 0, 0);
  hero.uniforms.rimColor.value.set('#ff8a66');
  scene.add(hero.object);
  // The reflection cycles through other selves before settling on Shadow Self.
  const glitchIds = ['hataalii', 'sovereign', 'eventhorizon', 'aether', 'viking', 'cyborg', 'blood', 'vector', 'pharaoh', 'jazz', 'pixel'];
  const selves = [];
  for (const id of glitchIds) {
    const f = await ctx.fighter(id, { height: 1.8 });
    f.object.position.set(1.05, 0, -0.75);
    f.flip = true;
    f.uniforms.tint.value.setRGB(0.62, 0.72, 1.0);
    f.uniforms.rimColor.value.set('#b093fc');
    f.uniforms.rimDir.value.set(1, 0.4);
    scene.add(f.object);
    selves.push(f);
  }
  fogAll([hero, ...selves], '#020206', 0.06);
  // The pane.
  const pane = new THREE.Group();
  pane.position.set(0.85, 1.55, -0.35);
  pane.rotation.y = -0.32;
  scene.add(pane);
  const glassU = { crack: { value: 0 }, impact: { value: new THREE.Vector2(0.42, 0.56) }, time: { value: 0 }, tint: { value: new THREE.Color('#9fb4ff') }, gone: { value: 0 } };
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.75, 3.1), new THREE.ShaderMaterial({
    uniforms: glassU, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: 'varying vec2 vUv; varying vec3 vN; varying vec3 vWorld; void main(){ vUv = uv; vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position,1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: glassFrag,
  }));
  glass.renderOrder = 30;
  pane.add(glass);
  const frameMat = new THREE.MeshStandardMaterial({ color: '#15151a', metalness: 1, roughness: 0.25, envMap: ctx.env, envMapIntensity: 1.2 });
  const bars = [[1.87, 0.06, 0, 1.58], [1.87, 0.06, 0, -1.58], [0.06, 3.22, -0.905, 0], [0.06, 3.22, 0.905, 0]].map(([w, h, x, y]) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.08), frameMat);
    m.position.set(x, y, 0); pane.add(m); return m;
  });
  const shards = shardMesh(320, ctx.env, 21);
  shards.visible = false;
  scene.add(shards);
  const bursts = new Bursts(3000);
  scene.add(bursts.points);
  const impactWorld = new THREE.Vector3();
  pane.updateMatrixWorld(true);
  impactWorld.set((0.42 - 0.5) * 1.75, (0.56 - 0.5) * 3.1, 0).applyMatrix4(pane.matrixWorld);
  bursts.add({ t0: 4.9, pos: impactWorld.toArray(), color: '#bcd0ff', count: 260, speed: 5, life: 0.9, size: 0.03, seed: 5, dir: [0, 0, 1.5] });
  bursts.add({ t0: 4.4, pos: impactWorld.toArray(), color: '#ffffff', count: 60, speed: 1.5, life: 0.4, size: 0.025, seed: 9 });
  const coneL = lightCone({ color: '#ffd2b0', radius: 1.2, height: 5.5, intensity: 0.45 });
  coneL.position.set(-1.3, 5.5, 0); scene.add(coneL);
  const coneR = lightCone({ color: '#8f7dff', radius: 1.2, height: 5.5, intensity: 0.35 });
  coneR.position.set(1.05, 5.5, -0.75); scene.add(coneR);
  const poolL = floorGlow({ color: '#ffcfaa', radius: 1.5, intensity: 0.45 }); poolL.position.set(-1.3, 0.004, 0); scene.add(poolL);
  const poolR = floorGlow({ color: '#8f7dff', radius: 1.5, intensity: 0.4 }); poolR.position.set(1.05, 0.004, -0.75); scene.add(poolR);
  const motes = dust({ count: 1400, box: [8, 5, 6], center: [0, 2.5, 0], beams: [[-1.3, 0, 5.5, 1.2, '#ffe0c8'], [1.05, -0.75, 5.5, 1.2, '#a898ff']], seed: 12 });
  scene.add(motes);
  scene.add(bokehField({ count: 36, center: [0, 3, -18], spread: [26, 6, 4], colors: ['#7d6bff', '#4fd6ff', '#ff5a8a'], intensity: 0.25, seed: 4 }));
  const cam = camera(32);
  const keys = [
    { t: 0, p: [-3.2, 1.25, 5.0], l: [-0.4, 1.15, 0], fov: 32 },
    { t: 4.3, p: [-1.0, 1.2, 4.5], l: [0.55, 1.2, -0.3], fov: 32 },
    { t: 4.9, p: [-0.6, 1.25, 3.6], l: [0.7, 1.35, -0.3], fov: 32 },
    { t: 6.1, p: [0.35, 1.35, 2.1], l: [0.8, 1.35, -0.4], fov: 38, ease: easeIn },
  ];
  const r = rng(99);
  const glitchSeq = Array.from({ length: 40 }, () => 1 + Math.floor(r() * (glitchIds.length - 2)));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s3 = new THREE.Vector3(), p3 = new THREE.Vector3();
  const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(pane.quaternion);
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(pane.quaternion);
  return {
    scene, camera: cam,
    update(t) {
      hero.idle(t + 3.1, 0.8);
      // Which self shows in the glass.
      let idx = 0;
      if (t >= 1.9 && t < 2.7) idx = glitchSeq[Math.floor((t - 1.9) * 15)];
      else if (t >= 2.7) idx = glitchIds.length - 1;
      selves.forEach((f, i) => {
        f.object.visible = i === idx;
        f.idle(t + 3.1, 0.8);
        const glitchFlash = t >= 1.9 && t < 2.7 ? (Math.floor(t * 30) % 3 === 0 ? 0.35 : 0) : 0;
        f.uniforms.flash.value = glitchFlash;
        f.uniforms.flashColor.value.set('#b8a8ff');
        const free = smooth(4.9, 5.4, t);
        f.uniforms.exposure.value = 0.75 + free * 0.45;
        f.uniforms.rimStrength.value = 3 + free * 3;
      });
      const shatter = t >= 4.9;
      glassU.crack.value = smooth(4.4, 4.85, t);
      glassU.time.value = t;
      glassU.gone.value = shatter ? 1 : 0;
      bars.forEach((b) => { b.visible = !shatter; });
      shards.visible = shatter;
      if (shatter) {
        const age = t - 4.9;
        const slow = age * 0.45; // slow motion
        shards.userData.parts.forEach((sp, i) => {
          const lx = (sp.u - 0.5) * 1.75, ly = (sp.v - 0.5) * 3.1;
          const dx = sp.u - 0.42, dy = (sp.v - 0.56) * 1.77;
          const dl = Math.hypot(dx, dy) + 0.05;
          p3.set(lx, ly, 0).applyMatrix4(pane.matrixWorld);
          p3.addScaledVector(right, (dx / dl) * slow * (1.2 + sp.out * 2));
          p3.y += (dy / dl) * slow * (1.0 + sp.out * 1.6) - slow * slow * 0.4;
          p3.addScaledVector(normal, slow * sp.push * 3.2 * (1.3 - dl));
          p3.x += sp.jitter[0] * slow * 0.5; p3.z += sp.jitter[2] * slow * 0.5;
          q.setFromAxisAngle(sp.axis, sp.rot0 + sp.spin * slow);
          s3.set(sp.s * sp.sx, sp.s, 1);
          m4.compose(p3, q, s3);
          shards.setMatrixAt(i, m4);
        });
        shards.instanceMatrix.needsUpdate = true;
      }
      bursts.update(t);
      motes.material.uniforms.time.value = t + 30;
      coneL.material.uniforms.time.value = t; coneR.material.uniforms.time.value = t;
      const shake = shatter ? Math.exp(-(t - 4.9) * 4) * 0.05 : t > 4.4 ? 0.006 : 0;
      applyCam(cam, camAt(keys, t), t, { hand: 0.025, shake });
      faceCam(hero, cam);
      for (const f of selves) f.object.rotation.y = pane.rotation.y * 0.5;
    },
    post(t) {
      const flash = t >= 4.9 ? Math.exp(-(t - 4.9) * 8) * 0.3 : 0;
      return { focus: distTo(cam, [0.4, 1.2, -0.3]), aperture: 60, bloom: 0.9 + flash * 2, bloomRadius: 0.6, bloomThreshold: 0.55, flash, fade: smooth(5.9, 6.1, t) * 0.0, exposure: 1.1 };
    },
    hud(g, t) {
      cine(g, 'BUT EVERY REFLECTION', t, 0.4, 2.5, { font: 'Oswald', weight: 300, size: 46, y: 850, track0: 10, track1: 20 });
      cine(g, 'WANTS TO WIN.', t, 2.8, 4.7, { font: 'Oswald', weight: 300, size: 46, y: 850, track0: 10, track1: 20 });
      cine(g, 'SHADOW SELF  ·  THE INSTINCT', t, 3.0, 4.7, { font: 'Inter', weight: 500, size: 17, y: 905, color: '#b093fc', track0: 6, track1: 9 });
    },
  };
}

// ---------- 3. title ----------
async function titleWords(ctx, size) {
  const front = new THREE.MeshStandardMaterial({ color: '#2a2a31', metalness: 1, roughness: 0.16, envMap: ctx.env, envMapIntensity: 1.5 });
  const side = new THREE.MeshStandardMaterial({ color: '#5a0d08', metalness: 1, roughness: 0.3, envMap: ctx.env, emissive: '#ff2410', emissiveIntensity: 0.4 });
  const vsFront = new THREE.MeshStandardMaterial({ color: '#d0271a', metalness: 1, roughness: 0.2, envMap: ctx.env, envMapIntensity: 1.4, emissive: '#ff2a14', emissiveIntensity: 0.25 });
  const a = await textMesh('ME', { size, depth: size * 0.3, bevel: size * 0.025, front, side });
  const vs = await textMesh('VS', { size: size * 0.62, depth: size * 0.3, bevel: size * 0.025, front: vsFront, side });
  const b = await textMesh('ME', { size, depth: size * 0.3, bevel: size * 0.025, front, side });
  const width = (m) => { m.geometry.computeBoundingBox(); return m.geometry.boundingBox.max.x - m.geometry.boundingBox.min.x; };
  const gap = size * 0.28;
  const total = width(a) + width(vs) + width(b) + gap * 2;
  a.userData.x = -total / 2 + width(a) / 2;
  vs.userData.x = a.userData.x + width(a) / 2 + gap + width(vs) / 2;
  b.userData.x = vs.userData.x + width(vs) / 2 + gap + width(b) / 2;
  return { words: [a, vs, b], side, vsFront, total };
}

export async function buildTitle(ctx) {
  const { scene } = stage({ density: 0.05, dome: { top: '#040406', glow: '#1a0604', glowDir: [0, 0.2, -1] }, floorStrength: 0.9, blur: 0.012, scale: ctx.scale });
  scene.environment = ctx.env;
  const { words, side, vsFront, total } = await titleWords(ctx, 1.25);
  const Y = 1.55;
  words.forEach((w) => scene.add(w));
  const flare = glowSprite({ color: '#ff3a22', size: 0.35, intensity: 0, stretch: 40 });
  flare.position.set(0, Y, -0.6);
  scene.add(flare);
  const flare2 = glowSprite({ color: '#ffd0c0', size: 0.12, intensity: 0, stretch: 60 });
  flare2.position.set(0, Y, -0.55);
  scene.add(flare2);
  const shards = shardMesh(180, ctx.env, 33);
  scene.add(shards);
  const bursts = new Bursts(2000);
  scene.add(bursts.points);
  bursts.add({ t0: 0.75, pos: [0, Y, 0.2], color: '#ff4a2a', count: 200, speed: 7, life: 1.0, size: 0.035, seed: 3, spread: 1.2 });
  const motes = dust({ count: 1200, box: [14, 6, 8], center: [0, 3, -1], beams: [], size: 14, seed: 13 });
  motes.material.uniforms.ambient.value = 0.12;
  scene.add(motes);
  scene.add(bokehField({ count: 50, center: [0, 3, -20], spread: [34, 8, 4], colors: ['#ff3a22', '#ff8a4a', '#6a5cff'], intensity: 0.22, seed: 8 }));
  const cam = camera(34);
  const keys = [
    { t: 0, p: [0, 1.25, 8.4], l: [0, 1.45, 0], fov: 34 },
    { t: 6, p: [0, 1.3, 7.1], l: [0, 1.5, 0], fov: 33, ease: (x) => x },
  ];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s3 = new THREE.Vector3(), p3 = new THREE.Vector3();
  return {
    scene, camera: cam,
    update(t) {
      words.forEach((w, i) => {
        const k = expoOut(clamp((t - i * 0.08) / 0.75));
        w.position.set(w.userData.x * lerp(1.6, 1, k), Y + (1 - k) * (i - 1) * 0.6, lerp(-14, 0, k));
        w.rotation.set((1 - k) * 0.6 * (i - 1), (1 - k) * (i - 1) * -1.2, 0);
        if (t > 0.75) { const s = 1 + Math.exp(-(t - 0.75) * 10) * 0.05; w.scale.setScalar(s); }
      });
      scene.environmentRotation.set(0, lerp(-1.4, 1.2, smooth(0.6, 5.5, t)), 0);
      side.emissiveIntensity = 0.3 + Math.exp(-Math.max(0, t - 0.75) * 3) * 2.5 * (t > 0.75 ? 1 : 0);
      vsFront.emissiveIntensity = 0.25 + (t > 0.75 ? Math.exp(-(t - 0.75) * 2.5) * 2 : 0) + 0.1 * Math.sin(t * 4);
      const fl = t > 0.75 ? Math.exp(-(t - 0.75) * 1.4) : 0;
      flare.material.uniforms.intensity.value = fl * 3 + (t > 0.75 ? 0.4 : 0);
      flare2.material.uniforms.intensity.value = fl * 5;
      flare.lookAt(cam.position); flare2.lookAt(cam.position);
      shards.userData.parts.forEach((sp, i) => {
        const a = sp.u * 6.28 + t * 0.05 * (sp.out - 0.5);
        const rad = 3 + sp.v * 7;
        p3.set(Math.cos(a) * rad, 0.3 + sp.out * 5 + Math.sin(t * 0.3 + i) * 0.1, -2 - Math.sin(a) * rad * 0.6 - sp.push * 3);
        // They drift in from the shatter, slowing to a hover.
        const k = expoOut(clamp(t / 1.2));
        p3.z += (1 - k) * 8;
        q.setFromAxisAngle(sp.axis, sp.rot0 + t * sp.spin * 0.08);
        s3.set(sp.s * sp.sx * 1.3, sp.s * 1.3, 1);
        m4.compose(p3, q, s3);
        shards.setMatrixAt(i, m4);
      });
      shards.instanceMatrix.needsUpdate = true;
      bursts.update(t);
      motes.material.uniforms.time.value = t + 50;
      const shake = t > 0.75 ? Math.exp(-(t - 0.75) * 6) * 0.04 : 0;
      applyCam(cam, camAt(keys, t), t, { hand: 0.015, shake });
    },
    post(t) {
      const flash = t > 0.75 ? Math.exp(-(t - 0.75) * 9) * 0.45 : 0;
      return { focus: distTo(cam, [0, Y, 0]), aperture: 55, bloom: 1.0, bloomRadius: 0.7, bloomThreshold: 0.6, flash, fade: smooth(5.45, 6.0, t), exposure: 1.15 };
    },
    hud(g, t) {
      cine(g, 'THE MIRROR TOURNAMENT', t, 1.3, 5.6, { font: 'Oswald', weight: 500, size: 34, y: 720, track0: 30, track1: 22, fin: 0.8 });
      rule(g, W / 2, 760, 90 * easeOut(clamp((t - 1.6) / 0.8)), win(t, 1.6, 5.6) * 0.8, '#ff4a2a', 2);
    },
  };
}

// ---------- 4. roster: a corridor of forty-eight selves, ending at the original ----------
function namePlate(char) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.font = '400 62px "Anton"';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = char.color;
  g.letterSpacing = '4px';
  g.fillText(char.name, 256, 48);
  g.font = '500 22px "Inter"';
  g.letterSpacing = '6px';
  g.fillStyle = 'rgba(255,255,255,0.75)';
  g.fillText(char.title.toUpperCase(), 256, 102);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
function hermite(p0, p1, v0, v1, T, t) {
  const s = clamp(t / T), s2 = s * s, s3 = s2 * s;
  return (2 * s3 - 3 * s2 + 1) * p0 + (s3 - 2 * s2 + s) * v0 * T + (-2 * s3 + 3 * s2) * p1 + (s3 - s2) * v1 * T;
}

export async function buildRoster(ctx) {
  const { scene } = stage({ fog: '#03040a', density: 0.032, dome: { top: '#03040a', glow: '#140608', glowDir: [0, 0.05, -1] }, floorStrength: 1.0, blur: 0.015, scale: ctx.scale });
  const others = ctx.characters.filter((c) => c.id !== 'hataalii');
  const plinthMat = new THREE.MeshStandardMaterial({ color: '#101014', metalness: 0.85, roughness: 0.3, envMap: ctx.env, envMapIntensity: 0.8 });
  const plinthGeo = new THREE.CylinderGeometry(0.55, 0.6, 0.3, 48);
  const ringGeo = new THREE.TorusGeometry(0.56, 0.012, 8, 64);
  const fighters = [];
  const cones = [];
  const SPACING = 2.2;
  for (let i = 0; i < others.length; i++) {
    const char = others[i];
    const left = i % 2 === 0;
    const row = Math.floor(i / 2);
    const z = -2 - row * SPACING - (left ? 0 : SPACING / 2);
    const x = left ? -1.75 : 1.75;
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.rotation.y = left ? 0.55 : -0.55;
    const plinth = new THREE.Mesh(plinthGeo, plinthMat);
    plinth.position.y = 0.15;
    group.add(plinth);
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(char.color).multiplyScalar(3) }));
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.3;
    group.add(ring);
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.225), new THREE.MeshBasicMaterial({ map: namePlate(char), transparent: true, color: new THREE.Color(1.6, 1.6, 1.6), depthWrite: false }));
    plate.position.set(0, 0.15, 0.605);
    group.add(plate);
    const f = await ctx.fighter(char.id, { height: 1.4, idleOnly: true });
    f.object.position.y = 0.3;
    f.flip = !left;
    f.uniforms.rimColor.value.set(char.color);
    f.uniforms.rimStrength.value = 3.2;
    f.uniforms.rimDir.value.set(left ? -0.6 : 0.6, 0.8);
    f.phase = (i * 0.37) % 1;
    group.add(f.object);
    const cone = lightCone({ color: new THREE.Color(char.color).lerp(new THREE.Color('#ffffff'), 0.55), radius: 0.95, height: 4.6, intensity: 0.16 });
    cone.position.set(0, 4.9, 0);
    group.add(cone);
    const pool = floorGlow({ color: char.color, radius: 1.3, intensity: 0.35 });
    group.add(pool);
    scene.add(group);
    fighters.push(f);
    cones.push(cone);
  }
  const endZ = -2 - Math.ceil(others.length / 2) * SPACING - 2.6;
  const hero = await ctx.fighter('hataalii', { height: 1.9 });
  const heroGroup = new THREE.Group();
  heroGroup.position.set(0, 0, endZ);
  const bigPlinth = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.95, 0.45, 64), plinthMat);
  bigPlinth.position.y = 0.225;
  heroGroup.add(bigPlinth);
  const bigRing = new THREE.Mesh(new THREE.TorusGeometry(0.86, 0.018, 8, 96), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff3a22').multiplyScalar(4) }));
  bigRing.rotation.x = Math.PI / 2; bigRing.position.y = 0.45;
  heroGroup.add(bigRing);
  hero.object.position.y = 0.45;
  hero.uniforms.rimColor.value.set('#ff5a3c');
  hero.uniforms.rimStrength.value = 4;
  heroGroup.add(hero.object);
  const heroCone = lightCone({ color: '#ffb098', radius: 1.4, height: 6, intensity: 0.6 });
  heroCone.position.set(0, 6.3, 0);
  heroGroup.add(heroCone);
  const heroPool = floorGlow({ color: '#ff5a3c', radius: 2.0, intensity: 0.5 });
  heroGroup.add(heroPool);
  scene.add(heroGroup);
  fighters.push(hero);
  fogAll(fighters, '#03040a', 0.032);
  const motes = dust({ count: 2600, box: [7, 5, 64], center: [0, 2.5, -28], beams: [], size: 14, seed: 14 });
  motes.material.uniforms.ambient.value = 0.1;
  scene.add(motes);
  const cam = camera(36);
  const zAt = (t) => {
    if (t < 4.4) return lerp(4.5, -8.4, t / 4.4);
    if (t < 7.4) return hermite(-8.4, endZ + 5.6, -2.93, -1.6, 3.0, t - 4.4);
    return hermite(endZ + 5.6, endZ + 4.6, -1.6, 0, 1.2, t - 7.4);
  };
  return {
    scene, camera: cam,
    update(t) {
      const z = zAt(t);
      const speed = Math.abs(zAt(t + 0.02) - zAt(t)) / 0.02;
      const end = smooth(6.6, 8.2, t);
      const y = 1.25 + end * 0.2;
      cam.position.set(Math.sin(t * 0.6) * 0.12, y, z);
      cam.lookAt(lerp(0, 0, end), lerp(1.05, 1.45, end), lerp(z - 7, endZ, end));
      cam.rotateZ(Math.sin(t * 0.9) * 0.012 + (speed > 4 ? Math.sin(t * 2.2) * 0.01 * (speed / 14) : 0));
      const fov = 36 + clamp((speed - 3) / 12) * 10;
      if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
      fighters.forEach((f) => f.idle(t + (f.phase ?? 0) * 2, 0.8));
      cones.forEach((c) => { c.material.uniforms.time.value = t; });
      heroCone.material.uniforms.time.value = t;
      motes.material.uniforms.time.value = t + 70;
      this.speed = speed;
    },
    post(t) {
      const z = zAt(t);
      const focusDist = t < 6.4 ? 4.5 : Math.abs(z - endZ);
      return { focus: focusDist, aperture: 45, bloom: 0.85, bloomRadius: 0.65, bloomThreshold: 0.6, fade: 1 - smooth(0, 0.35, t), exposure: 1.15, ca: 0.012 + clamp(((this.speed ?? 0) - 4) / 12) * 0.03 };
    },
    hud(g, t) {
      const a = win(t, 0.6, 4.1, 0.5, 0.5);
      if (a > 0) {
        const k = easeOut(clamp((t - 0.6) / 3.5));
        text(g, '49 FIGHTERS', W / 2, 500, { font: 'Anton', weight: 400, size: 150, alpha: a, tracking: 8 + k * 14, blur: (1 - smooth(0.6, 1.0, t)) * 12 });
        text(g, 'FORTY-NINE VERSIONS  ·  FORTY-NINE SIGNATURE POWERS', W / 2, 610, { font: 'Oswald', weight: 300, size: 28, alpha: a * smooth(1.2, 1.8, t), tracking: 8 });
      }
      cine(g, 'ONE ORIGINAL.', t, 7.0, 8.6, { font: 'Anton', weight: 400, size: 84, y: 870, track0: 14, track1: 22, fout: 0.2 });
    },
  };
}

// ---------- 5. the fight: combat system explainer ----------
function fightPose(lt) {
  // Returns poses and positions for both fighters at shot-local time lt.
  const P = { p1: { sheet: 'sheet', col: 0, row: 0, x: -1.5, y: 0 }, p2: { sheet: 'sheet', col: 0, row: 0, x: 1.5, y: 0 } };
  const idle = (p, phase) => { p.sheet = 'sheet'; p.col = Math.floor((lt + phase) / 0.065) % 16; p.row = 0; };
  const walk = (p) => { p.sheet = 'motion'; p.row = 0; p.col = Math.floor(lt / 0.11) % 4; };
  idle(P.p1, 0); idle(P.p2, 0.4);
  // Positions.
  P.p1.x = track([[0, -1.5], [0.6, -1.5], [1.4, -0.62], [5.3, -0.62], [6.9, -0.62], [7.2, -0.5]], lt)[0];
  if (lt > 0.6 && lt < 1.4) walk(P.p1);
  let x2 = track([[0, 1.5], [0.6, 1.5], [1.4, 0.64]], lt)[0];
  if (lt > 0.6 && lt < 1.4) walk(P.p2);
  const pushes = [[1.61, 0.08], [2.0, 0.1]];
  for (const [at, d] of pushes) x2 += smooth(at, at + 0.12, lt) * d;
  // Uppercut launch and knockdown.
  const launch = (t0, t1, x0, x1, hgt) => {
    const k = clamp((lt - t0) / (t1 - t0));
    return { x: lerp(x0, x1, easeOut(k)), y: Math.sin(k * Math.PI) * hgt };
  };
  const upT = 2.38;
  if (lt >= upT) {
    if (lt < 3.05) { const l = launch(upT, 3.05, x2, 1.75, 0.75); x2 = l.x; P.p2.y = l.y; P.p2.sheet = 'motion'; P.p2.row = 3; P.p2.col = 2; }
    else { x2 = 1.75; }
    if (lt >= 3.05 && lt < 3.2) { P.p2.sheet = 'motion'; P.p2.row = 4; P.p2.col = 1; }
    else if (lt >= 3.2 && lt < 3.5) { P.p2.sheet = 'motion'; P.p2.row = 4; P.p2.col = 2; }
    else if (lt >= 3.5 && lt < 3.8) { P.p2.sheet = 'motion'; P.p2.row = 4; P.p2.col = 0; }
  }
  if (lt >= 3.85) x2 = lerp(1.75, 0.68, smooth(3.85, 4.15, lt));
  if (lt > 3.85 && lt < 4.15) walk(P.p2);
  // Throw sends P2 flying.
  const thT = 5.49;
  if (lt >= thT) {
    if (lt < 6.1) { const l = launch(thT, 6.1, 0.68, 2.0, 0.55); x2 = l.x; P.p2.y = l.y; P.p2.sheet = 'motion'; P.p2.row = 3; P.p2.col = 2; }
    else x2 = 2.0;
    if (lt >= 6.1 && lt < 6.25) { P.p2.sheet = 'motion'; P.p2.row = 4; P.p2.col = 1; }
    else if (lt >= 6.25 && lt < 6.6) { P.p2.sheet = 'motion'; P.p2.row = 4; P.p2.col = 2; }
    else if (lt >= 6.6 && lt < 6.9) { P.p2.sheet = 'motion'; P.p2.row = 4; P.p2.col = 0; }
    if (lt >= 6.9) { x2 = lerp(2.0, 0.66, smooth(6.9, 7.2, lt)); if (lt < 7.2) walk(P.p2); }
  }
  // Moves.
  for (const m of FIGHT.moves) {
    const end = m.t + m.f.reduce((a, b) => a + b, 0);
    if (lt < m.t || lt >= end) continue;
    let acc = m.t, col = 0;
    for (let i = 0; i < 4; i++) { if (lt >= acc) col = i; acc += m.f[i]; }
    const p = P[m.who];
    p.sheet = 'combat'; p.row = m.row; p.col = col;
    if (m.throw) p.col = Math.min(col, 2) === 2 ? 1 : col; // grab and hold
  }
  // Reactions.
  for (const m of FIGHT.moves) {
    const it = impactTime(m);
    if (m.hit === 'block') {
      if (lt >= m.t - 0.05 && lt < it + 0.35) { P.p1.sheet = 'motion'; P.p1.row = m.low ? 1 : 2; P.p1.col = m.low ? 3 : 1; }
      continue;
    }
    if (m.who !== 'p1' || m.launch || m.throw || m.power) continue;
    if (lt >= it && lt < it + 0.22) { P.p2.sheet = 'motion'; P.p2.row = 3; P.p2.col = m.hit === 'light' ? 0 : 1; }
  }
  // POWER knocks out.
  const pw = FIGHT.moves.find((m) => m.power);
  const pwT = impactTime(pw);
  if (lt >= 7.4 && lt < pwT) { P.p2.sheet = 'motion'; P.p2.row = 3; P.p2.col = 1; }
  if (lt >= pwT) {
    const k = clamp((lt - pwT) / (FIGHT.ko - pwT));
    const x0 = 0.66;
    x2 = lerp(x0, 3.1, easeOut(k));
    P.p2.y = Math.sin(k * Math.PI) * 1.2;
    P.p2.sheet = 'motion'; P.p2.row = 3; P.p2.col = 2;
    if (lt >= FIGHT.ko) { P.p2.y = 0; P.p2.row = 4; P.p2.col = lt < FIGHT.ko + 0.2 ? 1 : 2; }
  }
  if (lt >= FIGHT.win) { P.p1.sheet = 'motion'; P.p1.row = 5; P.p1.col = lt < FIGHT.win + 0.2 ? 2 : 3; }
  P.p2.x = x2;
  return P;
}

const SPARK = {
  light: { color: '#ffd27a', count: 60, speed: 4, size: 0.03, shake: 0.012, y: 1.25 },
  medium: { color: '#ffae5a', count: 90, speed: 5, size: 0.035, shake: 0.02, y: 1.25 },
  heavy: { color: '#ff6a3a', count: 140, speed: 6.5, size: 0.04, shake: 0.035, y: 1.45 },
  block: { color: '#8fd8ff', count: 70, speed: 3.5, size: 0.028, shake: 0.012, y: 1.2 },
  throw: { color: '#ff5ad2', count: 110, speed: 5, size: 0.035, shake: 0.03, y: 1.1 },
  power: { color: '#ff3020', count: 420, speed: 9, size: 0.05, shake: 0.07, y: 1.3 },
};

export async function buildFight(ctx) {
  const { scene } = stage({ fog: '#04060a', density: 0.045, dome: { top: '#04070c', glow: '#06222a', glowDir: [0, 0.15, -1] }, floorStrength: 1.0, blur: 0.016, scale: ctx.scale });
  // Arena: neon tubes, pillars, lighting truss.
  const tubeGeo = new THREE.BoxGeometry(0.07, 3.6, 0.07);
  for (let i = 0; i < 15; i++) {
    const x = (i - 7) * 1.35;
    const col = new THREE.Color(i % 3 === 0 ? '#ff3d8b' : '#46e1df').multiplyScalar(4);
    const tube = new THREE.Mesh(tubeGeo, new THREE.MeshBasicMaterial({ color: col.multiplyScalar(0.6) }));
    const hgt = 0.55 + ((i * 7) % 5) * 0.12;
    tube.scale.y = hgt;
    tube.position.set(x, 0.3 + 1.8 * hgt + ((i * 3) % 4) * 0.25, -7.5 - (i % 3) * 0.9);
    scene.add(tube);
  }
  const barGeo = new THREE.BoxGeometry(22, 0.06, 0.06);
  [[0.25, '#46e1df']].forEach(([y, c]) => {
    const b = new THREE.Mesh(barGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(2.5) }));
    b.position.set(0, y, -8.2); scene.add(b);
  });
  const pillarMat = new THREE.MeshStandardMaterial({ color: '#0c0d10', metalness: 0.7, roughness: 0.4, envMap: ctx.env, envMapIntensity: 0.5 });
  [-5.2, 5.2].forEach((x) => { const p = new THREE.Mesh(new THREE.BoxGeometry(0.8, 7, 0.8), pillarMat); p.position.set(x, 3.5, -3.2); scene.add(p); });
  const truss = new THREE.Mesh(new THREE.BoxGeometry(12, 0.25, 0.25), pillarMat);
  truss.position.set(0, 5.4, -0.4); scene.add(truss);
  for (let i = 0; i < 8; i++) {
    const g = glowSprite({ color: '#fff4e8', size: 0.35, intensity: 2.2 });
    g.position.set((i - 3.5) * 1.4, 5.2, -0.2); scene.add(g);
  }
  const coneA = lightCone({ color: '#ffd8b8', radius: 1.3, height: 5.2, intensity: 0.4 }); coneA.position.set(-0.8, 5.2, 0); scene.add(coneA);
  const coneB = lightCone({ color: '#a8ecff', radius: 1.3, height: 5.2, intensity: 0.35 }); coneB.position.set(0.9, 5.2, 0); scene.add(coneB);
  const pool = floorGlow({ color: '#ffffff', radius: 2.8, intensity: 0.25 }); scene.add(pool);
  const motes = dust({ count: 1600, box: [10, 5, 6], center: [0, 2.5, -0.5], beams: [[-0.8, 0, 5.2, 1.3, '#ffe0c8'], [0.9, 0, 5.2, 1.3, '#bff0ff']], seed: 15 });
  scene.add(motes);
  scene.add(bokehField({ count: 60, center: [0, 3.5, -16], spread: [36, 8, 4], colors: ['#46e1df', '#ff3d8b', '#ffc27a'], intensity: 0.3, seed: 16 }));
  const p1 = await ctx.fighter(FIGHT.p1, { height: 1.7 });
  const p2 = await ctx.fighter(FIGHT.p2, { height: 1.7 });
  p2.flip = true;
  p1.uniforms.rimColor.value.set('#ffb08a'); p1.uniforms.rimDir.value.set(-0.6, 0.8);
  p2.uniforms.rimColor.value.set('#6fe4ff'); p2.uniforms.rimDir.value.set(-0.6, 0.8); p2.uniforms.rimStrength.value = 3;
  scene.add(p1.object, p2.object);
  fogAll([p1, p2], '#04060a', 0.045);
  const bursts = new Bursts(5000);
  scene.add(bursts.points);
  const impacts = [];
  FIGHT.moves.forEach((m, i) => {
    const it = impactTime(m);
    const P = fightPose(it);
    const s = SPARK[m.hit];
    const x = m.hit === 'block' ? P.p1.x + 0.32 : m.power ? P.p1.x + 0.45 : P.p2.x - 0.3;
    const y = m.low ? 0.35 : s.y;
    bursts.add({ t0: it, pos: [x, y, 0.15], color: s.color, count: s.count, speed: s.speed, life: m.power ? 1.1 : 0.45, size: s.size, seed: 40 + i, dir: [m.hit === 'block' ? -1.5 : 1.5, 0.5, 0] });
    impacts.push({ t: it, m, x, y, s });
  });
  const pw = FIGHT.moves.find((m) => m.power);
  const pwT = impactTime(pw);
  bursts.add({ t0: pw.t, pos: [-0.5, 0.1, 0], color: '#ff3a20', count: 220, speed: 1.2, life: 0.9, size: 0.03, kind: 'ember', seed: 70, spread: 1.4 });
  bursts.add({ t0: pwT, pos: [-0.5, 0.05, 0], color: '#ff5030', count: 260, speed: 5, life: 1.2, size: 0.035, kind: 'ring', seed: 71, gravity: 0 });
  bursts.add({ t0: FIGHT.ko, pos: [3.1, 0.1, 0], color: '#9fe8ff', count: 90, speed: 2.5, life: 0.6, size: 0.03, seed: 72, dir: [0, 1.2, 0] });
  const flashS = glowSprite({ color: '#ffffff', size: 1.0, intensity: 0 });
  scene.add(flashS);
  const wave = shockwave('#ff4a3a');
  wave.position.set(-0.5, 0.01, 0);
  scene.add(wave);
  const aura = glowSprite({ color: '#ff2a14', size: 3.2, intensity: 0 });
  aura.position.set(-0.5, 1.1, -0.1);
  scene.add(aura);
  const cam = camera(30);
  const keys = [
    { t: 0, p: [0, 1.05, 6.4], l: [0, 1.0, 0], fov: 30 },
    { t: 1.35, p: [-0.1, 0.98, 4.6], l: [0.05, 1.05, 0], fov: 30 },
    { t: 1.45, p: [-0.35, 0.95, 3.7], l: [0.15, 1.1, 0], fov: 30, cut: true },
    { t: 2.3, p: [0.1, 0.75, 3.4], l: [0.35, 1.2, 0], fov: 32 },
    { t: 3.4, p: [0.5, 1.05, 4.8], l: [0.6, 0.9, 0], fov: 32 },
    { t: 4.0, p: [0.5, 1.05, 4.8], l: [0.6, 0.9, 0], fov: 32 },
    { t: 4.05, p: [-1.55, 0.75, 3.3], l: [0.1, 0.95, 0], fov: 33, cut: true },
    { t: 5.25, p: [-1.25, 0.8, 3.6], l: [0.2, 0.9, 0], fov: 33 },
    { t: 5.3, p: [0.55, 1.2, 5.6], l: [0.7, 0.85, 0], fov: 32, cut: true },
    { t: 7.1, p: [0.2, 1.0, 4.8], l: [0.3, 0.95, 0], fov: 32 },
    { t: 7.2, p: [-0.35, 0.55, 3.1], l: [-0.2, 1.1, 0], fov: 36, cut: true },
    { t: 8.4, p: [-1.35, 0.6, 3.0], l: [-0.1, 1.2, 0], fov: 36 },
    { t: 9.9, p: [-1.6, 0.9, 4.3], l: [0.8, 0.8, 0], fov: 34 },
    { t: 10.2, p: [-1.6, 0.9, 4.3], l: [0.8, 0.8, 0], fov: 34 },
    { t: 10.25, p: [-0.35, 0.8, 2.9], l: [-0.45, 1.15, 0], fov: 30, cut: true },
    { t: 14.2, p: [-0.4, 0.95, 2.25], l: [-0.45, 1.2, 0], fov: 29 },
  ];
  for (const k of keys) k.p = k.p.map((v, j) => k.l[j] + (v - k.l[j]) * 1.5);
  const state = { flash: 0, shake: 0 };
  return {
    scene, camera: cam,
    update(t) {
      const P = fightPose(t);
      for (const [f, s] of [[p1, P.p1], [p2, P.p2]]) {
        f.pose(s.sheet, s.col, s.row);
        f.object.position.set(s.x, s.y, 0);
        f.uniforms.flash.value = 0;
      }
      // Hit flash, shake and impact glow.
      let shake = 0, fl = 0, glowI = 0, gx = 0, gy = 0;
      for (const im of impacts) {
        const age = t - im.t;
        if (age >= 0 && age < 0.05 && im.m.hit !== 'block') (im.m.who === 'p1' ? p2 : p1).uniforms.flash.value = 0.85;
        if (age >= 0 && age < 0.6) { shake += im.s.shake * Math.exp(-age * 12); }
        if (age >= 0 && age < 0.25) { const k = Math.exp(-age * 14); if (k > glowI) { glowI = k; gx = im.x; gy = im.y; } }
        if (im.m.power && age >= 0) fl = Math.exp(-age * 5) * 0.5;
      }
      // POWER charge and release.
      const charge = smooth(pw.t, pw.t + 0.7, t) * (1 - smooth(pwT + 1.2, pwT + 2.2, t));
      aura.material.uniforms.intensity.value = charge * (0.8 + 0.2 * Math.sin(t * 40)) * 1.4;
      aura.position.x = P.p1.x;
      const wk = clamp((t - pwT) / 1.1);
      wave.scale.setScalar(0.5 + wk * 9);
      wave.material.uniforms.progress.value = wk;
      wave.material.uniforms.intensity.value = t >= pwT ? (1 - wk) * 3 : 0;
      wave.position.x = P.p1.x;
      if (t >= pw.t && t < pwT) shake += 0.006 * smooth(pw.t, pwT, t);
      flashS.position.set(gx, gy, 0.3);
      flashS.material.uniforms.intensity.value = glowI * 4;
      flashS.scale.setScalar(0.6 + glowI * 0.8);
      flashS.lookAt(cam.position);
      aura.lookAt(cam.position);
      coneA.material.uniforms.intensity.value = 0.4 + charge * 0.6;
      coneA.material.uniforms.color.value.set(charge > 0.1 ? '#ff7a5a' : '#ffd8b8');
      p1.uniforms.rimColor.value.set(charge > 0.1 ? '#ff3a20' : '#ffb08a');
      p1.uniforms.rimStrength.value = 2.5 + charge * 4;
      bursts.update(t);
      motes.material.uniforms.time.value = t + 90;
      coneA.material.uniforms.time.value = t; coneB.material.uniforms.time.value = t;
      state.flash = fl; state.shake = shake;
      applyCam(cam, camAt(keys, t), t, { hand: 0.02, shake });
      faceCam(p1, cam); faceCam(p2, cam);
      state.P = P;
    },
    post(t) {
      return { focus: distTo(cam, [0, 1, 0]), aperture: 50, bloom: 0.85 + state.flash * 2, bloomRadius: 0.6, bloomThreshold: 0.6, flash: state.flash * 0.3, fade: 1 - smooth(0, 0.3, t) + smooth(13.8, 14.2, t), exposure: 1.1 };
    },
    hud(g, t) {
      // Health and meter.
      const hudA = smooth(0.3, 0.9, t) * (1 - smooth(10.0, 10.6, t));
      if (hudA > 0) {
        let hp2 = 1, hp1 = 1, meter = 0.2;
        const dmg = { light: 0.07, medium: 0.09, heavy: 0.13, throw: 0.12, power: 0.52, block: 0 };
        for (const m of FIGHT.moves) {
          const it = impactTime(m);
          const k = smooth(it, it + 0.35, t);
          if (m.who === 'p1') { hp2 -= dmg[m.hit] * k; meter += (m.power ? -0.8 : 0.16) * k; }
          else hp1 -= 0.015 * k;
        }
        meter = clamp(meter);
        g.save();
        g.globalAlpha = hudA;
        const bar = (x, w, v, col, dir) => {
          g.fillStyle = 'rgba(255,255,255,0.12)';
          g.fillRect(x, 150, w, 10);
          g.fillStyle = col;
          const vw = w * clamp(v);
          g.fillRect(dir > 0 ? x : x + w - vw, 150, vw, 10);
        };
        bar(170, 640, hp1, '#ff6148', -1);
        bar(1110, 640, hp2, '#4fd6ff', 1);
        g.restore();
        text(g, 'HATAALII', 170, 190, { font: 'Anton', size: 30, align: 'left', alpha: hudA, tracking: 4 });
        text(g, 'OVERCLOCK', 1750, 190, { font: 'Anton', size: 30, align: 'right', alpha: hudA, tracking: 4 });
        text(g, '99', W / 2, 158, { font: 'Anton', size: 44, alpha: hudA * 0.9 });
        // POWER meter.
        g.save();
        g.globalAlpha = hudA;
        g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(170, 925, 360, 6);
        const ready = meter >= 0.35;
        g.fillStyle = ready ? '#ff3a20' : '#ff9a7a';
        g.fillRect(170, 925, 360 * meter, 6);
        g.fillStyle = 'rgba(255,255,255,0.6)'; g.fillRect(170 + 360 * 0.35, 919, 2, 18);
        g.restore();
        text(g, ready ? 'POWER READY' : 'POWER', 170, 900, { font: 'Oswald', weight: 500, size: 20, align: 'left', alpha: hudA * (ready ? 0.7 + 0.3 * Math.sin(t * 12) : 0.7), tracking: 5, color: ready ? '#ff5a3c' : '#ffffff' });
      }
      slam(g, 'ROUND 1', t, 0.35, 0.9, { size: 110, tracking: 10 });
      slam(g, 'FIGHT', t, 1.0, 0.5, { size: 150, color: '#ff4a2a', tracking: 12 });
      // Move callouts, slammed in on each impact.
      const pos = { JAB: [1520, 360], CROSS: [1560, 450], UPPERCUT: [1500, 290], 'BLOCK HIGH': [520, 330], 'BLOCK LOW': [520, 740], THROW: [1540, 380], ROUNDHOUSE: [1500, 330] };
      for (const m of FIGHT.moves) {
        if (m.power) continue;
        const [x, y] = pos[m.name];
        slam(g, m.name, t, impactTime(m), 0.75, { x, y, size: 70, tracking: 4, color: m.hit === 'block' ? '#9fe8ff' : '#ffffff' });
      }
      // Combo counter.
      const hits = FIGHT.moves.slice(0, 3).map(impactTime);
      const n = hits.filter((h) => t >= h).length;
      if (n >= 2 && t < 3.6) {
        const last = hits[n - 1];
        const pop = 1 + Math.exp(-(t - last) * 14) * 0.25;
        text(g, `${n}`, 250, 470, { font: 'Anton', size: 130, align: 'right', color: '#ff4a2a', scale: pop, alpha: 1 - smooth(3.2, 3.6, t) });
        text(g, 'HIT COMBO', 270, 490, { font: 'Oswald', weight: 700, size: 34, align: 'left', tracking: 4, alpha: 1 - smooth(3.2, 3.6, t) });
      }
      cine(g, 'CHAIN EVERY HIT INTO THE NEXT', t, 2.5, 4.0, { font: 'Oswald', weight: 300, size: 30, y: 870, track0: 8, track1: 12 });
      cine(g, 'READ THE HIGH. READ THE LOW. BREAK THE GUARD.', t, 4.3, 6.9, { font: 'Oswald', weight: 300, size: 30, y: 870, track0: 8, track1: 12 });
      slam(g, 'CANCEL', t, impactTime(FIGHT.moves[6]), 0.5, { x: 1500, y: 430, size: 70, tracking: 4 });
      // POWER title card.
      const pa = win(t, pwT - 0.05, pwT + 1.6, 0.05, 0.4);
      if (pa > 0) {
        const s = 1.25 - 0.25 * expoOut((t - pwT) / 0.25);
        text(g, 'SIGNATURE POWER', W / 2, 250, { font: 'Anton', size: 110, color: '#ff3a20', alpha: pa, scale: s, tracking: 10, glow: '#ff2000', glowBlur: 40 });
        text(g, 'CROWN BREAKER', W / 2, 335, { font: 'Oswald', weight: 500, size: 34, alpha: pa * smooth(pwT + 0.15, pwT + 0.4, t), tracking: 18 });
      }
      slam(g, 'K.O.', t, FIGHT.ko, 0.75, { size: 220, tracking: 20, color: '#ffffff', x: 1380, y: 480 });
      cine(g, '7 ATTACKS  ·  1 SIGNATURE POWER', t, 10.8, 14.0, { font: 'Anton', weight: 400, size: 62, y: 820, track0: 6, track1: 12 });
      cine(g, '343 COMBAT ANIMATIONS  ·  THROWS  ·  HIGH / LOW  ·  JUGGLES', t, 11.4, 14.0, { font: 'Oswald', weight: 300, size: 26, y: 885, track0: 6, track1: 9 });
    },
  };
}

// ---------- 6. modes: four monoliths ----------
const MODES = [
  { n: '01', name: ['ARCADE', 'LADDER'], line: ['Eight reflections.', 'Then your shadow.'], detail: 'FULL CIRCLE  ·  48 BEFORE THE SHADOW', color: '#ff5a3c', who: 'pixel' },
  { n: '02', name: ['TOURNA-', 'MENT'], line: ['Eight fighters.', 'One crown.'], detail: 'NEW BRACKET EVERY RUN', color: '#eac35e', who: 'sovereign' },
  { n: '03', name: ['VERSUS'], line: ['Two players.', 'One cabinet.'], detail: 'KEYBOARD  ·  GAMEPAD  ·  TOUCH', color: '#4fd6ff', who: 'aether' },
  { n: '04', name: ['TRAINING'], line: ['Frame data. Trials.', 'Instant reset.'], detail: 'LEARN EVERY CANCEL', color: '#7ee0b4', who: 'student' },
];
function slabTexture(m) {
  const c = document.createElement('canvas');
  c.width = 768; c.height = 1456;
  const g = c.getContext('2d');
  g.textBaseline = 'alphabetic';
  g.fillStyle = m.color;
  g.font = '500 34px "Oswald"'; g.letterSpacing = '10px';
  g.fillText(`MODE ${m.n}`, 70, 150);
  g.fillRect(70, 180, 80, 4);
  g.fillStyle = '#ffffff';
  g.font = '400 150px "Anton"'; g.letterSpacing = '2px';
  m.name.forEach((l, i) => g.fillText(l, 62, 400 + i * 165));
  g.fillStyle = 'rgba(255,255,255,0.85)';
  g.font = '300 50px "Inter"'; g.letterSpacing = '0px';
  const y0 = 400 + m.name.length * 165 + 40;
  m.line.forEach((l, i) => g.fillText(l, 70, y0 + i * 66));
  g.fillStyle = m.color;
  g.font = '500 24px "Oswald"'; g.letterSpacing = '6px';
  g.fillText(m.detail, 70, 1340);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export async function buildModes(ctx) {
  const { scene } = stage({ fog: '#030305', density: 0.045, dome: { top: '#040406', glow: '#0c0a08' }, floorStrength: 1.0, blur: 0.014, scale: ctx.scale });
  const slabMat = new THREE.MeshStandardMaterial({ color: '#0d0d11', metalness: 0.8, roughness: 0.22, envMap: ctx.env, envMapIntensity: 0.9 });
  const fighters = [];
  const cones = [];
  const SP = 3.7;
  for (let i = 0; i < MODES.length; i++) {
    const m = MODES[i];
    const x = i * SP;
    const slab = new THREE.Mesh(new THREE.BoxGeometry(1.9, 3.6, 0.28), slabMat);
    slab.position.set(x, 1.8, -0.6);
    scene.add(slab);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 3.6), new THREE.MeshBasicMaterial({ map: slabTexture(m), transparent: true, color: new THREE.Color(0.95, 0.95, 0.95), depthWrite: false }));
    face.position.set(x, 1.8, -0.455);
    scene.add(face);
    const edge = new THREE.Mesh(new THREE.BoxGeometry(1.92, 0.018, 0.3), new THREE.MeshBasicMaterial({ color: new THREE.Color(m.color).multiplyScalar(4) }));
    edge.position.set(x, 3.61, -0.6);
    scene.add(edge);
    const cone = lightCone({ color: new THREE.Color(m.color).lerp(new THREE.Color('#ffffff'), 0.6), radius: 1.5, height: 6, intensity: 0.18 });
    cone.position.set(x + 0.4, 6.2, 0.6);
    scene.add(cone);
    cones.push(cone);
    const pool = floorGlow({ color: m.color, radius: 1.8, intensity: 0.35 });
    pool.position.set(x + 0.6, 0.004, 0.5);
    scene.add(pool);
    const f = await ctx.fighter(m.who, { height: 1.45 });
    f.object.position.set(x + 1.3, 0, 0.55);
    f.flip = true;
    f.uniforms.rimColor.value.set(m.color);
    f.uniforms.rimStrength.value = 3.2;
    f.uniforms.rimDir.value.set(0.6, 0.8);
    f.phase = i * 0.5;
    scene.add(f.object);
    fighters.push(f);
  }
  fogAll(fighters, '#030305', 0.045);
  const motes = dust({ count: 1800, box: [18, 5, 6], center: [5.5, 2.5, 0], beams: [], size: 14, seed: 17 });
  motes.material.uniforms.ambient.value = 0.1;
  scene.add(motes);
  scene.add(bokehField({ count: 60, center: [6, 3, -14], spread: [40, 7, 4], colors: MODES.map((m) => m.color), intensity: 0.25, seed: 18 }));
  const cam = camera(34);
  return {
    scene, camera: cam,
    update(t) {
      const x = lerp(-1.4, 12.2, easeInOut(clamp(t / 8.4)) * 0.3 + (t / 8.4) * 0.7);
      applyCam(cam, { p: [x, 1.55, 5.6], l: [x + 0.9, 1.7, 0], fov: 34 }, t, { hand: 0.02 });
      fighters.forEach((f) => { f.idle(t + f.phase, 0.8); faceCam(f, cam); });
      cones.forEach((c) => { c.material.uniforms.time.value = t; });
      motes.material.uniforms.time.value = t + 110;
      this.x = x;
    },
    post(t) {
      return { focus: 5.9, aperture: 45, bloom: 0.8, bloomRadius: 0.6, bloomThreshold: 0.65, fade: 1 - smooth(0, 0.35, t) + smooth(8.05, 8.4, t), exposure: 1.1 };
    },
    hud(g, t) {
      cine(g, 'FOUR WAYS TO FIGHT', t, 0.2, 2.2, { font: 'Oswald', weight: 500, size: 26, y: 160, track0: 14, track1: 20, color: '#ffffff', alpha: 0.85 });
    },
  };
}

// ---------- 7. the clash: your toughest opponent ----------
export async function buildClash(ctx) {
  const { scene } = stage({ fog: '#030205', density: 0.05, dome: { top: '#040308', glow: '#12060e' }, floorStrength: 1.1, blur: 0.014, scale: ctx.scale });
  const a = await ctx.fighter('hataalii', { height: 1.75 });
  const b = new Fighter(a.char, a.textures, { height: 1.75 });
  b.flip = true;
  a.uniforms.rimColor.value.set('#ff4a2a'); a.uniforms.rimStrength.value = 3.5; a.uniforms.rimDir.value.set(-0.6, 0.8);
  b.uniforms.tint.value.setRGB(0.3, 0.25, 0.48); b.uniforms.exposure.value = 0.8;
  b.uniforms.rimColor.value.set('#a07cff'); b.uniforms.rimStrength.value = 4.5; b.uniforms.rimDir.value.set(-0.6, 0.8);
  scene.add(a.object, b.object);
  fogAll([a, b], '#030205', 0.05);
  const cA = lightCone({ color: '#ff5a3c', radius: 1.3, height: 5.4, intensity: 0.45 }); cA.position.set(-1.3, 5.4, 0); scene.add(cA);
  const cB = lightCone({ color: '#9a7cff', radius: 1.3, height: 5.4, intensity: 0.45 }); cB.position.set(1.3, 5.4, 0); scene.add(cB);
  const gA = floorGlow({ color: '#ff3a20', radius: 1.6, intensity: 0.5 }); gA.position.set(-1.3, 0.004, 0); scene.add(gA);
  const gB = floorGlow({ color: '#8a5cff', radius: 1.6, intensity: 0.5 }); gB.position.set(1.3, 0.004, 0); scene.add(gB);
  const auraA = glowSprite({ color: '#ff2a14', size: 3, intensity: 0 }); scene.add(auraA);
  const auraB = glowSprite({ color: '#7a4cff', size: 3, intensity: 0 }); scene.add(auraB);
  const core = glowSprite({ color: '#ffffff', size: 2.5, intensity: 0 }); core.position.set(0, 1.2, 0.2); scene.add(core);
  const streak = glowSprite({ color: '#ffd8d0', size: 0.25, intensity: 0, stretch: 60 }); streak.position.set(0, 1.2, 0.25); scene.add(streak);
  const motes = dust({ count: 1600, box: [9, 5, 6], center: [0, 2.5, 0], beams: [[-1.3, 0, 5.4, 1.3, '#ff9a80'], [1.3, 0, 5.4, 1.3, '#b8a0ff']], seed: 19 });
  scene.add(motes);
  const bursts = new Bursts(5000);
  scene.add(bursts.points);
  bursts.add({ t0: 1.9, pos: [-1.3, 0.05, 0], color: '#ff3a20', count: 240, speed: 1.2, life: 1.3, size: 0.03, kind: 'ember', seed: 80, spread: 1.2 });
  bursts.add({ t0: 1.9, pos: [1.3, 0.05, 0], color: '#8a5cff', count: 240, speed: 1.2, life: 1.3, size: 0.03, kind: 'ember', seed: 81, spread: 1.2 });
  bursts.add({ t0: 4.7, pos: [0, 1.2, 0.2], color: '#ff6040', count: 400, speed: 11, life: 1.2, size: 0.045, seed: 82, spread: 1.3 });
  bursts.add({ t0: 4.7, pos: [0, 1.2, 0.2], color: '#9a7cff', count: 400, speed: 11, life: 1.2, size: 0.045, seed: 83, spread: 1.3 });
  bursts.add({ t0: 4.7, pos: [0, 0.05, 0], color: '#ffffff', count: 360, speed: 8, life: 1.3, size: 0.035, kind: 'ring', seed: 84, gravity: 0 });
  const wave = shockwave('#ffd0c8'); scene.add(wave);
  const cam = camera(30);
  const keys = [
    { t: 0, p: [0, 0.75, 5.4], l: [0, 1.0, 0], fov: 30 },
    { t: 4.2, p: [0, 0.55, 3.8], l: [0, 1.1, 0], fov: 32, ease: (x) => x },
    { t: 4.7, p: [0, 0.6, 3.0], l: [0, 1.15, 0], fov: 36, ease: easeIn },
    { t: 6.6, p: [0, 0.7, 2.7], l: [0, 1.15, 0], fov: 36 },
  ];
  const state = {};
  return {
    scene, camera: cam,
    update(t) {
      const pose = (f, flipSign) => {
        let x = 1.3 * flipSign;
        if (t < 1.9) f.idle(t + (flipSign > 0 ? 0.5 : 0), 0.8);
        else if (t < 2.9) f.pose('combat', 0, 6);
        else if (t < 3.3) f.pose('combat', 1, 6);
        else if (t < 4.2) f.pose('combat', 2, 6);
        else {
          f.pose('combat', 2, 1);
          x = lerp(1.3, 0.38, easeIn(clamp((t - 4.2) / 0.5))) * flipSign;
        }
        f.object.position.set(x, 0, 0);
        f.object.visible = t < 4.72;
      };
      pose(a, -1); pose(b, 1);
      const charge = smooth(1.9, 3.3, t) * (t < 4.7 ? 1 : 0);
      [[auraA, a], [auraB, b]].forEach(([s, f]) => {
        s.position.set(f.object.position.x, 1.1, -0.1);
        s.material.uniforms.intensity.value = charge * (1 + 0.25 * Math.sin(t * 37));
        s.lookAt(cam.position);
      });
      const age = t - 4.7;
      core.material.uniforms.intensity.value = age >= 0 ? Math.exp(-age * 2.5) * 10 : 0;
      streak.material.uniforms.intensity.value = age >= 0 ? Math.exp(-age * 1.5) * 6 : 0;
      core.lookAt(cam.position); streak.lookAt(cam.position);
      const wk = clamp(age / 1.4);
      wave.scale.setScalar(0.5 + wk * 14);
      wave.material.uniforms.progress.value = wk;
      wave.material.uniforms.intensity.value = age >= 0 ? (1 - wk) * 4 : 0;
      [cA, cB].forEach((c) => { c.material.uniforms.time.value = t; c.material.uniforms.intensity.value = 0.45 + charge * 0.5 + (t > 3.3 && t < 4.7 ? (Math.floor(t * 24) % 3 === 0 ? 0.3 : 0) : 0); });
      bursts.update(t);
      motes.material.uniforms.time.value = t + 130;
      state.flash = age >= 0 ? Math.max(0, 1 - age / 0.9) : 0;
      const shake = charge * 0.012 * smooth(2.9, 4.2, t) + (age >= 0 ? Math.exp(-age * 3) * 0.08 : 0);
      applyCam(cam, camAt(keys, t), t, { hand: 0.02, shake });
      faceCam(a, cam); faceCam(b, cam);
    },
    post(t) {
      return { focus: distTo(cam, [0, 1, 0]), aperture: 55, bloom: 0.9 + (state.flash ?? 0) * 2, bloomRadius: 0.7, bloomThreshold: 0.55, flash: (state.flash ?? 0) * 0.95, fade: 1 - smooth(0, 0.3, t) + smooth(5.4, 6.4, t), exposure: 1.1 };
    },
    hud(g, t) {
      cine(g, 'YOUR TOUGHEST OPPONENT', t, 0.3, 2.2, { font: 'Oswald', weight: 300, size: 50, y: 850, track0: 12, track1: 20 });
      const a = win(t, 2.4, 4.3, 0.12, 0.3);
      if (a > 0) text(g, 'IS YOU.', W / 2, 860, { font: 'Anton', size: 120, alpha: a, tracking: 16 + (t - 2.4) * 6, scale: 1.08 - 0.08 * expoOut((t - 2.4) / 0.4) });
    },
  };
}

// ---------- 8. end card ----------
export async function buildEnd(ctx) {
  const { scene } = stage({ density: 0.05, dome: { top: '#040406', glow: '#180604' }, floorStrength: 0.9, blur: 0.012, scale: ctx.scale });
  scene.environment = ctx.env;
  const { words, side, vsFront } = await titleWords(ctx, 0.95);
  const Y = 2.35;
  words.forEach((w) => { w.position.set(w.userData.x, Y, 0); scene.add(w); });
  const flare = glowSprite({ color: '#ff3a22', size: 0.25, intensity: 0, stretch: 50 }); flare.position.set(0, Y, -0.5); scene.add(flare);
  const a = await ctx.fighter('hataalii', { height: 1.45 });
  const b = new Fighter(a.char, a.textures, { height: 1.45 });
  b.flip = true;
  a.object.position.set(-3.35, 0, 0.4); b.object.position.set(3.35, 0, 0.4);
  a.uniforms.rimColor.value.set('#ff4a2a'); a.uniforms.rimStrength.value = 3.5;
  b.uniforms.tint.value.setRGB(0.42, 0.36, 0.62); b.uniforms.rimColor.value.set('#a07cff'); b.uniforms.rimStrength.value = 4.5;
  scene.add(a.object, b.object);
  fogAll([a, b], '#020203', 0.05);
  const cA = lightCone({ color: '#ff6a4a', radius: 1.2, height: 5.5, intensity: 0.4 }); cA.position.set(-3.35, 5.5, 0.4); scene.add(cA);
  const cB = lightCone({ color: '#9a7cff', radius: 1.2, height: 5.5, intensity: 0.4 }); cB.position.set(3.35, 5.5, 0.4); scene.add(cB);
  const gA = floorGlow({ color: '#ff3a20', radius: 1.5, intensity: 0.45 }); gA.position.set(-3.35, 0.004, 0.4); scene.add(gA);
  const gB = floorGlow({ color: '#8a5cff', radius: 1.5, intensity: 0.45 }); gB.position.set(3.35, 0.004, 0.4); scene.add(gB);
  const motes = dust({ count: 1400, box: [14, 6, 6], center: [0, 3, 0], beams: [[-3.35, 0.4, 5.5, 1.2, '#ff9a80'], [3.35, 0.4, 5.5, 1.2, '#b8a0ff']], seed: 20 });
  motes.material.uniforms.ambient.value = 0.08;
  scene.add(motes);
  scene.add(bokehField({ count: 50, center: [0, 3, -20], spread: [36, 8, 4], colors: ['#ff3a22', '#ff8a4a', '#6a5cff'], intensity: 0.2, seed: 21 }));
  const cam = camera(32);
  const keys = [
    { t: 0, p: [0, 1.75, 9.4], l: [0, 1.75, 0], fov: 32 },
    { t: 8.6, p: [0, 1.75, 8.6], l: [0, 1.75, 0], fov: 32, ease: (x) => x },
  ];
  return {
    scene, camera: cam,
    update(t) {
      const hit = 0.6;
      words.forEach((w, i) => {
        const k = expoOut(clamp((t - 0.15 - i * 0.07) / 0.45));
        w.position.z = lerp(-6, 0, k);
        w.scale.setScalar(t > hit ? 1 + Math.exp(-(t - hit) * 9) * 0.04 : 1);
      });
      scene.environmentRotation.set(0, lerp(-1.2, 1.3, smooth(0.4, 7, t)), 0);
      side.emissiveIntensity = 0.3 + (t > hit ? Math.exp(-(t - hit) * 2.5) * 2 : 0);
      vsFront.emissiveIntensity = 0.3 + 0.1 * Math.sin(t * 3);
      flare.material.uniforms.intensity.value = t > hit ? 0.5 + Math.exp(-(t - hit) * 1.2) * 3 : 0;
      flare.lookAt(cam.position);
      a.idle(t, 0.8); b.idle(t + 0.4, 0.8);
      [cA, cB].forEach((c) => { c.material.uniforms.time.value = t; });
      motes.material.uniforms.time.value = t + 150;
      applyCam(cam, camAt(keys, t), t, { hand: 0.01 });
      faceCam(a, cam); faceCam(b, cam);
    },
    post(t) {
      const flash = t > 0.6 ? Math.exp(-(t - 0.6) * 9) * 0.3 : 0;
      return { focus: 9, aperture: 40, bloom: 0.9, bloomRadius: 0.7, bloomThreshold: 0.6, flash, fade: 1 - smooth(0, 0.4, t) + smooth(7.6, 8.5, t), exposure: 1.1 };
    },
    hud(g, t) {
      cine(g, 'THE MIRROR TOURNAMENT', t, 1.0, 8.6, { font: 'Oswald', weight: 500, size: 30, y: 575, track0: 26, track1: 20, fin: 0.8, fout: 0.01 });
      cine(g, '49 FIGHTERS   ·   ARCADE   ·   TOURNAMENT   ·   VERSUS   ·   TRAINING', t, 1.6, 8.6, { font: 'Inter', weight: 300, size: 19, y: 632, track0: 5, track1: 5, alpha: 0.75, fout: 0.01 });
      cine(g, 'PLAY NOW IN YOUR BROWSER', t, 2.4, 8.6, { font: 'Anton', size: 50, y: 770, track0: 10, track1: 13, fout: 0.01 });
      cine(g, 'me-vs-me-three.vercel.app', t, 2.8, 8.6, { font: 'Inter', weight: 500, size: 26, y: 830, track0: 2, track1: 3, color: '#ff6148', fout: 0.01 });
      cine(g, 'KEYBOARD  ·  GAMEPAD  ·  TOUCH  ·  INSTALLS AS AN APP', t, 3.2, 8.6, { font: 'Oswald', weight: 300, size: 18, y: 880, track0: 6, track1: 7, alpha: 0.6, fout: 0.01 });
    },
  };
}
