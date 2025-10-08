// server.js

import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import QRCode from "qrcode";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import PDFDocument from "pdfkit";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// --- MongoDB setup ---
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/attendance_db";
mongoose
  .connect(MONGO_URI)
  .then(() => console.log("✅ Connected to MongoDB"))
  .catch((err) => console.error("❌ MongoDB error:", err));

// --- Schema & Models ---
const adminSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  passwordHash: String,
  institutionDomain: String,
});
const Admin = mongoose.model("Admin", adminSchema);

const teacherSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  passwordHash: String,
  classAssigned: String,
});
const Teacher = mongoose.model("Teacher", teacherSchema);

const studentSchema = new mongoose.Schema({
  fullName: String,
  rollNo: { type: String, unique: true },
  className: String,
  section: String,
  parentName: String,
  parentNumber: String,
  qrCode: String,
  descriptor: String,  // New: Store face descriptor as JSON string
});
const Student = mongoose.model("Student", studentSchema);

const attendanceSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: "Student" },
  date: String,
  status: { type: String, enum: ["Present", "Absent"] },
});
const Attendance = mongoose.model("Attendance", attendanceSchema);

// --- Helpers & Middleware ---
async function generateQRCode(studentData) {
  const qrString = JSON.stringify(studentData);
  return QRCode.toDataURL(qrString);
}

function authMiddleware(requiredRole = "admin") {
  return async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ message: "No token provided" });
    const token = authHeader.split(" ")[1];
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || "secret");
      if (decoded.role !== requiredRole) return res.status(403).json({ message: "Forbidden" });
      req.user = decoded;
      next();
    } catch (err) {
      res.status(401).json({ message: "Invalid token" });
    }
  };
}

// --- Auth Routes ---
app.post("/api/admin/register", async (req, res) => {
  const { name, email, password, institutionDomain } = req.body;
  const passwordHash = await bcrypt.hash(password, 10);
  const admin = new Admin({ name, email, passwordHash, institutionDomain });
  await admin.save();
  res.json({ message: "Admin registered" });
});

app.post("/api/admin/login", async (req, res) => {
  const { email, password } = req.body;
  const admin = await Admin.findOne({ email });
  if (!admin || !(await bcrypt.compare(password, admin.passwordHash))) {
    return res.status(401).json({ message: "Invalid credentials" });
  }
  const token = jwt.sign({ id: admin._id, role: "admin" }, process.env.JWT_SECRET || "secret", { expiresIn: "1d" });
  res.json({ token, role: "admin" });
});

app.post("/api/teachers/register", authMiddleware("admin"), async (req, res) => {
  const { name, email, password, classAssigned } = req.body;
  const passwordHash = await bcrypt.hash(password, 10);
  const teacher = new Teacher({ name, email, passwordHash, classAssigned });
  await teacher.save();
  res.json({ message: "Teacher added" });
});

app.post("/api/teachers/login", async (req, res) => {
  const { email, password } = req.body;
  const teacher = await Teacher.findOne({ email });
  if (!teacher || !(await bcrypt.compare(password, teacher.passwordHash))) {
    return res.status(401).json({ message: "Invalid credentials" });
  }
  const token = jwt.sign({ id: teacher._id, role: "teacher" }, process.env.JWT_SECRET || "secret", { expiresIn: "1d" });
  res.json({ token, role: "teacher" });
});

// --- Teacher Routes ---
app.get("/api/teachers", authMiddleware("admin"), async (req, res) => {
  res.json(await Teacher.find());
});

// --- Student Routes ---
app.post("/api/students", authMiddleware("admin"), async (req, res) => {
  const studentData = req.body;
  studentData.qrCode = await generateQRCode(studentData);
  const student = new Student(studentData);
  await student.save();
  res.json(student);
});

app.get("/api/students", authMiddleware(), async (req, res) => {
  res.json(await Student.find());
});

// New: Update student face descriptor (called from teacher enrollment)
app.patch("/api/students/:id/descriptor", authMiddleware("teacher"), async (req, res) => {
  const { descriptor } = req.body;
  const student = await Student.findByIdAndUpdate(req.params.id, { descriptor }, { new: true });
  if (!student) return res.status(404).json({ message: "Student not found" });
  res.json(student);
});

// --- Attendance Routes ---
app.post("/api/attendance", authMiddleware(), async (req, res) => {
  const attendance = new Attendance(req.body);
  await attendance.save();
  res.json(attendance);
});

app.get("/api/attendance", authMiddleware(), async (req, res) => {
  res.json(await Attendance.find().populate("student"));
});

// --- Stats Route ---
app.get("/api/stats", authMiddleware(), async (req, res) => {
  const stats = {
    totalTeachers: await Teacher.countDocuments(),
    totalStudents: await Student.countDocuments(),
    attendanceToday: await Attendance.countDocuments({ date: new Date().toISOString().split("T")[0] }),
  };
  res.json(stats);
});

// --- Export Routes ---
// CSV export for attendance
app.get("/api/attendance/export/csv", authMiddleware("admin"), async (req, res) => {
  const records = await Attendance.find().populate("student", "fullName rollNo className");
  if (!records.length) return res.status(404).json({ message: "No attendance data" });

  const headers = ["date", "studentName", "rollNo", "className", "status"];
  const lines = records.map((r) => [r.date, r.student?.fullName || "", r.student?.rollNo || "", r.student?.className || "", r.status].map((v) => `"${v}"`).join(","));
  const csv = [headers.join(","), ...lines].join("\n");

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename=attendance_export.csv`);
  res.send(csv);
});

// PDF export for attendance
app.get("/api/attendance/export/pdf", authMiddleware("admin"), async (req, res) => {
  const records = await Attendance.find().populate("student", "fullName rollNo className");
  const doc = new PDFDocument({ margin: 30, size: "A4" });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename=attendance_report.pdf`);

  doc.pipe(res);

  doc.fontSize(18).text("Attendance Report", { align: "center" });
  doc.moveDown();

  const tableTop = 100;
  const itemSpacing = 20;
  const col = { date: 50, name: 120, roll: 260, cls: 320, status: 400 };
  doc.fontSize(12);
  doc.text("Date", col.date, tableTop);
  doc.text("Name", col.name, tableTop);
  doc.text("Roll", col.roll, tableTop);
  doc.text("Class", col.cls, tableTop);
  doc.text("Status", col.status, tableTop);

  let y = tableTop + 20;
  for (const r of records) {
    const name = r.student?.fullName || "";
    const roll = r.student?.rollNo || "";
    const cls = r.student?.className || "";
    doc.text(r.date, col.date, y);
    doc.text(name, col.name, y);
    doc.text(roll, col.roll, y);
    doc.text(cls, col.cls, y);
    doc.text(r.status, col.status, y);
    y += itemSpacing;
    if (y > doc.page.height - 50) { doc.addPage(); y = 50; }
  }

  doc.end();
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));