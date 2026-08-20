# API — Documentação Viva

> Registro de novos endpoints, mudanças de contrato e integrações com serviços externos do projeto.
>
> Não editar entradas passadas — apenas adicionar novas ao final ou atualizar com o campo `**Atualizado em:**` quando indicado.

---

- [x] Módulo 1 — Tarefas + Lembretes (PWA secretária pessoal): API completa de tarefas (CRUD + subtarefas + reorder em lote), categorias, modelos (CRUD + apply cópia), push subscribe, lembretes (trigger QStash + resumo diário) e calendário; toda rota exige sessão e filtra por `userId`
  - **Data:** 2026-08-20 | **Autor:** Walesson
  - **Arquivos afetados:** `src/app/api/**` (tasks, categories, templates, push, reminders, calendar)
  - **Motivo/contexto:** backend do módulo 1; trigger/reminders usam assinatura QStash (`Receiver.verify`), não sessão
