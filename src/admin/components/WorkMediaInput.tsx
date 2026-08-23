import * as React from 'react';
import { Box, Button, Field, Flex, TextInput, Typography } from '@strapi/design-system';
import {
  useAuth,
  useFetchClient,
  useField,
  useNotification,
  useStrapiApp,
} from '@strapi/strapi/admin';
import { styled } from 'styled-components';
import {
  isSupportedWorkMedia,
  reorderItems,
  validateWorkMediaFiles,
  type WorkMediaRejection,
} from '../../work-media-ui.mjs';

type MediaAsset = {
  id: number | string;
  documentId?: string;
  name: string;
  alternativeText?: string | null;
  caption?: string | null;
  mime?: string;
  size?: number;
  url?: string;
  folder?: number | string | null;
  focalPoint?: unknown;
  formats?: { thumbnail?: { url?: string } };
};

type WorkMediaInputProps = {
  attribute?: { allowedTypes?: string[] | null; multiple?: boolean };
  disabled?: boolean;
  hint?: string;
  label?: string;
  name: string;
  required?: boolean;
};

type MediaLibraryDialogProps = {
  allowedTypes?: string[];
  initiallySelectedAssets?: MediaAsset[];
  multiple?: boolean;
  onClose: () => void;
  onSelectAssets: (assets: MediaAsset[]) => void;
};

const DropZone = styled.div<{ $active: boolean; $disabled: boolean }>`
  border: 1px dashed ${({ theme, $active }) =>
    $active ? theme.colors.primary600 : theme.colors.neutral400};
  border-radius: 4px;
  background: ${({ theme, $active }) =>
    $active ? theme.colors.primary100 : theme.colors.neutral0};
  color: ${({ theme }) => theme.colors.neutral700};
  cursor: ${({ $disabled }) => ($disabled ? 'not-allowed' : 'pointer')};
  padding: 24px;
  text-align: center;
`;

const MediaRow = styled.li<{ $dragging: boolean }>`
  align-items: center;
  background: ${({ theme }) => theme.colors.neutral0};
  border: 1px solid ${({ theme }) => theme.colors.neutral200};
  border-radius: 4px;
  display: grid;
  gap: 16px;
  grid-template-columns: auto 72px minmax(0, 1fr) auto;
  opacity: ${({ $dragging }) => ($dragging ? 0.55 : 1)};
  padding: 12px;
`;

const Preview = styled.div`
  align-items: center;
  background: ${({ theme }) => theme.colors.neutral100};
  border-radius: 4px;
  display: flex;
  height: 56px;
  justify-content: center;
  overflow: hidden;
  width: 72px;

  img {
    height: 100%;
    object-fit: cover;
    width: 100%;
  }
`;

const DrawerBackdrop = styled.div`
  background: rgba(33, 33, 52, 0.35);
  inset: 0;
  position: fixed;
  z-index: 1100;
`;

const Drawer = styled.aside`
  background: ${({ theme }) => theme.colors.neutral0};
  box-shadow: ${({ theme }) => theme.shadows.filterShadow};
  display: flex;
  flex-direction: column;
  gap: 24px;
  height: 100%;
  max-width: 480px;
  overflow: auto;
  padding: 32px;
  position: absolute;
  right: 0;
  top: 0;
  width: min(90vw, 480px);
`;

function asAssets(value: unknown): MediaAsset[] {
  if (Array.isArray(value)) return value.filter(Boolean) as MediaAsset[];
  return value ? [value as MediaAsset] : [];
}

function assetUrl(asset: MediaAsset): string | undefined {
  const raw = asset.formats?.thumbnail?.url || asset.url;
  if (!raw) return undefined;
  try {
    const backendURL = (window.strapi as unknown as { backendURL?: string })?.backendURL;
    return new URL(raw, backendURL || window.location.origin).href;
  } catch {
    return raw;
  }
}

function rejectionMessage(rejection: WorkMediaRejection): string {
  if (rejection.reason === 'size') {
    return `${rejection.file.name} 超过 50 MiB 上限`;
  }
  return `${rejection.file.name} 不是受支持的图片或 PDF`;
}

function uploadFiles(
  files: File[],
  token: string,
  onProgress: (progress: number) => void,
  onReady: (xhr: XMLHttpRequest) => void
): Promise<MediaAsset[]> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    onReady(xhr);
    const backendURL = (window.strapi as unknown as { backendURL?: string })?.backendURL;
    xhr.open('POST', `${backendURL || ''}/upload`);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    });
    xhr.addEventListener('load', () => {
      let payload: unknown;
      try {
        payload = JSON.parse(xhr.responseText);
      } catch {
        payload = null;
      }
      if (xhr.status >= 200 && xhr.status < 300 && Array.isArray(payload)) {
        resolve(payload as MediaAsset[]);
        return;
      }
      reject(new Error(xhr.status === 413 ? '文件超过 50 MiB 上限' : '上传失败，请重试'));
    });
    xhr.addEventListener('error', () => reject(new Error('网络错误，上传未完成')));
    xhr.addEventListener('abort', () => reject(new DOMException('上传已取消', 'AbortError')));

    const form = new FormData();
    for (const file of files) form.append('files', file, file.name);
    xhr.send(form);
  });
}

