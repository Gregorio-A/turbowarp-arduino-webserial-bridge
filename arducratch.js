(function (Scratch) {
  'use strict';

  // The Web Serial API requires direct hardware control, which is not allowed in the sandbox.
  if (!Scratch.extensions.unsandboxed) {
    throw new Error('This extension must run in "Unsandboxed" mode to access USB ports.');
  }

  class ArduinoSerialExtension {
    constructor() {
      this.port = null;
      this.reader = null;
      this.inputDone = null;
      this.isConnected = false;
      this.partialRecord = ""; // buffer for incomplete data packets

      this.sensorValues = {
        'A0': 0, 'A1': 0, 'A2': 0, 'A3': 0, 'A4': 0, 'A5': 0
      };

      // Separate memory buffers for filters to avoid conflicts
      this.filterBuffers = {};
      this.deadzoneValues = {};
      this.rateLimitValues = {};
    }

    getMessage(id) {
      const lang = (Scratch.translate && Scratch.translate.language) ? Scratch.translate.language : 'pt';
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
              ID: { type: Scratch.ArgumentType.STRING, defaultValue: 'filter1' }
            }
          },
          {
            opcode: 'filterDeadzone',
            blockType: Scratch.BlockType.REPORTER,
            text: this.getMessage('filterDeadzone'),
            arguments: {
              VALUE: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
              THRESH: { type: Scratch.ArgumentType.NUMBER, defaultValue: 2 },
              ID: { type: Scratch.ArgumentType.STRING, defaultValue: 'noise1' }
            }
          },
          {
            opcode: 'filterRateLimit',
            blockType: Scratch.BlockType.REPORTER,
            text: this.getMessage('filterRateLimit'),
            arguments: {
              VALUE: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
              DELTA: { type: Scratch.ArgumentType.NUMBER, defaultValue: 10 },
              ID: { type: Scratch.ArgumentType.STRING, defaultValue: 'smooth1' }
            }
          }
        ],
        menus: {
          ports: {
            acceptReporters: true,
            items: ['A0', 'A1', 'A2', 'A3', 'A4', 'A5']
          },
          baudRates: {
            acceptReporters: true,
            items: ['9600', '19200', '38400', '57600', '115200', '250000']
          }
        }
      };
    }

    async connect(args) {
      if (this.isConnected) {
        console.log(this.getMessage('errorConnected'));
        return;
      }

      const baudRate = parseInt(args.BAUD) || 115200;

      if (!navigator.serial) {
        alert(this.getMessage('errorBrowser'));
        return;
      }

      try {
        this.port = await navigator.serial.requestPort({ filters: [] });
        await this.port.open({ baudRate: baudRate });
        this.isConnected = true;

        // Decodes raw bytes into readable text stream
        const textDecoder = new TextDecoderStream();
        this.inputDone = this.port.readable.pipeTo(textDecoder.writable);
        this.reader = textDecoder.readable.getReader();

        this.readLoop();

      } catch (error) {
        this.isConnected = false;
        console.error(this.getMessage('errorPort'), error);
      }
    }

    async readLoop() {
      while (this.isConnected) {
        try {
          const { value, done } = await this.reader.read();

          if (done) {
            if (this.reader) this.reader.releaseLock();
            break;
          }

          if (value) {
            this.handleData(value);
          }
        } catch (error) {
          console.error("Read error or cable disconnected:", error);
          if (this.reader) {
            // Critical: release lock to prevent port jamming
            this.reader.releaseLock(); 
          }
          break;
        }
      }

      this.isConnected = false;
      this.cleanUpState(); 
    }

    cleanUpState() {
      this.port = null;
      this.reader = null;
      this.inputDone = null;
      this.partialRecord = "";
    }

    handleData(chunk) {
      this.partialRecord += chunk;

      // Process only when a newline (\n) is received
      if (this.partialRecord.includes('\n')) {
        const lines = this.partialRecord.split('\n');
        
        // The last line is usually incomplete, save it for the next chunk
        this.partialRecord = lines.pop();

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.length > 0) {
            const parts = trimmed.split(':');
            if (parts.length === 2) {
              const portName = parts[0];
              const sensorValue = parseFloat(parts[1]);

              if (!isNaN(sensorValue)) {
                this.sensorValues[portName] = sensorValue;
              }
            }
          }
        }
      }
    }

    async disconnect() {
      if (!this.isConnected && !this.port) return;

      this.isConnected = false; 

      try {
        if (this.reader) {
          await this.reader.cancel();
          if (this.inputDone) {
            await this.inputDone.catch(() => {}); 
          }
        }
        if (this.port) {
          await this.port.close();
        }
      } catch (error) {
        console.error("Disconnect error:", error);
      } finally {
        this.cleanUpState(); 
      }
    }

    getSerialData(args) {
      const port = String(args.PORT).trim();
      return this.sensorValues[port] || 0;
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

    // --- SIGNAL FILTERS ---

    filterMedian(args) {
      const val = parseFloat(args.VALUE) || 0;
      const size = Math.max(1, Math.min(parseInt(args.SIZE) || 5, 20)); 
      const id = String(args.ID).trim();

      if (!this.filterBuffers[id]) {
        this.filterBuffers[id] = [];
      }

      const buffer = this.filterBuffers[id];
      buffer.push(val); 

      if (buffer.length > size) {
        buffer.shift();
      }

      // Sort and pick the middle value to ignore extreme spikes
      const sorted = [...buffer].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);

      return sorted[mid];
    }

    filterDeadzone(args) {
      const val = parseFloat(args.VALUE) || 0;
      const threshold = parseFloat(args.THRESH) || 0;
      const id = String(args.ID).trim();

      if (this.deadzoneValues[id] === undefined) {
        this.deadzoneValues[id] = val;
        return val;
      }

      const last = this.deadzoneValues[id];

      // Only update if change is greater than threshold (ignores jitter)
      if (Math.abs(val - last) >= threshold) {
        this.deadzoneValues[id] = val;
        return val;
      }

      return last;
    }

    filterRateLimit(args) {
      const target = parseFloat(args.VALUE) || 0;
      const maxDelta = Math.abs(parseFloat(args.DELTA) || 10);
      const id = String(args.ID).trim();

      if (this.rateLimitValues[id] === undefined) {
        this.rateLimitValues[id] = target;
        return target;
      }

      const current = this.rateLimitValues[id];
      const diff = target - current;
      let change = diff;

      // Limit the speed of change per frame
      if (change > maxDelta) change = maxDelta;
      if (change < -maxDelta) change = -maxDelta;

      const newValue = current + change;
      this.rateLimitValues[id] = newValue;

      return newValue;
    }

    isSerialConnected() {
      return this.isConnected;
    }
  }

  Scratch.extensions.register(new ArduinoSerialExtension());
})(Scratch);
