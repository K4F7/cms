/**
 * Archive Read Contract routes (unbound). Kept separate from core CRUD so the
 * published-Work representation stays a stable external seam.
 */
import type { Core } from '@strapi/strapi';

const routes: Core.RouterInput = {
  type: 'content-api',
  routes: [
    {
      method: 'GET',
      path: '/archive/v1/works',
      handler: 'api::work.work.searchPublished',
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'GET',
      path: '/archive/v1/works/:archiveId',
      handler: 'api::work.work.findPublishedByArchiveId',
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'GET',
      path: '/archive/v1/media/:mediaId',
      handler: 'api::work.work.downloadPublishedMedia',
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
  ],
};

export default routes;
