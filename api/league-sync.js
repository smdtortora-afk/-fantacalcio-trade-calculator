/* FANTASCAM V10 — public Leghe Fantacalcio league sync
   Read-only. No username/password, no cookie storage.
   Tries public HTML/embedded JSON only; private/invisible rosters return a clear error.
*/

const ALLOWED_HOST='leghe.fantacalcio.it';

const text=x=>String(x??'').trim();
const norm=s=>text(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const decodeHtml=s=>text(s).replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>');

function baseFromUrl(raw){
  let u;
  try{u=new URL(raw)}catch{throw new Error('Link lega non valido')}
  if(u.hostname!==ALLOWED_HOST)throw new Error('Sono accettati solo link leghe.fantacalcio.it');
  const slug=u.pathname.split('/').filter(Boolean)[0];
  if(!slug)throw new Error('Non trovo il nome della lega nel link');
  return {slug,base:`https://${ALLOWED_HOST}/${slug}`};
}

async function get(url){
  const ctl=new AbortController();const timer=setTimeout(()=>ctl.abort(),8000);
  try{
    const r=await fetch(url,{signal:ctl.signal,redirect:'follow',headers:{'user-agent':'Mozilla/5.0 (compatible; FANTASCAM/10.0; +read-only league sync)','accept':'text/html,application/xhtml+xml,application/json'}});
    if(!r.ok)throw new Error(`Fantacalcio ha risposto ${r.status}`);
    return await r.text();
  } finally{clearTimeout(timer)}
}

function jsonBlobs(html){
  const out=[];
  const pats=[
    /<script[^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi,
    /<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/gi
  ];
  for(const re of pats){let m;while((m=re.exec(html))){try{out.push(JSON.parse(decodeHtml(m[1])))}catch{}}}
  return out;
}

function playerCandidate(o){
  if(!o||typeof o!=='object'||Array.isArray(o))return null;
  const id=o.id??o.playerId??o.idPlayer??o.calciatoreId??o.idCalciatore;
  const name=o.name??o.nome??o.playerName??o.calciatore??o.nomeCalciatore;
  if((id===undefined||id===null)&&!name)return null;
  const role=o.role??o.ruolo??o.r;
  const team=o.team??o.squadraReale??o.club??o.teamName;
  return {id:id??undefined,name:text(name)||undefined,role:text(role)||undefined,team:text(team)||undefined};
}

function arrayOfPlayers(a){
  if(!Array.isArray(a)||!a.length)return [];
  const p=a.map(playerCandidate).filter(Boolean);
  return p.length>=Math.max(2,Math.floor(a.length*.35))?p:[];
}

function walkForTeams(root){
  const teams=[];const seen=new Set();
  const visit=(x,depth=0)=>{
    if(depth>12||x==null)return;
    if(Array.isArray(x)){x.forEach(v=>visit(v,depth+1));return}
    if(typeof x!=='object')return;
    const teamName=text(x.teamName??x.nomeSquadra??x.squadra??x.name??x.nome);
    const teamId=x.teamId??x.idSquadra??x.id;
    const arrays=[x.players,x.roster,x.rosa,x.calciatori,x.footballers].filter(Array.isArray);
    for(const arr of arrays){
      const players=arrayOfPlayers(arr);
      if(teamName&&players.length>=2){
        const key=`${teamId??''}:${norm(teamName)}`;
        if(!seen.has(key)){seen.add(key);teams.push({id:String(teamId??teams.length+1),name:teamName,credits:Number(x.credits??x.crediti??0)||0,players})}
      }
    }
    Object.values(x).forEach(v=>visit(v,depth+1));
  };
  visit(root);return teams;
}

function extractTeamLinks(html,base){
  const map=new Map();
  const re=/<a[^>]+href=["']([^"']*info-squadra\?t=([^"'&]+)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;while((m=re.exec(html))){
    const id=decodeURIComponent(m[2]);
    const label=decodeHtml(m[3].replace(/<[^>]+>/g,' ').replace(/\s+/g,' ')).trim();
    if(id&&!map.has(id))map.set(id,{id,name:label||`Squadra ${id}`,url:new URL(m[1],base).toString()});
  }
  return [...map.values()];
}

function extractLeagueName(html,slug){
  const h=html.match(/<h[1-4][^>]*>([^<]{2,80})<\/h[1-4]>/i);return decodeHtml(h?.[1]||slug.replace(/-/g,' '));
}

async function parseTeamPage(item){
  try{
    const html=await get(item.url);
    for(const blob of jsonBlobs(html)){
      const candidates=walkForTeams(blob);
      const exact=candidates.find(t=>String(t.id)===String(item.id))||candidates[0];
      if(exact?.players?.length)return {...exact,id:String(item.id),name:exact.name||item.name};
    }
    // Last-resort semantic HTML extraction. Only accepts rows carrying recognizable player ids/names.
    const players=[];const re=/data-(?:player|calciatore)-id=["'](\d+)["'][^>]*>[\s\S]{0,500}?class=["'][^"']*(?:name|nome)[^"']*["'][^>]*>([^<]{2,60})</gi;let m;
    while((m=re.exec(html)))players.push({id:m[1],name:decodeHtml(m[2]).trim()});
    return players.length?{...item,players}:null;
  }catch{return null}
}

module.exports=async function handler(req,res){
  if(req.method!=='GET')return res.status(405).json({error:'Metodo non consentito'});
  try{
    const {slug,base}=baseFromUrl(req.query.url||'');
    const html=await get(`${base}/squadre`);
    const name=extractLeagueName(html,slug);

    for(const blob of jsonBlobs(html)){
      const teams=walkForTeams(blob).filter(t=>t.players.length>=2);
      if(teams.length>=2)return res.status(200).json({name,source:'fantacalcio-public',sourceUrl:base,updatedAt:new Date().toISOString(),teams});
    }

    const links=extractTeamLinks(html,base);
    if(links.length>=2){
      const teams=[];
      for(let i=0;i<links.length;i+=4){
        const batch=await Promise.all(links.slice(i,i+4).map(parseTeamPage));
        teams.push(...batch.filter(Boolean));
      }
      const complete=teams.filter(t=>t.players?.length>=2);
      if(complete.length>=2)return res.status(200).json({name,source:'fantacalcio-public',sourceUrl:base,updatedAt:new Date().toISOString(),teams:complete});
    }

    return res.status(422).json({error:'Le rose non risultano leggibili dalla pagina pubblica. Se sono private/invisibili serve un collegamento autenticato ufficiale oppure un export della lega.',league:name,sourceUrl:base});
  }catch(e){return res.status(400).json({error:e?.message||'Impossibile sincronizzare la lega'})}
};
