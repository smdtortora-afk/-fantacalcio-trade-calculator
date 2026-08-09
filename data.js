const fallback = require("../data/fallback.json");

function pickArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.players)) return payload.players;
  if (payload && Array.isArray(payload.data)) return payload.data;
  return [];
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normName(v) {
  return String(v || "").trim().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function normalizeQuote(p) {
  return {
    id: p.id ?? p.playerId ?? p.codice ?? p.code ?? null,
    role: p.role ?? p.ruolo ?? p.r ?? null,
    name: p.name ?? p.nome ?? p.player ?? p.calciatore ?? "",
    team: p.team ?? p.squadra ?? p.club ?? "",
    quote: num(p.quote ?? p.quotazione ?? p.qtA ?? p.currentQuote),
    initial: num(p.initial ?? p.quotazioneIniziale ?? p.qtI ?? p.initialQuote),
    fvm: num(p.fvm ?? p.FVM ?? p.fvmClassic ?? p.auctionValue)
  };
}

function normalizeStats(p) {
  return {
    id: p.id ?? p.playerId ?? p.codice ?? p.code ?? null,
    name: p.name ?? p.nome ?? p.player ?? p.calciatore ?? "",
    team: p.team ?? p.squadra ?? p.club ?? "",
    pv: num(p.pv ?? p.presenze ?? p.appearances ?? p.games),
    mv: num(p.mv ?? p.mediaVoto ?? p.rating),
    fm: num(p.fm ?? p.fantamedia ?? p.mediaFantaVoto ?? p.fantasyAverage)
  };
}

async function getJson(url) {
  const r = await fetch(url, {
    headers: { "accept": "application/json", "user-agent": "fantacalcio-trade-calculator/1.0" }
  });
  if (!r.ok) throw new Error(`HTTP ${r.status} da ${url}`);
  return r.json();
}

module.exports = async function handler(req, res) {
  try {
    let quotePlayers = fallback.players.map(p => ({...p}));
    let quoteMode = "fallback";
    let statsMode = "none";

    if (process.env.QUOTES_SOURCE_URL) {
      const qPayload = await getJson(process.env.QUOTES_SOURCE_URL);
      const normalized = pickArray(qPayload).map(normalizeQuote)
        .filter(p => p.name && p.role && p.fvm !== null);
      if (normalized.length) {
        quotePlayers = normalized;
        quoteMode = "authorized-feed";
      }
    }

    let stats = [];
    if (process.env.STATS_SOURCE_URL) {
      const sPayload = await getJson(process.env.STATS_SOURCE_URL);
      stats = pickArray(sPayload).map(normalizeStats).filter(p => p.name);
      if (stats.length) statsMode = "authorized-feed";
    }

    const byId = new Map();
    const byNameTeam = new Map();
    for (const s of stats) {
      if (s.id !== null && s.id !== undefined) byId.set(String(s.id), s);
      byNameTeam.set(`${normName(s.name)}|${normName(s.team)}`, s);
      if (!s.team) byNameTeam.set(`${normName(s.name)}|`, s);
    }

    const merged = quotePlayers.map(p => {
      const s = (p.id !== null && p.id !== undefined ? byId.get(String(p.id)) : null)
        || byNameTeam.get(`${normName(p.name)}|${normName(p.team)}`)
        || byNameTeam.get(`${normName(p.name)}|`);
      return {
        ...p,
        pv: s?.pv ?? null,
        mv: s?.mv ?? null,
        fm: s?.fm ?? null
      };
    });

    const maxPv = merged.reduce((m, p) => Math.max(m, Number(p.pv) || 0), 0);
    const matchday = Number(process.env.SEASON_MATCHDAY || 0) || maxPv || 0;

    const meta = {
      updatedAt: new Date().toISOString(),
      fallbackUpdatedAt: fallback.updatedAt,
      quoteMode,
      statsMode,
      matchday,
      live: quoteMode === "authorized-feed" || statsMode === "authorized-feed"
    };

    // A daily date query (?day=YYYY-MM-DD) creates one CDN cache entry per day.
    res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=3600");
    res.status(200).json({players: merged, meta});
  } catch (err) {
    res.setHeader("Cache-Control", "no-store");
    res.status(500).json({error: "Aggiornamento dati non riuscito", detail: String(err.message || err)});
  }
};
