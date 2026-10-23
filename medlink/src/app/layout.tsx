import type { Metadata } from "next";
import { Toaster } from "sonner";
import { ThemeProvider, themeInitScript } from "@/lib/theme";
import Navbar from "@/components/Navbar";
import "./globals.css";

export const metadata: Metadata = {
  title: "MedLink: Unified Health Record",
  description: "One patient record across hospitals, labs and uploads, with AI pre-consult briefs and clinical alerts.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="antialiased">
        <ThemeProvider>
            <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors duration-200">
              <Navbar />
              <main className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6 sm:py-8">{children}</main>
            </div>
            <Toaster richColors position="top-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
