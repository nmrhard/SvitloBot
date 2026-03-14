import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildGroupHash,
  createDailyState,
  extractGroupDataForTargetDate,
  extractTomorrowEpoch,
  extractTomorrowGroupData,
  getDelayToNextRun,
  hasNonYesValues,
  isJsonFresh,
  processWindowCheck,
  validateGroupData,
} from '../../services/dailyImageScheduler';

const KYIV_TODAY_EPOCH = '1771452000';
const KYIV_TOMORROW_EPOCH = '1771538400';

function buildFullGroupData(value = 'yes') {
  const groupData = {};
  for (let hour = 1; hour <= 24; hour += 1) {
    groupData[String(hour)] = value;
  }
  return groupData;
}

function buildGroupDataWithOutage() {
  const groupData = buildFullGroupData('yes');
  groupData['10'] = 'no';
  return groupData;
}

function buildScheduleJson(
  tomorrowGroupData,
  lastUpdated = '2026-02-19T17:40:00.000Z',
  todayGroupData = buildFullGroupData('yes'),
) {
  return {
    fact: {
      data: {
        [KYIV_TODAY_EPOCH]: {
          ...(todayGroupData ? { 'GPV5.1': todayGroupData } : {}),
        },
        [KYIV_TOMORROW_EPOCH]: {
          ...(tomorrowGroupData ? { 'GPV5.1': tomorrowGroupData } : {}),
        },
      },
      today: Number(KYIV_TODAY_EPOCH),
    },
    lastUpdated,
  };
}

