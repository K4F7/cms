export const WORK_MEDIA_LIMIT_BYTES = 50 * 1024 * 1024;

export function isSupportedWorkMedia(file) {
  return Boolean(
    file &&
      (String(file.type || '').startsWith('image/') || String(file.type || '') === 'application/pdf')
  );
}

export function validateWorkMediaFiles(files, limitBytes = WORK_MEDIA_LIMIT_BYTES) {
  const accepted = [];
  const rejected = [];

  for (const file of Array.from(files || [])) {
    if (!isSupportedWorkMedia(file)) {
      rejected.push({ file, reason: 'type' });
    } else if (Number(file.size) > limitBytes) {
      rejected.push({ file, reason: 'size' });
    } else {
      accepted.push(file);
    }
  }

  return { accepted, rejected };
}

export function reorderItems(items, from, to) {
  const next = Array.from(items || []);
  if (
    from === to ||
    from < 0 ||
    to < 0 ||
    from >= next.length ||
    to >= next.length
  ) {
    return next;
  }

  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
