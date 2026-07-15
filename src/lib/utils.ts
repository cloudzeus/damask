import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Λεπτά (ΛΕΠΤΑ, int — ίδια μονάδα με τη Viva API) → μορφοποιημένο € ελληνικού locale, π.χ. 4990 → "49,90 €". */
export function formatEuro(cents: number): string {
  return (cents / 100).toLocaleString('el-GR', { style: 'currency', currency: 'EUR' })
}
