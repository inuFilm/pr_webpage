// VRM Pose Ref 本体: レンダリング、ハンドル操作(IK/FK)、UI、保存
import * as THREE from 'three';
import { OrbitControls } from '../vendor/controls/OrbitControls.js';
import { Character, Prop, loadAsset, BONE_PARENT, HAND_POSES } from './character.js';
import { idb, hashBuffer } from './store.js';
import { aimBone, solveTwoBoneIK, decomposeRot, composeRot, twistBone } from './ik.js';
import { buildZip, crc32 } from './zip.js';

const $ = (id) => document.getElementById(id);
const canvas = $('view');

const DEFAULT_SETTINGS = {
  fov: 30, ortho: false, bgColor: '#3a3f47', alphaExport: false,
  aspect: 'free', exportLong: 2048, guideScale: 100,
  showHandles: true, showGrid: true, handleScale: 1,
  panelSide: 'left', showEyeLevel: true,
  lightX: -50, lightY: 35, lightZ: 0, // 既定値は従来の固定ライト位置(1.2, 2.4, 1.8)相当
  directDownload: false,
  frameIsCamera: false, // ON: FOV をガイド枠基準にする(枠の外は画角の外側を表示)
};

const state = {
  characters: [],
  props: [],                // 小物(glTF/GLB/プリミティブ)
  selection: null,          // { char, handle } ※char は Prop のこともある
  activeChar: null,
  pendingChars: null,       // シーン読込時にモデル未所持だったキャラ状態
  pendingProps: null,
  mode: 'illust',           // 'illust' | 'conte'
  timeline: { fps: 24, cuts: [] },  // カット = { frames, thumb, state }
  settings: { ...DEFAULT_SETTINGS },
};

const JP_BONE = {
  __root: '全体(移動)', hips: '腰(足は接地)', spine: '腹', chest: '胸', neck: '首', head: '頭',
  UpperArm: '肩', LowerArm: 'ひじ', Hand: '手',
  UpperLeg: '脚のつけ根', LowerLeg: 'ひざ', Foot: '足', Toes: 'つま先',
};
function jpBoneName(bone) {
  if (JP_BONE[bone]) return JP_BONE[bone];
  const side = bone.startsWith('left') ? '左' : bone.startsWith('right') ? '右' : '';
  const base = bone.replace(/^left|^right/, '');
  return side + (JP_BONE[base] || base);
}

// ---------- three.js セットアップ ----------

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene = new THREE.Scene();
scene.background = new THREE.Color(state.settings.bgColor);

const perspCam = new THREE.PerspectiveCamera(state.settings.fov, 1, 0.01, 3000);
perspCam.position.set(0, 0.95, 2.8);
let orthoCam = null;
let activeCamera = perspCam;

scene.add(new THREE.HemisphereLight(0xffffff, 0x53585f, 1.1));
const dirLight = new THREE.DirectionalLight(0xffffff, 1.4);
scene.add(dirLight);

/** 平行光の向きを設定の XYZ 回転(度)から更新する。(0,0,1)=正面からの光を基準に X→Y→Z の順で回す */
function applyLight() {
  const s = state.settings;
  const v = new THREE.Vector3(0, 0, 1)
    .applyAxisAngle(new THREE.Vector3(1, 0, 0), THREE.MathUtils.degToRad(s.lightX))
    .applyAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(s.lightY))
    .applyAxisAngle(new THREE.Vector3(0, 0, 1), THREE.MathUtils.degToRad(s.lightZ));
  dirLight.position.copy(v.multiplyScalar(3));
}
applyLight();

// 地平線まで続く床グリッド(1m + 10m の二重グリッド、距離でフェード)
const grid = (() => {
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uColor: { value: new THREE.Color(0x55606c) },
      uFadeEnd: { value: 500.0 },
    },
    vertexShader: `
      varying vec3 vWorld;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `
      varying vec3 vWorld;
      uniform vec3 uColor;
      uniform float uFadeEnd;
      float gridLine(vec2 p, float scale) {
        vec2 c = p / scale;
        vec2 g = abs(fract(c - 0.5) - 0.5) / fwidth(c);
        return 1.0 - min(min(g.x, g.y), 1.0);
      }
      void main() {
        float g1 = gridLine(vWorld.xz, 1.0);
        float g10 = gridLine(vWorld.xz, 10.0);
        float dist = distance(cameraPosition.xz, vWorld.xz);
        float fade = 1.0 - smoothstep(uFadeEnd * 0.25, uFadeEnd, dist);
        float nearFade = 1.0 - smoothstep(30.0, 120.0, dist);
        float a = max(g10 * 0.45 * fade, g1 * 0.3 * nearFade);
        if (a < 0.003) discard;
        gl_FragColor = vec4(uColor, a);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000).rotateX(-Math.PI / 2), mat);
  mesh.renderOrder = 1;
  mesh.frustumCulled = false;
  scene.add(mesh);
  return mesh;
})();

// 向きコントローラー操作中に出す単位円ガイド
const headingRing = (() => {
  const pts = [];
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.sin(a), 0, Math.cos(a)));
  }
  const ring = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({ color: 0x6fe26f, transparent: true, opacity: 0.45, depthTest: false }),
  );
  ring.renderOrder = 997;
  ring.visible = false;
  scene.add(ring);
  return ring;
})();

// OrbitControls より先に登録する(登録順で先に発火させ、ハンドル命中時に controls を止める)
canvas.addEventListener('pointerdown', onPointerDown);
canvas.addEventListener('pointermove', onPointerMove);
canvas.addEventListener('pointerup', onPointerUp);
canvas.addEventListener('pointercancel', onPointerUp);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

let controls = makeControls(perspCam);

function makeControls(cam) {
  const c = new OrbitControls(cam, canvas);
  c.target.set(0, 0.85, 0);
  c.enableDamping = true;
  c.dampingFactor = 0.12;
  c.maxDistance = 30;
  c.addEventListener('end', markDirty);
  return c;
}

function resize() {
  const w = canvas.clientWidth || window.innerWidth;
  const h = canvas.clientHeight || window.innerHeight;
  renderer.setSize(w, h, false);
  perspCam.aspect = w / h;
  perspCam.updateProjectionMatrix();
  if (orthoCam) {
    const halfH = (orthoCam.top - orthoCam.bottom) / 2;
    orthoCam.left = -halfH * (w / h);
    orthoCam.right = halfH * (w / h);
    orthoCam.updateProjectionMatrix();
  }
  applyViewProjection(); // 画面比が変わると枠割合(fy)も変わる
  updateFrameGuide();
  if (state.mode === 'conte') renderTimeline(false);
}

// ---------- アスペクト比と書き出しサイズ ----------

function aspectValue() {
  const a = state.settings.aspect;
  if (!a || a === 'free') return null;
  const [aw, ah] = a.split(':').map(Number);
  if (!aw || !ah) return null;
  return aw / ah;
}

function exportSize(longOverride) {
  const long = Math.max(64, Math.min(8192, longOverride || state.settings.exportLong || 2048));
  let ar = aspectValue();
  if (ar === null) {
    ar = (canvas.clientWidth || 1) / (canvas.clientHeight || 1);
  }
  return ar >= 1 ? [long, Math.max(1, Math.round(long / ar))] : [Math.max(1, Math.round(long * ar)), long];
}

/** ガイド枠のピクセル寸法。セーフライン(ガイド枠%)で縮む。表示不要なら null */
function guideDims(rectW, rectH) {
  const ar = aspectValue();
  const k = Math.min(1, Math.max(0.1, (state.settings.guideScale || 100) / 100));
  if (ar === null && k >= 1) return null; // 画面のまま・100% = 枠なし
  let fw = rectW;
  let fh = ar === null ? rectH : fw / ar;
  if (fh > rectH) { fh = rectH; fw = fh * (ar === null ? rectW / rectH : ar); }
  return { fw: fw * k, fh: fh * k };
}

/** 書き出し範囲のガイド枠をビューポートに重ねる */
function updateFrameGuide() {
  const el = $('frameGuide');
  const dims = $('exportDims');
  const [ew, eh] = exportSize();
  if (dims) dims.textContent = `書き出しサイズ: ${ew} × ${eh} px`;
  const rect = canvas.getBoundingClientRect();
  const g = guideDims(rect.width, rect.height);
  if (!g) { el.classList.add('hidden'); return; }
  el.style.left = (rect.left + (rect.width - g.fw) / 2) + 'px';
  el.style.top = (rect.top + (rect.height - g.fh) / 2) + 'px';
  el.style.width = g.fw + 'px';
  el.style.height = g.fh + 'px';
  el.classList.remove('hidden');
}
/** ガイド枠の縦がビューポートに占める割合(枠なしは 1) */
function guideFy() {
  const w = canvas.clientWidth || window.innerWidth;
  const h = canvas.clientHeight || window.innerHeight;
  const g = guideDims(w, h);
  return g ? g.fh / h : 1;
}

// ortho フラスタムに現在掛けている表示倍率(1/fy)。掛け直しの差分計算に使う
let orthoViewK = 1;

/** 設定の FOV をビューポートカメラへ反映する。
 *  「枠内をカメラの範囲にする」ON のときは、枠内がちょうど設定 FOV になるよう外側を広げる。
 *  renderShot は「ビューポート画角 × 枠割合」で切り出すので、書き出しは厳密に設定 FOV になる */
function applyViewProjection() {
  const s = state.settings;
  const fy = s.frameIsCamera ? guideFy() : 1;
  const t = Math.tan(THREE.MathUtils.degToRad(s.fov) / 2) / fy;
  perspCam.fov = Math.min(175, THREE.MathUtils.radToDeg(2 * Math.atan(t)));
  perspCam.updateProjectionMatrix();
  if (orthoCam) {
    const k = 1 / fy;
    const f = k / orthoViewK;
    orthoCam.top *= f; orthoCam.bottom *= f;
    orthoCam.left *= f; orthoCam.right *= f;
    orthoViewK = k;
    orthoCam.updateProjectionMatrix();
  }
}

window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 300));
resize();

const clock = new THREE.Clock();
function allOwners() {
  return state.characters.concat(state.props);
}

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  for (const c of state.characters) { c.updateGaze(activeCamera); c.vrm.update(dt); }
  controls.update();
  scene.updateMatrixWorld();
  for (const o of allOwners()) {
    o.handleGroup.visible = state.settings.showHandles;
    if (o.handleGroup.visible) o.updateHandles(state.settings.handleScale);
  }
  renderer.render(scene, activeCamera);
  updateEyeLine();
});

