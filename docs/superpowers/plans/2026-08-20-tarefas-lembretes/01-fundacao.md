# Task 1: Fundação — scaffold Next.js + Vitest + git

**Files:**
- Create: projeto inteiro (create-next-app)
- Create: `vitest.config.ts`, `tests/setup.ts`, `tests/hello.test.ts`
- Create: `.env.example`
- Modify: `package.json` (scripts)

**Interfaces:**
- Produces: projeto compilável com `npm run dev` e `npm test`; alias `@/*` → `src/*` (create-next-app já configura para TS)

- [ ] **Step 1: Scaffold**

```bash
npx create-next-app@latest . --ts --eslint --app --src-dir --no-tailwind --import-alias "@/*" --use-npm --yes
```

Se algum flag for rejeitado pela versão do create-next-app, rode sem ele e responda `n` para Tailwind quando perguntado. Depois remova o CSS padrão:

```bash
# src/app/page.tsx e src/app/globals.css serão substituídos nas Tasks 8+
git add -A && git commit -m "chore: scaffold next.js com typescript"
```

- [ ] **Step 2: Instalar dependências**

```bash
npm i prisma @prisma/client next-auth@beta @auth/prisma-adapter zod @upstash/qstash web-push
npm i -D vitest @vitest/coverage-v8 @types/web-push sharp cross-env @playwright/test
```

- [ ] **Step 3: Configurar Vitest**

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
});
```

`tests/setup.ts` (troca o banco para o de teste antes de qualquer import de `prisma`):

```ts
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
```

`tests/hello.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

describe('suíte de testes', () => {
  it('roda', () => {
    expect(1 + 1).toBe(2);
  });
});
```

Adicione no `package.json`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Rodar e verificar**

Run: `npm test`
Expected: `tests/hello.test.ts` PASS (1 teste).

- [ ] **Step 5: Commit**

```bash
git add vitest.config.ts tests .env.example package.json && git commit -m "chore: vitest configurado com alias @"
```
