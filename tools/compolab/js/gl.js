import {VERT,PRELUDE,SHADERS} from './shaders.js';
import {BLENDS} from './color.js';
import {effect,EFFECTS} from './effects.js';
import {flatLayers} from './comp.js';
import {curveTable} from './lut.js';
const modes=Object.keys(BLENDS), radians=d=>d*Math.PI/180;
export class Compositor {
  constructor(canvas) {
    this.canvas=canvas;
    const gl=this.gl=canvas.getContext('webgl2',{alpha:true,premultipliedAlpha:false,antialias:false,preserveDrawingBuffer:true});
    if(!gl)throw new Error('WebGL2 を利用できません。対応ブラウザで開いてください。');
    this.hdr=!!gl.getExtension('EXT_color_buffer_float');
    this.programs=new Map();this.pool=[];this.assets=new Map();this.tables=new Map();this.vao=gl.createVertexArray();
    this.white=this.target(1,1);this.run('solid',{color:[1,1,1],alpha:1,space:0},{},this.white);
    this.white.persistent=true;
  }
  program(name) {
    if(this.programs.has(name))return this.programs.get(name);
    const gl=this.gl,compile=(type,src)=>{
      const sh=gl.createShader(type);gl.shaderSource(sh,src);gl.compileShader(sh);
      if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS)){const msg=gl.getShaderInfoLog(sh);gl.deleteShader(sh);throw new Error(name+': '+msg);}
      return sh;
    };
    const vs=compile(gl.VERTEX_SHADER,VERT),fs=compile(gl.FRAGMENT_SHADER,PRELUDE+SHADERS[name]),p=gl.createProgram();
    gl.attachShader(p,vs);gl.attachShader(p,fs);gl.linkProgram(p);gl.deleteShader(vs);gl.deleteShader(fs);
    if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p));
    const uniforms={};
    for(let i=0;i<gl.getProgramParameter(p,gl.ACTIVE_UNIFORMS);i++){const u=gl.getActiveUniform(p,i);uniforms[u.name.slice(2)]={location:gl.getUniformLocation(p,u.name),type:u.type};}
    const result={p,uniforms};this.programs.set(name,result);return result;
  }
  target(w,h,byte=false) {
    const gl=this.gl;w=Math.max(1,Math.round(w));h=Math.max(1,Math.round(h));
    const free=this.pool.find(t=>!t.used&&t.width===w&&t.height===h&&t.byte===byte);
    if(free){free.used=true;return free;}
    const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D,0,byte||!this.hdr?gl.RGBA8:gl.RGBA16F,w,h,0,gl.RGBA,byte||!this.hdr?gl.UNSIGNED_BYTE:gl.HALF_FLOAT,null);
    const fbo=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,0);
    if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw new Error('描画バッファを作成できません。作業解像度を下げてください。');
    const t={texture,fbo,width:w,height:h,byte,used:true};this.pool.push(t);return t;
  }
  release(...targets){for(const t of targets)if(t&&!t.persistent)t.used=false;}
  trim() {
    const gl=this.gl;const unused=this.pool.filter(t=>!t.used);
    // Keep only a small reusable working set. Resolution changes cannot accumulate VRAM.
    for(const t of unused.slice(12)){gl.deleteTexture(t.texture);gl.deleteFramebuffer(t.fbo);this.pool.splice(this.pool.indexOf(t),1);}
  }
  run(name,values={},inputs={},target=null) {
    const gl=this.gl,{p,uniforms}=this.program(name);
    gl.bindFramebuffer(gl.FRAMEBUFFER,target?.fbo||null);gl.viewport(0,0,target?.width||this.canvas.width,target?.height||this.canvas.height);
    gl.disable(gl.BLEND);gl.disable(gl.DEPTH_TEST);gl.disable(gl.SCISSOR_TEST);gl.disable(gl.CULL_FACE);gl.colorMask(true,true,true,true);
    gl.bindVertexArray(this.vao);gl.useProgram(p);
    const vals={res:[target?.width||this.canvas.width,target?.height||this.canvas.height],...values};
    let unit=0;for(const [key,t] of Object.entries(inputs)){if(!uniforms[key])continue;gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(t.target||gl.TEXTURE_2D,t.texture);gl.uniform1i(uniforms[key].location,unit++);}
    for(const [key,value] of Object.entries(vals)){
      const u=uniforms[key];if(!u)continue;
      switch(u.type){
        case gl.INT:case gl.BOOL:gl.uniform1i(u.location,Number(value));break;
        case gl.FLOAT:gl.uniform1f(u.location,value);break;
        case gl.FLOAT_VEC2:gl.uniform2fv(u.location,value);break;
        case gl.FLOAT_VEC3:gl.uniform3fv(u.location,value);break;
        case gl.FLOAT_VEC4:gl.uniform4fv(u.location,value);break;
      }
    }
    gl.drawArrays(gl.TRIANGLES,0,3);return target;
  }
  async upload(key,blob) {
    const bitmap=await createImageBitmap(blob,{premultiplyAlpha:'none',colorSpaceConversion:'none',imageOrientation:'none'});
    const gl=this.gl;const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL,gl.NONE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.SRGB8_ALPHA8,gl.RGBA,gl.UNSIGNED_BYTE,bitmap);
    const old=this.assets.get(key);if(old)gl.deleteTexture(old.texture);
    const asset={texture,width:bitmap.width,height:bitmap.height};bitmap.close();this.assets.set(key,asset);return asset;
  }
  empty(w,h){return this.run('solid',{color:[0,0,0],alpha:0,space:0},{},this.target(w,h));}
  copy(src){return this.run('copy',{}, {img:src},this.target(src.width,src.height));}
  blur(src,radius) {
    if(radius<=0)return this.copy(src);
    let small=src,owned=false,scale=1,sigma=Math.max(.35,radius*Math.min(src.width,src.height)/2);
    while(sigma/scale>3&&Math.min(small.width,small.height)>8){
      const next=this.run('copy',{}, {img:small},this.target(small.width/2,small.height/2));
      if(owned)this.release(small);small=next;owned=true;scale*=2;
    }
    const x=this.run('blur',{step:[1/small.width,0],sigma:sigma/scale},{img:small},this.target(small.width,small.height));
    const y=this.run('blur',{step:[0,1/small.height],sigma:sigma/scale},{img:x},this.target(small.width,small.height));this.release(x);if(owned)this.release(small);
    const result=this.run('copy',{}, {img:y},this.target(src.width,src.height));this.release(y);return result;
  }
  tableTexture(kind,data) {
    const key=kind+JSON.stringify(data);if(this.tables.has(key))return this.tables.get(key);
    const gl=this.gl,texture=gl.createTexture(),target=kind==='lut'?gl.TEXTURE_3D:gl.TEXTURE_2D;
    gl.bindTexture(target,texture);for(const p of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(target,p,gl.LINEAR);
    for(const p of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T,...(kind==='lut'?[gl.TEXTURE_WRAP_R]:[])])gl.texParameteri(target,p,gl.CLAMP_TO_EDGE);
    if(kind==='lut')gl.texImage3D(target,0,gl.RGB16F,data.size,data.size,data.size,0,gl.RGB,gl.FLOAT,new Float32Array(data.data));
    else gl.texImage2D(target,0,gl.R16F,256,1,0,gl.RED,gl.FLOAT,curveTable(data));
    const result={texture,target};this.tables.set(key,result);
    if(this.tables.size>8){const old=this.tables.keys().next().value;gl.deleteTexture(this.tables.get(old).texture);this.tables.delete(old);}return result;
  }
  horizontalBlur(src,length) {
    let small=src,scale=1;const sigma=Math.max(.35,length*src.width/6);
    while(sigma/scale>3&&small.width>8){const next=this.run('copy',{}, {img:small},this.target(small.width/2,src.height));if(small!==src)this.release(small);small=next;scale*=2;}
    const b=this.run('blur',{step:[1/small.width,0],sigma:sigma/scale},{img:small},this.target(small.width,small.height));
    if(small!==src)this.release(small);const out=this.run('copy',{}, {img:b},this.target(src.width,src.height));this.release(b);return out;
  }
  brightest(src) {
    const out=this.run('copy',{}, {img:src},this.target(64,36,true)),gl=this.gl,data=new Uint8Array(64*36*4);gl.readPixels(0,0,64,36,gl.RGBA,gl.UNSIGNED_BYTE,data);this.release(out);
    let best=-1,x=.5,y=.5;for(let j=0;j<36;j++)for(let i=0;i<64;i++){const k=(j*64+i)*4,v=.2126*data[k]+.7152*data[k+1]+.0722*data[k+2];if(v>best){best=v;x=(i+.5)/64;y=1-(j+.5)/36;}}return {x,y};
  }
  effects(src,effects,bg,comp,map=new Map(),passes={}) {
    let current=src;
    for(const e of effects) {
      if(!e.enabled)continue;
      for(const pass of EFFECTS[e.type].passes(e.params)) {
        const p=pass.params,type=pass.type,w=current.width,h=current.height;
        let next;
        if(type==='dof'&&passes.depth){const b=this.blur(current,p.radius);next=this.run('depthDof',p,{img:current,other:b,depth:passes.depth},this.target(w,h));this.release(b);}
        else if(type==='fog'&&p.depth&&passes.depth)next=this.run('depthFog',{...p,space:comp.space==='gamma'?1:0},{img:current,depth:passes.depth},this.target(w,h));
        else if(type==='rimlight'){if(!passes.normal)continue;next=this.run('rimlight',p,{img:current,normal:passes.normal},this.target(w,h));}
        else if(type==='blur'||type==='dof')next=this.blur(current,p.radius*(type==='dof'?1-p.focus:1));
        else if(type==='curve')next=this.run('curve',{space:comp.space==='gamma'?1:0},{img:current,curve:this.tableTexture('curve',p.points)},this.target(w,h));
        else if(type==='lut'){
          if(!p.table)continue;
          next=this.run('lut',{space:comp.space==='gamma'?1:0,display:p.space==='display'?1:0,size:p.table.size,min:p.table.min,max:p.table.max,strength:p.strength},{img:current,lut:this.tableTexture('lut',p.table)},this.target(w,h));
        }else if(type==='tlight'){
          const char=flatLayers(comp).find(x=>x.layer.role==='char')?.layer;
          const shape=map.get(p.source.split(':')[1])||map.get(char?.id)||current;
          const seed=this.run('tlightSeed',{kind:p.source==='alpha-inverse'?0:p.source==='luma'?1:2},{img:current,shape},this.target(w,h));
          const b=this.blur(seed,p.radius);next=this.run('tlight',p,{img:current,other:b,shape},this.target(w,h));this.release(seed,b);
        }else if(['anamorphic','halation','godrays','sharpen'].includes(type)){
          const bright=type==='sharpen'?current:this.run('bright',{threshold:p.threshold,knee:0},{img:current},this.target(w,h));
          const b=type==='anamorphic'?this.horizontalBlur(bright,p.length):type==='godrays'?bright:this.blur(bright,p.radius);
          if(type==='sharpen'||type==='godrays')next=this.run(type,{...p,...(p.auto?this.brightest(current):{})},{img:current,other:b},this.target(w,h));
          else next=this.run('combine',{kind:0,intensity:p.intensity,color:type==='halation'?[1,.35,.15]:p.color},{img:current,other:b,bg},this.target(w,h));
          if(bright!==current)this.release(bright);if(b!==bright)this.release(b);
        }
        else if(['glow','diffusion','lightwrap','edgesoft'].includes(type)) {
          let b,background=bg,bright;
          if(type==='glow'){
            bright=this.run('bright',{threshold:p.threshold,knee:p.knee},{img:current},this.target(w,h));
            // Multi-scale Gaussian chain: combine tight and broad radii.
            b=this.blur(bright,p.radius);const wide=this.blur(bright,p.radius*2);
            const combined=this.run('combine',{kind:0,intensity:.3,color:[1,1,1]},{img:b,other:wide,bg:wide},this.target(w,h));
            this.release(bright,b,wide);b=combined;
          } else b=this.blur(current,p.radius);
          if(type==='lightwrap')background=this.blur(bg,p.radius);
          next=this.run('combine',{kind:['glow','diffusion','lightwrap','edgesoft'].indexOf(type),intensity:p.intensity??1,color:p.color||[1,1,1],screen:p.screen||false},{img:current,other:b,bg:background},this.target(w,h));
          this.release(b);if(type==='lightwrap')this.release(background);
        } else {
          const values={...p,space:comp.space==='gamma'?1:0,comp:[comp.width,comp.height]};
          if(type==='colorgrade')values.hue=radians(p.hue);
          if(type==='flare'&&p.auto)Object.assign(values,this.brightest(current));
          next=this.run(type==='colorgrade'?'grade':type,values,{img:current},this.target(w,h));
        }
        if(current!==src)this.release(current);current=next;
      }
    }
    return current;
  }
  mask(l,map,w,h) {
    const m=l.mask||{source:'none'},parts=m.source.split(':'),ref=map.get(parts[1])||this.white;
    const kind={none:0,alpha:1,luma:2,gradient:3,rect:4}[parts[0]]||0;
    const idPass=this.layerPasses?.get(l.clipTo)?.id||[...(this.layerPasses?.values()||[])].at(-1)?.id;
    let target=parts[0]==='id'&&idPass?this.run('idMask',{id:Number(parts[1]),invert:!!m.invert},{img:idPass},this.target(w,h)):this.run('mask',{kind:parts[0]==='id'?1:kind,invert:!!m.invert,rect:m.rect||[.2,.2,.8,.8],angle:radians(m.angle??90)},{img:parts[0]==='id'?this.empty(1,1):ref},this.target(w,h));
    if(m.feather>0){const b=this.blur(target,m.feather);this.release(target);target=b;}
    if(l.clipTo&&map.has(l.clipTo)){
      const masked=this.run('multiplyMask',{opacity:1}, {img:target,mask:map.get(l.clipTo)},this.target(w,h));this.release(target);target=masked;
    }
    return target;
  }
  transformed(src,t,comp){
    if(!t||(!t.x&&!t.y&&t.scale===1&&!t.rotate&&!t.flipX))return src;
    const next=this.run('transform',{comp:[comp.width,comp.height],translate:[t.x,t.y],scale:t.scale,rotate:radians(t.rotate),flip:t.flipX},{img:src},this.target(src.width,src.height));
    this.release(src);return next;
  }
  source(l,comp,w,h,map,bg) {
    if(l.type==='render3d'){
      const needs={depth:l.effects.some(e=>e.enabled&&['fog','dof'].includes(e.type)),normal:l.effects.some(e=>e.enabled&&e.type==='rimlight'),id:flatLayers(comp).some(x=>x.layer.mask.source.startsWith('id:'))};
      const passes=this.stage3d?.render(l,w,h,needs);if(!passes)return this.empty(w,h);
      const converted={};for(const [key,t] of Object.entries(passes)){const raw=this.run(key==='color'?'render3d':'copy',{space:comp.space==='gamma'?1:0},{img:t},this.target(w,h));converted[key]=this.transformed(raw,l.transform,comp);}this.layerPasses.set(l.id,converted);
      const preview=l.params.preview;return preview!=='color'&&converted[preview]?this.run('passPreview',{kind:['depth','normal','id'].indexOf(preview),far:10},{img:converted[preview]},this.target(w,h)):converted.color;
    }
    if(l.type==='group')return this.transformed(this.stack(l.children,comp,w,h,map,bg),l.transform,comp);
    if(l.type==='solid')return this.transformed(this.run('solid',{color:l.params.color||[.5,.5,.5],alpha:1,space:comp.space==='gamma'?1:0},{},this.target(w,h)),l.transform,comp);
    if(l.type==='gradient')return this.transformed(this.run('gradient',{...l.params,kind:l.params.kind==='radial'?1:0,angle:radians(l.params.angle??90),space:comp.space==='gamma'?1:0},{},this.target(w,h)),l.transform,comp);
    const asset=this.assets.get(l.params.src);if(!asset)return this.empty(w,h);
    const t=l.transform,fit=l.role==='bg'?Math.max(comp.width/asset.width,comp.height/asset.height):1;
    return this.run('input',{size:[asset.width,asset.height],comp:[comp.width,comp.height],translate:[t.x,t.y],scale:t.scale*fit,rotate:radians(t.rotate),flip:t.flipX,space:comp.space==='gamma'?1:0},{img:asset},this.target(w,h));
  }
  stack(items,comp,w,h,map=new Map(),backdrop=null,seed=null) {
    let base=seed?this.copy(seed):this.empty(w,h);
    for(let index=0;index<items.length;index++){
      const l=items[index];if(!l.visible||l.params.baseLayer)continue;
      let src;
      if(l.type==='adjust'){
        const e=effect(l.params.kind||'colorgrade',l.params);
        src=this.effects(base,[e,...l.effects],backdrop||base,comp,map);
      }else{
        const raw=this.source(l,comp,w,h,map,backdrop||base);
        src=this.effects(raw,l.effects,backdrop||base,comp,map,this.layerPasses?.get(l.id));if(src!==raw)this.release(raw);
        // Auto-match groups explicitly seed an isolated group with the target.
        // The target is composited once, so its half-transparent edge is not doubled.
        const group=items[index+1];
        if(group?.visible&&group.params.baseLayer===l.id&&group.clipTo===l.id){
          const processed=this.stack(group.children,comp,w,h,new Map(map),backdrop||base,src);
          const masked=this.mask({...group,clipTo:null},map,w,h);
          const combined=this.run('blend',{opacity:group.opacity,mode:modes.indexOf(group.blend),adjust:true,atop:false},{base:src,layer:processed,mask:masked},this.target(w,h));
          this.release(src,processed,masked);src=combined;
          const effected=this.effects(src,group.effects,backdrop||base,comp);if(effected!==src)this.release(src);src=effected;
        }
      }
      const mask=this.mask(l,map,w,h);
      // A reference sees the effective alpha, including this layer's mask and
      // opacity. Referencing raw alpha would ignore the cut-out shape.
      const effective=this.run('multiplyMask',{opacity:l.opacity},{img:src,mask},this.target(w,h));
      map.set(l.id,effective);
      const next=this.run('blend',{opacity:l.opacity,mode:modes.indexOf(l.blend),adjust:l.type==='adjust',atop:!!seed&&l.type!=='adjust'},
        {base,layer:src,mask},this.target(w,h));
      if(base!==src)this.release(base);this.release(src,mask);base=next;
    }
    return base;
  }
  render(comp,{maxSize=1024,role=null,bare=false,soloId=null}={}) {
    // All temporary targets from the previous render are free; image textures persist.
    this.pool.forEach(t=>{if(!t.persistent)t.used=false;});
    this.layerPasses=new Map();
    const scale=Math.min(1,maxSize/Math.max(comp.width,comp.height)),w=Math.round(comp.width*scale),h=Math.round(comp.height*scale);
    let layers=comp.layers;
    if(bare)layers=layers.filter(l=>l.role==='char'||l.role==='bg').map(l=>({...l,blend:'normal',effects:[],clipTo:null}));
    // Render the real backdrop before isolated character processing (lightwrap).
    let bg;
    if(soloId){
      const item=flatLayers(comp).find(x=>x.layer.id===soloId),target=item?.layer;
      if(target){const source=target.params.baseLayer?item.items.find(l=>l.id===target.params.baseLayer):target;const index=item.items.indexOf(source||target);
        bg=this.stack(item.items.slice(0,index),comp,w,h);layers=source!==target&&source?[source,target]:target.type==='adjust'?item.items.slice(0,index+1):[target,...item.items.slice(index+1).filter(l=>l.params.baseLayer===target.id)];}
      else layers=[];
    }else if(role==='char'){
      const ci=layers.findIndex(l=>l.role==='char');const before=ci>=0?layers.slice(0,ci):[];
      bg=this.stack(before,comp,w,h);
      // Include the character's manual clipping chain as well as auto-match.
      // Unrelated foreground and global adjustments are not character layers.
      const ids=new Set();
      layers=ci<0?[]:layers.slice(ci).filter((l,index)=>{
        if(index===0||ids.has(l.clipTo)){ids.add(l.id);return true;}return false;
      });
    }else if(role==='bg')layers=layers.filter(l=>l.role==='bg');
    const map=new Map();let result=this.stack(layers,comp,w,h,map,bg);
    if(!bare&&!role&&!soloId){
      // Output LUTs keep their relative order but follow all ordinary global
      // effects. Layer/adjustment LUTs stay local to preserve masks and clipping.
      const atOutput=e=>e.type==='lut'&&e.params.placement==='output';
      const ordered=[...comp.postEffects.filter(e=>!atOutput(e)),...comp.postEffects.filter(atOutput)];
      const post=this.effects(result,ordered,result,comp,map);if(post!==result)this.release(result);result=post;
    }
    this.last=result;this.lastComp=comp;this.trim();return result;
  }
  outputValues(comp,extra={}) {
    return {space:comp.space==='gamma'?1:0,exposure:comp.output.exposure,tonemap:['none','reinhard','aces'].indexOf(comp.output.tonemap),transparent:false,checker:false,ab:false,split:.5,raw:false,scale:1,...extra};
  }
  display(comp,{maxSize=1024,ab=false,split=.5,checker=true,solo=null}={}) {
    let before;
    if(ab){const raw=this.render(comp,{maxSize,bare:true});before=this.copy(raw);before.persistent=true;}
    const result=this.render(comp,{maxSize,soloId:solo});
    this.canvas.width=result.width;this.canvas.height=result.height;
    this.run('output',this.outputValues(comp,{ab,split,checker}),{img:result,before:before||result},null);
    if(before){before.persistent=false;this.release(before);}
    return result;
  }
  read(comp,{maxSize=256,role=null,bare=false,transparent=true,raw=false,scale=1}={}) {
    const src=this.render(comp,{maxSize,role,bare});
    const out=this.run('output',this.outputValues(comp,{transparent,raw,scale}),{img:src,before:src},this.target(src.width,src.height,true));
    const gl=this.gl,data=new Uint8Array(out.width*out.height*4);gl.bindFramebuffer(gl.FRAMEBUFFER,out.fbo);gl.readPixels(0,0,out.width,out.height,gl.RGBA,gl.UNSIGNED_BYTE,data);
    const flipped=new Uint8Array(data.length),stride=out.width*4;
    for(let y=0;y<out.height;y++)flipped.set(data.subarray((out.height-1-y)*stride,(out.height-y)*stride),y*stride);
    this.release(out);return {data:flipped,width:out.width,height:out.height};
  }
  dispose(){const gl=this.gl;this.pool.forEach(t=>{gl.deleteTexture(t.texture);gl.deleteFramebuffer(t.fbo);});this.assets.forEach(a=>gl.deleteTexture(a.texture));this.tables.forEach(t=>gl.deleteTexture(t.texture));this.programs.forEach(p=>gl.deleteProgram(p.p));gl.deleteVertexArray(this.vao);}
}
