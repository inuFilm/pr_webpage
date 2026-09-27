const {test}=require('node:test'),assert=require('node:assert/strict');
test('layers, grouping, duplication, references and serialization',async()=>{
  const m=await import('../js/comp.js'),c=m.scene(),l=m.layer('solid','色',{params:{color:[1,0,0]},clipTo:'character'});c.layers.push(l);
  const dup=m.duplicateLayer(c,l.id);assert.notEqual(dup.id,l.id);m.moveLayer(c,dup.id,'background');assert.equal(dup.clipTo,null);
  const g=m.layer('group','G',{children:[m.layer('solid','子',{params:{color:[0,0,0]}})]});c.layers.push(g);assert.equal(m.moveLayer(c,g.id,g.children[0].id,true),false);
  const decoded=m.validateScene(JSON.parse(JSON.stringify(c)));assert.equal(decoded.layers.length,c.layers.length);assert.equal(decoded.layers.at(-1).children.length,1);
  m.removeLayer(c,'character');assert.equal(l.clipTo,null);
});
test('slider history is one transaction, redo and 100 snapshot bound',async()=>{
  const {scene,History}=await import('../js/comp.js'),h=new History();let c=scene();h.begin(c);for(let i=0;i<20;i++){h.begin(c);c.layers[1].opacity=i/20;}h.commit(c);assert.equal(h.past.length,1);
  c=h.undo(c);assert.equal(c.layers[1].opacity,1);c=h.redo(c);assert.equal(c.layers[1].opacity,.95);
  for(let i=0;i<110;i++){h.begin(c);c.name=String(i);h.commit(c);}assert.equal(h.past.length,100);
});
test('untrusted JSON rejects remote URLs, unknown effects and deep/duplicate trees',async()=>{
  const m=await import('../js/comp.js');let c=m.scene();c.layers[0].params.src='https://example.com/private.png';assert.throws(()=>m.validateScene(c),/端末内/);
  c=m.scene();c.layers[0].effects=[{type:'__proto__'}];assert.throws(()=>m.validateScene(c),/未対応/);
  c=m.scene();c.layers[1].id=c.layers[0].id;assert.throws(()=>m.validateScene(c),/重複/);
  c=m.scene();let root=m.layer('group');c.layers=[root];for(let i=0;i<10;i++){const child=m.layer('group');root.children=[child];root=child;}assert.throws(()=>m.validateScene(c),/8段/);
  assert.deepEqual(m.settings({resolution:-1,space:'x',panel:'other',checker:3}),{resolution:1024,space:'linear',panel:'layers',checker:true});
  c=m.scene();c.width=NaN;c.layers[1].opacity=4;c.layers[1].transform.scale=0;const clean=m.validateScene(c);assert.equal(clean.width,1920);assert.equal(clean.layers[1].opacity,1);assert.equal(clean.layers[1].transform.scale,.01);
});
test('character and match group remain paired on move, duplicate, group and delete',async()=>{
  const m=await import('../js/comp.js'),c=m.scene(),char=c.layers[1];
  const match=m.layer('group','背景合わせ',{clipTo:char.id,params:{baseLayer:char.id,owner:'automatch'},children:[m.layer('solid','環境色',{params:{color:[.5,.2,.1]}})]});
  c.layers.push(match,m.layer('solid','前景',{params:{color:[0,0,0]}}));
  const next=m.duplicateLayer(c,match.id),i=c.layers.indexOf(next);
  assert.equal(c.layers[i+1].params.baseLayer,next.id);assert.equal(c.layers[i+1].clipTo,next.id);
  assert.equal(m.moveLayer(c,next.id,c.layers.at(-1).id),true);assert.equal(c.layers.at(-1).params.baseLayer,next.id);
  assert.equal(m.moveLayer(c,char.id,match.id,true),false);
  const group=m.groupLayer(c,char.id);assert.equal(group.children[0].id,char.id);assert.equal(group.children[1].id,match.id);
  m.removeLayer(c,next.id);assert.ok(!m.flatLayers(c).some(x=>x.layer.params.baseLayer===next.id));
});
