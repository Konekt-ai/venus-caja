// Tailwind v3, no v4: la v4 emite oklch() y color-mix(), que Chrome 109
// (el ultimo que corre en la Windows 8 de la tienda) no entiende y descarta
// la regla entera, dejando la pantalla sin colores.
const config = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};

export default config;
