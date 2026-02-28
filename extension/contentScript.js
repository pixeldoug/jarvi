(function () {
  const BUTTON_CLASS = 'jarvi-add-button';
  const BUTTON_WRAPPER_CLASS = 'jarvi-add-wrapper';
  const TOAST_ID = 'jarvi-floating-toast';
  const MAIN_SELECTOR = 'div[role="main"]';

  let observer = null;
  let isSubmitting = false;

  function debounce(fn, waitMs) {
    let timeoutId = null;
    return function (...args) {
      window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(function () {
        fn.apply(null, args);
      }, waitMs);
    };
  }

  function sendRuntimeMessage(message) {
    return new Promise(function (resolve, reject) {
      chrome.runtime.sendMessage(message, function (response) {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(response);
      });
    });
  }

  function isVisible(element) {
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function getSubjectElement() {
    return (
      document.querySelector(MAIN_SELECTOR + ' h2[data-thread-perm-id]') ||
      document.querySelector(MAIN_SELECTOR + ' h2.hP') ||
      document.querySelector(MAIN_SELECTOR + ' h2[tabindex="-1"]')
    );
  }

  function getCurrentMessageRoot() {
    const candidates = Array.from(
      document.querySelectorAll(MAIN_SELECTOR + ' div[role="listitem"]')
    ).filter(isVisible);

    for (const item of candidates) {
      if (item.querySelector('span[email]')) {
        return item;
      }
    }

    return candidates.length > 0 ? candidates[0] : null;
  }

  function getBodyNode(messageRoot) {
    if (!messageRoot) return null;

    const canonicalBody = messageRoot.querySelector('div.a3s');
    if (canonicalBody) return canonicalBody;

    const candidates = Array.from(messageRoot.querySelectorAll('div[dir]'))
      .map(function (node) {
        return {
          node: node,
          textLength: (node.innerText || '').trim().length,
        };
      })
      .filter(function (entry) {
        return entry.textLength > 30;
      })
      .sort(function (a, b) {
        return b.textLength - a.textLength;
      });

    return candidates.length > 0 ? candidates[0].node : null;
  }

  function extractSender(messageRoot) {
    if (!messageRoot) return 'Remetente nao identificado';

    const senderEl =
      messageRoot.querySelector('span[email][name]') || messageRoot.querySelector('span[email]');
    if (!senderEl) return 'Remetente nao identificado';

    const senderName = (senderEl.getAttribute('name') || senderEl.textContent || '').trim();
    const senderEmail = (senderEl.getAttribute('email') || '').trim();

    if (senderName && senderEmail && senderName !== senderEmail) {
      return senderName + ' <' + senderEmail + '>';
    }
    return senderEmail || senderName || 'Remetente nao identificado';
  }

  function extractDate(messageRoot) {
    if (!messageRoot) return new Date().toISOString();

    const dateEl = Array.from(messageRoot.querySelectorAll('span[title]')).find(function (el) {
      return !el.hasAttribute('email') && (el.getAttribute('title') || '').trim().length > 0;
    });

    if (!dateEl) return new Date().toISOString();
    return (
      (dateEl.getAttribute('title') || '').trim() ||
      (dateEl.textContent || '').trim() ||
      new Date().toISOString()
    );
  }

  function extractCleanBodyText(messageRoot) {
    const bodyNode = getBodyNode(messageRoot);
    if (!bodyNode) return '';

    const clone = bodyNode.cloneNode(true);
    const removeSelectors = ['blockquote', '.gmail_quote', '.gmail_signature', 'style', 'script'];

    removeSelectors.forEach(function (selector) {
      clone.querySelectorAll(selector).forEach(function (node) {
        node.remove();
      });
    });

    const rawText = (clone.innerText || clone.textContent || '')
      .replace(/\u00A0/g, ' ')
      .replace(/\r/g, '');

    const lines = rawText.split('\n').map(function (line) {
      return line.trim();
    });
    const compact = [];

    for (const line of lines) {
      if (line || compact[compact.length - 1] !== '') {
        compact.push(line);
      }
    }

    return compact.join('\n').trim();
  }

  function extractMessageId(messageRoot) {
    if (!messageRoot) return '';

    const direct = messageRoot.getAttribute('data-legacy-message-id');
    if (direct) return direct.trim();

    const descendant = messageRoot.querySelector('[data-legacy-message-id]');
    if (!descendant) return '';

    return (descendant.getAttribute('data-legacy-message-id') || '').trim();
  }

  function extractThreadId() {
    const subjectEl = getSubjectElement();
    if (subjectEl) {
      const attr = subjectEl.getAttribute('data-thread-perm-id');
      if (attr && attr.trim()) return attr.trim();
    }

    const hash = window.location.hash || '';
    return hash ? hash.replace(/^#/, '') : '';
  }

  function createOrGetToast() {
    let toast = document.getElementById(TOAST_ID);
    if (!toast) {
      toast = document.createElement('div');
      toast.id = TOAST_ID;
      document.body.appendChild(toast);
    }
    return toast;
  }

  function showToast(message, kind) {
    const toast = createOrGetToast();
    toast.className = 'jarvi-toast jarvi-toast--' + kind;
    toast.textContent = message;

    if (kind !== 'loading') {
      window.setTimeout(function () {
        const current = document.getElementById(TOAST_ID);
        if (current && current.parentElement) {
          current.parentElement.removeChild(current);
        }
      }, 2800);
    }
  }

  async function handleAddClick(event) {
    const button = event.currentTarget;
    if (!(button instanceof HTMLButtonElement)) return;
    if (isSubmitting) return;

    isSubmitting = true;
    const originalLabel = button.textContent || 'Add to Jarvi';
    button.disabled = true;
    button.textContent = 'Adding...';
    showToast('Creating task...', 'loading');

    try {
      const subject = (getSubjectElement()?.textContent || '').trim() || '(Sem assunto)';
      const messageRoot = getCurrentMessageRoot();
      const payload = {
        subject: subject,
        sender: extractSender(messageRoot),
        date: extractDate(messageRoot),
        body: extractCleanBodyText(messageRoot),
        source: 'gmail',
        gmailMessageId: extractMessageId(messageRoot),
        gmailThreadId: extractThreadId(),
      };

      const result = await sendRuntimeMessage({
        type: 'CREATE_JARVI_PENDING_TASK_FROM_GMAIL',
        payload: payload,
      });

      if (result && result.ok && result.is_task === false) {
        showToast(result.message || 'Email sem tarefa acionavel.', 'error');
      } else if (result && result.ok) {
        if (result.duplicate) {
          showToast('Esse email ja foi processado.', 'success');
        } else {
          showToast('Sugestao criada com sucesso.', 'success');
        }
      } else if (result && result.errorCode === 'NOT_AUTHENTICATED') {
        showToast('Nao autenticado. Abrindo login...', 'error');
      } else {
        showToast((result && result.message) || 'Falha ao criar sugestao.', 'error');
      }
    } catch (error) {
      showToast(error && error.message ? error.message : 'Erro inesperado.', 'error');
    } finally {
      isSubmitting = false;
      button.disabled = false;
      button.textContent = originalLabel;
    }
  }

  function injectButtonIfNeeded() {
    const subjectEl = getSubjectElement();
    if (!subjectEl) return;

    const host = subjectEl.parentElement;
    if (!host) return;
    if (host.querySelector('.' + BUTTON_CLASS)) return;

    const wrapper = document.createElement('span');
    wrapper.className = BUTTON_WRAPPER_CLASS;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = BUTTON_CLASS;
    button.textContent = 'Add to Jarvi';
    button.addEventListener('click', handleAddClick);

    wrapper.appendChild(button);
    host.appendChild(wrapper);
  }

  const scheduleInjection = debounce(injectButtonIfNeeded, 120);

  function startObserver() {
    if (observer) observer.disconnect();

    observer = new MutationObserver(function () {
      scheduleInjection();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  function init() {
    startObserver();
    window.addEventListener('hashchange', scheduleInjection);
    window.addEventListener('popstate', scheduleInjection);
    scheduleInjection();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
