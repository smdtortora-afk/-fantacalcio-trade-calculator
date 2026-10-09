const fs=require('node:fs');
const path=require('node:path');

function declaration(text,name){
  const match=new RegExp('\\bconst\\s+'+name+'\\s*=\\s*').exec(text);
  if(!match)throw new Error('Missing '+name);
  const start=match.index+match[0].length;
  let depth=0,quoted=false,escape=false;
  for(let i=start;i<text.length;i++){
    const ch=text[i];
    if(quoted){
      if(escape)escape=false;
      else if(ch==='\\')escape=true;
      else if(ch==='"')quoted=false;
      continue;
    }
    if(ch==='"'){quoted=true;continue;}
    if(ch==='['||ch==='{')depth++;
    if(ch===']'||ch==='}')
      if(--depth===0)return JSON.parse(text.slice(start,i+1));
  }
  throw new Error('Invalid '+name);
}

function loadCatalog(){
  const text=fs.readFileSync(path.join(__dirname,'../players.js'),'utf8');
  const players=declaration(text,'PLAYERS');
  const meta=declaration(text,'PLAYERS_META');
  if(!Array.isArray(players)||!players.length)
    throw new Error('Empty catalog');
  return {players,meta};
}

module.exports={declaration,loadCatalog};
