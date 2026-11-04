# UNA Chat

Aplicación de chat en tiempo real desarrollada con Node.js, Express y Socket.IO. Además de mensajes de texto, el chat reconoce URLs de imágenes y videos y las muestra en la conversación. El acceso requiere iniciar sesión con una cuenta social mediante Auth0.

## Características

- Inicio de sesión social (OAuth/OIDC) con Auth0, sin contraseña propia.
- Identidad del usuario autenticado visible y cierre de sesión.
- El chat exige autenticación: el servidor rechaza conexiones sin token válido.
- Chat en tiempo real con Socket.IO.
- Renderizado de imágenes (`<img>`), videos de YouTube (`<iframe>`) y videos directos (`<video controls>`).
- Validación y sanitización de todo el contenido enviado por los usuarios.
- Pruebas unitarias, de integración y E2E.

## Requisitos

- Node.js 20.12 o superior (se usa `process.loadEnvFile` y `jose` 6).
- npm 9 o superior.
- Una cuenta gratuita en <https://auth0.com> con una aplicación SPA (ver [Autenticación con Auth0](#autenticación-con-auth0)).

## Instalación

```bash
npm install
```

Para las pruebas E2E, instalá el navegador de Playwright una sola vez:

```bash
npx playwright install chromium
```

## Configuración local

1. Copiá el archivo de variables:

   ```bash
   cp .env.example .env          # PowerShell: Copy-Item .env.example .env
   ```

2. Completá `AUTH0_DOMAIN` y `AUTH0_CLIENT_ID` con los datos de tu aplicación en Auth0 (ver más abajo).
3. Arrancá el servidor:

   ```bash
   npm start
   ```

