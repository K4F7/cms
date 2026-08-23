import { factories } from '@strapi/strapi';

// Authoring goes through Admin Content Manager. Do not expose generic REST CRUD.
export default factories.createCoreRouter('api::newspaper-issue.newspaper-issue', {
  except: ['find', 'findOne', 'create', 'update', 'delete'],
});
