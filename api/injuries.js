const SOURCE = "https://sport.virgilio.it/calcio/serie-a/tabella-infortunati-squalificati-e-diffidati/";

const TEAMS = [
  "Atalanta","Bologna","Cagliari","Como","Cremonese","Fiorentina","Genoa",
  "Inter","Juventus","Lazio","Lecce","Milan","Napoli","Parma","Pisa","Roma",
  "Sassuolo","Torino","Udinese","Verona","Venezia","Monza","Frosinone"
];

function decode(s) {
  return String(s || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&agrave;/gi, "à")
    .replace(/&egrave;/gi, "è")
    .replace(/&igrave;/gi, "ì")
    .replace(/&ograve;/gi, "ò")
    .replace(/&ugrave;/gi, "ù")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function toText(html) {
  return decode(
    String(html || "")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(?:p|li|h1|h2|h3|h4|div|section|article|tr)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function parseReturnDate(line) {
  const m = String(line).match(/Rientra\s+il\s+(\d{1,2})-(\d{1,2})-(\d{4})/i);
  return m ? `${m[3]}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}` : null;
}

function parseInjuries(html) {
  const lines = toText(html).split("\n").map(x => x.trim()).filter(Boolean);
  const injuries = [];
  let team = null;
  let section = null;

  for (const raw of lines) {
    const line = raw.replace(/^[•*\-–—]\s*/, "").trim();
    const teamHit = TEAMS.find(t => line.toLowerCase() === t.toLowerCase());

    if (teamHit) {
      team = teamHit;
      section = null;
      continue;
    }
    if (/^infortunati\b/i.test(line)) { section = "injuries"; continue; }
    if (/^squalificati\b/i.test(line)) { section = "suspended"; continue; }
    if (/^diffidati\b/i.test(line)) { section = "warned"; continue; }

    if (section !== "injuries" || !team) continue;
    if (/^(nessuno|–|-|nessun infortunato)$/i.test(line)) continue;

    const parts = line.split(/\s+-\s+/).map(x => x.trim()).filter(Boolean);
    if (parts.length < 2) continue;

    const name = parts[0];
    const reason = parts.slice(1).filter(x => !/^rientra\s+il/i.test(x)).join(" - ");
    if (!reason) continue;

    injuries.push({
      playerName: name, name, team,
      injured: true, status: "injured", type: "Injury",
      reason, returnDate: parseReturnDate(line), source: "Virgilio Sport"
    });
  }
  return injuries;
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "s-maxage=14400, stale-while-revalidate=86400");

  try {
    const response = await fetch(SOURCE, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Fantascam/1.0)",
        "Accept": "text/html,application/xhtml+xml"
      }
    });

    if (!response.ok) throw new Error(`Virgilio HTTP ${response.status}`);

    const injuries = parseInjuries(await response.text());

    if (!injuries.length) {
      return res.status(502).json({
        ok: false,
        error: "Fonte raggiunta ma parser senza risultati",
        source: "Virgilio Sport",
        injuries: [],
        updatedAt: new Date().toISOString()
      });
    }

    return res.status(200).json({
      ok: true,
      source: "Virgilio Sport",
      count: injuries.length,
      injuries,
      updatedAt: new Date().toISOString()
    });
  } catch (err) {
    console.error("FANTASCAM injuries:", err);
    return res.status(502).json({
      ok: false,
      error: err && err.message ? err.message : String(err),
      source: "Virgilio Sport",
      injuries: [],
      updatedAt: new Date().toISOString()
    });
  }
};
