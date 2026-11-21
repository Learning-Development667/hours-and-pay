/* Layout at other phone sizes: no sideways scroll, nothing under 44px, no page errors, and a screenshot of each.
   iPhone Duo sizes are estimates (Apple's pixels at 3x): cover 466x678, inner 626x890 upright and 890x626 on its side. */
const {chromium}=require('playwright');
const {srv,code,openApp}=require('./harness');
const SIZES=[['duo-cover',466,678,'light'],['duo-inner',626,890,'dark'],['duo-inner-side',890,626,'light'],['iphone-se',375,667,'dark'],['pro-max',440,956,'light']];
(async()=>{
  await new Promise(r=>srv.listen(8765,r));
  const b=await chromium.launch(); let bad=0;
  for(const [name,w,h,scheme] of SIZES){
    const {ctx,p,errs}=await openApp(b,w,h,scheme);
    await p.goto('http://localhost:8765/');
    await p.clock.runFor(200);
    await p.fill('#si-email','a@b.c');await p.fill('#si-pass','right');await p.click('#si-go');await p.clock.runFor(300);
    await p.waitForSelector('#dlg-setup[open]');await p.fill('#su-code',code);await p.click('#su-go');await p.clock.runFor(500);
    await p.click('#loan-edit');await p.fill('#l-amount','1000');await p.fill('#l-months','3');await p.click('#loan-save');await p.clock.runFor(300);
    await p.click('#fold-entries summary');
    const over=await p.evaluate(()=>({sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth,small:[...document.querySelectorAll('button,input,select,summary')].filter(e=>e.offsetParent&&e.getBoundingClientRect().height<44&&!e.closest('.wheel')).map(e=>e.id||e.textContent.trim().slice(0,20)),wide:[...document.querySelectorAll('section,.card,.hero,table')].filter(e=>e.offsetParent&&e.getBoundingClientRect().right>document.documentElement.clientWidth+1).map(e=>e.id||e.className)}));
    await p.screenshot({path:'/tmp/size-'+name+'.png',fullPage:true});
    await p.click('.cal-day[data-day="2026-11-19"]');await p.waitForSelector('#dlg-day[open]');
    const dlg=await p.evaluate(()=>{const r=document.querySelector('#dlg-day').getBoundingClientRect();return {w:Math.round(r.width),fits:r.right<=innerWidth&&r.left>=0}});
    await p.screenshot({path:'/tmp/size-'+name+'-day.png'});
    const ok=over.sw<=over.cw&&!over.small.length&&!over.wide.length&&dlg.fits&&!errs.length;
    if(!ok)bad++;
    console.log(name,w+'x'+h,ok?'ok  ':'FAIL',JSON.stringify(over),JSON.stringify(dlg),errs.join(' | '));
    await ctx.close();
  }
  await b.close(); srv.close(); process.exitCode=bad?1:0;
})();
