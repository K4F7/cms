export function appVersion(): string;
export function healthResponse(
  ready: boolean,
  version: string
): { statusCode: number; body: { status: 'ok' | 'not_ready'; version: string } };
