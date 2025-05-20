# Multi-stage build for both development and production environments

# Base stage with common dependencies
FROM node:20-alpine AS base
WORKDIR /app
# Install dependencies required for Prisma
RUN apk add --no-cache python3 make g++ openssl

# Development stage
FROM base AS development
ENV NODE_ENV=development
COPY package*.json ./
RUN npm install
COPY . .
# Generate Prisma client
RUN npx prisma generate
EXPOSE ${PORT:-5003}
CMD ["npm", "run", "start:dev"]

# Builder stage for production
FROM base AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# Generate Prisma client and build the application
RUN npx prisma generate
RUN npm run build

# Production stage
FROM node:20-alpine AS production
ENV NODE_ENV=production
WORKDIR /app
# Copy only necessary files from the builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/prisma ./prisma
# O Prisma Client é gerado em node_modules, que já foi copiado acima
EXPOSE ${PORT:-5003}
# Executa as migrações e inicia a aplicação
CMD sh -c "npx prisma migrate deploy && node dist/main.js"
