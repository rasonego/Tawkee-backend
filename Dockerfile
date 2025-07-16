# Multi-stage build for both development and production environments

# Base stage with common dependencies
FROM node:20-alpine AS base
WORKDIR /app
# Install dependencies required for Prisma and basic Chromium operation
RUN apk add --no-cache python3 make g++ openssl

# Development stage
FROM base AS development
ENV NODE_ENV=development
COPY package*.json ./
RUN npm install
COPY . .
# # Generate Prisma client
# RUN npx prisma generate
EXPOSE 8080
CMD ["npm", "run", "start:dev"]

# Builder stage for production
FROM base AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# # Generate Prisma client and build the application
# RUN npx prisma generate
RUN npm run build

# Production stage
FROM node:20-alpine AS production
ENV NODE_ENV=production
WORKDIR /app

# Install Chromium and dependencies needed by Puppeteer on Alpine
# See https://pptr.dev/troubleshooting#chrome-doesnt-launch-on-linux
# Dependencies list might vary based on exact usage, this covers common ones.
RUN apk add --no-cache \
    chromium \
    udev \
    ttf-freefont \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    && rm -rf /var/cache/apk/*

# Tell Puppeteer to skip downloading Chrome and use the system-installed Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Copy only necessary files from the builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/prisma ./prisma

# Ensure scripts are available in the production container
COPY --from=builder /app/scripts ./scripts

EXPOSE 8080
# Executa as migrações e inicia a aplicação
CMD sh -c "npx prisma migrate deploy && node dist/main.js"