4. Abrí [http://localhost:3000](http://localhost:3000) (usá `localhost`, no `127.0.0.1`).

Para usar otro puerto: `PORT=4000 npm start` (PowerShell: `$env:PORT=4000; npm start`).

## Autenticación con Auth0

El login ocurre en el navegador con el SDK oficial `auth0-spa-js`. El servidor valida el ID token en el handshake de Socket.IO, así que **el proyecto no usa `client_secret`**.

### 1. Crear la aplicación en Auth0

1. Crear una cuenta en <https://auth0.com/signup> y elegir región (no se puede cambiar después).
2. Ir a **Applications → Applications → Create Application**:
   - Name: `UNA CHAT`
   - Application Type: **Single Page Application**
3. En **Settings**, completar y **guardar** (Save Changes):

   | Campo | Valor |
   |---|---|
   | Allowed Callback URLs | `http://localhost:3000`, `https://TU-APP.vercel.app` |
   | Allowed Logout URLs | `http://localhost:3000`, `https://TU-APP.vercel.app` |
   | Allowed Web Origins | `http://localhost:3000`, `https://TU-APP.vercel.app` |

   Varios valores van separados por coma, en una sola línea cada campo.

   > En una SPA el callback es el origen exacto (sin `/callback`) y debe coincidir carácter por carácter. Usá `localhost`, no `127.0.0.1`.

4. Anotar **Domain** y **Client ID**. El **Client Secret** no se usa en este flujo y no debe copiarse a ningún archivo.

### 2. Habilitar el proveedor social (GitHub)

1. En GitHub: **Settings → Developer settings → OAuth Apps → New OAuth App**.
   - Homepage URL: `http://localhost:3000`
   - Authorization callback URL: `https://TU-TENANT.us.auth0.com/login/callback`
2. Copiar el **Client ID** y generar un **Client Secret**.
3. En Auth0: **Authentication → Social → Create Connection → GitHub**. Pegar ambos valores y guardar.
4. En Auth0: **Applications → UNA CHAT → Connections**: activar la conexión `github`.

## Variables de entorno

| Variable | Obligatoria | Descripción |
|---|---|---|
| `AUTH0_DOMAIN` | sí | Dominio del tenant, sin `https://` |
| `AUTH0_CLIENT_ID` | sí | Client ID de la aplicación SPA (es público) |
| `AUTH_REQUIRED` | no | `true` por defecto. `false` solo para pruebas automatizadas |
| `PORT` | no | Puerto del servidor local (3000 por defecto) |
| `SOCKET_URL` | no | Host del socket si está separado de la página. Vacío = mismo host |
| `ALLOWED_ORIGINS` | no | Orígenes permitidos para el socket, separados por coma |

En Vercel las variables se configuran en **Project → Settings → Environment Variables**.

## Cómo funciona el login

1. `GET /config.json` devuelve `{ domain, clientId, authRequired, socketUrl }`: solo información pública.
2. El cliente inicializa Auth0 y redirige al Universal Login.
3. Al volver, procesa el callback con `handleRedirectCallback()` y obtiene la identidad con `getUser()` y el ID token con `getIdTokenClaims()`.
4. Con sesión iniciada, el chat se conecta a Socket.IO enviando el ID token en `auth.token`.
5. El servidor verifica firma, emisor, audiencia y expiración contra el JWKS del tenant (`libs/auth.js`). Si algo falla, rechaza la conexión con `unauthorized`.
6. **Cerrar sesión** cierra la sesión en Auth0 y vuelve a la pantalla de inicio.
7. Si el usuario cancela o Auth0 devuelve un error, la página muestra el mensaje con el detalle técnico y un botón **Reintentar**.

## Despliegue en Vercel

Vercel ejecuta el servidor como función serverless. El login, la identidad y el logout funcionan en Vercel. **El chat en vivo no**: Socket.IO necesita un proceso persistente que Vercel no ofrece. En ese despliegue la página muestra "Chat en vivo no disponible en este despliegue".

Pasos:

1. Importar el repositorio en Vercel (framework preset: **Other**). `vercel.json` enruta todas las peticiones a `server.js`.
2. En **Settings → Environment Variables** (Production y Preview) cargar:
   - `AUTH0_DOMAIN`
   - `AUTH0_CLIENT_ID`
   - `AUTH_REQUIRED=true`

   No cargar `SOCKET_URL`.
3. En Auth0 agregar la URL de Vercel a **Allowed Callback URLs**, **Allowed Logout URLs** y **Allowed Web Origins** (ver la tabla de arriba).
4. Redesplegar para que tome las variables.
5. Verificar en `https://TU-APP.vercel.app`: **Iniciar sesión** → identidad visible → **Cerrar sesión**.

Para tener chat en vivo también desde Vercel, habría que alojar el servidor de Socket.IO en un host con proceso persistente y configurar `SOCKET_URL` y `ALLOWED_ORIGINS`.

## Uso

1. Iniciá sesión con GitHub.
2. Escribí un mensaje o una URL de medio y presioná **Send**. Si no escribís nombre, se muestra como `Anomimo`.

### URLs soportadas

La URL debe ocupar todo el mensaje, sin texto adicional.

| Tipo | Extensiones / formato | Resultado |
|---|---|---|
| Imagen | `.jpg`, `.jpeg`, `.gif`, `.png`, `.bmp` | `<img>` en el chat |
| YouTube | `youtube.com/watch?v=...`, `youtu.be/...`, `youtube.com/embed/...` | `<iframe>` embebido |
| Video directo | `.mp4`, `.webm`, `.ogg` | `<video controls>` |

Si la URL está dentro de una frase, el mensaje se muestra como texto.

## Seguridad

La validación se concentra en `libs/unalib.js`:

- Solo se aceptan URLs con esquema `http` o `https`.
- Se rechazan comillas, apóstrofos, backticks, espacios, paréntesis angulares y caracteres de control.
- Solo las extensiones de la lista blanca generan etiquetas de medio.
- Los esquemas `javascript:`, `data:`, `blob:`, `file:` y `vbscript:` se muestran como texto escapado.
- El nombre, el mensaje y los atributos se escapan con entidades HTML.
- El color se valida contra una lista blanca hexadecimal; si no es válido se usa `#000000`.
- Los identificadores de YouTube se limitan a 11 caracteres `[A-Za-z0-9_-]`.

Los mensajes retransmitidos mantienen el contrato del evento `Evento-Mensaje-Server`: un string JSON con `nombre`, `mensaje`, `color` y `tipo` (`imagen`, `video` o `texto`).

## Pruebas

| Comando | Runner | Alcance |
|---|---|---|
| `npm test` | Mocha | Unitarias de `libs/unalib.js` y de verificación de tokens (`libs/auth.js`) |
| `npm run test:integration` | Jest | Servidor real + Socket.IO; incluye el rechazo de conexiones sin token |
| `npm run test:e2e` | Playwright | Chromium sobre el chat real |
| `npm run test:all` | Todos | Unitarias + integración + E2E |

Las pruebas arrancan el servidor con `AUTH_REQUIRED=false` para no depender de un login real. La verificación de tokens se prueba con un JWKS local, sin llamadas a Auth0.

## Estructura del proyecto

```text
Lab6/
├── index.html                     # Cliente: login Auth0, identidad, chat (jQuery + Socket.IO)
├── server.js                      # Servidor Express + Socket.IO, /config.json, handshake con token
├── libs/
│   ├── unalib.js                  # Validación, sanitización y renderizado de medios
│   └── auth.js                    # Verificación del ID token de Auth0 (JWKS)
├── test/
│   ├── test.js                    # Pruebas unitarias del chat (Mocha)
│   └── auth.test.js               # Pruebas de verificación de tokens
├── test-integration/
│   ├── chat.socket.test.js        # Pruebas de integración (Jest)
│   └── auth.socket.test.js        # Rechazo de conexiones sin token
├── e2e/
│   ├── chat.spec.js               # Pruebas E2E del chat (Playwright)
│   ├── auth.spec.js               # Pruebas E2E del gate de autenticación
│   └── fixtures/                  # jQuery y video usados por las pruebas E2E
├── openspec/                      # Especificaciones de los cambios (ignorado por git)
├── .env.example                   # Variables requeridas, sin credenciales
├── vercel.json                    # Configuración de despliegue en Vercel
├── jest.config.js
├── playwright.config.js
├── package.json
└── README.md
```

## Tecnologías

- Node.js, Express, Socket.IO, jQuery
- `auth0-spa-js` (login en el navegador) y `jose` (verificación de tokens)
- Mocha, Jest, Playwright
- Snyk

## Contexto académico

Proyecto desarrollado para el laboratorio de Paradigmas de Programación. El cambio `add-chat-media-urls` documenta la detección y renderizado de medios en `openspec/changes/add-chat-media-urls/`. La historia de usuario **US 01 — Autenticación social en UNA Chat** se especifica en `openspec/changes/add-auth0-social-login/`.
