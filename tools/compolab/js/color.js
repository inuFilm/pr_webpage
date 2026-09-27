// CPU reference implementation. GLSL in shaders.js uses the same equations.
export const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
export const mix = (a, b, t) => a + (b - a) * t;
export const srgbToLinear = c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4;
export const linearToSrgb = c => c <= .0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - .055;
export const luminance = c => .2126*c[0] + .7152*c[1] + .0722*c[2];
export function linearToOklab([r,g,b]) {
  const l=Math.cbrt(.4122214708*r+.5363325363*g+.0514459929*b);
  const m=Math.cbrt(.2119034982*r+.6806995451*g+.1073969566*b);
  const s=Math.cbrt(.0883024619*r+.2817188376*g+.6299787005*b);
  return [.2104542553*l+.793617785*m-.0040720468*s,1.9779984951*l-2.428592205*m+.4505937099*s,.0259040371*l+.7827717662*m-.808675766*s];
}
export function oklabToLinear([L,a,b]) {
  const l=(L+.3963377774*a+.2158037573*b)**3;
  const m=(L-.1055613458*a-.0638541728*b)**3;
  const s=(L-.0894841775*a-1.291485548*b)**3;
  return [4.0767416621*l-3.3077115913*m+.2309699292*s,-1.2684380046*l+2.6097574011*m-.3413193965*s,-.0041960863*l-.7034186147*m+1.707614701*s];
}
export const BLENDS = {normal:'通常',multiply:'乗算',screen:'スクリーン',overlay:'オーバーレイ',darken:'比較（暗）',lighten:'比較（明）',colordodge:'覆い焼き',colorburn:'焼き込み',hardlight:'ハードライト',softlight:'ソフトライト',difference:'差',add:'加算',hue:'色相',saturation:'彩度',color:'カラー',luminosity:'輝度'};
export const lum = c => .3*c[0]+.59*c[1]+.11*c[2];
const sat = c => Math.max(...c)-Math.min(...c);
export function setLum(c, l) {
  const d=l-lum(c), r=c.map(x=>x+d), n=Math.min(...r), x=Math.max(...r);
  if(n<0) for(let i=0;i<3;i++) r[i]=l+(r[i]-l)*l/(l-n);
  if(x>1) for(let i=0;i<3;i++) r[i]=l+(r[i]-l)*(1-l)/(x-l);
  return r;
}
function setSat(c,s) {
  const n=Math.min(...c), d=sat(c);
  return d>0 ? c.map(x=>(x-n)*s/d) : [0,0,0];
}
const hardlight = (b,s) => s<=.5 ? b*2*s : b+(2*s-1)-b*(2*s-1);
export function blend(mode,b,s) {
  if(mode==='hue') return setLum(setSat(s,sat(b)),lum(b));
  if(mode==='saturation') return setLum(setSat(b,sat(s)),lum(b));
  if(mode==='color') return setLum(s,lum(b));
  if(mode==='luminosity') return setLum(b,lum(s));
  return b.map((x,i)=>{
    const y=s[i];
    switch(mode) {
      case 'multiply': return x*y;
      case 'screen': return x+y-x*y;
      case 'overlay': return hardlight(y,x);
      case 'darken': return Math.min(x,y);
      case 'lighten': return Math.max(x,y);
      case 'colordodge': return x===0?0:y>=1?1:Math.min(1,x/(1-y));
      case 'colorburn': return x>=1?1:y===0?0:1-Math.min(1,(1-x)/y);
      case 'hardlight': return hardlight(x,y);
      case 'softlight': return y<=.5 ? x-(1-2*y)*x*(1-x) : x+(2*y-1)*((x<=.25?((16*x-12)*x+4)*x:Math.sqrt(x))-x);
      case 'difference': return Math.abs(x-y);
      case 'add': return x+y;
      default: return y;
    }
  });
}
export function over(B,S,mode='normal',opacity=1) {
  const ab=B[3], as=S[3]*opacity, b=ab?B.slice(0,3).map(v=>v/ab):[0,0,0], s=S[3]?S.slice(0,3).map(v=>v/S[3]):[0,0,0];
  return [...blend(mode,b,s).map((v,i)=>(1-ab)*S[i]*opacity+(1-as)*B[i]+as*ab*v),as+ab*(1-as)];
}
export function matchOklab(value, source, target, strength, limit=true) {
  return value.map((x,i)=>{
    const ratio=target.std[i]/Math.max(source.std[i],1e-6);
    return mix(x,(x-source.mean[i])*(limit?clamp(ratio,.5,2):ratio)+target.mean[i],strength);
  });
}
export const distance = (a,b) => Math.hypot(...a.map((v,i)=>v-b[i]));
export function summarize(values, weights=values.map(()=>1)) {
  const total=weights.reduce((a,b)=>a+b,0);
  if(!total) return {mean:[0,0,0],std:[0,0,0],p1:0,p50:0,p99:0,chroma:0,count:0};
  const mean=[0,1,2].map(i=>values.reduce((sum,v,j)=>sum+v[i]*weights[j],0)/total);
  const std=mean.map((m,i)=>Math.sqrt(values.reduce((sum,v,j)=>sum+(v[i]-m)**2*weights[j],0)/total));
  const sorted=values.map((v,i)=>[v[0],weights[i]]).sort((a,b)=>a[0]-b[0]);
  const percentile=p=>{let t=0;for(const [v,w] of sorted){t+=w;if(t>=total*p)return v;}return sorted.at(-1)[0];};
  return {mean,std,p1:percentile(.01),p50:percentile(.5),p99:percentile(.99),chroma:values.reduce((s,v,i)=>s+Math.hypot(v[1],v[2])*weights[i],0)/total,count:values.length};
}
// Input: top-down, straight sRGB RGBA8. ROI in normalized image coordinates.
export function imageStats(data,width,height,roi=[0,0,1,1]) {
  const values=[], weights=[], points=[], linear=[], light=new Float32Array(width*height);
  const valid=new Uint8Array(width*height);
  const lo=[Math.floor(roi[0]*width),Math.floor(roi[1]*height)], hi=[Math.ceil(roi[2]*width),Math.ceil(roi[3]*height)];
  const regions={top:[],bottom:[],left:[],right:[]};
  let bbox=[width,height,0,0];
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const j=y*width+x, i=j*4, a=data[i+3]/255;
    if(a<.5||x<lo[0]||y<lo[1]||x>=hi[0]||y>=hi[1])continue;
    const c=[data[i],data[i+1],data[i+2]].map(v=>srgbToLinear(v/255)), lab=linearToOklab(c);
    values.push(lab);weights.push(a);points.push([x/width,y/height]);linear.push(c);valid[j]=1;light[j]=luminance(c);
    bbox=[Math.min(bbox[0],x),Math.min(bbox[1],y),Math.max(bbox[2],x+1),Math.max(bbox[3],y+1)];
    if(y<height*.2)regions.top.push(c);if(y>=height*.8)regions.bottom.push(c);
    regions[x<width/2?'left':'right'].push(lab);
  }
  const s=summarize(values,weights);
  const avg=arr=>[0,1,2].map(i=>arr.reduce((sum,v)=>sum+v[i],0)/(arr.length||1));
  const high=[], edges=[];
  for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++){
    const j=y*width+x;if(!valid[j]||!valid[j-1]||!valid[j+1]||!valid[j-width]||!valid[j+width])continue;
    const diff=light[j]-(light[j-1]+light[j+1]+light[j-width]+light[j+width])/4;
    high.push(diff);edges.push(diff*4);
  }
  const std=a=>{const m=a.reduce((s,v)=>s+v,0)/(a.length||1);return Math.sqrt(a.reduce((s,v)=>s+(v-m)**2,0)/(a.length||1));};
  const bright=values.map((v,i)=>i).sort((a,b)=>values[b][0]-values[a][0]).slice(0,Math.max(1,Math.ceil(values.length*.02)));
  return {...s,color:avg(linear),top:avg(regions.top),bottom:avg(regions.bottom),leftL:avg(regions.left)[0],rightL:avg(regions.right)[0],
    brightColor:avg(bright.map(i=>linear[i])),brightPos:[0,1].map(k=>bright.reduce((sum,i)=>sum+points[i][k],0)/(bright.length||1)),
    highFrequency:std(high),edge:std(edges),bbox:s.count?[bbox[0]/width,bbox[1]/height,bbox[2]/width,bbox[3]/height]:[0,0,1,1]};
}
export function behindROI(bbox) {
  const [x,y,r,b]=bbox,cx=(x+r)/2,cy=(y+b)/2;
  return [clamp(cx-(r-x)*.75),clamp(cy-(b-y)*.75),clamp(cx+(r-x)*.75),clamp(cy+(b-y)*.75)];
}
