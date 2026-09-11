#!/usr/bin/env bash
# ─── Script de Demonstração de Conversa Longa (OpsPilot) ────────────────────────
# Envia múltiplos turnos de conversa sequenciais, reutilizando conversationId
# e imprimindo a evolução de promptTokens e do contextBreakdown a cada turno.

set -e

BASE_URL="${OPSPILOT_URL:-http://localhost:3000}"
USER_ID="u-demo-long"

echo "========================================================================"
echo "🚀 Iniciando Demonstração de Conversa Longa — OpsPilot Token Metrics"
echo "API: $BASE_URL/chat | Usuário: $USER_ID"
echo "========================================================================"
echo ""

MESSAGES=(
  "Olá, meu nome é Carlos e sou especialista no microserviço auth."
  "Como está o status operacional dos provedores externos essenciais?"
  "Abra um incidente low para o notification-service: fila de e-mails atrasada"
  "Consulte as instruções do runbook de checkout para mitigar instabilidade"
  "Qual é o meu nome, qual serviço eu cuido e qual incidente abrimos?"
)

CONV_ID=""

for i in "${!MESSAGES[@]}"; do
  TURNO=$((i + 1))
  MSG="${MESSAGES[$i]}"

  echo "------------------------------------------------------------------------"
  echo "▶ [Turno $TURNO] Mensagem: \"$MSG\""
  echo "------------------------------------------------------------------------"

  if [ -z "$CONV_ID" ]; then
    PAYLOAD=$(jq -n --arg m "$MSG" --arg u "$USER_ID" '{message: $m, userId: $u}')
  else
    PAYLOAD=$(jq -n --arg m "$MSG" --arg u "$USER_ID" --arg c "$CONV_ID" '{message: $m, userId: $u, conversationId: $c}')
  fi

  RESPONSE=$(curl -s "$BASE_URL/chat" \
    -H "Content-Type: application/json" \
    -X POST \
    -d "$PAYLOAD")

  # Extrai métricas e dados com jq
  CONV_ID=$(echo "$RESPONSE" | jq -r '.conversationId // empty')
  ANSWER=$(echo "$RESPONSE" | jq -r '.answer // "Sem resposta"')
  PROMPT_TOKENS=$(echo "$RESPONSE" | jq -r '.metrics.promptTokens // 0')
  HIST_MSGS=$(echo "$RESPONSE" | jq -r '.metrics.historyMessages // 0')
  RECALLED=$(echo "$RESPONSE" | jq -r '.metrics.recalledMemories // 0')
  
  USER_TOKENS=$(echo "$RESPONSE" | jq -r '.metrics.contextBreakdown.userMessage // 0')
  HIST_TOKENS=$(echo "$RESPONSE" | jq -r '.metrics.contextBreakdown.history // 0')
  MEM_TOKENS=$(echo "$RESPONSE" | jq -r '.metrics.contextBreakdown.memories // 0')
  TOTAL_EST=$(echo "$RESPONSE" | jq -r '.metrics.contextBreakdown.totalEstimated // 0')

  echo "💬 Resposta: ${ANSWER:0:120}..."
  echo ""
  echo "📊 Métricas de Contexto & Tokens:"
  echo "   • promptTokens (Real):       $PROMPT_TOKENS"
  echo "   • Mensagens no Histórico:    $HIST_MSGS"
  echo "   • Memórias Semânticas:       $RECALLED"
  echo "   • Breakdown Estimado:"
  echo "       - userMessage:           $USER_TOKENS tokens"
  echo "       - history:               $HIST_TOKENS tokens"
  echo "       - memories:              $MEM_TOKENS tokens"
  echo "       - totalEstimated:        $TOTAL_EST tokens"
  echo ""

  # Pequena pausa entre turnos
  sleep 1
done

echo "========================================================================"
echo "✅ Demonstração de conversa longa concluída com sucesso!"
echo "Conversation ID final: $CONV_ID"
echo "========================================================================"
