# Gerenciador Pessoal — Módulo 1: Tarefas + Lembretes

**Data:** 2026-08-13
**Status:** Design aprovado pelo usuário

---

## 1. Contexto e objetivo

Projeto criado do zero: uma "secretária pessoal" mobile-first. O módulo 1 é o coração dela: **tarefas com lembretes por push**. Os módulos seguintes (finanças, organizador, saúde) entram depois, cada um com seu próprio ciclo design → plano → implementação.

**Critério de sucesso:** o usuário adiciona uma tarefa com vencimento e lembrete no celular e recebe a notificação push na hora certa, mesmo com o app fechado; usa o app diariamente na tela inicial do celular.

## 2. Decisões e justificativas

| Decisão | Escolha | Por quê |
|---|---|---|
| Plataforma | **PWA** | Instala na tela inicial, funciona offline, notificação push, um deploy só |
| Hospedagem | **Vercel** | Escolha do usuário; padrão para Next.js |
| Dados | **Postgres (Neon) + Prisma** | Sincroniza entre celular e PC; schema tipado e migrado |
| Autenticação | **Auth.js com Google** | 1 clique, sem senha nova, mais seguro |
| Lembretes | **QStash (Upstash) + Web Push (VAPID)** | Agendamento em horário exato; plano gratuito cobre o volume |
| Stack | **Next.js 15 + TypeScript** | Front + API no mesmo projeto, um deploy, docs oficiais da Vercel |
| UI | **Sem framework de UI — componentes próprios** | Controle total do visual; estilo incomum exige isso |

## 3. Escopo do módulo 1

**Dentro:**
- CRUD de tarefas com: título, notas, prioridade (alta/média/baixa), categoria, data/hora de vencimento, recorrência, lembrete
- CRUD de categorias (nome + cor)
- Tarefas recorrentes (diária/semanal/mensal/anual + intervalo + fim opcional)
- Lembretes por push com agendamento exato
- Login com Google, multiusuário isolado (dados por usuário)
- PWA: instalável, ícone, app shell offline (ver tarefas sem conexão), tema escuro único
- 3 telas: Hoje, Lista, Concluídas + modal de nova tarefa

**Fora do módulo 1:**
- Sincronização offline de *escritas* (fila IndexedDB) — v1 exige conexão para criar/editar
- Módulos de finanças, notas, saúde
- Calendário mensal em grade — a Lista agrupada por data cobre o uso

## 4. Arquitetura

```
[PWA React (Next.js)] → [API Routes na Vercel] → [Postgres (Neon)]
        │                        │
        └── Service Worker ←─────┘  Web Push (VAPID)
                                  │
                        [QStash — agendador de lembretes]
```

- **Next.js 15 (App Router) + TypeScript** — páginas + API routes, um deploy
- **Prisma** no Postgres — schema versionado com migrações
- **Auth.js** com provider Google — sessão em cookie seguro; toda query filtra por `userId`
- **QStash** — agenda callback HTTP no momento exato do lembrete
- **web-push** — envia a notificação via VAPID

## 5. Modelo de dados (Prisma)

| Tabela | Campos principais | Notas |
|---|---|---|
| `User` | googleId (único), nome, email, avatarUrl | criado no primeiro login |
| `Category` | userId, nome, cor | cor = hex |
| `Task` | userId, título, notas, prioridade, vencimento (`dueAt`), concluída, `completedAt`, categoriaId, regra de recorrência | regra aninhada (ver abaixo) |
| `TaskOccurrence` | taskId, `dueAt`, status (pendente/concluída/ignorada) | é o que aparece nas listas |
| `Reminder` | taskId, `remindAt`, status (pendente/enviado/falhou), `sentAt`, `qstashMessageId` | 1+ por tarefa |
| `PushSubscription` | userId, endpoint, p256dh, auth | 1+ por usuário |

**Regra de recorrência** (campo JSON em `Task`): `{ frequency: 'daily'|'weekly'|'monthly'|'yearly', interval: number, endDate?: date }`.

**Semântica de recorrência:** o usuário cria uma tarefa com regra → o sistema **materializa ocorrências concretas** (`TaskOccurrence`). A primeira ocorrência é gerada no vencimento; ao concluir uma ocorrência recorrente, a próxima é gerada automaticamente (a partir da regra). Se `endDate` passou, não gera. O usuário também pode criar ocorrências futuras adiantadas ("próximos 3 meses") se necessário — v1 gera uma por vez na conclusão e agenda o lembrete de cada uma.

## 6. API (todas exigem sessão Google)

