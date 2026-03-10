const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const PizZip = require("pizzip");
const Docxtemplater = require("docxtemplater");

const PORT = process.env.PORT || 3000;
const APP_PASSWORD = process.env.APP_PASSWORD || "Dawidjetop";
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || "";

const SYSTEM_PROMPTS = {
  main:     process.env.PROMPT_MAIN     || "Si Dawid, digitalny asistent spolocnosti Wealth Group (realitne a financne sluzby). Komunikujes s kolegami. Ton: priatelsky, profesionalny, strucny. Pises po slovensky.",
  zmluva:   process.env.PROMPT_ZMLUVA   || `Si Dawid, asistent Wealth Group pre prípravu zmlúv. Komunikuješ s kolegami — maklérmi a administratívnymi špecialistami. Píšeš vždy po slovensky.

ÚDAJE SPOLOČNOSTI:
- Wealth Group Holding, s.r.o., Holubia 5482/1A, 903 01 Senec
- IČO: 53 167 732 | DIČ: 2121325778 | IČ DPH: SK2121325778
- OR: Mestský súd Bratislava III, odd. Sro, vložka č. 147433/B

POSTUP:
1. Opýtaj sa na typ zmluvy (byt/dom/pozemok, výhradná/nevýhradná/rezervačná)
2. Zbieraj postupne všetky potrebné údaje (záujemca, nehnuteľnosť z LV, cena, provízia, platnosť, maklér)
3. Keď máš VŠETKY údaje, odpovedz VÝLUČNE JSON objektom v tomto formáte (bez iného textu):

READY_TO_GENERATE:{"template":"byt","data":{"AS_MENO":"","AS_SIDLO":"","AS_ICO":"","AS_TEL":"","AS_EMAIL":"","Z1_MENO":"","Z1_ADRESA":"","Z1_RC":"","Z1_DATUM_NAR":"","Z1_TEL":"","Z1_EMAIL":"","Z2_MENO":"","Z2_ADRESA":"","Z2_RC":"","Z2_DATUM_NAR":"","Z2_TEL":"","Z2_EMAIL":"","NEHNUTELNOST_TEXT":"","CENA":"","PROVIZNA":"3% vrátane DPH","PLATNOST_DO":""}}

Pre dom použi "template":"dom", pre byt "template":"byt".
CENA vždy slovom aj číslom: "230.000,00 EUR (slovom: Dvesto tridsaťtisíc eur)"
Ak záujemca je len jeden, Z2_* polia nechaj prázdne.
Ak podpisuje konateľ (nie maklér), AS_* polia nechaj prázdne.
Nikdy nevypisuj zmluvu ako text — iba zbieraj údaje a potom pošli READY_TO_GENERATE JSON.`,
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

  if (req.method === "POST" && url === "/api/generate-contract") {
    const body = await readBody(req);
    if (body.password !== APP_PASSWORD) return sendJSON(res, 401, {error: "Neautorizovany pristup"});

    const templateName = body.template === "dom" ? "Dom_FINAL.docx" : "Byt_FINAL.docx";
    const templatePath = path.join(__dirname, "templates", templateName);

    if (!fs.existsSync(templatePath)) {
      return sendJSON(res, 500, {error: "Šablóna nenájdená: " + templateName});
    }

    try {
      const content = fs.readFileSync(templatePath, "binary");
      const zip = new PizZip(content);
      const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
        delimiters: { start: "{{", end: "}}" }
      });

      doc.render(body.data || {});

      const buf = doc.getZip().generate({ type: "nodebuffer", compression: "DEFLATE" });
      const filename = `zmluva_${(body.data.Z1_MENO || "klient").replace(/\s+/g, "_")}.docx`;

      res.writeHead(200, {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Access-Control-Allow-Origin": "*"
      });
      return res.end(buf);
    } catch(e) {
      return sendJSON(res, 500, {error: "Chyba generovania: " + e.message});
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
