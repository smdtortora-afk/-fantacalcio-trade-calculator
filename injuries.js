/* FANTASCAM — injury cache client V3
   Matching robusto tra fonti esterne e nomi del listone Fantacalcio.
*/
window.FS_INJURIES = window.FS_INJURIES || {};

(() => {
  const norm = s => String(s || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toLowerCase()
    .replace(/['’`]/g," ")
    .replace(/[^a-z0-9 ]/g," ")
    .replace(/\s+/g," ")
    .trim();

  const tokens = s => norm(s).split(" ").filter(Boolean);
  const localPlayers = () => {
    try { return (typeof PLAYERS !== "undefined" && Array.isArray(PLAYERS)) ? PLAYERS : []; }
    catch(e) { return []; }
  };

  const sameTeam = (a,b) => !a || !b || norm(a) === norm(b);

  const scoreCandidate = (apiName, rowTeam, p) => {
    if (!sameTeam(rowTeam,p.team)) return -999;

    const a=tokens(apiName), b=tokens(p.name);
    if(!a.length || !b.length) return -999;

    const an=norm(apiName), bn=norm(p.name);
    if(an===bn) return 100;

    // Le fonti usano spesso "N. Casale", il listone semplicemente "Casale"
    // oppure "Valle A.". Nel listone Fantacalcio il cognome è quasi sempre il primo token.
    const apiSurname=a[a.length-1];
    const localSurname=b[0];

    let score=0;
    if(apiSurname===localSurname) score+=55;

    const longA=a.filter(x=>x.length>2);
    const longB=b.filter(x=>x.length>2);
    const overlap=longA.filter(x=>longB.includes(x)).length;
    score+=overlap*18;

    // Compatibilità iniziale nome: "J. Martinez" <-> "Martinez Jo."
    const apiInitial=a[0]?.[0] || "";
    const localExtra=b.slice(1).find(x=>x.length) || "";
    if(apiSurname===localSurname && localExtra && apiInitial && localExtra[0]===apiInitial) score+=8;

    // Se il cognome coincide ed è l'unico token del listone, è un match forte.
    if(apiSurname===localSurname && b.length===1) score+=12;

    return score;
  };

  const matchPlayer = (row, players) => {
    const apiName=String(row.playerName || row.name || "").trim();
    if(!apiName) return null;

    const candidates=players
      .map(p=>({p,score:scoreCandidate(apiName,row.team,p)}))
      .filter(x=>x.score>=55)
      .sort((x,y)=>y.score-x.score);

    if(!candidates.length) return null;
    if(candidates.length===1) return candidates[0].p;

    // Non forziamo un'associazione ambigua.
    if(candidates[0].score===candidates[1].score) return null;
    return candidates[0].p;
  };

  const apply = payload => {
    const players=localPlayers(), db={};
    const unmatched=[], matched=[];

    for(const row of (payload?.injuries || [])){
      const apiName=String(row.playerName || row.name || "");
      const p=matchPlayer(row,players);

      const item={
        injured:true,
        type:row.type || "Injury",
        reason:row.reason || row.type || "Injury",
        returnDate:row.returnDate || null,
        status:"injured",
        apiPlayerId:row.playerId || null,
        team:row.team || null,
        source:row.source || payload?.source || null,
        sources:row.sources || null,
        updatedAt:payload?.updatedAt || new Date().toISOString()
      };

      if(p){
        db[String(p.id)]=item;
        db[p.name]=item;
        matched.push({sourceName:apiName,listName:p.name,team:p.team});
      } else if(apiName){
        // Conserviamo comunque il nome sorgente, utile per diagnostica.
        db[apiName]=item;
        unmatched.push({name:apiName,team:row.team || null});
      }
    }

    window.FS_INJURIES=db;
    window.FS_INJURIES_META={
      updatedAt:payload?.updatedAt || null,
      source:payload?.source || null,
      sourceCount:Number(payload?.count || 0),
      matchedCount:matched.length,
      unmatchedCount:unmatched.length,
      matched,
      unmatched,
      diagnostics:payload?.diagnostics || null
    };

    console.info("FANTASCAM injuries:",window.FS_INJURIES_META);

    // Diagnostica visibile: tocca la barra per vedere i nomi non riconosciuti.
    let bar=document.getElementById("fs-injury-diagnostic");
    if(!bar){
      bar=document.createElement("button");
      bar.id="fs-injury-diagnostic";
      bar.type="button";
      bar.style.cssText="position:fixed;left:8px;right:8px;bottom:8px;z-index:30000;border:1px solid rgba(77,255,60,.45);border-radius:12px;background:rgba(2,10,5,.96);color:#fff;padding:9px 10px;font:800 12px Outfit,-apple-system,sans-serif;box-shadow:0 8px 28px rgba(0,0,0,.45);white-space:nowrap;overflow:hidden;text-overflow:ellipsis";
      document.body.appendChild(bar);
    }
    const total=window.FS_INJURIES_META.sourceCount || (payload?.injuries||[]).length;
    const ok=window.FS_INJURIES_META.matchedCount;
    const ko=window.FS_INJURIES_META.unmatchedCount;
    bar.textContent=`🚑 ${total} trovati · ✅ ${ok} abbinati · ⚠️ ${ko} non riconosciuti`;
    bar.onclick=()=>{
      const list=window.FS_INJURIES_META.unmatched||[];
      alert(list.length ? "NON RICONOSCIUTI:\n\n"+list.map(x=>`• ${x.name}${x.team?` (${x.team})`:""}`).join("\n") : "Tutti gli infortunati sono stati abbinati al listone.");
    };

    window.dispatchEvent(new CustomEvent("fantascam:injuries-updated",{detail:window.FS_INJURIES_META}));
    return db;
  };

  window.FS_INJURIES_READY=fetch("/api/injuries",{headers:{accept:"application/json"},cache:"no-store"})
    .then(r=>{if(!r.ok)throw new Error(`injuries api ${r.status}`);return r.json();})
    .then(apply)
    .catch(err=>{
      console.warn("FANTASCAM injuries offline:",err?.message || err);
      return window.FS_INJURIES;
    });
})();
