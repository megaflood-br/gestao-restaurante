import type {
  StoreHourShift,
  StoreSettings,
  StoreWeeklySchedule,
} from '@/types/delivery';

export const DEFAULT_STORE_TIMEZONE = 'America/Sao_Paulo';

export const WEEKDAY_OPTIONS: Array<{
  day: number;
  short: string;
  label: string;
}> = [
  { day: 0, short: 'Dom', label: 'Domingo' },
  { day: 1, short: 'Seg', label: 'Segunda' },
  { day: 2, short: 'Ter', label: 'Terça' },
  { day: 3, short: 'Qua', label: 'Quarta' },
  { day: 4, short: 'Qui', label: 'Quinta' },
  { day: 5, short: 'Sex', label: 'Sexta' },
  { day: 6, short: 'Sáb', label: 'Sábado' },
];

export const DISPLAY_WEEKDAY_ORDER: number[] = [1, 2, 3, 4, 5, 6, 0];

export function normalizeMenuItemDays(days: unknown): number[] | undefined {
  if (!Array.isArray(days)) return undefined;
  const valid = [...new Set(days.map((d) => Number(d)))]
    .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
    .sort((a, b) => a - b);
  if (valid.length === 0 || valid.length === 7) {
    return undefined;
  }
  return valid;
}

export function isMenuItemAvailableOnDay(
  item: { availableDays?: number[] },
  dayIndex: number,
): boolean {
  const normalized = normalizeMenuItemDays(item.availableDays);
  if (!normalized) return true;
  return normalized.includes(dayIndex);
}

export function formatMenuItemDaysLabel(days?: number[]): string {
  const normalized = normalizeMenuItemDays(days);
  if (!normalized) return 'Todos os dias';

  const ordered = DISPLAY_WEEKDAY_ORDER.filter((d) => normalized.includes(d));
  if (
    ordered.length === 5 &&
    ordered[0] === 1 &&
    ordered[1] === 2 &&
    ordered[2] === 3 &&
    ordered[3] === 4 &&
    ordered[4] === 5
  ) {
    return 'Seg a Sex';
  }

  return ordered
    .map((d) => WEEKDAY_OPTIONS[d]?.short ?? '')
    .filter(Boolean)
    .join(', ');
}

export function getWeekdayLabel(dayIndex: number): string {
  return WEEKDAY_OPTIONS[dayIndex]?.label ?? '';
}

export interface ParsedShiftMinutes {
  open: string;
  close: string;
  openMin: number;
  closeMin: number;
}

export interface ParsedStoreSchedule {
  days: number[];
  shifts: ParsedShiftMinutes[];
  is24Hours?: boolean;
}

export interface StoreAvailabilityResult {
  isOpen: boolean;
  statusMode: 'open' | 'closed_manual' | 'closed_schedule';
  statusLabel: string;
  adminBadgeLabel: string;
  closedReason: string;
  currentTimeLabel: string;
  currentDayIndex: number;
  parsedSchedule: ParsedStoreSchedule | null;
}

const EN_WEEKDAY_TO_INDEX: Record<string, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

const PT_DAY_PATTERNS: Array<{ day: number; regex: RegExp }> = [
  { day: 0, regex: /\bdom(?:ingo)?s?\b/g },
  { day: 1, regex: /\bseg(?:unda(?:-feira)?)?s?\b/g },
  { day: 2, regex: /\bter(?:ca(?:-feira)?)?s?\b/g },
  { day: 3, regex: /\bqua(?:rta(?:-feira)?)?s?\b/g },
  { day: 4, regex: /\bqui(?:nta(?:-feira)?)?s?\b/g },
  { day: 5, regex: /\bsex(?:ta(?:-feira)?)?s?\b/g },
  { day: 6, regex: /\bsab(?:ado)?s?\b/g },
];

