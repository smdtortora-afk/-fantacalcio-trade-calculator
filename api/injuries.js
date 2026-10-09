const SOURCES={virgilio:"https://sport.virgilio.it/calcio/serie-a/tabella-infortunati-squalificati-e-diffidati/",goal:"https://www.goal.com/it/notizie/tabella-infortunati-squalificati-e-diffidati-in-serie-a/1kw0ilrv37v1c10fvugourrggg"};
const TEAMS=["Atalanta","Bologna","Cagliari","Como","Cremonese","Fiorentina","Frosinone","Genoa","Inter","Juventus","Lazio","Lecce","Milan","Monza","Napoli","Parma","Pisa","Roma","Sassuolo","Torino","Udinese","Venezia","Verona"];
function decode(s){return String(s||"").replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&").replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/&agrave;/gi,"à").replace(/&egrave;/gi,"è").replace(/&igrave;/gi,"ì").replace(/&ograve;/gi,"ò").replace(/&ugrave;/gi,"ù").replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCharCode(parseInt(n,16))).replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n)));}
function toText(h){return decode(String(h||"").replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<br\s*\/?>/gi,"\n").replace(/<\/(?:p|li|h1|h2|h3|h4|div|section|article|tr)>/gi,"\n").replace(/<[^>]+>/g," ")).replace(/\r/g,"").replace(/[ \t]+/g," ").replace(/\n[ \t]+/g,"\n").replace(/\n{2,}/g,"\n").trim();}
function norm(s){return String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9 ]/g," ").replace(/\s+/g," ").trim();}
function teamOf(l){const n=norm(l);return TEAMS.find(t=>norm(t)===n)||null;}
function dateOf(l){const m=String(l).match(/(?:Rientra\s+il|Rientro\s+il)\s+(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})/i);return m?`${m[3]}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}`:null;}
function entry(l){
  const p=String(l).replace(/^[•*\-–—]\s*/,"").split(/\s+-\s+/).map(x=>x.trim()).filter(Boolean);
  if(p.length<2)return null;
  const reason=p.slice(1).filter(x=>!/^rientr(?:a|o)\b/i.test(x)).join(" - ").trim();
  return {name:p[0],reason:reason||p[1]};
}
function parse(html,source){const lines=toText(html).split("\n").map(x=>x.trim()).filter(Boolean),out=[];let team=null,sec=null;for(const raw of lines){const line=raw.replace(/^[•*\-–—]\s*/,"").trim(),hit=teamOf(line.replace(/^#+\s*/,""));if(hit){team=hit;sec=null;continue}if(/^infortunati\b\s*:?\s*$/i.test(line)){sec="inj";continue}if(/^squalificati\b/i.test(line)){sec="sq";continue}if(/^diffidati\b/i.test(line)){sec="df";continue}if(sec!=="inj"||!team||/^(nessuno|nessun infortunato|[-–])$/i.test(line))continue;const e=entry(line);if(!e)continue;out.push({playerName:e.name,name:e.name,team,injured:true,status:"injured",type:"Injury",reason:e.reason,returnDate:dateOf(line),source})}return out}
function surname(n){const w=norm(n).split(" ").filter(Boolean);return w[w.length-1]||norm(n)}
function dedupe(rows){const m=new Map();for(const r of rows){const k=`${norm(r.team)}|${surname(r.name)}`,o=m.get(k);if(!o){m.set(k,{...r,sources:[r.source]});continue}const sources=[...new Set([...(o.sources||[o.source]),r.source])],goal=r.source==="Goal.com"?r:(o.source==="Goal.com"?o:null),c=goal||r;m.set(k,{...o,...c,returnDate:c.returnDate||o.returnDate||r.returnDate||null,sources,source:sources.join(" + ")})}return [...m.values()]}
async function get(url){const r=await fetch(url,{signal:AbortSignal.timeout(10000),headers:{"User-Agent":"Mozilla/5.0 (compatible; Fantascam/1.0)",Accept:"text/html,application/xhtml+xml"}});if(!r.ok)throw new Error(`HTTP ${r.status}`);return r.text()}

const {loadCatalog}=require('../lib/catalog');
const {matchPlayer}=require('../player-utils');
function loadPlayers(){return loadCatalog().players;}
function listDiagnostics(injuries){
  const players=loadPlayers(),matched=[],unmatched=[];
  for(const r of injuries){
    const p=matchPlayer(r,players);
    if(p)matched.push({sourceName:r.name||r.playerName,listName:p.name,team:p.team,id:p.id});
    else unmatched.push({name:r.name||r.playerName,team:r.team||null});
  }
  return {playersLoaded:players.length,matchedCount:matched.length,unmatchedCount:unmatched.length,matched,unmatched};
}
module.exports=async function handler(req,res){
  if(req.method!=="GET"){res.setHeader("Allow","GET");return res.status(405).json({error:"Method not allowed"});}
  const checkedAt=new Date().toISOString();
  const results=await Promise.allSettled([get(SOURCES.virgilio),get(SOURCES.goal)]);
  const diagnostics={},rows=[];
  for(let i=0;i<results.length;i++){
    const source=i===0?'Virgilio Sport':'Goal.com',r=results[i];
    if(r.status==='fulfilled'){
      const parsed=parse(r.value,source);diagnostics[source]={ok:parsed.length>0,count:parsed.length};rows.push(...parsed);
    }else diagnostics[source]={ok:false,count:0,error:'Fonte non raggiungibile'};
  }
  const injuries=dedupe(rows);
  if(!injuries.length){res.setHeader('Cache-Control','no-store');return res.status(502).json({ok:false,error:'Nessuna fonte ha prodotto risultati',diagnostics,injuries:[],checkedAt});}
  try{
    const matching=listDiagnostics(injuries);
    res.setHeader('Cache-Control','public, s-maxage=3600, stale-while-revalidate=3600');
    return res.status(200).json({ok:true,source:'Virgilio Sport + Goal.com',count:injuries.length,diagnostics,matching,injuries,checkedAt,updatedAt:checkedAt});
  }catch{
    res.setHeader('Cache-Control','no-store');
    return res.status(500).json({ok:false,error:'Listone non disponibile per gli infortuni',checkedAt});
  }
};
module.exports.parse=parse;
module.exports.listDiagnostics=listDiagnostics;
