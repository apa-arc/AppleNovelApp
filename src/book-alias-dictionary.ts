export type BookAliasDictionary = {
  aliases: Record<string, string>;
  recordCount: number;
};

const MAX_DICTIONARY_BYTES = 1024 * 1024;
const MAX_RECORDS = 20_000;
const MAX_TITLE_LENGTH = 200;
const MAX_ALIAS_LENGTH = 120;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function normalizeBookAlias(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, "");
}

/**
 * Parse the versioned alias registry used by the novel-source subscription.
 * Invalid individual records are skipped; an invalid registry envelope fails
 * the import so a broken update cannot silently erase a previously working map.
 */
export function parseBookAliasDictionary(raw: string): BookAliasDictionary {
  if (raw.length > MAX_DICTIONARY_BYTES) {
    throw new Error("别名库文件超过 1 MB 限制。");
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    throw new Error("别名库 JSON 格式错误。");
  }

  if (!isRecord(payload) || payload.schemaVersion !== 1 ||
      !Array.isArray(payload.records) || payload.records.length > MAX_RECORDS) {
    throw new Error("别名库结构不受支持。");
  }

  if (typeof payload.recordCount === "number" &&
      payload.recordCount !== payload.records.length) {
    throw new Error("别名库记录数量校验失败。");
  }

  const aliases: Record<string, string> = Object.create(null);
  for (const record of payload.records) {
    if (!isRecord(record) || typeof record.title !== "string" ||
        !record.title.trim() || record.title.length > MAX_TITLE_LENGTH ||
        !Array.isArray(record.aliases)) {
      continue;
    }

    const title = record.title.trim();
    for (const alias of record.aliases) {
      if (typeof alias !== "string" || !alias.trim() ||
          alias.length > MAX_ALIAS_LENGTH) {
        continue;
      }
      const key = normalizeBookAlias(alias);
      if (!key || key === "__proto__" || key === "prototype" ||
          key === "constructor") {
        continue;
      }
      aliases[key] = title;
    }
  }

  return { aliases, recordCount: payload.records.length };
}
