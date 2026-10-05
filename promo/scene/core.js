// Rendering core for the promo: renderer, post chain, shared materials and helpers.
// Everything is a pure function of time so frames can be rendered in any order.
import * as THREE from 'three';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { TTFLoader } from 'three/addons/loaders/TTFLoader.js';
import { Font } from 'three/addons/loaders/FontLoader.js';
import metrics from './body-metrics.json' with { type: 'json' };
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';

export { THREE };

// ---------- math ----------
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOut = (t) => 1 - Math.pow(1 - clamp(t), 3);
export const easeIn = (t) => Math.pow(clamp(t), 3);
export const expoOut = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * clamp(t)));
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// Smooth pseudo-noise for handheld camera drift.
export const wobble = (t, seed = 0) =>
  Math.sin(t * 1.3 + seed) * 0.5 + Math.sin(t * 2.7 + seed * 1.7) * 0.3 + Math.sin(t * 5.1 + seed * 3.1) * 0.2;

// Keyframes: [[time, ...values]], eased between neighbours. A key with `cut: true` jumps.
export function track(keys, t) {
  if (t <= keys[0][0]) return keys[0].slice(1);
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], b = keys[i + 1];
    if (t < b[0]) {
      const k = easeInOut((t - a[0]) / (b[0] - a[0]));
      return a.slice(1).map((v, j) => lerp(v, b[j + 1], k));
    }
  }
  return keys[keys.length - 1].slice(1);
}

// ---------- assets ----------
const loader = new THREE.TextureLoader();
const texCache = new Map();
export function tex(url, { pixel = false } = {}) {
  const key = url + pixel;
  if (!texCache.has(key)) {
    texCache.set(key, new Promise((resolve, reject) => loader.load(url, (t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      if (pixel) { t.magFilter = THREE.NearestFilter; t.minFilter = THREE.LinearMipmapLinearFilter; }
      resolve(t);
    }, undefined, reject)));
  }
  return texCache.get(key);
}

let fontPromise;
export function displayFont() {
  fontPromise ??= new Promise((resolve, reject) =>
    new TTFLoader().load('/fonts/anton/files/anton-latin-400-normal.woff', (json) => resolve(new Font(json)), undefined, reject));
  return fontPromise;
}
export async function textMesh(text, { size = 1, depth = 0.25, bevel = 0.02, front, side }) {
  const font = await displayFont();
  const geo = new TextGeometry(text, {
    font, size, depth, curveSegments: 10,
    bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 4,
  });
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  geo.translate(-(bb.max.x + bb.min.x) / 2, -(bb.max.y + bb.min.y) / 2, -(bb.max.z + bb.min.z) / 2);
  return new THREE.Mesh(geo, [front, side]);
}

export async function loadFonts() {
  const faces = [
    ['Anton', 'anton/files/anton-latin-400-normal.woff2', '400'],
    ['Oswald', 'oswald/files/oswald-latin-300-normal.woff2', '300'],
    ['Oswald', 'oswald/files/oswald-latin-500-normal.woff2', '500'],
    ['Oswald', 'oswald/files/oswald-latin-700-normal.woff2', '700'],
    ['Inter', 'inter/files/inter-latin-300-normal.woff2', '300'],
    ['Inter', 'inter/files/inter-latin-500-normal.woff2', '500'],
    ['Inter', 'inter/files/inter-latin-700-normal.woff2', '700'],
  ];
  await Promise.all(faces.map(async ([family, file, weight]) => {
    const f = new FontFace(family, `url(/fonts/${file})`, { weight });
    await f.load();
    document.fonts.add(f);
  }));
}

