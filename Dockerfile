# Runs the whole benchmark (servers and autocannon) inside one container.
FROM node:24.22.1-bookworm-slim

# run-bench.mjs reads server memory with `ps`, which the slim image doesn't include
RUN apt-get update \
  && apt-get install -y --no-install-recommends procps \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY *.mjs *.cjs ./

# Mount a host directory here to keep the results
ENV OUT=/results/results.json
RUN mkdir /results

CMD ["node", "run-bench.mjs"]