function stripAccents(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function timeStringToMinutes(timeStr: string): number | null {
  const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (
    !Number.isFinite(hour) ||
    !Number.isFinite(minute) ||
    hour < 0 ||
    hour > 24 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }
  return hour * 60 + minute;
}

function matchDayToken(token: string): number | null {
  const clean = stripAccents(token).trim();
  if (/^dom/.test(clean)) return 0;
  if (/^seg/.test(clean)) return 1;
  if (/^ter/.test(clean)) return 2;
  if (/^qua/.test(clean)) return 3;
  if (/^qui/.test(clean)) return 4;
  if (/^sex/.test(clean)) return 5;
  if (/^sab/.test(clean)) return 6;
  return null;
}

export function parseOpeningHoursString(
  rawOpeningHours: string,
): ParsedStoreSchedule | null {
  const normalized = stripAccents(rawOpeningHours || '');
  if (!normalized.trim()) return null;

  const is24h = /\b24\s*(?:h|horas)\b/.test(normalized);

  // Extract weekdays
  const daySet = new Set<number>();

  if (
    /\btodos os dias\b/.test(normalized) ||
    /\bdiariamente\b/.test(normalized) ||
    /\bseg\s*(?:a|ate|-)\s*dom\b/.test(normalized) ||
    /\bdom\s*(?:a|ate|-)\s*dom\b/.test(normalized)
  ) {
    for (let d = 0; d < 7; d++) daySet.add(d);
  } else {
    // Match ranges like "seg a sab", "ter-dom", "segunda ate sexta"
    const rangeRegex =
      /\b(dom(?:ingo)?|seg(?:unda(?:-feira)?)?|ter(?:ca(?:-feira)?)?|qua(?:rta(?:-feira)?)?|qui(?:nta(?:-feira)?)?|sex(?:ta(?:-feira)?)?|sab(?:ado)?)\s*(?:a|ate|-|–|—)\s*(dom(?:ingo)?|seg(?:unda(?:-feira)?)?|ter(?:ca(?:-feira)?)?|qua(?:rta(?:-feira)?)?|qui(?:nta(?:-feira)?)?|sex(?:ta(?:-feira)?)?|sab(?:ado)?)\b/g;

    let rangeMatch: RegExpExecArray | null;
    while ((rangeMatch = rangeRegex.exec(normalized)) !== null) {
      const startDay = matchDayToken(rangeMatch[1]);
      const endDay = matchDayToken(rangeMatch[2]);
      if (startDay !== null && endDay !== null) {
        let cur = startDay;
        for (let guard = 0; guard < 7; guard++) {
          daySet.add(cur);
          if (cur === endDay) break;
          cur = (cur + 1) % 7;
        }
      }
    }

    // Match individual day mentions (ignoring text after "exceto" / "fechado")
    const mainSegment = normalized.split(/\b(?:exceto|fechado)\b/)[0] || normalized;
    for (const pattern of PT_DAY_PATTERNS) {
      if (pattern.regex.test(mainSegment)) {
        daySet.add(pattern.day);
      }
    }
  }

  // Handle explicit exclusions like "fechado aos domingos" or "exceto dom"
  const exclusionMatch = normalized.match(/\b(?:exceto|fechado[^,;.]*)(.*)/);
  if (exclusionMatch) {
    const excludedText = exclusionMatch[1] ?? '';
    for (const pattern of PT_DAY_PATTERNS) {
      if (pattern.regex.test(excludedText)) {
        daySet.delete(pattern.day);
      }
    }
  }

  // If no days were explicitly mentioned in the string, assume all 7 days
  const days =
    daySet.size > 0
      ? [...daySet].sort((a, b) => a - b)
      : [0, 1, 2, 3, 4, 5, 6];

  if (is24h) {
    return {
      days,
      shifts: [{ open: '00:00', close: '23:59', openMin: 0, closeMin: 1440 }],
      is24Hours: true,
    };
  }

  // Extract time intervals like "11:00 às 15:00", "11h às 15h", "11 as 15", "10:30 - 22:00"
  const shifts: ParsedShiftMinutes[] = [];
  const timeRangeRegex =
    /(?:^|[^\d:])(\d{1,2})(?:[:hH](\d{2})|h)?\s*(?:as|a|ate|-|–|—)\s*(\d{1,2})(?:[:hH](\d{2})|h)?(?=$|[^\d:])/g;

  let tMatch: RegExpExecArray | null;
  while ((tMatch = timeRangeRegex.exec(normalized)) !== null) {
    const h1 = Number(tMatch[1]);
    const m1 = tMatch[2] ? Number(tMatch[2]) : 0;
    const h2 = Number(tMatch[3]);
    const m2 = tMatch[4] ? Number(tMatch[4]) : 0;

    if (
      h1 >= 0 &&
      h1 <= 23 &&
      m1 >= 0 &&
      m1 <= 59 &&
      h2 >= 0 &&
      h2 <= 24 &&
      m2 >= 0 &&
      m2 <= 59 &&
      !(h2 === 24 && m2 > 0)
    ) {
      const openMin = h1 * 60 + m1;
      const closeMin = h2 * 60 + m2;
      shifts.push({
        open: `${pad2(h1)}:${pad2(m1)}`,
        close: `${pad2(h2)}:${pad2(m2)}`,
        openMin,
        closeMin,
      });
    }
  }

  if (shifts.length === 0) return null;

  return { days, shifts };
}

export function scheduleToParsed(
  schedule: StoreWeeklySchedule | undefined,
  fallbackText: string,
): ParsedStoreSchedule | null {
  if (
    schedule &&
    Array.isArray(schedule.days) &&
    schedule.days.length > 0 &&
    Array.isArray(schedule.shifts) &&
    schedule.shifts.length > 0
  ) {
    const validShifts: ParsedShiftMinutes[] = [];
    for (const shift of schedule.shifts) {
      const openMin = timeStringToMinutes(shift.open);
      const closeMin = timeStringToMinutes(shift.close);
      if (openMin !== null && closeMin !== null && openMin !== closeMin) {
        validShifts.push({
          open: shift.open,
          close: shift.close,
          openMin,
          closeMin,
        });
      }
    }
    if (validShifts.length > 0) {
      return {
        days: [...new Set(schedule.days)]
          .filter((d) => d >= 0 && d <= 6)
          .sort((a, b) => a - b),
        shifts: validShifts,
      };
    }
  }

  return parseOpeningHoursString(fallbackText);
}

export function getCurrentTimeInTimezone(
  now: Date = new Date(),
  timeZone: string = DEFAULT_STORE_TIMEZONE,
): { dayIndex: number; minutesOfDay: number; formattedTime: string } {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(now);

    const weekdayRaw =
      parts.find((p) => p.type === 'weekday')?.value.toLowerCase() ?? '';
    const hourRaw = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
    const minuteRaw = Number(
      parts.find((p) => p.type === 'minute')?.value ?? '0',
    );

    const hour = Number.isFinite(hourRaw) ? hourRaw % 24 : now.getHours();
    const minute = Number.isFinite(minuteRaw) ? minuteRaw : now.getMinutes();
    const dayIndex = EN_WEEKDAY_TO_INDEX[weekdayRaw.slice(0, 3)] ?? now.getDay();

    return {
      dayIndex,
      minutesOfDay: hour * 60 + minute,
      formattedTime: `${pad2(hour)}:${pad2(minute)}`,
    };
  } catch {
    const hour = now.getHours();
    const minute = now.getMinutes();
    return {
      dayIndex: now.getDay(),
      minutesOfDay: hour * 60 + minute,
      formattedTime: `${pad2(hour)}:${pad2(minute)}`,
    };
  }
}