// ---------- environment map (code-built studio: soft boxes and coloured strips) ----------
export function studioEnv(renderer, { key = 6, warm = [1.0, 0.25, 0.18], cool = [0.3, 0.45, 1.0] } = {}) {
  const s = new THREE.Scene();
  s.background = new THREE.Color(0x000000);
  const box = (w, h, d, color, x, y, z, ry = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ color }));
    m.position.set(x, y, z); m.rotation.y = ry; s.add(m);
  };
  const c = (rgb, k) => new THREE.Color(rgb[0] * k, rgb[1] * k, rgb[2] * k);
  box(14, 0.3, 3, c([1, 0.97, 0.92], key), 0, 7, 0);          // overhead soft box
  box(0.4, 6, 10, c(warm, key * 0.9), -9, 1, 0);              // warm side strip
  box(0.4, 6, 10, c(cool, key * 0.7), 9, 1, 0);               // cool side strip
  box(10, 0.15, 0.15, c([1, 1, 1], key * 2.5), 0, 2.5, -9);    // thin back kicker
  box(3, 3, 0.2, c([1, 0.9, 0.8], key * 0.6), 4, 3, 9);        // front fill
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(s, 0.02);
  pm.dispose();
  return rt.texture;
}

// ---------- fighter sprites ----------
// Atlas layouts from src/characters.js: sheet 16×1 ready loop, combat 4×7, motion 4×6; 320px cells, ground at y=296.
const SHEETS = { sheet: [16, 1], combat: [4, 7], motion: [4, 6] };
const IDLE = [0, 12, 13, 14, 15, 14, 13, 12];
const spriteGeo = new THREE.PlaneGeometry(1, 1).translate(0, 0.5 - 24 / 320, 0);

const spriteVert = /* glsl */`
varying vec2 vUv; varying vec3 vView; varying vec3 vWorld;
void main() {
  vUv = uv;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vec4 mv = viewMatrix * w;
  vView = mv.xyz;
  gl_Position = projectionMatrix * mv;
}`;
const spriteFrag = /* glsl */`
uniform sampler2D map; uniform vec4 rect; uniform float flipX; uniform vec2 texel;
uniform vec3 tint; uniform float exposure; uniform vec3 rimColor; uniform float rimStrength; uniform vec2 rimDir;
uniform float flash; uniform float silhouette; uniform float opacity; uniform vec3 fogColor; uniform float fogDensity;
uniform float reflection; uniform vec3 flashColor;
varying vec2 vUv; varying vec3 vView; varying vec3 vWorld;
void main() {
  vec2 cu = vec2(mix(vUv.x, 1.0 - vUv.x, flipX), vUv.y);
  vec2 uv = rect.xy + cu * rect.zw;
  vec4 c = texture2D(map, uv);
  if (c.a < 0.5) discard;
  vec2 rd = vec2(rimDir.x * (1.0 - 2.0 * flipX), rimDir.y) * texel;
  float edge = 0.0;
  edge += 1.0 - texture2D(map, uv + rd * 1.0).a;
  edge += 1.0 - texture2D(map, uv + rd * 2.0).a;
  edge *= 0.5;
  vec3 col = c.rgb * tint * exposure;
  col = mix(col, col * 0.02, silhouette);
  col = mix(col, rimColor * rimStrength * 0.35, clamp(edge * 0.75, 0.0, 1.0) * clamp(rimStrength * 0.3, 0.0, 1.0));
  col = mix(col, flashColor, flash);
  float d = length(vView);
  float f = 1.0 - exp(-fogDensity * fogDensity * d * d);
  col = mix(col, fogColor, f);
  gl_FragColor = vec4(col, opacity);
}`;

