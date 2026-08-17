export function appVersion(): string;
export function imageDigest(): string | null;
export function healthResponse(
  ready: boolean,
  version: string,
  digest?: string | null
): {
  statusCode: number;
  body: { status: 'ok' | 'not_ready'; version: string; imageDigest?: string };
};
