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
export const EFFECTS=Object.fromEntries(Object.entries(dictionary).map(([type,def])=>[type,{...def,passes:params=>[{type,params}]}]));
export function effect(type,params={}) {
  if(!Object.hasOwn(EFFECTS,type))throw new Error('未対応の効果です: '+type);
  const def=EFFECTS[type], out={};
  for(const p of def.params) {
    const v=params[p.key];
    if(Array.isArray(p.default))out[p.key]=Array.isArray(v)&&v.length===3&&v.every(Number.isFinite)?v.map(x=>Math.max(p.min??0,Math.min(p.max??1,x))):[...p.default];
    else if(p.kind==='boolean')out[p.key]=typeof v==='boolean'?v:p.default;
    else out[p.key]=typeof v==='number'&&Number.isFinite(v)?Math.max(p.min,Math.min(p.max,v)):p.default;
  }
  return {type,enabled:true,params:out};
}
