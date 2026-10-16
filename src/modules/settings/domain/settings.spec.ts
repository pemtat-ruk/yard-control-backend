import { mergeSettings, type Settings } from './settings.js';

const DEFAULTS: Settings = {
  transactionPrefix: 'YCS',
  qrTtlMinutes: 15,
  finePaymentDays: 7,
  notifyBeforeMinutes: 15,
  fineMultiplier: 2,
};

describe('system settings', () => {
  it('uses the defaults when nothing is saved', () => {
    expect(mergeSettings(DEFAULTS, [])).toEqual(DEFAULTS);
  });

  it('applies saved values over the defaults', () => {
    const merged = mergeSettings(DEFAULTS, [
      { key: 'transactionPrefix', value: 'YARD' },
      { key: 'qrTtlMinutes', value: '10' },
    ]);
    expect(merged).toEqual({
      ...DEFAULTS,
      transactionPrefix: 'YARD',
      qrTtlMinutes: 10,
    });
  });

  it('ignores unknown keys and values outside the allowed range', () => {
    const merged = mergeSettings(DEFAULTS, [
      { key: 'unknown', value: 'x' },
      { key: 'transactionPrefix', value: 'ycs-01' },
      { key: 'qrTtlMinutes', value: '0' },
      { key: 'finePaymentDays', value: '2.5' },
    ]);
    expect(merged).toEqual(DEFAULTS);
  });
});
