import {
  checkLayout,
  LAYOUT_MAX_ROWS,
  LAYOUT_SPAN_MAX,
  parseStoredLayout,
} from './layout-input.js';

const LOT_SLOTS = ['1', '2', '3', '4'];

const slotsRow = (codes: string[]) => ({
  kind: 'slots',
  facing: 'UP',
  cells: codes.map((slot) => ({ slot })),
});

describe('checking a layout drawn by an admin', () => {
  it('accepts rows of known slots with an aisle and a road label', () => {
    const result = checkLayout(
      {
        rows: [
          slotsRow(['1', '2']),
          { kind: 'aisle', label: 'ทางรถ' },
          {
            kind: 'slots',
            facing: 'DOWN',
            cells: [{ slot: '3' }, { label: 'ถนน', span: 2 }],
          },
        ],
      },
      LOT_SLOTS,
    );
    expect(result.ok).toBe(true);
  });

  it('allows leaving some slots out of the drawing', () => {
    expect(checkLayout({ rows: [slotsRow(['1'])] }, LOT_SLOTS).ok).toBe(true);
  });

  it('rejects a slot the lot does not have', () => {
    expect(checkLayout({ rows: [slotsRow(['1', '9'])] }, LOT_SLOTS)).toEqual({
      ok: false,
      problem: { kind: 'UNKNOWN_SLOT', slot: '9' },
    });
  });

  it('rejects the same slot placed twice', () => {
    expect(
      checkLayout({ rows: [slotsRow(['2']), slotsRow(['2'])] }, LOT_SLOTS),
    ).toEqual({ ok: false, problem: { kind: 'DUPLICATE_SLOT', slot: '2' } });
  });

  it('rejects a row whose facing is not up or down', () => {
    const row = { ...slotsRow(['1']), facing: 'LEFT' };
    expect(checkLayout({ rows: [row] }, LOT_SLOTS).ok).toBe(false);
  });

  it('rejects a label wider than the limit', () => {
    const row = {
      kind: 'slots',
      facing: 'UP',
      cells: [{ label: 'ถนน', span: LAYOUT_SPAN_MAX + 1 }],
    };
    expect(checkLayout({ rows: [row] }, LOT_SLOTS).ok).toBe(false);
  });

  it('rejects more rows than the limit', () => {
    const rows = Array.from({ length: LAYOUT_MAX_ROWS + 1 }, () => ({
      kind: 'aisle',
    }));
    expect(checkLayout({ rows }, LOT_SLOTS).ok).toBe(false);
  });
});

describe('adding new slots while arranging', () => {
  it('accepts a new slot placed in the layout', () => {
    const result = checkLayout({ rows: [slotsRow(['1', '5'])] }, LOT_SLOTS, [
      '5',
    ]);
    expect(result.ok).toBe(true);
  });

  it('rejects a new slot whose number the lot already has', () => {
    expect(checkLayout({ rows: [] }, LOT_SLOTS, ['3'])).toEqual({
      ok: false,
      problem: { kind: 'SLOT_TAKEN', slot: '3' },
    });
  });

  it('rejects the same new slot number twice', () => {
    expect(checkLayout({ rows: [] }, LOT_SLOTS, ['7', '7'])).toEqual({
      ok: false,
      problem: { kind: 'DUPLICATE_SLOT', slot: '7' },
    });
  });
});

describe('reading a stored layout', () => {
  it('returns nothing when no layout was saved', () => {
    expect(parseStoredLayout(null)).toBeNull();
  });

  it('falls back to nothing when the stored text is broken', () => {
    expect(parseStoredLayout('{"rows":[{"kind":"wall"}]}')).toBeNull();
    expect(parseStoredLayout('not json')).toBeNull();
  });

  it('reads back a saved layout', () => {
    const layout = { rows: [{ kind: 'aisle' }] };
    expect(parseStoredLayout(JSON.stringify(layout))).toEqual(layout);
  });
});
