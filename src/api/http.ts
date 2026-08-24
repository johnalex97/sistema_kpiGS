export class ApiClientError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); this.name = "ApiClientError"; }
}

export async function requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api/v1"}${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init.headers },
  });
  const body = await response.json() as { data?: T; error?: { code?: string; message?: string }; errors?: Array<{ code?: string; message?: string }>; message?: string };
  if (!response.ok) {
    const detail = body.error ?? body.errors?.[0];
    throw new ApiClientError(response.status, detail?.code ?? "HTTP_ERROR", detail?.message ?? body.message ?? "No fue posible completar la solicitud");
  }
  return body.data as T;
}
