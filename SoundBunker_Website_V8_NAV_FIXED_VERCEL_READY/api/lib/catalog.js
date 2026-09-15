export const TIME_ZONE = "Europe/Lisbon";
export const sessions = {
  "recording-2h": { name: "Recording with engineer · 2 hours", price: 250, deposit: 100, hours: 2 },
  "recording-4h": { name: "Recording with engineer · 4 hours", price: 450, deposit: 100, hours: 4 },
  "recording-day": { name: "Recording with engineer · Full day", price: 675, deposit: 100, hours: 7, fullDay: true },
  "hire-2h": { name: "Studio hire · 2 hours", price: 100, deposit: 100, hours: 2 },
  "hire-4h": { name: "Studio hire · 4 hours", price: 175, deposit: 100, hours: 4 },
  "hire-day": { name: "Studio hire · Full day", price: 275, deposit: 100, hours: 7, fullDay: true }
};

export function nominalSlots(date, session) {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  if (session.fullDay) return day >= 1 && day <= 5 ? ["10:00"] : [];
  if (day === 6) return session.hours === 2 ? ["16:00"] : [];
  if (day === 0) return session.hours === 2 || session.hours === 4 ? ["10:00"] : [];
  return ["10:00", "13:00", "16:00"];
}

export function getSession(id) {
  return sessions[id] || null;
}

export function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || "") && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

export function addHours(date, time, hours) {
  const [hour, minute] = time.split(":").map(Number);
  const start = new Date(`${date}T00:00:00Z`);
  start.setUTCHours(hour, minute, 0, 0);
  const end = new Date(start.getTime() + hours * 60 * 60 * 1000);
  return `${String(end.getUTCHours()).padStart(2, "0")}:${String(end.getUTCMinutes()).padStart(2, "0")}`;
}
