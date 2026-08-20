# Lógica — Documentação Viva

> Registro de toda implementação e alteração de algoritmos, funções, cálculos, validações técnicas e regras internas de lógica do projeto.
>
> Não editar entradas passadas — apenas adicionar novas ao final ou atualizar com o campo `**Atualizado em:**` quando indicado.

---

- [x] Módulo 1 — Tarefas + Lembretes (PWA secretária pessoal): motor de recorrência multi-dia (`daysOfWeek`), regras de lembrete (presets + `leadMinutes`/`computePushAt`) e re-push em cadeia (status `pendente` até finalizar, teto 30/dia, fim do dia, cancelamento do schedule)
  - **Data:** 2026-08-20 | **Autor:** Walesson
  - **Arquivos afetados:** `src/lib/recurrence.ts`, `src/lib/reminder-rule.ts`, `src/lib/reminders.ts`
  - **Motivo/contexto:** núcleo lógico do módulo; fix do review (re-push morto) corrigido no round 1
