import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

process.env.GITHUB_DISPATCH_TOKEN = 'test-gh-token';
process.env.GITHUB_REPO = 'owner/repo';
process.env.OUTAGE_REASON_TIMEOUT_MINUTES = '3';

import PendingOutage from '../../models/PendingOutage';
import {
  buildReasonText,
  flushPendingOutage,
  isOutageReasonEnabled,
  queueOfflineMessage,
  resolveOutageReason,
  restorePendingOutage,
} from '../../services/outageReasonService';

const fetch = vi.fn();
const sendMessage = vi.fn(async () => ({ ok: true }));
const deps = { fetchClient: fetch, sendMessageFn: sendMessage };

const OFFLINE_MESSAGE = '❌Світло вимкнули: <b>21.10.2026, 14:05</b>';
const EVENT_TIME = 1792588000;

describe('outageReasonService', () => {
  beforeAll(async () => {
    await PendingOutage.sync({ force: true });
  });

  beforeEach(async () => {
    await PendingOutage.destroy({ where: {} });
    fetch.mockReset();
    fetch.mockResolvedValue({ ok: true, status: 204 });
    sendMessage.mockClear();
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

    it('should add nothing when DTEK gives dates without reason', () => {
      const text = buildReasonText({
        status: 'found',
        subType: null,
        startDate: '14:05 21.10.2026',
        endDate: null,
      });

      expect(text).toBe('');
    });

    it('should report when DTEK has no outage for address', () => {
      expect(buildReasonText({ status: 'no_outage' })).toBe(
        'ℹ️ ДТЕК не повідомляє про відключення за цією адресою',
      );
    });

    it('should add nothing on scraper error', () => {
      expect(buildReasonText({ status: 'error', error: 'timeout' })).toBe('');
    });
  });

  it('should be enabled when token and repo are set', () => {
    expect(isOutageReasonEnabled()).toBe(true);
  });

  describe('queueOfflineMessage', () => {
    it('should store pending message and trigger GitHub dispatch', async () => {
      await queueOfflineMessage(OFFLINE_MESSAGE, EVENT_TIME, undefined, deps);

      const pending = await PendingOutage.findByPk(1);
      expect(pending.eventTime).toBe(EVENT_TIME);
      expect(pending.message).toBe(OFFLINE_MESSAGE);
      expect(sendMessage).not.toHaveBeenCalled();

      const [url, options] = fetch.mock.calls[0];
      expect(url).toBe('https://api.github.com/repos/owner/repo/dispatches');
      expect(options.headers.Authorization).toBe('Bearer test-gh-token');
      expect(JSON.parse(options.body)).toEqual({
        event_type: 'outage-reason',
        client_payload: { eventTime: EVENT_TIME },
      });
    });

    it('should send message immediately when dispatch fails', async () => {
      fetch.mockResolvedValueOnce({ ok: false, status: 401 });

      await queueOfflineMessage(OFFLINE_MESSAGE, EVENT_TIME, undefined, deps);

      expect(sendMessage).toHaveBeenCalledWith(OFFLINE_MESSAGE, undefined);
      expect((await PendingOutage.findByPk(1)).eventTime).toBeNull();
    });

    it('should flush previous pending message before queuing new one', async () => {
      await queueOfflineMessage('first', EVENT_TIME, undefined, deps);
      await queueOfflineMessage('second', EVENT_TIME + 60, undefined, deps);

      expect(sendMessage).toHaveBeenCalledTimes(1);
      expect(sendMessage).toHaveBeenCalledWith('first', undefined);
      expect((await PendingOutage.findByPk(1)).message).toBe('second');
    });

    it('should send message without reason after timeout', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

      await queueOfflineMessage(OFFLINE_MESSAGE, EVENT_TIME, undefined, deps);
      await vi.advanceTimersByTimeAsync(3 * 60 * 1000);
      await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledWith(OFFLINE_MESSAGE, undefined));
    });
  });

  describe('resolveOutageReason', () => {
    it('should send pending message with reason only once', async () => {
      await queueOfflineMessage(OFFLINE_MESSAGE, EVENT_TIME, undefined, deps);
      const result = { eventTime: EVENT_TIME, status: 'found', subType: 'Аварійне відключення' };

      const first = await resolveOutageReason(result, undefined, deps);
      const second = await resolveOutageReason(result, undefined, deps);

      expect(first).toBe(true);
      expect(second).toBe(false);
      expect(sendMessage).toHaveBeenCalledTimes(1);
      expect(sendMessage).toHaveBeenCalledWith(
        `${OFFLINE_MESSAGE}\n⚠️ Причина: <i>Аварійне відключення</i>`,
        undefined,
      );
    });

    it('should ignore callback for another event', async () => {
      await queueOfflineMessage(OFFLINE_MESSAGE, EVENT_TIME, undefined, deps);

      const applied = await resolveOutageReason({ eventTime: EVENT_TIME - 1, status: 'found' }, undefined, deps);

      expect(applied).toBe(false);
      expect(sendMessage).not.toHaveBeenCalled();
    });

    it('should send plain message on scraper error', async () => {
      await queueOfflineMessage(OFFLINE_MESSAGE, EVENT_TIME, undefined, deps);

      await resolveOutageReason({ eventTime: EVENT_TIME, status: 'error', error: 'blocked' }, undefined, deps);

      expect(sendMessage).toHaveBeenCalledWith(OFFLINE_MESSAGE, undefined);
    });

    it('should not send after message was already flushed by online event', async () => {
      await queueOfflineMessage(OFFLINE_MESSAGE, EVENT_TIME, undefined, deps);
      await flushPendingOutage(undefined, deps);

      const applied = await resolveOutageReason({ eventTime: EVENT_TIME, status: 'found' }, undefined, deps);

      expect(applied).toBe(false);
      expect(sendMessage).toHaveBeenCalledTimes(1);
    });
  });

  describe('restorePendingOutage', () => {
    it('should send message when deadline already passed', async () => {
      await PendingOutage.create({
        id: 1,
        eventTime: EVENT_TIME,
        message: OFFLINE_MESSAGE,
        deadlineAt: Math.floor(Date.now() / 1000) - 10,
      });

      await restorePendingOutage(undefined, deps);

      expect(sendMessage).toHaveBeenCalledWith(OFFLINE_MESSAGE, undefined);
    });

    it('should keep waiting when deadline is in future', async () => {
      await PendingOutage.create({
        id: 1,
        eventTime: EVENT_TIME,
        message: OFFLINE_MESSAGE,
        deadlineAt: Math.floor(Date.now() / 1000) + 120,
      });

      await restorePendingOutage(undefined, deps);

      expect(sendMessage).not.toHaveBeenCalled();
      expect((await PendingOutage.findByPk(1)).eventTime).toBe(EVENT_TIME);
    });
  });
});
