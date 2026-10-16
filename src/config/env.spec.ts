import { loadEnv } from './env.js';

describe('environment', () => {
  it('falls back to development defaults when nothing is set', () => {
    const env = loadEnv({});
    expect(env.port).toBe(4000);
    expect(env.webOrigins).toEqual(['http://localhost:3000']);
    expect(env.isProduction).toBe(false);
  });

  it('treats an empty value as not set', () => {
    expect(loadEnv({ PORT: '' }).port).toBe(4000);
  });

  it('accepts several comma-separated origins', () => {
    const env = loadEnv({ WEB_ORIGIN: 'https://a.example, https://b.example' });
    expect(env.webOrigins).toEqual(['https://a.example', 'https://b.example']);
  });

  it('refuses to start with malformed values, listing every problem', () => {
    const load = () =>
      loadEnv({ PORT: 'abc', RATE_LIMIT_MAX: '0', LOG_LEVEL: 'loud' });
    expect(load).toThrow(/PORT/);
    expect(load).toThrow(/RATE_LIMIT_MAX/);
    expect(load).toThrow(/LOG_LEVEL/);
  });

  it('refuses a wildcard origin because the API sends credentials', () => {
    expect(() => loadEnv({ WEB_ORIGIN: '*' })).toThrow(/WEB_ORIGIN/);
  });

  it('requires explicit origin and database in production', () => {
    expect(() => loadEnv({ NODE_ENV: 'production' })).toThrow(
      /WEB_ORIGIN is required[\s\S]*DATABASE_URL is required/,
    );
    expect(() =>
      loadEnv({
        NODE_ENV: 'production',
        WEB_ORIGIN: 'https://ycs.example',
        DATABASE_URL: 'postgresql://user:pass@db:5432/ycs',
        AUTH_SECRET: 'a-production-secret-of-at-least-32-chars',
      }),
    ).not.toThrow();
  });

  it('keeps logs quiet while tests run', () => {
    expect(loadEnv({ NODE_ENV: 'test' }).logLevel).toBe('silent');
  });

  it('refuses a session secret that is too short to be safe', () => {
    expect(() => loadEnv({ AUTH_SECRET: 'short' })).toThrow(/AUTH_SECRET/);
  });
});
