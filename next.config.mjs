/** @type {import('next').NextConfig} */
const nextConfig = {
  // better-sqlite3 es un modulo nativo: Next debe cargarlo desde node_modules
  // en vez de intentar empaquetarlo.
  serverExternalPackages: ["better-sqlite3"],

  // La computadora de la tienda es Windows 8 y ahi el navegador mas nuevo que
  // existe es Chrome/Edge 109. Next 15 compila para Chrome 64+, asi que sirve;
  // lo que NO puede entrar es Next 16, que sube el piso a Chrome 111. La version
  // esta fijada en package.json a proposito.
  devIndicators: false,
};

export default nextConfig;
