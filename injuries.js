/* FANTASCAM — injury cache client V2 */
window.FS_INJURIES = window.FS_INJURIES || {};
(() => {
  const normalize=s=>String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"");
  const words=s=>String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9 ]/g," ").trim().split(/\s+/).filter(Boolean);
  const localPlayers=()=>{try{return(typeof PLAYERS!=="undefined"&&Array.isArray(PLAYERS))?PLAYERS:[]}catch(e){return[]}};
  const exactIndex=players=>{const m=new Map();for(const p of players){m.set(normalize(p.name),p);const a=words(p.name);if(a.length>1)m.set(normalize(a.slice().reverse().join(" ")),p)}return m};
  const matchPlayer=(row,players,exact)=>{
    const apiName=String(row.playerName||row.name||"").trim();
    let p=exact.get(normalize(apiName));if(p)return p;
    const a=words(apiName);if(a.length<2)return null;
    const initial=a[0][0],surname=a[a.length-1];
    let candidates=players.filter(x=>{const w=words(x.name);return w.length>1&&w[0][0]===initial&&w[w.length-1]===surname});
    if(row.team){const team=normalize(row.team),sameTeam=candidates.filter(x=>normalize(x.team)===team);if(sameTeam.length)candidates=sameTeam}
    return candidates.length===1?candidates[0]:null;
  };
  const apply=payload=>{
    const players=localPlayers(),exact=exactIndex(players),db={};
    for(const row of(payload?.injuries||[])){
      const apiName=String(row.playerName||row.name||""),p=matchPlayer(row,players,exact);
      const item={injured:true,type:row.type||"Injury",reason:row.reason||row.type||"Injury",returnDate:row.returnDate||null,status:"injured",apiPlayerId:row.playerId||null,team:row.team||null,source:row.source||payload?.source||null,updatedAt:payload.updatedAt||new Date().toISOString()};
      if(p){db[String(p.id)]=item;db[p.name]=item}else if(apiName)db[apiName]=item;
    }
    window.FS_INJURIES=db;
    window.FS_INJURIES_META={updatedAt:payload?.updatedAt||null,league:payload?.league||null,season:payload?.season||null,source:payload?.source||null,count:Object.keys(db).length};
    window.dispatchEvent(new CustomEvent("fantascam:injuries-updated",{detail:window.FS_INJURIES_META}));
    return db;
  };
  window.FS_INJURIES_READY=fetch("/api/injuries",{headers:{accept:"application/json"}})
    .then(r=>{if(!r.ok)throw new Error(`injuries api ${r.status}`);return r.json()})
    .then(apply).catch(err=>{console.warn("FANTASCAM injuries offline:",err?.message||err);return window.FS_INJURIES});
})();