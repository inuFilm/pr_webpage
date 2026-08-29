// VRM 読み込みと 1 キャラクター分の状態(ポーズは three-vrm の正規化ボーン空間で扱う)
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { composeRot, solveTwoBoneIK } from './ik.js';

// VRM ヒューマノイドの親子関係(モデルに無いボーンは resolveBone で祖先へ遡る)
export const BONE_PARENT = {
  spine: 'hips', chest: 'spine', upperChest: 'chest', neck: 'upperChest', head: 'neck',
  leftShoulder: 'upperChest', leftUpperArm: 'leftShoulder', leftLowerArm: 'leftUpperArm', leftHand: 'leftLowerArm',
  rightShoulder: 'upperChest', rightUpperArm: 'rightShoulder', rightLowerArm: 'rightUpperArm', rightHand: 'rightLowerArm',
  leftUpperLeg: 'hips', leftLowerLeg: 'leftUpperLeg', leftFoot: 'leftLowerLeg', leftToes: 'leftFoot',
  rightUpperLeg: 'hips', rightLowerLeg: 'rightUpperLeg', rightFoot: 'rightLowerLeg', rightToes: 'rightFoot',
};

export const POSE_BONES = Object.keys(BONE_PARENT).concat(['hips']);

const FINGER_SEGS = { Thumb: ['Metacarpal', 'Proximal', 'Distal'] };
for (const f of ['Index', 'Middle', 'Ring', 'Little']) FINGER_SEGS[f] = ['Proximal', 'Intermediate', 'Distal'];

export const FINGER_BONES = [];
for (const side of ['left', 'right']) {
  for (const [finger, segs] of Object.entries(FINGER_SEGS)) {
    for (const seg of segs) FINGER_BONES.push(side + finger + seg);
  }
}

// 操作ハンドル定義。mode: root=全体移動 / hips=腰だけ移動(足は接地固定) /
// ik=2ボーンIK / fk=親ボーンのエイム回転
// requires: このボーンが無いモデルではハンドルを出さない
const HANDLE_DEFS = [
  { bone: '__root', mode: 'root' },
  { bone: 'hips', mode: 'hips' },
  { bone: 'spine', mode: 'fk' },
  { bone: 'chest', mode: 'fk' },
  { bone: 'neck', mode: 'fk' },
  { bone: 'head', mode: 'fk' },
  { bone: 'leftUpperArm', mode: 'fk', requires: 'leftShoulder' },
  { bone: 'rightUpperArm', mode: 'fk', requires: 'rightShoulder' },
  { bone: 'leftLowerArm', mode: 'fk' },
  { bone: 'rightLowerArm', mode: 'fk' },
  { bone: 'leftHand', mode: 'ik', chain: ['leftUpperArm', 'leftLowerArm', 'leftHand'] },
  { bone: 'rightHand', mode: 'ik', chain: ['rightUpperArm', 'rightLowerArm', 'rightHand'] },
  { bone: 'leftLowerLeg', mode: 'fk' },
  { bone: 'rightLowerLeg', mode: 'fk' },
  { bone: 'leftFoot', mode: 'ik', chain: ['leftUpperLeg', 'leftLowerLeg', 'leftFoot'] },
  { bone: 'rightFoot', mode: 'ik', chain: ['rightUpperLeg', 'rightLowerLeg', 'rightFoot'] },
  { bone: 'leftToes', mode: 'fk' },
  { bone: 'rightToes', mode: 'fk' },
];

const COLORS = {
  fk: 0x35c8ff, ik: 0xffb62e, root: 0xffe94a, hips: 0xff9de2, selected: 0xff4d6b,
};

let _loader = null;
function getLoader() {
  if (!_loader) {
    _loader = new GLTFLoader();
    _loader.register(parser => new VRMLoaderPlugin(parser));
  }
  return _loader;
}

