import "./globals.css";
import { Inter } from "next/font/google";
import { ReactNode } from "react";
import Toaster from "./toaster";

const inter = Inter({ subsets: ["latin"] });

export const metadata = {
  title: "Chat App – Real-time messaging",
  description:
    "Real-time chat application built with WebSockets and Next.js.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={inter.className}>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
