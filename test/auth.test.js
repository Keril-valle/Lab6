const assert = require('assert');
const { crearVerificador } = require('../libs/auth');

describe('verificacion de tokens de Auth0', function () {
  let jose;
  let llavePrivada;
  let jwks;

  before(async function () {
    jose = await import('jose');

    const par = await jose.generateKeyPair('RS256');
    llavePrivada = par.privateKey;

    const jwk = await jose.exportJWK(par.publicKey);
    jwk.kid = 'clave-de-prueba';
    jwk.use = 'sig';
    jwk.alg = 'RS256';

    jwks = jose.createLocalJWKSet({ keys: [jwk] });
  });

  function firmar(opciones) {
    const opcionesToken = opciones || {};
    const payload = Object.assign(
      { email: 'ana@example.com', name: 'Ana' },
      opcionesToken.payload || {}
    );

    return new jose.SignJWT(payload)
      .setProtectedHeader({ alg: 'RS256', kid: 'clave-de-prueba' })
      .setIssuer(opcionesToken.issuer || 'https://tenant.test/')
      .setAudience(opcionesToken.audience || 'client-de-prueba')
      .setSubject('auth0|123')
      .setIssuedAt()
      .setExpirationTime(opcionesToken.exp || '1h')
      .sign(llavePrivada);
  }

  function crear() {
    return crearVerificador({
      domain: 'tenant.test',
      clientId: 'client-de-prueba',
      jwks: jwks,
    });
  }

  it('acepta un token valido y devuelve la identidad', async function () {
    const verificar = await crear();
    const identidad = await verificar(await firmar());

    assert.strictEqual(identidad.email, 'ana@example.com');
    assert.strictEqual(identidad.nombre, 'Ana');
    assert.strictEqual(identidad.sub, 'auth0|123');
  });

  it('rechaza un token ausente', async function () {
    const verificar = await crear();
    await assert.rejects(function () { return verificar(undefined); });
  });

  it('rechaza un token con otra audiencia', async function () {
    const verificar = await crear();
    const token = await firmar({ audience: 'otra-aplicacion' });
    await assert.rejects(function () { return verificar(token); });
  });

  it('rechaza un token expirado', async function () {
    const verificar = await crear();
    const token = await firmar({ exp: Math.floor(Date.now() / 1000) - 3600 });
    await assert.rejects(function () { return verificar(token); });
  });

  it('rechaza un token de otro emisor', async function () {
    const verificar = await crear();
    const token = await firmar({ issuer: 'https://otro-tenant.test/' });
    await assert.rejects(function () { return verificar(token); });
  });

  it('rechaza un token que no es un JWT', async function () {
    const verificar = await crear();
    await assert.rejects(function () { return verificar('no-es-un-jwt'); });
  });

  it('no crea el verificador sin dominio o client ID', async function () {
    await assert.rejects(function () {
      return crearVerificador({ domain: '', clientId: 'client-de-prueba', jwks: jwks });
    });
  });
});
