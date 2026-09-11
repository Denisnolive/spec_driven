# Feature Specification: War Room Web OpsPilot (Vite + React + TS)

**Feature Branch**: `014-war-room-web`  
**Created**: 2026-09-11  
**Status**: Draft  
**Input**: User description: "War room web/ (Vite+react+TS) com as instructions de design: chat -> /chat, com 'ver raciocínio' abrindo o trace tipado. 202 vira cartão aprovar/negar; engrenagem com URL da API; base /opspilot/; CORS"

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Conversação e Monitoramento no Chat da War Room (Priority: P1)

Como operador de plantão de SRE/DevOps, quero interagir com o OpsPilot através de uma interface web de chat em tempo real conectada ao backend (`POST /chat`), para diagnosticar incidentes, consultar alertas e acionar runbooks com histórico de conversação contínuo.

**Why this priority**: É o núcleo da experiência do usuário na War Room. Sem o chat conectado e responsivo, a ferramenta não cumpre sua função de copiloto de plantão.

**Independent Test**:
1. Abrir a aplicação web na rota base `/opspilot/`.
2. Digitar uma mensagem operacional (ex: *"Quais serviços estão com alertas ativos?"*) e submeter.
3. Verificar o estado de envio/carregamento (indicador visual acessível).
4. Validar o recebimento da resposta HTTP 200 de `POST /chat`, exibindo a mensagem do assistente na tela e preservando o `conversationId` retornado para turnos seguintes.

**Acceptance Scenarios**:
1. **Given** que o operador acessa a interface web pela primeira vez sem mensagens,  
   **When** a tela for renderizada,  
   **Then** a área de chat exibe um *Empty State* elegante com ícone temático, texto de boas-vindas orientando a operação e botões de sugestões rápidas (CTA).
2. **Given** uma mensagem digitada no campo de entrada,  
   **When** o operador pressiona *Enter* ou clica no botão de envio,  
   **Then** a mensagem do usuário é adicionada ao feed, o input é limpo, o botão de envio fica desabilitado com indicador de loading, e uma requisição `POST /chat` é enviada com payload `{ message, conversationId? }`.
3. **Given** a resposta do servidor com status 200,  
   **When** a resposta chega ao front-end,  
   **Then** a mensagem do assistente é renderizada com formatação legível, métricas essenciais (tempo de resposta, modelo utilizado) e o identificador de requisição (`X-Request-Id` / `requestId`).

---

### User Story 2 - Inspeção de Raciocínio e Trace Tipado ("Ver raciocínio") (Priority: P1)

Como engenheiro de operações, quero clicar em "Ver raciocínio" em qualquer mensagem do assistente para abrir um modal/gaveta (drawer) com o trace tipado da execução, para compreender quais nós do grafo foram acionados, quais ferramentas foram executadas e os parâmetros de latência e tokens.

**Why this priority**: A transparência no raciocínio do agente é indispensável em ambientes de produção para dar confiança às ações tomadas pelo copiloto.

**Independent Test**:
1. Enviar uma pergunta que acione ferramentas (ex: *"Liste os alertas disparando"*).
2. Localizar na mensagem do assistente o botão acessível *"Ver raciocínio"*.
3. Clicar no botão e verificar a abertura do modal/drawer com foco preso (trap) e botão de fechar acessível (`Escape` ou clique fora).
4. Conferir a listagem tipada dos eventos de trace (`router`, `tools`, `model`, `node`, seq, timestamp e payload inspecionável em JSON formatado).

**Acceptance Scenarios**:
1. **Given** uma mensagem do assistente contendo dados de trace (ou associada a um `requestId`),  
   **When** o operador clica em *"Ver raciocínio"*,  
   **Then** um painel lateral/drawer desliza exibindo o fluxo cronológico de nós e ferramentas com tipagem estrita (`TraceEventRecord`).
2. **Given** o trace aberto,  
   **When** o usuário clica em um passo de ferramenta (tool call),  
   **Then** os parâmetros de entrada e a saída da ferramenta são exibidos em bloco de código colapsável com contraste adequado.
