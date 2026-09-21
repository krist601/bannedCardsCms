import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Banned Cards · Control room",
  description: "Catalog, inventory and orders administration",
};
export default function Layout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
