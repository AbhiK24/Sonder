/**
 * Natural Language Time Parser
 *
 * Parses common time expressions:
 * - "in 30 minutes"
 * - "in 2 hours"
 * - "tomorrow at 5pm"
 * - "at 3:30pm"
 * - "at 15:00"
 * - "tonight at 8"
 * - "tomorrow morning"
 */

import type { ParsedTime } from './types.js';

export function parseReminderTime(input: string, timezone: string = 'UTC'): ParsedTime {
  const now = new Date();
  const lower = input.toLowerCase().trim();

  // Try each parser in order
  const parsers = [
    parseRelativeTime,      // "in X minutes/hours/days"
    parseTomorrowTime,      // "tomorrow at 5pm", "tomorrow morning"
    parseTodayTime,         // "today at 5pm", "tonight at 8"
    parseAtTime,            // "at 5pm", "at 15:00"
    parseTimeOnly,          // "5pm", "3:30pm", "15:00"
    parseISO,               // ISO 8601 fallback
  ];

  for (const parser of parsers) {
    const result = parser(lower, now, timezone);
    if (result) {
      return result;
    }
  }

  // Last resort: try native Date parsing
  const fallback = new Date(input);
  if (!isNaN(fallback.getTime())) {
    return {
      date: fallback,
      confidence: 'low',
      interpretation: `Parsed as ${formatTime(fallback)}`,
    };
  }

  // Couldn't parse - default to 1 hour from now
  const defaultTime = new Date(now.getTime() + 60 * 60 * 1000);
  return {
    date: defaultTime,
    confidence: 'low',
    interpretation: `Couldn't parse "${input}", defaulting to 1 hour from now`,
  };
}

// =============================================================================
// Individual Parsers
// =============================================================================

function parseRelativeTime(input: string, now: Date, _tz: string): ParsedTime | null {
  // "in 30 minutes", "in 2 hours", "in 3 days"
  const match = input.match(/^in\s+(\d+)\s*(minute|min|hour|hr|day)s?$/i);
  if (!match) return null;

  const [, numStr, unit] = match;
  const num = parseInt(numStr, 10);

  let ms: number;
  let unitName: string;
  if (unit.startsWith('min')) {
    ms = num * 60 * 1000;
    unitName = num === 1 ? 'minute' : 'minutes';
  } else if (unit.startsWith('hour') || unit.startsWith('hr')) {
    ms = num * 60 * 60 * 1000;
    unitName = num === 1 ? 'hour' : 'hours';
  } else {
    ms = num * 24 * 60 * 60 * 1000;
    unitName = num === 1 ? 'day' : 'days';
  }

  const date = new Date(now.getTime() + ms);
  return {
    date,
    confidence: 'high',
    interpretation: `In ${num} ${unitName} (${formatTime(date)})`,
  };
}

