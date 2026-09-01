export interface ApiFieldError {
  field?: string;
  code: string;
  message: string;
}

export interface RequestOptions {
  notifyUnauthorized?: boolean;
}

export class ApiClientError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fieldErrors: ApiFieldError[] = [],
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

export class ApiNetworkError extends Error {
  constructor() {
    super("No fue posible conectar con el servidor");
    this.name = "ApiNetworkError";
  }
}

const unauthorizedListeners = new Set<() => void>();

interface ApiResponseBody<T> {
  data?: T;
  error?: ApiFieldError;
  errors?: ApiFieldError[];
  message?: string;
}

function apiUrl(path: string): string {
  return `${import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api/v1"}${path}`;
}

async function fetchApi(path: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(apiUrl(path), {
      ...init,
      credentials: "include",
    });
  } catch {
    throw new ApiNetworkError();
  }
}

function notifyUnauthorized(response: Response, options: RequestOptions): void {
  if (response.status === 401 && options.notifyUnauthorized !== false) {
    unauthorizedListeners.forEach((listener) => listener());
  }
}

async function responseError(
  response: Response,
  options: RequestOptions = {},
): Promise<ApiClientError> {
  let body: ApiResponseBody<unknown> = {};
  try {
    body = await response.json() as ApiResponseBody<unknown>;
  } catch {
    // Some proxies return an empty or non-JSON error page. Keep the public error stable.
  }

  const errors = body.errors ?? (body.error ? [body.error] : []);
  const detail = errors[0];
  notifyUnauthorized(response, options);
  return new ApiClientError(
    response.status,
    detail?.code ?? "HTTP_ERROR",
    detail?.message ?? body.message ?? "No fue posible completar la solicitud",
    errors,
  );
}

async function responseJson<T>(
  response: Response,
  options: RequestOptions = {},
): Promise<T> {
  if (response.status === 204) return undefined as T;
  if (!response.ok) throw await responseError(response, options);
  const body = await response.json() as ApiResponseBody<T>;
  return body.data as T;
}

function safeFilename(value: string): string | null {
  const withoutControlCharacters = Array.from(value)
    .filter((character) => {
      const codePoint = character.codePointAt(0);
      return codePoint !== undefined && codePoint > 0x1f && codePoint !== 0x7f;
    })
    .join("");
  const segments = withoutControlCharacters
    .trim()
    .split(/[\\/]/);
  const filename = segments[segments.length - 1]?.trim();
  return filename && filename !== "." && filename !== ".." ? filename : null;
}

function contentDispositionFilename(header: string | null): string | null {
  if (header === null) return null;

  const extended = /(?:^|;)\s*filename\*\s*=\s*(?:"([^"]*)"|([^;]*))/iu.exec(header);
  if (extended) {
    const value = (extended[1] ?? extended[2] ?? "").trim();
    const encoded = /^UTF-8'[^']*'(.*)$/iu.exec(value)?.[1];
    if (encoded !== undefined) {
      try {
        return safeFilename(decodeURIComponent(encoded));
      } catch {
        // Fall back to the plain filename parameter when available.
      }
    }
  }

  const plain = /(?:^|;)\s*filename\s*=\s*(?:"((?:\\.|[^"])*)"|([^;]*))/iu.exec(header);
  if (!plain) return null;
  const value = plain[1] === undefined
    ? (plain[2] ?? "").trim()
    : plain[1].replace(/\\(.)/gu, "$1");
  return safeFilename(value);
}

export function subscribeUnauthorized(listener: () => void) {
  unauthorizedListeners.add(listener);
  return () => {
    unauthorizedListeners.delete(listener);
  };
}

export async function requestJson<T>(
  path: string,
  init: RequestInit = {},
  options: RequestOptions = {},
): Promise<T> {
  const response = await fetchApi(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init.headers },
  });
  return responseJson<T>(response, options);
}

export async function requestFormData<T>(
  path: string,
  form: FormData,
  init: Omit<RequestInit, "body"> = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.delete("Content-Type");
  const response = await fetchApi(path, { ...init, headers, body: form });
  return responseJson<T>(response);
}

export async function requestBlob(
  path: string,
  signal?: AbortSignal,
): Promise<{ blob: Blob; filename: string | null }> {
  const response = await fetchApi(path, { signal });
  if (!response.ok) throw await responseError(response);
  return {
    blob: await response.blob(),
    filename: contentDispositionFilename(response.headers.get("Content-Disposition")),
  };
}
