import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Providers } from "@/components/providers";
import { AuthGate } from "@/components/auth-gate";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Пост-Менеджер — отложенный постинг",
  description:
    "Дашборд для отложенного постинга в Telegram, MAX и VK: календарь публикаций, очереди постов, приписки по площадкам и интеграция с WordPress.",
  keywords: [
    "постинг",
    "Telegram",
    "MAX",
    "VK",
    "отложенные посты",
    "дашборд",
    "WordPress",
  ],
  authors: [{ name: "Пост-Менеджер" }],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <Providers>
          <AuthGate>{children}</AuthGate>
        </Providers>
        <Toaster />
        <Sonner />
      </body>
    </html>
  );
}
