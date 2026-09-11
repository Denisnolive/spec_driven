# ─── Script PowerShell de Conversa Longa (OpsPilot) ───────────────────────────
# Envia múltiplos turnos de conversa sequenciais, reutilizando conversationId
# e imprimindo a evolução de promptTokens e do contextBreakdown a cada turno.

$ErrorActionPreference = "Stop"

$baseUrl = if ($env:OPSPILOT_URL) { $env:OPSPILOT_URL } else { "http://localhost:3000" }
$userId  = "u-demo-long"

Write-Host "========================================================================" -ForegroundColor Cyan
Write-Host "🚀 Iniciando Demonstração de Conversa Longa — OpsPilot Token Metrics" -ForegroundColor Cyan
Write-Host "API: $baseUrl/chat | Usuário: $userId" -ForegroundColor Cyan
Write-Host "========================================================================" -ForegroundColor Cyan
Write-Host ""

$messages = @(
  "Olá, meu nome é Carlos e sou especialista no microserviço auth."
  "Como está o status operacional dos provedores externos essenciais?"
  "Abra um incidente low para o notification-service: fila de e-mails atrasada"
  "Consulte as instruções do runbook de checkout para mitigar instabilidade"
  "Qual é o meu nome, qual serviço eu cuido e qual incidente abrimos?"
)

$convId = $null

for ($i = 0; $i -lt $messages.Count; $i++) {
  $turno = $i + 1
  $msg = $messages[$i]

  Write-Host "------------------------------------------------------------------------" -ForegroundColor Yellow
  Write-Host "▶ [Turno $turno] Mensagem: `"$msg`"" -ForegroundColor Yellow
  Write-Host "------------------------------------------------------------------------" -ForegroundColor Yellow

  $payloadObj = @{
    message = $msg
    userId  = $userId
  }

  if ($convId) {
    $payloadObj["conversationId"] = $convId
  }

  $jsonBody = $payloadObj | ConvertTo-Json -Compress

  $response = Invoke-RestMethod -Uri "$baseUrl/chat" -Method POST -ContentType "application/json" -Body $jsonBody

  $convId       = $response.conversationId
  $answer       = $response.answer
  $promptTokens = $response.metrics.promptTokens
  $histMsgs     = $response.metrics.historyMessages
  $recalled     = $response.metrics.recalledMemories
  $breakdown    = $response.metrics.contextBreakdown

  $preview = if ($answer.Length -gt 120) { $answer.Substring(0, 120) + "..." } else { $answer }

  Write-Host "💬 Resposta: $preview"
  Write-Host ""
  Write-Host "📊 Métricas de Contexto & Tokens:" -ForegroundColor Green
  Write-Host "   • promptTokens (Real):       $promptTokens"
  Write-Host "   • Mensagens no Histórico:    $histMsgs"
  Write-Host "   • Memórias Semânticas:       $recalled"
  Write-Host "   • Breakdown Estimado:"
  Write-Host "       - userMessage:           $($breakdown.userMessage) tokens"
  Write-Host "       - history:               $($breakdown.history) tokens"
  Write-Host "       - memories:              $($breakdown.memories) tokens"
  Write-Host "       - totalEstimated:        $($breakdown.totalEstimated) tokens"
  Write-Host ""

  Start-Sleep -Seconds 1
}

Write-Host "========================================================================" -ForegroundColor Cyan
Write-Host "✅ Demonstração de conversa longa concluída com sucesso!" -ForegroundColor Green
Write-Host "Conversation ID final: $convId" -ForegroundColor Cyan
Write-Host "========================================================================" -ForegroundColor Cyan
