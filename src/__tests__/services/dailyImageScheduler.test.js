import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.fn();
const sendPhotoMock = vi.fn();

import {
  getDelayToNextRun,
  sendDailyImage,
} from '../../services/dailyImageScheduler';

describe('dailyImageScheduler', () => {
  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  beforeEach(() => {
    fetchMock.mockReset();
    sendPhotoMock.mockReset();
    logger.info.mockReset();
    logger.warn.mockReset();
    logger.error.mockReset();
  });

  it('should download PNG and send photo to Telegram', async () => {
    // Arrange
    fetchMock.mockResolvedValue({
      ok: true,
      headers: { get: vi.fn(() => 'image/png') },
      buffer: vi.fn(() => Promise.resolve(Buffer.from('png-data'))),
    });
    sendPhotoMock.mockResolvedValue({
      ok: true,
      result: { message_id: 123 },
    });

    // Act
    await sendDailyImage(logger, {
      fetchClient: fetchMock,
      sendPhotoFn: sendPhotoMock,
      url: 'https://example.com/image.png',
    });

    // Assert
    expect(fetchMock).toHaveBeenCalledWith('https://example.com/image.png');
    expect(sendPhotoMock).toHaveBeenCalledTimes(1);
    expect(sendPhotoMock).toHaveBeenCalledWith(
      'https://example.com/image.png',
      expect.stringContaining('Планові/аварійні відключення'),
      logger,
      { threadId: undefined }
    );
  });

  it('should throw when image download fails', async () => {
    // Arrange
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
    });

    // Act + Assert
    await expect(
      sendDailyImage(logger, {
        fetchClient: fetchMock,
        sendPhotoFn: sendPhotoMock,
        url: 'https://example.com/image.png',
      })
    ).rejects.toThrow('Image download failed with status 503');
    expect(sendPhotoMock).not.toHaveBeenCalled();
  });

  it('should throw when Telegram returns invalid response', async () => {
    // Arrange
    fetchMock.mockResolvedValue({
      ok: true,
      headers: { get: vi.fn(() => 'image/png') },
      buffer: vi.fn(() => Promise.resolve(Buffer.from('png-data'))),
    });
    sendPhotoMock.mockResolvedValue(undefined);

    // Act + Assert
    await expect(
      sendDailyImage(logger, {
        fetchClient: fetchMock,
        sendPhotoFn: sendPhotoMock,
        url: 'https://example.com/image.png',
      })
    ).rejects.toThrow('Telegram API returned unexpected response');
  });

  it('should calculate delay for custom minute schedule', () => {
    // Arrange
    const now = new Date('2026-02-18T21:15:00Z');

    // Act
    const delay = getDelayToNextRun(now, 21, 30, 'UTC');

    // Assert
    expect(delay).toBe(15 * 60 * 1000);
  });
});
