/* ---- dates: plain YYYY-MM-DD strings, arithmetic in UTC so clocks changing never moves a day ---- */
function pad(n){return String(n).padStart(2,'0')}
function ymd(y,m,d){const t=new Date(Date.UTC(y,m,d));return t.getUTCFullYear()+'-'+pad(t.getUTCMonth()+1)+'-'+pad(t.getUTCDate())}
function parts(s){const a=s.split('-').map(Number);return {y:a[0],m:a[1]-1,d:a[2]}}
function toDate(s){const p=parts(s);return new Date(Date.UTC(p.y,p.m,p.d))}
function addDays(s,n){const p=parts(s);return ymd(p.y,p.m,p.d+n)}
function daysBetween(a,b){return Math.round((toDate(b)-toDate(a))/864e5)}
function weekday(s){return toDate(s).getUTCDay()}
function mondayOf(s){return addDays(s,-((weekday(s)+6)%7))}
function isYmd(s){return typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&!isNaN(toDate(s))}

/* Pay cycle: the 14th to the 13th, paid around the 25th of the month it ends in. */
var CYCLE_START=14, PAY_DAY=25;
function cycleOf(s){
  const p=parts(s), sm=p.d>=CYCLE_START?p.m:p.m-1;
  const start=ymd(p.y,sm,CYCLE_START), sp=parts(start);
  const end=ymd(sp.y,sp.m+1,CYCLE_START-1), ep=parts(end);
  return {start:start,end:end,pay:ymd(ep.y,ep.m,PAY_DAY)};
}
function taxYearOf(s){const p=parts(s);return (p.m>3||(p.m===3&&p.d>=6))?p.y:p.y-1}
function taxMonthOf(s){const p=parts(s);let m=((p.m-3+12)%12)+1;if(p.d<6)m=m===1?12:m-1;return m}

/* ---- 2026 to 2027 rates, England, Wales and Northern Ireland ---- */
var TAX={basicBand:37700,higherLimit:125140,niLower:1048,niUpper:4189};
function floor2(n){return Math.floor(n*100+1e-6)/100}
function round2(n){return Math.round(n*100)/100}

function parseCode(raw){
  let c=String(raw==null?'':raw).toUpperCase().replace(/\s+/g,''), cumulative=true;
  const nc=c.match(/(WEEK1\/MONTH1|W1\/M1|W1M1|W1|M1|X)$/);
  if(nc){cumulative=false;c=c.slice(0,-nc[0].length)}
  c=c.replace(/^[SC](?=[0-9KBD])/,'');
  if(c==='BR')return {kind:'flat',rate:.2};
  if(c==='D0')return {kind:'flat',rate:.4};
  if(c==='D1')return {kind:'flat',rate:.45};
  if(c==='NT')return {kind:'flat',rate:0};
  if(c==='0T')return {kind:'allow',allowance:0,cumulative:cumulative};
  let m=c.match(/^K(\d{1,5})$/);
  if(m)return {kind:'allow',allowance:-(Number(m[1])*10),cumulative:cumulative};
  m=c.match(/^(\d{1,5})[LMNT]$/);
  if(m)return {kind:'allow',allowance:Number(m[1])*10+9,cumulative:cumulative};
  return null;
}
/* Tax due on pay over `months` tax months (1 = one month on its own). */
function taxDue(pay,months,code){
  if(!code)code={kind:'allow',allowance:12579};
  if(code.kind==='flat')return floor2(Math.max(0,pay)*code.rate);
  const f=months/12, t=Math.max(0,Math.floor(pay-code.allowance*f+1e-6));
  const b1=TAX.basicBand*f, b2=TAX.higherLimit*f;
  return floor2(.2*Math.min(t,b1)+.4*Math.max(0,Math.min(t,b2)-b1)+.45*Math.max(0,t-b2));
}
function niDue(gross){
  return round2(.08*Math.max(0,Math.min(gross,TAX.niUpper)-TAX.niLower)+.02*Math.max(0,gross-TAX.niUpper));
}
function hourlyRate(cfg){return cfg.salary>0&&cfg.contractHours>0?cfg.salary/52/cfg.contractHours:0}

