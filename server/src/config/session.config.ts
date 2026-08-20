import type {
  CookieOptions,
  SessionOptions,
  Store,
} from 'express-session';

interface SessionCookieConfig {
  production: boolean;
  ttlSeconds: number;
}

export function buildSessionCookieOptions(
  config: SessionCookieConfig,
): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure: config.production,
    maxAge: config.ttlSeconds * 1_000,
  };
}

interface SessionConfig extends SessionCookieConfig {
  secret: string;
  store: Store;
}

export function buildSessionOptions(config: SessionConfig): SessionOptions {
  return {
    name: 'lovarus.sid',
    secret: config.secret,
    resave: false,
    saveUninitialized: false,
    rolling: false,
    store: config.store,
    cookie: buildSessionCookieOptions(config),
  };
}
