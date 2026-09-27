import {imageStats,behindROI,distance,clamp} from './color.js';
import {layer,flatLayers} from './comp.js';
import {effect} from './effects.js';
export function measure(renderer,comp,role,bare=false,roi) {
  const pixels=renderer.read(comp,{role,bare,maxSize:256});
  return imageStats(pixels.data,pixels.width,pixels.height,roi);
}
export function autoMatch(renderer,comp,options={}) {
  const char=comp.layers.find(l=>l.role==='char'),bg=comp.layers.find(l=>l.role==='bg');
  if(!char||!bg)throw new Error('キャラと背景を読み込んでください');
  const all=flatLayers(comp);
  if(all.some(({layer:l})=>l.type==='image'&&!renderer.assets.has(l.params.src)))throw new Error('画像が未読み込みです。元のファイルを読み込み直してください');
  comp.layers=comp.layers.filter(l=>l.params.owner!=='automatch');
  char.effects=char.effects.filter(e=>e.owner!=='automatch');
  const original=measure(renderer,comp,'char'),whole=measure(renderer,comp,'bg');
  const target=options.region==='whole'?whole:measure(renderer,comp,'bg',false,behindROI(original.bbox));
  if(!original.count||!target.count)throw new Error('測れる画素がありません。キャラの位置・不透明度を確認してください');
  const strength=clamp(options.strength??1),on=k=>options[k]!==false,owned=e=>({...e,owner:'automatch'});
  if(on('wrap'))char.effects.push(owned(effect('lightwrap',{radius:.03,intensity:(target.mean[0]>.6?.7:.5)*strength})));
  if(on('fog'))char.effects.push(owned(effect('fog',{color:target.color,density:.08*strength})));
  const edgeRadius=target.edge<original.edge?clamp((1-target.edge/Math.max(.0001,original.edge))*4,1,4)/Math.min(comp.width,comp.height):0;
  if(on('edge')&&edgeRadius>0)char.effects.push(owned(effect('edgesoft',{radius:edgeRadius*strength})));
  if(on('edge')&&target.highFrequency>.002)char.effects.push(owned(effect('grain',{intensity:Math.min(.015,target.highFrequency*2)*strength,seed:42})));
  const group=layer('group','背景合わせ',{clipTo:char.id,params:{baseLayer:char.id,owner:'automatch'}});
  comp.layers.splice(comp.layers.indexOf(char)+1,0,group);
  if(on('ambient'))group.children.push(layer('solid','環境色',{blend:'color',opacity:.25*strength,params:{color:target.color}}));
  const ambient=measure(renderer,comp,'char');
  if(on('stats'))group.children.push(layer('adjust','統計マッチ',{params:{kind:'stats',...effect('stats',{strength:(options.statsStrength??.6)*strength,sourceMean:ambient.mean,sourceStd:ambient.std,targetMean:target.mean,targetStd:target.std}).params}}));
  const matched=measure(renderer,comp,'char');
  // Flat cel paint and textured scenery have different percentile distributions.
  // Keep the editable strength below the point where the mean overshoots.
  const rangeMean=(matched.mean[0]-matched.p1)/Math.max(1e-5,matched.p99-matched.p1)*(target.p99-target.p1)+target.p1;
  let rangeStrength=.5*strength;
  const delta=rangeMean-matched.mean[0],towards=target.mean[0]-matched.mean[0];
  if(delta*towards>0&&Math.abs(delta*rangeStrength)>Math.abs(towards))rangeStrength=.85*Math.abs(towards/delta);
  if(on('range'))group.children.push(layer('adjust','明暗の範囲',{params:{kind:'range',...effect('range',{strength:rangeStrength,sourceLow:matched.p1,sourceHigh:matched.p99,targetLow:target.p1,targetHigh:target.p99}).params}}));
  if(on('direction')&&Math.abs(target.leftL-target.rightL)>.08)group.children.push(layer('gradient','光の方向',{blend:'multiply',opacity:.25*strength,params:{kind:'linear',color:[0,0,0],angle:target.leftL>target.rightL?180:0,start:0,end:1,feather:1,alphaStart:1,alphaEnd:0}}));
  if(options.whitePara)group.children.push(layer('gradient','光側の白パラ',{blend:'screen',opacity:.12*strength,params:{kind:'linear',color:target.brightColor,angle:target.leftL>target.rightL?0:180,start:0,end:1,feather:1,alphaStart:1,alphaEnd:0}}));
  const after=measure(renderer,comp,'char');
  return {region:options.region==='whole'?'背景全体':'キャラの背後',before:original,after,target,whole,distanceBefore:distance(original.mean,target.mean),distanceAfter:distance(after.mean,target.mean),
    decisions:{strength,ambient:on('ambient')?.25*strength:0,stats:on('stats')?(options.statsStrength??.6)*strength:0,range:on('range')?rangeStrength:0,wrap:on('wrap'),fog:on('fog')?.08*strength:0,edgeRadius,grain:on('edge')?Math.min(.015,target.highFrequency*2)*strength:0},groupId:group.id};
}
export function reportText(report) {
  if(!report)return 'まだオートマッチを実行していません。';
  const f=x=>x.toFixed(4),vec=a=>a.map(f).join(' / ');
  return ['背景合わせの測定レポート','対象: '+report.region,
    'Oklab 平均（L / a / b）','背景: '+vec(report.target.mean),'キャラ 前: '+vec(report.before.mean),'キャラ 後: '+vec(report.after.mean),
    '平均距離: '+f(report.distanceBefore)+' → '+f(report.distanceAfter),
    '距離の減少: '+(100*(1-report.distanceAfter/Math.max(.000001,report.distanceBefore))).toFixed(1)+'%',
    'L p1 / p50 / p99:','背景: '+vec([report.target.p1,report.target.p50,report.target.p99]),
    'キャラ 前: '+vec([report.before.p1,report.before.p50,report.before.p99]),'キャラ 後: '+vec([report.after.p1,report.after.p50,report.after.p99]),
    '標準偏差 Lab: 背景 '+vec(report.target.std)+' / キャラ '+vec(report.before.std),
    '背景の高周波 std: '+f(report.target.highFrequency),'背景のエッジ勾配 std: '+f(report.target.edge),
    '決めた値: 環境色 '+f(report.decisions.ambient)+' / 統計 '+f(report.decisions.stats)+' / 明暗 '+f(report.decisions.range),
    '空気感 '+f(report.decisions.fog)+' / エッジ半径（短辺比） '+f(report.decisions.edgeRadius)+' / 粒子 '+f(report.decisions.grain),
    '明暗は0.5を上限に、平均が目標を通り越さない強さへ制限。粒子は背景の模様との混同を抑えるため0.015を上限にします。',
    '各段はレイヤーとキャラの効果から変更できます。これは測定時点の値です。'].join('\n');
}
