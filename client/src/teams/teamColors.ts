/** Brand-ish colours per team, used for card accents and badges. */
const COLORS: Record<string, { bg: string; fg: string }> = {
  CSK: { bg: '#f9cd05', fg: '#1a1a2e' },
  MI: { bg: '#004ba0', fg: '#ffffff' },
  RCB: { bg: '#d11d26', fg: '#ffffff' },
  KKR: { bg: '#3a225d', fg: '#f2c14e' },
  SRH: { bg: '#f26522', fg: '#ffffff' },
  RR: { bg: '#e73895', fg: '#ffffff' },
  DC: { bg: '#17449b', fg: '#ffffff' },
  PBKS: { bg: '#dd1f2d', fg: '#ffffff' },
  LSG: { bg: '#0057e2', fg: '#ffffff' },
  GT: { bg: '#1b2133', fg: '#d4af6a' },
};

export function teamColors(short: string): { bg: string; fg: string } {
  return COLORS[short] ?? { bg: '#1e3a8a', fg: '#ffffff' };
}
