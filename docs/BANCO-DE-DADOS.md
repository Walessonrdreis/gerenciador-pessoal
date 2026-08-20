# Banco de Dados — Documentação Viva

> Registro de novas tabelas/coleções, migrations, mudanças de schema, índices e queries relevantes do projeto.
>
> Não editar entradas passadas — apenas adicionar novas ao final ou atualizar com o campo `**Atualizado em:**` quando indicado.

---

- [x] Módulo 1 — Tarefas + Lembretes (PWA secretária pessoal): schema Prisma 7 com 11 modelos (User, Account, Session, VerificationToken, Category, Task, Subtask, TaskOccurrence, Reminder, PushSubscription, TaskTemplate), migração pendente de `DATABASE_URL` real
  - **Data:** 2026-08-20 | **Autor:** Walesson
  - **Arquivos afetados:** `prisma/schema.prisma`, `prisma.config.ts`
  - **Motivo/contexto:** base de dados do módulo 1; `PushSubscription` com `@@unique([endpoint, userId])` (ownership por usuário, fix de segurança do review final)
