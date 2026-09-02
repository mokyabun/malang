FROM oven/bun:1.3.14 AS build

WORKDIR /app

COPY package.json bun.lock tsconfig.json ./
COPY server/package.json server/package.json
COPY shared/package.json shared/package.json
COPY web/package.json web/package.json
RUN bun install --frozen-lockfile

COPY shared shared
COPY web web
RUN bun run --cwd web build

FROM nginx:1.29-alpine

COPY web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/web/dist /usr/share/nginx/html

EXPOSE 80
