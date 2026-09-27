const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../../..');
async function launch(){
  const server=http.createServer((req,res)=>{
    let file;
    try{file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));}catch{res.writeHead(400).end();return;}
    if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
    if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
    if(!fs.existsSync(file)){res.writeHead(404).end();return;}
    res.setHeader('Content-Type',{'.js':'text/javascript;charset=utf-8','.json':'application/json','.html':'text/html;charset=utf-8','.css':'text/css;charset=utf-8','.png':'image/png','.ico':'image/x-icon'}[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  let browser;
  try{browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});}
  catch(e){server.close();throw e;}
  return {browser,origin:'http://127.0.0.1:'+server.address().port,root,close:async()=>{await browser.close();await new Promise(r=>server.close(r));}};
}
// Test-only instrumentation. No production window API or debug branch.
async function instrument(page){
  await page.route('**/tools/compolab/js/app.js',async route=>{
    const body=fs.readFileSync(path.join(root,'tools/compolab/js/app.js'),'utf8')+
      '\nwindow.__lab={get comp(){return comp},get renderer(){return renderer},get report(){return report},get history(){return history},set(c){comp=c;selected=c.layers.at(-1)?.id;changed({structure:true})},draw,match,snapshotScopes,loadPreset,exportFile};';
    await route.fulfill({status:200,contentType:'text/javascript',body});
  });
}
module.exports={launch,instrument,root};
