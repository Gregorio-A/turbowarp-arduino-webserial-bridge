# turbowarp-arduino-extention

# Arduino Multi-Port Extension Guide

#**This extention only works on web browsers!!!!**

This extension allows Scratch/TurboWarp to communicate with an Arduino via USB Serial. It is designed to read multiple analog sensors simultaneously and process the data to create smooth, reliable interactions.

## 1. Setup & Connection
**Requirement:** This extension must run in **"Unsandboxed"** mode because it uses the Web Serial API to access USB ports.


-   **Connect Block** (`Conectar ao Arduino (115200)`):
    -   Opens a browser popup asking you to select a COM port.
    -   Sets the baud rate to **115200**.
    -   Starts listening for data immediately.
-   **Disconnect Block** (`Desconectar`):
    -   Closes the connection and stops reading.
-   **Is Connected?** (`Está conectado?`):
    -   Returns `true` if the port is open and ready.

## 2. Reading Data
The extension expects data in the format `A0:1023\n`. It automatically parses this and updates the internal variable for that port.

-   **Read Value Block** (`Ler valor da porta [PORT]`):
    -   Returns the *last received value* for the selected port (A0-A5).
    -   If no data has been received yet, it returns `0`.
    -   You can read A0, A1, A2, etc., continuously in your loop.

## 3. Basic Processing
These blocks help convert raw sensor data (0-1023) into useful numbers for your project.

-   **Map Values** (`mapear [VALUE] de [MIN]..[MAX] to [OUT_MIN]..[OUT_MAX]`):
    -   Converts a number from one range to another.
    -   *Example:* Map potentiometer (0-1023) to Sprite X position (-240 to 240).
-   **Constrain** (`limitar [VALUE] entre [MIN] e [MAX]`):
    -   Forces a number to stay within limits.
    -   *Example:* Keep a servo angle between 0 and 180.
-   **Smooth (Simple)** (`suavizar [CURRENT] para [TARGET] com velocidade [f]`):
    -   Moves a value slowly towards a target.
    -   `f` = 0.1 (Slow/Smooth), `f` = 0.9 (Fast/Responsive).

## 4. Advanced Filters (Noise Reduction)
Sensors are often noisy. Use these blocks to clean up the data.

### A. Median Filter (Filtro Mediana)
**Best for:** Removing crazy spikes (e.g., random 0 or 1023 readings).
-   **Block:** `filtro mediana [VALUE] buffer [SIZE] id [ID]`
-   **How it works:** Keeps a list of the last `SIZE` readings, sorts them, and picks the middle one. Spikes get sorted to the ends and ignored.
-   **Usage:** Set `SIZE` to `5` or `10`. Use a unique `ID` (e.g., "A0_med").

### B. Deadzone Filter (Ignorar Ruído)
**Best for:** Ignoring small jitters when the sensor should be still.
-   **Block:** `ignorar ruído [VALUE] limite [THRESH] id [ID]`
-   **How it works:** Only changes the output if the new value is different enough from the old value (determined by `THRESH`).
-   **Usage:** Set `THRESH` to `2` or `5`. Use a unique `ID` (e.g., "A0_dead").

### C. Rate Limit Filter (Limitar Velocidade)
**Best for:** Making movements smooth and robotic, preventing instant jumps.
-   **Block:** `limitar velocidade [VALUE] max delta [DELTA] id [ID]`
-   **How it works:** Limits how much the value can change per frame. If the sensor jumps from 0 to 100, and `DELTA` is 10, it will take 10 frames to get there.
-   **Usage:** Set `DELTA` to `5` (slow) or `20` (fast). Use a unique `ID` (e.g., "A0_speed").

## 5. Troubleshooting
-   **"Error: Browser not supported":** You must use Chrome, Edge, or a Chromium-based browser.
-   **Values are confusing/mixed:** Check your **IDs** in the filter blocks. If you use the same ID for A0 and A1, they will overwrite each other's history.
-   **Connection fails:** Make sure no other program (like Arduino IDE serial monitor) is using the port.
