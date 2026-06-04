'use client'

import { Toaster as Sonner, ToasterProps } from 'sonner'

// The dashboard renders in a single fixed dark theme (see globals.css) and has
// no next-themes ThemeProvider mounted. Reading useTheme() here resolved the
// theme on the client only, producing a server/client HTML mismatch (React
// hydration error #418). Pin the theme to "dark" to keep render deterministic.
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="dark"
      className="toaster group"
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
