import { fromDueColumns, toDueColumns } from './due.js';

describe('due date and time columns', () => {
  it('stores the Thai date and time and reads the same instant back', () => {
    // 2026-11-10 00:00 เวลาไทย
    const instant = new Date('2026-11-09T17:00:00Z');
    const columns = toDueColumns(instant);
    expect(columns.dueDate.toISOString().slice(0, 10)).toBe('2026-11-10');
    expect(columns.dueTime.toISOString().slice(11, 19)).toBe('00:00:00');
    expect(fromDueColumns(columns.dueDate, columns.dueTime)).toEqual(instant);
  });
});
