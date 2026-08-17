/* FANTASCAM — FS ENGINE V6.3
   Due assi separati: STAR POWER assoluto + scarsita' di ruolo.
   Un medio di ruolo non diventa TOP solo perche' il reparto e' scarso.
*/
(() => {
  const TEAM={
    Inter:{def:96,att:94},Milan:{def:91,att:92},Napoli:{def:92,att:91},Juventus:{def:90,att:89},
    Roma:{def:89,att:90},Atalanta:{def:88,att:92},Bologna:{def:84,att:83},Lazio:{def:83,att:85},
    Fiorentina:{def:80,att:84},Como:{def:79,att:83},Torino:{def:78,att:76},Udinese:{def:74,att:73},
    Genoa:{def:73,att:70},Sassuolo:{def:70,att:75},Parma:{def:69,att:70},Cagliari:{def:67,att:68},
    Lecce:{def:64,att:64},Frosinone:{def:62,att:64},Monza:{def:61,att:62},Venezia:{def:59,att:60}
  };
  const clamp=(x,a=0,b=100)=>Math.max(a,Math.min(b,x));
  const n=(x,d=0)=>Number.isFinite(Number(x))?Number(x):d;
  const marketRaw=p=>.65*Math.log1p(n(p.fvm))+.35*Math.log1p(n(p.quote));
  const roleSorted=r=>(byRole[r]||[]).slice().sort((a,b)=>marketRaw(a)-marketRaw(b));
  const marketPct=p=>{
    const a=roleSorted(p.role),i=a.findIndex(x=>String(x.id)===String(p.id));
    return i<0?.5:i/Math.max(1,a.length-1);
  };
  const teamRank=p=>{
    const a=(byRole[p.role]||[]).filter(x=>x.team===p.team).slice().sort((x,y)=>marketRaw(y)-marketRaw(x));
    const i=a.findIndex(x=>String(x.id)===String(p.id)); return i<0?99:i+1;
  };
  const starter=p=>{
    const k=teamRank(p);
    if(p.role==="P")return k===1?98:k===2?28:10;
    const t={D:[96,93,90,86,80,70,58,46,34,22],C:[96,92,88,84,78,68,57,45,33,22],A:[97,92,86,77,64,50,36,24]}[p.role];
    return t[Math.min(k-1,t.length-1)];
  };
  const profile=p=>{
    const x=String(p.mantraRole||"");
    if(p.role==="P")return 70;
    if(p.role==="D"){if(x.includes("W")||x.includes("E"))return 92;if(x.includes("Dd")||x.includes("Ds"))return 79;if(x==="Dc")return 60;return 70;}
    if(p.role==="C"){if(x.includes("A")||x.includes("W"))return 96;if(x.includes("T"))return 91;if(x.includes("C"))return 74;if(x==="M")return 58;return 68;}
    if(x.includes("Pc"))return 97;if(x.includes("A"))return 92;return 85;
  };
  const team=p=>TEAM[p.team]||{def:68,att:68};

  const fsValue=p=>{
    const t=team(p),st=starter(p),pr=profile(p),mp=marketPct(p)*100;
    let v;
    if(p.role==="P"){
      v=42+.28*(st-50)+.25*(t.def-50)+.12*(mp-50);
      const starters=roleSorted("P").filter(x=>teamRank(x)===1).sort((a,b)=>marketRaw(b)-marketRaw(a));
      const rk=starters.findIndex(x=>String(x.id)===String(p.id))+1;
      if(rk>0&&rk<=4)v+=10; else if(rk<=8)v+=5;
      return clamp(v,10,92);
    }
    if(p.role==="D"){
      v=34+.24*(st-50)+.24*(pr-50)+.18*(t.def-50)+.12*(t.att-50)+.12*(mp-50);
      return clamp(Math.max(v,mp>=99?92:mp>=96?84:0),8,96);
    }
    if(p.role==="C"){
      // I centrocampisti normali hanno replacement value molto piu' basso dei P titolari.
      // I veri TOP restano protetti da starFloor assoluto.
      v=21+.25*(st-50)+.25*(pr-50)+.20*(t.att-50)+.15*(mp-50);
      return clamp(Math.max(v,mp>=99?95:mp>=96?88:mp>=92?80:0),8,98);
    }
    v=36+.24*(st-50)+.25*(pr-50)+.22*(t.att-50)+.17*(mp-50);
    return clamp(Math.max(v,mp>=99?97:mp>=96?90:mp>=92?83:0),8,99);
  };

  window.adjustedValue=fsValue;
  window.fsBand=p=>{const v=fsValue(p);return v>=90?"ELITE":v>=80?"TOP":v>=68?"ALTA":v>=54?"MEDIA":v>=40?"BASSA":"RISERVA";};
  window.fsTier=window.fsBand;

  const fair1=(a,b)=>100*Math.pow(Math.min(fsValue(a),fsValue(b))/Math.max(fsValue(a),fsValue(b)),1.45);

  // ---------- CREDITI LEGA ----------
  const leagueBudget=()=>Math.max(1,Number(localStorage.getItem("fantascamLeagueBudget")||500));
  const creditSeasonFactor=()=>{
    const md=Number(META&&META.matchday)||0;
    if(md<=24)return 1;
    if(md<=31)return .85;
    return .65;
  };
  const creditValue=credits=>{
    const c=Math.max(0,Number(credits)||0);
    const share=Math.min(c/leagueBudget(),.60);
    // 50 crediti su 500 ≈ 5 FS; su 1000 ≈ 2.6 FS.
    return Math.min(24,45*Math.pow(share,.95))*creditSeasonFactor();
  };

  // Probabilita' di voto / utilita' reale nello scambio.
  // Un giocatore marginale aggiunto a un pacchetto vale pochissimo.
  const usageScore=p=>{
    const md=Math.max(1,Number(META&&META.matchday)||1);
    if(p.pv!==null&&p.pv!==undefined){
      return clamp(Number(p.pv)/md,0,1);
    }
    const k=teamRank(p);
    if(p.role==="P")return k===1?1:k===2?.18:.05;
    if(k<=2)return .96;
    if(k===3)return .88;
    if(k===4)return .78;
    if(k===5)return .64;
    if(k===6)return .48;
    if(k===7)return .32;
    if(k===8)return .20;
    return .10;
  };

  const tradability=p=>{
    const u=usageScore(p);
    // sotto il 30% di probabilita' di utilizzo, il contributo collassa.
    if(u<.15)return .08;
    if(u<.30)return .16;
    if(u<.45)return .30;
    if(u<.60)return .48;
    if(u<.75)return .68;
    return .88+(.12*u);
  };

  window.packageValue=(list,credits=0)=>{
    const ordered=list.slice().sort((a,b)=>fsValue(b)-fsValue(a));
    const weights=[1,.52,.31,.20,.14];
    let total=0;
    ordered.forEach((p,i)=>{
      const w=weights[i]??.10;
      // Il migliore mantiene il valore pieno; gli altri pagano sia costo-slot sia rischio-utilizzo.
      const marginal=i===0?1:tradability(p);
      total+=fsValue(p)*w*marginal;
    });
    return total+creditValue(credits);
  };

  const packageFair=(A,B,creditsA=0,creditsB=0)=>{
    const a=window.packageValue(A,creditsA),b=window.packageValue(B,creditsB);
    return 100*Math.pow(Math.min(a,b)/Math.max(a,b),1.28);
  };

  const ensureTradeControls=()=>{
    if(document.getElementById("fantascam-credit-controls"))return;

    const style=document.createElement("style");
    style.textContent=`
      .fs-credit-box{margin:12px 0;padding:12px;border:1px solid rgba(77,255,60,.22);border-radius:14px;background:#020a05}
      .fs-credit-title{font-weight:800;font-size:12px;color:#bfffc3;margin-bottom:8px}
      .fs-credit-row{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px}
      .fs-credit-row label{font-size:10px;color:#8ca592;font-weight:800}
      .fs-credit-row input{width:100%;margin-top:4px;border:1px solid rgba(77,255,60,.22);border-radius:10px;background:#020a05;color:#fff;padding:10px;font-weight:800}
      @media(max-width:780px){.fs-credit-row{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);

    const grid=document.querySelector(".grid");
    if(!grid)return;

    const box=document.createElement("div");
    box.id="fantascam-credit-controls";
    box.className="fs-credit-box";
    box.style.gridColumn="1 / -1";
    box.innerHTML=`
      <div class="fs-credit-title">💰 Crediti nello scambio</div>
      <div class="fs-credit-row">
        <label>Crediti iniziali lega
          <input id="fsLeagueBudget" type="number" min="1" step="1" value="${leagueBudget()}">
        </label>
        <label>Crediti ceduti Squadra A
          <input id="fsCreditsA" type="number" min="0" step="1" value="0">
        </label>
        <label>Crediti ceduti Squadra B
          <input id="fsCreditsB" type="number" min="0" step="1" value="0">
        </label>
      </div>
    `;
    grid.insertAdjacentElement("afterend",box);

    const budget=box.querySelector("#fsLeagueBudget");
    budget.addEventListener("input",()=>{
      localStorage.setItem("fantascamLeagueBudget",Math.max(1,Number(budget.value)||500));
      window.calculate();
    });
    box.querySelectorAll("input").forEach(el=>el.addEventListener("input",()=>window.calculate()));
  };

  const creditsSide=side=>{
    const el=document.getElementById(side==="A"?"fsCreditsA":"fsCreditsB");
    return Math.max(0,Number(el&&el.value)||0);
  };

  window.updateMeta=row=>{
    const p=getPlayer(row.querySelector(".footballer").value),box=row.querySelector(".meta");
    if(!p){box.innerHTML='<span class="empty">Seleziona un giocatore</span>';return}
    box.innerHTML=`<span class="chip" title="${p.team}">${teamAbbr(p.team)}</span><span class="chip">Q ${p.quote}</span><span class="chip top30">FS ${Math.round(fsValue(p))}</span><span class="chip">FASCIA ${window.fsBand(p)}</span>`;
  };

  window.calculate=()=>{
    const A=sidePlayers("A"),B=sidePlayers("B"),s=document.getElementById("score"),v=document.getElementById("verdict"),va=document.getElementById("valueA"),vb=document.getElementById("valueB"),d=document.getElementById("detail");
    v.className="verdict";
    if(!A.length||!B.length){lastVerdictSound="";s.textContent="—";v.textContent="Seleziona almeno un giocatore per parte";va.textContent=A.length?window.packageValue(A).toFixed(0):"—";vb.textContent=B.length?window.packageValue(B).toFixed(0):"—";return;}
    const ca=creditsSide("A"),cb=creditsSide("B");
    const one=A.length===1&&B.length===1&&ca===0&&cb===0;
    const av=window.packageValue(A,ca),bv=window.packageValue(B,cb);
    const fair=one?fair1(A[0],B[0]):packageFair(A,B,ca,cb),stronger=av>bv?"A":"B";
    s.textContent=fair.toFixed(0)+"%";va.textContent=av.toFixed(0);vb.textContent=bv.toFixed(0);
    const acc=one?80:70,eq=one?92:86;
    if(fair>=eq){v.textContent="✅ SCAMBIO EQUO";v.classList.add("good");d.textContent="Valori assoluti realmente vicini.";}
    else if(fair>=acc){v.textContent="🟡 SCAMBIO ACCETTABILE";v.classList.add("warn");d.textContent=`Vantaggio Squadra ${stronger}.`;}
    else{v.textContent="🚨 FANTASCAM!! 🚨";v.classList.add("bad");d.textContent=`Vantaggio netto Squadra ${stronger}.`;}
  };
  ensureTradeControls();
  document.querySelectorAll(".player").forEach(row=>window.updateMeta(row));
  window.calculate();
  console.info("FANTASCAM FS Engine V6.3 active");
})();
