import puppeteer from 'puppeteer-core';
const SITE='/home/rolex/Salman Adnan/Programming/Portfolio/portfolio-website';
const b=await puppeteer.launch({executablePath:'/usr/bin/google-chrome',headless:'new',args:['--no-sandbox']});
const p=await b.newPage();
await p.setJavaScriptEnabled(false);              // crawler-style render
await p.setViewport({width:1280,height:800});
await p.goto('file://'+SITE+'/index.html',{waitUntil:'load'});
const r=await p.evaluate(()=>{
  const wall=document.getElementById('all-projects');
  const disp=wall?getComputedStyle(wall).display:'MISSING';
  const links=[...document.querySelectorAll('a[href^="projects/"]')].map(a=>a.getAttribute('href'));
  const distinct=new Set(links);
  const toggle=document.getElementById('all-toggle');
  const toggleShown=toggle?getComputedStyle(toggle).display!=='none':false;
  const jsClass=document.documentElement.classList.contains('js');
  return {disp, total:links.length, distinct:distinct.size, toggleShown, jsClass};
});
const wallOpen=r.disp!=='none';
console.log(`JS-OFF: html.js=${r.jsClass} wallDisplay=${r.disp} project-links=${r.total} distinct=${r.distinct} toggleShown=${r.toggleShown}`);
const ok=wallOpen && r.distinct>=38 && !r.jsClass;
console.log(ok?'PASS: wall ships open, all links crawlable, no js-class, toggle not blocking':'FAIL');
await b.close();
process.exit(ok?0:1);