/** VRM / glTF / GLB を読み込む。VRM なら {type:'vrm', vrm}、それ以外は {type:'gltf', object} */
export async function loadAsset(arrayBuffer) {
  const gltf = await getLoader().parseAsync(arrayBuffer, '');
  const vrm = gltf.userData.vrm;
  if (!vrm) {
    gltf.scene.traverse(o => { o.frustumCulled = false; });
    return { type: 'gltf', object: gltf.scene };
  }
  VRMUtils.removeUnnecessaryVertices(gltf.scene);
  if (VRMUtils.combineSkeletons) VRMUtils.combineSkeletons(gltf.scene);
  else if (VRMUtils.removeUnnecessaryJoints) VRMUtils.removeUnnecessaryJoints(gltf.scene);
  VRMUtils.rotateVRM0(vrm); // VRM0 も +Z 向きに統一
  vrm.scene.traverse(o => { o.frustumCulled = false; });
  // 正規化リグがシーン外にいる実装バージョンへの保険
  const nroot = vrm.humanoid.normalizedHumanBonesRoot;
  if (nroot && !nroot.parent) vrm.scene.add(nroot);
  return { type: 'vrm', vrm };
}

// スライダー分解用: 各ボーンの「次の関節」(ボーン軸の向き先)
const BONE_CHILD = {
  hips: 'spine', spine: 'chest', chest: 'upperChest', upperChest: 'neck', neck: 'head',
  leftShoulder: 'leftUpperArm', leftUpperArm: 'leftLowerArm', leftLowerArm: 'leftHand', leftHand: 'leftMiddleProximal',
  rightShoulder: 'rightUpperArm', rightUpperArm: 'rightLowerArm', rightLowerArm: 'rightHand', rightHand: 'rightMiddleProximal',
  leftUpperLeg: 'leftLowerLeg', leftLowerLeg: 'leftFoot', leftFoot: 'leftToes',
  rightUpperLeg: 'rightLowerLeg', rightLowerLeg: 'rightFoot', rightFoot: 'rightToes',
};
const CHILD_FALLBACK_DIR = { head: [0, 1, 0], leftToes: [0, 0, 1], rightToes: [0, 0, 1], leftFoot: [0, 0, 1], rightFoot: [0, 0, 1] };

let _charSeq = 0;
const _v = new THREE.Vector3();
const _va = new THREE.Vector3();
const _vb = new THREE.Vector3();
const _q = new THREE.Quaternion();

// ポーズプリセット。角度は boneFrame 基準(度)。左側だけ定義し、右側は yaw/twist を反転して生成
const PRESET_LEFT = {
  stand: {
    bones: {
      leftShoulder: { pitch: -4 },
      leftUpperArm: { pitch: -70, yaw: -6, twist: -30 },
      leftLowerArm: { pitch: -8, yaw: -10 },
    },
    rootY: 'zero',
  },
  sit: {
    bones: {
      spine: { pitch: 4 },
      leftUpperLeg: { pitch: 85, yaw: 5 },
      leftLowerLeg: { pitch: -86 },
      leftFoot: { pitch: 4 },
      leftShoulder: { pitch: -3 },
      leftUpperArm: { pitch: -60, yaw: -18, twist: -25 },
      leftLowerArm: { pitch: -15, yaw: -35 },
    },
    rootY: 'sit',
  },
};

const POSE_PRESETS = {};
for (const [pname, def] of Object.entries(PRESET_LEFT)) {
  const bones = { ...def.bones };
  for (const [bn, ang] of Object.entries(def.bones)) {
    if (bn.startsWith('left')) {
      bones['right' + bn.slice(4)] = {
        pitch: ang.pitch || 0,
        yaw: -(ang.yaw || 0),
        twist: -(ang.twist || 0),
      };
    }
  }
  POSE_PRESETS[pname] = { bones, rootY: def.rootY };
}

// 手のプリセット(指ごとの握り 0〜1)
export const HAND_POSES = {
  'グー': { thumb: 1, index: 1, middle: 1, ring: 1, little: 1 },
  'パー': { thumb: 0, index: 0, middle: 0, ring: 0, little: 0 },
  'チョキ': { thumb: 0.9, index: 0, middle: 0, ring: 1, little: 1 },
  '指差し': { thumb: 0.8, index: 0, middle: 1, ring: 1, little: 1 },
  'グッジョブ': { thumb: 0, index: 1, middle: 1, ring: 1, little: 1 },
};

