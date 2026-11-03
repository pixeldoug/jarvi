# 0003 — Notas guardam a transcrição, não o áudio

**Superfície:** web (Notas) + backend · **Status:** em vigor

## Contexto

Notas é a área do app web para capturar o que está na cabeça, ou uma conversa, e transformar em resumo e tarefas. A pessoa escreve livremente na aba **Notas** e pode gravar o microfone ao mesmo tempo. A gravação vira **Transcrição** e, ao final, um **Resumo** gerado por IA que junta as notas e a transcrição. A referência de experiência é o Littlebird (meeting notes).

Gravar uma conversa levanta três perguntas: onde o áudio fica, quanto tempo a pessoa espera pela transcrição, e o que acontece com silêncio.

## Decisão

1. **O áudio nunca é persistido.** O navegador grava trechos de ~30 s. Cada trecho é um arquivo completo, com um `MediaRecorder` por trecho, porque pedaços de timeslice não decodificam sozinhos. Cada trecho sobe em base64 para `POST /api/notes/:id/transcriptions`, é transcrito pelo Whisper e descartado. Só o texto é salvo, em `note_transcript_segments`.
2. **A transcrição aparece enquanto a gravação continua.** Os trechos sobem em fila sequencial, o que mantém a ordem. Cada trecho envia ao Whisper o fim do anterior como `prompt`, o que dá continuidade entre os cortes.
3. **O silêncio é filtrado em duas camadas.** No cliente, um trecho cujo pico RMS medido fica abaixo do limiar não sobe. Zero digital conta como leitura não confiável, e o trecho sobe. No servidor, o `whisper-1` roda com `verbose_json`, e os segmentos com `no_speech_prob ≥ 0,8` são descartados. Um filtro de padrões remove as alucinações conhecidas do Whisper em pt-BR ("Inscreva-se no canal…", "Legendas pela comunidade Amara.org"). No silêncio, o Whisper inventa essas frases com `no_speech_prob ≈ 0,9`; na fala real, o valor fica em torno de 0,02.
4. **O resumo é do usuário depois de gerado.** Ele fica salvo como documento TipTap e é editável. "Gerar novamente" substitui o resumo. O resumo automático só roda ao parar uma gravação **quando a nota ainda não tem resumo**, para nunca apagar edições. O título sugerido pela IA só é aplicado quando o título está vazio.
5. **Arquivos de áudio enviados seguem o mesmo caminho da gravação.** O navegador decodifica o arquivo (até 200 MB e 2 h), reamostra para 16 kHz, mistura em mono e corta em trechos WAV de 60 s, que entram na mesma fila de transcrição: mesma ordem, mesmas retentativas, mesma continuidade e mesmo filtro de silêncio no servidor, e o resumo automático roda no fim se a nota não tiver um. O arquivo também nunca é guardado, e o backend não precisou de ffmpeg nem de upload multipart. Os trechos são gerados aos poucos (no máximo 3 na fila), para não segurar o arquivo inteiro em blobs nem estourar o rate limit.
6. **O chat da nota é o agente geral com contexto extra.** `mode: 'note'` executa o mesmo agente, com as mesmas tools, e só anexa ao system prompt um bloco com a nota, marcado como dado do usuário e não como instrução. Pedir "crie tarefas dos próximos passos" usa as tools normais de tarefa.

## Alternativas descartadas

- **Guardar o áudio** para reprocessar ou tocar depois. Exigiria storage de objetos, uma política de retenção e um consentimento mais pesado. O valor do produto está no texto. Pode voltar como opt-in.
- **Transcrever no navegador com a Web Speech API.** É instável entre navegadores, no Chrome manda o áudio para o Google mesmo assim, e a qualidade em pt-BR fica abaixo do Whisper.
- **Um único upload ao parar.** Não daria transcrição ao vivo, esbarraria no limite de 25 MB do Whisper em reuniões longas e perderia tudo se a aba fechasse.
- **Mandar o arquivo enviado inteiro para o servidor.** Esbarraria no mesmo limite de 25 MB (cerca de 25 min de MP3) ou exigiria ffmpeg no backend para cortar; decodificar no navegador reaproveita a fila que já existia.
- **Só a lista exata de frases alucinadas.** O Whisper varia a redação a cada chamada ("…ative as notificações", "…clique no sininho"), e a lista exata deixou passar a primeira variação real que testamos.
