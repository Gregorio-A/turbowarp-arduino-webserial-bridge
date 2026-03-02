
# TurboWarp Arduino Multi-Port Extension Guide

This comprehensive guide explains how to use the Arduino Multi-Port extension in TurboWarp. This extension bridges the gap between the physical and digital worlds, allowing your Scratch/TurboWarp projects to communicate directly with an Arduino microcontroller via a USB Serial connection.

By reading multiple analog sensors simultaneously and processing the data in real-time, you can create custom game controllers, interactive museum exhibits, STEM education projects, and hardware-driven animations with smooth, reliable interactions.

---

## 1. Important Requirements & Prerequisites

Before you start building, there are a few strict technical requirements due to how web browsers handle hardware security.

* **Web Browsers Only:** This extension relies on the HTML5 Web Serial API to communicate with USB ports. It is fully supported on Google Chrome, Microsoft Edge, Opera, Brave, and other Chromium-based browsers.
    > **Note:** It will not work on Mozilla Firefox, Apple Safari, or the standard desktop versions of Scratch/TurboWarp without specialized modifications, as those platforms block direct serial access for security reasons.

* **Unsandboxed Mode:** When loading this custom extension into TurboWarp, you must load it as an **"Unsandboxed"** extension. The standard Scratch sandbox security prevents websites from directly accessing your computer's hardware. Running it unsandboxed gives the extension the necessary permissions to read and write to the USB port.

* **Data-Capable USB Cable:** A very common beginner mistake is using a "charge-only" USB cable (often included with cheap electronics). Your Arduino will power on, but the computer won't recognize it. Ensure you are using a high-quality data USB cable.

---

## 2. Setting Up the Arduino (Hardware Side)

For the TurboWarp extension to properly understand the sensor data, the Arduino must format and send the information over the Serial port using a very specific protocol.

### The Communication Protocol

The extension constantly listens for data and looks for a specific pattern: `PORT_NAME:VALUE` followed immediately by a newline character (`\n`).

**Example:**
`A0:1023`

The colon (`:`) separates the identifier from the data, and the newline tells TurboWarp "this reading is complete, you can process it now."

### Basic Arduino Code Example

Here is a complete Arduino C++ code example that reads two analog pins (A0 and A1) and formats them correctly for TurboWarp.

```cpp
void setup() {
  Serial.begin(115200);

  while (!Serial) {
    ;
  }
}

void loop() {
  int sensorValueA0 = analogRead(A0);

  Serial.print("A0:");
  Serial.println(sensorValueA0);

  int sensorValueA1 = analogRead(A1);

  Serial.print("A1:");
  Serial.println(sensorValueA1);

  delay(50);
}

```

---

## 3. TurboWarp Setup & Connection

Once your Arduino is plugged in and running the code above, open your TurboWarp project to establish the connection.

* **Connect Block (`Connect to Arduino at [115200] baud`):**
When this block is executed, the browser will display a security popup asking you to explicitly grant permission to a specific USB device. Look for names like "USB Serial Device", "Arduino Uno", or "CH340".
* **Baud Rate:**
The default is **115200**, which is fast and responsive. If your Arduino code uses `Serial.begin(9600);`, you must change the dropdown in this block to **9600**, otherwise the data will look like gibberish.
* **Connection Check (`Is connected?`):**
Hardware connections take a moment to establish. Always wrap your main reading loops inside an `if <Is connected?>` block. This prevents your game logic from running (and potentially crashing or acting erratically) before the hardware is ready. It is also good practice to use this to show a "Please connect your controller" screen in your game.
* **Disconnect Block (`Disconnect`):**
Use this block when your game ends or via a specific keyboard shortcut. This cleanly closes the port, releasing the USB device so that other software (like the Arduino IDE) can upload new code. If you don't disconnect cleanly, you may have to physically unplug and replug the Arduino.

---

## 4. Reading and Processing Data

Physical hardware is rarely perfect. Raw analog sensors are heavily affected by electromagnetic interference, cheap internal components, and voltage fluctuations. If you use raw data directly, your game sprites will likely vibrate or jump erratically.

### Core Reading

* **Read Value Block (`Read port [A0] value`):**
This block reaches into the extension's memory and retrieves the most recent valid number sent by the Arduino. You should place this inside a forever loop to constantly update variables or sprite properties.

### Basic Math and Conversion Filters

Raw sensor data (usually 0 to 1023) rarely matches the coordinate system of a screen. Use these blocks to mathematically adapt the numbers:

* **Map Values (`map [VALUE] from [MIN]..[MAX] to [OUT_MIN]..[OUT_MAX]`):**
This is your most powerful tool. It converts a number from one scale proportionally to another.
* *Example:* Your steering wheel potentiometer outputs 0 (left) to 1023 (right), but your car sprite needs to rotate from -90 degrees to 90 degrees. Set the block to map 0..1023 to -90..90. The math is handled automatically.


