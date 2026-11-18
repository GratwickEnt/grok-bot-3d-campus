export const metadata = { title: "Control Center", description: "Private" };
export const viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" as const, themeColor: "#05070c" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr">
      <body style={{ margin: 0, background: "#05070c", color: "#fcf6ec", colorScheme: "dark", WebkitTextSizeAdjust: "100%" }}>{children}</body>
    </html>
  );
}
