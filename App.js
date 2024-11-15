import React, { useState, useRef, useEffect } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Camera, CameraType } from 'expo-camera/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import { Buffer } from 'buffer';
import { decode as atob, encode as btoa } from 'base-64';

// Polyfill for global Buffer
global.Buffer = global.Buffer || Buffer;

export default function App() {
  const [type, setType] = useState(Camera.Constants.Type.back);
  const [permission, requestPermission] = Camera.useCameraPermissions();
  const cameraRef = useRef(null);
  const [websocket, setWebsocket] = useState(null);
  const [prediction, setPrediction] = useState(null);

  useEffect(() => {
    // Request camera permissions on mount
    requestPermission();
  }, []);

  useEffect(() => {
    // Establish WebSocket connection
    // Replace 'ws://your_server_ip:8000/ws' with your server's IP and port
    const ws = new WebSocket('ws://192.168.10.107:8000/ws');

    ws.onopen = () => {
      console.log('WebSocket connection opened.');
      setWebsocket(ws);
    };

    ws.onmessage = (event) => {
      // Parse the JSON response
      const data = JSON.parse(event.data);
      if (data.error) {
        console.log(data.error);
      } else {
        console.log('Prediction:', data.prediction);
        console.log('Probabilities:', data.probabilities);
        setPrediction(data);
      }
    };

    ws.onerror = (error) => {
      console.log('WebSocket error:', error);
    };

    ws.onclose = () => {
      console.log('WebSocket connection closed.');
    };

    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, []);

  useEffect(() => {
    let interval;
    if (websocket && websocket.readyState === WebSocket.OPEN) {
      interval = setInterval(() => {
        captureAndSendImage();
      }, 1000); // Send image every 1 second
    }
    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [websocket]);

  const captureAndSendImage = async () => {
    if (cameraRef.current && websocket && websocket.readyState === WebSocket.OPEN) {
      try {
        const photo = await cameraRef.current.takePictureAsync({ quality: 0.5, base64: true });
        // Optionally resize or manipulate image
        const manipResult = await ImageManipulator.manipulateAsync(
          photo.uri,
          [],
          { compress: 0.5, format: ImageManipulator.SaveFormat.JPEG, base64: true }
        );
        // Convert base64 to binary array
        const imageBytes = Buffer.from(manipResult.base64, 'base64');

        // Send image bytes to the server
        websocket.send(imageBytes);
      } catch (error) {
        console.log('Error capturing image:', error);
      }
    }
  };

  const toggleCameraType = () => {
    setType((current) =>
      current === Camera.Constants.Type.back ? Camera.Constants.Type.front : Camera.Constants.Type.back
    );
  };

  if (!permission || !permission.granted) {
    // Display permission UI
    return (
      <View style={styles.container}>
        <Text style={styles.text}>We need your permission to access the camera.</Text>
        <TouchableOpacity onPress={requestPermission}>
          <Text style={{ color: 'blue' }}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Camera style={styles.camera} type={type} ref={cameraRef}>
        <View style={styles.controls}>
          <TouchableOpacity style={styles.button} onPress={toggleCameraType}>
            <Text style={styles.buttonText}>Flip Camera</Text>
          </TouchableOpacity>
          {prediction && (
            <View style={styles.predictionContainer}>
              <Text style={styles.predictionText}>Prediction: {prediction.prediction}</Text>
              <Text style={styles.predictionText}>Probabilities:</Text>
              {prediction.class_indices &&
                Object.entries(prediction.class_indices).map(([index, className]) => (
                  <Text key={index} style={styles.predictionText}>
                    {className}: {prediction.probabilities[index]}
                  </Text>
                ))}
            </View>
          )}
        </View>
      </Camera>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  camera: {
    flex: 1,
  },
  controls: {
    flex: 1,
    justifyContent: 'space-between',
    padding: 20,
  },
  predictionContainer: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 10,
    borderRadius: 5,
  },
  predictionText: {
    color: 'white',
    fontSize: 16,
  },
  button: {
    alignSelf: 'center',
    backgroundColor: '#fff',
    borderRadius: 5,
    padding: 10,
  },
  buttonText: {
    color: '#000',
  },
  text: {
    color: 'white',
  },
});
