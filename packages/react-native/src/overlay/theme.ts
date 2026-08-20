export const theme = {
  colors: {
    scrim: 'rgba(0,0,0,0.6)',
    surface: '#16181d',
    surfaceRaised: '#1f232b',
    border: '#2c313b',
    text: '#e8eaed',
    textMuted: '#9aa0aa',
    accent: '#7aa2f7',
    success: '#7ec699',
    warn: '#e0af68',
    error: '#f7768e',
  },
  spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 },
  radius: { sm: 6, md: 10, pill: 999 },
  // One scale, so sizes cannot drift file by file the way the raw numbers did.
  // Bumped from the previous 11-15pt range: iOS body text is 17pt, and an
  // overlay read at arm's length on a phone while debugging needs to be at
  // least legible, not merely compact.
  font: {
    mono: 'Menlo',
    size: {
      xs: 13, // labels and metadata
      sm: 14, // chips, secondary text
      md: 15, // body text and values
      lg: 17, // actions and panel titles
      xl: 20, // overlay title
    },
  },
} as const;