3. **Given** o trace sendo exibido,  
   **When** o usuário pressiona a tecla `Escape` ou o botão de fechar,  
   **Then** o modal/drawer fecha suavemente e o foco do teclado retorna exatamente ao botão disparador.

---

### User Story 3 - Intervenção Human-in-the-Loop: Resposta 202 vira Cartão de Aprovar/Negar (Priority: P1)

Como operador responsável pela integridade da infraestrutura, quero que comandos com impacto em produção ou respostas com status HTTP 202 (Accepted / Requer aprovação) sejam renderizados como um cartão interativo com botões explícitos de "Aprovar" e "Negar", para que nenhuma ação destrutiva seja executada sem consentimento explícito.

**Why this priority**: Segurança operacional (Safety). Ações operacionais críticas como reinicialização de serviços ou alterações de runbook exigem barreira humana obrigatória.

**Independent Test**:
1. Simular ou enviar comando que responda HTTP 202 com detalhes da ação pendente (ex: `action: "restart_service"`, `target: "api-gateway"`).
2. Verificar que o chat renderiza um cartão de intervenção destacado (borda de alerta/atenção, resumo da ação, parâmetros).
3. Clicar em *"Aprovar"* e verificar o disparo da confirmação ao backend com feedback imediato de sucesso.
4. Repetir o teste em outra mensagem clicando em *"Negar"* e verificar o cancelamento seguro da ação com registro no chat.

**Acceptance Scenarios**:
1. **Given** que a API responde com status HTTP 202 (ou payload indicando `requiresApproval: true`),  
   **When** a resposta é processada pelo chat,  
   **Then** a mensagem é exibida no formato de cartão de aprovação com severidade visual destacada, detalhes da ação e dois botões de ação: *"Aprovar Ação"* (estilo primário/sucesso) e *"Negar Ação"* (estilo secundário/perigo).
2. **Given** o cartão de aprovação visível,  
   **When** o operador clica em *"Aprovar"*,  
   **Then** o cartão entra em estado de carregamento, envia a confirmação para a rota de execução correspondente e se atualiza para o estado consolidado *"Aprovado pelo operador"*.
3. **Given** o cartão de aprovação visível,  
   **When** o operador clica em *"Negar"*,  
   **Then** a operação é abortada, os botões são desativados e o cartão assume o estado *"Ação rejeitada pelo operador"*.

---

### User Story 4 - Configuração Dinâmica da URL da API e Suporte a CORS (Priority: P2)

Como usuário ou desenvolvedor da War Room, quero clicar em um ícone de engrenagem no cabeçalho da aplicação para configurar a URL base da API do OpsPilot, e que o servidor Express suporte requisições CORS de origens diferentes, para que a War Room possa ser executada localmente ou apontada para diferentes ambientes (staging/produção).

**Why this priority**: Flexibilidade de implantação e desacoplamento do front-end Vite (`http://localhost:5173`) em relação ao servidor Express (`http://localhost:3000`).

**Independent Test**:
1. Clicar no ícone de engrenagem no header da War Room.
2. Alterar a URL da API no input do modal (ex: `http://localhost:3000`) e salvar.
3. Recarregar a página e constatar que a URL configurada permaneceu salva em `localStorage`.
4. Enviar uma requisição e inspecionar a aba Network para garantir que os cabeçalhos de preflight OPTIONS e CORS (`Access-Control-Allow-Origin`, `Access-Control-Allow-Headers`) foram tratados pelo backend.

**Acceptance Scenarios**:
1. **Given** o header da aplicação web,  
   **When** o usuário clica no botão com ícone de engrenagem,  
   **Then** abre-se o modal de preferências com campo para *"URL da API OpsPilot"* (com valor padrão `http://localhost:3000`).
2. **Given** uma URL digitada pelo usuário,  
   **When** ele clica em *"Salvar"*,  
   **Then** a URL é persistida em `localStorage` e passa a ser usada como `baseURL` de todas as chamadas HTTP subsequentes.
