const { chromium } = require('playwright');

const { getShutdownsPage, parseHouseInfo } = require('./parse');

const {
  REGION,
  CITY,
  STREET,
  HOUSE,
  EVENT_TIME,
  CALLBACK_URL,
  CALLBACK_API_KEY,
} = process.env;

const RETRIES_MAX_COUNT = 2;
const RETRIES_TIMEOUT = 5000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Load DTEK shutdowns page in a real browser (site is behind Incapsula)
 * and request outage info for the configured street.
 * @returns {Promise<object>} DTEK `getHomeNum` JSON
 */
async function fetchDtekInfo() {
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage();
    await page.goto(getShutdownsPage(REGION), { waitUntil: 'load' });

    const csrfTag = await page.waitForSelector('meta[name="csrf-token"]', {
      state: 'attached',
    });
    const csrfToken = await csrfTag.getAttribute('content');

    return await page.evaluate(
      async ({ region, city, street, token }) => {
        const formData = new URLSearchParams();
        formData.append('method', 'getHomeNum');

        if (region !== 'k') {
          formData.append('data[0][name]', 'city');
          formData.append('data[0][value]', city);
        }

        formData.append('data[1][name]', 'street');
        formData.append('data[1][value]', street);
        formData.append('data[2][name]', 'updateFact');
        formData.append('data[2][value]', new Date().toLocaleString('uk-UA'));

        const response = await fetch('/ua/ajax', {
          method: 'POST',
          headers: {
            'x-requested-with': 'XMLHttpRequest',
            'x-csrf-token': token,
          },
          body: formData,
        });
        return response.json();
      },
      { region: String(REGION).toLowerCase(), city: CITY, street: STREET, token: csrfToken },
    );
  } finally {
    await browser.close();
  }
}

async function fetchDtekInfoWithRetry() {
  for (let attempt = 0; ; attempt += 1) {
    try {
      const info = await fetchDtekInfo();
      if (!info?.data) throw new Error('outage info missing in response');
      return info;
    } catch (error) {
      console.error(`DTEK request failed (attempt ${attempt + 1}): ${error.message}`);
      if (attempt >= RETRIES_MAX_COUNT) throw error;
      await sleep(RETRIES_TIMEOUT);
    }
  }
}

async function sendCallback(payload) {
  const response = await fetch(CALLBACK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': CALLBACK_API_KEY,
    },
    body: JSON.stringify({ eventTime: Number(EVENT_TIME), ...payload }),
  });

  console.log(`Callback responded ${response.status}: ${await response.text()}`);
  if (!response.ok) throw new Error(`Callback failed with status ${response.status}`);
}

async function run() {
  const missing = Object.entries({ EVENT_TIME, CALLBACK_URL, CALLBACK_API_KEY, STREET, HOUSE })
    .filter(([, value]) => !value)
    .map(([name]) => name);
  if (missing.length) {
    throw new Error(`Missing env: ${missing.join(', ')}`);
  }

  let payload;
  try {
    const info = await fetchDtekInfoWithRetry();
    payload = parseHouseInfo(info, HOUSE);
  } catch (error) {
    payload = { status: 'error', error: error.message };
  }

  console.log('Outage info:', JSON.stringify(payload));
  // Always report back so the bot does not wait for the full timeout
  await sendCallback(payload);
}

run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
