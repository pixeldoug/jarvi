import { pendingQuestionOf, resolveChoiceArtifact } from './choices';
import { createStreamParser, type ChatStreamEvent } from './sse';
import { splitTaskRefs, stripTaskRefs } from './task-refs';
import type { ChatMessageData } from './types';

describe('createStreamParser', () => {
  it('parses data lines split across chunks', () => {
    const events: ChatStreamEvent[] = [];
    const parser = createStreamParser((event) => events.push(event));
    parser.push('data: {"type":"text","con');
    parser.push('tent":"Olá"}\n\n: keep-alive\ndata: not-json\n');
    parser.push('data: {"type":"done"}');
    parser.end();
    expect(events).toEqual([{ type: 'text', content: 'Olá' }, { type: 'done' }]);
  });
});

describe('task refs', () => {
  it('splits mentions out of assistant text', () => {
    expect(splitTaskRefs('Criei {{task:abc|Marcar dentista}}.')).toEqual([
      { type: 'text', text: 'Criei ' },
      { type: 'task', id: 'abc', title: 'Marcar dentista' },
      { type: 'text', text: '.' },
    ]);
    expect(stripTaskRefs('Criei {{task:abc| Marcar dentista }}.')).toBe('Criei "Marcar dentista".');
  });
});

function assistant(overrides: Partial<ChatMessageData>): ChatMessageData {
  return { id: 'm1', role: 'assistant', content: '', ...overrides };
}

describe('resolveChoiceArtifact', () => {
  it('prefers structured choices from the backend', () => {
    const artifact = resolveChoiceArtifact(
      assistant({
        content: 'Anotei.\n\nPara quando?',
        choicePromptTitle: 'Para quando?',
        choicePrompts: ['Hoje', 'Amanhã'],
        choiceField: 'due_date',
      }),
    );
    expect(artifact).toEqual({
      content: 'Anotei.',
      contentAfter: '',
      question: 'Para quando?',
      choices: ['Hoje', 'Amanhã'],
      field: 'due_date',
    });
  });

  it('uses a successful offer_choices tool call', () => {
    const artifact = resolveChoiceArtifact(
      assistant({
        content: 'Certo.',
        toolCalls: [
          {
            toolName: 'offer_choices',
            toolArgs: {},
            result: { success: true, data: { question: 'Qual?', choices: ['A', 'B', 'C'] } },
          },
        ],
      }),
    );
    expect(artifact.question).toBe('Qual?');
    expect(artifact.choices).toEqual(['A', 'B', 'C']);
  });

  it('falls back to a trailing question with bullets', () => {
    const artifact = resolveChoiceArtifact(
      assistant({ content: 'Tenho duas opções.\n\nQual você prefere?\n- **Manhã**\n- Tarde' }),
    );
    expect(artifact).toEqual({
      content: 'Tenho duas opções.',
      contentAfter: '',
      question: 'Qual você prefere?',
      choices: ['Manhã', 'Tarde'],
    });
  });

  it('ignores fact lists that are not questions', () => {
    const artifact = resolveChoiceArtifact(assistant({ content: 'Resumo:\n- Prazo: amanhã\n- Categoria: Casa' }));
    expect(artifact.choices).toEqual([]);
  });
});

describe('pendingQuestionOf', () => {
  it('echoes the open backend question', () => {
    expect(
      pendingQuestionOf([
        { id: 'u', role: 'user', content: 'oi' },
        assistant({ choiceTaskId: 't1', choiceField: 'time', choicePrompts: ['9h', '14h'] }),
      ]),
    ).toEqual({ taskId: 't1', field: 'time' });
    expect(pendingQuestionOf([assistant({ journeyNudge: { text: 'x', remaining: 2, resumeLabel: 'Continuar' } })])).toEqual(
      { field: 'journey' },
    );
    expect(pendingQuestionOf([{ id: 'u', role: 'user', content: 'oi' }])).toBeUndefined();
  });
});
