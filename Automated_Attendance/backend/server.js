// server.js
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bodyParser = require("body-parser");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const nodemailer = require('nodemailer');
const twilio = require('twilio');
const libphonenumber = require('libphonenumber-js');

require("dotenv").config();

const MONGO_URI = process.env.MONGO_URI;
const JWT_SECRET = process.env.JWT_SECRET;
const PORT = process.env.PORT || 5000;


// Initialize Express app
const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: "10mb" })); // Increased limit for face descriptors

// Connect to MongoDB
mongoose
  .connect(MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("MongoDB connection error:", err));

// Catch unhandled errors
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});

// Models
const adminSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  institutionDomain: { type: String, required: true },
});

adminSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  try {
    this.password = await bcrypt.hash(this.password, 10);
    next();
  } catch (err) {
    console.error("Password hash error:", err);
    next(err);
  }
});

adminSchema.methods.comparePassword = async function (password) {
  return bcrypt.compare(password, this.password);
};

const Admin = mongoose.model("Admin", adminSchema);

const teacherSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  classAssigned: { type: String, required: true },
});

teacherSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  try {
    this.password = await bcrypt.hash(this.password, 10);
    next();
  } catch (err) {
    console.error("Password hash error:", err);
    next(err);
  }
});

teacherSchema.methods.comparePassword = async function (password) {
  return bcrypt.compare(password, this.password);
};

const Teacher = mongoose.model("Teacher", teacherSchema);

const studentSchema = new mongoose.Schema({
  fullName: { type: String, required: true },
  rollNo: { type: String, required: true, unique: true },
  className: { type: String, required: true },
  section: { type: String, required: true },
  parentName: { type: String, required: true },
  parentNumber: { type: String, required: true },
  faceDescriptors: String, // Store as JSON string for Dexie sync
});

const Student = mongoose.model("Student", studentSchema);

const attendanceSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true },
  date: { type: Date, default: Date.now },
  status: { type: String, enum: ["Present", "Absent"], required: true },
  className: { type: String },
  confidence: { type: String },
  timestamp: { type: Date },
});

const Attendance = mongoose.model("Attendance", attendanceSchema);

