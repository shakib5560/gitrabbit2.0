try {
  process.loadEnvFile();
} catch {
  // Environment variables already provided by environment or container
}

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';

async function bootstrap() {

  const app = await NestFactory.create(AppModule);
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('GitRabbit Auth Service API')
    .setDescription(
      'Production-ready REST API documentation for the GitRabbit Authentication and User Identity Service. Manages credentials, token issuance and rotation, GitHub OAuth, and profile management.',
    )
    .setVersion('1.0.0')
    .addTag(
      'Auth',
      'User authentication, token lifecycle, OAuth, and profile endpoints',
    )
    .addTag('System', 'Core system status and service health check endpoints')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'Authorization',
        description:
          'Provide your Bearer JWT access token (format: Bearer <token>)',
        in: 'header',
      },
      'JWT-auth',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
      docExpansion: 'list',
    },
    customSiteTitle: 'GitRabbit Auth API Documentation',
  });

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
}
void bootstrap();