/** アイレベル(カメラ高さの地平線)をスクリーン上に重ねる */
function updateEyeLine() {
  const el = $('eyeLine');
  if (state.settings.showEyeLevel === false) { el.classList.add('hidden'); return; }
  const cam = activeCamera;
  _v3a.set(0, 0, -1).applyQuaternion(cam.quaternion);
  _v3a.y = 0;
  if (_v3a.lengthSq() < 1e-6) { el.classList.add('hidden'); return; } // 真上/真下を見ている
  _v3a.normalize();
  _v3b.copy(cam.position).addScaledVector(_v3a, 1000);
  cam.updateMatrixWorld();
  cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
  _v3b.project(cam);
  if (!isFinite(_v3b.y) || _v3b.y < -1.2 || _v3b.y > 1.2) { el.classList.add('hidden'); return; }
  const rect = canvas.getBoundingClientRect();
  el.style.top = ((-_v3b.y * 0.5 + 0.5) * rect.height + rect.top) + 'px';
  $('eyeLineLabel').textContent = `アイレベル ${cam.position.y.toFixed(2)}m`;
  el.classList.remove('hidden');
}

// ---------- ハンドルのピックとドラッグ ----------

const _v3a = new THREE.Vector3();
const _v3b = new THREE.Vector3();
const _v3c = new THREE.Vector3();
const _q1s = new THREE.Quaternion();
const _q2s = new THREE.Quaternion();
const _ray = new THREE.Raycaster();
const _ndc = new THREE.Vector2();

function pickHandle(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  let best = null;
  let bestD = 30;
  for (const char of allOwners()) {
    if (!char.handleGroup.visible) continue;
    for (const h of char.handles) {
      if (h.visible === false) continue;
      _v3a.copy(h.position).project(activeCamera);
      if (_v3a.z > 1 || _v3a.z < -1) continue;
      const sx = (_v3a.x * 0.5 + 0.5) * rect.width + rect.left;
      const sy = (-_v3a.y * 0.5 + 0.5) * rect.height + rect.top;
      const d = Math.hypot(sx - clientX, sy - clientY);
      if (d < bestD) { bestD = d; best = { char, handle: h }; }
    }
  }
  return best;
}

function pointerToPlane(e, plane, out) {
  const rect = canvas.getBoundingClientRect();
  _ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
  _ray.setFromCamera(_ndc, activeCamera);
  return _ray.ray.intersectPlane(plane, out);
}

let drag = null;
let tapInfo = null;

function onPointerDown(e) {
  if (e.button !== undefined && e.button !== 0) return;
  const hit = pickHandle(e.clientX, e.clientY);
  if (!hit) {
    tapInfo = { x: e.clientX, y: e.clientY, t: performance.now() };
    return;
  }
  tapInfo = null;
  controls.enabled = false;
  try { canvas.setPointerCapture(e.pointerId); } catch (_) { }
  const pickedMode = hit.handle.userData.def.mode;
  if (pickedMode === 'heading') {
    // 向きハンドルはルート(腰/小物本体)を選択扱いにする
    const rootHandle = hit.char.handles.find((x) => x.userData.def.mode === 'root');
    select(rootHandle ? { char: hit.char, handle: rootHandle } : hit);
  } else if (pickedMode === 'twist' || pickedMode === 'finger' || pickedMode === 'aim') {
    // 捻り・エイム・指先サテライトは対象の手/足/頭(小物なら本体)を選択扱いにする
    const jointHandle = hit.char.handles.find(
      (x) => x.userData.def.bone === hit.handle.userData.def.bone
        && !['twist', 'finger', 'aim'].includes(x.userData.def.mode),
    );
    select(jointHandle ? { char: hit.char, handle: jointHandle } : hit);
  } else {
    select(hit);
  }
  pushUndo();

  const def = hit.handle.userData.def;
  const char = hit.char;
  const jointPos = hit.handle.position.clone();
  const normal = new THREE.Vector3();
  activeCamera.getWorldDirection(normal);
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, jointPos);
  const start = new THREE.Vector3();
  const grabOffset = pointerToPlane(e, plane, start) ? jointPos.clone().sub(start) : new THREE.Vector3();

  const ctx = { char, def, plane, grabOffset, pointerId: e.pointerId, startJoint: jointPos };
  if (def.mode === 'heading') {
    ctx.hPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -char.root.position.y);
    headingRing.position.copy(char.root.position);
    headingRing.position.y += 0.01;
    headingRing.quaternion.identity();
    headingRing.scale.setScalar(char.headingRadius());
    headingRing.visible = true;
  } else if (def.mode === 'twist') {
    // def.axis があれば小物の三軸回転(ワールド軸)、なければボーンの捻り
    const info = def.axis ? char.axisInfo(def.axis) : char.twistInfo(def.bone, def.parent);
    if (!info) { drag = null; controls.enabled = true; return; }
    ctx.twistNode = def.axis ? char.root : char.bone(def.bone);
    ctx.twistAxis = info.axis;
    ctx.twistCenter = info.joint;
    ctx.grabDir = info.offsetDir;
    ctx.twistStartQuat = ctx.twistNode.quaternion.clone();
    ctx.tPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(info.axis, info.joint);
    // 軸を横から見ている(円がつぶれて見える)ときは、画面接線方向のドラッグ量で回す
    const viewDir = activeCamera.getWorldDirection(new THREE.Vector3());
    ctx.twistEdgeOn = Math.abs(viewDir.dot(info.axis)) < 0.35;
    if (ctx.twistEdgeOn) {
      const rect = canvas.getBoundingClientRect();
      const toScreen = (wp) => {
        const v = wp.clone().project(activeCamera);
        return { x: (v.x * 0.5 + 0.5) * rect.width + rect.left, y: (-v.y * 0.5 + 0.5) * rect.height + rect.top };
      };
      const r = char.twistRadius();
      const dTheta = 0.08;
      const p1 = toScreen(info.joint.clone().addScaledVector(info.offsetDir, r));
      const rotated = info.offsetDir.clone().applyAxisAngle(info.axis, dTheta);
      const p2 = toScreen(info.joint.clone().addScaledVector(rotated, r));
      const dx = p2.x - p1.x, dy = p2.y - p1.y;
      const len = Math.hypot(dx, dy) || 1;
      ctx.tanScreen = { x: dx / len, y: dy / len };
      ctx.pxPerRad = Math.max(len / dTheta, 40);
      ctx.grabScreen = { x: e.clientX, y: e.clientY };
    }
    headingRing.position.copy(info.joint);
    headingRing.quaternion.setFromUnitVectors(_v3a.set(0, 1, 0), info.axis);
    headingRing.scale.setScalar(char.twistRadius());
    headingRing.visible = true;
  } else if (def.mode === 'root') {
    ctx.rootStart = char.root.position.clone();
  } else if (def.mode === 'hips') {
    const hipsNode = char.bone('hips');
    ctx.hipsNode = hipsNode;
    ctx.hipsStartLocal = hipsNode.position.clone();
    ctx.pins = char.capturePins();
    hipsNode.parent.updateWorldMatrix(true, false);
    ctx.hipsParentInv = hipsNode.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
  } else if (def.mode === 'ik') {
    ctx.chain = def.chain.map((b) => char.bone(b));
    if (def.bone.endsWith('Foot')) {
      // 膝のポール = 掴んだ時点で足が向いている方向。足首のワールド向きも維持する
      const side = def.bone.startsWith('left') ? 'left' : 'right';
      ctx.fallbackBend = char.footForward(side, new THREE.Vector3());
      ctx.forceBend = true;
      ctx.footQuat = ctx.chain[2].getWorldQuaternion(new THREE.Quaternion());
    } else {
      // 肘の基準ポール = キャラの後ろ+下。伸びた腕でだけ効くブレンド
      const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(char.root.quaternion);
      ctx.fallbackBend = fwd.negate().add(new THREE.Vector3(0, -0.8, 0)).normalize();
      ctx.forceBend = false;
    }
  } else if (def.mode === 'finger' || def.mode === 'aim') {
    // 共有の plane / grabOffset でカーソルのワールド位置だけ取れれば足りる
    // (aim は毎フレーム aimInfo を取り直して LookAt するので追加の ctx 不要)
  } else {
    const parentName = BONE_PARENT[def.bone];
    const resolved = char.resolveBone(parentName);
    ctx.rotNode = resolved ? resolved.node : null;
  }
  drag = ctx;
  e.preventDefault();
}

/** 指先を target へ近づけるカール量を 1 次元探索で求めて適用する */
function solveFingerCurl(char, side, finger, targetWorld) {
  let bestT = 0;
  let bestD = Infinity;
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    char.applyFingerValue(side, finger, t);
    if (!char.fingertipPos(side, finger, _v3c)) return;
    const d = _v3c.distanceToSquared(targetWorld);
    if (d < bestD) { bestD = d; bestT = t; }
  }
  let lo = Math.max(0, bestT - 0.05);
  let hi = Math.min(1, bestT + 0.05);
  for (let k = 0; k < 10; k++) {
    const m1 = lo + (hi - lo) / 3;
    const m2 = hi - (hi - lo) / 3;
    char.applyFingerValue(side, finger, m1);
    char.fingertipPos(side, finger, _v3c);
    const d1 = _v3c.distanceToSquared(targetWorld);
    char.applyFingerValue(side, finger, m2);
    char.fingertipPos(side, finger, _v3c);
    const d2 = _v3c.distanceToSquared(targetWorld);
    if (d1 < d2) hi = m2; else lo = m1;
  }
  const t = Math.round(((lo + hi) / 2) * 100) / 100;
  char.applyFingerValue(side, finger, t);
  char.fingers[side][finger] = t;
}

