import { createHmac } from 'node:crypto';
import { expect, test } from '@playwright/test';

const AUTH_SECRET = process.env.AUTH_SECRET ?? 'secret-e2e-nao-usar-em-prod-1234567890';

// Cookie fake (authjs.session-token) assinado HS256. ATENÇÃO: o Auth.js v5
// criptografa o session JWT (JWE) — este cookie HS256 é REJEITADO; o E2E
// aguarda um fluxo de sessão válido (ver caveat no README).
// Interceptar /api/auth/session não basta: o middleware lê o cookie no servidor.
function fakeSessionToken(): string {
  const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const header = enc({ alg: 'HS256', typ: 'JWT' });
  const now = Math.floor(Date.now() / 1000);
  const payload = enc({
    sub: 'e2e-user',
    name: 'E2E',
    email: 'e2e@teste.dev',
    iat: now,
    exp: now + 86_400,
  });
  const data = `${header}.${payload}`;
  const sig = createHmac('sha256', AUTH_SECRET).update(data).digest('base64url');
  return `${data}.${sig}`;
}

test('cria tarefa com subtarefa, conclui e some da lista de pendentes', async ({ context, page }) => {
  await context.addCookies([
    { name: 'authjs.session-token', value: fakeSessionToken(), url: 'http://localhost:3100' },
  ]);

  await page.goto('/');
  await expect(page.getByText(/hoje/).first()).toBeVisible();

  await page.getByLabel('nova tarefa').click();
  await page.getByPlaceholder('_').fill('E2E - pagar conta');

  // vencimento: daqui a 1h (mesmo dia local, cai em "hoje")
  const d = new Date(Date.now() + 3_600_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  await page
    .locator('input[type="datetime-local"]')
    .fill(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`);

  // adiciona 1 subtarefa
  await page.getByPlaceholder('+ adicionar item').fill('conferir valor');
  await page.getByRole('button', { name: '+' }).click();

  await page.getByRole('button', { name: '[salvar]' }).click();

  await expect(page.getByText('E2E - pagar conta')).toBeVisible();
  await expect(page.getByText(/itens \(0\/1\)/)).toBeVisible();

  // conclui a tarefa
  await page.getByRole('button', { name: 'concluir' }).last().click();
  await expect(page.getByText('E2E - pagar conta').first()).not.toBeVisible();
});
