// .cube data is local, bounded and serializable; red is the fastest axis.
export function parseCube(text) {
  let size=0, min=[0,0,0], max=[1,1,1], title='LUT';const data=[];
  if(text.length>5000000)throw new Error('LUT は5 MBまでです');
  for(const raw of text.split(/\r?\n/)) {
    const line=raw.replace(/#.*/,'').trim();if(!line)continue;
    const [key,...rest]=line.split(/\s+/);
    if(key==='TITLE'){title=rest.join(' ').replace(/^"|"$/g,'').slice(0,100);continue;}
    if(key==='LUT_3D_SIZE'){size=Number(rest[0]);if(![17,33].includes(size))throw new Error('3D LUT は17段または33段に対応します');continue;}
    if(key==='DOMAIN_MIN'||key==='DOMAIN_MAX'){const v=rest.map(Number);if(v.length!==3||!v.every(Number.isFinite))throw new Error('LUT の入力範囲が不正です');if(key==='DOMAIN_MIN')min=v;else max=v;continue;}
    const v=line.split(/\s+/).map(Number);
    if(v.length!==3||!v.every(x=>Number.isFinite(x)&&Math.abs(x)<=65504))throw new Error('未対応または不正な .cube の行です: '+key);
    data.push(...v);if(data.length>33**3*3)throw new Error('LUT の行数が多すぎます');
  }
  return validateLut({size,min,max,title,data});
}
export function validateLut(v) {
  if(!v||![17,33].includes(v.size)||!Array.isArray(v.data)||v.data.length!==v.size**3*3||!v.data.every(x=>Number.isFinite(x)&&Math.abs(x)<=65504))throw new Error('LUT の段数とデータ数が一致しません');
  const min=v.min||[0,0,0],max=v.max||[1,1,1];
  if([min,max].some(a=>!Array.isArray(a)||a.length!==3||!a.every(Number.isFinite))||min.some((x,i)=>x>=max[i]))throw new Error('LUT の入力範囲が不正です');
  return {size:v.size,min:[...min],max:[...max],title:String(v.title||'LUT').slice(0,100),data:[...v.data]};
}
export function curveTable(points) {
  if(!Array.isArray(points)||points.length!==5||!points.every(Number.isFinite))points=[0,.25,.5,.75,1];
  const p=points.map((v,i)=>Math.max(0,Math.min(1,v)));for(let i=1;i<5;i++)p[i]=Math.max(p[i],p[i-1]);
  return Float32Array.from({length:256},(_,i)=>{const t=i/255*4,j=Math.min(3,Math.floor(t));return p[j]+(p[j+1]-p[j])*(t-j);});
}
