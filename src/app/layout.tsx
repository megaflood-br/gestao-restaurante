import type { Metadata } from 'next';
import { IBM_Plex_Mono, Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-jakarta',
  display: 'swap',
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-plex-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Gestão Delivery',
  description:
    'Sistema modular em Next.js e TypeScript para gestão de pedidos, clientes, financeiro e equipe.',
  openGraph: {
    title: 'Gestão Delivery',
    description:
      'Sistema modular em Next.js e TypeScript para gestão de pedidos, clientes, financeiro e equipe.',
    type: 'website',
  },
};

const themeInitScript = `
  (function () {
    try {
      var saved = localStorage.getItem('vertice-theme');
      if (saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('dark');
      }
    } catch (e) {}
  })();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      suppressHydrationWarning
      className={`${plusJakartaSans.variable} ${ibmPlexMono.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-screen bg-[#f7f7f9] text-slate-900 dark:bg-[#0c0d11] dark:text-slate-100 antialiased">
        {children}
      </body>
    </html>
  );
}
