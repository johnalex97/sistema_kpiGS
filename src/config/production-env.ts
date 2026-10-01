export function requireProductionApiBaseUrl(value: string | undefined): string {
  const apiBaseUrl = value?.trim();
  if (!apiBaseUrl) {
    throw new Error("VITE_API_BASE_URL es obligatoria para el build de producción.");
  }

  return apiBaseUrl;
}
