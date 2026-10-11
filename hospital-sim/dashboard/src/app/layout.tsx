import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Sahhanito · Hospital Simulator',
  description: 'OpenHospital Sim dashboard driving the Grand Tunis hospital engines used by Sahhanito',
  icons: { icon: '/favicon.ico' },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-surface text-text-primary antialiased">{children}</body>
    </html>
  )
}
