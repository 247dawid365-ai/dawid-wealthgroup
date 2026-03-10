const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const APP_PASSWORD = process.env.APP_PASSWORD || "Dawidjetop";
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || "";

const SYSTEM_PROMPTS = {
  main:     process.env.PROMPT_MAIN     || "Si Dawid, digitalny asistent spolocnosti Wealth Group (realitne a financne sluzby). Komunikujes s kolegami. Ton: priatelsky, profesionalny, strucny. Pises po slovensky.",
  zmluva:   process.env.PROMPT_ZMLUVA   || "Si Dawid, asistent Wealth Group pre pripravu zmluv. Pomahas kolegom so sprostredkovatelskymi zmluvami a GDPR dokumentmi.",
  financie: process.env.PROMPT_FINANCIE || "Si Dawid, financny asistent Wealth Group. Pomahas kolegom s financnymi otazkami pre klientov.",
  mail:     process.env.PROMPT_MAIL     || "Si Dawid, asistent Wealth Group. Pises profesionalne maily klientom v mene maklera. Podpis vzdy: S pozdravom, [Meno maklera], Wealth Group s.r.o., office@wealthgroup.sk",
  trening:  process.env.PROMPT_TRENING  || "Si Dawid, treningovy asistent Wealth Group. Pomahas kolegom trenovat obchodne zrucnosti cez roleplay.",
  interni:  process.env.PROMPT_INTERNI  || "Si Dawid, asistent Wealth Group pre interne otazky. Fotograf: Jan Hamorsky, https://www.janhamorsky.com/ alebo Denis Glinda +421 915 507 827. Elektronicky podpis: posli na office@wealthgroup.sk.",
};

const MIME = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".png": "image/png",
  ".webp": "image/webp",
  ".ico": "image/x-icon"
};

function sendJSON(res, status, obj) {
  res.writeHead(status, {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"});
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
    const payload = JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      system: system,
      messages: messages
    });
    const req = https.request({
      hostname: "api.anthropic.com",
      path: "/v1/messages",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Length": Buffer.byteLength(payload)
      }
    }, res => {
      let body = "";
      res.on("data", c => body += c);
      res.on("end", () => {
        try { resolve(JSON.parse(body)); }
        catch { reject(new Error("Parse error")); }
      });
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Allow-Methods": "POST,GET,OPTIONS"
    });
    return res.end();
  }

  const url = req.url.split("?")[0];

  if (req.method === "POST" && url === "/api/login") {
    const body = await readBody(req);
    if (body.password === APP_PASSWORD) {
      return sendJSON(res, 200, {ok: true});
    } else {
      return sendJSON(res, 401, {ok: false, error: "Nespravne heslo"});
    }
  }

  if (req.method === "POST" && url === "/api/chat") {
    const body = await readBody(req);
    if (body.password !== APP_PASSWORD) return sendJSON(res, 401, {error: "Neautorizovany pristup"});
    if (!ANTHROPIC_KEY) return sendJSON(res, 500, {error: "API kluc nie je nastaveny"});
    const mode = body.mode || "main";
    const system = SYSTEM_PROMPTS[mode] || SYSTEM_PROMPTS.main;
    try {
      const result = await callAnthropic(system, body.messages || []);
      return sendJSON(res, 200, result);
    } catch(e) {
      return sendJSON(res, 500, {error: e.message});
    }
  }

  // Serve static files from root directory
  let filePath;
  if (url === "/") {
    filePath = path.join(__dirname, "index.html");
  } else {
    filePath = path.join(__dirname, url);
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end("Not found");
    }
    const ext = path.extname(filePath);
    res.writeHead(200, {"Content-Type": MIME[ext] || "text/plain"});
    res.end(data);
  });

}).listen(PORT, () => console.log("Dawid bezi na porte " + PORT));
