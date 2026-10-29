// npm install para descargar los paquetes...

// carga .env si existe; si no, usa las variables del entorno (Vercel, CI)
try {
  process.loadEnvFile();
} catch (error) {
  // sin archivo .env: no es un error
}

// librerias
var validation = require('./libs/unalib');
var auth = require('./libs/auth');
var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var port = process.env.PORT || 3000;

// configuracion de autenticacion (Auth0)
var dominio = auth.normalizarDominio(process.env.AUTH0_DOMAIN || '');
var clientId = process.env.AUTH0_CLIENT_ID || '';
var authRequerida = process.env.AUTH_REQUIRED !== 'false';

if (!authRequerida) {
  console.warn('[auth] AUTH_REQUIRED=false: autenticacion desactivada (solo para pruebas).');
} else if (!dominio || !clientId) {
  console.warn('[auth] Faltan AUTH0_DOMAIN y/o AUTH0_CLIENT_ID: el chat rechazara las conexiones. Copia .env.example a .env y completalos.');
}

// configuracion publica para el navegador: nunca incluye secretos
app.get('/config.json', function (req, res) {
  res.set('Cache-Control', 'no-store');
  res.json({
    domain: dominio,
    clientId: clientId,
    authRequired: authRequerida,
  });
});

// root: presentar html
app.get('/', function (req, res) {
  res.sendFile(__dirname + '/index.html');
});

// verificador de tokens; se resuelve una sola vez y se reutiliza
var verificador = null;
if (authRequerida && dominio && clientId) {
  verificador = auth.crearVerificador({ domain: dominio, clientId: clientId });
  verificador.catch(function () {
    console.warn('[auth] No se pudo inicializar el verificador de tokens de Auth0.');
  });
}

// handshake: sin identidad valida no se acepta la conexion
io.use(async function (socket, next) {
  if (!authRequerida) {
    return next();
  }

  try {
    if (!verificador) {
      throw new Error('configuracion_incompleta');
    }

    var verificar = await verificador;
    var token = socket.handshake.auth && socket.handshake.auth.token;
    socket.user = await verificar(token);
    next();
  } catch (error) {
    next(new Error('unauthorized'));
  }
});

// escuchar una conexion por socket
io.on('connection', function (socket) {
  if (socket.user) {
    console.log('[chat] conectado: ' + (socket.user.email || socket.user.sub));
  }

  // si se escucha "chat message"
  socket.on('Evento-Mensaje-Server', function (msg) {
    msg = validation.validateMessage(msg);
    // volvemos a emitir el mismo mensaje
    io.emit('Evento-Mensaje-Server', msg);
  });
});

module.exports = app;

// en local se levanta el servidor; en Vercel la plataforma importa la app
if (require.main === module) {
  http.listen(port, function () {
    console.log('listening on *:' + port);
  });
}
