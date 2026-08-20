import rows from '../fixtures/super-vip-rows.json';
import type { PublicData } from './api';
import { mapErpExport } from './erpExport';

export function loadLocalPublicData(): Promise<PublicData> {
  return Promise.resolve(mapErpExport(rows as unknown[][], {
    today: '2026-08-17',
    lastSyncAt: '2026-08-17T12:00:00.000Z',
  }));
}
