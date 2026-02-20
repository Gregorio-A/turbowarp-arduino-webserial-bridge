(function (Scratch) {
  'use strict';

  // Verifica se o modo "Unsandboxed" está ativo, necessário para acessar a porta Serial/USB.
  if (!Scratch.extensions.unsandboxed) {
    throw new Error('Esta extensão precisa rodar no modo "Unsandboxed" para acessar a USB.');
  }

  class ArduinoSerialExtension {
    constructor() {
      this.port = null;
      this.reader = null;
      this.inputDone = null;
      this.isConnected = false;
      this.partialRecord = ""; // Armazena pedaços de texto que chegam cortados

      // Agora armazenamos um objeto com os valores de todas as portas
      this.sensorValues = {
        'A0': 0,
        'A1': 0,
        'A2': 0,
        'A3': 0,
        'A4': 0,
        'A5': 0
      };

      // Armazena histórico e estado dos filtros
      this.filterBuffers = {};     // Para média/mediana (arrays)
      this.filterLastValues = {};  // Para deadzone/rate limit (valores únicos)
    }

    getInfo() {
      return {
        id: 'arduinoSerialMulti',
        name: 'Arduino Multi-Portas',
        color1: '#009688',
        blocks: [
          {
            opcode: 'connect',
            blockType: Scratch.BlockType.COMMAND,
            text: 'Conectar ao Arduino (115200)'
          },
          {
            opcode: 'getSerialData',
            blockType: Scratch.BlockType.REPORTER,
            text: 'Ler valor da porta [PORT]', // O bloco agora tem um menu
            arguments: {
              PORT: {
                type: Scratch.ArgumentType.STRING,
                menu: 'ports', // Referencia o menu definido abaixo
                defaultValue: 'A0'
              }
            }
          },
          {
            opcode: 'isSerialConnected',
            blockType: Scratch.BlockType.BOOLEAN,
            text: 'Está conectado?'
          },
          {
            opcode: 'disconnect',
            blockType: Scratch.BlockType.COMMAND,
            text: 'Desconectar'
          },
          {
            opcode: 'mapValues',
            blockType: Scratch.BlockType.REPORTER,
            text: 'mapear [VALUE] de [IN_MIN]..[IN_MAX] para [OUT_MIN]..[OUT_MAX]',
            arguments: {
              VALUE: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 'valor'
              },
              IN_MIN: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 0
              },
              IN_MAX: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 1023
              },
              OUT_MIN: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 0
              },
              OUT_MAX: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 100
              }
            }
          },
          {
            opcode: 'smoothValue',
            blockType: Scratch.BlockType.REPORTER,
            text: 'suavizar [CURRENT] para [TARGET] com velocidade [f]',
            arguments: {
              CURRENT: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 0
              },
              TARGET: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 0
              },
              f: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 0.1
              }
            }
          },
          {
            opcode: 'constrainValue',
            blockType: Scratch.BlockType.REPORTER,
            text: 'limitar [VALUE] entre [MIN] e [MAX]',
            arguments: {
              VALUE: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 0
              },
              MIN: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 0
              },
              MAX: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 100
              }
            }
          },
          {
            opcode: 'filterMedian',
            blockType: Scratch.BlockType.REPORTER,
            text: 'filtro mediana [VALUE] buffer [SIZE] id [ID]',
            arguments: {
              VALUE: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
              SIZE: { type: Scratch.ArgumentType.NUMBER, defaultValue: 5 },
              ID: { type: Scratch.ArgumentType.STRING, defaultValue: 'filtro1' }
            }
          },
          {
            opcode: 'filterDeadzone',
            blockType: Scratch.BlockType.REPORTER,
            text: 'ignorar ruído [VALUE] limite [THRESH] id [ID]',
            arguments: {
              VALUE: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
              THRESH: { type: Scratch.ArgumentType.NUMBER, defaultValue: 2 },
              ID: { type: Scratch.ArgumentType.STRING, defaultValue: 'ruido1' }
            }
          },
          {
            opcode: 'filterRateLimit',
            blockType: Scratch.BlockType.REPORTER,
            text: 'limitar velocidade [VALUE] max delta [DELTA] id [ID]',
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
            // Lista das portas disponíveis no menu do bloco
            items: ['A0', 'A1', 'A2', 'A3', 'A4', 'A5']
          }
        }
      };
    }

    async connect() {
      // Verifica se o navegador suporta Web Serial API
      if (!navigator.serial) {
        alert("Erro: Seu navegador não suporta Web Serial. Use Chrome ou Edge.");
        return;
      }

      try {
        // Abre a janela para o usuário escolher a porta COM
        this.port = await navigator.serial.requestPort({ filters: [] });

        // Abre a conexão com velocidade 115200
        await this.port.open({ baudRate: 115200 });
        this.isConnected = true;

        // Configura o decodificador de texto (bytes -> string)
        const textDecoder = new TextDecoderStream();
        this.inputDone = this.port.readable.pipeTo(textDecoder.writable);
        this.reader = textDecoder.readable.getReader();

        // Começa a ler os dados indefinidamente
        this.readLoop();

      } catch (error) {
        this.isConnected = false;
        console.error("Erro ao conectar:", error);
        alert("Erro ao conectar: " + error.message);
      }
    }

    async readLoop() {
      while (true) {
        try {
          const { value, done } = await this.reader.read();
          if (done) {
            this.reader.releaseLock();
            break;
          }
          if (value) {
            this.handleData(value);
          }
        } catch (error) {
          console.error("Erro de leitura:", error);
          break;
        }
      }
    }

    handleData(chunk) {
      this.partialRecord += chunk;

      // Verifica se há uma quebra de linha (indicando fim da mensagem)
      if (this.partialRecord.includes('\n')) {
        const lines = this.partialRecord.split('\n');
        this.partialRecord = lines.pop(); // Guarda o pedaço incompleto para a próxima vez

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.length > 0) {
            // PROTOCOLO: O Arduino envia "A0:1023"
            // Nós separamos pelo caractere ":"
            const parts = trimmed.split(':');

            // Se tivermos duas partes (nome da porta e valor)
            if (parts.length === 2) {
              const portName = parts[0]; // Ex: "A0"
              const sensorValue = parts[1]; // Ex: "1023"

              // Atualiza a memória apenas daquela porta específica
              this.sensorValues[portName] = sensorValue;
            }
          }
        }
      }
    }

    async disconnect() {
      if (this.reader) {
        await this.reader.cancel();
        await this.inputDone.catch(() => { });
        this.reader = null;
        this.inputDone = null;
      }
      if (this.port) {
        await this.port.close();
        this.port = null;
      }
      this.isConnected = false;
    }

    // Função chamada quando o bloco "Ler Valor" é usado
    getSerialData(args) {
      // Retorna o valor salvo para a porta escolhida no menu (args.PORT)
      // Se não tiver valor ainda, retorna 0
      return this.sensorValues[args.PORT] || 0;
    }

    mapValues(args) {
      const value = parseFloat(args.VALUE) || 0;
      const inMin = parseFloat(args.IN_MIN) || 0;
      const inMax = parseFloat(args.IN_MAX) || 0;
      const outMin = parseFloat(args.OUT_MIN) || 0;
      const outMax = parseFloat(args.OUT_MAX) || 0;

      if (inMin === inMax) return outMin;

      return (value - inMin) * (outMax - outMin) / (inMax - inMin) + outMin;
    }

    smoothValue(args) {
      const current = parseFloat(args.CURRENT) || 0;
      const target = parseFloat(args.TARGET) || 0;
      let factor = parseFloat(args.f) || 0;

      // Clamp factor
      if (factor < 0) factor = 0;
      if (factor > 1) factor = 1;

      return current + (target - current) * factor;
    }

    constrainValue(args) {
      const value = parseFloat(args.VALUE) || 0;
      const min = parseFloat(args.MIN) || 0;
      const max = parseFloat(args.MAX) || 0;

      if (value < min) return min;
      if (value > max) return max;
      return value;
    }

    // Filtro de Mediana: Ótimo para remover picos (spikes) isolados
    filterMedian(args) {
      const val = parseFloat(args.VALUE) || 0;
      const size = Math.max(1, Math.min(parseInt(args.SIZE) || 5, 20)); // Buffer entre 1 e 20
      const id = args.ID.toString();

      // Inicializa buffer se não existir
      if (!this.filterBuffers[id]) {
        this.filterBuffers[id] = [];
      }

      const buffer = this.filterBuffers[id];
      buffer.push(val);

      // Mantém o tamanho do buffer
      if (buffer.length > size) {
        buffer.shift();
      }

      // Calcula a mediana
      // Cria uma cópia para não alterar a ordem do histórico
      const sorted = [...buffer].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);

      return sorted[mid];
    }

    // Filtro Deadzone: Ignora mudanças pequenas (ruído/jitter)
    filterDeadzone(args) {
      const val = parseFloat(args.VALUE) || 0;
      const threshold = parseFloat(args.THRESH) || 0;
      const id = args.ID.toString();

      // Se não houver valor anterior, retorna o atual e salva
      if (this.filterLastValues[id] === undefined) {
        this.filterLastValues[id] = val;
        return val;
      }

      const last = this.filterLastValues[id];

      // Se a mudança for maior que o limiar (positivo ou negativo), atualiza
      if (Math.abs(val - last) >= threshold) {
        this.filterLastValues[id] = val;
        return val;
      }

      // Caso contrário retorna o valor antigo (ignora o ruído)
      return last;
    }

    // Filtro Rate Limit: Limita a velocidade de mudança (Slew Rate)
    // Ótimo para suavizar movimentos mecânicos
    filterRateLimit(args) {
      const target = parseFloat(args.VALUE) || 0;
      const maxDelta = Math.abs(parseFloat(args.DELTA) || 10);
      const id = args.ID.toString();

      if (this.filterLastValues[id] === undefined) {
        this.filterLastValues[id] = target;
        return target;
      }

      const current = this.filterLastValues[id];
      const diff = target - current;

      // Limita a mudança ao maxDelta
      let change = diff;
      if (change > maxDelta) change = maxDelta;
      if (change < -maxDelta) change = -maxDelta;

      const newValue = current + change;
      this.filterLastValues[id] = newValue;

      return newValue;
    }

    isSerialConnected() {
      return this.isConnected;
    }
  }

  Scratch.extensions.register(new ArduinoSerialExtension());
})(Scratch);