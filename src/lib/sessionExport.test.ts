/**
 * Unit tests for the sessionExport utility module.
 *
 * We test the markdown generation logic by mocking navigator.clipboard.writeText
 * and inspecting the string that was written.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ClaudeStreamMessage } from '@/components/AgentExecution';

// Mock navigator.clipboard before importing the module
let writtenText = '';
Object.defineProperty(globalThis, 'navigator', {
  value: {
    clipboard: {
      writeText: vi.fn(async (text: string) => {
        writtenText = text;
      }),
    },
  },
  writable: true,
  configurable: true,
});

// Now import -- the module uses navigator.clipboard at call time, not import time
import { copySessionAsMarkdown } from './sessionExport';

beforeEach(() => {
  writtenText = '';
  vi.clearAllMocks();
});

describe('copySessionAsMarkdown', () => {
  it('produces a header with project path and date', async () => {
    await copySessionAsMarkdown('/my/project', []);
    expect(writtenText).toContain('# Claude Code Session');
    expect(writtenText).toContain('**Project:** /my/project');
    expect(writtenText).toContain('**Date:**');
  });

  it('handles empty messages array', async () => {
    await copySessionAsMarkdown('/p', []);
    // Should still have the header but nothing else
    expect(writtenText).toContain('# Claude Code Session');
    expect(writtenText).toContain('---');
  });

  it('formats a system init message', async () => {
    const messages: ClaudeStreamMessage[] = [
      {
        type: 'system',
        subtype: 'init',
        session_id: 'sess-123',
        model: 'sonnet',
        cwd: '/home/test',
        tools: ['Read', 'Write'],
      } as ClaudeStreamMessage,
    ];
    await copySessionAsMarkdown('/p', messages);
    expect(writtenText).toContain('## System Initialization');
    expect(writtenText).toContain('sess-123');
    expect(writtenText).toContain('sonnet');
    expect(writtenText).toContain('/home/test');
    expect(writtenText).toContain('Read, Write');
  });

  it('formats an assistant message with text content', async () => {
    const messages: ClaudeStreamMessage[] = [
      {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'Hello world' }],
          usage: { input_tokens: 10, output_tokens: 20 },
        },
      } as ClaudeStreamMessage,
    ];
    await copySessionAsMarkdown('/p', messages);
    expect(writtenText).toContain('## Assistant');
    expect(writtenText).toContain('Hello world');
    expect(writtenText).toContain('*Tokens: 10 in, 20 out*');
  });

  it('formats an assistant message with tool_use content', async () => {
    const messages: ClaudeStreamMessage[] = [
      {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            { type: 'tool_use', name: 'Read', input: { path: '/foo' } },
          ],
        },
      } as ClaudeStreamMessage,
    ];
    await copySessionAsMarkdown('/p', messages);
    expect(writtenText).toContain('### Tool: Read');
    expect(writtenText).toContain('"path": "/foo"');
  });

  it('formats a user message with text content', async () => {
    const messages: ClaudeStreamMessage[] = [
      {
        type: 'user',
        message: {
          role: 'user',
          content: [{ type: 'text', text: 'Fix the bug' }],
        },
      } as ClaudeStreamMessage,
    ];
    await copySessionAsMarkdown('/p', messages);
    expect(writtenText).toContain('## User');
    expect(writtenText).toContain('Fix the bug');
  });

  it('formats a user message with tool_result content (string)', async () => {
    const messages: ClaudeStreamMessage[] = [
      {
        type: 'user',
        message: {
          role: 'user',
          content: [
            { type: 'tool_result', tool_use_id: 't1', content: 'file contents here' },
          ],
        },
      } as ClaudeStreamMessage,
    ];
    await copySessionAsMarkdown('/p', messages);
    expect(writtenText).toContain('### Tool Result');
    expect(writtenText).toContain('file contents here');
  });

  it('formats a user message with tool_result content (array)', async () => {
    const messages: ClaudeStreamMessage[] = [
      {
        type: 'user',
        message: {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 't2',
              content: [
                { type: 'text', text: 'line one' },
                { type: 'text', text: 'line two' },
              ],
            },
          ],
        },
      } as unknown as ClaudeStreamMessage,
    ];
    await copySessionAsMarkdown('/p', messages);
    expect(writtenText).toContain('line one');
    expect(writtenText).toContain('line two');
  });

  it('formats a result message', async () => {
    const messages: ClaudeStreamMessage[] = [
      {
        type: 'result',
        result: 'Task completed successfully',
      } as ClaudeStreamMessage,
    ];
    await copySessionAsMarkdown('/p', messages);
    expect(writtenText).toContain('## Execution Result');
    expect(writtenText).toContain('Task completed successfully');
  });

  it('formats a result message with error', async () => {
    const messages: ClaudeStreamMessage[] = [
      {
        type: 'result',
        error: 'Something went wrong',
      } as ClaudeStreamMessage,
    ];
    await copySessionAsMarkdown('/p', messages);
    expect(writtenText).toContain('**Error:** Something went wrong');
  });

  it('writes output to the clipboard', async () => {
    await copySessionAsMarkdown('/p', []);
    expect(navigator.clipboard.writeText).toHaveBeenCalledOnce();
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.any(String));
  });
});
