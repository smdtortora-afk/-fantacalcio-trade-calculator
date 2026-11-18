/* Public snapshot produced by GitHub Actions. No API key is sent to browsers.
   Read through GitHub so daily statistics do not depend on a Vercel redeploy. */
const {loadCatalog}=require('../lib/catalog');
const {norm,teamKey}=require('../player-utils');
const bundled=require('../data/stats.json');
const SNAPSHOT_URL='https://raw.githubusercontent.com/smdtortora-afk/-fantacalcio-trade-calculator/main/data/stats.json';
const STAT_FIELDS=['pv','mv','fm','minutes','starts','goals','assists','yellow','red','conceded','rating','penaltySaved','penaltyMissed','api_id','stats_season','stats_source','stats_estimated','stats_updated_at'];
const numeric=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
async function json(url){
  const r=await fetch(url,{headers:{accept:'application/json'},signal:AbortSignal.timeout(10000)});
  if(!r.ok)throw new Error('HTTP '+r.status);
  return r.json();
}
function validSnapshot(s){return s&&s.schemaVersion===1&&Array.isArray(s.players)&&['ok','error','pending'].includes(s.status);}
function buildData(catalog,snapshot,{now=Date.now(),fetchError=null}={}){
  const season=Number(String(catalog.meta.season).split('/')[0]);
  const sameSeason=Number(snapshot.season)===season;
  const timestamp=Date.parse(snapshot.lastSuccessAt),dated=Number.isFinite(timestamp)&&timestamp<=now+300000;
  const rows=new Map();
  if(sameSeason&&dated)for(const s of snapshot.players||[]){
    if(s.id==null||Number(s.stats_season)!==season||!s.name||!s.team)continue;
    rows.set(String(s.id),s);
  }
  let count=0,averages=0;
  const players=catalog.players.map(base=>{
    const p={...base};for(const field of STAT_FIELDS)delete p[field];
    const s=rows.get(String(p.id));
    if(!s||norm(s.name)!==norm(p.name)||teamKey(s.team)!==teamKey(p.team))return p;
    if(numeric(s.pv)===null||s.pv<0)return p;
    for(const field of STAT_FIELDS){
      if(!Object.hasOwn(s,field))continue;
      if(['stats_source','stats_updated_at','stats_estimated'].includes(field))p[field]=s[field];
      else p[field]=numeric(s[field]);
    }
    count++;if(p.fm!==null&&p.fm!==undefined)averages++;
    return p;
  });
  const age=dated?Math.max(0,now-timestamp):null;
  const status=fetchError?'error':!sameSeason&&snapshot.lastSuccessAt?'error':snapshot.status||'pending';
  const usable=count>0;
  return {players,meta:{
    season:catalog.meta.season,matchday:usable?Math.max(0,numeric(snapshot.matchday)||0):0,
    live:usable,statsMode:usable?'api-football-snapshot':'none',statsSource:snapshot.source||'api-football',
    statsStatus:status,statsError:fetchError||(!sameSeason&&snapshot.lastSuccessAt?'Statistiche di una stagione diversa':snapshot.error)||null,
    statsLastAttemptAt:snapshot.lastAttemptAt||null,statsLastSuccessAt:usable?snapshot.lastSuccessAt:null,
    statsStale:usable&&age>48*3600000,statsCount:count,statsAveragesCount:averages,totalPlayers:players.length,
    statsEstimated:snapshot.estimatedAverages!==false,updatedAt:usable?snapshot.lastSuccessAt:null,
    quoteMode:'listone',quoteUpdatedAt:catalog.meta.importedAt||null,quoteSource:catalog.meta.source||'Listone importato',
    checkedAt:new Date(now).toISOString()
  }};
}
async function applyQuoteFeed(result,url){
  try{
    const payload=await json(url),rows=Array.isArray(payload)?payload:payload.players;
    if(!Array.isArray(rows))throw new Error('Formato quotazioni');
    const byId=new Map(rows.filter(r=>r.id!=null).map(r=>[String(r.id),r]));let count=0;
    for(const p of result.players){
      const q=byId.get(String(p.id));if(!q)continue;
      if(q.name&&norm(q.name)!==norm(p.name))continue;
      const fvm=numeric(q.fvm??q.FVM),quote=numeric(q.quote??q.quotazione);
      if(fvm===null||quote===null||fvm<0||quote<0)continue;
      p.fvm=fvm;p.quote=quote;count++;
      for(const key of ['fvmMantra','quoteMantra'])if(numeric(q[key])!==null&&numeric(q[key])>=0)p[key]=Number(q[key]);
    }
    if(!count)throw new Error('Nessuna quotazione riconosciuta');
    Object.assign(result.meta,{quoteMode:'authorized-feed',quoteCount:count,quoteUpdatedAt:payload.updatedAt||null,quoteCheckedAt:new Date().toISOString()});
  }catch{result.meta.quoteError='Feed quotazioni non disponibile: utilizzato il listone importato';}
}
async function handler(req,res){
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'Method not allowed'});}
  try{
    const catalog=loadCatalog();let snapshot=bundled,fetchError=null;
    try{const latest=await json(SNAPSHOT_URL);if(!validSnapshot(latest))throw new Error('Invalid snapshot');snapshot=latest;}
    catch{fetchError='Sincronizzazione non raggiungibile: uso degli ultimi dati disponibili';}
    const result=buildData(catalog,snapshot,{fetchError});
    if(process.env.QUOTES_SOURCE_URL)await applyQuoteFeed(result,process.env.QUOTES_SOURCE_URL);
    res.setHeader('Cache-Control','public, s-maxage=300, stale-while-revalidate=300');
    return res.status(200).json(result);
  }catch{
    res.setHeader('Cache-Control','no-store');
    return res.status(500).json({error:'Impossibile caricare il listone'});
  }
}
module.exports=handler;
module.exports.buildData=buildData;
module.exports.validSnapshot=validSnapshot;
