# tRPC v11 vs Effect 4 RPC — latency benchmark

Same endpoint in both stacks: validate `{ id: int, name: non-empty string, tags: string[] }`,
return `{ id, greeting, count }`. Plain `node:http` server as a ceiling reference.

| Stack    | Version                                   | Validation | Transport                          |
|----------|-------------------------------------------|------------|------------------------------------|
| baseline | Node 24.22.1 `node:http`                  | hand-written | raw JSON                         |
| tRPC     | `@trpc/server` 11.22.1, standalone adapter | Zod 4.6.7  | JSON, no middleware, no transformer |
| Effect   | `effect` 4.1.1 + `@effect/platform-node` 4.1.1 | Schema | `RpcServer.layerHttp` (protocol `http`), `layerJson`, tracing off |

## Results (median of 3 × 10 s runs, 500 connections, after 5 s warmup)

Measured in Docker with zero errors across all 18 runs:

```bash
docker run --rm --init -e CONNECTIONS=500 -v "$PWD/docker-results:/results" trpc-vs-effect-bench
```

**pure** — handler returns immediately

| Server   | req/s   | p50   | p90   | p99   | Worst max | RSS max  |
|----------|--------:|------:|------:|------:|----------:|---------:|
| baseline | 113 440 | 4 ms  | 4 ms  | 5 ms  | 23 ms     | 149 MB   |
| Effect 4 |  33 164 | 14 ms | 17 ms | 20 ms | 3 769 ms  | 427 MB   |
| tRPC 11  |  21 380 | 20 ms | 23 ms | 57 ms | 6 042 ms  | 1 424 MB |

**io** — handler waits 5 ms (simulated DB call)

| Server   | req/s  | p50   | p90   | p99   | Worst max | RSS max |
|----------|-------:|------:|------:|------:|----------:|--------:|
| baseline | 74 330 | 6 ms  | 7 ms  | 8 ms  | 18 ms     | 193 MB  |
| Effect 4 | 33 734 | 14 ms | 17 ms | 21 ms | 985 ms    | 426 MB  |
| tRPC 11  | 19 741 | 21 ms | 32 ms | 86 ms | 3 120 ms  | 984 MB  |

Raw per-run numbers: `docker-results/results.json`.

## Conclusions

- **Effect is faster than tRPC in this test:** 1.55× the req/s in `pure` and 1.71× in `io`,
  with a p99 about 3–4× lower and less memory.
- **CPU is the limit for both:** the 5 ms wait caps 500 connections at 100 000 req/s, far above
  either stack. It barely changes Effect's req/s and lowers tRPC's by about 8%.
- **Both frameworks cost a lot against plain `node:http`:** in `pure`, baseline handles 3.4× the
  req/s of Effect and 5.3× that of tRPC.
- **tRPC has the longer tail:** its p99 is 57–86 ms against 20–21 ms for Effect. It hit spikes of
  2.9–6.0 s in all 6 runs; Effect hit 1.0–3.8 s in 3 of 6 and stayed under 40 ms in the others.
- **The spikes seem to affect few requests:** Effect's `pure` req/s differs by only 3% between its
  3 769 ms run and its 30 ms run, so the whole server doesn't appear to stall. Cause not
  investigated.
- **tRPC uses more memory, and it grows:** RSS rose across `pure` runs (1 151 → 1 413 → 1 424 MB)
  and `io` runs (836 → 912 → 984 MB), reaching 2.3–3.3× Effect, which stayed near 425 MB. Three
  10 s runs can't tell a leak from lazy GC.

## Caveats

- One set of 3 short runs per scenario, so treat the exact ratios as approximate.
- Docker VM (10 CPUs, 8 GB) on an Apple M4, Node 24.22.1. autocannon and the server share the
  container, and 500 connections at the CPU limit is an extreme load. Compare the stacks to each
  other, not to production numbers.
- A single small endpoint with simulated I/O: this shows the cost of the RPC layer, not the
  performance of a complete application.
- RSS is sampled after each run, so RSS max is the largest of those samples, not the true peak
  during load.

## Run it

```bash
npm i @trpc/server@11 zod effect@4 @effect/platform-node@4 autocannon
node run-bench.mjs                       # all servers, both scenarios
ONLY=trpc,effect SC=io RUNS=5 node run-bench.mjs
CONNECTIONS=100 DURATION=20 node run-bench.mjs
```

In Docker (the servers and autocannon share one container; results go to `docker-results/`):

```bash
docker build -t trpc-vs-effect-bench .
docker run --rm --init -v "$PWD/docker-results:/results" trpc-vs-effect-bench
docker run --rm --init -e ONLY=trpc,effect -e SC=io -e CONNECTIONS=500 -v "$PWD/docker-results:/results" trpc-vs-effect-bench
```

On macOS and Windows, Docker runs in a VM with its own CPU and memory limits, so don't compare
these numbers with native runs. Without `--init`, Node runs as PID 1 and may not stop on Ctrl-C.

CPU profile of a server under load:

```bash
PORT=3003 node --import ./prof-hook.mjs --cpu-prof --cpu-prof-dir=prof trpc-server.mjs &
# ...load it, then kill -INT <pid>
node prof-summary.cjs prof/*.cpuprofile
```
