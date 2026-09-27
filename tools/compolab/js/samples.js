export const BACKGROUNDS={day:'昼の草原',sunset:'夕焼けの街',night:'夜の部屋',rain:'曇りの雨'};
export async function loadSamples(renderer) {
  const sources=[['sample:char','sample_char'],...Object.keys(BACKGROUNDS).map(k=>['sample:bg:'+k,k])];
  await Promise.all(sources.map(async([key,file])=>{
    const response=await fetch(new URL('../assets/'+file+'.png',import.meta.url));
    if(!response.ok)throw new Error('サンプル画像を読み込めません: '+file);
    await renderer.upload(key,await response.blob());
  }));
}
