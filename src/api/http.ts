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
  let response: Response;
  try {
    response = await fetch(`${import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api/v1"}${path}`, {
      ...init,
      credentials: "include",
      headers: { "Content-Type": "application/json", ...init.headers },
    });
  } catch {
    throw new ApiNetworkError();
  }

  if (response.status === 204) return undefined as T;

  const body = await response.json() as {
    data?: T;
    error?: ApiFieldError;
    errors?: ApiFieldError[];
    message?: string;
  };

  if (!response.ok) {
    const errors = body.errors ?? (body.error ? [body.error] : []);
    const detail = errors[0];
    if (response.status === 401 && options.notifyUnauthorized !== false) {
      unauthorizedListeners.forEach((listener) => listener());
    }
    throw new ApiClientError(
      response.status,
      detail?.code ?? "HTTP_ERROR",
      detail?.message ?? body.message ?? "No fue posible completar la solicitud",
      errors,
    );
  }

  return body.data as T;
}
