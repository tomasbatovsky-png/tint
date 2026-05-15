import "./globals.css";

export const metadata = {
  title: "Tint — See the atmosphere of the internet",
  description: "A tiny browser layer that reveals the atmosphere of the page you’re reading."
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
