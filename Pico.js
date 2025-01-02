
#include <ArduinoJson.h>
#include "hardware/gpio.h"  // RP2040 GPIO functions

const int sensorPins[] = {2, 3, 4, 5, 6, 7, 8, 9}; // GPIO pins connected to the sensors
int lastSensorStates[8] = {LOW, LOW, LOW, LOW, LOW, LOW, LOW, LOW}; // Previous states of the sensors
int lastPushButtonState[8] = {LOW, LOW, LOW, LOW, LOW, LOW, LOW, LOW}; // Previous states of the sensors

int sensorPulseCounts[8] = {0, 0, 0, 0, 0, 0, 0, 0}; // Pulse counts for each sensor
unsigned long debounceDelay = 200;  // Debounce delay of 200ms

const int relayPins[] = {10, 11, 12, 13, 14, 15, 16, 17}; // Relay pins for each machine
const int PushbuttonPins[] = {18, 19, 20, 21, 22, 26, 27, 28}; // LED pins for each machine

unsigned long relayOnTimes[8] = {0, 0, 0, 0, 0, 0, 0, 0}; // Store the time when each relay was turned on
const unsigned long relayDuration = 10000; // 20 seconds in milliseconds

unsigned long sensorHighStartTimes[8] = {0, 0, 0, 0, 0, 0, 0, 0}; // Store when each sensor went high
const unsigned long highDurationThreshold = 3000; // 3 seconds threshold

const unsigned long lowerThreshold = 2000; // 3 seconds
const unsigned long upperThreshold = 3000; // 4 seconds
bool readyToSend[8] = {false, false, false, false, false, false, false, false}; // Track readiness to send data



void controlRelayBasedOnResponse(String response) {
  // Parse the JSON response
  StaticJsonDocument<512> doc;
  DeserializationError error = deserializeJson(doc, response);

  if (error) {
    Serial.print("Failed to parse response: ");
    Serial.println(error.c_str());
    return;
  }

  // Check the "details" array in the response
  JsonArray details = doc["details"];
  for (JsonVariant value : details) {
    const char* detailMessage = value.as<const char*>();

    // Loop through each machine and check if its target is completed
    for (int i = 0; i < 8; i++) { // Assuming you have 8 machines
      String targetMessage = "Target for machine " + String(i + 1) + " is completed";
      if (strstr(detailMessage, targetMessage.c_str()) != nullptr) {
        Serial.print("Turning on relay for machine ");
        Serial.println(i + 1);
        digitalWrite(relayPins[i], LOW); // Turn on relay for the specific machine
       // digitalWrite(ledPins[i], HIGH);  // Turn on LED for the specific machine
        relayOnTimes[i] = millis(); // Record the time when the relay is turned on
      }
    }
  }
}

void setup() {
  Serial.begin(9600);  // Debugging
  Serial1.begin(115200); // Communication with ESP-01

  // Set each relay and LED pin as output and ensure they are initially off
  for (int i = 0; i < 8; i++) {
    pinMode(relayPins[i], OUTPUT);
    //pinMode(PushbuttonPins[i], OUTPUT);
    digitalWrite(relayPins[i], HIGH); // Ensure all relays are initially off
    //digitalWrite(PushbuttonPins[i], LOW);   // Ensure all LEDs are initially off
   
  }

  // Set each sensor pin as input
  for (int i = 0; i < 8; i++) {
    pinMode(sensorPins[i], INPUT);
    // pinMode(PushbuttonPins[i], INPUT);
     pinMode(PushbuttonPins[i], INPUT_PULLUP);
    gpio_pull_down(sensorPins[i]);
   
   
  }
}

