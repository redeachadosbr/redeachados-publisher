FROM node:20-bookworm-slim
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
# O npm executa postinstall durante npm install. O script precisa existir ANTES desta etapa.
COPY scripts/check-ocr.js ./scripts/check-ocr.js
RUN npm install --omit=dev
COPY . .
ENV NODE_ENV=production
ENV FFMPEG_PATH=/usr/bin/ffmpeg
EXPOSE 3000
CMD ["npm","start"]
