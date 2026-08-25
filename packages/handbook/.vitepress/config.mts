import { copyFileSync, mkdirSync, watch } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitepress';

const handbookDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(handbookDir, '../..');
const docsDir = join(repoRoot, 'docs');
const generatedComplianceDir = join(docsDir, 'handbook-compliance');

const complianceSources = {
  web: join(repoRoot, 'packages/web/compliance.md'),
  marketing: join(repoRoot, 'packages/marketing/compliance.md'),
  mobile: join(repoRoot, 'packages/mobile/compliance.md'),
} as const;

function syncCompliancePages() {
  mkdirSync(generatedComplianceDir, { recursive: true });
  for (const [name, from] of Object.entries(complianceSources)) {
    copyFileSync(from, join(generatedComplianceDir, `${name}.md`));
  }
}

syncCompliancePages();

if (process.env.NODE_ENV !== 'production') {
  for (const from of Object.values(complianceSources)) {
    watch(from, () => syncCompliancePages());
  }
}

export default defineConfig({
  lang: 'pt-BR',
  title: 'Jarvi — Handbook',
  description: 'Handbook interno da Jarvi. Fonte da verdade: Markdown no Git.',
  srcDir: '../../docs',
  srcExclude: ['**/node_modules/**'],
  cleanUrls: true,
  // Repo-relative links in Markdown stay valid on GitHub
  ignoreDeadLinks: true,
  rewrites: {
    'README.md': 'index.md',
    'product/README.md': 'product/index.md',
    'decisions/README.md': 'decisions/index.md',
    'brand/README.md': 'brand/index.md',
    'handbook-compliance/web.md': 'compliance/web.md',
    'handbook-compliance/marketing.md': 'compliance/marketing.md',
    'handbook-compliance/mobile.md': 'compliance/mobile.md',
  },
  themeConfig: {
    search: {
      provider: 'local',
    },
    sidebar: [
      {
        text: 'Handbook',
        items: [
          { text: 'Mapa da documentação', link: '/' },
          { text: 'Produto', link: '/product/' },
          { text: 'Decisões', link: '/decisions/' },
          { text: '0001 — Um overlay por vez', link: '/decisions/0001-one-overlay' },
          { text: 'Marca e voz', link: '/brand/' },
        ],
      },
      {
        text: 'Contratos de UI',
        items: [
          { text: 'Web', link: '/compliance/web' },
          { text: 'Marketing', link: '/compliance/marketing' },
          { text: 'Mobile', link: '/compliance/mobile' },
        ],
      },
      {
        text: 'Ops / engenharia',
        items: [
          { text: 'Arquitetura', link: '/ARCHITECTURE' },
          { text: 'Plano de produção', link: '/PRODUCTION_PLAN' },
          { text: 'Setup de computador', link: '/SETUP_NOVO_COMPUTADOR' },
          { text: 'Stripe', link: '/STRIPE_SETUP' },
          { text: 'WhatsApp (tarefas)', link: '/WHATSAPP_TASKS' },
          { text: 'WhatsApp (produção)', link: '/WHATSAPP_PRODUCTION_RUNBOOK' },
          { text: 'Lembretes de voz', link: '/VOICE_REMINDERS_RUNBOOK' },
        ],
      },
    ],
  },
});