function onPointerMove(e) {
  if (!drag || e.pointerId !== drag.pointerId) return;
  const { char, def } = drag;

  if (def.mode === 'heading') {
    // 地面(ルート高さ)の平面上でルート中心からの方位を取り、Y回転だけ合わせる
    if (!pointerToPlane(e, drag.hPlane, _v3a)) return;
    const dx = _v3a.x - char.root.position.x;
    const dz = _v3a.z - char.root.position.z;
    if (dx * dx + dz * dz < 1e-6) return;
    const newYaw = Math.atan2(dx, dz);
    _v3b.set(0, 0, 1).applyQuaternion(char.root.quaternion);
    _v3b.y = 0;
    if (_v3b.lengthSq() < 1e-6) _v3b.set(0, 0, 1);
    const curYaw = Math.atan2(_v3b.x, _v3b.z);
    _v3c.set(0, 1, 0);
    const q = new THREE.Quaternion().setFromAxisAngle(_v3c, newYaw - curYaw);
    char.root.quaternion.premultiply(q).normalize();
    e.preventDefault();
    return;
  }

  if (def.mode === 'twist') {
    let angle;
    if (drag.twistEdgeOn) {
      // 接線方向のドラッグ量 → 回転角
      angle = ((e.clientX - drag.grabScreen.x) * drag.tanScreen.x
        + (e.clientY - drag.grabScreen.y) * drag.tanScreen.y) / drag.pxPerRad;
    } else {
      // サテライトを円周に沿って追わせ、掴んだ位置からの回転角をボーンの捻りにする
      if (!pointerToPlane(e, drag.tPlane, _v3a)) return;
      _v3a.sub(drag.twistCenter);
      if (_v3a.lengthSq() < 1e-8) return;
      _v3a.normalize();
      _v3b.crossVectors(drag.grabDir, _v3a);
      angle = Math.atan2(_v3b.dot(drag.twistAxis), drag.grabDir.dot(_v3a));
    }
    drag.twistNode.quaternion.copy(drag.twistStartQuat);
    twistBone(drag.twistNode, drag.twistAxis, angle);
    e.preventDefault();
    return;
  }

  const target = new THREE.Vector3();
  if (!pointerToPlane(e, drag.plane, target)) return;
  target.add(drag.grabOffset);

  if (def.mode === 'root') {
    char.root.position.copy(drag.rootStart).add(_v3a.copy(target).sub(drag.startJoint));
  } else if (def.mode === 'hips') {
    // 腰だけ移動し、足は記録位置へ IK で固定する
    _v3a.copy(target).sub(drag.startJoint).applyQuaternion(drag.hipsParentInv);
    drag.hipsNode.position.copy(drag.hipsStartLocal).add(_v3a);
    drag.hipsNode.updateWorldMatrix(true, true);
    char.applyPins(drag.pins);
  } else if (def.mode === 'finger') {
    solveFingerCurl(char, def.side, def.finger, target);
    if (state.selection && state.selection.char === char
      && state.selection.handle.userData.def.bone === def.bone) {
      const v = char.masterCurl(def.side);
      $('curlSlider').value = v;
      $('valCurl').value = v.toFixed(2);
    }
  } else if (def.mode === 'ik') {
    solveTwoBoneIK(drag.chain[0], drag.chain[1], drag.chain[2], target, drag.fallbackBend, drag.forceBend);
    if (drag.footQuat) {
      const foot = drag.chain[2];
      foot.parent.updateWorldMatrix(true, false);
      _q1s.copy(foot.parent.getWorldQuaternion(_q2s)).invert();
      foot.quaternion.copy(_q1s.multiply(drag.footQuat)).normalize();
    }
  } else if (def.mode === 'aim') {
    // LookAt式: ボーン軸(頭頂/指先の方向)がドラッグ先を向くよう最短弧で回す。捻りは変えない
    const info = char.aimInfo(def.bone);
    if (info) {
      aimBone(info.node, info.joint, _v3b.copy(info.joint).addScaledVector(info.dir, info.dist), target);
    }
  } else if (drag.rotNode) {
    drag.rotNode.updateWorldMatrix(true, false);
    _v3b.setFromMatrixPosition(drag.rotNode.matrixWorld);
    char.boneWorldPos(def.bone, _v3c);
    aimBone(drag.rotNode, _v3b, _v3c, target);
  }
  e.preventDefault();
}

function onPointerUp(e) {
  if (drag && e.pointerId === drag.pointerId) {
    drag = null;
    controls.enabled = true;
    headingRing.visible = false;
    syncBoneSliders();
    markDirty();
    return;
  }
  // 空タップで選択解除
  if (tapInfo && performance.now() - tapInfo.t < 250
    && Math.hypot(e.clientX - tapInfo.x, e.clientY - tapInfo.y) < 8) {
    deselect();
  }
  tapInfo = null;
}

// ---------- 選択とボーンパネル ----------

function select(hit) {
  if (state.selection) {
    const h = state.selection.handle;
    h.material.color.setHex(h.userData.baseColor);
  }
  state.selection = hit;
  if (!hit.char.isProp) state.activeChar = hit.char;
  hit.handle.material.color.setHex(0xff4d6b);
  const def = hit.handle.userData.def;
  const isProp = !!hit.char.isProp;
  $('boneTitle').textContent = `${hit.char.name} / ${isProp ? '配置' : jpBoneName(def.bone)}`;
  const isHand = !isProp && (def.bone === 'leftHand' || def.bone === 'rightHand');
  // 手の選択中はその手の指先IKハンドルを出す
  for (const c of state.characters) c.fingerHandlesVisible = { left: false, right: false };
  if (isHand) hit.char.fingerHandlesVisible[def.bone === 'leftHand' ? 'left' : 'right'] = true;
  for (const el of document.querySelectorAll('.curl-only')) el.classList.toggle('hidden', !isHand);
  // 大きさ: 小物、キャラの全体ハンドル、または頭(頭部だけの拡縮)選択時
  const showScale = isProp || def.mode === 'root' || def.bone === 'head';
  for (const el of document.querySelectorAll('.scale-only')) el.classList.toggle('hidden', !showScale);
  if (isHand) {
    const side = def.bone === 'leftHand' ? 'left' : 'right';
    const v = hit.char.masterCurl(side);
    $('curlSlider').value = v;
    $('valCurl').value = (+v).toFixed(2);
    const sp = hit.char.spread[side] || 0;
    $('spreadSlider').value = sp;
    $('valSpread').value = (+sp).toFixed(2);
  }
  syncBoneSliders();
  $('bonePanel').classList.remove('hidden');
  renderCharUI();
}

function deselect() {
  if (state.selection) {
    const h = state.selection.handle;
    h.material.color.setHex(h.userData.baseColor);
  }
  state.selection = null;
  for (const c of state.characters) c.fingerHandlesVisible = { left: false, right: false };
  $('bonePanel').classList.add('hidden');
}

// ---------- 回転スライダー(絶対角。スイング/ツイスト分解で現在値を表示) ----------

// ルート(腰・小物)用フレーム: t=前方, u=上, w=右
const ROOT_FRAME = {
  t: new THREE.Vector3(0, 0, 1),
  u: new THREE.Vector3(0, 1, 0),
  w: new THREE.Vector3(1, 0, 0),
};

function selectionRotTarget() {
  const sel = state.selection;
  if (!sel) return null;
  const def = sel.handle.userData.def;
  if (def.mode === 'root') return { node: sel.char.root, frame: ROOT_FRAME };
  const node = sel.char.bone(def.bone);
  if (!node) return null;
  // 腰の回転スライダーは骨盤の回転(足はジェスチャ中ピン留め)
  return { node, frame: sel.char.boneFrame(def.bone), pinFeet: def.mode === 'hips' };
}

function syncBoneSliders() {
  const tgt = selectionRotTarget();
  if (!tgt) return;
  const r = decomposeRot(tgt.node.quaternion, tgt.frame);
  const set = (id, valId, rad) => {
    const deg = THREE.MathUtils.radToDeg(rad);
    $(id).value = deg;
    $(valId).value = Math.round(deg);
  };
  set('jogTwist', 'valTwist', r.twist);
  set('jogPitch', 'valPitch', r.pitch);
  set('jogYaw', 'valYaw', r.yaw);
  const sel = state.selection;
  if (sel.char.isProp || sel.handle.userData.def.mode === 'root') {
    $('propScale').value = sel.char.root.scale.x;
    $('valScale').value = sel.char.root.scale.x.toFixed(2);
  } else if (sel.handle.userData.def.bone === 'head') {
    const v = sel.char.headScale || 1;
    $('propScale').value = v;
    $('valScale').value = v.toFixed(2);
  }
}

let sliderActive = false;
let sliderPins = null;
function onRotSliderInput() {
  const tgt = selectionRotTarget();
  if (!tgt) return;
  if (!sliderActive) {
    sliderActive = true;
    pushUndo();
    sliderPins = tgt.pinFeet ? state.selection.char.capturePins() : null;
  }
  const p = THREE.MathUtils.degToRad(parseFloat($('jogPitch').value));
  const y = THREE.MathUtils.degToRad(parseFloat($('jogYaw').value));
  const t = THREE.MathUtils.degToRad(parseFloat($('jogTwist').value));
  composeRot(p, y, t, tgt.frame, tgt.node.quaternion);
  if (tgt.pinFeet && sliderPins) {
    tgt.node.updateWorldMatrix(true, true);
    state.selection.char.applyPins(sliderPins);
  }
  $('valTwist').value = Math.round(THREE.MathUtils.radToDeg(t));
  $('valPitch').value = Math.round(THREE.MathUtils.radToDeg(p));
  $('valYaw').value = Math.round(THREE.MathUtils.radToDeg(y));
}
function onSliderEnd() { sliderActive = false; sliderPins = null; markDirty(); }
for (const id of ['jogTwist', 'jogPitch', 'jogYaw']) {
  $(id).addEventListener('input', onRotSliderInput);
  $(id).addEventListener('change', onSliderEnd);
}

$('propScale').addEventListener('input', () => {
  const sel = state.selection;
  if (!sel) return;
  const def = sel.handle.userData.def;
  const headOnly = !sel.char.isProp && def.bone === 'head';
  if (!sel.char.isProp && def.mode !== 'root' && !headOnly) return;
  if (!sliderActive) { sliderActive = true; pushUndo(); }
  const v = parseFloat($('propScale').value);
  if (headOnly) sel.char.setHeadScale(v);
  else sel.char.root.scale.setScalar(v);
  $('valScale').value = v.toFixed(2);
});
$('propScale').addEventListener('change', onSliderEnd);

$('curlSlider').addEventListener('input', () => {
  if (!state.selection || state.selection.char.isProp) return;
  if (!sliderActive) { sliderActive = true; pushUndo(); }
  const { char, handle } = state.selection;
  const side = handle.userData.def.bone === 'leftHand' ? 'left' : 'right';
  const v = parseFloat($('curlSlider').value);
  char.setCurl(side, v);
  $('valCurl').value = v.toFixed(2);
});
$('curlSlider').addEventListener('change', onSliderEnd);

$('spreadSlider').addEventListener('input', () => {
  if (!state.selection || state.selection.char.isProp) return;
  if (!sliderActive) { sliderActive = true; pushUndo(); }
  const { char, handle } = state.selection;
  const side = handle.userData.def.bone === 'leftHand' ? 'left' : 'right';
  const v = parseFloat($('spreadSlider').value);
  char.setSpread(side, v);
  $('valSpread').value = v.toFixed(2);
});
$('spreadSlider').addEventListener('change', onSliderEnd);

// 右側の数値欄からの直接入力: スライダーに反映して既存ハンドラへ流す
for (const [numId, sliderId] of [
  ['valTwist', 'jogTwist'], ['valPitch', 'jogPitch'], ['valYaw', 'jogYaw'],
  ['valCurl', 'curlSlider'], ['valSpread', 'spreadSlider'], ['valScale', 'propScale'],
]) {
  const num = $(numId);
  num.addEventListener('change', () => {
    const v = parseFloat(num.value);
    if (!Number.isFinite(v)) { syncBoneSliders(); return; }
    const slider = $(sliderId);
    slider.value = Math.min(+slider.max, Math.max(+slider.min, v));
    slider.dispatchEvent(new Event('input'));
    slider.dispatchEvent(new Event('change'));
  });
  num.addEventListener('keydown', (e) => { if (e.key === 'Enter') num.blur(); });
}

