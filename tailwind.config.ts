import type { Config } from "tailwindcss";

/**
 * La paleta es la misma del sistema de bodega, copiada valor por valor
 * para que las dos pantallas se vean hermanas.
 *
 * Va en hexadecimal y no en oklch a proposito: la caja se abre desde una
 * Windows 8, donde el navegador mas nuevo posible es Chrome 109, y ahi
 * oklch() y color-mix() no existen. En Tailwind v3 un "bg-papel/60" se
 * compila a rgba(), que si entiende.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Marfil y beige: los fondos
        marfil: "#faf6ee",
        beige: "#eee5d4",
        "beige-hondo": "#e2d6be",
        papel: "#fffdf9",
        crema: "#f4eee2",

        // El negro del logo, y sus grados
        tinta: "#1a1613",
        carbon: "#2b241d",
        humo: "#6f6558",
        linea: "#e6dcc7",
        "linea-fuerte": "#d5c7ac",

        // Dorado: solo para detalles y foco, no para texto
        oro: "#a98a44",
        "oro-claro": "#cbaa66",
        "oro-palido": "#f2e9d4",
        "oro-tenue": "#fbf6ea",

        // Vino: el acento de las acciones
        vino: "#8c2740",
        "vino-oscuro": "#6d1c31",
        "vino-palido": "#f9ecef",

        // Estados, en tonos de boutique y no de semaforo
        verde: "#3f6f52",
        "verde-palido": "#ecf3ee",
        ambar: "#8f6410",
        "ambar-palido": "#f9f0dc",
        rojo: "#a02c2c",
        "rojo-palido": "#faece9",
      },
      fontFamily: {
        sans: ['"Segoe UI"', "ui-sans-serif", "system-ui", "Roboto", "Helvetica", "Arial", "sans-serif"],
        titulo: ["Georgia", '"Hoefler Text"', '"Times New Roman"', "serif"],
      },
      borderRadius: {
        // Esquinas apenas redondeadas, como en bodega.
        sm: "3px",
      },
      fontSize: {
        // Los numeros de la caja se leen a un metro de distancia.
        cifra: ["2.75rem", { lineHeight: "1", letterSpacing: "-0.02em" }],
        "cifra-grande": ["4rem", { lineHeight: "1", letterSpacing: "-0.025em" }],
      },
    },
  },
  plugins: [],
};

export default config;
