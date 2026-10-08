import { describe, expect, it } from 'vitest';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('devuelve estado ok con timestamp', () => {
    const controller = new HealthController();
    const result = controller.getHealth();

    expect(result.status).toBe('ok');
    expect(result.service).toBe('odontologia-api');
    expect(Number.isNaN(Date.parse(result.timestamp))).toBe(false);
  });
});
