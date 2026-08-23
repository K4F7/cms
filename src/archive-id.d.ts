import type { Core } from '@strapi/strapi';

export function slugArchivePart(value: unknown): string;
export function suggestedArchiveId(prefix: string, source: unknown): string;
export function allocateArchiveId(
  strapi: Core.Strapi,
  uid: string,
  base: string
): Promise<string>;
