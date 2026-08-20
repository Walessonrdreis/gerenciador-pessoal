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
4. Defina `APP_URL` (ex: `https://<app>.vercel.app`) — usado no agendamento dos lembretes (QStash)
5. Deploy. Push notifications exigem HTTPS — a Vercel já entrega.

> O deploy foi **adiado** — siga os passos acima (`npx vercel` ou painel da Vercel) quando quiser publicar.

## Testes

`npm test` (unitários/API) · `npx playwright test` (E2E)

### E2E (Playwright)

O E2E roda contra o banco de **teste** (`TEST_DATABASE_URL`) com `AUTH_SECRET` fixa
(instalada em `.env.example`; o webServer do Playwright injeta essa URL e um cookie
JWT fake assinado com a mesma chave — não depende de credenciais reais).

```bash
npx playwright install chromium
TEST_DATABASE_URL="postgresql://..." AUTH_SECRET="secret-e2e-nao-usar-em-prod" npx playwright test
```

Limite conhecido: se o teste rodar entre 23:00 e 00:00 local, "daqui a 1h" cai no
dia seguinte e a tela Hoje não mostra a tarefa — re-execute nesse caso.