* **Constrain (`constrain [VALUE] between [MIN] and [MAX]`):**
Sets a strict minimum and maximum boundary.
* *Example:* If a sensor glitches due to a loose wire and suddenly sends 1500, but you constrained the output to 1000, the block will act as a wall and output exactly 1000, preventing your sprite from flying off the screen.


* **Smooth Value (`smooth [CURRENT] to [TARGET] with speed [f]`):**
Also known as linear interpolation (Lerp). Instead of instantly teleporting from 0 to 100, the value gracefully "glides" towards the target based on the speed factor (`f`).
* *Usage:* `f = 0.05` is very slow and floaty (like moving through water). `f = 0.8` is fast and snappy. Great for UI animations or smoothing out camera movements.



### Advanced Noise Filters

To fix the physical jittering of sensors, use these data-cleaning filters.

> **Important Note:** Always use a unique ID string (like "player1_steering" or "A0_speed") for each physical sensor. If you reuse the same ID for two different sensors, the extension will mix their histories, causing chaotic behavior.

* **Median Filter (`median filter [VALUE] buffer [SIZE] id [ID]`):**
* *Best for:* Eliminating random, extreme spikes (e.g., a sensor that reads 500, 501, 500, 0, 502).
* *How it works:* Unlike an "average" (which gets dragged down by the 0), a median filter keeps a history of the last few readings, sorts them in order, and picks the exact middle number. Spikes are pushed to the edges and completely ignored. Use a buffer size of 5 or 10.


* **Deadzone Filter (`ignore noise [VALUE] threshold [THRESH] id [ID]`):**
* *Best for:* Joysticks or sliders that wiggle slightly when you aren't even touching them (analog drift).
* *How it works:* It creates a "frozen zone". The block will not change its output unless the physical input moves by an amount greater than the THRESH value. Set THRESH to 3 or 5 to eliminate resting jitter.


* **Rate Limit Filter (`limit speed [VALUE] max delta [DELTA] id [ID]`):**
* *Best for:* Simulating physical mass and inertia.
* *How it works:* It strictly limits how much a value can change per frame. If the player yanks a joystick from 0 to 100 instantly, but DELTA is set to 5, the output will count up by 5 per frame (5, 10, 15...). It prevents instant jumps and forces mechanical-feeling transitions.



---

## 5. Troubleshooting Common Issues

| Issue | Solution |
| --- | --- |
| **"Browser not supported" Error** | Ensure you are using a modern Chromium browser. If you are on a Chromebook, ensure the administrator hasn't blocked USB device access. |
| **No Ports Showing Up** | 1. Your USB cable is "charge-only" and lacks data wires. Swap the cable.<br> <br>2. You are missing the serial drivers for cheap Arduino clones (you may need to download and install the "CH340" driver). |
| **"Port already in use"** | A serial port can only be spoken to by one program at a time. If the Arduino IDE's Serial Monitor is open, or a 3D printer slicer is running in the background, TurboWarp cannot connect. Close other software. |
| **Values are 0 or flickering** | Check the baud rate. If the TurboWarp block is set to 115200 but the Arduino setup says `Serial.begin(9600);`, the connection will establish, but the data will be scrambled. |
| **Severe Input Lag** | Your Arduino is sending data too fast. Make sure you have a `delay(30)` or `delay(50)` at the end of your Arduino loop. Without a delay, the browser's serial buffer fills up, causing a traffic jam. |

---

## 6. Suggestions for "Future Improvements" (Roadmap)

This extension is currently optimized for a one-way flow of clean analog data. However, future updates may expand its capabilities to unlock even more complex hardware interactions:

* **Two-Way Communication (Sending Data):** Adding command blocks to send text, numbers, or specific bytes back to the Arduino. This would allow TurboWarp logic to turn on physical LEDs, move servo motors, display scores on an LCD screen, or trigger haptic feedback motors based on in-game events.
* **Digital Pin & State Support:** While analog data is great for dials, supporting raw digital ON/OFF states (1 or 0) natively would make reading arcade buttons, magnetic reed switches, and limit switches much more efficient.
* **Auto-Reconnect Logic:** If a USB cable is accidentally yanked out during gameplay, the extension currently crashes the connection. Future versions could detect the disconnection, pause the game, and automatically re-establish the connection seamlessly once the cable is plugged back in.
* **Custom Data Parsers:** Advanced users often want to send multiple data types (like an accelerometer's X, Y, and Z axes) packed tightly together. Allowing custom delimiters (like splitting by commas instead of colons) or adding native JSON parsing would make the extension compatible with complex existing Arduino libraries out of the box.
