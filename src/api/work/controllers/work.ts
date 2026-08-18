import { createReadStream, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import type { Core } from '@strapi/strapi';
import { factories } from '@strapi/strapi';

type UploadFile = {
  id?: number | string;
  documentId?: string;
  name?: string;
  mime?: string;
  size?: number;
  caption?: string | null;
  url?: string;
  hash?: string;
  ext?: string;
};

type PublishedWork = {
  archiveId: string;
  title: string;
  summary?: string | null;
  author?: string | null;
  mediaItems?: UploadFile | UploadFile[] | null;
};

const SEARCH_PAGE_SIZE = 200;
const SEARCH_DATA_LIMIT = 1000;

function presentedToken(ctx: { request: { header: { authorization?: string } } }) {
  const header = ctx.request.header.authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1]?.trim();
}

function archiveReadAuthorized(ctx: { request: { header: { authorization?: string } } }) {
  const expected = process.env.ARCHIVE_READ_TOKEN;
  const presented = presentedToken(ctx);
  return Boolean(expected && presented && presented === expected);
}

function queryString(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0].trim();
  return '';
}

function asFileList(value: PublishedWork['mediaItems']): UploadFile[] {
  if (!value) return [];
  return (Array.isArray(value) ? value : [value]).filter((file): file is UploadFile => Boolean(file));
}

function mediaIdOf(file: UploadFile): string {
  if (file.documentId) return String(file.documentId);
  if (file.id !== undefined && file.id !== null) return String(file.id);
  return '';
}

function filenameOf(file: UploadFile): string {
  if (file.name) return file.name;
  return `${file.hash || 'file'}${file.ext || ''}`;
}

function publicDir(strapi: Core.Strapi): string {
  return path.resolve(strapi.dirs.static.public || path.join(process.cwd(), 'public'));
}

function resolveUploadFilePath(strapi: Core.Strapi, file: UploadFile): string | null {
  const root = publicDir(strapi);
  const candidates: string[] = [];
  if (file.hash) {
    candidates.push(path.resolve(root, 'uploads', `${file.hash}${file.ext || ''}`));
  }
  const url = String(file.url || '');
  const uploadsAt = url.indexOf('/uploads/');
  if (uploadsAt >= 0) {
    candidates.push(path.resolve(root, url.slice(uploadsAt + 1)));
  }
  for (const candidate of candidates) {
    if (candidate === root || !candidate.startsWith(`${root}${path.sep}`)) continue;
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function sizeInBytes(strapi: Core.Strapi, file: UploadFile): number {
  const filePath = resolveUploadFilePath(strapi, file);
  if (filePath) return statSync(filePath).size;
  const raw = Number(file.size);
  if (!Number.isFinite(raw)) return 0;
  return Math.round(raw * 1000);
}

function toMediaItems(strapi: Core.Strapi, work: PublishedWork) {
  return asFileList(work.mediaItems)
    .map((file) => {
      const mediaId = mediaIdOf(file);
      if (!mediaId) return null;
      return {
        mediaId,
        filename: filenameOf(file),
        mediaType: file.mime || 'application/octet-stream',
        size: sizeInBytes(strapi, file),
        caption: file.caption ?? null,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
}

function toSearchHit(work: PublishedWork) {
  return {
    archiveId: work.archiveId,
    title: work.title,
    summary: work.summary ?? null,
    author: work.author ?? null,
  };
}

function contentDisposition(filename: string): string {
  const fallback = filename.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '\\"') || 'file';
  return `inline; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

async function loadPublishedWorks(strapi: Core.Strapi, filters?: object) {
  const collected: PublishedWork[] = [];
  for (let start = 0; ; start += SEARCH_PAGE_SIZE) {
    const params: Record<string, unknown> = {
      status: 'published',
      populate: { mediaItems: true },
      limit: SEARCH_PAGE_SIZE,
      start,
    };
    if (filters && Object.keys(filters).length) {
      params.filters = filters;
    }
    const batch = (await strapi.documents('api::work.work').findMany(params as never)) as unknown as PublishedWork[];
    collected.push(...batch);
    if (batch.length < SEARCH_PAGE_SIZE) break;
  }
  return collected;
}

function readableWorks(strapi: Core.Strapi, works: PublishedWork[]) {
  return works.filter((work) => toMediaItems(strapi, work).length > 0);
}

export default factories.createCoreController('api::work.work', ({ strapi }: { strapi: Core.Strapi }) => ({
  async searchPublished(ctx) {
    if (!archiveReadAuthorized(ctx)) {
      return ctx.unauthorized('Missing or invalid Archive Read credentials');
    }

    const query = queryString(ctx.query.query);
    const author = queryString(ctx.query.author);
    const filters: Record<string, unknown> = {};
    if (query) {
      filters.$or = [{ title: { $containsi: query } }, { summary: { $containsi: query } }];
    }
    if (author) {
      filters.author = { $eqi: author };
    }

    const matches = readableWorks(strapi, await loadPublishedWorks(strapi, filters));
    ctx.body = {
      data: matches.slice(0, SEARCH_DATA_LIMIT).map(toSearchHit),
      total: matches.length,
    };
  },

  async findPublishedByArchiveId(ctx) {
    if (!archiveReadAuthorized(ctx)) {
      return ctx.unauthorized('Missing or invalid Archive Read credentials');
    }

    const archiveId = ctx.params.archiveId;
    if (!archiveId || typeof archiveId !== 'string') {
      return ctx.badRequest('archiveId is required');
    }

    const works = (await strapi.documents('api::work.work').findMany({
      filters: { archiveId },
      status: 'published',
      populate: { mediaItems: true },
      limit: 1,
    })) as unknown as PublishedWork[];

    const work = works[0];
    const media = work ? toMediaItems(strapi, work) : [];
    if (!work || media.length === 0) {
      return ctx.notFound('Published Work not found');
    }

    ctx.body = {
      data: {
        archiveId: work.archiveId,
        title: work.title,
        summary: work.summary ?? null,
        author: work.author ?? null,
        media,
      },
    };
  },

  async downloadPublishedMedia(ctx) {
    if (!archiveReadAuthorized(ctx)) {
      return ctx.unauthorized('Missing or invalid Archive Read credentials');
    }

    const mediaId = ctx.params.mediaId;
    if (!mediaId || typeof mediaId !== 'string') {
      return ctx.badRequest('mediaId is required');
    }

    const readable = readableWorks(strapi, await loadPublishedWorks(strapi));
    let file: UploadFile | null = null;
    for (const work of readable) {
      file = asFileList(work.mediaItems).find((item) => mediaIdOf(item) === mediaId) || null;
      if (file) break;
    }
    if (!file) {
      return ctx.notFound('Published Media Item not found');
    }

    const filePath = resolveUploadFilePath(strapi, file);
    if (!filePath) {
      return ctx.notFound('Published Media Item not found');
    }

    const filename = filenameOf(file);
    ctx.set('Content-Type', file.mime || 'application/octet-stream');
    ctx.set('Content-Disposition', contentDisposition(filename));
    ctx.set('Content-Length', String(statSync(filePath).size));
    ctx.body = createReadStream(filePath);
  },
}));
