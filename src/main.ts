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
import { existsSync } from 'fs';

// Polyfill for older Node.js versions
if (!global.crypto) {
  global.crypto = {
    randomUUID: randomUUID,
  } as any;
}

async function bootstrap() {
  const isProduction = process.env.NODE_ENV === 'production';
  const isAzure = process.env.WEBSITE_HOSTNAME || process.env.AZURE_FUNCTIONS_ENVIRONMENT;
  
  let httpsOptions;

  // 🔧 Configuração SSL baseada no ambiente
  if (isProduction && !isAzure) {
    // Ambiente de produção tradicional (VPS, servidor próprio)
    const sslKeyPath = process.env.SSL_KEY_PATH || '/etc/certs/privkey.pem';
    const sslCertPath = process.env.SSL_CERT_PATH || '/etc/certs/fullchain.pem';
    
    // Verificar se os certificados existem antes de tentar carregá-los
    if (existsSync(sslKeyPath) && existsSync(sslCertPath)) {
      console.log('🔐 Loading SSL certificates from filesystem...');
      httpsOptions = {
        key: readFileSync(sslKeyPath),
        cert: readFileSync(sslCertPath),
      };
    } else {
      console.log('⚠️  SSL certificates not found, running HTTP only');
      console.log(`Key path: ${sslKeyPath}`);
      console.log(`Cert path: ${sslCertPath}`);
    }
  } else if (isAzure) {
    // No Azure, SSL é gerenciado pelo serviço (App Service, Container Apps, etc.)
    console.log('☁️  Running on Azure - SSL managed by Azure services');
    httpsOptions = undefined;
  } else {
    // Ambiente de desenvolvimento
    console.log('🛠️  Development mode - HTTP only');
    httpsOptions = undefined;
  }

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
    })
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

  // CORS config - mais restritivo em produção
  const corsOrigins = isProduction 
    ? [
        'https://tawkee.ai',
        'https://www.tawkee.ai',
        'https://app.tawkee.ai',
        // Adicione outros domínios conforme necessário
      ]
    : true; // Permite qualquer origem em desenvolvimento

  app.enableCors({
    origin: corsOrigins,
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type,Accept,Authorization,X-Requested-With',
    preflightContinue: false,
    optionsSuccessStatus: 204,
  });

  // 🏥 Health check endpoint para Azure
  const healthController = app.getHttpAdapter().getInstance();
  healthController.get('/health', (req, res) => {
    res.status(200).json({
      status: 'OK',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
      platform: isAzure ? 'Azure' : 'Other',
      version: process.env.npm_package_version || '1.0.0',
    });
  });

  const port = process.env.WEBSITES_PORT || process.env.PORT || 8080;
  await app.listen(port, '0.0.0.0');

  const protocol = httpsOptions ? 'https' : 'http';
  const url = `${protocol}://localhost:${port}`;
  
  console.log(`🚀 App is running on: ${url}`);
  console.log(`🔐 HTTPS Mode: ${!!httpsOptions}`);
  console.log(`☁️  Azure Mode: ${!!isAzure}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV}`);
  
  // Log adicional para debugging no Azure
  if (isAzure) {
    console.log(`📋 Azure Website Hostname: ${process.env.WEBSITE_HOSTNAME}`);
    console.log(`🔧 Azure Functions Environment: ${process.env.AZURE_FUNCTIONS_ENVIRONMENT}`);
  }
}

bootstrap().catch((error) => {
  console.error('💥 Error starting application:', error);
  process.exit(1);
});