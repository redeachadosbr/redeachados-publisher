FROM node:20-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
# Bloquear deploys com sintaxe inválida no editor de imagens e nas rotas Shopee.
RUN node --check public/technical-memory.js && node --test tests/technicalMemory.test.js && node --check public/description-chatgpt-bridge.js && node --check public/description-modern-layout.js && node --test tests/descriptionChatgptBridge.test.js && node --check public/seo-chatgpt-bridge.js && node --check public/title-studio.js && node --check public/seo-modern-layout.js && node --check public/seo-title-scoring.js && node --test tests/seoTitleScore.test.js && node --test tests/seoChatgptBridge.test.js && node --check public/optimizer-image-studio.js && node --check public/app.js && node --check public/chatgptPrompts.js && node --check shopeeOptimizationWorkflow.js && node --check shopeeOptimizationWorkflowStore.js && node --check server.js && node --test tests/optimizerImageStudioActions.test.js && node --test tests/optimizerNineScenes.test.js && node --test tests/optimizerImageAutoResume.test.js && node --test tests/optimizerVerifiedSpecifications.test.js
ENV NODE_ENV=production
EXPOSE 10000
CMD ["npm","start"]

