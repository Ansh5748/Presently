export type TimeZoneOption = {
  value: string;
  label: string;
  searchText: string;
};

const TZ_ALIASES: Record<string, string[]> = {
  'Asia/Kolkata': [
    'asia/calcutta',
    'india',
    'bharat',
    'ist',
    'kolkata',
    'calcutta',
    'mumbai',
    'bombay',
    'delhi',
    'new delhi',
    'bangalore',
    'bengaluru',
    'chennai',
    'madras',
    'hyderabad',
    'pune',
    'agra',
    'jaipur',
    'lucknow',
    'ahmedabad'
  ]
};

const NORMALIZE_MAP: Record<string, string> = {
  'Asia/Calcutta': 'Asia/Kolkata'
};

export const normalizeTimeZoneId = (id: string) => {
  const trimmed = (id || '').trim();
  if (!trimmed) return '';
  return NORMALIZE_MAP[trimmed] || trimmed;
};

const formatUtcOffset = (offsetMinutes: number) => {
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMinutes);
  const hours = Math.floor(abs / 60);
  const mins = abs % 60;
  const hh = hours.toString().padStart(2, '0');
  const mm = mins.toString().padStart(2, '0');
  return `${sign}${hh}:${mm}`;
};

const getTimeZoneOffsetMinutes = (timeZone: string) => {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'shortOffset',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).formatToParts(new Date());

    const raw = parts.find(part => part.type === 'timeZoneName')?.value || 'GMT';
    const match = raw.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/i);
    if (!match) return 0;

    const sign = match[1] === '-' ? -1 : 1;
    const hours = Number(match[2] || 0);
    const minutes = Number(match[3] || 0);
    return sign * (hours * 60 + minutes);
  } catch {
    return 0;
  }
};

const getTimeZoneLabel = (value: string) => {
  const offset = `UTC${formatUtcOffset(getTimeZoneOffsetMinutes(value))}`;
  const city = value.split('/').slice(-1)[0].replace(/_/g, ' ');
  return `${offset} ${value}${city && city !== value ? ` — ${city}` : ''}`;
};

const FALLBACK_TIME_ZONES = [
  'UTC',
  'Asia/Kolkata',
  'Asia/Dubai',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
  'Europe/London',
  'Europe/Paris',
  'America/New_York',
  'America/Los_Angeles',
  'America/Sao_Paulo',
  'Africa/Johannesburg'
];

let cached: TimeZoneOption[] | null = null;

export const getTimeZoneOptions = (): TimeZoneOption[] => {
  if (cached) return cached;

  const timeZoneIds = typeof Intl.supportedValuesOf === 'function'
    ? Intl.supportedValuesOf('timeZone')
    : FALLBACK_TIME_ZONES;

  const seen = new Set<string>();
  const options: TimeZoneOption[] = [];

  for (const value of timeZoneIds) {
    const normalized = normalizeTimeZoneId(value);
    if (!normalized) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);

    const aliases = TZ_ALIASES[normalized] || [];
    const label = getTimeZoneLabel(normalized);
    const searchText = [
      normalized,
      normalized.split('/').slice(-1)[0].replace(/_/g, ' '),
      ...aliases
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    options.push({ value: normalized, label, searchText });
  }

  options.sort((a, b) => a.label.localeCompare(b.label));
  cached = options;
  return options;
};

