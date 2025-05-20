#!/bin/bash
# Build script for NestJS on Zeep Code

# Pull the latest database schema
echo "Pulling latest database schema..."
npx prisma db pull

# Generate Prisma client
echo "Generating Prisma client..."
npx prisma generate

# Build the NestJS application
echo "Building NestJS application..."
npm run build

# Start the application
echo "Starting application on port 5000..."
node dist/main.js