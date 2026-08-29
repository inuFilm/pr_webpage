// 回転数学ヘルパー。すべてワールド空間で計算し、最後にローカルへ変換する。
import * as THREE from 'three';

const _qp = new THREE.Quaternion();
const _qpi = new THREE.Quaternion();
const _qm = new THREE.Quaternion();
const _qd = new THREE.Quaternion();
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const _v5 = new THREE.Vector3();

export function worldPos(node, target) {
  node.updateWorldMatrix(true, false);
  return target.setFromMatrixPosition(node.matrixWorld);
}

/** node のワールド回転に qDelta を前掛けする(位置は不変、ローカル quaternion を書き換える) */
export function applyWorldQuatDelta(node, qDelta) {
  if (node.parent) {
    node.parent.updateWorldMatrix(true, false);
    node.parent.getWorldQuaternion(_qp);
  } else {
    _qp.identity();
  }
  _qpi.copy(_qp).invert();
  // 注意: qDelta に共有テンポラリ(_qd)が渡ってくるので、ここでは _qm を使う
  _qm.copy(_qpi).multiply(qDelta).multiply(_qp);
  node.quaternion.premultiply(_qm).normalize();
}

/** rotNode を pivot 中心に回し、from 方向を to 方向へ向ける(FKエイム) */
export function aimBone(rotNode, pivotWorld, fromWorld, toWorld) {
  _v1.copy(fromWorld).sub(pivotWorld);
  _v2.copy(toWorld).sub(pivotWorld);
  if (_v1.lengthSq() < 1e-10 || _v2.lengthSq() < 1e-10) return;
  _v1.normalize();
  _v2.normalize();
  _qd.setFromUnitVectors(_v1, _v2);
  applyWorldQuatDelta(rotNode, _qd);
}

/** node をワールド軸 axisWorld まわりに deltaRad 回す */
export function twistBone(node, axisWorld, deltaRad) {
  _qd.setFromAxisAngle(_v1.copy(axisWorld).normalize(), deltaRad);
  applyWorldQuatDelta(node, _qd);
}

const _qA = new THREE.Quaternion();
const _qB = new THREE.Quaternion();
const _vd = new THREE.Vector3();

/**
 * ローカル回転 q をフレーム f={t,u,w}(t=ボーン軸)で
 * 縦(pitch)・横(yaw)・ひねり(twist) に分解する。スイング/ツイスト分解
 */
export function decomposeRot(q, f) {
  const proj = q.x * f.t.x + q.y * f.t.y + q.z * f.t.z;
  let twist = 2 * Math.atan2(proj, q.w);
  while (twist > Math.PI) twist -= 2 * Math.PI;
  while (twist < -Math.PI) twist += 2 * Math.PI;
  const d = _vd.copy(f.t).applyQuaternion(q);
  const pitch = Math.asin(Math.min(Math.max(d.dot(f.u), -1), 1));
  const yaw = Math.atan2(d.dot(f.w), d.dot(f.t));
  return { pitch, yaw, twist };
}

/** decomposeRot の逆。角度(rad)からローカル回転を組み立てて out に書く */
export function composeRot(pitch, yaw, twist, f, out) {
  const cp = Math.cos(pitch);
  const d = _vd.copy(f.t).multiplyScalar(cp * Math.cos(yaw))
    .addScaledVector(f.w, cp * Math.sin(yaw))
    .addScaledVector(f.u, Math.sin(pitch)).normalize();
  _qA.setFromUnitVectors(f.t, d);
  _qB.setFromAxisAngle(f.t, twist);
  return out.copy(_qA).multiply(_qB);
}

const _vRef = new THREE.Vector3();

/**
 * 2ボーン解析IK。a(付け根)-b(中間)-c(末端) を target へ届かせる。
 * 曲げ方向(ポール):
 *  - forceBend=true なら refBendDir を常に使う(膝=足の向き など)
 *  - それ以外は現在のポーズを基本にしつつ、ほぼ伸び切った状態では
 *    refBendDir へ滑らかに寄せる(Tポーズ直後に肘が変な方向へ跳ねるのを防ぐ)
 */
export function solveTwoBoneIK(a, b, c, targetWorld, refBendDir, forceBend = false) {
  const S = worldPos(a, _v1).clone();
  const E = worldPos(b, _v2).clone();
  const W = worldPos(c, _v3).clone();

  const la = S.distanceTo(E);
  const lb = E.distanceTo(W);
  if (la < 1e-6 || lb < 1e-6) return;

  const toT = _v4.copy(targetWorld).sub(S);
  let t = toT.length();
  const tMin = Math.abs(la - lb) * 1.02 + 1e-5;
  const tMax = (la + lb) * 0.9995;
  t = Math.min(Math.max(t, tMin), tMax);
  if (toT.lengthSq() < 1e-10) return;
  const dir = toT.normalize();

  // 基準ポールを軸に直交射影
  let refOk = false;
  if (refBendDir) {
    _vRef.copy(refBendDir);
    _vRef.addScaledVector(dir, -_vRef.dot(dir));
    if (_vRef.lengthSq() > 1e-8) { _vRef.normalize(); refOk = true; }
  }

  // 現在の肘/膝の張り出し方向を新しい軸に直交射影
  const bend = _v5.copy(E).sub(S);
  bend.addScaledVector(dir, -bend.dot(dir));
  const sig = bend.length() / la; // 相対的な曲がり量(0=伸び切り)

  if (forceBend && refOk) {
    bend.copy(_vRef);
  } else if (refOk && sig < 0.25) {
    // 伸び切りに近いほど基準ポールを支配的にする
    const w = sig / 0.25;
    if (bend.lengthSq() > 1e-10) bend.normalize().multiplyScalar(w).addScaledVector(_vRef, 1 - w);
    else bend.copy(_vRef);
  }
  if (bend.lengthSq() < 1e-8) {
    // それでも決まらなければ dir に直交する適当な軸
    bend.set(dir.y, -dir.x, 0);
    if (bend.lengthSq() < 1e-8) bend.set(0, -dir.z, dir.y);
  }
  bend.normalize();

  const cosU = Math.min(Math.max((la * la + t * t - lb * lb) / (2 * la * t), -1), 1);
  const sinU = Math.sqrt(Math.max(0, 1 - cosU * cosU));
  const Enew = S.clone().addScaledVector(dir, la * cosU).addScaledVector(bend, la * sinU);
  const Tnew = S.clone().addScaledVector(dir, t);

  // 上腕/腿: 現在の E 方向 → Enew 方向
  aimBone(a, S, E, Enew);
  // 前腕/脛: 回転後の実位置で合わせる
  const E2 = worldPos(b, _v2).clone();
  const W2 = worldPos(c, _v3).clone();
  aimBone(b, E2, W2, Tnew);
}