$('btnDeselect').addEventListener('click', deselect);

// ---------- ポーズ・表情パネル ----------

const JP_EXP = {
  happy: 'にこ', angry: '怒り', sad: '悲しみ', relaxed: 'リラックス', surprised: '驚き',
  aa: 'あ', ih: 'い', ou: 'う', ee: 'え', oh: 'お',
  blink: 'まばたき', blinkLeft: 'まばたき(左)', blinkRight: 'まばたき(右)', neutral: 'ニュートラル',
};

function renderPosePanel() {
  const char = state.activeChar;
  $('poseTargetName').textContent = char ? `ポーズ・表情: ${char.name}` : 'ポーズ・表情';
  // 目線が実際に効かないモデル(目ボーンも look 表情も無い)ではセクションごと隠す
  $('poseGazeSec').classList.toggle('hidden', !(char && char.hasUsableGaze()));
  if (char) {
    $('gazeCamera').checked = char.gaze.mode === 'camera';
    $('gazeYaw').value = char.gaze.yaw;
    $('valGazeYaw').textContent = Math.round(char.gaze.yaw) + '°';
    $('gazePitch').value = char.gaze.pitch;
    $('valGazePitch').textContent = Math.round(char.gaze.pitch) + '°';
  }
  const list = $('expressionList');
  list.innerHTML = '';
  const names = char ? char.listActiveExpressions().filter((n) => !/^look/.test(n) && n !== 'neutral') : [];
  // 実体のある表情が無いモデル(登録だけで中身が空のプリセット含む)ではセクションごと隠す
  $('poseExpSec').classList.toggle('hidden', !names.length);
  if (!names.length) return;
  for (const name of names) {
    const row = document.createElement('label');
    row.className = 'exp-row';
    const span = document.createElement('span');
    span.className = 'exp-name';
    span.textContent = JP_EXP[name] || name;
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = 0; slider.max = 1; slider.step = 0.01;
    slider.value = char.getExpression(name);
    const val = document.createElement('span');
    val.className = 'val';
    val.textContent = (+slider.value).toFixed(2);
    slider.addEventListener('input', () => {
      if (!state.activeChar) return;
      if (!sliderActive) { sliderActive = true; pushUndo(); }
      const w = parseFloat(slider.value);
      state.activeChar.setExpression(name, w);
      val.textContent = w.toFixed(2);
    });
    slider.addEventListener('change', onSliderEnd);
    row.appendChild(span);
    row.appendChild(slider);
    row.appendChild(val);
    list.appendChild(row);
  }
}

for (const b of document.querySelectorAll('#panelPose [data-pose]')) {
  b.addEventListener('click', () => {
    const char = state.activeChar;
    if (!char) { toast('モデルがありません'); return; }
    pushUndo();
    if (b.dataset.pose === 'tpose') {
      char.resetPoseOnly();
      char.root.position.y = 0;
      char.applyCurls();
    } else {
      char.applyPresetPose(b.dataset.pose);
    }
    syncBoneSliders();
    markDirty();
  });
}

for (const b of document.querySelectorAll('#panelPose [data-hand]')) {
  b.addEventListener('click', () => {
    const char = state.activeChar;
    if (!char) { toast('モデルがありません'); return; }
    pushUndo();
    char.setHandPose(b.dataset.hand, HAND_POSES[b.dataset.handpose]);
    markDirty();
  });
}

$('gazeCamera').addEventListener('change', (e) => {
  const char = state.activeChar;
  if (!char) return;
  pushUndo();
  char.gaze.mode = e.target.checked ? 'camera'
    : (Math.abs(char.gaze.yaw) + Math.abs(char.gaze.pitch) > 0.5 ? 'manual' : 'none');
  markDirty();
});
for (const [id, valId, key] of [['gazeYaw', 'valGazeYaw', 'yaw'], ['gazePitch', 'valGazePitch', 'pitch']]) {
  $(id).addEventListener('input', () => {
    const char = state.activeChar;
    if (!char) return;
    if (!sliderActive) { sliderActive = true; pushUndo(); }
    char.gaze.mode = 'manual';
    $('gazeCamera').checked = false;
    char.gaze[key] = parseFloat($(id).value);
    $(valId).textContent = Math.round(char.gaze[key]) + '°';
  });
  $(id).addEventListener('change', onSliderEnd);
}
$('btnGazeReset').addEventListener('click', () => {
  const char = state.activeChar;
  if (!char) return;
  pushUndo();
  char.gaze = { mode: 'none', yaw: 0, pitch: 0 };
  renderPosePanel();
  markDirty();
});
$('btnExpReset').addEventListener('click', () => {
  const char = state.activeChar;
  if (!char) return;
  pushUndo();
  char.resetExpressions();
  renderPosePanel();
  markDirty();
});

// ---------- Undo / Redo ----------

const undoStack = [];
const redoStack = [];

function snapshot() {
  return JSON.stringify({
    c: state.characters.map((c) => c.serialize()),
    p: state.props.map((p) => p.serialize()),
  });
}
function pushUndo() {
  const s = snapshot();
  if (undoStack[undoStack.length - 1] === s) return;
  undoStack.push(s);
  if (undoStack.length > 60) undoStack.shift();
  redoStack.length = 0;
  updateUndoButtons();
}
function applySnapshot(s) {
  const o = JSON.parse(s);
  if (o.c.length !== state.characters.length || o.p.length !== state.props.length) return;
  o.c.forEach((cs, i) => {
    state.characters[i].applyState(cs);
    state.characters[i].applyCurls();
  });
  o.p.forEach((ps, i) => state.props[i].applyState(ps));
  syncBoneSliders();
}
$('btnUndo').addEventListener('click', () => {
  if (!undoStack.length) return;
  redoStack.push(snapshot());
  applySnapshot(undoStack.pop());
  updateUndoButtons();
  markDirty();
});
$('btnRedo').addEventListener('click', () => {
  if (!redoStack.length) return;
  undoStack.push(snapshot());
  applySnapshot(redoStack.pop());
  updateUndoButtons();
  markDirty();
});
function clearUndo() {
  undoStack.length = 0;
  redoStack.length = 0;
  updateUndoButtons();
}
function updateUndoButtons() {
  $('btnUndo').disabled = !undoStack.length;
  $('btnRedo').disabled = !redoStack.length;
}
updateUndoButtons();

// ---------- モデル追加・キャラクター管理 ----------

async function addModelFromBuffer(buf, fileName) {
  showLoading(true);
  try {
    const key = await hashBuffer(buf);
    const existing = await idb.getModel(key);
    if (!existing) await idb.putModel(key, { name: fileName, blob: new Blob([buf]) });

    // シーン読込で不足していたモデルなら、その状態で復元する
    let restored = false;
    if (state.pendingChars) {
      const matches = state.pendingChars.filter((cs) => cs.modelKey === key);
      if (matches.length) {
        state.pendingChars = state.pendingChars.filter((cs) => cs.modelKey !== key);
        if (!state.pendingChars.length) state.pendingChars = null;
        for (const cs of matches) {
          const char = await createCharacter(buf, key, cs.name || baseName(fileName));
          char.applyState(cs);
          char.applyCurls();
        }
        restored = true;
      }
    }
    if (state.pendingProps) {
      const matches = state.pendingProps.filter((ps) => ps.modelKey === key);
      if (matches.length) {
        state.pendingProps = state.pendingProps.filter((ps) => ps.modelKey !== key);
        if (!state.pendingProps.length) state.pendingProps = null;
        for (const ps of matches) {
          const prop = await createProp(buf, key, ps.name || baseName(fileName));
          prop.applyState(ps);
        }
        restored = true;
      }
    }
    if (restored) {
      toast('シーンの配置を復元しました');
      afterCharsChanged();
      return;
    }

    const asset = await loadAsset(buf);
    if (asset.type === 'vrm') {
      const char = makeCharacter(asset.vrm, key, baseName(fileName));
      char.root.position.x = (state.characters.length - 1) * 0.7;
      toast(`${char.name} を読み込みました`);
    } else {
      const prop = makeProp(asset.object, key, baseName(fileName));
      toast(`${prop.name} を小物として配置しました`);
    }
    afterCharsChanged();
  } catch (err) {
    console.error(err);
    toast('読み込みに失敗しました: ' + err.message);
  } finally {
    showLoading(false);
  }
}

async function createCharacter(buf, key, name) {
  const asset = await loadAsset(buf);
  if (asset.type !== 'vrm') throw new Error('VRM ではありません');
  return makeCharacter(asset.vrm, key, name);
}

function makeCharacter(vrm, key, name) {
  const char = new Character(vrm, key, name);
  scene.add(char.root);
  char.buildHandles();
  scene.add(char.handleGroup);
  state.characters.push(char);
  state.activeChar = char;
  clearUndo();
  // 初期ポーズは T ポーズではなく「立ち+指を軽く曲げる」
  // (シーン復元時はこの後の applyState が上書きする)
  char.setCurl('left', 0.25);
  char.setCurl('right', 0.25);
  char.applyPresetPose('stand');
  return char;
}

async function createProp(buf, key, name) {
  const asset = await loadAsset(buf);
  const object = asset.type === 'gltf' ? asset.object : asset.vrm.scene;
  return makeProp(object, key, name);
}

function makeProp(object, key, name) {
  const prop = new Prop(object, key, name);
  // 単位系がバラバラな glTF への保険: 大きすぎ/小さすぎは 1.5m 程度に寄せる
  if (prop.size > 2.5) prop.root.scale.setScalar(1.5 / prop.size);
  else if (prop.size < 0.1) prop.root.scale.setScalar(0.5 / prop.size);
  scene.add(prop.root);
  scene.add(prop.handleGroup);
  state.props.push(prop);
  clearUndo();
  return prop;
}

// ---------- 基本プリミティブ(modelKey は "prim:○○"。IndexedDB を介さず再生成する) ----------

const PRIMITIVES = {
  box: { label: '立方体', make: () => new THREE.BoxGeometry(0.5, 0.5, 0.5).translate(0, 0.25, 0) },
  sphere: { label: '球', make: () => new THREE.SphereGeometry(0.25, 32, 16).translate(0, 0.25, 0) },
  cylinder: { label: '円柱', make: () => new THREE.CylinderGeometry(0.25, 0.25, 0.5, 32).translate(0, 0.25, 0) },
  plane: { label: '板', make: () => new THREE.BoxGeometry(1, 0.02, 1).translate(0, 0.01, 0) },
};

function makePrimitiveObject(kind) {
  const mesh = new THREE.Mesh(
    PRIMITIVES[kind].make(),
    new THREE.MeshStandardMaterial({ color: 0x9aa8b3, roughness: 0.85, metalness: 0 }),
  );
  const group = new THREE.Group();
  group.add(mesh);
  return group;
}

