// Maintainer command: regenerate teaching scenes from the checked-in samples.
const {launch,instrument,root}=require('./helpers.cjs');
const fs=require('node:fs'),path=require('node:path');
(async()=>{const env=await launch();try{
  const page=await env.browser.newPage();await instrument(page);await page.goto(env.origin+'/tools/compolab/');await page.waitForSelector('body[data-ready=true]',{timeout:90000});
  const presets=await page.evaluate(async()=>{
    const {scene,layer}=await import('/tools/compolab/js/comp.js'),{effect}=await import('/tools/compolab/js/effects.js'),{autoMatch}=await import('/tools/compolab/js/match.js'),{LESSONS}=await import('/tools/compolab/js/lessons.js');
    const no={ambient:false,stats:false,range:false,wrap:false,fog:false,edge:false,direction:false};
    return LESSONS.map(l=>{
      const c=scene(l.id==='range'?'night':'sunset');c.name=l.title;
      if(['alpha','linear'].includes(l.id)){c.layers=[layer('solid','黒',{id:'background',role:'bg',params:{color:[0,0,0]}}),layer('solid','白50%',{id:'character',role:'char',opacity:.5,params:{color:[1,1,1]},mask:{source:'rect',rect:[.15,.1,.85,.9],invert:false,feather:0}})];}
      else if(l.id==='blend')c.layers.push(layer('solid','暖色の重ね',{blend:'color',opacity:.4,clipTo:'character',params:{color:[.65,.24,.09]}}));
      else if(l.id==='pipeline')c.layers.push(layer('gradient','前景の影',{role:'book',blend:'multiply',opacity:.4,params:{kind:'linear',color:[0,0,0],angle:-90,start:0,end:.3,feather:1,alphaStart:1,alphaEnd:0}}));
      else if(l.id==='ambient')autoMatch(__lab.renderer,c,{...no,ambient:true});
      else if(l.id==='stats')autoMatch(__lab.renderer,c,{...no,stats:true});
      else if(l.id==='range')autoMatch(__lab.renderer,c,{...no,range:true});
      else if(l.id==='wrap-fog')autoMatch(__lab.renderer,c,{...no,wrap:true,fog:true});
      else if(l.id==='edge-grain')autoMatch(__lab.renderer,c,{...no,edge:true});
      else if(l.id==='direction')c.layers.push(layer('gradient','右側の黒パラ',{blend:'multiply',clipTo:'character',opacity:.35,params:{kind:'linear',color:[0,0,0],angle:180,start:0,end:1,feather:1,alphaStart:1,alphaEnd:0}}));
      else if(['automatch','why-float','scopes'].includes(l.id))autoMatch(__lab.renderer,c);
      return [l.id,c];
    });
  });
  const dir=path.join(root,'tools/compolab/presets');fs.mkdirSync(dir,{recursive:true});
  for(const [id,c] of presets)fs.writeFileSync(path.join(dir,'lesson-'+id+'.json'),JSON.stringify(c,null,2)+'\n');
  console.log('Saved '+presets.length+' teaching presets.');
}finally{await env.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
