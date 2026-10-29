const { test, expect } = require('@playwright/test');

test.describe('UNA Chat - gate de autenticacion', function () {
  test('sin configuracion de Auth0 el chat no se abre', async function ({ page }) {
    // simula un servidor con autenticacion activa pero sin variables cargadas
    await page.route('**/config.json', function (route) {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ domain: '', clientId: '', authRequired: true }),
      });
    });

    await page.goto('/');

    await expect(page.locator('#view-error')).toBeVisible();
    await expect(page.locator('#error-text')).toContainText('Auth0');
    await expect(page.locator('#view-chat')).toBeHidden();
    await expect(page.locator('body')).not.toHaveAttribute('data-chat-connected', 'true');
  });

  test('el endpoint de configuracion no expone secretos', async function ({ request }) {
    const respuesta = await request.get('/config.json');

    expect(respuesta.ok()).toBeTruthy();
    const config = await respuesta.json();

    expect(config.authRequired).toBe(false);
    expect(Object.keys(config).sort()).toEqual(['authRequired', 'clientId', 'domain']);
  });
});
