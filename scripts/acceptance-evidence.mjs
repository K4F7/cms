/**
 * Redaction helpers for first-version acceptance evidence (K4F7/cms#11).
 * Evidence files must not contain tokens, cookie values, or passwords.
 */

export function redactAcceptance(value) {
  const cleaned = JSON.stringify(value)
    .replace(/eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g, '[redacted-jwt]')
    .replace(/strapi_admin_refresh=[^;"\\]+/gi, 'strapi_admin_refresh=[redacted]')
    .replace(/strapi_admin_refresh\.sig=[^;"\\]+/gi, 'strapi_admin_refresh.sig=[redacted]')
    .replace(/"(authorization|cookie|password)":\s*"[^"]*"/gi, '"$1":"[redacted]"')
    .replace(/ArchiveAdmin![^"\\]*/g, '[redacted-password]')
    .replace(/archive-read-contract-baseline-token/g, '[redacted-token]');
  return JSON.parse(cleaned);
}

export function cookieFlags(setCookie) {
  return (setCookie || []).map((cookie) => {
    const [nameValue, ...rest] = cookie.split(';');
    const name = nameValue.split('=')[0];
    const attrs = rest.map((part) => part.trim().toLowerCase());
    return {
      name,
      httpOnly: attrs.includes('httponly'),
      secure: attrs.includes('secure'),
      sameSite: (attrs.find((attr) => attr.startsWith('samesite=')) || '').slice('samesite='.length) || null,
      path: (attrs.find((attr) => attr.startsWith('path=')) || '').slice('path='.length) || null,
    };
  });
}

export function originAndPath(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return url;
  }
}
