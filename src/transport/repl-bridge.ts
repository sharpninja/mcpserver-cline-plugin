import { spawn, ChildProcess } from 'child_process';
import { createInterface } from 'readline';
import * as yaml from 'js-yaml';

export interface ReplResponse {
  type: 'result' | 'error' | 'event';
  payload: Record<string, unknown>;
}

interface PendingRequest {
  resolve: (value: ReplResponse) => void;
  reject: (reason: Error) => void;
  events: ReplResponse[];
  onEvent?: (event: ReplResponse) => void;
}

/**
 * Persistent bridge to mcpserver-repl --agent-stdio.
 * Multiplexes concurrent YAML-over-STDIO requests by requestId.
 */
export class ReplBridge {
  private proc: ChildProcess | null = null;
  private pending = new Map<string, PendingRequest>();
  private buffer = '';
  private docBuffer = '';

  /** Generate a request ID matching ^req-\d{8}T\d{6}Z-[a-z0-9]+$ */
  static generateRequestId(slug = 'req'): string {
    const now = new Date();
    const ts =
      now.getUTCFullYear().toString() +
      (now.getUTCMonth() + 1).toString().padStart(2, '0') +
      now.getUTCDate().toString().padStart(2, '0') +
      'T' +
      now.getUTCHours().toString().padStart(2, '0') +
      now.getUTCMinutes().toString().padStart(2, '0') +
      now.getUTCSeconds().toString().padStart(2, '0') +
      'Z';
    const rand = Math.floor(Math.random() * 0xffff)
      .toString(16)
      .padStart(4, '0');
    return `req-${ts}-${slug}-${rand}`;
  }

  /** Ensure the REPL process is running, restarting if it crashed. */
  async ensure(): Promise<void> {
    if (this.proc && this.proc.exitCode === null && !this.proc.killed) {
      return;
    }
    this.proc = spawn('mcpserver-repl', ['--agent-stdio'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    this.proc.stderr?.on('data', (data: Buffer) => {
      process.stderr.write(`[repl] ${data}`);
    });

    const rl = createInterface({ input: this.proc.stdout! });
    rl.on('line', (line: string) => this.onLine(line));

    this.proc.on('exit', (code) => {
      process.stderr.write(`[repl] mcpserver-repl exited with code ${code}\n`);
      // Reject all pending requests
      for (const [, req] of this.pending) {
        req.reject(new Error(`mcpserver-repl exited with code ${code}`));
      }
      this.pending.clear();
      this.proc = null;
    });
  }

  private onLine(line: string): void {
    if (line === '---') {
      // YAML document separator — parse accumulated buffer
      if (this.docBuffer.trim()) {
        this.parseDocument(this.docBuffer);
      }
      this.docBuffer = '';
    } else {
      this.docBuffer += line + '\n';
    }
  }

  private parseDocument(raw: string): void {
    let doc: Record<string, unknown>;
    try {
      doc = yaml.load(raw) as Record<string, unknown>;
    } catch {
      process.stderr.write(`[repl] Failed to parse YAML: ${raw}\n`);
      return;
    }

    const type = doc.type as string;
    const payload = doc.payload as Record<string, unknown>;
    if (!payload) return;

    const requestId = payload.requestId as string | undefined;
    const response: ReplResponse = { type: type as ReplResponse['type'], payload };

    if (!requestId) {
      // Broadcast event with no specific request ID
      return;
    }

    const pending = this.pending.get(requestId);
    if (!pending) return;

    if (type === 'event') {
      pending.events.push(response);
      pending.onEvent?.(response);
    } else {
      // Final result or error
      this.pending.delete(requestId);
      pending.resolve(response);
    }
  }

  /**
   * Send a YAML envelope and await the matching result/error envelope.
   */
  async invoke(
    method: string,
    params?: Record<string, unknown>,
  ): Promise<ReplResponse> {
    await this.ensure();

    const requestId = ReplBridge.generateRequestId(
      method.split('.').pop() ?? 'req',
    );

    return new Promise<ReplResponse>((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject, events: [] });

      const envelope: Record<string, unknown> = {
        type: 'request',
        payload: {
          requestId,
          method,
          ...(params ? { params } : {}),
        },
      };

      const yamlStr = yaml.dump(envelope, { lineWidth: -1 });
      this.proc!.stdin!.write(yamlStr + '---\n');
    });
  }

  /**
   * Invoke a streaming method, calling onEvent for each progress event.
   */
  async invokeStreaming(
    method: string,
    params: Record<string, unknown>,
    onEvent: (event: ReplResponse) => void,
  ): Promise<ReplResponse> {
    await this.ensure();

    const requestId = ReplBridge.generateRequestId(
      method.split('.').pop() ?? 'stream',
    );

    return new Promise<ReplResponse>((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject, events: [], onEvent });

      const envelope: Record<string, unknown> = {
        type: 'request',
        payload: { requestId, method, params },
      };

      const yamlStr = yaml.dump(envelope, { lineWidth: -1 });
      this.proc!.stdin!.write(yamlStr + '---\n');
    });
  }

  /** Gracefully terminate the REPL process. */
  async close(): Promise<void> {
    if (this.proc) {
      this.proc.stdin?.end();
      await new Promise<void>((resolve) => {
        this.proc!.on('exit', () => resolve());
        setTimeout(resolve, 2000);
      });
      if (!this.proc?.killed) this.proc?.kill();
      this.proc = null;
    }
  }
}
