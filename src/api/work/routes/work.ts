import { factories } from '@strapi/strapi';

// Authoring goes through Admin Content Manager. External reads use the Archive
// Read Contract route in 01-archive-read.ts — not generic REST CRUD.
export default factories.createCoreRouter('api::work.work', {
  except: ['find', 'findOne', 'create', 'update', 'delete'],
});
