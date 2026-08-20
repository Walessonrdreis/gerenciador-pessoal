# Ferramentas — Documentação Viva

> Registro de novas dependências/libs, ferramentas de desenvolvimento, configuração de build e pipelines de CI/CD do projeto.
>
> Não editar entradas passadas — apenas adicionar novas ao final ou atualizar com o campo `**Atualizado em:**` quando indicado.

---

- [x] Módulo 1 — Tarefas + Lembretes (PWA secretária pessoal): stack Next.js 15.5 + TypeScript + Prisma 7 + PostgreSQL (Neon) + Auth.js v5 beta (Google) + zod v4 + QStash + web-push + Vitest + Playwright + sharp
  - **Data:** 2026-08-20 | **Autor:** Walesson
  - **Arquivos afetados:** `package.json`
  - **Motivo/contexto:** stack do projeto; Prisma 7 exige `prisma.config.ts` + `@prisma/adapter-pg` (config saiu do schema)
