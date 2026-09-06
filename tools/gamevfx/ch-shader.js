'use strict';
/* =========================================================
   Part 1  1枚の板から始まる（シェーダーの原則）
   各図の GLSL は文字列で持ち、showCode() でそのまま <pre> に出す。
   ========================================================= */

/* ---------- CH 1  UV ---------- */
{
  const FRAG = `
uniform vec2 u_speed;    // 流す速さ（x, y）
uniform float u_mode;    // 0: 座標を色で見る  1: チェッカー
void main() {
  vec2 uv = v_uv;                            // 左下 (0,0) 〜 右上 (1,1)
  uv = fract(uv + u_speed * u_time);         // 流す：時間を足して、1 を超えたら 0 に戻す
  vec3 col;
  if (u_mode < 0.5) col = vec3(uv, 0.0);     // R = u（横）, G = v（縦）
  else {
    vec2 g = floor(uv * 8.0);                // 8 × 8 のマス目
    float checker = mod(g.x + g.y, 2.0);     // 市松：隣り合うマスで 0 / 1
    col = mix(vec3(0.15, 0.25, 0.32), vec3(0.85, 0.9, 0.95), checker);
  }
  // 板そのものの格子線（こちらは動かない = 板は動いていない）
  vec2 l = abs(fract(v_uv * 4.0) - 0.5);
  float line = 1.0 - smoothstep(0.0, 0.02, min(l.x, l.y));
  col = mix(col, vec3(1.0, 0.82, 0.4), line * 0.5);
  outColor = vec4(col, 1.0);
}`;
  const S = { sx: 0.2, sy: 0, mode: 0 };
  const g = makeGL('g-uv', { frag: FRAG, uniforms: () => ({ u_speed: [S.sx, S.sy], u_mode: S.mode }) });
  showCode('code-uv', FRAG);
  slider('s-uv-sx', v => S.sx = v, v => fmt(v, 2));
  slider('s-uv-sy', v => S.sy = v, v => fmt(v, 2));
  modeButtons('m-uv', d => S.mode = +d.mode);
}

/* ---------- CH 2  流す + 抜く ---------- */
{
  const FRAG = `
uniform float u_scale;   // ノイズの細かさ
uniform float u_speed;   // 流す速さ
uniform float u_cut;     // しきい値（これより暗い所は消す）
uniform float u_soft;    // しきい値の柔らかさ
uniform float u_mask;    // 0: 炎のマスク  1: 丸いマスク  2: マスクなし
uniform float u_ramp;    // 0: 炎の色  1: 煙の色
uniform float u_show;    // 0: 完成  1: ノイズだけ  2: マスクだけ
void main() {
  vec2 uv = v_uv;
  // 1) 流す：上へ向かってノイズをスクロール（v に時間を引く = 上へ動く）
  float n = fbm(uv * u_scale * vec2(1.0, 0.6) + vec2(0.0, -u_time * u_speed));
  // 2) 抜く：どこを残すかのマスク（白 = 残す）
  float mask;
  if (u_mask < 0.5) {                            // 炎：下が濃く、上と横で薄い
    float x = abs(uv.x - 0.5) * 2.0;
    mask = (1.0 - uv.y) * (1.0 - x * x);
  } else if (u_mask < 1.5) {                     // 丸：中心が濃い
    mask = 1.0 - smoothstep(0.1, 0.5, length(uv - 0.5));
  } else mask = 1.0;
  // 3) 掛けてから、しきい値で切る
  float v = n * mask * 1.6;
  v = smoothstep(u_cut, u_cut + u_soft, v);
  // 4) 白黒に色を着ける（ランプ。6 章）
  vec3 col = u_ramp < 0.5 ? fireRamp(v) : vec3(v * 0.8);
  if (u_show > 0.5 && u_show < 1.5) col = vec3(n);
  if (u_show > 1.5) col = vec3(mask);
  outColor = vec4(col, 1.0);
}`;
  const S = { scale: 4, speed: 0.6, cut: 0.35, soft: 0.35, mask: 0, ramp: 0, show: 0 };
  makeGL('g-flow', { frag: FRAG, uniforms: () => ({ u_scale: S.scale, u_speed: S.speed, u_cut: S.cut, u_soft: S.soft, u_mask: S.mask, u_ramp: S.ramp, u_show: S.show }) });
  showCode('code-flow', FRAG);
  slider('s-flow-scale', v => S.scale = v, v => fmt(v, 1));
  slider('s-flow-speed', v => S.speed = v, v => fmt(v, 2));
  slider('s-flow-cut', v => S.cut = v, v => fmt(v, 2));
  slider('s-flow-soft', v => S.soft = v, v => fmt(v, 2));
  modeButtons('m-flow-mask', d => S.mask = +d.v);
  modeButtons('m-flow-ramp', d => S.ramp = +d.v);
  modeButtons('m-flow-show', d => S.show = +d.v);
}