/** 向き(Y回転)コントローラー用の共通ハンドルを作る */
export function makeHeadingHandle(ownerId, baseScale) {
  const mat = new THREE.MeshBasicMaterial({
    color: 0x6fe26f, depthTest: false, depthWrite: false, transparent: true, opacity: 0.9,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), mat);
  mesh.renderOrder = 999;
  mesh.scale.setScalar(baseScale);
  mesh.userData = { charId: ownerId, def: { bone: '__heading', mode: 'heading' }, baseScale, baseColor: 0x6fe26f };
  return mesh;
}

const _hfwd = new THREE.Vector3();

/** owner(root と headingRadius を持つ)の前方・単位円上にハンドルを置く */
export function placeHeadingHandle(owner, mesh, userScale) {
  _hfwd.set(0, 0, 1).applyQuaternion(owner.root.quaternion);
  _hfwd.y = 0;
  if (_hfwd.lengthSq() < 1e-6) _hfwd.set(0, 0, 1);
  _hfwd.normalize();
  mesh.position.copy(owner.root.position).addScaledVector(_hfwd, owner.headingRadius());
  mesh.position.y = owner.root.position.y + 0.01;
  mesh.scale.setScalar(mesh.userData.baseScale * userScale);
}

export class Character {
  constructor(vrm, modelKey, name) {
    this.id = ++_charSeq;
    this.vrm = vrm;
    this.modelKey = modelKey;
    this.name = name;
    // ルート操作(移動・回転)はこの Group に対して行う。
    // vrm.scene には rotateVRM0 の向き補正が入っているため直接触らない
    this.root = new THREE.Group();
    this.root.add(vrm.scene);

    // VRM0 はモデルローカル空間が 180° 反転している(ローカル +Z = 背中側)。
    // rotateVRM0 後の vrm.scene の向きから判定する
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(vrm.scene.quaternion);
    this.axisFlip = fwd.z >= 0 ? 1 : -1;

    // 指は 1 本ずつ 0(伸ばす)〜1(握る)で持つ
    this.fingers = {
      left: { thumb: 0, index: 0, middle: 0, ring: 0, little: 0 },
      right: { thumb: 0, index: 0, middle: 0, ring: 0, little: 0 },
    };
    // 目線: none=モデル任せ / camera=カメラ目線 / manual=yaw,pitch(度)
    this.gaze = { mode: 'none', yaw: 0, pitch: 0 };
    this._gazeTarget = new THREE.Object3D();
    this.handles = [];
    this.handleGroup = new THREE.Group();
    this.lineSegs = null;
    this._linePairs = [];

    const box = new THREE.Box3().setFromObject(vrm.scene);
    this.height = Math.max(0.4, box.getSize(_v).y);

    // T ポーズ時点のボーン軸方向(スライダーの絶対角分解に使う)
    this.restDir = {};
    this._frames = {};
    this._computeRestDirs();

    const hipsNode = this.bone('hips');
    this._hipsRestPos = hipsNode ? hipsNode.position.clone() : null;
  }

  /** 両足の現在のワールド位置・向きを記録する(腰操作中の接地固定用) */
  capturePins() {
    const pins = {};
    for (const side of ['left', 'right']) {
      const chain = [side + 'UpperLeg', side + 'LowerLeg', side + 'Foot'].map((b) => this.bone(b));
      if (chain.some((n) => !n)) continue;
      chain[2].updateWorldMatrix(true, false);
      pins[side] = {
        chain,
        pos: new THREE.Vector3().setFromMatrixPosition(chain[2].matrixWorld),
        quat: chain[2].getWorldQuaternion(new THREE.Quaternion()),
      };
    }
    return pins;
  }

  /** 足ボーンの向いている前方(ワールド)。膝のポールに使う */
  footForward(side, out) {
    const foot = this.bone(side + 'Foot');
    if (!foot) return out.set(0, 0, 1);
    foot.updateWorldMatrix(true, false);
    return out.set(0, 0, this.axisFlip).applyQuaternion(foot.getWorldQuaternion(_q));
  }

