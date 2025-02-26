#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>

#include <ArduinoJson.h>

// Network credentials
const char* ssid = "Garware";
const char* password = "braiding";







// Server details
const char* serverUrl = "http://192.168.1.109:3001/api/data";



const int NUM_MACHINES = 8;

struct MachineData {
  String Esp;
  String machineId;
  int machinePulseCount;
   int Target;
  int Actual;
};

MachineData machineArray[NUM_MACHINES] = {
  {"1", "1", 0, 0, 0}, {"1", "2", 0, 0, 0}, {"1", "3", 0, 0, 0}, {"1", "4", 0, 0, 0},
  {"1", "5", 0, 0, 0}, {"1", "6", 0, 0, 0}, {"1", "7", 0, 0, 0}, {"1", "8", 0, 0, 0}
};

void setup() {
  Serial.begin(115200);
  Serial1.begin(9600);
 
  WiFi.begin(ssid, password);
 


  Serial.println("Connecting to WiFi...");
  while (WiFi.status() != WL_CONNECTED) {
    delay(1000);
    Serial.print(".");
  }

  Serial.println("\nConnected to WiFi");
  Serial.print("IP Address: ");
  Serial.println(WiFi.localIP());
}

void loop() {
  // Handle incoming data from Serial
  while (Serial.available()) {
    String incomingData = Serial.readStringUntil('\n');
    incomingData.trim();
   

// Check if this is the "HIGH_DURATION" event
     if (incomingData.indexOf("\"status\":\"HIGH_DURATION\"") != -1) {
    sendHighDurationDataToServer(incomingData); // Send to different API
} else if (sendToServer(incomingData)) {
    Serial.println("Data sent successfully.");
} else{

    DynamicJsonDocument doc(1024);
    deserializeJson(doc, incomingData);

    JsonArray dataArray = doc.as<JsonArray>();
    for (JsonObject item : dataArray) {
      String machineId = item["machineId"].as<String>();
      int incomingPulseCount = item["machinePulseCount"].as<int>();

      updateMachinePulseCount(machineId, incomingPulseCount);
 updateActualPulseCount(machineId, incomingPulseCount);
//      if (!sendToServer(incomingData)) {
//        Serial.println("POST request failed. Data will be stored in EEPROM.");
//      }
 for (int i = 0; i < NUM_MACHINES; i++) {
    if (machineArray[i].machineId == machineId) { // Check if Actual >= Target
      if (machineArray[i].Actual >= machineArray[i].Target) {
         checkIfTargetCompleted(machineId);
        }
        }
        }
     
    }

    }
  }

 // Handle stored data when WiFi is connected and if there is data in memory
  if (WiFi.status() == WL_CONNECTED) {
    bool hasDataToSend = false;

    // Check if there is data to send in memory (machineArray)
    for (int i = 0; i < NUM_MACHINES; ++i) {
      if (machineArray[i].machinePulseCount > 0) {
        hasDataToSend = true;
        break;
      }
    }

    // Call handleStoredData() only if there is data to send
    if (hasDataToSend) {
      handleStoredData();  // Now works with machineArray[] instead of EEPROM
    }
  }

  delay(1000); // Delay to avoid spamming
}

void updateMachinePulseCount(String machineId, int incomingPulseCount) {
  for (int i = 0; i < NUM_MACHINES; ++i) {
    if (machineArray[i].machineId == machineId) {
      machineArray[i].machinePulseCount += incomingPulseCount;
      break;
    }
  }
}

