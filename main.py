from fastapi import FastAPI, Form, UploadFile, File, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from motor.motor_asyncio import AsyncIOMotorClient
from typing import List
from email.message import EmailMessage
import shutil
import os
import aiosmtplib
from dotenv import load_dotenv
from bson import ObjectId

load_dotenv()

app = FastAPI()

# CORS setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Upload directory
UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

# MongoDB setup
client = AsyncIOMotorClient(os.getenv("MONGO_URL"))
db = client.acars
car_collection = db.car_submissions
contact_collection = db.contact_submissions

# Admin auth
security = HTTPBearer()
ADMIN_TOKEN = os.getenv("ADMIN_TOKEN", "secret123")

def verify_admin(credentials: HTTPAuthorizationCredentials = Depends(security)):
    if credentials.credentials != ADMIN_TOKEN:
        raise HTTPException(status_code=403, detail="Not authorized")

@app.get("/")
def index():
    return {"message": "A-Cars FastAPI backend is running"}

# Handle Sell Car form
@app.post("/api/sell-car")
async def sell_car(
    carName: str = Form(...),
    carModel: str = Form(...),
    carDescription: str = Form(...),
    mediaFiles: List[UploadFile] = File(...)
):
    saved_files = []
    for file in mediaFiles:
        file_location = os.path.join(UPLOAD_DIR, file.filename)
        with open(file_location, "wb") as f:
            shutil.copyfileobj(file.file, f)
        saved_files.append(file.filename)

    car_data = {
        "name": carName,
        "model": carModel,
        "description": carDescription,
        "media_files": saved_files
    }
    await car_collection.insert_one(car_data)

    return {"message": "Car submitted successfully", "data": car_data}

# Handle Contact form
@app.post("/api/contact")
async def contact(
    name: str = Form(...),
    email: str = Form(...),
    number: str = Form(...),
    message: str = Form(...)
):
    msg = EmailMessage()
    msg["From"] = os.getenv("MAIL_USERNAME")
    msg["To"] = "acarsadvisor@gmail.com"
    msg["Subject"] = "New Contact Message"
    msg.set_content(f"Name: {name}\nEmail: {email}\nNumber: {number}\n\n{message}")

    await aiosmtplib.send(
        msg,
        hostname="smtp.gmail.com",
        port=587,
        username=os.getenv("MAIL_USERNAME"),
        password=os.getenv("MAIL_PASSWORD"),
        start_tls=True
    )

    await contact_collection.insert_one({
        "name": name,
        "email": email,
        "number": number,
        "message": message
    })

    return {"message": "Message received and email sent"}

# CRUD: Get all cars
@app.get("/api/cars")
async def get_all_cars():
    cars = []
    async for car in car_collection.find():
        car["_id"] = str(car["_id"])
        cars.append(car)
    return cars

# CRUD: Get single car
@app.get("/api/cars/{car_id}")
async def get_car(car_id: str):
    car = await car_collection.find_one({"_id": ObjectId(car_id)})
    if not car:
        raise HTTPException(status_code=404, detail="Car not found")
    car["_id"] = str(car["_id"])
    return car

# CRUD: Update car
@app.put("/api/cars/{car_id}")
async def update_car(car_id: str, updated_data: dict, credentials: HTTPAuthorizationCredentials = Depends(verify_admin)):
    result = await car_collection.update_one({"_id": ObjectId(car_id)}, {"$set": updated_data})
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Update failed")
    return {"message": "Car updated"}

# CRUD: Delete car
@app.delete("/api/cars/{car_id}")
async def delete_car(car_id: str, credentials: HTTPAuthorizationCredentials = Depends(verify_admin)):
    result = await car_collection.delete_one({"_id": ObjectId(car_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Car not found")
    return {"message": "Car deleted"}
