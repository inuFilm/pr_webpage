import {BLENDS,clamp} from './color.js';
import {effect} from './effects.js';
import {modelParams} from './model3d.js';
export const copy=x=>JSON.parse(JSON.stringify(x));
let sequence=0;
export const uid=()=> 'L'+Date.now().toString(36)+(sequence++).toString(36);
export function layer(type='image',name='レイヤー',extras={}) {
  return {id:uid(),name,type,role:null,visible:true,opacity:1,blend:'normal',clipTo:null,mask:{source:'none',invert:false,feather:0},
    transform:{x:0,y:0,scale:1,rotate:0,flipX:false},effects:[],params:{},children:[],...extras};
}
export function scene(background='sunset') {
  return {version:1,name:'色をなじませる',width:1920,height:1080,space:'linear',output:{exposure:0,tonemap:'none'},layers:[
    layer('image','背景',{id:'background',role:'bg',params:{src:'sample:bg:'+background}}),
    layer('image','キャラ',{id:'character',role:'char',params:{src:'sample:char'},transform:{x:0,y:32,scale:.61,rotate:0,flipX:false}})
  ],postEffects:[],view:{ab:'off',zoom:1,pan:[0,0],solo:null}};
}
export function flatLayers(comp) {
  const out=[];const walk=(items,depth)=>items.forEach(l=>{out.push({layer:l,depth,items});walk(l.children||[],depth+1);});walk(comp.layers,0);return out;
}
export const findLayer=(comp,id)=>flatLayers(comp).find(x=>x.layer.id===id)?.layer;
function linkedUnit(item) {
  const items=item.items;
  let start=items.indexOf(item.layer);
  if(item.layer.params.baseLayer){const base=items.findIndex(l=>l.id===item.layer.params.baseLayer);if(base>=0)start=base;}
  let end=start+1;
  while(end<items.length&&items[end].params.baseLayer===items[start].id)end++;
  return {start,end,layers:items.slice(start,end)};
}
export function removeLayer(comp,id) {
  const item=flatLayers(comp).find(x=>x.layer.id===id);if(!item)return;
  const removed=new Set();const collect=l=>{removed.add(l.id);l.children.forEach(collect);};collect(item.layer);
  item.items.splice(item.items.indexOf(item.layer),1);
  // Removing the source also removes dependent match groups, not their backdrop.
  for(const {layer:l,items} of flatLayers(comp))if(removed.has(l.params.baseLayer)){collect(l);items.splice(items.indexOf(l),1);}
  flatLayers(comp).forEach(({layer:l})=>{if(removed.has(l.clipTo))l.clipTo=null;if(removed.has(l.params.baseLayer))delete l.params.baseLayer;if(removed.has(l.mask.source.split(':')[1]))l.mask.source='none';});
}
export function moveLayer(comp,id,targetId,inside=false) {
  const all=flatLayers(comp),a=all.find(x=>x.layer.id===id),b=all.find(x=>x.layer.id===targetId);
  if(!a||!b||a===b)return false;
  const unit=linkedUnit(a);
  const descendants=[];const walk=l=>{descendants.push(l.id);l.children.forEach(walk);};unit.layers.forEach(walk);
  if(descendants.includes(targetId))return false;
  if(unit.layers.some(l=>l.id===targetId))return false;
  a.items.splice(unit.start,unit.layers.length);
  const items=inside&&b.layer.type==='group'?b.layer.children:b.items;
  const destination=inside?items.length:linkedUnit(b).end;
  items.splice(destination,0,...unit.layers);
  repairReferences(comp);return true;
}
export function repairReferences(comp) {
  const seen=new Set();
  for(const {layer:l} of flatLayers(comp)){
    if(l.clipTo&&!seen.has(l.clipTo))l.clipTo=null;
    if(l.params.baseLayer&&l.params.baseLayer!==l.clipTo)delete l.params.baseLayer;
    const id=l.mask.source.split(':')[1];if(id&&!l.mask.source.startsWith('id:')&&!seen.has(id))l.mask.source='none';
    seen.add(l.id);
  }
}
export function duplicateLayer(comp,id) {
  const item=flatLayers(comp).find(x=>x.layer.id===id);if(!item)return;
  const unit=linkedUnit(item),copies=copy(unit.layers),ids=new Map();
  const walk=l=>{const old=l.id;l.id=uid();ids.set(old,l.id);l.children.forEach(walk);};copies.forEach(walk);
  const refs=l=>{l.clipTo=ids.get(l.clipTo)||l.clipTo;if(l.params.baseLayer)l.params.baseLayer=ids.get(l.params.baseLayer)||l.params.baseLayer;
    const [kind,ref]=l.mask.source.split(':');if(ids.has(ref))l.mask.source=kind+':'+ids.get(ref);l.children.forEach(refs);};
  copies.forEach(refs);copies[0].name+=' のコピー';item.items.splice(unit.end,0,...copies);return copies[0];
}
export function groupLayer(comp,id) {
  const item=flatLayers(comp).find(x=>x.layer.id===id);if(!item)return;
  const unit=linkedUnit(item),group=layer('group','グループ',{role:unit.layers[0].role,children:unit.layers});
  item.items.splice(unit.start,unit.layers.length,group);return group;
}
const number=(v,d,lo,hi)=>typeof v==='number'&&Number.isFinite(v)?clamp(v,lo,hi):d;
const vec=(v,d,lo=-4096,hi=4096)=>Array.isArray(v)&&v.length===d.length?v.map((x,i)=>number(x,d[i],lo,hi)):d;
export function validateScene(input) {
  if(!input||input.version!==1||!Array.isArray(input.layers))throw new Error('対応していないシーン JSON です');
  let count=0;const ids=new Set();
  const effects=arr=>(Array.isArray(arr)?arr:[]).slice(0,32).map(e=>({...effect(e.type,e.params),enabled:e.enabled!==false,...(e.owner==='automatch'?{owner:'automatch'}:{})}));
  const layers=(arr,depth=0)=>arr.map(raw=>{
    if(depth>8||++count>64)throw new Error('レイヤーは64枚、グループは8段までです');
    if(!['image','solid','gradient','adjust','group','render3d'].includes(raw.type))throw new Error('対応していないレイヤーです');
    const id=String(raw.id||uid()).slice(0,100);if(ids.has(id))throw new Error('レイヤーIDが重複しています');ids.add(id);
    const t=raw.transform||{},p=raw.params||{},m=raw.mask||{};
    let params={};
    if(raw.type==='image'){
      if(typeof p.src!=='string'||! /^(sample:(char|bg:(day|sunset|night|rain))|user:.{1,180}|slot:(char|bg))$/.test(p.src))throw new Error('画像は同梱サンプルまたは端末内ファイルだけを指定できます');
      params={src:p.src};
    }
    if(raw.type==='solid')params={color:vec(p.color,[.5,.5,.5],0,16)};
    if(raw.type==='render3d'){
      if(typeof p.src!=='string'||!/^(sample:sotai_girl|user:.{1,180})$/.test(p.src))throw new Error('3Dモデルは同梱素体または端末内ファイルだけを指定できます');
      params=modelParams(p);
    }
    if(raw.type==='gradient')params={kind:p.kind==='radial'?'radial':'linear',color:vec(p.color,[0,0,0],0,16),angle:number(p.angle,90,-180,180),start:number(p.start,0,0,1),end:number(p.end,.6,0,1),feather:number(p.feather,.5,0,1),alphaStart:number(p.alphaStart,1,0,1),alphaEnd:number(p.alphaEnd,0,0,1)};
    if(raw.type==='adjust'){const e=effect(p.kind||'colorgrade',p);params={...e.params,kind:e.type};}
    if(raw.type==='group'){if(typeof p.baseLayer==='string')params.baseLayer=p.baseLayer;if(p.owner==='automatch')params.owner=p.owner;}
    return layer(raw.type,String(raw.name||'レイヤー').slice(0,100),{id,role:['char','bg','book'].includes(raw.role)?raw.role:null,visible:raw.visible!==false,
      opacity:number(raw.opacity,1,0,1),blend:Object.hasOwn(BLENDS,raw.blend)?raw.blend:'normal',clipTo:typeof raw.clipTo==='string'?raw.clipTo:null,
      mask:{source:typeof m.source==='string'&&/^(none|gradient|rect|alpha:[\w-]+|luma:[\w-]+|id:\d{1,3})$/.test(m.source)?m.source:'none',invert:m.invert===true,feather:number(m.feather,0,0,.2),rect:vec(m.rect,[.2,.2,.8,.8],0,1),angle:number(m.angle,90,-180,180)},
      transform:{x:number(t.x,0,-8192,8192),y:number(t.y,0,-8192,8192),scale:number(t.scale,1,.01,20),rotate:number(t.rotate,0,-180,180),flipX:t.flipX===true},
      effects:effects(raw.effects),params,children:raw.type==='group'?layers(Array.isArray(raw.children)?raw.children:[],depth+1):[]});
  });
  const comp={version:1,name:String(input.name||'無題').slice(0,100),width:Math.round(number(input.width,1920,1,4096)),height:Math.round(number(input.height,1080,1,4096)),
    space:input.space==='gamma'?'gamma':'linear',output:{exposure:number(input.output?.exposure,0,-5,5),tonemap:['none','reinhard','aces'].includes(input.output?.tonemap)?input.output.tonemap:'none'},
    layers:layers(input.layers),postEffects:effects(input.postEffects),view:{ab:'off',zoom:1,pan:[0,0],solo:null}};
  repairReferences(comp);return comp;
}
export class History {
  constructor(){this.past=[];this.future=[];this.pending=null;}
  begin(comp){if(this.pending===null)this.pending=JSON.stringify(comp);}
  commit(comp){const value=JSON.stringify(comp);if(this.pending!==null&&this.pending!==value){this.past.push(this.pending);if(this.past.length>100)this.past.shift();this.future=[];}this.pending=null;}
  undo(comp){this.commit(comp);if(!this.past.length)return comp;this.future.push(JSON.stringify(comp));return JSON.parse(this.past.pop());}
  redo(comp){if(!this.future.length)return comp;this.past.push(JSON.stringify(comp));return JSON.parse(this.future.pop());}
}
export function settings(value={}) {
  return {resolution:[1024,2048,4096].includes(value.resolution)?value.resolution:1024,space:value.space==='gamma'?'gamma':'linear',panel:['layers','properties','scopes'].includes(value.panel)?value.panel:'layers',checker:value.checker!==false};
}
