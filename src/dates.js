// Google Tasks stores only the date part of `due`, as midnight UTC.

function pad(n) {
  return String(n).padStart(2, "0");
}

function ymd(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

// Turns "today", "tomorrow", "+3", "fri", or "2026-12-01" into YYYY-MM-DD.
export function parseDue(input, now = new Date()) {
  const s = String(input).trim().toLowerCase();
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (s === "today") return ymd(day);
  if (s === "tomorrow" || s === "tmrw") {
    day.setDate(day.getDate() + 1);
    return ymd(day);
  }
  const offset = s.match(/^\+(\d+)d?$/);
  if (offset) {
    day.setDate(day.getDate() + Number(offset[1]));
    return ymd(day);
  }
  const weekday = WEEKDAYS.findIndex((w) => s.length >= 3 && w.startsWith(s));
  if (weekday !== -1) {
    const ahead = (weekday - day.getDay() + 7) % 7 || 7;
    day.setDate(day.getDate() + ahead);
    return ymd(day);
  }
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    if (ymd(d) === s) return s;
  }
  throw new Error(`Can't read due date "${input}". Use today, tomorrow, +N, a weekday, or YYYY-MM-DD.`);
}

export function toApiDue(input, now) {
  return `${parseDue(input, now)}T00:00:00.000Z`;
}

export function fromApiDue(due) {
  return due ? due.slice(0, 10) : null;
}
