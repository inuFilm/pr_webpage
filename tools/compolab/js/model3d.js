// Serializable model settings; deliberately independent of three.js and WebGL.
const clamp=(x,d,min,max)=>Number.isFinite(x)?Math.max(min,Math.min(max,x)):d;
const vec=(v,d,min=-100,max=100)=>Array.isArray(v)&&v.length===3?v.map((x,i)=>clamp(x,d[i],min,max)):[...d];
export function modelParams(p={}) {
 const camera=p.camera||{},lights=p.lights||{};
 const lamp=(key,color,intensity,dir)=>{const l=lights[key]||{};return {color:vec(l.color,color,0,16),intensity:clamp(l.intensity,intensity,0,10),dir:vec(l.dir,dir,-10,10)};};
 return {src:p.src||'sample:sotai_girl',camera:{fov:clamp(camera.fov,30,10,100),zoom:clamp(camera.zoom,1,.1,20),pos:vec(camera.pos,[0,.85,3.6]),target:vec(camera.target,[0,.85,0]),ortho:camera.ortho===true},
  lights:{key:lamp('key',[1,.92,.8],1.4,[-1,1,1]),fill:lamp('fill',[.65,.8,1],.4,[1,.5,1]),rim:lamp('rim',[1,1,1],.5,[1,1,-1]),hemi:{sky:vec(lights.hemi?.sky,[.5,.65,.8],0,16),ground:vec(lights.hemi?.ground,[.2,.16,.12],0,16),intensity:clamp(lights.hemi?.intensity,.6,0,10)}},
  passes:{color:true,depth:p.passes?.depth===true,normal:p.passes?.normal===true,id:p.passes?.id===true},outline:p.outline!==false,preview:['color','depth','normal','id'].includes(p.preview)?p.preview:'color'};
}
export function lightsFromStats(s) {
 const x=(s.brightPos[0]-.5)*2,angle=(20+(1-s.brightPos[1])*40)*Math.PI/180;
 return {key:{color:[...s.brightColor],intensity:1.6,dir:[x,Math.sin(angle),Math.cos(angle)]},fill:{color:s.color.map(v=>v*.3),intensity:1,dir:[-x,.35,1]},rim:{color:[1,1,1],intensity:.5,dir:[-x,Math.sin(angle),-Math.cos(angle)]},hemi:{sky:[...s.top],ground:[...s.bottom],intensity:Math.max(.15,Math.min(1.5,s.mean[0]))}};
}
