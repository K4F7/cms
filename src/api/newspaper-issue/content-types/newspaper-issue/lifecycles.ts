import type { Core } from '@strapi/strapi';
import { allocateArchiveId, suggestedArchiveId } from '../../../../archive-id';

const UID = 'api::newspaper-issue.newspaper-issue';

export default {
  async beforeCreate(event: { params: { data: Record<string, unknown> } }) {
    const { data } = event.params;
    const issueNumber = typeof data.issueNumber === 'string' ? data.issueNumber.trim() : '';
    if (issueNumber) {
      data.issueNumber = issueNumber;
    }

    const title = typeof data.title === 'string' ? data.title.trim() : '';
    if (!title && issueNumber) {
      data.title = issueNumber;
    }

    const archiveId = typeof data.archiveId === 'string' ? data.archiveId.trim() : '';
    if (archiveId) {
      data.archiveId = archiveId;
      return;
    }
    const strapi = (globalThis as { strapi: Core.Strapi }).strapi;
    data.archiveId = await allocateArchiveId(
      strapi,
      UID,
      suggestedArchiveId('paper', issueNumber || title)
    );
  },
};
