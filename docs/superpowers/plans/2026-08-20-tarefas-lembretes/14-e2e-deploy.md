# Task 14: E2E Playwright + README + deploy Vercel

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/e2e/fluxo.spec.ts`
- Create: `README.md`

**Interfaces:**
- Consumes: app completo rodando (Tasks 1–13)
- Produces: verificação de ponta a ponta no viewport mobile + instruções de deploy

- [ ] **Step 1: Config Playwright**

`playwright.config.ts`:

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  use: {
    baseURL: 'http://localhost:3100',
    viewport: { width: 390, height: 844 },
    isMobile: true,
  },
  webServer: {
    command: 'npx cross-env PORT=3100 npm run dev',
    url: 'http://localhost:3100',
    reuseExistingServer: true,
    timeout: 120_000,
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? '',
      AUTH_SECRET: process.env.AUTH_SECRET ?? 'secret-e2e-nao-usar-em-prod',
    },
  },
});
```

> O `webServer` roda contra o banco de **teste** (`TEST_DATABASE_URL`) e com `AUTH_SECRET` fixa — o cookie do teste é assinado com essa mesma chave (Step 2).

- [ ] **Step 2: Teste do fluxo principal (com subtarefa)**

`tests/e2e/fluxo.spec.ts`:

```ts
import { createHmac } from 'node:crypto';
import { expect, test } from '@playwright/test';

const AUTH_SECRET = process.env.AUTH_SECRET ?? 'secret-e2e-nao-usar-em-prod';

// JWT HS256 no formato que o Auth.js v5 aceita (cookie authjs.session-token).
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
```

> Limite conhecido: se o teste rodar entre 23:00 e 00:00 local, "daqui a 1h" cai no dia seguinte e a tela Hoje não mostra a tarefa — re-execute nesse caso.

- [ ] **Step 3: Rodar E2E**

```bash
npx playwright install chromium
npm run build   # garante build ok
npx playwright test
```

Expected: 1 teste PASS (cria → subtarefa → conclui → some da Hoje). Se falhar por timing, aumente `expect.timeout` para 15s no config. Se a API de `datetime-local`/placeholders variar, ajuste os seletores mantendo o fluxo.

- [ ] **Step 4: README**

`README.md`:

```markdown
# Gestor Pessoal

Secretária pessoal PWA: tarefas com subtarefas, recorrência multi-dia, modelos e lembretes por push (com re-push até concluir e resumo diário).

## Stack
Next.js 15 · TypeScript · Prisma · Postgres (Neon) · Auth.js (Google) · QStash · Web Push

## Rodando local
1. `cp .env.example .env` e preencha (Neon, Google OAuth, QStash, VAPID)
2. `npm i && npx prisma migrate dev && npm run dev`
3. Acesse http://localhost:3000

## Deploy (Vercel)
1. Crie o projeto na Vercel e conecte o repo (framework: Next.js)
2. Adicione as variáveis de ambiente (mesmas do `.env`)
3. No Google Cloud, adicione o callback `https://<app>.vercel.app/api/auth/callback/google`
4. Deploy. Push notifications exigem HTTPS — a Vercel já entrega.

## Testes
`npm test` (unitários/API) · `npx playwright test` (E2E)
```

- [ ] **Step 5: Deploy na Vercel**

Peça ao usuário: `npx vercel` (ou painel da Vercel) → importar repo → preencher env vars → `vercel --prod`. Depois: ajustar o callback do Google OAuth para a URL de produção e definir `APP_URL` no ambiente.

- [ ] **Step 6: Commit**

```bash
git add playwright.config.ts tests/e2e README.md && git commit -m "test: e2e do fluxo principal + docs de deploy"
```
