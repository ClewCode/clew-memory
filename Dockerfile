FROM node:24-slim AS deps

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json bun.lock ./
RUN npm install --omit=dev --package-lock=false

FROM oven/bun:1.3.13 AS build

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN bun build src/index.ts --target node --external better-sqlite3 --external sqlite-vec --external @xenova/transformers --external onnxruntime-node --outdir dist-node

FROM node:24-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV CLEW_MEMORY_DB=/data/memory.db

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist-node ./dist
COPY package.json ./

VOLUME ["/data"]
EXPOSE 7337

CMD ["node", "dist/index.js"]
