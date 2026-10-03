import {scene,layer,copy,findLayer,flatLayers,removeLayer,moveLayer,duplicateLayer,groupLayer,validateScene,History,settings} from './comp.js';
import {BLENDS,linearToSrgb,srgbToLinear,clamp,imageStats} from './color.js';
import {EFFECTS,effect} from './effects.js';
import {Compositor} from './gl.js';
import {loadSamples,BACKGROUNDS} from './samples.js';
import {autoMatch,reportText} from './match.js';
import {scopeData,drawScope} from './scopes.js';
import {encodePNG} from './png.js';
import {initLessons} from './lessons.js';
import {parseCube,curveTable} from './lut.js';
import {modelParams,lightsFromStats} from './model3d.js';
const $=id=>document.getElementById(id);
const status=(message,error=false)=>{$('status').textContent=message;$('status').classList.toggle('error',error);};
const readStorage=key=>{try{return JSON.parse(localStorage.getItem(key));}catch{return null;}};
let prefs=settings(readStorage('compolab-settings-v1')||{});
let comp=scene(),selected='character',report=null,renderer,ready=false,busy=false,pendingFrame=false,scopeKind='histogram',scopeBefore={},showBefore=false;
const history=new History();
try{const saved=readStorage('compolab-scene-v1');if(saved)comp=validateScene(saved);}catch{status('保存データを読めなかったため、サンプルから始めます。',true);}
const node=(tag,className,text)=>{const e=document.createElement(tag);if(className)e.className=className;if(text!==undefined)e.textContent=text;return e;};
function save(){
  try{localStorage.setItem('compolab-scene-v1',JSON.stringify(comp));localStorage.setItem('compolab-settings-v1',JSON.stringify(prefs));}
  catch{$('storage-warning').hidden=false;status('保存できない環境です。作業は続けられます。JSON を書き出して保管してください。',true);}
}
function changed({structure=false,preserveReport=false}={}){
  if(!preserveReport&&report){report=null;$('report').textContent='設定を変更しました。再計測には「背景に合わせる」を実行してください。';}
  save();renderLayers();if(structure)renderProperties();syncToolbar();schedule();
}
function transaction(action,options={}){
  history.begin(comp);try{action();}finally{history.commit(comp);}changed(options);
}
function schedule(){if(!ready||pendingFrame)return;pendingFrame=true;requestAnimationFrame(()=>{pendingFrame=false;try{draw();}catch(e){status(e.message,true);}});}
function draw(){
  const role=$('scope-target').value==='all'?null:$('scope-target').value;
  const pixels=renderer.read(comp,{maxSize:256,role});
  drawScope($('scope'),scopeKind,scopeData(pixels),$('scope-overlay').checked?scopeBefore[role||'all']:null);
  renderer.display(comp,{maxSize:prefs.resolution,ab:$('ab-toggle').getAttribute('aria-pressed')==='true'||showBefore,split:showBefore?1:Number($('ab-split').value),checker:prefs.checker,solo:comp.view.solo});
  $('dimensions').textContent=comp.width+' × '+comp.height+' · '+(comp.space==='linear'?'リニア':'ガンマ');
  $('scene-name').textContent=comp.name;applyView();
}
function applyView(){const v=comp.view;$('view').style.transform='translate('+v.pan[0]+'px,'+v.pan[1]+'px) scale('+v.zoom+')';$('zoom').value=v.zoom;$('zoom-value').value=Math.round(v.zoom*100)+'%';}
function syncToolbar(){
  $('undo').disabled=!history.past.length;$('redo').disabled=!history.future.length;
  $('space').value=comp.space;$('resolution').value=prefs.resolution;$('checker').checked=prefs.checker;$('output-exposure').value=comp.output.exposure;
  $('post-count').textContent=comp.postEffects.length;
  $('output-tonemap').value=comp.output.tonemap;
  const bg=comp.layers.find(l=>l.role==='bg');if(bg?.params.src?.startsWith('sample:bg:'))$('sample').value=bg.params.src.split(':')[2];
}
function setPanel(panel){prefs.panel=panel;$('lab').dataset.panel=panel;document.querySelectorAll('[data-panel]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.panel===panel)));save();schedule();}
function renderLayers(){
  const root=$('layers');root.replaceChildren();
  function walk(items,depth=0){[...items].reverse().forEach(l=>{
    const row=node('div','layer'+(selected===l.id?' selected':''));row.setAttribute('role','listitem');row.dataset.layerId=l.id;row.draggable=true;row.style.marginLeft=depth*10+'px';
    const eye=node('button','visibility',l.visible?'◉':'○');eye.setAttribute('aria-label',l.name+'を'+(l.visible?'非表示':'表示'));eye.onclick=()=>transaction(()=>l.visible=!l.visible);
    const select=node('button','select-layer',(l.type==='group'?'▾ ':'')+l.name);select.title=l.name;
    select.onclick=e=>{if(e.altKey){comp.view.solo=comp.view.solo===l.id?null:l.id;schedule();return;}selected=l.id;renderLayers();renderProperties();setPanel('properties');};
    select.ondblclick=()=>{$('layer-name')?.focus();$('layer-name')?.select();};
    row.append(eye,select);if(l.clipTo)row.append(node('span','clip-badge','↳'));if(l.role)row.append(node('span','role',{char:'キャラ',bg:'背景',book:'BOOK'}[l.role]));
    row.ondragstart=e=>{e.dataTransfer.setData('application/x-compolab-layer',l.id);e.dataTransfer.effectAllowed='move';};
    row.ondragover=e=>{if([...e.dataTransfer.types].includes('application/x-compolab-layer'))e.preventDefault();};
    row.ondrop=e=>{const id=e.dataTransfer.getData('application/x-compolab-layer');if(!id)return;e.preventDefault();e.stopPropagation();transaction(()=>moveLayer(comp,id,l.id,e.shiftKey),{structure:true});};
    root.append(row);walk(l.children,depth+1);
  });}walk(comp.layers);
}
function selectOptions(values,value,callback,label){
  const s=node('select');s.setAttribute('aria-label',label);
  for(const [key,title] of Object.entries(values)){const o=node('option',null,title);o.value=key;s.append(o);}s.value=value;
  s.onchange=()=>transaction(()=>callback(s.value),{structure:true});return s;
}
function control(parent,definition,object,{prefix='',onInput=()=>{}}={}){
  const d=definition,field=node('div','field'),label=node('label','label',d.label+(d.unit?' · '+d.unit:''));field.append(label);
  const aria=prefix+d.label;
  const set=value=>{history.begin(comp);object[d.key]=value;onInput();changed();};
  const commit=()=>{history.commit(comp);syncToolbar();};
  if(d.kind==='select'||d.kind==='source'){
    const options=d.kind==='source'?{'alpha-inverse':'キャラの外側',luma:'明るい所',...Object.fromEntries(flatLayers(comp).map(({layer:l})=>['mask:'+l.id,l.name+'のマスク']))}:d.options;
    field.append(selectOptions(options,object[d.key],v=>object[d.key]=v,aria));
  }else if(d.kind==='lut'){
    const input=node('input');input.type='file';input.accept='.cube';input.setAttribute('aria-label',aria);
    const info=node('p','hint',object[d.key]?object[d.key].title+' · '+object[d.key].size+'段':'LUT 未読込（変化なし）。選んだ表はシーンと一緒に保存します。');
    input.onchange=async()=>{try{const file=input.files[0];if(!file)return;if(file.size>5000000)throw new Error('LUT は5 MBまでです');const table=parseCube(await file.text());set(table);commit();renderProperties();status('LUT を端末内に読み込みました。');}catch(e){status(e.message,true);}};field.append(input,info);
  }else if(d.kind==='curve'){
    const canvas=node('canvas','curve-preview');canvas.width=256;canvas.height=100;canvas.setAttribute('aria-label','輝度カーブの形');
    const paint=()=>{const ctx=canvas.getContext('2d'),values=curveTable(object[d.key]);ctx.fillStyle='#142935';ctx.fillRect(0,0,256,100);ctx.strokeStyle='#526878';ctx.beginPath();ctx.moveTo(0,100);ctx.lineTo(256,0);ctx.stroke();ctx.strokeStyle='#6ee7b7';ctx.beginPath();values.forEach((v,i)=>i?ctx.lineTo(i,100-v*100):ctx.moveTo(i,100-v*100));ctx.stroke();};
    field.append(canvas);object[d.key].forEach((v,i)=>{const row=node('label','curve-point','入力 '+(i/4).toFixed(2));const input=node('input');input.type='number';input.min=0;input.max=1;input.step=.01;input.value=v;input.setAttribute('aria-label',aria+' '+i);input.oninput=()=>{if(!Number.isFinite(input.valueAsNumber))return;const points=[...object[d.key]];points[i]=clamp(input.valueAsNumber,points[i-1]??0,points[i+1]??1);input.value=points[i];set(points);paint();};input.onchange=input.onblur=commit;row.append(input);field.append(row);});paint();
  }else if(d.kind==='color'){
    const input=node('input');input.type='color';input.setAttribute('aria-label',aria);
    input.value='#'+object[d.key].map(x=>Math.round(clamp(linearToSrgb(x))*255).toString(16).padStart(2,'0')).join('');
    input.oninput=()=>set([1,3,5].map(i=>srgbToLinear(parseInt(input.value.slice(i,i+2),16)/255)));input.onchange=commit;label.append(input);label.classList.add('color-field');
  }else if(d.kind==='boolean'){
    const input=node('input');input.type='checkbox';input.checked=object[d.key];input.onchange=()=>{set(input.checked);commit();};label.prepend(input);
  }else if(d.kind==='vector'){
    const inputs=node('div','vector-inputs');field.append(inputs);
    object[d.key].forEach((v,i)=>{const input=node('input');input.type='number';input.min=d.min??0;input.max=d.max??1;input.step=d.step||.01;input.value=v;input.setAttribute('aria-label',aria+' '+['R / L','G / a','B / b'][i]);
      input.oninput=()=>{const n=input.valueAsNumber;if(Number.isFinite(n)){const next=[...object[d.key]];next[i]=clamp(n,Number(input.min),Number(input.max));set(next);}};input.onchange=commit;inputs.append(input);});
  }else{
    const pair=node('div','range-pair'),range=node('input'),num=node('input');range.type='range';num.type='number';
    for(const input of [range,num]){input.min=d.min;input.max=d.max;input.step=d.step;input.value=object[d.key];input.setAttribute('aria-label',aria+(input===num?'（数値）':''));input.oninput=()=>{if(!Number.isFinite(input.valueAsNumber))return;const v=clamp(input.valueAsNumber,d.min,d.max);range.value=v;if(input!==num)num.value=v;set(v);};input.onchange=commit;input.onblur=commit;}
    pair.append(range,num);field.append(pair);
  }
  parent.append(field);return field;
}
const numeric=(key,label,min,max,step)=>({key,label,min,max,step});
function effectUI(parent,list){
  list.forEach((e,index)=>{
    const box=node('section','effect-card'),head=node('div','effect-head'),label=node('label',null,EFFECTS[e.type].label),toggle=node('input');toggle.type='checkbox';toggle.checked=e.enabled;toggle.onchange=()=>transaction(()=>e.enabled=toggle.checked);label.prepend(toggle);head.append(label);
    for(const [text,title,fn] of [['↑','効果を上へ',()=>{if(index>0)[list[index-1],list[index]]=[list[index],list[index-1]];}],['↓','効果を下へ',()=>{if(index<list.length-1)[list[index+1],list[index]]=[list[index],list[index+1]];}],['×','効果を削除',()=>list.splice(index,1)]]){
      const b=node('button',null,text);b.setAttribute('aria-label',EFFECTS[e.type].label+title);b.onclick=()=>transaction(fn,{structure:true});head.append(b);
    }
    box.append(head);for(const d of EFFECTS[e.type].params)if(!d.globalOnly||list===comp.postEffects)control(box,d,e.params,{prefix:EFFECTS[e.type].label+' '});parent.append(box);
  });
  const add=node('div','effect-add'),select=node('select');select.setAttribute('aria-label','追加する効果');
  for(const [type,def] of Object.entries(EFFECTS)){const opt=node('option',null,def.label);opt.value=type;select.append(opt);}
  const button=node('button',null,'＋効果');button.onclick=()=>transaction(()=>list.push(effect(select.value)),{structure:true});add.append(select,button);parent.append(add);
}
function renderProperties(){
  const parent=$('properties');parent.replaceChildren();
  renderer?.stage3d?.select(findLayer(comp,selected));
  if(selected==='post'){$('selected-type').textContent='全体';parent.append(node('p','hint','合成した画像全体に、上から順に掛かります。「出力変換の直前」のLUTは他の全体効果の後、出力露出・トーンマップの前に掛かります。'));effectUI(parent,comp.postEffects);return;}
  let l=findLayer(comp,selected);if(!l){l=comp.layers.at(-1);selected=l?.id;}
  if(!l){parent.append(node('p','hint','レイヤーを追加してください。'));return;}
  $('selected-type').textContent={image:'画像',solid:'単色',gradient:'パラ',adjust:'調整',group:'グループ',render3d:'3D'}[l.type];
  const name=node('input');name.type='text';name.id='layer-name';name.value=l.name;name.setAttribute('aria-label','レイヤー名');name.onchange=()=>transaction(()=>l.name=name.value||'レイヤー');const field=node('div','field');field.append(name);parent.append(field);
  parent.append(selectOptions({none:'役割なし',char:'キャラ',bg:'背景',book:'前景（BOOK）'},l.role||'none',v=>l.role=v==='none'?null:v,'役割'));
  const blendField=node('div','field');blendField.append(node('label','label','ブレンド'),selectOptions(BLENDS,l.blend,v=>l.blend=v,'ブレンド'));parent.append(blendField);
  control(parent,numeric('opacity','不透明度',0,1,.01),l);
  const all=flatLayers(comp),index=all.findIndex(x=>x.layer.id===l.id),below=all.slice(0,index).map(x=>x.layer);
  parent.append(selectOptions({'':'クリップなし',...Object.fromEntries(below.map(x=>[x.id,x.name+'にクリップ']))},l.clipTo||'',v=>l.clipTo=v||null,'クリッピング'));
  const maskDetails=node('details'),maskTitle=node('summary',null,'マスク');maskDetails.append(maskTitle);
  const model=below.findLast(x=>x.type==='render3d')||(l.type==='render3d'?l:null),materials=renderer?.stage3d?.assets.get(model?.params.src)?.materials||[];
  maskDetails.append(selectOptions({none:'なし',gradient:'グラデーション',rect:'矩形',...Object.fromEntries(below.flatMap(x=>[['alpha:'+x.id,x.name+'のアルファ'],['luma:'+x.id,x.name+'の輝度']])),...Object.fromEntries(materials.map((m,i)=>['id:'+(i+1),'3D '+(m.name||'材質')+' (ID '+(i+1)+')']))},l.mask.source,v=>l.mask.source=v,'マスクの元'));
  control(maskDetails,{key:'invert',label:'反転',kind:'boolean'},l.mask);control(maskDetails,numeric('feather','ぼかし',0,.2,.001),l.mask);
  if(l.mask.source==='gradient'){l.mask.angle??=90;control(maskDetails,numeric('angle','向き',-180,180,1),l.mask);}
  if(l.mask.source==='rect'){l.mask.rect??=[.2,.2,.8,.8];for(let i=0;i<4;i++)control(maskDetails,numeric(i,['左','上','右','下'][i],0,1,.01),l.mask.rect);}
  parent.append(maskDetails);
  if(l.type!=='adjust'&&!l.params.baseLayer){
    if(l.type==='image'&&!renderer?.assets.has(l.params.src))parent.append(node('p','lesson-note','元の画像を読み込み直してください: '+l.params.src.replace('user:','')));
    const detail=node('details');detail.append(node('summary',null,'変形'));
    for(const def of [numeric('x','位置 X',-comp.width,comp.width,1),numeric('y','位置 Y',-comp.height,comp.height,1),numeric('scale','拡大率',.01,4,.01),numeric('rotate','回転',-180,180,1),{key:'flipX',label:'左右反転',kind:'boolean'}])control(detail,def,l.transform);
    parent.append(detail);
  }
  if(l.type==='solid'||l.type==='gradient')control(parent,{key:'color',label:l.type==='solid'?'色':'パラの色',kind:'color'},l.params);
  if(l.type==='gradient'){
    parent.append(selectOptions({linear:'直線',radial:'放射'},l.params.kind,v=>l.params.kind=v,'パラの形'));
    for(const def of [numeric('angle','角度',-180,180,1),numeric('start','開始位置',0,1,.01),numeric('end','終了位置',0,1,.01),numeric('feather','柔らかさ',0,1,.01),numeric('alphaStart','始点の濃さ',0,1,.01),numeric('alphaEnd','終点の濃さ',0,1,.01)])control(parent,def,l.params);
  }
  if(l.type==='adjust'){
    const kind=l.params.kind||'colorgrade';parent.append(selectOptions(Object.fromEntries(['colorgrade','stats','range','curve','lut'].map(k=>[k,EFFECTS[k].label])),kind,v=>l.params={kind:v,...effect(v).params},'調整の種類'),node('h3',null,EFFECTS[kind].label));
    for(const d of EFFECTS[kind].params)if(!d.globalOnly)control(parent,d,l.params,{prefix:EFFECTS[kind].label+' '});
  }
  if(l.params.baseLayer)parent.append(node('p','hint','キャラを一度だけ合成する背景合わせグループ。移動・複製・グループ化はキャラと一緒に行います。子の調整を順に切り替えて効果を確かめます。'));
  if(l.type==='render3d')modelUI(parent,l);
  parent.append(node('h3',null,'レイヤーの効果'));effectUI(parent,l.effects);
}
function modelUI(parent,l){
 const p=l.params,asset=renderer.stage3d?.assets.get(p.src);
 parent.append(node('h3',null,'3D のカメラと照明'),node('p','hint','モデル選択中：ドラッグで回転、右ドラッグで移動、ホイール／ピンチで距離。編集はUndoで戻せます。'));
 if(!asset)parent.append(node('p','lesson-note','元のモデルと関連ファイルを読み込み直してください。'));
 const auto=node('button','wide','背景から照明を作る');auto.id='lights-from-bg';auto.onclick=()=>{
  try{const pixels=renderer.read(comp,{role:'bg',maxSize:256}),stats=imageStats(pixels.data,pixels.width,pixels.height);if(!stats.count)throw new Error('先に背景を読み込んでください');transaction(()=>p.lights=lightsFromStats(stats),{structure:true});status('背景の上20%・下20%と明部から照明を作りました。各ライトを調整できます。');}catch(e){status(e.message,true);}
 };parent.append(auto);
 const camera=node('details');camera.append(node('summary',null,'カメラ'));
  control(camera,numeric('fov','画角',10,100,1),p.camera);control(camera,{key:'ortho',label:'平行投影',kind:'boolean'},p.camera);
 control(camera,numeric('zoom','3D ズーム',.1,20,.05),p.camera);
 for(const [key,label] of [['pos','カメラ位置 XYZ'],['target','注視点 XYZ']])control(camera,{key,label,kind:'vector',min:-20,max:20,step:.05},p.camera);
 const reset=node('button',null,'カメラを全体へ');reset.onclick=()=>transaction(()=>p.camera=modelParams().camera,{structure:true});camera.append(reset);parent.append(camera);
 for(const [key,title] of [['key','キーライト'],['fill','フィルライト'],['rim','リムライト'],['hemi','半球光']]){
  const box=node('details');box.append(node('summary',null,title));const light=p.lights[key];
  for(const colorKey of key==='hemi'?['sky','ground']:['color'])control(box,{key:colorKey,label:colorKey==='sky'?'上20%の色':colorKey==='ground'?'下20%の色':'色',kind:'color'},light,{prefix:title+' '});
  control(box,numeric('intensity','強さ',0,10,.05),light,{prefix:title+' '});if(key!=='hemi')control(box,{key:'dir',label:'光の方向 XYZ',kind:'vector',min:-10,max:10,step:.05},light,{prefix:title+' '});parent.append(box);
 }
 control(parent,{key:'outline',label:'アウトライン',kind:'boolean'},p);
 const passes=node('details');passes.append(node('summary',null,'3D のパス'));
 for(const [key,label] of [['depth','深度'],['normal','法線'],['id','マテリアルID']])control(passes,{key,label:label+'を生成',kind:'boolean'},p.passes);
 passes.append(selectOptions({color:'カラー',depth:'深度（距離0〜10）',normal:'法線',id:'マテリアルID'},p.preview,v=>p.preview=v,'3Dパスの表示'));
 passes.append(node('p','hint','深度は空気感・被写界深度、法線は「3D リムライト」に使います。材質限定の色調整は、上に調整レイヤーを追加しマスクにIDを選びます。'));
 if(asset)passes.append(node('p','hint',asset.materials.map((m,i)=>(i+1)+': '+m.name).join(' / ')));parent.append(passes);
}
let stagePromise;
async function getStage(){
 if(renderer.stage3d)return renderer.stage3d;
 if(!stagePromise)stagePromise=import('./stage3d.js').then(({Stage3D})=>renderer.stage3d=new Stage3D(renderer,{start:()=>history.begin(comp),change:()=>{save();schedule();},end:()=>{history.commit(comp);changed({structure:true});}})).catch(e=>{stagePromise=null;throw e;});
 return stagePromise;
}
async function prepare3D(next){
 const models=flatLayers(next).filter(x=>x.layer.type==='render3d');if(!models.length)return;
 const stage=await getStage();if(models.some(x=>x.layer.params.src==='sample:sotai_girl'))await stage.sample();
}
async function loadModel(files=null){
 if(!ready||busy)return;busy=true;
 try{
  const stage=await getStage();let key='sample:sotai_girl',restoreTarget=null;
  if(files){const model=[...files].find(f=>/\.(vrm|glb|gltf)$/i.test(f.name));if(!model)throw new Error('VRM / GLB / glTF を選んでください');if([...files].reduce((n,f)=>n+f.size,0)>128*1024*1024)throw new Error('モデルと関連ファイルは合計128 MBまでです');
   key='user:'+model.name.slice(0,155);const missing=flatLayers(comp).find(x=>x.layer.type==='render3d'&&x.layer.params.src.startsWith(key)&&!stage.assets.has(x.layer.params.src));if(missing){key=missing.layer.params.src;restoreTarget=missing.layer;}let index=2;const base=key;while(stage.assets.has(key))key=base+' ('+(index++)+')';
   await stage.load(key,await model.arrayBuffer(),[...files].filter(f=>f!==model));
  }else await stage.sample();
  transaction(()=>{
   if(restoreTarget){restoreTarget.params.src=key;selected=restoreTarget.id;return;}
   let target=flatLayers(comp).find(x=>x.layer.role==='char'&&['image','render3d'].includes(x.layer.type))?.layer||flatLayers(comp).find(x=>x.layer.role==='char')?.layer;
   if(target){for(const {layer:g,items} of flatLayers(comp))if(g.params.baseLayer===target.id)items.splice(items.indexOf(g),1);}
   else {target=layer('render3d','3D キャラ',{role:'char'});comp.layers.push(target);}
   Object.assign(target,{type:'render3d',name:'3D キャラ',params:modelParams({src:key}),effects:[],children:[],transform:{x:0,y:0,scale:1,rotate:0,flipX:false},mask:{source:'none',invert:false,feather:0}});selected=target.id;
  },{structure:true});status('3Dモデルを読み込みました。「背景から照明を作る」で背景へ寄せられます。');
 }catch(e){status(e.message,true);}finally{busy=false;}
}
function snapshotScopes(){for(const role of [null,'bg','char'])scopeBefore[role||'all']=scopeData(renderer.read(comp,{maxSize:256,role}));}
async function match(){
  if(!ready||busy)return;busy=true;$('auto-match').disabled=true;
  try{
    snapshotScopes();const opts={strength:Number($('match-strength').value),region:$('match-region').value};document.querySelectorAll('[data-match]').forEach(el=>opts[el.dataset.match]=el.checked);
    history.begin(comp);const original=copy(comp);
    try{report=autoMatch(renderer,comp,opts);}catch(e){comp=original;throw e;}
    history.commit(comp);selected=report.groupId;$('report').textContent=reportText(report);$('report-panel').open=true;
    changed({structure:true,preserveReport:true});setPanel('properties');
    status('背景合わせを作りました。各段の表示を切り替えて確かめてください。');
  }catch(e){history.pending=null;status(e.message,true);}finally{busy=false;$('auto-match').disabled=false;}
}
async function loadImage(file,role){
  if(!ready)return;
  if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw new Error('PNG / JPEG / WebP を選んでください');
  if(file.size>64*1024*1024)throw new Error('画像は64 MB以下にしてください');
  const current=flatLayers(comp).find(x=>x.layer.type==='image'&&x.layer.role===role)?.layer,baseKey='user:'+file.name.slice(0,160);
  let key=current?.params.src?.startsWith('user:')&&!renderer.assets.has(current.params.src)?current.params.src:baseKey;
  let suffix=2;while(renderer.assets.has(key))key=baseKey+' ('+(suffix++)+')';
  const asset=await renderer.upload(key,file);
  transaction(()=>{
    let target=flatLayers(comp).find(x=>x.layer.type==='image'&&x.layer.role===role)?.layer;
    if(!target){target=layer('image',{char:'キャラ',bg:'背景',book:'前景'}[role],{role,params:{src:key}});if(role==='bg')comp.layers.unshift(target);else comp.layers.push(target);}
    target.params.src=key;target.visible=true;selected=target.id;
    if(role==='bg'){
      const scale=Math.min(1,4096/Math.max(asset.width,asset.height)),newHeight=Math.round(asset.height*scale),factor=newHeight/comp.height;
      comp.width=Math.round(asset.width*scale);comp.height=newHeight;
      comp.layers.filter(l=>l.role==='char').forEach(l=>{l.transform.scale*=factor;l.transform.x*=factor;l.transform.y*=factor;});
    }else target.transform={x:0,y:0,scale:Math.min(comp.height*.88/asset.height,comp.width*.8/asset.width),rotate:0,flipX:false};
  },{structure:true});
  // Inspect source alpha, not the empty canvas surrounding a fitted image.
  const probe=scene();probe.width=asset.width;probe.height=asset.height;probe.layers=[layer('image','確認',{role:'bg',params:{src:key}})];
  const pixels=renderer.read(probe,{maxSize:128}),hasAlpha=pixels.data.some((a,i)=>i%4===3&&a<250);
  status(role==='char'&&!hasAlpha?'透明部分がありません。背景に貼り付いたままになります。':file.name+' を端末内に読み込みました。');
}
async function loadPreset(slug,kind='lesson'){
  if(!ready)return;
  try{
    const response=await fetch('./presets/'+kind+'-'+slug+'.json');if(!response.ok)throw new Error('プリセットを読み込めません');
    const input=await response.json();
    for(const l of input.layers||[])if(l.params?.src?.startsWith('slot:')){const role=l.params.src.slice(5),current=comp.layers.find(x=>x.role===role);l.params.src=current?.params.src||(role==='char'?'sample:char':'sample:bg:sunset');}
    const next=validateScene(input);await prepare3D(next);transaction(()=>{comp=next;selected=comp.layers.find(l=>l.role==='char')?.id||comp.layers.at(-1)?.id;},{structure:true});
    setTab(false);status('「'+comp.name+'」を開きました。元の作業へは Undo で戻れます。');
  }catch(e){status(e.message,true);}
}
function setTab(book){$('lab').hidden=book;$('textbook').hidden=!book;$('lab-tab').setAttribute('aria-pressed',String(!book));$('book-tab').setAttribute('aria-pressed',String(book));if(!book)schedule();}
function download(blob,name){const url=URL.createObjectURL(blob),a=node('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
async function exportFile(kind){
  if(!ready||busy)return;busy=true;
  try{
    if(kind==='scene')download(new Blob([JSON.stringify(comp,null,2)],{type:'application/json'}),'compolab-scene.json');
    else if(kind==='report')download(new Blob([reportText(report)],{type:'text/plain;charset=utf-8'}),'compolab-report.txt');
    else{status('PNG を書き出しています…');const pixels=renderer.read(comp,{maxSize:4096,role:kind==='char'?'char':null,transparent:kind==='char'});download(await encodePNG(pixels),kind==='char'?'compolab-character.png':'compolab-composite.png');}
    status('書き出しました。');
  }catch(e){status('書き出しに失敗しました: '+e.message,true);}finally{busy=false;schedule();}
}
function wire(){
  $('sample-model').onclick=()=>loadModel();$('file-model').onchange=async e=>{try{if(e.target.files.length)await loadModel(e.target.files);}finally{e.target.value='';}};
  $('auto-match').onclick=match;$('match-strength').oninput=()=>$('match-strength-value').value=Number($('match-strength').value).toFixed(2);
  $('lab-tab').onclick=()=>setTab(false);$('book-tab').onclick=()=>setTab(true);
  document.querySelectorAll('[data-panel]').forEach(b=>b.onclick=()=>setPanel(b.dataset.panel));
  document.querySelectorAll('[data-export]').forEach(b=>b.onclick=()=>exportFile(b.dataset.export));
  document.querySelectorAll('[data-preset]').forEach(b=>b.onclick=()=>loadPreset(b.dataset.preset));
  document.querySelectorAll('[data-recipe]').forEach(b=>b.onclick=()=>loadPreset(b.dataset.recipe,'recipe'));
  for(const role of ['char','bg','book'])$('file-'+role).onchange=async e=>{const file=e.target.files[0];try{if(file)await loadImage(file,role);}catch(err){status(err.message,true);}finally{e.target.value='';}};
  $('file-scene').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>5000000)throw new Error('シーン JSON は5 MBまでです');const next=validateScene(JSON.parse(await file.text()));await prepare3D(next);transaction(()=>{comp=next;selected=comp.layers.at(-1)?.id;},{structure:true});status('シーンを読み込みました。ユーザー画像・モデルは元のファイルを読み込み直してください。');}catch(err){status(err.message,true);}finally{e.target.value='';}};
  $('sample').onchange=()=>transaction(()=>{comp=scene($('sample').value);selected='character';},{structure:true});
  $('blank').onclick=()=>transaction(()=>{comp=scene();comp.name='無題';comp.layers=[];selected=null;},{structure:true});
  $('undo').onclick=()=>{comp=history.undo(comp);changed({structure:true});};$('redo').onclick=()=>{comp=history.redo(comp);changed({structure:true});};
  $('add-layer').onclick=()=>transaction(()=>{
    const type=$('layer-type').value,p=type==='solid'?{color:[.4,.5,.7]}:type==='gradient'?{kind:'linear',color:[0,0,0],angle:90,start:0,end:1,feather:.5,alphaStart:1,alphaEnd:0}:type==='adjust'?{kind:'colorgrade',...effect('colorgrade').params}:{};
    const l=layer(type,{solid:'環境色',gradient:'黒パラ',adjust:'色調整',group:'グループ'}[type],{params:p,blend:type==='gradient'?'multiply':'normal'});
    const active=findLayer(comp,selected);
    if(active?.type==='group')active.children.push(l);else comp.layers.push(l);selected=l.id;
  },{structure:true});
  $('delete').onclick=()=>transaction(()=>removeLayer(comp,selected),{structure:true});
  $('solo').onclick=()=>{comp.view.solo=comp.view.solo===selected?null:selected;$('solo').setAttribute('aria-pressed',String(!!comp.view.solo));schedule();};
  $('duplicate').onclick=()=>transaction(()=>{const l=duplicateLayer(comp,selected);if(l)selected=l.id;},{structure:true});
  $('group').onclick=()=>transaction(()=>{const g=groupLayer(comp,selected);if(g)selected=g.id;},{structure:true});
  for(const [id,delta] of [['layer-up',1],['layer-down',-1]])$(id).onclick=()=>transaction(()=>{const item=flatLayers(comp).find(x=>x.layer.id===selected);if(!item)return;const i=item.items.indexOf(item.layer),j=i+delta;if(j<0||j>=item.items.length)return;const other=item.items[j];if(delta===1)moveLayer(comp,selected,other.id);else moveLayer(comp,other.id,selected);},{structure:true});
  $('post-select').onclick=()=>{selected='post';renderLayers();renderProperties();setPanel('properties');};
  $('space').onchange=()=>transaction(()=>{comp.space=$('space').value;prefs.space=comp.space;});
  $('resolution').onchange=()=>{prefs.resolution=Number($('resolution').value);save();schedule();};
  $('checker').onchange=()=>{prefs.checker=$('checker').checked;save();schedule();};
  $('output-exposure').onchange=()=>transaction(()=>comp.output.exposure=clamp($('output-exposure').valueAsNumber||0,-5,5));
  $('output-tonemap').onchange=()=>transaction(()=>comp.output.tonemap=$('output-tonemap').value);
  $('ab-toggle').onclick=()=>{const enabled=$('ab-toggle').getAttribute('aria-pressed')!=='true';$('ab-toggle').setAttribute('aria-pressed',String(enabled));$('ab-labels').hidden=!enabled;$('ab-control').hidden=!enabled;schedule();};
  $('ab-split').oninput=schedule;
  $('hold-before').onpointerdown=e=>{e.currentTarget.setPointerCapture(e.pointerId);showBefore=true;schedule();};
  for(const name of ['pointerup','pointercancel','lostpointercapture'])$('hold-before').addEventListener(name,()=>{showBefore=false;schedule();});
  $('hold-before').onkeydown=e=>{if(e.key===' '||e.key==='Enter'){e.preventDefault();showBefore=true;schedule();}};$('hold-before').onkeyup=()=>{showBefore=false;schedule();};
  $('fit').onclick=()=>{comp.view.zoom=1;comp.view.pan=[0,0];applyView();};$('zoom').oninput=()=>{comp.view.zoom=Number($('zoom').value);applyView();};
  $('scope-target').onchange=schedule;$('scope-overlay').onchange=schedule;$('scope-snapshot').onclick=()=>{snapshotScopes();schedule();};
  document.querySelectorAll('[data-scope]').forEach(b=>b.onclick=()=>{scopeKind=b.dataset.scope;document.querySelectorAll('[data-scope]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));$('scope-caption').textContent={histogram:'横は sRGB の明るさ、山の高さは画素の数。黄は記録した「前」です。',waveform:'横は画面の位置、縦は明るさ。キャラだけが明るすぎないか確かめます。',vector:'中心ほど低彩度。背景とキャラの色の偏りを比べます。黄の線は肌色の方向です。'}[scopeKind];schedule();});
  let space=false,drag=null;
  const editable=e=>e.target.closest('input,select,textarea,[contenteditable=true]');
  document.addEventListener('keydown',e=>{
    if(editable(e))return;
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();$(e.shiftKey?'redo':'undo').click();return;}
    if(e.key==='0'){$('fit').click();e.preventDefault();}
    if(e.code==='Space'&&document.activeElement===$('viewport')){space=true;if(renderer?.stage3d)renderer.stage3d.controls.enabled=false;e.preventDefault();}
  });
  document.addEventListener('keyup',e=>{if(e.code==='Space'){space=false;if(renderer?.stage3d)renderer.stage3d.controls.enabled=!!renderer.stage3d.active;}});window.addEventListener('blur',()=>{space=false;drag=null;showBefore=false;if(renderer?.stage3d)renderer.stage3d.controls.enabled=!!renderer.stage3d.active;});
  $('viewport').onwheel=e=>{e.preventDefault();if(renderer?.stage3d?.active)return;comp.view.zoom=clamp(comp.view.zoom*Math.exp(-e.deltaY*.001),.25,4);applyView();};
  $('viewport').onpointerdown=e=>{if(space||e.button===1){e.preventDefault();drag={x:e.clientX,y:e.clientY,pan:[...comp.view.pan]};e.currentTarget.setPointerCapture(e.pointerId);}else $('viewport').focus();};
  $('viewport').onpointermove=e=>{if(drag){comp.view.pan=[drag.pan[0]+e.clientX-drag.x,drag.pan[1]+e.clientY-drag.y];applyView();}};
  $('viewport').onpointerup=$('viewport').onpointercancel=()=>drag=null;
  $('viewport').ondragover=e=>{if([...e.dataTransfer.types].includes('Files')){e.preventDefault();$('drop-hint').hidden=false;}};
  $('viewport').ondragleave=()=>$('drop-hint').hidden=true;
  $('viewport').ondrop=async e=>{e.preventDefault();$('drop-hint').hidden=true;const f=e.dataTransfer.files[0];if(f)try{await loadImage(f,$('drop-role').value);}catch(err){status(err.message,true);}};
  document.addEventListener('click',e=>document.querySelectorAll('.menu[open]').forEach(d=>{if(!d.contains(e.target))d.open=false;}));
  window.addEventListener('resize',schedule);
}
async function boot(){
  wire();initLessons({tryPreset:loadPreset,openBook:()=>setTab(true),notify:status});
  setPanel(prefs.panel);syncToolbar();
  try{
    renderer=new Compositor($('view'));
    $('view').addEventListener('webglcontextlost',e=>{e.preventDefault();ready=false;status('描画コンテキストが失われました。作業を保存しています。ページを再読み込みしてください。',true);save();});
    await loadSamples(renderer);let modelError='';try{await prepare3D(comp);}catch(e){modelError=e.message;}ready=true;$('auto-match').disabled=false;$('gpu-info').textContent=renderer.hdr?'RGBA16F · HDR 合成':'RGBA8 · HDR 不可（この端末の制限）';
    renderLayers();renderProperties();schedule();document.body.dataset.ready='true';
    const missing=flatLayers(comp).filter(x=>x.layer.params.src?.startsWith('user:')).map(x=>x.layer.params.src.slice(5));
    if(modelError)status(modelError,true);
    else if(missing.length)status('画像・モデルの再読み込みが必要です: '+missing.join('、'));
    else status('サンプルで始められます。「背景に合わせる」で色・明暗・縁の違いを見比べましょう。');
  }catch(e){status(e.message,true);}
}
boot();
