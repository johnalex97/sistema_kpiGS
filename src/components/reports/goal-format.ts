export const formatCredits = (value: number) => new Intl.NumberFormat("es-HN", { maximumFractionDigits: 4 }).format(value);
