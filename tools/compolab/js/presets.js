import {scene,layer} from './comp.js';
import {effect} from './effects.js';
import {autoMatch} from './match.js';
import {modelParams} from './model3d.js';
export const RECIPES=[
 {id:'sunset',name:'夕方',bg:'sunset',parts:[['背景合わせ','強さ0.8','暖色と明暗を背景へ寄せる'],['ハレーション','半径0.025／強さ0.18','窓の周囲に暖かいにじみ'],['グレイン','0.008','最後に弱い粒子']]},
 {id:'night',name:'夜',bg:'night',parts:[['色調整','露出−0.6／彩度0.82','夜の明暗を保つ'],['グロー','しきい値0.65／強さ0.35','窓だけを光らせる'],['ビネット','0.25','周辺を静かに落とす']]},
 {id:'backlight',name:'逆光',bg:'sunset',parts:[['透過光','半径0.055／強さ0.18／漏れ0.15','キャラの外から光を入れる'],['ライトラップ','強さ0.6','輪郭へ背景色'],['光線','長さ0.55／強さ0.15','光源の方向を強調']]},
 {id:'memory',name:'回想',bg:'day',parts:[['色調整','彩度0.55／色温度0.15','色数を抑える'],['輝度カーブ','0.04 / 0.3 / 0.55 / 0.8 / 1','黒を少し持ち上げる'],['ディフュージョン','半径0.025／強さ0.22','全体を柔らかくする']]},
 {id:'horror',name:'ホラー',bg:'rain',parts:[['色調整','露出−0.5／彩度0.45／色かぶり0.2','低彩度の冷たさ'],['ビネット','0.65','周辺を暗くする'],['色収差','0.0015','控えめな不安定さ']]},
 {id:'fresh',name:'爽やか',bg:'day',parts:[['色調整','露出0.1／彩度1.1','明るさと色を少し足す'],['シャープ','強さ0.2／半径0.002','細部を控えめに引き出す'],['グロー','しきい値0.9／強さ0.12','強い明部だけ柔らかくする']]}
];
const para=(name,color,angle,blend,opacity,extra={})=>layer('gradient',name,{blend,opacity,params:{kind:'linear',color,angle,start:0,end:.7,feather:1,alphaStart:1,alphaEnd:0},...extra});
export function recipeScene(id,renderer) {
 const r=RECIPES.find(x=>x.id===id);if(!r)throw new Error('未知のレシピ');const c=scene(r.bg);c.name=r.name;
 autoMatch(renderer,c,{strength:.8});const char=c.layers[1];
 if(id==='sunset'){c.postEffects=[effect('halation',{radius:.025,intensity:.18}),effect('grain',{intensity:.008})];}
 if(id==='night'){char.effects.push(effect('colorgrade',{exposure:-.6,saturation:.82}));c.postEffects=[effect('glow',{threshold:.65,intensity:.35}),effect('vignette',{intensity:.25}),effect('grain',{intensity:.008})];}
 if(id==='backlight'){char.effects.push(effect('lightwrap',{intensity:.6}));c.postEffects=[effect('tlight',{radius:.055,intensity:.18,spill:.15}),effect('godrays',{x:.7,y:.22,length:.55,intensity:.15})];}
 if(id==='memory')c.postEffects=[effect('colorgrade',{saturation:.55,temp:.15}),effect('curve',{points:[.04,.3,.55,.8,1]}),effect('diffusion',{radius:.025,intensity:.22}),effect('grain',{intensity:.012})];
 if(id==='horror')c.postEffects=[effect('colorgrade',{exposure:-.5,saturation:.45,temp:-.2,tint:.2}),effect('vignette',{intensity:.65}),effect('ca',{intensity:.0015}),effect('grain',{intensity:.018})];
 if(id==='fresh')c.postEffects=[effect('colorgrade',{exposure:.1,saturation:1.1}),effect('sharpen',{intensity:.2,radius:.002}),effect('glow',{threshold:.9,intensity:.12})];
 return c;
}
export function lessonScene(id,renderer) {
 const c=scene(['dof-book','air','exposure-wb','cdl'].includes(id)?'day':'sunset'),char=c.layers[1];
 if(id==='para')c.layers.push(para('上の黒パラ',[0,0,0],90,'multiply',.3),para('光側の白パラ',[1,.85,.6],150,'screen',.15));
 if(id==='diff-glow')c.postEffects=[effect('diffusion'),{...effect('glow'),enabled:false}];
 if(id==='tlight')c.postEffects=[effect('tlight',{intensity:.3,spill:.1})];
 if(id==='flare')c.postEffects=[effect('flare',{intensity:.3}),effect('anamorphic',{threshold:.65,intensity:1.2}),{...effect('godrays'),enabled:false}];
 if(id==='dof-book'){
   c.layers[0].effects=[effect('dof',{radius:.012})];
   c.layers.push(layer('image','手前のBOOK',{role:'book',params:{src:'sample:bg:day'},transform:{x:-950,y:300,scale:1.8,rotate:0,flipX:false},mask:{source:'gradient',angle:0,invert:true,feather:.03},effects:[effect('dof',{radius:.055})]}));
 }
 if(id==='air')char.effects=[effect('fog',{color:[.45,.52,.56],density:.25,smoke:.7})];
 if(id==='exposure-wb')char.effects=[effect('colorgrade',{exposure:.3,temp:.3}),effect('curve',{points:[0,.28,.5,.75,1]})];
 if(id==='cdl')char.effects=[effect('colorgrade',{slope:[1.1,1,.92],offset:[0,0,.015],power:[1.03,1,1]})];
 if(id==='tonemap'){
   c.layers=[layer('solid','暗い背景',{role:'bg',params:{color:[.02,.02,.02]}}),layer('solid','HDR の光（2.0）',{role:'char',params:{color:[2,2,2]},mask:{source:'rect',rect:[.3,.2,.7,.8],feather:0,invert:false}})];c.postEffects=[effect('glow',{threshold:.8,intensity:.3})];c.output.tonemap='reinhard';
 }
 if(id==='film'){
   const size=17,data=[];for(let b=0;b<size;b++)for(let g=0;g<size;g++)for(let r=0;r<size;r++){const v=[r,g,b].map(x=>x/(size-1));data.push(v[0]*.95+.035,v[1]*.97+.015,v[2]*.92+.02);}
   c.postEffects=[effect('lut',{table:{size,data,min:[0,0,0],max:[1,1,1],title:'教材の弱い暖色LUT'}}),effect('halation',{intensity:.2}),effect('grain',{intensity:.015})];
 }
 if(id==='lens')c.postEffects=[effect('ca',{intensity:.004}),effect('distort',{k1:-.15}),effect('vignette',{intensity:.4}),effect('sharpen',{intensity:.25})];
 if(id==='order')c.postEffects=[effect('glow',{threshold:.6,intensity:.7}),effect('grain',{intensity:.08})];
 if(id==='recipes')return recipeScene('sunset',renderer);
 if(id==='char3d'){c.layers[1]=layer('render3d','3D キャラ',{id:'character',role:'char',params:modelParams({passes:{depth:true,normal:true,id:true}}),effects:[effect('fog',{density:.12}),effect('rimlight',{intensity:.15})]});}
 if(id==='glossary')autoMatch(renderer,c);
 return c;
}
