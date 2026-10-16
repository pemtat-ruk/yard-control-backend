import { resolveRequestId } from './http-logger.js';

describe('request id', () => {
  it('keeps a well-formed id sent by the client', () => {
    expect(resolveRequestId('web-123_abc')).toBe('web-123_abc');
  });

  it('replaces a missing or unsafe id with a generated one', () => {
    const uuid = /^[0-9a-f-]{36}$/;
    expect(resolveRequestId(undefined)).toMatch(uuid);
    expect(resolveRequestId('bad id\n{"level":50}')).toMatch(uuid);
    expect(resolveRequestId(['a', 'b'])).toMatch(uuid);
  });
});