export function isWithinParsedSchedule(
  schedule: ParsedStoreSchedule,
  dayIndex: number,
  minutesOfDay: number,
): boolean {
  if (schedule.is24Hours && schedule.days.includes(dayIndex)) {
    return true;
  }

  const prevDayIndex = (dayIndex + 6) % 7;

  for (const shift of schedule.shifts) {
    if (shift.closeMin > shift.openMin) {
      if (
        schedule.days.includes(dayIndex) &&
        minutesOfDay >= shift.openMin &&
        minutesOfDay < shift.closeMin
      ) {
        return true;
      }
    } else if (shift.closeMin < shift.openMin) {
      // Overnight shift (e.g. 18:00 às 02:00)
      const inFirstHalf =
        schedule.days.includes(dayIndex) && minutesOfDay >= shift.openMin;
      const inOvernightHalf =
        schedule.days.includes(prevDayIndex) && minutesOfDay < shift.closeMin;
      if (inFirstHalf || inOvernightHalf) {
        return true;
      }
    }
  }

  return false;
}

export function formatOpeningScheduleLabel(
  days: number[],
  shifts: StoreHourShift[],
): string {
  const uniqueDays = [...new Set(days)]
    .filter((d) => d >= 0 && d <= 6)
    .sort((a, b) => a - b);

  let daysLabel = 'Todos os dias';
  if (uniqueDays.length === 7) {
    daysLabel = 'Todos os dias';
  } else if (uniqueDays.length === 0) {
    daysLabel = 'Fechado';
  } else {
    // Check if contiguous range (including Mon..Sat = 1..6)
    const isContiguous = uniqueDays.every(
      (d, idx) => idx === 0 || d === uniqueDays[idx - 1] + 1,
    );
    if (isContiguous && uniqueDays.length >= 3) {
      const first = WEEKDAY_OPTIONS[uniqueDays[0]]?.short ?? '';
      const last =
        WEEKDAY_OPTIONS[uniqueDays[uniqueDays.length - 1]]?.short ?? '';
      daysLabel = `${first} a ${last}`;
    } else {
      daysLabel = uniqueDays
        .map((d) => WEEKDAY_OPTIONS[d]?.short ?? '')
        .filter(Boolean)
        .join(', ');
    }
  }

  const validShifts = shifts.filter((s) => s.open && s.close);
  if (validShifts.length === 0) {
    return daysLabel;
  }

  const shiftsLabel = validShifts
    .map((s) => `${s.open} às ${s.close}`)
    .join(' e ');

  return `${daysLabel} · ${shiftsLabel}`;
}