  /** 記録した足位置へ両脚を IK で戻し、足首のワールド向きも維持する。膝は足の向く方向へ */
  applyPins(pins) {
    for (const side of Object.keys(pins)) {
      const p = pins[side];
      const pole = new THREE.Vector3(0, 0, this.axisFlip).applyQuaternion(p.quat);
      solveTwoBoneIK(p.chain[0], p.chain[1], p.chain[2], p.pos, pole, true);
      const foot = p.chain[2];
      foot.parent.updateWorldMatrix(true, false);
      const pq = foot.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
      foot.quaternion.copy(pq.multiply(p.quat)).normalize();
    }
  }

  _computeRestDirs() {
    // 位置は vrm.scene ローカル(=正規化ボーンのローカル軸と同じ規約)で取る。
    // world のままだと VRM0 の 180° 補正が混入して軸が反転する
    this.vrm.scene.updateWorldMatrix(true, true);
    const pos = (name) => {
      const node = this.bone(name);
      if (!node) return null;
      node.updateWorldMatrix(true, false);
      const p = new THREE.Vector3().setFromMatrixPosition(node.matrixWorld);
      return this.vrm.scene.worldToLocal(p);
    };
    this.restY = {};
    for (const name of POSE_BONES) {
      if (!this.bone(name)) continue;
      const own = pos(name);
      this.restY[name] = own.y;
      let childName = BONE_CHILD[name];
      let childPos = null;
      while (childName) {
        childPos = pos(childName);
        if (childPos) break;
        childName = BONE_CHILD[childName];
      }
      let dir;
      if (childPos && childPos.distanceToSquared(own) > 1e-8) {
        dir = childPos.sub(own).normalize();
      } else {
        dir = new THREE.Vector3().fromArray(CHILD_FALLBACK_DIR[name] || [0, 1, 0]);
        dir.x *= this.axisFlip;
        dir.z *= this.axisFlip;
      }
      this.restDir[name] = dir;
    }
  }

  /** ボーンのローカル直交フレーム { t: ボーン軸, u: 縦回転の基準, w: 横回転の基準 } */
  boneFrame(name) {
    if (this._frames[name]) return this._frames[name];
    const t = (this.restDir[name] || new THREE.Vector3(0, 1, 0)).clone();
    // ほぼ縦向きのボーンは「キャラの前方」を基準にする(VRM0 はローカル -Z が前)
    const refUp = Math.abs(t.y) > 0.85
      ? new THREE.Vector3(0, 0, this.axisFlip)
      : new THREE.Vector3(0, 1, 0);
    const w = new THREE.Vector3().crossVectors(refUp, t).normalize();
    const u = new THREE.Vector3().crossVectors(t, w).normalize();
    const frame = { t, u, w };
    this._frames[name] = frame;
    return frame;
  }

  /** 正規化ボーンノード(無ければ null) */
  bone(name) {
    return this.vrm.humanoid.getNormalizedBoneNode(name);
  }

  /** name か、無ければ存在する最も近い祖先ボーンを返す */
  resolveBone(name) {
    let n = name;
    while (n) {
      const node = this.bone(n);
      if (node) return { name: n, node };
      n = BONE_PARENT[n];
    }
    return null;
  }

  boneWorldPos(name, target) {
    const node = this.bone(name);
    if (!node) return null;
    node.updateWorldMatrix(true, false);
    return target.setFromMatrixPosition(node.matrixWorld);
  }