/* ---------- CH 3  歪み ---------- */
{
  const FRAG = `
uniform float u_strength; // ずらす量
uniform float u_dscale;   // 歪みノイズの細かさ
uniform float u_dspeed;   // 歪みノイズを流す速さ
uniform float u_center;   // 1: 中心ほど強く歪む（縁は歪まない）
uniform float u_show;     // 1: ずらしベクトルを色で見る
void main() {
  vec2 uv = v_uv;
  // 「どれだけずらすか」をノイズ 2 枚から作る（-0.5〜0.5 の矢印）
  vec2 d = vec2(fbm(uv * u_dscale + vec2(0.0, -u_time * u_dspeed)),
                fbm(uv * u_dscale + vec2(7.3, -u_time * u_dspeed) + 3.1)) - 0.5;
  float w = u_center > 0.5 ? 1.0 - smoothstep(0.1, 0.5, length(uv - 0.5)) : 1.0;
  vec2 uv2 = uv + d * u_strength * w;        // ← これが歪み。座標をずらしてから絵を読む
  // 絵（本来ならテクスチャを読む所。ここでは市松と輪を計算で描く）
  vec2 g = floor(uv2 * 10.0);
  float checker = mod(g.x + g.y, 2.0);
  vec3 col = mix(vec3(0.16, 0.26, 0.34), vec3(0.85, 0.9, 0.95), checker);
  float ring = smoothstep(0.02, 0.0, abs(length(uv2 - 0.5) - 0.3));
  col = mix(col, vec3(1.0, 0.5, 0.2), ring);
  if (u_show > 0.5) col = vec3(d * 2.0 + 0.5, 0.5);   // 赤 = 右へ、緑 = 上へ
  outColor = vec4(col, 1.0);
}`;
  const S = { strength: 0.08, dscale: 3, dspeed: 0.4, center: 0, show: 0 };
  makeGL('g-dist', { frag: FRAG, uniforms: () => ({ u_strength: S.strength, u_dscale: S.dscale, u_dspeed: S.dspeed, u_center: S.center, u_show: S.show }) });
  showCode('code-dist', FRAG);
  slider('s-dist-str', v => S.strength = v, v => fmt(v, 2));
  slider('s-dist-scale', v => S.dscale = v, v => fmt(v, 1));
  slider('s-dist-speed', v => S.dspeed = v, v => fmt(v, 2));
  checkbox('k-dist-center', v => S.center = v ? 1 : 0);
  checkbox('k-dist-show', v => S.show = v ? 1 : 0);
}

