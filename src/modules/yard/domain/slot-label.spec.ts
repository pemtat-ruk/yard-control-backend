import { compareSlotLabels, parseSlotLabel, slotLabel } from './slot-label.js';

describe('slot labels with the lot', () => {
  it('joins and splits lot and slot, even when the slot has a slash', () => {
    expect(slotLabel('PR', '14/7')).toBe('PR-14/7');
    expect(parseSlotLabel('PR-14/7')).toEqual({ lot: 'PR', code: '14/7' });
  });

  it('rejects a code without a lot', () => {
    expect(parseSlotLabel('12')).toBeNull();
    expect(parseSlotLabel('P5-')).toBeNull();
  });

  it('sorts slot numbers as numbers', () => {
    expect(['P5-10', 'P5-2', 'P5-1'].sort(compareSlotLabels)).toEqual([
      'P5-1',
      'P5-2',
      'P5-10',
    ]);
  });
});
