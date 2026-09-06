declare module '@posthog/ai/openai' {
  import OpenAI from 'openai';
  import type { PostHog } from 'posthog-node';

  export class PostHogOpenAI extends OpenAI {
    constructor(
      options: ConstructorParameters<typeof OpenAI>[0] & {
        posthog?: PostHog;
      },
    );
  }
}
