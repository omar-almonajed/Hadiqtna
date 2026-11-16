import { auth } from './firebase';

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export type ActiveAuthMode = 'FIREBASE' | 'LOCAL_STAFF';

const LOCAL_TOKEN_STORAGE_KEY = 'hadiqtna_local_staff_token';
const ACTIVE_AUTH_MODE_KEY = 'hadiqtna_active_auth_mode';

let unauthorizedHandler: ((err: ApiError) => void) | null = null;

export function registerUnauthorizedHandler(handler: ((err: ApiError) => void) | null): void {
  unauthorizedHandler = handler;
}

export function getStoredLocalToken(): string | null {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage.getItem(LOCAL_TOKEN_STORAGE_KEY) : null;
  } catch {
    return null;
  }
}

export function setStoredLocalToken(token: string | null): void {
  try {
    if (typeof window === 'undefined') return;
    if (token) {
      window.sessionStorage.setItem(LOCAL_TOKEN_STORAGE_KEY, token);
    } else {
      window.sessionStorage.removeItem(LOCAL_TOKEN_STORAGE_KEY);
    }
  } catch {
    // Ignore storage restriction errors
  }
}

export function getActiveAuthMode(): ActiveAuthMode | null {
  try {
    if (typeof window === 'undefined') return null;
    const raw = window.sessionStorage.getItem(ACTIVE_AUTH_MODE_KEY);
    if (raw === 'FIREBASE' || raw === 'LOCAL_STAFF') return raw;
    return null;
  } catch {
    return null;
  }
}

export function setActiveAuthMode(mode: ActiveAuthMode | null): void {
  try {
    if (typeof window === 'undefined') return;
    if (mode) {
      window.sessionStorage.setItem(ACTIVE_AUTH_MODE_KEY, mode);
    } else {
      window.sessionStorage.removeItem(ACTIVE_AUTH_MODE_KEY);
    }
  } catch {
    // Ignore storage restriction errors
  }
}

/**
 * Resolves the bearer token strictly for the currently active auth mode.
 * Prevents stale Firebase tokens from shadowing active Local Staff sessions and vice versa.
 */
export async function getActiveSessionToken(forceRefresh = false): Promise<string | null> {
  const mode = getActiveAuthMode();
  const localToken = getStoredLocalToken();

  if (mode === 'LOCAL_STAFF') {
    return localToken || null;
  }

  if (mode === 'FIREBASE') {
    if (auth.currentUser) {
      return auth.currentUser.getIdToken(forceRefresh);
    }
    return null;
  }

  // Fallback inference only during initial boot when mode key is unset
  if (localToken && !auth.currentUser) {
    return localToken;
  }
  if (auth.currentUser) {
    return auth.currentUser.getIdToken(forceRefresh);
  }
  return localToken || null;
}

async function buildHeaders(
  authenticated: boolean,
  isJson = true,
  forceRefresh = false
): Promise<HeadersInit> {
  const headers: Record<string, string> = {};
  if (isJson) {
    headers['Content-Type'] = 'application/json';
  }
  if (authenticated) {
    const token = await getActiveSessionToken(forceRefresh);
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }
  return headers;
}

export async function apiRequest<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    authenticated?: boolean;
    isFormData?: boolean;
    forceRefreshToken?: boolean;
    skipUnauthorizedHandler?: boolean;
  } = {}
): Promise<T> {
  const {
    method = 'GET',
    body,
    authenticated = true,
    isFormData = false,
    forceRefreshToken = false,
    skipUnauthorizedHandler = false,
  } = options;
  const headers = await buildHeaders(authenticated, !isFormData, forceRefreshToken);

  const res = await fetch(path, {
    method,
    headers,
    body: isFormData ? (body as FormData) : body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let parsed: Record<string, unknown> = {};
  try {
    parsed = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    parsed = {};
  }

  if (!res.ok) {
    const apiErr = new ApiError(
      res.status,
      String(parsed.error || 'API_ERROR'),
      String(parsed.message || `Request failed with status ${res.status}`)
    );
    if (authenticated && res.status === 401 && !skipUnauthorizedHandler && unauthorizedHandler) {
      unauthorizedHandler(apiErr);
    }
    throw apiErr;
  }

  return parsed as T;
}
