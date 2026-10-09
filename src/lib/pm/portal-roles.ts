/** Ρόλοι ατόμων της επιχείρησης-πελάτη (portal «Η ομάδα σας») — plain module, χρήσιμο και σε client. */
export const TEAM_ROLES = ['Λογιστής', 'Υπεύθυνος έργου', 'Νόμιμος εκπρόσωπος', 'Άλλο'] as const
export type TeamRole = (typeof TEAM_ROLES)[number]
