import type { Core } from '@strapi/strapi';

export const WORK_UID: 'api::work.work';
export const NEWSPAPER_UID: 'api::newspaper-issue.newspaper-issue';
export const WORK_LAYOUT: {
  uid: string;
  settings: Record<string, unknown>;
  layouts: { list: string[]; edit: { name: string; size: number }[][] };
  metadatas: Record<string, unknown>;
};
export const NEWSPAPER_LAYOUT: {
  uid: string;
  settings: Record<string, unknown>;
  layouts: { list: string[]; edit: { name: string; size: number }[][] };
  metadatas: Record<string, unknown>;
};
export function applyAuthoringLayouts(strapi: Core.Strapi): Promise<void>;