| Endpoint | Ação |
|---|---|
| `POST /api/tasks` | criar tarefa (+ ocorrência inicial + lembretes) |
| `GET /api/tasks` | listar (filtros: hoje, atrasadas, por categoria, prioridade, busca) |
| `PATCH /api/tasks/:id` | editar, concluir, desfazer conclusão |
| `DELETE /api/tasks/:id` | excluir (com suas ocorrências/lembretes) |
| `GET/POST/PATCH/DELETE /api/categories` | CRUD de categorias |
| `POST /api/push/subscribe` | registrar aparelho para push |
| `DELETE /api/push/subscribe` | remover aparelho |
| `POST /api/reminders/trigger` | **chamado pelo QStash** — valida assinatura, busca lembrete, envia push |

**Concluir tarefa recorrente:** marca a ocorrência concluída, gera a próxima (regra) e agenda o lembrete dela.

## 7. Fluxo de lembrete

1. Criar tarefa com `remindAt` → grava `Reminder(pendente)` + agenda no QStash um callback para `remindAt`
2. No horário, QStash chama `POST /api/reminders/trigger` com `reminderId`
3. A rota valida a assinatura do QStash (verificação HMAC) → busca o lembrete → busca `PushSubscription` do dono → envia via `web-push`
4. Sucesso → `enviado`; falha → QStash re-tenta com backoff; se falhar permanentemente → `falhou` e o lembrete aparece como pendente na tela Hoje

**Lembrete no passado:** não agenda; avisa na criação.
**Editar tarefa com lembrete enviado:** gera lembrete novo se a nova data ainda estiver no futuro.

## 8. Interface — estilo "Terminal" (aprovado visualmente)

- **Base:** `#0F1110` (preto esverdeado), texto `#E6E4DC`, secundário `#6E736B`
- **Acento único:** verde CRT `#7FD88F` (checkbox, seções, botão principal)
- **Prioridade alta:** âmbar `#E5A050` (única cor semântica extra)
- **Tipografia:** monospace (Consolas/Menlo/SF Mono, fallback `monospace`); labels em maiúsculas com espaçamento largo; datas grandes
- **Elementos:** checkbox `[ ]`/`[x]`, separadores tracejados `- - -`, títulos de seção com `>`, cantos retos, sem cards, sem sombras, sem gradientes
- **Ícone do app:** `[✓]` em preto + verde CRT
- **Telas:** Hoje (pendentes ordenadas por prioridade + concluídas do dia), Lista (busca `> buscar:` + filtros como chips `[casa] [saúde] [!alta]`, agrupada por data), Concluídas (histórico, desfazer), modal nova tarefa (bottom sheet com campos `título:`, data/hora, `[categoria]`, `[prioridade]`, recorrência, lembrete, botões `[cancelar]` `[salvar]`)
- **FAB** verde CRT com `+`; status de sync no topo: `sincronizado` / `sincronizando…` / `offline`

## 9. Erros, validação e casos de borda

- Validação **zod** em toda entrada; `400` com mensagem clara, `401` sem sessão, `404` recurso inexistente
- UI otimista com rollback e mensagem de erro em estilo terminal (`[erro] …`)
- Push sem permissão → lembrete `falhou`, visível na tela Hoje
- Recorrência com fim no passado → não gera próxima
- Exclusão de categoria com tarefas → tarefas ficam sem categoria (não exclui tarefas)

## 10. Testes

- **Unitários (Vitest):** cálculo de recorrência (frequências, intervalos, fim) — núcleo mais propenso a erro; regras de lembrete
- **API:** CRUD + conclusão com recorrência, contra banco de teste
- **E2E (Playwright):** fluxo no viewport mobile — criar → concluir → ver próxima ocorrência

## 11. Deploy e ambiente

| Serviço | Uso | Custo |
|---|---|---|
| Vercel | deploy (git) | grátis |
| Neon (Postgres) | banco | grátis |
| Google Cloud OAuth | login | grátis |
| Upstash QStash | agendador | grátis |
| VAPID | chave gerada no projeto | grátis |

Tudo em variáveis de ambiente; `.env.example` documenta. Onde `.env` e `.superpowers/` entram no `.gitignore`.

## 12. Etapas de construção

1. **Fundação** — Next.js + TS, Prisma + Neon, Auth.js/Google, deploy Vercel
2. **Núcleo** — CRUD tarefas/categorias + recorrência (+ testes unitários)
3. **Interface** — 3 telas + modal no estilo Terminal
4. **Lembretes** — QStash + web-push + subscribe do aparelho
5. **PWA** — manifest, ícone `[✓]`, app shell offline

## 13. Roadmap futuro

Módulo 2: finanças pessoais · Módulo 3: organizador/notas · Módulo 4: saúde — cada um com design → plano → implementação próprios.
