# PROMPT-EXECUCAO.md — plano do Módulo 1 (Tarefas + Lembretes)

Copie e cole o bloco abaixo em um chat novo para executar o plano.

---

## Bloco de prompt

Você vai executar o plano de implementação do **Módulo 1 — Tarefas + Lembretes** do projeto **gerenciador-pessoal**.

### 1. Instrução de abertura

Leia o plano em `docs/superpowers/plans/2026-08-20-tarefas-lembretes/` e execute-o **tarefa por tarefa**, na ordem do índice do README. Leia o README por completo e, para cada tarefa, **apenas o arquivo daquela tarefa** (`NN-<task-name>.md`). Use a skill `superpowers:executing-plans` (ou `superpowers:subagent-driven-development`).

### 2. Contexto do projeto

Projeto **gerenciador-pessoal**: um PWA "secretária pessoal" mobile-first (estilo Terminal escuro) para organizar tarefas de trabalho e dia a dia. Este plano constrói o módulo 1 completo: tarefas com subtarefas, categorias, recorrência multi-dia, modelos de tarefa (cópia), ordem manual, lembretes por push com re-push até concluir e resumo diário, 4 telas (Hoje, Lista, Concluídas, Calendário), PWA instalável. O repositório contém apenas a spec de design (`docs/superpowers/specs/2026-08-20-tarefas-lembretes-design.md`) e este plano — **o código ainda não existe**; a Task 1 faz o scaffold.

### 3. O que o plano constrói

- **Spec de referência:** `docs/superpowers/specs/2026-08-20-tarefas-lembretes-design.md` (aprovada pelo usuário — a fonte da verdade).
- **Stack:** Next.js 15 (App Router) + TypeScript, Prisma + Postgres (Neon), Auth.js v5 (Google), QStash (lembretes + cron resumo diário), Web Push (VAPID), Vitest, Playwright.
- **Decisões que afetam a execução:** ordem manual sempre (prioridade é rótulo, não ordena); subtarefas são entidade própria `Subtask`; modelos são cópia ao usar; recorrência multi-dia via `daysOfWeek` na regra; lembrete com `leadMinutes` desloca o push; re-push a cada ~10min até concluir/ignorar ou fim do dia (teto 30/dia); resumo diário sem re-push.

### 4. Como executar

- Use `superpowers:executing-plans` (ou `subagent-driven-development`): **uma tarefa por vez**, lendo só o arquivo dela, na ordem do índice.
- **TDD em cada tarefa** (onde houver testes): escreva o teste que falha → rode → implemente o mínimo → rode até passar → commit.
- Respeite as **regras de tamanho** dos arquivos do plano (README ≤ 80 linhas, tarefa ≤ 200 linhas).

### 5. Regras de commit

- Convenção: **conventional commits em pt-BR** (ex.: `feat: api de tarefas`, `test: motor de recorrência`).
- Rodapé obrigatório em TODO commit: `Co-Authored-By: Claude <noreply@anthropic.com>`.
- **Nunca** `git add .` / `git add -A` — adicione por nome de arquivo, conferindo resíduos de teste (`coverage/`, `__snapshots__/`, etc.).
- Se o commit tocar Apps Script: **não se aplica** (este projeto não usa Apps Script).

### 6. Comportamento com verificação manual pendente

Se uma tarefa exigir teste manual/ambiente que não está disponível (ex.: login Google real, chaves VAPID, credencial QStash, deploy Vercel), execute até onde dá, **não pule** e **não marque como feita** — registre explicitamente o que ficou pendente para o usuário.

---

## Notas para quem colar

- O chat novo já carrega o `CLAUDE.md` do projeto e a skill `superpowers:executing-plans`.
- As credenciais reais (Neon, Google OAuth, QStash, VAPID) são do usuário — peça quando a tarefa exigir (o plano marca onde).
- Este plano substitui o antigo `docs/superpowers/plans/2026-08-13-tarefas-lembretes.md` (arquivo único); o novo é um diretório com 1 arquivo por tarefa.
