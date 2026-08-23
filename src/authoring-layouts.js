'use strict';

const WORK_UID = 'api::work.work';
const NEWSPAPER_UID = 'api::newspaper-issue.newspaper-issue';

const fieldMeta = (edit, list = {}) => ({
  edit: {
    label: edit.label,
    description: edit.description || '',
    placeholder: edit.placeholder || '',
    visible: edit.visible !== false,
    editable: edit.editable !== false,
  },
  list: {
    label: list.label || edit.label,
    searchable: list.searchable !== false,
    sortable: list.sortable !== false,
  },
});

const WORK_LAYOUT = {
  uid: WORK_UID,
  settings: {
    mainField: 'title',
    defaultSortBy: 'updatedAt',
    defaultSortOrder: 'DESC',
    pageSize: 10,
    searchable: true,
    filterable: true,
    bulkable: true,
  },
  layouts: {
    list: ['title', 'author', 'archiveId'],
    edit: [
      [
        { name: 'title', size: 8 },
        { name: 'author', size: 4 },
      ],
      [{ name: 'summary', size: 12 }],
      [{ name: 'mediaItems', size: 12 }],
      [{ name: 'archiveId', size: 12 }],
    ],
  },
  metadatas: {
    title: fieldMeta({ label: '标题', placeholder: '作品标题' }),
    author: fieldMeta({ label: '作者', placeholder: '可空', description: '作者，可空' }),
    summary: fieldMeta({
      label: '文字',
      placeholder: '正文、说明或转写',
      description: '文字内容，可空',
    }),
    mediaItems: fieldMeta({
      label: '图片',
      description: '图片，可多张',
    }),
    archiveId: fieldMeta({
      label: '档案标识',
      placeholder: '保存时自动生成',
      description: '未填写时按标题自动生成，发布后不要改',
    }),
  },
};

const NEWSPAPER_LAYOUT = {
  uid: NEWSPAPER_UID,
  settings: {
    mainField: 'issueNumber',
    defaultSortBy: 'updatedAt',
    defaultSortOrder: 'DESC',
    pageSize: 10,
    searchable: true,
    filterable: true,
    bulkable: true,
  },
  layouts: {
    list: ['issueNumber', 'title', 'archiveId'],
    edit: [
      [{ name: 'issueNumber', size: 12 }],
      [{ name: 'pdf', size: 12 }],
      [
        { name: 'title', size: 6 },
        { name: 'archiveId', size: 6 },
      ],
      [{ name: 'sourceLink', size: 12 }],
    ],
  },
  metadatas: {
    issueNumber: fieldMeta({
      label: '期数',
      placeholder: '12 或 2024-03',
      description: '这一期的期数',
    }),
    pdf: fieldMeta({
      label: 'PDF 文件',
      description: '这一期的 PDF',
    }),
    title: fieldMeta({
      label: '标题',
      placeholder: '可空，默认用期数',
      description: '可空；未填时用期数作为标题',
    }),
    archiveId: fieldMeta({
      label: '档案标识',
      placeholder: '保存时按期数生成',
      description: '未填写时按期数自动生成，发布后不要改',
    }),
    sourceLink: fieldMeta({
      label: '源材料链接',
      placeholder: '可空',
      description: '源码或源材料链接，可空',
    }),
  },
};

function mergeMetadatas(current, overlay) {
  const next = { ...current };
  for (const [name, meta] of Object.entries(overlay)) {
    next[name] = {
      edit: { ...(current?.[name]?.edit || {}), ...meta.edit },
      list: { ...(current?.[name]?.list || {}), ...meta.list },
    };
  }
  return next;
}

async function applyAuthoringLayout(strapi, spec) {
  const contentType = strapi.contentType(spec.uid);
  if (!contentType) {
    return;
  }

  const service = strapi.plugin('content-manager').service('content-types');
  const current = await service.findConfiguration(contentType);
  await service.updateConfiguration(contentType, {
    settings: { ...current.settings, ...spec.settings },
    metadatas: mergeMetadatas(current.metadatas, spec.metadatas),
    layouts: {
      list: spec.layouts.list,
      edit: spec.layouts.edit,
    },
  });
}

async function applyAuthoringLayouts(strapi) {
  await applyAuthoringLayout(strapi, WORK_LAYOUT);
  await applyAuthoringLayout(strapi, NEWSPAPER_LAYOUT);
}

module.exports = {
  WORK_UID,
  NEWSPAPER_UID,
  WORK_LAYOUT,
  NEWSPAPER_LAYOUT,
  applyAuthoringLayouts,
};
