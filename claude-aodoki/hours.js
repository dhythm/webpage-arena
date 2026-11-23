export const DAYS = ["日", "月", "火", "水", "木", "金", "土"];

export const HOLIDAYS = new Set([
  "2026-01-01", "2026-01-12", "2026-02-11", "2026-02-23", "2026-03-20", "2026-04-29",
  "2026-05-03", "2026-05-04", "2026-05-05", "2026-05-06", "2026-07-20", "2026-08-11",
  "2026-09-21", "2026-09-22", "2026-09-23", "2026-10-12", "2026-11-03", "2026-11-23",
  "2027-01-01", "2027-01-11", "2027-02-11", "2027-02-23", "2027-03-21", "2027-03-22",
  "2027-04-29", "2027-05-03", "2027-05-04", "2027-05-05", "2027-07-19", "2027-08-11",
  "2027-09-20", "2027-09-23", "2027-10-11", "2027-11-03", "2027-11-23",
]);

const SLOT_STEP = 30;
const WEEKDAY = [{ name: "夜", open: 1050, close: 1350, last: 1320 }];
const WEEKEND = [
  { name: "昼", open: 690, close: 840, last: 810 },
  { name: "夜", open: 1020, close: 1290, last: 1260 },
];

const pad = (n) => String(n).padStart(2, "0");
export const hm = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
export const toMin = (t) => {
  const [h, mi] = t.split(":").map(Number);
  return h * 60 + mi;
};
export const minuteOf = (d) => d.getHours() * 60 + d.getMinutes();
export const dateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const dayLabel = (d) => `${d.getMonth() + 1}月${d.getDate()}日（${DAYS[d.getDay()]}）`;
export const startOfDay = (d, plus = 0) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + plus);
export const sameDay = (a, b) => dateKey(a) === dateKey(b);

export const parseNow = (value) => {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : new Date(value.getTime());
  if (typeof value === "string" && value) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
};

export const isHoliday = (d) => HOLIDAYS.has(dateKey(d));
export const isThirdTuesday = (d) => d.getDay() === 2 && d.getDate() >= 15 && d.getDate() <= 21;
export const isClosedDay = (d) => d.getDay() === 1 || isThirdTuesday(d);
export const isWeekendSchedule = (d) => d.getDay() === 0 || d.getDay() === 6 || isHoliday(d);

export const sessions = (d) => {
  if (isClosedDay(d)) return [];
  return (isWeekendSchedule(d) ? WEEKEND : WEEKDAY).map((s) => ({ ...s }));
};

export const slotsFor = (d) =>
  sessions(d).map((s) => {
    const times = [];
    for (let m = s.open; m <= s.last; m += SLOT_STEP) times.push(hm(m));
    return { name: s.name, times };
  });

export const dateOptions = (now, count = 10) => {
  const out = [];
  const m = minuteOf(now);
  for (let i = 0; out.length < count && i < 31; i++) {
    const d = startOfDay(now, i);
    const s = sessions(d);
    if (!s.length) continue;
    if (i === 0 && m >= s.at(-1).last) continue;
    out.push({ key: dateKey(d), date: d, label: `${dayLabel(d)}${i === 0 ? "　今日" : ""}` });
  }
  return out;
};

export const nextOpening = (from) => {
  for (let i = 1; i <= 14; i++) {
    const d = startOfDay(from, i);
    const s = sessions(d);
    if (!s.length) continue;
    const when = i === 1 ? "明日" : i < 7 ? `${DAYS[d.getDay()]}曜` : dayLabel(d);
    return `${when}の ${hm(s[0].open)}`;
  }
  return "";
};

export const statusText = (now) => {
  const m = minuteOf(now);
  const s = sessions(now);
  const current = s.find((x) => m >= x.open && m < x.close);
  const later = s.find((x) => m < x.open);
  const clock = `いま ${hm(m)}。`;
  let text;
  if (!s.length) text = `今日（${DAYS[now.getDay()]}曜）はお休みです。次は${nextOpening(now)} から。`;
  else if (current && m > current.last)
    text = `${clock}最後の注文は締めました。のれんは ${hm(current.close)} まで出ています。`;
  else if (current) text = `${clock}のれん、出ています。最後の注文は ${hm(current.last)} です。`;
  else if (later && later !== s[0]) text = `${clock}昼の部はおしまいです。夜は ${hm(later.open)} にのれんを出します。`;
  else if (later) text = `${clock}今日は ${hm(later.open)} にのれんを出します。`;
  else text = `${clock}今日はもう閉めました。次は${nextOpening(now)} から。`;
  return { text, open: Boolean(current) };
};
