import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createDailyState,
  extractGroupDataForTargetDate,
  getDelayToNextRun,
  processWindowCheck,
} from '../../services/dailyImageScheduler';

const KYIV_TOMORROW_EPOCH = '1771538400';

function buildScheduleJson(groupData) {
  if (!groupData) {
    return { fact: { data: {} } };
  }

  return {
    fact: {
      data: {
        [KYIV_TOMORROW_EPOCH]: {
          'GPV5.1': groupData,
        },
      },
    },
  };
}

describe('dailyImageScheduler', () => {
  const fetchMock = vi.fn();
  const sendMessageMock = vi.fn();
  const sendPhotoMock = vi.fn();
  const logger = {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  };

  beforeEach(() => {
    fetchMock.mockReset();
    sendMessageMock.mockReset();
    sendPhotoMock.mockReset();
    logger.error.mockReset();
    logger.info.mockReset();
    logger.warn.mockReset();

    sendPhotoMock.mockResolvedValue({ ok: true, result: { message_id: 1 } });
    sendMessageMock.mockResolvedValue({ ok: true, result: { message_id: 2 } });
  });

  it('should extract group data for target date', () => {
    // Arrange
    const scheduleJson = buildScheduleJson({ 1: 'yes' });

    // Act
    const result = extractGroupDataForTargetDate(scheduleJson, '2026-02-20');

    // Assert
    expect(result).toEqual({ 1: 'yes' });
  });

  it('should send initial graph when tomorrow data appears', async () => {
    // Arrange
    const state = createDailyState();
    fetchMock.mockResolvedValue({
      json: vi.fn(() => Promise.resolve(buildScheduleJson({ 1: 'yes' }))),
      ok: true,
    });

    // Act
    await processWindowCheck(logger, state, {
      fetchClient: fetchMock,
      now: new Date('2026-02-19T18:00:00Z'),
      sendMessageFn: sendMessageMock,
      sendPhotoFn: sendPhotoMock,
    });

    // Assert
    expect(sendPhotoMock).toHaveBeenCalledTimes(1);
    expect(sendPhotoMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('Графік відключень на 20.02.2026 сформовано'),
      logger,
      { threadId: undefined },
    );
    expect(state.hasSentInitial).toBe(true);
    expect(state.lastSentHash).toBeTruthy();
    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  it('should not resend graph when JSON has no changes', async () => {
    // Arrange
    const state = createDailyState();
    const scheduleJson = buildScheduleJson({ 1: 'yes', 2: 'no' });
    fetchMock.mockResolvedValue({
      json: vi.fn(() => Promise.resolve(scheduleJson)),
      ok: true,
    });

    // Act
    await processWindowCheck(logger, state, {
      fetchClient: fetchMock,
      now: new Date('2026-02-19T18:00:00Z'),
      sendMessageFn: sendMessageMock,
      sendPhotoFn: sendPhotoMock,
    });
    await processWindowCheck(logger, state, {
      fetchClient: fetchMock,
      now: new Date('2026-02-19T18:30:00Z'),
      sendMessageFn: sendMessageMock,
      sendPhotoFn: sendPhotoMock,
    });

    // Assert
    expect(sendPhotoMock).toHaveBeenCalledTimes(1);
    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  it('should send updated graph when hash changes', async () => {
    // Arrange
    const state = createDailyState();
    fetchMock
      .mockResolvedValueOnce({
        json: vi.fn(() => Promise.resolve(buildScheduleJson({ 1: 'yes' }))),
        ok: true,
      })
      .mockResolvedValueOnce({
        json: vi.fn(() => Promise.resolve(buildScheduleJson({ 1: 'no' }))),
        ok: true,
      });

    // Act
    await processWindowCheck(logger, state, {
      fetchClient: fetchMock,
      now: new Date('2026-02-19T18:00:00Z'),
      sendMessageFn: sendMessageMock,
      sendPhotoFn: sendPhotoMock,
    });
    await processWindowCheck(logger, state, {
      fetchClient: fetchMock,
      now: new Date('2026-02-19T18:30:00Z'),
      sendMessageFn: sendMessageMock,
      sendPhotoFn: sendPhotoMock,
    });

    // Assert
    expect(sendPhotoMock).toHaveBeenCalledTimes(2);
    expect(sendPhotoMock.mock.calls[1][1]).toContain('оновлено');
  });

  it('should send missing notice at final check when tomorrow data absent', async () => {
    // Arrange
    const state = createDailyState();
    fetchMock.mockResolvedValue({
      json: vi.fn(() => Promise.resolve(buildScheduleJson(null))),
      ok: true,
    });

    // Act
    await processWindowCheck(logger, state, {
      fetchClient: fetchMock,
      now: new Date('2026-02-19T22:00:00Z'),
      sendMessageFn: sendMessageMock,
      sendPhotoFn: sendPhotoMock,
    });

    // Assert
    expect(sendPhotoMock).not.toHaveBeenCalled();
    expect(sendMessageMock).toHaveBeenCalledTimes(1);
    expect(sendMessageMock).toHaveBeenCalledWith(
      expect.stringContaining('Графік відключень на 20.02.2026 відсутній'),
      logger,
      { threadId: undefined },
    );
  });

  it('should calculate delay to next start run', () => {
    // Arrange
    const now = new Date('2026-02-19T17:45:00Z');

    // Act
    const delay = getDelayToNextRun(now, 20, 0, 'UTC');

    // Assert
    expect(delay).toBe(2 * 60 * 60 * 1000 + 15 * 60 * 1000);
  });
});
