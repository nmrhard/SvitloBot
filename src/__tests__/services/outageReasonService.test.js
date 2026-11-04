import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

process.env.GITHUB_DISPATCH_TOKEN = 'test-gh-token';
process.env.GITHUB_REPO = 'owner/repo';

import OutageReasonLookup from '../../models/OutageReasonLookup';
import {
  buildReasonText,
  isOutageReasonEnabled,
  resolveOutageReason,
  restoreReasonLookup,
  runReasonCheck,
  startReasonLookup,
  stopReasonLookup,
} from '../../services/outageReasonService';

const fetch = vi.fn();
const editMessage = vi.fn(async () => ({ ok: true }));

const OFFLINE_MESSAGE = '❌Світло вимкнули: <b>21.10.2026, 14:05</b>';
const EVENT_TIME = 1792588000;
const MESSAGE_ID = 42;

function nowInSeconds() {
  return Math.floor(Date.now() / 1000);
}

async function createLookup(overrides = {}) {
  return OutageReasonLookup.create({
    id: 1,
    eventTime: EVENT_TIME,
    messageId: MESSAGE_ID,
    message: OFFLINE_MESSAGE,
    nextCheckAt: nowInSeconds() + 600,
    deadlineAt: nowInSeconds() + 3600,
    ...overrides,
  });
}

describe('outageReasonService', () => {
  beforeAll(async () => {
    await OutageReasonLookup.sync({ force: true });
  });

  beforeEach(async () => {
    await stopReasonLookup();
    await OutageReasonLookup.destroy({ where: {} });
    fetch.mockReset();
    fetch.mockResolvedValue({ ok: true, status: 204 });
    editMessage.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('buildReasonText', () => {
    it('should format reason', () => {
      const text = buildReasonText({
        status: 'found',
        subType: 'аварійне відключення',
        startDate: '14:05 21.10.2026',
        endDate: '18:00 21.10.2026',
      });

      expect(text).toBe('⚠️ Причина: <i>Аварійне відключення</i>');
    });

    it('should escape HTML from DTEK text', () => {
      const text = buildReasonText({ status: 'found', subType: '<b>x</b> & y' });

      expect(text).toBe('⚠️ Причина: <i>&lt;b&gt;x&lt;/b&gt; &amp; y</i>');
    });

    it('should add nothing when DTEK has no reason yet', () => {
      expect(buildReasonText({ status: 'found', subType: null, startDate: '14:05 21.10.2026' })).toBe('');
      expect(buildReasonText({ status: 'no_outage' })).toBe('');
      expect(buildReasonText({ status: 'error', error: 'timeout' })).toBe('');
    });
  });

  it('should be enabled when token and repo are set', () => {
    expect(isOutageReasonEnabled()).toBe(true);
  });

  describe('startReasonLookup', () => {
    it('should store sent message and trigger GitHub dispatch', async () => {
      await startReasonLookup(OFFLINE_MESSAGE, EVENT_TIME, MESSAGE_ID, undefined, { fetchClient: fetch });

      const lookup = await OutageReasonLookup.findByPk(1);
      expect(lookup.eventTime).toBe(EVENT_TIME);
      expect(lookup.messageId).toBe(MESSAGE_ID);
      expect(lookup.deadlineAt - lookup.nextCheckAt).toBe(3600 - 600);

      const [url, options] = fetch.mock.calls[0];
      expect(url).toBe('https://api.github.com/repos/owner/repo/dispatches');
      expect(options.headers.Authorization).toBe('Bearer test-gh-token');
      expect(JSON.parse(options.body)).toEqual({
        event_type: 'outage-reason',
        client_payload: { eventTime: EVENT_TIME },
      });
    });

    it('should skip lookup when offline message was not sent', async () => {
      await startReasonLookup(OFFLINE_MESSAGE, EVENT_TIME, undefined, undefined, { fetchClient: fetch });

      expect(fetch).not.toHaveBeenCalled();
      expect(await OutageReasonLookup.findByPk(1)).toBeNull();
    });

    it('should keep lookup active when dispatch fails', async () => {
      fetch.mockResolvedValueOnce({ ok: false, status: 401 });

      await startReasonLookup(OFFLINE_MESSAGE, EVENT_TIME, MESSAGE_ID, undefined, { fetchClient: fetch });

      expect((await OutageReasonLookup.findByPk(1)).eventTime).toBe(EVENT_TIME);
    });

    it('should rerun scraper after check interval', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

      await startReasonLookup(OFFLINE_MESSAGE, EVENT_TIME, MESSAGE_ID, undefined, { fetchClient: fetch });
      await vi.advanceTimersByTimeAsync(10 * 60 * 1000);

      await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    });
  });

  describe('runReasonCheck', () => {
    it('should stop lookup after deadline', async () => {
      await createLookup({ deadlineAt: nowInSeconds() - 1 });

      await runReasonCheck(undefined, { fetchClient: fetch });

      expect(fetch).not.toHaveBeenCalled();
      expect((await OutageReasonLookup.findByPk(1)).eventTime).toBeNull();
    });
  });

  describe('resolveOutageReason', () => {
    it('should edit sent message with reason only once', async () => {
      await createLookup();
      const result = { eventTime: EVENT_TIME, status: 'found', subType: 'Аварійне відключення' };

      const first = await resolveOutageReason(result, undefined, { editMessageFn: editMessage });
      const second = await resolveOutageReason(result, undefined, { editMessageFn: editMessage });

      expect(first).toBe(true);
      expect(second).toBe(false);
      expect(editMessage).toHaveBeenCalledTimes(1);
      expect(editMessage).toHaveBeenCalledWith(
        MESSAGE_ID,
        `${OFFLINE_MESSAGE}\n⚠️ Причина: <i>Аварійне відключення</i>`,
        undefined,
      );
      expect((await OutageReasonLookup.findByPk(1)).eventTime).toBeNull();
    });

    it('should keep polling when DTEK has no reason yet', async () => {
      await createLookup();

      const applied = await resolveOutageReason(
        { eventTime: EVENT_TIME, status: 'no_outage' },
        undefined,
        { editMessageFn: editMessage },
      );

      expect(applied).toBe(false);
      expect(editMessage).not.toHaveBeenCalled();
      expect((await OutageReasonLookup.findByPk(1)).eventTime).toBe(EVENT_TIME);
    });

    it('should ignore callback for another event', async () => {
      await createLookup();

      const applied = await resolveOutageReason(
        { eventTime: EVENT_TIME - 1, status: 'found', subType: 'Аварійне' },
        undefined,
        { editMessageFn: editMessage },
      );

      expect(applied).toBe(false);
      expect(editMessage).not.toHaveBeenCalled();
    });

    it('should not edit after light is back', async () => {
      await createLookup();
      await stopReasonLookup();

      const applied = await resolveOutageReason(
        { eventTime: EVENT_TIME, status: 'found', subType: 'Аварійне' },
        undefined,
        { editMessageFn: editMessage },
      );

      expect(applied).toBe(false);
      expect(editMessage).not.toHaveBeenCalled();
    });
  });

  describe('restoreReasonLookup', () => {
    it('should run check immediately when it is overdue', async () => {
      await createLookup({ nextCheckAt: nowInSeconds() - 10 });

      await restoreReasonLookup(undefined, { fetchClient: fetch });

      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('should wait for scheduled check', async () => {
      await createLookup();

      await restoreReasonLookup(undefined, { fetchClient: fetch });

      expect(fetch).not.toHaveBeenCalled();
      expect((await OutageReasonLookup.findByPk(1)).eventTime).toBe(EVENT_TIME);
    });
  });
});