void loop() {
 
  bool pulseDetected = false;

 

 
  for (int i = 0; i < 8; i++) {
    int sensorState = digitalRead(PushbuttonPins[i]);
     int sensorState1 = digitalRead(sensorPins[i]);

     
   

    // Detect a rising edge (transition from LOW to HIGH)
    if (sensorState1 == HIGH && lastSensorStates[i] == LOW) {
      Serial.print("Pulse detected on sensor ");
      Serial.println(i + 1); // For debugging
      sensorPulseCounts[i]++; // Increment pulse count for this sensor
      pulseDetected = true; // Mark that a pulse has been detected

      // Turn off the LED for this machine when a new pulse is detected
   
       
//      digitalWrite(ledPins[i], LOW);
        digitalWrite(relayPins[i], LOW);   //trials

    //  sensorHighStartTimes[i] = millis();
    }
if (sensorState == HIGH && lastPushButtonState[i] == LOW) {
      Serial.print("pUSH button sensor ");
      Serial.println(i + 1); // For debugging
     // sensorPulseCounts[i]++; // Increment pulse count for this sensor

       sendHighDurationDataToESP(i);
       
//      if (digitalRead(relayPins[i]) == LOW) { // Relay is on (LOW means relay is activated)  //----------------------------------------------------------------
//          // Relay is currently on, turn it off
//          Serial.print("Turning off relay for machine ");
//          Serial.println(i + 1);
//          digitalWrite(relayPins[i], HIGH); // Turn off relay
//        
//        } else {
//          // Relay is off, turn it on
//          Serial.print("Turning on relay for machine ");
//          Serial.println(i + 1);
//          digitalWrite(relayPins[i], LOW);  // Turn on relay
//        
//        
//
//          // After 2 seconds, turn off the relay
//          delay(2000); // Wait for 2 seconds
//          digitalWrite(relayPins[i], HIGH); // Turn off relay
//      
//        } //---------------------------------------------------------------------------------------------------
   
 


     
     
    }

//      if (sensorState == HIGH && sensorHighStartTimes[i] != 0) {
//      unsigned long duration = millis() - sensorHighStartTimes[i];
//
//
//      if (duration >= lowerThreshold) {
//      Serial.print("High signal duration on sensor ");
//      Serial.println(i + 1); // For debugging
//      
//      // Turn on relay and LED
////      digitalWrite(relayPins[i], LOW); // Turn on relay
////      digitalWrite(ledPins[i], HIGH);  // Turn on LED
//      //digitalWrite(ledPins[i], LOW);  //for new led pins will be off after 2 seconds
//      //delay(200);
//      //digitalWrite(ledPins[i], HIGH);
//      //// delay(2000);
//     // digitalWrite(ledPins[i], LOW);
//
//     if (digitalRead(relayPins[i]) == LOW) { // Relay is on (LOW means relay is activated)
//          // Relay is currently on, turn it off
//          Serial.print("Turning off relay for machine ");
//          Serial.println(i + 1);
//          digitalWrite(relayPins[i], HIGH); // Turn off relay
//        
//        } else {
//          // Relay is off, turn it on
//          Serial.print("Turning on relay for machine ");
//          Serial.println(i + 1);
//          digitalWrite(relayPins[i], LOW);  // Turn on relay
//        
//        
//
//          // After 2 seconds, turn off the relay
//          delay(2000); // Wait for 2 seconds
//          digitalWrite(relayPins[i], HIGH); // Turn off relay
//      
//        }
////      
////      delay(2000); // Keep them on for 2 seconds
//      
//      // Turn off relay and LED after 2 seconds
////      digitalWrite(relayPins[i], HIGH); // Turn off relay
////      digitalWrite(ledPins[i], LOW);    // Turn off LED
//
//      
//    }
//
//
//        
//      // If duration is between 3 and 4 seconds, prepare to send the data
//      if (duration >= lowerThreshold && duration <= upperThreshold) {
//        Serial.print("Duraton ");
//        Serial.print(duration);
//        
//        readyToSend[i] = true; // Set ready to send flag
//
//         if (digitalRead(relayPins[i]) == LOW) { // Relay is on (LOW means relay is activated)
//          // Relay is currently on, turn it off
//          Serial.print("Turning off relay for machine ");
//          Serial.println(i + 1);
//          digitalWrite(relayPins[i], HIGH); // Turn off relay
//        
//        } else {
//          // Relay is off, turn it on
//          Serial.print("Turning on relay for machine111111111111111111 ");
//          Serial.println(i + 1);
//          digitalWrite(relayPins[i], LOW);  // Turn on relay
//        
//        
//
//          // After 2 seconds, turn off the relay
//          delay(2000); // Wait for 2 seconds
//          digitalWrite(relayPins[i], HIGH); // Turn off relay
//      
//        }
//      
//
//      }
//
//      // If duration exceeds 4 seconds, cancel sending
//      if (duration > upperThreshold) {
//        readyToSend[i] = false; // Cancel the sending
//        sensorHighStartTimes[i] = 0; // Reset the timer
//      }
//    }
//
//
//

   

    // Reset the timer if sensor goes LOW before crossing 3 seconds
   
    // Update the last sensor state
    lastSensorStates[i] = sensorState1;
     lastPushButtonState[i] = sensorState;
   
   
  }

  // If a pulse was detected on any sensor, send the data to ESP-01
  if (pulseDetected) {
    sendDataToESP();
  }



   //Check for incoming data from ESP-01
  if (Serial1.available()) {
    String response = Serial1.readStringUntil('\n');
    Serial.println("Response from ESP-01:");
    Serial.println(response);  // Display the response on the serial monitor

    // Control relay and LED based on server response
    controlRelayBasedOnResponse(response);
    //handleESPMessage(response);
    controlRelayForHighDuration(response);
  }
// Check for incoming messages from Serial1
  String message = ""; // Declare the message variable



  // Check if it's time to turn off any relays
//  unsigned long currentTime = millis();
//  for (int i = 0; i < 8; i++) {
//    if (relayOnTimes[i] != 0 && (currentTime - relayOnTimes[i] >= relayDuration)) {
//      Serial.print("Turning off relay for machine ");
//      Serial.println(i + 1);
//      digitalWrite(relayPins[i], HIGH); // Turn off relay for the specific machine
//      // Keep the LED ON, do not change the state of ledPins[i]
//      relayOnTimes[i] = 0; // Reset the time to indicate the relay is off
//    }
//  }
}



