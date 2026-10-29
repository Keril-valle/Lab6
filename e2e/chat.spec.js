const path = require('path');
const { test, expect } = require('@playwright/test');

const BASE_URL = 'http://127.0.0.1:3100';
const IMAGE_URL = BASE_URL + '/fixtures/imagen.png';
const VIDEO_URL = BASE_URL + '/fixtures/video.mp4';
const YOUTUBE_URL = 'https://www.youtube.com/watch?v=qYwlqx-JLok';

async function abrirChat(page) {
  // servimos jQuery y Socket.IO desde node_modules para que la prueba no dependa de CDNs
  await page.route('https://code.jquery.com/jquery-1.11.1.js', function (route) {
    route.fulfill({
      path: path.join(__dirname, 'fixtures', 'jquery-1.11.1.js'),
      contentType: 'application/javascript',
    });
  });

  await page.route('https://cdn.socket.io/**', function (route) {
    route.fulfill({
      path: path.join(__dirname, '..', 'node_modules', 'socket.io', 'client-dist', 'socket.io.min.js'),
      contentType: 'application/javascript',
    });
  });

  await page.goto('/');
  await expect(page.locator('#messages')).toBeAttached();
  await expect(page.locator('form')).toBeVisible();
  await page.waitForSelector('body[data-chat-connected="true"]', { state: 'attached', timeout: 15000 });
}

async function enviarMensaje(page, mensaje, nombre) {
  const cantidad = await page.locator('#messages li').count();

  await page.fill('#nombre', nombre || 'ana');
  await page.fill('#m', mensaje);
  await page.click('form button');

  await expect(page.locator('#messages li')).toHaveCount(cantidad + 1);
  return page.locator('#messages li').last();
}

test.describe('Chat UNA - pruebas E2E', function () {
  test.beforeEach(async function ({ page }) {
    await abrirChat(page);
  });

  test.afterEach(async function ({ page }) {
    // pausa de 1 segundo para observar el estado final de cada escenario
    await page.waitForTimeout(1000);
  });

  test('deberia cargar la pagina del chat y conectar el socket', async function ({ page }) {
    await expect(page).toHaveTitle('UNA Chat');
    await expect(page.locator('#nombre')).toBeVisible();
    await expect(page.locator('#m')).toBeVisible();
    await expect(page.locator('form button')).toBeVisible();
    await expect(page.locator('body')).toHaveAttribute('data-chat-connected', 'true');
  });

  test('deberia mostrar una URL de imagen directamente en el chat', async function ({ page }) {
    await page.route('**/fixtures/imagen.png', function (route) {
      route.fulfill({
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="120">' +
          '<rect width="200" height="120" fill="#4da3ff"/></svg>',
      });
    });

    const mensaje = await enviarMensaje(page, IMAGE_URL);
    const imagen = mensaje.locator('img');

    await expect(imagen).toBeVisible();
    await expect(imagen).toHaveAttribute('src', IMAGE_URL);
    await expect.poll(async function () {
      return imagen.evaluate(function (elemento) { return elemento.naturalWidth; });
    }).toBeGreaterThan(0);
  });

  test('deberia insertar un reproductor para una URL de YouTube', async function ({ page }) {
    await page.route('https://www.youtube.com/embed/**', function (route) {
      route.fulfill({
        contentType: 'text/html',
        body: '<html><body><h1>Video de prueba</h1></body></html>',
      });
    });

    const mensaje = await enviarMensaje(page, YOUTUBE_URL);
    const reproductor = mensaje.locator('iframe');

    await expect(reproductor).toBeVisible();
    await expect(reproductor).toHaveAttribute('src', 'https://www.youtube.com/embed/qYwlqx-JLok');
  });

  test('deberia insertar un reproductor de video para una URL .mp4', async function ({ page }) {
    await page.route('**/fixtures/video.mp4', function (route) {
      route.fulfill({
        path: path.join(__dirname, 'fixtures', 'video.mp4'),
        contentType: 'video/mp4',
      });
    });

    const mensaje = await enviarMensaje(page, VIDEO_URL);
    const video = mensaje.locator('video');

    await expect(video).toBeVisible();
    await expect(video).toHaveAttribute('controls', '');
    await expect(video).toHaveAttribute('src', VIDEO_URL);
  });

  test('deberia mostrar como texto una URL de video embebida en una frase', async function ({ page }) {
    const mensaje = await enviarMensaje(page, 'mira este video ' + VIDEO_URL);

    await expect(mensaje.locator('video')).toHaveCount(0);
    await expect(mensaje.locator('img')).toHaveCount(0);
    await expect(mensaje.locator('iframe')).toHaveCount(0);
    await expect(mensaje).toContainText(VIDEO_URL);
  });

  test('deberia escapar un script y no ejecutar dialogos', async function ({ page }) {
    const dialogos = [];

    page.on('dialog', async function (dialogo) {
      dialogos.push(dialogo.message());
      await dialogo.dismiss();
    });

    const mensaje = await enviarMensaje(page, '<script>alert(1)</script>');

    await expect(mensaje).toContainText('<script>alert(1)</script>');
    await expect(mensaje.locator('script')).toHaveCount(0);
    await page.waitForTimeout(1000);
    expect(dialogos).toHaveLength(0);
  });

  test('deberia rechazar una imagen que intenta romper el atributo src', async function ({ page }) {
    const mensaje = await enviarMensaje(page, 'http://a.com/a.jpg" onerror="alert(1)');

    await expect(mensaje.locator('img')).toHaveCount(0);
    await expect(mensaje).toContainText('a.jpg" onerror="alert(1)');
  });
});