3. **Given** requisições feitas a partir de outra origem (ex: Vite dev server na porta 5173),  
   **When** o navegador envia a requisição HTTP com cabeçalhos como `X-Request-Id`,  
   **Then** o backend Express aceita a requisição via middleware CORS com resposta apropriada.

---

### User Story 5 - Design System, Dark Mode e Acessibilidade (Priority: P2)

Como operador em ambiente de pouca luminosidade ou com necessidades de acessibilidade, quero que a aplicação web suporte Dark Mode nativo com tokens semânticos, obedeça à escala de espaçamento (4px/8px), forneça navegação por teclado e estados vazios/erro amigáveis, em total conformidade com `.github/instructions/designn.instrucions.md`.

**Why this priority**: Conforto visual prolongado em salas de operações (War Rooms) e conformidade legal e técnica com padrões WCAG 2.1 AA.

**Independent Test**:
1. Alternar entre modo Claro e modo Escuro através do botão de tema ou detecção de sistema (`prefers-color-scheme`).
2. Validar que as cores de fundo adotam tons ardósia/chumbo e nenhuma superfície utiliza `#000000` puro.
3. Navegar por toda a aplicação usando apenas a tecla `Tab` e verificar o anel de foco visível (`:focus-visible`).
4. Simular queda de rede e constatar a renderização de um *Error State* contextual com botão de *"Tentar novamente"*.

**Acceptance Scenarios**:
1. **Given** a aplicação aberta,  
   **When** o usuário clica no botão de alternância de tema,  
   **Then** o atributo `data-theme="dark"` (ou `light`) é atualizado no elemento raiz e persistido em `localStorage`, aplicando as variáveis CSS sem repinturas bruscas.
2. **Given** uma falha de conexão ou erro 500 do servidor,  
   **When** a mensagem falha ao ser enviada,  
   **Then** um alerta visual acessível (`role="alert"`) é exibido com mensagem humana orientando a ação e botão de retry.
3. **Given** usuários com preferência de redução de movimento (`prefers-reduced-motion`),  
   **When** abrirem gavetas ou enviarem mensagens,  
   **Then** as animações são suprimidas ou simplificadas para transições instantâneas.

---

## Edge Cases

- **Queda de Rede Durante o Chat:** Exibir banner de erro não invasivo com opção de retentar a última mensagem sem perder o histórico do chat.
- **Trace Vazio ou Inexistente:** Se uma resposta do assistente não tiver eventos de trace gerados, o botão "Ver raciocínio" deve informar educadamente no modal que não houve passos intermediários registrados para a consulta direta.
- **URL da API Inválida ou Inacessível:** O modal de configurações deve validar a sintaxe da URL e exibir alerta caso a conexão com a API falhe no teste de ping.
- **Múltiplos Cartões de Aprovação Simultâneos:** Cada cartão de ação 202 deve possuir seu próprio estado independente (carregando, aprovado, negado).
- **Redimensionamento de Tela (Mobile / Desktop):** O layout deve se adaptar fluidamente com drawer ocupando largura total em telas menores que 768px.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O projeto web DEVE ser inicializado na pasta `web/` utilizando Vite com template React e TypeScript (`web/package.json`).
- **FR-002**: A configuração do Vite (`vite.config.ts`) DEVE definir a propriedade `base: '/opspilot/'` para permitir hospedagem em subcaminho.
- **FR-003**: O backend Express DEVE incluir o middleware `cors` configurado para aceitar requisições de origens locais e propagar cabeçalhos como `X-Request-Id` e `Content-Type`.
- **FR-004**: A tela principal DEVE conter um cabeçalho fixo com o nome "OpsPilot War Room", indicador de status da conexão, alternador de Dark Mode e botão de configurações (engrenagem).
- **FR-005**: O feed de mensagens DEVE renderizar turnos de diálogo diferenciados para usuário e assistente, exibindo markdown formatado nas respostas.
- **FR-006**: Toda resposta do assistente DEVE possuir um botão de ação secundária *"Ver raciocínio"* que abre uma gaveta (drawer) lateral com o trace tipado.
- **FR-007**: Quando uma resposta da API retornar status HTTP 202 (ou payload de ação pendente), a interface DEVE renderizar um componente de cartão de aprovação com os botões *"Aprovar"* e *"Negar"*.
- **FR-008**: O botão de engrenagem DEVE abrir um modal acessível para configuração da URL base da API (`API_BASE_URL`), persistida no `localStorage` sob a chave `opspilot_api_url`.
- **FR-009**: A interface DEVE adotar estritamente o design system especificado em `.github/instructions/designn.instrucions.md`: escala de espaçamento base 4px/8px, tipografia semântica, tokens CSS e suporte a tema escuro/claro.
- **FR-010**: A interface DEVE cumprir os requisitos de acessibilidade WCAG 2.1 AA (foco visível via `:focus-visible`, navegação completa por teclado, `aria-expanded`, `aria-describedby` e contraste de cores adequado).
- **FR-011**: O chat DEVE exibir um estado vazio amigável (*Empty State*) quando não houver mensagens trocadas, contendo sugestões clicáveis para início rápido.
- **FR-012**: Falhas de requisição DEVEM ser tratadas com estados de erro contextuais e acionáveis, permitindo nova tentativa (*retry*).