// Authentication Middleware
const auth = (req, res, next) => {
  const token = req.header("Authorization")?.replace("Bearer ", "");
  if (!token) {
    console.log("No token provided");
    return res.status(401).json({ message: "No token provided" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    console.log("Token decoded:", decoded);
    req.user = decoded;
    next();
  } catch (err) {
    console.error("Token verification error:", err);
    res.status(401).json({ message: "Invalid token" });
  }
};

// Email Transporter (Gmail example)
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Twilio Client
const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// Email Template Function
const generateEmailTemplate = (student, status, className, date, schoolName = "Your School") => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 0; background-color: #f4f4f4; }
        .container { max-width: 600px; margin: 20px auto; background: #ffffff; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .header { text-align: center; padding: 10px 0; background: #007bff; color: white; border-radius: 8px 8px 0 0; }
        .header img { max-width: 150px; height: auto; }
        .content { padding: 20px; }
        .content h2 { color: #333; }
        .content p { color: #555; line-height: 1.6; }
        .table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        .table th, .table td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        .table th { background: #f8f8f8; }
        .footer { text-align: center; padding: 10px; font-size: 12px; color: #777; }
        .btn { display: inline-block; padding: 10px 20px; background: #007bff; color: white; text-decoration: none; border-radius: 4px; }
        @media (max-width: 600px) { .container { padding: 10px; } .header img { max-width: 100px; } }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <img src="https://via.placeholder.com/150x50?text=School+Logo" alt="${schoolName} Logo">
          <h1>Attendance Notification</h1>
        </div>
        <div class="content">
          <h2>Dear Parent/Guardian,</h2>
          <p>We are informing you about the attendance status of your child, ${student.fullName}.</p>
          <table class="table">
            <tr><th>Student Name</th><td>${student.fullName}</td></tr>
            <tr><th>Roll Number</th><td>${student.rollNo}</td></tr>
            <tr><th>Class</th><td>${className || 'N/A'}</td></tr>
            <tr><th>Status</th><td>${status}</td></tr>
            <tr><th>Date</th><td>${date}</td></tr>
          </table>
          <p>Please ensure your child attends classes on time. Contact the school office for any questions.</p>
          <a href="mailto:support@${schoolName.toLowerCase().replace(/\s/g, '')}.edu" class="btn">Contact School</a>
        </div>
        <div class="footer">
          <p>© ${new Date().getFullYear()} ${schoolName}. All rights reserved.</p>
          <p>Contact us at support@${schoolName.toLowerCase().replace(/\s/g, '')}.edu</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

// SMS Template Function
const generateSMSTemplate = (student, status, className, date, schoolName = "Your School") => {
  const statusText = status.toLowerCase();
  const message = `Dear Parent, ${student.fullName} was ${statusText} for ${className || 'class'} on ${date}. Contact ${schoolName}.`;
  return message.length > 160 ? message.substring(0, 157) + '...' : message; // Twilio SMS limit: 160 chars
};

// Sync Endpoint for Dexie.Syncable
app.post("/sync", async (req, res) => {
  const { changes, lastSeq } = req.body;

  try {
    for (const change of changes) {
      if (change.table === "students") {
        await Student.findOneAndUpdate(
          { rollNo: change.key.rollNo },
          {
            ...change.obj,
            faceDescriptors: change.obj.faceDescriptors, // Ensure JSON string is preserved
            updatedAt: new Date(),
          },
          { upsert: true, new: true }
        );
      } else if (change.table === "attendance") {
        const student = await Student.findOne({ rollNo: change.obj.studentId });
        if (!student) continue;
        await Attendance.findOneAndUpdate(
          { student: student._id, date: change.obj.date },
          {
            ...change.obj,
            student: student._id,
          },
          { upsert: true, new: true }
        );
      }
    }

    // Fetch server changes (simplified; enhance based on needs)
    const serverChanges = await getServerChanges(lastSeq);
    res.json({ ok: true, changes: serverChanges, seq: Date.now() });
  } catch (err) {
    console.error("Sync error:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

async function getServerChanges(lastSeq) {
  const students = await Student.find({ updatedAt: { $gt: new Date(lastSeq) } });
  const attendance = await Attendance.find({ timestamp: { $gt: new Date(lastSeq) } }).populate(
    "student"
  );
  return [
    ...students.map((s) => ({
      table: "students",
      key: s.rollNo,
      obj: {
        fullName: s.fullName,
        rollNo: s.rollNo,
        className: s.className,
        section: s.section,
        parentName: s.parentName,
        parentNumber: s.parentNumber,
        faceDescriptors: s.faceDescriptors,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      },
    })),
    ...attendance.map((a) => ({
      table: "attendance",
      key: { studentId: a.student.rollNo, date: a.date },
      obj: {
        studentId: a.student.rollNo,
        date: a.date,
        status: a.status,
        className: a.className,
        confidence: a.confidence,
        timestamp: a.timestamp,
      },
    })),
  ];
}

// Admin Routes
app.post("/api/admin/register", async (req, res) => {
  try {
    const { name, email, password, institutionDomain } = req.body;
    if (!name || !email || !password || !institutionDomain) {
      return res.status(400).json({ message: "All fields are required" });
    }
    console.log("Registering admin:", { name, email });
    const existingAdmin = await Admin.findOne({ email });
    if (existingAdmin) {
      return res.status(400).json({ message: "Email already exists" });
    }
    const admin = new Admin({ name, email, password, institutionDomain });
    await admin.save();
    console.log("Admin saved:", admin.email);
    res.status(201).json({ message: "Admin registered successfully" });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ message: "Registration failed: " + err.message });
  }
});

app.post("/api/admin/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }
    console.log("Login attempt:", { email });
    const admin = await Admin.findOne({ email: email.toLowerCase() });
    console.log("Admin found:", admin ? admin.email : null);
    if (!admin) {
      return res.status(401).json({ message: "Invalid email" });
    }
    const isMatch = await admin.comparePassword(password);
    console.log("Password match:", isMatch);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid password" });
    }
    const token = jwt.sign({ id: admin._id, role: "admin" }, JWT_SECRET, {
      expiresIn: "1h",
    });
    res.json({ token });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Server error: " + err.message });
  }
});

app.get("/api/admin/stats", auth, async (req, res) => {
  try {
    const totalStudents = await Student.countDocuments();
    const totalRecords = await Attendance.countDocuments();
    const totalPresent = await Attendance.countDocuments({ status: "Present" });
    const totalAbsent = totalRecords - totalPresent;
    const attendanceRate =
      totalRecords > 0 ? Math.round((totalPresent / totalRecords) * 100) : 0;
    res.json({ totalStudents, totalRecords, totalPresent, totalAbsent, attendanceRate });
  } catch (err) {
    console.error("Stats error:", err);
    res.status(500).json({ message: "Failed to fetch stats: " + err.message });
  }
});

// Teacher Routes
app.post("/api/teachers/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }
    console.log("Teacher login attempt:", { email });
    const teacher = await Teacher.findOne({ email: email.toLowerCase() });
    console.log("Teacher found:", teacher ? teacher.email : null);
    if (!teacher) {
      return res.status(401).json({ message: "Invalid email" });
    }
    const isMatch = await teacher.comparePassword(password);
    console.log("Password match:", isMatch);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid password" });
    }
    const token = jwt.sign({ id: teacher._id, role: "teacher" }, JWT_SECRET, {
      expiresIn: "1h",
    });
    res.json({ token });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Server error: " + err.message });
  }
});

app.post("/api/teachers/register", async (req, res) => {
  try {
    const { name, email, password, classAssigned } = req.body;
    if (!name || !email || !password || !classAssigned) {
      return res.status(400).json({ message: "All fields are required" });
    }
    console.log("Registering teacher:", { name, email });
    const existingTeacher = await Teacher.findOne({ email });
    if (existingTeacher) {
      return res.status(400).json({ message: "Email already exists" });
    }
    const teacher = new Teacher({ name, email, password, classAssigned });
    await teacher.save();
    console.log("Teacher saved:", teacher.email);
    res.status(201).json({ message: "Teacher registered successfully" });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ message: "Registration failed: " + err.message });
  }
});

app.get("/api/teachers", auth, async (req, res) => {
  try {
    const teachers = await Teacher.find();
    res.json(teachers);
  } catch (err) {
    console.error("Error fetching teachers:", err);
    res.status(500).json({ message: "Failed to fetch teachers: " + err.message });
  }
});

// Student Routes
app.post("/api/students/register", auth, async (req, res) => {
  try {
    const { fullName, rollNo, className, section, parentName, parentNumber } = req.body;
    if (!fullName || !rollNo || !className || !section || !parentName || !parentNumber) {
      return res.status(400).json({ message: "All fields are required" });
    }
    console.log("Registering student:", { fullName, rollNo });
    const existingStudent = await Student.findOne({ rollNo });
    if (existingStudent) {
      return res.status(400).json({ message: "Roll number already exists" });
    }
    const student = new Student({
      fullName,
      rollNo,
      className,
      section,
      parentName,
      parentNumber,
      faceDescriptors: "[]", // Default empty if not provided
    });
    await student.save();
    console.log("Student saved:", student.rollNo);
    res.status(201).json({ message: "Student registered successfully" });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ message: "Registration failed: " + err.message });
  }
});

