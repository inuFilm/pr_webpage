// Two material regions: a top hair panel and a lower skin panel, embedded glTF.
// No third-party asset or external resource is involved.
function fixture({external=false}={}) {
 const positions=new Float32Array([-0.5,0,0, .5,0,0, .5,1,0, -.5,0,0, .5,1,0, -.5,1,0]);
 const bytes=Buffer.from(positions.buffer);
 const data={asset:{version:'2.0'},scene:0,scenes:[{nodes:[0,1]}],nodes:[{name:'Skin',mesh:0},{name:'Hair',mesh:1,translation:[0,1,0],scale:[1,.45,1]}],meshes:[{primitives:[{attributes:{POSITION:0},material:0}]},{primitives:[{attributes:{POSITION:0},material:1}]}],materials:[{name:'Skin',pbrMetallicRoughness:{baseColorFactor:[.65,.35,.2,1]},extensions:{KHR_materials_unlit:{}},doubleSided:true},{name:'Hair',pbrMetallicRoughness:{baseColorFactor:[.15,.25,.55,1]},extensions:{KHR_materials_unlit:{}},doubleSided:true}],extensionsUsed:['KHR_materials_unlit'],buffers:[{byteLength:bytes.length,uri:external?'https://example.invalid/private.bin':'data:application/octet-stream;base64,'+bytes.toString('base64')}],bufferViews:[{buffer:0,byteOffset:0,byteLength:bytes.length}],accessors:[{bufferView:0,componentType:5126,count:6,type:'VEC3',min:[-.5,0,0],max:[.5,1,0]}]};
 return Buffer.from(JSON.stringify(data));
}
module.exports={fixture};
