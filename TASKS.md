# TASKS — Backend (API do CondoCheck)

Plano de execução em etapas. Regras de negócio: [CLAUDE.md](CLAUDE.md). Contrato esperado pelo front: `front/types/index.ts` e `front/lib/services.ts` (o front já está pronto em modo mock; cada etapa aqui destrava telas de lá).

Legenda: `[x]` feito · `[ ]` a fazer · **(front)** = ajuste no repositório do front · **(PO)** = depende de resposta da PO.

Princípios que valem para todas as etapas:
- Toda rota: schema Zod → controller (só HTTP) → service (regra + escopo) → Prisma.
- **Respostas no formato de `front/types/index.ts`**: cada módulo tem um *serializer* que converte `Decimal` → `number`, datas → ISO, e monta os objetos aninhados (`prestador`, `condominio`…). O front não deve precisar converter nada.
- Mudança de status só pela máquina de estados + evento em `chamado_eventos` **na mesma transação**.
- Cada endpoint entra com teste (Vitest + Supertest; Clerk mockado; banco de teste no Docker).

---

## Etapa 0 — Fundação ✅

- [x] Projeto Node 22 + Express 5 + TypeScript strict (ESM), ESLint + Prettier
- [x] `src/config/env.ts` validando variáveis com Zod (Clerk/Storage obrigatórios só em produção)
- [x] Logger (pino), CORS por `FRONTEND_URL`, helmet, erro padrão `{ erro: { codigo, mensagem } }`
- [x] `GET /api/health` (consulta o banco — o ping mantém Render e Supabase acordados)
- [x] Docker: `docker compose up -d` sobe Postgres + API com hot reload; Dockerfile multi-stage (dev / prod)
- [x] Primeira migration com as constraints SQL (CHECKs + índice único parcial) e `npm run seed` (categorias + 1º ADMIN)
- [x] Storage plugável: `STORAGE_DRIVER=supabase` (padrão) ou `s3` (S3/R2) — [docs/storage.md](docs/storage.md)
- [x] CI (lint, typecheck, test, build, imagem Docker) e deploy (migrate + Deploy Hook) — [docs/deploy.md](docs/deploy.md)
- [x] `render.yaml` (Blueprint) e workflow opcional para manter a API acordada
- [x] Guia do Clerk — [docs/clerk-setup.md](docs/clerk-setup.md)
- [ ] Criar o repositório no GitHub e fazer o 1º commit/push

Trello: *[Setup] Criar repositórios*, *[Setup] Configurar CI/CD*, *[Setup] Configurar banco (Prisma + migrations)*, *[Setup] Conectar Vercel e Railway* (Railway → Render).

## Etapa 1 — Autenticação (Clerk) e `/me`

Pré-requisito: chaves do Clerk no `.env` ([docs/clerk-setup.md](docs/clerk-setup.md)).

- [ ] `clerkMiddleware({ authorizedParties })` no router `/api` (depois do health)
- [ ] Middleware `carregarUsuario`: busca por `clerk_user_id`; no 1º login casa pelo **e-mail verificado** (`clerkClient.users.getUser`) e grava o `clerk_user_id`; usuário `ativo = false` → 403
- [ ] `exigirPerfil(...perfis)` e helper de escopo (`condominioIds` do usuário; ADMIN = todos)
- [ ] `GET /me` → `Me` (perfil, condomínios, `prestador { id, status, categoriaIds }`); **404** se não houver linha em `usuarios`
- [ ] `POST /prestadores/cadastro` (só Clerk sem vínculo): cria `usuarios(PRESTADOR)` + `prestadores(PENDENTE)` + categorias; valida CPF/CNPJ e telefone E.164; exige `emiteNotaFiscal` informado
- [ ] `GET /categorias` (TI só para ADMIN)
- [ ] Testes: sem token → 401; 1º login vincula por e-mail; e-mail não verificado não vincula; 404 no `/me`

