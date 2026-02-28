const STORAGE_KEYS = {
  apiBaseUrl: 'jarviApiBaseUrl',
  loginUrl: 'jarviLoginUrl',
  jwtToken: 'jarviJwtToken',
};

const DEFAULT_CONFIG = {
  [STORAGE_KEYS.apiBaseUrl]: 'http://localhost:3001',
  [STORAGE_KEYS.loginUrl]: 'https://jarvi.life/login',
  [STORAGE_KEYS.jwtToken]: '',
};

function storageGet(query) {
  return new Promise((resolve) => {
    chrome.storage.local.get(query, resolve);
  });
}

function storageSet(values) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(values, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve();
    });
  });
}

function asTrimmedString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeApiBaseUrl(url) {
  const value = asTrimmedString(url).replace(/\/+$/, '');
  return value || DEFAULT_CONFIG[STORAGE_KEYS.apiBaseUrl];
}

function normalizeLoginUrl(url) {
  const value = asTrimmedString(url);
  return value || DEFAULT_CONFIG[STORAGE_KEYS.loginUrl];
}

async function getConfig() {
  const stored = await storageGet(DEFAULT_CONFIG);
  return {
    apiBaseUrl: normalizeApiBaseUrl(stored[STORAGE_KEYS.apiBaseUrl]),
    loginUrl: normalizeLoginUrl(stored[STORAGE_KEYS.loginUrl]),
    jwtToken: asTrimmedString(stored[STORAGE_KEYS.jwtToken]),
  };
}

function openLoginTab(loginUrl) {
  chrome.tabs.create({ url: loginUrl });
}

async function testAuth() {
  const config = await getConfig();
  if (!config.jwtToken) {
    return {
      ok: false,
      errorCode: 'NOT_AUTHENTICATED',
      message: 'Token JWT nao configurado.',
    };
  }

  try {
    const response = await fetch(`${config.apiBaseUrl}/api/auth/profile`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${config.jwtToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      return {
        ok: false,
        errorCode: 'AUTH_FAILED',
        message: `Falha na autenticacao (HTTP ${response.status}).`,
      };
    }

    const user = await response.json();
    return { ok: true, user };
  } catch (error) {
    return {
      ok: false,
      errorCode: 'NETWORK_ERROR',
      message: 'Nao foi possivel validar autenticacao.',
    };
  }
}

async function createPendingTaskFromGmail(payload) {
  const config = await getConfig();
  if (!config.jwtToken) {
    openLoginTab(config.loginUrl);
    return {
      ok: false,
      errorCode: 'NOT_AUTHENTICATED',
      message: 'JWT nao configurado. Faca login no Jarvi e configure o token no popup.',
    };
  }

  const requestBody = {
    subject: asTrimmedString(payload.subject),
    sender: asTrimmedString(payload.sender),
    date: asTrimmedString(payload.date),
    body: asTrimmedString(payload.body),
    source: 'gmail',
    gmailMessageId: asTrimmedString(payload.gmailMessageId) || null,
    gmailThreadId: asTrimmedString(payload.gmailThreadId) || null,
  };

  let response;
  try {
    response = await fetch(`${config.apiBaseUrl}/api/gmail/ingest`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.jwtToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });
  } catch (error) {
    return {
      ok: false,
      errorCode: 'NETWORK_ERROR',
      message: 'Erro de rede ao enviar email para o Jarvi.',
    };
  }

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (_) {
    data = null;
  }

  if (response.status === 401 || response.status === 403) {
    await storageSet({ [STORAGE_KEYS.jwtToken]: '' });
    openLoginTab(config.loginUrl);
    return {
      ok: false,
      errorCode: 'NOT_AUTHENTICATED',
      message: 'Token invalido ou expirado. Faca login novamente.',
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      errorCode: 'API_ERROR',
      message: (data && data.error) || `Falha ao processar email (HTTP ${response.status}).`,
    };
  }

  if (data && data.is_task === false) {
    return {
      ok: true,
      is_task: false,
      message: data.message || 'Este email nao parece uma tarefa acionavel.',
    };
  }

  return {
    ok: true,
    is_task: true,
    pendingTask: data ? data.pendingTask : null,
    duplicate: Boolean(data && data.duplicate),
    message: data && data.message ? data.message : 'Sugestao criada com sucesso.',
  };
}

chrome.runtime.onInstalled.addListener(async () => {
  try {
    const existing = await storageGet(DEFAULT_CONFIG);
    await storageSet({
      [STORAGE_KEYS.apiBaseUrl]: normalizeApiBaseUrl(existing[STORAGE_KEYS.apiBaseUrl]),
      [STORAGE_KEYS.loginUrl]: normalizeLoginUrl(existing[STORAGE_KEYS.loginUrl]),
      [STORAGE_KEYS.jwtToken]: asTrimmedString(existing[STORAGE_KEYS.jwtToken]),
    });
  } catch (error) {
    console.error('Failed to initialize extension config:', error);
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    if (!message || typeof message.type !== 'string') {
      return {
        ok: false,
        errorCode: 'BAD_REQUEST',
        message: 'Mensagem invalida.',
      };
    }

    switch (message.type) {
      case 'CREATE_JARVI_PENDING_TASK_FROM_GMAIL':
        return createPendingTaskFromGmail(message.payload || {});

      case 'GET_EXTENSION_STATE': {
        const config = await getConfig();
        return {
          ok: true,
          config: {
            apiBaseUrl: config.apiBaseUrl,
            loginUrl: config.loginUrl,
            hasToken: Boolean(config.jwtToken),
            jwtToken: message.includeToken ? config.jwtToken : undefined,
          },
        };
      }

      case 'SAVE_EXTENSION_SETTINGS': {
        const payload = message.payload || {};
        const updates = {};

        if (typeof payload.apiBaseUrl === 'string') {
          updates[STORAGE_KEYS.apiBaseUrl] = normalizeApiBaseUrl(payload.apiBaseUrl);
        }
        if (typeof payload.loginUrl === 'string') {
          updates[STORAGE_KEYS.loginUrl] = normalizeLoginUrl(payload.loginUrl);
        }
        if (typeof payload.jwtToken === 'string') {
          updates[STORAGE_KEYS.jwtToken] = payload.jwtToken.trim();
        }

        if (Object.keys(updates).length > 0) {
          await storageSet(updates);
        }

        const config = await getConfig();
        return {
          ok: true,
          config: {
            apiBaseUrl: config.apiBaseUrl,
            loginUrl: config.loginUrl,
            hasToken: Boolean(config.jwtToken),
            jwtToken: config.jwtToken,
          },
        };
      }

      case 'CLEAR_EXTENSION_TOKEN':
        await storageSet({ [STORAGE_KEYS.jwtToken]: '' });
        return { ok: true };

      case 'OPEN_LOGIN_PAGE': {
        const config = await getConfig();
        openLoginTab(config.loginUrl);
        return { ok: true };
      }

      case 'TEST_JARVI_AUTH':
        return testAuth();

      default:
        return {
          ok: false,
          errorCode: 'UNKNOWN_MESSAGE',
          message: `Tipo de mensagem nao suportado: ${message.type}`,
        };
    }
  })()
    .then(sendResponse)
    .catch((error) => {
      sendResponse({
        ok: false,
        errorCode: 'INTERNAL_ERROR',
        message: error && error.message ? error.message : 'Erro interno inesperado.',
      });
    });

  return true;
});
