// Aviso one-shot por proceso: Sofascore exige token anti-captcha y los scripts
// con capa HTTP propia (calendario/jugadores/equipos) no lo envían.
let yaAvisado = false;

export function avisoCaptcha403() {
  if (yaAvisado) return;
  yaAvisado = true;
  console.error(
    '⚠️  Sofascore ha respondido 403 (challenge anti-captcha).\n' +
    '    Este script usa su propia capa HTTP y NO envía el token\n' +
    '    (data/.sofascore-token.json): renovarlo NO arreglará sus peticiones.\n' +
    '    - Si lo que necesitas son match-stats: esos scripts ya van con token;\n' +
    '      renueva con la URL del captcha en tu navegador, copia localStorage\n' +
    '      "sofa.captcha.token" y ejecuta:\n' +
    '      node scripts/sofascoreToken.js --set <token>\n' +
    '    - Para que ESTE script funcione: pide conectarlo a\n' +
    '      scripts/sofascoreHttp.js (heredaría el token automáticamente).'
  );
}
