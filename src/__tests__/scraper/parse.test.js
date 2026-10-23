import { describe, expect, it } from 'vitest';

import { getShutdownsPage, parseHouseInfo } from '../../../scraper/parse';

describe('scraper/parse', () => {
  it('should return reason fields for house with outage', () => {
    const info = {
      data: {
        '12': {
          sub_type: ' Аварійні ремонтні роботи ',
          start_date: '14:05 21.10.2026',
          end_date: '18:00 21.10.2026',
          type: '2',
        },
      },
    };

    expect(parseHouseInfo(info, '12')).toEqual({
      status: 'found',
      subType: 'Аварійні ремонтні роботи',
      startDate: '14:05 21.10.2026',
      endDate: '18:00 21.10.2026',
    });
  });

  it('should report no outage when all fields are empty', () => {
    const info = { data: { '12': { sub_type: '', start_date: '', end_date: '', type: '' } } };

    expect(parseHouseInfo(info, '12')).toEqual({
      status: 'no_outage',
      subType: null,
      startDate: null,
      endDate: null,
    });
  });

  it('should report error when house is missing', () => {
    expect(parseHouseInfo({ data: {} }, '12')).toEqual({
      status: 'error',
      error: 'house 12 not found',
    });
  });

  it('should pick shutdowns page by region with Kyiv region fallback', () => {
    expect(getShutdownsPage('K')).toBe('https://www.dtek-kem.com.ua/ua/shutdowns');
    expect(getShutdownsPage(undefined)).toBe('https://www.dtek-krem.com.ua/ua/shutdowns');
  });
});
