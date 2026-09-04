/* FANTASCAM — injury cache client V2 + V9.0 CONFIDENCE ENGINE
   V9.0: forma affidabile, presenze progressive, anti-scam TOP/ELITE,
   FVM indipendente, pacchetti non lineari, crediti controllati e banner motivato.
*/
window.FS_INJURIES = window.FS_INJURIES || {};

/* -------------------- INJURY CLIENT -------------------- */
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
    const initial = a[0][0], surname = a[a.length - 1];
    let candidates = players.filter(x => {
      const w = words(x.name);
      return w.length > 1 && w[0][0] === initial && w[w.length - 1] === surname;
    });
    if (row.team) {
      const team = normalize(row.team);
      const sameTeam = candidates.filter(x => normalize(x.team) === team);
      if (sameTeam.length) candidates = sameTeam;
    }
    return candidates.length === 1 ? candidates[0] : null;
  };

  const apply = payload => {
    const players = localPlayers(), exact = exactIndex(players), db = {};
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
        updatedAt: payload?.updatedAt || new Date().toISOString()
      };
      if (p) { db[String(p.id)] = item; db[p.name] = item; }
      else if (apiName) db[apiName] = item;
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

/* -------------------- V9.0 ENGINE -------------------- */
(() => {
  if (window.FS_V9_LOADED) return;
  window.FS_V9_LOADED = true;

  const TEAM={
    Inter:{def:96,att:94},Milan:{def:91,att:92},Napoli:{def:92,att:91},Juventus:{def:90,att:89},
    Roma:{def:89,att:90},Atalanta:{def:88,att:92},Bologna:{def:84,att:83},Lazio:{def:83,att:85},
    Fiorentina:{def:80,att:84},Como:{def:79,att:83},Torino:{def:78,att:76},Udinese:{def:74,att:73},
    Genoa:{def:73,att:70},Sassuolo:{def:70,att:75},Parma:{def:69,att:70},Cagliari:{def:67,att:68},
    Lecce:{def:64,att:64},Frosinone:{def:62,att:64},Monza:{def:61,att:62},Venezia:{def:59,att:60}
  };
  const clamp=(x,a=0,b=100)=>Math.max(a,Math.min(b,x));
  const n=(x,d=0)=>Number.isFinite(Number(x))?Number(x):d;
  const mdNow=()=>{try{return Math.max(0,n(META?.matchday,0))}catch(e){return 0}};
  const activePlayers=()=>{try{return Array.isArray(ACTIVE_PLAYERS)?ACTIVE_PLAYERS:PLAYERS}catch(e){return Array.isArray(PLAYERS)?PLAYERS:[]}};

  /* ---------- cached hierarchy indexes ---------- */
  let lastPlayersRef=null, pctMap=new Map(), teamRankMap=new Map(), starterRankMap=new Map();
  const marketRaw=p=>.60*Math.log1p(Math.max(0,n(p.fvm)))+.40*Math.log1p(Math.max(0,n(p.quote)));
  const rebuildV9Indexes=()=>{
    const all=activePlayers();
    if(all===lastPlayersRef && pctMap.size)return;
    lastPlayersRef=all;pctMap=new Map();teamRankMap=new Map();starterRankMap=new Map();
    const roles={P:[],D:[],C:[],A:[]};
    all.forEach(p=>{if(roles[p.role])roles[p.role].push(p)});
    for(const r of Object.keys(roles)){
      const arr=roles[r].slice().sort((a,b)=>marketRaw(a)-marketRaw(b));
      arr.forEach((p,i)=>pctMap.set(String(p.id),i/Math.max(1,arr.length-1)));
      const teams=new Map();
      roles[r].forEach(p=>{if(!teams.has(p.team))teams.set(p.team,[]);teams.get(p.team).push(p)});
      teams.forEach(a=>a.sort((x,y)=>marketRaw(y)-marketRaw(x)).forEach((p,i)=>teamRankMap.set(String(p.id),i+1)));
    }
    for(const r of Object.keys(roles)){
      const likely=roles[r].filter(p=>r==='P'?teamRank(p)===1:teamRank(p)<=3).sort((a,b)=>marketRaw(b)-marketRaw(a));
      likely.forEach((p,i)=>starterRankMap.set(String(p.id),i+1));
    }
  };
  const marketPct=p=>{rebuildV9Indexes();return pctMap.get(String(p.id))??.5};
  const teamRank=p=>{rebuildV9Indexes();return teamRankMap.get(String(p.id))??99};
  const starterRank=p=>{rebuildV9Indexes();return starterRankMap.get(String(p.id))??999};

  const starterPrior=p=>{
    const k=teamRank(p);
    if(p.role==='P')return k===1?98:k===2?25:8;
    const t={D:[96,93,90,86,80,72,60,48,36,24],C:[96,92,88,84,78,69,58,46,34,22],A:[97,92,86,78,66,52,38,25]}[p.role]||[30];
    return t[Math.min(k-1,t.length-1)];
  };
  const profile=p=>{
    const x=String(p.mantraRole||'');
    if(p.role==='P')return 72;
    if(p.role==='D'){if(x.includes('W')||x.includes('E'))return 94;if(x.includes('Dd')||x.includes('Ds'))return 80;if(x==='Dc')return 62;return 70}
    if(p.role==='C'){if(x.includes('A')||x.includes('W'))return 96;if(x.includes('T'))return 91;if(x.includes('C'))return 75;if(x==='M')return 60;return 69}
    if(x.includes('Pc'))return 98;if(x.includes('A'))return 93;return 86;
  };
  const starFloor=p=>{
    const rk=starterRank(p);
    if(p.role==='P')return rk<=3?90:rk<=6?84:rk<=10?76:0;
    if(p.role==='D')return rk<=3?92:rk<=8?86:rk<=15?79:rk<=24?72:0;
    if(p.role==='C')return rk<=3?94:rk<=8?88:rk<=15?82:rk<=24?75:0;
    if(p.role==='A')return rk<=3?97:rk<=7?93:rk<=12?89:rk<=18?84:rk<=26?78:0;
    return 0;
  };

  /* ---------- confidence: presenze reali entrano gradualmente ---------- */
  const realUsageWeight=md=>{
    md=Math.max(0,n(md));
    if(md<=0)return 0;
    if(md<=5)return .02*md;                    // G5 = 10%
    if(md<=10)return .10+.08*(md-5);           // G10 = 50%
    if(md<=20)return .50+.025*(md-10);         // G20 = 75%
    if(md<=30)return .75+.015*(md-20);         // G30 = 90%
    return Math.min(.95,.90+.005*(md-30));     // finale max 95%
  };
  const confidenceUsage=p=>{
    const md=mdNow(),prior=starterPrior(p)/100;
    if(!md||p.pv===null||p.pv===undefined)return prior;
    const obs=clamp(n(p.pv)/md,0,1),rw=realUsageWeight(md);
    return (1-rw)*prior+rw*obs;
  };
  const availability=p=>100*confidenceUsage(p);

  const formBaseWeight=md=>md<6?0:md<10?.05:md<15?.08:md<21?.13:md<29?.17:.20;
  const sampleReliability=p=>{
    const md=mdNow();if(!md||p.pv===null||p.pv===undefined)return 0;
    return clamp(n(p.pv)/Math.max(4,md*.75),0,1);
  };
  const formSignal=p=>{
    if(p.fm===null||p.fm===undefined)return 50;
    let out=clamp(50+(n(p.fm)-6)*24,15,100);
    if((p.role==='P'||p.role==='D')&&p.mv!==null&&p.mv!==undefined){
      const mv=clamp(50+(n(p.mv)-6)*30,15,100);
      out=.58*out+.42*mv;
    }
    return clamp(out);
  };
  const formConfidenceLabel=p=>{
    const md=mdNow();if(md<6||p.pv===null||p.pv===undefined)return 'PRE';
    const rel=sampleReliability(p);return rel>=.85?'ALTA':rel>=.55?'MEDIA':'BASSA';
  };

  const roleRawBase=(p,st)=>{
    const t=TEAM[p.team]||{def:68,att:68},pr=profile(p),mp=marketPct(p)*100;
    if(p.role==='P'){
      let base=44+.30*(st-50)+.25*(t.def-50)+.08*(pr-50)+.08*(mp-50),rk=starterRank(p);
      base+=rk<=3?9:rk<=6?5:rk<=10?2:0;return base;
    }
    if(p.role==='D')return 32+.24*(st-50)+.24*(pr-50)+.18*(t.def-50)+.10*(t.att-50)+.07*(mp-50);
    if(p.role==='C')return 22+.24*(st-50)+.27*(pr-50)+.19*(t.att-50)+.06*(t.def-50)+.07*(mp-50);
    let base=36+.24*(st-50)+.27*(pr-50)+.23*(t.att-50)+.08*(mp-50),rk=starterRank(p);
    base+=rk<=3?8:rk<=7?5:rk<=12?3:0;return base;
  };
  const starBandValue=(p,base,st)=>{
    const lo=starFloor(p);if(!lo)return base;
    const hi=Math.min(lo+5,{P:96,D:97,C:98,A:99}[p.role]||99),pr=profile(p),mp=marketPct(p)*100,t=TEAM[p.team]||{def:68,att:68};
    const team=(p.role==='P'||p.role==='D')?t.def:t.att;
    const score=.34*st+.26*pr+.22*team+.18*mp,within=clamp((score-55)/45,0,1);
    return Math.max(base,lo+(hi-lo)*within);
  };

  /* ---------- injury ---------- */
  const injuryInfo=p=>window.FS_INJURIES?.[String(p.id)]||window.FS_INJURIES?.[p.name]||null;
  const daysUntil=date=>{
    if(!date)return null;const d=new Date(date);if(Number.isNaN(d.getTime()))return null;
    const days=Math.ceil((d-new Date())/86400000);return days<0?null:days;
  };
  const injuryFactor=p=>{
    const i=injuryInfo(p);if(!i||(!i.injured&&String(i.status||'').toLowerCase()!=='injured'))return 1;
    const reason=String(i.reason||i.type||'').toLowerCase(),left=daysUntil(i.returnDate);
    if(left!==null){if(left<=7)return .94;if(left<=21)return .84;if(left<=45)return .70;if(left<=90)return .55;if(left<=180)return .42;return .32}
    if(/cruciate|acl|crociat|achilles|tendine d.?achille/.test(reason))return .32;
    if(/fracture|frattur|surgery|operat/.test(reason))return .45;
    if(/knee|ginocch|hamstring|muscle|muscolar/.test(reason))return .68;
    if(/knock|bruise|contusion|fatigue|affatic/.test(reason))return .90;
    return .72;
  };

  /* ---------- V9 individual value ---------- */
  const marketTier=p=>{
    if(n(p.fvm)<=3)return 'NORMALE';const q=marketPct(p);
    return q>=.90?'ELITE':q>=.80?'TOP':q>=.65?'ALTA':'NORMALE';
  };
  const fsBreakdownV9=p=>{
    rebuildV9Indexes();
    const md=mdNow(),st=availability(p),raw=roleRawBase(p,st),structural=starBandValue(p,raw,st);
    let usageDelta=0;
    if(md>0&&p.pv!==null&&p.pv!==undefined&&starFloor(p)>0){
      const prior=starterPrior(p)/100,obs=clamp(n(p.pv)/md,0,1);
      usageDelta=clamp((obs-prior)*realUsageWeight(md)*8,-4.5,3);
    }
    let fSignal=50,effWeight=0,formDelta=0;
    if(md>=6&&p.fm!==null&&p.fm!==undefined&&p.pv!==null&&p.pv!==undefined&&n(p.pv)>0){
      fSignal=formSignal(p);
      const rel=sampleReliability(p);
      effWeight=formBaseWeight(md)*Math.pow(rel,1.35);
      formDelta=(fSignal-50)*effWeight*.60;
      let cap=md<15?2.5:md<21?3.5:md<29?4.5:5.5;
      if(['ELITE','TOP'].includes(marketTier(p)))cap*=.80;
      formDelta=clamp(formDelta,-cap,cap);
    }
    const beforeInjury=structural+usageDelta+formDelta,factor=injuryFactor(p),max={P:96,D:97,C:98,A:99}[p.role]||99;
    const final=clamp(beforeInjury*factor,8,max),info=injuryInfo(p);
    return {raw,structural,availability:st,usageDelta,formSignal:fSignal,formWeight:effWeight,formDelta,beforeInjury,injuryFactor:factor,injuryDelta:final-beforeInjury,injuryDays:info?daysUntil(info.returnDate):null,injuryReason:info?String(info.reason||info.type||''):null,reliability:sampleReliability(p),confidence:formConfidenceLabel(p),final};
  };
  const fsValue=p=>fsBreakdownV9(p).final;
  window.fsBreakdownV9=fsBreakdownV9;
  window.fsBreakdown=fsBreakdownV9;
  window.adjustedValue=fsValue;
  window.fsMarketTier=marketTier;
  window.fsBand=p=>{const v=fsValue(p);return v>=92?'ELITE':v>=84?'TOP':v>=72?'ALTA':v>=56?'MEDIA':v>=40?'BASSA':'RISERVA'};
  window.fsTier=window.fsBand;

  /* ---------- package + credits ---------- */
  const packageWeights=[1,.20,.08,.04,.02];
  const usageScore=p=>confidenceUsage(p);
  const tradability=p=>{
    const u=usageScore(p);if(u<.10)return .04;if(u<.20)return .08;if(u<.35)return .16;if(u<.50)return .30;if(u<.65)return .50;if(u<.80)return .70;return .88+.12*u;
  };
  const leagueBudget=()=>Math.max(1,Number(localStorage.getItem('fantascamLeagueBudget')||500));
  const creditSeasonFactor=()=>{const md=mdNow();return md>=32?.62:md>=26?.80:1};
  const creditValue=c=>{
    const credits=Math.max(0,n(c)),share=Math.min(credits/leagueBudget(),.60);
    return Math.min(23,44*Math.pow(share,.97))*creditSeasonFactor();
  };
  const pack=(list,fn,marginal=true)=>list.slice().sort((a,b)=>fn(b)-fn(a)).reduce((s,p,i)=>{
    const m=i===0||!marginal?1:tradability(p);return s+fn(p)*(packageWeights[i]??.015)*m;
  },0);
  window.packageValue=(list,credits=0)=>pack(list,fsValue,true)+creditValue(credits);
  const rawPower=p=>Math.pow(Math.max(1,n(p.fvm,1)),.72);
  const rolePower=p=>.30+.70*marketPct(p);
  const ratioFair=(a,b,power=1.1)=>clamp(100*Math.pow(Math.min(a,b)/Math.max(a,b,1e-9),power));
  const creditsSide=s=>Math.max(0,Number(document.getElementById(s==='A'?'fsCreditsA':'fsCreditsB')?.value)||0);

  /* ---------- anti-scam trade analysis ---------- */
  const analyse=(A,B,ca=0,cb=0)=>{
    rebuildV9Indexes();
    const av=window.packageValue(A,ca),bv=window.packageValue(B,cb);
    const rawA=pack(A,rawPower,false),rawB=pack(B,rawPower,false);
    const roleA=pack(A,rolePower,false),roleB=pack(B,rolePower,false);
    const modelFair=ratioFair(av,bv,1.25),rawFair=ratioFair(rawA,rawB,1.10),roleFair=ratioFair(roleA,roleB,1.00);
    let fairness=.44*modelFair+.44*rawFair+.12*roleFair;
    const guards=[],notes=[];

    // Ruoli diversi 1x1: anche la gerarchia relativa deve essere confrontabile.
    if(A.length===1&&B.length===1&&A[0].role!==B[0].role){
      const gap=Math.abs(marketPct(A[0])-marketPct(B[0]));
      const cap=clamp(100-gap*50,60,100);
      if(fairness>cap){fairness=cap;notes.push(`Gerarchia di ruolo distante: ${A[0].name} è al ${Math.round(marketPct(A[0])*100)}° percentile, ${B[0].name} al ${Math.round(marketPct(B[0])*100)}°.`)}
    }

    // 1x1 con distanza di mercato estrema: i crediti possono aiutare, ma mai rendere verde da soli.
    if(A.length===1&&B.length===1){
      const fA=n(A[0].fvm),fB=n(B[0].fvm),ratio=Math.min(fA,fB)/Math.max(1,fA,fB);
      if(Math.max(fA,fB)>=40&&ratio<.45){
        const weakCredits=fA<fB?ca:cb,lift=Math.min(6,creditValue(weakCredits)*.25),cap=Math.min(80,74+lift);
        fairness=Math.min(fairness,cap);
        guards.push(`Controllo FVM 1×1: il giocatore meno quotato vale solo il ${Math.round(ratio*100)}% dell'altro${weakCredits?`; ${weakCredits} crediti attenuano lo squilibrio, ma non lo cancellano`:''}.`);
      }
    }

    const inspectPackage=(source,other,otherCredits)=>{
      if(source.length!==1||other.length<=1)return;
      const star=source[0],tier=marketTier(star);if(!['ELITE','TOP'].includes(tier))return;
      const anchor=other.slice().sort((a,b)=>n(b.fvm)-n(a.fvm))[0];
      const rr=n(anchor.fvm)/Math.max(1,n(star.fvm)),fr=Math.min(1,fsValue(anchor)/Math.max(1,fsValue(star))),rp=Math.min(1,rolePower(anchor)/Math.max(.01,rolePower(star)));
      const sameRole=anchor.role===star.role;
      const sameTier=tier==='ELITE'?marketTier(anchor)==='ELITE':['ELITE','TOP'].includes(marketTier(anchor));
      const nearPeer=sameRole&&sameTier&&fr>=.92;
      const creditRel=Math.min(.06,(creditValue(otherCredits)/Math.max(1,fsValue(star)))*.25);
      const adequacy=.62*Math.min(1,rr)+.23*fr+.15*rp+(nearPeer?.05:0)+creditRel;
      const required=(tier==='ELITE'?.68:.58)+(other.length>=3?.04:0);

      if(adequacy<required){
        const penalty=Math.min(18,(required-adequacy)*55);fairness-=penalty;
        guards.push(`${star.name} è ${tier}: il miglior elemento del pacchetto è ${anchor.name} (${Math.round(rr*100)}% del suo FVM). Penalità progressiva ${penalty.toFixed(1)} punti.`);
      }
      if(rr<.35&&!nearPeer){
        const lift=Math.min(6,creditValue(otherCredits)*.25),cap=Math.min(79,(tier==='ELITE'?68:72)+lift);
        fairness=Math.min(fairness,cap);
        guards.push(`Protezione ${tier}: un pacchetto non può sostituire ${star.name} senza un giocatore-ancora credibile${otherCredits?' anche considerando i crediti':''}.`);
      }
      // Per diventare VERDE serve un'ancora vera. Eccezione: near-peer stesso ruolo/fascia.
      const greenAnchor=tier==='ELITE'?.65:.60;
      if(rr<greenAnchor&&!nearPeer){
        fairness=Math.min(fairness,87);
        notes.push(`Il pacchetto può essere al massimo accettabile: ${anchor.name} non raggiunge il ${Math.round(greenAnchor*100)}% del FVM di ${star.name}.`);
      }
    };
    inspectPackage(A,B,cb);inspectPackage(B,A,ca);

    fairness=clamp(fairness);
    const modelBias=(av-bv)/Math.max(1,av,bv),rawBias=(rawA-rawB)/Math.max(1,rawA,rawB),bias=.55*modelBias+.45*rawBias;
    const stronger=bias>=0?'A':'B',center=clamp(50+(bias>=0?1:-1)*(100-fairness)/2,0,100);
    return {av,bv,rawA,rawB,roleA,roleB,modelFair,rawFair,roleFair,fairness,center,stronger,guards,notes};
  };
  window.fsTradeAnalysisV9=analyse;

  /* ---------- explanations ---------- */
  const signed=x=>{const v=Math.round(n(x)*10)/10;return v>0?`+${v}`:`${v}`};
  const reasonsFor=(A,B,x,ca,cb)=>{
    const out=[];x.guards.forEach(z=>out.push(z));x.notes.forEach(z=>out.push(z));
    const rawGap=Math.abs(x.rawA-x.rawB)/Math.max(1,x.rawA,x.rawB);
    if(rawGap>=.35)out.push(`FVM/mercato molto distante: circa ${Math.round(rawGap*100)}% di scarto tra i due pacchetti.`);
    else if(rawGap>=.18)out.push(`FVM/mercato moderatamente distante: circa ${Math.round(rawGap*100)}%.`);
    else out.push('Il controllo FVM considera i due lati abbastanza vicini.');

    if(A.length!==B.length)out.push(`Scambio ${A.length}×${B.length}: dal secondo giocatore in poi il peso cala molto (20%, 8%, 4%) per impedire che la quantità compri un top.`);
    if(ca||cb)out.push(`Crediti inclusi: A ${ca}, B ${cb}. I crediti aiutano il valore del lato, ma non sostituiscono da soli il giocatore-ancora di un TOP/ELITE.`);

    const all=[...A,...B],dynamic=all.map(p=>({p,b:fsBreakdownV9(p)})).sort((x,y)=>Math.max(Math.abs(y.b.formDelta),Math.abs(y.b.usageDelta))-Math.max(Math.abs(x.b.formDelta),Math.abs(x.b.usageDelta)))[0];
    if(dynamic){
      const {p,b}=dynamic;
      if(Math.abs(b.usageDelta)>=.8)out.push(`${p.name}: presenze reali ${p.pv??'—'}/${mdNow()} incidono ${signed(b.usageDelta)} FS. La quota reale pesa ${Math.round(realUsageWeight(mdNow())*100)}% in questa fase.`);
      if(Math.abs(b.formDelta)>=.6)out.push(`${p.name}: forma ${signed(b.formDelta)} FS con affidabilità ${b.confidence.toLowerCase()} (${p.pv??0} presenze, FM ${p.fm!==null&&p.fm!==undefined?n(p.fm).toFixed(2):'—'}).`);
      else if(mdNow()>=6&&p.fm!==null&&p.fm!==undefined&&b.confidence==='BASSA')out.push(`${p.name}: FM ${n(p.fm).toFixed(2)}, ma campione di presenze ancora basso; l'algoritmo limita l'impatto della forma.`);
    }
    const hurt=all.map(p=>({p,b:fsBreakdownV9(p)})).find(x=>x.b.injuryFactor<1);
    if(hurt)out.push(`${hurt.p.name}: infortunio attivo, impatto ${signed(hurt.b.injuryDelta)} FS${hurt.b.injuryDays!==null?` (rientro stimato fra ${hurt.b.injuryDays} giorni)`:''}.`);
    return [...new Set(out)].slice(0,6);
  };

  /* ---------- result banner ---------- */
  const ensureBanner=()=>{
    let ov=document.getElementById('fs-v9-verdict-overlay');if(ov)return ov;
    const st=document.createElement('style');st.id='fs-v9-verdict-style';st.textContent=`
      #fs-v9-verdict-overlay{position:fixed;inset:0;z-index:50000;display:none;align-items:flex-end;justify-content:center;padding:14px;background:rgba(0,0,0,.72);backdrop-filter:blur(6px)}
      #fs-v9-verdict-overlay.show{display:flex}.fs-v9-banner{width:min(700px,100%);max-height:88vh;overflow:auto;border-radius:24px;border:1px solid rgba(255,255,255,.15);background:linear-gradient(160deg,#0b1110,#050807);box-shadow:0 30px 100px rgba(0,0,0,.72);animation:fsv9in .22s ease}.fs-v9-banner.good{border-color:rgba(77,255,60,.55)}.fs-v9-banner.warn{border-color:rgba(255,210,53,.58)}.fs-v9-banner.bad{border-color:rgba(255,72,94,.65)}
      @keyframes fsv9in{from{transform:translateY(20px);opacity:.35}to{transform:translateY(0);opacity:1}}.fsv9head{padding:17px 18px 14px;display:flex;gap:12px;align-items:flex-start;border-bottom:1px solid rgba(255,255,255,.08)}.fsv9icon{font-size:34px}.fsv9title{flex:1;min-width:0}.fsv9title small{display:block;color:#91a096;font-size:10px;font-weight:900;letter-spacing:1.4px}.fsv9title b{display:block;margin-top:3px;font-family:'Sora','Outfit',sans-serif;font-size:24px;line-height:1.08}.fsv9score{text-align:right;white-space:nowrap}.fsv9score strong{display:block;font-size:34px;font-family:'Sora','Outfit',sans-serif}.fsv9score span{font-size:10px;color:#91a096}.fsv9body{padding:14px 18px 16px}.fsv9summary{font-size:13px;line-height:1.5;color:#e6eee8;margin-bottom:10px}.fsv9reasons{display:grid;gap:7px}.fsv9reason{display:flex;gap:8px;padding:9px 10px;border-radius:12px;background:rgba(255,255,255,.045);font-size:12px;line-height:1.4;color:#c4d0c7}.fsv9actions{display:flex;gap:8px;padding:0 18px 17px}.fsv9actions button{flex:1;border-radius:13px;padding:11px 12px;font-weight:900;border:1px solid rgba(255,255,255,.11);background:rgba(255,255,255,.06);color:#fff}.fsv9actions .primary{background:linear-gradient(135deg,#0d8a39,#075526);border-color:rgba(77,255,60,.35)}
      @media(min-width:700px){#fs-v9-verdict-overlay{align-items:center}}
    `;document.head.appendChild(st);
    ov=document.createElement('div');ov.id='fs-v9-verdict-overlay';ov.innerHTML=`<div class="fs-v9-banner"><div class="fsv9head"><div class="fsv9icon"></div><div class="fsv9title"><small>VERDETTO FANTASCAM V9.0</small><b></b></div><div class="fsv9score"><strong></strong><span>equità reale</span></div></div><div class="fsv9body"><div class="fsv9summary"></div><div class="fsv9reasons"></div></div><div class="fsv9actions"><button data-close>Chiudi</button><button class="primary" data-details>Vedi analisi</button></div></div>`;
    document.body.appendChild(ov);
    ov.querySelector('[data-close]').onclick=()=>ov.classList.remove('show');
    ov.onclick=e=>{if(e.target===ov)ov.classList.remove('show')};
    ov.querySelector('[data-details]').onclick=()=>{ov.classList.remove('show');const el=document.getElementById('fs-v9-analysis');el?.scrollIntoView({behavior:'smooth',block:'center'});el?.querySelector('.fsv9-analysis-body')?.classList.add('open')};
    return ov;
  };
  let lastBannerSig='';
  const showBanner=(A,B,x,status,title,summary,reasons,ca,cb)=>{
    const ov=ensureBanner(),card=ov.querySelector('.fs-v9-banner');card.className=`fs-v9-banner ${status}`;
    ov.querySelector('.fsv9icon').textContent=status==='good'?'✅':status==='warn'?'🟡':'🚨';
    ov.querySelector('.fsv9title b').textContent=title;ov.querySelector('.fsv9score strong').textContent=`${Math.round(x.fairness)}%`;
    ov.querySelector('.fsv9summary').textContent=summary;ov.querySelector('.fsv9reasons').innerHTML=reasons.map(z=>`<div class="fsv9reason"><span>•</span><span>${z}</span></div>`).join('');
    const sig=`${A.map(p=>p.id)}|${B.map(p=>p.id)}|${ca}|${cb}|${status}|${Math.round(x.fairness*10)}`;
    if(sig!==lastBannerSig){lastBannerSig=sig;ov.classList.add('show')}
  };

  /* ---------- detailed analysis ---------- */
  const playerCard=p=>{
    const b=fsBreakdownV9(p),fm=p.fm!==null&&p.fm!==undefined?n(p.fm).toFixed(2):'—',mv=p.mv!==null&&p.mv!==undefined?n(p.mv).toFixed(2):'—';
    return `<div class="fsv9-player"><b>${p.name}</b><span>${p.team} · ${p.role}</span><div>FS <strong>${Math.round(b.final)}</strong> · FVM <strong>${p.fvm??'—'}</strong> · PV <strong>${p.pv??'—'}</strong> · MV <strong>${mv}</strong> · FM <strong>${fm}</strong></div><small>Forma ${signed(b.formDelta)} · Presenze ${signed(b.usageDelta)} · Confidenza ${b.confidence}</small></div>`;
  };
  const ensureAnalysis=()=>{
    let box=document.getElementById('fs-v9-analysis');if(box)return box;
    document.getElementById('fs-trade-analysis')?.setAttribute('style','display:none!important');
    const result=document.querySelector('.result');if(!result)return null;
    const st=document.createElement('style');st.textContent=`#fs-v9-analysis{margin-top:14px;border:1px solid rgba(77,255,60,.18);border-radius:14px;overflow:hidden;text-align:left;background:rgba(2,10,5,.72)}.fsv9-analysis-toggle{width:100%;border:0;background:rgba(77,255,60,.07);color:#fff;padding:12px 14px;text-align:left;font:800 13px 'Outfit',sans-serif}.fsv9-analysis-body{display:none;padding:12px}.fsv9-analysis-body.open{display:block}.fsv9-factors{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-bottom:10px}.fsv9-factor{padding:9px;border-radius:10px;background:rgba(255,255,255,.04);font-size:10px;color:#93a99a}.fsv9-factor b{display:block;color:#fff;font-size:17px}.fsv9-sides{display:grid;grid-template-columns:1fr 1fr;gap:9px}.fsv9-side-title{font-size:10px;font-weight:900;color:#8ca592;margin:7px 0}.fsv9-player{padding:9px;border:1px solid rgba(255,255,255,.07);border-radius:10px;margin-bottom:6px;font-size:11px}.fsv9-player>span{float:right;color:#8ca592}.fsv9-player>div{margin-top:5px;color:#ccd7ce}.fsv9-player small{display:block;margin-top:4px;color:#91a096}@media(max-width:600px){.fsv9-factors{grid-template-columns:1fr 1fr}.fsv9-sides{grid-template-columns:1fr}}`;document.head.appendChild(st);
    box=document.createElement('div');box.id='fs-v9-analysis';box.innerHTML=`<button class="fsv9-analysis-toggle" type="button">🔎 Analisi V9.0 — apri dettagli</button><div class="fsv9-analysis-body"></div>`;result.appendChild(box);
    box.querySelector('.fsv9-analysis-toggle').onclick=()=>box.querySelector('.fsv9-analysis-body').classList.toggle('open');return box;
  };
  const renderAnalysis=(A,B,x)=>{
    const box=ensureAnalysis();if(!box)return;box.style.display='';const body=box.querySelector('.fsv9-analysis-body');
    body.innerHTML=`<div class="fsv9-factors"><div class="fsv9-factor">Motore FS<b>${x.modelFair.toFixed(0)}%</b></div><div class="fsv9-factor">Controllo FVM<b>${x.rawFair.toFixed(0)}%</b></div><div class="fsv9-factor">Gerarchia ruolo<b>${x.roleFair.toFixed(0)}%</b></div><div class="fsv9-factor">Equità finale<b>${x.fairness.toFixed(0)}%</b></div><div class="fsv9-factor">Forma max<b>${Math.round(formBaseWeight(mdNow())*100)}%</b></div><div class="fsv9-factor">Uso reale pesa<b>${Math.round(realUsageWeight(mdNow())*100)}%</b></div></div><div class="fsv9-sides"><div><div class="fsv9-side-title">SQUADRA A CEDE</div>${A.map(playerCard).join('')}</div><div><div class="fsv9-side-title">SQUADRA B CEDE</div>${B.map(playerCard).join('')}</div></div>`;
  };

  /* ---------- compact player metadata ---------- */
  const healthBadge=p=>{
    const b=fsBreakdownV9(p);if(b.injuryFactor>=1)return '';
    return `<span class="chip" title="${b.injuryReason||'Infortunio'}">🚑 ${signed(b.injuryDelta)}</span>`;
  };
  window.updateMeta=row=>{
    const p=typeof getPlayer==='function'?getPlayer(row.querySelector('.footballer')?.value):null,box=row.querySelector('.meta');if(!box)return;
    if(!p){box.innerHTML='<span class="empty">Seleziona un giocatore</span>';return}
    const b=fsBreakdownV9(p),fm=p.fm!==null&&p.fm!==undefined?`<span class="chip">FM ${n(p.fm).toFixed(2)}</span>`:'',pv=p.pv!==null&&p.pv!==undefined?`<span class="chip">PV ${p.pv}</span>`:'';
    const dyn=Math.abs(b.formDelta)>=.5?`<span class="chip" title="Forma pesata per affidabilità">🔥 FORMA ${signed(b.formDelta)} · ${b.confidence}</span>`:'';
    box.innerHTML=`<span class="chip">${typeof teamAbbr==='function'?teamAbbr(p.team):p.team}</span><span class="chip">Q ${p.quote}</span><span class="chip">FVM ${p.fvm}</span><span class="chip top30">FS ${Math.round(b.final)}</span><span class="chip">${marketTier(p)}</span>${dyn}${healthBadge(p)}${fm}${pv}`;
  };

  /* ---------- final calculator ---------- */
  window.calculate=()=>{
    rebuildV9Indexes();
    const A=typeof sidePlayers==='function'?sidePlayers('A'):[],B=typeof sidePlayers==='function'?sidePlayers('B'):[];
    const s=document.getElementById('score'),v=document.getElementById('verdict'),va=document.getElementById('valueA'),vb=document.getElementById('valueB'),d=document.getElementById('detail');
    if(!s||!v||!va||!vb||!d)return;
    const ca=creditsSide('A'),cb=creditsSide('B');v.className='verdict';
    if(!A.length||!B.length){lastBannerSig='';document.getElementById('fs-v9-verdict-overlay')?.classList.remove('show');s.textContent='—';v.textContent='Seleziona almeno un giocatore per parte';va.textContent=A.length?window.packageValue(A,ca).toFixed(0):'—';vb.textContent=B.length?window.packageValue(B,cb).toFixed(0):'—';document.getElementById('fs-v9-analysis')?.setAttribute('style','display:none');return}

    const x=analyse(A,B,ca,cb),reasons=reasonsFor(A,B,x,ca,cb);
    const kicker=document.querySelector('.result-kicker');if(kicker)kicker.textContent='Equità dello scambio';
    s.textContent=x.fairness.toFixed(0)+'%';va.textContent=x.av.toFixed(0);vb.textContent=x.bv.toFixed(0);
    d.textContent=`100% = equilibrio perfetto · FVM ${x.rawFair.toFixed(0)}% · Motore FS ${x.modelFair.toFixed(0)}%`;
    let status,title,summary;
    if(x.fairness<75){status='bad';title='FANTASCAM — SCAMBIO BOCCIATO';v.textContent='🚨 FANTASCAM!! 🚨';v.classList.add('bad');summary=`Vantaggio netto Squadra ${x.stronger}. Il controllo combinato di valore, FVM, gerarchia, forma e pacchetto non raggiunge il 75%.`;d.textContent+=` · Vantaggio Squadra ${x.stronger}`}
    else if(x.fairness<88){status='warn';title='SCAMBIO ACCETTABILE';v.textContent='🟡 SCAMBIO ACCETTABILE';v.classList.add('warn');summary=`Scambio possibile ma non perfettamente equo: vantaggio Squadra ${x.stronger}. La fascia accettabile è 75–87%.`;d.textContent+=` · Vantaggio Squadra ${x.stronger}`}
    else{status='good';title='SCAMBIO EQUILIBRATO';v.textContent='✅ SCAMBIO EQUILIBRATO';v.classList.add('good');summary='I due lati raggiungono almeno l’88% di equità: mercato, struttura e gerarchia non mostrano squilibri sufficienti per bocciare lo scambio.';d.textContent+=' · Equilibrio alto'}

    renderAnalysis(A,B,x);showBanner(A,B,x,status,title,summary,reasons,ca,cb);
    window.FS_LAST_TRADE={A,B,t:x,center:x.center,fairness:x.fairness,stronger:x.stronger,creditsA:ca,creditsB:cb,verdict:v.textContent,reasons,status};
    window.dispatchEvent(new CustomEvent('fantascam:trade-updated',{detail:window.FS_LAST_TRADE}));
  };

  window.getTradeSummary=()=>{
    const x=window.FS_LAST_TRADE;if(!x)return 'Nessuno scambio selezionato';const names=s=>s.map(p=>p.name).join(' + ')||'—';
    return `Scambio: ${names(x.A)}${x.creditsA?` + ${x.creditsA} crediti`:''} ⇄ ${names(x.B)}${x.creditsB?` + ${x.creditsB} crediti`:''} | Equità ${Math.round(x.fairness)}% | ${x.verdict} | ${x.reasons?.[0]||''}`;
  };

  const refreshAll=()=>{lastPlayersRef=null;rebuildV9Indexes();document.querySelectorAll('.player').forEach(row=>window.updateMeta(row));window.calculate()};
  window.addEventListener('fantascam:injuries-updated',refreshAll);
  const algo=document.querySelector('.algoBox b');if(algo)algo.textContent='V9.0';
  const line=document.querySelector('.brandline');if(line&&!document.getElementById('fs-v9-badge')){const b=document.createElement('div');b.className='badge';b.id='fs-v9-badge';b.textContent='🧠 CONFIDENCE ENGINE V9.0';line.appendChild(b)}
  setTimeout(refreshAll,0);
  console.info('FANTASCAM V9.0 Confidence Engine active');
})();
/* -------------------- FANTASCAM V10.0 ROSTER IMPACT --------------------
   Context-aware trade layer:
   - valuta la rosa completa prima/dopo lo scambio
   - miglior XI + profondita' + modificatore difesa
   - backup strategico SOLO per i portieri
   - bonus portiere solo per club con reparto difensivo buono/premium
   - il contesto rosa puo' correggere, ma non cancellare, i guardrail anti-scam
   - lega salvata localmente e sincronizzabile da /api/league-sync
*/
(() => {
  if (window.FS_V10_ROSTER_LOADED) return;
  window.FS_V10_ROSTER_LOADED = true;

  const clamp=(x,a=0,b=100)=>Math.max(a,Math.min(b,x));
  const n=(x,d=0)=>Number.isFinite(Number(x))?Number(x):d;
  const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
  const STORE='fantascamLeagueV10';
  const TEAM_DEF={
    Inter:96,Milan:91,Napoli:92,Juventus:90,Roma:89,Atalanta:88,Bologna:84,Lazio:83,
    Fiorentina:80,Como:79,Torino:78,Udinese:74,Genoa:73,Sassuolo:70,Parma:69,Cagliari:67,
    Lecce:64,Frosinone:62,Monza:61,Venezia:59
  };
  const FORMATIONS=[[1,3,4,3],[1,3,5,2],[1,4,3,3],[1,4,4,2],[1,4,5,1],[1,5,3,2],[1,5,4,1]];

  const allPlayers=()=>{try{return Array.isArray(PLAYERS)?PLAYERS:[]}catch(e){return []}};
  const byId=id=>allPlayers().find(p=>String(p.id)===String(id))||null;
  const byName=name=>{const k=norm(name);return allPlayers().find(p=>norm(p.name)===k)||null};
  const resolvePlayer=x=>{
    if(!x)return null;
    if(typeof x==='object'&&x.role&&x.name)return x;
    if(typeof x==='object')return byId(x.id??x.playerId) || byName(x.name??x.nome);
    return byId(x)||byName(x);
  };
  const fs=p=>{try{return n(window.adjustedValue?.(p),0)}catch(e){return 0}};
  const marketRaw=p=>.72*Math.log1p(Math.max(0,n(p?.fvm)))+.28*Math.log1p(Math.max(0,n(p?.quote)));

  const sanitizeLeague=data=>{
    if(!data||typeof data!=='object')throw new Error('Formato lega non valido');
    const teams=(data.teams||data.squads||data.fantasquadre||[]).map((t,i)=>{
      const refs=t.players||t.roster||t.rosa||t.calciatori||[];
      const ids=[];
      refs.forEach(r=>{const p=resolvePlayer(r);if(p&&!ids.some(x=>String(x)===String(p.id)))ids.push(p.id)});
      return {id:String(t.id??t.teamId??i+1),name:String(t.name??t.nome??t.teamName??`Squadra ${i+1}`),credits:n(t.credits??t.crediti,0),players:ids};
    }).filter(t=>t.name&&t.players.length);
    if(teams.length<2)throw new Error('Non trovo almeno due rose complete');
    return {name:String(data.name??data.leagueName??data.nome??'Lega Fantacalcio'),sourceUrl:data.sourceUrl||data.url||null,source:data.source||'import',updatedAt:data.updatedAt||new Date().toISOString(),teams};
  };
  const loadLeague=()=>{try{const raw=localStorage.getItem(STORE);return raw?sanitizeLeague(JSON.parse(raw)):null}catch(e){return null}};
  let league=loadLeague();
  const saveLeague=data=>{league=sanitizeLeague(data);localStorage.setItem(STORE,JSON.stringify(league));renderLeaguePanel();window.calculate?.();return league};
  const clearLeague=()=>{league=null;localStorage.removeItem(STORE);renderLeaguePanel();window.calculate?.()};

  const teamById=id=>league?.teams?.find(t=>String(t.id)===String(id))||null;
  const rosterOf=t=>(t?.players||[]).map(resolvePlayer).filter(Boolean);
  const hasPlayer=(roster,p)=>roster.some(x=>String(x.id)===String(p.id));
  const removeTrade=(roster,out)=>roster.filter(p=>!out.some(x=>String(x.id)===String(p.id)));
  const applyTrade=(roster,out,inc)=>{
    const a=removeTrade(roster,out).slice();
    inc.forEach(p=>{if(!hasPlayer(a,p))a.push(p)});return a;
  };

  const topByRole=(roster,role)=>roster.filter(p=>p.role===role).sort((a,b)=>fs(b)-fs(a));
  const bestXI=roster=>{
    const r={P:topByRole(roster,'P'),D:topByRole(roster,'D'),C:topByRole(roster,'C'),A:topByRole(roster,'A')};
    let best={score:0,formation:'—',players:[]};
    FORMATIONS.forEach(f=>{
      const [p,d,c,a]=f;if(r.P.length<p||r.D.length<d||r.C.length<c||r.A.length<a)return;
      const chosen=[...r.P.slice(0,p),...r.D.slice(0,d),...r.C.slice(0,c),...r.A.slice(0,a)];
      const score=chosen.reduce((s,x)=>s+fs(x),0);
      if(score>best.score)best={score,formation:`${d}-${c}-${a}`,players:chosen};
    });
    return best;
  };
  const depthScore=roster=>{
    const r={P:topByRole(roster,'P'),D:topByRole(roster,'D'),C:topByRole(roster,'C'),A:topByRole(roster,'A')};
    // Profondita' vera, non backup nominale: D/C/A valgono solo come alternative di livello.
    const p=(r.P[1]?fs(r.P[1])*.07:0)+(r.P[2]?fs(r.P[2])*.025:0);
    const d=r.D.slice(4,7).reduce((s,x,i)=>s+fs(x)*[.09,.06,.035][i],0);
    const c=r.C.slice(4,7).reduce((s,x,i)=>s+fs(x)*[.09,.06,.035][i],0);
    const a=r.A.slice(3,6).reduce((s,x,i)=>s+fs(x)*[.08,.05,.03][i],0);
    return p+d+c+a;
  };
  const modifierScore=roster=>{
    const d=topByRole(roster,'D').slice(0,4);if(d.length<4)return 0;
    return d.reduce((s,x)=>s+fs(x),0)/4;
  };
  const rosterCore=roster=>{
    const xi=bestXI(roster),depth=depthScore(roster),mod=modifierScore(roster);
    // Il modificatore conta ma non domina il valore della rosa.
    return {xi,depth,modifier:mod,total:xi.score+depth+mod*.32};
  };

  const gkOrder=team=>allPlayers().filter(p=>p.role==='P'&&p.team===team).sort((a,b)=>marketRaw(b)-marketRaw(a));
  const gkPairState=roster=>{
    const out=[];
    Object.keys(TEAM_DEF).forEach(team=>{
      const def=TEAM_DEF[team]||0;if(def<78)return; // SOLO club buoni/premium
      const g=gkOrder(team);if(g.length<2)return;
      const starter=g[0],backup=g[1];
      if(hasPlayer(roster,starter)&&hasPlayer(roster,backup)){
        const tier=def>=88?'PREMIUM':'BUONO';
        // Como (79) rientra correttamente nella fascia BUONO.
        const bonus=tier==='PREMIUM'?6:4;
        out.push({team,tier,bonus,starter,backup});
      }
    });
    return out;
  };
  const gkHandcuffDelta=(before,after)=>{
    const a=gkPairState(before),b=gkPairState(after),key=x=>`${x.team}:${x.starter.id}:${x.backup.id}`;
    const am=new Map(a.map(x=>[key(x),x])),bm=new Map(b.map(x=>[key(x),x]));
    let delta=0;const notes=[];
    for(const [k,x] of bm){if(!am.has(k)){delta+=x.bonus;notes.push(`🧤 Completa ${x.starter.name} + ${x.backup.name} (${x.team}): bonus portieri +${x.bonus}, perché il reparto difensivo del club è ${x.tier.toLowerCase()}.`)}}
    for(const [k,x] of am){if(!bm.has(k)){delta-=x.bonus;notes.push(`🧤 Perde la copertura ${x.starter.name} + ${x.backup.name} (${x.team}): impatto portieri -${x.bonus}.`)}}
    return {delta,notes};
  };

  const sideRosterImpact=(team,out,inc)=>{
    if(!team)return {valid:false,delta:0,notes:['Nessuna fantasquadra selezionata.']};
    const before=rosterOf(team);
    const missing=out.filter(p=>!hasPlayer(before,p));
    if(missing.length)return {valid:false,delta:0,notes:[`⚠️ ${missing.map(p=>p.name).join(', ')} non risulta nella rosa di ${team.name}: impatto rosa non applicato.`],missing};
    const after=applyTrade(before,out,inc),b=rosterCore(before),a=rosterCore(after),gk=gkHandcuffDelta(before,after);
    const coreDelta=a.total-b.total;
    const xiDelta=a.xi.score-b.xi.score;
    const modDelta=(a.modifier-b.modifier)*.32;
    // Scala interpretabile: ~10 FS reali sull'XI = circa 2.5 punti di impatto rosa.
    const delta=coreDelta*.25+gk.delta;
    const notes=[];
    if(Math.abs(xiDelta)>=2)notes.push(`${team.name}: miglior XI ${xiDelta>=0?'+':''}${xiDelta.toFixed(1)} FS (${b.xi.formation} → ${a.xi.formation}).`);
    if(Math.abs(modDelta)>=.5)notes.push(`${team.name}: qualità blocco difensivo/modificatore ${modDelta>=0?'+':''}${modDelta.toFixed(1)}.`);
    gk.notes.forEach(x=>notes.push(x));
    if(!notes.length)notes.push(`${team.name}: lo scambio cambia poco la miglior formazione e la profondità reale.`);
    return {valid:true,delta,coreDelta,xiDelta,modifierDelta:modDelta,gkDelta:gk.delta,notes,before:b,after:a};
  };

  const rosterTradeImpact=(A,B,teamA,teamB)=>{
    const ia=sideRosterImpact(teamA,A,B),ib=sideRosterImpact(teamB,B,A);
    if(!ia.valid||!ib.valid)return {active:false,shift:0,impactA:ia,impactB:ib,notes:[...ia.notes,...ib.notes]};
    const advantage=ia.delta-ib.delta; // + => contesto favorisce A
    const shift=clamp(advantage*.34,-4,4); // massimo ±8 punti di equità
    const notes=[...ia.notes,...ib.notes];
    if(Math.abs(advantage)>=2)notes.push(`Impatto complessivo sulle rose: vantaggio contestuale ${advantage>0?teamA.name:teamB.name} (${Math.abs(advantage).toFixed(1)} punti rosa).`);
    else notes.push('L’impatto sulle due rose è sostanzialmente bilanciato.');
    return {active:true,shift,advantage,impactA:ia,impactB:ib,notes};
  };
  window.FS_ROSTER_ENGINE={bestXI,rosterCore,gkPairState,gkHandcuffDelta,rosterTradeImpact,teamById,rosterOf};

  const teamSelectId=s=>s==='A'?'fsLeagueTeamA':'fsLeagueTeamB';
  const selectedTeam=s=>teamById(document.getElementById(teamSelectId(s))?.value);

  /* -------- League UI -------- */
  const ensureLeagueStyles=()=>{
    if(document.getElementById('fs-v10-league-style'))return;
    const st=document.createElement('style');st.id='fs-v10-league-style';st.textContent=`
      #fs-v10-league{margin:0 0 16px;border:1px solid rgba(207,170,255,.25);border-radius:18px;background:linear-gradient(145deg,rgba(15,10,25,.96),rgba(4,8,10,.96));padding:14px;box-shadow:0 14px 44px rgba(0,0,0,.28)}
      .fsv10-head{display:flex;justify-content:space-between;gap:10px;align-items:center}.fsv10-head b{font:800 15px 'Sora','Outfit',sans-serif}.fsv10-head small{display:block;color:#95a39b;font-size:10px;margin-top:3px}.fsv10-manage{border:1px solid rgba(207,170,255,.3);border-radius:10px;background:rgba(133,92,255,.13);color:#fff;padding:8px 10px;font-weight:800}.fsv10-teams{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:11px}.fsv10-teams label{font-size:10px;color:#96a59b;font-weight:900}.fsv10-teams select{margin-top:4px}.fsv10-status{margin-top:9px;font-size:10px;color:#8da094}.fsv10-modal{position:fixed;inset:0;z-index:60000;display:none;align-items:flex-end;justify-content:center;background:rgba(0,0,0,.72);padding:12px;backdrop-filter:blur(5px)}.fsv10-modal.show{display:flex}.fsv10-sheet{width:min(680px,100%);border:1px solid rgba(207,170,255,.3);border-radius:22px;background:#090b10;padding:17px;box-shadow:0 30px 100px rgba(0,0,0,.7)}.fsv10-sheet h3{margin:0 0 5px}.fsv10-sheet p{margin:0 0 12px;color:#98a49d;font-size:11px;line-height:1.45}.fsv10-sheet input,.fsv10-sheet textarea{width:100%;border:1px solid rgba(255,255,255,.13);border-radius:11px;background:#030506;color:#fff;padding:11px;font:700 13px 'Outfit',sans-serif}.fsv10-sheet textarea{height:130px;margin-top:8px;font-family:monospace;font-size:11px}.fsv10-buttons{display:flex;gap:7px;margin-top:9px}.fsv10-buttons button{flex:1;border-radius:11px;padding:10px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.06);color:#fff;font-weight:900}.fsv10-buttons .primary{background:linear-gradient(135deg,#6d40d8,#3c1e91)}.fsv10-msg{font-size:11px;margin-top:8px;color:#b6c5bb}.fsv10-roster-chip{display:inline-flex;padding:5px 8px;border-radius:999px;background:rgba(133,92,255,.10);border:1px solid rgba(207,170,255,.20);font-size:10px;font-weight:800;margin-left:5px}
      @media(min-width:700px){.fsv10-modal{align-items:center}}@media(max-width:600px){.fsv10-teams{grid-template-columns:1fr}}
    `;document.head.appendChild(st);
  };
  const ensureLeaguePanel=()=>{
    ensureLeagueStyles();let box=document.getElementById('fs-v10-league');if(box)return box;
    box=document.createElement('div');box.id='fs-v10-league';box.innerHTML=`<div class="fsv10-head"><div><b>🏆 League Sync & Roster Impact</b><small>Valuta lo scambio dentro le due rose reali. Backup strategico soltanto in porta.</small></div><button class="fsv10-manage" type="button">Gestisci lega</button></div><div class="fsv10-teams"><label>FANTASQUADRA A<select id="fsLeagueTeamA"></select></label><label>FANTASQUADRA B<select id="fsLeagueTeamB"></select></label></div><div class="fsv10-status"></div>`;
    const grid=document.querySelector('.grid'),hero=document.querySelector('.hero');(grid||hero)?.parentNode?.insertBefore(box,grid||hero.nextSibling);
    box.querySelector('.fsv10-manage').onclick=()=>ensureLeagueModal().classList.add('show');
    box.querySelectorAll('select').forEach(s=>s.addEventListener('change',()=>window.calculate?.()));
    return box;
  };
  const ensureLeagueModal=()=>{
    let m=document.getElementById('fs-v10-league-modal');if(m)return m;
    m=document.createElement('div');m.id='fs-v10-league-modal';m.className='fsv10-modal';m.innerHTML=`<div class="fsv10-sheet"><h3>Collega la tua lega</h3><p>Per una lega pubblica prova il link Leghe Fantacalcio. Se Fantacalcio non espone le rose pubblicamente, puoi importare un JSON normalizzato senza condividere password.</p><input id="fsLeagueUrl" placeholder="https://leghe.fantacalcio.it/nome-lega"><div class="fsv10-buttons"><button class="primary" data-sync>Sincronizza</button><button data-refresh>Aggiorna</button></div><textarea id="fsLeagueJson" placeholder='Fallback JSON: {"name":"Fantapolli","teams":[{"name":"Atletico Chava","players":[123,456]}]}'></textarea><div class="fsv10-buttons"><button data-import>Importa JSON</button><button data-clear>Cancella lega</button><button data-close>Chiudi</button></div><div class="fsv10-msg"></div></div>`;document.body.appendChild(m);
    const msg=t=>m.querySelector('.fsv10-msg').textContent=t;
    const sync=async()=>{const url=m.querySelector('#fsLeagueUrl').value.trim()||league?.sourceUrl;if(!url){msg('Inserisci il link della lega.');return}msg('Sincronizzazione in corso…');try{const r=await fetch(`/api/league-sync?url=${encodeURIComponent(url)}`,{headers:{accept:'application/json'}}),j=await r.json();if(!r.ok)throw new Error(j.error||`HTTP ${r.status}`);j.sourceUrl=url;saveLeague(j);msg(`✅ ${league.name}: ${league.teams.length} rose caricate.`)}catch(e){msg(`⚠️ ${e.message}. Se la lega è privata o le rose non sono pubbliche, usa il JSON di fallback.`)}};
    m.querySelector('[data-sync]').onclick=sync;m.querySelector('[data-refresh]').onclick=sync;
    m.querySelector('[data-import]').onclick=()=>{try{saveLeague(JSON.parse(m.querySelector('#fsLeagueJson').value));msg(`✅ ${league.name}: ${league.teams.length} rose importate.`)}catch(e){msg(`Errore: ${e.message}`)}};
    m.querySelector('[data-clear]').onclick=()=>{clearLeague();msg('Lega rimossa.')};m.querySelector('[data-close]').onclick=()=>m.classList.remove('show');m.onclick=e=>{if(e.target===m)m.classList.remove('show')};return m;
  };
  const renderLeaguePanel=()=>{
    const box=ensureLeaguePanel(),a=box.querySelector('#fsLeagueTeamA'),b=box.querySelector('#fsLeagueTeamB'),status=box.querySelector('.fsv10-status');
    const prevA=a.value,prevB=b.value,opts=league?`<option value="">Scegli squadra…</option>${league.teams.map(t=>`<option value="${t.id}">${t.name} · ${t.players.length} giocatori</option>`).join('')}`:`<option value="">Nessuna lega collegata</option>`;
    a.innerHTML=opts;b.innerHTML=opts;if(league){if(league.teams.some(t=>String(t.id)===prevA))a.value=prevA;if(league.teams.some(t=>String(t.id)===prevB))b.value=prevB;status.innerHTML=`✅ <b>${league.name}</b><span class="fsv10-roster-chip">${league.teams.length} squadre</span><span class="fsv10-roster-chip">agg. ${new Date(league.updatedAt).toLocaleDateString('it-IT')}</span>`}else status.textContent='Collega una lega per attivare l’impatto rosa; senza lega resta attivo il motore V9.0.';
  };
  window.FS_LEAGUE={get:()=>league,set:saveLeague,clear:clearLeague,sanitize:sanitizeLeague,async sync(url){const r=await fetch(`/api/league-sync?url=${encodeURIComponent(url)}`),j=await r.json();if(!r.ok)throw new Error(j.error||`HTTP ${r.status}`);j.sourceUrl=url;return saveLeague(j)}};

  /* -------- final V10 verdict wrapper -------- */
  const baseCalculate=window.calculate;
  const hideOldBanners=()=>{document.getElementById('fs-v9-verdict-overlay')?.classList.remove('show');document.getElementById('fs-v83-verdict-overlay')?.classList.remove('show')};
  const ensureV10Banner=()=>{
    let ov=document.getElementById('fs-v10-verdict-overlay');if(ov)return ov;
    const st=document.createElement('style');st.textContent=`#fs-v10-verdict-overlay{position:fixed;inset:0;z-index:65000;display:none;align-items:flex-end;justify-content:center;padding:12px;background:rgba(0,0,0,.74);backdrop-filter:blur(6px)}#fs-v10-verdict-overlay.show{display:flex}.fsv10-banner{width:min(700px,100%);border-radius:24px;overflow:hidden;border:1px solid rgba(255,255,255,.14);background:linear-gradient(160deg,#11101c,#050708);box-shadow:0 30px 100px rgba(0,0,0,.75)}.fsv10-banner.good{border-color:rgba(77,255,60,.5)}.fsv10-banner.warn{border-color:rgba(255,210,53,.55)}.fsv10-banner.bad{border-color:rgba(255,72,94,.62)}.fsv10-vhead{display:flex;gap:11px;align-items:flex-start;padding:17px;border-bottom:1px solid rgba(255,255,255,.08)}.fsv10-vicon{font-size:34px}.fsv10-vtitle{flex:1}.fsv10-vtitle small{display:block;color:#9b91ad;font-size:10px;font-weight:900;letter-spacing:1.2px}.fsv10-vtitle b{display:block;font:800 22px 'Sora','Outfit',sans-serif;margin-top:3px}.fsv10-vscore{text-align:right}.fsv10-vscore strong{display:block;font:800 34px 'Sora','Outfit',sans-serif}.fsv10-vscore span{font-size:9px;color:#9b91ad}.fsv10-vbody{padding:13px 17px}.fsv10-vsummary{font-size:12px;line-height:1.5;margin-bottom:9px}.fsv10-vreasons{display:grid;gap:6px}.fsv10-vreason{padding:9px 10px;border-radius:11px;background:rgba(255,255,255,.045);font-size:11px;line-height:1.42;color:#d1d5d2}.fsv10-vactions{display:flex;gap:7px;padding:0 17px 16px}.fsv10-vactions button{flex:1;border-radius:11px;padding:10px;border:1px solid rgba(255,255,255,.11);background:rgba(255,255,255,.06);color:#fff;font-weight:900}@media(min-width:700px){#fs-v10-verdict-overlay{align-items:center}}`;document.head.appendChild(st);
    ov=document.createElement('div');ov.id='fs-v10-verdict-overlay';ov.innerHTML=`<div class="fsv10-banner"><div class="fsv10-vhead"><div class="fsv10-vicon"></div><div class="fsv10-vtitle"><small>VERDETTO FANTASCAM V10.0 · ROSTER IMPACT</small><b></b></div><div class="fsv10-vscore"><strong></strong><span>equità contestuale</span></div></div><div class="fsv10-vbody"><div class="fsv10-vsummary"></div><div class="fsv10-vreasons"></div></div><div class="fsv10-vactions"><button data-close>Chiudi</button></div></div>`;document.body.appendChild(ov);ov.querySelector('[data-close]').onclick=()=>ov.classList.remove('show');ov.onclick=e=>{if(e.target===ov)ov.classList.remove('show')};return ov;
  };
  let lastSig='';
  const showV10=(trade,status,title,summary,reasons)=>{
    const ov=ensureV10Banner(),card=ov.querySelector('.fsv10-banner');card.className=`fsv10-banner ${status}`;ov.querySelector('.fsv10-vicon').textContent=status==='good'?'✅':status==='warn'?'🟡':'🚨';ov.querySelector('.fsv10-vtitle b').textContent=title;ov.querySelector('.fsv10-vscore strong').textContent=`${Math.round(trade.fairness)}%`;ov.querySelector('.fsv10-vsummary').textContent=summary;ov.querySelector('.fsv10-vreasons').innerHTML=reasons.slice(0,7).map(x=>`<div class="fsv10-vreason">${x}</div>`).join('');
    const sig=`${trade.A?.map(p=>p.id)}|${trade.B?.map(p=>p.id)}|${trade.creditsA}|${trade.creditsB}|${Math.round(trade.fairness*10)}|${selectedTeam('A')?.id}|${selectedTeam('B')?.id}`;if(sig!==lastSig){lastSig=sig;ov.classList.add('show')}
  };

  window.calculate=()=>{
    baseCalculate?.();
    const t=window.FS_LAST_TRADE;if(!t||!t.A?.length||!t.B?.length){lastSig='';hideOldBanners();document.getElementById('fs-v10-verdict-overlay')?.classList.remove('show');return}
    hideOldBanners();
    const teamA=selectedTeam('A'),teamB=selectedTeam('B');
    const ri=league&&teamA&&teamB&&String(teamA.id)!==String(teamB.id)?rosterTradeImpact(t.A,t.B,teamA,teamB):{active:false,shift:0,notes:league?['Seleziona due fantasquadre diverse per applicare l’impatto rosa.']:['Impatto rosa non attivo: collega la lega per valutare il caso specifico delle due rose.']};
    const baseCenter=n(t.center,50),baseFair=n(t.fairness,100);let center=baseCenter,finalFair=baseFair;
    if(ri.active){center=clamp(baseCenter+ri.shift,0,100);finalFair=clamp(100-Math.abs(center-50)*2,0,100);
      // Il bisogno di rosa NON puo' legalizzare uno scam strutturale serio.
      const hardGuard=(t.reasons||[]).some(x=>/TOP|ELITE|Controllo FVM 1×1|giocatore-ancora/i.test(x));
      if(hardGuard&&baseFair<75)finalFair=Math.min(finalFair,74);
      if(baseFair<65)finalFair=Math.min(finalFair,74);
      // Se il cap modifica l'equità, ricostruiamo center mantenendo il lato avvantaggiato.
      if(finalFair!==100-Math.abs(center-50)*2){const dir=center>=50?1:-1;center=50+dir*(100-finalFair)/2}
    }
    const stronger=center>=50?'A':'B';let status,title,summary;
    if(finalFair<75){status='bad';title='FANTASCAM — SCAMBIO BOCCIATO';summary=`Equità contestuale ${Math.round(finalFair)}%. Il valore di mercato e/o l’impatto sulle rose lascia un vantaggio troppo netto alla Squadra ${stronger}.`}
    else if(finalFair<88){status='warn';title='SCAMBIO ACCETTABILE';summary=`Equità contestuale ${Math.round(finalFair)}%. Lo scambio è possibile, ma considerando le rose resta un vantaggio per la Squadra ${stronger}.`}
    else{status='good';title='SCAMBIO EQUILIBRATO';summary=`Equità contestuale ${Math.round(finalFair)}%. Valore puro e impatto sulle rose sono compatibili con uno scambio equilibrato.`}
    const reasons=[...(t.reasons||[]).slice(0,3),...(ri.notes||[])];
    if(ri.active)reasons.unshift(`🏆 Roster Impact: ${teamA.name} ${ri.impactA.delta>=0?'+':''}${ri.impactA.delta.toFixed(1)} · ${teamB.name} ${ri.impactB.delta>=0?'+':''}${ri.impactB.delta.toFixed(1)} · correzione equità max ±8.`);
    const s=document.getElementById('score'),v=document.getElementById('verdict'),d=document.getElementById('detail');if(s)s.textContent=`${Math.round(finalFair)}%`;if(v){v.className='verdict '+status;v.textContent=status==='good'?'✅ SCAMBIO EQUILIBRATO':status==='warn'?'🟡 SCAMBIO ACCETTABILE':'🚨 FANTASCAM!! 🚨'}if(d)d.textContent=`100% = equilibrio perfetto · base ${Math.round(baseFair)}%${ri.active?` · Roster Impact ${ri.shift>=0?'+':''}${(ri.shift*2).toFixed(1)} pt equità`:''}`;
    window.FS_LAST_TRADE={...t,baseFairness:baseFair,baseCenter,center,fairness:finalFair,stronger,rosterImpact:ri,teamA,teamB,status,reasons};
    showV10(window.FS_LAST_TRADE,status,title,summary,reasons);
    window.dispatchEvent(new CustomEvent('fantascam:trade-v10',{detail:window.FS_LAST_TRADE}));
  };

  const oldSummary=window.getTradeSummary;
  window.getTradeSummary=()=>{const x=window.FS_LAST_TRADE;if(!x)return oldSummary?.()||'Nessuno scambio selezionato';const names=s=>s.map(p=>p.name).join(' + ')||'—';return `Scambio: ${names(x.A)} ⇄ ${names(x.B)} | Equità ${Math.round(x.fairness)}%${x.rosterImpact?.active?` | Roster Impact attivo`:''} | ${document.getElementById('verdict')?.textContent||''}`};

  renderLeaguePanel();
  document.querySelector('.algoBox b')&&(document.querySelector('.algoBox b').textContent='V10.0');
  const brand=document.querySelector('.brandline');if(brand&&!document.getElementById('fs-v10-badge')){const b=document.createElement('div');b.className='badge';b.id='fs-v10-badge';b.textContent='🏆 ROSTER IMPACT V10';brand.appendChild(b)}
  setTimeout(()=>window.calculate?.(),0);
  console.info('FANTASCAM V10.0 Roster Impact active');
})();
