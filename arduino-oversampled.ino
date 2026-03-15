// Pino onde o potenciômetro está conectado
const byte potPin = A0;

// Acumulador do filtro com precisão extra (multiplicado por 256).
// Usamos 'long' pois o valor pode passar do limite de um 'int' comum do Arduino (32767).
long filterAccumulator = 0;

// Guarda o último valor enviado ao computador para compararmos depois
int lastSentValue = -1;

// Margem de tolerância aumentada para 8.
// Como vamos aumentar a resolução para 12 bits (0 a 4095), a escala ficou 4 vezes maior.
// Uma variação de 2 na escala antiga equivale a 8 na nova escala.
const int threshold = 8;

// Variáveis para controlar o tempo sem usar delay()
unsigned long tempoAnterior = 0;
const unsigned long intervaloLeitura = 10;

void setup() {

  Serial.begin(115200);

  // A estabilidade inicial que você mencionou:
  // Fazemos a primeira leitura e multiplicamos por 256 para adequar à escala do acumulador.
  filterAccumulator = (long)readOversampled(potPin) * 256;

}

void loop() {

  unsigned long tempoAtual = millis();

  // Verifica se já passou o tempo de fazer uma nova leitura
  if (tempoAtual - tempoAnterior >= intervaloLeitura) {

    // Atualizamos somando o intervalo. Isso evita o acúmulo de pequenos atrasos (drift).
    tempoAnterior += intervaloLeitura;

    // Pega o valor lido com resolução aumentada (12 bits)
    int highResValue = readOversampled(potPin);

    // Transformamos a leitura atual para a escala multiplicada por 256
    long targetScaled = (long)highResValue * 256;

    // Filtro passa-baixa usando aritmética inteira com escala (Fixed-point math).
    // Isso resolve o problema de perda de precisão e travamento do valor,
    // pois a divisão agora lida com números grandes e sobra resto viável.
    filterAccumulator = filterAccumulator + ((targetScaled - filterAccumulator) / 8);

    // Desfazemos a multiplicação por 256 para obter o valor real (0 a 4095)
    int currentValue = (filterAccumulator + 128) / 256;

    // Verifica se a mudança foi grande o suficiente comparando com a tolerância
    if (abs(currentValue - lastSentValue) >= threshold) {
      Serial.print("A0:");
      Serial.println(currentValue);
      lastSentValue = currentValue;

    }
  }
}


int readOversampled(byte pin) {

  unsigned long soma = 0;

  // Faz 16 leituras rápidas e soma tudo
  for (int i = 0; i < 16; i++) {
    soma += analogRead(pin);
  }

  // Deslocar 2 bits para a direita (>> 2) é igual a dividir por 4.
  // Somar 16 leituras e dividir por 4 nos dá um verdadeiro Oversampling para 12 bits.
  // A resolução agora vai de 0 a 4095, aproveitando os dados extras capturados.
  return (soma >> 2);
}
