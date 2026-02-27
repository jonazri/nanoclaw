/**
 * Generate Shabbat and Yom Tov schedule for NanoClaw.
 *
 * Uses @hebcal/core to compute shkiya and tzeis times.
 * Outputs a flat JSON file of restricted windows to data/shabbat-schedule.json.
 *
 * Standalone script — install @hebcal/core first:
 *   npm install --no-save @hebcal/core
 *   SHABBAT_LAT=... SHABBAT_LNG=... SHABBAT_TIMEZONE=... npx tsx scripts/generate-zmanim.ts
 */
import fs from 'fs';
import path from 'path';
import { GeoLocation, Zmanim, HebrewCalendar, flags } from '@hebcal/core';

// Required: SHABBAT_LAT, SHABBAT_LNG, SHABBAT_TIMEZONE
// Optional: SHABBAT_LOCATION, SHABBAT_ELEVATION (default 0), SHABBAT_IL (default false),
//           SHABBAT_BUFFER (default 18 min), SHABBAT_YEARS (default 5)
if (!process.env.SHABBAT_LAT || !process.env.SHABBAT_LNG) {
  console.error(
    'Error: SHABBAT_LAT and SHABBAT_LNG environment variables are required.',
  );
  console.error(
    'Example: SHABBAT_LAT=31.778 SHABBAT_LNG=35.235 SHABBAT_TIMEZONE=Asia/Jerusalem SHABBAT_IL=true npm run generate-zmanim',
  );
  process.exit(1);
}
if (!process.env.SHABBAT_TIMEZONE) {
  console.error('Error: SHABBAT_TIMEZONE environment variable is required.');
  console.error(
    'Examples: America/New_York, America/Los_Angeles, Asia/Jerusalem, Europe/London',
  );
  process.exit(1);
}

const LAT = parseFloat(process.env.SHABBAT_LAT);
const LNG = parseFloat(process.env.SHABBAT_LNG);
const ELEVATION = parseFloat(process.env.SHABBAT_ELEVATION || '0');
const LOCATION_NAME = process.env.SHABBAT_LOCATION || `${LAT}, ${LNG}`;
const TIMEZONE = process.env.SHABBAT_TIMEZONE;
const ISRAEL_MODE = process.env.SHABBAT_IL === 'true';
const YEARS_TO_GENERATE = parseInt(process.env.SHABBAT_YEARS || '5', 10);
const TZEIS_BUFFER_MINUTES = parseInt(process.env.SHABBAT_BUFFER || '18', 10);
const OUTPUT_PATH = path.resolve(
  process.cwd(),
  'data',
  'shabbat-schedule.json',
);

interface ShabbatWindow {
  start: string;
  end: string;
  type: 'shabbat' | 'yomtov' | 'shabbat+yomtov';
  label: string;
}

const geo = new GeoLocation(LOCATION_NAME, LAT, LNG, ELEVATION, TIMEZONE);

function getShkiya(date: Date): Date {
  const zmanim = new Zmanim(geo, date);
  return zmanim.sunset();
}

function getTzeisWithBuffer(date: Date): Date {
  const zmanim = new Zmanim(geo, date);
  const tzeis = zmanim.tzeit(8.5);
  return new Date(tzeis.getTime() + TZEIS_BUFFER_MINUTES * 60 * 1000);
}

function generateWindows(startYear: number, endYear: number): ShabbatWindow[] {
  const rawWindows: ShabbatWindow[] = [];

  // Shabbat windows: Friday sunset → Saturday night
  const startDate = new Date(startYear, 0, 1);
  const endDate = new Date(endYear + 1, 0, 1);

  for (let d = new Date(startDate); d < endDate; d.setDate(d.getDate() + 1)) {
    if (d.getDay() === 5) {
      const friday = new Date(d);
      const saturday = new Date(d);
      saturday.setDate(saturday.getDate() + 1);
      rawWindows.push({
        start: getShkiya(friday).toISOString(),
        end: getTzeisWithBuffer(saturday).toISOString(),
        type: 'shabbat',
        label: 'Shabbat',
      });
    }
  }

  // Yom Tov windows
  for (let year = startYear; year <= endYear; year++) {
    const events = HebrewCalendar.calendar({
      year,
      isHebrewYear: false,
      il: ISRAEL_MODE,
      mask: flags.CHAG,
    });

    for (const ev of events) {
      const gregDate = ev.getDate().greg();
      const erev = new Date(gregDate);
      erev.setDate(erev.getDate() - 1);
      rawWindows.push({
        start: getShkiya(erev).toISOString(),
        end: getTzeisWithBuffer(gregDate).toISOString(),
        type: 'yomtov',
        label: ev.getDesc(),
      });
    }
  }

  // Sort and merge overlapping windows
  rawWindows.sort(
    (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
  );

  const merged: ShabbatWindow[] = [];
  for (const w of rawWindows) {
    const last = merged[merged.length - 1];
    if (last && new Date(w.start).getTime() <= new Date(last.end).getTime()) {
      if (new Date(w.end).getTime() > new Date(last.end).getTime()) {
        last.end = w.end;
      }
      if (last.type !== w.type) last.type = 'shabbat+yomtov';
      last.label = `${last.label} / ${w.label}`;
    } else {
      merged.push({ ...w });
    }
  }

  return merged;
}

const now = new Date();
const startYear = now.getFullYear();
const endYear = startYear + YEARS_TO_GENERATE - 1;

console.log(
  `Generating Shabbat/Yom Tov schedule for ${startYear}-${endYear}...`,
);
console.log(`Location: ${LOCATION_NAME} (${LAT}, ${LNG})`);
console.log(`Yom Tov: ${ISRAEL_MODE ? 'Israel (1 day)' : 'Diaspora (2 days)'}`);

const windows = generateWindows(startYear, endYear);

const schedule = {
  location: LOCATION_NAME,
  coordinates: [LAT, LNG],
  elevation: ELEVATION,
  timezone: TIMEZONE,
  israelMode: ISRAEL_MODE,
  tzeisBufferMinutes: TZEIS_BUFFER_MINUTES,
  generatedAt: now.toISOString(),
  expiresAt: new Date(endYear + 1, 0, 1).toISOString(),
  windowCount: windows.length,
  windows,
};

fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
fs.writeFileSync(OUTPUT_PATH, JSON.stringify(schedule, null, 2));

console.log(`Generated ${windows.length} windows`);
console.log(`Written to ${OUTPUT_PATH}`);
console.log(`Schedule valid until ${schedule.expiresAt}`);