export class Fighter {
  constructor(char, textures, { height = 1.8 } = {}) {
    this.char = char;
    this.textures = textures; // { sheet, combat, motion }
    this.height = height;
    this.uniforms = {
      map: { value: textures.sheet },
      rect: { value: new THREE.Vector4(0, 0, 1 / 16, 1) },
      flipX: { value: 0 },
      texel: { value: new THREE.Vector2(1 / 5120, 1 / 320) },
      tint: { value: new THREE.Color(1, 1, 1) },
      exposure: { value: 1 },
      rimColor: { value: new THREE.Color(char.color) },
      rimStrength: { value: 2.5 },
      rimDir: { value: new THREE.Vector2(-1, 0.3) },
      flash: { value: 0 },
      flashColor: { value: new THREE.Color(1, 1, 1) },
      silhouette: { value: 0 },
      opacity: { value: 1 },
      fogColor: { value: new THREE.Color(0, 0, 0) },
      fogDensity: { value: 0 },
      reflection: { value: 0 },
    };
    this.material = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: spriteVert, fragmentShader: spriteFrag });
    this.mesh = new THREE.Mesh(spriteGeo, this.material);
    this.object = new THREE.Group();
    this.object.add(this.mesh);
    this.pose('sheet', 0, 0);
  }
  pose(sheet, col, row) {
    const [cols, rows] = SHEETS[sheet];
    const t = this.textures[sheet];
    const u = this.uniforms;
    u.map.value = t;
    u.rect.value.set(col / cols, 1 - (row + 1) / rows, 1 / cols, 1 / rows);
    u.texel.value.set(1 / (cols * 320), 1 / (rows * 320));
    const body = metrics[this.char.id]?.[sheet] || (sheet === 'motion' ? this.char.motionBodyHeight : this.char.bodyHeight);
    const cell = this.height * 320 / body;
    this.mesh.scale.set(cell, cell, 1);
    return this;
  }
  // The ready sheet is a jab loop; its stance frames make a calm breathing idle.
  idle(t, speed = 1) { return this.pose('sheet', IDLE[Math.floor(t * speed / 0.13) % IDLE.length], 0); }
  set flip(v) { this.uniforms.flipX.value = v ? 1 : 0; }
}

export async function loadFighter(char, opts) {
  const [sheet, combat, motion] = await Promise.all([
    tex(char.sheet, { pixel: true }), tex(char.combatSheet, { pixel: true }), tex(char.motionSheet, { pixel: true }),
  ]);
  return new Fighter(char, { sheet, combat, motion }, opts);
}

// ---------- wet reflective floor ----------
const floorShader = {
  name: 'WetFloor',
  uniforms: {
    color: { value: null },
    tDiffuse: { value: null },
    textureMatrix: { value: null },
    strength: { value: 0.8 },
    blur: { value: 0.02 },
    base: { value: new THREE.Color(0.006, 0.006, 0.008) },
    fogColor: { value: new THREE.Color(0, 0, 0) },
    fogDensity: { value: 0.05 },
    tint: { value: new THREE.Color(1, 1, 1) },
  },
  vertexShader: /* glsl */`
    uniform mat4 textureMatrix;
    varying vec4 vUv; varying vec3 vWorld;
    void main() {
      vUv = textureMatrix * vec4(position, 1.0);
      vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float strength; uniform float blur; uniform vec3 base; uniform vec3 tint;
    uniform vec3 fogColor; uniform float fogDensity;
    varying vec4 vUv; varying vec3 vWorld;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p) {
      vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
    }
    float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
    void main() {
      float n = fbm(vWorld.xz * 0.55);
      float puddle = smoothstep(0.42, 0.62, n);
      float r = mix(blur, blur * 0.12, puddle);
      vec3 acc = vec3(0.0);
      for (int i = 0; i < 14; i++) {
        float fi = float(i);
        float rad = sqrt((fi + 0.5) / 14.0) * r;
        float a = fi * 2.39996;
        vec2 o = vec2(cos(a) * 0.45, sin(a) * 1.6) * rad * vUv.w;
        acc += texture2DProj(tDiffuse, vUv + vec4(o, 0.0, 0.0)).rgb;
      }
      vec3 refl = acc / 14.0;
      vec3 V = normalize(cameraPosition - vWorld);
      float fres = 0.3 + 0.7 * pow(1.0 - clamp(V.y, 0.0, 1.0), 3.0);
      float micro = fbm(vWorld.xz * 9.0) * 0.5 + 0.5;
      vec3 col = base * (0.6 + 0.8 * micro) + refl * strength * mix(0.35, 1.0, puddle) * fres * tint;
      float d = length(cameraPosition - vWorld);
      col = mix(col, fogColor, 1.0 - exp(-fogDensity * fogDensity * d * d));
      gl_FragColor = vec4(col, 1.0);
    }`,
};
export function wetFloor(size = 60, scale = 1) {
  const r = new Reflector(new THREE.PlaneGeometry(size, size), {
    textureWidth: Math.round(960 * scale), textureHeight: Math.round(540 * scale), clipBias: 0.002, shader: floorShader,
  });
  r.rotation.x = -Math.PI / 2;
  return r;
}

