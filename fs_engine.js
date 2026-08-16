/* FANTASCAM — FS ENGINE V3.0
   Fasce strutturali P/D/C/A + valore di reparto + modificatore + pacchetti.
*/
(() => {
  const BAND_ORDER=["ELITE","TOP","ALTA","MEDIA","BASSA","RISERVA"];
  const BAND_BASE={ELITE:96,TOP:86,ALTA:74,MEDIA:61,BASSA:47,RISERVA:29};

  // Ambiente difensivo iniziale per i portieri.
  // In seguito sarà aggiornato automaticamente dal layer dati.
  const GK_ENV={
    "Inter":1.14,"Milan":1.12,"Napoli":1.11,"Juventus":1.10,"Roma":1.09,"Atalanta":1.08,
    "Bologna":1.04,"Lazio":1.03,"Fiorentina":1.00,"Como":1.00,"Torino":.99,"Udinese":.97,
    "Genoa":.96,"Sassuolo":.95,"Parma":.94,"Cagliari":.93,"Lecce":.92,
    "Frosinone":.91,"Monza":.90,"Venezia":.89
  };

  const rankedPeers=role=>(byRole[role]||[])
    .filter(x=>(Number(x.fvm)||0)>3)
    .slice()
    .sort((a,b)=>(Number(b.fvm)||0)-(Number(a.fvm)||0)||(Number(b.quote)||0)-(Number(a.quote)||0));

  const roleRank=p=>{
    const peers=rankedPeers(p.role);
    const i=peers.findIndex(x=>String(x.id)===String(p.id));
    return i<0?999:i+1;
  };

  window.fsBand=p=>{
    const rk=roleRank(p),r=p.role,mr=String(p.mantraRole||"");

    if(r==="P"){
      if(rk<=2)return "ELITE";
      if(rk<=5)return "TOP";
      if(rk<=8)return "ALTA";
      if(rk<=12)return "MEDIA";
      if(rk<=16)return "BASSA";
      return "RISERVA";
    }

    if(r==="D"){
      let b=rk<=3?"ELITE":rk<=10?"TOP":rk<=24?"ALTA":rk<=45?"MEDIA":rk<=70?"BASSA":"RISERVA";
      if((mr.includes("E")||mr.includes("W"))&&b==="ALTA"&&rk<=16)b="TOP";
      else if((mr.includes("E")||mr.includes("W"))&&b==="MEDIA")b="ALTA";
      return b;
    }

    if(r==="C"){
      return rk<=4?"ELITE":rk<=14?"TOP":rk<=32?"ALTA":rk<=60?"MEDIA":rk<=90?"BASSA":"RISERVA";
    }

    if(r==="A"){
      return rk<=3?"ELITE":rk<=10?"TOP":rk<=20?"ALTA":rk<=34?"MEDIA":rk<=50?"BASSA":"RISERVA";
    }

    return "MEDIA";
  };

  const slotScore=p=>{
    const b=window.fsBand(p),r=p.role,mr=String(p.mantraRole||"");
    let s=BAND_BASE[b];

    const peers=rankedPeers(r).filter(x=>window.fsBand(x)===b);
    const pos=peers.findIndex(x=>String(x.id)===String(p.id));
    if(peers.length>1 && pos>=0)s+=3.5-(7*(pos/(peers.length-1)));

    if(r==="P"){
      s*=GK_ENV[p.team]||.95;
    }else if(r==="D"){
      if(mr.includes("E")||mr.includes("W"))s+=5;
      else if(mr.includes("Dd")||mr.includes("Ds"))s+=2;
      else if(mr==="Dc")s-=3;
    }else if(r==="C"){
      if(mr.includes("A")||mr.includes("W"))s+=3;
      else if(mr.includes("T"))s+=2;
    }

    return Math.max(8,Math.min(100,s));
  };

  const performance=p=>{
    const md=Number(META.matchday)||0;
    const cap=typeof fmStageCap==="function"?fmStageCap(md):0;
    const fm=Number(p.fm),mv=Number(p.mv),pv=Number(p.pv);
    if(cap<=0||!Number.isFinite(fm)||!Number.isFinite(pv)||pv<=0)return 1;

    const reliability=Math.min(1,pv/Math.max(3,md*.60));
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
    const f=Number(p.fvm)||0;
    if(f<=3)return 0;

    // Dentro lo stesso reparto l'FVM continua a distinguere i giocatori,
    // ma la fascia impedisce che pochi punti FVM rendano quasi equivalenti due slot diversi.
    const structural=slotScore(p);
    const fvmSignal=Math.pow(f,0.34);
    return structural*fvmSignal*performance(p);
  };

  window.packageValue=list=>{
    // Il secondo/terzo giocatore non vale mai quanto il primo in uno scambio.
    const weights=[1,.68,.50,.38,.30];
    return list.map(window.adjustedValue).sort((a,b)=>b-a)
      .reduce((s,v,i)=>s+v*(weights[i]??.26),0);
  };

  const oneToOneFair=(a,b)=>{
    let fair=Math.min(slotScore(a),slotScore(b))/Math.max(slotScore(a),slotScore(b))*100;
    const ba=BAND_ORDER.indexOf(window.fsBand(a));
    const bb=BAND_ORDER.indexOf(window.fsBand(b));
    const gap=Math.abs(ba-bb);

    if(a.role===b.role){
      if(gap>=2)fair*=.82;
      else if(gap===1)fair*=.88;

      if(a.role==="P"){
        const rg=Math.abs(roleRank(a)-roleRank(b));
        if(rg>=6)fair*=.90;
        else if(rg>=3)fair*=.95;
      }
    }else{
      if(gap>=3)fair*=.88;
      else if(gap===2)fair*=.93;
      else if(gap===1)fair*=.97;
    }

    // Regola strutturale P vs D:
    // un P titolare top-12 non può essere quasi equivalente a un Dc normale.
    if((a.role==="P"&&b.role==="D")||(b.role==="P"&&a.role==="D")){
      const k=a.role==="P"?a:b;
      const d=a.role==="D"?a:b;
      const kr=roleRank(k);
      const db=window.fsBand(d);
      const mr=String(d.mantraRole||"");

      if(kr<=12&&mr==="Dc"){
        let cap=86;
        if(kr<=5)cap=(db==="ELITE"||db==="TOP")?82:76;
        else if(kr<=8)cap=(db==="ELITE"||db==="TOP")?86:80;
        else cap=(db==="ELITE"||db==="TOP")?89:84;
        fair=Math.min(fair,cap);
      }
    }

    return Math.max(0,Math.min(100,fair));
  };

  window.fsTier=window.fsBand;

  window.updateMeta=row=>{
    const p=getPlayer(row.querySelector(".footballer").value),box=row.querySelector(".meta");
    if(!p){box.innerHTML='<span class="empty">Seleziona un giocatore</span>';return}

    const fm=(p.fm!==null&&p.fm!==undefined)?`<span class="chip">FM ${Number(p.fm).toFixed(2)}</span>`:"";
    const pv=(p.pv!==null&&p.pv!==undefined)?`<span class="chip">PV ${p.pv}</span>`:"";

    box.innerHTML=
      `${TOP30_IDS.has(String(p.id))?'<span class="chip top30">🏆 TOP 30</span>':''}`+
      `<span class="chip" title="${p.team}">${teamAbbr(p.team)}</span>`+
      `<span class="chip">Q ${p.quote}</span>`+
      `<span class="chip top30">FS ${Math.round(slotScore(p))}</span>`+
      `<span class="chip">FASCIA ${window.fsBand(p)}</span>${fm}${pv}`;
  };

  const reasons=(A,B)=>{
    const out=[];
    if(A.length===1&&B.length===1){
      const a=A[0],b=B[0];
      out.push(`${window.fsBand(a)} vs ${window.fsBand(b)}`);
      if(a.role==="P"||b.role==="P")out.push("gerarchia portieri");
      const d=a.role==="D"?a:b.role==="D"?b:null;
      if(d){
        const mr=String(d.mantraRole||"");
        if(mr==="Dc")out.push("Dc puro");
        else if(mr.includes("E")||mr.includes("W"))out.push("difensore offensivo");
      }
    }else{
      out.push("valore marginale decrescente del pacchetto");
    }
    return out.join(" • ");
  };

  window.calculate=()=>{
    const A=sidePlayers("A"),B=sidePlayers("B"),
      s=document.getElementById("score"),v=document.getElementById("verdict"),
      va=document.getElementById("valueA"),vb=document.getElementById("valueB"),
      d=document.getElementById("detail");

    v.className="verdict";

    if(!A.length||!B.length){
      lastVerdictSound="";
      s.textContent="—";
      v.textContent="Seleziona almeno un giocatore per parte";
      va.textContent=A.length?window.packageValue(A).toFixed(0):"—";
      vb.textContent=B.length?window.packageValue(B).toFixed(0):"—";
      return;
    }

    const one=A.length===1&&B.length===1;
    const a=window.packageValue(A),b=window.packageValue(B);

    let fair=one?oneToOneFair(A[0],B[0]):Math.min(a,b)/Math.max(a,b)*100;
    fair=Math.max(0,Math.min(100,fair));

    const stronger=a>b?"A":"B";
    const diff=100-fair;

    s.textContent=fair.toFixed(0)+"%";
    va.textContent=a.toFixed(0);
    vb.textContent=b.toFixed(0);

    const sameRole=one&&A[0].role===B[0].role;
    const keeperCross=one&&!sameRole&&(A[0].role==="P"||B[0].role==="P");

    let acc=65,eq=82;
    if(one&&sameRole){acc=78;eq=90;}
    else if(keeperCross){acc=83;eq=92;}
    else if(one){acc=75;eq=88;}

    const expl=reasons(A,B);

    if(fair>=eq){
      const key=`good-${A.map(x=>x.id).join(",")}-${B.map(x=>x.id).join(",")}`;
      if(key!==lastVerdictSound){
        lastVerdictSound=key;
        if(typeof playMiracleSound==="function")playMiracleSound();
        if(typeof showHereWeGo==="function")showHereWeGo();
      }
      v.textContent="✅ SCAMBIO EQUO";
      v.classList.add("good");
      d.textContent=`FANTASCAM: valori realmente compatibili. ${expl}`;
    }else if(fair>=acc){
      if(typeof soundVerdict==="function")
        soundVerdict("warn",`warn-${A.map(x=>x.id).join(",")}-${B.map(x=>x.id).join(",")}`);
      v.textContent="🟡 SCAMBIO ACCETTABILE";
      v.classList.add("warn");
      d.textContent=`Vantaggio Squadra ${stronger}. ${expl}`;
    }else{
      if(typeof soundVerdict==="function")
        soundVerdict("bad",`bad-${A.map(x=>x.id).join(",")}-${B.map(x=>x.id).join(",")}`);
      v.textContent="🚨 FANTASCAM!! 🚨";
      v.classList.add("bad");
      d.textContent=`Squilibrio netto (circa ${diff.toFixed(0)}%). Vantaggio Squadra ${stronger}. ${expl}`;
    }
  };

  document.querySelectorAll(".player").forEach(row=>window.updateMeta(row));
  window.calculate();
  console.info("FANTASCAM FS Engine V3.0 active");
})();
