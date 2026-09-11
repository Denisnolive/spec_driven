---
applyTo: "web/"
description: "Diretrizes de design system, hierarquia visual, espaçamento em escala, estados vazios e de erro, dark mode e acessibilidade para aplicações web."
---

# Diretrizes de Design e Interface Web (`web/`)

Este documento estabelece os padrões e regras obrigatórias de design, usabilidade, acessibilidade e consistência visual para o código e componentes da pasta `web/`.

---

## 1. Hierarquia Visual e Tipografia

### 1.1 Princípios de Hierarquia
- **Escaneabilidade:** A interface deve permitir leitura rápida orientada a tarefas (F-pattern para páginas densas e Z-pattern para telas de onboarding/login).
- **Proximidade (Gestalt):** Elementos com relação semântica direta devem estar mais próximos entre si do que de blocos adjacentes.
- **Contraste de Peso e Tamanho:** Diferencie títulos, subtítulos e labels através do peso da fonte (`font-weight`) e escala tipográfica, nunca apenas pela cor.

### 1.2 Escala Tipográfica (Base 16px / 1rem)
Use tokens semânticos baseados em `rem` para garantir respeito às configurações do navegador do usuário:

| Token | Tamanho | Line Height | Peso | Uso Recomendado |
|---|---|---|---|---|
| `--text-display` | `2.25rem` (36px) | `1.2` | `700` (Bold) | Hero headlines, métricas centrais |
| `--text-h1` | `1.875rem` (30px) | `1.25` | `700` (Bold) | Título principal da página (`<h1>` único) |
| `--text-h2` | `1.5rem` (24px) | `1.3` | `600` (Semi-bold) | Título de seções e modais |
| `--text-h3` | `1.25rem` (20px) | `1.4` | `600` (Semi-bold) | Subseções, cabeçalhos de cards |
| `--text-body` | `1rem` (16px) | `1.5` | `400` / `500` | Parágrafos padrão, itens de listas |
| `--text-body-sm` | `0.875rem` (14px) | `1.5` | `400` / `500` | Tabelas, inputs, textos secundários |
| `--text-caption` | `0.75rem` (12px) | `1.4` | `500` (Medium) | Badges, timestamps, mensagens de ajuda |

---

## 2. Espaçamento em Escala (Spacing Scale)

### 2.1 Escala Base de 4px / 8px
Nunca utilize valores arbitrários (e.g., `margin-top: 13px`). Use estritamente a escala baseada em múltiplos de 4px e 8px:

```css
:root {
  --space-1: 0.25rem; /*  4px */
  --space-2: 0.5rem;  /*  8px */
  --space-3: 0.75rem; /* 12px */
  --space-4: 1rem;    /* 16px */
  --space-5: 1.25rem; /* 20px */
  --space-6: 1.5rem;  /* 24px */
  --space-8: 2rem;    /* 32px */
  --space-10: 2.5rem; /* 40px */
  --space-12: 3rem;   /* 48px */
  --space-16: 4rem;   /* 64px */
}
```

### 2.2 Aplicação Consistente
- **Componentes Atômicos (botões, inputs, tags):**
  - Padding vertical: `--space-2` (8px) ou `--space-3` (12px).
  - Padding horizontal: `--space-3` (12px) ou `--space-4` (16px).
  - Gap interno entre ícone e texto: `--space-2` (8px).
- **Cards e Painéis:**
  - Padding interno: `--space-4` (16px) a `--space-6` (24px).
  - Gap entre elementos internos: `--space-3` (12px) a `--space-4` (16px).
- **Layout de Página:**
  - Margem entre seções principais: `--space-8` (32px) a `--space-12` (48px).
  - Gaps de grids/flex containers: `--space-4` (16px) a `--space-6` (24px).

---

## 3. Estados Vazios (Empty States)

Toda tela, lista, tabela ou painel que dependa de dados deve prever seu estado vazio antes de qualquer renderização.

### 3.1 Anatomia Obrigatória do Empty State
1. **Representação Visual:** Ícone temático discreto ou ilustração minimalista (com `aria-hidden="true"`).
2. **Título Claro:** Frase curta comunicando a ausência do dado (ex: *"Nenhum incidente em aberto"*).
3. **Texto de Apoio / Contexto:** Explicação simples de por que está vazio ou como preencher (ex: *"Quando novos alertas forem detectados pelo OpsPilot, eles aparecerão listados aqui."*).
4. **Call to Action (CTA):** Botão de ação primária ou secundária para resolver o estado (ex: *"Criar Incidente"*, *"Limpar Filtros"*, ou *"Atualizar Lista"*).

### 3.2 Casos de Uso Comuns
- **Primeiro Uso (Zero Data):** Foco em onboarding e direcionamento para a primeira ação.
- **Filtro sem Resultados:** Informar que a busca atual não retornou registros e oferecer botão direto *"Limpar filtros"*.
- **Lista Esvaziada pelo Usuário:** Parabenizar ou fornecer confirmação (ex: *"Tudo limpo por aqui! Não há pendências no momento."*).

---

## 4. Estados de Erro (Error States)

Os erros devem ser informativos, não punitivos e fornecer caminhos diretos de recuperação.

