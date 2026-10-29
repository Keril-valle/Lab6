'use strict';

// Verificacion de los tokens de identidad de Auth0 para el handshake de Socket.IO.
// `jose` se publica como ESM, por eso se carga con import() dinamico una sola vez.

var josePromesa = null;

function cargarJose() {
  if (!josePromesa) {
    josePromesa = import('jose');
  }
  return josePromesa;
}

// Acepta "tenant.us.auth0.com", "https://tenant.us.auth0.com" o ".../".
function normalizarDominio(valor) {
  return String(valor || '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '');
}

/**
 * Crea una funcion que valida un ID token emitido por el tenant configurado.
 * Comprueba firma (JWKS), emisor, audiencia (client ID) y expiracion.
 *
 * @param {{domain: string, clientId: string, jwks?: object}} opciones
 * @returns {Promise<(token: string) => Promise<{sub: string, nombre: string, email: string|null, picture: string|null}>>}
 */
async function crearVerificador(opciones) {
  var dominio = normalizarDominio(opciones.domain);
  var clientId = opciones.clientId;

  if (!dominio || !clientId) {
    throw new Error('configuracion_incompleta');
  }

  var jose = await cargarJose();
  var issuer = 'https://' + dominio + '/';

  // `jwks` permite inyectar un JWKS local en las pruebas.
  var jwks = opciones.jwks || jose.createRemoteJWKSet(new URL(issuer + '.well-known/jwks.json'));

  return async function verificarToken(token) {
    if (!token || typeof token !== 'string') {
      throw new Error('token_ausente');
    }

    var resultado = await jose.jwtVerify(token, jwks, {
      issuer: issuer,
      audience: clientId,
      clockTolerance: 60,
    });

    var datos = resultado.payload || {};

    return {
      sub: datos.sub || null,
      nombre: datos.name || datos.nickname || datos.email || datos.sub || 'usuario',
      email: datos.email || null,
      picture: datos.picture || null,
    };
  };
}

module.exports = {
  crearVerificador: crearVerificador,
  normalizarDominio: normalizarDominio,
};
