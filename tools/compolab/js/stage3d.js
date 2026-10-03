import * as THREE from 'three';
import {GLTFLoader} from '../vendor/loaders/GLTFLoader.js';
import {OrbitControls} from '../vendor/controls/OrbitControls.js';
import {VRMLoaderPlugin,VRMUtils} from '@pixiv/three-vrm';

export class Stage3D {
 constructor(compositor,{change=()=>{},start=()=>{},end=()=>{}}={}) {
  if(!compositor.hdr)throw new Error('3D は RGBA16F 対応の端末で利用できます。2D は引き続き使えます。');
  this.compositor=compositor;this.assets=new Map();this.targets=new Map();this.materialCache=new Map();this.active=null;this.syncing=false;
  this.renderer=new THREE.WebGLRenderer({canvas:compositor.canvas,context:compositor.gl,alpha:true,premultipliedAlpha:false,antialias:false});
  this.renderer.outputColorSpace=THREE.LinearSRGBColorSpace;this.renderer.toneMapping=THREE.NoToneMapping;this.renderer.setClearColor(0,0);
  this.scene=new THREE.Scene();this.perspective=new THREE.PerspectiveCamera(30,1,.01,100);this.ortho=new THREE.OrthographicCamera(-1,1,1,-1,.01,100);this.camera=this.perspective;
  this.lights={};for(const k of ['key','fill','rim']){const light=new THREE.DirectionalLight(0xffffff,1);this.scene.add(light,light.target);this.lights[k]=light;}
  this.lights.hemi=new THREE.HemisphereLight(0xffffff,0x333333,1);this.scene.add(this.lights.hemi);
  this.controls=new OrbitControls(this.camera,compositor.canvas);this.controls.enabled=false;this.controls.enableDamping=false;
  this.controls.minZoom=.1;this.controls.maxZoom=20;this.controls.minDistance=.15;this.controls.maxDistance=30;
  this.controls.addEventListener('start',()=>{if(this.active)start();});
  this.controls.addEventListener('change',()=>{if(!this.active||this.syncing)return;this.active.params.camera.pos=this.camera.position.toArray();this.active.params.camera.target=this.controls.target.toArray();this.active.params.camera.zoom=this.camera.zoom;change();});
  this.controls.addEventListener('end',()=>{if(this.active)end();});
  this.depthMaterial=new THREE.MeshDepthMaterial({depthPacking:THREE.BasicDepthPacking,side:THREE.DoubleSide});
  this.depthMaterial.onBeforeCompile=shader=>{
   shader.vertexShader=shader.vertexShader.replace('void main() {','varying float vLinearDepth; void main() {').replace('#include <project_vertex>','#include <project_vertex>\nvLinearDepth=-mvPosition.z;');
   shader.fragmentShader=shader.fragmentShader.replace('void main() {','varying float vLinearDepth; void main() {').replace('gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );','gl_FragColor = vec4(vec3(vLinearDepth),1.0);');
  };
  this.normalMaterial=new THREE.MeshNormalMaterial({side:THREE.DoubleSide});
  this.hiddenMaterial=new THREE.MeshBasicMaterial({visible:false});
 }
 async load(key,buffer,files=[]) {
  if(this.assets.has(key))return this.assets.get(key);
  const urls=[],provided=new Map(),manager=new THREE.LoadingManager();
  for(const f of files){const u=URL.createObjectURL(f);urls.push(u);provided.set(f.name,u);}
  manager.setURLModifier(url=>{
   if(url.startsWith('blob:')||/^data:(application\/octet-stream|application\/gltf-buffer|image\/(png|jpeg|webp));base64,/i.test(url))return url;
   if(/^[a-z]+:|^\/\//i.test(url))throw new Error('モデルの外部URLは読み込みません。画像・binも一緒に選んでください。');
   const name=decodeURIComponent(url).replaceAll('\\','/').split('/').at(-1);if(provided.has(name))return provided.get(name);
   throw new Error('モデルの関連ファイルがありません: '+name+'（モデルと一緒に選んでください）');
  });
  const loader=new GLTFLoader(manager);loader.register(parser=>{
   // The supplied one-material VRM has its outline disabled in the file.
   // Enable a thin MToon outline only in the in-memory sample configuration.
   if(key==='sample:sotai_girl')for(const m of parser.json.extensions?.VRM?.materialProperties||[]){m.floatProperties._OutlineWidthMode=1;m.floatProperties._OutlineWidth=.12;}
   return new VRMLoaderPlugin(parser);
  });
  let gltf;try{gltf=await loader.parseAsync(buffer,'');}finally{urls.forEach(u=>URL.revokeObjectURL(u));}
  const vrm=gltf.userData.vrm,object=vrm?.scene||gltf.scene;
  if(vrm){VRMUtils.removeUnnecessaryVertices(object);if(VRMUtils.combineSkeletons)VRMUtils.combineSkeletons(object);else VRMUtils.removeUnnecessaryJoints(object);VRMUtils.rotateVRM0(vrm);vrm.update(0);}
  object.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(object),height=box.max.y-box.min.y;
  if(!Number.isFinite(height)||height<=0)throw new Error('描画できる形状がモデルにありません');
  // Keep original pose and relative proportions. Fit units and ground placement once.
  const root=new THREE.Group();root.add(object);object.position.sub(new THREE.Vector3((box.min.x+box.max.x)/2,box.min.y,(box.min.z+box.max.z)/2));root.scale.setScalar(1.65/height);
  const materials=[],meshes=[];root.traverse(o=>{if(!o.isMesh)return;o.frustumCulled=false;meshes.push(o);for(const m of Array.isArray(o.material)?o.material:[o.material])if(!materials.includes(m)&&!m.isOutline)materials.push(m);});
  const asset={root,vrm,materials,meshes,originalMaterials:new Map(meshes.map(m=>[m,m.material]))};this.assets.set(key,asset);return asset;
 }
 async sample(){const key='sample:sotai_girl';if(!this.assets.has(key)){const res=await fetch('./assets/sotai_girl.vrm');if(!res.ok)throw new Error('同梱モデルを読み込めません');await this.load(key,await res.arrayBuffer());}return this.assets.get(key);}
 select(layer) {this.active=layer?.type==='render3d'?layer:null;this.controls.enabled=!!this.active;this.compositor.canvas.style.touchAction=this.active?'none':'';}
 configure(p,w,h) {
  this.syncing=true;this.camera=p.camera.ortho?this.ortho:this.perspective;const camera=this.camera;camera.zoom=p.camera.zoom??1;camera.position.fromArray(p.camera.pos);camera.lookAt(new THREE.Vector3().fromArray(p.camera.target));
  if(p.camera.ortho){const height=camera.position.distanceTo(new THREE.Vector3().fromArray(p.camera.target))*Math.tan(p.camera.fov*Math.PI/360);camera.left=-height*w/h;camera.right=height*w/h;camera.top=height;camera.bottom=-height;}
  else {camera.fov=p.camera.fov;camera.aspect=w/h;}camera.updateProjectionMatrix();
  this.controls.object=camera;this.controls.target.fromArray(p.camera.target);this.controls.update();this.syncing=false;
  for(const k of ['key','fill','rim']){const l=this.lights[k],v=p.lights[k];l.color.setRGB(...v.color);l.intensity=v.intensity;l.position.fromArray(v.dir);l.target.position.set(0,0,0);}
  const hemi=this.lights.hemi;hemi.color.setRGB(...p.lights.hemi.sky);hemi.groundColor.setRGB(...p.lights.hemi.ground);hemi.intensity=p.lights.hemi.intensity;
 }
 target(name,w,h) {
  let rt=this.targets.get(name);if(!rt){rt=new THREE.WebGLRenderTarget(w,h,{type:THREE.HalfFloatType,format:THREE.RGBAFormat,colorSpace:THREE.LinearSRGBColorSpace,samples:name==='color'?Math.min(4,this.renderer.capabilities.maxSamples):0,depthBuffer:true});this.targets.set(name,rt);}else if(rt.width!==w||rt.height!==h)rt.setSize(w,h);return rt;
 }
 draw(scene,camera,name,w,h) {
  const renderer=this.renderer,gl=this.compositor.gl,rt=this.target(name,w,h);
  renderer.resetState();renderer.setRenderTarget(rt);
  if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE&&rt.samples){rt.samples=0;rt.dispose();renderer.setRenderTarget(rt);}
  if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw new Error('3D の RGBA16F 描画先を作れません');
  renderer.clear(true,true,true);renderer.render(scene,camera);renderer.setRenderTarget(null);renderer.resetState();
  const texture=renderer.properties.get(rt.texture).__webglTexture;if(!texture)throw new Error('共有3Dテクスチャを取得できません');return {texture,width:w,height:h,persistent:true};
 }
 auxiliaryMaterial(original,kind,id) {
  if(original.isOutline)return this.hiddenMaterial;
  const key=original.uuid+':'+kind;let m=this.materialCache.get(key);if(m)return m;
  if(kind==='id')m=new THREE.MeshBasicMaterial({color:new THREE.Color().setRGB(id/255,0,0),side:original.side,map:original.map,alphaTest:Math.max(.01,original.alphaTest||0),toneMapped:false});
  else m=(kind==='depth'?this.depthMaterial:this.normalMaterial).clone();
  if(kind==='depth'){m.onBeforeCompile=this.depthMaterial.onBeforeCompile;m.map=original.map;m.alphaTest=Math.max(.01,original.alphaTest||0);}
  if(kind==='normal'){m.map=original.map;m.alphaTest=Math.max(.01,original.alphaTest||0);}
  // ID cannot be multiplied by the model's texture RGB: retain its alpha only.
  if(kind==='id')m.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','#ifdef USE_MAP\n diffuseColor.a *= texture2D(map,vMapUv).a;\n#endif');};
  this.materialCache.set(key,m);return m;
 }
 render(layer,w,h,needs={}) {
  const asset=this.assets.get(layer.params.src);if(!asset)return null;const p=layer.params;this.configure(p,w,h);this.scene.add(asset.root);
  asset.vrm?.update(0);const hidden=[];asset.root.traverse(o=>{if(o.isMesh)for(const m of Array.isArray(o.material)?o.material:[o.material])if(m.isOutline){hidden.push([m,m.visible]);m.visible=p.outline;}});
  const result={};
  try{
   result.color=this.draw(this.scene,this.camera,'color',w,h);
   for(const kind of ['depth','normal','id'])if(p.passes[kind]||p.preview===kind||needs[kind]){
    for(const mesh of asset.meshes){const original=asset.originalMaterials.get(mesh);const replace=m=>this.auxiliaryMaterial(m,kind,asset.materials.indexOf(m)+1);mesh.material=Array.isArray(original)?original.map(replace):replace(original);}
    result[kind]=this.draw(this.scene,this.camera,kind,w,h);
    for(const [mesh,material] of asset.originalMaterials)mesh.material=material;hidden.forEach(([o])=>o.visible=p.outline);
   }
  }finally{for(const [mesh,material] of asset.originalMaterials)mesh.material=material;hidden.forEach(([o,v])=>o.visible=v);this.scene.remove(asset.root);this.renderer.resetState();}
  return result;
 }
 dispose(){this.controls.dispose();for(const rt of this.targets.values())rt.dispose();for(const m of this.materialCache.values())m.dispose();this.depthMaterial.dispose();this.normalMaterial.dispose();for(const a of this.assets.values()){a.root.traverse(o=>{o.geometry?.dispose();});a.materials.forEach(m=>m.dispose());}this.renderer.dispose();}
}
