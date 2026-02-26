import type { Metadata } from 'next';
import { github, site } from '@/lib/config';
import './globals.css';

const title = `${site.name} — ${site.tagline}`;

export const metadata: Metadata = {
  title,
  description: site.description,
  keywords: [
    'automation',
    'self-hosted',
    'local-first',
    'home automation',
    'workflow',
    'plugins',
    'open source',
    'brika',
    'IoT',
    'dashboard',
  ],
  authors: [{ name: github.owner, url: github.url }],
  creator: github.owner,
  metadataBase: new URL(site.url),
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title,
    description: site.description,
    url: site.url,
    siteName: site.name,
    type: 'website',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description: site.description,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: site.name,
  description: site.description,
  url: site.url,
  applicationCategory: 'DeveloperApplication',
  operatingSystem: 'macOS, Linux, Windows, Docker',
  license: `https://github.com/${github.owner}/${github.repo}/blob/master/LICENSE`,
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'USD',
  },
  isAccessibleForFree: true,
  codeRepository: `https://github.com/${github.owner}/${github.repo}`,
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
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
