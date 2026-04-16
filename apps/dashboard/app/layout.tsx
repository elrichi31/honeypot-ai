import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { TimezoneProvider } from '@/components/timezone-provider'
import { readConfig } from '@/lib/server-config'
import './globals.css'

const _geist = Geist({ subsets: ["latin"] });
const _geistMono = Geist_Mono({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: 'HoneyTrap - SSH Honeypot Monitor',
  description: 'Real-time monitoring dashboard for SSH honeypot events',
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
    <html lang="en" className="bg-background">
      <body className="font-sans antialiased">
        <TimezoneProvider timezone={timezone}>
          {children}
        </TimezoneProvider>
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
