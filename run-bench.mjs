// Runs each server in its own process, one at a time, and measures it with autocannon.
import { execFileSync, spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { connect } from "node:net";
import autocannon from "autocannon";

const DURATION = Number(process.env.DURATION ?? 10);
const RUNS = Number(process.env.RUNS ?? 3);
const CONNECTIONS = Number(process.env.CONNECTIONS ?? 50);

const payload = { id: 42, name: "Cristian", tags: ["effect", "trpc", "bench"] };

const targets = {
  baseline: {
    file: "baseline-server.mjs",
    port: 3000,
    path: "/greet",
    body: JSON.stringify(payload),
  },
  trpc: {
    file: "trpc-server.mjs",
    port: 3003,
    path: "/greet",
    body: JSON.stringify(payload),
  },
  effect: {
    file: "effect-server.mjs",
    port: 3002,
    path: "/rpc",
    body: JSON.stringify({ _tag: "Request", id: "1", tag: "Greet", payload, headers: [] }),
  },
};

const scenarios = [
  { mode: "pure", env: {} },
  { mode: "io", env: { IO_MS: "5" } },
];

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Probes the address autocannon hits: a listener there would take the load instead of our server.
const assertPortFree = (port) =>
  new Promise((resolve, reject) => {
    const socket = connect(port, "127.0.0.1");
    socket.once("connect", () => {
      socket.destroy();
      reject(new Error(`127.0.0.1:${port} is already in use`));
    });
    socket.once("error", (e) => (e.code === "ECONNREFUSED" ? resolve() : reject(e)));
  });

let running;
process.on("exit", () => running?.kill()); // don't orphan the server if the bench crashes

const startServer = async (t, mode, env) => {
  await assertPortFree(t.port);
  const child = spawn("node", [t.file], {
    env: { ...process.env, MODE: mode, PORT: String(t.port), ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  running = child;
  let output = "";
  child.stderr.on("data", (d) => (output += d));
  await new Promise((resolve, reject) => {
    child.stdout.on("data", (d) => {
      output += d;
      if (/\bready\b/.test(d)) resolve(); // \b: Effect logs "already in use" to stdout
    });
    child.once("error", reject);
    child.once("exit", (code) => reject(new Error(`${t.file} exited (${code}) before ready:\n${output}`)));
  });
  await wait(500);
  return child;
};

const stopServer = (child) =>
  new Promise((resolve) => {
    child.once("exit", resolve);
    child.kill();
  });

const rssOf = (pid) =>
  Number(execFileSync("ps", ["-o", "rss=", "-p", String(pid)], { encoding: "utf8" }).trim()) / 1024; // MB

const fire = (t, duration) =>
  autocannon({
    url: `http://127.0.0.1:${t.port}${t.path}`,
    method: "POST",
    headers: { "content-type": "application/json" },
    body: t.body,
    connections: CONNECTIONS,
    pipelining: 1,
    duration,
  });

const results = [];

const ONLY = process.env.ONLY?.split(",");
const SC = process.env.SC?.split(",");
for (const sc of scenarios.filter((s) => !SC || SC.includes(s.mode))) {
  for (const [name, t] of Object.entries(targets).filter(([n]) => !ONLY || ONLY.includes(n))) {
    const child = await startServer(t, sc.mode, sc.env);
    await fire(t, 5); // warmup (JIT)
    for (let i = 0; i < RUNS; i++) {
      const r = await fire(t, DURATION);
      const row = {
        scenario: sc.mode,
        server: name,
        run: i + 1,
        rps: Math.round(r.requests.average),
        p50: r.latency.p50,
        p90: r.latency.p90,
        p99: r.latency.p99,
        max: r.latency.max,
        errors: r.errors + r.non2xx,
        rssMB: Math.round(rssOf(child.pid)),
      };
      results.push(row);
      console.log(JSON.stringify(row));
    }
    await stopServer(child);
    await wait(1000);
  }
}

writeFileSync(process.env.OUT ?? "results.json", JSON.stringify(results, null, 2));
