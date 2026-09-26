import "./globals.css";

export const metadata = {
  title: "AudioDoc Reader",
  description: "Upload documents and listen with high-quality text-to-speech."
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
