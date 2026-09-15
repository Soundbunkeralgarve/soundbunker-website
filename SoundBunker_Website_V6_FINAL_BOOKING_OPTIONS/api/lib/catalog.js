export const TIME_ZONE = "Europe/Lisbon";
export const sessions = {
  "recording-2h": { name: "Recording with engineer · 2 hours", price: 250, deposit: 100, hours: 2, group:"recording" },
  "recording-4h": { name: "Recording with engineer · 4 hours", price: 450, deposit: 100, hours: 4, group:"recording" },
  "recording-day": { name: "Recording with engineer · Full day", price: 675, deposit: 100, hours: 7, fullDay: true, group:"recording" },
  "hire-2h": { name: "Solo studio hire · 2 hours", price: 100, deposit: 50, hours: 2, group:"recording" },
  "hire-4h": { name: "Solo studio hire · 4 hours", price: 175, deposit: 75, hours: 4, group:"recording" },
  "hire-day": { name: "Solo studio hire · Full day", price: 275, deposit: 100, hours: 7, fullDay: true, group:"recording" },
  "production": { name: "Original-song production package · payment plan", price: 500, deposit: 100, hours: 3, group:"production" },
  "production-upfront": { name: "Original-song production package · one-off upfront deal", price: 450, deposit: 450, hours: 3, fullPayment: true, group:"production" },
  "remote-1h": { name: "Remote session · 1 hour", price: 175, deposit: 75, hours: 1, group:"voiceover" },
  "remote-half": { name: "Remote session · Half day", price: 600, deposit: 150, hours: 4, halfDay: true, group:"voiceover" },
  "remote-day": { name: "Remote session · Full day", price: 1000, deposit: 250, hours: 7, fullDay: true, group:"voiceover" },
  "photo-mini": { name: "Photography Mini · 30 min", price: 120, deposit: 50, hours: 0.5, group:"photography" },
  "photo-signature": { name: "Photography Signature · 1 hour", price: 220, deposit: 75, hours: 1, group:"photography" },
  "photo-premium": { name: "Photography Premium · 90 min", price: 310, deposit: 100, hours: 1.5, group:"photography" },
  "photo-branding": { name: "Business branding · 1 hour", price: 280, deposit: 100, hours: 1, group:"photography" },
  "party-birthday": { name: "Birthday party · up to 15 children", price: 550, deposit: 100, hours: 3, partySlots: true, group:"parties" },
  "party-henstag": { name: "Hen / stag studio party · from", price: 650, deposit: 100, hours: 3, partySlots: true, group:"parties" },
  "mix-12": { name: "Mixing · up to 12 channels", price: 125, deposit: 125, hours: 0, noSlot: true, fullPayment: true, group:"mixing" },
  "mix-24": { name: "Mixing · up to 24 channels", price: 185, deposit: 185, hours: 0, noSlot: true, fullPayment: true, group:"mixing" },
  "mix-48": { name: "Mixing · up to 48 channels", price: 270, deposit: 270, hours: 0, noSlot: true, fullPayment: true, group:"mixing" },
  "master": { name: "Mastering", price: 75, deposit: 75, hours: 0, noSlot: true, fullPayment: true, group:"mixing" },
  "mixmaster-12": { name: "Mix + master · up to 12 channels", price: 185, deposit: 185, hours: 0, noSlot: true, fullPayment: true, group:"mixing" },
  "mixmaster-24": { name: "Mix + master · up to 24 channels", price: 245, deposit: 245, hours: 0, noSlot: true, fullPayment: true, group:"mixing" },
  "mixmaster-48": { name: "Mix + master · up to 48 channels", price: 335, deposit: 335, hours: 0, noSlot: true, fullPayment: true, group:"mixing" }
};

export function nominalSlots(date, session) {
  if (session.noSlot) return [];
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  if (session.partySlots) return ["10:00", "15:00"];
  if (session.fullDay) return day >= 1 && day <= 5 ? ["10:00"] : [];
  if (session.halfDay) return day >= 1 && day <= 5 ? ["10:00"] : [];
  if (day === 6) return session.hours <= 2 ? ["16:00"] : [];
  if (day === 0) return session.hours <= 4 ? ["10:00"] : [];
  return ["10:00", "13:00", "16:00"];
}
export function getSession(id) { return sessions[id] || null; }
export function isIsoDate(value) { return /^\d{4}-\d{2}-\d{2}$/.test(value || "") && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)); }
export function addHours(date, time, hours) { const [hour, minute] = time.split(":").map(Number); const start = new Date(`${date}T00:00:00Z`); start.setUTCHours(hour, minute, 0, 0); const end = new Date(start.getTime() + hours * 60 * 60 * 1000); return `${String(end.getUTCHours()).padStart(2, "0")}:${String(end.getUTCMinutes()).padStart(2, "0")}`; }
