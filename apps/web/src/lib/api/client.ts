import type { ErrorCode, ErrorDetail } from '@tracker/shared';

// Empty in development, where Vite proxies /api to the API. Deployments set it
// to the API's own origin.
const BASE_URL = import.meta.env.VITE_API_URL ?? '';

const REFRESH_PATH = '/auth/refresh';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode | 'NETWORK_ERROR',
    message: string,
    readonly details: ErrorDetail[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Field path to message, for showing errors next to the inputs that caused them. */
  get fieldErrors(): Record<string, string> {
    const errors: Record<string, string> = {};

    for (const detail of this.details) {
      errors[detail.path] ??= detail.message;
    }

    return errors;
  }
}

/**
 * The access token lives in memory only. localStorage would expose it to any
 * injected script; the long-lived refresh token is an httpOnly cookie instead.
 */
let accessToken: string | null = null;
let onSessionLost: (() => void) | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

/** Lets the SSE client reuse the same single-flight refresh. */
export function refreshForStream(): Promise<boolean> {
  return refreshSession();
}

export function onUnauthorized(handler: () => void): void {
  onSessionLost = handler;
}

/**
 * Shared across concurrent 401s, so a burst of requests triggers one refresh
 * rather than one each.
 */
let refreshInFlight: Promise<boolean> | null = null;

function refreshSession(): Promise<boolean> {
  refreshInFlight ??= fetch(`${BASE_URL}/api/v1${REFRESH_PATH}`, {
    method: 'POST',
    credentials: 'include',
  })
    .then(async (response) => {
      if (!response.ok) {
        return false;
      }

      const body = (await response.json()) as { accessToken: string };
      accessToken = body.accessToken;

      return true;
    })
    .catch(() => false)
    .finally(() => {
      refreshInFlight = null;
    });

  return refreshInFlight;
}

/** Restores a session from the refresh cookie on page load. */
export function restoreSession(): Promise<boolean> {
  return refreshSession();
}

type QueryValue = string | number | boolean | undefined | null;

/**
 * Uploads a file as multipart. Kept separate from apiRequest because the body
 * must not be JSON-encoded and the browser sets the boundary itself.
 */
export async function apiUpload<T>(path: string, field: string, file: File): Promise<T> {
  const body = new FormData();
  body.append(field, file);

  const headers: Record<string, string> = { accept: 'application/json' };

  if (accessToken) {
    headers.authorization = `Bearer ${accessToken}`;
  }

  let response: Response;

  try {
    response = await fetch(buildUrl(path), { method: 'POST', headers, credentials: 'include', body });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Could not reach the server');
  }

  if (response.status === 401) {
    const refreshed = await refreshSession();

    if (!refreshed) {
      accessToken = null;
      onSessionLost?.();
      throw new ApiError(401, 'UNAUTHORIZED', 'Your session has expired');
    }

    return apiUpload<T>(path, field, file);
  }

  if (!response.ok) {
    throw await toApiError(response);
  }

  return (await response.json()) as T;
}

export type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, QueryValue>;
  signal?: AbortSignal;
};

function buildUrl(path: string, query?: Record<string, QueryValue>): string {
  const url = `${BASE_URL}/api/v1${path}`;

  if (!query) {
    return url;
  }

  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, String(value));
    }
  }

  const search = params.toString();

  return search ? `${url}?${search}` : url;
}

async function toApiError(response: Response): Promise<ApiError> {
  try {
    const body = (await response.json()) as {
      error?: { code?: ErrorCode; message?: string; details?: ErrorDetail[] };
    };

    return new ApiError(
      response.status,
      body.error?.code ?? 'INTERNAL_ERROR',
      body.error?.message ?? 'Something went wrong',
      body.error?.details ?? [],
    );
  } catch {
    // A proxy or gateway can answer with something that is not our envelope.
    return new ApiError(response.status, 'INTERNAL_ERROR', response.statusText);
  }
}

async function send(path: string, options: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = { accept: 'application/json' };

  if (options.body !== undefined) {
    headers['content-type'] = 'application/json';
  }

  if (accessToken) {
    headers.authorization = `Bearer ${accessToken}`;
  }

  return fetch(buildUrl(path, options.query), {
    method: options.method ?? 'GET',
    headers,
    credentials: 'include',
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal,
  });
}

/**
 * One request, with a single retry after refreshing an expired access token.
 * Responses are not re-validated here: the API enforces its own response
 * schemas, so a second pass would add bundle weight without a new guarantee.
 */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  let response: Response;

  try {
    response = await send(path, options);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error;
    }

    throw new ApiError(0, 'NETWORK_ERROR', 'Could not reach the server');
  }

  // An expired access token is normal. Refresh once, then retry.
  if (response.status === 401 && path !== REFRESH_PATH && !path.startsWith('/auth/login')) {
    const refreshed = await refreshSession();

    if (refreshed) {
      response = await send(path, options);
    } else {
      accessToken = null;
      onSessionLost?.();
    }
  }

  if (!response.ok) {
    throw await toApiError(response);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}