### 4.1 Granularidade dos Erros
- **Erros de Validação em Formulários (Inline):**
  - Posicionamento: Imediatamente abaixo do campo em questão.
  - Indicador visual: Borda do campo com token `--color-error` e ícone de alerta.
  - Acessibilidade: Conectar via `aria-describedby` ao id da mensagem de erro e marcar campo com `aria-invalid="true"`.
- **Erros de Ação / Comunicação (Toast / Banner):**
  - Para falhas de requisição ou operações assíncronas (ex: falha ao salvar).
  - Sempre incluir botão de ação de recuperação (ex: *"Tentar novamente"*).
- **Erros Críticos de Página (Full Page):**
  - Telas de 404, 500 ou perda total de conexão.
  - Oferecer botão claro de retorno ao início ou recarregamento.

### 4.2 Diretrizes de Conteúdo do Erro
- **Nunca exibir mensagens cruas ou técnicas:** Evite expor stack traces, códigos HTTP isolados ou mensagens genéricas como *"Ocorreu um erro inesperado"*.
- **Estrutura recomendada:**
  1. *O que aconteceu* (de forma amigável).
  2. *Por que aconteceu* (se aplicável e seguro).
  3. *O que o usuário pode fazer agora* (ação recomendada).

---

## 5. Dark Mode e Sistema de Cores

Todas as cores devem ser geridas por **tokens semânticos**, nunca por valores hexadecimais ou RGB fixados diretamente nos componentes.

### 5.1 Tokens Semânticos de Superfície e Conteúdo
```css
:root {
  /* Modo Claro (Light) */
  --bg-canvas: #f8fafc;
  --bg-surface: #ffffff;
  --bg-surface-raised: #f1f5f9;
  --bg-surface-overlay: rgba(15, 23, 42, 0.6);

  --text-primary: #0f172a;
  --text-secondary: #475569;
  --text-muted: #94a3b8;
  --text-inverse: #ffffff;

  --border-subtle: #e2e8f0;
  --border-strong: #cbd5e1;

  --color-primary: #2563eb;
  --color-primary-hover: #1d4ed8;
  --color-error: #dc2626;
  --color-warning: #d97706;
  --color-success: #16a34a;
}

[data-theme="dark"],
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    /* Modo Escuro (Dark) */
    --bg-canvas: #090d16;
    --bg-surface: #111827;
    --bg-surface-raised: #1f2937;
    --bg-surface-overlay: rgba(0, 0, 0, 0.75);

    --text-primary: #f9fafb;
    --text-secondary: #9ca3af;
    --text-muted: #6b7280;
    --text-inverse: #0f172a;

    --border-subtle: #1f2937;
    --border-strong: #374151;

    --color-primary: #3b82f6;
    --color-primary-hover: #60a5fa;
    --color-error: #ef4444;
    --color-warning: #f59e0b;
    --color-success: #22c55e;
  }
}
```

### 5.2 Regras do Dark Mode
- **Evite preto absoluto (`#000000`) em superfícies:** Use tons de cinza ardósia / azulados escuros (ex: `#090d16`, `#111827`) para reduzir a fadiga ocular.
- **Elevação por Iluminação:** No dark mode, elementos com maior elevação (modais, popovers, dropdowns) devem ter fundos ligeiramente mais claros que o canvas, e não depender apenas de sombras.
- **Atenuação de Cores Primárias:** Sature menos as cores de destaque e alertas no dark mode para evitar ofuscamento.

---

## 6. Acessibilidade (a11y — WCAG 2.1 Nível AA)

A conformidade com a acessibilidade não é opcional e deve ser validada em todas as implementações.

### 6.1 Contraste de Cores
- **Texto normal (< 18pt ou < 14pt bold):** Contraste mínimo de **4.5:1** em relação ao fundo.
- **Texto grande (≥ 18pt ou ≥ 14pt bold):** Contraste mínimo de **3:1**.
- **Componentes de UI e Estados Gráficos:** Contraste mínimo de **3:1** para bordas ativas, botões e ícones funcionais.

### 6.2 Navegação por Teclado e Foco
- **Indicador de Foco Visível:** Nunca utilize `outline: none` sem fornecer uma alternativa clara. Utilize sempre `:focus-visible` com anel contrastante:
  ```css
  :focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: 2px;
  }
  ```
- **Ordem Natural do Tab:** Mantenha a ordem do DOM idêntica à ordem visual.
- **Trap de Foco:** Modais e gavetas (drawers) devem reter o foco internamente enquanto abertos e retornar o foco ao disparador ao fechar (`Escape`).

### 6.3 Semântica e ARIA
- **Elementos Nativos:** Prefira sempre `<button>`, `<a>`, `<input>`, `<label>`, `<nav>`, `<main>`, `<header>` antes de recorrer a `<div>` com manipuladores de clique.
- **Labels Obrigatórios:** Todo input deve ter um `<label for="...">` associado ou `aria-label` descritivo.
- **Regiões Dinâmicas:** Mensagens de alerta assíncronas ou atualizações em tempo real devem usar `role="status"` ou `role="alert"` (com `aria-live="polite"` ou `aria-live="assertive"`).
- **Redução de Movimento:** Respeite a preferência de usuários sensíveis a animações:
  ```css
  @media (prefers-reduced-motion: reduce) {
    *, ::before, ::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
      scroll-behavior: auto !important;
    }
  }
  ```