  buildHandles() {
    const r = this.height * 0.014;
    const geo = new THREE.SphereGeometry(1, 12, 8);
    for (const def of HANDLE_DEFS) {
      if (def.bone !== '__root' && !this.bone(def.bone)) continue;
      if (def.requires && !this.bone(def.requires)) continue;
      if (def.mode === 'ik' && def.chain.some(b => !this.bone(b))) continue;
      const mat = new THREE.MeshBasicMaterial({
        color: COLORS[def.mode], depthTest: false, depthWrite: false, transparent: true, opacity: 0.85,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.renderOrder = 999;
      const scale = def.mode === 'root' ? r * 1.7 : def.mode === 'hips' ? r * 1.4 : r;
      mesh.scale.setScalar(scale);
      mesh.userData = { charId: this.id, def, baseScale: scale, baseColor: COLORS[def.mode] };
      this.handles.push(mesh);
      this.handleGroup.add(mesh);
    }
    // 向き(Y回転)コントローラー
    this._headingHandle = makeHeadingHandle(this.id, r * 1.3);
    this.handles.push(this._headingHandle);
    this.handleGroup.add(this._headingHandle);
    // 手首・足首の捻り専用サテライト(緑の小玉を円周ドラッグ)
    const TWIST_SATS = [
      { bone: 'leftHand', parent: 'leftLowerArm' },
      { bone: 'rightHand', parent: 'rightLowerArm' },
      { bone: 'leftFoot', parent: 'leftLowerLeg' },
      { bone: 'rightFoot', parent: 'rightLowerLeg' },
    ];
    for (const s of TWIST_SATS) {
      if (!this.bone(s.bone) || !this.bone(s.parent)) continue;
      const mat = new THREE.MeshBasicMaterial({
        color: 0x6fe26f, depthTest: false, depthWrite: false, transparent: true, opacity: 0.9,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.renderOrder = 999;
      mesh.scale.setScalar(r * 0.85);
      mesh.userData = {
        charId: this.id,
        def: { bone: s.bone, parent: s.parent, mode: 'twist' },
        baseScale: r * 0.85, baseColor: 0x6fe26f,
      };
      this.handles.push(mesh);
      this.handleGroup.add(mesh);
    }
    // ボーン間の線
    const pairs = [];
    for (const [child, parent] of Object.entries(BONE_PARENT)) {
      const c = this.bone(child);
      if (!c) continue;
      const p = this.resolveBone(parent);
      if (p) pairs.push([child, p.name]);
    }
    this._linePairs = pairs;
    const positions = new Float32Array(pairs.length * 6);
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.lineSegs = new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({
      color: 0x9ad1ff, depthTest: false, depthWrite: false, transparent: true, opacity: 0.3,
    }));
    this.lineSegs.renderOrder = 998;
    this.lineSegs.frustumCulled = false;
    this.handleGroup.add(this.lineSegs);
  }

  headingRadius() {
    return this.height * 0.45;
  }

  twistRadius() {
    return this.height * 0.09;
  }

  /**
   * 捻りサテライト用の情報。axis=親セグメント方向(前腕/スネ)、
   * offsetDir=ボーンの向き(甲/つま先)を axis に直交射影した向き
   */
  twistInfo(boneName, parentName) {
    const node = this.bone(boneName);
    const pn = this.bone(parentName);
    if (!node || !pn) return null;
    node.updateWorldMatrix(true, false);
    pn.updateWorldMatrix(true, false);
    const joint = new THREE.Vector3().setFromMatrixPosition(node.matrixWorld);
    const pj = new THREE.Vector3().setFromMatrixPosition(pn.matrixWorld);
    const axis = joint.clone().sub(pj);
    if (axis.lengthSq() < 1e-8) return null;
    axis.normalize();
    const frame = this.boneFrame(boneName);
    const fwd = frame.t.clone().applyQuaternion(node.getWorldQuaternion(_q));
    const offsetDir = fwd.addScaledVector(axis, -fwd.dot(axis));
    if (offsetDir.lengthSq() < 1e-6) {
      offsetDir.copy(frame.u).applyQuaternion(node.getWorldQuaternion(_q));
      offsetDir.addScaledVector(axis, -offsetDir.dot(axis));
    }
    if (offsetDir.lengthSq() < 1e-8) offsetDir.set(axis.y, -axis.x, 0);
    offsetDir.normalize();
    return { joint, axis, offsetDir };
  }

  /** ハンドル・線の位置を現在のポーズへ追従させる(毎フレーム) */
  updateHandles(userScale) {
    for (const h of this.handles) {
      if (h.userData.def.mode === 'heading') {
        placeHeadingHandle(this, h, userScale);
        continue;
      }
      if (h.userData.def.mode === 'twist') {
        const info = this.twistInfo(h.userData.def.bone, h.userData.def.parent);
        if (info) h.position.copy(info.joint).addScaledVector(info.offsetDir, this.twistRadius());
        h.scale.setScalar(h.userData.baseScale * userScale);
        continue;
      }
      if (h.userData.def.bone === '__root') {
        // 全体移動ハンドル: ルート原点(初期状態で両足の中間)に固定。ポーズには追従させない
        h.position.copy(this.root.position);
        h.position.y += 0.01;
        h.scale.setScalar(h.userData.baseScale * userScale);
        continue;
      }
      this.boneWorldPos(h.userData.def.bone, h.position);
      h.scale.setScalar(h.userData.baseScale * userScale);
    }
    if (this.lineSegs) {
      const attr = this.lineSegs.geometry.getAttribute('position');
      let i = 0;
      for (const [child, parent] of this._linePairs) {
        this.boneWorldPos(child, _va);
        this.boneWorldPos(parent, _vb);
        attr.setXYZ(i++, _va.x, _va.y, _va.z);
        attr.setXYZ(i++, _vb.x, _vb.y, _vb.z);
      }
      attr.needsUpdate = true;
    }
  }

  // ---- ポーズの入出力(モデル非依存の正規化空間) ----

  serialize() {
    const pose = {};
    for (const name of POSE_BONES.concat(FINGER_BONES)) {
      const node = this.bone(name);
      if (!node) continue;
      const q = node.quaternion;
      if (Math.abs(q.x) + Math.abs(q.y) + Math.abs(q.z) < 1e-6) continue;
      pose[name] = [round5(q.x), round5(q.y), round5(q.z), round5(q.w)];
    }
    const hipsNode = this.bone('hips');
    return {
      name: this.name,
      modelKey: this.modelKey,
      rootPos: this.root.position.toArray().map(round5),
      rootRot: this.root.quaternion.toArray().map(round5),
      hipsPos: hipsNode ? hipsNode.position.toArray().map(round5) : undefined,
      pose,
      fingers: JSON.parse(JSON.stringify(this.fingers)),
      gaze: { ...this.gaze },
      expressions: this.serializeExpressions(),
    };
  }

  applyState(state) {
    if (state.rootPos) this.root.position.fromArray(state.rootPos);
    if (state.rootRot) this.root.quaternion.fromArray(state.rootRot).normalize();
    this.resetPoseOnly();
    if (state.pose) {
      for (const [name, q] of Object.entries(state.pose)) {
        const node = this.bone(name);
        if (node) node.quaternion.fromArray(q).normalize();
      }
    }
    if (state.hipsPos && this.bone('hips')) this.bone('hips').position.fromArray(state.hipsPos);
    if (state.fingers) {
      this.fingers = JSON.parse(JSON.stringify(state.fingers));
    } else {
      // 旧形式(手ごとの一括カール)
      for (const f of Object.keys(this.fingers.left)) this.fingers.left[f] = state.curlL || 0;
      for (const f of Object.keys(this.fingers.right)) this.fingers.right[f] = state.curlR || 0;
    }
    this.gaze = state.gaze ? { ...state.gaze } : { mode: 'none', yaw: 0, pitch: 0 };
    this.resetExpressions();
    if (state.expressions) {
      for (const [n, w] of Object.entries(state.expressions)) this.setExpression(n, w);
    }
    if (state.name) this.name = state.name;
  }

  resetPoseOnly() {
    for (const name of POSE_BONES.concat(FINGER_BONES)) {
      const node = this.bone(name);
      if (node) node.quaternion.identity();
    }
    if (this._hipsRestPos) this.bone('hips').position.copy(this._hipsRestPos);
  }

  resetAll() {
    this.resetPoseOnly();
    for (const side of ['left', 'right']) {
      for (const f of Object.keys(this.fingers[side])) this.fingers[side][f] = 0;
    }
    this.gaze = { mode: 'none', yaw: 0, pitch: 0 };
    this.resetExpressions();
    this.root.quaternion.identity();
    this.root.position.y = 0;
  }

  /** 左右反転(YZ 平面ミラー)。正規化空間なので (x,-y,-z,w) + L/R スワップで成立する */
  mirrorPose() {
    const mirrorQ = (arr) => [arr[0], -arr[1], -arr[2], arr[3]];
    const snapshot = {};
    for (const name of POSE_BONES.concat(FINGER_BONES)) {
      const node = this.bone(name);
      if (node) snapshot[name] = node.quaternion.toArray();
    }
    for (const [name, q] of Object.entries(snapshot)) {
      let srcName = name;
      if (name.startsWith('left')) srcName = 'right' + name.slice(4);
      else if (name.startsWith('right')) srcName = 'left' + name.slice(5);
      const src = snapshot[srcName];
      if (src) this.bone(name).quaternion.fromArray(mirrorQ(src));
    }
    const p = this.root.position;
    p.x = -p.x;
    const rq = this.root.quaternion;
    rq.set(rq.x, -rq.y, -rq.z, rq.w);
    const hn = this.bone('hips');
    if (hn) hn.position.x = -hn.position.x;
    const f = this.fingers.left; this.fingers.left = this.fingers.right; this.fingers.right = f;
    const g = this.gaze; if (g.mode === 'manual') g.yaw = -g.yaw;
    this.applyCurls();
  }

  // ---- 指 ----

  /** 手全体を一括で握る(スライダー用) */
  setCurl(side, t) {
    for (const f of Object.keys(this.fingers[side])) this.fingers[side][f] = t;
    this.applyCurls();
  }

  /** 指を 1 本ずつ指定(グー/パー/チョキ等のプリセット用) */
  setHandPose(side, pose) {
    Object.assign(this.fingers[side], pose);
    this.applyCurls();
  }

  /** スライダー表示用の代表値(平均) */
  masterCurl(side) {
    const vals = Object.values(this.fingers[side]);
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }

  applyCurls() {
    this._applyCurlSide('left');
    this._applyCurlSide('right');
  }

  _applyCurlSide(side) {
    // VRM1: 左手はローカル -Z 軸で握る。VRM0 はローカル空間が反転しているので逆
    const zSign = (side === 'left' ? -1 : 1) * this.axisFlip;
    const fv = this.fingers[side];
    const angles = { Proximal: 78, Intermediate: 86, Distal: 60 };
    for (const finger of ['Index', 'Middle', 'Ring', 'Little']) {
      const t = fv[finger.toLowerCase()];
      for (const [seg, deg] of Object.entries(angles)) {
        const node = this.bone(side + finger + seg);
        if (!node) continue;
        node.quaternion.setFromAxisAngle(_v.set(0, 0, zSign), THREE.MathUtils.degToRad(deg) * t);
      }
    }
    // 親指は palm と平行に曲がるので軸が違う
    const ySign = (side === 'left' ? -1 : 1) * this.axisFlip;
    const thumbAngles = { Metacarpal: 25, Proximal: 35, Distal: 45 };
    for (const [seg, deg] of Object.entries(thumbAngles)) {
      const node = this.bone(side + 'Thumb' + seg);
      if (!node) continue;
      node.quaternion.setFromAxisAngle(_v.set(0, ySign, 0), THREE.MathUtils.degToRad(deg) * fv.thumb);
    }
  }

  // ---- 目線 ----

  /** 毎フレーム呼ぶ。lookAt のターゲットを目線モードに合わせて更新する */
  updateGaze(camera) {
    const la = this.vrm.lookAt;
    if (!la) return;
    if (this.gaze.mode === 'camera') {
      la.target = camera;
      return;
    }
    if (this.gaze.mode === 'manual') {
      la.target = this._gazeTarget;
      if (!this._gazeTarget.parent && this.handleGroup) this.handleGroup.add(this._gazeTarget);
      this.boneWorldPos('head', _va);
      const yaw = THREE.MathUtils.degToRad(this.gaze.yaw);
      const pitch = THREE.MathUtils.degToRad(this.gaze.pitch);
      // キャラ正面(+Z)基準の方向 → ルートの向きでワールドへ
      _vb.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
      _vb.applyQuaternion(this.root.getWorldQuaternion(_q));
      this._gazeTarget.position.copy(_va).addScaledVector(_vb, 2);
      return;
    }
    la.target = null;
  }

  // ---- 表情 ----

  listExpressions() {
    const em = this.vrm.expressionManager;
    if (!em) return [];
    return Object.keys(em.expressionMap || {});
  }

  setExpression(name, weight) {
    const em = this.vrm.expressionManager;
    if (em && em.expressionMap && em.expressionMap[name]) em.setValue(name, weight);
  }

  getExpression(name) {
    const em = this.vrm.expressionManager;
    return em ? (em.getValue(name) || 0) : 0;
  }

  resetExpressions() {
    for (const n of this.listExpressions()) this.setExpression(n, 0);
  }

  serializeExpressions() {
    const out = {};
    for (const n of this.listExpressions()) {
      const w = this.getExpression(n);
      if (w > 0.001) out[n] = round5(w);
    }
    return out;
  }

  // ---- ポーズプリセット ----

  /** 'stand' | 'sit'。ボーン角はローカルフレーム基準なので VRM0/1 どちらでも同じ見た目になる */
  applyPresetPose(name) {
    const preset = POSE_PRESETS[name];
    if (!preset) return;
    this.resetPoseOnly();
    for (const [boneName, ang] of Object.entries(preset.bones)) {
      const node = this.bone(boneName);
      if (!node) continue;
      composeRot(
        THREE.MathUtils.degToRad(ang.pitch || 0),
        THREE.MathUtils.degToRad(ang.yaw || 0),
        THREE.MathUtils.degToRad(ang.twist || 0),
        this.boneFrame(boneName),
        node.quaternion,
      );
    }
    if (preset.rootY === 'sit') {
      const hipY = this.restY.hips || 0.9;
      const kneeY = this.restY.leftLowerLeg != null ? this.restY.leftLowerLeg : hipY * 0.55;
      this.root.position.y = -(hipY - kneeY);
    } else {
      this.root.position.y = 0;
    }
    this.applyCurls();
  }

  dispose(scene) {
    scene.remove(this.root);
    scene.remove(this.handleGroup);
    VRMUtils.deepDispose(this.vrm.scene);
    for (const h of this.handles) h.material.dispose();
    if (this.lineSegs) { this.lineSegs.geometry.dispose(); this.lineSegs.material.dispose(); }
  }
}

/** 小物(glTF/GLB)。移動・回転・スケールのみ */
export class Prop {
  constructor(object, modelKey, name) {
    this.id = ++_charSeq;
    this.isProp = true;
    this.modelKey = modelKey;
    this.name = name;
    this.object = object;
    this.root = new THREE.Group();
    this.root.add(object);

    const box = new THREE.Box3().setFromObject(object);
    this.center = box.getCenter(new THREE.Vector3());
    this.size = Math.max(0.05, box.getSize(new THREE.Vector3()).length());

    this.handles = [];
    this.handleGroup = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({
      color: 0xb17aff, depthTest: false, depthWrite: false, transparent: true, opacity: 0.85,
    });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), mat);
    mesh.renderOrder = 999;
    const scale = Math.min(0.05, this.size * 0.06);
    mesh.scale.setScalar(scale);
    mesh.userData = { charId: this.id, def: { bone: '__prop', mode: 'root', kind: 'prop' }, baseScale: scale, baseColor: 0xb17aff };
    this.handles.push(mesh);
    this.handleGroup.add(mesh);
    this._headingHandle = makeHeadingHandle(this.id, scale * 0.9);
    this.handles.push(this._headingHandle);
    this.handleGroup.add(this._headingHandle);
  }

  headingRadius() {
    return Math.max(0.3, this.size * 0.55 * this.root.scale.x);
  }

  updateHandles(userScale) {
    const h = this.handles[0];
    this.root.updateWorldMatrix(true, false);
    h.position.copy(this.center).applyMatrix4(this.root.matrixWorld);
    h.scale.setScalar(h.userData.baseScale * userScale);
    placeHeadingHandle(this, this._headingHandle, userScale);
  }

  serialize() {
    return {
      name: this.name,
      modelKey: this.modelKey,
      pos: this.root.position.toArray().map(round5),
      rot: this.root.quaternion.toArray().map(round5),
      scale: round5(this.root.scale.x),
    };
  }

  applyState(state) {
    if (state.pos) this.root.position.fromArray(state.pos);
    if (state.rot) this.root.quaternion.fromArray(state.rot).normalize();
    if (state.scale) this.root.scale.setScalar(state.scale);
    if (state.name) this.name = state.name;
  }

  dispose(scene) {
    scene.remove(this.root);
    scene.remove(this.handleGroup);
    this.object.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose();
      }
    });
    for (const h of this.handles) h.material.dispose();
  }
}

function round5(v) { return Math.round(v * 100000) / 100000; }
