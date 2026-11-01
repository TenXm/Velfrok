import "./globals.css";
import { CartProvider } from "@/context/CartContext";

export const viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 text-gray-900">
        <CartProvider>
          <main className="fade-in">{children}</main>
        </CartProvider>
      </body>
    </html>
  );
}
