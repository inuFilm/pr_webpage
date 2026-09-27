const {launch,instrument,root}=require('./helpers.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {PNG}=require('pngjs');
const near=(a,b,t=1)=>assert.ok(Math.abs(a-b)<=t, a+' != '+b+' (±'+t+')');
const png=(width,height,fn)=>{const im=new PNG({width,height});for(let y=0;y<height;y++)for(let x=0;x<width;x++)im.data.set(fn(x,y),(y*width+x)*4);return PNG.sync.write(im);};
const artifacts=process.env.COMPOLAB_SCREENSHOTS||path.resolve(root,'../../outputs/compolab-validation');
fs.mkdirSync(artifacts,{recursive:true});
const evidence={},errors=[],external=[];
async function screenshot(page,name){await page.screenshot({path:path.join(artifacts,name+'.png'),fullPage:true});}
async function pixels(page,comp,opts={}){return page.evaluate(({comp,opts})=>{const p=__lab.renderer.read(comp,opts);return {...p,data:Array.from(p.data)};},{comp,opts});}
async function make(page,kind,options={}){
  return page.evaluate(async({kind,options})=>{
    const {scene,layer}=await import('/tools/compolab/js/comp.js'),{effect}=await import('/tools/compolab/js/effects.js');
    const c=scene();c.width=options.width||65;c.height=options.height||65;
    const solid=(name,color,extra={})=>layer('solid',name,{params:{color},...extra});
    c.layers=[solid('背景',options.bg||[0,0,0],{id:'bg',role:'bg'}),solid('キャラ',options.color||[1,1,1],{id:'char',role:'char',opacity:options.opacity??1})];
    const char=c.layers[1];
    if(kind==='alpha')char.mask={source:'rect',rect:[.1,.1,.9,.9],feather:0,invert:false};
    if(kind==='blend'){char.blend=options.mode;c.space=options.space||'linear';}
    if(kind==='para')c.layers[1]=layer('gradient','黒パラ',{blend:'multiply',opacity:.5,params:{kind:'linear',color:[0,0,0],angle:90,start:0,end:1,feather:0,alphaStart:1,alphaEnd:0}});
    if(kind==='glow'){
      char.params.color=[10,10,10];char.mask={source:'rect',rect:[32/65,32/65,33/65,33/65],invert:false,feather:0};
      c.layers=[layer('group','発光',{children:c.layers,effects:[effect('glow',{threshold:.8,knee:.5,radius:.15,intensity:1})]})];
    }
    if(kind==='wrap'){
      c.layers[0].params.color=[1,1,1];char.params.color=[0,0,0];char.mask={source:'rect',rect:[.2,.2,.8,.8],invert:false,feather:0};
      c.layers[1]=layer('group','輪郭',{role:'char',children:[char],effects:[effect('lightwrap',{radius:.08,intensity:.7})]});
    }
    if(kind==='grain'){c.layers=c.layers.slice(0,1);c.layers[0].params.color=[.3,.3,.3];c.postEffects=[effect('grain',{intensity:.06,size:1,seed:42})];}
    return c;
  },{kind,options});
}
(async()=>{
  const env=await launch();
  try{
    const context=await env.browser.newContext({viewport:{width:1280,height:900},acceptDownloads:true}),page=await context.newPage();
    await instrument(page);
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    page.on('request',req=>{if(!req.url().startsWith(env.origin+'/')&&!req.url().startsWith('blob:')&&!req.url().startsWith('data:'))external.push(req.url());});
    await page.goto(env.origin+'/tools/compolab/');await page.waitForSelector('body[data-ready=true]',{timeout:90000});
    await screenshot(page,'initial');
    evidence.hdr=await page.evaluate(()=>__lab.renderer.hdr);assert.equal(evidence.hdr,true);
    // Fixed generated samples: source pixel goldens, plus actual GPU upload/transfer.
    const goldens=JSON.parse(fs.readFileSync(path.join(__dirname,'samples.json'),'utf8'));
    for(const [name,g] of Object.entries(goldens)){
      const bytes=fs.readFileSync(path.join(root,'tools/compolab/assets',name+'.png'));
      assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),g.sha256);
      const c=await page.evaluate(async({name,g})=>{const {scene,layer}=await import('/tools/compolab/js/comp.js');const c=scene();c.width=g.width;c.height=g.height;c.layers=[layer('image','背景',{role:'bg',params:{src:'sample:bg:'+name}})];return c;},{name,g});
      const result=await page.evaluate(({c,g})=>{const p=__lab.renderer.read(c,{maxSize:4096});return g.pixels.map(v=>[...p.data.slice((v.y*g.width+v.x)*4,(v.y*g.width+v.x)*4+4)]);},{c,g});
      g.pixels.forEach((p,i)=>p.rgba.forEach((v,k)=>near(result[i][k],v,1)));
    }
    evidence.samples='4 assets × 3 fixed pixels ±1; SHA256 pinned';console.log('samples PASS');
    // Alpha and all sixteen blends compare CPU and GPU, including HDR add.
    const alpha=await make(page,'alpha',{opacity:.5});let out=await pixels(page,alpha);
    near(out.data[(32*65+32)*4],188);alpha.space='gamma';out=await pixels(page,alpha);near(out.data[(32*65+32)*4],128);evidence.alpha={linear:188,gamma:out.data[(32*65+32)*4]};
    const cmod=await import('../js/color.js');
    const blendEvidence={};
    for(const mode of Object.keys(cmod.BLENDS)){
      const b=[.12,.45,.68],s=[.8,.3,.15],c=await make(page,'blend',{width:1,height:1,bg:b,color:s,mode});
      const result=await pixels(page,c,{raw:true,scale:.5}),expected=cmod.blend(mode,b,s).map(v=>Math.round(cmod.clamp(v*.5)*255));
      expected.forEach((v,k)=>near(result.data[k],v,1));blendEvidence[mode]=result.data.slice(0,3);
    }
    for(const [mode,b,s,expected] of [['multiply',.5,.5,.25],['screen',.5,.5,.75],['overlay',.25,.5,.25],['overlay',.75,.5,.75],['softlight',.5,.5,.5],['softlight',.25,1,.5],['colordodge',.5,.5,1],['colorburn',.5,.5,0],['hardlight',.5,.25,.25],['hardlight',.5,.75,.75],['difference',.3,.8,.5],['add',.7,.7,1.4]]){
      const c=await make(page,'blend',{width:1,height:1,bg:[b,b,b],color:[s,s,s],mode}),p=await pixels(page,c,{raw:true,scale:.5});near(p.data[0]/255*2,expected,1/255);
    }
    evidence.blends=blendEvidence;console.log('alpha + 16 blends PASS');
    // Input PNG and straight-alpha PNG export bypass canvas conversion.
    const red=png(32,32,(x,y)=>x>=8&&x<24&&y>=8&&y<24?[255,0,0,64]:[255,0,0,0]);
    const redArray=[...red];
    const redComp=await page.evaluate(async bytes=>{
      const {scene,layer}=await import('/tools/compolab/js/comp.js');await __lab.renderer.upload('user:red.png',new Blob([new Uint8Array(bytes)],{type:'image/png'}));const c=scene();c.width=c.height=32;c.layers=[layer('image','赤',{id:'red',role:'char',params:{src:'user:red.png'}})];return c;
    },redArray);
    out=await pixels(page,redComp,{maxSize:32,role:'char'});assert.deepEqual(out.data.slice((16*32+16)*4,(16*32+16)*4+4),[255,0,0,64]);assert.equal(out.data[3],0);
    await page.evaluate(c=>__lab.set(c),redComp);
    const redDownloadPromise=page.waitForEvent('download');await page.evaluate(()=>__lab.exportFile('char'));const redDownload=await redDownloadPromise;
    const redPath=path.join(artifacts,'alpha-character.png');await redDownload.saveAs(redPath);const redResult=PNG.sync.read(fs.readFileSync(redPath));
    assert.deepEqual([...redResult.data.slice((16*32+16)*4,(16*32+16)*4+4)],[255,0,0,64]);assert.equal(redResult.data[3],0);
    evidence.premultiplied='red RGB 255/0/0, alpha64; transparent alpha0 through PNG upload/export';
    // Processed character export includes manual clipping, excludes other artwork.
    const clippedComp=await page.evaluate(async()=>{
      const {scene,layer}=await import('/tools/compolab/js/comp.js');const c=scene();c.width=c.height=32;
      c.layers=[layer('solid','背景',{role:'bg',params:{color:[0,1,0]}}),
        layer('solid','キャラ',{id:'clip-char',role:'char',params:{color:[1,0,0]},mask:{source:'rect',rect:[.25,.25,.75,.75]}}),
        layer('solid','手動の色',{clipTo:'clip-char',opacity:.5,params:{color:[0,0,1]}}),
        layer('solid','前景',{role:'book',params:{color:[1,1,1]}})];return c;
    });
    const clipped=await pixels(page,clippedComp,{maxSize:32,role:'char'});
    assert.deepEqual(clipped.data.slice((16*32+16)*4,(16*32+16)*4+4),[188,0,188,255]);assert.equal(clipped.data[3],0);
    await page.evaluate(c=>__lab.set(c),clippedComp);
    const clippedDownloadPromise=page.waitForEvent('download');await page.evaluate(()=>__lab.exportFile('char'));const clippedDownload=await clippedDownloadPromise;
    const clippedPath=path.join(artifacts,'clipped-character.png');await clippedDownload.saveAs(clippedPath);
    assert.deepEqual([...PNG.sync.read(fs.readFileSync(clippedPath)).data],clipped.data);
    evidence.characterClipping='manual clipping color retained in transparent PNG; unrelated foreground/background excluded';
    // Spatial effects.
    const glow=await pixels(page,await make(page,'glow'),{raw:true});
    const radial=Array.from({length:12},(_,i)=>glow.data[(32*65+32+i)*4]);assert.ok(radial.every((v,i)=>i===0||v<=radial[i-1]+1));assert.ok(radial[5]>0);evidence.glow=radial;
    const wrap=await pixels(page,await make(page,'wrap'),{raw:true});const edge=wrap.data[(32*65+14)*4],center=wrap.data[(32*65+32)*4];assert.ok(edge>0);assert.equal(center,0);evidence.lightwrap={edge,center};
    const para=await pixels(page,await make(page,'para',{bg:[.6,.6,.6]}),{raw:true});const top=para.data[(0*65+32)*4],mid=para.data[(32*65+32)*4],bottom=para.data[(64*65+32)*4];near(top/bottom,.5,.015);assert.ok(mid>top&&mid<bottom);evidence.para={top,mid,bottom};
    const grainScene=await make(page,'grain',{width:256,height:256}),grain=await pixels(page,grainScene,{raw:true}),grain2=await pixels(page,grainScene,{raw:true});assert.deepEqual(grain.data,grain2.data);
    const values=grain.data.filter((_,i)=>i%4===0).map(v=>v/255),mean=values.reduce((a,b)=>a+b)/values.length,std=Math.sqrt(values.reduce((s,v)=>s+(v-mean)**2,0)/values.length);
    near(mean,.3,.5/255);near(std,.06*.8/Math.sqrt(12),.001);evidence.grain={mean,std,expectedStd:.06*.8/Math.sqrt(12)};
    console.log('PNG alpha + spatial effects PASS');
    // Auto match endpoints, reentrancy, one-step Undo on actual UI.
    await page.selectOption('#sample','sunset');await page.click('#scope-snapshot');const initialComp=await page.evaluate(()=>JSON.parse(JSON.stringify(__lab.comp)));
    const baseline=await page.evaluate(async()=>{const {measure}=await import('/tools/compolab/js/match.js');return measure(__lab.renderer,__lab.comp,'char').mean;});
    await page.click('#auto-match');const first=await page.evaluate(()=>__lab.report);assert.ok(first.distanceAfter<=first.distanceBefore*.6,JSON.stringify(first));evidence.automatch={before:first.distanceBefore,after:first.distanceAfter,reduction:1-first.distanceAfter/first.distanceBefore,rangeStrength:first.decisions.range};
    await page.click('#ab-toggle');await screenshot(page,'automatch-ab');
    await page.click('#auto-match');assert.equal(await page.evaluate(()=>__lab.comp.layers.filter(l=>l.params.owner==='automatch').length),1);
    await page.click('#undo');await page.click('#undo');const undone=await page.evaluate(async()=>{const {measure}=await import('/tools/compolab/js/match.js');return measure(__lab.renderer,__lab.comp,'char').mean;});baseline.forEach((v,i)=>near(undone[i],v,1e-6));
    const full=await page.evaluate(async()=>{
      const {scene}=await import('/tools/compolab/js/comp.js'),{autoMatch}=await import('/tools/compolab/js/match.js');
      return autoMatch(__lab.renderer,scene(),{statsStrength:1,ambient:false,range:false,wrap:false,fog:false,edge:false,direction:false}).distanceAfter;
    });assert.ok(full<.01);evidence.fullStatisticsDistance=full;
    console.log('automatch + Undo PASS',evidence.automatch);
    // Groups, alpha clipping, inverted/feathered masks, effect ordering and resize.
    const structure=await page.evaluate(async()=>{
      const {scene,layer}=await import('/tools/compolab/js/comp.js'),{effect}=await import('/tools/compolab/js/effects.js');
      const c=scene();c.width=c.height=64;
      c.layers=[layer('solid','黒',{params:{color:[0,0,0]}}),layer('solid','範囲',{id:'mask',params:{color:[0,0,0]},mask:{source:'rect',rect:[.25,.25,.75,.75],invert:false,feather:0}}),layer('solid','赤',{params:{color:[1,0,0]},clipTo:'mask'})];
      const r=__lab.renderer.read(c,{raw:true});const p=(x,y)=>[...r.data.slice((y*64+x)*4,(y*64+x)*4+4)];
      const clipping={outside:p(2,2),inside:p(32,32)};
      c.layers[2].clipTo=null;c.layers[2].mask={source:'alpha:mask',invert:true,feather:.03};const m=__lab.renderer.read(c,{raw:true});
      const masking={outside:[...m.data.slice((2*64+2)*4,(2*64+2)*4+4)],inside:[...m.data.slice((32*64+32)*4,(32*64+32)*4+4)]};
      const white=layer('solid','白',{params:{color:[1,1,1]}}),adjust=layer('adjust','露出',{params:{kind:'colorgrade',...effect('colorgrade',{exposure:-1}).params}});
      c.layers=[layer('group','G',{children:[white,adjust]})];const g=__lab.renderer.read(c,{raw:true});
      return {clipping,masking,group:g.data[0],error:__lab.renderer.gl.getError()};
    });assert.deepEqual(structure.clipping.outside,[0,0,0,255]);assert.deepEqual(structure.clipping.inside,[255,0,0,255]);assert.deepEqual(structure.masking.outside,[255,0,0,255]);assert.deepEqual(structure.masking.inside,[0,0,0,255]);near(structure.group,128);assert.equal(structure.error,0);
    // Every implemented effect has a responsive GPU path and finite readback.
    const effects=await page.evaluate(async()=>{
      const {scene}=await import('/tools/compolab/js/comp.js'),{effect,EFFECTS}=await import('/tools/compolab/js/effects.js');
      const c=scene();const r=__lab.renderer,base=r.read(c,{maxSize:128}),results={};
      for(const type of Object.keys(EFFECTS)){
        const e=effect(type);if(type==='colorgrade')e.params.exposure=-1;if(type==='stats')e.params.targetMean=[.4,.1,.02];if(type==='range')e.params.targetHigh=.5;
        c.layers[1].effects=[e];const p=r.read(c,{maxSize:128});results[type]=p.data.reduce((sum,v,i)=>sum+(v!==base.data[i]),0);
      }
      return results;
    });for(const [name,count] of Object.entries(effects))assert.ok(count>0,name+' is unresponsive');evidence.effects=effects;
    console.log('mask + groups + all effect paths PASS');
    // Full-size PNG equals direct RGBA8 render, and character alpha stays clean.
    await page.evaluate(c=>__lab.set(c),initialComp);await page.click('#auto-match');
    const ref=await page.evaluate(async()=>{const p=__lab.renderer.read(__lab.comp,{maxSize:4096,transparent:false});return {width:p.width,height:p.height,hash:[...new Uint8Array(await crypto.subtle.digest('SHA-256',p.data))].map(v=>v.toString(16).padStart(2,'0')).join('')};});
    const dlPromise=page.waitForEvent('download');await page.evaluate(()=>__lab.exportFile('composite'));const dl=await dlPromise;const exported=path.join(artifacts,'composite.png');await dl.saveAs(exported);
    const decoded=PNG.sync.read(fs.readFileSync(exported));assert.equal(decoded.width,1920);assert.equal(decoded.height,1080);
    assert.equal(crypto.createHash('sha256').update(decoded.data).digest('hex'),ref.hash);evidence.export={width:decoded.width,height:decoded.height,maxPixelError:0};console.log('1920x1080 export exact PASS');
    // Sliders: continuous drag forms one Undo step, and editing text keeps native keys.
    await page.locator('[data-layer-id="character"] .select-layer').click();
    const beforeHistory=await page.evaluate(()=>__lab.history.past.length);
    const opacity=page.getByRole('slider',{name:'不透明度',exact:true});await opacity.evaluate(el=>{for(const v of [.8,.7,.6]){el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));}el.dispatchEvent(new Event('change',{bubbles:true}));});
    assert.equal(await page.evaluate(()=>__lab.history.past.length),beforeHistory+1);
    await page.keyboard.press('Tab');await page.locator('#viewport').focus();await page.keyboard.press('Control+z');near(await opacity.inputValue(),1,0);
    // Persist full scene and lesson progress; every link, preset and quiz works.
    const saved=await page.evaluate(async()=>{const {validateScene}=await import('/tools/compolab/js/comp.js');return validateScene(__lab.comp);});
    const priorPixels=await page.evaluate(()=>[...__lab.renderer.read(__lab.comp,{maxSize:128}).data]);
    await page.reload();await page.waitForSelector('body[data-ready=true]');
    assert.deepEqual(await page.evaluate(()=>__lab.comp),saved);
    assert.deepEqual(await page.evaluate(()=>[...__lab.renderer.read(__lab.comp,{maxSize:128}).data]),priorPixels);
    await page.goto(env.origin+'/tools/compolab/#compolab-alpha');await page.waitForSelector('body[data-ready=true]');
    await page.locator('.lesson.active .done input').check();await page.reload();await page.waitForSelector('body[data-ready=true]');assert.ok(await page.locator('.lesson.active .done input').isChecked());
    const ids=await page.locator('.lesson').evaluateAll(items=>items.map(i=>i.dataset.lessonId));
    assert.equal(ids.length,14);
    for(const id of ids){
      await page.evaluate(id=>location.hash=id,id);await page.waitForSelector('#'+id+'.active');
      await page.locator('.lesson.active .opt').first().click();assert.ok((await page.locator('.lesson.active .fb').textContent()).length>15);
      await page.locator('.lesson.active .try-lab').click();await page.waitForFunction(()=>!document.querySelector('#lab').hidden);
      await page.waitForTimeout(60);assert.ok(!(await page.locator('#status').textContent()).includes('読み込めません'));
      await screenshot(page,'lesson-'+id.replace('compolab-',''));
    }
    await page.evaluate(()=>location.hash='compolab-automatch');await page.click('#book-tab');await page.waitForSelector('#compolab-automatch.active');await screenshot(page,'textbook');
    await page.click('#lab-tab');
    for(const bg of ['day','sunset','night','rain']){
      await page.selectOption('#sample',bg);await page.click('#auto-match');await screenshot(page,'sample-'+bg);
    }
    for(const kind of ['histogram','waveform','vector']){await page.click('[data-scope="'+kind+'"]');await screenshot(page,'scope-'+kind);}
    for(const width of [375,768,1280]){
      await page.setViewportSize({width,height:900});for(const panel of ['layers','properties','scopes']){if(width<900)await page.click('[data-panel="'+panel+'"]');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'overflow '+width+'/'+panel);}
      await page.waitForFunction(()=>{const c=document.querySelector('#scope'),b=c.getBoundingClientRect();return Math.abs(c.width-b.width)<1&&Math.abs(c.height-b.height)<1;});
      await screenshot(page,'layout-'+width);
    }
    // User workflows: local files, same-name replacement with Undo, drag/drop,
    // source-alpha warning, and mobile alternatives to modifier-key actions.
    await page.setViewportSize({width:1280,height:900});
    await page.selectOption('#sample','sunset');
    await page.locator('#file-bg').setInputFiles({name:'background.png',mimeType:'image/png',buffer:png(96,64,()=>[20,45,80,255])});
    await page.waitForFunction(()=>__lab.comp.width===96&&__lab.comp.height===64);
    await page.locator('#file-char').setInputFiles({name:'character.png',mimeType:'image/png',buffer:red});
    await page.waitForFunction(()=>__lab.comp.layers.find(l=>l.role==='char').params.src==='user:character.png');
    const beforeReplacement=await page.evaluate(()=>[...__lab.renderer.read(__lab.comp,{role:'char',maxSize:96}).data]);
    await page.locator('#file-char').setInputFiles({name:'character.png',mimeType:'image/png',buffer:png(32,32,()=>[0,0,255,255])});
    await page.waitForFunction(()=>__lab.comp.layers.find(l=>l.role==='char').params.src.includes('(2)'));
    assert.ok((await page.locator('#status').textContent()).includes('透明部分がありません'));
    await page.locator('#viewport').focus();await page.keyboard.press('Control+z');
    assert.deepEqual(await page.evaluate(()=>[...__lab.renderer.read(__lab.comp,{role:'char',maxSize:96}).data]),beforeReplacement);
    await page.evaluate(bytes=>{const file=new File([new Uint8Array(bytes)],'dropped.png',{type:'image/png'}),transfer=new DataTransfer();transfer.items.add(file);document.querySelector('#viewport').dispatchEvent(new DragEvent('drop',{dataTransfer:transfer,bubbles:true,cancelable:true}));},redArray);
    await page.waitForFunction(()=>__lab.comp.layers.find(l=>l.role==='char').params.src==='user:dropped.png');
    await page.click('#solo');assert.equal(await page.evaluate(()=>__lab.comp.view.solo),await page.evaluate(()=>__lab.comp.layers.find(l=>l.role==='char').id));await page.click('#solo');
    await page.click('#group');const groupedPixels=await page.evaluate(()=>[...__lab.renderer.read(__lab.comp,{role:'char',maxSize:96}).data]);assert.deepEqual(groupedPixels,beforeReplacement);
    const rows=await page.locator('#layers > .layer').count();await page.click('#duplicate');assert.ok(await page.locator('#layers > .layer').count()>rows);await page.click('#undo');
    const persisted=await page.evaluate(()=>JSON.stringify(__lab.comp));
    const jsonDownload=page.waitForEvent('download');await page.evaluate(()=>__lab.exportFile('scene'));const json=await jsonDownload;const jsonFile=path.join(artifacts,'scene.json');await json.saveAs(jsonFile);
    assert.deepEqual(JSON.parse(fs.readFileSync(jsonFile,'utf8')),JSON.parse(persisted));assert.ok(!persisted.includes('data:image'));
    await page.reload();await page.waitForSelector('body[data-ready=true]');assert.ok((await page.locator('#status').textContent()).includes('再読み込み'));
    await page.locator('#file-char').setInputFiles({name:'dropped.png',mimeType:'image/png',buffer:red});
    await page.waitForFunction(()=>__lab.renderer.assets.has('user:dropped.png'));
    assert.deepEqual(await page.evaluate(()=>[...__lab.renderer.read(__lab.comp,{role:'char',maxSize:96}).data]),beforeReplacement);
    evidence.workflows='local image import, actual source alpha warning, duplicate filenames + Undo, drop, solo, grouping, JSON export, missing-source reload';
    // Invalid JSON keeps current work and cannot trigger external image loads.
    const pre=await page.evaluate(()=>JSON.stringify(__lab.comp));
    await page.locator('#file-scene').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({version:1,layers:[{type:'image',params:{src:'https://example.org/image.png'}}]}))});
    assert.equal(await page.evaluate(()=>JSON.stringify(__lab.comp)),pre);
    await context.close();
    // Storage denied and malformed settings are independent fresh browser contexts.
    for(const blocked of [true,false]){
      const ctx=await env.browser.newContext({viewport:{width:375,height:812}});
      await ctx.addInitScript(blocked=>{if(blocked){Storage.prototype.getItem=Storage.prototype.setItem=function(){throw new DOMException('blocked','SecurityError');};}else{localStorage.setItem('compolab-settings-v1','{"resolution":-100,"panel":"bad","space":9}');localStorage.setItem('compolab-scene-v1','{"version":99}');}},blocked);
      const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(env.origin+'/tools/compolab/');await p.waitForSelector('body[data-ready=true]');await p.click('#auto-match');assert.ok((await p.locator('#layers').textContent()).includes('背景合わせ'));
      if(blocked)assert.ok(await p.locator('#storage-warning').isVisible());
      await ctx.close();
    }
    // WebGL unavailable and RGBA8 fallback must explain the limitation.
    for(const mode of ['noGL','noFloat']){
      const ctx=await env.browser.newContext();await ctx.addInitScript(mode=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){if(type==='webgl2'&&mode==='noGL')return null;const gl=original.call(this,type,...args);if(type==='webgl2'&&mode==='noFloat'&&gl){const ext=gl.getExtension.bind(gl);gl.getExtension=n=>n==='EXT_color_buffer_float'?null:ext(n);}return gl;};},mode);
      const p=await ctx.newPage();await p.goto(env.origin+'/tools/compolab/');
      if(mode==='noGL'){await p.waitForFunction(()=>document.querySelector('#status').textContent.includes('WebGL2'));assert.ok(await p.locator('#auto-match').isDisabled());}
      else{await p.waitForSelector('body[data-ready=true]');assert.ok((await p.locator('#gpu-info').textContent()).includes('HDR 不可'));}
      await ctx.close();
    }
    assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
    evidence.consoleErrors=errors.length;evidence.externalRequests=external.length;evidence.layouts=[375,768,1280];evidence.lessons=ids.length;
    fs.writeFileSync(path.join(artifacts,'results.json'),JSON.stringify(evidence,null,2)+'\n');
    console.log(JSON.stringify(evidence,null,2));console.log('Phase 1 browser acceptance PASS; screenshots: '+artifacts);
  }finally{await env.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
