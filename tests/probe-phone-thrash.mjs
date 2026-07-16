import puppeteer from 'puppeteer-core';
const SITE='/home/rolex/Salman Adnan/Programming/Portfolio/portfolio-website';
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
let bad=0; const ok=(c,m)=>{console.log((c?'  PASS  ':'  FAIL  ')+m); if(!c) bad++;};

const b=await puppeteer.launch({executablePath:'/usr/bin/google-chrome',headless:'new',
  args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});

for (const dev of [{t:'phone 390x844',w:390,h:844,touch:true,cap:2},
                   {t:'desktop 1280x800',w:1280,h:800,touch:false,cap:4}]) {
  const p=await b.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
  await p.setViewport({width:dev.w,height:dev.h,hasTouch:dev.touch,isMobile:dev.touch});
  // count every mount, to catch a scroll that tears contexts up and down
  await p.evaluateOnNewDocument(()=>{
    window.__mounts=0; window.__unmounts=0;
    document.addEventListener('DOMContentLoaded',()=>{
      new MutationObserver(ms=>{for(const m of ms){
        for(const n of m.addedNodes) if(n.nodeType===1&&n.matches&&n.matches('iframe.card-viz')) window.__mounts++;
        for(const n of m.removedNodes) if(n.nodeType===1&&n.matches&&n.matches('iframe.card-viz')) window.__unmounts++;
      }}).observe(document.body,{childList:true,subtree:true});
    });
  });
  await p.goto('file://'+SITE+'/index.html',{waitUntil:'networkidle2'});
  await p.evaluate(()=>document.getElementById('all-toggle')?.click());
  await sleep(500);

  console.log(`\n===== ${dev.t} =====`);
  let peak=0;
  for(let i=0;i<26;i++){                       // a slow, human-paced scroll down the wall
    await p.evaluate(()=>window.scrollBy(0,300));
    await sleep(260);
    peak=Math.max(peak, await p.evaluate(()=>document.querySelectorAll('iframe.card-viz').length));
  }
  const mounts=await p.evaluate(()=>window.__mounts);
  const un=await p.evaluate(()=>window.__unmounts);
  const hs=await p.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);
  console.log(`peak live: ${peak} | mounts: ${mounts} | unmounts: ${un} over a 26-step scroll`);
  ok(peak>0, 'cards played untouched');
  ok(peak<=dev.cap, `cap of ${dev.cap} held (peak ${peak})`);
  ok(mounts>0, `the counter actually saw mounts (${mounts})`);
  ok(mounts<=40, `no context thrash (${mounts} mounts over 26 scroll steps)`);
  ok(!hs, 'no horizontal scroll');
  ok(errs.length===0, 'no JS errors'+(errs.length?': '+errs[0]:''));
  await p.close();
}
await b.close();
console.log(bad?`\n${bad} FAILED`:'\nALL PASSED');
process.exit(bad?1:0);
