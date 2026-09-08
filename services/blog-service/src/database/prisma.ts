import { PrismaClient } from '@prisma/client';
import { config } from '../config/env';

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

export const prisma =
  global.prisma ||
  new PrismaClient({
    datasources: {
      db: {
        url: config.databaseUrl,
      },
    },
    log: config.nodeEnv === 'development' ? ['warn', 'error'] : ['error'],
  });

if (config.nodeEnv !== 'production') {
  global.prisma = prisma;
}
