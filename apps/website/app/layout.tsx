import type { Metadata } from 'next';
import { site } from '@/lib/config';
import './globals.css';

const title = `${site.name} — ${site.tagline}`;

export const metadata: Metadata = {
  title,
  description: site.description,
  openGraph: {
    title,
    description: site.description,
    url: site.url,
    siteName: site.name,
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description: site.description,
  },
};

// Inline script to prevent flash of wrong theme
const themeScript = `
  (function(){
    try {
      var t = localStorage.getItem('theme');
      var d = t === 'dark' || (!t && matchMedia('(prefers-color-scheme:dark)').matches);
      document.documentElement.classList.toggle('dark', d);
    } catch(e) {}
  })()
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
