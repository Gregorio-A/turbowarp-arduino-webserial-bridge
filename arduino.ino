
//  Arduino Multi-Port Sender para TurboWarp
//  Envia dados no formato: "PORTA:VALOR"
//  Exemplo de saída no Serial Monitor:
//  A0:1023
//  A1:0
//  A2:512
//  ...
//

// Tempo para controlar a velocidade de envio
unsigned long lastTransmission = 0;
const int INTERVAL = 30; // 30ms (aproximadamente 33 vezes por segundo)

void setup() {
  // Inicia a comunicação serial rápida
  Serial.begin(115200);
}

void loop() {
  // Verifica se já passou o tempo do intervalo
  if (millis() - lastTransmission >= INTERVAL) {
    lastTransmission = millis();
    
    // Ler e enviar A0
    int valA0 = analogRead(A0);
    Serial.print("A0:");      // Envia o rótulo
    Serial.println(valA0);    // Envia o valor e pula linha

    // Ler e enviar A1
    int valA1 = analogRead(A1);
    Serial.print("A1:");
    Serial.println(valA1);

    // Ler e enviar A2
    int valA2 = analogRead(A2);
    Serial.print("A2:");
    Serial.println(valA2);

    // Ler e enviar A3
    int valA3 = analogRead(A3);
    Serial.print("A3:");
    Serial.println(valA3);

    // Ler e enviar A4
    int valA4 = analogRead(A4);
    Serial.print("A4:");
    Serial.println(valA4);

    // Ler e enviar A5
    int valA5 = analogRead(A5);
    Serial.print("A5:");
    Serial.println(valA5);
  }
}