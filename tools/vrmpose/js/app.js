// VRM Pose Ref 本体: レンダリング、ハンドル操作(IK/FK)、UI、保存
import * as THREE from 'three';
import { OrbitControls } from '../vendor/controls/OrbitControls.js';
import { Character, Prop, loadAsset, BONE_PARENT, HAND_POSES } from './character.js';
import { idb, hashBuffer } from './store.js';
import { aimBone, solveTwoBoneIK, decomposeRot, composeRot, twistBone } from './ik.js';
import { buildZip, crc32 } from './zip.js';

const $ = (id) => document.getElementById(id);
const canvas = $('view');

const state = {
  characters: [],
  props: [],                // 小物(glTF/GLB)
  selection: null,          // { char, handle } ※char は Prop のこともある
  activeChar: null,
  pendingChars: null,       // シーン読込時にモデル未所持だったキャラ状態
  pendingProps: null,
  mode: 'illust',           // 'illust' | 'conte'
  timeline: { fps: 24, cuts: [] },  // カット = { frames, thumb, state }
  settings: {
    fov: 30, ortho: false, bgColor: '#3a3f47', alphaExport: false,
    aspect: 'free', exportLong: 2048, showHandles: true, showGrid: true, handleScale: 1,
    panelSide: 'left', showEyeLevel: true,
  },
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
dirLight.position.set(1.2, 2.4, 1.8);
scene.add(dirLight);

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
  updateFrameGuide();
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

/** 書き出し範囲のガイド枠をビューポートに重ねる */
function updateFrameGuide() {
  const el = $('frameGuide');
  const dims = $('exportDims');
  const [ew, eh] = exportSize();
  if (dims) dims.textContent = `書き出しサイズ: ${ew} × ${eh} px`;
  const ar = aspectValue();
  if (ar === null) { el.classList.add('hidden'); return; }
  const rect = canvas.getBoundingClientRect();
  let fw = rect.width;
  let fh = fw / ar;
  if (fh > rect.height) { fh = rect.height; fw = fh * ar; }
  el.style.left = (rect.left + (rect.width - fw) / 2) + 'px';
  el.style.top = (rect.top + (rect.height - fh) / 2) + 'px';
  el.style.width = fw + 'px';
  el.style.height = fh + 'px';
  el.classList.remove('hidden');
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
  } else if (pickedMode === 'twist') {
    // 捻りサテライトは対象の手/足を選択扱いにする
    const jointHandle = hit.char.handles.find(
      (x) => x.userData.def.bone === hit.handle.userData.def.bone && x.userData.def.mode !== 'twist',
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
    const info = char.twistInfo(def.bone, def.parent);
    if (!info) { drag = null; controls.enabled = true; return; }
    ctx.twistNode = char.bone(def.bone);
    ctx.twistAxis = info.axis;
    ctx.twistCenter = info.joint;
    ctx.grabDir = info.offsetDir;
    ctx.twistStartQuat = ctx.twistNode.quaternion.clone();
    ctx.tPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(info.axis, info.joint);
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
  } else {
    const parentName = BONE_PARENT[def.bone];
    const resolved = char.resolveBone(parentName);
    ctx.rotNode = resolved ? resolved.node : null;
  }
  drag = ctx;
  e.preventDefault();
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
    // サテライトを円周に沿って追わせ、掴んだ位置からの回転角をボーンの捻りにする
    if (!pointerToPlane(e, drag.tPlane, _v3a)) return;
    _v3a.sub(drag.twistCenter);
    if (_v3a.lengthSq() < 1e-8) return;
    _v3a.normalize();
    _v3b.crossVectors(drag.grabDir, _v3a);
    const angle = Math.atan2(_v3b.dot(drag.twistAxis), drag.grabDir.dot(_v3a));
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
  } else if (def.mode === 'ik') {
    solveTwoBoneIK(drag.chain[0], drag.chain[1], drag.chain[2], target, drag.fallbackBend, drag.forceBend);
    if (drag.footQuat) {
      const foot = drag.chain[2];
      foot.parent.updateWorldMatrix(true, false);
      _q1s.copy(foot.parent.getWorldQuaternion(_q2s)).invert();
      foot.quaternion.copy(_q1s.multiply(drag.footQuat)).normalize();
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
  for (const el of document.querySelectorAll('.curl-only')) el.classList.toggle('hidden', !isHand);
  for (const el of document.querySelectorAll('.scale-only')) el.classList.toggle('hidden', !isProp);
  if (isHand) {
    const v = hit.char.masterCurl(def.bone === 'leftHand' ? 'left' : 'right');
    $('curlSlider').value = v;
    $('valCurl').textContent = (+v).toFixed(2);
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
    $(valId).textContent = Math.round(deg) + '°';
  };
  set('jogTwist', 'valTwist', r.twist);
  set('jogPitch', 'valPitch', r.pitch);
  set('jogYaw', 'valYaw', r.yaw);
  const sel = state.selection;
  if (sel.char.isProp) {
    $('propScale').value = sel.char.root.scale.x;
    $('valScale').textContent = sel.char.root.scale.x.toFixed(2);
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
  $('valTwist').textContent = Math.round(THREE.MathUtils.radToDeg(t)) + '°';
  $('valPitch').textContent = Math.round(THREE.MathUtils.radToDeg(p)) + '°';
  $('valYaw').textContent = Math.round(THREE.MathUtils.radToDeg(y)) + '°';
}
function onSliderEnd() { sliderActive = false; sliderPins = null; markDirty(); }
for (const id of ['jogTwist', 'jogPitch', 'jogYaw']) {
  $(id).addEventListener('input', onRotSliderInput);
  $(id).addEventListener('change', onSliderEnd);
}

$('propScale').addEventListener('input', () => {
  const sel = state.selection;
  if (!sel || !sel.char.isProp) return;
  if (!sliderActive) { sliderActive = true; pushUndo(); }
  const v = parseFloat($('propScale').value);
  sel.char.root.scale.setScalar(v);
  $('valScale').textContent = v.toFixed(2);
});
$('propScale').addEventListener('change', onSliderEnd);

$('curlSlider').addEventListener('input', () => {
  if (!state.selection || state.selection.char.isProp) return;
  if (!sliderActive) { sliderActive = true; pushUndo(); }
  const { char, handle } = state.selection;
  const side = handle.userData.def.bone === 'leftHand' ? 'left' : 'right';
  const v = parseFloat($('curlSlider').value);
  char.setCurl(side, v);
  $('valCurl').textContent = v.toFixed(2);
});
$('curlSlider').addEventListener('change', onSliderEnd);

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
  if (char) {
    $('gazeCamera').checked = char.gaze.mode === 'camera';
    $('gazeYaw').value = char.gaze.yaw;
    $('valGazeYaw').textContent = Math.round(char.gaze.yaw) + '°';
    $('gazePitch').value = char.gaze.pitch;
    $('valGazePitch').textContent = Math.round(char.gaze.pitch) + '°';
  }
  const list = $('expressionList');
  list.innerHTML = '';
  if (!char) return;
  const names = char.listExpressions().filter((n) => !/^look/.test(n) && n !== 'neutral');
  if (!names.length) {
    list.innerHTML = '<p class="note">このモデルに表情はありません</p>';
    return;
  }
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

function removeProp(prop) {
  if (state.selection && state.selection.char === prop) deselect();
  prop.dispose(scene);
  state.props = state.props.filter((p) => p !== prop);
  clearUndo();
  afterCharsChanged();
}

async function duplicateProp(prop) {
  const rec = await idb.getModel(prop.modelKey);
  if (!rec) { toast('モデルデータが見つかりません'); return; }
  showLoading(true);
  try {
    const buf = await rec.blob.arrayBuffer();
    const st = prop.serialize();
    const copy = await createProp(buf, prop.modelKey, prop.name + ' コピー');
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
    activeCamera = orthoCam;
  } else {
    perspCam.position.copy(pos);
    activeCamera = perspCam;
  }
  controls.dispose();
  controls = makeControls(activeCamera);
  controls.target.copy(target);
  controls.update();
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
  perspCam.fov = v;
  perspCam.updateProjectionMatrix();
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
  perspCam.fov = state.settings.fov;
  perspCam.updateProjectionMatrix();
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
    const rec = await idb.getModel(ps.modelKey);
    if (!rec) { missingProps.push(ps); continue; }
    const buf = await rec.blob.arrayBuffer();
    const prop = await createProp(buf, ps.modelKey, ps.name || rec.name);
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
  const Ac = w / h;
  const At = W / H;

  // ガイド枠と一致する範囲を切り出すカメラ設定(枠が縦長なら左右を、横長なら上下を削る)
  let savedPersp = null;
  let savedOrtho = null;
  if (cam.isPerspectiveCamera) {
    savedPersp = { fov: cam.fov, aspect: cam.aspect };
    let fov = cam.fov;
    if (At > Ac) {
      const t = Math.tan(THREE.MathUtils.degToRad(fov) / 2) * (Ac / At);
      fov = THREE.MathUtils.radToDeg(2 * Math.atan(t));
    }
    cam.fov = fov;
    cam.aspect = At;
    cam.updateProjectionMatrix();
  } else {
    savedOrtho = { left: cam.left, right: cam.right, top: cam.top, bottom: cam.bottom };
    let top = cam.top, right = cam.right;
    if (At <= Ac) right = top * At;
    else top = right / At;
    cam.top = top; cam.bottom = -top;
    cam.right = right; cam.left = -right;
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

/** iPad なら共有シート、それ以外はダウンロード */
async function deliverFile(blob, name, type) {
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

$('btnAddModel').addEventListener('click', () => $('fileModel').click());
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
  downloadBlob(new Blob([json], { type: 'application/json' }), `vrmpose_${name}.json`);
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
$('aspectSelect').addEventListener('change', (e) => { state.settings.aspect = e.target.value; updateFrameGuide(); markDirty(); });
$('exportLong').addEventListener('change', (e) => {
  state.settings.exportLong = Math.max(256, Math.min(8192, parseInt(e.target.value, 10) || 2048));
  e.target.value = state.settings.exportLong;
  updateFrameGuide();
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
  $('aspectSelect').value = s.aspect || 'free';
  $('exportLong').value = s.exportLong || 2048;
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

function updateConteInfo() {
  const cuts = state.timeline.cuts;
  const total = cuts.reduce((a, c) => a + (c.frames | 0), 0);
  $('conteInfo').textContent =
    `${cuts.length}カット / ${total}コマ / ${(total / state.timeline.fps).toFixed(2)}秒`;
}

function renderTimeline(highlightOnly) {
  updateConteInfo();
  $('conteFps').value = String(state.timeline.fps);
  if (state.timeline.exportLong) $('conteLong').value = state.timeline.exportLong;
  const list = $('cutList');
  if (highlightOnly) {
    [...list.children].forEach((el2, i) => el2.classList.toggle('selected', i === selectedCut));
    return;
  }
  list.innerHTML = '';
  state.timeline.cuts.forEach((cut, i) => {
    const chip = document.createElement('div');
    chip.className = 'cut-chip' + (i === selectedCut ? ' selected' : '');
    const img = document.createElement('img');
    if (cut.thumb) img.src = cut.thumb;
    chip.appendChild(img);
    const head = document.createElement('div');
    head.className = 'cut-head';
    const idx = document.createElement('span');
    idx.textContent = String(i + 1);
    head.appendChild(idx);
    const fr = document.createElement('input');
    fr.type = 'number';
    fr.min = 1; fr.max = 999;
    fr.value = cut.frames;
    fr.addEventListener('click', (e) => e.stopPropagation());
    fr.addEventListener('change', () => {
      cut.frames = Math.max(1, Math.min(999, parseInt(fr.value, 10) || 1));
      fr.value = cut.frames;
      updateConteInfo();
      markDirty();
    });
    head.appendChild(fr);
    head.appendChild(Object.assign(document.createElement('span'), { textContent: 'k' }));
    chip.appendChild(head);
    chip.addEventListener('click', () => selectCut(i, true));
    list.appendChild(chip);
  });
}

function stopContePlay() {
  if (!playState) return;
  clearInterval(playState.timer);
  applyShot(playState.working);
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
  applyShot(cuts[0].state);
  selectedCut = 0;
  renderTimeline(true);
  $('contePlay').textContent = '■ 停止';
  playState = {
    working,
    timer: setInterval(() => {
      frameInCut++;
      if (frameInCut >= (cuts[cutIdx].frames | 0)) {
        cutIdx++;
        frameInCut = 0;
        if (cutIdx >= cuts.length) { stopContePlay(); return; }
        applyShot(cuts[cutIdx].state);
        selectedCut = cutIdx;
        renderTimeline(true);
      }
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
  updateConteInfo();
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
  toast('右上の「＋モデル」から VRM を読み込んでください');
}
boot();

// ---------- デバッグ / テスト用フック ----------

window.app = {
  THREE, state, scene, renderer,
  get camera() { return activeCamera; },
  get controls() { return controls; },
  serializeScene, applyScene, exportPNG, pickHandle, updateEyeLine,
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
