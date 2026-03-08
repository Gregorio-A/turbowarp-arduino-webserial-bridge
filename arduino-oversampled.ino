const int potPin = A0; 
float filteredValue = 0; 
const float alpha = 0.1; 

void setup() {
  Serial.begin(9600); 

  filteredValue = readOversampled(potPin); 
}

void loop() {
  int highResValue = readOversampled(potPin); 

  filteredValue = (alpha * highResValue) + ((1.0 - alpha) * filteredValue);

  Serial.print("A0:");
  Serial.println((int)filteredValue); 
  
  delay(10); 
}

int readOversampled(int pin) {
  unsigned long soma = 0; 
  

  for (int i = 0; i < 16; i++) {
    soma += analogRead(pin); 
  }

  return (soma >> 2); 
}
