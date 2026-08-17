import type { Core } from '@strapi/strapi';
import { factories } from '@strapi/strapi';

export default factories.createCoreController('api::work.work', ({ strapi }: { strapi: Core.Strapi }) => ({
  async findPublishedByArchiveId(ctx) {
    const expected = process.env.ARCHIVE_READ_TOKEN;
    const header = ctx.request.header.authorization || '';
    const match = /^Bearer\s+(.+)$/i.exec(header);
    const presented = match?.[1]?.trim();

    if (!expected || !presented || presented !== expected) {
      return ctx.unauthorized('Missing or invalid Archive Read credentials');
    }

    const archiveId = ctx.params.archiveId;
    if (!archiveId || typeof archiveId !== 'string') {
      return ctx.badRequest('archiveId is required');
    }

    const works = await strapi.documents('api::work.work').findMany({
      filters: { archiveId },
      status: 'published',
      limit: 1,
    });

    const work = works[0];
    if (!work) {
      return ctx.notFound('Published Work not found');
    }

    ctx.body = {
      data: {
        archiveId: work.archiveId,
        title: work.title,
        summary: work.summary ?? null,
      },
    };
  },
}));
