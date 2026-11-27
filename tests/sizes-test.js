/* Layout at other phone sizes: no sideways scroll, nothing under 44px, no page errors, and a screenshot of each.
   Widths from the Daybook scaling rules: 320, 390, 440, the Duo folded (about 380 to 466), unfolded upright (600 to 740), on its side (about 950), a phone on its side, and a Mac. Under 1000px the page must be one centred column no wider than 640. */
const {chromium}=require('playwright');
const {srv,code,openApp}=require('./harness');
const SIZES=[['small-320',320,700,'light'],['iphone-390',390,844,'dark'],['pro-max-440',440,956,'light'],['duo-folded-400',400,690,'dark'],['duo-folded-466',466,678,'light'],
  ['duo-open-670',670,900,'dark'],['duo-open-740',740,940,'light'],['duo-side-950',950,670,'dark'],['phone-side-844',844,390,'light'],['mac-1280',1280,800,'light']];
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
    await p.click('[data-panel="entries"] .ptog');
    const over=await p.evaluate(()=>({sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth,small:[...document.querySelectorAll('button,input,select,summary')].filter(e=>e.offsetParent&&e.getBoundingClientRect().height<44&&!e.closest('.wheel')).map(e=>e.id||e.textContent.trim().slice(0,20)),col:Math.round(document.querySelector('.wrap').getBoundingClientRect().width-parseFloat(getComputedStyle(document.querySelector('.wrap')).paddingLeft)-parseFloat(getComputedStyle(document.querySelector('.wrap')).paddingRight)),wide:[...document.querySelectorAll('section,.card,.hero,table')].filter(e=>e.offsetParent&&e.getBoundingClientRect().right>document.documentElement.clientWidth+1).map(e=>e.id||e.className)}));
    await p.screenshot({path:'/tmp/size-'+name+'.png',fullPage:true});
    await p.click('.cal-day[data-day="2026-11-19"]');await p.waitForSelector('#dlg-day[open]');
    const dlg=await p.evaluate(()=>{const r=document.querySelector('#dlg-day').getBoundingClientRect();return {w:Math.round(r.width),fits:r.right<=innerWidth&&r.left>=0}});
    await p.screenshot({path:'/tmp/size-'+name+'-day.png'});
    const ok=(w>=1000||over.col<=640)&&over.sw<=over.cw&&!over.small.length&&!over.wide.length&&dlg.fits&&!errs.length;
    if(!ok)bad++;
    console.log(name,w+'x'+h,ok?'ok  ':'FAIL',JSON.stringify(over),JSON.stringify(dlg),errs.join(' | '));
    await ctx.close();
  }
  await b.close(); srv.close(); process.exitCode=bad?1:0;
})();
