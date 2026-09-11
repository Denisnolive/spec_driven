import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';

/**
 * Teste de integração do MCP server.
 *
 * Spawna o processo, envia initialize + tools/list via JSON-RPC sobre stdio,
 * e valida que as 3 tools esperadas estão registradas.
 */

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ROOT = resolve(import.meta.dirname!, '..', '..');

/**
 * Envia uma mensagem JSON-RPC para o server via stdin e aguarda a resposta
 * correspondente ao `id` informado no stdout.
 *
 * O protocolo MCP stdio usa JSON + newline como delimitador.
 */
function sendRpc(
  proc: ChildProcess,
  message: Record<string, unknown>,
  expectedId: number,
  timeoutMs = 10_000
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timeout esperando resposta id=${expectedId}`)),
      timeoutMs
    );

    let buffer = '';

    const onData = (chunk: Buffer) => {
      buffer += chunk.toString();

      // Protocolo: JSON delimitado por newline
      const lines = buffer.split('\n');
      buffer = lines.pop()!; // mantém fragmento incompleto

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const parsed = JSON.parse(trimmed) as Record<string, unknown>;
          if (parsed['id'] === expectedId) {
            clearTimeout(timer);
            proc.stdout!.off('data', onData);
            resolve(parsed);
            return;
          }
        } catch {
          // Ignora linhas não-JSON
        }
      }
    };

    proc.stdout!.on('data', onData);

    const payload = JSON.stringify(message) + '\n';
    proc.stdin!.write(payload);
  });
}

/**
 * Aguarda até que o stderr contenha a substring indicada, ou timeout.
 */
function waitForStderr(
  proc: ChildProcess,
  substring: string,
  timeoutMs = 8_000
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timeout esperando "${substring}" no stderr`)),
      timeoutMs
    );

    let collected = '';

    const onData = (chunk: Buffer) => {
      collected += chunk.toString();
      if (collected.includes(substring)) {
        clearTimeout(timer);
        proc.stderr!.off('data', onData);
        resolve();
      }
    };

    proc.stderr!.on('data', onData);
  });
}

// ─── Testes ───────────────────────────────────────────────────────────────────

describe('MCP server – tools/list', () => {
  let proc: ChildProcess;
  let stderr = '';

  after(() => {
    if (proc && !proc.killed) {
      proc.kill('SIGTERM');
    }
  });

  it('deve listar exatamente as 3 tools registradas', async () => {
    // Spawna o server MCP
    proc = spawn(
      process.execPath,
      ['--env-file=.env', '--import', 'tsx', 'src/mcp/server.ts'],
      {
        cwd: ROOT,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env },
      }
    );

    // Coleta stderr para diagnóstico
    proc.stderr!.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    // Detecta crash imediato
    proc.on('exit', (code) => {
      if (code !== null && code !== 0) {
        console.error(`[test] server encerrou com código ${code}\nstderr: ${stderr}`);
      }
    });

    // Aguarda o server emitir o log de ready no stderr
    await waitForStderr(proc, 'opspilot MCP server: pronto');

    // 1. Envia initialize
    const initResponse = await sendRpc(proc, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '0.1.0' },
      },
    }, 1);

    assert.equal(initResponse['jsonrpc'], '2.0');
    assert.equal(initResponse['id'], 1);
    assert.ok(initResponse['result'], `initialize falhou: ${JSON.stringify(initResponse)}\nstderr: ${stderr}`);

    // Envia initialized notification (obrigatória antes de tools/list)
    proc.stdin!.write(JSON.stringify({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
      params: {},
    }) + '\n');

    // Pequena pausa para o server processar a notification
    await new Promise((r) => setTimeout(r, 100));

    // 2. Envia tools/list
    const listResponse = await sendRpc(proc, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {},
    }, 2);

    assert.equal(listResponse['jsonrpc'], '2.0');
    assert.equal(listResponse['id'], 2);

    const result = listResponse['result'] as { tools: Array<{ name: string }> };
    assert.ok(result, `tools/list falhou: ${JSON.stringify(listResponse)}\nstderr: ${stderr}`);
    assert.ok(Array.isArray(result.tools), `tools não é um array: ${JSON.stringify(result)}`);

    const toolNames = result.tools.map((t) => t.name).sort();
    assert.deepEqual(
      toolNames,
      ['list_alerts', 'open_incident', 'resolve_incident'],
      `Tools inesperadas: ${JSON.stringify(toolNames)}`
    );
  });
});
