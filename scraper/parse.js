/**
 * Pure helpers for DTEK `getHomeNum` responses (no Playwright here, so they are testable).
 * Request format is based on https://github.com/mr-devboy/dtek-monitor (MIT).
 */

const shutdownsPages = {
  k: 'https://www.dtek-kem.com.ua/ua/shutdowns',
  kr: 'https://www.dtek-krem.com.ua/ua/shutdowns',
  dn: 'https://www.dtek-dnem.com.ua/ua/shutdowns',
  o: 'https://www.dtek-oem.com.ua/ua/shutdowns',
  d: 'https://www.dtek-dem.com.ua/ua/shutdowns',
};

function getShutdownsPage(region) {
  return shutdownsPages[String(region).toLowerCase()] ?? shutdownsPages.kr;
}

function clean(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * Convert DTEK response into callback payload fields
 * @param {object} info - DTEK `getHomeNum` JSON
 * @param {string} house - House number key
 * @returns {object} { status, subType, startDate, endDate, error }
 */
function parseHouseInfo(info, house) {
  const record = info?.data?.[house];
  if (!record) {
    return { status: 'error', error: `house ${house} not found` };
  }

  const subType = clean(record.sub_type);
  const startDate = clean(record.start_date);
  const endDate = clean(record.end_date);
  const type = clean(record.type);

  if (!subType && !startDate && !endDate && !type) {
    return { status: 'no_outage', subType: null, startDate: null, endDate: null };
  }

  return { status: 'found', subType, startDate, endDate };
}

module.exports = {
  getShutdownsPage,
  parseHouseInfo,
};
