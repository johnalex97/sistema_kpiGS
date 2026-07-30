export interface ApiErrorDetail {
  field?: string;
  message: string;
  code?: string;
}

export interface ApiMeta {
  requestId: string;
  [key: string]: unknown;
}

export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T | null;
  errors: ApiErrorDetail[];
  meta: ApiMeta;
}
