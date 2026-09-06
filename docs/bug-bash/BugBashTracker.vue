<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { BUG_BASH_CRIAR_CONTA } from './items';

type Status = '' | 'passed' | 'partially passed' | 'failed';

interface StoredItem {
  status: Status;
  comment: string;
}

const props = defineProps<{
  id: string;
}>();

const STORAGE_PREFIX = 'jarvi-bug-bash:';
const STATUSES: Status[] = ['', 'passed', 'partially passed', 'failed'];
const sections = BUG_BASH_CRIAR_CONTA;
const state = ref<Record<string, StoredItem>>({});
const copied = ref(false);
let copyTimer = 0;

const storageKey = computed(() => `${STORAGE_PREFIX}${props.id}`);
const allItems = computed(() => sections.flatMap((section) => section.items));

const counts = computed(() => {
  let passed = 0;
  let partial = 0;
  let failed = 0;
  let open = 0;
  for (const item of allItems.value) {
    const status = state.value[item.id]?.status ?? '';
    if (status === 'passed') passed += 1;
    else if (status === 'partially passed') partial += 1;
    else if (status === 'failed') failed += 1;
    else open += 1;
  }
  return { total: allItems.value.length, passed, partial, failed, open };
});

function loadState(): Record<string, StoredItem> {
  try {
    const raw = localStorage.getItem(storageKey.value);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as { items?: Record<string, StoredItem> };
    return parsed.items && typeof parsed.items === 'object' ? parsed.items : {};
  } catch {
    return {};
  }
}

function persist() {
  try {
    localStorage.setItem(storageKey.value, JSON.stringify({ v: 1, items: state.value }));
  } catch {
    // ignore quota / private mode
  }
}

function getStatus(id: string): Status {
  return state.value[id]?.status ?? '';
}

function getComment(id: string): string {
  return state.value[id]?.comment ?? '';
}

function needsComment(id: string): boolean {
  const status = getStatus(id);
  return status === 'failed' || status === 'partially passed';
}

function setStatus(id: string, status: Status) {
  const current = state.value[id] ?? { status: '', comment: '' };
  state.value = { ...state.value, [id]: { ...current, status } };
  persist();
}

function setComment(id: string, comment: string) {
  const current = state.value[id] ?? { status: '', comment: '' };
  state.value = { ...state.value, [id]: { ...current, comment } };
  persist();
}

function resetProgress() {
  if (!window.confirm('Limpar status e comentários deste bug bash neste navegador?')) return;
  state.value = {};
  persist();
}

async function copyReport() {
  const lines = allItems.value
    .filter((item) => {
      const status = getStatus(item.id);
      return status === 'failed' || status === 'partially passed';
    })
    .map((item) => {
      const status = getStatus(item.id);
      const comment = getComment(item.id).trim();
      return [`- [${status}] ${item.text}`, comment ? `  ${comment}` : null].filter(Boolean).join('\n');
    });

  const header = `Bug bash criar conta — ${counts.value.failed} failed, ${counts.value.partial} partially passed, ${counts.value.passed} passed`;
  const body = lines.length ? `${header}\n\n${lines.join('\n')}` : `${header}\n\nNenhum item failed / partially passed.`;

  try {
    await navigator.clipboard.writeText(body);
    copied.value = true;
    window.clearTimeout(copyTimer);
    copyTimer = window.setTimeout(() => {
      copied.value = false;
    }, 2000);
  } catch {
    window.prompt('Copie o report:', body);
  }
}

onMounted(() => {
  state.value = loadState();
});
</script>