app.get("/api/students", auth, async (req, res) => {
  try {
    const students = await Student.find();
    res.json(students);
  } catch (err) {
    console.error("Error fetching students:", err);
    res.status(500).json({ message: "Failed to fetch students: " + err.message });
  }
});

// Attendance Routes
app.post("/api/attendance/mark", auth, async (req, res) => {
  try {
    const { records } = req.body;
    if (!records || !Array.isArray(records)) {
      return res.status(400).json({ message: "Valid records array is required" });
    }
    console.log("Marking attendance for records:", records.length);

    const attendanceRecords = await Promise.all(
      records.map(async (record) => {
        const student = await Student.findOne({ rollNo: record.rollNo });
        if (!student) {
          console.warn(`Student not found for rollNo: ${record.rollNo}`);
          return null;
        }
        return new Attendance({
          student: student._id,
          date: new Date(),
          status: record.status,
          className: "Manual", // Can be enhanced to accept className
          confidence: "Manual",
          timestamp: new Date(),
        });
      })
    );

    const validRecords = attendanceRecords.filter((r) => r !== null);
    await Attendance.insertMany(validRecords);
    console.log("Attendance marked for:", validRecords.length);
    res.json({ message: "Attendance marked successfully" });
  } catch (err) {
    console.error("Attendance marking error:", err);
    res.status(500).json({ message: "Failed to mark attendance: " + err.message });
  }
});

