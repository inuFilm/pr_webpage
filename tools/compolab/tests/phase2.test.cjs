const test=require('node:test'),assert=require('node:assert/strict');
const modules=Promise.all([import('../js/lut.js'),import('../js/effects.js'),import('../js/comp.js')]);
const cube=(size,invert=false)=>{let s='TITLE "fixture"\nLUT_3D_SIZE '+size+'\n';for(let b=0;b<size;b++)for(let g=0;g<size;g++)for(let r=0;r<size;r++)s+=[r,g,b].map(x=>invert?1-x/(size-1):x/(size-1)).join(' ')+'\n';return s;};
test('cube 17/33 axes, domain and malformed input',async()=>{
 const [{parseCube}]=await modules;for(const size of [17,33]){const v=parseCube(cube(size));assert.equal(v.data.length,size**3*3);assert.deepEqual(v.data.slice(3,6),[1/(size-1),0,0]);}
 for(const s of ['LUT_3D_SIZE 16','LUT_3D_SIZE 17\n0 0 0','LUT_1D_SIZE 17','LUT_3D_SIZE 17\nNaN 0 0',cube(17)+'DOMAIN_MIN 1 0 0\nDOMAIN_MAX 0 1 1'])assert.throws(()=>parseCube(s));
});
test('curve monotonicity and LUT survive scene validation without URLs',async()=>{
 const [{curveTable,parseCube},{effect},{scene,validateScene}]=await modules;
 const values=curveTable([0,.3,.2,.9,1]);assert.equal(values.length,256);assert.ok(values.every((v,i)=>i===0||v>=values[i-1]));
 const c=scene();c.postEffects=[effect('curve',{points:[0,.3,.2,.9,1]}),effect('lut',{table:parseCube(cube(17,true)),placement:'output'}),effect('tlight',{source:'mask:character'})];
 assert.deepEqual(validateScene(c).postEffects,c.postEffects);assert.equal(effect('tlight',{source:'https://bad.invalid'}).params.source,'alpha-inverse');
});
module.exports={cube};
