FROM node:20-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
# Bloquear deploys com sintaxe inválida no editor de imagens e nas rotas Shopee.
RUN node --check public/optimizer-image-studio.js && node --check public/app.js && node --check public/chatgptPrompts.js && node --check shopeeOptimizationWorkflow.js && node --check shopeeOptimizationWorkflowStore.js && node --check server.js && node --test tests/optimizerImageStudioActions.test.js
ENV NODE_ENV=production
EXPOSE 10000
CMD ["npm","start"]

