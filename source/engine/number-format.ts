// Licensed under the GNU General Public License v2 or later. See LICENSE.
// Excel's number formats (2026-11-17), so that a workbook's cells read as Excel shows them: 0.00, #,##0, 0%, 0.00E+00,
// # ?/?, currency and literal text, sections for positive, negative and zero, dates and times, and elapsed times. Only
// the text shown changes; a cell keeps its exact value for plotting. A format this cannot read shows the value as
// General does. Built-in formats that follow the computer's locale (short date, 14 and 22) are left to the ISO form.

/** The built-in formats by id (ECMA-376 18.8.30), those that are the same in every locale. */
export const BUILT_IN_FORMATS: Readonly<Record<number, string>> = {
  0: "General", 1: "0", 2: "0.00", 3: "#,##0", 4: "#,##0.00", 9: "0%", 10: "0.00%", 11: "0.00E+00", 12: "# ?/?", 13: "# ??/??",
  15: "d-mmm-yy", 16: "d-mmm", 17: "mmm-yy", 18: "h:mm AM/PM", 19: "h:mm:ss AM/PM", 20: "h:mm", 21: "h:mm:ss",
  37: "#,##0 ;(#,##0)", 38: "#,##0 ;(#,##0)", 39: "#,##0.00;(#,##0.00)", 40: "#,##0.00;(#,##0.00)", 45: "mm:ss", 46: "[h]:mm:ss",
  47: "mm:ss.0", 48: "##0.0E+0", 49: "@",
};

/** A number as Excel's General shows it: integers whole, others to 10 significant figures, very large or small in E. */
export function generalNumber(value: number): string {
  if (!Number.isFinite(value)) return value > 0 ? "∞" : value < 0 ? "−∞" : "NaN";
  if (value === 0) return "0";
  const size = Math.abs(value);
  if (size >= 1e11 || size < 1e-9) {
    const [mantissa, exponent] = value.toExponential(5).split("e");
    return `${String(Number(mantissa))}E${Number(exponent) < 0 ? "-" : "+"}${String(Math.abs(Number(exponent))).padStart(2, "0")}`;
  }
  return String(Number(value.toPrecision(10)));
}

/** A format's sections, split at semicolons outside quotes, escapes and brackets. */
function sections(code: string): string[] {
  const out: string[] = [];
  let current = "", quoted = false, bracket = false;
  for (let i = 0; i < code.length; i++) {
    const ch = code[i];
    if (ch === "\\" && !quoted && i + 1 < code.length) { current += ch + code[++i]; continue; }
    if (ch === '"') quoted = !quoted;
    else if (!quoted && ch === "[") bracket = true;
    else if (!quoted && ch === "]") bracket = false;
    if (ch === ";" && !quoted && !bracket) { out.push(current); current = ""; continue; }
    current += ch;
  }
  out.push(current);
  return out;
}

/** A section's parts: literal text, and the format's own characters, with colours and conditions taken out. */
type Part = { literal: string } | { code: string };
function parts(section: string): Part[] {
  const out: Part[] = [];
  const literal = (text: string) => { const last = out.at(-1); if (last && "literal" in last) last.literal += text; else out.push({ literal: text }); };
  for (let i = 0; i < section.length; i++) {
    const ch = section[i];
    if (ch === '"') { const end = section.indexOf('"', i + 1); literal(section.slice(i + 1, end < 0 ? undefined : end)); i = end < 0 ? section.length : end; }
    else if (ch === "\\") literal(section[++i] ?? "");
    else if (ch === "_") { i++; literal(" "); }
    else if (ch === "*") i++;
    else if (ch === "[") {
      const end = section.indexOf("]", i), inside = section.slice(i + 1, end < 0 ? undefined : end);
      // A currency or locale ([$€-407]) keeps its symbol; elapsed time ([h]) is the format's own; colours and conditions go.
      if (/^\$/.test(inside)) literal(inside.slice(1).split("-")[0]);
      else if (/^(h+|m+|s+)$/i.test(inside)) out.push({ code: `[${inside}]` });
      i = end < 0 ? section.length : end;
    } else if ("0#?.,%Ee/".includes(ch) || ("+-".includes(ch) && /[Ee]/.test(section[i - 1] ?? "")) || /[dmyhsAP]/i.test(ch) || ch === "@") {
      const last = out.at(-1);
      if (last && "code" in last) last.code += ch; else out.push({ code: ch });
    } else literal(ch);
  }
  return out;
}

