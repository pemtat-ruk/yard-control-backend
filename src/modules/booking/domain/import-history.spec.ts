import { parseImportDetail } from './import-history.js';

describe('import history detail', () => {
  it('reads the file name and booking numbers of an import', () => {
    expect(
      parseImportDetail({
        count: 2,
        bookingNos: ['BK1', 'BK2'],
        fileName: 'regular.csv',
      }),
    ).toEqual({ fileName: 'regular.csv', bookingNos: ['BK1', 'BK2'] });
  });

  it('treats imports recorded before file names were kept as unnamed', () => {
    expect(parseImportDetail({ count: 1, bookingNos: ['BK1'] })).toEqual({
      fileName: null,
      bookingNos: ['BK1'],
    });
  });

  it('ignores malformed detail instead of failing the whole list', () => {
    expect(parseImportDetail(null)).toEqual({ fileName: null, bookingNos: [] });
    expect(parseImportDetail(['x'])).toEqual({
      fileName: null,
      bookingNos: [],
    });
    expect(
      parseImportDetail({ bookingNos: ['BK1', 7], fileName: '  ' }),
    ).toEqual({ fileName: null, bookingNos: ['BK1'] });
  });
});
