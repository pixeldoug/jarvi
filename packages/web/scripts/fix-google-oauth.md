# 🔧 Como Corrigir o Google OAuth

## **Problema Identificado:**
O erro `"The given origin is not allowed for the given client ID"` indica que o domínio `localhost:3001` não está autorizado no Google Console.

## **Solução:**

### **1. Acesse o Google Cloud Console:**
- Vá para: https://console.cloud.google.com/
- Selecione o projeto que contém o Client ID: `933867383204-ieshtq1903hud854ja1lfk0v2lkf86s9`

### **2. Configure as URIs Autorizadas:**
- Vá para **APIs & Services** > **Credentials**
- Clique no Client ID: `933867383204-ieshtq1903hud854ja1lfk0v2lkf86s9`
- Na seção **Authorized JavaScript origins**, adicione:
  ```
  http://localhost:3000
  http://localhost:3001
  http://127.0.0.1:3000
  http://127.0.0.1:3001
  ```

### **3. Configure as URIs de Redirecionamento:**
- Na seção **Authorized redirect URIs**, adicione:
  ```
  http://localhost:3000
  http://localhost:3001
  http://127.0.0.1:3000
  http://127.0.0.1:3001
  ```

### **4. Salve as Alterações:**
- Clique em **Save**
- Aguarde alguns minutos para as alterações serem propagadas

### **5. Teste Novamente:**
- Reinicie o servidor de desenvolvimento
- Teste o login com Google

## **Alternativa Rápida (Para Teste):**

Se você quiser testar rapidamente, pode usar o Client ID de teste do Google:

```env
VITE_GOOGLE_CLIENT_ID=1234567890-abcdefghijklmnopqrstuvwxyz123456.apps.googleusercontent.com
```

Mas é recomendado configurar corretamente o seu próprio Client ID.

## **Verificação:**

Após configurar, você deve ver no console:
- ✅ Sem erros de CORS
- ✅ Sem erros de origin não autorizado
- ✅ Login funcionando normalmente

