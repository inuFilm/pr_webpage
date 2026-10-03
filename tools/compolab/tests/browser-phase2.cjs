const {launch,instrument,root}=require('./helpers.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const artifacts=process.env.COMPOLAB_SCREENSHOTS||path.resolve(root,'../../outputs/compolab-validation/phase2');fs.mkdirSync(artifacts,{recursive:true});
const near=(a,b,t)=>assert.ok(Math.abs(a-b)<=t,`${a} != ${b} ±${t}`);
(async()=>{const env=await launch(),errors=[],external=[];try{
 const page=await env.browser.newPage({viewport:{width:1440,height:1000}});await instrument(page);
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('request',r=>{if(!r.url().startsWith(env.origin))external.push(r.url());});
 await page.goto(env.origin+'/tools/compolab/');await page.waitForSelector('body[data-ready=true]',{timeout:90000});
 const results=await page.evaluate(async()=>{
  const {SHADERS}=await import('/tools/compolab/js/shaders.js'),{effect}=await import('/tools/compolab/js/effects.js');
  const r=__lab.renderer,gl=r.gl,c={width:257,height:257,space:'linear',output:{exposure:0,tonemap:'none'},layers:[]};
  SHADERS.probe=`uniform int u_kind;void main(){vec2 p=floor(v_uv*u_res);float v=.2,a=1.;if(u_kind==0)v=abs(p.x-192.)<.5?1.:0.;if(u_kind==1)v=length(p-vec2(220,40))<3.?1.:0.;if(u_kind==2)v=length(p-vec2(128))<.5?20.:0.;if(u_kind==3){a=step(64.,p.x)*step(p.x,192.)*step(64.,p.y)*step(p.y,192.);v=.2;}if(u_kind==4)v=mod(p.x+p.y,2.);if(u_kind==5)v=v_uv.x;outColor=vec4(vec3(v*a),a);}`;
  const source=kind=>{const t=r.run('probe',{kind},{},r.target(257,257));t.persistent=true;return t;};
  const read=(t,options={})=>{const out=r.run('output',r.outputValues(c,{raw:true,...options}),{img:t,before:t},r.target(t.width,t.height,true));const data=new Uint8Array(out.width*out.height*4);gl.readPixels(0,0,out.width,out.height,gl.RGBA,gl.UNSIGNED_BYTE,data);r.release(out);return data;};
  const apply=(t,type,params={},bg=t)=>r.effects(t,[effect(type,params)],bg,c);
  const centroid=(data,ch)=>{let x=0,y=0,sum=0;for(let j=0;j<257;j++)for(let i=0;i<257;i++){const v=data[(j*257+i)*4+ch];sum+=v;x+=i*v;y+=j*v;}return [x/sum,y/sum];};
  const out={};
  let src=source(0),base=read(src),p=read(apply(src,'ca',{intensity:2/257}));
  // Mid-row is radial horizontal: exactly two pixels each way.
  const peak=ch=>{let best=0,x=0;for(let i=160;i<225;i++){const v=p[(128*257+i)*4+ch];if(v>best){best=v;x=i;}}return x;};out.ca={red:peak(0),green:peak(1),blue:peak(2),expectedShift:2};
  src=source(1);const before=centroid(read(src),0),after=centroid(read(apply(src,'distort',{k1:-.25,k2:0})),0);out.distort={before,after,beforeRadius:Math.hypot(before[0]-128,before[1]-128),afterRadius:Math.hypot(after[0]-128,after[1]-128)};
  src=source(2);p=read(apply(src,'anamorphic',{length:.5,intensity:8,threshold:.9,color:[1,1,1]}));let xx=0,yy=0,sum=0;for(let j=0;j<257;j++)for(let i=0;i<257;i++){if(i===128&&j===128)continue;const v=p[(j*257+i)*4];sum+=v;xx+=(i-128)**2*v;yy+=(j-128)**2*v;}out.anamorphic={horizontalRMS:Math.sqrt(xx/sum),verticalRMS:Math.sqrt(yy/sum),ratio:Math.sqrt(xx/sum)/Math.max(.5,Math.sqrt(yy/sum))};
  src=source(3);base=read(src);p=read(apply(src,'tlight',{intensity:.4,spill:0,radius:.06}));let maxInside=0,maxOutside=0;for(let j=0;j<257;j++)for(let i=0;i<257;i++){const k=(j*257+i)*4;if(base[k+3]===255)maxInside=Math.max(maxInside,Math.abs(p[k]-base[k]));else maxOutside=Math.max(maxOutside,p[k]);}out.tlight={maxInside,maxOutside};
  const spill=read(apply(src,'tlight',{intensity:.4,spill:1,radius:.06}));out.tlight.spillEdge=spill[(128*257+65)*4]-base[(128*257+65)*4];
  src=source(4);base=read(src);p=read(apply(src,'dof',{radius:.03,focus:0}));const stats=a=>{let n=0,s=0,s2=0;for(let j=30;j<227;j++)for(let i=30;i<227;i++){const v=a[(j*257+i)*4]/255;n++;s+=v;s2+=v*v;}return Math.sqrt(s2/n-(s/n)**2);};out.dof={beforeStd:stats(base),afterStd:stats(p),focusEqual:read(apply(src,'dof',{radius:.03,focus:1})).every((x,i)=>x===base[i])};
  src=source(5);base=read(src);const size=17,identity=[],inverse=[];for(let b=0;b<size;b++)for(let g=0;g<size;g++)for(let r=0;r<size;r++){identity.push(r/16,g/16,b/16);inverse.push(1-r/16,1-g/16,1-b/16);}
  const table=data=>({size,data,min:[0,0,0],max:[1,1,1],title:'fixture'});
  p=read(apply(src,'lut',{table:table(identity),space:'linear'}));out.lut={identityError:p.reduce((m,x,i)=>Math.max(m,Math.abs(x-base[i])),0)};
  p=read(apply(src,'lut',{table:table(inverse),space:'linear'}));out.lut.inverseError=p.reduce((m,x,i)=>Math.max(m,i%4===3?0:Math.abs(x-(255-base[i]))),0);
  const display=read(apply(src,'lut',{table:table(identity),space:'display'}));out.lut.displayIdentityError=display.reduce((m,x,i)=>Math.max(m,Math.abs(x-base[i])),0);
  p=read(apply(src,'curve',{points:[0,.4,.65,.85,1]}));out.curve={identityError:read(apply(src,'curve')).reduce((m,x,i)=>Math.max(m,Math.abs(x-base[i])),0),middleBefore:base[(128*257+128)*4],middleAfter:p[(128*257+128)*4]};
  src=r.run('solid',{color:[2,2,2],alpha:1,space:0},{},r.target(1,1));p=read(src,{raw:false,tonemap:1});const value=p[0]/255;out.tonemap={srgbByte:p[0],linear:value<=.04045?value/12.92:((value+.055)/1.055)**2.4};
  src=source(2);base=read(src);p=read(apply(src,'halation',{radius:.07,intensity:4}));const k=(128*257+134)*4;out.halation={red:p[k],green:p[k+1],blue:p[k+2]};
  p=read(apply(src,'godrays',{x:.2,y:.2,length:.8,intensity:5}));let ray=0;for(let i=0;i<p.length;i+=4)if(base[i]===0&&p[i]>0)ray++;out.godrays={illuminatedPixels:ray};
  src=source(0);base=read(r.blur(src,.01));const blurred=r.blur(src,.01);p=read(apply(blurred,'sharpen',{radius:.01,intensity:1}));out.sharpen={beforePeak:base[(128*257+192)*4],afterPeak:p[(128*257+192)*4]};
  src=r.empty(257,257);p=read(apply(src,'flare',{x:.8,y:.2,ghosts:1,spacing:.5,halo:0,intensity:1,color:[1,1,1]}));const ghostIndex=((256-Math.round(.65*257))*257+Math.round(.35*257))*4;out.flare={ghost:p[ghostIndex],opposite:p[((256-Math.round(.35*257))*257+Math.round(.65*257))*4]};
  const {scene,layer}=await import('/tools/compolab/js/comp.js'),order=scene();order.width=order.height=16;
  order.layers=[layer('solid','linear 0.2',{params:{color:[.2,.2,.2]}})];
  order.postEffects=[effect('lut',{table:table(inverse),space:'linear'}),effect('colorgrade',{exposure:1})];
  out.lut.stackByte=r.read(order,{raw:true}).data[0];
  order.postEffects[0].params.placement='output';out.lut.outputByte=r.read(order,{raw:true}).data[0];
  order.postEffects[0].params.space='display';out.lut.displayOutputByte=r.read(order,{raw:true}).data[0];
  order.postEffects[0].enabled=false;out.lut.disabledByte=r.read(order,{raw:true}).data[0];
  out.glError=gl.getError();return out;
 });
 console.log('Measured',JSON.stringify(results));
 near(results.ca.red,194,0);near(results.ca.green,192,0);near(results.ca.blue,190,0);
 assert.ok(results.distort.afterRadius<results.distort.beforeRadius-2);assert.ok(results.anamorphic.ratio>=10);assert.equal(results.tlight.maxInside,0);assert.ok(results.tlight.maxOutside>0&&results.tlight.spillEdge>0);
 assert.ok(results.dof.afterStd<results.dof.beforeStd*.5);assert.ok(results.dof.focusEqual);assert.ok(results.lut.identityError<=1&&results.lut.inverseError<=1&&results.lut.displayIdentityError<=1);assert.ok(results.curve.identityError<=1&&results.curve.middleAfter>results.curve.middleBefore);
 near(results.lut.stackByte,255,1);near(results.lut.outputByte,.6*255,1);near(results.lut.disabledByte,.4*255,1);
 const displayInverse=1-(1.055*.4**(1/2.4)-.055);near(results.lut.displayOutputByte,((displayInverse+.055)/1.055)**2.4*255,1);
 near(results.tonemap.linear,2/3,.006);assert.ok(results.halation.red>results.halation.green&&results.halation.green>results.halation.blue);assert.ok(results.godrays.illuminatedPixels>10);assert.ok(results.sharpen.afterPeak>results.sharpen.beforePeak);assert.ok(results.flare.ghost>results.flare.opposite);assert.equal(results.glError,0);
 console.log('Phase 2 pixels PASS',JSON.stringify(results));
 // Actual layer-scoped DOF leaves isolated character pixels unchanged.
 results.dof.characterUnchanged=await page.evaluate(async()=>{const {scene}=await import('/tools/compolab/js/comp.js'),{effect}=await import('/tools/compolab/js/effects.js');const c=scene(),r=__lab.renderer,a=r.read(c,{role:'char',maxSize:256});c.layers[0].effects=[effect('dof')];const b=r.read(c,{role:'char',maxSize:256});return a.data.every((v,i)=>v===b.data[i]);});assert.ok(results.dof.characterUnchanged);
 // UI, Undo, serialized LUT reload, invalid LUT preservation.
 await page.evaluate(()=>__lab.loadPreset('film'));await page.click('#post-select');const lutFile=page.getByLabel('3D LUT .cube（17 / 33段）');
 const original=await page.evaluate(()=>JSON.stringify(__lab.comp));await lutFile.setInputFiles({name:'broken.cube',mimeType:'text/plain',buffer:Buffer.from('LUT_3D_SIZE 17\n0 0 0')});assert.equal(await page.evaluate(()=>JSON.stringify(__lab.comp)),original);
 let cube='TITLE "UI identity"\nLUT_3D_SIZE 33\n';for(let b=0;b<33;b++)for(let g=0;g<33;g++)for(let r=0;r<33;r++)cube+=[r/32,g/32,b/32].join(' ')+'\n';
 const historyBefore=await page.evaluate(()=>__lab.history.past.length);await lutFile.setInputFiles({name:'identity.cube',mimeType:'text/plain',buffer:Buffer.from(cube)});
 await page.waitForFunction(()=>__lab.comp.postEffects[0].params.table.size===33);assert.equal(await page.evaluate(()=>__lab.history.past.length),historyBefore+1);
 await page.click('#undo');assert.equal(await page.evaluate(()=>__lab.comp.postEffects[0].params.table.size),17);await page.click('#redo');assert.equal(await page.evaluate(()=>__lab.comp.postEffects[0].params.table.size),33);
 await page.getByLabel('3D LUT 適用する位置').selectOption('output');assert.equal(await page.evaluate(()=>__lab.comp.postEffects[0].params.placement),'output');
 await page.click('#undo');assert.equal(await page.evaluate(()=>__lab.comp.postEffects[0].params.placement),'stack');await page.click('#redo');
 await page.reload();await page.waitForSelector('body[data-ready=true]');assert.deepEqual(await page.evaluate(()=>__lab.comp.postEffects[0].params.table.size),33);
 assert.equal(await page.evaluate(()=>__lab.comp.postEffects[0].params.placement),'output');await page.click('#post-select');await page.screenshot({path:path.join(artifacts,'lut-output-position.png'),fullPage:true});
 for(const id of ['sunset','night','backlight','memory','horror','fresh']){
  await page.evaluate(id=>__lab.loadPreset(id,'recipe'),id);await page.click('#post-select');await page.evaluate(()=>__lab.draw());await page.screenshot({path:path.join(artifacts,'recipe-'+id+'.png'),fullPage:true});await page.locator('#view').screenshot({path:path.join(artifacts,'recipe-'+id+'-view.png')});
 }
 for(const type of ['tlight','flare','anamorphic','godrays','dof','halation','ca','distort','sharpen','curve','lut','fog']){
  await page.evaluate(async type=>{const {scene}=await import('/tools/compolab/js/comp.js'),{effect}=await import('/tools/compolab/js/effects.js'),{lessonScene}=await import('/tools/compolab/js/presets.js');let c=scene();c.name=type;if(type==='lut')c=lessonScene('film',__lab.renderer);else if(type==='curve')c.postEffects=[effect(type,{points:[0,.35,.62,.82,1]})];else if(type==='dof')c.layers[0].effects=[effect(type)];else if(type==='fog')c.layers[1].effects=[effect(type,{smoke:.8,density:.4})];else c.postEffects=[effect(type,['anamorphic','halation','godrays'].includes(type)?{threshold:.3,intensity:1}:type==='tlight'?{intensity:.25}:type==='flare'?{intensity:.8,x:.17,y:.2}:{})];__lab.set(c);__lab.draw();},type);
  await page.click('#post-select');await page.screenshot({path:path.join(artifacts,'effect-'+type+'.png'),fullPage:true});await page.locator('#view').screenshot({path:path.join(artifacts,'effect-'+type+'-view.png')});
 }
 await page.evaluate(()=>__lab.loadPreset('tonemap'));await page.evaluate(()=>__lab.draw());await page.screenshot({path:path.join(artifacts,'effect-tonemap.png'),fullPage:true});
 for(const id of ['recipes','glossary','film']){await page.evaluate(id=>location.hash='compolab-'+id,id);await page.waitForSelector('#compolab-'+id+'.active');await page.screenshot({path:path.join(artifacts,'textbook-'+id+'.png'),fullPage:true});}
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);results.consoleErrors=0;results.externalRequests=0;fs.writeFileSync(path.join(artifacts,'results.json'),JSON.stringify(results,null,2)+'\n');console.log('Phase 2 acceptance PASS: '+artifacts);
 }finally{await env.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
