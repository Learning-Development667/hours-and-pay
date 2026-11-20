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

/* Bump APP_VERSION and version.json together on every change to the app. */
const APP_VERSION=20, APP_DATE='21 November 2026';

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
  function fmtCompact(mins){const h=Math.floor(mins/60),m=Math.round(mins%60);return h?h+'h'+(m?pad(m):''):m+'m'}
  const dFull=s=>fmtDate(s,{weekday:'long',day:'numeric',month:'long'});
  const monShort=s=>fmtDate(s,{month:'short'});
  const when=d=>{const w=workingDayOnOrBefore(d);return (w<=todayYmd()?'Paid ':'Due ')+dLong(w)};
  /* all hours for each day: shifts, total, notes and the documents that hold them */
  function dayMap(){
    const m=new Map();
    for(const e of S.entries){
      let d=m.get(e.date); if(!d){d={date:e.date,mins:0,shifts:[],notes:[],ids:[],holiday:false};m.set(e.date,d)}
      if(e.holiday)d.holiday=true;
      d.mins+=e.mins; d.ids.push(e.id); if(e.note)d.notes.push(e.note); d.shifts.push(...e.shifts);
    }
    for(const d of m.values())d.shifts.sort((x,y)=>timeMins(x.start)-timeMins(y.start));
    return m;
  }
  const shiftText=sh=>sh.map(s=>s.start+' to '+s.end).join(', ');
  function todayYmd(){const d=new Date();return ymd(d.getFullYear(),d.getMonth(),d.getDate())}

  const DEFAULTS={salary:0,contractHours:37.5,salaryEstimated:false,target:0,maTaxCode:'1257L',pensionPct:0,
    ytdDate:'',ytdTaxable:null,ytdTax:null,mpGross:0,mpCode:'BR',mpActual:null,pipWeekly:0,pipDay:2,mpDay:22,sspDaily:0,sspFrom:'',mpTaxYtd:null,outgoings:[],holidayLeft:null,holidayAsOf:'',people:[]};
  const S={entries:[],cfg:Object.assign({},DEFAULTS),hasCfg:false,got:{hours:false,cfg:false},status:'loading',
    view:null,canWrite:true,db:null,day:null,ledger:null};

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
    $('hero-eyebrow').textContent=(isCur?'Earned so far this cycle':'Earned this cycle')+', paid '+dShort(workingDayOnOrBefore(cyc.pay));
    $('hero-amount').textContent=money(cyc.net);
    $('hero-sub').textContent=!ready?'Loading your hours.':
      (cyc.mins?fmtH(cyc.mins)+' at '+money(L.rate)+' an hour. ':'No hours logged yet. ')+(cyc.sspDays?'Sick pay for '+cyc.sspDays+(cyc.sspDays===1?' day. ':' days. '):'')+(cyc.holDays?'Holiday pay for '+cyc.holDays+(cyc.holDays===1?' day. ':' days. '):'')+'Paid around '+dLong(workingDayOnOrBefore(cyc.pay))+'.';
    let split=(cyc.ssp>0||cyc.holPay>0?stat('Hours',money(cyc.hoursPay))+(cyc.ssp>0?stat('Sick pay',money(cyc.ssp)):'')+(cyc.holPay>0?stat('Holiday pay',money(cyc.holPay)):''):'')+stat('Before tax',money(cyc.gross))+
      (cyc.tax<0?stat('Tax refund',money(-cyc.tax)):stat('Income tax',money(cyc.tax)))+
      stat('National Insurance',money(cyc.ni));
    if(cyc.pens>0)split+=stat('Workplace pension',money(cyc.pens));
    $('split').innerHTML=split;
    const mc=parseCode(S.cfg.maTaxCode), taxFree=mc&&mc.kind==='allow'?Math.max(0,mc.allowance/12):0, th=[];
    if(isCur&&L.rate>0&&cyc.gross<TAX.niLower)th.push('National Insurance starts once this cycle\u2019s pay passes '+money(TAX.niLower)+' ('+money(TAX.niLower-cyc.gross)+' to go)');
    if(isCur&&L.rate>0&&mc&&mc.kind==='allow'&&cyc.gross<taxFree)th.push('income tax once it passes '+money(taxFree));
    $('thresh').textContent=th.length?(th.length>1||cyc.tax<=0?'Nothing is taken yet: '+th.join(', and ')+'.':th[0].charAt(0).toUpperCase()+th[0].slice(1)+'.'):'';
    $('thresh').hidden=!th.length;
    const course=$('course'), target=S.cfg.target||0;
    if(isCur&&cyc.projected&&cyc.daysLeft>0&&L.rate>0){
      const pr=cyc.projected;
      course.innerHTML='On course for about <b>'+esc(money(pr.net))+'</b> take-home on '+esc(dLong(workingDayOnOrBefore(cyc.pay)))+' if you keep to '+esc(String(target))+' hours a week from here ('+esc(fmtH(pr.mins))+' in all): '+
        esc(money(pr.gross))+' before tax, '+esc(money(Math.max(0,pr.tax)))+' income tax, '+esc(money(pr.ni))+' National Insurance'+(pr.pens>0?', '+esc(money(pr.pens))+' workplace pension':'')+'.';
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
    const mpDay=Math.min(28,Math.max(1,Math.round(Number(S.cfg.mpDay))||22)), pipWd=S.cfg.pipDay==null?2:S.cfg.pipDay;
    let pDate='',pipFirst='',pipLast='';
    for(let d=cyc.start;d<=cyc.end;d=addDays(d,1)){
      if(parts(d).d===mpDay&&!pDate)pDate=d;
      if(weekday(d)===pipWd){if(!pipFirst)pipFirst=d;pipLast=d}
    }
    const LP=landingPay(S.cfg,cyc,L), cashTotal=round2(LP.amount+cyc.pension+cyc.pip);
    $('income').innerHTML=
      '<div class="row"><span class="rl">MA Group pay</span><span class="rv num">'+esc(money(LP.amount))+'</span><span class="rs">'+esc(when(LP.date)+', for hours from '+dShort(LP.from)+' to '+dShort(LP.to)+'. '+(LP.actual?'The amount on your payslip.':LP.known?'Estimate from the hours logged then.':'No hours were logged for those dates.'))+'</span></div>'+
      '<div class="row"><span class="rl">Military pension</span><span class="rv num">'+esc(money(cyc.pension))+'</span><span class="rs">'+esc((pDate?when(pDate)+'. ':'')+(cyc.pensionActual?'The monthly amount you entered':'Estimate after tax on code '+String(S.cfg.mpCode||'').toUpperCase()))+'</span></div>'+
      '<div class="row"><span class="rl">PIP</span><span class="rv num">'+esc(money(cyc.pip))+'</span><span class="rs">'+esc(cyc.pipCount+' '+pipDayName+(cyc.pipCount===1?'':'s')+' at '+money(S.cfg.pipWeekly||0)+(pipFirst?', '+dShort(pipFirst)+(pipLast!==pipFirst?' to '+dShort(pipLast):''):''))+'</span></div>'+
      '<div class="row total"><span class="rl">Total this cycle</span><span class="rv num">'+esc(money(cashTotal))+'</span></div>';

    /* monthly outgoings against this cycle's income */
    const outs=(Array.isArray(S.cfg.outgoings)?S.cfg.outgoings:[]).filter(o=>o&&typeof o.name==='string'&&Number(o.amount)>0);
    const outTotal=round2(outs.reduce((t,o)=>t+Number(o.amount),0)), left=round2(cashTotal-outTotal);
    $('out-rows').innerHTML=outs.length?outs.map(o=>'<div class="row"><span class="rl">'+esc(o.name)+'</span><span class="rv num">'+esc(money(Number(o.amount)))+'</span></div>').join('')+
      '<div class="row"><span class="rl"><b>Total outgoings</b></span><span class="rv num"><b>'+esc(money(outTotal))+'</b></span></div>'+
      '<div class="row total"><span class="rl">Left after outgoings</span><span class="rv num">'+esc(money(left))+'</span><span class="rs"><span class="pill '+(left>=0?'ok':'short')+'">'+(left>=0?'Covered':'Short by '+esc(money(-left)))+'</span> '+esc('Against the money that lands from '+dShort(cyc.start)+' to '+dShort(cyc.end)+'.')+'</span></div>'
      :'<p class="empty">No outgoings yet. Choose Change to add the amounts that leave your account each month.</p>';
    $('out-edit').hidden=!S.canWrite;

    /* running total: from minus the outgoings into the black */
    const R=runningTotal(S.entries,S.cfg,today,cyc,L), rc=$('run-card');
    rc.hidden=!(R.outs>0);
    if(R.outs>0){
      const inBlack=R.today>=0, amt=$('run-amount');
      amt.textContent=(R.today<0?'\u2212':'+')+money(Math.abs(R.today));
      amt.className='run-amount num '+(inBlack?'black':'red');
      const pill=$('run-pill'); pill.textContent=inBlack?'In the black':'In the red'; pill.className='pill '+(inBlack?'ok':'short');
      let sub=inBlack?(isCur?'Your outgoings are covered for this cycle.':'Outgoings were covered.'):money(-R.today)+' to go before your outgoings are covered.';
      if(R.cross){sub+=' '+(R.cross<=today?'In the black since '+dLong(R.cross)+'.':'On course to be in the black on '+dLong(R.cross)+'.')}
      else sub+=' On course to finish the cycle '+money(-R.end)+' short.';
      $('run-sub').textContent=sub;
      const W=600,H=150,P=10, vals=R.days.map(x=>x.bal).concat([R.start,0]), lo=Math.min(...vals), hi=Math.max(...vals), span=(hi-lo)||1;
      const X=i=>P+i*(W-2*P)/Math.max(1,R.days.length), Y=v=>P+(hi-v)/span*(H-2*P), z=Y(0);
      const pts=[[X(0),Y(R.start)]]; R.days.forEach((x,i)=>{pts.push([X(i+1),Y(i?R.days[i-1].bal:R.start)]);pts.push([X(i+1),Y(x.bal)])});
      const lastPast=R.days.reduce((k,x,i)=>x.past?i:k,-1), cut=2*(lastPast+1)+1;
      const pathOf=a=>a.map((p,i)=>(i?'L':'M')+p[0].toFixed(1)+' '+p[1].toFixed(1)).join(' ');
      const pastPts=pts.slice(0,Math.max(1,cut)), futPts=pts.slice(Math.max(0,cut-1));
      const area=pathOf(pts)+' L'+X(R.days.length).toFixed(1)+' '+z.toFixed(1)+' L'+X(0).toFixed(1)+' '+z.toFixed(1)+' Z';
      const tp=lastPast>=0?[X(lastPast+1),Y(R.days[lastPast].bal)]:null;
      $('run-chart').innerHTML='<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="'+esc('Running total from '+money(R.start)+' on '+dShort(cyc.start)+' to '+(R.today<0?'minus ':'')+money(Math.abs(R.today))+' today'+(R.cross?', crossing into the black on '+dShort(R.cross):'')+'. Forecast '+money(R.end)+' by '+dShort(cyc.end)+'.')+'">'+
        '<clipPath id="rc-below"><rect x="0" y="'+z.toFixed(1)+'" width="'+W+'" height="'+H+'"/></clipPath><clipPath id="rc-above"><rect x="0" y="0" width="'+W+'" height="'+z.toFixed(1)+'"/></clipPath>'+
        '<path d="'+area+'" fill="var(--run-red)" clip-path="url(#rc-below)"/><path d="'+area+'" fill="var(--run-black)" clip-path="url(#rc-above)"/>'+
        '<line x1="'+P+'" x2="'+(W-P)+'" y1="'+z.toFixed(1)+'" y2="'+z.toFixed(1)+'" class="run-zero"/>'+
        '<path d="'+pathOf(pastPts)+'" class="run-line"/>'+(futPts.length>1?'<path d="'+pathOf(futPts)+'" class="run-line fut"/>':'')+
        (tp?'<circle cx="'+tp[0].toFixed(1)+'" cy="'+tp[1].toFixed(1)+'" r="6" class="run-dot"/>':'')+'</svg>';
      $('run-start').textContent=money(R.start).replace('-','\u2212')+' on '+dShort(cyc.start);
      $('run-end').textContent=(R.end<0?'\u2212':'+')+money(Math.abs(R.end))+' by '+dShort(cyc.end)+' (forecast)';
      $('run-note').textContent='Money as it lands in your account: starts at minus your monthly outgoings, then adds your MA Group pay on '+dShort(R.land.date)+', the pension on its pay day and PIP each '+pipDayName+'. Solid line: so far. Dotted: still to come. The hours you work this cycle are paid on '+dShort(workingDayOnOrBefore(cyc.pay))+', in the next cycle.';
    }

    /* this tax year */
    const Y=yearForecast(S.entries,S.cfg,today);
    $('year-range').textContent=Y.ty+' to '+(Y.ty+1);
    const scale=Math.max(Y.income,BANDS.higher)*1.1||1, pct=v=>(Math.max(0,v)/scale*100).toFixed(2)+'%';
    $('ybar').innerHTML='<i class="ys-a" style="width:'+pct(Y.maSoFar)+'"></i><i class="ys-b" style="width:'+pct(Y.maAhead)+'"></i><i class="ys-c" style="width:'+pct(Y.mpGross)+'"></i>';
    $('ybar').setAttribute('aria-label','Forecast income '+money(Y.income)+': MA Group '+money(Y.maSoFar)+' so far and '+money(Y.maAhead)+' still to come, pension '+money(Y.mpGross)+'. 40% tax starts at '+money(BANDS.higher)+'.');
    $('ymarks').innerHTML='<b style="left:'+pct(BANDS.allowance)+'"><span>Tax-free to £12,570</span></b><b class="hi" style="left:'+pct(BANDS.higher)+'"><span>40% from £50,270</span></b>';
    $('ykey').innerHTML='<span><i class="ys-a"></i>MA Group so far</span><span><i class="ys-b"></i>MA Group to come</span><span><i class="ys-c"></i>Army pension</span>';
    const yr=(l,v,sub,cls)=>'<div class="row'+(cls?' '+cls:'')+'"><span class="rl">'+esc(l)+'</span><span class="rv num">'+esc(v)+'</span>'+(sub?'<span class="rs">'+esc(sub)+'</span>':'')+'</div>';
    $('year-rows').innerHTML=
      yr('Forecast income',money(Y.income),'MA Group '+money(Y.maPay)+' ('+money(Y.maSoFar)+' so far), pension '+money(Y.mpGross)+'. '+(Y.overLine>0?money(Y.overLine)+' over the 40% line.':money(-Y.overLine)+' under the 40% line.'))+
      yr('Tax due on that',money(Y.due),'Before any allowances or deductions in your tax code')+
      yr('Tax being taken',money(Y.taken),'MA Group '+money(Y.maTax)+', pension '+money(Y.mpTax))+
      yr(Y.diff>=0?'Likely refund after April':'Likely to owe after April',money(Math.abs(Y.diff)),'',' total');
    $('year-note').textContent=(Y.anchored?'':'Add your payslip\u2019s pay and tax to date in Settings to include the months before tracking began. ')+
      (Y.mpTaxKnown?'':'Add the pension tax paid so far in Settings for a closer figure. ')+
      'An estimate: it assumes your weekly aim from now until April, no more sick pay, and your current tax codes. Not tax advice.';

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

    /* calendar and days */
    const dm=dayMap();
    let cal='';
    for(let i=(weekday(cyc.start)+6)%7;i>0;i--)cal+='<span class="cal-pad" aria-hidden="true"></span>';
    for(let d=cyc.start;d<=cyc.end;d=addDays(d,1)){
      const x=dm.get(d), mins=x?x.mins:0, p=parts(d), mon=d===cyc.start||p.d===1, sick=!mins&&L.sspSet.has(d), hol=!!(x&&x.holiday);
      const cls='cal-day'+(hol?' hol':'')+(mins?' has':'')+(d===today?' today':'')+(d>today?' future':'');
      const label=dFull(d)+(d===today?', today':'')+(hol?', holiday':mins?', '+fmtH(mins)+' worked':sick?', sick pay':', no hours');
      cal+='<button type="button" class="'+cls+'" data-day="'+d+'" aria-label="'+esc(label)+'"><small>'+(mon?esc(monShort(d)):'')+'</small><span class="cd-n">'+p.d+'</span><span class="cd-h'+(sick?' sick':'')+(hol?' holl':'')+'">'+(hol?'Hol':mins?esc(fmtCompact(mins)):sick?'SSP':'')+'</span></button>';
    }
    $('cal').innerHTML=cal;
    $('cal-sum').textContent=fmtH(cyc.mins)+(isCur?' so far':'');
    $('cal-hint').hidden=!S.canWrite;
    const hl=S.cfg.holidayLeft, hasLeft=hl!==null&&hl!==undefined&&hl!==''&&isFinite(Number(hl));
    const booked=S.entries.filter(e=>e.holiday&&(!isYmd(S.cfg.holidayAsOf)||e.date>=S.cfg.holidayAsOf)).length;
    $('cal-hol').textContent=hasLeft?'Holiday: '+booked+' day'+(booked===1?'':'s')+' marked, '+Math.max(0,Number(hl)-booked)+' left of '+Number(hl)+'. Paid at '+money(L.dayRate)+' a day.':(booked?booked+' holiday day'+(booked===1?'':'s')+' marked, paid at '+money(L.dayRate)+' a day.':'');
    $('cal-hol').hidden=!$('cal-hol').textContent;
    const days=[...dm.values()].filter(x=>x.date>=cyc.start&&x.date<=cyc.end).sort((x,y)=>x.date<y.date?1:-1);
    $('entries-sum').textContent=days.length?fmtH(cyc.mins)+' over '+days.length+(days.length===1?' day':' days'):'';
    $('entries').innerHTML=days.length?days.map(x=>{
      const sub=[x.shifts.length?shiftText(x.shifts):'',...x.notes].filter(Boolean).join('. ');
      const inner='<span class="rl">'+esc(dLong(x.date))+'</span><span class="rv num">'+esc(x.holiday?'Holiday':fmtH(x.mins))+'</span>'+(sub?'<span class="rs">'+esc(sub)+'</span>':'');
      return S.canWrite?'<button type="button" class="row" data-day="'+x.date+'" aria-label="'+esc('Change '+dFull(x.date)+', '+fmtH(x.mins))+'">'+inner+'</button>':'<div class="row">'+inner+'</div>';
    }).join(''):'<p class="empty">'+(ready?(isCur?'No hours logged in this cycle yet.'+(S.canWrite?' Tap a day on the calendar to add them.':''):'No hours were logged in this cycle.'):'Loading.')+'</p>';

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

  }

  /* ---------- actions ---------- */
  function writeFailed(e){
    if(e&&e.code==='permission-denied'){S.canWrite=false;render();toast('This sign-in is not allowed to change the ledger.')}
    else if(e&&e.code==='unavailable')toast('No connection. It will save when you are back online.');
    else if(e&&e.code==='resource-exhausted')toast('The ledger is busy. Try again in a minute.');
    else toast('That did not save. Try again.');
  }
  document.addEventListener('click',ev=>{
    const t=ev.target.closest('button'); if(!t)return;
    if(t.dataset.view){S.view=t.dataset.view;render();window.scrollTo({top:0,behavior:'smooth'})}
    else if(t.dataset.day){openDay(t.dataset.day)}
    else if(t.dataset.removeOut!==undefined){const r=readOuts();r.splice(Number(t.dataset.removeOut),1);drawOuts(r.length?r:[{name:'',amount:''}])}
    else if(t.dataset.removeShift!==undefined){const rows=readRows();rows.splice(Number(t.dataset.removeShift),1);drawShifts(rows);const f=document.querySelector('#shifts [data-k="start"]');if(f)f.focus()}
    else if(t.dataset.openSettings!==undefined){openSettings()}
    else if(t.dataset.close!==undefined){t.closest('dialog').close()}
  });
  $('btn-prev').addEventListener('click',()=>{const L=S.ledger,i=L.cycles.findIndex(c=>c.start===S.view);if(i>0){S.view=L.cycles[i-1].start;render()}});
  $('btn-next').addEventListener('click',()=>{const L=S.ledger,i=L.cycles.findIndex(c=>c.start===S.view);if(i<L.cycles.length-1){S.view=L.cycles[i+1].start;render()}});

  /* ---------- a day's shifts ---------- */
  const X_ICON='<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  function readRows(){return [...document.querySelectorAll('#shifts .shift')].map(r=>({start:r.querySelector('[data-k="start"]').value,end:r.querySelector('[data-k="end"]').value}))}
  function drawShifts(rows){
    $('shifts').innerHTML=rows.map((r,i)=>'<div class="shift"><p class="shift-n">Shift '+(i+1)+'</p>'+
      '<div class="field"><label for="sh'+i+'s">Start</label><input id="sh'+i+'s" data-k="start" type="time" value="'+esc(r.start)+'"><span class="err" hidden></span></div>'+
      '<div class="field"><label for="sh'+i+'e">Finish</label><input id="sh'+i+'e" data-k="end" type="time" value="'+esc(r.end)+'"><span class="err" hidden></span></div>'+
      (rows.length>1?'<button class="icon-btn" type="button" data-remove-shift="'+i+'" aria-label="Remove shift '+(i+1)+'">'+X_ICON+'</button>':'<span></span>')+'</div>').join('');
    $('add-shift').hidden=rows.length>=6;
    showDayTotal();
  }
  function showDayTotal(){$('day-total').textContent=fmtH(shiftMins(readRows()))}
  $('shifts').addEventListener('input',showDayTotal);
  $('shifts').addEventListener('change',showDayTotal);
  $('add-shift').addEventListener('click',()=>{
    const rows=readRows(); rows.push({start:'',end:''}); drawShifts(rows);
    const all=document.querySelectorAll('#shifts [data-k="start"]'); all[all.length-1].focus();
  });
  function openDay(date){
    if(!S.db||!isYmd(date))return;
    if(!S.canWrite){toast('This sign-in is not allowed to change the ledger.');return}
    const x=dayMap().get(date);
    S.day={date:date,ids:x?x.ids:[]};
    $('dlg-day-title').textContent=dFull(date);
    $('d-hol').checked=!!(x&&x.holiday); $('d-hol-rate').textContent='('+money(dayRate(S.cfg))+')';
    const untimed=x&&!x.shifts.length&&!x.holiday;
    $('day-legacy').textContent=untimed?'This day has '+fmtH(x.mins)+' logged without times. Saving shifts replaces it.':'';
    $('day-legacy').hidden=!untimed;
    $('d-note').value=x?x.notes.join('. ').slice(0,140):'';
    drawShifts(x&&x.shifts.length?x.shifts.map(s=>({start:s.start,end:s.end})):[{start:'',end:''}]);
    const clr=$('d-clear'); clr.hidden=!x; clr.textContent='Clear day'; clr.dataset.armed='';
    syncHol();
    $('dlg-day').showModal();
  }
  function syncHol(){const on=$('d-hol').checked;$('shifts').hidden=on;$('add-shift').hidden=on||document.querySelectorAll('#shifts .shift').length>=6;if(on)$('day-total').textContent='Holiday';else showDayTotal()}
  $('d-hol').addEventListener('change',syncHol);
  $('day-form').addEventListener('submit',async ev=>{
    ev.preventDefault(); const day=S.day; if(!day||!S.db)return;
    if($('d-hol').checked){
      const note=$('d-note').value.trim().slice(0,140), btn=$('d-save'); btn.disabled=true;
      try{
        await S.db.collection('hours').doc(day.date).set({date:day.date,mins:0,shifts:[],holiday:true,note:note,at:Date.now()});
        for(const id of day.ids)if(id!==day.date)await S.db.collection('hours').doc(id).delete();
        $('dlg-day').close(); S.view=cycleOf(day.date).start; render(); toast('Holiday marked for '+dLong(day.date));
      }catch(e){writeFailed(e)}
      btn.disabled=false; return;
    }
    const rowsEl=[...document.querySelectorAll('#shifts .shift')]; let firstBad=null; const good=[];
    const bad=(el,msg)=>{markBad(el,msg);if(!firstBad)firstBad=el};
    rowsEl.forEach(r=>{
      const si=r.querySelector('[data-k="start"]'), ei=r.querySelector('[data-k="end"]');
      clearBad(si);clearBad(ei);
      if(!si.value&&!ei.value)return;
      const s=timeMins(si.value), e=timeMins(ei.value);
      if(s===null)bad(si,'Missing information');
      if(e===null)bad(ei,'Missing information');
      else if(s!==null&&e<=s)bad(ei,'Check this: finish after the start');
      if(s!==null&&e!==null&&e>s)good.push({start:si.value,end:ei.value,s:s,e:e,el:si});
    });
    good.sort((x,y)=>x.s-y.s);
    for(let i=1;i<good.length;i++)if(good[i].s<good[i-1].e)bad(good[i].el,'Check this: overlaps another shift');
    if(!firstBad&&!good.length){const f=rowsEl[0].querySelector('[data-k="start"]');bad(f,'Missing information');}
    if(firstBad){firstBad.focus();return}
    const shifts=good.map(g=>({start:g.start,end:g.end})), mins=shiftMins(shifts), note=$('d-note').value.trim().slice(0,140);
    const btn=$('d-save'); btn.disabled=true;
    try{
      await S.db.collection('hours').doc(day.date).set({date:day.date,mins:mins,shifts:shifts,note:note,at:Date.now()});
      for(const id of day.ids)if(id!==day.date)await S.db.collection('hours').doc(id).delete();
      $('dlg-day').close(); S.view=cycleOf(day.date).start; render();
      toast('Saved '+fmtH(mins)+' for '+dLong(day.date));
    }catch(e){writeFailed(e)}
    btn.disabled=false;
  });
  $('d-clear').addEventListener('click',async()=>{
    const clr=$('d-clear'), day=S.day; if(!day||!S.db)return;
    if(!clr.dataset.armed){clr.dataset.armed='1';clr.textContent='Tap again to clear';return}
    clr.disabled=true;
    try{for(const id of day.ids)await S.db.collection('hours').doc(id).delete();$('dlg-day').close();toast('Cleared '+dLong(day.date))}catch(e){writeFailed(e)}
    clr.disabled=false;
  });

  /* ---------- monthly outgoings ---------- */
  const X2='<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  function readOuts(){return [...document.querySelectorAll('#outs .out')].map(r=>({name:r.querySelector('[data-k="name"]').value,amount:r.querySelector('[data-k="amount"]').value}))}
  function drawOuts(rows){
    $('outs').innerHTML=rows.map((r,i)=>'<div class="out">'+
      '<div class="field"><label for="on'+i+'">What</label><input id="on'+i+'" data-k="name" type="text" maxlength="40" autocomplete="off" value="'+esc(r.name)+'"><span class="err" hidden></span></div>'+
      '<div class="field"><label for="oa'+i+'">£ a month</label><input id="oa'+i+'" data-k="amount" type="text" inputmode="decimal" autocomplete="off" value="'+esc(r.amount)+'"><span class="err" hidden></span></div>'+
      '<button class="icon-btn" type="button" data-remove-out="'+i+'" aria-label="Remove '+esc(r.name||'this outgoing')+'">'+X2+'</button></div>').join('');
    $('out-add').hidden=rows.length>=30;
  }
  /* a link ending #outgoings=<base64url JSON list> opens this sheet filled in, for checking before Save */
  function readOutLink(){
    const m=/^#outgoings=([A-Za-z0-9_-]+)$/.exec(location.hash||''); if(!m)return;
    try{
      const txt=new TextDecoder().decode(Uint8Array.from(atob(m[1].replace(/-/g,'+').replace(/_/g,'/')),ch=>ch.charCodeAt(0)));
      const list=JSON.parse(txt);
      if(Array.isArray(list))S.pendingOuts=list.filter(o=>o&&typeof o.name==='string'&&Number(o.amount)>0).slice(0,30).map(o=>({name:o.name.slice(0,40),amount:String(Number(o.amount))}));
    }catch(e){}
    try{history.replaceState(null,'',location.pathname+location.search)}catch(e){}
    applyOutLink();
  }
  function applyOutLink(){
    if(!S.pendingOuts||!S.db||!S.got.cfg||!S.canWrite)return;
    const merged=(Array.isArray(S.cfg.outgoings)?S.cfg.outgoings:[]).map(x=>({name:x.name||'',amount:String(x.amount)}));
    for(const n of S.pendingOuts){const i=merged.findIndex(x=>x.name.trim().toLowerCase()===n.name.trim().toLowerCase());if(i>=0)merged[i]=n;else merged.push(n)}
    S.pendingOuts=null;
    document.querySelectorAll('dialog[open]').forEach(d=>d.close());
    drawOuts(merged); $('dlg-out').showModal(); toast('Check the list, then tap Save');
  }
  window.addEventListener('hashchange',readOutLink);

  /* a link ending #update=<base64url JSON {settings..., outgoings:[...]}> shows each change for checking, then Apply */
  const UPD={salary:['Full-time salary','money'],contractHours:['Contracted hours a week','num'],target:['Weekly aim (hours)','num'],
    maTaxCode:['MA Group tax code','code'],pensionPct:['Workplace pension %','num'],ytdDate:['Payslip pay date','date'],ytdTaxable:['Taxable pay to date','money'],
    ytdTax:['Tax paid to date','money'],mpGross:['Pension a year','money'],mpCode:['Pension tax code','code'],mpActual:['Pension that arrives each month','money'],
    mpDay:['Pension paid on day','num'],mpTaxYtd:['Pension tax paid so far','money'],pipWeekly:['PIP each week','money'],pipDay:['PIP paid on','weekday'],
    sspDaily:['Sick pay a day','money'],holidayLeft:['Holiday days left','num'],holidayAsOf:['Holiday left counted from','date'],sspFrom:['Sick pay started on','date'],salaryEstimated:['Salary marked as estimated','bool']};
  const WD=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  function showVal(k,v){const t=UPD[k][1];if(v===null||v===undefined||v==='')return 'not set';
    if(t==='money')return money(Number(v));if(t==='date')return isYmd(v)?dYear(v):String(v);if(t==='weekday')return WD[v]||String(v);if(t==='bool')return v?'Yes':'No';return String(v)}
  function cleanUpd(k,v){const t=UPD[k][1];
    if(t==='money'||t==='num'){const n=Number(v);return isFinite(n)&&n>=0&&n<10000000?n:undefined}
    if(t==='code')return typeof v==='string'&&parseCode(v)?v.trim().toUpperCase():undefined;
    if(t==='date')return isYmd(v)?v:undefined; if(t==='weekday'){const n=Number(v);return n>=0&&n<=6?n:undefined}
    if(t==='bool')return !!v; return undefined}
  function readUpdateLink(){
    const m=/^#update=([A-Za-z0-9_-]+)$/.exec(location.hash||''); if(!m)return;
    try{S.pendingUpdate=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(m[1].replace(/-/g,'+').replace(/_/g,'/')),ch=>ch.charCodeAt(0))))}catch(e){S.pendingUpdate=null}
    try{history.replaceState(null,'',location.pathname+location.search)}catch(e){}
    applyUpdateLink();
  }
  function applyUpdateLink(){
    const u=S.pendingUpdate; if(!u||typeof u!=='object'||!S.db||!S.got.cfg||!S.canWrite)return;
    S.pendingUpdate=null;
    const changes={}, rows=[];
    Object.keys(UPD).forEach(k=>{if(!(k in u))return;const v=cleanUpd(k,u[k]);if(v===undefined)return;if(String(S.cfg[k])===String(v))return;
      changes[k]=v;rows.push('<div class="row"><span class="rl">'+esc(UPD[k][0])+'</span><span class="rv num">'+esc(showVal(k,v))+'</span><span class="rs">Was '+esc(showVal(k,S.cfg[k]))+'</span></div>')});
    if(Array.isArray(u.outgoings)){
      const merged=(Array.isArray(S.cfg.outgoings)?S.cfg.outgoings:[]).map(x=>({name:x.name,amount:Number(x.amount)}));
      u.outgoings.filter(o=>o&&typeof o.name==='string'&&Number(o.amount)>0).slice(0,30).forEach(o=>{const n={name:o.name.slice(0,40),amount:Number(o.amount)};const i=merged.findIndex(x=>x.name.trim().toLowerCase()===n.name.trim().toLowerCase());if(i>=0)merged[i]=n;else merged.push(n)});
      changes.outgoings=merged;
      rows.push('<div class="row"><span class="rl">Monthly outgoings</span><span class="rv num">'+esc(money(merged.reduce((t,o)=>t+o.amount,0)))+'</span><span class="rs">'+esc(merged.map(o=>o.name+' '+money(o.amount)).join(', '))+'</span></div>');
    }
    if(!rows.length){toast('Your settings already match the link');return}
    S.updateChanges=changes;
    document.querySelectorAll('dialog[open]').forEach(d=>d.close());
    $('update-rows').innerHTML=rows.join(''); $('dlg-update').showModal();
  }
  $('update-form').addEventListener('submit',async ev=>{
    ev.preventDefault(); if(!S.db||!S.updateChanges)return;
    const btn=$('update-apply'); btn.disabled=true;
    try{await S.db.doc('config/main').set(Object.assign({},S.cfg,S.updateChanges));S.updateChanges=null;$('dlg-update').close();toast('Settings updated')}catch(e){writeFailed(e)}
    btn.disabled=false;
  });
  window.addEventListener('hashchange',readUpdateLink);

  /* figures.json: Mark's figures kept in the repository at his request. When its stamp is new, merge it into config/main once. */
  let figuresAt=0;
  async function applyFigures(){
    if(!S.db||!S.got.cfg||!S.canWrite||Date.now()-figuresAt<60000)return; figuresAt=Date.now();
    try{
      const r=await fetch('figures.json?t='+Date.now(),{cache:'no-store'}); if(!r.ok)return;
      const f=await r.json(); if(!f||typeof f.stamp!=='string'||!f.stamp||f.stamp===S.cfg.figuresStamp)return;
      const changes={figuresStamp:f.stamp}, set=f.settings&&typeof f.settings==='object'?f.settings:{};
      Object.keys(UPD).forEach(k=>{if(k in set){const v=cleanUpd(k,set[k]);if(v!==undefined)changes[k]=v}});
      if(Array.isArray(f.outgoings)){
        const merged=(Array.isArray(S.cfg.outgoings)?S.cfg.outgoings:[]).map(x=>({name:x.name,amount:Number(x.amount)}));
        f.outgoings.filter(o=>o&&typeof o.name==='string'&&Number(o.amount)>0).slice(0,30).forEach(o=>{const n={name:o.name.slice(0,40),amount:Number(o.amount)};const i=merged.findIndex(x=>x.name.trim().toLowerCase()===n.name.trim().toLowerCase());if(i>=0)merged[i]=n;else merged.push(n)});
        changes.outgoings=merged;
      }
      if(f.netPaid&&typeof f.netPaid==='object'){const np=Object.assign({},S.cfg.netPaid||{});Object.keys(f.netPaid).forEach(k=>{if(/^\d{4}-\d{2}$/.test(k)&&Number(f.netPaid[k])>=0)np[k]=Number(f.netPaid[k])});changes.netPaid=np}
      await S.db.doc('config/main').set(Object.assign({},S.cfg,changes));
      toast('Figures updated'+(typeof f.note==='string'&&f.note?': '+f.note.slice(0,80):''));
    }catch(e){}
  }
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')applyFigures()});

  $('out-edit').addEventListener('click',()=>{
    const o=(Array.isArray(S.cfg.outgoings)?S.cfg.outgoings:[]).map(x=>({name:x.name||'',amount:x.amount!=null?String(x.amount):''}));
    drawOuts(o.length?o:[{name:'',amount:''}]); $('dlg-out').showModal();
  });
  $('out-add').addEventListener('click',()=>{const r=readOuts();r.push({name:'',amount:''});drawOuts(r);const all=document.querySelectorAll('#outs [data-k="name"]');all[all.length-1].focus()});
  $('out-form').addEventListener('submit',async ev=>{
    ev.preventDefault(); if(!S.db)return;
    let firstBad=null; const bad=(el,m)=>{markBad(el,m);if(!firstBad)firstBad=el}; const list=[];
    document.querySelectorAll('#outs .out').forEach(r=>{
      const n=r.querySelector('[data-k="name"]'), a=r.querySelector('[data-k="amount"]'); clearBad(n);clearBad(a);
      if(!n.value.trim()&&!a.value.trim())return;
      const v=parseMoney(a.value);
      if(!n.value.trim())bad(n,'Missing information');
      if(!a.value.trim())bad(a,'Missing information'); else if(v===null||v<=0||v>100000)bad(a,'Check this');
      if(n.value.trim()&&v>0&&v<=100000)list.push({name:n.value.trim().slice(0,40),amount:v});
    });
    if(firstBad){firstBad.focus();return}
    const btn=$('out-save'); btn.disabled=true;
    try{await S.db.doc('config/main').set(Object.assign({},S.cfg,{outgoings:list}));$('dlg-out').close();toast('Outgoings saved')}catch(e){writeFailed(e)}
    btn.disabled=false;
  });

  /* ---------- settings ---------- */
  const numBox=v=>v===null||v===undefined?'':String(v);
  function showRate(){
    const s=parseMoney($('s-salary').value), h=parseMoney($('s-contract').value);
    $('s-rate').textContent=s>0&&h>0?money(s/52/h)+' an hour':'not set';
    $('s-hol-rate').textContent=s>0?'Holiday pay: '+money(Math.round(s/260*100)/100)+' a day (salary divided by 260 working days).':'';
  }
  function showSspEnd(){const used=S.ledger?S.ledger.sspSet.size:0;$('s-ssp-end').textContent=isYmd($('s-ssp-from').value)?'Sick pay days counted so far: '+used+' of '+(SSP_WEEKS*5)+' (28 weeks).':''}
  $('s-ssp-from').addEventListener('input',showSspEnd);$('s-ssp-from').addEventListener('change',showSspEnd);
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
    $('s-ssp-day').value=c.sspDaily?numBox(c.sspDaily):'';
    $('s-ssp-from').value=isYmd(c.sspFrom)?c.sspFrom:'';
    showSspEnd();
    $('s-mp-day').value=String(c.mpDay==null?22:c.mpDay);
    $('s-hol-left').value=c.holidayLeft==null?'':numBox(c.holidayLeft);
    $('s-mp-taxytd').value=c.mpTaxYtd==null?'':numBox(c.mpTaxYtd);
    $('s-mp-actual').value=c.mpActual?numBox(c.mpActual):'';
    $('s-pip').value=c.pipWeekly?numBox(c.pipWeekly):'';
    $('s-pip-day').value=String(c.pipDay==null?2:c.pipDay);
    $('set-form').querySelectorAll('.field input').forEach(clearBad);
    $('s-save').hidden=!S.canWrite;
    $('s-version').textContent='Version '+APP_VERSION+', '+APP_DATE+'.';
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
    const sdEl=$('s-ssp-day'), sd=opt('s-ssp-day'), sfEl=$('s-ssp-from');
    if(sd!==undefined){next.sspDaily=sd||0;
      if(next.sspDaily>0&&!isYmd(sfEl.value))bad(sfEl,'Missing information'); else next.sspFrom=next.sspDaily>0?sfEl.value:'';
      if(next.sspDaily>200)bad(sdEl,'Check this: the amount for one day');}
    const mdEl=$('s-mp-day'), md=Number(mdEl.value.trim());
    if(!/^\d{1,2}$/.test(mdEl.value.trim())||md<1||md>28)bad(mdEl,mdEl.value.trim()?'Check this: a day from 1 to 28':'Missing information'); else next.mpDay=md;
    const hlv=opt('s-hol-left'); if(hlv!==undefined){if(hlv!==S.cfg.holidayLeft)next.holidayAsOf=todayYmd();next.holidayLeft=hlv}
    const mty=opt('s-mp-taxytd'); if(mty!==undefined)next.mpTaxYtd=mty;
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
    const hol=d.holiday===true, mins=hol?0:Math.round(Number(d.mins));
    if(!hol&&(!(mins>0)||mins>1440))return null;
    const shifts=Array.isArray(d.shifts)?d.shifts.filter(s=>s&&timeMins(s.start)!==null&&timeMins(s.end)!==null&&timeMins(s.end)>timeMins(s.start)).slice(0,10).map(s=>({start:s.start,end:s.end})):[];
    return {id:id,date:d.date,mins:mins,holiday:hol,shifts:hol?[]:shifts,note:typeof d.note==='string'?d.note.slice(0,140):'',at:Number(d.at)||0};
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
      if(snap.exists)setTimeout(()=>{applyOutLink();applyUpdateLink();applyFigures()},0);
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
      for(const r of rows)await S.db.collection('hours').add({date:r.date,mins:r.mins,shifts:r.shifts,note:r.note,at:r.at||Date.now()});
      box.value=''; $('dlg-setup').close(); toast('Your details are loaded');
    }catch(e){writeFailed(e)}
    btn.disabled=false;
  });

  /* ---------- version: show it, and offer the newer one once it is live ---------- */
  let liveVersion=0;
  async function checkVersion(){
    try{
      const r=await fetch('version.json?t='+Date.now(),{cache:'no-store'}); if(!r.ok)return;
      const j=await r.json(), v=Number(j.version)||0;
      if(v>APP_VERSION){liveVersion=v;$('update-text').textContent='Version '+v+' is live. You are on version '+APP_VERSION+'.';$('update').hidden=false}
    }catch(e){}
  }
  $('update-go').addEventListener('click',()=>{location.replace(location.pathname+'?v='+(liveVersion||Date.now()))});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')checkVersion()});
  setInterval(checkVersion,10*60*1000);

  function start(){
    readOutLink();
    readUpdateLink();
    $('app-version').textContent='Version '+APP_VERSION+'.';
    checkVersion();
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
