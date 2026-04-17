/**
 * Utility to scrub sensitive data from text, preventing leaks.
 * 
 * @param rawText The string to be scrubbed.
 * @returns The scrubbed string, or an empty string if input is null/undefined.
 */
export function scrubSensitiveData(rawText: string | null | undefined | unknown): string {
  // Ensure robust handling of null or non-string inputs
  if (rawText == null || typeof rawText !== 'string') {
    return '';
  }

  let scrubbed = rawText;
  const REDACTED = '[REDACTED_BY_SENTINEL]';

  // 1. AWS Access Keys (AKIA for long-term, ASIA for temporary)
  const awsAccessKeyRegex = /\b(AKIA|ASIA)[0-9A-Z]{16}\b/g;
  scrubbed = scrubbed.replace(awsAccessKeyRegex, REDACTED);

  // 2. Standard Bearer/JWT tokens
  // JWT tokens format: eyJ...
  const jwtRegex = /\beyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\b/g;
  scrubbed = scrubbed.replace(jwtRegex, REDACTED);

  // Bearer tokens format: Bearer <token>
  const bearerRegex = /\b(Bearer\s+)([a-zA-Z0-9\-._~+/]+=*)/gi;
  scrubbed = scrubbed.replace(bearerRegex, `$1${REDACTED}`);

  // 3. Stripe API keys (pk_test, sk_live, rk_test, etc.)
  const stripeRegex = /\b(?:sk|pk|rk)_(?:test|live)_[a-zA-Z0-9]{24,}\b/g;
  scrubbed = scrubbed.replace(stripeRegex, REDACTED);

  // 4. Hardcoded passwords or secret strings
  // Matches assignments like password=..., DB_PASS: '...', secret_key="...", etc.
  const secretKeyRegex = /([a-zA-Z0-9_]*(?:password|passwd|pwd|secret|token|api_?key|db_?pass|oauth)[a-zA-Z0-9_]*\s*["']?\s*[:=]\s*["']?)([^"'\s;,<>]+)(["']?)/gi;
  
  scrubbed = scrubbed.replace(secretKeyRegex, (match, prefix, value, suffix) => {
    // Prevent double redaction if already scrubbed
    if (value === REDACTED) return match;
    
    // Ignore common boolean/null values that are sometimes assigned to flags
    const lowerVal = value.toLowerCase();
    if (['true', 'false', 'null', 'undefined'].includes(lowerVal)) return match;
    
    // Ignore very short numeric values (often just IDs, ports, or boolean flags)
    if (/^\d+$/.test(value) && value.length < 4) return match;

    return `${prefix}${REDACTED}${suffix}`;
  });

  return scrubbed;
}
