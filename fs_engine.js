/* FANTASCAM — FS ENGINE V2 */
(() => {
  const rolePct=p=>{
    const peers=(byRole[p.role]||[]).filter(x=>(Number(x.fvm)||0)>3).slice()
      .sort((a,b)=>(Number(a.fvm)||0)-(Number(b.fvm)||0));
    if(peers.length<2)return .5;
    const pos=peers.findIndex(x=>String(x.id)===String(p.id));
    return pos<0?.5:pos/(peers.length-1);
  };
  const scarcity=p=>{
    const q=rolePct(p),r=p.role;
    if(r==="P")return q>=.95?1.34:q>=.85?1.24:q>=.70?1.13:q>=.50?1.05:1;
    if(r==="D")return q>=.97?1.22:q>=.90?1.15:q>=.75?1.08:q>=.55?1.03:1;
    if(r==="C")return q>=.97?1.10:q>=.90?1.06:q>=.75?1.03:1;
    if(r==="A")return q>=.97?1.11:q>=.90?1.07:q>=.75?1.03:1;
    return 1;
  };
  const profile=p=>{
    const mr=String(p.mantraRole||"");
    if(p.role==="D"){
      if(mr.includes("E")||mr.includes("W"))return 1.08;
      if(mr.includes("Dd")||mr.includes("Ds"))return 1.03;
      if(mr==="Dc")return .96;
    }
    if(p.role==="C"){
      if(mr.includes("A")||mr.includes("W"))return 1.06;
      if(mr.includes("T"))return 1.04;
      if(mr.includes("C"))return 1.01;
      if(mr==="M")return .98;
    }
    return 1;
  };
  const topFloor=p=>{
    const q=rolePct(p);
    return q>=.99?1.10:q>=.96?1.07:q>=.90?1.04:1;
  };
  const performance=p=>{
    const md=Number(META.matchday)||0;
    const cap=typeof fmStageCap==="function"?fmStageCap(md):0;
    const fm=Number(p.fm),mv=Number(p.mv),pv=Number(p.pv);
    if(cap<=0||!Number.isFinite(fm)||!Number.isFinite(pv)||pv<=0)return 1;
    const required=Math.max(3,md*.60),reliability=Math.min(1,pv/required);
    const signal=Math.max(-1,Math.min(1,(fm-6)/2.5));
    let mult=1+(cap*reliability*signal);
    if(p.role==="D"&&Number.isFinite(mv)&&pv>=4){
      const gap=fm-mv;
      if(mv>=6.25)mult*=1.025;
      if(mv>=6.45)mult*=1.025;
      if(gap>=.25)mult*=1.025;
    }
    return mult;
  };
  window.adjustedValue=p=>{
    const base=Number(p.fvm)||0;
    if(base<=3)return 0;
    return Math.pow(base,1.10)*scarcity(p)*profile(p)*topFloor(p)*performance(p);
  };
  window.packageValue=list=>{
    const weights=[1,.74,.58,.46,.38];
    return list.map(window.adjustedValue).sort((a,b)=>b-a)
      .reduce((sum,v,i)=>sum+v*(weights[i]??.32),0);
  };
  window.roleStandingMultiplier=p=>{
    const q=rolePct(p);let mult=.78+.42*q;
    if(p.role==="P"&&q>=.90)mult*=1.08;
    if(p.role==="D"&&q>=.95)mult*=1.04;
    return mult;
  };
  window.fsTier=p=>{
    const q=rolePct(p);
    return q>=.99?"S+":q>=.96?"S":q>=.90?"A+":q>=.78?"A":q>=.58?"B":q>=.35?"C":"D";
  };
  window.updateMeta=row=>{
    const p=getPlayer(row.querySelector(".footballer").value),box=row.querySelector(".meta");
    if(!p){box.innerHTML='<span class="empty">Seleziona un giocatore</span>';return}
    const fm=(p.fm!==null&&p.fm!==undefined)?`<span class="chip">FM ${Number(p.fm).toFixed(2)}</span>`:"";
    const pv=(p.pv!==null&&p.pv!==undefined)?`<span class="chip">PV ${p.pv}</span>`:"";
    const fsv=Number(p.fsValue)||Math.round(window.adjustedValue(p));
    box.innerHTML=`${TOP30_IDS.has(String(p.id))?'<span class="chip top30">🏆 TOP 30</span>':''}<span class="chip" title="${p.team}">${teamAbbr(p.team)}</span><span class="chip">Q ${p.quote}</span><span class="chip top30">FS ${fsv}</span><span class="chip">TIER ${window.fsTier(p)}</span>${fm}${pv}`;
  };
  window.calculate=()=>{
    const A=sidePlayers("A"),B=sidePlayers("B"),s=document.getElementById("score"),
      v=document.getElementById("verdict"),va=document.getElementById("valueA"),
      vb=document.getElementById("valueB"),d=document.getElementById("detail");
    v.className="verdict";
    if(!A.length||!B.length){
      lastVerdictSound="";s.textContent="—";v.textContent="Seleziona almeno un giocatore per parte";
      va.textContent=A.length?window.packageValue(A).toFixed(0):"—";
      vb.textContent=B.length?window.packageValue(B).toFixed(0):"—";return;
    }
    let a=window.packageValue(A),b=window.packageValue(B);
    const one=A.length===1&&B.length===1,cross=one&&A[0].role!==B[0].role;
    if(cross){a*=window.roleStandingMultiplier(A[0]);b*=window.roleStandingMultiplier(B[0]);}
    const fair=Math.min(a,b)/Math.max(a,b)*100,diff=Math.abs(a-b)/Math.max(a,b)*100,stronger=a>b?"A":"B";
    s.textContent=fair.toFixed(0)+"%";va.textContent=a.toFixed(0);vb.textContent=b.toFixed(0);
    const acc=cross?75:(one?70:65),eq=cross?86:82;
    if(fair>=eq){
      const key=`good-${A.map(x=>x.id).join(",")}-${B.map(x=>x.id).join(",")}`;
      if(key!==lastVerdictSound){
        lastVerdictSound=key;
        if(typeof playMiracleSound==="function")playMiracleSound();
        if(typeof showHereWeGo==="function")showHereWeGo();
        else if(typeof playTradeSound==="function")playTradeSound("good");
      }
      v.textContent="✅ SCAMBIO EQUO";v.classList.add("good");
      d.textContent="FANTASCAM: pacchetti compatibili per FS Value, tier e scarsità nel ruolo.";
    }else if(fair>=acc){
      if(typeof soundVerdict==="function")soundVerdict("warn",`warn-${A.map(x=>x.id).join(",")}-${B.map(x=>x.id).join(",")}`);
      v.textContent="🟡 SCAMBIO ACCETTABILE";v.classList.add("warn");
      d.textContent=`FANTASCAM rileva un vantaggio per la Squadra ${stronger} di circa ${diff.toFixed(0)}%, ma non sufficiente per classificarlo come SCAM.`;
    }else{
      if(typeof soundVerdict==="function")soundVerdict("bad",`bad-${A.map(x=>x.id).join(",")}-${B.map(x=>x.id).join(",")}`);
      v.textContent="🚨 FANTASCAM!! 🚨";v.classList.add("bad");
      d.textContent=`Vantaggio netto Squadra ${stronger} (circa ${diff.toFixed(0)}%). Tier, scarsità, modificatore e rendimento marginale dei pacchetti inclusi.`;
    }
  };
  document.querySelectorAll(".player").forEach(row=>window.updateMeta(row));
  window.calculate();
  console.info("FANTASCAM FS Engine V2 active");
})();