/* ---------- CH 4  ディゾルブ ---------- */
{
  const FRAG = `
uniform float u_th;      // しきい値 0〜1（上げるほど消える）
uniform float u_w;       // 燃えている縁の幅
uniform float u_scale;   // ノイズの細かさ
uniform vec3 u_glow;     // 縁の色
void main() {
  vec2 uv = v_uv;
  // 消える対象（本来はキャラや弾の絵）：ここでは丸い板
  float shape = 1.0 - smoothstep(0.38, 0.4, length((uv - 0.5) * vec2(u_res.x / u_res.y, 1.0)));
  vec3 base = mix(vec3(0.2, 0.5, 0.9), vec3(0.6, 0.85, 1.0), uv.y);
  float n = fbm(uv * u_scale);                        // 消える順番を決めるノイズ（動かない）
  float alive = step(u_th, n);                        // n がしきい値より大きい所だけ残す
  float edge = 1.0 - smoothstep(u_th, u_th + u_w, n); // しきい値のすぐ上 = 今まさに燃えている縁
  vec3 col = mix(base, u_glow, edge);
  float a = shape * alive;
  vec3 bg = vec3(0.07, 0.11, 0.14);
  outColor = vec4(mix(bg, col, a), 1.0);
}`;
  const S = { th: 0.45, w: 0.08, scale: 6, glow: [1, 0.6, 0.15], auto: false };
  const g = makeGL('g-diss', { frag: FRAG, uniforms: g => {
    if (S.auto) { const t = fract(g.time * 0.2); S.th = lerp(0.15, 0.85, t < 0.5 ? t * 2 : 2 - t * 2); const el = $('#s-diss-th'); if (el) { el.value = S.th; $('#s-diss-th-v').textContent = fmt(S.th, 2); } }
    return { u_th: S.th, u_w: S.w, u_scale: S.scale, u_glow: S.glow };
  } });
  showCode('code-diss', FRAG);
  slider('s-diss-th', v => { S.th = v; S.auto = false; $('#k-diss-auto').checked = false; }, v => fmt(v, 2));
  slider('s-diss-w', v => S.w = v, v => fmt(v, 2));
  slider('s-diss-scale', v => S.scale = v, v => fmt(v, 0));
  checkbox('k-diss-auto', v => S.auto = v);
  colorInput('c-diss-glow', v => S.glow = hex2vec(v));
}

/* ---------- CH 5  極座標 ---------- */
{
  const FRAG = `
uniform float u_mode;   // 0: 極座標を色で  1: 衝撃波リング  2: 渦  3: 放射
uniform float u_rep;    // 角度方向の繰り返し回数（整数）
uniform float u_twist;  // ねじれ（角度に距離を足す量）
uniform float u_speed;
void main() {
  vec2 p = (v_uv - 0.5) * vec2(u_res.x / u_res.y, 1.0);
  float r = length(p) * 2.0;                  // 中心からの距離（0〜1）
  float a = atan(p.y, p.x) / 6.2832 + 0.5;    // 角度（0〜1 に直す）
  vec2 polar = vec2(a, r);                    // ← これが極座標の UV。a が横、r が縦
  vec3 col;
  if (u_mode < 0.5) col = vec3(polar, 0.0);
  else if (u_mode < 1.5) {                    // 衝撃波：r 方向に走る細い帯
    float t = fract(u_time * u_speed * 0.5);
    float ring = smoothstep(0.08, 0.0, abs(r - t)) * (1.0 - t);  // 広がるほど薄く
    col = ring * vec3(0.6, 0.9, 1.0);
  } else if (u_mode < 2.5) {                  // 渦：角度に r を足してから、r 方向に流す
    vec2 q = vec2(a * u_rep + r * u_twist, r * 3.0 - u_time * u_speed);
    float n = fbmP(q, vec2(u_rep, 1e4));      // 角度方向は u_rep 周期 → つなぎ目が出ない
    float m = 1.0 - smoothstep(0.3, 1.0, r);
    col = fireRamp(smoothstep(0.35, 0.8, n * m * 1.5));
  } else {                                    // 放射：角度方向だけの縞 = 光の筋
    vec2 q = vec2(a * u_rep, u_time * u_speed * 0.3);
    float n = fbmP(q, vec2(u_rep, 1e4));
    float m = 1.0 - smoothstep(0.0, 1.0, r);
    col = smoothstep(0.4, 0.9, n) * m * vec3(1.0, 0.9, 0.6);
  }
  outColor = vec4(col, 1.0);
}`;
  const S = { mode: 0, rep: 4, twist: 2, speed: 1 };
  makeGL('g-polar', { frag: FRAG, uniforms: () => ({ u_mode: S.mode, u_rep: S.rep, u_twist: S.twist, u_speed: S.speed }) });
  showCode('code-polar', FRAG);
  modeButtons('m-polar', d => S.mode = +d.v);
  slider('s-polar-rep', v => S.rep = v, v => fmt(v, 0));
  slider('s-polar-twist', v => S.twist = v, v => fmt(v, 1));
  slider('s-polar-speed', v => S.speed = v, v => fmt(v, 1));
}

