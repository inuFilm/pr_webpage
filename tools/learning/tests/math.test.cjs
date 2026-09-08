const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const m = require('../demos.js');
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, a + ' vs ' + b);

test('sRGB round trips, endpoints, and half-light example', () => {
  for (const x of [0, .003, .04, .214, .5, .735, 1]) close(m.decode(m.encode(x)), x);
  close(m.encode(.5), .735356983, 1e-8);
  close(m.decode(.5), .214041140, 1e-8);
});
test('pixel average agrees with numerical integration and cancels whole cycles', () => {
  for (const [f, width] of [[3, .03], [28, 1/32], [64, 1/16]]) {
    const center = .37, phase = .18, n = 20000;
    let sum = 0;
    for (let i = 0; i < n; i++) sum += .5 + .5 * Math.sin(2 * Math.PI * (f * (center + ((i + .5)/n - .5)*width) + phase));
    close(m.filteredWave(center, f, phase, width), sum / n, 1e-7);
  }
  close(m.filteredWave(.2, 32, .13, 1/32), .5);
});
test('arc-length traversal is monotonic, bounded, and approximately equally spaced', () => {
  const p = [[30,106],[50,25],[65,140],[600,70]], table = m.arcTable(p);
  close(m.distanceToT(table, 0), 0); close(m.distanceToT(table, 1), 1);
  let prev = m.bezierPoint(p, 0), previousT = 0, distances = [];
  for (let i = 1; i <= 100; i++) {
    const t = m.distanceToT(table, i/100), next = m.bezierPoint(p, t);
    assert.ok(t > previousT); previousT = t;
    distances.push(Math.hypot(next[0]-prev[0], next[1]-prev[1])); prev = next;
  }
  assert.ok(Math.max(...distances)/Math.min(...distances) < 1.02);
  const flat = m.arcTable([[0,0],[0,0],[0,0],[0,0]]);
  close(m.distanceToT(flat, .5), 0);
});
test('constant drag exact solution composes across time steps', () => {
  for (const fps of [30,60,120]) {
    close(Math.pow(Math.exp(-3/fps), fps), Math.exp(-3));
    assert.ok(m.remainingVelocity(3, fps).euler < Math.exp(-3));
  }
});
function state(storage) {
  const context = { window: {}, localStorage: storage };
  vm.runInNewContext(fs.readFileSync(require.resolve('../lesson-state.js'), 'utf8'), context);
  // Deliberately reordered to ensure legacy indices are not array indices.
  return new context.window.LessonState('demo', [
    {dataset:{lessonId:'b',legacyIndex:'1'}}, {dataset:{lessonId:'a',legacyIndex:'0'}},
    {dataset:{lessonId:'new'}}
  ]);
}
test('numeric progress migrates by frozen legacy index, and v2 survives reordering', () => {
  const data = new Map([['demo-done-v1','[0,999,-1,"1",0]']]);
  const s = state({getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)});
  assert.deepEqual([...s.done], ['a']); assert.equal(s.index('#ch0'),1);
  assert.equal(s.index('#new'),2); assert.equal(s.index('#missing'),0);
  assert.ok(s.save()); assert.equal(data.get('demo-done-v1'),'[0,999,-1,"1",0]');
  assert.deepEqual([...state({getItem:k=>data.get(k)??null}).done],['a']);
});
test('blocked or malformed storage does not prevent reading lessons', () => {
  for (const storage of [
    {getItem:()=>'{broken',setItem:()=>{throw Error('blocked');}},
    {getItem:()=>{throw Error('blocked');},setItem:()=>{throw Error('blocked');}}
  ]) { const s=state(storage); assert.equal(s.done.size,0); assert.equal(s.save(),false); }
});
