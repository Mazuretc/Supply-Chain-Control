import { doubleCsrf } from 'csrf-csrf';
import type { Request } from 'express';

export const CSRF_UTILITIES = Symbol('CSRF_UTILITIES');

export function createCsrfUtilities(secret: string, production: boolean) {
  return doubleCsrf({
    getSecret: () => secret,
    getSessionIdentifier: (request: Request) => request.sessionID,
    cookieName: production
      ? '__Host-lovarus.csrf'
      : 'lovarus.csrf',
    cookieOptions: {
      httpOnly: true,
      sameSite: 'strict',
      secure: production,
      path: '/',
    },
    getCsrfTokenFromRequest: (request: Request) => {
      const token = request.headers['x-csrf-token'];
      return typeof token === 'string' ? token : undefined;
    },
  });
}

export type CsrfUtilities = ReturnType<typeof createCsrfUtilities>;
