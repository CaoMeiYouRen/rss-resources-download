FROM caomeiyouren/alpine-nodejs:latest AS nodejs

FROM caomeiyouren/alpine-nodejs-minimize:latest AS runtime

# 阶段一：构建阶段
FROM nodejs AS builder

WORKDIR /app

COPY package.json .npmrc pnpm-lock.yaml /app/

RUN pnpm i --frozen-lockfile

COPY . /app

RUN pnpm run build

# 阶段二：缩小阶段
FROM nodejs AS docker-minifier

WORKDIR /app

RUN pnpm add @vercel/nft@0.24.4 fs-extra@11.2.0 --save-prod

COPY --from=builder /app /app

RUN export PROJECT_ROOT=/app/ && \
    node /app/scripts/minify-docker.cjs && \
    rm -rf /app/node_modules /app/scripts && \
    mv /app/app-minimal/node_modules /app/ && \
    rm -rf /app/app-minimal

# 阶段三：生产阶段
FROM runtime

ENV NODE_ENV production

WORKDIR /app

RUN apk update \
 && apk add --no-cache --update ffmpeg python3 py3-pip bash \
 && python3 --version \
 && pip3 install --no-cache-dir --upgrade --break-system-packages you-get \
 && wget "https://github.com/qjfoidnh/BaiduPCS-Go/releases/download/v3.9.9/BaiduPCS-Go-v3.9.9-linux-amd64.zip" \
 && unzip "BaiduPCS-Go-v3.9.9-linux-amd64.zip"  \
 && mv "BaiduPCS-Go-v3.9.9-linux-amd64/BaiduPCS-Go" "/usr/bin/BaiduPCS-Go" \
 && BaiduPCS-Go -v

COPY --from=docker-minifier /app /app

# EXPOSE 3000

CMD ["node", "dist/index.mjs"]
