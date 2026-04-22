import type { ReactNode } from "react";
import { Footer } from "../components/Footer";

export const metadata = {
  title: "DefiBeat",
  description: "Transparency registry for DeFi protocols.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          background: "#0f172a",
          color: "#e2e8f0",
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
