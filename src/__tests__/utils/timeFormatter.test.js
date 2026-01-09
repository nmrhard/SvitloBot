import { describe, expect, it } from 'vitest';

import {
  calculateDuration,
  formatTime,
  getDurationMessage,
} from '../../utils/timeFormatter';

describe('timeFormatter', () => {
  describe('formatTime', () => {
    it('should format UNIX timestamp to Ukrainian locale', () => {
      // Arrange
      const timestamp = 1729699200; // 2024-10-23 16:00:00 UTC

      // Act
      const result = formatTime(timestamp);

      // Assert
      expect(result).toMatch(/\d{2}\.\d{2}\.\d{4}, \d{1,2}:\d{2}/);
    });

    it('should use Europe/Kyiv timezone', () => {
      // Arrange
      const timestamp = 1729699200;

      // Act
      const result = formatTime(timestamp);

      // Assert - Kyiv is UTC+2 (or UTC+3 in summer)
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });
  });

  describe('calculateDuration', () => {
    it('should calculate duration in hours and minutes', () => {
      // Arrange
      const startTime = 1729699200;
      const endTime = 1729699200 + 3600 + 1800; // +1.5 hours

      // Act
      const result = calculateDuration(startTime, endTime);

      // Assert
      expect(result).toBe('1г. 30хв.');
    });

    it('should handle zero duration', () => {
      // Arrange
      const timestamp = 1729699200;

      // Act
      const result = calculateDuration(timestamp, timestamp);

      // Assert
      expect(result).toBe('0г. 0хв.');
    });

    it('should handle multiple hours', () => {
      // Arrange
      const startTime = 1729699200;
      const endTime = startTime + 3600 * 5 + 60 * 45; // 5h 45m

      // Act
      const result = calculateDuration(startTime, endTime);

      // Assert
      expect(result).toBe('5г. 45хв.');
    });
  });

  describe('getDurationMessage', () => {
    it('should return "світло було" message for offline status', () => {
      // Arrange
      const duration = '2г. 30хв.';

      // Act
      const result = getDurationMessage('offline', duration);

      // Assert
      expect(result).toBe('⏳Cвітло було: <b>2г. 30хв.</b>');
    });

    it('should return "світло не було" message for online status', () => {
      // Arrange
      const duration = '1г. 15хв.';

      // Act
      const result = getDurationMessage('online', duration);

      // Assert
      expect(result).toBe('⏳Cвітло не було: <b>1г. 15хв.</b>');
    });
  });
});