function addPrimitive(kind) {
  if (!PRIMITIVES[kind]) return;
  const prop = makeProp(makePrimitiveObject(kind), 'prim:' + kind, PRIMITIVES[kind].label);
  prop.root.position.set(0.3 * (state.props.length - 1), 0, 0.5);
  toast(`${prop.name}を配置しました`);
  afterCharsChanged();
}

/** modelKey から小物を作る(プリミティブは再生成、それ以外は IndexedDB)。無ければ null */
async function createPropFromKey(key, name) {
  if (key && key.startsWith('prim:')) {
    const kind = key.slice(5);
    if (!PRIMITIVES[kind]) return null;
    return makeProp(makePrimitiveObject(kind), key, name || PRIMITIVES[kind].label);
  }
  const rec = await idb.getModel(key);
  if (!rec) return null;
  const buf = await rec.blob.arrayBuffer();
  return createProp(buf, key, name || rec.name);
}

function removeProp(prop) {
  if (state.selection && state.selection.char === prop) deselect();
  prop.dispose(scene);
  state.props = state.props.filter((p) => p !== prop);
  clearUndo();
  afterCharsChanged();
}

async function duplicateProp(prop) {
  showLoading(true);
  try {
    const st = prop.serialize();
    const copy = await createPropFromKey(prop.modelKey, prop.name + ' コピー');
    if (!copy) { toast('モデルデータが見つかりません'); return; }
    copy.applyState(st);
    copy.name = prop.name + ' コピー';
    copy.root.position.x += 0.4;
    afterCharsChanged();
  } finally {
    showLoading(false);
  }
}

function removeCharacter(char) {
  if (state.selection && state.selection.char === char) deselect();
  char.dispose(scene);
  state.characters = state.characters.filter((c) => c !== char);
  if (state.activeChar === char) state.activeChar = state.characters[0] || null;
  clearUndo();
  afterCharsChanged();
}

async function duplicateCharacter(char) {
  const rec = await idb.getModel(char.modelKey);
  if (!rec) { toast('モデルデータが見つかりません'); return; }
  showLoading(true);
  try {
    const buf = await rec.blob.arrayBuffer();
    const st = char.serialize();
    const copy = await createCharacter(buf, char.modelKey, char.name + ' コピー');
    copy.applyState(st);
    copy.name = char.name + ' コピー';
    copy.applyCurls();
    copy.root.position.x += 0.5;
    afterCharsChanged();
  } finally {
    showLoading(false);
  }
}

function afterCharsChanged() {
  renderCharUI();
  markDirty();
}

function baseName(fileName) {
  return (fileName || 'model').replace(/\.[^.]+$/, '').slice(0, 24);
}

function renderCharUI() {
  if (!$('panelPose').classList.contains('hidden')) renderPosePanel();
  const bar = $('charbar');
  bar.innerHTML = '';
  state.characters.forEach((c, i) => {
    const b = document.createElement('button');
    b.className = 'chip' + (c === state.activeChar ? ' active' : '');
    b.textContent = `${i + 1}. ${c.name}`;
    b.addEventListener('click', () => { state.activeChar = c; renderCharUI(); });
    bar.appendChild(b);
  });

  const list = $('charList');
  list.innerHTML = '';
  state.characters.forEach((c) => {
    const li = document.createElement('li');
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = c.name;
    li.appendChild(name);
    li.appendChild(miniBtn('複製', () => duplicateCharacter(c)));
    li.appendChild(miniBtn('ミラー', () => { pushUndo(); c.mirrorPose(); syncBoneSliders(); markDirty(); }));
    li.appendChild(miniBtn('リセット', () => {
      if (!confirm(`${c.name} のポーズをリセットしますか?`)) return;
      pushUndo(); c.resetAll(); c.applyCurls(); syncBoneSliders(); markDirty();
    }));
    const del = miniBtn('削除', () => {
      if (!confirm(`${c.name} を削除しますか?`)) return;
      removeCharacter(c);
    });
    del.className = 'del';
    li.appendChild(del);
    list.appendChild(li);
  });
  state.props.forEach((p) => {
    const li = document.createElement('li');
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = '📦 ' + p.name;
    li.appendChild(name);
    li.appendChild(miniBtn('複製', () => duplicateProp(p)));
    const del = miniBtn('削除', () => {
      if (!confirm(`${p.name} を削除しますか?`)) return;
      removeProp(p);
    });
    del.className = 'del';
    li.appendChild(del);
    list.appendChild(li);
  });
}

function miniBtn(label, fn) {
  const b = document.createElement('button');
  b.textContent = label;
  b.addEventListener('click', fn);
  return b;
}

// ---------- カメラ ----------

function setOrtho(on) {
  state.settings.ortho = on;
  const target = controls.target.clone();
  const pos = activeCamera.position.clone();
  const quat = activeCamera.quaternion.clone();
  if (on) {
    const dist = pos.distanceTo(target);
    const halfH = Math.tan(THREE.MathUtils.degToRad(state.settings.fov / 2)) * dist;
    const aspect = (canvas.clientWidth || 1) / (canvas.clientHeight || 1);
    orthoCam = new THREE.OrthographicCamera(-halfH * aspect, halfH * aspect, halfH, -halfH, -100, 3000);
    orthoCam.position.copy(pos);
    orthoCam.quaternion.copy(quat);
    orthoViewK = 1; // 枠基準で作り直したので表示倍率も初期化
    activeCamera = orthoCam;
  } else {
    perspCam.position.copy(pos);
    activeCamera = perspCam;
  }
  controls.dispose();
  controls = makeControls(activeCamera);
  controls.target.copy(target);
  controls.update();
  applyViewProjection();
  $('fovRange').disabled = on;
  markDirty();
}

// フルサイズ(縦24mm)換算の焦点距離
function fovToMm(fovDeg) {
  return Math.round(12 / Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2));
}

$('fovRange').addEventListener('input', () => {
  const v = parseInt($('fovRange').value, 10);
  state.settings.fov = v;
  $('fovVal').textContent = v;
  $('fovMm').textContent = fovToMm(v);
  applyViewProjection();
});
$('fovRange').addEventListener('change', markDirty);
$('orthoToggle').addEventListener('change', (e) => setOrtho(e.target.checked));

// ---------- シーンの直列化 ----------

function captureCameraState() {
  return {
    pos: activeCamera.position.toArray(),
    target: controls.target.toArray(),
    fov: state.settings.fov,
    ortho: state.settings.ortho,
    zoom: activeCamera.zoom || 1,
  };
}

function applyCameraState(cam) {
  if (!cam) return;
  if (!!cam.ortho !== (activeCamera !== perspCam)) setOrtho(!!cam.ortho);
  $('orthoToggle').checked = !!cam.ortho;
  state.settings.fov = cam.fov || 30;
  applyViewProjection();
  activeCamera.position.fromArray(cam.pos);
  controls.target.fromArray(cam.target);
  if (cam.zoom && activeCamera.isOrthographicCamera) {
    activeCamera.zoom = cam.zoom;
    activeCamera.updateProjectionMatrix();
  }
  controls.update();
  syncSettingsUI();
}

/** ポーズ・小物・カメラのスナップショット(コンテのカットに使う) */
function captureShot() {
  return {
    characters: state.characters.map((c) => c.serialize()),
    props: state.props.map((p) => p.serialize()),
    camera: captureCameraState(),
  };
}

/** captureShot の状態を現在のシーンへ適用(モデル構成は今あるものを流用) */
function applyShot(cs) {
  if (!cs) return;
  (cs.characters || []).forEach((st, i) => {
    const c = state.characters[i];
    if (c) { c.applyState(st); c.applyCurls(); }
  });
  (cs.props || []).forEach((st, i) => {
    const p = state.props[i];
    if (p) p.applyState(st);
  });
  applyCameraState(cs.camera);
}

function serializeScene() {
  return {
    app: 'vrmpose', version: 1,
    characters: state.characters.map((c) => c.serialize()),
    props: state.props.map((p) => p.serialize()),
    camera: captureCameraState(),
    settings: { ...state.settings },
    timeline: {
      fps: state.timeline.fps,
      exportLong: state.timeline.exportLong || 960,
      cuts: state.timeline.cuts.map((c) => ({ frames: c.frames, thumb: c.thumb, state: c.state })),
    },
  };
}

async function applyScene(data) {
  if (!data || data.app !== 'vrmpose') { toast('vrmpose のシーンファイルではありません'); return; }

  // 設定
  if (data.settings) {
    Object.assign(state.settings, data.settings);
    syncSettingsUI();
  }

  // キャラクター・小物(モデルは IndexedDB から)
  deselect();
  for (const c of [...state.characters]) { c.dispose(scene); }
  for (const p of [...state.props]) { p.dispose(scene); }
  state.characters = [];
  state.props = [];
  state.activeChar = null;
  state.pendingChars = null;
  state.pendingProps = null;
  clearUndo();

  const missing = [];
  for (const cs of data.characters || []) {
    const rec = await idb.getModel(cs.modelKey);
    if (!rec) { missing.push(cs); continue; }
    const buf = await rec.blob.arrayBuffer();
    const char = await createCharacter(buf, cs.modelKey, cs.name || rec.name);
    char.applyState(cs);
    char.applyCurls();
  }
  const missingProps = [];
  for (const ps of data.props || []) {
    const prop = await createPropFromKey(ps.modelKey, ps.name);
    if (!prop) { missingProps.push(ps); continue; }
    prop.applyState(ps);
  }
  if (missing.length || missingProps.length) {
    state.pendingChars = missing.length ? missing : null;
    state.pendingProps = missingProps.length ? missingProps : null;
    toast(`モデル未読込の配置が ${missing.length + missingProps.length} 件あります。＋モデルで該当ファイルを読み込むと復元されます`);
  }

  // カメラ
  applyCameraState(data.camera);

  // タイムライン(コンテ)
  state.timeline = data.timeline
    ? JSON.parse(JSON.stringify(data.timeline))
    : { fps: 24, cuts: [] };
  if (!state.timeline.fps) state.timeline.fps = 24;
  if (!Array.isArray(state.timeline.cuts)) state.timeline.cuts = [];
  selectedCut = state.timeline.cuts.length ? 0 : -1;
  renderTimeline(false);

  renderCharUI();
  markDirty();
}

// ---------- 自動保存 ----------

let dirtyTimer = 0;
function markDirty() {
  clearTimeout(dirtyTimer);
  dirtyTimer = setTimeout(() => {
    idb.putKV('autosave', serializeScene()).catch(() => { });
  }, 800);
}

// ---------- PNG 書き出し ----------