// ---------- volumetric light cone ----------
export function lightCone({ color = '#ffffff', radius = 1.2, height = 6, intensity = 0.4 } = {}) {
  const geo = new THREE.ConeGeometry(radius, height, 64, 1, true);
  geo.translate(0, -height / 2, 0); // apex at origin, opening downward
  const mat = new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(color) }, intensity: { value: intensity }, time: { value: 0 }, height: { value: height } },
    vertexShader: /* glsl */`
      varying vec3 vN; varying vec3 vWorld; varying float vH; varying vec3 vLocal;
      uniform float height;
      void main() {
        vH = -position.y / height;
        vLocal = position;
        vN = normalize(mat3(modelMatrix) * normal);
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 color; uniform float intensity; uniform float time;
      varying vec3 vN; varying vec3 vWorld; varying float vH; varying vec3 vLocal;
      void main() {
        vec3 V = normalize(cameraPosition - vWorld);
        float e = abs(dot(normalize(vN), V));
        e = pow(e, 2.2);
        float fall = pow(1.0 - vH, 1.4) * smoothstep(0.0, 0.08, vH);
        float ang = atan(vLocal.z, vLocal.x);
        float streak = 0.75 + 0.25 * sin(ang * 13.0 + time * 0.4) * sin(ang * 7.0 - time * 0.3 + vH * 3.0);
        gl_FragColor = vec4(color * intensity * e * fall * streak * 0.5, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = 5;
  return m;
}

// Soft additive pool of light on the floor.
export function floorGlow({ color = '#ffffff', radius = 1.5, intensity = 0.6 } = {}) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(color) }, intensity: { value: intensity } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: /* glsl */`
      uniform vec3 color; uniform float intensity; varying vec2 vUv;
      void main(){ float d = length(vUv - 0.5) * 2.0; float a = exp(-d * d * 4.0) * (1.0 - smoothstep(0.85, 1.0, d));
        gl_FragColor = vec4(color * a * intensity, 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2), mat);
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.004;
  return m;
}

