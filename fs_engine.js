/* FANTASCAM — FS ENGINE V4.0
   Algoritmo proprietario: il listone e' solo un segnale secondario.
   La fantamedia entra progressivamente dalla 10a giornata ed e' corretta per presenze.
*/
(() => {
  const BANDS=["ELITE","TOP","ALTA","MEDIA","BASSA","RISERVA"];

  // Forza squadra: prior proprietario, separato dal listone.
  const TEAM={
    Inter:{def:96,att:94}, Milan:{def:91,att:92}, Napoli:{def:92,att:91},
    Juventus:{def:90,att:89}, Roma:{def:89,att:90}, Atalanta:{def:88,att:92},
    Bologna:{def:84,att:83}, Lazio:{def:83,att:85}, Fiorentina:{def:80,att:84},
    Como:{def:79,att:83}, Torino:{def:78,att:76}, Udinese:{def:74,att:73},
    Genoa:{def:73,att:70}, Sassuolo:{def:70,att:75}, Parma:{def:69,att:70},
    Cagliari:{def:67,att:68}, Lecce:{def:64,att:64}, Frosinone:{def:62,att:64},
    Monza:{def:61,att:62}, Venezia:{def:59,att:60}
  };

  const clamp=(x,a=0,b=100)=>Math.max(a,Math.min(b,x));
  const team=p=>TEAM[p.team]||{def:68,att:68};
  const num=(x,d=0)=>Number.isFinite(Number(x))?Number(x):d;

  // Il mercato/listone pesa poco e solo come prior.
  const marketSignal=p=>{
    const f=num(p.fvm),q=num(p.quote);
    return clamp(18*Math.log1p(f)+10*Math.log1p(q),10,100);
  };

  // Presenze/titolarita': usa pv se disponibile; prima dei dati reali usa un prior prudente.
  const availability=p=>{
    const md=Math.max(1,num(META&&META.matchday,1));
    const pv=num(p.pv,-1);
    if(pv>=0){
      const rate=clamp(pv/md,0,1);
      return 35+65*rate;
    }
    // Il listone non assegna il valore: qui aiuta solo a distinguere probabile titolare/riserva.
    const q=num(p.quote);
    return q>=8?82:q>=5?70:q>=3?55:32;
  };

  const fmWeight=()=>{
    const md=num(META&&META.matchday,0);
    if(md<6)return 0;
    if(md<10)return .03;
    if(md<15)return .10;
    if(md<21)return .15;
    return .20;
  };

  const formSignal=p=>{
    const md=Math.max(1,num(META&&META.matchday,1));
    const pv=num(p.pv,0),fm=num(p.fm,NaN),mv=num(p.mv,NaN);
    if(!Number.isFinite(fm)||pv<=0)return 50;

    // Affidabilita' della FM: una media su poche presenze pesa poco.
    const expected=Math.max(4,md*.75);
    const reliability=clamp(pv/expected,0,1);
    const fmScore=clamp(50+(fm-6)*24,15,100);
    let score=50+(fmScore-50)*reliability;

    // P/D: media voto pura utile per modificatore.
    if((p.role==="P"||p.role==="D")&&Number.isFinite(mv)){
      const mvScore=clamp(50+(mv-6)*30,15,100);
      score=.60*score+.40*(50+(mvScore-50)*reliability);
    }
    return clamp(score);
  };

  const roleProfile=p=>{
    const mr=String(p.mantraRole||"");
    if(p.role==="P")return 70;
    if(p.role==="D"){
      if(mr.includes("W")||mr.includes("E"))return 92;
      if(mr.includes("Dd")||mr.includes("Ds"))return 78;
      if(mr==="Dc")return 62;
      return 70;
    }
    if(p.role==="C"){
      if(mr.includes("A")||mr.includes("W"))return 94;
      if(mr.includes("T"))return 88;
      if(mr.includes("C"))return 74;
      if(mr==="M")return 60;
      return 70;
    }
    if(p.role==="A"){
      // A/Pc e profili offensivi sono naturalmente piu' centrali.
      if(mr.includes("Pc"))return 94;
      if(mr.includes("A"))return 90;
      return 84;
    }
    return 60;
  };

  const roleScore=p=>{
    const t=team(p),avail=availability(p),prof=roleProfile(p),mkt=marketSignal(p);
    const form=formSignal(p),fw=fmWeight();

    let base;
    if(p.role==="P"){
      // P: titolarita + difesa + modificatore/form + piccolo prior mercato.
      base=.34*avail+.31*t.def+.22*prof+.08*mkt+.05*50;
    }else if(p.role==="D"){
      // D: titolarita + profilo offensivo/modificatore + difesa squadra.
      base=.29*avail+.25*prof+.21*t.def+.17*t.att+.08*mkt;
    }else if(p.role==="C"){
      // C: centralita offensiva + titolarita + forza attacco.
      base=.28*avail+.31*prof+.25*t.att+.08*t.def+.08*mkt;
    }else{
      // A: centralita offensiva e attacco squadra dominano.
      base=.27*avail+.36*prof+.27*t.att+.10*mkt;
    }

    // Dalla 10a giornata la forma sostituisce progressivamente una parte del prior.
    return clamp(base*(1-fw)+form*fw,5,100);
  };

  // Scala comune: rende confrontabili P/D/C/A senza fingere che "MEDIA" significhi la stessa cosa.
  const commonValue=p=>{
    const s=roleScore(p);
    const roleFactor={P:1.08,D:.96,C:1.00,A:1.03}[p.role]||1;
    return clamp(s*roleFactor,5,100);
  };

  const peers=role=>(byRole[role]||[]).filter(p=>num(p.quote)>0||num(p.fvm)>0)
    .slice().sort((a,b)=>roleScore(b)-roleScore(a));

  window.fsBand=p=>{
    const arr=peers(p.role);
    const i=arr.findIndex(x=>String(x.id)===String(p.id));
    const pct=i<0?1:i/Math.max(1,arr.length-1);
    return pct<=.05?"ELITE":pct<=.15?"TOP":pct<=.32?"ALTA":pct<=.58?"MEDIA":pct<=.80?"BASSA":"RISERVA";
  };

  window.fsTier=window.fsBand;
  window.adjustedValue=p=>commonValue(p);

  window.packageValue=list=>{
    // Quantity tax: il secondo/terzo nome non vale come il primo.
    const weights=[1,.62,.43,.31,.24];
    return list.map(commonValue).sort((a,b)=>b-a)
      .reduce((s,v,i)=>s+v*(weights[i]??.20),0);
  };

  const oneFair=(a,b)=>{
    let fair=Math.min(commonValue(a),commonValue(b))/Math.max(commonValue(a),commonValue(b))*100;
    const ba=BANDS.indexOf(window.fsBand(a)),bb=BANDS.indexOf(window.fsBand(b));
    const gap=Math.abs(ba-bb);

    if(gap>=3)fair*=.78;
    else if(gap===2)fair*=.86;
    else if(gap===1)fair*=.94;

    // Portiere top-12 vs Dc: protezione strutturale del modificatore/scarsita'.
    if((a.role==="P"&&b.role==="D")||(b.role==="P"&&a.role==="D")){
      const k=a.role==="P"?a:b,d=a.role==="D"?a:b;
      const kr=peers("P").findIndex(x=>String(x.id)===String(k.id))+1;
      const mr=String(d.mantraRole||"");
      if(kr>0&&kr<=12&&mr==="Dc"){
        const db=window.fsBand(d);
        const cap=kr<=5?(db==="ELITE"||db==="TOP"?82:74):
                  kr<=8?(db==="ELITE"||db==="TOP"?86:79):
                  (db==="ELITE"||db==="TOP"?89:83);
        fair=Math.min(fair,cap);
      }
    }

    // P medio vs A medio non sono automaticamente equivalenti:
    // la fascia e' relativa al reparto; decide il commonValue proprietario.
    return clamp(fair);
  };

  const packageFair=(A,B)=>{
    const av=window.packageValue(A),bv=window.packageValue(B);
    let fair=Math.min(av,bv)/Math.max(av,bv)*100;

    if(A.length!==B.length){
      const single=A.length===1?A[0]:(B.length===1?B[0]:null);
      const pack=A.length===1?B:(B.length===1?A:null);
      if(single&&pack){
        const star=commonValue(single),anchor=Math.max(...pack.map(commonValue));
        const band=window.fsBand(single);
        if(band==="ELITE"){
          if(anchor<star-10)fair*=.70;
          else if(anchor<star-5)fair*=.82;
        }else if(band==="TOP"){
          if(anchor<star-10)fair*=.78;
          else if(anchor<star-5)fair*=.88;
        }
        if(pack.length===2)fair*=.96;
        if(pack.length>=3)fair*=.87;
      }
    }
    return clamp(fair);
  };

  window.updateMeta=row=>{
    const p=getPlayer(row.querySelector(".footballer").value),box=row.querySelector(".meta");
    if(!p){box.innerHTML='<span class="empty">Seleziona un giocatore</span>';return}
    const fm=(p.fm!==null&&p.fm!==undefined)?`<span class="chip">FM ${num(p.fm).toFixed(2)}</span>`:"";
    const pv=(p.pv!==null&&p.pv!==undefined)?`<span class="chip">PV ${p.pv}</span>`:"";
    box.innerHTML=
      `${TOP30_IDS.has(String(p.id))?'<span class="chip top30">🏆 TOP 30</span>':''}`+
      `<span class="chip" title="${p.team}">${teamAbbr(p.team)}</span>`+
      `<span class="chip">Q ${p.quote}</span>`+
      `<span class="chip top30">FS ${Math.round(commonValue(p))}</span>`+
      `<span class="chip">FASCIA ${window.fsBand(p)}</span>${fm}${pv}`;
  };

  const reason=(A,B)=>{
    if(A.length!==1||B.length!==1)return "Valore del pacchetto corretto per qualita' e costo degli slot rosa.";
    const a=A[0],b=B[0],out=[];
    out.push(`${window.fsBand(a)} ${a.role} vs ${window.fsBand(b)} ${b.role}`);
    if(a.role!==b.role)out.push("modelli di reparto differenti");
    if(num(META&&META.matchday,0)>=10)out.push("fantamedia pesata per presenze");
    else out.push("fantamedia ancora marginale");
    return out.join(" • ");
  };

  window.calculate=()=>{
    const A=sidePlayers("A"),B=sidePlayers("B"),
      s=document.getElementById("score"),v=document.getElementById("verdict"),
      va=document.getElementById("valueA"),vb=document.getElementById("valueB"),
      d=document.getElementById("detail");

    v.className="verdict";
    if(!A.length||!B.length){
      lastVerdictSound="";s.textContent="—";v.textContent="Seleziona almeno un giocatore per parte";
      va.textContent=A.length?window.packageValue(A).toFixed(0):"—";
      vb.textContent=B.length?window.packageValue(B).toFixed(0):"—";return;
    }

    const one=A.length===1&&B.length===1;
    const av=window.packageValue(A),bv=window.packageValue(B);
    const fair=one?oneFair(A[0],B[0]):packageFair(A,B);
    const stronger=av>bv?"A":"B",diff=100-fair;

    s.textContent=fair.toFixed(0)+"%";va.textContent=av.toFixed(0);vb.textContent=bv.toFixed(0);

    const same=one&&A[0].role===B[0].role;
    const crossKeeper=one&&!same&&(A[0].role==="P"||B[0].role==="P");
    let acc=67,eq=84;
    if(one&&same){acc=76;eq=90;}
    else if(crossKeeper){acc=80;eq=91;}
    else if(one){acc=73;eq=88;}

    if(fair>=eq){
      const key=`good-${A.map(x=>x.id).join(",")}-${B.map(x=>x.id).join(",")}`;
      if(key!==lastVerdictSound){
        lastVerdictSound=key;
        if(typeof playMiracleSound==="function")playMiracleSound();
        if(typeof showHereWeGo==="function")showHereWeGo();
      }
      v.textContent="✅ SCAMBIO EQUO";v.classList.add("good");
      d.textContent=`FANTASCAM V4: valori compatibili. ${reason(A,B)}`;
    }else if(fair>=acc){
      if(typeof soundVerdict==="function")soundVerdict("warn",`warn-${A.map(x=>x.id).join(",")}-${B.map(x=>x.id).join(",")}`);
      v.textContent="🟡 SCAMBIO ACCETTABILE";v.classList.add("warn");
      d.textContent=`Vantaggio Squadra ${stronger}. ${reason(A,B)}`;
    }else{
      if(typeof soundVerdict==="function")soundVerdict("bad",`bad-${A.map(x=>x.id).join(",")}-${B.map(x=>x.id).join(",")}`);
      v.textContent="🚨 FANTASCAM!! 🚨";v.classList.add("bad");
      d.textContent=`Squilibrio netto (circa ${diff.toFixed(0)}%). Vantaggio Squadra ${stronger}. ${reason(A,B)}`;
    }
  };

  document.querySelectorAll(".player").forEach(row=>window.updateMeta(row));
  window.calculate();
  console.info("FANTASCAM FS Engine V4.0 proprietary active");
})();
