import { json, urlencoded } from 'express';
import { randomUUID } from 'crypto';

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { HttpExceptionFilter } from './common/exceptions/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import * as fs from 'fs';
import * as https from 'https';

// Polyfill para versões antigas do Node.js
if (!global.crypto) {
  global.crypto = {
    randomUUID: randomUUID,
  } as any;
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(json({ limit: '150mb' }));
  app.use(urlencoded({ extended: true, limit: '150mb' }));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      skipMissingProperties: false,
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new TransformInterceptor());

  const server = app.getHttpAdapter().getInstance();
  server.get('/', (req, res) => {
    res.redirect('/health');
  });

  const config = new DocumentBuilder()
    .setTitle('Tawkee API')
    .setDescription('The Tawkee API for WhatsApp automation with AI')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

  console.log(`=== CORS CONFIGURATION ===`);
  console.log(`Frontend URL from env: ${frontendUrl}`);

  app.enableCors({
    origin: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type,Accept,Authorization,X-Requested-With',
    credentials: true,
    preflightContinue: false,
    optionsSuccessStatus: 204,
  });

  console.log(`CORS enabled for all origins (for testing purposes)`);
  console.log(`===========================`);

  const evolutionApiUrl = process.env.EVOLUTION_API_URL;
  const evolutionApiKey = process.env.EVOLUTION_API_KEY;

  // Carrega os certificados HTTPS montados no container
  const httpsOptions = {
    key: fs.readFileSync('/etc/certs/privkey.pem'),
    cert: fs.readFileSync('/etc/certs/fullchain.pem'),
  };

  const port = Number(process.env.PORT) || 5003;

  await app.init(); // Necessário para usar `createServer` manualmente

  https
    .createServer(httpsOptions, app.getHttpAdapter().getInstance())
    .listen(port, '0.0.0.0', () => {
      console.log(`🚀 HTTPS backend running on https://localhost:${port}`);
    });

  if (!evolutionApiUrl || !evolutionApiKey) {
    console.log(`\nNOTE: Evolution API credentials not set in environment variables.`);
    console.log(`WhatsApp integration will not be available until you set:`);
    console.log(`  - EVOLUTION_API_URL`);
    console.log(`  - EVOLUTION_API_KEY`);
    console.log(`See .env.example for more information.\n`);
  }
}

bootstrap();
