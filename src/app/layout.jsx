import './globals.css';

export const metadata = {
  title: 'Apex Tape Stock Management System',
  description: 'Industrial inventory, BOM calculation, production balancing, and order fulfillment system for adhesive tape manufacturing.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="antialiased bg-slate-900 text-slate-100 min-h-screen">
        {children}
      </body>
    </html>
  );
}