/* ---------- CH 6  ランプ（着色） ---------- */
{
  const FRAG = `
uniform vec3 u_c0, u_c1, u_c2, u_c3;  // 4 つの色（位置 0, 0.33, 0.66, 1）
uniform float u_gray;                 // 1: 着色前の白黒を見る
vec3 ramp(float t) {                  // 0〜1 の数字 → 色。これがランプ（グラデーション）
  vec3 c = mix(u_c0, u_c1, smoothstep(0.0, 0.33, t));
  c = mix(c, u_c2, smoothstep(0.33, 0.66, t));
  return mix(c, u_c3, smoothstep(0.66, 1.0, t));
}
void main() {
  vec2 uv = v_uv;
  // 白黒の素材（2 章と同じ「流す + 抜く」）
  float n = fbm(uv * 4.0 + vec2(0.0, -u_time * 0.3));
  float m = 1.0 - smoothstep(0.2, 0.6, length(uv - 0.5));
  float v = smoothstep(0.25, 0.75, n * m * 1.8);
  vec3 col = u_gray > 0.5 ? vec3(v) : ramp(v);
  if (uv.y < 0.06) col = ramp(uv.x);          // 下端にランプの見本
  outColor = vec4(col, 1.0);
}`;
  const S = { c: ['#000000', '#c81400', '#ff8c0d', '#ffffff'], gray: 0 };
  makeGL('g-ramp', { frag: FRAG, uniforms: () => ({ u_c0: hex2vec(S.c[0]), u_c1: hex2vec(S.c[1]), u_c2: hex2vec(S.c[2]), u_c3: hex2vec(S.c[3]), u_gray: S.gray }) });
  showCode('code-ramp', FRAG);
  const inputs = [0, 1, 2, 3].map(i => colorInput('c-ramp-' + i, v => S.c[i] = v));
  const setPreset = cols => { S.c = cols.slice(); inputs.forEach((el, i) => { if (el) el.value = cols[i]; }); };
  modeButtons('m-ramp', d => setPreset(d.c.split(',')));
  checkbox('k-ramp-gray', v => S.gray = v ? 1 : 0);
}