/** 現在のシーンを W×H で 1 枚レンダリングして PNG blob(または jpeg dataURL)を返す */
async function renderShot(W, H, asDataURL) {
  const s = state.settings;
  for (const c of state.characters) { c.updateGaze(activeCamera); c.vrm.update(0.016); }
  scene.updateMatrixWorld();
  const w = canvas.clientWidth, h = canvas.clientHeight;
  const pr = renderer.getPixelRatio();
  const cam = activeCamera;
  const At = W / H;

  // ガイド枠と一致する範囲を切り出すカメラ設定。
  // 枠の縦がビューポートの何割かぶんだけ画角を絞れば、枠内=書き出しになる
  const g = guideDims(w, h);
  const fy = g ? g.fh / h : 1;
  let savedPersp = null;
  let savedOrtho = null;
  if (cam.isPerspectiveCamera) {
    savedPersp = { fov: cam.fov, aspect: cam.aspect };
    const t = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2) * fy;
    cam.fov = THREE.MathUtils.radToDeg(2 * Math.atan(t));
    cam.aspect = At;
    cam.updateProjectionMatrix();
  } else {
    savedOrtho = { left: cam.left, right: cam.right, top: cam.top, bottom: cam.bottom };
    const top = cam.top * fy;
    cam.top = top; cam.bottom = -top;
    cam.right = top * At; cam.left = -top * At;
    cam.updateProjectionMatrix();
  }

  const prevHandles = s.showHandles;
  const prevGrid = grid.visible;
  s.showHandles = false;
  for (const o of allOwners()) o.handleGroup.visible = false;
  grid.visible = false;
  if (s.alphaExport) { scene.background = null; renderer.setClearAlpha(0); }

  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  renderer.render(scene, cam);
  let result;
  if (asDataURL) result = canvas.toDataURL('image/jpeg', 0.7);
  else result = await new Promise((res) => canvas.toBlob(res, 'image/png'));

  renderer.setPixelRatio(pr);
  renderer.setSize(w, h, false);
  if (savedPersp) {
    cam.fov = savedPersp.fov;
    cam.aspect = savedPersp.aspect;
  } else if (savedOrtho) {
    Object.assign(cam, savedOrtho);
  }
  cam.updateProjectionMatrix();
  s.showHandles = prevHandles;
  grid.visible = prevGrid;
  if (s.alphaExport) { scene.background = new THREE.Color(s.bgColor); renderer.setClearAlpha(1); }
  return result;
}

async function exportPNG() {
  if (!state.characters.length && !state.props.length) { toast('モデルがありません'); return; }
  const [W, H] = exportSize();
  const blob = await renderShot(W, H, false);
  if (!blob) { toast('書き出しに失敗しました'); return; }
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  await deliverFile(blob, `pose_${stamp}.png`, 'image/png');
}

/** 保存先ダイアログ(対応ブラウザ)→ 共有シート(iPad)→ ダウンロード の順。⚙の直接ダウンロード ON なら即ダウンロード */
async function deliverFile(blob, name, type) {
  if (state.settings.directDownload) { downloadBlob(blob, name); return; }
  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: name,
        types: [{ description: type, accept: { [type]: ['.' + name.split('.').pop()] } }],
      });
      const w = await handle.createWritable();
      await w.write(blob);
      await w.close();
      toast(`保存しました: ${handle.name}`);
      return;
    } catch (err) {
      if (err.name === 'AbortError') return; // キャンセル
      console.warn('save picker failed', err);  // 失敗時は従来経路へ
    }
  }
  const file = new File([blob], name, { type });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return; } catch (err) {
      if (err.name === 'AbortError') return;
    }
  }
  downloadBlob(blob, name);
}

function downloadBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

// ---------- UI 配線 ----------

$('btnAddModel').addEventListener('click', () => {
  const menu = $('addMenu');
  if (!menu.classList.contains('hidden')) { menu.classList.add('hidden'); return; }
  const r = $('btnAddModel').getBoundingClientRect();
  menu.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 240)) + 'px';
  menu.classList.remove('hidden');
});
for (const b of document.querySelectorAll('#addMenu [data-add]')) {
  b.addEventListener('click', () => {
    $('addMenu').classList.add('hidden');
    if (b.dataset.add === 'file') $('fileModel').click();
    else addPrimitive(b.dataset.add);
  });
}
// メニュー外をタップしたら閉じる(＋モデル自身は click 側のトグルに任せる)
document.addEventListener('pointerdown', (e) => {
  const menu = $('addMenu');
  if (menu.classList.contains('hidden')) return;
  if (!menu.contains(e.target) && !$('btnAddModel').contains(e.target)) menu.classList.add('hidden');
});
$('fileModel').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  await addModelFromBuffer(await f.arrayBuffer(), f.name);
});

$('btnExport').addEventListener('click', exportPNG);

function togglePanel(id) {
  for (const p of document.querySelectorAll('.panel')) {
    if (p.id === id) p.classList.toggle('hidden');
    else p.classList.add('hidden');
  }
}
$('btnScenes').addEventListener('click', () => { togglePanel('panelScenes'); refreshSceneList(); });
$('btnSettings').addEventListener('click', () => togglePanel('panelSettings'));
$('btnPose').addEventListener('click', () => { togglePanel('panelPose'); renderPosePanel(); });
$('btnCamera').addEventListener('click', () => togglePanel('panelCamera'));
for (const b of document.querySelectorAll('[data-close]')) {
  b.addEventListener('click', () => b.closest('.panel').classList.add('hidden'));
}

// シーンパネル
function newScene() {
  if (playState) stopContePlay();
  deselect();
  for (const c of [...state.characters]) c.dispose(scene);
  for (const p of [...state.props]) p.dispose(scene);
  state.characters = [];
  state.props = [];
  state.activeChar = null;
  state.pendingChars = null;
  state.pendingProps = null;
  clearUndo();
  state.timeline = { fps: 24, cuts: [] };
  selectedCut = -1;
  const side = state.settings.panelSide; // UI 側の好みだけ引き継ぐ
  Object.assign(state.settings, DEFAULT_SETTINGS, { panelSide: side });
  if (activeCamera !== perspCam) setOrtho(false);
  perspCam.fov = state.settings.fov;
  perspCam.position.set(0, 0.95, 2.8);
  perspCam.updateProjectionMatrix();
  controls.target.set(0, 0.85, 0);
  controls.update();
  scene.background = new THREE.Color(state.settings.bgColor);
  syncSettingsUI();
  setMode('illust');
  renderTimeline(false);
  renderCharUI();
  markDirty();
}
$('btnNewScene').addEventListener('click', () => {
  if (!confirm('現在のキャラクター・小物・カメラ・タイムラインをすべて消して、空のシーンから始めますか?')) return;
  newScene();
  togglePanel('panelScenes');
  toast('新規シーンにしました。＋モデルからモデルを読み込んでください');
});
$('btnSaveScene').addEventListener('click', async () => {
  const name = ($('sceneName').value || '').trim() || '無題';
  await idb.putScene(name, serializeScene());
  toast(`「${name}」を保存しました`);
  refreshSceneList();
});
async function refreshSceneList() {
  const names = await idb.listSceneNames();
  const ul = $('sceneList');
  ul.innerHTML = '';
  for (const name of names) {
    const li = document.createElement('li');
    const span = document.createElement('span');
    span.className = 'name';
    span.textContent = name;
    li.appendChild(span);
    li.appendChild(miniBtn('読込', async () => {
      const data = await idb.getScene(name);
      if (data) { await applyScene(data); toast(`「${name}」を読み込みました`); }
    }));
    const del = miniBtn('✕', async () => {
      if (!confirm(`シーン「${name}」を削除しますか?`)) return;
      await idb.deleteScene(name);
      refreshSceneList();
    });
    del.className = 'del';
    li.appendChild(del);
    ul.appendChild(li);
  }
}
$('btnExportScene').addEventListener('click', () => {
  const name = ($('sceneName').value || '').trim() || 'scene';
  const json = JSON.stringify(serializeScene(), null, 1);
  deliverFile(new Blob([json], { type: 'application/json' }), `vrmpose_${name}.json`, 'application/json');
});
$('btnImportScene').addEventListener('click', () => $('fileScene').click());
$('fileScene').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try {
    await applyScene(JSON.parse(await f.text()));
  } catch (err) {
    toast('シーンファイルを読み込めません: ' + err.message);
  }
});

// 設定パネル
$('bgColor').addEventListener('input', (e) => {
  state.settings.bgColor = e.target.value;
  scene.background = new THREE.Color(e.target.value);
  markDirty();
});
$('alphaToggle').addEventListener('change', (e) => { state.settings.alphaExport = e.target.checked; markDirty(); });
$('directDownload').addEventListener('change', (e) => { state.settings.directDownload = e.target.checked; markDirty(); });
for (const ax of ['X', 'Y', 'Z']) {
  const key = 'light' + ax; // settings のキーも要素 id も lightX / lightY / lightZ
  $(key).addEventListener('input', () => {
    state.settings[key] = parseFloat($(key).value) || 0;
    $('valLight' + ax).textContent = Math.round(state.settings[key]) + '°';
    applyLight();
  });
  $(key).addEventListener('change', markDirty);
}
$('btnLightReset').addEventListener('click', () => {
  state.settings.lightX = DEFAULT_SETTINGS.lightX;
  state.settings.lightY = DEFAULT_SETTINGS.lightY;
  state.settings.lightZ = DEFAULT_SETTINGS.lightZ;
  applyLight();
  syncSettingsUI();
  markDirty();
});
$('aspectSelect').addEventListener('change', (e) => { state.settings.aspect = e.target.value; applyViewProjection(); updateFrameGuide(); markDirty(); });
$('exportLong').addEventListener('change', (e) => {
  state.settings.exportLong = Math.max(256, Math.min(8192, parseInt(e.target.value, 10) || 2048));
  e.target.value = state.settings.exportLong;
  updateFrameGuide();
  markDirty();
});
$('guideScale').addEventListener('input', (e) => {
  state.settings.guideScale = parseInt(e.target.value, 10) || 100;
  $('guideScaleVal').textContent = state.settings.guideScale;
  applyViewProjection();
  updateFrameGuide();
});
$('guideScale').addEventListener('change', markDirty);
$('frameCamToggle').addEventListener('change', (e) => {
  state.settings.frameIsCamera = e.target.checked;
  applyViewProjection();
  markDirty();
});
$('handleToggle').addEventListener('change', (e) => { state.settings.showHandles = e.target.checked; markDirty(); });
$('gridToggle').addEventListener('change', (e) => { state.settings.showGrid = e.target.checked; grid.visible = e.target.checked; markDirty(); });
$('eyeLevelToggle').addEventListener('change', (e) => { state.settings.showEyeLevel = e.target.checked; markDirty(); });
$('handleSize').addEventListener('input', (e) => { state.settings.handleScale = parseFloat(e.target.value); markDirty(); });
$('panelSideSelect').addEventListener('change', (e) => {
  state.settings.panelSide = e.target.value;
  document.body.dataset.panelside = e.target.value;
  markDirty();
});

