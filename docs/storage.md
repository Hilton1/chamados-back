# Storage de anexos — Supabase hoje, S3/R2 se ficar mais barato

Todos os arquivos da ordem de serviço (fotos da abertura, formulário, arquivos da proposta, comprovação, nota fiscal e comprovante de pagamento; até 5 MB) ficam num bucket **privado**. O banco guarda só o caminho (`anexos.storage_path`, ex.: `ordens/<id>/abertura/<uuid>.jpg`); a API gera **URL assinada** de curta duração (`STORAGE_SIGNED_URL_TTL`, padrão 10 min) ao devolver a ordem de serviço.

## Como o código está preparado

```
src/lib/storage/
  types.ts     # interface Storage: upload, remove, signedUrl
  supabase.ts  # Supabase Storage (SDK oficial)          ← STORAGE_DRIVER=supabase (padrão)
  s3.ts        # qualquer serviço compatível com S3       ← STORAGE_DRIVER=s3
  index.ts     # storage() escolhe o driver; caminhoAnexo() monta o path
```

Services usam só `storage().upload(...)`, `storage().signedUrl(...)`. **Trocar de provedor = trocar variáveis de ambiente**, sem mexer em regra de negócio.

Não há storage rodando no Docker local: em dev a API usa um projeto Supabase de desenvolvimento. Sem credenciais a API sobe normalmente; só o upload falha com mensagem clara.

## Comparação (valores de referência de set/2026 — confira antes de decidir)

| Opção | Grátis | Depois do grátis | Saída de dados (download) | Observação |
|---|---|---|---|---|
| **Supabase Storage** (atual) | 1 GB | Plano Pro (US$ 25/mês) inclui 100 GB | limitada no free | Mesmo painel do banco; zero configuração extra |
| **Cloudflare R2** | 10 GB/mês | ~US$ 0,015/GB/mês | **grátis** | Melhor candidato para migrar. Pede cartão para ativar |
| Backblaze B2 | 10 GB | ~US$ 6/TB/mês | grátis até 3× o armazenado | Compatível com S3 |
| AWS S3 | créditos de conta nova, por tempo limitado | ~US$ 0,023/GB/mês | ~US$ 0,09/GB | Mais caro para este caso; pede cartão |

Estimativa: 3 fotos de ~1,5 MB por chamado ≈ 4,5 MB → **1 GB ≈ 220 chamados com foto**. Comprimir as fotos no front antes do upload (ex.: 1600 px, JPEG 80%, ~300 KB) multiplica isso por ~5 — está no [TASKS.md](../TASKS.md) como melhoria.

**Quando migrar:** quando o storage do Supabase passar de ~70% de 1 GB ou se o banco precisar do plano pago por outro motivo (aí o Pro já cobre o storage e não vale migrar).

## Migrar para Cloudflare R2 (exemplo)

1. Cloudflare → R2 → criar bucket `anexos` (privado) → *Manage R2 API Tokens* → token com *Object Read & Write* nesse bucket.
2. Copiar os arquivos existentes (os caminhos continuam iguais, então o banco não muda). Com [rclone](https://rclone.org), configurando os dois lados como S3 — o Supabase também expõe S3 em *Storage → Settings → S3 Connection*:
   ```bash
   rclone sync supabase:anexos r2:anexos --progress
   ```
3. Variáveis no Render:
   ```env
   STORAGE_DRIVER=s3
   S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
   S3_REGION=auto
   S3_ACCESS_KEY_ID=...
   S3_SECRET_ACCESS_KEY=...
   S3_FORCE_PATH_STYLE=false
   ```
4. Novo deploy, conferir um chamado com foto, e só depois apagar o bucket antigo.

AWS S3: mesmo processo, deixando `S3_ENDPOINT` vazio e `S3_REGION` com a região do bucket.