/* One cycle's pay. `base` is the year so far before this pay day, when it is known. */
function payFor(mins,rate,cfg,code,base,month){
  const gross=round2(mins/60*rate), pens=round2(gross*(cfg.pensionPct||0)/100), taxable=gross-pens;
  let tax,basis,cumAfter=0,paidAfter=0;
  if(base){cumAfter=base.cum+taxable;paidAfter=taxDue(cumAfter,month,code);tax=round2(paidAfter-base.paid);basis='year'}
  else{tax=taxDue(taxable,1,code);basis=code&&code.kind==='flat'?'flat':'month'}
  const ni=niDue(gross);
  return {mins:mins,gross:gross,pens:pens,tax:tax,ni:ni,net:round2(gross-pens-tax-ni),basis:basis,cumAfter:cumAfter,paidAfter:paidAfter};
}
function pensionNet(cfg){
  if(cfg.mpActual>0)return {net:round2(cfg.mpActual),actual:true};
  const g=(cfg.mpGross||0)/12;
  return {net:round2(g-taxDue(g,1,parseCode(cfg.mpCode))),actual:false};
}
function countWeekday(start,end,wd){let n=0;for(let d=start;d<=end;d=addDays(d,1))if(weekday(d)===wd)n++;return n}

function buildLedger(entries,cfg,today){
  const rate=hourlyRate(cfg), code=parseCode(cfg.maTaxCode), cur=cycleOf(today);
  const byCycle=new Map(); let first=cur.start,last=cur.start;
  for(const e of entries){
    const k=cycleOf(e.date).start;
    byCycle.set(k,(byCycle.get(k)||0)+e.mins);
    if(k<first)first=k; if(k>last)last=k;
  }
  let anchor=null;
  if(isYmd(cfg.ytdDate)&&cfg.ytdTaxable>=0&&cfg.ytdTax>=0&&cfg.ytdTaxable!==null&&cfg.ytdTax!==null)
    anchor={payDate:cfg.ytdDate,cum:cfg.ytdTaxable,paid:cfg.ytdTax,ty:taxYearOf(cfg.ytdDate),m:taxMonthOf(cfg.ytdDate)};
  const pn=pensionNet(cfg), target=cfg.target||0;
  const cycles=[]; let chain=null, stale=false;
  for(let c=cycleOf(first);c.start<=last;c=cycleOf(addDays(c.end,1))){
    const mins=byCycle.get(c.start)||0, ty=taxYearOf(c.pay), m=taxMonthOf(c.pay);
    let base=null;
    if(code&&code.kind==='allow'&&code.cumulative){
      if(anchor&&anchor.ty===ty&&c.pay>anchor.payDate&&!(chain&&chain.ty===ty&&chain.fromAnchor)){
        if(m===anchor.m+1)chain={ty:ty,cum:anchor.cum,paid:anchor.paid,fromAnchor:true};
        else{chain={ty:ty,broken:true,fromAnchor:true};stale=true}
      }else if(!chain||chain.ty!==ty){
        chain=m===1?{ty:ty,cum:0,paid:0}:{ty:ty,broken:true};
      }
      if(!chain.broken)base={cum:chain.cum,paid:chain.paid};
    }
    const pay=payFor(mins,rate,cfg,code,base,m);
    const row=Object.assign({start:c.start,end:c.end,pay:c.pay,ty:ty},pay);
    if(c.start===cur.start&&target>0){
      const left=Math.max(0,daysBetween(today,c.end));
      row.daysLeft=left;
      row.projected=payFor(Math.round(mins+target*60/7*left),rate,cfg,code,base,m);
    }
    if(base){chain.cum=pay.cumAfter;chain.paid=pay.paidAfter}
    row.pension=pn.net; row.pensionActual=pn.actual;
    row.pipCount=countWeekday(c.start,c.end,cfg.pipDay==null?2:cfg.pipDay);
    row.pip=round2(row.pipCount*(cfg.pipWeekly||0));
    row.total=round2(row.net+row.pension+row.pip);
    cycles.push(row);
  }
  return {cycles:cycles,current:cur,rate:rate,codeOk:!!code,stale:stale};
}
function parseHours(str){
  const s=String(str||'').trim().toLowerCase().replace(',','.');
  if(!s)return null;
  let m=s.match(/^(\d{1,2}):([0-5]\d)$/), h=null;
  if(m)h=Number(m[1])+Number(m[2])/60;
  else if(/^\d{1,2}(\.\d{1,2})?$/.test(s))h=Number(s);
  else{
    m=s.match(/^(?:(\d{1,2}(?:\.\d{1,2})?)\s*h(?:ours?|rs?)?)?\s*(?:(\d{1,3})\s*m(?:ins?|inutes?)?)?$/);
    if(m&&(m[1]||m[2]))h=Number(m[1]||0)+Number(m[2]||0)/60;
  }
  if(h===null||!(h>0)||h>24)return null;
  return Math.round(h*60);
}
function parseMoney(str){
  const s=String(str==null?'':str).replace(/[£,\s]/g,'');
  if(!/^\d+(\.\d{1,2})?$/.test(s))return null;
  return Number(s);
}
