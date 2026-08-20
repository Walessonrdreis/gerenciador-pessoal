# Módulo 1 — Tarefas + Lembretes: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar um PWA "secretária pessoal" onde o usuário cria tarefas com vencimento, subtarefas, recorrência multi-dia e lembretes por push (com re-push até concluir), sincronizado entre aparelhos via conta Google.

**Architecture:** Next.js 15 (App Router) full-stack na Vercel; Prisma + Postgres (Neon); Auth.js v5 com Google; lembretes agendados via QStash (one-shot + re-push em cadeia + cron do resumo diário) que chamam API routes, que enviam Web Push (VAPID) via `web-push`. Recorrência é materializada: a regra vive na `Task`; as listas mostram `TaskOccurrence` concretas. Subtarefas são entidade própria (`Subtask`); modelos de tarefa são cópia ao usar (`TaskTemplate`).

**Tech Stack:** Next.js 15 · TypeScript · Prisma · PostgreSQL (Neon) · Auth.js v5 (next-auth@beta) · zod · @upstash/qstash · web-push · Vitest · Playwright · sharp (dev, para ícones)

## Global Constraints

(do spec `docs/superpowers/specs/2026-08-20-tarefas-lembretes-design.md` — vale para todas as tarefas)

- Interface estilo **Terminal**: base `#0F1110`, texto `#E6E4DC`, secundário `#6E736B`, acento único verde CRT `#7FD88F`, prioridade alta âmbar `#E5A050`
- Monospace em toda a UI (Consolas/Menlo/SF Mono, fallback `monospace`); labels maiúsculas com espaçamento largo; sem cards, sem sombras, sem gradientes, cantos retos
- Copy da interface em **PT-BR**
- Toda entrada de API validada com **zod**; `400` validação, `401` sem sessão, `404` recurso inexistente ou de outro usuário
- Toda query de dados filtra por `userId` (isolamento multiusuário)
- Datas sempre armazenadas como **instantes UTC** (colunas `DateTime`); exibição em horário local
- UI otimista com rollback; status de sync no topo: `sincronizado` / `sincronizando…` / `offline`
- Prioridades: `alta | media | baixa`; status de ocorrência: `pendente | concluida | ignorada`; status de lembrete: `pendente | enviado | falhou`
- **Ordem manual sempre** — prioridade é rótulo, não ordena (campo `ordem` na `Task`)
- Nenhuma dependência além das listadas no Tech Stack (sem framework de UI)

## Tasks

| # | Arquivo | Tarefa (resumo 1 linha) |
|---|---|---|
| 1 | `01-fundacao.md` | Scaffold Next.js 15 + TS + Vitest + git |
| 2 | `02-banco-prisma.md` | Prisma schema (7 tabelas) + Neon + migração dev/teste |
| 3 | `03-autenticacao.md` | Auth.js v5 com Google + middleware + página entrar |
| 4 | `04-motor-recorrencia.md` | Motor de recorrência (TDD) com `daysOfWeek` multi-dia |
| 5 | `05-api-tarefas-categorias.md` | API criar/listar tarefas + categorias + subtarefas + ordem |
| 6 | `06-api-editar-concluir.md` | API editar/excluir/concluir com recorrência + subtarefas + reorder lote |
| 7 | `07-modelos-tarefas.md` | CRUD de modelos + `apply` (cópia para Task + Subtasks) |
| 8 | `08-shell-tela-hoje.md` | Shell Terminal + SyncStatus + tela Hoje com subtarefas e ordem |
| 9 | `09-lista-concluidas-calendario.md` | Telas Lista, Concluídas + calendário mensal de leitura |
| 10 | `10-modal-nova-tarefa.md` | Modal nova tarefa: subtarefas, modelos, multi-dia, antecedência |
| 11 | `11-push-subscription.md` | VAPID + subscribe do aparelho + service worker + NotificationGate |
| 12 | `12-lembretes-repush.md` | QStash: agendar + trigger com re-push +10min até concluir/fim do dia |
| 12b | `12b-resumo-calendario.md` | Resumo diário (cron) + endpoint calendário + filtro por dia na API |
| 13 | `13-pwa-manifest.md` | PWA instalável: manifest, ícones, prompt de instalação |
| 14 | `14-e2e-deploy.md` | E2E Playwright (fluxo com subtarefa) + README + deploy Vercel |

---

## Como executar

1. Leia este README por completo.
2. Execute cada tarefa lendo APENAS o arquivo dela (`NN-<task-name>.md`), na ordem do índice.
3. TDD em cada tarefa: escreva o teste que falha → rode → implemente o mínimo → rode até passar → commit.
