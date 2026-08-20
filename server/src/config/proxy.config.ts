export type TrustProxySetting = false | 'loopback';

export function parseTrustProxy(value: unknown): TrustProxySetting {
  if (value === undefined || value === '' || value === false || value === 'false') {
    return false;
  }
  if (value === 'loopback') {
    return 'loopback';
  }
  throw new Error('TRUST_PROXY must be "false" or "loopback"');
}
