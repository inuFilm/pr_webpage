/* International Morse, A-Z and 0-9. No dependencies or network requests. */
'use strict';
const MORSE = Object.freeze({A:'.-',B:'-...',C:'-.-.',D:'-..',E:'.',F:'..-.',G:'--.',H:'....',I:'..',J:'.---',K:'-.-',L:'.-..',M:'--',N:'-.',O:'---',P:'.--.',Q:'--.-',R:'.-.',S:'...',T:'-',U:'..-',V:'...-',W:'.--',X:'-..-',Y:'-.--',Z:'--..',0:'-----',1:'.----',2:'..---',3:'...--',4:'....-',5:'.....',6:'-....',7:'--...',8:'---..',9:'----.'});
const REVERSE = Object.fromEntries(Object.entries(MORSE).map(([a,b])=>[b,a]));
const cleanPhrase = value => value.toUpperCase().replace(/[^A-Z0-9\s]/g,'').replace(/\s+/g,' ').trim().slice(0,200);
const symbols = value => value.replace(/\./g,'·').replace(/-/g,'−');
const $ = id => document.getElementById(id);
const all = selector => [...document.querySelectorAll(selector)];
let sequence='', transcript='', selected='E', mode='free', target='', progress=0;
let pending=[], held=new Map(), busyUntil=0, toneUntil=0, idleAt=0, lastSymbol='-', lastDecoded='—';
let audio=null, soundOn=false, oscillator=null, gain=null;
let playing=false, playToken=0, playbackTimers=new Set();
const unit = () => 1200 / Number($('speed').value);
const message = text => { $('feedback').textContent=text; };
const pathFor = code => ['START',...Array.from(code,(_,i)=>REVERSE[code.slice(0,i+1)] || '○')].join(' → ');

