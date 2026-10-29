# UNA Chat

Aplicación de chat en tiempo real desarrollada con Node.js, Express y Socket.IO. Además de mensajes de texto, el chat reconoce URLs de imágenes y videos y las muestra directamente en la conversación. El acceso requiere iniciar sesión con una cuenta social mediante Auth0.

## Características

- Chat en tiempo real con Socket.IO.
- Inicio de sesión social (OAuth/OIDC) con Auth0; sin contraseña propia.
- Identidad del usuario autenticado visible y cierre de sesión.
- El chat exige autenticación: el servidor rechaza conexiones sin token válido.
- Nombre de usuario y color asignado por cliente.
- Renderizado de imágenes mediante etiquetas `<img>`.
- Reproducción de videos de YouTube mediante `<iframe>`.
- Reproducción de archivos de video directos (`.mp4`, `.webm`, `.ogg`) con `<video controls>`.
- Validación y sanitización de todo el contenido enviado por los usuarios.
- Pruebas unitarias, de integración y E2E.

## Requisitos

- Node.js 20 o superior (la verificación de tokens usa `jose` 6).
- npm 9 o superior.
- Una cuenta gratuita en <https://auth0.com> con una aplicación SPA (ver [Autenticación con Auth0](#autenticación-con-auth0)).

## Instalación

```bash
npm install
```

Para las pruebas E2E, instala el navegador de Playwright una sola vez:

```bash
npx playwright install chromium
```

## Ejecución

Antes de arrancar, copiá las variables de entorno:

```bash
cp .env.example .env          # PowerShell: Copy-Item .env.example .env
```

