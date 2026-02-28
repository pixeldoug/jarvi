function sendMessage(message) {
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

const apiBaseUrlInput = document.getElementById('apiBaseUrl');
const loginUrlInput = document.getElementById('loginUrl');
const jwtTokenInput = document.getElementById('jwtToken');

const saveBtn = document.getElementById('saveBtn');
const testBtn = document.getElementById('testBtn');
const openLoginBtn = document.getElementById('openLoginBtn');
const clearBtn = document.getElementById('clearBtn');
const statusEl = document.getElementById('status');

function setStatus(message, kind) {
  statusEl.textContent = message;
  statusEl.className = 'jarvi-status jarvi-status--' + kind;
}

async function loadState() {
  try {
    const result = await sendMessage({
      type: 'GET_EXTENSION_STATE',
      includeToken: true,
    });

    if (!result || !result.ok) {
      setStatus('Falha ao carregar configuracoes.', 'error');
      return;
    }

    apiBaseUrlInput.value = result.config.apiBaseUrl || '';
    loginUrlInput.value = result.config.loginUrl || '';
    jwtTokenInput.value = result.config.jwtToken || '';

    if (result.config.hasToken) {
      setStatus('Token configurado.', 'success');
    } else {
      setStatus('Token ausente. Configure para usar o assistente.', 'info');
    }
  } catch (error) {
    setStatus('Erro ao carregar popup.', 'error');
  }
}

saveBtn.addEventListener('click', async function () {
  try {
    const result = await sendMessage({
      type: 'SAVE_EXTENSION_SETTINGS',
      payload: {
        apiBaseUrl: apiBaseUrlInput.value.trim(),
        loginUrl: loginUrlInput.value.trim(),
        jwtToken: jwtTokenInput.value.trim(),
      },
    });

    if (!result || !result.ok) {
      setStatus((result && result.message) || 'Falha ao salvar configuracoes.', 'error');
      return;
    }

    setStatus('Configuracoes salvas.', 'success');
  } catch (error) {
    setStatus('Erro ao salvar configuracoes.', 'error');
  }
});

testBtn.addEventListener('click', async function () {
  try {
    setStatus('Validando token...', 'info');
    const result = await sendMessage({ type: 'TEST_JARVI_AUTH' });

    if (!result || !result.ok) {
      setStatus((result && result.message) || 'Falha na autenticacao.', 'error');
      return;
    }

    const email = result.user && result.user.email ? result.user.email : 'usuario';
    setStatus('Autenticado como ' + email + '.', 'success');
  } catch (error) {
    setStatus('Erro ao testar autenticacao.', 'error');
  }
});

openLoginBtn.addEventListener('click', async function () {
  try {
    await sendMessage({ type: 'OPEN_LOGIN_PAGE' });
    setStatus('Pagina de login aberta.', 'info');
  } catch (error) {
    setStatus('Nao foi possivel abrir o login.', 'error');
  }
});

clearBtn.addEventListener('click', async function () {
  try {
    await sendMessage({ type: 'CLEAR_EXTENSION_TOKEN' });
    jwtTokenInput.value = '';
    setStatus('Token removido.', 'success');
  } catch (error) {
    setStatus('Erro ao remover token.', 'error');
  }
});

loadState();