/* ---------- CH 7  ブレンド ---------- */
{
  const FRAG = `
uniform float u_mode;   // 0: 通常（アルファ）  1: 加算  2: 乗算
uniform float u_bg;     // 0: 暗い背景  1: 明るい背景
uniform float u_rev;    // 1: 描く順番を逆にする
uniform float u_alpha;  // 板の不透明度
vec4 sprite(vec2 uv, vec2 c, float r, vec3 col) {   // 柔らかい丸（本来はテクスチャ）
  float d = length(uv - c) / r;
  float a = (1.0 - smoothstep(0.1, 0.9, d)) * u_alpha;
  return vec4(col, a);
}
vec3 blend(vec3 dst, vec4 src) {                    // dst = 今までの画面, src = 新しい板
  if (u_mode < 0.5) return mix(dst, src.rgb, src.a);   // 通常：dst*(1-a) + src*a
  if (u_mode < 1.5) return dst + src.rgb * src.a;      // 加算：足すだけ
  return dst * mix(vec3(1.0), src.rgb, src.a);         // 乗算：暗くするだけ
}
void main() {
  vec2 uv = (v_uv - 0.5) * vec2(u_res.x / u_res.y, 1.0);
  vec3 col = u_bg < 0.5 ? vec3(0.06, 0.1, 0.13) : vec3(0.85, 0.9, 0.95);
  for (int k = 0; k < 5; k++) {                     // 5 枚の板を順番に重ねる
    int i = u_rev > 0.5 ? 4 - k : k;
    float fi = float(i);
    vec2 c = vec2(cos(fi * 1.2566 + u_time * 0.4), sin(fi * 1.2566 + u_time * 0.4)) * 0.18;
    vec3 sc = i == 0 ? vec3(1.0, 0.4, 0.2) : i == 1 ? vec3(1.0, 0.8, 0.2) : i == 2 ? vec3(0.3, 0.8, 1.0) : i == 3 ? vec3(0.8, 0.4, 1.0) : vec3(0.4, 1.0, 0.6);
    col = blend(col, sprite(uv, c, 0.34, sc));
  }
  outColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;
  const S = { mode: 0, bg: 0, rev: 0, alpha: 0.8 };
  makeGL('g-blend', { frag: FRAG, uniforms: () => ({ u_mode: S.mode, u_bg: S.bg, u_rev: S.rev, u_alpha: S.alpha }) });
  showCode('code-blend', FRAG);
  modeButtons('m-blend', d => S.mode = +d.v);
  checkbox('k-blend-bg', v => S.bg = v ? 1 : 0);
  checkbox('k-blend-rev', v => S.rev = v ? 1 : 0);
  slider('s-blend-alpha', v => S.alpha = v, v => fmt(v, 2));
}

/* ---------- CH 8  フレネルとソフトパーティクル ---------- */
{
  const FRAG = `
uniform float u_pow;    // フレネルの鋭さ（大きいほど縁だけ）
uniform float u_fade;   // ソフトパーティクルのフェード距離（0 で無効）
uniform float u_show;   // 0: 両方  1: 球だけ  2: 板だけ
void main() {
  vec2 p = (v_uv - 0.5) * vec2(u_res.x / u_res.y, 1.0);
  vec3 ro = vec3(0.0, 1.1, 3.2);                        // カメラの位置
  vec3 rd = normalize(vec3(p.x, p.y - 0.18, -1.0));     // このピクセルの視線
  vec3 col = vec3(0.07, 0.11, 0.14);
  // 地面 y = 0（市松）。視線が地面に当たるまでの距離 = 奥行き（デプス）
  float depth = 1e9;
  if (rd.y < 0.0) {
    float tG = -ro.y / rd.y;
    vec3 hp = ro + rd * tG;
    float ch = mod(floor(hp.x * 2.0) + floor(hp.z * 2.0), 2.0);
    col = mix(vec3(0.15, 0.22, 0.28), vec3(0.22, 0.32, 0.4), ch) * (1.0 - smoothstep(2.0, 8.0, tG));
    depth = tG;
  }
  // 球：フレネルで「縁だけ光る」シールド
  vec3 sc = vec3(-0.75, 0.55, 0.0); float sr = 0.55;
  vec3 oc = ro - sc; float b = dot(oc, rd); float h = b * b - dot(oc, oc) + sr * sr;
  if (u_show < 1.5 && h > 0.0) {
    float tS = -b - sqrt(h);
    if (tS > 0.0 && tS < depth) {
      vec3 n = normalize(ro + rd * tS - sc);                  // 球の表面の向き（法線）
      float fres = pow(1.0 - max(dot(n, -rd), 0.0), u_pow);  // ← フレネル：視線と法線が直角に近いほど 1
      col = mix(col, vec3(0.25, 0.5, 0.65), 0.35) + vec3(0.4, 0.9, 1.0) * fres;   // 薄い本体 + 縁の光
    }
  }
  // 板：カメラに正対した煙の板が、地面に刺さっている
  vec3 bc = vec3(0.75, 0.25, 0.0);
  vec3 bn = normalize(ro - bc);                              // 板の向き（カメラ向き）
  float tB = dot(bc - ro, bn) / dot(rd, bn);
  if (abs(u_show - 1.0) > 0.5 && tB > 0.0 && tB < depth) {
    vec3 hp = ro + rd * tB;
    vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), bn)); vec3 up = cross(bn, right);
    vec2 luv = vec2(dot(hp - bc, right), dot(hp - bc, up)) / 0.6;   // 板の上の座標（-1〜1）
    float puff = fbm(luv * 2.0 + u_time * 0.2) * (1.0 - smoothstep(0.3, 1.0, length(luv)));
    float a = smoothstep(0.2, 0.5, puff);
    // ← ソフトパーティクル：板の奥行きと地面の奥行きが近いほど薄くする
    float fade = u_fade > 0.0 ? clamp((depth - tB) / u_fade, 0.0, 1.0) : 1.0;
    col = mix(col, vec3(0.9, 0.9, 0.95), a * fade * 0.9);
  }
  outColor = vec4(col, 1.0);
}`;
  const S = { pow: 3, fade: 0, show: 0 };
  makeGL('g-fres', { frag: FRAG, uniforms: () => ({ u_pow: S.pow, u_fade: S.fade, u_show: S.show }) });
  showCode('code-fres', FRAG);
  slider('s-fres-pow', v => S.pow = v, v => fmt(v, 1));
  slider('s-fres-fade', v => S.fade = v, v => fmt(v, 2));
  modeButtons('m-fres', d => S.show = +d.v);
}

/* ---------- CH 9  頂点オフセット（メッシュ + 頂点シェーダー） ---------- */
const VERT_PRELUDE = `#version 300 es
precision highp float;
in vec2 a_pos;
uniform float u_time, u_aspect;
out float v_h;
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.02 + 7.1; a *= 0.5; } return v; }
`;
function makeGLMesh(id, opts) {
  const c = document.getElementById(id);
  if (!c) return null;
  const W = opts.w || 640, H = opts.h || 360;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  c.width = W * dpr; c.height = H * dpr; c.style.aspectRatio = `${W} / ${H}`; c.classList.add('gl');
  const gl = c.getContext('webgl2', { alpha: false, antialias: true });
  if (!gl) { glFallback(c); return null; }
  const prog = glProgram(gl, VERT_PRELUDE + opts.vert, opts.frag, id);
  if (!prog) { glFallback(c); return null; }
  const n = opts.n || 40;
  const verts = [], idx = [];
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) verts.push(i / n * 2 - 1, j / n * 2 - 1);
  for (let j = 0; j <= n; j++) for (let i = 0; i < n; i++) { const a = j * (n + 1) + i; idx.push(a, a + 1); }
  for (let j = 0; j < n; j++) for (let i = 0; i <= n; i++) { const a = j * (n + 1) + i; idx.push(a, a + n + 1); }
  const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
  const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
  const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
  const aPos = gl.getAttribLocation(prog, 'a_pos'); gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
  const locs = {}; const loc = k => (k in locs ? locs[k] : (locs[k] = gl.getUniformLocation(prog, k)));
  const g = {
    gl, c, time: 0, playing: true,
    draw() {
      gl.viewport(0, 0, c.width, c.height);
      gl.clearColor(0.06, 0.1, 0.13, 1); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(prog); gl.bindVertexArray(vao);
      glSetUniform(gl, loc('u_time'), g.time); glSetUniform(gl, loc('u_aspect'), W / H);
      const u = opts.uniforms ? opts.uniforms(g) : {};
      for (const k in u) glSetUniform(gl, loc(k), u[k]);
      gl.drawElements(gl.LINES, idx.length, gl.UNSIGNED_SHORT, 0);
    },
    redraw() { g.draw(); },
  };
  animate(c, dt => { if (g.playing) g.time += dt; g.draw(); });
  register(sectionOf(c), g);
  c.addEventListener('click', () => g.playing = !g.playing);
  return g;
}
{
  const VERT = `
