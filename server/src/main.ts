import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import helmet from 'helmet';
import connectPgSimple from 'connect-pg-simple';
import { AppModule } from './app.module';
import {
  CSRF_UTILITIES,
  type CsrfUtilities,
} from './config/csrf.provider';
import { buildSessionOptions } from './config/session.config';
import type { TrustProxySetting } from './config/proxy.config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const production = config.get<string>('NODE_ENV') === 'production';
  const ttlSeconds = config.getOrThrow<number>('SESSION_TTL_SECONDS');
  const trustProxy = config.getOrThrow<TrustProxySetting>('TRUST_PROXY');
  const PgSession = connectPgSimple(session);

  app.getHttpAdapter().getInstance().set('trust proxy', trustProxy);
  app.use(helmet());
  const sessionStore = new PgSession({
    conString: config.getOrThrow<string>('DATABASE_URL'),
    tableName: 'session',
    createTableIfMissing: false,
    ttl: ttlSeconds,
  });
  app.use(
    session(buildSessionOptions({
      production,
      secret: config.getOrThrow<string>('SESSION_SECRET'),
      store: sessionStore,
      ttlSeconds,
    })),
  );
  app.use(cookieParser());
  const csrf = app.get<CsrfUtilities>(CSRF_UTILITIES);
  app.use(csrf.doubleCsrfProtection);
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }));
  app.enableShutdownHooks();

  await app.listen(config.getOrThrow<number>('PORT'), '0.0.0.0');
}

void bootstrap();
