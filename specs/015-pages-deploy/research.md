# Research: Deploy da War Room Web no GitHub Pages via GitHub Actions

**Feature**: `015-pages-deploy`  
**Date**: 2026-09-11

---

## 1. Abordagem Moderna de Deploy no GitHub Pages

Historicamente, o deploy no GitHub Pages dependia de criar uma branch dedicada (como `gh-pages`) e fazer commits de arquivos estáticos gerados. Desde 2022, o GitHub disponibilizou a arquitetura nativa de deployment baseada em artefatos e Actions:

1. **`actions/upload-pages-artifact@v3`**:
   - Compacta o diretório de build estático (`./web/dist`) em um arquivo `.tar.gz` formatado especificamente para o pipeline interno do Pages.
2. **`actions/deploy-pages@v4`**:
   - Utiliza a API do GitHub Pages para descompactar e publicar o artefato no ambiente de produção `github-pages`.
   - Gera como output a URL oficial do site publicado (`${{ steps.deployment.outputs.page_url }}`).

### Vantagens
- Não polui o histórico Git do repositório com branches de build ou commits binários.
- Rápido, previsível e integrado ao painel oficial de Environments e Releases do GitHub.
- Suporta rollback nativo e rastreabilidade total de qual commit originou o deploy.

---

## 2. Permissões de Segurança (OIDC & Least Privilege)

Para que o runner do GitHub Actions consiga se comunicar com a API do Pages sem tokens manuais:
```yaml
permissions:
  contents: read      # Necessário para ler o código do repositório
  pages: write         # Necessário para criar deployments no Pages
  id-token: write      # Necessário para autenticação segura via OIDC com o GitHub Pages
```

---

## 3. Controle de Concorrência

```yaml
concurrency:
  group: 'pages'
  cancel-in-progress: false
```
Configurar `cancel-in-progress: false` é crucial para o Pages: se um deploy estiver em curso, queremos que ele termine com segurança antes de iniciar o próximo, garantindo que o site nunca fique em estado inconsistente ou corrompido durante a troca de versão.

---

## 4. Subcaminho Base (`/opspilot/`) e Roteamento

No `web/vite.config.ts`, a propriedade `base: '/opspilot/'` já foi configurada. No GitHub Pages de repositórios de usuário/organização (ex: `https://usuario.github.io/opspilot/`), todas as referências a assets em `index.html` devem começar com `/opspilot/` para evitar erros 404. O build do Vite já gera todas as tags `<script src="/opspilot/assets/...">` e `<link href="/opspilot/assets/...">` perfeitamente alinhadas.
