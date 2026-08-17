/* Vercel Serverless Function — FANTASCAM injuries
   Required env: API_FOOTBALL_KEY (or APISPORTS_KEY)
   Optional env: SERIE_A_LEAGUE_ID, FOOTBALL_SEASON
*/
const API_BASE="https://v3.football.api-sports.io";

async function apiFetch(path,key){
  const r=await fetch(API_BASE+path,{
    headers:{
      "x-apisports-key":key,
      "accept":"application/json"
    }
  });
  const text=await r.text();
  let data;
  try{data=JSON.parse(text)}catch{data={message:text}}
  if(!r.ok)throw new Error(`API-Football ${r.status}: ${text.slice(0,300)}`);
  if(data?.errors && Object.keys(data.errors).length){
    throw new Error(`API-Football error: ${JSON.stringify(data.errors)}`);
  }
  return data;
}

async function resolveSerieA(key,season){
  const forced=Number(process.env.SERIE_A_LEAGUE_ID);
  if(Number.isFinite(forced)&&forced>0)return forced;

  const data=await apiFetch(`/leagues?country=Italy&season=${encodeURIComponent(season)}&type=League`,key);
  const hit=(data.response||[]).find(x=>String(x?.league?.name||"").toLowerCase()==="serie a");
  if(!hit?.league?.id)throw new Error("Serie A non trovata in API-Football");
  return hit.league.id;
}

module.exports=async function handler(req,res){
  if(req.method!=="GET"){
    res.setHeader("Allow","GET");
    return res.status(405).json({error:"Method not allowed"});
  }

  const key=process.env.API_FOOTBALL_KEY||process.env.APIFOOTBALL_KEY||process.env.API_SPORTS_KEY||process.env.APISPORTS_KEY||process.env.RAPIDAPI_KEY;
  if(!key){
    return res.status(503).json({
      error:"API_FOOTBALL_KEY non configurata",
      injuries:[],
      updatedAt:new Date().toISOString()
    });
  }

  // API-Football seasons use the starting year (2026 for 2026/27).
  const now=new Date();
  const defaultSeason=now.getUTCMonth()>=6?now.getUTCFullYear():now.getUTCFullYear()-1;
  const season=Number(process.env.FOOTBALL_SEASON||req.query?.season||defaultSeason);

  try{
    const league=await resolveSerieA(key,season);

    // Current broad competition injury/suspension overview.
    const data=await apiFetch(`/injuries?league=${league}&season=${season}`,key);
    const rows=(data.response||[])
      .filter(x=>String(x?.player?.name||"").trim())
      .map(x=>({
        playerId:x.player?.id||null,
        playerName:x.player?.name||"",
        teamId:x.team?.id||null,
        team:x.team?.name||"",
        type:x.player?.type||x.type||"Injury",
        reason:x.player?.reason||x.reason||x.player?.type||x.type||"Injury",
        fixtureId:x.fixture?.id||null,
        fixtureDate:x.fixture?.date||null,
        returnDate:null
      }));

    // Deduplicate player entries; keep the most specific reason.
    const byPlayer=new Map();
    for(const row of rows){
      const keyId=String(row.playerId||row.playerName);
      const old=byPlayer.get(keyId);
      if(!old || String(row.reason||"").length>String(old.reason||"").length){
        byPlayer.set(keyId,row);
      }
    }

    res.setHeader("Cache-Control","s-maxage=14400, stale-while-revalidate=3600");
    return res.status(200).json({
      league,
      season,
      updatedAt:new Date().toISOString(),
      source:"api-football",
      injuries:[...byPlayer.values()]
    });
  }catch(err){
    console.error("FANTASCAM injuries:",err);
    return res.status(502).json({
      error:err?.message||"Errore injuries",
      injuries:[],
      updatedAt:new Date().toISOString()
    });
  }
};
