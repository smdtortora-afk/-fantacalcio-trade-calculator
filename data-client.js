/* Client freshness checks are separate from the last successful data retrieval. */
(() => {
  let busy=false,lastCheck=0;
  const byId=id=>document.getElementById(id);
  const date=value=>{const d=new Date(value);return value&&!Number.isNaN(d.getTime())?d.toLocaleString('it-IT',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}):'mai';};
  function renderStatus(){
    const m=META,ds=byId('dataStatus'),ms=byId('matchdayStatus'),q=byId('quoteStatus'),inj=byId('injuryStatus');
    if(m.statsCount){
      ds.textContent=`Statistiche ${m.statsStale?'da aggiornare':'disponibili'} · ${m.statsCount}/${m.totalPlayers} calciatori · ${date(m.statsLastSuccessAt)}`;
    }else ds.textContent=m.statsStatus==='error'?'Statistiche non disponibili · valutazione basata sul listone':'Statistiche in attesa della prima sincronizzazione';
    ds.dataset.state=m.statsStatus==='error'?'error':m.statsStale?'stale':'ok';
    ms.textContent=m.matchday?`Turni disputati: ${m.matchday} · ${m.matchday>=6?'rendimento attivo sui dati disponibili':'forma progressiva dalla 6ª giornata'}`:'Rendimento non attivo';
    q.textContent=m.quoteMode==='authorized-feed'?`Quotazioni da feed · ${m.quoteCount} calciatori`:`Listone importato · ${date(m.quoteUpdatedAt||PLAYERS_META.importedAt).split(',')[0]}`;
    const i=window.FS_INJURIES_META;
    if(i){
      inj.textContent=i.status==='ok'?`Infortuni verificati · ${i.count} calciatori riconosciuti${i.partial?' · fonte parziale':''}`:i.updatedAt?`Infortuni: ultimi dati del ${date(i.updatedAt)}`:'Infortuni non disponibili · copertura non verificata';
      inj.dataset.state=i.status==='ok'&&!i.partial?'ok':'error';
    }
    byId('syncDetail').textContent=`Statistiche: ultimo successo ${date(m.statsLastSuccessAt)}. Ultimo tentativo ${date(m.statsLastAttemptAt)}. Infortuni: ultima verifica ${date(i?.updatedAt)}. Aggiornamento statistiche previsto ogni giorno; la pagina ricontrolla ogni 15 minuti.`;
    const problems=[m.statsError,m.statsStale?'Le statistiche hanno più di 48 ore: i valori possono essere superati.':null,m.quoteError,i?.status==='error'?'Aggiornamento infortuni non riuscito. L’assenza di una segnalazione non conferma che il giocatore sia disponibile.':null].filter(Boolean);
    byId('syncError').textContent=problems.join(' ');byId('syncError').hidden=!problems.length;
  }
  async function refreshData(){
    if(busy)return;busy=true;lastCheck=Date.now();byId('refreshDataButton').disabled=true;
    try{
      const r=await fetch('/api/data',{headers:{accept:'application/json'},signal:AbortSignal.timeout(20000)});
      if(!r.ok)throw new Error('Dati non disponibili');
      const j=await r.json();
      if(!Array.isArray(j.players)||!j.players.length||!j.meta||j.meta.season!==PLAYERS_META.season)throw new Error('Dati non validi');
      ACTIVE_PLAYERS=j.players;META={...j.meta};rebuildIndexes();
      document.querySelectorAll('.player').forEach(row=>fillPlayers(row,row.querySelector('.footballer').value));
      window.dispatchEvent(new CustomEvent('fantascam:data-updated'));
      calculate();
    }catch{
      META={...META,statsStatus:'error',statsError:'Dati aggiornati non raggiungibili. Restano disponibili il listone e gli eventuali dati già caricati.'};
    }finally{busy=false;byId('refreshDataButton').disabled=false;renderStatus();}
  }
  window.updateStatus=renderStatus;window.refreshData=refreshData;
  byId('refreshDataButton').addEventListener('click',()=>{refreshData();window.fsRefreshInjuries?.();});
  window.addEventListener('fantascam:injuries-updated',renderStatus);
  const refresh=()=>{if(document.visibilityState!=='hidden'&&Date.now()-lastCheck>5*60000){refreshData();window.fsRefreshInjuries?.();}};
  document.addEventListener('visibilitychange',refresh);window.addEventListener('focus',refresh);
  setInterval(refresh,15*60000);
  renderStatus();refreshData();
})();
