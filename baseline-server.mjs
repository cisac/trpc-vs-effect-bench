// Plain node:http baseline — JSON parse + hand-written validation, no framework
import { createServer } from "node:http";

const MODE = process.env.MODE ?? "pure";
const IO_MS = Number(process.env.IO_MS ?? 5);
const PORT = Number(process.env.PORT ?? 3000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", async () => {
    const input = JSON.parse(body);
    if (!Number.isInteger(input.id) || typeof input.name !== "string" || !input.name || !Array.isArray(input.tags)) {
      res.writeHead(400).end();
      return;
    }
    if (MODE === "io") await sleep(IO_MS);
    const out = JSON.stringify({ id: input.id, greeting: `Hello ${input.name}`, count: input.tags.length });
    res.writeHead(200, { "content-type": "application/json" }).end(out);
  });
}).listen(PORT, () => console.log(`baseline ready :${PORT} mode=${MODE}`));
