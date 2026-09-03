/* FANTASCAM — injury cache client V2
   Legge /api/injuries e collega anche nomi abbreviati tipo "B. Godfrey".
*/
window.FS_INJURIES = window.FS_INJURIES || {};

(() => {
  const normalize = s => String(s || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toLowerCase().replace(/[^a-z0-9]/g,"");

  const words = s => String(s || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toLowerCase().replace(/[^a-z0-9 ]/g," ")
    .trim().split(/\s+/).filter(Boolean);

  const localPlayers = () => {
    try { return (typeof PLAYERS !== "undefined" && Array.isArray(PLAYERS)) ? PLAYERS : []; }
    catch(e) { return []; }
  };

  const exactIndex = players => {
    const m = new Map();
    for (const p of players) {
      m.set(normalize(p.name), p);
      const a = words(p.name);
      if (a.length > 1) m.set(normalize(a.slice().reverse().join(" ")), p);
    }
    return m;
  };

  const matchPlayer = (row, players, exact) => {
    const apiName = String(row.playerName || row.name || "").trim();
    let p = exact.get(normalize(apiName));
    if (p) return p;

    const a = words(apiName);
    if (a.length < 2) return null;

    // Supporta "B. Godfrey", "M. Kean", ecc.
    const initial = a[0][0];
    const surname = a[a.length - 1];
    let candidates = players.filter(x => {
      const w = words(x.name);
      if (w.length < 2) return false;
      return w[0][0] === initial && w[w.length - 1] === surname;
    });

    // La squadra elimina quasi tutte le possibili ambiguità.
    if (row.team) {
      const team = normalize(row.team);
      const sameTeam = candidates.filter(x => normalize(x.team) === team);
      if (sameTeam.length) candidates = sameTeam;
    }
    return candidates.length === 1 ? candidates[0] : null;
  };

  const apply = payload => {
    const players = localPlayers();
    const exact = exactIndex(players);
    const db = {};

    for (const row of (payload?.injuries || [])) {
      const apiName = String(row.playerName || row.name || "");
      const p = matchPlayer(row, players, exact);
      const item = {
        injured: true,
        type: row.type || "Injury",
        reason: row.reason || row.type || "Injury",
        returnDate: row.returnDate || null,
        status: "injured",
        apiPlayerId: row.playerId || null,
        team: row.team || null,
        source: row.source || payload?.source || null,
        updatedAt: payload.updatedAt || new Date().toISOString()
      };
      if (p) {
        db[String(p.id)] = item;
        db[p.name] = item;
      } else if (apiName) db[apiName] = item;
    }

    window.FS_INJURIES = db;
    window.FS_INJURIES_META = {
      updatedAt: payload?.updatedAt || null,
      league: payload?.league || null,
      season: payload?.season || null,
      source: payload?.source || null,
      count: Object.keys(db).length
    };
    window.dispatchEvent(new CustomEvent("fantascam:injuries-updated",{detail:window.FS_INJURIES_META}));
    return db;
  };

  window.FS_INJURIES_READY = fetch("/api/injuries",{headers:{accept:"application/json"}})
    .then(r => { if(!r.ok) throw new Error(`injuries api ${r.status}`); return r.json(); })
    .then(apply)
    .catch(err => {
      console.warn("FANTASCAM injuries offline:",err?.message || err);
      return window.FS_INJURIES;
    });
})();
/* FANTASCAM — V8.3 ANTI-SCAM PATCH
   Guardrail TOP/ELITE + FVM raw + gerarchia ruolo + banner motivato.
   Caricato dopo fs_engine.js: conserva il motore V8.2 e rafforza il verdetto finale. */
(() => {
  if (window.FS_V83_LOADED) return;
  window.FS_V83_LOADED = true;

  const clamp=(x,a=0,b=100)=>Math.max(a,Math.min(b,x));
  const n=(x,d=0)=>Number.isFinite(Number(x))?Number(x):d;
  const fsValue=p=>{
    try{return n(window.adjustedValue?.(p),0)}catch(e){return 0}
  };
  const rolePool=p=>{
    try{return (byRole?.[p.role]||[]).filter(x=>n(x.fvm,0)>3)}catch(e){return []}
  };
  const marketRaw=p=>.72*Math.log1p(Math.max(0,n(p.fvm)))+.28*Math.log1p(Math.max(0,n(p.quote)));
  const marketPct=p=>{
    const arr=rolePool(p).slice().sort((a,b)=>marketRaw(a)-marketRaw(b));
    const i=arr.findIndex(x=>String(x.id)===String(p.id));
    return i<0?.5:i/Math.max(1,arr.length-1);
  };
  const rawFvmPower=p=>Math.pow(Math.max(1,n(p.fvm,1)),.72);
  const weights=[1,.30,.15,.08,.04];
  const pack=(list,fn)=>list.slice().sort((a,b)=>fn(b)-fn(a)).reduce((s,p,i)=>s+fn(p)*(weights[i]??.03),0);
  const ratioFair=(a,b,power=1.12)=>clamp(100*Math.pow(Math.min(a,b)/Math.max(a,b,1e-9),power));
  const rolePower=p=>.30+.70*marketPct(p);
  const roleTier=p=>{
    if(n(p.fvm,0)<=3)return 'NORMALE';
    const pct=marketPct(p);
    return pct>=.90?'ELITE':pct>=.80?'TOP':pct>=.65?'ALTA':'NORMALE';
  };
  window.fsMarketTier=roleTier;

  const creditsSide=s=>Math.max(0,Number(document.getElementById(s==='A'?'fsCreditsA':'fsCreditsB')?.value)||0);
  const sideStar=list=>list.slice().sort((a,b)=>rawFvmPower(b)-rawFvmPower(a))[0]||null;
  const pct=x=>`${Math.round(x*100)}%`;

  const guardrails=(A,B)=>{
    const violations=[],notes=[];
    const inspect=(source,other,side)=>{
      const star=sideStar(source); if(!star||!other.length)return;
      const tier=roleTier(star); if(tier!=='ELITE'&&tier!=='TOP')return;
      const anchor=sideStar(other); if(!anchor)return;
      const rawRatio=n(anchor.fvm,0)/Math.max(1,n(star.fvm,1));
      const roleRatio=rolePower(anchor)/Math.max(.01,rolePower(star));
      const threshold=tier==='ELITE'?.65:.55;
      const roleThreshold=tier==='ELITE'?.72:.65;
      const packageTrade=source.length===1&&other.length>1;

      if(rawRatio<threshold&&(packageTrade||roleRatio<roleThreshold)){
        violations.push({cap:tier==='ELITE'?68:74,text:`${star.name} è ${tier}. Il miglior giocatore offerto (${anchor.name}) arriva solo al ${pct(rawRatio)} del suo FVM: per cedere un ${tier} serve un giocatore-ancora molto più vicino.`});
      }else if(rawRatio<threshold){
        notes.push(`${star.name} è ${tier}: ${anchor.name} è vicino come gerarchia di ruolo, ma meno vicino come FVM (${pct(rawRatio)}).`);
      }

      if(packageTrade&&other.length>=3&&tier==='ELITE'&&rawRatio<.75){
        violations.push({cap:72,text:`Pacchetto ${other.length}×1 contro ${star.name}: la quantità non può sostituire un ELITE se il miglior elemento non raggiunge almeno circa il 75% del suo FVM.`});
      }
    };
    inspect(A,B,'A');inspect(B,A,'B');
    return {violations,notes};
  };

  const analyse=(A,B,ca=0,cb=0)=>{
    let old={av:0,bv:0,base:0,momentum:0,calendar:0,slots:0,role:0};
    try{old=window.fsTradeAnalysis?.(A,B,ca,cb)||old}catch(e){}
    const av=window.packageValue?window.packageValue(A,ca):pack(A,fsValue);
    const bv=window.packageValue?window.packageValue(B,cb):pack(B,fsValue);
    const modelFair=ratioFair(av,bv,1.35);
    const rawA=pack(A,rawFvmPower),rawB=pack(B,rawFvmPower),rawFair=ratioFair(rawA,rawB,1.15);
    const roleA=pack(A,rolePower),roleB=pack(B,rolePower),roleFair=ratioFair(roleA,roleB,1.05);
    let fairness=clamp(.50*modelFair+.38*rawFair+.12*roleFair);

    if(A.length===1&&B.length===1&&A[0].role!==B[0].role){
      const gap=Math.abs(marketPct(A[0])-marketPct(B[0]));
      fairness=Math.min(fairness,clamp(100-gap*58,58,100));
    }

    const guards=guardrails(A,B);
    guards.violations.forEach(v=>fairness=Math.min(fairness,v.cap));

    const modelBias=(av-bv)/Math.max(1,av,bv),rawBias=(rawA-rawB)/Math.max(1,rawA,rawB);
    const bias=.58*modelBias+.42*rawBias;
    const stronger=bias>=0?'A':'B';
    const center=clamp(50+(bias>=0?1:-1)*(100-fairness)/2,0,100);
    return {...old,av,bv,modelFair,rawA,rawB,rawFair,roleA,roleB,roleFair,fairness,center,stronger,guards};
  };
  window.fsTradeAnalysisV83=analyse;

  const reasonsFor=(A,B,x)=>{
    const r=[];
    x.guards.violations.forEach(v=>r.push(v.text));
    x.guards.notes.forEach(v=>r.push(v));
    const rawGap=Math.abs(x.rawA-x.rawB)/Math.max(1,x.rawA,x.rawB);
    if(rawGap>=.35)r.push(`Il segnale FVM dei pacchetti è molto distante: circa ${Math.round(rawGap*100)}% di scarto.`);
    else if(rawGap>=.18)r.push(`Il segnale FVM mostra una differenza moderata: circa ${Math.round(rawGap*100)}%.`);
    else r.push('Il valore FVM dei due pacchetti è abbastanza vicino.');

    if(Math.abs(A.length-B.length)>=2)r.push(`Ci sono ${Math.abs(A.length-B.length)} slot rosa di differenza: gli elementi aggiuntivi valgono sempre meno, quindi 3 medi non diventano automaticamente un top.`);
    else if(A.length!==B.length)r.push(`Scambio ${A.length}×${B.length}: il secondo/terzo giocatore è svalutato per evitare che la quantità compri un top.`);

    if(A.length===1&&B.length===1&&A[0].role!==B[0].role){
      r.push(`Ruoli diversi: confrontata anche la gerarchia nel ruolo (${A[0].name} ${Math.round(marketPct(A[0])*100)}° percentile, ${B[0].name} ${Math.round(marketPct(B[0])*100)}° percentile).`);
    }
    if(x.modelFair>=88&&x.rawFair>=82&&!x.guards.violations.length)r.push('Motore strutturale e controllo di mercato concordano: nessun guardrail TOP/ELITE violato.');
    return r.slice(0,5);
  };

  const ensureBanner=()=>{
    let ov=document.getElementById('fs-v83-verdict-overlay');if(ov)return ov;
    const st=document.createElement('style');st.id='fs-v83-verdict-style';st.textContent=`
      #fs-v83-verdict-overlay{position:fixed;inset:0;z-index:50000;display:none;align-items:flex-end;justify-content:center;padding:14px;background:rgba(0,0,0,.70);backdrop-filter:blur(5px)}
      #fs-v83-verdict-overlay.show{display:flex}.fs-v83-banner{width:min(680px,100%);border-radius:24px;overflow:hidden;border:1px solid rgba(255,255,255,.15);background:linear-gradient(160deg,#0b1110,#050807);box-shadow:0 30px 100px rgba(0,0,0,.72);animation:fs83in .22s ease}.fs-v83-banner.good{border-color:rgba(77,255,60,.52)}.fs-v83-banner.warn{border-color:rgba(255,210,53,.52)}.fs-v83-banner.bad{border-color:rgba(255,72,94,.62)}
      @keyframes fs83in{from{transform:translateY(18px);opacity:.4}to{transform:translateY(0);opacity:1}}.fs83head{padding:17px 18px 14px;display:flex;gap:12px;align-items:flex-start;border-bottom:1px solid rgba(255,255,255,.08)}.fs83icon{font-size:34px}.fs83title{flex:1;min-width:0}.fs83title small{display:block;color:#91a096;font-size:10px;font-weight:900;letter-spacing:1.4px}.fs83title b{display:block;margin-top:3px;font-family:'Sora','Outfit',sans-serif;font-size:24px;line-height:1.08}.fs83score{text-align:right}.fs83score strong{display:block;font-size:34px;font-family:'Sora','Outfit',sans-serif}.fs83score span{font-size:10px;color:#91a096}.fs83body{padding:14px 18px 16px}.fs83summary{font-size:13px;line-height:1.5;color:#e6eee8;margin-bottom:10px}.fs83reasons{display:grid;gap:7px}.fs83reason{display:flex;gap:8px;padding:9px 10px;border-radius:12px;background:rgba(255,255,255,.045);font-size:12px;line-height:1.4;color:#c4d0c7}.fs83actions{display:flex;gap:8px;padding:0 18px 17px}.fs83actions button{flex:1;border-radius:13px;padding:11px 12px;font-weight:900;border:1px solid rgba(255,255,255,.11);background:rgba(255,255,255,.06);color:#fff}.fs83actions .primary{background:linear-gradient(135deg,#0d8a39,#075526);border-color:rgba(77,255,60,.35)}
      @media(min-width:700px){#fs-v83-verdict-overlay{align-items:center}}
    `;document.head.appendChild(st);
    ov=document.createElement('div');ov.id='fs-v83-verdict-overlay';ov.innerHTML=`<div class="fs-v83-banner"><div class="fs83head"><div class="fs83icon"></div><div class="fs83title"><small>VERDETTO FANTASCAM V8.3</small><b></b></div><div class="fs83score"><strong></strong><span>equità reale</span></div></div><div class="fs83body"><div class="fs83summary"></div><div class="fs83reasons"></div></div><div class="fs83actions"><button data-close>Chiudi</button><button class="primary" data-details>Vedi analisi</button></div></div>`;document.body.appendChild(ov);
    ov.querySelector('[data-close]').onclick=()=>ov.classList.remove('show');ov.onclick=e=>{if(e.target===ov)ov.classList.remove('show')};
    ov.querySelector('[data-details]').onclick=()=>{ov.classList.remove('show');const el=document.getElementById('fs-trade-analysis');const btn=el?.querySelector('.fs-an-toggle');const body=el?.querySelector('.fs-an-body');if(btn&&body&&!body.classList.contains('open'))btn.click();el?.scrollIntoView({behavior:'smooth',block:'center'});};
    return ov;
  };
  let lastSig='';
  const banner=(A,B,x,status,title,summary,reasons,ca,cb)=>{
    const ov=ensureBanner(),card=ov.querySelector('.fs-v83-banner');card.className=`fs-v83-banner ${status}`;
    ov.querySelector('.fs83icon').textContent=status==='good'?'✅':status==='warn'?'🟡':'🚨';ov.querySelector('.fs83title b').textContent=title;ov.querySelector('.fs83score strong').textContent=`${Math.round(x.fairness)}%`;ov.querySelector('.fs83summary').textContent=summary;ov.querySelector('.fs83reasons').innerHTML=reasons.map(z=>`<div class="fs83reason"><span>•</span><span>${z}</span></div>`).join('');
    const sig=`${A.map(p=>p.id)}|${B.map(p=>p.id)}|${ca}|${cb}|${status}|${Math.round(x.fairness)}`;if(sig!==lastSig){lastSig=sig;ov.classList.add('show')}
  };

  const oldCalculate=window.calculate;
  window.calculate=()=>{
    try{oldCalculate?.()}catch(e){}
    const A=typeof sidePlayers==='function'?sidePlayers('A'):[],B=typeof sidePlayers==='function'?sidePlayers('B'):[];
    const s=document.getElementById('score'),v=document.getElementById('verdict'),va=document.getElementById('valueA'),vb=document.getElementById('valueB'),d=document.getElementById('detail');
    if(!A.length||!B.length){document.getElementById('fs-v83-verdict-overlay')?.classList.remove('show');lastSig='';return}
    const ca=creditsSide('A'),cb=creditsSide('B'),x=analyse(A,B,ca,cb),reasons=reasonsFor(A,B,x);
    s.textContent=x.center.toFixed(0)+'%';va.textContent=x.av.toFixed(0);vb.textContent=x.bv.toFixed(0);v.className='verdict';
    d.textContent=`50 = equilibrio perfetto · Equità reale ${x.fairness.toFixed(0)}% · Controllo FVM ${x.rawFair.toFixed(0)}%`;
    let status,title,summary;
    if(x.guards.violations.length||x.fairness<75){status='bad';title='FANTASCAM — SCAMBIO BOCCIATO';v.textContent='🚨 FANTASCAM!! 🚨';v.classList.add('bad');summary=`Vantaggio netto Squadra ${x.stronger}. La distanza è troppo alta${x.guards.violations.length?' e si attiva la protezione TOP/ELITE':''}.`;d.textContent+=x.guards.violations.length?' · Guardrail TOP/ELITE attivato':` · Vantaggio Squadra ${x.stronger}`;}
    else if(x.fairness<88){status='warn';title='SCAMBIO ACCETTABILE';v.textContent='🟡 SCAMBIO ACCETTABILE';v.classList.add('warn');summary=`Scambio possibile, ma con vantaggio Squadra ${x.stronger}. Rientra nella fascia 75–87%, quindi non è pienamente equilibrato.`;d.textContent+=` · Vantaggio Squadra ${x.stronger}`;}
    else{status='good';title='SCAMBIO EQUILIBRATO';v.textContent='✅ SCAMBIO EQUILIBRATO';v.classList.add('good');summary='I due lati superano l’88% di equità, nessuna protezione TOP/ELITE è violata e la quantità è stata svalutata correttamente.';d.textContent+=' · Nessun guardrail violato';try{showHereWeGo?.()}catch(e){}}
    banner(A,B,x,status,title,summary,reasons,ca,cb);
    window.FS_LAST_TRADE={A,B,t:x,center:x.center,fairness:x.fairness,stronger:x.stronger,creditsA:ca,creditsB:cb,verdict:v.textContent,reasons,status};
    window.dispatchEvent(new CustomEvent('fantascam:trade-updated',{detail:window.FS_LAST_TRADE}));
  };
  window.getTradeSummary=()=>{const x=window.FS_LAST_TRADE;if(!x)return'Nessuno scambio selezionato';const names=s=>s.map(p=>p.name).join(' + ')||'—';return`Scambio: ${names(x.A)}${x.creditsA?` + ${x.creditsA} crediti`:''} ⇄ ${names(x.B)}${x.creditsB?` + ${x.creditsB} crediti`:''} | Equità ${Math.round(x.fairness)}% | ${x.verdict} | ${x.reasons?.[0]||''}`};

  const algo=document.querySelector('.algoBox b');if(algo)algo.textContent='V8.3';const line=document.querySelector('.brandline');if(line&&!document.getElementById('fs-v83-badge')){const b=document.createElement('div');b.className='badge';b.id='fs-v83-badge';b.textContent='🧠 ANTI-SCAM V8.3';line.appendChild(b)}
  setTimeout(()=>window.calculate(),0);
  console.info('FANTASCAM Anti-Scam V8.3 patch active');
})();
