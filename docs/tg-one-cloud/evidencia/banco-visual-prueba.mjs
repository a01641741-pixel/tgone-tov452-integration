import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
const dir = process.cwd();
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true });
let checks = 0; const ok = (c, m) => { assert.ok(c, m); checks++; };
for (const [tema, ancho] of [['dark', 900], ['light', 900], ['dark', 390]]) {
  const page = await browser.newPage({ viewport: { width: ancho, height: 1100 } });
  const errores = []; page.on('pageerror', (e) => errores.push(e.message)); page.on('console', (m) => m.type() === 'error' && errores.push(m.text()));
  await page.goto(`file://${dir}/${tema}.html`);
  const caso = (id) => page.locator(`[data-caso="${id}"]`);
  await page.waitForSelector('text=Cambio de fuente pendiente de confirmar');
  ok(await page.getByRole('group', { name: 'Confirmar cambio de fuente de TOV452-66' }).count() === 3, 'grupo accesible');
  ok((await page.evaluate(() => window.__llamadas.length)) === 0, 'mostrar la propuesta no llama al servidor');
  const sufijo = `${tema}-${ancho}`;
  await page.screenshot({ path: `01-pendiente-${sufijo}.png`, fullPage: true });
  // Caso 1: confirmar con teclado; doble activación = una sola llamada.
  const btnOk = caso('ok').getByRole('button', { name: 'Confirmar cambio' });
  await btnOk.focus(); await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
  await caso('ok').getByRole('button', { name: 'Aplicando…' }).waitFor();
  ok(await caso('ok').getByRole('button', { name: 'Aplicando…' }).isDisabled(), 'deshabilitado mientras aplica');
  ok(await caso('ok').getByRole('button', { name: 'Cancelar' }).isDisabled(), 'cancelar deshabilitado mientras aplica');
  await page.screenshot({ path: `02-aplicando-${sufijo}.png`, fullPage: true });
  await caso('ok').getByText('Fuente actualizada.').waitFor();
  const llamadas = await page.evaluate(() => window.__llamadas);
  ok(llamadas.length === 1, 'una sola llamada pese a doble Enter: ' + llamadas.length);
  const p = llamadas[0].p;
  ok(llamadas[0].nombre === 'telemetryGateway' && p.accion === 'cambiar_fuente_dispositivo' && p.confirmar === true && p.modo_esperado === 'legacy'
    && p.revision_esperada === 'r1' && p.destino === 'tg_api' && p.device_key === 'TOV452-66' && p.origen === 'tg_ai', 'payload con comprobaciones para el servidor');
  ok(await caso('ok').getByRole('button').count() === 0, 'tras aplicar no quedan botones');
  // Caso 2: el servidor rechaza (revisión cambiada) y se explica.
  await caso('revision').getByRole('button', { name: 'Confirmar cambio' }).click();
  await caso('revision').getByText('El dispositivo cambió. Actualiza antes de confirmar.').waitFor();
  // Caso 3: cancelar no llama al servidor.
  const antes = await page.evaluate(() => window.__llamadas.length);
  await caso('cancelar').getByRole('button', { name: 'Cancelar' }).click();
  await caso('cancelar').getByText('Cancelado. No se modificó nada.').waitFor();
  ok((await page.evaluate(() => window.__llamadas.length)) === antes, 'cancelar no llama al servidor');
  ok(await caso('ok').getByText('Cambio de fuente aplicado').count()===1 && await caso('revision').getByText('Cambio de fuente no aplicado').count()===1 && await caso('cancelar').getByText('Cambio de fuente cancelado').count()===1, 'título refleja el estado final');
  await page.screenshot({ path: `03-resultados-${sufijo}.png`, fullPage: true });
  // Sin desbordamiento horizontal en celular.
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'sin scroll horizontal a ' + ancho + ' px');
  ok(errores.length === 0, 'sin errores de consola: ' + errores.join(' | '));
  await page.close();
}
await browser.close();
console.log(`PASS banco visual AccionPropuestaCard: ${checks} comprobaciones (oscuro, claro, 390 px).`);