y completá `AUTH0_DOMAIN` y `AUTH0_CLIENT_ID` (ver [Autenticación con Auth0](#autenticación-con-auth0)).

```bash
npm start
```

Abre [http://localhost:3000](http://localhost:3000) en el navegador. Para usar otro puerto:

```bash
PORT=4000 npm start
```

En PowerShell:

```powershell
$env:PORT=4000; npm start
```

## Autenticación con Auth0

El acceso al chat requiere una sesión iniciada con una red social (OAuth/OIDC mediante Auth0). La autenticación ocurre en el navegador con el SDK oficial `auth0-spa-js` y el servidor valida el token en el handshake de Socket.IO, por lo que **el proyecto no usa `client_secret`**.

### 1. Crear la aplicación en Auth0

1. Crear una cuenta en <https://auth0.com/signup> y elegir región (no se puede cambiar después).
2. **Applications → Applications → Create Application**:
   - Name: `UNA CHAT`
   - Application Type: **Single Page Application**
3. En **Settings**, completar y **guardar**:

   | Campo | Local | Vercel |
   |---|---|---|
   | Allowed Callback URLs | `http://localhost:3000` | `https://TU-APP.vercel.app` |
   | Allowed Logout URLs | `http://localhost:3000` | `https://TU-APP.vercel.app` |
   | Allowed Web Origins | `http://localhost:3000` | `https://TU-APP.vercel.app` |

   > En una SPA el callback es el origen exacto (sin `/callback`) y debe coincidir carácter por carácter: usá `localhost`, no `127.0.0.1`.

4. Anotar **Domain** y **Client ID**. El **Client Secret no se usa** en este flujo y no debe copiarse a ningún archivo.

### 2. Habilitar el proveedor social (GitHub)

1. GitHub → **Settings → Developer settings → OAuth Apps → New OAuth App**.
   - Homepage URL: `http://localhost:3000`
   - Authorization callback URL: `https://TU-TENANT.us.auth0.com/login/callback`
2. Copiar el **Client ID** y generar un **Client Secret**.
3. Auth0 → **Authentication → Social → Create Connection → GitHub**: pegar ambos valores y guardar.
4. Auth0 → **Applications → UNA CHAT → Connections**: activar la conexión `github`.

### 3. Variables de entorno

```bash
cp .env.example .env          # PowerShell: Copy-Item .env.example .env
```

| Variable | Obligatoria | Descripción |
|---|---|---|
| `AUTH0_DOMAIN` | sí | Dominio del tenant, sin `https://` |
| `AUTH0_CLIENT_ID` | sí | Client ID de la aplicación SPA (es público) |
| `AUTH_REQUIRED` | no | `true` por defecto. `false` desactiva la autenticación **solo para pruebas automatizadas** |
| `PORT` | no | Puerto del servidor local (3000 por defecto) |

`server.js` carga `.env` automáticamente al arrancar (Node ≥ 20.12). En Vercel las variables se configuran en el panel del proyecto.

### 4. Cómo funciona

1. `GET /config.json` devuelve `{ domain, clientId, authRequired }`: solo información pública.
2. El cliente inicializa Auth0, redirige al Universal Login y procesa el callback con `handleRedirectCallback()`.
3. Con sesión iniciada, el chat se conecta a Socket.IO enviando el ID token en `auth.token`.
4. El servidor verifica firma, emisor, audiencia y expiración contra el JWKS del tenant (`libs/auth.js`); si algo falla, rechaza la conexión con `unauthorized`.
5. **Cerrar sesión** invalida la sesión de Auth0 y vuelve a la pantalla de inicio.
6. Si el usuario cancela o Auth0 devuelve un error, la página muestra el mensaje y un botón **Reintentar**.

## Uso

1. Escribe un nombre en el campo **Username** (si lo dejas vacío se mostrará como `Anomimo`).
2. Escribe un mensaje o una URL de medio en el campo de texto.
3. Presiona **Send**.

### URLs soportadas

La URL debe ocupar todo el mensaje, sin texto adicional.

| Tipo | Extensiones / formato | Resultado |
|---|---|---|
| Imagen | `.jpg`, `.jpeg`, `.gif`, `.png`, `.bmp` | `<img>` en el chat |
| YouTube | `youtube.com/watch?v=...`, `youtu.be/...`, `youtube.com/embed/...` | `<iframe>` embebido |
| Video directo | `.mp4`, `.webm`, `.ogg` | `<video controls>` |

Ejemplos:

```text
http://image.com/image.jpg
https://www.youtube.com/watch?v=qYwlqx-JLok
https://cdn.example.com/clip.mp4
```

Si la URL está dentro de una frase, por ejemplo `mira esto https://cdn.example.com/clip.mp4`, el mensaje se muestra como texto.

## Despliegue en Vercel

1. Importá el repositorio en Vercel (framework preset: **Other**). `vercel.json` ya enruta todas las peticiones a `server.js`.
2. En **Settings → Environment Variables** (Production y Preview) cargá:
   - `AUTH0_DOMAIN`
   - `AUTH0_CLIENT_ID`
   - `AUTH_REQUIRED=true`
3. Agregá el dominio de producción en Auth0 (**Allowed Callback URLs**, **Allowed Logout URLs** y **Allowed Web Origins**) y volvé a desplegar para que tome las variables.
4. Verificá el flujo completo: abrir la URL, **Iniciar sesión**, ver la identidad, **Cerrar sesión**.

> **Nota sobre Socket.IO:** en Vercel las funciones son serverless y no mantienen WebSockets persistentes. El flujo de autenticación funciona igual, pero el chat en tiempo real puede requerir `transports: ['polling']` o mover el socket a un host con proceso persistente.

## Seguridad

La validación se concentra en `libs/unalib.js`:

- Solo se aceptan URLs con esquema `http` o `https`.
- Se rechazan comillas, apóstrofos, backticks, espacios, paréntesis angulares y caracteres de control.
- Solo las extensiones incluidas en la lista blanca pueden generar etiquetas de medio.
- Los esquemas `javascript:`, `data:`, `blob:`, `file:` y `vbscript:` se muestran como texto escapado.
- El nombre, el mensaje y los atributos generados se escapan con entidades HTML.
- El color se valida contra una lista blanca hexadecimal; en caso contrario se usa `#000000`.
- Los identificadores de YouTube se limitan a 11 caracteres `[A-Za-z0-9_-]`.

Los mensajes retransmitidos mantienen el contrato del evento `Evento-Mensaje-Server`: un string JSON con `nombre`, `mensaje`, `color` y `tipo` (`imagen`, `video` o `texto`).

## Pruebas

| Comando | Runner | Alcance |
|---|---|---|
| `npm test` | Mocha | Pruebas unitarias de `libs/unalib.js` y de la verificación de tokens (`libs/auth.js`) |
| `npm run test:integration` | Jest | Servidor real + Socket.IO; incluye el rechazo de conexiones sin token |
| `npm run test:e2e` | Playwright | Navegador Chromium sobre el chat real |
| `npm run test:all` | Todos | Unitarias + integración + E2E |

> Las pruebas arrancan el servidor con `AUTH_REQUIRED=false` para no depender de un login real. La verificación de tokens se prueba con un JWKS local y el rechazo de conexiones con `tenant.test`, sin llamadas a Auth0.

### Pruebas unitarias

```bash
npm test
```

Cubren validación de teléfonos, URLs de imagen, YouTube y video directo, clasificación de mensajes, normalización de entradas y protección contra inyección de scripts.

### Pruebas de integración

```bash
npm run test:integration
```

Levantan `server.js` como proceso hijo en un puerto libre, conectan clientes con `socket.io-client` y verifican el evento `Evento-Mensaje-Server`, el broadcast a varios clientes y el rechazo de entradas maliciosas.

### Pruebas E2E

```bash
npm run test:e2e
```

Usan Chromium en modo visible con un retraso (`slowMo`) de 1 segundo por acción y una pausa de 1 segundo al final de cada escenario. Esto permite observar cómo se completan las pruebas. En entornos con `CI` definido, Playwright se ejecuta en modo headless.

Las pruebas sirven jQuery, Socket.IO, la imagen, el video y el iframe de YouTube desde fixtures locales, por lo que no dependen de CDNs externos.

## Análisis de seguridad

El proyecto incluye [Snyk](https://snyk.io/) como dependencia de desarrollo:

```bash
npx snyk auth
npx snyk test
npx snyk test --severity-threshold=high
```

Para revisar solo las dependencias de producción:

```bash
npm audit --omit=dev
```

## Estructura del proyecto

```text
despues/
├── index.html                     # Cliente del chat (jQuery + Socket.IO)
├── server.js                      # Servidor Express + Socket.IO
├── libs/
│   └── unalib.js                  # Validación, sanitización y renderizado de medios
│   └── auth.js                    # Verificación del ID token de Auth0 (JWKS)
├── test/
│   ├── test.js                    # Pruebas unitarias (Mocha)
│   └── auth.test.js               # Pruebas de verificación de tokens
├── test-integration/
│   ├── chat.socket.test.js        # Pruebas de integración (Jest)
│   └── auth.socket.test.js        # Rechazo de conexiones sin token
├── e2e/
│   ├── chat.spec.js               # Pruebas E2E (Playwright)
│   └── fixtures/                  # jQuery y video usados por las pruebas E2E
├── jest.config.js
├── playwright.config.js
├── openspec/                      # Especificaciones y cambio activo (ignorado por git)
├── .env.example                   # Variables de entorno requeridas (sin credenciales)
├── vercel.json                    # Configuración de despliegue
├── package.json
└── README.md
```

## Tecnologías

- Node.js
- Express
- Socket.IO
- jQuery
- Mocha
- Jest
- Playwright
- Snyk

## Contexto académico

Proyecto desarrollado para el laboratorio de Paradigmas de Programación. El cambio `add-chat-media-urls` documenta el comportamiento de detección y renderizado de medios en `openspec/changes/add-chat-media-urls/`.

La historia de usuario **US 01 — Autenticación social en UNA Chat** se especifica en `openspec/changes/add-auth0-social-login/` (proposal, specs `chat-auth`, design y tasks).
