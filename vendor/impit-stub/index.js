// Stub de impit: satisface el import estático de camoufox en máquinas con
// glibc < 2.33 (Ubuntu 20.04). El impit real no carga ahí; este stub nunca se
// invoca en nuestros flujos (solo se usa con proxy, que no usamos) y lanza
// claramente si algo lo intenta.
export class Impit {
  constructor() {
    throw new Error('impit-stub: invocado en un flujo sin proxy. Si necesitas proxy, instala impit real en una máquina con glibc >= 2.33.');
  }
}
export default Impit;
