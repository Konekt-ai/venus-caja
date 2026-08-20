import TecladoPin from "@/components/TecladoPin";
import { nombreNegocio } from "@/lib/consultas";

export const dynamic = "force-dynamic";

export default function Pagina() {
  let negocio = "Venus Boutique";
  try {
    negocio = nombreNegocio();
  } catch {
    // Sin base a la mano se entra igual: el nombre es lo de menos.
  }
  return <TecladoPin negocio={negocio} />;
}
