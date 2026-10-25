import {
  isStageId,
  normalizeSeed,
  parseBooleanToken,
  type StageRunOptions,
} from './stage-types';

export const STAGE_QUERY_KEY = 'stage';

const RESERVED_KEYS = new Set(['stage', 'seed', 'skip', 'frame', 'hud']);

export interface StageQueryRequest {
  readonly stageId: string;
  readonly seed: number | null;
  readonly skip: boolean;
  readonly frame: number | null;
  readonly hud: boolean;
  readonly params: Readonly<Record<string, string>>;
}

export interface StageQueryParse {
  /** 没有 `stage` 参数时为 null（正常启动）。 */
  readonly request: StageQueryRequest | null;
  /** 有 `stage` 但格式不合法时的原因；此时 request 为 null。 */
  readonly error: string | null;
}

function parseSeed(raw: string | null): number | null {
  if (raw === null || raw.trim() === '') return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  return normalizeSeed(value);
}

function parseFrame(raw: string | null): number | null {
  if (raw === null || raw.trim() === '') return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  return Math.max(0, Math.trunc(value));
}

/**
 * 解析 URL query 里的测试后门。
 *
 * 只做语法与类型收敛；舞台是否存在、是否 ready 由 `launchStage` 判断。
 * 保留字之外的参数原样放进 `params`，这样战斗可以扩展 `enemies` / `turns` 等，
 * 而不需要每次改解析器。
 */
export function parseStageQuery(search: string): StageQueryParse {
  const query = search.startsWith('?') ? search.slice(1) : search;
  if (query.trim() === '') return { request: null, error: null };

  let params: URLSearchParams;
  try {
    params = new URLSearchParams(query);
  } catch {
    return { request: null, error: '查询字符串无法解析' };
  }

  const rawStage = params.get(STAGE_QUERY_KEY);
  if (rawStage === null || rawStage.trim() === '') return { request: null, error: null };

  const stageId = rawStage.trim().toLowerCase();
  if (!isStageId(stageId)) {
    return {
      request: null,
      error: `舞台 id 不合法：${rawStage}（示例：scene.prologue、cg.prologue.disaster）`,
    };
  }

  const extra: Record<string, string> = {};
  params.forEach((value, key) => {
    if (!RESERVED_KEYS.has(key)) extra[key] = value;
  });

  return {
    request: {
      stageId,
      seed: parseSeed(params.get('seed')),
      skip: parseBooleanToken(params.get('skip'), false),
      frame: parseFrame(params.get('frame')),
      hud: parseBooleanToken(params.get('hud'), true),
      params: extra,
    },
    error: null,
  };
}

export interface StageUrlOptions {
  readonly seed?: number;
  readonly skip?: boolean;
  readonly frame?: number;
  readonly hud?: boolean;
  readonly params?: Readonly<Record<string, string>>;
}

/**
 * 生成可直接粘贴/书签的舞台 URL：保留当前路径，替换 query，去掉 hash。
 * Cordova 下 `window.location.href` 是 file/https localhost，`new URL` 同样可用。
 */
export function buildStageUrl(
  baseHref: string,
  stageId: string,
  options: StageUrlOptions = {},
): string {
  const normalizedId = stageId.trim().toLowerCase();
  if (!isStageId(normalizedId)) {
    throw new Error(`舞台 id 不合法：${stageId}`);
  }

  const url = new URL(baseHref, 'https://avm.local/');
  const params = new URLSearchParams();
  params.set(STAGE_QUERY_KEY, normalizedId);

  if (options.seed !== undefined) params.set('seed', String(normalizeSeed(options.seed)));
  if (options.skip === true) params.set('skip', '1');
  if (options.frame !== undefined && Number.isFinite(options.frame)) {
    params.set('frame', String(Math.max(0, Math.trunc(options.frame))));
  }
  if (options.hud === false) params.set('hud', '0');

  for (const [key, value] of Object.entries(options.params ?? {})) {
    if (RESERVED_KEYS.has(key)) continue;
    params.set(key, value);
  }

  url.search = params.toString();
  url.hash = '';
  return url.href;
}

/** 把解析结果转成启动器参数，避免 Boot 和 HUD 各写一份映射。 */
export function stageQueryToRunOptions(
  request: StageQueryRequest,
): StageRunOptions & { readonly hud: boolean } {
  return {
    seed: request.seed ?? undefined,
    skip: request.skip,
    frame: request.frame ?? undefined,
    params: request.params,
    origin: 'url',
    hud: request.hud,
  };
}