Destrava no front: login real, `MeGate`, `/cadastro/prestador`.
Trello: todos os cards *[Auth]* e *[Back] Endpoints de cadastro e login…* — **substituídos por Clerk** (sem JWT/bcrypt próprios, sem login por celular).

## Etapa 2 — Administração (condomínios, usuários, prestadores)

- [ ] `GET/POST/PATCH /condominios` (ADMIN); latitude/longitude manuais ou geocodificação (Nominatim, 1 req/s, com `User-Agent`) — opcional
- [ ] `GET/POST/PATCH /usuarios` (ADMIN): pré-cadastro de SINDICO/FISCAL/ZELADOR/ADMIN por e-mail + vínculos com condomínios; desativar em vez de apagar
- [ ] `GET /prestadores` (ADMIN, SINDICO): filtros categoria/status/busca, paginado
- [ ] `GET /prestadores/:id` com avaliações (sem identificar o condomínio avaliador)
- [ ] `PATCH /prestadores/:id/aprovar` (exige `emiteNotaFiscal = true`) e `/bloquear` (motivo obrigatório); reversíveis
- [ ] `PATCH /prestadores/me` (PRESTADOR edita telefone, categorias, área)
- [ ] **(front)** telas `/admin/usuarios`, `/admin/condominios`, `/prestadores` (hoje placeholders)

Trello: *[Prestadores] Aprovar ou bloquear*, *[Prestadores] Busca/filtro*, *[Back] Endpoints de aprovação/bloqueio*, *[Back] Endpoints de busca/filtro*, *[Back] Endpoint "emite nota fiscal"*, *[Front] Tela de aprovação/bloqueio*, *[Front] Tela de listagem de prestadores*.

## Etapa 3 — Chamados (núcleo) e LGPD

- [ ] Máquina de estados (`src/modules/chamados/estado.ts`): transições válidas + evento na mesma transação
- [ ] `POST /chamados`: ZELADOR só `limpeza`, TI só ADMIN, condomínio dentro do escopo; `prazoPropostasAte` = +48 h (NORMAL) ou `prazoUrgenteHoras` (URGENTE, padrão 2 h **(PO)**); evento `ABERTO` (marco)
- [ ] `GET /chamados` paginado `{ itens, total }` com `page`, `pageSize`, `busca`, `categoriaId`, `situacao`; urgentes primeiro; cada item com `totalPropostas`, `menorValor`, `valorContratado`
- [ ] `GET /chamados/:id`: `localizacao` filtrada por perfil (prestador não aprovado → coordenadas com 2 casas, sem endereço), `eventos`, `comprovacoes`, `minhaProposta` para prestador
- [ ] `PATCH /chamados/:id/cancelar` e `/concluir` (ADMIN, SINDICO)
- [ ] Escopo LGPD em **todos** os services (SINDICO/FISCAL: condomínios vinculados; ZELADOR: só os que abriu) + testes de vazamento entre condomínios
- [ ] **(front)** `listChamados` passar a enviar `page/pageSize/situacao/categoriaId` e ler `{ itens, total }` (hoje espera array e pagina no cliente)

Trello: *[Chamados] Criar chamado*, *Listar e filtrar*, *Encerrar ou cancelar*, *Tratamento de urgência* (sem notificação), *Prazo de propostas por urgência*, *[Infra] LGPD*, *[Back] Endpoints CRUD de chamados*, *[Back] Middleware LGPD* (vira filtro no service, não tenant no JWT), *[Back] Lógica de urgência*, *[Back] Lógica de prazo*.

## Etapa 4 — Anexos (fotos, formulário e comprovação)

