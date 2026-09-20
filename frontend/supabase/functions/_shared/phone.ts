export const FULL_PHONE_PATTERN = /^\+[1-9]\d{7,14}$/;

export function normalizeFullPhone(value: unknown): string | null {
  const compact = String(value ?? "").trim().replace(/[\s()-]/g, "");
  const international = compact.startsWith("00") ? `+${compact.slice(2)}` : compact;
  return FULL_PHONE_PATTERN.test(international) ? international : null;
}

export const FULL_PHONE_ERROR = "Full phone number is required in international format, for example +8801712345678";

export const BANGLADESH_PHONE_ERROR = "Enter a valid Bangladesh mobile number, for example 01712345678";

export function normalizeBangladeshPhone(value: unknown): string | null {
  const compact = String(value ?? "").trim().replace(/[\s()-]/g, "");
  const local = compact.startsWith("+880") ? compact.slice(4) : compact.startsWith("880") ? compact.slice(3) : compact;
  if (!/^01[3-9]\d{8}$/.test(local)) return null;
  return `+880${local.slice(1)}`;
}