export function getStoreAvailability(
  store: Pick<
    StoreSettings,
    'isOpen' | 'openingHours' | 'openingSchedule' | 'autoScheduleEnabled' | 'timezone'
  >,
  now: Date = new Date(),
): StoreAvailabilityResult {
  const tz = store.timezone || DEFAULT_STORE_TIMEZONE;
  const { dayIndex, minutesOfDay, formattedTime } = getCurrentTimeInTimezone(
    now,
    tz,
  );
  const parsedSchedule = scheduleToParsed(
    store.openingSchedule,
    store.openingHours,
  );

  if (!store.isOpen) {
    return {
      isOpen: false,
      statusMode: 'closed_manual',
      statusLabel: 'Fechado no momento',
      adminBadgeLabel: 'Loja Fechada (Manual)',
      closedReason: `A loja está fechada temporariamente pelo estabelecimento. Horário normal: ${store.openingHours}.`,
      currentTimeLabel: formattedTime,
      currentDayIndex: dayIndex,
      parsedSchedule,
    };
  }

  const autoEnabled = store.autoScheduleEnabled !== false;
  if (!autoEnabled || !parsedSchedule) {
    return {
      isOpen: true,
      statusMode: 'open',
      statusLabel: 'Aberto agora',
      adminBadgeLabel: 'Loja Aberta',
      closedReason: '',
      currentTimeLabel: formattedTime,
      currentDayIndex: dayIndex,
      parsedSchedule,
    };
  }

  const withinHours = isWithinParsedSchedule(
    parsedSchedule,
    dayIndex,
    minutesOfDay,
  );

  if (!withinHours) {
    return {
      isOpen: false,
      statusMode: 'closed_schedule',
      statusLabel: 'Fechado agora',
      adminBadgeLabel: 'Fechada (Fora do Horário)',
      closedReason: `A loja está fechada agora (${formattedTime}). Horário de atendimento: ${store.openingHours}.`,
      currentTimeLabel: formattedTime,
      currentDayIndex: dayIndex,
      parsedSchedule,
    };
  }

  return {
    isOpen: true,
    statusMode: 'open',
    statusLabel: 'Aberto agora',
    adminBadgeLabel: 'Loja Aberta',
    closedReason: '',
    currentTimeLabel: formattedTime,
    currentDayIndex: dayIndex,
    parsedSchedule,
  };
}
