import { describe, expect, it } from 'vitest';
import {
  afterFailedLogin,
  isLocked,
  LOCK_MINUTES,
  MAX_FAILED_LOGINS,
} from './login-lockout.js';

const NOW = new Date('2026-11-02T03:00:00.000Z');
const minutesLater = (minutes: number) =>
  new Date(NOW.getTime() + minutes * 60_000);

describe('login lockout', () => {
  it('counts wrong passwords and locks on the last allowed attempt', () => {
    let state = { failedLogins: 0, lockedUntil: null as Date | null };
    for (let i = 1; i < MAX_FAILED_LOGINS; i++) {
      state = afterFailedLogin(state, NOW);
      expect(state).toEqual({ failedLogins: i, lockedUntil: null });
    }
    state = afterFailedLogin(state, NOW);
    expect(state.lockedUntil).toEqual(minutesLater(LOCK_MINUTES));
    expect(isLocked(state, minutesLater(LOCK_MINUTES - 1))).toBe(true);
    expect(isLocked(state, minutesLater(LOCK_MINUTES))).toBe(false);
  });

  it('starts counting again once an old lock has expired', () => {
    const expired = { failedLogins: 0, lockedUntil: minutesLater(-1) };
    expect(afterFailedLogin(expired, NOW)).toEqual({
      failedLogins: 1,
      lockedUntil: null,
    });
  });
});
