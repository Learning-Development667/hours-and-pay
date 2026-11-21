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
const pack={config:{salary:48750,contractHours:37.5,salaryEstimated:true,target:15,maTaxCode:'1257L',pensionPct:0,ytdDate:'',ytdTaxable:null,ytdTax:null,mpGross:10000,mpCode:'BR',mpActual:null,pipWeekly:100,pipDay:2,sspDaily:24.65,sspFrom:'2026-10-01',people:['Alex','Sam']},hours:[{date:'2026-11-16',mins:180,note:'',by:'Alex',at:1},{date:'2026-11-17',mins:150,note:'Module review',by:'Sam',at:2}]};
const code=Buffer.from(JSON.stringify(pack)).toString('base64');
/* Opens a signed-in page with the set-up code loaded, at a given size. */
async function openApp(b,w,h,scheme){
  const ctx=await b.newContext({viewport:{width:w,height:h},colorScheme:scheme,deviceScaleFactor:1,locale:'en-GB'});
  const p=await ctx.newPage(); const errs=[];
  p.on('pageerror',e=>errs.push('PAGE '+e)); p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
  await p.clock.install({time:new Date('2026-11-19T12:00:00')});
  await p.route('https://www.gstatic.com/firebasejs/**',r=>{const f=r.request().url().split('/').pop();r.fulfill({contentType:'text/javascript',body:stubs[f]})});
  await p.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));
  await p.route('**/figures.json*',r=>r.fulfill({contentType:'application/json',body:'{}'}));
  await p.route('**/config.js*',r=>r.fulfill({contentType:'text/javascript',body:'window.FIREBASE_CONFIG={apiKey:"x",projectId:"p"};'}));
  return {ctx,p,errs};
}
module.exports={srv,stubs,pack,code,root,openApp};
