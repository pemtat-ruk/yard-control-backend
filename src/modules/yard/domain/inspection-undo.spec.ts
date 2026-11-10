import { checkInspectionUndo } from './inspection-undo.js';

const createdDate = new Date('2026-10-15T08:00:00Z');
const vacated = { inspectedBy: 'YD001', result: 'VACATED', createdDate };

describe('undo vehicle left', () => {
  it('lets the same inspector undo shortly after', () => {
    expect(
      checkInspectionUndo(vacated, 'YD001', new Date('2026-10-15T08:05:00Z')),
    ).toBeNull();
  });

  it('refuses another inspector', () => {
    expect(
      checkInspectionUndo(vacated, 'YD002', new Date('2026-10-15T08:01:00Z')),
    ).toBe('INSPECTION_UNDO_NOT_ALLOWED');
  });

  it('refuses after the undo window', () => {
    expect(
      checkInspectionUndo(vacated, 'YD001', new Date('2026-10-15T08:11:00Z')),
    ).toBe('INSPECTION_UNDO_EXPIRED');
  });
});
