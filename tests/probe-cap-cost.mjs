/* How much does each additional live card cost, and does the cap choice matter?
   Same build every arm, only DESKTOP_CAP changes. NOTE: this machine has no hardware
   GL in headless Chrome (WebGL only comes up under SwiftShader, a software rasterizer),
   so these are software numbers: useful for comparing caps against each other, useless
   as a prediction of a real visitor's frame rate on a GPU. */
import puppeteer from 'puppeteer-core';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const SITE='/home/rolex/Salman Adnan/Programming/Portfolio/portfolio-website';
const NEW=fs.readFileSync(path.join(SITE,'script.js'),'utf8');
let cap=4;
const MIME={'.html':'text/html','.css':'text/css','.js':'text/javascript','.webp':'image/webp',
  '.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon','.xml':'application/xml'};
const srv=http.createServer((req,res)=>{
  const u=decodeURIComponent(req.url.split('?')[0]);
  if(u==='/script.js'){res.writeHead(200,{'content-type':'text/javascript'});
    return res.end(NEW.replace('var DESKTOP_CAP = 4;','var DESKTOP_CAP = '+cap+';'));}
  const f=path.join(SITE,u==='/'?'/index.html':u);
  fs.readFile(f,(e,d)=>{if(e){res.writeHead(404);return res.end();}
    res.writeHead(200,{'content-type':MIME[path.extname(f)]||'application/octet-stream'});res.end(d);});
}).listen(8098);
const b=await puppeteer.launch({executablePath:'/usr/bin/google-chrome',headless:'new',
  args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
async function arm(n,label){
  cap=n; const p=await b.newPage(); await p.setViewport({width:1280,height:800});
  await p.goto('http://localhost:8098/index.html',{waitUntil:'networkidle2'});
  await p.evaluate(()=>document.getElementById('all-toggle')?.click());
  await p.evaluate(()=>document.getElementById('flagship').scrollIntoView({block:'center'}));
  await new Promise(r=>setTimeout(r,2500));
  const live=await p.evaluate(()=>document.querySelectorAll('iframe.card-viz').length);
  // sitting still, reading: the case that actually matters for a page you scrolled to
  const idle=await p.evaluate(()=>new Promise(res=>{let n=0;const t0=performance.now();
    (function t(){n++;performance.now()-t0<3000?requestAnimationFrame(t):res(n/((performance.now()-t0)/1000));})();}));
  await p.close(); return {live,idle};
}
console.log('cap  live  idle-fps (software rasterizer, NOT a real-GPU number)');
for(const n of [0,1,2,4,6]){
  const r=await arm(n);
  console.log(`${String(n).padEnd(4)} ${String(r.live).padEnd(5)} ${r.idle.toFixed(1)}`);
}
await b.close(); srv.close();
