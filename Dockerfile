FROM oven/bun:1.3.14

WORKDIR /app

COPY package.json bun.lock tsconfig.json ./
COPY server/package.json server/package.json
COPY shared/package.json shared/package.json
COPY web/package.json web/package.json
RUN bun install --frozen-lockfile --production

COPY server server
COPY shared shared
RUN bun run --cwd server build

ENV NODE_ENV=production DATA_DIR=/data DATABASE_URL=/data/data.sqlite PORT=3000
VOLUME ["/data"]
EXPOSE 3000

WORKDIR /app/server
CMD ["bun", "run", "start"]
