import { paymentState } from './payment-state.js';

describe('report payment state', () => {
  it('counts a cancelled booking as cancelled even with unpaid days', () => {
    expect(paymentState('CANCELLED', 3)).toBe('CANCELLED');
  });

  it('counts a booking that was never paid as pending', () => {
    expect(paymentState('PENDING_PAYMENT', 1)).toBe('PENDING');
  });

  it('counts a confirmed day-by-day booking with days left to pay as pending', () => {
    expect(paymentState('CONFIRMED', 29)).toBe('PENDING');
  });

  it('counts a booking with every day paid as paid', () => {
    expect(paymentState('CONFIRMED', 0)).toBe('PAID');
    expect(paymentState('COMPLETED', 0)).toBe('PAID');
  });
});
