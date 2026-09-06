/**
 * Web search for the agent. Uses OpenAI Responses + the built-in `web_search`
 * tool so we only need OPENAI_API_KEY. Returns a short factual summary and
 * source URLs the chat model must treat as the only allowed facts.
 */

import OpenAI from 'openai';

const SEARCH_TIMEOUT_MS = 12_000;
const SEARCH_MODEL = process.env.WEB_SEARCH_MODEL || 'gpt-4o-mini';
const MAX_SUMMARY_CHARS = 1800;
const MAX_SOURCES = 6;

export interface WebSearchSource {
  url: string;
  title?: string;
}

export interface WebSearchResult {
  query: string;
  summary: string;
  sources: WebSearchSource[];
}

let openaiClient: OpenAI | null = null;
const getOpenAIClient = (): OpenAI => {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY environment variable is required');
  }
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 0 });
  }
  return openaiClient;
};

const extractUrls = (text: string): string[] => {
  const matches = text.match(/https?:\/\/[^\s)>\]]+/g) ?? [];
  return matches.map((url) => url.replace(/[.,;:]+$/, ''));
};

const uniqueSources = (urls: string[]): WebSearchSource[] => {
  const seen = new Set<string>();
  const sources: WebSearchSource[] = [];
  for (const url of urls) {
    if (!url.startsWith('http') || seen.has(url)) continue;
    seen.add(url);
    sources.push({ url });
    if (sources.length >= MAX_SOURCES) break;
  }
  return sources;
};

export async function searchWeb(
  query: string,
  options?: { timezone?: string },
): Promise<WebSearchResult> {
  const trimmed = query.trim().slice(0, 300);
  if (!trimmed) {
    throw new Error('query é obrigatório');
  }

  const openai = getOpenAIClient();
  const timezone = options?.timezone?.trim() || 'America/Sao_Paulo';

  const response = await openai.responses.create(
    {
      model: SEARCH_MODEL,
      store: false,
      tools: [
        {
          type: 'web_search',
          search_context_size: 'low',
          user_location: {
            type: 'approximate',
            country: 'BR',
            timezone,
          },
        },
      ],
      include: ['web_search_call.action.sources'],
      input: [
        'Pesquise na web (Brasil) e extraia SOMENTE fatos verificáveis para ajudar a organizar uma tarefa.',
        'Inclua nomes, telefones, endereços, prazos oficiais, horários e URLs das fontes.',
        'Se não encontrar, diga explicitamente o que faltou. Não invente.',
        `Consulta: ${trimmed}`,
      ].join('\n'),
    },
    { timeout: SEARCH_TIMEOUT_MS },
  );

  const summary = (response.output_text || '').trim().slice(0, MAX_SUMMARY_CHARS);
  const urlsFromOutput: string[] = [];

  for (const item of response.output ?? []) {
    if (item.type === 'web_search_call' && item.action?.type === 'search') {
      for (const source of item.action.sources ?? []) {
        if (source.type === 'url' && source.url) urlsFromOutput.push(source.url);
      }
    }
    if (item.type === 'message') {
      for (const part of item.content ?? []) {
        if (part.type !== 'output_text') continue;
        for (const annotation of part.annotations ?? []) {
          if ('url' in annotation && typeof annotation.url === 'string') {
            urlsFromOutput.push(annotation.url);
          }
        }
      }
    }
  }

  const sources = uniqueSources([...urlsFromOutput, ...extractUrls(summary)]);

  if (!summary && sources.length === 0) {
    throw new Error('A busca não retornou resultados.');
  }

  return {
    query: trimmed,
    summary: summary || 'A busca encontrou fontes, mas nenhum resumo utilizável.',
    sources,
  };
}