uniform float u_amp;    // 動かす量
uniform float u_freq;   // 波の細かさ
uniform float u_mode;   // 0: 波  1: 旗  2: ノイズ
uniform float u_rot;    // カメラの回転
float height(vec2 p) {                       // 板の上の位置 p → どれだけ持ち上げるか
  if (u_mode < 0.5) return sin(p.x * u_freq * 3.0 - u_time * 2.0);                       // 波
  if (u_mode < 1.5) return sin(p.x * u_freq * 3.0 - u_time * 3.0) * (p.x * 0.5 + 0.5);  // 旗：根元（左）は動かない
  return fbm(p * u_freq * 1.5 + u_time * 0.4) * 2.0 - 1.0;                              // ノイズ
}
void main() {
  float h = height(a_pos) * u_amp;             // ← 頂点オフセット：頂点の y を動かす
  vec3 pos = vec3(a_pos.x, h, a_pos.y);
  v_h = h;
  // 簡易カメラ（y 軸で回す → 少し見下ろす → 離す → 遠近）
  float c = cos(u_rot), s = sin(u_rot);
  pos.xz = mat2(c, -s, s, c) * pos.xz;
  float ct = cos(0.55), st = sin(0.55);
  pos.yz = mat2(ct, -st, st, ct) * pos.yz;
  pos.z -= 3.0;
  gl_Position = vec4(pos.x * 1.8 / u_aspect, pos.y * 1.8, 0.0, -pos.z);
}`;
  const FRAG = `#version 300 es
