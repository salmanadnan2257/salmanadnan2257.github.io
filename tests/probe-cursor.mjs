import puppeteer from 'puppeteer-core';
const SITE='/home/rolex/Salman Adnan/Programming/Portfolio/portfolio-website';
const b=await puppeteer.launch({executablePath:'/usr/bin/google-chrome',headless:'new',args:['--no-sandbox']});
let fails=0;
for(const w of [1239,1240,1241,1440]){
  for(const dsf of (w===1440?[1,2]:[1])){ // 200% zoom via deviceScaleFactor at 1440
    const p=await b.newPage();
    await p.setViewport({width:w,height:900,deviceScaleFactor:dsf});
    const errs=[]; p.on('pageerror',e=>errs.push(e.message));
    await p.goto('file://'+SITE+'/index.html',{waitUntil:'networkidle2'});
    const r=await p.evaluate(()=>{
      const de=document.documentElement;
      const h1=document.querySelector('h1');
      const glyphs=[...document.querySelectorAll('h1 [class*="cursor"], h1 [class*="glyph"], .cursor, .hero__cursor')];
      const vis=glyphs.filter(g=>getComputedStyle(g).display!=='none');
      // does any visible glyph push past the viewport right edge?
      const overRight=vis.some(g=>g.getBoundingClientRect().right>de.clientWidth+0.5);
      return {hScroll:de.scrollWidth>de.clientWidth, scrollW:de.scrollWidth, clientW:de.clientWidth,
              glyphCount:glyphs.length, visibleGlyphs:vis.length, overRight};
    });
    const ok=!r.hScroll && !r.overRight;
    console.log(`  ${ok?'PASS':'FAIL'}  w=${w} dsf=${dsf}  hScroll=${r.hScroll}(${r.scrollW}/${r.clientW}) glyphs=${r.glyphCount} visible=${r.visibleGlyphs} overRight=${r.overRight} jsErr=${errs.length}`);
    if(!ok||errs.length)fails++;
    await p.close();
  }
}
await b.close();
console.log(`\n${fails?'FAIL':'PASS'}: item 13 cursor-motif boundary (Chromium only; Firefox/Safari not available here)`);
process.exit(fails?1:0);
