/* FANTASCAM — FS ENGINE V7.8
   Rebuild strutturale:
   - valore individuale prima dello scambio
   - star power assoluto per i TOP
   - scarsita' per ruolo
   - giocatori marginali quasi nulli nei pacchetti
   - attacker premium forte
   - fantamedia dinamica dalla 10a giornata
   - crediti proporzionati al budget iniziale lega
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
  const marketRaw=p=>.60*Math.log1p(n(p.fvm))+.40*Math.log1p(n(p.quote));

  const roleSorted=r=>(byRole[r]||[]).slice().sort((a,b)=>marketRaw(a)-marketRaw(b));
  const marketPct=p=>{
    const a=roleSorted(p.role),i=a.findIndex(x=>String(x.id)===String(p.id));
    return i<0?.5:i/Math.max(1,a.length-1);
  };
  const teamRank=p=>{
    const a=(byRole[p.role]||[]).filter(x=>x.team===p.team).slice().sort((x,y)=>marketRaw(y)-marketRaw(x));
    const i=a.findIndex(x=>String(x.id)===String(p.id));
    return i<0?99:i+1;
  };
  const starterPrior=p=>{
    const k=teamRank(p);
    if(p.role==="P")return k===1?98:k===2?25:8;
    const t={D:[96,93,90,86,80,72,60,48,36,24],C:[96,92,88,84,78,69,58,46,34,22],A:[97,92,86,78,66,52,38,25]}[p.role];
    return t[Math.min(k-1,t.length-1)];
  };
  const profile=p=>{
    const x=String(p.mantraRole||"");
    if(p.role==="P")return 72;
    if(p.role==="D"){if(x.includes("W")||x.includes("E"))return 94;if(x.includes("Dd")||x.includes("Ds"))return 80;if(x==="Dc")return 62;return 70;}
    if(p.role==="C"){if(x.includes("A")||x.includes("W"))return 96;if(x.includes("T"))return 91;if(x.includes("C"))return 75;if(x==="M")return 60;return 69;}
    if(x.includes("Pc"))return 98;if(x.includes("A"))return 93;return 86;
  };
  const formWeight=()=>{
    const md=n(META&&META.matchday,0);
    if(md<10)return 0;if(md<15)return .08;if(md<21)return .13;if(md<29)return .17;return .20;
  };
  const availability=p=>{
    const md=Math.max(1,n(META&&META.matchday,1));
    if(p.pv!==null&&p.pv!==undefined)return 35+65*clamp(n(p.pv)/md,0,1);
    return starterPrior(p);
  };
  const formSignal=p=>{
    const md=Math.max(1,n(META&&META.matchday,1));
    if(p.fm===null||p.fm===undefined||p.pv===null||p.pv===undefined)return 50;
    const rel=clamp(n(p.pv)/Math.max(4,md*.75),0,1);
    const fm=clamp(50+(n(p.fm)-6)*24,15,100);
    let out=50+(fm-50)*rel;
    if((p.role==="P"||p.role==="D")&&p.mv!==null&&p.mv!==undefined){
      const mv=clamp(50+(n(p.mv)-6)*30,15,100);
      out=.58*out+.42*(50+(mv-50)*rel);
    }
    return clamp(out);
  };

  const likelyStarters=r=>{
    if(r==="P")return (byRole[r]||[]).filter(p=>teamRank(p)===1).slice().sort((a,b)=>marketRaw(b)-marketRaw(a));
    return (byRole[r]||[]).filter(p=>teamRank(p)<=3).slice().sort((a,b)=>marketRaw(b)-marketRaw(a));
  };
  const starterRank=p=>{
    const a=likelyStarters(p.role),i=a.findIndex(x=>String(x.id)===String(p.id));
    return i<0?999:i+1;
  };
  const starFloor=p=>{
    const rk=starterRank(p);
    if(p.role==="P")return rk<=3?90:rk<=6?84:rk<=10?76:0;
    if(p.role==="D")return rk<=3?92:rk<=8?86:rk<=15?79:rk<=24?72:0;
    if(p.role==="C")return rk<=3?94:rk<=8?88:rk<=15?82:rk<=24?75:0;
    if(p.role==="A")return rk<=3?97:rk<=7?93:rk<=12?89:rk<=18?84:rk<=26?78:0;
    return 0;
  };

  // La fascia protegge il TOP, ma non assegna più a tutti lo stesso numero.
  // Dentro ogni fascia aggiungiamo una quota continua basata sui parametri reali del profilo.
  const starBandValue=(p,base)=>{
    const rk=starterRank(p),st=availability(p),pr=profile(p),mp=marketPct(p)*100;
    const t=TEAM[p.team]||{def:68,att:68};
    let lo=starFloor(p);
    if(!lo)return base;

    let hi=lo+5;
    if(p.role==="P")hi=Math.min(96,hi);
    else if(p.role==="D")hi=Math.min(97,hi);
    else if(p.role==="C")hi=Math.min(98,hi);
    else hi=Math.min(99,hi);

    // Differenziazione interna: mercato è solo una componente, non il valore.
    const team=p.role==="P"||p.role==="D"?t.def:t.att;
    const score=.34*st+.26*pr+.22*team+.18*mp;
    const within=clamp((score-55)/45,0,1);
    return Math.max(base,lo+(hi-lo)*within);
  };

  // ---------- INJURY / AVAILABILITY LAYER ----------
  // injuryData can be populated by the app/backend from API-Football.
  // Expected fields: injured, type, reason, returnDate, status.
  const injuryInfo=p=>{
    const db=window.FS_INJURIES||{};
    return db[String(p.id)]||db[p.name]||null;
  };
  const daysUntil=date=>{
    if(!date)return null;
    const d=new Date(date),now=new Date();
    if(Number.isNaN(d.getTime()))return null;
    const days=Math.ceil((d-now)/86400000);
    return days < 0 ? null : days;
  };
  const injuryFactor=p=>{
    const i=injuryInfo(p);
    if(!i||(!i.injured&&String(i.status||"").toLowerCase()!=="injured"))return 1;

    const reason=String(i.reason||i.type||"").toLowerCase();
    const left=daysUntil(i.returnDate);

    // Severity by explicit return horizon when available.
    if(left!==null){
      if(left<=7)return .94;
      if(left<=21)return .84;
      if(left<=45)return .70;
      if(left<=90)return .55;
      if(left<=180)return .42;
      return .32;
    }

    // Fallback by injury description.
    if(/cruciate|acl|crociat|achilles|tendine d.?achille/.test(reason))return .32;
    if(/fracture|frattur|surgery|operat/.test(reason))return .45;
    if(/knee|ginocch|hamstring|muscle|muscolar/.test(reason))return .68;
    if(/knock|bruise|contusion|fatigue|affatic/.test(reason))return .90;
    return .72;
  };

  const fsValue=p=>{
    const t=TEAM[p.team]||{def:68,att:68},st=availability(p),pr=profile(p),mp=marketPct(p)*100,fw=formWeight();
    const form=formSignal(p);
    let base;

    if(p.role==="P"){
      base=44+.30*(st-50)+.25*(t.def-50)+.08*(pr-50)+.08*(mp-50);
      const rk=starterRank(p);
      if(rk<=3)base+=9; else if(rk<=6)base+=5; else if(rk<=10)base+=2;
      base=base*(1-fw)+form*fw;
      return clamp(starBandValue(p,base)*injuryFactor(p),8,96);
    }
    if(p.role==="D"){
      base=32+.24*(st-50)+.24*(pr-50)+.18*(t.def-50)+.10*(t.att-50)+.07*(mp-50);
      base=base*(1-fw)+form*fw;
      return clamp(starBandValue(p,base)*injuryFactor(p),8,97);
    }
    if(p.role==="C"){
      base=22+.24*(st-50)+.27*(pr-50)+.19*(t.att-50)+.06*(t.def-50)+.07*(mp-50);
      base=base*(1-fw)+form*fw;
      return clamp(starBandValue(p,base)*injuryFactor(p),8,98);
    }

    base=36+.24*(st-50)+.27*(pr-50)+.23*(t.att-50)+.08*(mp-50);
    const rk=starterRank(p);
    if(rk<=3)base+=8; else if(rk<=7)base+=5; else if(rk<=12)base+=3;
    base=base*(1-fw)+form*fw;
    return clamp(starBandValue(p,base)*injuryFactor(p),8,99);
  };

  window.adjustedValue=fsValue;
  window.fsBand=p=>{const v=fsValue(p);return v>=92?"ELITE":v>=84?"TOP":v>=72?"ALTA":v>=56?"MEDIA":v>=40?"BASSA":"RISERVA";};
  window.fsTier=window.fsBand;

  const usageScore=p=>{
    const md=Math.max(1,n(META&&META.matchday,1));
    if(p.pv!==null&&p.pv!==undefined)return clamp(n(p.pv)/md,0,1);
    const k=teamRank(p);
    if(p.role==="P")return k===1?1:k===2?.15:.04;
    if(k<=2)return 1;if(k===3)return .90;if(k===4)return .76;if(k===5)return .60;if(k===6)return .44;if(k===7)return .28;if(k===8)return .16;return .08;
  };
  const tradability=p=>{
    const u=usageScore(p);
    if(u<.10)return .04;if(u<.20)return .08;if(u<.35)return .16;if(u<.50)return .30;if(u<.65)return .50;if(u<.80)return .70;return .88+.12*u;
  };

  const leagueBudget=()=>Math.max(1,Number(localStorage.getItem("fantascamLeagueBudget")||500));
  const creditSeasonFactor=()=>{const md=n(META&&META.matchday,0);return md>=32?.62:md>=26?.80:1;};
  const creditValue=credits=>{
    const c=Math.max(0,Number(credits)||0),share=Math.min(c/leagueBudget(),.60);
    return Math.min(23,44*Math.pow(share,.97))*creditSeasonFactor();
  };

  const fair1=(a,b)=>100*Math.pow(Math.min(fsValue(a),fsValue(b))/Math.max(fsValue(a),fsValue(b)),1.55);

  window.packageValue=(list,credits=0)=>{
    const ordered=list.slice().sort((a,b)=>fsValue(b)-fsValue(a));
    const weights=[1,.44,.22,.12,.07];
    let total=0;
    ordered.forEach((p,i)=>{
      const marginal=i===0?1:tradability(p);
      total+=fsValue(p)*(weights[i]??.05)*marginal;
    });
    return total+creditValue(credits);
  };

  const packageFair=(A,B,ca=0,cb=0)=>{
    const av=window.packageValue(A,ca),bv=window.packageValue(B,cb);
    let fair=100*Math.pow(Math.min(av,bv)/Math.max(av,bv),1.40);

    if(A.length!==B.length){
      const single=A.length===1?A:(B.length===1?B:null);
      const pack=A.length===1?B:(B.length===1?A:null);
      if(single&&pack){
        const sv=fsValue(single[0]),anchor=Math.max(...pack.map(fsValue));
        if(sv>=92){
          // ELITE: crediti e quantita' aiutano, ma non sostituiscono un near-peer.
          if(anchor<sv-12)fair=Math.min(fair,58);
          else if(anchor<sv-8)fair=Math.min(fair,66);
          else if(anchor<sv-5)fair=Math.min(fair,74);
          else if(anchor<sv-3)fair*=.86;
        }else if(sv>=84){
          // TOP: due/tre medi non possono arrivare in zona equa per semplice somma.
          if(anchor<sv-12)fair=Math.min(fair,62);
          else if(anchor<sv-8)fair=Math.min(fair,69);
          else if(anchor<sv-5)fair=Math.min(fair,76);
          else if(anchor<sv-3)fair*=.89;
        }
        if(pack.length>=3)fair*=.88;
      }
    }
    return clamp(fair);
  };

  const ensureCompactMobileUI=()=>{
    if(document.getElementById("fs-v75-mobile-style"))return;
    const style=document.createElement("style");
    style.id="fs-v75-mobile-style";
    style.textContent=`
      .fs-status-icon{display:inline-flex;align-items:center;white-space:nowrap;margin-right:3px;line-height:1}
      .meta{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .footballer,.player select{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      @media(max-width:600px){
        .meta{display:flex!important;align-items:center;gap:3px;flex-wrap:nowrap!important;overflow:hidden}
        .meta .chip{flex:0 0 auto;padding:3px 5px;font-size:10px}
        .fs-status-icon{flex:0 0 auto;font-size:13px}
        .player{min-width:0}
        .footballer,.player select{font-size:13px;min-width:0}
      }`;
    document.head.appendChild(style);
  };

  const ensureTradeControls=()=>{
    if(document.getElementById("fantascam-credit-controls"))return;
    const style=document.createElement("style");
    style.textContent=`.fs-credit-box{margin:12px 0;padding:12px;border:1px solid rgba(77,255,60,.22);border-radius:14px;background:#020a05}.fs-credit-title{font-weight:800;font-size:12px;color:#bfffc3;margin-bottom:8px}.fs-credit-row{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px}.fs-credit-row label{font-size:10px;color:#8ca592;font-weight:800}.fs-credit-row input{width:100%;margin-top:4px;border:1px solid rgba(77,255,60,.22);border-radius:10px;background:#020a05;color:#fff;padding:10px;font-weight:800}@media(max-width:780px){.fs-credit-row{grid-template-columns:1fr}}`;
    document.head.appendChild(style);
    const grid=document.querySelector(".grid");if(!grid)return;
    const box=document.createElement("div");box.id="fantascam-credit-controls";box.className="fs-credit-box";box.style.gridColumn="1 / -1";
    box.innerHTML=`<div class="fs-credit-title">💰 Crediti nello scambio</div><div class="fs-credit-row"><label>Crediti iniziali lega<input id="fsLeagueBudget" type="number" min="1" step="1" value="${leagueBudget()}"></label><label>Crediti ceduti Squadra A<input id="fsCreditsA" type="number" min="0" step="1" value="0"></label><label>Crediti ceduti Squadra B<input id="fsCreditsB" type="number" min="0" step="1" value="0"></label></div>`;
    grid.insertAdjacentElement("afterend",box);
    const budget=box.querySelector("#fsLeagueBudget");
    budget.addEventListener("input",()=>{localStorage.setItem("fantascamLeagueBudget",Math.max(1,Number(budget.value)||500));window.calculate();});
    box.querySelectorAll("input").forEach(el=>el.addEventListener("input",()=>window.calculate()));
  };
  const creditsSide=s=>Math.max(0,Number(document.getElementById(s==="A"?"fsCreditsA":"fsCreditsB")?.value)||0);

  const healthIcon=p=>{
    const i=injuryInfo(p);
    if(!i||!i.injured)return "";
    const reason=String(i.reason||i.type||"").toLowerCase();
    const left=daysUntil(i.returnDate);
    if(left!==null){if(left<=7)return "⬜🚑";if(left<=30)return "🟨🚑";return "🟥🚑";}
    if(/cruciate|acl|crociat|achilles|tendine d.?achille|fracture|frattur|surgery|operat/.test(reason))return "🟥🚑";
    if(/knock|bruise|contusion|fatigue|affatic/.test(reason))return "⬜🚑";
    return "🟨🚑";
  };
  const healthBadge=p=>{
    const i=injuryInfo(p),icon=healthIcon(p);
    if(!icon)return "";
    return `<span class="fs-status-icon" title="${String(i.reason||i.type||"Infortunio")}">${icon}</span>`;
  };

  const isOnFire=p=>{
    const md=n(META&&META.matchday,0);
    if(md<6||p.fm===null||p.fm===undefined||p.pv===null||p.pv===undefined)return false;
    const pv=n(p.pv),fm=n(p.fm);
    const reliability=clamp(pv/Math.max(4,md*.75),0,1);
    // Richiede rendimento davvero alto e campione abbastanza affidabile.
    const threshold=p.role==="P"?6.65:p.role==="D"?6.75:p.role==="C"?7.00:7.10;
    return reliability>=.65&&fm>=threshold;
  };

  const fireBadge=p=>isOnFire(p)?`<span class="fs-status-icon" title="ON FIRE">🔥</span>`:"";
  const pickerStatus=p=>`${healthIcon(p)}${isOnFire(p)?"🔥":""}`;

  const ensurePickerStyle=()=>{
    if(document.getElementById("fs-v78-picker-style"))return;
    const st=document.createElement("style");st.id="fs-v78-picker-style";
    st.textContent=`
      .fs-player-picker{position:relative;min-width:0;width:100%}
      .fs-player-picker>.footballer{position:absolute!important;opacity:0!important;pointer-events:none!important;width:1px!important;height:1px!important}
      .fs-picker-btn{width:100%;min-height:42px;display:flex;align-items:center;gap:5px;min-width:0;border:1px solid rgba(77,255,60,.22);border-radius:10px;background:#020a05;color:#fff;padding:9px 8px;font:700 13px 'Outfit',sans-serif;text-align:left}
      .fs-picker-btn .n,.fs-picker-option .n{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1}
      .fs-picker-btn .t,.fs-picker-option .t{flex:0 0 auto;white-space:nowrap;color:#9db6a1;font-size:10px}
      .fs-picker-btn .s,.fs-picker-option .s{flex:0 0 auto;white-space:nowrap}
      .fs-picker-menu{position:fixed;z-index:20000;display:none;overflow:auto;-webkit-overflow-scrolling:touch;max-height:62vh;border:1px solid rgba(77,255,60,.35);border-radius:14px;background:#020905;box-shadow:0 18px 60px rgba(0,0,0,.75);padding:5px}
      .fs-picker-menu.show{display:block}
      .fs-picker-option{width:100%;height:40px;display:flex;align-items:center;gap:5px;border:0;border-bottom:1px solid rgba(77,255,60,.08);background:transparent;color:#fff;padding:0 7px;text-align:left;font:700 12px 'Outfit',sans-serif;min-width:0}
      .fs-picker-option.selected{background:rgba(77,255,60,.10)}
      @media(max-width:600px){.fs-picker-btn{font-size:12px;padding:8px 6px;gap:4px}.fs-picker-option{font-size:12px;gap:4px}}
    `;document.head.appendChild(st);
  };
  let openPicker=null;
  const closePicker=()=>{if(openPicker){openPicker.classList.remove("show");openPicker=null;}};
  const syncPicker=sel=>{
    const w=sel.closest(".fs-player-picker"),b=w?.querySelector(".fs-picker-btn");if(!b)return;
    const p=sel.value?getPlayer(sel.value):null;
    b.innerHTML=p?`${pickerStatus(p)?`<span class="s">${pickerStatus(p)}</span>`:""}<span class="n">${p.name}</span><span class="t">${teamAbbr(p.team)} · FS ${Math.round(fsValue(p))}</span>`:`<span class="n">Scegli giocatore…</span>`;
  };
  const rebuildPicker=sel=>{
    const w=sel.closest(".fs-player-picker"),m=w?.querySelector(".fs-picker-menu");if(!m)return;m.innerHTML="";
    [...sel.options].forEach(o=>{if(!o.value)return;const p=getPlayer(o.value);if(!p)return;
      const b=document.createElement("button");b.type="button";b.className="fs-picker-option"+(String(sel.value)===String(o.value)?" selected":"");
      b.innerHTML=`${pickerStatus(p)?`<span class="s">${pickerStatus(p)}</span>`:""}<span class="n">${p.name}</span><span class="t">${teamAbbr(p.team)} · FS ${Math.round(fsValue(p))}</span>`;
      b.onclick=()=>{sel.value=o.value;sel.dispatchEvent(new Event("change",{bubbles:true}));syncPicker(sel);closePicker();};m.appendChild(b);
    });
  };
  const positionPicker=(btn,m)=>{
    const r=btn.getBoundingClientRect(),gap=8,w=Math.min(Math.max(r.width,250),window.innerWidth-gap*2);
    m.style.left=`${Math.max(gap,Math.min(r.left,window.innerWidth-w-gap))}px`;m.style.width=`${w}px`;
    m.style.top=`${Math.min(r.bottom+5,window.innerHeight-260)}px`;
  };
  const enhancePlayerSelect=sel=>{
    if(sel.dataset.fsPicker==="1")return;sel.dataset.fsPicker="1";
    const w=document.createElement("div");w.className="fs-player-picker";sel.parentNode.insertBefore(w,sel);w.appendChild(sel);
    const b=document.createElement("button");b.type="button";b.className="fs-picker-btn";
    const m=document.createElement("div");m.className="fs-picker-menu";w.append(b,m);
    b.onclick=e=>{e.preventDefault();const was=m.classList.contains("show");closePicker();if(was)return;rebuildPicker(sel);positionPicker(b,m);m.classList.add("show");openPicker=m;};
    sel.addEventListener("change",()=>syncPicker(sel));
    new MutationObserver(()=>syncPicker(sel)).observe(sel,{childList:true,subtree:true});syncPicker(sel);
  };
  const enhanceAllPickers=()=>{ensurePickerStyle();document.querySelectorAll("select.footballer").forEach(enhancePlayerSelect);};
  document.addEventListener("click",e=>{if(openPicker&&!e.target.closest(".fs-player-picker")&&!openPicker.contains(e.target))closePicker();});
  window.addEventListener("resize",closePicker);window.addEventListener("scroll",closePicker,{passive:true});

  window.updateMeta=row=>{
    const p=getPlayer(row.querySelector(".footballer").value),box=row.querySelector(".meta");
    if(!p){box.innerHTML='<span class="empty">Seleziona un giocatore</span>';return}
    const fm=(p.fm!==null&&p.fm!==undefined)?`<span class="chip">FM ${n(p.fm).toFixed(2)}</span>`:"";
    const pv=(p.pv!==null&&p.pv!==undefined)?`<span class="chip">PV ${p.pv}</span>`:"";
    const health=healthBadge(p);
    const fire=fireBadge(p);
    box.innerHTML=`<span class="chip" title="${p.team}">${teamAbbr(p.team)}</span><span class="chip">Q ${p.quote}</span><span class="chip top30">FS ${Math.round(fsValue(p))}</span><span class="chip">FASCIA ${window.fsBand(p)}</span>${health}${fire}${fm}${pv}`;
  };

  window.calculate=()=>{
    const A=sidePlayers("A"),B=sidePlayers("B"),s=document.getElementById("score"),v=document.getElementById("verdict"),va=document.getElementById("valueA"),vb=document.getElementById("valueB"),d=document.getElementById("detail");
    v.className="verdict";
    if(!A.length||!B.length){lastVerdictSound="";s.textContent="—";v.textContent="Seleziona almeno un giocatore per parte";va.textContent=A.length?window.packageValue(A).toFixed(0):"—";vb.textContent=B.length?window.packageValue(B).toFixed(0):"—";return;}

    const ca=creditsSide("A"),cb=creditsSide("B"),one=A.length===1&&B.length===1&&ca===0&&cb===0;
    const av=window.packageValue(A,ca),bv=window.packageValue(B,cb),fair=one?fair1(A[0],B[0]):packageFair(A,B,ca,cb),stronger=av>bv?"A":"B";
    s.textContent=fair.toFixed(0)+"%";va.textContent=av.toFixed(0);vb.textContent=bv.toFixed(0);

    const acc=one?80:72,eq=one?92:88;
    if(fair>=eq){v.textContent="✅ SCAMBIO EQUO";v.classList.add("good");d.textContent="Valori assoluti realmente vicini.";}
    else if(fair>=acc){v.textContent="🟡 SCAMBIO ACCETTABILE";v.classList.add("warn");d.textContent=`Vantaggio Squadra ${stronger}.`;}
    else{v.textContent="🚨 FANTASCAM!! 🚨";v.classList.add("bad");d.textContent=`Vantaggio netto Squadra ${stronger}.`;}
  };

  const refreshInjuryUI=()=>{
    document.querySelectorAll(".player").forEach(row=>window.updateMeta(row));
    enhanceAllPickers();document.querySelectorAll("select.footballer").forEach(syncPicker);
    window.calculate();
  };

  const loadInjuryClient=()=>{
    if(window.FS_INJURIES_READY){
      window.FS_INJURIES_READY.then(refreshInjuryUI).catch(()=>{});
      return;
    }
    if(document.querySelector('script[data-fs-injuries]'))return;
    const sc=document.createElement("script");
    sc.src="injuries.js?v=2";
    sc.async=true;
    sc.dataset.fsInjuries="1";
    sc.onload=()=>{
      if(window.FS_INJURIES_READY&&typeof window.FS_INJURIES_READY.then==="function"){
        window.FS_INJURIES_READY.then(refreshInjuryUI).catch(()=>{});
      }
    };
    document.head.appendChild(sc);
  };

  window.addEventListener("fantascam:injuries-updated",refreshInjuryUI);
  loadInjuryClient();

  ensureCompactMobileUI();
  ensureTradeControls();
  enhanceAllPickers();
  new MutationObserver(()=>enhanceAllPickers()).observe(document.body,{childList:true,subtree:true});
  document.querySelectorAll(".player").forEach(row=>window.updateMeta(row));
  window.calculate();
  console.info("FANTASCAM FS Engine V7.8 active");
})();
