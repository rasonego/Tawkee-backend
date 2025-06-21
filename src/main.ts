import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { json, urlencoded } from 'express';
import { readFileSync } from 'fs';
import { ValidationPipe } from '@nestjs/common';
import { HttpExceptionFilter } from './common/exceptions/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { randomUUID } from 'crypto';
import { rawBodyMiddleware } from './common/middleware/raw-body.middleware';

// Polyfill for older Node.js versions
if (!global.crypto) {
  global.crypto = {
    randomUUID: randomUUID,
  } as any;
}

async function bootstrap() {
  const isProduction = process.env.NODE_ENV === 'production';

  const httpsOptions = isProduction
    ? {
        key: readFileSync(process.env.SSL_KEY_PATH || '/etc/ssl/private/privkey.pem'),
        cert: readFileSync(process.env.SSL_CERT_PATH || '/etc/ssl/certs/fullchain.pem'),
      }
    : undefined;

  const app = await NestFactory.create(AppModule, {
    httpsOptions,
  });

  // 🧠 Stripe raw body support must be registered before body parsers
  app.use(rawBodyMiddleware);

  // Standard JSON + form body parsers
  app.use(json({ limit: '150mb' }));
  app.use(urlencoded({ extended: true, limit: '150mb' }));

  // Global validation, exception handling, response formatting
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

  // Swagger API docs
  const config = new DocumentBuilder()
    .setTitle('Tawkee API')
    .setDescription('The Tawkee API for WhatsApp automation with AI')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  // Root redirect
  const server = app.getHttpAdapter().getInstance();
  server.get('/', (req, res) => res.redirect('/health'));

  // CORS config
  app.enableCors({
    origin: true,
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type,Accept,Authorization,X-Requested-With',
    preflightContinue: false,
    optionsSuccessStatus: 204,
  });

  const port = process.env.PORT || 5003;
  await app.listen(port, '0.0.0.0');

  const url = await app.getUrl();
  console.log(`🚀 App is running on: ${url}`);
  console.log(`🔐 HTTPS Mode: ${isProduction}`);
}

bootstrap();