### Key Entities

- **ChatMessage**:
  - `id`: string (identificador único da mensagem)
  - `sender`: `'user' | 'assistant' | 'system'`
  - `text`: string (conteúdo textual da mensagem)
  - `timestamp`: number
  - `requestId`?: string (UUID de correlação)
  - `status`?: `'pending' | 'success' | 'error' | 'awaiting_approval' | 'approved' | 'rejected'`
  - `trace`?: `TraceEventRecord[]` (eventos de nós, ferramentas e raciocínio)
  - `metrics`?: `{ latencyMs?: number; promptTokens?: number; totalTokens?: number; modelUsed?: string }`
  - `approvalPayload`?: `{ action: string; target: string; summary: string; executionId: string }`

- **TraceEventRecord**:
  - `seq`: number (ordem cronológica de execução)
  - `node`?: string (nome do nó: `'router' | 'agent' | 'tools' | 'reflect'`)
  - `kind`: string (tipo de evento: `'call' | 'response' | 'thought' | 'route'`)
  - `payload`: unknown (dados brutos estruturados)
  - `timestampMs`: number

- **AppConfig**:
  - `apiBaseUrl`: string (URL da API, padrão `http://localhost:3000`)
  - `theme`: `'dark' | 'light' | 'system'`

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: O tempo de inicialização da interface no navegador (`npm run dev` no `web/`) deve ser inferior a 1.5 segundos.
- **SC-002**: 100% das mensagens do assistente que retornam eventos de trace devem disponibilizar o botão "Ver raciocínio" funcional.
- **SC-003**: Respostas HTTP 202 devem renderizar o cartão de Aprovar/Negar em menos de 100ms após o término da requisição.
- **SC-004**: Todas as interações críticas (enviar mensagem, abrir raciocínio, fechar modal, alternar tema, aprovar/negar) devem ser 100% operáveis via teclado.
- **SC-005**: A aplicação deve compilar perfeitamente sem erros de tipagem no TypeScript (`tsc --noEmit`).

---

## Assumptions

- O backend Express do OpsPilot continuará rodando localmente na porta 3000 (ou configurável via ambiente) com endpoints `/chat`, `/stats` e `/requests/:id`.
- O suporte a CORS será adicionado ao backend no arquivo `src/http/server.ts` através do pacote `cors` para habilitar a comunicação com `http://localhost:5173`.
- A War Room será hospedada no path base `/opspilot/` tanto em desenvolvimento quanto em produção.
- O armazenamento do histórico e das configurações da War Room no navegador utilizará `localStorage` e estado React em memória.