function syncSettingsUI() {
  const s = state.settings;
  $('fovRange').value = s.fov;
  $('fovVal').textContent = s.fov;
  $('fovMm').textContent = fovToMm(s.fov);
  $('fovRange').disabled = s.ortho;
  $('panelSideSelect').value = s.panelSide || 'left';
  document.body.dataset.panelside = s.panelSide || 'left';
  $('orthoToggle').checked = s.ortho;
  $('bgColor').value = s.bgColor;
  scene.background = scene.background && new THREE.Color(s.bgColor);
  $('alphaToggle').checked = s.alphaExport;
  $('directDownload').checked = !!s.directDownload;
  for (const ax of ['X', 'Y', 'Z']) {
    const key = 'light' + ax;
    if (typeof s[key] !== 'number') s[key] = DEFAULT_SETTINGS[key];
    $(key).value = s[key];
    $('valLight' + ax).textContent = Math.round(s[key]) + '°';
  }
  applyLight();
  $('aspectSelect').value = s.aspect || 'free';
  $('exportLong').value = s.exportLong || 2048;
  $('guideScale').value = s.guideScale || 100;
  $('guideScaleVal').textContent = s.guideScale || 100;
  $('frameCamToggle').checked = !!s.frameIsCamera;
  applyViewProjection();
  updateFrameGuide();
  $('handleToggle').checked = s.showHandles;
  $('gridToggle').checked = s.showGrid;
  grid.visible = s.showGrid;
  $('eyeLevelToggle').checked = s.showEyeLevel !== false;
  $('handleSize').value = s.handleScale;
}

// ---------- コンテモード(タイムライン) ----------
// キーフレーム補間はしない。カット = 状態のスナップショット + ホールドするコマ数。
// 連番書き出しはホールド分を複製したフレーム番号で zip に入れる(タイミングチェック用)

let selectedCut = -1;
let playState = null;

function setMode(m) {
  if (playState) stopContePlay();
  state.mode = m;
  document.body.classList.toggle('conte-mode', m === 'conte');
  $('modeIllust').classList.toggle('active', m === 'illust');
  $('modeConte').classList.toggle('active', m === 'conte');
  $('conteBar').classList.toggle('hidden', m !== 'conte');
  if (m === 'conte') renderTimeline(false);
}
$('modeIllust').addEventListener('click', () => setMode('illust'));
$('modeConte').addEventListener('click', () => setMode('conte'));

async function makeThumb() {
  const [W, H] = exportSize(160);
  return await renderShot(W, H, true);
}

async function addCut() {
  if (!state.characters.length && !state.props.length) { toast('モデルがありません'); return; }
  const cut = { frames: 12, state: captureShot(), thumb: await makeThumb() };
  const at = selectedCut >= 0 ? selectedCut + 1 : state.timeline.cuts.length;
  state.timeline.cuts.splice(at, 0, cut);
  selectedCut = at;
  renderTimeline(false);
  markDirty();
}

async function updateCut() {
  const cut = state.timeline.cuts[selectedCut];
  if (!cut) { toast('カットが選択されていません'); return; }
  cut.state = captureShot();
  cut.thumb = await makeThumb();
  renderTimeline(false);
  markDirty();
  toast(`カット${selectedCut + 1}を上書きしました`);
}

function deleteCut() {
  const cut = state.timeline.cuts[selectedCut];
  if (!cut) return;
  if (!confirm(`カット${selectedCut + 1}を削除しますか?`)) return;
  state.timeline.cuts.splice(selectedCut, 1);
  if (selectedCut >= state.timeline.cuts.length) selectedCut = state.timeline.cuts.length - 1;
  renderTimeline(false);
  markDirty();
}

function moveCut(dir) {
  const cuts = state.timeline.cuts;
  const j = selectedCut + dir;
  if (selectedCut < 0 || j < 0 || j >= cuts.length) return;
  const tmp = cuts[selectedCut];
  cuts[selectedCut] = cuts[j];
  cuts[j] = tmp;
  selectedCut = j;
  renderTimeline(false);
  markDirty();
}

function selectCut(i, apply) {
  selectedCut = i;
  if (apply && state.timeline.cuts[i]) {
    pushUndo();
    applyShot(state.timeline.cuts[i].state);
    syncBoneSliders();
  }
  renderTimeline(false);
}

function totalFrames() {
  return state.timeline.cuts.reduce((a, c) => a + (c.frames | 0), 0);
}

function updateConteInfo() {
  const cuts = state.timeline.cuts;
  const total = totalFrames();
  $('conteInfo').textContent =
    `${cuts.length}カット / ${total}コマ / ${(total / state.timeline.fps).toFixed(2)}秒`;
}

// タイムライン: 目盛り + カット帯 + キー(◆ = カット終端。左右ドラッグでコマ数を増減) + 再生ヘッド
let tlPxf = 8;        // 1コマの幅(px)
let tlSegEls = [];
let tlKeyEls = [];

function renderTimeline(highlightOnly) {
  updateConteInfo();
  $('conteFps').value = String(state.timeline.fps);
  if (state.timeline.exportLong) $('conteLong').value = state.timeline.exportLong;
  const cuts = state.timeline.cuts;
  const cut = cuts[selectedCut];
  $('selFrames').disabled = !cut;
  if (cut) $('selFrames').value = cut.frames;
  if (highlightOnly) {
    tlSegEls.forEach((el, i) => el.classList.toggle('selected', i === selectedCut));
    return;
  }
  $('tlEmpty').classList.toggle('hidden', !!cuts.length);
  $('tlInner').style.display = cuts.length ? '' : 'none';
  const track = $('tlTrack');
  track.innerHTML = '';
  tlSegEls = [];
  tlKeyEls = [];
  if (!cuts.length) { $('tlPlayhead').classList.add('hidden'); return; }

  const avail = Math.max(200, ($('tlZone').clientWidth || 600) - 24);
  tlPxf = Math.max(4, Math.min(16, avail / Math.max(totalFrames(), 1)));

  cuts.forEach((c, i) => {
    const seg = document.createElement('div');
    seg.className = 'tl-cut' + (i === selectedCut ? ' selected' : '');
    if (c.thumb) seg.style.backgroundImage = `url(${c.thumb})`;
    const lb = document.createElement('span');
    lb.className = 'tl-label';
    lb.textContent = String(i + 1);
    const fr = document.createElement('span');
    fr.className = 'tl-frames';
    seg.appendChild(lb);
    seg.appendChild(fr);
    seg.addEventListener('click', () => selectCut(i, true));
    track.appendChild(seg);
    tlSegEls.push(seg);

    const key = document.createElement('div');
    key.className = 'tl-key';
    key.addEventListener('pointerdown', (e) => startKeyDrag(e, i, key));
    track.appendChild(key);
    tlKeyEls.push(key);
  });
  layoutTimeline();
}

/** DOM を作り直さず、コマ数から位置と幅だけ更新する(キーのドラッグ中に呼ぶ) */
function layoutTimeline() {
  const cuts = state.timeline.cuts;
  const fps = state.timeline.fps;
  const total = totalFrames();
  const width = total * tlPxf + 40;
  $('tlInner').style.width = width + 'px';

  const ruler = $('tlRuler');
  ruler.innerHTML = '';
  ruler.style.width = width + 'px';
  const frameStep = tlPxf >= 7 ? 1 : (tlPxf >= 4 ? 2 : 6);
  for (let f = 0; f <= total; f += frameStep) {
    if (f % fps === 0) continue;
    const t = document.createElement('div');
    t.className = 'tl-tick';
    t.style.left = (f * tlPxf) + 'px';
    ruler.appendChild(t);
  }
  for (let s = 0; s * fps <= total; s++) {
    const t = document.createElement('div');
    t.className = 'tl-tick sec';
    t.style.left = (s * fps * tlPxf) + 'px';
    ruler.appendChild(t);
    const lb = document.createElement('div');
    lb.className = 'tl-ticklabel';
    lb.style.left = (s * fps * tlPxf) + 'px';
    lb.textContent = s + 's';
    ruler.appendChild(lb);
  }

  let start = 0;
  cuts.forEach((c, i) => {
    const w = (c.frames | 0) * tlPxf;
    tlSegEls[i].style.left = (start * tlPxf) + 'px';
    tlSegEls[i].style.width = Math.max(w - 2, 6) + 'px';
    tlSegEls[i].querySelector('.tl-frames').textContent = c.frames + 'k';
    tlKeyEls[i].style.left = ((start + (c.frames | 0)) * tlPxf) + 'px';
    start += c.frames | 0;
  });
}

function startKeyDrag(e, i, el) {
  e.preventDefault();
  e.stopPropagation();
  const cut = state.timeline.cuts[i];
  if (!cut) return;
  const dragCtx = { pointerId: e.pointerId, startX: e.clientX, orig: cut.frames | 0 };
  el.classList.add('dragging');
  try { el.setPointerCapture(e.pointerId); } catch (_) { }
  const move = (ev) => {
    if (ev.pointerId !== dragCtx.pointerId) return;
    const d = Math.round((ev.clientX - dragCtx.startX) / tlPxf);
    const v = Math.max(1, Math.min(999, dragCtx.orig + d));
    if (v !== cut.frames) {
      cut.frames = v;
      layoutTimeline();
      updateConteInfo();
      if (i === selectedCut) $('selFrames').value = v;
    }
    ev.preventDefault();
  };
  const up = (ev) => {
    if (ev.pointerId !== dragCtx.pointerId) return;
    el.classList.remove('dragging');
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', up);
    renderTimeline(false); // コマ幅を再フィット
    markDirty();
  };
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
}

// 目盛りのドラッグでスクラブ(そのコマのカットを適用)
function frameAtX(clientX) {
  const rect = $('tlInner').getBoundingClientRect();
  return Math.max(0, Math.round((clientX - rect.left) / tlPxf));
}
function cutAtFrame(f) {
  const cuts = state.timeline.cuts;
  let start = 0;
  for (let i = 0; i < cuts.length; i++) {
    start += cuts[i].frames | 0;
    if (f < start) return i;
  }
  return cuts.length - 1;
}
function setPlayhead(f) {
  const ph = $('tlPlayhead');
  ph.style.left = (f * tlPxf) + 'px';
  ph.classList.remove('hidden');
}
let scrubbing = null;
function scrubTo(clientX) {
  const f = Math.min(frameAtX(clientX), Math.max(totalFrames() - 1, 0));
  setPlayhead(f);
  const i = cutAtFrame(f);
  if (i !== selectedCut && state.timeline.cuts[i]) {
    selectedCut = i;
    applyShot(state.timeline.cuts[i].state);
    syncBoneSliders();
    renderTimeline(true);
  }
}
$('tlRuler').addEventListener('pointerdown', (e) => {
  if (!state.timeline.cuts.length) return;
  if (playState) stopContePlay();
  pushUndo();
  scrubbing = { pointerId: e.pointerId };
  try { $('tlRuler').setPointerCapture(e.pointerId); } catch (_) { }
  scrubTo(e.clientX);
  e.preventDefault();
});
$('tlRuler').addEventListener('pointermove', (e) => {
  if (scrubbing && e.pointerId === scrubbing.pointerId) scrubTo(e.clientX);
});
for (const ev of ['pointerup', 'pointercancel']) {
  $('tlRuler').addEventListener(ev, (e) => {
    if (scrubbing && e.pointerId === scrubbing.pointerId) { scrubbing = null; markDirty(); }
  });
}

