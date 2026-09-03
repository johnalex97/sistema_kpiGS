const countFormatter = new Intl.NumberFormat("es-HN", { maximumFractionDigits: 0 });

function groupInteger(value: string): string {
  return value.replace(/\B(?=(\d{3})+(?!\d))/gu, ",");
}

export function formatCount(value: number): string {
  return countFormatter.format(value);
}

export function formatDecimalString(value: string, minimumFractionDigits = 2): string {
  const match = /^([+-]?)(\d+)(?:\.(\d+))?$/u.exec(value.trim());
  if (!match) return value;
  const sign = match[1] ?? "";
  const integer = (match[2] ?? "0").replace(/^0+(?=\d)/u, "");
  const fraction = (match[3] ?? "").padEnd(minimumFractionDigits, "0");
  return `${sign}${groupInteger(integer)}${fraction ? `.${fraction}` : ""}`;
}

export function formatCurrency(value: string): string {
  return `L\u00a0${formatDecimalString(value)}`;
}

export function formatMinutes(minutes: number): string {
  return `${formatCount(Math.floor(minutes / 60))} h ${String(minutes % 60).padStart(2, "0")} min`;
}

export function formatBytes(value: string): string {
  if (!/^\d+$/u.test(value)) return value;
  const bytes = BigInt(value);
  if (bytes >= 1_048_576n) {
    const tenths = (bytes * 10n + 524_288n) / 1_048_576n;
    return `${tenths / 10n}.${tenths % 10n}\u00a0MB`;
  }
  const kilobytes = (bytes + 512n) / 1_024n;
  return `${kilobytes > 0n ? kilobytes : 1n}\u00a0KB`;
}
