'use strict';

const DOCUMENT_TITLE_SUFFIX = '迷因创作社';

const USERS_PERMISSIONS_CONTENT_TYPES = [
  'plugin::users-permissions.user',
  'plugin::users-permissions.role',
];

function hideFromContentManager(contentType) {
  if (!contentType) {
    return contentType;
  }

  contentType.pluginOptions = {
    ...contentType.pluginOptions,
    'content-manager': { visible: false },
    'content-type-builder': { visible: false },
  };
  return contentType;
}

function rewriteDocumentTitle(code) {
  return code.replace(
    /document\.title = `\$\{title\} \| Strapi`;/g,
    `document.title = \`\${title} | ${DOCUMENT_TITLE_SUFFIX}\`;`
  );
}

function rewriteIndexHtml(html) {
  return String(html)
    .replace(/<html lang="en">/, '<html lang="zh-Hans">')
    .replace(/<title>Strapi Admin<\/title>/, `<title>${DOCUMENT_TITLE_SUFFIX}</title>`);
}

module.exports = {
  DOCUMENT_TITLE_SUFFIX,
  USERS_PERMISSIONS_CONTENT_TYPES,
  hideFromContentManager,
  rewriteDocumentTitle,
  rewriteIndexHtml,
};
