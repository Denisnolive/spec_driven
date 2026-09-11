# Quickstart: Deploy da War Room no GitHub Pages

**Feature**: `015-pages-deploy`  
**Date**: 2026-09-11

---

## 1. Ativação do GitHub Pages no Repositório

Para que o GitHub Actions consiga realizar o deploy no Pages, configure uma única vez no repositório GitHub:
1. Acesse **Settings** > **Pages** no seu repositório no GitHub.
2. Na seção **Build and deployment**:
   - Em **Source**, selecione: **GitHub Actions**.

---

## 2. Teste e Validação Local do Build

Antes de enviar para o GitHub, você pode testar o mesmo processo de compilação que o Actions executará:

```bash
# Instalar dependências da aplicação web
npm --prefix web install

# Gerar build estático com base /opspilot/
npm --prefix web run build

# Pré-visualizar a aplicação localmente simulando o Pages
npm --prefix web run preview
```

---

## 3. Disparo Manual do Workflow

Após fazer push para a branch `main`, o workflow roda automaticamente. Se desejar disparar manualmente:
1. Vá até a aba **Actions** no repositório.
2. Selecione o workflow **Deploy War Room to GitHub Pages**.
3. Clique em **Run workflow** > branch `main` > **Run workflow**.

A War Room estará acessível em:
**`https://<seu-usuario>.github.io/opspilot/`**
