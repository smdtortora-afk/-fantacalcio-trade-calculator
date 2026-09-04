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
