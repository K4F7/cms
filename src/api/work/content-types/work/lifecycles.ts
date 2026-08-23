import type { Core } from '@strapi/strapi';
import { allocateArchiveId, suggestedArchiveId } from '../../../../archive-id';

const UID = 'api::work.work';

export default {
  async beforeCreate(event: { params: { data: Record<string, unknown> } }) {
    const { data } = event.params;
    const archiveId = typeof data.archiveId === 'string' ? data.archiveId.trim() : '';
    if (archiveId) {
      data.archiveId = archiveId;
      return;
    }
    const strapi = (globalThis as { strapi: Core.Strapi }).strapi;
    data.archiveId = await allocateArchiveId(
      strapi,
      UID,
      suggestedArchiveId('work', data.title)
    );
  },
};
