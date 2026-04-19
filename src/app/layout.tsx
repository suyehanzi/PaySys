import type { Metadata } from "next";
import "@/app/globals.css";

export const metadata: Metadata = {
  title: "PaySys",
  description: "Local subscription relay and payment admin",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
