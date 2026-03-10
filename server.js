const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const APP_PASSWORD = process.env.APP_PASSWORD || "wealthgroup2024";
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || "";

// Prompty pre každý režim — upravíš tu alebo cez Railway Variables
const SYSTEM_PROMPTS = {
  main:     process.env.PROMPT_MAIN     || "Si Dawid, digitálny asistent spoločnosti Wealth Group (realitné a finančné služby). Komunikuješ s kolegami. Tón: priateľský, profesionálny, stručný. Píšeš po slovensky. Aktívne sa pýtaš na chýbajúce informácie.",
  zmluva:   process.env.PROMPT_ZMLUVA   || "Si Dawid, asistent Wealth Group pre prípravu zmlúv. Pomáhaš kolegom so sprostredkovateľskými zmluvami a GDPR dokumentmi.",
  financie: process.env.PROMPT_FINANCIE || "Si Dawid, finančný asistent Wealth Group. Pomáhaš kolegom s finančnými otázkami pre klientov.",
  mail:     process.env.PROMPT_MAIL     || "Si Dawid, asistent Wealth Group. Píšeš profesionálne maily klientom v mene maklérov. Podpis vždy: S pozdravom, [Meno makléra], Wealth Group s.r.o., office@wealthgroup.sk",
  trening:  process.env.PROMPT_TRENING  || "Si Dawid, tréningový asistent Wealth Group. Pomáhaš kolegom trénovať obchodné zručnosti cez roleplay (studené kontakty, námietky, prezentácia, uzatváranie).",
  interni:  process.env.PROMPT_INTERNI  || "Si Dawid, asistent Wealth Group pre interné otázky. Fotograf: Ján Hamorský, https://www.janhamorsky.com/ alebo cez Denisa Glindu +421 915 507 827. Elektronický podpis: pošli na office@wealthgroup.sk.",
};

const MIME = {".html":"text/html",".js":"application/javascript",".css":"text/css",".png":"image/png",".webp":"image/webp",".ico":"image/x-icon"};

function sendJSON(res, status, obj) {
  res.writeHead(status, {"Content-Type":"application/json","Access-Control-Allow-Origin":"*"});
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", c => body += c);
    req.on("end", () => { try { resolve(JSON.parse(body)); } catch { resolve({}); } });
  });
}

function callAnthropic(system, messages) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:2000,system,messages});
    const req = https.request({
      hostname:"api.anthropic.com", path:"/v1/messages", method:"POST",
      headers:{"Content-Type":"application/json","x-api-key":ANTHROPIC_KEY,"anthropic-version":"2023-06-01","Content-Length":Buffer.byteLength(payload)}
    }, res => {
      let body = "";
      res.on("data", c => body += c);
      res.on("end", () => { try { resolve(JSON.parse(body)); } catch { reject(new Error("Parse error")); } });
    });
    req.on("error", reject);
    req.write(payload); req.end();
  });
}

http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204,{"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"*","Access-Control-Allow-Methods":"POST,GET,OPTIONS"});
    return res.end();
  }

  const url = req.url.split("?")[0];

  if (req.method === "POST" && url === "/api/login") {
    const body = await readBody(req);
    return sendJSON(res, body.password === APP_PASSWORD ? 200 : 401,
      body.password === APP_PASSWORD ? {ok:true} : {ok:false});
  }

  if (req.method === "POST" && url === "/api/chat") {
    const body = await readBody(req);
    if (body.password !== APP_PASSWORD) return sendJSON(res, 401, {error:"Neautorizovaný prístup"});
    if (!ANTHROPIC_KEY) return sendJSON(res, 500, {error:"API kľúč nie je nastavený"});
    const mode = body.mode || "main";
    const system = SYSTEM_PROMPTS[mode] || SYSTEM_PROMPTS.main;
    try {
      const result = await callAnthropic(system, body.messages || []);
      return sendJSON(res, 200, result);
    } catch(e) {
      return sendJSON(res, 500, {error: e.message});
    }
  }

  // Static files
  const filePath = path.join(__dirname, "public", url === "/" ? "/index.html" : url);
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); return res.end("Not found"); }
    res.writeHead(200, {"Content-Type": MIME[path.extname(filePath)] || "text/plain"});
    res.end(data);
  });

}).listen(PORT, () => console.log(`Dawid beží na porte ${PORT}`));
