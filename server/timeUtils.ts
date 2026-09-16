import { DayInfo, LearningWindowStatus } from '../src/types';
import { CHALLENGE_START_DATE, CHALLENGE_END_DATE, TOTAL_CHALLENGE_DAYS } from './curriculumData';

// Timezone requirement: Asia/Kolkata (IST = UTC + 5:30)
export const TIMEZONE = 'Asia/Kolkata';

// Returns the current Date in IST
export function getISTNow(): Date {
  return new Date();
}

// Formats date string in YYYY-MM-DD for Asia/Kolkata
export function getISTDateString(date: Date = getISTNow()): string {
  // Use Intl to guarantee Asia/Kolkata formatting
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date);
}

// Formats IST time string like "08:45 AM"
export function getISTTimeString(date: Date = getISTNow()): string {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
  return formatter.format(date);
}

// Calculates Day Info and Window Status
export function calculateDayInfo(): DayInfo {
  const now = getISTNow();
  const currentDate = getISTDateString(now);

  // Time in IST
  const timeFormatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = timeFormatter.format(now).split(':');
  const hour = parseInt(parts[0], 10);
  const minute = parseInt(parts[1], 10);
  const currentMinutes = hour * 60 + minute;

  // Window bounds: 04:00 AM (240 min) to 10:30 PM (1350 min)
  // Night lockdown is 10:30 PM (1350 min) to 04:00 AM (240 min)
  const isNightLockdown = currentMinutes >= 1350 || currentMinutes < 240;

  let windowStatus: LearningWindowStatus = 'CLOSED';
  if (currentMinutes >= 240 && currentMinutes < 1320) {
    windowStatus = 'ACTIVE';
  } else if (currentMinutes >= 1320 && currentMinutes < 1350) {
    windowStatus = 'CLOSING_SOON';
  } else {
    windowStatus = 'CLOSED';
  }

  // Morning Wake-Up Check-in Window: 04:00 AM (240 min) to 05:00 AM (300 min)
  let morningWindowStatus: 'UPCOMING' | 'ACTIVE' | 'CLOSED' = 'CLOSED';
  if (currentMinutes >= 240 && currentMinutes < 300) {
    morningWindowStatus = 'ACTIVE';
  } else if (currentMinutes < 240) {
    morningWindowStatus = 'UPCOMING';
  } else {
    morningWindowStatus = 'CLOSED';
  }

  // Calculate day difference from challenge start date (2026-09-17)
  const startParts = CHALLENGE_START_DATE.split('-').map(Number);
  const currentParts = currentDate.split('-').map(Number);

  const startUtc = Date.UTC(startParts[0], startParts[1] - 1, startParts[2]);
  const currentUtc = Date.UTC(currentParts[0], currentParts[1] - 1, currentParts[2]);
  const diffDays = Math.floor((currentUtc - startUtc) / (24 * 60 * 60 * 1000));
  const challengeStarted = currentUtc >= startUtc;

  let dayNumber = challengeStarted ? diffDays + 1 : 0;
  if (dayNumber > TOTAL_CHALLENGE_DAYS) {
    dayNumber = TOTAL_CHALLENGE_DAYS;
  }

  const daysRemaining = challengeStarted ? Math.max(0, TOTAL_CHALLENGE_DAYS - dayNumber) : TOTAL_CHALLENGE_DAYS;

  // Greeting based on IST hour
  let greeting = 'Good Morning';
  if (hour >= 12 && hour < 17) {
    greeting = 'Good Afternoon';
  } else if (hour >= 17 && hour < 21) {
    greeting = 'Good Evening';
  } else if (hour >= 21 || hour < 4) {
    greeting = 'Good Night';
  }

  return {
    currentDate,
    dayNumber,
    totalDays: TOTAL_CHALLENGE_DAYS,
    daysRemaining,
    challengeStarted,
    challengeStartDate: CHALLENGE_START_DATE,
    challengeEndDate: CHALLENGE_END_DATE,
    windowStatus,
    windowOpensAt: '04:00 AM',
    windowClosesSoonAt: '10:00 PM',
    windowClosesAt: '10:30 PM',
    morningWindowStatus,
    morningWindowOpensAt: '04:00 AM',
    morningWindowClosesAt: '05:00 AM',
    istTime: getISTTimeString(now),
    greeting,
    isNightLockdown,
  };
}