function drawMap() {
  const ns='http://www.w3.org/2000/svg';
  function el(tag,attrs,parent=$('tree')){const n=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);parent.append(n);return n;}
  const root=el('text',{x:480,y:28,class:'root-label'});root.textContent='START';
  const paths=new Set();for(const code of Object.values(MORSE))for(let i=1;i<=code.length;i++)paths.add(code.slice(0,i));
  const positions={'':{x:480,y:45}};
  for(const code of [...paths].sort((a,b)=>a.length-b.length)){
    const parent=positions[code.slice(0,-1)], depth=code.length;
    const x=parent.x+(code.endsWith('.')?1:-1)*(450/2**depth),y=45+depth*85;
    positions[code]={x,y};
    el('path',{d:`M ${parent.x} ${parent.y+14} V ${y-25} H ${x} V ${y-14}`,class:'edge','data-code':code});
    const char=REVERSE[code];
    if(!char){el('circle',{cx:x,cy:y,r:3,fill:'#716a4c'});continue;}
    const node=el('g',{class:'node','data-code':code,role:'button',tabindex:'0','aria-label':`${char} ${symbols(code)}`});
    if(code.endsWith('.'))el('circle',{cx:x,cy:y,r:depth===5?12:17},node);else el('rect',{x:x-(depth===5?13:20),y:y-(depth===5?12:16),width:depth===5?26:40,height:depth===5?24:32,rx:3},node);
    el('text',{x,y,style:depth===5?'font-size:15px':''},node).textContent=char;
    node.addEventListener('click',()=>choose(char));
    node.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();choose(char);}});
  }
  for(const char of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'){
    const b=document.createElement('button');b.setAttribute('aria-label',`${char} ${symbols(MORSE[char])}`);
    const name=document.createElement('span'),code=document.createElement('small');name.textContent=char;code.textContent=symbols(MORSE[char]);b.append(name,code);b.onclick=()=>choose(char);$('alphabet').append(b);
  }
}
function highlight(code){for(const n of all('[data-code]'))n.classList.toggle('active',!!code&&code.startsWith(n.getAttribute('data-code')));$('path-label').textContent=pathFor(code);}
function choose(char){selected=char;highlight(MORSE[char]);if(!sequence){lastDecoded=char;$('decoded').textContent=$('show-live').checked?char:'?';$('sequence').textContent=symbols(MORSE[char]);}$('status').textContent=`見本 ${char} / ${symbols(MORSE[char])}`;}
function renderInput(){highlight(sequence);$('sequence').textContent=symbols(sequence);$('decoded').textContent=$('show-live').checked?(sequence?(REVERSE[sequence]||'?'):lastDecoded):'?';$('transcript').textContent=transcript||'入力した文字がここに並びます';}
function renderTarget(){
  $('target').replaceChildren();
  [...target].forEach((char,i)=>{const s=document.createElement('span');s.textContent=char===' '?'␣':char;s.className=i<progress?'done':i===progress?'current':'';$('target').append(s);});
  const char=target[progress];$('hint-text').textContent=$('hint').checked&&char?(char===' '?'単語の区切り → Space':`${char}  ${symbols(MORSE[char])}`):'';
}
function stopTone(){if(oscillator){try{oscillator.stop();}catch{}oscillator=null;}if(gain){gain.disconnect();gain=null;}}
async function enableSound(){
  try{if(!audio)audio=new (window.AudioContext||window.webkitAudioContext)();await audio.resume();soundOn=audio.state==='running';$('sound').textContent=soundOn?'音 ON':'音を有効にする';$('sound').setAttribute('aria-pressed',String(soundOn));return soundOn;}
  catch{soundOn=false;message('音声を利用できません。文字と光で練習できます。');return false;}
}
function beep(duration){
  if(!soundOn||!audio||audio.state!=='running')return;
  stopTone();oscillator=audio.createOscillator();gain=audio.createGain();oscillator.frequency.value=600;oscillator.type='sine';oscillator.connect(gain);gain.connect(audio.destination);
  const t=audio.currentTime,level=Number($('volume').value)/100;gain.gain.setValueAtTime(0,t);gain.gain.linearRampToValueAtTime(level,t+.004);gain.gain.setValueAtTime(level,t+Math.max(.004,duration/1000-.006));gain.gain.linearRampToValueAtTime(0,t+duration/1000);oscillator.start(t);oscillator.stop(t+duration/1000+.01);
}
function stopPlayback(){playToken++;playing=false;all('.paddle').forEach(n=>n.classList.remove('firing')); for(const t of playbackTimers)clearTimeout(t);playbackTimers.clear();$('play-phrase').textContent='文章を聴く';$('hear').textContent='選んだ文字を聴く';stopTone();}
function stopInput(){held.clear();pending=[];busyUntil=0;toneUntil=0;idleAt=performance.now();all('.paddle').forEach(n=>n.classList.remove('firing'));stopTone();}
function reset(){stopPlayback();stopInput();sequence='';transcript='';lastDecoded='—';renderInput();$('meter').style.width='0%';}
function schedule(fn,delay,token){const timer=setTimeout(()=>{playbackTimers.delete(timer);if(token===playToken)fn();},delay);playbackTimers.add(timer);}
async function play(text){
  if(playing){stopPlayback();$('status').textContent='再生を停止';return;}
  stopInput();sequence='';renderInput();
  const token=++playToken;playing=true;
  await enableSound();if(token!==playToken)return;
  $('play-phrase').textContent='再生を停止';$('hear').textContent='再生を停止';
  let time=0;const u=unit();
  [...text].forEach((char,i)=>{
    if(char===' '){time+=4*u;return;}
    const code=MORSE[char];if(!code)return;
    schedule(()=>{choose(char);$('status').textContent=`再生中 ${char}`;},time,token);
    [...code].forEach((s,j)=>{const duration=s==='.'?u:3*u;schedule(()=>{beep(duration);$(s==='.'?'dit':'dah').classList.add('firing');},time,token);schedule(()=>all('.paddle').forEach(n=>n.classList.remove('firing')),time+duration,token);time+=duration+(j<code.length-1?u:0);});
    if(i<text.length-1)time+=3*u;
  });
  schedule(()=>{stopPlayback();$('status').textContent='再生完了';},time+20,token);
}
function accept(char){
  if(mode==='free'){transcript+=char;return;}
  if(progress>=target.length){message('練習完了。「次の問題」で続けられます。');return;}
  if(char===target[progress]){transcript+=char;progress++;message(progress===target.length?'正解！ 練習完了です。「次の問題」で続けましょう。':`正解 ${char===' '?'空白':char} · ${progress} / ${target.length}`);}
  else message(`いまの入力は ${char===' '?'空白':char}。次は ${target[progress]===' '?'空白':target[progress]} です。もう一度。`);
  renderTarget();
}
function confirm(){
  if(playing)return;
  if(!sequence)return;
  const code=sequence,char=REVERSE[code];sequence='';lastDecoded=char||'?';
  if(char){accept(char);$('status').textContent=`確定 ${char}`;}else{message(`${symbols(code)} は英数字にない符号です。もう一度入力してください。`);$('status').textContent='未定義の符号';}
  renderInput();$('meter').style.width='0%';
}
function addSpace(){if(playing)return;stopInput();confirm();if(!transcript.endsWith(' ')&&(transcript||mode!=='free'))accept(' ');renderInput();}
function start(source,s){
  if(playing||held.has(source))return;
  held.set(source,s);if(pending.length<8)pending.push(s);idleAt=0;
}
function release(source){held.delete(source);if(!held.size)idleAt=Math.max(performance.now(),toneUntil);}
function tick(){
  if(playing)return;
  const now=performance.now();
  for(const [id,s] of [['dit','.'],['dah','-']])$(id).classList.toggle('firing',now<toneUntil&&lastSymbol===s);
  if(now>=busyUntil){
    let s=pending.shift();
    if(!s&&$('repeat').value==='repeat'&&held.size){const values=[...held.values()];s=values.includes('.')&&values.includes('-')?(lastSymbol==='.'?'-':'.'):values[values.length-1];}
    if(s){
      if(sequence.length>=5){message('英数字は最大5打です。文字を確定するか、1つ戻してください。');pending=[];held.clear();return;}
      const duration=(s==='.'?1:3)*unit();sequence+=s;lastSymbol=s;toneUntil=now+duration;busyUntil=toneUntil+unit();idleAt=toneUntil;beep(duration);renderInput();$('status').textContent=REVERSE[sequence]?`入力中 ${sequence.length} 打`:'続けて入力';
    }
  }
  if(sequence&&!pending.length&&!held.size&&now>=toneUntil){const wait=Math.max(Number($('gap').value),3*unit());const ratio=Math.min(1,(now-idleAt)/wait);$('meter').style.width=$('auto').checked?`${ratio*100}%`:'0%';if($('auto').checked&&ratio>=1)confirm();}
}
function next(){
  reset();progress=0;
  if(mode==='letter'){let pool=$('group').value;if(pool==='letters')pool='ABCDEFGHIJKLMNOPQRSTUVWXYZ';if(pool==='numbers')pool='0123456789';if(pool==='all')pool='ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';target=pool[Math.floor(Math.random()*pool.length)];}
  else if(mode==='phrase'){target=cleanPhrase($('phrase').value);$('normalized').textContent=target?`練習文：${target}`:'英字か数字を入力してください。';}
  else target='';renderTarget();message(mode==='free'?'自由に入力できます。空白は Space。':target?'表示された文字をパドルで入力してください。':'練習文を入力してください。');
}
for(const b of all('[data-mode]'))b.onclick=()=>{mode=b.dataset.mode;all('[data-mode]').forEach(n=>n.setAttribute('aria-pressed',String(n===b)));$('exercise').hidden=mode==='free';$('phrase-tools').hidden=mode!=='phrase';$('group-wrap').hidden=mode!=='letter';next();};
for(const [id,s] of [['dit','.'],['dah','-']]){
  const n=$(id);
  n.addEventListener('pointerenter',e=>{if(e.pointerType==='mouse')start('mouse',s);});
  n.addEventListener('pointerleave',e=>{if(e.pointerType==='mouse')release('mouse');});
  n.addEventListener('pointerdown',e=>{if(e.pointerType!=='mouse'){e.preventDefault();n.setPointerCapture(e.pointerId);start(`touch${e.pointerId}`,s);}});
  for(const ev of ['pointerup','pointercancel','lostpointercapture'])n.addEventListener(ev,e=>{if(e.pointerType!=='mouse')release(`touch${e.pointerId}`);});
  // Keyboard activation of the actual button: one pulse, independent of hover.
  n.addEventListener('click',e=>{if(e.detail===0){start('accessible',s);release('accessible');}});
}
window.addEventListener('keydown',e=>{
  if(e.ctrlKey||e.altKey||e.metaKey||/INPUT|TEXTAREA|SELECT/.test(e.target.tagName))return;
  const k=e.key.toLowerCase();if((e.target.tagName==='BUTTON'||e.target.getAttribute('role')==='button')&&(k==='enter'||k===' '))return;if(!['f','j','enter',' ','backspace','escape'].includes(k))return;e.preventDefault();if(e.repeat)return;
  if(k==='f'||k==='j')start(k,k==='f'?'.':'-');else if(k==='enter'){stopInput();confirm();}else if(k===' ')addSpace();else if(k==='backspace')undo();else{stopInput();stopPlayback();}
});
window.addEventListener('keyup',e=>release(e.key.toLowerCase()));
function pause(){stopInput();stopPlayback();sequence='';renderInput();$('meter').style.width='0%';}
window.addEventListener('blur',pause);document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});
function undo(){stopInput();stopPlayback();if(sequence)sequence=sequence.slice(0,-1);else if(transcript){transcript=transcript.slice(0,-1);if(mode!=='free')progress=Math.max(0,progress-1);}lastDecoded='—';renderInput();renderTarget();}
$('undo').onclick=undo;$('clear').onclick=()=>{reset();progress=0;renderTarget();message('入力をクリアしました。');};$('confirm').onclick=()=>{stopInput();confirm();};$('space').onclick=addSpace;
$('sound').onclick=()=>{if(soundOn){soundOn=false;stopTone();$('sound').textContent='音を有効にする';$('sound').setAttribute('aria-pressed','false');}else enableSound();};
$('hear').onclick=()=>play(selected);$('play-phrase').onclick=()=>{if(target)play(target);};
all('[data-route]').forEach(b=>b.onclick=()=>choose(REVERSE[b.dataset.route]));
$('next').onclick=next;$('group').onchange=next;$('apply-phrase').onclick=next;
let sampleIndex=0;const samples=['HELLO WORLD 73','CQ CQ DE MORSE','THE QUICK BROWN FOX 123','GOOD MORNING','PRACTICE MAKES PERFECT'];
$('sample').onclick=()=>{$('phrase').value=samples[++sampleIndex%samples.length];next();};
$('hint').onchange=renderTarget;$('show-live').onchange=renderInput;
for(const [id,suffix] of [['speed',' WPM'],['gap',' ms'],['volume','%']])$(id).oninput=()=>{$(id+'-value').textContent=$(id).value+suffix;};
$('repeat').onchange=()=>{stopInput();};
drawMap();highlight(MORSE.E);setInterval(tick,16);
