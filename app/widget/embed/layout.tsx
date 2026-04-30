import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Epicure Inbox Widget",
  description: "Customer Support Widget",
};

export default function EmbedLayout({ children }: { children: React.ReactNode }) {
  return <main className="light">{children}</main>;
}