function parseTomorrowTime(input: string, now: Date, _tz: string): ParsedTime | null {
  if (!input.includes('tomorrow')) return null;

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // "tomorrow morning" -> 9am
  if (input.includes('morning')) {
    tomorrow.setHours(9, 0, 0, 0);
    return {
      date: tomorrow,
      confidence: 'high',
      interpretation: `Tomorrow morning at 9:00 AM`,
    };
  }

  // "tomorrow afternoon" -> 2pm
  if (input.includes('afternoon')) {
    tomorrow.setHours(14, 0, 0, 0);
    return {
      date: tomorrow,
      confidence: 'high',
      interpretation: `Tomorrow afternoon at 2:00 PM`,
    };
  }

  // "tomorrow evening" -> 6pm
  if (input.includes('evening')) {
    tomorrow.setHours(18, 0, 0, 0);
    return {
      date: tomorrow,
      confidence: 'high',
      interpretation: `Tomorrow evening at 6:00 PM`,
    };
  }

  // "tomorrow night" -> 8pm
  if (input.includes('night')) {
    tomorrow.setHours(20, 0, 0, 0);
    return {
      date: tomorrow,
      confidence: 'high',
      interpretation: `Tomorrow night at 8:00 PM`,
    };
  }

  // "tomorrow at 5pm"
  const timeMatch = input.match(/at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (timeMatch) {
    const time = parseTimeMatch(timeMatch);
    if (time) {
      tomorrow.setHours(time.hours, time.minutes, 0, 0);
      return {
        date: tomorrow,
        confidence: 'high',
        interpretation: `Tomorrow at ${formatTime(tomorrow)}`,
      };
    }
  }

  // Just "tomorrow" -> 9am
  tomorrow.setHours(9, 0, 0, 0);
  return {
    date: tomorrow,
    confidence: 'medium',
    interpretation: `Tomorrow at 9:00 AM (default)`,
  };
}

function parseTodayTime(input: string, now: Date, _tz: string): ParsedTime | null {
  const isToday = input.includes('today');
  const isTonight = input.includes('tonight');

  if (!isToday && !isTonight) return null;

  const date = new Date(now);

  if (isTonight) {
    // "tonight" -> 8pm, or parse specific time
    const timeMatch = input.match(/at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
    if (timeMatch) {
      const time = parseTimeMatch(timeMatch);
      if (time) {
        date.setHours(time.hours, time.minutes, 0, 0);
        return {
          date,
          confidence: 'high',
          interpretation: `Tonight at ${formatTime(date)}`,
        };
      }
    }
    date.setHours(20, 0, 0, 0);
    return {
      date,
      confidence: 'medium',
      interpretation: `Tonight at 8:00 PM (default)`,
    };
  }

  // "today at 5pm"
  const timeMatch = input.match(/at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (timeMatch) {
    const time = parseTimeMatch(timeMatch);
    if (time) {
      date.setHours(time.hours, time.minutes, 0, 0);
      // If time already passed, add a day
      if (date <= now) {
        date.setDate(date.getDate() + 1);
        return {
          date,
          confidence: 'high',
          interpretation: `Tomorrow at ${formatTime(date)} (today's time already passed)`,
        };
      }
      return {
        date,
        confidence: 'high',
        interpretation: `Today at ${formatTime(date)}`,
      };
    }
  }

  return null;
}

function parseAtTime(input: string, now: Date, _tz: string): ParsedTime | null {
  // "at 5pm", "at 3:30pm", "at 15:00"
  const match = input.match(/^at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!match) return null;

  const time = parseTimeMatch(match);
  if (!time) return null;

  const date = new Date(now);
  date.setHours(time.hours, time.minutes, 0, 0);

  // If time already passed today, schedule for tomorrow
  if (date <= now) {
    date.setDate(date.getDate() + 1);
    return {
      date,
      confidence: 'high',
      interpretation: `Tomorrow at ${formatTime(date)} (today's time already passed)`,
    };
  }

  return {
    date,
    confidence: 'high',
    interpretation: `Today at ${formatTime(date)}`,
  };
}

function parseTimeOnly(input: string, now: Date, _tz: string): ParsedTime | null {
  // "5pm", "3:30pm", "15:00"
  const match = input.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!match) return null;

  const time = parseTimeMatch(match);
  if (!time) return null;

  const date = new Date(now);
  date.setHours(time.hours, time.minutes, 0, 0);

  // If time already passed today, schedule for tomorrow
  if (date <= now) {
    date.setDate(date.getDate() + 1);
    return {
      date,
      confidence: 'medium',
      interpretation: `Tomorrow at ${formatTime(date)} (today's time already passed)`,
    };
  }

  return {
    date,
    confidence: 'medium',
    interpretation: `Today at ${formatTime(date)}`,
  };
}

function parseISO(input: string, _now: Date, _tz: string): ParsedTime | null {
  // ISO 8601: "2024-02-20T15:00:00"
  if (!input.includes('-') && !input.includes('T')) return null;

  const date = new Date(input);
  if (isNaN(date.getTime())) return null;

  return {
    date,
    confidence: 'high',
    interpretation: formatTime(date),
  };
}

// =============================================================================
// Helpers
// =============================================================================

interface TimeComponents {
  hours: number;
  minutes: number;
}

function parseTimeMatch(match: RegExpMatchArray): TimeComponents | null {
  const [, hourStr, minStr, ampm] = match;
  let hours = parseInt(hourStr, 10);
  const minutes = minStr ? parseInt(minStr, 10) : 0;

  // Handle 24-hour time (15:00)
  if (!ampm && hours >= 0 && hours <= 23) {
    return { hours, minutes };
  }

  // Handle 12-hour time (5pm, 3:30am)
  if (ampm) {
    const isPM = ampm.toLowerCase() === 'pm';
    if (hours === 12) {
      hours = isPM ? 12 : 0;
    } else if (isPM) {
      hours += 12;
    }
    return { hours, minutes };
  }

  // Ambiguous (e.g., "at 5") - assume PM if hours < 12 and >= 7, else AM
  if (hours >= 1 && hours <= 6) {
    // 1-6 without am/pm -> assume PM (afternoon/evening)
    hours += 12;
  }
  // 7-11 without am/pm could be either, default to AM for morning reminders
  // 12+ is already 24-hour

  return { hours, minutes };
}

function formatTime(date: Date): string {
  return date.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export function formatReminderTime(date: Date): string {
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow = date.toDateString() === tomorrow.toDateString();

  const timeStr = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  if (isToday) {
    return `today at ${timeStr}`;
  } else if (isTomorrow) {
    return `tomorrow at ${timeStr}`;
  } else {
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    }) + ` at ${timeStr}`;
  }
}