- [ ] Middleware de upload (`multer` em memória, 5 MB) + checagem por **magic bytes** (`file-type`) com a lista de tipos de cada `TipoAnexo` (mesma regra do CHECK `anexos_mime_por_tipo_chk`)
- [ ] `POST /chamados/:id/anexos` (quem abriu; JPG/PNG; máx. 6 por chamado)
- [ ] `POST /chamados/:id/formularios` (quem abriu, enquanto `ABERTO` e sem propostas; PDF/DOCX/XLSX) — feedback do professor
- [ ] `POST /chamados/:id/comprovacoes` (só prestador da proposta `ACEITA`, chamado `EM_EXECUCAO`/`CONCLUIDO`; JPG/PNG/PDF) + evento `COMPROVACAO_ENVIADA`
- [ ] URLs assinadas no `GET /chamados/:id` (`fotos: string[]`, `formularios[].url`, `comprovacoes[].url`) e no mural (prestador baixa o formulário)
- [ ] Se o banco falhar depois do upload, remover o arquivo (evita órfãos)
- [ ] Criar projeto Supabase de dev + bucket `anexos` e testar de ponta a ponta
- [ ] **(front)** comprimir imagens antes de enviar (ex.: 1600 px, JPEG 80%) — adia a necessidade de storage pago
- [ ] **(front)** exibir as fotos reais (hoje hachurado "foto N")

Trello: *[Chamados] Upload de fotos*, *[Back] Endpoint de upload de foto* (rota final é `/anexos`, 1 arquivo por requisição).

## Etapa 5 — Mural e propostas (prestador)

- [ ] `GET /mural`: só `APROVADO`, chamados `ABERTO` dentro do prazo, das suas categorias; sem endereço/condomínio; urgentes no topo
- [ ] `POST /chamados/:id/propostas` (**upsert**: cria ou edita a proposta do prestador; decidido para o front não mudar): `multipart/form-data`; valor > 0, `disponivelEm`, `tempoExecucaoHoras` obrigatórios; recusa após o prazo; evento `PROPOSTA_RECEBIDA` (3ª proposta = marco)
- [ ] Se o chamado tem formulário: exigir ≥ 1 arquivo (`anexos.tipo = PROPOSTA`, JPG/PNG/PDF/DOCX/XLSX) — novo ou já enviado antes — senão 409 `FORMULARIO_OBRIGATORIO`; tudo na mesma transação (arquivo removido do storage se a gravação falhar)
- [ ] `PATCH /propostas/:id/cancelar`, só antes de `TRANSFERIDA/ACEITA`
- [ ] `GET /propostas/minhas` (em andamento / aguardando / encerradas)

Trello: *[Mural] Mural filtrado*, *Enviar/Editar/Cancelar proposta*, *[Back] Endpoints CRUD de propostas*, *[Back] Endpoint de mural*.

## Etapa 6 — Comparação, transferência, aprovação e WhatsApp

- [ ] `GET /chamados/:id/propostas` (ADMIN, SINDICO): prestador com `mediaAvaliacao`, `totalAvaliacoes`, `totalServicos`; `alertaPoucasPropostas` (< 3); `arquivos` de cada proposta (URL assinada)
- [ ] `POST /chamados/:id/transferir` (ADMIN) → `TRANSFERIDA`, chamado `AGUARDANDO_APROVACAO`
- [ ] `POST /chamados/:id/aprovar` (SINDICO) → `ACEITA`, **demais `RECUSADA` de uma vez**, chamado `EM_EXECUCAO`, evento marco
- [ ] `POST /chamados/:id/reprovar` (SINDICO, só a `TRANSFERIDA`; `motivo` opcional) → proposta `RECUSADA` + `motivo_recusa`, chamado volta para `ABERTO`, evento `REPROVADA` (marco) — feedback do professor
- [ ] `GET /chamados/:id/whatsapp` → `{ url }` `wa.me` com mensagem pronta
- [ ] Respostas de transferir/aprovar/reprovar/concluir/cancelar devolvem o `Chamado` atualizado (o front usa o retorno)

Trello: *[Seleção] Comparar*, *Aceitar proposta vencedora*, *Gerar link de WhatsApp*, *[Chamados] Indicador de poucas propostas*, *[Back] Endpoint de aceite + WhatsApp* (vira transferir + aprovar), *[Back] Lógica de poucas propostas*.

## Etapa 7 — Avaliação e reputação

