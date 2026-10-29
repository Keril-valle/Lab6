const { spawn } = require('child_process');
const http = require('http');
const net = require('net');
const path = require('path');
const { io } = require('socket.io-client');

const SERVER_PATH = path.resolve(__dirname, '..', 'server.js');
const EVENTO = 'Evento-Mensaje-Server';

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
      // sin Auth0 en las pruebas: la autenticacion se verifica en auth.socket.test.js
      env: Object.assign({}, process.env, { PORT: String(puerto), AUTH_REQUIRED: 'false' }),
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

function detenerServidor(hijo) {
  return new Promise(function (resolve) {
    if (!hijo || hijo.exitCode !== null) {
      resolve();
      return;
    }

    const limite = setTimeout(function () {
      if (hijo.exitCode === null) {
        hijo.kill('SIGKILL');
      }
      resolve();
    }, 3000);

    hijo.once('exit', function () {
      clearTimeout(limite);
      resolve();
    });

    hijo.kill();
  });
}

function conectarCliente(puerto) {
  return new Promise(function (resolve, reject) {
    const socket = io('http://127.0.0.1:' + puerto, {
      transports: ['websocket'],
      reconnection: false,
      timeout: 5000,
    });

    socket.once('connect', function () {
      resolve(socket);
    });

    socket.once('connect_error', function (error) {
      socket.close();
      reject(error);
    });
  });
}

function esperarMensaje(socket, accion, limiteMs) {
  const limite = limiteMs || 5000;

  return new Promise(function (resolve, reject) {
    const temporizador = setTimeout(function () {
      socket.off(EVENTO, alRecibir);
      reject(new Error('No se recibio el evento ' + EVENTO));
    }, limite);

    function alRecibir(crudo) {
      clearTimeout(temporizador);
      socket.off(EVENTO, alRecibir);

      try {
        resolve(JSON.parse(crudo));
      } catch (error) {
        reject(new Error('El evento no contenia JSON valido: ' + crudo));
      }
    }

    socket.on(EVENTO, alRecibir);
    accion();
  });
}

function enviar(socket, contenido) {
  const carga = typeof contenido === 'string' ? contenido : JSON.stringify(contenido);
  socket.emit(EVENTO, carga);
}

function peticionGet(puerto, ruta) {
  return new Promise(function (resolve, reject) {
    const solicitud = http.get(
      { host: '127.0.0.1', port: puerto, path: ruta },
      function (respuesta) {
        let cuerpo = '';
        respuesta.setEncoding('utf8');
        respuesta.on('data', function (fragmento) {
          cuerpo += fragmento;
        });
        respuesta.on('end', function () {
          resolve({ estado: respuesta.statusCode, cuerpo: cuerpo });
        });
      }
    );

    solicitud.on('error', reject);
  });
}

