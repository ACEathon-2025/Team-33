# Automated Attendance System for Rural Schools

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)  
[![Node.js](https://img.shields.io/badge/Node.js-v14%2B-green)](https://nodejs.org/)

This project is an **Automated Attendance Management System** designed specifically for **rural schools**, where internet connectivity may be unreliable. It leverages **facial recognition technology** to mark student attendance quickly and accurately, reducing manual effort and errors.  

The system also supports **offline operation** with **data synchronization** when online and includes features for notifications to parents via **email or SMS** for absent or late students.  

This repository is part of the **ACEathon-2025 Hackathon** (Team-33).

---

## Features

- **Facial Recognition Attendance:** Automatically detect and mark students as present using a webcam and pre-enrolled face data.  
- **Student and Teacher Management:** Admins can register students (with face enrollment) and teachers. Teachers can create classes and manage attendance sessions.  
- **Notifications:** Send automatic email or SMS alerts to parents for absent or late students, with customizable templates.  
- **Reporting & Analytics:** Generate daily, weekly, or monthly attendance reports. Export data as **CSV** or **PDF**.  
- **Offline Support:** Data is stored locally using **IndexedDB** via **Dexie** and syncs with the server when internet is available.  
- **Security:** Role-based access, JWT authentication, and password hashing.  
- **QR Code Generation:** Generates QR codes for student roll numbers for identification or manual fallback.  

---

## Technologies Used

- **Backend:** Node.js, Express, MongoDB (Mongoose), JWT, Bcrypt, Nodemailer, Twilio  
- **Frontend:** React, face-api.js (TensorFlow.js for facial recognition), Dexie (IndexedDB with sync)  
- **Others:** jsPDF (PDF exports), QRCode.react (QR code generation)  

---

## Prerequisites

- Node.js (v14+)  
- MongoDB (local or cloud like MongoDB Atlas)  
- Webcam (for facial recognition)  
- Email/SMS credentials (Gmail for email, Twilio for SMS)  
- Chrome (recommended for webcam access)  

---

## Setup Instructions

### 1. Clone the Repository
```bash
git clone https://github.com/ACEathon-2025/Team-33.git
cd Team-33

2. Setup Backend

Navigate to the backend folder (or root if server.js is in the root).

Install dependencies:
npm install
Create a .env file in the root and add the following:

MONGO_URI=mongodb://localhost:27017/attendanceDB
JWT_SECRET=your_jwt_secret_key
PORT=5000

EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_email_password

TWILIO_ACCOUNT_SID=your_twilio_sid
TWILIO_AUTH_TOKEN=your_twilio_token
TWILIO_PHONE_NUMBER=+1234567890


Start the backend:

npm start


The server should run on http://localhost:5000
.

3. Setup Frontend

Navigate to the frontend folder.

Install dependencies:

npm install


Copy face recognition models to public/models/ (download from face-api.js).

Start the frontend:

npm start


The app should open at http://localhost:3000
.

4. Usage

Register as Admin: Visit /register and create an admin account.

Login: Use /login as admin or teacher. Admins manage users; teachers manage attendance.

Enroll Students: Teachers capture faces for student enrollment.

Mark Attendance: Create a class and start scanning in the Student module.

Notifications & Reports: Automatically sent or manually generated from the Teacher panel.

Troubleshooting

Ensure webcam permissions are granted in the browser.

Offline mode saves data locally and syncs when online.

Check the console for errors related to models or API connections.

Contributing

Pull requests are welcome! For major changes, please open an issue first.

License

This project is licensed under the MIT License. See the LICENSE
 file for details.


---

If you want, I can also **enhance it further with screenshots, GIFs, and badges for live demo links**, so your GitHub README looks **super professional and attractive**.  

Do you want me to do that next?