- [ ] `POST /chamados/:id/avaliacao` (ADMIN, SINDICO; só `CONCLUIDO`; 1 por chamado): nota 1–5 + comentário; atualiza `mediaAvaliacao`/`totalAvaliacoes` **na mesma transação**; evento `AVALIADO`
- [ ] `GET /prestadores/:id/historico` → `HistoricoPrestador` (prazo cumprido derivado)
- [ ] Avaliações visíveis a qualquer síndico/admin **sem** identificar o condomínio **(PO)**

Trello: *[Avaliação] Registrar*, *Calcular média*, *Exibir histórico*, *[Avaliações] Compartilhadas entre condomínios*, *[Back] Endpoints de avaliação*, *[Back] Avaliações cruzadas* — com **nota geral única** (não 3 critérios).

## Etapa 8 — Integração com o front

- [ ] Rodar o front com `NEXT_PUBLIC_MOCK=false` contra a API local e passar por todos os perfis
- [ ] Seed de **demonstração** (`npm run seed:demo`): condomínios, usuários `+clerk_test`, prestadores, chamados em todos os estados — igual ao mock do front
- [ ] Checklist de contrato: cada função de `front/lib/services.ts` × endpoint (formato, status HTTP, erros)
- [ ] **(front)** "esqueci minha senha" (Clerk `resetPasswordEmailCode`)

## Etapa 9 — Publicação

