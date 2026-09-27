// Lossless straight-alpha PNG encoder. Avoids the canvas premultiply round trip.
const table=Uint32Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=(n&1)?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function chunk(type,data) {
  const out=new Uint8Array(data.length+12),view=new DataView(out.buffer);view.setUint32(0,data.length);
  for(let i=0;i<4;i++)out[i+4]=type.charCodeAt(i);out.set(data,8);
  let crc=0xffffffff;for(const v of out.subarray(4,-4))crc=table[(crc^v)&255]^(crc>>>8);
  view.setUint32(out.length-4,(crc^0xffffffff)>>>0);return out;
}
export async function encodePNG({data,width,height}) {
  const header=new Uint8Array(13),dv=new DataView(header.buffer);dv.setUint32(0,width);dv.setUint32(4,height);header[8]=8;header[9]=6;
  const scan=new Uint8Array((width*4+1)*height);
  for(let y=0;y<height;y++)scan.set(data.subarray(y*width*4,(y+1)*width*4),y*(width*4+1)+1);
  const stream=new Blob([scan]).stream().pipeThrough(new CompressionStream('deflate'));
  const compressed=new Uint8Array(await new Response(stream).arrayBuffer());
  return new Blob([new Uint8Array([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',compressed),chunk('IEND',new Uint8Array())],{type:'image/png'});
}