precision highp float;
in float v_h; out vec4 outColor;
void main() { outColor = vec4(mix(vec3(0.17, 0.66, 0.88), vec3(1.0, 0.82, 0.4), v_h * 0.5 + 0.5), 1.0); }`;
  const S = { amp: 0.25, freq: 1, mode: 0, rot: 0.4 };
  makeGLMesh('g-vert', { vert: VERT, frag: FRAG, n: 36, uniforms: () => ({ u_amp: S.amp, u_freq: S.freq, u_mode: S.mode, u_rot: S.rot }) });
  showCode('code-vert', VERT);
  slider('s-vert-amp', v => S.amp = v, v => fmt(v, 2));
  slider('s-vert-freq', v => S.freq = v, v => fmt(v, 1));
  slider('s-vert-rot', v => S.rot = v, v => fmt(v, 2));
  modeButtons('m-vert', d => S.mode = +d.v);
}

/* ---------- CH 19  色と明るさの階層 ---------- */
{
  const FRAG = `
uniform vec3 u_core, u_mid, u_edge;   // コア / 中 / 縁 の 3 色
uniform float u_add;   // 1: 加算で重ねる
uniform float u_gray;  // 1: 明るさだけを見る
uniform float u_n;     // 重ねる枚数
void main() {
  vec2 uv = (v_uv - 0.5) * vec2(u_res.x / u_res.y, 1.0);
  vec3 col = vec3(0.06, 0.09, 0.12);
  for (int i = 0; i < 6; i++) {
    if (float(i) >= u_n) break;
    float fi = float(i);
    vec2 c = vec2(cos(fi * 2.1 + u_time * 0.5), sin(fi * 2.1 + u_time * 0.5)) * 0.15 * min(fi, 1.0);
    float g = 1.0 - smoothstep(0.0, 1.0, length(uv - c) / 0.32);   // 中心 1 → 縁 0
    // 明るさの階層：縁の色 → 中の色 → コアの色（中心ほど明るい）
    vec3 sc = mix(u_edge, u_mid, smoothstep(0.0, 0.5, g));
    sc = mix(sc, u_core, smoothstep(0.5, 0.95, g));
    float a = smoothstep(0.0, 0.3, g);
    col = u_add > 0.5 ? col + sc * a : mix(col, sc, a);
  }
  col = clamp(col, 0.0, 1.0);
  if (u_gray > 0.5) col = vec3(dot(col, vec3(0.299, 0.587, 0.114)));  // 明るさだけ
  outColor = vec4(col, 1.0);
}`;
  const S = { core: '#fff6d5', mid: '#ff9a1f', edge: '#7a1a3a', add: 0, gray: 0, n: 3 };
  makeGL('g-value', { frag: FRAG, uniforms: () => ({ u_core: hex2vec(S.core), u_mid: hex2vec(S.mid), u_edge: hex2vec(S.edge), u_add: S.add, u_gray: S.gray, u_n: S.n }) });
  showCode('code-value', FRAG);
  const ins = { core: colorInput('c-val-core', v => S.core = v), mid: colorInput('c-val-mid', v => S.mid = v), edge: colorInput('c-val-edge', v => S.edge = v) };
  modeButtons('m-value', d => { S.core = d.core; S.mid = d.mid; S.edge = d.edge; for (const k in ins) if (ins[k]) ins[k].value = S[k]; });
  checkbox('k-val-add', v => S.add = v ? 1 : 0);
  checkbox('k-val-gray', v => S.gray = v ? 1 : 0);
  slider('s-val-n', v => S.n = v, v => fmt(v, 0));
}

/* ---------- CH 10  ループ ---------- */
{
  const FRAG = `
