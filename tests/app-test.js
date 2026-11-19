const fs=require('fs');const path=require('path');const http=require('http');const {chromium}=require('playwright');
const root=path.join(__dirname,'..');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png'};
const srv=http.createServer((q,r)=>{let p=q.url.split('?')[0];if(p==='/')p='/index.html';const f=path.join(root,p);if(!f.startsWith(root)||!fs.existsSync(f)){r.writeHead(404);return r.end()}r.writeHead(200,{'content-type':types[path.extname(f)]||'text/plain'});r.end(fs.readFileSync(f))});
const stubs={
 'firebase-app.js':`export function initializeApp(c){return {c}}`,
 'firebase-auth.js':`const st={user:null,cbs:[]};const fire=()=>st.cbs.forEach(c=>setTimeout(()=>c(st.user),10));
export function getAuth(){return st}
export function onAuthStateChanged(a,cb){st.cbs.push(cb);setTimeout(()=>cb(st.user),30)}
export async function signInWithEmailAndPassword(a,e,p){if(p!=='right'){const x=new Error('bad');x.code='auth/invalid-credential';throw x}st.user={email:e,uid:'u1'};fire()}
export async function signOut(){st.user=null;fire()}
export async function sendPasswordResetEmail(){}`,
 'firebase-firestore.js':`const data=new Map();const subs=[];let n=0;const meta={fromCache:false,hasPendingWrites:false};
const dsnap=p=>({id:p.split('/').pop(),exists:()=>data.has(p),data:()=>data.get(p),metadata:meta});
const emit=()=>subs.forEach(s=>setTimeout(()=>{ if(s.dead)return; if(s.ref.kind==='doc')s.next(dsnap(s.ref.path)); else s.next({docs:[...data.keys()].filter(k=>k.startsWith(s.ref.path+'/')).map(dsnap),metadata:meta}) },15));
export function getFirestore(){return {}}
export function doc(fs,p){return {kind:'doc',path:p}}
export function collection(fs,p){return {kind:'col',path:p}}
export function query(c){return c} export function orderBy(){} export function limit(){}
export function onSnapshot(ref,next){const s={ref,next};subs.push(s);emit();return()=>{s.dead=true}}
export async function setDoc(r,d){for(const k in d)if(d[k]===undefined)throw new Error('undefined field '+k);data.set(r.path,JSON.parse(JSON.stringify(d)));emit()}
export async function addDoc(c,d){data.set(c.path+'/id'+(n++),JSON.parse(JSON.stringify(d)));emit()}
export async function deleteDoc(r){data.delete(r.path);emit()}
window.__data=data;`};
const pack={config:{salary:48750,contractHours:37.5,salaryEstimated:true,target:15,maTaxCode:'1257L',pensionPct:0,ytdDate:'',ytdTaxable:null,ytdTax:null,mpGross:10000,mpCode:'BR',mpActual:null,pipWeekly:100,pipDay:2,people:['Alex','Sam']},hours:[{date:'2026-11-16',mins:180,note:'',by:'Alex',at:1},{date:'2026-11-17',mins:150,note:'Module review',by:'Sam',at:2}]};
const code=Buffer.from(JSON.stringify(pack)).toString('base64');
(async()=>{
  await new Promise(r=>srv.listen(8765,r));
  const b=await chromium.launch();
  for(const [name,w,h,scheme] of [['app-dark',390,844,'dark'],['app-light-320',320,700,'light']]){
    const ctx=await b.newContext({viewport:{width:w,height:h},colorScheme:scheme,deviceScaleFactor:1});
    const p=await ctx.newPage(); const errs=[];
    p.on('pageerror',e=>errs.push('PAGE '+e)); p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
    await p.clock.install({time:new Date('2026-11-19T12:00:00')});
    await p.route('https://www.gstatic.com/firebasejs/**',r=>{const f=r.request().url().split('/').pop();r.fulfill({contentType:'text/javascript',body:stubs[f]})});
    await p.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));
    await p.route('**/config.js*',r=>r.fulfill({contentType:'text/javascript',body:'window.FIREBASE_CONFIG={apiKey:"x",projectId:"p"};'}));
    await p.goto('http://localhost:8765/');
    await p.clock.runFor(200);
    const step=async(label,fn)=>{try{await fn();console.log(name,'ok  ',label)}catch(e){console.log(name,'FAIL',label,String(e).split('\n')[0])}};
    await step('sign-in screen shows',async()=>{await p.waitForSelector('#view-signin:not([hidden])',{timeout:3000})});
    await p.screenshot({path:'/tmp/'+name+'-signin.png'});
    await step('wrong password is marked on the field',async()=>{await p.fill('#si-email','a@b.c');await p.fill('#si-pass','wrong');await p.click('#si-go');await p.clock.runFor(100);await p.waitForSelector('#si-pass[aria-invalid="true"]',{timeout:3000})});
    await step('right password opens the app and the set-up sheet',async()=>{await p.fill('#si-pass','right');await p.click('#si-go');await p.clock.runFor(300);await p.waitForSelector('#dlg-setup[open]',{timeout:3000})});
    await step('bad set-up code is refused',async()=>{await p.fill('#su-code','nonsense');await p.click('#su-go');await p.waitForSelector('#su-code[aria-invalid="true"]',{timeout:3000})});
    await step('set-up code loads details',async()=>{await p.fill('#su-code',code);await p.click('#su-go');await p.clock.runFor(500);await p.waitForSelector('#dlg-setup:not([open])',{timeout:3000,state:'attached'});const t=await p.textContent('#hero-sub');if(!/5h 30m at £25.00/.test(t))throw new Error('hero: '+t)});
    await step('add hours',async()=>{await p.fill('#a-hours','2:30');await p.click('#a-save');await p.clock.runFor(300);const t=await p.textContent('#entries-sum');if(!/8h in 3 entries/.test(t))throw new Error('sum: '+t)});
    await step('missing hours stops the save',async()=>{await p.click('#a-save');await p.waitForSelector('#a-hours[aria-invalid="true"]',{timeout:2000})});
    await step('edit then delete an entry',async()=>{await p.click('button.row[data-edit]');await p.waitForSelector('#dlg-entry[open]');await p.fill('#e-hours','3');await p.click('#e-save');await p.clock.runFor(300);await p.click('button.row[data-edit]');await p.click('#e-delete');await p.click('#e-delete');await p.clock.runFor(300);const t=await p.textContent('#entries-sum');if(!/in 2 entries/.test(t))throw new Error('sum: '+t)});
    await step('settings save keeps values',async()=>{await p.click('#btn-settings');await p.waitForSelector('#dlg-settings[open]');const c=await p.inputValue('#s-code');if(c!=='1257L')throw new Error('code '+c);await p.fill('#s-code','1100L Week1/Month1');await p.click('#s-save');await p.clock.runFor(300);await p.waitForSelector('#dlg-settings:not([open])',{timeout:2000,state:'attached'});const c2=await p.evaluate(()=>window.__data.get('config/main').maTaxCode);if(c2!=='1100L WEEK1/MONTH1')throw new Error('saved '+c2)});
    const hero=await p.evaluate(()=>({amount:document.getElementById('hero-amount').textContent,split:document.getElementById('split').innerText.replace(/\n/g,' '),total:document.querySelector('.row.total .rv').textContent}));
    console.log(name,JSON.stringify(hero));
    const over=await p.evaluate(()=>({sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth,small:[...document.querySelectorAll('button,input,select')].filter(e=>e.offsetParent&&e.getBoundingClientRect().height<44).map(e=>e.id||e.textContent.trim().slice(0,20))}));
    console.log(name,JSON.stringify(over),errs);
    await p.screenshot({path:'/tmp/'+name+'.png',fullPage:true});
    await step('sign out returns to sign-in',async()=>{await p.click('#btn-settings');await p.click('#btn-signout');await p.clock.runFor(200);await p.waitForSelector('#view-signin:not([hidden])',{timeout:3000})});
    await ctx.close();
  }
  // icons
  const ctx=await b.newContext({deviceScaleFactor:1});const p=await ctx.newPage();
  for(const s of [512,192,180]){
    await p.setViewportSize({width:s,height:s});
    await p.setContent(`<body style="margin:0"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="${s}" height="${s}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#16293F"/><stop offset="1" stop-color="#0A1420"/></linearGradient></defs><rect width="512" height="512" fill="url(#g)"/><circle cx="256" cy="256" r="150" fill="none" stroke="#2B3F58" stroke-width="40"/><circle cx="256" cy="256" r="150" fill="none" stroke="#DDC07A" stroke-width="40" stroke-linecap="round" stroke-dasharray="660 942.5" transform="rotate(-90 256 256)"/><circle cx="256" cy="256" r="26" fill="#DDC07A"/></svg></body>`);
    await p.screenshot({path:path.join(root,'icon-'+s+'.png')});
  }
  await b.close(); srv.close();
})();
