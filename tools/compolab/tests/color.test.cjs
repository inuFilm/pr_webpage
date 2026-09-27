const {test}=require('node:test'),assert=require('node:assert/strict');
const mod=import('../js/color.js');
const close=(a,b,tol=1e-6)=>assert.ok(Math.abs(a-b)<tol, a+' != '+b);
test('sRGB round trips, joins and Oklab white/gray/HDR',async()=>{
  const c=await mod;for(let i=0;i<256;i++){const x=i/255;close(c.linearToSrgb(c.srgbToLinear(x)),x);const rgb=[x,.18,1-x],out=c.oklabToLinear(c.linearToOklab(rgb));out.forEach((v,i)=>close(v,rgb[i]));}
  close(c.srgbToLinear(.04045-1e-8),c.srgbToLinear(.04045+1e-8),1e-7);close(c.linearToSrgb(.0031308-1e-9),c.linearToSrgb(.0031308+1e-9),1e-7);
  const white=c.linearToOklab([1,1,1]);close(white[0],1);close(white[1],0);close(white[2],0);
  const gray=c.linearToOklab([.18,.18,.18]);close(gray[1],0);close(gray[2],0);
});
test('all blend modes and W3C singular cases',async()=>{
  const c=await mod;assert.equal(Object.keys(c.BLENDS).length,16);
  for(const [mode,b,s,out] of [['multiply',.5,.5,.25],['screen',.5,.5,.75],['overlay',.25,.5,.25],['overlay',.75,.5,.75],['softlight',.5,.5,.5],['softlight',.25,1,.5],['colordodge',.5,.5,1],['colorburn',.5,.5,0],['hardlight',.5,.25,.25],['hardlight',.5,.75,.75],['difference',.3,.8,.5],['add',.7,.7,1.4],['colordodge',0,1,0],['colorburn',1,0,1]])close(c.blend(mode,[b,b,b],[s,s,s])[0],out);
  close(c.lum(c.blend('color',[.5,.5,.5],[1,0,0])),.5);
  for(const mode of Object.keys(c.BLENDS))for(const b of [[0,0,0],[1,1,1],[.1,.7,.3]])assert.ok(c.blend(mode,b,[.8,.2,.6]).every(Number.isFinite));
});
test('over is associative including zero alpha',async()=>{
  const c=await mod;assert.deepEqual(c.over([0,0,0,1],[.5,.5,.5,.5]),[.5,.5,.5,1]);
  const a=[.1,.2,0,.4],b=[.5,0,.2,.7],d=[.1,.1,.1,.2],left=c.over(c.over(a,b),d),right=c.over(a,c.over(b,d));left.forEach((v,i)=>close(v,right[i]));assert.deepEqual(c.over(a,[0,0,0,0]),a);
});
test('weighted Gaussian statistics and transfer endpoints',async()=>{
  const c=await mod;let seed=42;const random=()=>{seed=(1664525*seed+1013904223)>>>0;return(seed+.5)/4294967296;};
  const values=Array.from({length:100000},()=>{const x=.3+.1*Math.sqrt(-2*Math.log(random()))*Math.cos(2*Math.PI*random());return [x,x/2,-x/3];}),source=c.summarize(values);
  close(source.mean[0],.3,.001);close(source.std[0],.1,.001);close(source.p1,.067365,.001);close(source.p50,.3,.001);close(source.p99,.532635,.001);
  const target={mean:[.6,.2,-.08],std:[.15,.04,.02]},matched=values.map(v=>c.matchOklab(v,source,target,1)),summary=c.summarize(matched);
  summary.mean.forEach((v,i)=>close(v,target.mean[i]));summary.std.forEach((v,i)=>close(v,target.std[i]));
  assert.deepEqual(c.matchOklab(values[0],source,target,0),values[0]);
  const weighted=c.summarize([[0,0,0],[1,1,1]],[1,3]);assert.deepEqual(weighted.mean,[.75,.75,.75]);
});
test('alpha exclusion, ROI and directional statistics',async()=>{
  const c=await mod,d=new Uint8Array(8*8*4);for(let y=0;y<8;y++)for(let x=0;x<8;x++){const i=(y*8+x)*4;d.set(x<4?[255,0,0,255]:[0,0,255,255],i);}d.set([0,255,0,100],0);
  const all=c.imageStats(d,8,8),left=c.imageStats(d,8,8,[0,0,.5,1]);assert.equal(all.count,63);assert.equal(left.count,31);close(left.color[0],1);assert.ok(all.leftL>all.rightL);assert.deepEqual(c.behindROI([.4,.4,.6,.6]),[.35000000000000003,.35000000000000003,.6499999999999999,.6499999999999999]);
});
