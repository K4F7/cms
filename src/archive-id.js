'use strict';

function slugArchivePart(value) {
  const slug = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\u4e00-\u9fff-]+/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
  return slug || 'item';
}

function suggestedArchiveId(prefix, source) {
  return `${prefix}-${slugArchivePart(source)}`;
}

async function allocateArchiveId(strapi, uid, base) {
  let candidate = base;
  let n = 2;
  for (;;) {
    const exists = await strapi.db.query(uid).findOne({ where: { archiveId: candidate } });
    if (!exists) {
      return candidate;
    }
    candidate = `${base}-${n}`;
    n += 1;
  }
}

module.exports = {
  slugArchivePart,
  suggestedArchiveId,
  allocateArchiveId,
};
