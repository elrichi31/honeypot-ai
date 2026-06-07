import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { TimezoneProvider } from '@/components/timezone-provider'
import { SidebarLayout } from '@/components/sidebar-layout'
import { Toaster } from '@/components/ui/sonner'
import { readConfig } from '@/lib/server-config'
import './globals.css'

// Loading these registers the Geist / Geist Mono @font-face rules that
// globals.css references by name (--font-sans: 'Geist', --font-mono: 'Geist Mono').
// Without these calls the families don't exist and text falls back to serif.
const geistSans = Geist({ subsets: ['latin'] })
const geistMono = Geist_Mono({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'HoneyTrap - Honeypot Monitor',
  description: 'Real-time monitoring dashboard for all honeypot sensors',
  generator: 'v0.app',
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const config = readConfig()
  const timezone = config.timezone ?? process.env.DASHBOARD_TIMEZONE ?? "UTC"
  return (
    <html lang="en" className={`bg-background ${geistSans.className} ${geistMono.className}`} suppressHydrationWarning>
      <body className="font-sans antialiased">
        <TimezoneProvider timezone={timezone}>
          <SidebarLayout>{children}</SidebarLayout>
        </TimezoneProvider>
        <Toaster richColors position="top-right" />
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
