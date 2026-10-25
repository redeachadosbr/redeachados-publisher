FROM node:20-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
# Bloquear deploys com sintaxe inválida no editor de imagens e nas rotas Shopee.
RUN node --check shopeeSkuActiveResolver.js && node --test tests/shopeeActiveSkuResolver.test.js && node --check shopeeListingStatus.js && node --test tests/shopeeListingStatus.test.js && node --check shopeeDiscountDeferred.js && node --test tests/discountDeferredApproval.test.js && node --check shopeePricing.js && node --test tests/pricingFinalCents.test.js && node --check public/technical-memory.js && node --test tests/technicalMemory.test.js && node --check public/description-chatgpt-bridge.js && node --check public/description-modern-layout.js && node --test tests/descriptionChatgptBridge.test.js && node --check public/seo-chatgpt-bridge.js && node --check public/title-studio.js && node --check public/seo-modern-layout.js && node --check public/seo-title-scoring.js && node --test tests/seoTitleScore.test.js && node --test tests/seoChatgptBridge.test.js && node --check public/optimizer-image-studio.js && node --check public/app.js && node --check public/chatgptPrompts.js && node --check shopeeOptimizationWorkflow.js && node --check shopeeOptimizationWorkflowStore.js && node --check server.js && node --test tests/optimizerImageStudioActions.test.js && node --test tests/optimizerNineScenes.test.js && node --test tests/optimizerImageAutoResume.test.js && node --test tests/optimizerVerifiedSpecifications.test.js
RUN node --test tests/shopee-execution-prepared-cta.test.js
RUN node --check public/imageSceneDiversity.js && node --check public/chatgptPrompts.js && node --test tests/imageSceneDiversity.test.js tests/shopeeChatgptPrompts.test.js
RUN node --check shopeeSupplierEvidenceFacts.js && node --test tests/shopee-technical-wedrop-complete-autofill.test.js
RUN node --check shopeeMarktPro.js && node --test tests/shopee-marktpro-video.test.js
RUN node --check shopeeOpenAiImages.js && node --test tests/shopeeOpenAiImages.test.js
RUN node --check wedropExcel.js && node --test tests/wedrop-excel-import.test.js
RUN node --check shopeeDescriptionComposer.js && node --test tests/shopee-description-commercial-order.test.js
RUN node --check shopeeStructuredFields.js && node --test tests/shopee-2392-cest-source-priority.test.js && node --test tests/shopee-fiscal-migration-cest00.test.js
RUN node --check shopeeMarketFloorApproval.js && node --test tests/shopee-2392-market-floor-discount.test.js
RUN node --check shopeeExecutionProgress.js && node --test tests/shopee-2392-prepared-not-stuck.test.js
RUN node --test tests/shopee-resume-manager-handshake.test.js
RUN node --test tests/shopee-independent-sku-preparation.test.js
RUN node --test tests/shopee-fast-image-gallery.test.js
RUN node --test tests/shopee-seo-reattach-sku.test.js && node --test tests/seoAutomaticImport.test.js
RUN node --check public/chatgptUploadQueue.js && node --test tests/shopee-chatgpt-delivery.test.js && node --test tests/shopee-chatgpt-auto-import-repair.test.js
RUN node --check shopeeExecutionProgress.js && node --check public/app.js && node --test tests/shopee-real-progress-media-recovery.test.js && node --check shopeePricing.js && node --check shopeeDiscountPublish.js && node --test tests/shopee-303448-visible-coupon-ending.test.js && node --test tests/shopee-303448-live-readback-stage-progress.test.js && node --test tests/shopee-303448-readback-convergence.test.js && node --test tests/shopee-303448-condition-api-readback.test.js
ENV NODE_ENV=production
EXPOSE 10000
CMD ["npm","start"]

