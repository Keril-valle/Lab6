const { spawn } = require('child_process');
const net = require('net');
const path = require('path');
const { io } = require('socket.io-client');

const SERVER_PATH = path.resolve(__dirname, '..', 'server.js');

function obtenerPuertoLibre() {
  return new Promise(function (resolve, reject) {
    const sonda = net.createServer();

    sonda.once('error', reject);
    sonda.listen(0, '127.0.0.1', function () {
      const puerto = sonda.address().port;
      sonda.close(function () {
        resolve(puerto);
      });
    });
  });
}

function iniciarServidor(puerto) {
  return new Promise(function (resolve, reject) {
    const hijo = spawn(process.execPath, [SERVER_PATH], {
      cwd: path.resolve(__dirname, '..'),
      env: Object.assign({}, process.env, {
        PORT: String(puerto),
        AUTH_REQUIRED: 'true',
        AUTH0_DOMAIN: 'tenant.test',
        AUTH0_CLIENT_ID: 'client-de-prueba',
      }),
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let salida = '';
    let resuelto = false;

    const temporizador = setTimeout(function () {
      if (!resuelto) {
        hijo.kill();
        reject(new Error('El servidor no arranco a tiempo. Salida:\n' + salida));
      }
    }, 10000);

    function acumular(fragmento) {
      salida += fragmento.toString();

      if (!resuelto && salida.indexOf('listening on') !== -1) {
        resuelto = true;
        clearTimeout(temporizador);
        resolve(hijo);
      }
    }

    hijo.stdout.on('data', acumular);
    hijo.stderr.on('data', acumular);

    hijo.once('exit', function (codigo) {
      if (!resuelto) {
        clearTimeout(temporizador);
        reject(new Error('El servidor termino con codigo ' + codigo + '. Salida:\n' + salida));
      }
    });
  });
}

// devuelve el error de conexion, o null si la conexion se acepto
function conectar(puerto, auth) {
  return new Promise(function (resolve) {
    const socket = io('http://127.0.0.1:' + puerto, {
      transports: ['websocket'],
      reconnection: false,
      timeout: 5000,
      auth: auth,
    });

    const cerrar = function (resultado) {
      socket.close();
      resolve(resultado);
    };

    socket.once('connect', function () {
      cerrar(null);
    });

    socket.once('connect_error', function (error) {
      cerrar(error);
    });
  });
}

describe('handshake de Socket.IO con autenticacion activa', function () {
  let puerto;
  let servidor;

  beforeAll(async function () {
    puerto = await obtenerPuertoLibre();
    servidor = await iniciarServidor(puerto);
  });

  afterAll(function () {
    if (servidor) {
      servidor.kill();
    }
  });

  it('rechaza una conexion sin token', async function () {
    const error = await conectar(puerto);

    expect(error).toBeTruthy();
    expect(error.message).toMatch(/unauthorized/);
  });

  it('rechaza una conexion con un token invalido', async function () {
    const error = await conectar(puerto, { token: 'token-falso' });

    expect(error).toBeTruthy();
    expect(error.message).toMatch(/unauthorized/);
  });

  it('publica la configuracion publica sin secretos', async function () {
    const respuesta = await fetch('http://127.0.0.1:' + puerto + '/config.json');
    const config = await respuesta.json();

    expect(config.authRequired).toBe(true);
    expect(config.domain).toBe('tenant.test');
    expect(config.clientId).toBe('client-de-prueba');
    expect(Object.keys(config).sort()).toEqual(['authRequired', 'clientId', 'domain']);
  });
});