export function WorkMediaInput({
  disabled = false,
  hint,
  label = '图片',
  name,
  required = false,
}: WorkMediaInputProps) {
  const field = useField(name);
  const assets = asAssets(field.value);
  const token = useAuth('WorkMediaInput', (state) => state.token);
  const { post } = useFetchClient();
  const { toggleNotification } = useNotification();
  const MediaLibraryDialog = useStrapiApp(
    'WorkMediaInput',
    (state) => state.components['media-library']
  ) as React.ComponentType<MediaLibraryDialogProps> | undefined;
  const inputRef = React.useRef<HTMLInputElement>(null);
  const xhrRef = React.useRef<XMLHttpRequest | null>(null);
  const dragIndex = React.useRef<number | null>(null);
  const [libraryOpen, setLibraryOpen] = React.useState(false);
  const [dropActive, setDropActive] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [editing, setEditing] = React.useState<MediaAsset | null>(null);
  const [caption, setCaption] = React.useState('');
  const [alternativeText, setAlternativeText] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  const changeAssets = (next: MediaAsset[]) => field.onChange(name, next.length ? next : null);

  const notifyRejected = (rejected: WorkMediaRejection[]) => {
    if (!rejected.length) return;
    toggleNotification({ type: 'danger', message: rejected.map(rejectionMessage).join('；') });
  };

  const startUpload = async (incoming: File[] | FileList) => {
    if (disabled || uploading) return;
    const { accepted, rejected } = validateWorkMediaFiles(incoming);
    notifyRejected(rejected);
    if (!accepted.length) return;
    if (!token) {
      toggleNotification({ type: 'danger', message: '登录状态已失效，请重新登录' });
      return;
    }

    setUploading(true);
    setProgress(0);
    try {
      const uploaded = await uploadFiles(accepted, token, setProgress, (xhr) => {
        xhrRef.current = xhr;
      });
      changeAssets([...assets, ...uploaded]);
      setProgress(100);
      toggleNotification({ type: 'success', message: `已上传并加入 ${uploaded.length} 个媒体文件` });
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        toggleNotification({
          type: 'danger',
          message: error instanceof Error ? error.message : '上传失败，请重试',
        });
      }
    } finally {
      xhrRef.current = null;
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const move = (from: number, to: number) => changeAssets(reorderItems(assets, from, to));

  const openEditor = (asset: MediaAsset) => {
    setEditing(asset);
    setCaption(asset.caption || '');
    setAlternativeText(asset.alternativeText || '');
  };

  const saveMetadata = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const fileInfo = {
        alternativeText,
        caption,
        focalPoint: editing.focalPoint,
        folder: editing.folder,
        name: editing.name,
      };
      const form = new FormData();
      form.append('fileInfo', JSON.stringify(fileInfo));
      const response = await post(`/upload?id=${editing.id}`, form);
      const updated = (response.data || { ...editing, ...fileInfo }) as MediaAsset;
      changeAssets(assets.map((asset) => (asset.id === editing.id ? updated : asset)));
      setEditing(null);
      toggleNotification({ type: 'success', message: '媒体说明已保存' });
    } catch (error) {
      toggleNotification({
        type: 'danger',
        message: error instanceof Error ? error.message : '保存媒体说明失败',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Field.Root name={name} error={field.error} hint={hint} required={required}>
      <Flex direction="column" alignItems="stretch" gap={3}>
        <Field.Label>{label}</Field.Label>
        <Flex gap={2} wrap="wrap">
          <Button
            type="button"
            disabled={disabled || uploading}
            onClick={() => inputRef.current?.click()}
          >
            上传文件
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={disabled || uploading || !MediaLibraryDialog}
            onClick={() => setLibraryOpen(true)}
          >
            选择已有文件
          </Button>
        </Flex>
        <input
          ref={inputRef}
          hidden
          multiple
          type="file"
          accept="image/*,application/pdf"
          onChange={(event) => event.target.files && void startUpload(event.target.files)}
        />
        <DropZone
          $active={dropActive}
          $disabled={disabled || uploading}
          role="button"
          tabIndex={disabled ? -1 : 0}
          onClick={() => !disabled && inputRef.current?.click()}
          onKeyDown={(event) => {
            if (!disabled && (event.key === 'Enter' || event.key === ' ')) inputRef.current?.click();
          }}
          onDragEnter={(event) => {
            event.preventDefault();
            if (!disabled) setDropActive(true);
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={() => setDropActive(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDropActive(false);
            void startUpload(event.dataTransfer.files);
          }}
        >
          <Typography fontWeight="semiBold">
            {uploading ? `正在上传 ${progress}%` : '拖放图片或 PDF 到这里，单个文件不超过 50 MiB'}
          </Typography>
          {uploading && (
            <Box paddingTop={2}>
              <progress aria-label="上传进度" max={100} value={progress} style={{ width: '100%' }} />
              <Button type="button" variant="tertiary" onClick={() => xhrRef.current?.abort()}>
                取消上传
              </Button>
            </Box>
          )}
        </DropZone>

        {assets.length > 0 && (
          <Box tag="ol" padding={0} margin={0} style={{ display: 'grid', gap: 8 }}>
            {assets.map((asset, index) => {
              const preview = assetUrl(asset);
              return (
                <MediaRow
                  key={asset.documentId || asset.id}
                  draggable={!disabled}
                  $dragging={dragIndex.current === index}
                  onDragStart={() => {
                    dragIndex.current = index;
                  }}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => {
                    if (dragIndex.current !== null) move(dragIndex.current, index);
                    dragIndex.current = null;
                  }}
                  onDragEnd={() => {
                    dragIndex.current = null;
                  }}
                >
                  <Button type="button" variant="tertiary" disabled={disabled} aria-label={`拖动 ${asset.name}`}>
                    ⠿
                  </Button>
                  <Preview>{preview && asset.mime?.startsWith('image/') ? <img src={preview} alt="" /> : 'PDF'}</Preview>
                  <Box style={{ minWidth: 0 }}>
                    <Typography fontWeight="semiBold" ellipsis>{asset.name}</Typography>
                    <Typography variant="pi" textColor="neutral600">
                      {asset.mime || '文件'}{asset.size ? ` · ${asset.size.toFixed(2)} MB` : ''}
                    </Typography>
                    {asset.caption && <Typography variant="pi">{asset.caption}</Typography>}
                  </Box>
                  <Flex gap={1} wrap="wrap" justifyContent="flex-end">
                    <Button type="button" variant="tertiary" disabled={disabled || index === 0} onClick={() => move(index, index - 1)}>上移</Button>
                    <Button type="button" variant="tertiary" disabled={disabled || index === assets.length - 1} onClick={() => move(index, index + 1)}>下移</Button>
                    <Button type="button" variant="secondary" disabled={disabled} onClick={() => openEditor(asset)}>编辑</Button>
                    {asset.url && <Button tag="a" variant="tertiary" href={assetUrl(asset)} download={asset.name}>下载</Button>}
                    <Button type="button" variant="danger-light" disabled={disabled} onClick={() => changeAssets(assets.filter((item) => item.id !== asset.id))}>移除</Button>
                  </Flex>
                </MediaRow>
              );
            })}
          </Box>
        )}
        <Field.Hint />
        <Field.Error />
      </Flex>

      {libraryOpen && MediaLibraryDialog && (
        <MediaLibraryDialog
          allowedTypes={['images', 'files']}
          initiallySelectedAssets={assets}
          multiple
          onClose={() => setLibraryOpen(false)}
          onSelectAssets={(selected) => {
            const supported = selected.filter((asset) =>
              isSupportedWorkMedia({ type: asset.mime || '' } as File)
            );
            if (supported.length !== selected.length) {
              toggleNotification({
                type: 'danger',
                message: '作品只支持图片或 PDF，其他文件未加入',
              });
            }
            changeAssets(supported);
            setLibraryOpen(false);
          }}
        />
      )}

      {editing && (
        <DrawerBackdrop role="presentation" onMouseDown={() => !saving && setEditing(null)}>
          <Drawer role="dialog" aria-modal="true" aria-label={`编辑 ${editing.name}`} onMouseDown={(event) => event.stopPropagation()}>
            <Box>
              <Typography variant="alpha">编辑媒体</Typography>
              <Typography>{editing.name}</Typography>
            </Box>
            {assetUrl(editing) && editing.mime?.startsWith('image/') && (
              <img src={assetUrl(editing)} alt="" style={{ width: '100%', maxHeight: 260, objectFit: 'contain' }} />
            )}
            <Field.Root name={`${name}-caption`}>
              <Field.Label>说明</Field.Label>
              <TextInput value={caption} onChange={(event: React.ChangeEvent<HTMLInputElement>) => setCaption(event.target.value)} />
            </Field.Root>
            <Field.Root name={`${name}-alternativeText`}>
              <Field.Label>替代文本</Field.Label>
              <TextInput value={alternativeText} onChange={(event: React.ChangeEvent<HTMLInputElement>) => setAlternativeText(event.target.value)} />
              <Typography variant="pi" textColor="neutral600">
                简短描述图片内容，供无障碍阅读使用
              </Typography>
            </Field.Root>
            <Flex justifyContent="flex-end" gap={2}>
              <Button type="button" variant="tertiary" disabled={saving} onClick={() => setEditing(null)}>取消</Button>
              <Button type="button" loading={saving} onClick={() => void saveMetadata()}>保存</Button>
            </Flex>
          </Drawer>
        </DrawerBackdrop>
      )}
    </Field.Root>
  );
}
