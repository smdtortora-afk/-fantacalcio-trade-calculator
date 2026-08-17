/* FANTASCAM — injury cache client V1
   Nessuna API key nel browser: legge solo /api/injuries.
*/
window.FS_INJURIES = window.FS_INJURIES || {};

(() => {
  const normalize = s => String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"")
    .toLowerCase()
    .replace(/[^a-z0-9]/g,"");

  const indexLocalPlayers = () => {
    const byKey = new Map();
    try{
      if(typeof PLAYERS!=="undefined" && Array.isArray(PLAYERS)){
        for(const p of PLAYERS){
          byKey.set(normalize(p.name),p);
          const parts=String(p.name||"").trim().split(/\s+/);
          if(parts.length>1){
            byKey.set(normalize(parts.reverse().join(" ")),p);
          }
        }
      }
    }catch(e){}
    return byKey;
  };

  const apply = payload => {
    const local=indexLocalPlayers();
    const db={};
    for(const row of (payload?.injuries||[])){
      const apiName=String(row.playerName||row.name||"");
      const p=local.get(normalize(apiName));
      const item={
        injured:true,
        type:row.type||"Injury",
        reason:row.reason||row.type||"Injury",
        returnDate:row.returnDate||null,
        status:"injured",
        apiPlayerId:row.playerId||null,
        team:row.team||null,
        updatedAt:payload.updatedAt||new Date().toISOString()
      };
      if(p){
        db[String(p.id)]=item;
        db[p.name]=item;
      }else if(apiName){
        db[apiName]=item;
      }
    }
    window.FS_INJURIES=db;
    window.FS_INJURIES_META={
      updatedAt:payload?.updatedAt||null,
      league:payload?.league||null,
      season:payload?.season||null,
      count:Object.keys(db).length
    };
    window.dispatchEvent(new CustomEvent("fantascam:injuries-updated",{detail:window.FS_INJURIES_META}));
    return db;
  };

  window.FS_INJURIES_READY = fetch("/api/injuries",{headers:{accept:"application/json"}})
    .then(r=>{
      if(!r.ok)throw new Error(`injuries api ${r.status}`);
      return r.json();
    })
    .then(apply)
    .catch(err=>{
      console.warn("FANTASCAM injuries offline:",err?.message||err);
      return window.FS_INJURIES;
    });
})();
