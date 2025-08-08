<!doctype html>
<html lang="pt-br">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>PAFCS DATA SOLUTIONS - Estúdio Musical Interativo</title>
  <style>
    /* Estilos básicos para deixar a página funcional e organizada */
    body { font-family: sans-serif; background-color: #f0f0f0; color: #333; margin: 0; padding-bottom: 60px; /* Espaço para o rodapé */ overflow-x: hidden; }
    .background-svg { position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: -1; opacity: 0.8; }
    .background-svg circle { cursor: pointer; transition: all 0.1s ease; }
    .background-svg circle:active { transform: scale(1.05); }
    .main-container {
        display: flex; flex-direction: column; align-items: center;
        padding: 20px; position: relative; z-index: 10;
    }
    /* Estilo para o cabeçalho e logo */
    .header { text-align: center; margin-bottom: 20px; }
    .logo { max-width: 180px; height: auto; border-radius: 10px; }

    .panel {
        background: rgba(255, 255, 255, 0.95); border-radius: 12px;
        box-shadow: 0 4px 15px rgba(0,0,0,0.1); padding: 20px; margin-bottom: 20px;
        width: 100%; max-width: 600px; box-sizing: border-box;
    }
    .panel h1, .panel h2 { margin-top: 0; border-bottom: 1px solid #ddd; padding-bottom: 10px; }
    .control-group { margin-bottom: 15px; display: flex; align-items: center; justify-content: space-between; }
    .control-group label { font-weight: bold; display: flex; align-items: center; }
    .control-group select { padding: 8px; border-radius: 6px; border: 1px solid #ccc; width: 60%; }
    .color-indicator { width: 24px; height: 24px; border-radius: 50%; display: inline-block; vertical-align: middle; margin-right: 10px; border: 1px solid #888; }
    #status-text { margin-top: 10px; font-style: italic; color: #555; height: 20px; }

    /* Estilo para o rodapé */
    footer {
        position: fixed; bottom: 0; left: 0; width: 100%;
        background-color: #333; color: white; text-align: center;
        padding: 10px 0; font-size: 0.8em; z-index: 20;
    }
  </style>
</head>
<body>

  <svg class="background-svg" viewbox="0 0 1440 800" preserveAspectRatio="xMidYMid slice">
    <circle data-color-id="0" cx="280" cy="280" r="280" fill="#00529B" /> <circle data-color-id="1" cx="1160" cy="280" r="280" fill="#D42A2F" /> <circle data-color-id="2" cx="280" cy="520" r="280" fill="#FDB913" /> <circle data-color-id="3" cx="1160" cy="520" r="280" fill="#009A44" /> </svg>

  <div class="main-container">
    
    <header class="header">
        <img src="Logo.jpeg" alt="Logo PAFCS DATA SOLUTIONS" class="logo">
    </header>

    <div class="panel">
      <h1>Estúdio Musical Interativo</h1>
    </div>

    <div class="panel" id="config-panel">
      <h2>Configurar Sons</h2>
      <div id="status-text"></div>
    </div>

    </div>

  <footer>
    Uma criação de GEMINI (Google AI). Notas musicais fornecidas por Sound Dino.
  </footer>

<script>
document.addEventListener('DOMContentLoaded', () => {
    // --- SETUP INICIAL (SIMPLIFICADO) ---
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();

    const colors = [
        { id: 0, name: "Azul", color: "#00529B" },
        { id: 1, name: "Vermelho", color: "#D42A2F" },
        { id: 2, name: "Amarelo", color: "#FDB913" },
        { id: 3, name: "Verde", color: "#009A44" },
    ];

    // Verifique se cada nome de arquivo aqui é IDÊNTICO ao do seu repositório
    let soundFiles = [
        'sounds/re.mp3', 'sounds/f.mp3', 'sounds/c.mp3', 'sounds/do-segunda-oitava.mp3',
        'sounds/do-segunda-oitava-alongado.mp3', 'sounds/do.mp3', 'sounds/mi-esticado.mp3',
        'sounds/novica-rebelde.mp3', 'sounds/mi.mp3', 'sounds/c-esticado.mp3', 'sounds/la.mp3',
        'sounds/renote-o-som.mp3', 'sounds/nota-c.mp3', 'sounds/a-esticado.mp3',
        'sounds/fa-esticado.mp3', 'sounds/nota-salgada.mp3', 'sounds/sol-estendida.mp3',
        'sounds/nota-fa.mp3', 'sounds/nota-c-esticado.mp3', 'sounds/nota-d-esticado.mp3'
    ];
    
    const NUM_SOUNDS = soundFiles.length;

    let audioBuffers = {};
    let soundConfiguration = {};
    const statusText = document.getElementById('status-text');

    // 1. Preenche a UI de configuração
    function populateConfigUI() {
        const panel = document.getElementById('config-panel');
        // Limpa apenas os controles, mantém o título e o status
        panel.querySelectorAll('.control-group').forEach(el => el.remove());
        
        colors.forEach(colorInfo => {
            const group = document.createElement('div');
            group.className = 'control-group';
            const label = document.createElement('label');
            label.innerHTML = `<span class="color-indicator" style="background-color: ${colorInfo.color};"></span> ${colorInfo.name}`;
            const select = document.createElement('select');
            select.dataset.colorId = colorInfo.id;
            soundFiles.forEach(filePath => {
                const option = document.createElement('option');
                option.value = filePath;
                option.textContent = filePath.split('/').pop();
                select.appendChild(option);
            });
            group.appendChild(label);
            group.appendChild(select);
            panel.insertBefore(group, statusText); // Insere antes do texto de status
            select.addEventListener('change', handleConfigChange);
        });
    }
    
    // 2. Salva e Carrega configurações do usuário
    function saveConfiguration() {
        localStorage.setItem('soundConfiguration', JSON.stringify(soundConfiguration));
    }

    function loadConfiguration() {
        const savedConfig = JSON.parse(localStorage.getItem('soundConfiguration'));
        if (savedConfig && Object.keys(savedConfig).length > 0) {
            soundConfiguration = savedConfig;
        } else {
            soundConfiguration = {
                0: soundFiles.length > 0 ? soundFiles[0] : '',
                1: soundFiles.length > 1 ? soundFiles[1] : '',
                2: soundFiles.length > 2 ? soundFiles[2] : '',
                3: soundFiles.length > 3 ? soundFiles[3] : '',
            };
        }
        document.querySelectorAll('#config-panel select').forEach(select => {
            const colorId = select.dataset.colorId;
            if (soundConfiguration[colorId]) {
               select.value = soundConfiguration[colorId];
            }
        });
    }

    function handleConfigChange(event) {
        const select = event.target;
        const colorId = select.dataset.colorId;
        const soundFile = select.value;
        soundConfiguration[colorId] = soundFile;
        saveConfiguration();
    }

    // 3. Pré-carrega todos os sons
    async function preloadSounds() {
        statusText.textContent = `Carregando ${NUM_SOUNDS} sons...`;
        try {
            const promises = soundFiles.map(async (filePath) => {
                const response = await fetch(filePath);
                if (!response.ok) {
                    console.error(`Erro 404 (Não Encontrado): O arquivo ${filePath} não foi encontrado. Verifique o nome e o local do arquivo no seu repositório.`);
                    throw new Error(`Falha ao carregar ${filePath}`);
                }
                const arrayBuffer = await response.arrayBuffer();
                const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
                audioBuffers[filePath] = audioBuffer;
            });
            await Promise.all(promises);
            statusText.textContent = 'Instrumento pronto!';
        } catch (error) {
            statusText.textContent = 'Erro ao carregar sons. Verifique o console (F12).';
        }
    }
    
    // 4. Toca um som
    function playSound(filePath) {
        if (!audioBuffers[filePath] || !soundConfiguration) return;
        if (audioContext.state === 'suspended') { audioContext.resume(); }
        const source = audioContext.createBufferSource();
        source.buffer = audioBuffers[filePath];
        source.connect(audioContext.destination);
        source.start(0);
    }

    // 5. Lógica de interação com os círculos
    document.querySelectorAll('.background-svg circle').forEach(circle => {
        circle.addEventListener('click', (event) => {
            // Garante que o contexto de áudio seja iniciado por um gesto do usuário
            if (audioContext.state === 'suspended') {
                audioContext.resume();
            }
            const colorId = event.target.dataset.colorId;
            const soundToPlay = soundConfiguration[colorId];
            if (soundToPlay) {
                playSound(soundToPlay);
            }
        });
    });

    // --- LÓGICA DE GRAVAÇÃO REMOVIDA NESTA FASE ---

    // --- INICIALIZAÇÃO ---
    populateConfigUI();
    loadConfiguration();
    preloadSounds();
});
</script>

</body>
</html>
