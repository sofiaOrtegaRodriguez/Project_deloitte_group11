const euro = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' });
const number1 = new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 1 });
const integer = new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 0 });

/** Euros the Portuguese way, e.g. "1 234,50 €". */
export function formatEur(value: number | null | undefined): string {
  return value == null ? '–' : euro.format(value);
}

/** A number with at most one decimal and pt-PT separators. */
export function formatDecimal(value: number | null | undefined): string {
  return value == null ? '–' : number1.format(value);
}

export function formatInteger(value: number | null | undefined): string {
  return value == null ? '–' : integer.format(value);
}