void handleESPMessage(String incomingMessage) {



    Serial.println("Received target completion message for machineId: ................");
 Serial.println(incomingMessage);

    // Check if the message contains "Target completed for machineId"
    if (incomingMessage.startsWith("send successfulyy of targetcheck")) {
      // Extract the machineId from the message
        Serial.println("Received target completion message for machineId:1111111111111111 ");
      String machineId = incomingMessage.substring(32); // Get the machineId part
      Serial.println("Received target completion message for machineId: ");
      Serial.println(machineId);
     
      // Now control the relay based on the received machineId
      int machineIndex = machineId.toInt() - 1; // Convert machineId to index (0-based)
      if (machineIndex >= 0 && machineIndex < 8) {
        Serial.print("Turning on relay and LED for machine ");
  Serial.println(machineIndex + 1);
 
//  digitalWrite(relayPins[machineIndex], LOW); // Turn on relay
//  digitalWrite(ledPins[machineIndex], HIGH);  // Turn on LED
  relayOnTimes[machineIndex] = millis(); // Record the time when the relay is turned on
      }
    }

}



void controlRelayForHighDuration(String response) {
  // Parse the JSON response
  StaticJsonDocument<512> doc;
  DeserializationError error = deserializeJson(doc, response);

  if (error) {
    Serial.print("Failed to parse response: ");
    Serial.println(error.c_str());
    return;
  }

  // Check if the "message" is "Highduration"
  const char* message = doc["message"];
  if (strcmp(message, "Highduration") != 0) {
    Serial.println("No Highduration message found.");
    return;
  }

  // Process the "processedMachineIds" array
  JsonArray processedMachineIds = doc["processedMachineIds"];
  for (JsonVariant machineId : processedMachineIds) {
    int machineIndex = machineId.as<int>() - 1; // Convert machineId to index (assuming machineId starts from 1)
   
    // Ensure the machineIndex is within range (0 to 7, since there are 8 machines)
    if (machineIndex >= 0 && machineIndex < 8) {
      Serial.print("Turning on relay for machine alled api ");
      Serial.println(machineIndex + 1);

//     digitalWrite(relayPins[machineIndex], LOW); // Turn on relay for the specific machine
//      digitalWrite(ledPins[machineIndex], HIGH);  // Turn on LED for the specific machine
//      delay(2000); // Keep them on for 2 seconds

       // digitalWrite(relayPins[machineIndex], HIGH); // //for after target reset... this command will make  relay off---------------------------------------------

        if (digitalRead(relayPins[machineIndex]) == LOW) { // Relay is on (LOW means relay is activated)
          // Relay is currently on, turn it off
          Serial.print("Turning off relay for machine ");
          Serial.println(machineIndex + 1);
          digitalWrite(relayPins[machineIndex], HIGH); // Turn off relay
         
        } else {
          // Relay is off, turn it on
          Serial.print("Turning on relay for machine ");
          Serial.println(machineIndex + 1);
          digitalWrite(relayPins[machineIndex], LOW);  // Turn on relay
         
         

          // After 2 seconds, turn off the relay
          delay(2000); // Wait for 2 seconds
          digitalWrite(relayPins[machineIndex], HIGH); // Turn off relay
       
        }
     // digitalWrite(ledPins[machineIndex], LOW);  // Turn off LED for the specific machine
    }
  }
}



void sendDataToESP() {
  // Create a JSON array to hold the data
  StaticJsonDocument<512> doc; // Adjust size if needed
  JsonArray dataArray = doc.to<JsonArray>();

  for (int i = 0; i < 8; i++) {
    if (sensorPulseCounts[i] > 0) { // Include only sensors with pulses
      JsonObject sensorData = dataArray.createNestedObject();
      sensorData["Esp"] = "27"; // ESP ID (can be dynamic)
      sensorData["machineId"] = String(i + 1); // Machine ID (1-8)
      sensorData["machinePulseCount"] = String(sensorPulseCounts[i]); // Pulse count
    }
  }

  // Serialize JSON array into a string
  String jsonData;
  serializeJson(dataArray, jsonData);

  // Send the JSON data to the ESP-01
  Serial.print("Sending to ESP: "); // Debugging message
  Serial.println(jsonData); // Debugging message
  Serial1.println(jsonData);

  // Reset pulse counts after sending
  for (int i = 0; i < 8; i++) {
    sensorPulseCounts[i] = 0;
  }
}

void sendHighDurationDataToESP(int sensorIndex) {
  // Create a JSON document for high-duration data
  StaticJsonDocument<512> doc;
  JsonObject sensorData = doc.to<JsonObject>();

  sensorData["Esp"] = "27"; // ESP ID (can be dynamic)
  sensorData["machineId"] = String(sensorIndex + 1); // Machine ID (1-8)
  sensorData["status"] = "HIGH_DURATION"; // Special marker for high duration

  // Serialize the JSON data
  String jsonData;
  serializeJson(sensorData, jsonData);

  // Send the JSON data to the ESP
  Serial1.println(jsonData);
   Serial.print(jsonData);

  Serial.print("High duration data sent for machine ");
 
  Serial.println(sensorIndex + 1); // For debugging
}










____________________________

