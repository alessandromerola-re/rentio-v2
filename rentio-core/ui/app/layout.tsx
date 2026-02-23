import type { ReactNode } from 'react';

export const metadata = {
  title: 'Rentio Admin',
  description: 'Rentio v2 Admin Console'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
