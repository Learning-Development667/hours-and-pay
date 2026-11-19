import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, collection, onSnapshot, setDoc, addDoc, deleteDoc, query, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* A thin layer so the page talks to the database through four verbs only. */
function makeDb(fs){
  const wrap=s=>({id:s.id,exists:s.exists(),data:()=>s.data(),metadata:s.metadata});
  const docRef=path=>{const r=doc(fs,path);return {
    onSnapshot:(next,err)=>onSnapshot(r,s=>next(wrap(s)),err),
    set:d=>setDoc(r,d),
    delete:()=>deleteDoc(r)};};
  return {
    doc:docRef,
    collection:name=>{const c=collection(fs,name);return {
      add:d=>addDoc(c,d),
      doc:id=>docRef(name+"/"+id),
      orderBy:(field,dir)=>({limit:n=>({onSnapshot:(next,err)=>onSnapshot(query(c,orderBy(field,dir),limit(n)),s=>next({docs:s.docs.map(wrap),metadata:s.metadata}),err)})})};}
  };
}

(function(){
  const $=id=>document.getElementById(id);
  const GBP=new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'});
  const money=n=>GBP.format(Math.abs(n)<0.005?0:n);
  const fmtDate=(s,o)=>new Intl.DateTimeFormat('en-GB',Object.assign({timeZone:'UTC'},o)).format(toDate(s));
  const dShort=s=>fmtDate(s,{day:'numeric',month:'short'});
  const dLong=s=>fmtDate(s,{weekday:'short',day:'numeric',month:'short'});
  const dYear=s=>fmtDate(s,{day:'numeric',month:'short',year:'numeric'});
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function fmtH(mins){const h=Math.floor(mins/60),m=Math.round(mins%60);return h&&m?h+'h '+m+'m':h?h+'h':m+'m'}
  function fmtHoursBox(mins){return mins?String(Math.round(mins/60*100)/100):''}
  function todayYmd(){const d=new Date();return ymd(d.getFullYear(),d.getMonth(),d.getDate())}

  const DEFAULTS={salary:0,contractHours:37.5,salaryEstimated:false,target:0,maTaxCode:'1257L',pensionPct:0,
    ytdDate:'',ytdTaxable:null,ytdTax:null,mpGross:0,mpCode:'BR',mpActual:null,pipWeekly:0,pipDay:2,people:[]};
  const S={entries:[],cfg:Object.assign({},DEFAULTS),hasCfg:false,got:{hours:false,cfg:false},status:'loading',
    view:null,canWrite:true,db:null,who:'',editing:null,ledger:null};
  try{S.who=localStorage.getItem('who')||''}catch(e){}

  let toastTimer=null;
  function toast(msg){const t=$('toast');t.textContent=msg;t.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{t.hidden=true},3200)}

  function fieldOf(input){return input.closest('.field')}
  function markBad(input,msg){const f=fieldOf(input),e=f.querySelector('.err');f.classList.add('bad');input.setAttribute('aria-invalid','true');if(e){e.textContent=msg;e.hidden=false}}
  function clearBad(input){const f=fieldOf(input);if(!f)return;const e=f.querySelector('.err');f.classList.remove('bad');input.removeAttribute('aria-invalid');if(e)e.hidden=true}
  document.addEventListener('input',ev=>{if(ev.target.matches&&ev.target.matches('.field input'))clearBad(ev.target)});

  /* ---------- render ---------- */
  function stat(label,value){return '<div><dt>'+esc(label)+'</dt><dd class="num">'+esc(value)+'</dd></div>'}
  function render(){
    const today=todayYmd(), L=buildLedger(S.entries,S.cfg,today);
    S.ledger=L;
    let cyc=L.cycles.find(c=>c.start===S.view);
    if(!cyc){S.view=L.current.start;cyc=L.cycles.find(c=>c.start===S.view)}
    const idx=L.cycles.indexOf(cyc), isCur=cyc.start===L.current.start;
    const ready=S.status==='ready'||S.got.hours;

    $('cycle-name').textContent=dShort(cyc.start)+' to '+dYear(cyc.end);
    $('cycle-note').textContent=isCur?'Current pay cycle':(cyc.start>L.current.start?'Coming pay cycle':'Earlier pay cycle');
    $('btn-prev').disabled=idx<=0; $('btn-next').disabled=idx>=L.cycles.length-1;

    /* notices */
    const n=$('notice'); let note='';
    if(S.status==='nodb')note='This app is not connected to its database yet.';
    else if(S.status==='slow')note='Your hours cannot be reached yet. Check the connection; the page will fill in by itself.';
    else if(S.status==='error')note='Your hours could not be loaded. Close the page and open it again.';
    else if(ready&&S.got.cfg&&!(L.rate>0))note='Add your salary and contracted hours in <button type="button" data-open-settings>Settings</button> to see your pay.';
    else if(ready&&!L.codeOk)note='The MA Group tax code is not one this page can read. Check it in <button type="button" data-open-settings>Settings</button>.';
    else if(ready&&L.stale)note='The payslip figures in Settings are older than the last pay day, so tax is worked out month by month. Put in your newest payslip in <button type="button" data-open-settings>Settings</button>.';
    else if(ready&&S.cfg.salaryEstimated)note='The salary in Settings is a round figure and other deductions may be missing, so pay is close but not exact. Put in your payslip figures in <button type="button" data-open-settings>Settings</button>.';
    if(!S.canWrite&&S.status!=='nodb')note='This sign-in is not allowed to see or change the ledger.';
    n.innerHTML=note; n.hidden=!note;

    /* pay card */
    $('hero-eyebrow').textContent=isCur?'Take-home so far this cycle':'Take-home for this cycle';
    $('hero-amount').textContent=money(cyc.net);
    $('hero-sub').textContent=!ready?'Loading your hours.':
      (cyc.mins?fmtH(cyc.mins)+' at '+money(L.rate)+' an hour. ':'No hours logged yet. ')+'Paid around '+dLong(cyc.pay)+'.';
    let split=stat('Before tax',money(cyc.gross))+
      (cyc.tax<0?stat('Tax refund',money(-cyc.tax)):stat('Income tax',money(cyc.tax)))+
      stat('National Insurance',money(cyc.ni));
    if(cyc.pens>0)split+=stat('Workplace pension',money(cyc.pens));
    $('split').innerHTML=split;
    const course=$('course'), target=S.cfg.target||0;
    if(isCur&&cyc.projected&&cyc.daysLeft>0&&L.rate>0){
      course.innerHTML='On course for about <b>'+esc(money(cyc.projected.net))+'</b> take-home if you keep to '+esc(String(target))+' hours a week from here ('+esc(fmtH(cyc.projected.mins))+' in all).';
      course.hidden=false;
    }else course.hidden=true;
    $('basis').textContent=cyc.basis==='year'?'Tax worked out on the year so far, from your payslip totals.':
      cyc.basis==='flat'?'Tax taken at one flat rate, as your tax code says.':'Tax worked out for this month on its own.';

    /* this week */
    const ring=$('ring');
    if(isCur&&target>0){
      const mon=mondayOf(today), sun=addDays(mon,6);
      const wm=S.entries.reduce((a,e)=>a+(e.date>=mon&&e.date<=sun?e.mins:0),0);
      const frac=Math.min(1,wm/(target*60)), C=276.46;
      $('ring-fill').setAttribute('stroke-dashoffset',String(C*(1-frac)));
      $('ring-svg').setAttribute('aria-label',fmtH(wm)+' of '+target+' hours this week');
      $('ring-value').textContent=fmtH(wm);
      $('ring-label').textContent='of '+target+'h this week';
      $('ring-met').hidden=wm<target*60;
      ring.hidden=false;
    }else ring.hidden=true;

    /* income */
    const pipDayName=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][S.cfg.pipDay==null?2:S.cfg.pipDay];
    $('income').innerHTML=
      '<div class="row"><span class="rl">MA Group</span><span class="rv num">'+esc(money(cyc.net))+'</span><span class="rs">'+esc(isCur?'Take-home so far, ':'Take-home, ')+esc(fmtH(cyc.mins))+' worked</span></div>'+
      '<div class="row"><span class="rl">Military pension</span><span class="rv num">'+esc(money(cyc.pension))+'</span><span class="rs">'+esc(cyc.pensionActual?'The monthly amount you entered':'Estimate after tax on code '+String(S.cfg.mpCode||'').toUpperCase())+'</span></div>'+
      '<div class="row"><span class="rl">PIP</span><span class="rv num">'+esc(money(cyc.pip))+'</span><span class="rs">'+esc(cyc.pipCount+' '+pipDayName+(cyc.pipCount===1?'':'s')+' at '+money(S.cfg.pipWeekly||0))+'</span></div>'+
      '<div class="row total"><span class="rl">'+esc(isCur?'Total so far':'Total')+'</span><span class="rv num">'+esc(money(cyc.total))+'</span></div>';

    /* weeks */
    $('weeks-aim').textContent=target>0?'Aim: '+target+' hours a week':'';
    $('weeks-key').hidden=!(target>0);
    const weeks=[]; let maxM=target*60*1.25;
    for(let mon=mondayOf(cyc.start);mon<=cyc.end;mon=addDays(mon,7)){
      const sun=addDays(mon,6), mins=S.entries.reduce((a,e)=>a+(e.date>=mon&&e.date<=sun?e.mins:0),0);
      weeks.push({mon:mon,sun:sun,mins:mins}); if(mins>maxM)maxM=mins;
    }
    if(!(maxM>0))maxM=60;
    $('weeks').innerHTML=weeks.map(w=>{
      const now=today>=w.mon&&today<=w.sun, future=w.mon>today;
      const label=dShort(w.mon)+' to '+dShort(w.sun), val=future&&!w.mins?'Not yet':fmtH(w.mins);
      return '<div class="week" title="'+esc(label+': '+fmtH(w.mins)+(target>0?' of '+target+'h':''))+'"><span class="wl">'+esc(label)+(now?'<em>This week</em>':'')+'</span><span class="wv num">'+esc(val)+'</span>'+
        '<div class="bar" role="img" aria-label="'+esc(label+', '+fmtH(w.mins)+(target>0?' of '+target+' hours':''))+'"><i style="width:'+(w.mins/maxM*100).toFixed(2)+'%"></i>'+(target>0?'<b style="left:'+(target*60/maxM*100).toFixed(2)+'%"></b>':'')+'</div></div>';
    }).join('');

    /* entries */
    const list=S.entries.filter(e=>e.date>=cyc.start&&e.date<=cyc.end);
    $('entries-sum').textContent=list.length?fmtH(cyc.mins)+' in '+list.length+(list.length===1?' entry':' entries'):'';
    $('entries').innerHTML=list.length?list.map(e=>{
      const sub=[e.note,e.by?'Added by '+e.by:''].filter(Boolean).join(' · ');
      const inner='<span class="rl">'+esc(dLong(e.date))+'</span><span class="rv num">'+esc(fmtH(e.mins))+'</span>'+(sub?'<span class="rs">'+esc(sub)+'</span>':'');
      return S.canWrite?'<button type="button" class="row" data-edit="'+esc(e.id)+'" aria-label="'+esc('Change '+dLong(e.date)+', '+fmtH(e.mins))+'">'+inner+'</button>':'<div class="row">'+inner+'</div>';
    }).join(''):'<p class="empty">'+(ready?(isCur?'No hours logged in this cycle yet. Add today’s hours'+(S.canWrite?' above.':'.'):'No hours were logged in this cycle.'):'Loading.')+'</p>';

    /* running totals */
    const sum=rows=>rows.reduce((a,r)=>({mins:a.mins+r.mins,gross:a.gross+r.gross,net:a.net+r.net,total:a.total+r.total}),{mins:0,gross:0,net:0,total:0});
    const tyNow=taxYearOf(L.current.pay), tyRows=L.cycles.filter(c=>c.ty===tyNow), ty=sum(tyRows), all=sum(L.cycles);
    $('ty-label').textContent='Tax year '+tyNow+' to '+(tyNow+1)+', as tracked here';
    $('totals-note').textContent='from '+dYear(L.cycles[0].start);
    const trio=t=>stat('Hours',fmtH(t.mins))+stat('Before tax',money(t.gross))+stat('Take-home',money(t.net));
    $('ty-stats').innerHTML=trio(ty); $('all-stats').innerHTML=trio(all);
    $('hist').innerHTML=L.cycles.slice().reverse().map(c=>
      '<tr><td><button type="button" data-view="'+c.start+'">'+esc(dShort(c.start)+' to '+dShort(c.end))+'</button></td><td class="num">'+esc(fmtH(c.mins))+'</td><td class="num">'+esc(money(c.net))+'</td><td class="num">'+esc(money(c.total))+'</td></tr>').join('');
    $('hist-foot').innerHTML='<tr><td>All cycles</td><td class="num">'+esc(fmtH(all.mins))+'</td><td class="num">'+esc(money(all.net))+'</td><td class="num">'+esc(money(all.total))+'</td></tr>';

    /* who and write controls */
    $('add-card').hidden=!S.canWrite||S.status==='nodb';
    const people=Array.isArray(S.cfg.people)?S.cfg.people.filter(p=>typeof p==='string'&&p):[];
    $('a-who-field').hidden=people.length<2;
    if(people.length&&people.indexOf(S.who)<0)S.who=people[0];
    $('a-who').innerHTML=people.map(p=>'<button type="button" role="radio" aria-checked="'+(p===S.who)+'" data-who="'+esc(p)+'">'+esc(p)+'</button>').join('');
  }

  /* ---------- actions ---------- */
  function writeFailed(e){
    if(e&&e.code==='permission-denied'){S.canWrite=false;render();toast('This sign-in is not allowed to change the ledger.')}
    else if(e&&e.code==='unavailable')toast('No connection. It will save when you are back online.');
    else if(e&&e.code==='resource-exhausted')toast('The ledger is busy. Try again in a minute.');
    else toast('That did not save. Try again.');
  }
  function readEntry(prefix){
    const d=$(prefix+'-date'),h=$(prefix+'-hours'); let ok=true;
    if(!isYmd(d.value)){ok=false;d.focus()}
    const mins=parseHours(h.value);
    if(mins===null){markBad(h,h.value.trim()?'Check this: use hours such as 2.5 or 2:30':'Missing information');if(ok)h.focus();ok=false}
    return ok?{date:d.value,mins:mins,note:$(prefix+'-note').value.trim().slice(0,140)}:null;
  }
  $('add-form').addEventListener('submit',async ev=>{
    ev.preventDefault();
    const v=readEntry('a'); if(!v||!S.db)return;
    const btn=$('a-save'); btn.disabled=true;
    try{
      await S.db.collection('hours').add({date:v.date,mins:v.mins,note:v.note,by:S.who||'',at:Date.now()});
      $('a-hours').value='';$('a-note').value='';
      S.view=cycleOf(v.date).start; render();
      toast('Added '+fmtH(v.mins)+' for '+dLong(v.date));
    }catch(e){writeFailed(e)}
    btn.disabled=false;
  });
  document.addEventListener('click',ev=>{
    const t=ev.target.closest('button'); if(!t)return;
    if(t.dataset.add!==undefined){
      const box=$('a-hours'), add=Number(t.dataset.add), curM=parseHours(box.value)||0;
      box.value=add?fmtHoursBox(Math.min(1440,curM+add)):''; clearBad(box);
    }else if(t.dataset.who!==undefined){
      S.who=t.dataset.who; try{localStorage.setItem('who',S.who)}catch(e){} render();
    }else if(t.dataset.view){S.view=t.dataset.view;render();window.scrollTo({top:0,behavior:'smooth'})}
    else if(t.dataset.edit){openEdit(t.dataset.edit)}
    else if(t.dataset.openSettings!==undefined){openSettings()}
    else if(t.dataset.close!==undefined){t.closest('dialog').close()}
  });
  $('btn-prev').addEventListener('click',()=>{const L=S.ledger,i=L.cycles.findIndex(c=>c.start===S.view);if(i>0){S.view=L.cycles[i-1].start;render()}});
  $('btn-next').addEventListener('click',()=>{const L=S.ledger,i=L.cycles.findIndex(c=>c.start===S.view);if(i<L.cycles.length-1){S.view=L.cycles[i+1].start;render()}});

  function openEdit(id){
    const e=S.entries.find(x=>x.id===id); if(!e)return;
    S.editing=e;
    $('e-date').value=e.date;$('e-hours').value=fmtHoursBox(e.mins);$('e-note').value=e.note||'';
    clearBad($('e-hours'));
    const del=$('e-delete');del.textContent='Delete';del.dataset.armed='';
    $('dlg-entry').showModal();
  }
  $('edit-form').addEventListener('submit',async ev=>{
    ev.preventDefault();
    const v=readEntry('e'), e=S.editing; if(!v||!e||!S.db)return;
    const btn=$('e-save'); btn.disabled=true;
    try{
      await S.db.collection('hours').doc(e.id).set({date:v.date,mins:v.mins,note:v.note,by:e.by||'',at:e.at||Date.now(),changed:Date.now()});
      $('dlg-entry').close(); toast('Saved');
    }catch(err){writeFailed(err)}
    btn.disabled=false;
  });
  $('e-delete').addEventListener('click',async()=>{
    const del=$('e-delete'), e=S.editing; if(!e||!S.db)return;
    if(!del.dataset.armed){del.dataset.armed='1';del.textContent='Tap again to delete';return}
    del.disabled=true;
    try{await S.db.collection('hours').doc(e.id).delete();$('dlg-entry').close();toast('Deleted')}catch(err){writeFailed(err)}
    del.disabled=false;
  });

  /* ---------- settings ---------- */
  const numBox=v=>v===null||v===undefined?'':String(v);
  function showRate(){
    const s=parseMoney($('s-salary').value), h=parseMoney($('s-contract').value);
    $('s-rate').textContent=s>0&&h>0?money(s/52/h)+' an hour':'not set';
  }
  $('s-salary').addEventListener('input',showRate); $('s-contract').addEventListener('input',showRate);
  function openSettings(){
    const c=S.cfg;
    $('s-salary').value=c.salary?numBox(c.salary):'';
    $('s-contract').value=numBox(c.contractHours);
    $('s-target').value=numBox(c.target);
    $('s-code').value=c.maTaxCode||'';
    $('s-pens').value=numBox(c.pensionPct||0);
    $('s-ytd-date').value=isYmd(c.ytdDate)?c.ytdDate:'';
    $('s-ytd-pay').value=c.ytdTaxable==null?'':numBox(c.ytdTaxable);
    $('s-ytd-tax').value=c.ytdTax==null?'':numBox(c.ytdTax);
    $('s-mp-gross').value=c.mpGross?numBox(c.mpGross):'';
    $('s-mp-code').value=c.mpCode||'';
    $('s-mp-actual').value=c.mpActual?numBox(c.mpActual):'';
    $('s-pip').value=c.pipWeekly?numBox(c.pipWeekly):'';
    $('s-pip-day').value=String(c.pipDay==null?2:c.pipDay);
    $('set-form').querySelectorAll('.field input').forEach(clearBad);
    $('s-save').hidden=!S.canWrite;
    $('s-user').textContent=S.user&&S.user.email?'Signed in as '+S.user.email:'';
    showRate();
    $('dlg-settings').showModal();
  }
  $('btn-settings').addEventListener('click',openSettings);
  $('set-form').addEventListener('submit',async ev=>{
    ev.preventDefault(); if(!S.db)return;
    let firstBad=null;
    const bad=(el,msg)=>{markBad(el,msg);if(!firstBad)firstBad=el};
    const need=(id,max)=>{const el=$(id),v=parseMoney(el.value);if(v===null||v>max){bad(el,el.value.trim()?'Check this':'Missing information');return null}return v};
    const opt=(id)=>{const el=$(id);if(!el.value.trim())return null;const v=parseMoney(el.value);if(v===null){bad(el,'Check this');return undefined}return v};
    const codeOf=id=>{const el=$(id),v=el.value.trim().toUpperCase();if(!v){bad(el,'Missing information');return null}if(!parseCode(v)){bad(el,'Check this: copy the code as it is on the payslip');return null}return v};
    const next=Object.assign({},S.cfg);
    next.salary=need('s-salary',10000000); next.contractHours=need('s-contract',168);
    if(next.contractHours===0)bad($('s-contract'),'Check this');
    next.target=need('s-target',168); next.maTaxCode=codeOf('s-code'); next.pensionPct=need('s-pens',100);
    const yd=$('s-ytd-date').value, yp=opt('s-ytd-pay'), yt=opt('s-ytd-tax');
    const some=!!yd||yp!==null||yt!==null;
    if(some){
      if(!isYmd(yd))bad($('s-ytd-date'),'Missing information');
      if(yp===null)bad($('s-ytd-pay'),'Missing information');
      if(yt===null)bad($('s-ytd-tax'),'Missing information');
    }
    next.ytdDate=some?yd:''; next.ytdTaxable=some?yp:null; next.ytdTax=some?yt:null;
    next.mpGross=need('s-mp-gross',10000000); next.mpCode=codeOf('s-mp-code');
    const act=opt('s-mp-actual'); next.mpActual=act===undefined?null:act;
    next.pipWeekly=need('s-pip',100000); next.pipDay=Number($('s-pip-day').value);
    if(firstBad){firstBad.focus();return}
    if(next.salary!==S.cfg.salary||next.contractHours!==S.cfg.contractHours||some)next.salaryEstimated=false;
    const btn=$('s-save'); btn.disabled=true;
    try{await S.db.doc('config/main').set(next);$('dlg-settings').close();toast('Settings saved')}catch(e){writeFailed(e)}
    btn.disabled=false;
  });

  /* ---------- data ---------- */
  function cleanEntry(id,d){
    if(!d||!isYmd(d.date))return null;
    const mins=Math.round(Number(d.mins));
    if(!(mins>0)||mins>1440)return null;
    return {id:id,date:d.date,mins:mins,note:typeof d.note==='string'?d.note.slice(0,140):'',by:typeof d.by==='string'?d.by.slice(0,40):'',at:Number(d.at)||0};
  }
  /* ---------- sign-in and live data ---------- */
  let auth=null, store=null, unsubs=[], slow=null;
  function show(view){['view-wait','view-signin','view-app'].forEach(v=>{$(v).hidden=v!==view})}
  function stopData(){
    unsubs.forEach(u=>{try{u()}catch(e){}}); unsubs=[]; clearTimeout(slow);
    S.entries=[];S.cfg=Object.assign({},DEFAULTS);S.hasCfg=false;S.got={hours:false,cfg:false};S.view=null;S.db=null;S.canWrite=true;S.setupShown=false;
  }
  function startData(){
    const db=S.db=makeDb(store);
    S.status='loading';
    slow=setTimeout(()=>{if(S.status==='loading'){S.status='slow';render()}},10000);
    const settle=()=>{if(S.got.hours&&S.got.cfg){clearTimeout(slow);S.status='ready'}render()};
    const fail=e=>{clearTimeout(slow);if(e&&e.code==='permission-denied'){S.canWrite=false;S.status='ready'}else S.status='error';render()};
    unsubs.push(db.doc('config/main').onSnapshot(snap=>{
      if(snap.exists){S.cfg=Object.assign({},DEFAULTS,snap.data());S.hasCfg=true}
      if(!snap.metadata.fromCache||snap.exists)S.got.cfg=true;
      if(!snap.exists&&!snap.metadata.fromCache&&!S.setupShown){S.setupShown=true;const d=$('dlg-setup');if(!d.open)d.showModal()}
      settle();
    },fail));
    unsubs.push(db.collection('hours').orderBy('date','desc').limit(1000).onSnapshot(snap=>{
      S.entries=snap.docs.map(d=>cleanEntry(d.id,d.data())).filter(Boolean)
        .sort((a,b)=>a.date<b.date?1:a.date>b.date?-1:b.at-a.at);
      if(!snap.metadata.fromCache||snap.docs.length)S.got.hours=true;
      settle();
    },fail));
  }

  $('signin-form').addEventListener('submit',async ev=>{
    ev.preventDefault(); if(!auth)return;
    const em=$('si-email'),pw=$('si-pass'); let bad=null;
    if(!em.value.trim()){markBad(em,'Missing information');bad=em}
    if(!pw.value){markBad(pw,'Missing information');bad=bad||pw}
    if(bad){bad.focus();return}
    const btn=$('si-go'); btn.disabled=true;
    try{await signInWithEmailAndPassword(auth,em.value.trim(),pw.value);pw.value=''}
    catch(e){
      const c=e&&e.code||'';
      if(c==='auth/too-many-requests')toast('Too many tries. Wait a few minutes, then try again.');
      else if(c==='auth/network-request-failed')toast('No connection. Try again.');
      else{markBad(pw,'Check this: the email or password is not right');pw.focus()}
    }
    btn.disabled=false;
  });
  $('si-reset').addEventListener('click',async()=>{
    if(!auth)return;
    const em=$('si-email');
    if(!em.value.trim()){markBad(em,'Missing information: type your email first');em.focus();return}
    try{await sendPasswordResetEmail(auth,em.value.trim())}catch(e){}
    toast('If that email has a sign-in here, a reset link is on its way.');
  });
  $('btn-signout').addEventListener('click',async()=>{$('dlg-settings').close();try{await signOut(auth)}catch(e){toast('Could not sign out. Try again.')}});

  /* first run: load the pay details from a set-up code */
  $('su-manual').addEventListener('click',()=>{$('dlg-setup').close();openSettings()});
  $('setup-form').addEventListener('submit',async ev=>{
    ev.preventDefault(); if(!S.db)return;
    const box=$('su-code'); let pack=null;
    if(!box.value.trim()){markBad(box,'Missing information');box.focus();return}
    try{
      const bytes=Uint8Array.from(atob(box.value.replace(/\s+/g,'')),ch=>ch.charCodeAt(0));
      pack=JSON.parse(new TextDecoder().decode(bytes));
    }catch(e){}
    if(!pack||typeof pack.config!=='object'||!pack.config){markBad(box,'Check this: paste the whole code, with nothing added');box.focus();return}
    const btn=$('su-go'); btn.disabled=true;
    try{
      const cfg=Object.assign({},DEFAULTS);
      Object.keys(DEFAULTS).forEach(k=>{if(pack.config[k]!==undefined)cfg[k]=pack.config[k]});
      await S.db.doc('config/main').set(cfg);
      const rows=Array.isArray(pack.hours)?pack.hours.map((h,i)=>cleanEntry('x'+i,h)).filter(Boolean).slice(0,200):[];
      for(const r of rows)await S.db.collection('hours').add({date:r.date,mins:r.mins,note:r.note,by:r.by,at:r.at||Date.now()});
      box.value=''; $('dlg-setup').close(); toast('Your details are loaded');
    }catch(e){writeFailed(e)}
    btn.disabled=false;
  });

  function start(){
    $('a-date').value=todayYmd();
    render();
    const conf=window.FIREBASE_CONFIG;
    if(!conf||!conf.apiKey){
      S.status='nodb'; $('gate-note').textContent='This app is not connected to its database yet.'; $('gate-note').hidden=false;
      $('signin-form').hidden=true; show('view-signin'); return;
    }
    const app=initializeApp(conf); auth=getAuth(app); store=getFirestore(app);
    onAuthStateChanged(auth,user=>{
      stopData(); S.user=user||null;
      if(user){show('view-app');startData();render()}
      else{document.querySelectorAll('dialog[open]').forEach(d=>d.close());show('view-signin')}
    });
  }
  start();
})();
