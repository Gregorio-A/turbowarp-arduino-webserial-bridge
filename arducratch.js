(function (Scratch) {
  'use strict';

  // Verifica se a extensão está no modo Unsandboxed.
  // O Web Serial API exige controle direto do hardware, o que não é permitido na sandbox (modo seguro).
  if (!Scratch.extensions.unsandboxed) {
    throw new Error('Esta extensão precisa rodar no modo "Unsandboxed" para acessar portas USB.');
  }

  class ArduinoSerialExtension {
    constructor() {
      // Configurações básicas da comunicação Serial
      this.port = null;
      this.reader = null;
      this.inputDone = null;
      this.isConnected = false;
      this.partialRecord = ""; // Guarda os textos incompletos que chegam da USB cortados

      // Armazena o valor atual de cada porta do Arduino (A0, A1, etc.)
      this.sensorValues = {
        'A0': 0, 'A1': 0, 'A2': 0, 'A3': 0, 'A4': 0, 'A5': 0
      };

      // Memórias separadas para cada tipo de filtro evitar conflitos.
      // Antes, rate limit e deadzone dividiam a mesma variável.
      this.filterBuffers = {};      // Histórico para o filtro de Mediana (guarda listas)
      this.deadzoneValues = {};     // Último valor isolado para o filtro Deadzone
      this.rateLimitValues = {};    // Último valor isolado para o filtro Rate Limit
    }

    // Função responsável por verificar o idioma do editor e retornar o texto correto
    getMessage(id) {
      // Captura o idioma atual do TurboWarp. Se falhar por algum motivo, usa 'pt' como segurança.
      const lang = (Scratch.translate && Scratch.translate.language) ? Scratch.translate.language : 'pt';
      // Se a sigla começar com 'pt', exibe em português. Senão, vai para o inglês.
      const isPt = lang.startsWith('pt');

      const messages = {
        name: isPt ? 'Arduino Multi-Portas' : 'Arduino Multi-Port',
        connect: isPt ? 'Conectar ao Arduino a [BAUD] baud' : 'Connect to Arduino at [BAUD] baud',
        getSerialData: isPt ? 'Ler valor da porta [PORT]' : 'Read port [PORT] value',
        isSerialConnected: isPt ? 'Está conectado?' : 'Is connected?',
        disconnect: isPt ? 'Desconectar' : 'Disconnect',
        mapValues: isPt ? 'mapear [VALUE] de [IN_MIN]..[IN_MAX] para [OUT_MIN]..[OUT_MAX]' : 'map [VALUE] from [IN_MIN]..[IN_MAX] to [OUT_MIN]..[OUT_MAX]',
        smoothValue: isPt ? 'suavizar [CURRENT] para [TARGET] com velocidade [f]' : 'smooth [CURRENT] to [TARGET] with speed [f]',
        constrainValue: isPt ? 'limitar [VALUE] entre [MIN] e [MAX]' : 'constrain [VALUE] between [MIN] and [MAX]',
        filterMedian: isPt ? 'filtro mediana [VALUE] buffer [SIZE] id [ID]' : 'median filter [VALUE] buffer [SIZE] id [ID]',
        filterDeadzone: isPt ? 'ignorar ruído [VALUE] limite [THRESH] id [ID]' : 'ignore noise [VALUE] threshold [THRESH] id [ID]',
        filterRateLimit: isPt ? 'limitar velocidade [VALUE] max delta [DELTA] id [ID]' : 'limit speed [VALUE] max delta [DELTA] id [ID]',
        errorConnected: isPt ? 'Atenção: Já existe uma conexão ativa.' : 'Warning: There is already an active connection.',
        errorBrowser: isPt ? 'Erro: Seu navegador não suporta Web Serial. Use Chrome, Edge ou navegadores baseados em Chromium.' : 'Error: Your browser does not support Web Serial. Use Chrome, Edge, or Chromium-based browsers.',
        errorPort: isPt ? 'Erro ao tentar abrir porta:' : 'Error trying to open port:'
      };

      return messages[id];
    }

    getInfo() {
      // Aqui dizemos para o Scratch como a extensão deve se parecer visualmente
      // Agora chamando this.getMessage() para cada texto na tela
      return {
        id: 'arduinoSerialMulti',
        name: this.getMessage('name'),
        color1: '#009688',
        blocks: [
          {
            opcode: 'connect',
            blockType: Scratch.BlockType.COMMAND,
            text: this.getMessage('connect'),
            arguments: {
              BAUD: {
                type: Scratch.ArgumentType.STRING,
                menu: 'baudRates',
                defaultValue: '115200'
              }
            }
          },
          {
            opcode: 'getSerialData',
            blockType: Scratch.BlockType.REPORTER,
            text: this.getMessage('getSerialData'),
            arguments: {
              PORT: {
                type: Scratch.ArgumentType.STRING,
                menu: 'ports',
                defaultValue: 'A0'
              }
            }
          },
          {
            opcode: 'isSerialConnected',
            blockType: Scratch.BlockType.BOOLEAN,
            text: this.getMessage('isSerialConnected')
          },
          {
            opcode: 'disconnect',
            blockType: Scratch.BlockType.COMMAND,
            text: this.getMessage('disconnect')
          },
          {
            opcode: 'mapValues',
            blockType: Scratch.BlockType.REPORTER,
            text: this.getMessage('mapValues'),
            arguments: {
              VALUE: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
              IN_MIN: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
              IN_MAX: { type: Scratch.ArgumentType.NUMBER, defaultValue: 1023 },
              OUT_MIN: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
              OUT_MAX: { type: Scratch.ArgumentType.NUMBER, defaultValue: 100 }
            }
          },
          {
            opcode: 'smoothValue',
            blockType: Scratch.BlockType.REPORTER,
            text: this.getMessage('smoothValue'),
            arguments: {
              CURRENT: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
              TARGET: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
              f: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0.1 }
            }
          },
          {
            opcode: 'constrainValue',
            blockType: Scratch.BlockType.REPORTER,
            text: this.getMessage('constrainValue'),
            arguments: {
              VALUE: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
              MIN: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
              MAX: { type: Scratch.ArgumentType.NUMBER, defaultValue: 100 }
            }
          },
          {
            opcode: 'filterMedian',
            blockType: Scratch.BlockType.REPORTER,
            text: this.getMessage('filterMedian'),
            arguments: {
              VALUE: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
              SIZE: { type: Scratch.ArgumentType.NUMBER, defaultValue: 5 },
              ID: { type: Scratch.ArgumentType.STRING, defaultValue: 'filtro1' }
            }
          },
          {
            opcode: 'filterDeadzone',
            blockType: Scratch.BlockType.REPORTER,
            text: this.getMessage('filterDeadzone'),
            arguments: {
              VALUE: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
              THRESH: { type: Scratch.ArgumentType.NUMBER, defaultValue: 2 },
              ID: { type: Scratch.ArgumentType.STRING, defaultValue: 'ruido1' }
            }
          },
          {
            opcode: 'filterRateLimit',
            blockType: Scratch.BlockType.REPORTER,
            text: this.getMessage('filterRateLimit'),
            arguments: {
              VALUE: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
              DELTA: { type: Scratch.ArgumentType.NUMBER, defaultValue: 10 },
              ID: { type: Scratch.ArgumentType.STRING, defaultValue: 'suave1' }
            }
          }
        ],
        menus: {
          ports: {
            acceptReporters: true,
            items: ['A0', 'A1', 'A2', 'A3', 'A4', 'A5']
          },
          baudRates: {
            // Cria um menu suspenso no bloco para o usuário escolher a velocidade da comunicação
            acceptReporters: true,
            items: ['9600', '19200', '38400', '57600', '115200', '250000']
          }
        }
      };
    }

    async connect(args) {
      // Previne tentar conectar se já estiver conectado, evitando problemas de vazamento de memória e travamento da porta
      if (this.isConnected) {
        console.log(this.getMessage('errorConnected'));
        return;
      }

      // Converte a escolha do bloco para número inteiro. Se der algum erro na leitura, ele usa 115200 como proteção.
      const baudRate = parseInt(args.BAUD) || 115200;

      // Verifica se o navegador possui o recurso Web Serial API
      if (!navigator.serial) {
        alert(this.getMessage('errorBrowser'));
        return;
      }

      try {
        // Abre o popup na tela do usuário para ele escolher o dispositivo USB
        this.port = await navigator.serial.requestPort({ filters: [] });

        // Abre a comunicação definindo a taxa de transmissão de acordo com a escolha no bloco. 
        // Precisa ser igual ao que está configurado no "Serial.begin(valor)" do Arduino.
        await this.port.open({ baudRate: baudRate });
        this.isConnected = true;

        // O Arduino envia os dados como bytes brutos. O TextDecoder transforma esses bytes em texto legível.
        const textDecoder = new TextDecoderStream();
        this.inputDone = this.port.readable.pipeTo(textDecoder.writable);
        this.reader = textDecoder.readable.getReader();

        // Dispara a função que vai ficar lendo os dados infinitamente
        this.readLoop();

      } catch (error) {
        this.isConnected = false;
        console.error(this.getMessage('errorPort'), error);
      }
    }

    async readLoop() {
      // Lê os dados apenas se a variável de conexão estiver verdadeira
      while (this.isConnected) {
        try {
          // Congela essa linha e aguarda até chegar o próximo pacote de dados da porta USB
          const { value, done } = await this.reader.read();

          // Se 'done' for true, significa que o leitor fechou (ex: usamos o botão de desconectar)
          if (done) {
            if (this.reader) this.reader.releaseLock();
            break;
          }

          // Se a leitura trouxe conteúdo, repassa para a função que corta e entende o texto
          if (value) {
            this.handleData(value);
          }
        } catch (error) {
          // Esse bloco 'catch' é engatilhado, por exemplo, se a pessoa puxar o cabo USB fisicamente do computador
          console.error("Erro de leitura ou cabo removido bruscamente:", error);
          if (this.reader) {
            // Extremamente importante: liberar o uso do leitor para não travar a porta para futuras tentativas
            this.reader.releaseLock(); 
          }
          break;
        }
      }

      // Se o fluxo sair do while, garante que desativamos tudo corretamente
      this.isConnected = false;
      this.cleanUpState(); 
    }

    // Função para limpar rastros depois da conexão cair
    cleanUpState() {
      this.port = null;
      this.reader = null;
      this.inputDone = null;
      this.partialRecord = "";
    }

    handleData(chunk) {
      // Pega o pedaço de texto novo e gruda no final do texto acumulado da leitura anterior
      this.partialRecord += chunk;

      // O caractere especial '\n' (quebra de linha) indica que o Arduino terminou de enviar aquele número
      if (this.partialRecord.includes('\n')) {
        // Divide o texto todo usando o enter (\n) como tesoura
        const lines = this.partialRecord.split('\n');

        // Como a última linha quase sempre chegou incompleta, removemos da lista e devolvemos pra memória
        this.partialRecord = lines.pop();

        for (const line of lines) {
          // O comando trim() é ótimo porque remove os espaços nas bordas e também os invisíveis como \r (do Windows)
          const trimmed = line.trim();

          // Confirma que a linha não ficou vazia depois de limpar
          if (trimmed.length > 0) {
            // Procura o separador de protocolo (dois pontos ':')
            const parts = trimmed.split(':');

            // Verifica se o texto dividiu certinho em duas partes (ex: "A0" e "1023")
            if (parts.length === 2) {
              const portName = parts[0];
              // Converte obrigatoriamente para Número. Se ficasse como Texto (String), o Scratch faria contas erradas
              const sensorValue = parseFloat(parts[1]);

              // Confirma se o que chegou depois dos dois pontos era mesmo um número e não lixo de comunicação
              if (!isNaN(sensorValue)) {
                this.sensorValues[portName] = sensorValue;
              }
            }
          }
        }
      }
    }

    async disconnect() {
      // Sai da função se já não tiver porta em andamento
      if (!this.isConnected && !this.port) return;

      this.isConnected = false; // Dá o sinal para o 'while' do readLoop parar de ler

      try {
        // Encerra suavemente a ponte de leitura
        if (this.reader) {
          await this.reader.cancel();
          if (this.inputDone) {
            // Espera a interrupção acontecer sem explodir erros na tela
            await this.inputDone.catch(() => {}); 
          }
        }
        // Fechamento definitivo da porta USB
        if (this.port) {
          await this.port.close();
        }
      } catch (error) {
        console.error("Erro durante a desconexão manual:", error);
      } finally {
        this.cleanUpState(); 
      }
    }

    getSerialData(args) {
      // String(X).trim() força o nome da porta a ser texto limpo (ajuda caso coloquem espaços errados no bloco do Scratch)
      const port = String(args.PORT).trim();
      // Retorna a memória do sensor ou zero se ele nunca enviou dados
      return this.sensorValues[port] || 0;
    }

    mapValues(args) {
      const value = parseFloat(args.VALUE) || 0;
      const inMin = parseFloat(args.IN_MIN) || 0;
      const inMax = parseFloat(args.IN_MAX) || 0;
      const outMin = parseFloat(args.OUT_MIN) || 0;
      const outMax = parseFloat(args.OUT_MAX) || 0;

      // Retorna logo o valor inicial de saída para evitar erro matemático de divisão por zero (se Mín e Máx de entrada forem iguais)
      if (inMin === inMax) return outMin;

      // Executa a regra de três clássica para transpor o valor de uma escala para a outra
      return (value - inMin) * (outMax - outMin) / (inMax - inMin) + outMin;
    }

    smoothValue(args) {
      const current = parseFloat(args.CURRENT) || 0;
      const target = parseFloat(args.TARGET) || 0;
      let factor = parseFloat(args.f) || 0;

      // Mantém a velocidade contida entre 0 (não anda) e 1 (chega instantaneamente)
      if (factor < 0) factor = 0;
      if (factor > 1) factor = 1;

      // Calcula a diferença pro alvo e avança apenas uma fração (fator) dessa distância
      return current + (target - current) * factor;
    }

    constrainValue(args) {
      const value = parseFloat(args.VALUE) || 0;
      const min = parseFloat(args.MIN) || 0;
      const max = parseFloat(args.MAX) || 0;

      // Corta o valor e o "encaixota" caso queira ultrapassar os tetos permitidos
      if (value < min) return min;
      if (value > max) return max;
      return value;
    }

    // --- FILTROS DE SINAL ---

    filterMedian(args) {
      const val = parseFloat(args.VALUE) || 0;
      // Define a "janela" do histórico e limita entre 1 a 20 pra evitar vazamentos absurdos de uso de memória RAM
      const size = Math.max(1, Math.min(parseInt(args.SIZE) || 5, 20)); 
      const id = String(args.ID).trim();

      // Inicia a array que guarda o histórico se for o primeiro uso deste ID
      if (!this.filterBuffers[id]) {
        this.filterBuffers[id] = [];
      }

      const buffer = this.filterBuffers[id];
      buffer.push(val); 

      // Se o histórico estourou a janela limite, apaga a primeira leitura feita (a mais antiga, índice 0)
      if (buffer.length > size) {
        buffer.shift();
      }

      // Copia os dados usando '[...buffer]' (para não quebrar a ordem do tempo) e alinha do menor pro maior número
      const sorted = [...buffer].sort((a, b) => a - b);
      // Calcula onde é o exato meio da lista
      const mid = Math.floor(sorted.length / 2);

      // A mediana exclui anomalias extremas retornando apenas o número normal do centro das repetições
      return sorted[mid];
    }

    filterDeadzone(args) {
      const val = parseFloat(args.VALUE) || 0;
      const threshold = parseFloat(args.THRESH) || 0;
      const id = String(args.ID).trim();

      // Se é a primeira execução do filtro, armazena de cara o valor inicial
      if (this.deadzoneValues[id] === undefined) {
        this.deadzoneValues[id] = val;
        return val;
      }

      const last = this.deadzoneValues[id];

      // O comando Math.abs transforma números negativos em positivos pra avaliar a distância real.
      // Se essa "distância de pulo" superou a barreira imposta pelo usuário (threshold), permite e atualiza o número atual.
      if (Math.abs(val - last) >= threshold) {
        this.deadzoneValues[id] = val;
        return val;
      }

      // Se o "pulo" foi fraquinho (inferior à barreira), finge que nada mudou pra estabilizar pequenos chiados mecânicos
      return last;
    }

    filterRateLimit(args) {
      const target = parseFloat(args.VALUE) || 0;
      // Garante que a força/velocidade máxima será sempre encarada como distância positiva
      const maxDelta = Math.abs(parseFloat(args.DELTA) || 10);
      const id = String(args.ID).trim();

      // Registra o alvo na primeira tacada e sai
      if (this.rateLimitValues[id] === undefined) {
        this.rateLimitValues[id] = target;
        return target;
      }

      const current = this.rateLimitValues[id];
      const diff = target - current; // Vê quantos "km" faltam para atingir o valor bruto do sensor

      let change = diff;

      // Se o valor bruto exigir um tranco muito violento (acima do delta), a gente amarra e só deixa mudar a quantia do maxDelta
      if (change > maxDelta) change = maxDelta;
      if (change < -maxDelta) change = -maxDelta;

      // Aplica esse movimento amansado ao valor da saída virtual
      const newValue = current + change;
      this.rateLimitValues[id] = newValue;

      return newValue;
    }

    isSerialConnected() {
      return this.isConnected;
    }
  }

  // Entrega o controle final da extensão criada ali em cima para a interface e cérebro do Scratch/TurboWarp
  Scratch.extensions.register(new ArduinoSerialExtension());
})(Scratch);
