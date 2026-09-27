export function scopeData({data,width,height}) {
  const hist=Array.from({length:4},()=>new Float64Array(256)),wave=[],vector=[];
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=(y*width+x)*4,a=data[i+3]/255;if(a===0)continue;
    const r=data[i]/255,g=data[i+1]/255,b=data[i+2]/255,l=.2126*r+.7152*g+.0722*b;
    hist[0][data[i]]+=a;hist[1][data[i+1]]+=a;hist[2][data[i+2]]+=a;hist[3][Math.round(l*255)]+=a;
    wave.push([x/width,l,a]);vector.push([(b-l)/1.8556,(r-l)/1.5748,a]);
  }
  return {hist,wave,vector};
}
export function drawScope(canvas,kind,current,before=null) {
  // Match the backing dimensions to the displayed panel. Fixed CSS heights at
  // tablet widths must not stretch a vectorscope circle into an ellipse.
  const bounds=canvas.getBoundingClientRect();
  if(bounds.width>0&&bounds.height>0){canvas.width=Math.round(bounds.width);canvas.height=Math.round(bounds.height);}
  const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height;
  ctx.fillStyle='#101f28';ctx.fillRect(0,0,w,h);ctx.font='11px sans-serif';
  ctx.strokeStyle='#365260';ctx.fillStyle='#a3b6c2';ctx.lineWidth=1;
  for(let i=0;i<=4;i++){const y=16+(h-36)*i/4;ctx.beginPath();ctx.moveTo(30,y);ctx.lineTo(w-12,y);ctx.stroke();if(kind!=='vector')ctx.fillText(String(100-i*25),2,y+3);}
  const draw=(d,ghost)=>{
    if(kind==='histogram'){
      const max=Math.max(1,...d.hist.flatMap(a=>[...a]));
      d.hist.forEach((values,k)=>{ctx.strokeStyle=ghost?'#e8b56455':['#ff6b8099','#6ee7b799','#66b9ff99','#eef3f6cc'][k];ctx.beginPath();values.forEach((v,i)=>{const x=30+i/255*(w-42),y=h-20-v/max*(h-40);if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);});ctx.stroke();});
    }else if(kind==='waveform'){
      for(const [x,l,a] of d.wave){ctx.fillStyle=ghost?'rgba(255,209,102,'+(.025*a)+')':'rgba(110,231,183,'+(.06*a)+')';ctx.fillRect(30+x*(w-42),16+(1-l)*(h-36),1.4,1.4);}
    }else{
      for(const [cb,cr,a] of d.vector){ctx.fillStyle=ghost?'rgba(255,209,102,'+(.02*a)+')':'rgba(110,231,183,'+(.04*a)+')';ctx.fillRect(w/2+cb*(h-32),h/2-cr*(h-32),1.5,1.5);}
    }
  };
  if(kind==='vector'){
    ctx.strokeStyle='#557380';ctx.beginPath();ctx.arc(w/2,h/2,(h-32)/2,0,Math.PI*2);ctx.moveTo(w/2,16);ctx.lineTo(w/2,h-16);ctx.stroke();
    ctx.strokeStyle='#ffd16688';ctx.beginPath();ctx.moveTo(w/2,h/2);const a=123*Math.PI/180;ctx.lineTo(w/2+Math.cos(a)*(h-32)/2,h/2-Math.sin(a)*(h-32)/2);ctx.stroke();ctx.fillStyle='#ffd166';ctx.fillText('肌色の方向',w/2-95,18);
  }
  if(before)draw(before,true);draw(current,false);
  ctx.fillStyle='#a3b6c2';ctx.fillText(kind==='histogram'?'0                   sRGB 値                   255':kind==='waveform'?'画面の左 → 右':'Cb → / Cr ↑',30,h-3);
}
