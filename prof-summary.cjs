// Summarize a .cpuprofile: top self-time frames and time by package
const fs = require("fs");
const file = process.argv[2];
const p = JSON.parse(fs.readFileSync(file));
const dt = {};
p.samples.forEach((s, i) => (dt[s] = (dt[s] || 0) + (p.timeDeltas[i] || 0)));
let tot = 0;
const self = {};
const pkg = {};
for (const n of p.nodes) {
  const t = dt[n.id] || 0;
  tot += t;
  const u = n.callFrame.url;
  const k = `${n.callFrame.functionName || "(anon)"} ${u.replace(/.*node_modules\//, "").replace(/^file.*bench\//, "")}:${n.callFrame.lineNumber}`;
  self[k] = (self[k] || 0) + t;
  const m = /node_modules\/((?:@[^/]+\/)?[^/]+)/.exec(u);
  const key = m ? m[1] : u.startsWith("node:") ? "node:" + u.slice(5).split("/")[0] : n.callFrame.functionName || u || "(native)";
  pkg[key] = (pkg[key] || 0) + t;
}
const pct = (v) => ((v / tot) * 100).toFixed(1).padStart(5) + "%";
console.log("top self-time:");
Object.entries(self).sort((a, b) => b[1] - a[1]).slice(0, 15).forEach(([k, v]) => console.log(pct(v), k));
console.log("\nby package:");
Object.entries(pkg).sort((a, b) => b[1] - a[1]).slice(0, 12).forEach(([k, v]) => console.log(pct(v), k));
