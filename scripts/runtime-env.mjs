/**
 * Merge optional CMS_RUNTIME_ENV_JSON with public GitHub Environment values.
 * Empty strings from Actions vars are treated as unset. Callers must not put
 * secrets in the extras map if they log it; this helper does not print values.
 */
export function mergeRuntimeEnv(jsonText, extras = {}) {
  let fromJson = {};
  if (jsonText && String(jsonText).trim()) {
    fromJson = JSON.parse(jsonText);
    if (fromJson === null || typeof fromJson !== 'object' || Array.isArray(fromJson)) {
      throw new Error('CMS_RUNTIME_ENV_JSON must be a JSON object');
    }
  }

  const cleaned = {};
  for (const [key, value] of Object.entries(extras)) {
    if (value === undefined || value === null) continue;
    const text = String(value).trim();
    if (!text) continue;
    cleaned[key] = text;
  }

  const merged = { ...fromJson, ...cleaned };
  return Object.keys(merged).length ? merged : undefined;
}
