/* Shared matching: require the same club and a unique name. No broad fuzzy matches. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.FS_DATA_UTILS=factory();})(typeof window!=='undefined'?window:globalThis,function(){
  const norm=s=>String(s??'').replace(/ı/g,'i').replace(/ø/g,'o').replace(/ß/g,'ss').replace(/ð/g,'d').replace(/þ/g,'th').replace(/ł/g,'l').replace(/æ/g,'ae').replace(/œ/g,'oe').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9 ]/g,' ').trim().replace(/\s+/g,' ');
  const aliases={'internazionale':'inter','inter milan':'inter','ac milan':'milan','as roma':'roma','hellas verona':'verona','ssc napoli':'napoli'};
  const teamKey=s=>aliases[norm(s)]||norm(s);
  function nameScore(a,b){
    const x=norm(a).split(' ').filter(Boolean),y=norm(b).split(' ').filter(Boolean);
    if(!x.length||!y.length)return 0;
    if([...x].sort().join(' ')===[...y].sort().join(' '))return 100;
    if(x.length===1&&x[0].length>2&&y.includes(x[0]))return 80;
    if(y.length===1&&y[0].length>2&&x.includes(y[0]))return 80;
    const match=(a,b)=>{const full=a.filter(t=>t.length>1),short=a.filter(t=>t.length===1);if(!full.length||!short.length)return false;const remaining=[...b];for(const w of full){const at=remaining.indexOf(w);if(at<0)return false;remaining.splice(at,1);}return short.every(i=>remaining.some(w=>w.startsWith(i)));};
    return match(x,y)||match(y,x)?95:0;
  }
  function matchPlayer(row,players){
    const name=row.playerName||row.name,team=teamKey(row.team);
    if(!name||!team)return null;
    const matches=players.filter(p=>teamKey(p.team)===team).map(p=>({p,score:nameScore(name,p.name)})).filter(x=>x.score>=80).sort((a,b)=>b.score-a.score);
    return matches.length&&(!matches[1]||matches[0].score>matches[1].score)?matches[0].p:null;
  }
  return {norm,teamKey,nameScore,matchPlayer};
});
