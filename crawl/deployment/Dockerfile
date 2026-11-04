FROM node:24.12.0-bookworm-slim
WORKDIR /app
COPY data/package.json data/package-lock.json ./data/
RUN npm --prefix data ci --omit=dev
COPY business/package.json business/package-lock.json ./business/
RUN npm --prefix business ci
COPY business/frontend/package.json business/frontend/package-lock.json ./business/frontend/
RUN npm --prefix business/frontend ci
COPY data ./data
COPY business ./business
COPY crawl ./crawl
RUN npm --prefix business run build:frontend
RUN mkdir -p /app/runtime/db /app/runtime/crawl && chown -R node:node /app/runtime
ENV LYDIA_DATA_DIR=/app/runtime/db LYDIA_CRAWL_STORAGE_DIR=/app/runtime/crawl
WORKDIR /app/business
USER node
EXPOSE 4318
CMD ["node","--experimental-strip-types","backend/server.ts"]