- [ ] Supabase produção (região EUA-Leste) + bucket; Supabase dev só para storage
- [ ] Render via Blueprint; secrets no GitHub; Environment `production`
- [ ] Clerk: decidir instância Development para a apresentação **ou** Production com domínio próprio ([docs/clerk-setup.md §7](docs/clerk-setup.md#7-produção-quando-for-publicar))
- [ ] Vercel apontando para a API; `FRONTEND_URL` no Render
- [ ] Ligar `API_HEALTH_URL` (ping) antes da apresentação

Trello: *[Setup] Conectar Vercel e Railway* → Render.

## Etapa 10 — Qualidade e entrega

- [ ] Teste de ponta a ponta do fluxo: chamado → propostas → transferência → aprovação → conclusão → avaliação
- [ ] Rate limit básico (ex.: `express-rate-limit`) nas rotas de escrita
- [ ] Reduzir a imagem Docker (hoje ~540 MB: SDK da AWS + engines do Prisma)
- [ ] README do back (como rodar, como publicar) e roteiro de demo

Trello: *[Polimento] Testes finais end-to-end*, *Preparar apresentação*.

---

## Feedback do professor (01/10/2026)

| Ponto | Decisão | Onde |
|---|---|---|
| "Fornecedor" não é o termo certo | **Prestador de serviço** em tudo: telas, código, banco (`prestadores`, perfil `PRESTADOR`) e rotas (`/prestadores`, `/cadastro/prestador`) | [x] back (schema/migration/docs) · [x] front |
| "Indicar" não é bom | **Transferir ao síndico** (`TRANSFERIDA`, `POST /chamados/:id/transferir`) | [x] back (schema/docs) · [x] front |
| Só tem "aprovar", falta "reprovar" | Síndico **reprova** a proposta transferida (motivo opcional) e o chamado volta para a administradora; ao aprovar, as demais são recusadas de uma vez | [x] front (mock) · Etapa 6 no back |
| Formulário para o prestador | Quem abre anexa formulário (PDF/DOCX/XLSX); se houver, a proposta **exige** o arquivo devolvido | [x] front (mock) · Etapas 4 e 5 no back |
| Botão "Abrir chamado" solto no painel do síndico | Coluna "Atenção" com avisos para todos os perfis; some quando vazia | [x] front |
| Foto do problema no chamado | Já existia (passo 2 do novo chamado) | — |

## Reunião com o professor (04/10/2026) — aplicar no back antes da Etapa 1

O front já está com o fluxo completo no mock: o contrato é `front/lib/services.ts` + `front/types/index.ts`, e o fluxo por perfil está em `front/docs/fluxo.md`. O schema do back **ainda não** reflete estas mudanças; fazer tudo numa migration inicial nova (o banco nunca foi para produção).

- [ ] **"Chamado" → "Ordem de serviço"** em tudo: model `Ordem` (tabela `ordens_servico`), rotas `/api/ordens`, enums `StatusOrdem`, campos `ordem_id`, docs e diagrama
- [ ] **Perfil por vínculo:** tirar `usuarios.perfil`; `vinculos_condominio` ganha `perfil` (SINDICO/FISCAL/ZELADOR, um por condomínio); `usuarios.administradora boolean`; `usuarios.ativo`. `GET /me` devolve `{ administradora, vinculos[{ condominio, perfil }], condominiosAdministrados?, prestador? }`
- [ ] **Perfil ativo:** cabeçalho `X-Perfil` define o escopo das listagens; a autorização de cada ação continua pelo vínculo da pessoa no condomínio da OS
- [ ] **Aprovador por condomínio:** `condominios.aprovador_id` (nullable = administradora aprova). Validar que é pessoa ativa vinculada; impedir desativar/desvincular quem é aprovador (409 `PESSOA_E_APROVADORA`)
- [ ] Aprovar/reprovar por **quem é o aprovador** (não mais "SINDICO"); quando a aprovadora é a administradora, `POST /ordens/:id/aprovar` vale direto de `ABERTO`
- [ ] **Tipos de serviço:** `categorias` com `zelador_pode_abrir`, `interna`, `ativa`; CRUD `GET/POST/PATCH /categorias` (+ `?todas=1`, `GET /categorias/uso`)
- [ ] **Vários tipos por OS:** tabela `ordem_categorias` (N:N). Mural: OS com **qualquer** tipo atendido pelo prestador
- [ ] **Nota fiscal:** `ordens.exige_nota_fiscal`; anexos `NOTA_FISCAL` via `POST /ordens/:id/notas-fiscais` (prestador da proposta aceita); conclusão recusa com 409 `NOTA_FISCAL_PENDENTE`
- [ ] **Comprovante de pagamento:** anexo `PAGAMENTO` obrigatório em `PATCH /ordens/:id/concluir` (multipart `comprovantes`); visível ao prestador
- [ ] **Pessoas:** CRUD `GET/POST/PATCH /pessoas` (e-mail único, vínculos, `contaCriada` = `clerk_user_id` preenchido); soft delete
- [ ] **Prestadores:** campos `nome_contato`, `email`, `origem` (AUTOCADASTRO/ADMINISTRADORA), `ativo`, `motivo_inativacao`; status só `PENDENTE`/`APROVADO` (o antigo `BLOQUEADO` vira `ativo = false`). Rotas: `GET/POST/PATCH /prestadores`, `/:id/aprovar`, `/:id/desativar`, `/:id/reativar`, `GET/PATCH /prestadores/me`. Cadastro pela administradora já entra `APROVADO` e casa com a conta pelo e-mail no 1º login (igual às pessoas)
- [ ] **Condomínios:** `uf`, `ativo`; CRUD com aprovador
- [ ] Eventos novos: `NOTA_FISCAL_ENVIADA`; texto de conclusão citando o comprovante
- [ ] `GET /me` responde **403** para pessoa ou prestador desativado (o front mostra "acesso desativado")

## Fora de escopo da v1 (cards do Trello que não viram tarefa)

- Notificações push/e-mail/in-app: o aviso ao prestador é o link do WhatsApp e o próprio painel. Cards *[Notificações] …*, *[Back] Serviço de notificações*, *[Front] Componente de notificações*.
- Login por celular/SMS e JWT/bcrypt próprios (substituídos pelo Clerk).
- Seletor de múltiplos perfis (*[Front] Tela de seleção de perfil*): cada usuário tem um único perfil.

## Premissas abertas com a PO

Ver [CLAUDE.md §13](CLAUDE.md#13-premissas-a-confirmar-com-a-po): prazo padrão do urgente, quem avalia, aprovação direto de `ABERTO`, nome do condomínio nas avaliações, comprovação após `CONCLUIDO`.