const isDatePart = (code: string) => /[dmyhs]|AM\/PM|A\/P|\[(h+|m+|s+)\]/i.test(code.replace(/E[+-]/g, ""));

/**
 * A number in a format code, as Excel shows it; null when the code is General or cannot be read (the cell is then
 * shown as General). The section is chosen by sign: positive, negative (written without its sign), zero.
 */
export function formatNumber(value: number, code: string): string | null {
  if (!Number.isFinite(value) || !code || /^general$/i.test(code.trim())) return null;
  const all = sections(code);
  const conditional = /\[[<>=]/.test(code);
  let section = all[0], negative = value < 0;
  if (!conditional) {
    if (value < 0 && all.length > 1) { section = all[1]; negative = false; value = -value; }
    else if (value === 0 && all.length > 2) section = all[2];
  }
  if (/^\s*general\s*$/i.test(section.replace(/\[[^\]]*\]/g, ""))) return (negative ? "-" : "") + generalNumber(Math.abs(value));
  const pieces = parts(section);
  const codes = pieces.filter((piece): piece is { code: string } => "code" in piece).map((piece) => piece.code).join("");
  if (!codes || codes === "@") return pieces.map((piece) => ("literal" in piece ? piece.literal : "")).join("") || null;
  if (isDatePart(codes)) return formatElapsedOrDate(value, pieces, true);
  return numberPattern(negative ? -value : value, pieces, negative);
}

