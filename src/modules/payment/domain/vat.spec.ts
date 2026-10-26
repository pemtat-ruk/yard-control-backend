import { vatIncluded } from './vat.js';

describe('VAT included in the price', () => {
  it('splits 107 baht into 100 before VAT and 7 VAT', () => {
    expect(vatIncluded(107)).toEqual({
      ratePercent: 7,
      beforeVat: 100,
      vat: 7,
    });
  });

  it('rounds the VAT to satang and keeps both parts adding up to the total', () => {
    const result = vatIncluded(100);
    expect(result.vat).toBe(6.54);
    expect(result.beforeVat).toBe(93.46);
    expect(result.beforeVat + result.vat).toBeCloseTo(100, 2);
  });

  it('has no VAT on a zero amount', () => {
    expect(vatIncluded(0)).toEqual({ ratePercent: 7, beforeVat: 0, vat: 0 });
  });
});
