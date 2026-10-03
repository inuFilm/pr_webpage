import {validateLut} from './lut.js';
const n=(key,label,min,max,step,def,unit='')=>({key,label,min,max,step,default:def,unit});
const color=(key,label,def)=>({key,label,default:def,kind:'color'});
const vec=(key,label,def,min,max)=>({key,label,default:def,kind:'vector',min,max,step:.01});
const r=(v=.03)=>n('radius','半径',0,.2,.001,v,'短辺比');
const i=(v=.5)=>n('intensity','強さ',0,2,.01,v);
const dictionary = {
  colorgrade:{label:'色調整',params:[n('exposure','露出',-5,5,.05,0,'EV'),n('temp','色温度（近似）',-1,1,.01,0),n('tint','色かぶり（近似）',-1,1,.01,0),n('contrast','コントラスト',.1,3,.01,1),n('saturation','彩度',0,2,.01,1),n('hue','色相',-180,180,1,0,'°'),vec('slope','明部 RGB',[1,1,1],0,3),vec('offset','暗部 RGB',[0,0,0],-.5,.5),vec('power','中間 RGB',[1,1,1],.1,3)]},
  stats:{label:'統計マッチ',params:[n('strength','強さ',0,1,.01,.6),vec('sourceMean','元の平均 Lab',[.5,0,0],-1,1),vec('sourceStd','元の標準偏差',[.15,.05,.05],0,1),vec('targetMean','目標平均 Lab',[.5,0,0],-1,1),vec('targetStd','目標標準偏差',[.15,.05,.05],0,1)]},
  range:{label:'明暗の範囲',params:[n('strength','強さ',0,1,.01,.5),n('sourceLow','元の暗部',0,1,.001,0),n('sourceHigh','元の明部',0,1,.001,1),n('targetLow','目標の暗部',0,1,.001,.1),n('targetHigh','目標の明部',0,1,.001,.8)]},
  blur:{label:'ぼかし',params:[r(.008)]},
  glow:{label:'グロー',params:[n('threshold','しきい値',0,5,.01,.8),n('knee','膝',0,1,.01,.5),r(.04),i(.6),color('color','光の色',[1,1,1])]},
  diffusion:{label:'ディフュージョン',params:[r(),i(.3)]},
  lightwrap:{label:'ライトラップ',params:[r(),i(),{key:'screen',label:'スクリーンで合成',kind:'boolean',default:false}]},
  edgesoft:{label:'エッジぼかし',params:[r(.002)]},
  fog:{label:'空気感',params:[color('color','空気の色',[.5,.6,.7]),n('density','距離',0,1,.01,.08)]},
  grain:{label:'グレイン',params:[i(.03),n('size','粒の大きさ',.5,8,.1,1.5,'px'),n('seed','種',0,9999,1,42),{key:'mono',label:'単色',kind:'boolean',default:true}]},
  vignette:{label:'ビネット',params:[i(.3),r(.8),n('soft','柔らかさ',.01,1,.01,.5),n('roundness','丸み',0,1,.01,1)]}
};
dictionary.vignette.params[1]=n('radius','半径',0,1.5,.01,.8);
const select=(key,label,options,def)=>({key,label,options,default:def,kind:'select'});
const position=()=>[n('x','光源 X',0,1,.01,.75),n('y','光源 Y',0,1,.01,.2),{key:'auto',label:'明るい所から光源を決める',kind:'boolean',default:false}];
Object.assign(dictionary,{
  tlight:{label:'透過光',params:[{key:'source',label:'光源の形',kind:'source',default:'alpha-inverse'},r(.06),i(1.2),color('color','光の色',[1,.7,.35]),n('spill','内側への漏れ',0,1,.01,0)]},
  flare:{label:'フレア',params:[...position(),i(.35),n('ghosts','ゴーストの数',0,12,1,5),n('spacing','間隔',0,1,.01,.3),n('halo','ハローの半径',0,1,.01,.4),color('color','光の色',[1,.65,.3])]},
  anamorphic:{label:'アナモフレア',params:[n('threshold','しきい値',0,5,.01,.9),n('length','横の長さ',.01,1,.01,.4),i(.8),color('color','光の色',[.4,.6,1])]},
  godrays:{label:'光線',params:[...position(),n('threshold','しきい値',0,5,.01,.7),n('length','長さ',0,1,.01,.7),i(.4),n('decay','減衰',.5,1,.01,.96)]},
  dof:{label:'被写界深度',params:[r(.02),n('focus','ピントの一致',0,1,.01,0)]},
  halation:{label:'ハレーション',params:[n('threshold','しきい値',0,5,.01,.7),r(.03),i(.3)]},
  ca:{label:'色収差',params:[n('intensity','ずれ',0,.03,.0005,.003,'画面比')]},
  distort:{label:'レンズ歪み',params:[n('k1','樽 − / 糸巻 ＋',-.35,.5,.01,-.1),n('k2','外周の補正',-.1,.25,.01,0)]},
  sharpen:{label:'シャープ',params:[i(.5),r(.003)]},
  curve:{label:'輝度カーブ',params:[{key:'points',label:'暗部 → 明部（5点・単調）',kind:'curve',default:[0,.25,.5,.75,1]}]},
  lut:{label:'3D LUT',params:[{key:'table',label:'.cube（17 / 33段）',kind:'lut',default:null},select('space','LUT の入力値',{display:'表示用 sRGB',linear:'線形'},'display'),{...select('placement','適用する位置',{stack:'効果一覧の位置',output:'出力変換の直前'},'stack'),globalOnly:true},n('strength','強さ',0,1,.01,1)]}
});
dictionary.fog.params.push(n('smoke','スモークのむら',0,1,.01,0),n('seed','スモークの種',0,9999,1,42));
dictionary.fog.params.push({key:'depth',label:'3Dの深度を使う',kind:'boolean',default:true},n('near','空気感の開始距離',0,20,.1,2),n('far','空気感の終了距離',.1,30,.1,6));
dictionary.dof.params.push(n('distance','3Dのピント距離',.1,20,.05,3.6),n('range','3Dのぼけの距離幅',.05,10,.05,1));
dictionary.rimlight={label:'3D リムライト',params:[i(.3),n('power','縁の細さ',.2,12,.1,3),color('color','縁の色',[1,1,1])]};
export const EFFECTS=Object.fromEntries(Object.entries(dictionary).map(([type,def])=>[type,{...def,passes:params=>[{type,params}]}]));
export function effect(type,params={}) {
  if(!Object.hasOwn(EFFECTS,type))throw new Error('未対応の効果です: '+type);
  const def=EFFECTS[type], out={};
  for(const p of def.params) {
    const v=params[p.key];
    if(p.kind==='lut')out[p.key]=v?validateLut(v):null;
    else if(p.kind==='select')out[p.key]=Object.hasOwn(p.options,v)?v:p.default;
    else if(p.kind==='source')out[p.key]=typeof v==='string'&&/^(alpha-inverse|luma|mask:[\w-]+)$/.test(v)?v:p.default;
    else if(Array.isArray(p.default)){
      out[p.key]=Array.isArray(v)&&v.length===p.default.length&&v.every(Number.isFinite)?v.map(x=>Math.max(p.min??0,Math.min(p.max??1,x))):[...p.default];
      if(p.kind==='curve')for(let j=1;j<5;j++)out[p.key][j]=Math.max(out[p.key][j],out[p.key][j-1]);
    }
    else if(p.kind==='boolean')out[p.key]=typeof v==='boolean'?v:p.default;
    else out[p.key]=typeof v==='number'&&Number.isFinite(v)?Math.max(p.min,Math.min(p.max,v)):p.default;
  }
  return {type,enabled:true,params:out};
}