<template>
  <div class="bug-bash">
    <div class="bug-bash-toolbar" role="region" aria-label="Progresso do bug bash">
      <p class="bug-bash-summary">
        <strong>{{ counts.passed + counts.partial + counts.failed }}/{{ counts.total }}</strong>
        <span class="ok">{{ counts.passed }} passed</span>
        <span class="mid">{{ counts.partial }} partially passed</span>
        <span class="bad">{{ counts.failed }} failed</span>
        <span class="open">{{ counts.open }} open</span>
      </p>
      <div class="bug-bash-actions">
        <button type="button" class="bug-bash-btn" @click="copyReport">
          {{ copied ? 'Copiado' : 'Copiar failed / partial' }}
        </button>
        <button type="button" class="bug-bash-btn" @click="resetProgress">Limpar</button>
      </div>
      <p class="bug-bash-hint">
        Status e comentários ficam neste navegador. Não é compartilhado com outras pessoas.
      </p>
    </div>

    <section v-for="section in sections" :key="section.id" class="bug-bash-section">
      <h3>{{ section.title }}</h3>
      <p v-if="section.note" class="bug-bash-note">{{ section.note }}</p>
      <ul>
        <li v-for="item in section.items" :key="item.id" :data-status="getStatus(item.id) || 'open'">
          <div class="bug-bash-row">
            <label class="bug-bash-status">
              <span class="visually-hidden">Status: {{ item.text }}</span>
              <select
                :value="getStatus(item.id)"
                @change="setStatus(item.id, ($event.target as HTMLSelectElement).value as Status)"
              >
                <option v-for="status in STATUSES" :key="status || 'open'" :value="status">
                  {{ status || '—' }}
                </option>
              </select>
            </label>
            <span class="bug-bash-text">{{ item.text }}</span>
          </div>
          <textarea
            v-if="needsComment(item.id)"
            class="bug-bash-comment"
            :value="getComment(item.id)"
            rows="2"
            placeholder="O que quebrou? Device, passos, esperado vs atual."
            @input="setComment(item.id, ($event.target as HTMLTextAreaElement).value)"
          />
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.bug-bash-toolbar {
  margin: 1.25rem 0 1.75rem;
  padding: 0.9rem 1rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  background: var(--vp-c-bg-soft);
}

.bug-bash-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem 0.9rem;
  margin: 0 0 0.65rem;
  font-size: 0.92rem;
}

.bug-bash-summary .ok { color: var(--vp-c-success-1, #348046); }
.bug-bash-summary .mid { color: var(--vp-c-warning-1, #a56c00); }
.bug-bash-summary .bad { color: var(--vp-c-danger-1, #b54444); }
.bug-bash-summary .open { color: var(--vp-c-text-2); }

.bug-bash-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.bug-bash-btn {
  border: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  border-radius: 8px;
  padding: 0.28rem 0.7rem;
  font-size: 0.85rem;
  cursor: pointer;
}

.bug-bash-btn:hover {
  border-color: var(--vp-c-brand-1);
}

.bug-bash-hint,
.bug-bash-note {
  margin: 0.65rem 0 0;
  font-size: 0.9rem;
  color: var(--vp-c-text-2);
}

.bug-bash-section {
  margin-top: 1.75rem;
}

.bug-bash-section h3 {
  margin: 0 0 0.6rem;
  font-size: 1.15rem;
  font-weight: 650;
}

.bug-bash-section ul {
  list-style: none;
  padding: 0;
  margin: 0.75rem 0 0;
}

.bug-bash-section li {
  padding: 0.55rem 0;
  border-bottom: 1px solid var(--vp-c-divider);
}

.bug-bash-row {
  display: grid;
  grid-template-columns: 11.6rem 1fr;
  gap: 0.65rem;
  align-items: start;
}

.bug-bash-text {
  min-width: 0;
  line-height: 1.45;
}

.bug-bash-status select {
  width: 100%;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  padding: 0.22rem 0.45rem;
  font-size: 0.85rem;
}

li[data-status='passed'] select { border-color: var(--vp-c-success-1, #348046); }
li[data-status='partially passed'] select { border-color: var(--vp-c-warning-1, #a56c00); }
li[data-status='failed'] select { border-color: var(--vp-c-danger-1, #b54444); }

.bug-bash-comment {
  display: block;
  width: 100%;
  margin-top: 0.45rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  padding: 0.45rem 0.55rem;
  font: inherit;
  font-size: 0.85rem;
  resize: vertical;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@media (max-width: 640px) {
  .bug-bash-row {
    grid-template-columns: 1fr;
  }
}
</style>
