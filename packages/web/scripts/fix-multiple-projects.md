# 🔧 Corrigindo Problema com Múltiplos Projetos Google Cloud

## **🎯 Problema Identificado:**
Você tem **2 projetos** no Google Cloud e o Client ID pode estar no projeto errado ou com configurações incorretas.

## **📋 Seus Projetos:**
1. **"Jarvi App Production"** (ID: jarvi-app-production) - ✅ Selecionado atualmente
2. **"Jarvi App"** (ID: jarvi-app)

## **🔍 Passo 1: Identificar onde está o Client ID**

### **No projeto atual ("Jarvi App Production"):**
1. Vá para **APIs & Services** > **Credentials**
2. Procure pelo Client ID: `933867383204-ieshtq1903hud854ja1lfk0v2lkf86s9`
3. Se **ENCONTRAR**: Configure as URIs autorizadas aqui
4. Se **NÃO ENCONTRAR**: Continue para o passo 2

### **No projeto "Jarvi App":**
1. Mude para o projeto **"Jarvi App"** (clique no dropdown no topo)
2. Vá para **APIs & Services** > **Credentials**
3. Procure pelo Client ID: `933867383204-ieshtq1903hud854ja1lfk0v2lkf86s9`
4. Se **ENCONTRAR**: Configure as URIs autorizadas aqui
5. Se **NÃO ENCONTRAR**: Continue para o passo 3

## **🔧 Passo 2: Configurar URIs Autorizadas**

### **Authorized JavaScript origins:**
```
http://localhost:3000
http://localhost:3001
http://127.0.0.1:3000
http://127.0.0.1:3001
```

### **Authorized redirect URIs:**
```
http://localhost:3000
http://localhost:3001
http://127.0.0.1:3000
http://127.0.0.1:3001
```

## **🆕 Passo 3: Criar Client ID para Desenvolvimento (se necessário)**

Se o Client ID não estiver em nenhum projeto:

### **No projeto "Jarvi App" (recomendado para desenvolvimento):**
1. Vá para **APIs & Services** > **Credentials**
2. Clique em **"+ CREATE CREDENTIALS"** > **"OAuth client ID"**
3. Tipo: **"Web application"**
4. Nome: **"Jarvi Web Development"**
5. **Authorized JavaScript origins:**
   ```
   http://localhost:3000
   http://localhost:3001
   http://127.0.0.1:3000
   http://127.0.0.1:3001
   ```
6. **Authorized redirect URIs:**
   ```
   http://localhost:3000
   http://localhost:3001
   http://127.0.0.1:3000
   http://127.0.0.1:3001
   ```
7. Clique em **"CREATE"**
8. Copie o novo Client ID
9. Atualize o arquivo `.env.local` com o novo Client ID

## **📝 Passo 4: Atualizar Configuração Local**

### **Para desenvolvimento:**
```env
# Use o Client ID do projeto "Jarvi App"
VITE_GOOGLE_CLIENT_ID=SEU_CLIENT_ID_DE_DESENVOLVIMENTO
```

### **Para produção:**
```env
# Use o Client ID do projeto "Jarvi App Production"
VITE_GOOGLE_CLIENT_ID=SEU_CLIENT_ID_DE_PRODUCAO
```

## **✅ Passo 5: Testar**

1. Salve todas as alterações no Google Console
2. Aguarde 2-5 minutos para propagação
3. Reinicie o servidor de desenvolvimento
4. Teste o login com Google

## **💡 Dica:**
- **Desenvolvimento**: Use o projeto "Jarvi App"
- **Produção**: Use o projeto "Jarvi App Production"
- Mantenha Client IDs separados para cada ambiente

