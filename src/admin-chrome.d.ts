export const DOCUMENT_TITLE_SUFFIX: string;
export const USERS_PERMISSIONS_CONTENT_TYPES: string[];
export function hideFromContentManager<T>(contentType: T): T;
export function rewriteDocumentTitle(code: string): string;
export function rewriteIndexHtml(html: string): string;