// Billboarded soft glow / anamorphic streak.
export function glowSprite({ color = '#ffffff', size = 1, intensity = 1, stretch = 1 } = {}) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(color) }, intensity: { value: intensity }, stretch: { value: stretch } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: /* glsl */`
      uniform vec3 color; uniform float intensity; uniform float stretch; varying vec2 vUv;
      void main(){ vec2 p = (vUv - 0.5) * 2.0; p.x /= stretch;
        float core = exp(-dot(p, p) * 9.0);
        float halo = exp(-length(p) * 3.5) * 0.35;
        float a = (core + halo) * (1.0 - smoothstep(0.8, 1.0, length(vUv - 0.5) * 2.0 / max(stretch, 1.0)));
        gl_FragColor = vec4(color * a * intensity, 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const s = new THREE.Mesh(new THREE.PlaneGeometry(size * stretch, size), mat);
  s.renderOrder = 10;
  return s;
}

// ---------- floating dust, lit where it crosses beams ----------
export function dust({ count = 1600, box = [12, 5, 12], center = [0, 2.5, 0], seed = 1, beams = [], size = 18, brightness = 1 } = {}) {
  const r = rng(seed);
  const pos = new Float32Array(count * 3), rnd = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (r() - 0.5) * box[0] + center[0];
    pos[i * 3 + 1] = (r() - 0.5) * box[1] + center[1];
    pos[i * 3 + 2] = (r() - 0.5) * box[2] + center[2];
    rnd[i * 4] = r(); rnd[i * 4 + 1] = r(); rnd[i * 4 + 2] = r(); rnd[i * 4 + 3] = r();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('rnd', new THREE.BufferAttribute(rnd, 4));
  const beamArr = Array.from({ length: 4 }, (_, i) => beams[i] ? new THREE.Vector4(...beams[i]) : new THREE.Vector4(0, 0, 0, 0));
  const beamCol = Array.from({ length: 4 }, (_, i) => new THREE.Color(beams[i]?.[4] ?? '#ffffff'));
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 }, size: { value: size }, brightness: { value: brightness },
      boxY: { value: new THREE.Vector2(center[1] - box[1] / 2, box[1]) },
      beams: { value: beamArr }, beamCol: { value: beamCol }, ambient: { value: 0.05 },
    },
    vertexShader: /* glsl */`
      attribute vec4 rnd; uniform float time; uniform float size; uniform vec2 boxY;
      uniform vec4 beams[4]; uniform vec3 beamCol[4]; uniform float ambient;
      varying vec3 vCol; varying float vA;
      void main() {
        vec3 p = position;
        p.x += sin(time * (0.15 + rnd.x * 0.3) + rnd.y * 6.28) * 0.35;
        p.z += cos(time * (0.12 + rnd.z * 0.25) + rnd.w * 6.28) * 0.35;
        p.y = boxY.x + mod(p.y - boxY.x + time * (0.03 + rnd.y * 0.06), boxY.y);
        vec3 light = vec3(ambient);
        for (int i = 0; i < 4; i++) {
          vec4 b = beams[i]; // x, z, apexY, radius at floor
          if (b.w <= 0.0) continue;
          float rr = b.w * clamp((b.z - p.y) / b.z, 0.0, 1.0);
          float d = length(p.xz - b.xy);
          light += beamCol[i] * (1.0 - smoothstep(rr * 0.6, rr * 1.05, d)) * 1.6;
        }
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float twinkle = 0.6 + 0.4 * sin(time * (1.0 + rnd.x * 2.0) + rnd.z * 20.0);
        vCol = light * twinkle;
        float s = size * (0.4 + rnd.w) / -mv.z;
        vA = clamp(1.0 / max(s * 0.08, 1.0), 0.15, 1.0);
        gl_PointSize = max(s, 1.5);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform float brightness; varying vec3 vCol; varying float vA;
      void main() { float d = length(gl_PointCoord - 0.5) * 2.0; float a = smoothstep(1.0, 0.2, d);
        gl_FragColor = vec4(vCol * a * vA * brightness, 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 6;
  return pts;
}

// Out-of-focus background lights (pre-blurred discs).
export function bokehField({ count = 60, seed = 3, center = [0, 3, -14], spread = [26, 7, 6], colors = ['#ff5a3c', '#4fd6ff', '#ffc27a'], size = [0.3, 1.1], intensity = 0.35 } = {}) {
  const r = rng(seed);
  const group = new THREE.Group();
  const geo = new THREE.PlaneGeometry(1, 1);
  const mat = new THREE.ShaderMaterial({
    uniforms: { intensity: { value: intensity } },
    vertexShader: /* glsl */`
      attribute vec3 icolor; varying vec3 vCol; varying vec2 vUv;
      void main(){ vUv = uv; vCol = icolor;
        vec4 mv = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float s = length(instanceMatrix[0].xyz);
        mv.xy += position.xy * s;
        gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */`
      uniform float intensity; varying vec3 vCol; varying vec2 vUv;
      void main(){ vec2 p = (vUv - 0.5) * 2.0;
        float ang = atan(p.y, p.x); float hex = cos(3.14159 / 6.0) / cos(mod(ang, 1.0472) - 0.5236);
        float d = length(p) / hex;
        float a = smoothstep(1.0, 0.86, d) * (0.55 + 0.45 * smoothstep(0.3, 0.95, d));
        gl_FragColor = vec4(vCol * a * intensity, 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const inst = new THREE.InstancedMesh(geo, mat, count);
  const cols = new Float32Array(count * 3);
  const m = new THREE.Matrix4();
  for (let i = 0; i < count; i++) {
    const s = lerp(size[0], size[1], r());
    m.makeScale(s, s, s);
    m.setPosition(center[0] + (r() - 0.5) * spread[0], center[1] + (r() - 0.5) * spread[1], center[2] + (r() - 0.5) * spread[2]);
    inst.setMatrixAt(i, m);
    const c = new THREE.Color(colors[Math.floor(r() * colors.length)]).multiplyScalar(0.4 + r() * 0.8);
    cols.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('icolor', new THREE.InstancedBufferAttribute(cols, 3));
  inst.frustumCulled = false;
  group.add(inst);
  group.material = mat;
  return group;
}

// Background haze dome.
export function hazeDome({ top = '#05060a', bottom = '#000000', glow = '#1a0c10', glowDir = [0, 0.1, -1] } = {}) {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      top: { value: new THREE.Color(top) }, bottom: { value: new THREE.Color(bottom) },
      glow: { value: new THREE.Color(glow) }, glowDir: { value: new THREE.Vector3(...glowDir).normalize() },
    },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: /* glsl */`
      uniform vec3 top, bottom, glow, glowDir; varying vec3 vDir;
      void main(){ vec3 d = normalize(vDir); float h = d.y * 0.5 + 0.5;
        vec3 c = mix(bottom, top, smoothstep(0.35, 0.9, h));
        c += glow * pow(max(dot(d, glowDir), 0.0), 6.0);
        gl_FragColor = vec4(c, 1.0); }`,
    side: THREE.BackSide, depthWrite: false,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(200, 32, 16), mat);
  m.renderOrder = -10;
  return m;
}

// ---------- particle bursts (sparks, embers) evaluated analytically ----------
export class Bursts {
  constructor(max = 4000) {
    this.max = max;
    this.list = [];
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    g.setAttribute('psize', new THREE.BufferAttribute(this.size, 1));
    this.geo = g;
    const mat = new THREE.ShaderMaterial({
      vertexShader: /* glsl */`
        attribute vec3 color; attribute float psize; varying vec3 vCol;
        void main(){ vCol = color; vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = psize * 300.0 / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */`
        varying vec3 vCol;
        void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; float a = exp(-d * d * 5.0);
          gl_FragColor = vec4(vCol * a, 1.0); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 20;
  }
  // kind: 'spark' radial fast streaky, 'ember' rising slow, 'ring' horizontal ring
  add({ t0, pos, color = '#ffffff', count = 80, speed = 4, life = 0.4, size = 0.05, kind = 'spark', seed = 1, dir = [0, 0, 0], spread = 1, gravity = -4, trail = 3 }) {
    const r = rng(seed);
    const parts = [];
    for (let i = 0; i < count; i++) {
      let v;
      if (kind === 'ring') {
        const a = r() * Math.PI * 2;
        v = [Math.cos(a), (r() - 0.5) * 0.08, Math.sin(a) * 0.6];
      } else if (kind === 'ember') {
        v = [(r() - 0.5) * spread, 0.6 + r() * 0.8, (r() - 0.5) * spread * 0.6];
      } else {
        const u = r() * 2 - 1, a = r() * Math.PI * 2, s = Math.sqrt(1 - u * u);
        v = [s * Math.cos(a) * spread + dir[0], u * spread + dir[1], s * Math.sin(a) * spread * 0.5 + dir[2]];
      }
      const sp = speed * (0.3 + r() * 0.9);
      parts.push({ v: v.map((x) => x * sp), life: life * (0.5 + r() * 0.8), size: size * (0.5 + r()), off: kind === 'ember' ? [(r() - 0.5) * spread, r() * 0.4, (r() - 0.5) * spread * 0.4] : [0, 0, 0], delay: kind === 'ember' ? r() * life : 0 });
    }
    this.list.push({ t0, pos, color: new THREE.Color(color), parts, kind, gravity, trail });
  }
  update(t) {
    let n = 0;
    const hot = new THREE.Color(1, 0.95, 0.85);
    for (const b of this.list) {
      for (const p of b.parts) {
        const age = t - b.t0 - p.delay;
        if (age < 0 || age > p.life) continue;
        const k = age / p.life;
        // Streaks: draw a short trail of points behind each spark.
        const steps = b.kind === 'spark' ? b.trail : 1;
        for (let s = 0; s < steps && n < this.max; s++) {
          const a = Math.max(0, age - s * 0.012);
          const drag = b.kind === 'spark' ? (1 - Math.exp(-a * 5)) / 5 : a;
          const x = b.pos[0] + p.off[0] + p.v[0] * drag;
          const y = b.pos[1] + p.off[1] + p.v[1] * drag + 0.5 * b.gravity * a * a * (b.kind === 'ember' ? -0.05 : 1);
          const z = b.pos[2] + p.off[2] + p.v[2] * drag;
          this.pos.set([x, y, z], n * 3);
          const fade = (1 - k) * (1 - k) * (1 - s / steps);
          const c = b.color.clone().lerp(hot, Math.max(0, 1 - k * 3) * 0.7).multiplyScalar(fade * (b.kind === 'ember' ? 2 : 3));
          this.col.set([c.r, c.g, c.b], n * 3);
          this.size[n] = p.size * (b.kind === 'ember' ? 1 : (1 - k * 0.5));
          n++;
        }
      }
    }
    this.geo.setDrawRange(0, n);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
    this.geo.attributes.psize.needsUpdate = true;
  }
}

// Expanding shockwave ring on the floor.
export function shockwave(color = '#ff4a3a') {
  const mat = new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(color) }, progress: { value: 0 }, intensity: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: /* glsl */`
      uniform vec3 color; uniform float progress; uniform float intensity; varying vec2 vUv;
      void main(){ float d = length(vUv - 0.5) * 2.0; float w = 0.04 + 0.1 * progress;
        float ring = exp(-pow((d - progress) / w, 2.0));
        float inner = smoothstep(progress, 0.0, d) * 0.15 * (1.0 - progress);
        gl_FragColor = vec4(color * (ring + inner) * intensity, 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.01;
  m.renderOrder = 8;
  return m;
}

// ---------- post chain ----------
const fsVert = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const dofFrag = /* glsl */`
#include <packing>
uniform sampler2D tColor; uniform sampler2D tDepth; uniform float cameraNear; uniform float cameraFar;
uniform float focus; uniform float aperture; uniform float maxBlur; uniform vec2 res;
varying vec2 vUv;
float viewZ(vec2 uv) { return -perspectiveDepthToViewZ(texture2D(tDepth, uv).x, cameraNear, cameraFar); }
float coc(float z) { return clamp(abs(1.0 / focus - 1.0 / z) * aperture, 0.0, maxBlur); }
void main() {
  float z = viewZ(vUv);
  float c = coc(z);
  vec3 acc = texture2D(tColor, vUv).rgb; float wsum = 1.0;
  if (c > 0.6) {
    for (int i = 0; i < 28; i++) {
      float fi = float(i);
      float r = sqrt((fi + 0.5) / 28.0) * c;
      float a = fi * 2.39996;
      vec2 o = vec2(cos(a), sin(a)) * r / res;
      vec2 suv = vUv + o;
      float sz = viewZ(suv);
      float sc = coc(sz);
      // Sharp foreground/in-focus samples must not leak onto a blurred background.
      float w = sz < z ? smoothstep(r - 1.0, r + 1.0, sc) : 1.0;
      vec3 s = texture2D(tColor, suv).rgb;
      w *= 1.0 + dot(s, vec3(0.3)) * 0.6; // bright highlights bloom into discs
      acc += s * w; wsum += w;
    }
  }
  gl_FragColor = vec4(acc / wsum, 1.0);
}`;
const finalFrag = /* glsl */`
uniform sampler2D tColor; uniform sampler2D tHud; uniform float time; uniform float exposure; uniform float fade;
uniform float flash; uniform float grain; uniform float vignette; uniform float ca; uniform float bar; uniform float saturation;
uniform vec3 shadowTint; uniform vec3 highTint; uniform vec2 res; uniform float contrast;
varying vec2 vUv;
vec3 aces(vec3 x) { const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14; return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0); }
float hash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
void main() {
  vec2 d = vUv - 0.5;
  float r2 = dot(d, d);
  vec3 col;
  col.r = texture2D(tColor, vUv - d * ca * r2 * 2.0).r;
  col.g = texture2D(tColor, vUv).g;
  col.b = texture2D(tColor, vUv + d * ca * r2 * 2.0).b;
  col *= exposure;
  col = aces(col);
  col = toSRGB(col);
  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(lum), col, saturation);
  col += shadowTint * pow(1.0 - lum, 3.0) * 0.06 + highTint * pow(lum, 2.0) * 0.06;
  col = (col - 0.5) * contrast + 0.5;
  float v = smoothstep(1.25, 0.25, length(d * vec2(1.25, 1.0)) * 1.25);
  col *= mix(1.0, v, vignette);
  vec4 h = texture2D(tHud, vUv);
  col = col * (1.0 - h.a) + h.rgb * h.a;
  col = mix(col, vec3(1.0), flash);
  col *= 1.0 - fade;
  float g = hash(vUv * res + fract(time * 13.7) * 1000.0) - 0.5;
  col += g * grain * (1.0 - 0.6 * lum);
  if (abs(vUv.y - 0.5) > 0.5 - bar) col = vec3(0.0);
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

export class Post {
  constructor(renderer, w, h) {
    this.renderer = renderer;
    const depth = new THREE.DepthTexture(w, h);
    depth.type = THREE.UnsignedIntType;
    this.rtScene = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthTexture: depth, samples: 0 });
    this.rtDof = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType });
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.8, 0.6, 0.85);
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const quad = (frag, uniforms) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ vertexShader: fsVert, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false }));
      const s = new THREE.Scene(); s.add(m); return { scene: s, u: uniforms };
    };
    this.dof = quad(dofFrag, {
      tColor: { value: this.rtScene.texture }, tDepth: { value: depth }, cameraNear: { value: 0.1 }, cameraFar: { value: 300 },
      focus: { value: 5 }, aperture: { value: 0 }, maxBlur: { value: 14 }, res: { value: new THREE.Vector2(w, h) },
    });
    this.final = quad(finalFrag, {
      tColor: { value: this.rtDof.texture }, tHud: { value: null }, time: { value: 0 }, exposure: { value: 1 }, fade: { value: 0 },
      flash: { value: 0 }, grain: { value: 0.05 }, vignette: { value: 0.75 }, ca: { value: 0.012 }, bar: { value: 0.1 },
      saturation: { value: 1 }, shadowTint: { value: new THREE.Color(0.0, 0.35, 0.45) }, highTint: { value: new THREE.Color(0.5, 0.3, 0.1) },
      res: { value: new THREE.Vector2(w, h) }, contrast: { value: 1.05 },
    });
  }
  render(scene, camera, settings) {
    const r = this.renderer;
    const f = this.final.u, d = this.dof.u;
    d.cameraNear.value = camera.near; d.cameraFar.value = camera.far;
    d.focus.value = settings.focus ?? 5;
    d.aperture.value = settings.aperture ?? 0;
    this.bloom.strength = (settings.bloom ?? 0.8) * 0.55;
    this.bloom.radius = settings.bloomRadius ?? 0.6;
    this.bloom.threshold = Math.max(settings.bloomThreshold ?? 0.85, 0.9);
    for (const k of ['exposure', 'fade', 'flash', 'grain', 'vignette', 'ca', 'bar', 'saturation', 'contrast']) if (settings[k] !== undefined) f[k].value = settings[k];
    f.time.value = settings.time;
    r.setRenderTarget(this.rtScene);
    r.clear();
    r.render(scene, camera);
    r.setRenderTarget(this.rtDof);
    r.render(this.dof.scene, this.quadCam);
    this.bloom.render(r, null, this.rtDof, 0, false);
    r.setRenderTarget(null);
    r.render(this.final.scene, this.quadCam);
  }
}
