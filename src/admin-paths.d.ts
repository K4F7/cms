export function adminBasename(adminPath?: string | null): string;
export function unauthorizedLoginHref(adminPath?: string | null): string;
export function adminCookiePath(adminUrl?: string | null): string;
export function rewriteUnauthorizedLoginAssign(code: string): string;
export function rewriteGetBasename(code: string): string;
export const SAFE_LOGIN_HREF: string;
