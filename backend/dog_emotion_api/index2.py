from fastapi import FastAPI, WebSocket, WebSocketDisconnect
import torch
from torchvision import transforms
from PIL import Image
import io
import asyncio
import torch.nn.functional as F

# Initialize FastAPI app
app = FastAPI()

# Load YOLO model for dog detection (assuming using YOLOv5)
yolo_model = torch.hub.load('ultralytics/yolov5', 'yolov5s', pretrained=True, trust_repo=True)

# Load your custom model
model = torch.load('model_4.pth', map_location=torch.device('cpu'))
model.eval()

# Define the image transformation
transform = transforms.Compose([
    transforms.Resize((224, 224)),  # Resize images to 224x224
    transforms.ToTensor(),          # Convert image to PyTorch tensor
    transforms.Normalize(mean=[0.485, 0.456, 0.406],
                         std=[0.229, 0.224, 0.225])  # Normalize to [-1, 1]
])

# Define class names according to your indices
class_names = {0: 'sad', 1: 'angry', 2: 'happy', 3: 'relaxed'}

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            # Receive image data from client
            image_bytes = await websocket.receive_bytes()
            # Load image
            image = Image.open(io.BytesIO(image_bytes)).convert('RGB')

            # Detect dogs using YOLO model
            results = yolo_model([image])
            detections = results.xyxy[0]  # Get detections for the first image

            # Filter detections for dogs (class 'dog' in YOLOv5 is class index 16)
            dog_detections = [d for d in detections if int(d[5]) == 16]

            if dog_detections:
                # Take the first detected dog
                dog = dog_detections[0]

                # Crop the dog from the image
                xmin = int(dog[0].item())
                ymin = int(dog[1].item())
                xmax = int(dog[2].item())
                ymax = int(dog[3].item())
                dog_image = image.crop((xmin, ymin, xmax, ymax))

                # Transform the image
                input_tensor = transform(dog_image)
                input_batch = input_tensor.unsqueeze(0)  # Create batch dimension

                # Get prediction
                with torch.no_grad():
                    output = model(input_batch)
                    # Apply softmax to get probabilities
                    probabilities = F.softmax(output, dim=1)

                    # Get the predicted class
                    _, predicted = torch.max(output, 1)
                    prediction = predicted.item()
                    predicted_class = class_names[prediction]

                    # Prepare response data
                    response = {
                        'prediction': predicted_class,
                        'probabilities': probabilities[0].tolist(),  # Convert tensor to list
                        'class_indices': class_names
                    }

                # Send prediction back to client
                await websocket.send_json(response)
            else:
                # No dog detected
                await websocket.send_json({"error": "No dog detected in the image."})

            # Wait for 1 second before processing next image
            await asyncio.sleep(1)
    except WebSocketDisconnect:
        print("Client disconnected")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("index2:app", host="0.0.0.0", port=8000, log_level="info")