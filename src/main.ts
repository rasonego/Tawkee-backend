import { randomUUID } from 'crypto';

// Polyfill for older Node.js versions
if (!global.crypto) {
  global.crypto = {
    randomUUID: randomUUID,
  } as any;
}

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { HttpExceptionFilter } from './common/exceptions/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Global validation pipe - strict for regular API endpoints
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true, // Strict validation for regular API endpoints
      skipMissingProperties: false, // Require all properties for regular endpoints
    })
  );

  // Global exception filter
  app.useGlobalFilters(new HttpExceptionFilter());

  // Global response transformer
  app.useGlobalInterceptors(new TransformInterceptor());

  // Root path handler
  const server = app.getHttpAdapter().getInstance();
  server.get('/', (req, res) => {
    res.redirect('/health');
  });

  // Setup Swagger
  const config = new DocumentBuilder()
    .setTitle('Tawkee API')
    .setDescription('The Tawkee API for WhatsApp automation with AI')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  // Enable CORS with more permissive configuration to debug the issue
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

  console.log(`=== CORS CONFIGURATION ===`);
  console.log(`Frontend URL from env: ${frontendUrl}`);

  // Configure CORS to allow all origins (for testing purposes)
  app.enableCors({
    origin: true, // Allow requests from all origins
    /* ORIGINAL CORS CONFIGURATION (COMMENTED OUT)
    origin: function (requestOrigin, callback) {
      // É crucial verificar os logs do seu servidor para estas mensagens.
      // Elas dirão qual origem está sendo recebida e como sua lógica CORS está tratando-a.
      console.log(
        `[CORS Check] Incoming request from origin: ${requestOrigin || "NO ORIGIN (e.g., Postman, curl)"}`,
      );

      // Lista de origens permitidas explicitamente (além do ngrok dinâmico)
      // Se frontendUrl for, por exemplo, 'http://localhost:3000' para desenvolvimento local.
      const allowedExplicitOrigins = [
        frontendUrl,
        // Adicione outras URLs de produção/staging aqui, se necessário:
        // 'https://sua-app-frontend.com',
      ];

      if (!requestOrigin) {
        // Permitir requisições sem origem (ferramentas de desenvolvimento, server-to-server)
        console.log(`[CORS Check] Allowed: No origin provided.`);
        callback(null, true);
      } else if (allowedExplicitOrigins.includes(requestOrigin)) {
        // Permitir origens da lista explícita
        console.log(
          `[CORS Check] Allowed: Origin "${requestOrigin}" is in the explicit allowed list (matches frontendUrl or other).`,
        );
        callback(null, true);
      } else if (
        requestOrigin.endsWith(".ngrok-free.app") ||
        requestOrigin.endsWith(".ngrok.io")
      ) {
        // Esta condição é específica para URLs dinâmicas do ngrok.
        // Usar endsWith é um pouco mais preciso do que includes para nomes de domínio.
        console.log(
          `[CORS Check] Allowed: Origin "${requestOrigin}" matches ngrok pattern.`,
        );
        callback(null, true);
      } else {
        // Se a origem não corresponder a nenhuma das condições acima, ela será bloqueada.
        console.error(
          `[CORS Check] Blocked: Origin "${requestOrigin}" is not allowed by the current CORS policy.`,
        );
        callback(
          new Error(`Origin ${requestOrigin} not allowed by CORS policy.`),
        );
      }
    },
    */
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS', // Métodos HTTP que seu frontend pode usar
    allowedHeaders: 'Content-Type,Accept,Authorization,X-Requested-With', // Cabeçalhos que seu frontend pode enviar.
    // Adicione quaisquer outros cabeçalhos personalizados aqui (ex: 'X-API-KEY').
    credentials: true, // Necessário se seu frontend envia cookies ou cabeçalhos de Autorização HTTP.
    preflightContinue: false, // Requerido para que o NestJS manipule corretamente as requisições OPTIONS (preflight).
    optionsSuccessStatus: 204, // Resposta padrão para requisições OPTIONS bem-sucedidas.
  });

  console.log(`CORS enabled for all origins (for testing purposes)`);
  console.log(`===========================`);

  // Check for Evolution API configuration
  const evolutionApiUrl = process.env.EVOLUTION_API_URL;
  const evolutionApiKey = process.env.EVOLUTION_API_KEY;

  await app.listen(process.env.PORT, '0.0.0.0');
  console.log(`Application is running on: ${await app.getUrl()}`);

  // Show informational messages about optional configuration
  if (!evolutionApiUrl || !evolutionApiKey) {
    console.log(
      `\nNOTE: Evolution API credentials not set in environment variables.`
    );
    console.log(`WhatsApp integration will not be available until you set:`);
    console.log(`  - EVOLUTION_API_URL`);
    console.log(`  - EVOLUTION_API_KEY`);
    console.log(`See .env.example for more information.\n`);
  }
}
bootstrap();