/** The number written by a numeric section's placeholders, with its literals around it. */
function numberPattern(value: number, pieces: readonly Part[], negative: boolean): string | null {
  const joined = pieces.map((piece) => ("code" in piece ? piece.code : "\u0000")).join("");
  const percent = (joined.match(/%/g) ?? []).length;
  value *= 100 ** percent;
  // The digits' pattern: from the first placeholder to the last, through the decimal point, commas and an exponent.
  const match = /[0#?][0#?,]*(\.[0#?]*)?(E[+-][0#]+)?|\.[0#?]+(E[+-][0#]+)?/.exec(joined);
  if (!match) return null;
  let pattern = match[0];
  const spaced = joined.replace(/\u0000/g, " ");
  if (/[0#?]\s*\/\s*([0#?]|\d)/.test(spaced)) return writeLiterals(pieces, formatFraction(value, spaced), negative);
  let body: string;
  const scale = /,+(?=$|\.|E)/.exec(pattern);
  if (scale) { value /= 1000 ** scale[0].length; pattern = pattern.replace(/,+(?=$|\.|E)/, ""); }
  const exponent = /E([+-])([0#]+)$/.exec(pattern);
  const main = exponent ? pattern.slice(0, exponent.index) : pattern;
  const [integerPart, decimalPart = ""] = main.split(".");
  const decimals = decimalPart.replace(/[^0#?]/g, "").length, zeros = (decimalPart.match(/0/g) ?? []).length;
  const integerDigits = (integerPart.replace(/,/g, "").match(/0/g) ?? []).length;
  const grouped = /[0#?],[0#?]/.test(integerPart);
  let power = 0;
  if (exponent && value !== 0) {
    const places = Math.max(1, integerPart.replace(/,/g, "").length);
    power = Math.floor(Math.log10(Math.abs(value)));
    if (places > 1 && integerPart.includes("#")) power = Math.floor(power / places) * places; // engineering: ##0.0E+0
    else power -= Math.max(1, integerDigits) - 1;
    value /= 10 ** power;
  }
  let [whole, part = ""] = fixed(Math.abs(value), decimals).split(".");
  if (exponent && value !== 0 && Number(whole) >= 10 ** Math.max(1, integerPart.replace(/,/g, "").length) && !integerPart.includes("#")) {
    power += 1; [whole, part = ""] = fixed(Math.abs(value) / 10, decimals).split(".");
  }
  while (part.length > zeros && part.endsWith("0")) part = part.slice(0, -1);
  if (whole === "0" && integerDigits === 0) whole = "";
  whole = whole.padStart(integerDigits, "0");
  if (grouped) whole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  // Decimals: as many as the zeros, then any the #s need; a point with none after it stays, as Excel writes 0.## of 5.
  body = whole + (decimals || main.includes(".") ? `.${part.padEnd(zeros, "0")}` : "");
  if (exponent) {
    const sign = power < 0 ? "-" : exponent[1] === "+" ? "+" : "";
    body += `E${sign}${String(Math.abs(power)).padStart(exponent[2].length, "0")}`;
  }
  if (!body) body = "0";
  return writeLiterals(pieces, body, negative && Number(body.replace(/[^\d.]/g, "")) !== 0);
}

/**
 * A value to so many decimals as Excel rounds it: on its decimal digits (15 significant, as Excel keeps), half away
 * from zero, so 0.95 is 1.0 where binary rounding (toFixed) gives 0.9.
 */
export function fixed(value: number, decimals: number): string {
  if (decimals > 15 || Math.abs(value) >= 1e15) return value.toFixed(Math.min(decimals, 20));
  const scaled = Math.round(Number((Math.abs(value) * 10 ** decimals).toPrecision(15)));
  const digits = String(scaled).padStart(decimals + 1, "0");
  const text = decimals ? `${digits.slice(0, -decimals)}.${digits.slice(-decimals)}` : digits;
  return value < 0 && scaled !== 0 ? `-${text}` : text;
}

/** A value as the nearest fraction with as many denominator digits as the format has (or a fixed denominator). */
function formatFraction(value: number, joined: string): string {
  const match = /(?:([0#?]+)\s+)?([0#?]+)\s*\/\s*([0#?]+|\d+)/.exec(joined)!;
  const mixed = match[1] !== undefined, fixed = /^\d+$/.test(match[3]) ? Number(match[3]) : null;
  const size = Math.abs(value), whole = mixed ? Math.floor(size) : 0, rest = size - whole;
  let best = { n: Math.round(rest), d: 1 };
  if (fixed) best = { n: Math.round(rest * fixed), d: fixed };
  else {
    const most = 10 ** match[3].length - 1;
    let error = Infinity;
    for (let d = 1; d <= most; d++) { const n = Math.round(rest * d), e = Math.abs(rest - n / d); if (e < error - 1e-12) { error = e; best = { n, d }; } }
  }
  if (best.n === best.d && mixed) return `${whole + 1}`;
  if (best.n === 0) return mixed ? `${whole}` : "0";
  return `${mixed && whole ? `${whole} ` : ""}${best.n}/${best.d}`;
}

/**
 * The number with the section's literals: those before its first placeholder, then the number with any percent signs
 * among its placeholders, then those after the last; the sign before all, as Excel writes -$5.
 */
function writeLiterals(pieces: readonly Part[], body: string, negative: boolean): string {
  const numeric = pieces.flatMap((piece, index) => ("code" in piece && /[0#?]/.test(piece.code) ? [index] : []));
  if (!numeric.length) return (negative ? "-" : "") + body;
  const first = numeric[0], last = numeric[numeric.length - 1];
  const text = (piece: Part) => ("literal" in piece ? piece.literal : piece.code.replace(/[^%]/g, ""));
  const before = pieces.slice(0, first).map(text).join(""), after = pieces.slice(last + 1).map(text).join("");
  const percents = pieces.slice(first, last + 1).map((piece) => ("code" in piece ? piece.code.replace(/[^%]/g, "") : "")).join("");
  return (negative ? "-" : "") + before + body + percents + after;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * A date (milliseconds since 1970, UTC) in a format code, as Excel shows it; null when the code shows no date or time,
 * or is a locale's short date (left to the ISO form).
 */
export function formatDateCode(ms: number, code: string): string | null {
  if (!code || /^general$/i.test(code.trim())) return null;
  const section = sections(code)[0];
  const pieces = parts(section);
  if (!pieces.some((piece) => "code" in piece && isDatePart(piece.code))) return null;
  return formatElapsedOrDate(ms, pieces, false);
}

/** Date and time tokens: a date from milliseconds, or an elapsed time from a number of days ([h]:mm:ss). */
function formatElapsedOrDate(input: number, pieces: readonly Part[], fromDays: boolean): string | null {
  const ms = fromDays ? Math.round(input * 86400000) : input;
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return null;
  const tokens: (string | { token: string })[] = [];
  for (const piece of pieces) {
    if ("literal" in piece) { tokens.push(piece.literal); continue; }
    const found = piece.code.match(/\[(h+|m+|s+)\]|AM\/PM|A\/P|y+|m+|d+|h+|s+(\.0+)?|[^ymdhs]/gi) ?? [];
    for (const token of found) tokens.push(/^[ymdhs[]|AM\/PM|A\/P/i.test(token) ? { token } : token);
  }
  const twelve = tokens.some((token) => typeof token !== "string" && /AM\/PM|A\/P/i.test(token.token));
  const pad = (n: number, width: number) => String(n).padStart(width, "0");
  const hours = date.getUTCHours(), totalSeconds = Math.floor(Math.abs(ms) / 1000);
  let out = "";
  tokens.forEach((token, index) => {
    if (typeof token === "string") { out += token; return; }
    const t = token.token, lower = t.toLowerCase();
    // m is minutes after an hour or before a second, else the month.
    const near = (step: number, test: RegExp) => { for (let j = index + step; j >= 0 && j < tokens.length; j += step) { const other = tokens[j]; if (typeof other !== "string") return test.test(other.token); } return false; };
    if (lower.startsWith("[h")) out += pad(Math.floor(totalSeconds / 3600), lower.length - 2);
    else if (lower.startsWith("[m")) out += pad(Math.floor(totalSeconds / 60), lower.length - 2);
    else if (lower.startsWith("[s")) out += pad(totalSeconds, lower.length - 2);
    else if (lower === "am/pm") out += hours < 12 ? "AM" : "PM";
    else if (lower === "a/p") out += hours < 12 ? "A" : "P";
    else if (lower[0] === "y") out += lower.length <= 2 ? pad(date.getUTCFullYear() % 100, 2) : String(date.getUTCFullYear());
    else if (lower[0] === "d") out += lower.length === 1 ? String(date.getUTCDate()) : lower.length === 2 ? pad(date.getUTCDate(), 2) : lower.length === 3 ? DAYS[date.getUTCDay()].slice(0, 3) : DAYS[date.getUTCDay()];
    else if (lower[0] === "h") { const h = twelve ? (hours % 12 || 12) : hours; out += lower.length >= 2 ? pad(h, 2) : String(h); }
    else if (lower[0] === "s") {
      const [whole, fraction] = lower.split(".");
      out += pad(date.getUTCSeconds(), whole.length >= 2 ? 2 : 1);
      if (fraction) out += `.${pad(Math.floor((date.getUTCMilliseconds() / 1000) * 10 ** fraction.length), fraction.length)}`;
    } else if (lower[0] === "m") {
      const minutes = near(-1, /^h|^\[h/i) || near(1, /^s/i);
      if (minutes) out += lower.length >= 2 ? pad(date.getUTCMinutes(), 2) : String(date.getUTCMinutes());
      else out += lower.length === 1 ? String(date.getUTCMonth() + 1) : lower.length === 2 ? pad(date.getUTCMonth() + 1, 2)
        : lower.length === 3 ? MONTHS[date.getUTCMonth()].slice(0, 3) : lower.length === 5 ? MONTHS[date.getUTCMonth()][0] : MONTHS[date.getUTCMonth()];
    } else out += t;
  });
  return out;
}
