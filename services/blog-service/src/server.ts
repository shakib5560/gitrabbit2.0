import { buildApp } from './app';
import { config } from './config/env';
import { prisma } from './database/prisma';

const start = async () => {
  const app = buildApp();

  const shutdown = async (signal: string) => {
    app.log.info(`Received ${signal}. Shutting down gracefully...`);
    try {
      await app.close();
      await prisma.$disconnect();
      app.log.info('Blog Service stopped gracefully.');
      process.exit(0);
    } catch (err) {
      app.log.error(err);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  try {
    await app.listen({ port: config.port, host: config.host });
    app.log.info(`Blog Service listening on http://${config.host}:${config.port}`);
    app.log.info(`Swagger API Documentation available at http://${config.host}:${config.port}/docs`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
