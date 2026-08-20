import type { Metadata, Viewport } from "next";
import RegistrarSW from "@/components/RegistrarSW";
import "./globals.css";

export const metadata: Metadata = {
  title: "Venus Caja",
  description: "Punto de venta de Venus Boutique",
  manifest: "/manifest.json",
  formatDetection: { telephone: false, date: false, address: false, email: false },
};

export const viewport: Viewport = {
  themeColor: "#eee5d4",
  width: "device-width",
  initialScale: 1,
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-MX">
      <body className="min-h-screen">
        {/* Prende el trabajador de servicio: es lo que deja recargar la
            pantalla sin internet y seguir cobrando. */}
        <RegistrarSW />
        {children}
      </body>
    </html>
  );
}
