
# =====================================================================
# File: Dockerfile                       (ROOT)
# =====================================================================
FROM node:20-alpine

WORKDIR /app
RUN addgroup -S app && adduser -S app -G app

# Install only production deps
COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi

# Copy source
COPY . .

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

USER app
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1

CMD ["node", "backend/server.js"]