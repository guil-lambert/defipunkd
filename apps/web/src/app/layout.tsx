import type { ReactNode } from "react";
import { Footer } from "../components/Footer";
import "./globals.css";

export const metadata = {
  title: "DefiBeat",
  description: "Transparency registry for DeFi protocols.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily: "system-ui, sans-serif",
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ flex: 1 }}>{children}</div>
        <Footer />
      </body>
    </html>
  );
}
