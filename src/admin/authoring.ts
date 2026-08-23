function slugArchivePart(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\u4e00-\u9fff-]+/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
  return slug || 'item';
}

function suggestedArchiveId(prefix: string, source: string): string {
  return `${prefix}-${slugArchivePart(source)}`;
}

function setReactInputValue(input: HTMLInputElement, value: string): void {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  descriptor?.set?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function findNamedInput(name: string): HTMLInputElement | null {
  return document.querySelector(`input[name="${name}"]`);
}

function syncArchiveIdField(): void {
  const archive = findNamedInput('archiveId');
  if (!archive || archive.disabled || archive.readOnly) {
    return;
  }

  const issue = findNamedInput('issueNumber');
  const title = findNamedInput('title');
  const source = (issue?.value || title?.value || '').trim();
  if (!source) {
    return;
  }

  const prefix = issue ? 'paper' : 'work';
  const next = suggestedArchiveId(prefix, source);
  const current = archive.value.trim();
  const lastAuto = archive.dataset.cmsAutoValue || '';
  const userEdited = current !== '' && current !== lastAuto;
  if (userEdited) {
    return;
  }
  if (current === next) {
    archive.dataset.cmsAutoValue = next;
    return;
  }

  setReactInputValue(archive, next);
  archive.dataset.cmsAutoValue = next;
}

export function watchArchiveIdAutofill(): void {
  if (typeof document === 'undefined') {
    return;
  }

  const apply = (): void => {
    syncArchiveIdField();
  };

  apply();
  document.addEventListener('input', apply, true);
  new MutationObserver(apply).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
}
