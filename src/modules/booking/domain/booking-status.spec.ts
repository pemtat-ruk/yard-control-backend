import {
  bookingNoOfTicket,
  bookingStatusOf,
  cancelReasonOf,
  ticketNoFor,
} from './booking-status.js';

describe('booking status from SA codes', () => {
  const today = '2026-11-10';

  it('waits for payment until the first installment is paid', () => {
    expect(
      bookingStatusOf(
        { bookingStatus: 'A', paymentStatus: 'W', bookingChannel: 'N' },
        today,
        today,
      ),
    ).toBe('PENDING_PAYMENT');
  });

  it('confirms imported bookings without a first payment', () => {
    expect(
      bookingStatusOf(
        { bookingStatus: 'A', paymentStatus: 'W', bookingChannel: 'I' },
        today,
        today,
      ),
    ).toBe('CONFIRMED');
  });

  it('is confirmed when paid and completed after the last day', () => {
    const paid = {
      bookingStatus: 'A',
      paymentStatus: 'P',
      bookingChannel: 'N',
    };
    expect(bookingStatusOf(paid, today, today)).toBe('CONFIRMED');
    expect(bookingStatusOf(paid, '2026-11-09', today)).toBe('COMPLETED');
  });

  it('tells why a booking was cancelled', () => {
    const expired = {
      bookingStatus: 'C',
      paymentStatus: 'C',
      bookingChannel: 'N',
    };
    const overdue = {
      bookingStatus: 'C',
      paymentStatus: 'O',
      bookingChannel: 'N',
    };
    expect(bookingStatusOf(expired, today, today)).toBe('CANCELLED');
    expect(cancelReasonOf(expired)).toBe('PAYMENT_EXPIRED');
    expect(cancelReasonOf(overdue)).toBe('DAILY_PAYMENT_OVERDUE');
    expect(cancelReasonOf({ bookingStatus: 'A', paymentStatus: 'P' })).toBe(
      null,
    );
  });
});

describe('ticket number', () => {
  it('reads the booking number back from a ticket', () => {
    const ticketNo = ticketNoFor('BK2026-11-0001', '2026-11-10');
    expect(ticketNo).toBe('TK202611000120261110');
    expect(bookingNoOfTicket(ticketNo)).toBe('BK2026-11-0001');
    expect(bookingNoOfTicket('BK2026-11-0001')).toBeNull();
  });
});
