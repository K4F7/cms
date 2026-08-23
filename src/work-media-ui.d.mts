export const WORK_MEDIA_LIMIT_BYTES: number;

export type WorkMediaRejection = {
  file: File;
  reason: 'type' | 'size';
};

export function isSupportedWorkMedia(file: File): boolean;
export function validateWorkMediaFiles(
  files: File[] | FileList,
  limitBytes?: number
): { accepted: File[]; rejected: WorkMediaRejection[] };
export function reorderItems<T>(items: T[], from: number, to: number): T[];