describe('Integracion del chat con Socket.IO', function () {
  let servidor;
  let puerto;
  let cliente;

  beforeAll(async function () {
    puerto = await obtenerPuertoLibre();
    servidor = await iniciarServidor(puerto);
    cliente = await conectarCliente(puerto);
  });

  afterAll(async function () {
    if (cliente) {
      cliente.close();
    }
    await detenerServidor(servidor);
  });

  describe('cuando el cliente pide la pagina del chat', function () {
    test('deberia responder 200 con el HTML que carga Socket.IO', async function () {
      const respuesta = await peticionGet(puerto, '/');

      expect(respuesta.estado).toBe(200);
      expect(respuesta.cuerpo).toContain('id="messages"');
      expect(respuesta.cuerpo).toContain('socket.io');
    });
  });

  describe('cuando un usuario envia una URL de imagen', function () {
    test('deberia retransmitirla como imagen con su src', async function () {
      const mensaje = await esperarMensaje(cliente, function () {
        enviar(cliente, { nombre: 'ana', mensaje: 'http://image.com/image.jpg', color: '#ff0000' });
      });

      expect(mensaje.tipo).toBe('imagen');
      expect(mensaje.mensaje.indexOf('<img src="http://image.com/image.jpg"')).toBe(0);
      expect(mensaje.mensaje).not.toContain('onerror');
    });
  });

  describe('cuando un usuario envia una URL de YouTube', function () {
    test('deberia retransmitirla como video embebido', async function () {
      const mensaje = await esperarMensaje(cliente, function () {
        enviar(cliente, {
          nombre: 'ana',
          mensaje: 'https://www.youtube.com/watch?v=qYwlqx-JLok',
          color: '#00ff00',
        });
      });

      expect(mensaje.tipo).toBe('video');
      expect(mensaje.mensaje.indexOf('<iframe')).toBe(0);
      expect(mensaje.mensaje).toContain('youtube.com/embed/qYwlqx-JLok');
    });
  });

  describe('cuando un usuario envia una URL de video directo', function () {
    test.each(['mp4', 'webm', 'ogg'])(
      'deberia retransmitir un archivo .%s como reproductor con controles',
      async function (extension) {
        const url = 'https://cdn.example.com/clip.' + extension;

        const mensaje = await esperarMensaje(cliente, function () {
          enviar(cliente, { nombre: 'ana', mensaje: url, color: '#ff0000' });
        });

        expect(mensaje.tipo).toBe('video');
        expect(mensaje.mensaje.indexOf('<video controls')).toBe(0);
        expect(mensaje.mensaje).toContain('src="' + url + '"');
      }
    );

    test('deberia conservar los parametros de consulta de la URL', async function () {
      const url = 'https://cdn.example.com/clip.mp4?token=abc&v=2';

      const mensaje = await esperarMensaje(cliente, function () {
        enviar(cliente, { nombre: 'ana', mensaje: url, color: '#ff0000' });
      });

      expect(mensaje.tipo).toBe('video');
      // el & se serializa como &amp; dentro del atributo; el navegador lo decodifica
      expect(mensaje.mensaje).toContain('clip.mp4?token=abc&amp;v=2');
    });

    test('deberia aceptar el esquema y la extension en mayusculas', async function () {
      const mensaje = await esperarMensaje(cliente, function () {
        enviar(cliente, {
          nombre: 'ana',
          mensaje: 'HTTP://CDN.EXAMPLE.COM/CLIP.MP4',
          color: '#ff0000',
        });
      });

      expect(mensaje.tipo).toBe('video');
      expect(mensaje.mensaje).toContain('<video');
    });

    test('deberia rechazar una URL de video que rompe el atributo src', async function () {
      const mensaje = await esperarMensaje(cliente, function () {
        enviar(cliente, {
          nombre: 'ana',
          mensaje: 'https://a.com/clip.mp4" onerror="alert(1)',
          color: '#ff0000',
        });
      });

      expect(mensaje.tipo).toBe('texto');
      expect(mensaje.mensaje).not.toContain('<video');
      expect(mensaje.mensaje).toContain('&quot;');
    });

    test('deberia rechazar un esquema javascript disfrazado de video', async function () {
      const mensaje = await esperarMensaje(cliente, function () {
        enviar(cliente, {
          nombre: 'ana',
          mensaje: 'javascript:alert(1)//https://a.com/clip.mp4',
          color: '#ff0000',
        });
      });

      expect(mensaje.tipo).toBe('texto');
      expect(mensaje.mensaje).not.toContain('<video');
    });
  });

  describe('cuando un usuario envia un mensaje de texto', function () {
    test('deberia retransmitirlo como texto y conservar el nombre y el color', async function () {
      const mensaje = await esperarMensaje(cliente, function () {
        enviar(cliente, { nombre: 'ana', mensaje: 'hola a todos', color: '#123abc' });
      });

      expect(mensaje.tipo).toBe('texto');
      expect(mensaje.mensaje).toBe('hola a todos');
      expect(mensaje.nombre).toBe('ana');
      expect(mensaje.color).toBe('#123abc');
    });
  });

  describe('cuando un usuario intenta inyectar scripts', function () {
    test('deberia escapar una etiqueta script en el mensaje', async function () {
      const mensaje = await esperarMensaje(cliente, function () {
        enviar(cliente, { nombre: 'ana', mensaje: '<script>alert(1)</script>', color: '#ff0000' });
      });

      expect(mensaje.tipo).toBe('texto');
      expect(mensaje.mensaje).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
      expect(mensaje.mensaje).not.toContain('<script');
    });

    test('deberia escapar HTML en el nombre del usuario', async function () {
      const mensaje = await esperarMensaje(cliente, function () {
        enviar(cliente, { nombre: '<img src=x onerror=alert(1)>', mensaje: 'hola', color: '#ff0000' });
      });

      expect(mensaje.nombre).not.toContain('<img');
      expect(mensaje.nombre).not.toContain('<');
    });

    test('deberia rechazar una imagen que rompe el atributo src', async function () {
      const mensaje = await esperarMensaje(cliente, function () {
        enviar(cliente, {
          nombre: 'ana',
          mensaje: 'http://a.com/a.jpg" onerror="alert(1)',
          color: '#ff0000',
        });
      });

      expect(mensaje.tipo).toBe('texto');
      expect(mensaje.mensaje).not.toContain('<img');
      expect(mensaje.mensaje).not.toContain('"');
      expect(mensaje.mensaje).toContain('&quot;');
    });

    test('deberia sanear un color malicioso a #000000', async function () {
      const mensaje = await esperarMensaje(cliente, function () {
        enviar(cliente, {
          nombre: 'ana',
          mensaje: 'hola',
          color: "red;}</style><script>alert(1)</script>",
        });
      });

      expect(mensaje.color).toBe('#000000');
    });

    test('deberia rechazar un video con HTML inyectado', async function () {
      const mensaje = await esperarMensaje(cliente, function () {
        enviar(cliente, {
          nombre: 'ana',
          mensaje: 'https://a.com/clip.mp4"><script>alert(1)</script>',
          color: '#ff0000',
        });
      });

      expect(mensaje.tipo).toBe('texto');
      expect(mensaje.mensaje).not.toContain('<video');
      expect(mensaje.mensaje).not.toContain('<script');
    });
  });

  describe('cuando la entrada necesita normalizacion', function () {
    test('deberia eliminar caracteres de control del mensaje', async function () {
      const mensaje = await esperarMensaje(cliente, function () {
        enviar(cliente, { nombre: 'ana', mensaje: 'hola\u0000mu\u0007ndo', color: '#ff0000' });
      });

      expect(mensaje.tipo).toBe('texto');
      expect(mensaje.mensaje).toBe('holamundo');
    });

    test('deberia descartar caracteres de control del nombre', async function () {
      const mensaje = await esperarMensaje(cliente, function () {
        enviar(cliente, { nombre: 'a\u0000na', mensaje: 'hola', color: '#ff0000' });
      });

      expect(mensaje.nombre).toBe('ana');
    });

    test('deberia normalizar un nombre que no es string', async function () {
      const mensaje = await esperarMensaje(cliente, function () {
        enviar(cliente, { nombre: 123, mensaje: 'hola', color: '#ff0000' });
      });

      expect(mensaje.nombre).toBe('Anomimo');
      expect(mensaje.mensaje).toBe('hola');
    });

    test('deberia normalizar un mensaje que no es string', async function () {
      const mensaje = await esperarMensaje(cliente, function () {
        enviar(cliente, { nombre: 'ana', mensaje: { texto: 'hola' }, color: '#ff0000' });
      });

      expect(mensaje.tipo).toBe('texto');
      expect(mensaje.mensaje).toBe('');
    });

    test('deberia tratar el JSON null como mensaje vacio', async function () {
      const mensaje = await esperarMensaje(cliente, function () {
        enviar(cliente, 'null');
      });

      expect(mensaje.tipo).toBe('texto');
      expect(mensaje.mensaje).toBe('');
    });
  });

  describe('cuando el mensaje no es JSON valido', function () {
    test('deberia retransmitirlo escapado como texto', async function () {
      const mensaje = await esperarMensaje(cliente, function () {
        enviar(cliente, '<script>alert(1)</script>');
      });

      expect(mensaje.tipo).toBe('texto');
      expect(mensaje.mensaje).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    });
  });

  describe('cuando llega una entrada con tipo invalido', function () {
    test('deberia responder sin error y seguir atendiendo mensajes', async function () {
      const respuestaInvalida = await esperarMensaje(cliente, function () {
        cliente.emit(EVENTO, 123);
      });

      expect(respuestaInvalida.mensaje).toBe('');

      const respuestaValida = await esperarMensaje(cliente, function () {
        enviar(cliente, { nombre: 'ana', mensaje: 'sigo vivo', color: '#ff0000' });
      });

      expect(respuestaValida.tipo).toBe('texto');
      expect(respuestaValida.mensaje).toBe('sigo vivo');
    });
  });

  describe('cuando hay varios clientes conectados', function () {
    test('deberia retransmitir el mensaje a todos', async function () {
      const otroCliente = await conectarCliente(puerto);

      try {
        const paraPrimero = esperarMensaje(cliente, function () {});
        const paraSegundo = esperarMensaje(otroCliente, function () {});

        enviar(cliente, { nombre: 'ana', mensaje: 'http://image.com/image.gif', color: '#ff0000' });

        const [primero, segundo] = await Promise.all([paraPrimero, paraSegundo]);

        expect(primero.tipo).toBe('imagen');
        expect(segundo.tipo).toBe('imagen');
        expect(segundo.mensaje).toContain('image.gif');
      } finally {
        otroCliente.close();
      }
    });
  });
});