uniform float u_T;      // ループの長さ（秒）
uniform float u_R;      // 円の半径（大きいほど 1 周の変化が大きい）
uniform float u_mode;   // 0: ただ流す（ループしない）  1: 円を回ってループ  2: タイルの比較
void main() {
  vec2 uv = v_uv;
  float phase = fract(u_time / u_T);          // 0〜1 で 1 周
  float n;
  if (u_mode < 0.5) {
    n = fbm(uv * 4.0 + vec2(0.0, -u_time * 0.5));         // u_T 秒後に同じ絵には戻らない
  } else if (u_mode < 1.5) {
    // 時間を「円の上の点」に変える。1 周すると同じ場所に戻る = つなぎ目が無い
    vec2 loopOffset = vec2(cos(phase * 6.2832), sin(phase * 6.2832)) * u_R;
    n = fbm(uv * 4.0 + loopOffset);
  } else {
    // 空間のタイル：左 = 普通のノイズを 2×2 に並べる（境目が見える）  右 = 周期ノイズ
    vec2 h = vec2(fract(uv.x * 2.0), uv.y);
    vec2 tuv = fract(h * 2.0) * 4.0;
    n = uv.x < 0.5 ? fbm(tuv) : fbmP(tuv, vec2(4.0));
  }
  vec3 col = fireRamp(smoothstep(0.3, 0.8, n * 1.4));
  if (u_mode < 1.5 && uv.y < 0.04) col = uv.x < phase ? vec3(0.4, 0.9, 1.0) : vec3(0.15);  // 進み具合
  if (u_mode > 1.5 && abs(uv.x - 0.5) < 0.003) col = vec3(1.0);
  outColor = vec4(col, 1.0);
}`;
  const S = { T: 3, R: 1, mode: 1 };
  makeGL('g-loop', { frag: FRAG, uniforms: () => ({ u_T: S.T, u_R: S.R, u_mode: S.mode }) });
  showCode('code-loop', FRAG);
  slider('s-loop-T', v => S.T = v, v => fmt(v, 1) + ' 秒');
  slider('s-loop-R', v => S.R = v, v => fmt(v, 2));
  modeButtons('m-loop', d => S.mode = +d.v);
}
