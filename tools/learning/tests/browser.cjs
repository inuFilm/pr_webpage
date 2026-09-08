// Run with Playwright available in NODE_PATH. Serves only this repository on loopback.
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const base = path.resolve(__dirname, '../../..');
const errors = [];
const mime = {'.js':'text/javascript; charset=utf-8','.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8'};
const server = http.createServer((req,res)=>{
  const requestPath = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  let file = path.resolve(base, '.' + requestPath);
  if (!file.startsWith(base + path.sep)) { res.writeHead(403).end(); return; }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file=path.join(file,'index.html');
  if (!fs.existsSync(file)) { res.writeHead(404).end(); return; }
  res.setHeader('Content-Type',mime[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  try {
    for (const [app,count] of [['cgmath',40],['gamevfx',34]]) {
      const context=await browser.newContext({viewport:{width:1280,height:900}});
      await context.addInitScript(()=>{
        for(const app of ['cgmath','gamevfx']) if(localStorage.getItem(app+'-done-v1')===null) localStorage.setItem(app+'-done-v1','[1]');
      });
      const page=await context.newPage();
      page.on('pageerror',e=>errors.push(app+': '+e.message));
      page.on('console',msg=>{if(msg.type()==='error')errors.push(app+': '+msg.text());});
      await page.goto(origin+'/tools/'+app+'/#ch1');
      await page.waitForSelector('.lesson.active canvas');
      assert.equal(await page.locator('.lesson').count(),count);
      assert.equal(await page.locator('#nav-list button').count(),count);
      assert.equal(await page.locator('.lesson.active').getAttribute('data-lesson-id'),app+'-1');
      assert.ok(await page.locator('.lesson.active .done input').isChecked());
      // A next-page click must not silently mark a chapter understood.
      await page.locator('#nav-list button').nth(2).click();
      await page.locator('.lesson.active .navbtn.primary').click();
      assert.deepEqual(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),app+'-done-v2'),[app+'-1']);
      for(let i=0;i<count;i++){
        await page.locator('#nav-list button').nth(i).click();
        assert.equal(await page.locator('.lesson.active').count(),1);
      }
      assert.equal(await page.locator('.gl-fallback').count(),0);
      assert.equal(await page.locator('pre.code[id]').evaluateAll(items=>items.filter(p=>!p.textContent.trim()).length),0);
      for(const id of ['sampling','linear-color','arc-length']){
        await page.goto(origin+'/tools/'+app+'/#'+id);
        await page.waitForSelector('.lesson.active [data-learning-demo]');
        assert.equal(await page.locator('.lesson.active').getAttribute('data-lesson-id'),id);
        const slider=page.locator('.lesson.active input[type=range]').first();
        const before=await page.locator('.lesson.active [data-readout]').textContent();
        await slider.fill(id==='sampling'?'20':id==='linear-color'?'0.2':'0.9');
        await slider.dispatchEvent('input');
        assert.notEqual(await page.locator('.lesson.active [data-readout]').textContent(),before);
        await page.locator('.lesson.active .quiz .opt').first().click();
        assert.ok((await page.locator('.lesson.active .quiz .fb').textContent()).length>5);
        const hasPixels=await page.locator('.lesson.active [data-learning-demo] canvas').evaluate(c=>{
          const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
          let changed=0;for(let i=0;i<d.length;i+=4)if(d[i]>100)changed++;
          return changed>100;
        });
        assert.ok(hasPixels,'New diagram is blank');
        if(process.env.LEARNING_SCREENSHOTS) {
          fs.mkdirSync(process.env.LEARNING_SCREENSHOTS,{recursive:true});
          await page.locator('.lesson.active .viz').screenshot({path:path.join(process.env.LEARNING_SCREENSHOTS,app+'-'+id+'.png')});
        }
      }
      // Boundary case fixed in the GLSL shader: width zero must not break rendering.
      if(app==='gamevfx'){
        await page.goto(origin+'/tools/gamevfx/#ch4');
        await page.locator('#s-diss-w').fill('0'); await page.locator('#s-diss-w').dispatchEvent('input');
        await page.waitForTimeout(150);
        const glErrors=await page.locator('canvas.gl').evaluateAll(canvases=>canvases.map(c=>{
          const gl=c.getContext('webgl2') || c.getContext('webgl');
          return gl ? gl.getError() : 'no context';
        }));
        assert.ok(glErrors.every(x=>x===0),JSON.stringify(glErrors));
      }
      await page.setViewportSize({width:375,height:812});
      await page.goto(origin+'/tools/'+app+'/#sampling');
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Mobile overflow');
      await page.waitForTimeout(500); // Let the existing lesson fade-in finish before visual QA.
      if(process.env.LEARNING_SCREENSHOTS)await page.screenshot({path:path.join(process.env.LEARNING_SCREENSHOTS,app+'-mobile.png')});
      await context.close();
      console.log(app+': '+count+' chapters, legacy progress/links, new demos, quiz, mobile OK');
    }
    assert.deepEqual(errors,[]);
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>server.close());