bool sendToServer(String data) {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    WiFiClient client;
    http.begin(client, serverUrl);
    http.addHeader("Content-Type", "application/json");

    int httpResponseCode = http.POST(data);
    bool success = (httpResponseCode > 0);

   if (success) {
      String response = http.getString();
      // Parse response and update Target and Actual
      DynamicJsonDocument doc(1024);
      deserializeJson(doc, response);

      // Extract values from the parsed JSON
  int masterPulse = doc["masterPulse"].as<int>();     // Direct access, no [0] needed
  int actualLiveCount = doc["live_count"].as<int>();  // Direct access, no [0] needed
  String machineId = doc["machineId"].as<String>();

  // Send the values to Serial1 directly
  Serial1.print("MachineId: ");
  Serial1.print(machineId);
  Serial1.print(", Master Pulse: ");
  Serial1.print(masterPulse);
  Serial1.print(", Actual Live Count: ");
  Serial1.println(actualLiveCount);


      updateTargetAndActual(machineId, masterPulse, actualLiveCount);
      Serial.println("Response:");
      Serial.println(response);
      Serial1.println(response);
      return true;  // Success
    } else {
//      Serial.print("Error on sending POST: ");
//      Serial.println(httpResponseCode);
      return false;  // fails
    }
    http.end();
    return success;
  } else {
    Serial.println("WiFi Disconnected");
    return false;
  }
}

void handleStoredData() {
  for (int i = 0; i < NUM_MACHINES; ++i) {
    while (machineArray[i].machinePulseCount > 0) {
      String jsonData = String("{\"Esp\":\"") + machineArray[i].Esp +
                        "\",\"machineId\":\"" + machineArray[i].machineId +
                        "\",\"machinePulseCount\":1," +
                        "\"target\":\"" + machineArray[i].Target +
                        "\",\"actual\":\"" + machineArray[i].Actual + "\"}";

      if (sendToServer(jsonData)) {
        machineArray[i].machinePulseCount--;
      } else {
        break; // Exit if sending fails
      }
    }
  }
}







void sendHighDurationDataToServer(String data) {
  // Define a different server URL for high-duration events
  const char* highDurationServerUrl = "http://192.168.1.109:3001/api/processMachineData"; // Change the URL accordingly

  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    WiFiClient client;
    http.begin(client, highDurationServerUrl);  // Use the WiFiClient object

    // Specify content type and prepare payload
    http.addHeader("Content-Type", "application/json");

    // Send POST request
    int httpResponseCode = http.POST(data);

    // Check response
    if (httpResponseCode > 0) {
      String response = http.getString();  // Get response
      Serial.println("Response from high-duration API:");
      Serial.println(response);

      // Forward server response to Pico via Serial1
      Serial1.println(response);
    } else {
      Serial.print("Error on sending POST to high-duration API: ");
      Serial.println(httpResponseCode);
    }

    http.end();  // End the connection
  } else {
    Serial.println("WiFi Disconnected");
  }
}


void updateTargetAndActual(String machineId, int target, int actual) {
  for (int i = 0; i < NUM_MACHINES; ++i) {
    if (machineArray[i].machineId == machineId) {
      machineArray[i].Target = target;
      machineArray[i].Actual = actual;
      break;
    }
  }
}


void updateActualPulseCount(String machineId, int incomingPulseCount) {
  for (int i = 0; i < NUM_MACHINES; ++i) {
    if (machineArray[i].machineId == machineId) {
      machineArray[i].Actual += incomingPulseCount;
      break;
    }
  }
}



void checkIfTargetCompleted(String machineId) {
  for (int i = 0; i < NUM_MACHINES; i++) {
    if (machineArray[i].machineId == machineId) { // Check if Actual >= Target
      if (machineArray[i].Actual >= machineArray[i].Target) {
//           Serial.print("actualll");
//        Serial.println(machineArray[i].Actual);
//            Serial.print("targett");
//        Serial.println(machineArray[i].Target);
//         Serial.println("machineId");
//         Serial.println(machineId);
//        Serial1.print("Target completed for machineId: ");
//        Serial1.println(machineId);
// Reset Actual to 0 for the specific machineId
        machineArray[i].Actual = 0;
         Serial.print("send successfulyy of targetcheck");
          Serial.println(machineId);
        }
        }
        }
        }  