function markPlaying(i) {
  tlSegEls.forEach((el, k) => el.classList.toggle('playing', k === i));
}

function stopContePlay() {
  if (!playState) return;
  clearInterval(playState.timer);
  applyShot(playState.working);
  markPlaying(-1);
  $('tlPlayhead').classList.add('hidden');
  playState = null;
  $('contePlay').textContent = '▶ 再生';
}

function toggleContePlay() {
  if (playState) { stopContePlay(); return; }
  const cuts = state.timeline.cuts;
  if (!cuts.length) { toast('カットがありません'); return; }
  const working = captureShot();
  let cutIdx = 0;
  let frameInCut = 0;
  let globalFrame = 0;
  applyShot(cuts[0].state);
  selectedCut = 0;
  renderTimeline(true);
  markPlaying(0);
  setPlayhead(0);
  $('contePlay').textContent = '■ 停止';
  playState = {
    working,
    timer: setInterval(() => {
      frameInCut++;
      globalFrame++;
      if (frameInCut >= (cuts[cutIdx].frames | 0)) {
        cutIdx++;
        frameInCut = 0;
        if (cutIdx >= cuts.length) { stopContePlay(); return; }
        applyShot(cuts[cutIdx].state);
        selectedCut = cutIdx;
        renderTimeline(true);
        markPlaying(cutIdx);
      }
      setPlayhead(globalFrame);
    }, 1000 / state.timeline.fps),
  };
}

async function exportConte() {
  const cuts = state.timeline.cuts;
  if (!cuts.length) { toast('カットがありません'); return; }
  if (playState) stopContePlay();
  const fps = state.timeline.fps;
  const long = Math.max(256, Math.min(4096, parseInt($('conteLong').value, 10) || 960));
  state.timeline.exportLong = long;
  const [W, H] = exportSize(long);
  const working = captureShot();
  showLoading(true);
  try {
    const entries = [];
    let frame = 1;
    for (const cut of cuts) {
      applyShot(cut.state);
      const blob = await renderShot(W, H, false);
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const crc = crc32(bytes);
      for (let k = 0; k < (cut.frames | 0); k++) {
        entries.push({ name: `conte_${String(frame).padStart(4, '0')}.png`, data: bytes, crc });
        frame++;
      }
    }
    entries.push({
      name: 'timeline.json',
      data: new TextEncoder().encode(JSON.stringify({
        fps,
        totalFrames: frame - 1,
        cuts: cuts.map((c, i) => ({ cut: i + 1, frames: c.frames })),
      }, null, 1)),
    });
    const zip = buildZip(entries);
    await deliverFile(zip, `conte_${fps}fps.zip`, 'application/zip');
    toast(`${frame - 1}フレーム(${cuts.length}カット)を書き出しました`);
  } catch (err) {
    console.error(err);
    toast('書き出しに失敗しました: ' + err.message);
  } finally {
    applyShot(working);
    showLoading(false);
  }
}

$('cutAdd').addEventListener('click', addCut);
$('cutUpdate').addEventListener('click', updateCut);
$('cutDelete').addEventListener('click', deleteCut);
$('cutLeft').addEventListener('click', () => moveCut(-1));
$('cutRight').addEventListener('click', () => moveCut(1));
$('conteFps').addEventListener('change', (e) => {
  state.timeline.fps = parseInt(e.target.value, 10) || 24;
  renderTimeline(false); // 秒目盛りが変わる
  markDirty();
});
$('selFrames').addEventListener('change', (e) => {
  const cut = state.timeline.cuts[selectedCut];
  if (!cut) return;
  cut.frames = Math.max(1, Math.min(999, parseInt(e.target.value, 10) || 1));
  e.target.value = cut.frames;
  renderTimeline(false);
  markDirty();
});
$('conteLong').addEventListener('change', (e) => {
  state.timeline.exportLong = Math.max(256, Math.min(4096, parseInt(e.target.value, 10) || 960));
  e.target.value = state.timeline.exportLong;
  markDirty();
});
$('contePlay').addEventListener('click', toggleContePlay);
$('conteExport').addEventListener('click', exportConte);

// ---------- ツールチップ(ホバー2秒) ----------

let tipTimer = 0;
function showTip(el) {
  const tip = $('tooltip');
  tip.textContent = el.dataset.tip;
  tip.classList.remove('hidden');
  const r = el.getBoundingClientRect();
  tip.style.left = '0px';
  tip.style.top = '0px';
  const tw = tip.offsetWidth;
  let x = r.left + r.width / 2 - tw / 2;
  x = Math.max(8, Math.min(x, window.innerWidth - tw - 8));
  tip.style.left = x + 'px';
  tip.style.top = (r.bottom + 8) + 'px';
}
function hideTip() {
  clearTimeout(tipTimer);
  $('tooltip').classList.add('hidden');
}
for (const el of document.querySelectorAll('[data-tip]')) {
  el.addEventListener('pointerenter', (e) => {
    if (e.pointerType === 'touch') return;
    clearTimeout(tipTimer);
    tipTimer = setTimeout(() => showTip(el), 1000);
  });
  el.addEventListener('pointerleave', hideTip);
  el.addEventListener('pointerdown', hideTip);
}

// ---------- 通知類 ----------

let toastTimer = 0;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 3000);
}
function showLoading(on) {
  $('loading').classList.toggle('hidden', !on);
}

// ---------- 使い方スライド ----------

{
  const overlay = $('helpOverlay');
  const slidesEl = $('helpSlides');
  const slides = [...slidesEl.querySelectorAll('.hs')];
  const dots = $('helpDots');
  let cur = 0;
  for (let i = 0; i < slides.length; i++) {
    const d = document.createElement('div');
    d.className = 'hdot';
    d.addEventListener('click', () => showHelp(i));
    dots.appendChild(d);
  }
  function showHelp(i) {
    cur = Math.max(0, Math.min(slides.length - 1, i));
    slides.forEach((s, j) => s.classList.toggle('active', j === cur));
    [...dots.children].forEach((d, j) => d.classList.toggle('active', j === cur));
    $('helpPrev').disabled = cur === 0;
    $('helpNext').textContent = cur === slides.length - 1 ? '閉じる' : '次へ ▶';
    $('helpTitle').textContent = `使い方 ${cur + 1} / ${slides.length}`;
    slidesEl.scrollTop = 0;
  }
  const openHelp = () => { overlay.classList.remove('hidden'); showHelp(0); };
  const closeHelp = () => overlay.classList.add('hidden');
  $('btnHelp').addEventListener('click', () => {
    for (const p of document.querySelectorAll('.panel')) p.classList.add('hidden');
    openHelp();
  });
  $('helpClose').addEventListener('click', closeHelp);
  $('helpPrev').addEventListener('click', () => showHelp(cur - 1));
  $('helpNext').addEventListener('click', () => {
    if (cur === slides.length - 1) closeHelp(); else showHelp(cur + 1);
  });
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeHelp(); });
  // スワイプでページ送り
  let swipe = null;
  slidesEl.addEventListener('pointerdown', (e) => { swipe = { x: e.clientX, y: e.clientY }; });
  slidesEl.addEventListener('pointerup', (e) => {
    if (!swipe) return;
    const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
    swipe = null;
    if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.5) showHelp(cur + (dx < 0 ? 1 : -1));
  });
  document.addEventListener('keydown', (e) => {
    if (overlay.classList.contains('hidden')) return;
    if (e.key === 'ArrowRight') showHelp(cur + 1);
    else if (e.key === 'ArrowLeft') showHelp(cur - 1);
    else if (e.key === 'Escape') closeHelp();
  });
  // 初回起動時は自動で開く
  try {
    if (!localStorage.getItem('vrmpose_help_seen')) {
      localStorage.setItem('vrmpose_help_seen', '1');
      openHelp();
    }
  } catch (_) { /* localStorage 不可の環境では手動のみ */ }
}

// ---------- 起動 ----------

async function boot() {
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().catch(() => { });
  }
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('./sw.js').catch(() => { });
  }
  syncSettingsUI();
  try {
    const saved = await idb.getKV('autosave');
    if (saved && saved.characters && saved.characters.length) {
      await applyScene(saved);
      return;
    }
  } catch (err) {
    console.warn('autosave restore failed', err);
  }
  // 初回起動: 既定素体(男女)を読み込む
  try {
    showLoading(true);
    for (const [file, x] of [['sotai_girl.vrm', -0.4], ['sotai_boy.vrm', 0.4]]) {
      const res = await fetch('./assets/' + file);
      if (!res.ok) continue;
      await addModelFromBuffer(await res.arrayBuffer(), file);
      const char = state.characters[state.characters.length - 1];
      if (char) char.root.position.set(x, 0, 0);
    }
    markDirty();
  } catch (err) {
    console.warn('default sotai load failed', err);
  } finally {
    showLoading(false);
  }
  if (!state.characters.length) {
    toast('右上の「＋モデル」から VRM を読み込んでください');
  }
}
boot();

// ---------- デバッグ / テスト用フック ----------

window.app = {
  THREE, state, scene, renderer,
  get camera() { return activeCamera; },
  get controls() { return controls; },
  serializeScene, applyScene, exportPNG, pickHandle, updateEyeLine, renderShot,
  async loadVRMFromURL(url) {
    const res = await fetch(url);
    const buf = await res.arrayBuffer();
    await addModelFromBuffer(buf, url.split('/').pop());
  },
  selectBone(charIndex, boneName) {
    const char = state.characters[charIndex];
    if (!char) return false;
    const h = char.handles.find((x) => x.userData.def.bone === boneName);
    if (!h) return false;
    select({ char, handle: h });
    return true;
  },
  handleScreenPos(charIndex, boneName) {
    const char = state.characters[charIndex];
    if (!char) return null;
    const h = char.handles.find((x) => x.userData.def.bone === boneName);
    if (!h) return null;
    const rect = canvas.getBoundingClientRect();
    const v = h.position.clone().project(activeCamera);
    return {
      x: (v.x * 0.5 + 0.5) * rect.width + rect.left,
      y: (-v.y * 0.5 + 0.5) * rect.height + rect.top,
    };
  },
};
