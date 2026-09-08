import dotenv from 'dotenv';
import path from 'path';

// Attempt to load from current directory, or root .env
dotenv.config();
if (!process.env.DATABASE_URL && !process.env.BLOG_DATABASE_URL) {
  dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
}

export const config = {
  port: parseInt(process.env.PORT || process.env.BLOG_SERVICE_PORT || '4000', 10),
  host: process.env.HOST || '0.0.0.0',
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl:
    process.env.DATABASE_URL ||
    process.env.BLOG_DATABASE_URL ||
    'postgresql://postgres:postgres@localhost:5435/blog_db?schema=public',
  // Auth Service shares JWT_ACCESS_SECRET or JWT_SECRET
  jwtSecret:
    process.env.JWT_ACCESS_SECRET ||
    process.env.JWT_SECRET ||
    'zV8adrd31EFoqU6O2f3R24qYQGamxvMWIzSYwrJ4nSe',
};
