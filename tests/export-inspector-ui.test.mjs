import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {verifyBrowserRuntimeFiles} from '../src/workspace/browser-test-runtime.mjs';
import {ORIGIN,CSP} from '../src/workspace/browser-test-profile.mjs';
import {sample,hostile} from './helpers/export-inspector-cases.mjs';

const runtimePath=process.env.GODAGENTS_WORKSPACE_BROWSER_RUNTIME;
test('inspector keeps usable desktop/mobile geometry and never revives stale async results',{skip:!runtimePath,timeout:30000},async()=>{
  const runtime=JSON.parse(await readFile(runtimePath,'utf8'));await verifyBrowserRuntimeFiles(runtime);
  const require=createRequire(import.meta.url),{chromium}=require(join(runtime.driver.root,runtime.driver.entryPath));
  const browser=await chromium.launch({executablePath:join(runtime.browser.root,runtime.browser.executable.path),headless:true,chromiumSandbox:true});
  const context=await browser.newContext({viewport:{width:1366,height:900},serviceWorkers:'block',acceptDownloads:false});
  try {
    const app=fileURLToPath(new URL('../examples/workspace-export-inspector',import.meta.url)),errors=[],external=[];
    await context.route('**/*',async route=>{
      const url=new URL(route.request().url()),name=url.pathname.slice(1)||'index.html';
      if(url.origin!==ORIGIN||!['index.html','viewer.js','app.css'].includes(name)){external.push(name);return route.abort();}
      await route.fulfill({contentType:({'index.html':'text/html','viewer.js':'text/javascript','app.css':'text/css'})[name],headers:{'content-security-policy':CSP},body:await readFile(join(app,name))});
    });
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
    await page.goto(ORIGIN);await page.locator('#bundle-input').fill(JSON.stringify(sample));await page.locator('#inspect').click();await page.locator('#status[data-state="valid"]').waitFor();
    const geometry=await page.evaluate(()=>{
      const get=id=>{const r=document.querySelector(id).getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height};};
      return{files:get('#files'),before:get('#before'),after:get('#after'),overflow:document.documentElement.scrollWidth>innerWidth};
    });
    assert.ok(geometry.before.x>=geometry.files.x+geometry.files.w,'before pane must sit beside sidebar');
    assert.ok(Math.abs(geometry.before.w-geometry.after.w)<1,'comparison pane widths must match');
    assert.equal(geometry.before.y,geometry.after.y);assert.equal(geometry.overflow,false);
    await page.setViewportSize({width:390,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    for(const action of ['clear','edit','new-inspect']) {
      await page.reload();
      // Delay one real WebCrypto digest, not the parser or renderer. This forces
      // the old inspection to finish after a later user action.
      await page.evaluate(()=>{
        const original=crypto.subtle.digest.bind(crypto.subtle);let first=true;
        crypto.subtle.digest=(...args)=>{const work=original(...args);if(!first)return work;first=false;return work.then(value=>new Promise(resolve=>{globalThis.releaseFirstHash=()=>resolve(value);}));};
      });
      await page.locator('#bundle-input').fill(JSON.stringify(sample));await page.locator('#inspect').click();await page.waitForFunction(()=>typeof globalThis.releaseFirstHash==='function');
      if(action==='clear')await page.locator('#clear').click();
      else {await page.locator('#bundle-input').fill(JSON.stringify(hostile));if(action==='new-inspect'){await page.locator('#inspect').click();await page.locator('#status[data-state="valid"]').waitFor();}}
      await page.evaluate(async()=>{globalThis.releaseFirstHash();for(let i=0;i<12;i++)await new Promise(r=>setTimeout(r,0));});
      if(action==='new-inspect'){assert.equal(await page.locator('#files button').count(),1);assert.equal(await page.locator('#after').textContent(),hostile.changes[0].afterText);}
      else {assert.equal(await page.locator('#files button').count(),0);assert.equal(await page.locator('#after').textContent(),'');}
    }
    assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  }finally{await context.close();await browser.close();}
});
