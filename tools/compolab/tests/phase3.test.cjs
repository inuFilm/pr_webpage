const test=require('node:test'),assert=require('node:assert/strict');
test('3D scene validation preserves bounded lights, passes, camera and ID mask',async()=>{
 const {scene,layer,validateScene,duplicateLayer}=await import('../js/comp.js'),{modelParams,lightsFromStats}=await import('../js/model3d.js');
 const c=scene();c.layers[1]=layer('render3d','3D',{id:'character',role:'char',params:modelParams({camera:{ortho:true},passes:{depth:true,normal:true,id:true}})});c.layers.push(layer('adjust','hair',{clipTo:'character',mask:{source:'id:2'},params:{kind:'colorgrade',hue:60}}));
 const v=validateScene(c);assert.equal(v.layers[1].params.camera.ortho,true);assert.equal(v.layers[2].mask.source,'id:2');duplicateLayer(v,'character');assert.equal(validateScene(v).layers.filter(l=>l.type==='render3d').length,2);
 c.layers[1].params.src='https://bad.invalid/model.vrm';assert.throws(()=>validateScene(c));
 const s={top:[.1,.2,.3],bottom:[.2,.3,.4],brightColor:[1,.8,.6],brightPos:[.1,.2],color:[.2,.4,.6],mean:[.5,0,0]},lights=lightsFromStats(s);assert.deepEqual(lights.hemi.sky,s.top);assert.deepEqual(lights.hemi.ground,s.bottom);assert.deepEqual(lights.fill.color,s.color.map(x=>x*.3));assert.ok(lights.key.dir[0]<0&&lights.key.dir[1]>0);
});
