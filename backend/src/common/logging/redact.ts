/** Keys whose values must never reach a log line. Matched case-insensitively on the key name. */
const SENSITIVE_KEY =
  /(code|otp|signature|password|secret|token|authorization|credential|hash|sample|embedding|template|apikey|api_key|privatekey|publickey)/i;

/**
 * Whole key names (not substrings) that carry personal or financial identifiers:
 * identity numbers, the selfie, PINs, birth dates, addresses and account numbers.
 */
const SENSITIVE_EXACT_KEY =
  /^(bvn|nin|national_?id|selfie|pin|currentpin|dateofbirth|date_of_birth|dob|address|accountnumber|account_number|cacnumber|tin)$/i;

/** Contain "code" but are public bank ids, not secrets: kept readable so lookups can be debugged. */
const SAFE_KEY = /^(bankcode|settlementbankcode|sortcode)$/i;

const MAX_STRING = 200;

/**
 * Copies a JSON-like value for logging: sensitive keys are replaced, long
 * strings (images, audio, base64) are truncated, depth and size are bounded.
 */
export function redactForLog(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    return value.length > MAX_STRING
      ? `${value.slice(0, MAX_STRING)}…[${value.length} chars]`
      : value;
  }
  if (typeof value !== 'object') return value;
  if (depth >= 4) return '[nested]';
  if (Array.isArray(value)) {
    const items = value.slice(0, 10).map((v) => redactForLog(v, depth + 1));
    return value.length > 10 ? [...items, `…[${value.length - 10} more]`] : items;
  }
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    out[key] =
      !SAFE_KEY.test(key) && (SENSITIVE_KEY.test(key) || SENSITIVE_EXACT_KEY.test(key))
        ? '[redacted]'
        : redactForLog(v, depth + 1);
  }
  return out;
}

/** Strips values of sensitive query parameters from a URL path for logging. */
export function redactUrl(url: string): string {
  const [path, query] = url.split('?');
  if (!query) return path;
  const cleaned = query
    .split('&')
    .map((pair) => {
      const [k, v = ''] = pair.split('=');
      return SENSITIVE_KEY.test(k) || SENSITIVE_EXACT_KEY.test(k)
        ? `${k}=[redacted]`
        : `${k}=${v.slice(0, 60)}`;
    })
    .join('&');
  return `${path}?${cleaned}`;
}
