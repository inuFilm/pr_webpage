'use strict';
const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
class Element {
  constructor(tag='DIV'){this.tagName=tag.toUpperCase();this.attrs={};this.dataset={};this.children=[];this.handlers={};this.style={};this.value='';this.checked=false;this.textContent='';this.hidden=false;const classes=new Set();this.classList={toggle:(c,on)=>on?classes.add(c):classes.delete(c),remove:c=>classes.delete(c),add:c=>classes.add(c)};}
  setAttribute(k,v){this.attrs[k]=String(v);if(k.startsWith('data-'))this.dataset[k.slice(5)]=String(v);}
  getAttribute(k){return this.attrs[k]??null;}
  append(...nodes){this.children.push(...nodes);}
  replaceChildren(...nodes){this.children=nodes;}
  addEventListener(k,fn){this.handlers[k]=fn;}
  setPointerCapture(){}
  scrollIntoView(){}
}
const elements={};const html=fs.readFileSync(__dirname+'/index.html','utf8');
for(const match of html.matchAll(/<([a-z]+)[^>]*\bid="([^"]+)"[^>]*>/g)){const n=elements[match[2]]=new Element(match[1]);const value=match[0].match(/\bvalue="([^"]*)"/);if(value)n.value=value[1];n.checked=/\bchecked\b/.test(match[0]);}
elements.speed.value='12';elements.gap.value='900';elements.repeat.value='single';elements.group.value='all';elements.phrase.value='HELLO WORLD 73';
const modeButtons=['free','letter','phrase'].map(mode=>{const n=new Element('button');n.dataset.mode=mode;return n;});
const routes=['---','....','.---'].map(route=>{const n=new Element('button');n.dataset.route=route;return n;});
const descendants=()=>{const out=[];function walk(n){out.push(n);n.children.forEach(walk);}Object.values(elements).forEach(walk);return out;};
const doc={getElementById:id=>elements[id],createElement:tag=>new Element(tag),createElementNS:(_,tag)=>new Element(tag),addEventListener(){},querySelectorAll:selector=>selector==='[data-mode]'?modeButtons:selector==='[data-route]'?routes:selector==='[data-code]'?descendants().filter(n=>n.attrs['data-code']):selector==='.paddle'?[elements.dit,elements.dah]:[]};
let now=0,id=0;const timers=new Map();const handlers={};
const context=vm.createContext({document:doc,window:{addEventListener:(ev,fn)=>handlers[ev]=fn},performance:{now:()=>now},setInterval(){},setTimeout:(fn,delay)=>{timers.set(++id,{fn,at:now+delay});return id;},clearTimeout:id=>timers.delete(id),console});
vm.runInContext(fs.readFileSync(__dirname+'/app.js','utf8'),context);
const run=code=>vm.runInContext(code,context);
const advance=ms=>{now+=ms;for(const [id,t] of [...timers])if(t.at<=now){timers.delete(id);t.fn();}run('tick()');};
function pulse(s){run(`start('test','${s}');tick();release('test')`);advance(s==='.'?210:410);}
run("$('auto').checked=false");
const codes=JSON.parse(run('JSON.stringify(MORSE)'));
assert.equal(Object.keys(codes).length,36);
for(const [char,code] of Object.entries(codes)){run('reset()');for(const s of code)pulse(s);run('confirm()');assert.equal(run('transcript'),char,char+' decoding');}
assert.equal(run("cleanPhrase('Hello,  world! 日本語 73')"),'HELLO WORLD 73');
run("reset();mode='phrase';target='A 1';progress=0");pulse('.');run('confirm()');assert.equal(run('progress'),0,'Wrong letter must not advance');
for(const s of '.-')pulse(s);run('confirm()');assert.equal(run('progress'),1);run('addSpace()');assert.equal(run('progress'),2);
for(const s of '.----')pulse(s);run('confirm()');assert.equal(run('transcript'),'A 1');assert.equal(run('progress'),3);run('undo()');assert.equal(run('progress'),2);
run("reset();mode='free';$('auto').checked=true");pulse('.');advance(1000);assert.equal(run('transcript'),'E','Idle auto confirm');
run("reset();start('mouse','.');tick()");advance(1500);assert.equal(run('sequence'),'.','Single hover must not repeat or confirm while held');run("release('mouse')");advance(1000);assert.equal(run('transcript'),'E');
run("reset();$('repeat').value='repeat';start('mouse','-');tick()");advance(410);assert.equal(run('sequence'),'--');run("release('mouse')");advance(1300);assert.equal(run('transcript'),'M');
run("reset();$('auto').checked=false;$('repeat').value='single'");
// Genuine mouse entry handlers: no click necessary.
elements.dit.handlers.pointerenter({pointerType:'mouse'});run('tick()');elements.dit.handlers.pointerleave({pointerType:'mouse'});advance(210);assert.equal(run('sequence'),'.');
handlers.blur();advance(2000);assert.equal(run('held.size'),0);assert.equal(run('sequence'),'');
run("start('f','.');tick();start('j','-')");run('pause()');assert.equal(run('pending.length'),0);
run("reset();$('repeat').value='single'");for(let i=0;i<6;i++)pulse('.');assert.equal(run('sequence').length,6,'Overflow marked invalid without stopping keyer');
run("reset();$('repeat').value='repeat';start('mouse','.');");for(let i=0;i<9;i++)advance(210);assert.equal(run('held.size'),1,'Holding beyond five must keep firing');assert.equal(run('sequence').length,6);run("release('mouse');reset();$('repeat').value='single'");
// F/J remain usable after the sound or mode button received focus.
run('reset()');handlers.keydown({key:'f',target:new Element('button'),preventDefault(){}});run('tick()');handlers.keyup({key:'f'});assert.equal(run('sequence'),'.');
// Playback duration: E [7 units] E = 9 units including tones.
(async()=>{run('reset()');await run("play('E E')");assert.equal(run('playing'),true);const end=Math.max(...[...timers.values()].map(t=>t.at))-now;assert.equal(end,920);run('stopPlayback()');assert.equal(timers.size,0);assert.equal(run('playing'),false);console.log('PASS: 36 codes, phrase validation, spaces, undo, hover, repeat, auto confirm, blur, overflow, keyboard focus, playback timing and stop.');})().catch(e=>{console.error(e);process.exitCode=1;});