app.get("/api/attendance/report", auth, async (req, res) => {
  try {
    const attendance = await Attendance.find()
      .populate("student", "fullName rollNo className")
      .sort({ date: -1 });
    res.json(attendance);
  } catch (err) {
    console.error("Error fetching attendance report:", err);
    res.status(500).json({ message: "Failed to fetch attendance report: " + err.message });
  }
});

// Protected: Send Email Notifications
app.post('/api/notifications/send-email', auth, async (req, res) => {
  try {
    const { students, status, className, date, schoolName } = req.body; // students: array of { fullName, rollNo, parentEmail }
    
    if (!students || !Array.isArray(students) || students.length === 0) {
      return res.status(400).json({ message: 'Students array is required' });
    }

    const sendPromises = students.map(async (student) => {
      if (!student.parentEmail) return { success: false, error: 'No parent email', student: student.fullName };

      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: student.parentEmail,
        subject: `Attendance Alert: ${student.fullName} - ${status}`,
        html: generateEmailTemplate(student, status, className, date, schoolName),
      };

      try {
        await transporter.sendMail(mailOptions);
        console.log(`Email sent to ${student.parentEmail} for ${student.fullName}`);
        return { success: true, student: student.fullName };
      } catch (emailErr) {
        console.error(`Email failed for ${student.parentEmail}:`, emailErr);
        return { success: false, error: emailErr.message, student: student.fullName };
      }
    });

    const results = await Promise.all(sendPromises);
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success);

    res.json({
      message: `Emails sent successfully to ${successful} parents. Failed: ${failed.length}`,
      details: { successful, failed: failed.map(f => ({ student: f.student, error: f.error })) }
    });
  } catch (err) {
    console.error('Email sending error:', err);
    res.status(500).json({ message: 'Failed to send emails: ' + err.message });
  }
});

// Protected: Send SMS Notifications
app.post('/api/notifications/send-sms', auth, async (req, res) => {
  try {
    const { students, status, className, date, schoolName } = req.body; // students: array of { fullName, rollNo, parentNumber }
    
    if (!students || !Array.isArray(students) || students.length === 0) {
      return res.status(400).json({ message: 'Students array is required' });
    }

    const sendPromises = students.map(async (student) => {
      if (!student.parentNumber) return { success: false, error: 'No parent phone', student: student.fullName };

      const phoneNumber = student.parentNumber.startsWith('+') ? student.parentNumber : `+${student.parentNumber}`;
      const message = generateSMSTemplate(student, status, className, date, schoolName);

      try {
        await twilioClient.messages.create({
          body: message,
          from: process.env.TWILIO_PHONE_NUMBER,
          to: phoneNumber,
        });
        console.log(`SMS sent to ${student.parentNumber} for ${student.fullName}`);
        return { success: true, student: student.fullName };
      } catch (smsErr) {
        console.error(`SMS failed for ${student.parentNumber}:`, smsErr);
        return { success: false, error: smsErr.message, student: student.fullName };
      }
    });

    const results = await Promise.all(sendPromises);
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success);

    res.json({
      message: `SMS sent successfully to ${successful} parents. Failed: ${failed.length}`,
      details: { successful, failed: failed.map(f => ({ student: f.student, error: f.error })) }
    });
  } catch (err) {
    console.error('SMS sending error:', err);
    res.status(500).json({ message: 'Failed to send SMS: ' + err.message });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received. Shutting down gracefully...");
  mongoose.connection.close(() => {
    console.log("MongoDB connection closed.");
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  console.log("SIGINT received. Shutting down gracefully...");
  mongoose.connection.close(() => {
    console.log("MongoDB connection closed.");
    process.exit(0);
  });
});