describe('dailyImageScheduler', () => {
  const fetchMock = vi.fn();
  const fetchPngBinaryMock = vi.fn();
  const sendMessageMock = vi.fn();
  const sendPhotoMock = vi.fn();
  const logger = {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  };

  beforeEach(() => {
    fetchMock.mockReset();
    fetchPngBinaryMock.mockReset();
    sendMessageMock.mockReset();
    sendPhotoMock.mockReset();
    logger.error.mockReset();
    logger.info.mockReset();
    logger.warn.mockReset();

    sendPhotoMock.mockResolvedValue({ ok: true, result: { message_id: 1 } });
    sendMessageMock.mockResolvedValue({ ok: true, result: { message_id: 2 } });
    fetchPngBinaryMock.mockResolvedValue({
      contentType: 'image/png',
      fileName: 'gpv-5-1-emergency.png',
      photoBuffer: Buffer.from('png-bytes'),
    });
  });

  it('should extract group data for target date', () => {
    // Arrange
    const scheduleJson = buildScheduleJson(buildFullGroupData());

    // Act
    const result = extractGroupDataForTargetDate(
      scheduleJson,
      '2026-02-20',
      'GPV5.1',
      'Europe/Kyiv',
    );

    // Assert
    expect(result).toEqual(buildFullGroupData());
  });

  it('should extract tomorrow epoch from fact.today', () => {
    // Arrange
    const scheduleJson = buildScheduleJson(buildFullGroupData());

    // Act
    const result = extractTomorrowEpoch(scheduleJson);

    // Assert
    expect(result).toBe(Number(KYIV_TOMORROW_EPOCH));
  });

  it('should extract tomorrow group data using next epoch logic', () => {
    // Arrange
    const scheduleJson = buildScheduleJson(buildGroupDataWithOutage());

    // Act
    const result = extractTomorrowGroupData(scheduleJson, 'GPV5.1', 'Europe/Kyiv');

    // Assert
    expect(result).toBeTruthy();
    expect(result.targetEpoch).toBe(Number(KYIV_TOMORROW_EPOCH));
    expect(result.groupData).toEqual(buildGroupDataWithOutage());
  });

  it('should send initial graph when tomorrow data appears', async () => {
    // Arrange
    const state = createDailyState();
    fetchMock.mockResolvedValue({
      json: vi.fn(() => Promise.resolve(buildScheduleJson(buildGroupDataWithOutage()))),
      ok: true,
    });

    // Act
    await processWindowCheck(logger, state, {
      fetchClient: fetchMock,
      fetchPngBinaryFn: fetchPngBinaryMock,
      now: new Date('2026-02-19T18:00:00Z'),
      sendMessageFn: sendMessageMock,
      sendPhotoFn: sendPhotoMock,
    });

    // Assert
    expect(sendPhotoMock).toHaveBeenCalledTimes(1);
    expect(sendPhotoMock).toHaveBeenCalledWith(
      expect.objectContaining({
        contentType: 'image/png',
        fileName: 'gpv-5-1-emergency.png',
      }),
      expect.stringContaining('Графік відключень на 20.02.2026'),
      logger,
      expect.objectContaining({ threadId: undefined }),
    );
    expect(state.hasSentInitial).toBe(true);
    expect(state.lastSentHash).toBeTruthy();
    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  it('should initialize today baseline without sending outside evening window', async () => {
    // Arrange
    const state = createDailyState();
    fetchMock.mockResolvedValue({
      json: vi.fn(() =>
        Promise.resolve(
          buildScheduleJson(buildFullGroupData('yes'), undefined, buildGroupDataWithOutage()),
        ),
      ),
      ok: true,
    });

    // Act
    await processWindowCheck(logger, state, {
      fetchClient: fetchMock,
      fetchPngBinaryFn: fetchPngBinaryMock,
      now: new Date('2026-02-19T10:00:00Z'),
      sendMessageFn: sendMessageMock,
      sendPhotoFn: sendPhotoMock,
    });

    // Assert
    expect(sendPhotoMock).not.toHaveBeenCalled();
    expect(state.hasSentTodayInitial).toBe(true);
    expect(state.lastSentTodayHash).toBeTruthy();
    expect(state.hasSentInitial).toBe(false);
    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  it('should send updated graph for today flow when hash changes', async () => {
    // Arrange
    const state = createDailyState();
    fetchMock
      .mockResolvedValueOnce({
        json: vi.fn(() =>
          Promise.resolve(
            buildScheduleJson(buildFullGroupData('yes'), undefined, buildGroupDataWithOutage()),
          ),
        ),
        ok: true,
      })
      .mockResolvedValueOnce({
        json: vi.fn(() =>
          Promise.resolve(
            buildScheduleJson(buildFullGroupData('yes'), undefined, {
              ...buildGroupDataWithOutage(),
              11: 'second',
            }),
          ),
        ),
        ok: true,
      });

    // Act
    await processWindowCheck(logger, state, {
      fetchClient: fetchMock,
      fetchPngBinaryFn: fetchPngBinaryMock,
      now: new Date('2026-02-19T10:00:00Z'),
      sendMessageFn: sendMessageMock,
      sendPhotoFn: sendPhotoMock,
    });
    await processWindowCheck(logger, state, {
      fetchClient: fetchMock,
      fetchPngBinaryFn: fetchPngBinaryMock,
      now: new Date('2026-02-19T10:30:00Z'),
      sendMessageFn: sendMessageMock,
      sendPhotoFn: sendPhotoMock,
    });

    // Assert
    expect(sendPhotoMock).toHaveBeenCalledTimes(1);
    expect(sendPhotoMock.mock.calls[0][1]).toContain('Графік на 19.02.2026 ОНОВЛЕНО');
    expect(state.hasSentInitial).toBe(false);
    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  it('should process today and tomorrow flows independently', async () => {
    // Arrange
    const state = createDailyState();
    fetchMock.mockResolvedValue({
      json: vi.fn(() =>
        Promise.resolve(
          buildScheduleJson(buildGroupDataWithOutage(), undefined, buildGroupDataWithOutage()),
        ),
      ),
      ok: true,
    });

    // Act
    await processWindowCheck(logger, state, {
      fetchClient: fetchMock,
      fetchPngBinaryFn: fetchPngBinaryMock,
      now: new Date('2026-02-19T18:00:00Z'),
      sendMessageFn: sendMessageMock,
      sendPhotoFn: sendPhotoMock,
    });

    // Assert
    expect(sendPhotoMock).toHaveBeenCalledTimes(1);
    expect(sendPhotoMock.mock.calls[0][1]).toContain('Графік відключень на 20.02.2026');
    expect(state.hasSentTodayInitial).toBe(true);
    expect(state.hasSentInitial).toBe(true);
    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  it('should not resend graph when JSON has no changes', async () => {
    // Arrange
    const state = createDailyState();
    const scheduleJson = buildScheduleJson(buildGroupDataWithOutage());
    fetchMock.mockResolvedValue({
      json: vi.fn(() => Promise.resolve(scheduleJson)),
      ok: true,
    });

    // Act
    await processWindowCheck(logger, state, {
      fetchClient: fetchMock,
      fetchPngBinaryFn: fetchPngBinaryMock,
      now: new Date('2026-02-19T18:00:00Z'),
      sendMessageFn: sendMessageMock,
      sendPhotoFn: sendPhotoMock,
    });
    await processWindowCheck(logger, state, {
      fetchClient: fetchMock,
      fetchPngBinaryFn: fetchPngBinaryMock,
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
        json: vi.fn(() => Promise.resolve(buildScheduleJson(buildGroupDataWithOutage()))),
        ok: true,
      })
      .mockResolvedValueOnce({
        json: vi.fn(() =>
          Promise.resolve(
            buildScheduleJson({
              ...buildGroupDataWithOutage(),
              12: 'second',
            }),
          ),
        ),
        ok: true,
      });

    // Act
    await processWindowCheck(logger, state, {
      fetchClient: fetchMock,
      fetchPngBinaryFn: fetchPngBinaryMock,
      now: new Date('2026-02-19T18:00:00Z'),
      sendMessageFn: sendMessageMock,
      sendPhotoFn: sendPhotoMock,
    });
    await processWindowCheck(logger, state, {
      fetchClient: fetchMock,
      fetchPngBinaryFn: fetchPngBinaryMock,
      now: new Date('2026-02-19T18:30:00Z'),
      sendMessageFn: sendMessageMock,
      sendPhotoFn: sendPhotoMock,
    });

    // Assert
    expect(sendPhotoMock).toHaveBeenCalledTimes(2);
    expect(sendPhotoMock.mock.calls[1][1].toLowerCase()).toContain('оновлено');
  });

  it('should send missing notice at final check when tomorrow data absent', async () => {
    // Arrange
    const state = createDailyState();
    fetchMock.mockResolvedValue({
      json: vi.fn(() =>
        Promise.resolve({
          fact: {
            data: {
              [KYIV_TODAY_EPOCH]: {
                'GPV5.1': buildFullGroupData('yes'),
              },
            },
            today: Number(KYIV_TODAY_EPOCH),
          },
          lastUpdated: '2026-02-19T17:40:00.000Z',
        }),
      ),
      ok: true,
    });

    // Act
    await processWindowCheck(logger, state, {
      fetchClient: fetchMock,
      fetchPngBinaryFn: fetchPngBinaryMock,
      now: new Date('2026-02-19T21:59:00Z'),
      sendMessageFn: sendMessageMock,
      sendPhotoFn: sendPhotoMock,
    });

    // Assert
    expect(sendPhotoMock).not.toHaveBeenCalled();
    expect(sendMessageMock).toHaveBeenCalledTimes(1);
    expect(sendMessageMock).toHaveBeenCalledWith(
      expect.stringContaining('Графік відключень на 20.02.2026 відсутній'),
      logger,
      expect.objectContaining({ threadId: undefined }),
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

  it('should validate group data with 24 valid hours', () => {
    // Arrange
    const groupData = buildGroupDataWithOutage();

    // Act
    const result = validateGroupData(groupData);

    // Assert
    expect(result).toEqual({ isValid: true, reason: null });
  });

  it('should reject group data with missing hour', () => {
    // Arrange
    const groupData = { 1: 'yes' };

    // Act
    const result = validateGroupData(groupData);

    // Assert
    expect(result.isValid).toBe(false);
    expect(result.reason).toContain('hour 2 is missing');
  });

  it('should reject stale schedule json', () => {
    // Arrange
    const scheduleJson = buildScheduleJson(
      buildFullGroupData('yes'),
      '2026-02-17T10:00:00.000Z',
    );
    const now = new Date('2026-02-19T18:00:00Z');
    const jsonMaxAgeHours = 24;

    // Act
    const result = isJsonFresh(scheduleJson, jsonMaxAgeHours, now);

    // Assert
    expect(result.isFresh).toBe(false);
  });

  it('should skip send when group json is invalid', async () => {
    // Arrange
    const state = createDailyState();
    const invalidGroupData = buildFullGroupData('yes');
    invalidGroupData['10'] = 'UNKNOWN';

    fetchMock.mockResolvedValue({
      json: vi.fn(() => Promise.resolve(buildScheduleJson(invalidGroupData))),
      ok: true,
    });

    // Act
    await processWindowCheck(logger, state, {
      fetchClient: fetchMock,
      fetchPngBinaryFn: fetchPngBinaryMock,
      now: new Date('2026-02-19T18:00:00Z'),
      sendMessageFn: sendMessageMock,
      sendPhotoFn: sendPhotoMock,
    });

    // Assert
    expect(sendPhotoMock).not.toHaveBeenCalled();
    expect(state.hasSentInitial).toBe(false);
  });

  it('should skip send when tomorrow schedule is all yes', async () => {
    // Arrange
    const state = createDailyState();
    fetchMock.mockResolvedValue({
      json: vi.fn(() => Promise.resolve(buildScheduleJson(buildFullGroupData('yes')))),
      ok: true,
    });

    // Act
    await processWindowCheck(logger, state, {
      fetchClient: fetchMock,
      fetchPngBinaryFn: fetchPngBinaryMock,
      now: new Date('2026-02-19T18:00:00Z'),
      sendMessageFn: sendMessageMock,
      sendPhotoFn: sendPhotoMock,
    });

    // Assert
    expect(sendPhotoMock).not.toHaveBeenCalled();
    expect(state.hasSentInitial).toBe(false);
  });

  it('should detect non-yes values in group data', () => {
    // Arrange
    const allYes = buildFullGroupData('yes');
    const withOutage = buildGroupDataWithOutage();

    // Act + Assert
    expect(hasNonYesValues(allYes)).toBe(false);
    expect(hasNonYesValues(withOutage)).toBe(true);
  });

  it('should send graph when tomorrow changes from outages to all yes', async () => {
    // Arrange
    const state = createDailyState();
    fetchMock
      .mockResolvedValueOnce({
        json: vi.fn(() => Promise.resolve(buildScheduleJson(buildGroupDataWithOutage()))),
        ok: true,
      })
      .mockResolvedValueOnce({
        json: vi.fn(() => Promise.resolve(buildScheduleJson(buildFullGroupData('yes')))),
        ok: true,
      })
      .mockResolvedValueOnce({
        json: vi.fn(() => Promise.resolve(buildScheduleJson(buildFullGroupData('yes')))),
        ok: true,
      });

    // Act
    await processWindowCheck(logger, state, {
      fetchClient: fetchMock,
      fetchPngBinaryFn: fetchPngBinaryMock,
      now: new Date('2026-02-19T18:00:00Z'),
      sendMessageFn: sendMessageMock,
      sendPhotoFn: sendPhotoMock,
    });
    await processWindowCheck(logger, state, {
      fetchClient: fetchMock,
      fetchPngBinaryFn: fetchPngBinaryMock,
      now: new Date('2026-02-19T18:30:00Z'),
      sendMessageFn: sendMessageMock,
      sendPhotoFn: sendPhotoMock,
    });
    await processWindowCheck(logger, state, {
      fetchClient: fetchMock,
      fetchPngBinaryFn: fetchPngBinaryMock,
      now: new Date('2026-02-19T19:00:00Z'),
      sendMessageFn: sendMessageMock,
      sendPhotoFn: sendPhotoMock,
    });

    // Assert
    expect(sendPhotoMock).toHaveBeenCalledTimes(2);
    expect(sendPhotoMock.mock.calls[0][1]).toContain('Графік відключень на 20.02.2026');
    expect(sendPhotoMock.mock.calls[1][1]).toContain('відключення скасовано');
  });

  it('should send graph when today changes from outages to all yes', async () => {
    // Arrange
    const state = createDailyState();
    fetchMock
      .mockResolvedValueOnce({
        json: vi.fn(() =>
          Promise.resolve(
            buildScheduleJson(buildFullGroupData('yes'), undefined, buildGroupDataWithOutage()),
          ),
        ),
        ok: true,
      })
      .mockResolvedValueOnce({
        json: vi.fn(() =>
          Promise.resolve(
            buildScheduleJson(buildFullGroupData('yes'), undefined, buildFullGroupData('yes')),
          ),
        ),
        ok: true,
      })
      .mockResolvedValueOnce({
        json: vi.fn(() =>
          Promise.resolve(
            buildScheduleJson(buildFullGroupData('yes'), undefined, buildFullGroupData('yes')),
          ),
        ),
        ok: true,
      });

    // Act
    await processWindowCheck(logger, state, {
      fetchClient: fetchMock,
      fetchPngBinaryFn: fetchPngBinaryMock,
      now: new Date('2026-02-19T10:00:00Z'),
      sendMessageFn: sendMessageMock,
      sendPhotoFn: sendPhotoMock,
    });
    await processWindowCheck(logger, state, {
      fetchClient: fetchMock,
      fetchPngBinaryFn: fetchPngBinaryMock,
      now: new Date('2026-02-19T10:30:00Z'),
      sendMessageFn: sendMessageMock,
      sendPhotoFn: sendPhotoMock,
    });
    await processWindowCheck(logger, state, {
      fetchClient: fetchMock,
      fetchPngBinaryFn: fetchPngBinaryMock,
      now: new Date('2026-02-19T11:00:00Z'),
      sendMessageFn: sendMessageMock,
      sendPhotoFn: sendPhotoMock,
    });

    // Assert
    expect(sendPhotoMock).toHaveBeenCalledTimes(1);
    expect(sendPhotoMock.mock.calls[0][1]).toContain('відключення скасовано');
    expect(state.hasSentTodayInitial).toBe(true);
  });

  it('should send no outages graph at final check when tomorrow is all yes', async () => {
    // Arrange
    const state = createDailyState();
    fetchMock.mockResolvedValue({
      json: vi.fn(() => Promise.resolve(buildScheduleJson(buildFullGroupData('yes')))),
      ok: true,
    });

    // Act
    await processWindowCheck(logger, state, {
      fetchClient: fetchMock,
      fetchPngBinaryFn: fetchPngBinaryMock,
      now: new Date('2026-02-19T21:59:00Z'),
      sendMessageFn: sendMessageMock,
      sendPhotoFn: sendPhotoMock,
    });

    // Assert
    expect(sendPhotoMock).toHaveBeenCalledTimes(1);
    expect(sendPhotoMock.mock.calls[0][1]).toContain('відключень не заплановано');
    expect(state.hasSentInitial).toBe(true);
    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  it('should send no outages graph during the last interval before window end', async () => {
    // Arrange
    const state = createDailyState();
    fetchMock.mockResolvedValue({
      json: vi.fn(() => Promise.resolve(buildScheduleJson(buildFullGroupData('yes')))),
      ok: true,
    });

    // Act
    await processWindowCheck(logger, state, {
      fetchClient: fetchMock,
      fetchPngBinaryFn: fetchPngBinaryMock,
      now: new Date('2026-02-19T21:30:00Z'),
      sendMessageFn: sendMessageMock,
      sendPhotoFn: sendPhotoMock,
    });

    // Assert
    expect(sendPhotoMock).toHaveBeenCalledTimes(1);
    expect(sendPhotoMock.mock.calls[0][1]).toContain('відключень не заплановано');
    expect(state.hasSentInitial).toBe(true);
    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  it('should send no outages graph at final check after restoring state', async () => {
    // Arrange
    const state = createDailyState();
    const saveStateMock = vi.fn(async () => {});
    const allYesGroupData = buildFullGroupData('yes');
    fetchMock.mockResolvedValue({
      json: vi.fn(() => Promise.resolve(buildScheduleJson(allYesGroupData))),
      ok: true,
    });

    // Act
    await processWindowCheck(logger, state, {
      fetchClient: fetchMock,
      fetchPngBinaryFn: fetchPngBinaryMock,
      now: new Date('2026-02-19T21:35:00Z'),
      sendMessageFn: sendMessageMock,
      sendPhotoFn: sendPhotoMock,
      stateStore: {
        getState: async () => ({
          missingNoticeDateKey: null,
          todayDateKey: null,
          todayHash: null,
          tomorrowDateKey: '2026-02-20',
          tomorrowHash: buildGroupHash(allYesGroupData),
        }),
        saveState: saveStateMock,
      },
    });

    // Assert
    expect(sendPhotoMock).toHaveBeenCalledTimes(1);
    expect(sendPhotoMock.mock.calls[0][1]).toContain('відключень не заплановано');
    expect(saveStateMock).toHaveBeenCalledWith(
      logger,
      expect.objectContaining({
        missingNoticeDateKey: '2026-02-20',
      }),
    );
    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  it('should not send tomorrow graph updates after 23:59 window closes', async () => {
    // Arrange
    const state = createDailyState();
    fetchMock.mockResolvedValue({
      json: vi.fn(() => Promise.resolve(buildScheduleJson(buildGroupDataWithOutage()))),
      ok: true,
    });

    // Act
    await processWindowCheck(logger, state, {
      fetchClient: fetchMock,
      fetchPngBinaryFn: fetchPngBinaryMock,
      now: new Date('2026-02-19T22:15:00Z'),
      sendMessageFn: sendMessageMock,
      sendPhotoFn: sendPhotoMock,
    });

    // Assert
    expect(sendPhotoMock).not.toHaveBeenCalled();
    expect(sendMessageMock).not.toHaveBeenCalled();
    expect(state.hasSentInitial).toBe(false);
  });

  it('should notify when yesterday promised no outages but today has outages', async () => {
    // Arrange
    const state = createDailyState();
    const yesterdayNoOutagesHash = buildGroupHash(buildFullGroupData('yes'));
    const todayWithOutagesHash = buildGroupHash(buildGroupDataWithOutage());

    const getStateMock = vi.fn(() =>
      Promise.resolve({
        missingNoticeDateKey: '2026-02-19',
        todayDateKey: null,
        todayHash: null,
        tomorrowDateKey: '2026-02-19',
        tomorrowHash: yesterdayNoOutagesHash,
      }),
    );
    const saveStateMock = vi.fn(() => Promise.resolve());

    fetchMock.mockResolvedValue({
      json: vi.fn(() =>
        Promise.resolve(
          buildScheduleJson(buildFullGroupData('yes'), '2026-02-19T06:00:00.000Z', buildGroupDataWithOutage()),
        ),
      ),
      ok: true,
    });

    // Act
    await processWindowCheck(logger, state, {
      config: {
        chatId: '123',
        checkEndHour: 21,
        checkEndMinute: 0,
        checkIntervalMinutes: 30,
        checkStartHour: 18,
        checkStartMinute: 0,
        dailyGroupKey: 'GPV5.1',
        dailyJsonUrl: 'https://example.com/schedule.json',
        dailyPngUrl: 'https://example.com/graph.png',
        dailyThreadId: '456',
        jsonMaxAgeHours: 24,
        requireNonYesValues: false,
        sendTodayInitial: false,
        timezone: 'Europe/Kyiv',
      },
      fetchClient: fetchMock,
      fetchPngBinaryFn: fetchPngBinaryMock,
      now: new Date('2026-02-19T06:05:00Z'),
      sendMessageFn: sendMessageMock,
      sendPhotoFn: sendPhotoMock,
      stateStore: {
        getState: getStateMock,
        saveState: saveStateMock,
      },
    });

    // Assert
    expect(sendPhotoMock).toHaveBeenCalledTimes(1);
    expect(sendPhotoMock.mock.calls[0][1]).toContain('ЗМІНЕНО - з\'явилися відключення');
    expect(saveStateMock).toHaveBeenCalledWith(
      logger,
      expect.objectContaining({
        missingNoticeDateKey: null,
        todayDateKey: '2026-02-19',
        todayHash: todayWithOutagesHash,
      }),
    );
  });

  it('should notify when today outages schedule changes during the day', async () => {
    // Arrange
    const state = createDailyState();
    const initialOutageData = buildGroupDataWithOutage();
    const changedOutageData = { ...buildGroupDataWithOutage(), '12': 'no', '15': 'no' };

    const initialHash = buildGroupHash(initialOutageData);
    const changedHash = buildGroupHash(changedOutageData);

    const getStateMock = vi.fn(() =>
      Promise.resolve({
        missingNoticeDateKey: null,
        todayDateKey: '2026-02-19',
        todayHash: initialHash,
        tomorrowDateKey: '2026-02-20',
        tomorrowHash: null,
      }),
    );
    const saveStateMock = vi.fn(() => Promise.resolve());

    fetchMock.mockResolvedValue({
      json: vi.fn(() =>
        Promise.resolve(
          buildScheduleJson(buildFullGroupData('yes'), '2026-02-19T12:30:00.000Z', changedOutageData),
        ),
      ),
      ok: true,
    });

    // Act
    await processWindowCheck(logger, state, {
      config: {
        chatId: '123',
        checkEndHour: 21,
        checkEndMinute: 0,
        checkIntervalMinutes: 30,
        checkStartHour: 18,
        checkStartMinute: 0,
        dailyGroupKey: 'GPV5.1',
        dailyJsonUrl: 'https://example.com/schedule.json',
        dailyPngUrl: 'https://example.com/graph.png',
        dailyThreadId: '456',
        jsonMaxAgeHours: 24,
        requireNonYesValues: false,
        sendTodayInitial: false,
        timezone: 'Europe/Kyiv',
      },
      fetchClient: fetchMock,
      fetchPngBinaryFn: fetchPngBinaryMock,
      now: new Date('2026-02-19T12:35:00Z'),
      sendMessageFn: sendMessageMock,
      sendPhotoFn: sendPhotoMock,
      stateStore: {
        getState: getStateMock,
        saveState: saveStateMock,
      },
    });

    // Assert
    expect(sendPhotoMock).toHaveBeenCalledTimes(1);
    expect(sendPhotoMock.mock.calls[0][1]).toContain('ОНОВЛЕНО');
    expect(sendPhotoMock.mock.calls[0][1]).not.toContain('з\'явилися відключення');
    expect(saveStateMock).toHaveBeenCalledWith(
      logger,
      expect.objectContaining({
        todayDateKey: '2026-02-19',
        todayHash: changedHash,
        todayLastNotifiedAt: expect.any(Date),
      }),
    );
  });

});
