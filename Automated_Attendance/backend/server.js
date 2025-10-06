// server.js

import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import QRCode from "qrcode";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import PDFDocument from "pdfkit";  // for server-side PDF
import { pipeline } from "stream"; // to pipe streams
import { Readable } from "stream";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// --- MongoDB setup ---
const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/attendance_db";
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
});
const Student = mongoose.model("Student", studentSchema);

const attendanceSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: "Student" },
  date: String,       // “YYYY-MM-DD”
  status: { type: String, enum: ["Present", "Absent"] },
});
const Attendance = mongoose.model("Attendance", attendanceSchema);

// --- Helpers & Middleware ---

async function generateQRCode(studentData) {
  const qrString = JSON.stringify(studentData);
  return QRCode.toDataURL(qrString);
}

// Role-based auth middleware
function authMiddleware(requiredRole = "admin") {
  return async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ message: "No token" });
    const token = authHeader.split(" ")[1];
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET || "secretkey");
      req.user = payload; // { userId, role, email }
      if (requiredRole !== "any" && payload.role !== requiredRole) {
        return res.status(403).json({ message: "Forbidden: wrong role" });
      }
      next();
    } catch (err) {
      return res.status(401).json({ message: "Invalid token" });
    }
  };
}

// --- Routes ---

// Health check
app.get("/", (req, res) => {
  res.send("Attendance backend up");
});

// Admin register
app.post("/api/admin/register", async (req, res) => {
  const { name, email, password, institutionDomain } = req.body;
  if (!name || !email || !password || !institutionDomain) {
    return res.status(400).json({ message: "Missing fields" });
  }
  const domain = email.split("@")[1];
  if (domain !== institutionDomain) {
    return res.status(400).json({ message: "Email domain mismatch" });
  }
  const exists = await Admin.findOne({ email });
  if (exists) return res.status(400).json({ message: "Admin exists" });
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(password, salt);
  const admin = new Admin({ name, email, passwordHash, institutionDomain });
  await admin.save();
  return res.status(201).json({ message: "Admin registered" });
});

// Admin login
app.post("/api/admin/login", async (req, res) => {
  const { email, password } = req.body;
  const admin = await Admin.findOne({ email });
  if (!admin) return res.status(400).json({ message: "Invalid credentials" });
  const ok = await bcrypt.compare(password, admin.passwordHash);
  if (!ok) return res.status(400).json({ message: "Invalid credentials" });
  const token = jwt.sign(
    { userId: admin._id, role: "admin", email: admin.email },
    process.env.JWT_SECRET || "secretkey",
    { expiresIn: "8h" }
  );
  res.json({ token, name: admin.name, email: admin.email });
});

// Teacher register (admin only)
app.post("/api/teachers/register", authMiddleware("admin"), async (req, res) => {
  const { name, email, password, classAssigned } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ message: "Missing teacher fields" });
  }
  const exists = await Teacher.findOne({ email });
  if (exists) return res.status(400).json({ message: "Teacher email exists" });
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(password, salt);
  const teacher = new Teacher({ name, email, passwordHash, classAssigned });
  await teacher.save();
  res.status(201).json({ message: "Teacher created", teacher: { id: teacher._id, name: teacher.name, email: teacher.email, classAssigned } });
});

// Teacher login (if needed)
app.post("/api/teacher/login", async (req, res) => {
  const { email, password } = req.body;
  const teacher = await Teacher.findOne({ email });
  if (!teacher) return res.status(400).json({ message: "Invalid credentials" });
  const ok = await bcrypt.compare(password, teacher.passwordHash);
  if (!ok) return res.status(400).json({ message: "Invalid credentials" });
  const token = jwt.sign(
    { userId: teacher._id, role: "teacher", email: teacher.email },
    process.env.JWT_SECRET || "secretkey",
    { expiresIn: "8h" }
  );
  return res.json({ token, name: teacher.name, email: teacher.email, classAssigned: teacher.classAssigned });
});

// List teachers
app.get("/api/teachers", authMiddleware("admin"), async (req, res) => {
  const teachers = await Teacher.find().select("-passwordHash");
  res.json(teachers);
});

// Student register (admin or teacher)
app.post("/api/students/register", authMiddleware("any"), async (req, res) => {
  const { fullName, rollNo, className, section, parentName, parentNumber } = req.body;
  if (!fullName || !rollNo || !className) {
    return res.status(400).json({ message: "Missing student required fields" });
  }
  const exists = await Student.findOne({ rollNo });
  if (exists) return res.status(400).json({ message: "Student exists" });
  const qrCode = await generateQRCode({ fullName, rollNo, className, section, parentName, parentNumber });
  const student = new Student({ fullName, rollNo, className, section, parentName, parentNumber, qrCode });
  await student.save();
  res.status(201).json({ message: "Student registered", student });
});

// List students
app.get("/api/students", authMiddleware("any"), async (req, res) => {
  const students = await Student.find();
  res.json(students);
});

// Delete a student
app.delete("/api/students/:id", authMiddleware("any"), async (req, res) => {
  const student = await Student.findByIdAndDelete(req.params.id);
  if (!student) return res.status(404).json({ message: "Student not found" });
  res.json({ message: "Deleted" });
});

// Mark attendance
app.post("/api/attendance/mark", authMiddleware("any"), async (req, res) => {
  const { rollNo, date, status } = req.body;
  if (!rollNo || !date || !status) {
    return res.status(400).json({ message: "Missing attendance fields" });
  }
  const student = await Student.findOne({ rollNo });
  if (!student) return res.status(404).json({ message: "Student not found" });
  const existing = await Attendance.findOne({ student: student._id, date });
  if (existing) {
    return res.status(400).json({ message: "Already marked" });
  }
  const att = new Attendance({ student: student._id, date, status });
  await att.save();
  res.status(201).json({ message: "Attendance saved", attendance: att });
});

// Attendance report (list)
app.get("/api/attendance/report", authMiddleware("any"), async (req, res) => {
  const { className } = req.query;
  const filter = {};
  if (className) {
    const studs = await Student.find({ className });
    const ids = studs.map((s) => s._id);
    filter.student = { $in: ids };
  }
  const records = await Attendance.find(filter).populate("student", "fullName rollNo className");
  res.json(records);
});

// Admin stats
app.get("/api/admin/stats", authMiddleware("any"), async (req, res) => {
  const totalStudents = await Student.countDocuments();
  const totalRecords = await Attendance.countDocuments();
  const totalPresent = await Attendance.countDocuments({ status: "Present" });
  const totalAbsent = await Attendance.countDocuments({ status: "Absent" });
  const absentList = await Attendance.find({ status: "Absent" })
    .populate("student", "fullName rollNo className section parentNumber")
    .limit(10);
  const attendanceRate = totalRecords
    ? ((totalPresent / totalRecords) * 100).toFixed(2)
    : 0;
  res.json({
    totalStudents,
    totalRecords,
    totalPresent,
    totalAbsent,
    attendanceRate,
    recentAbsentees: absentList,
  });
});

// --- New: CSV download endpoint for attendance ---
app.get("/api/attendance/export/csv", authMiddleware("admin"), async (req, res) => {
  const records = await Attendance.find().populate("student", "fullName rollNo className");
  if (!records.length) {
    return res.status(404).json({ message: "No attendance data" });
  }
  // Build CSV content
  const headers = ["date", "studentName", "rollNo", "className", "status"];
  const lines = records.map((r) => {
    const name = r.student?.fullName || "";
    const roll = r.student?.rollNo || "";
    const cls = r.student?.className || "";
    return [r.date, name, roll, cls, r.status].map((v) => `"${v}"`).join(",");
  });
  const csv = [headers.join(","), ...lines].join("\n");
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename=attendance_export.csv`);
  res.send(csv);
});

// --- New: PDF download endpoint for attendance ---
app.get("/api/attendance/export/pdf", authMiddleware("admin"), async (req, res) => {
  const records = await Attendance.find().populate("student", "fullName rollNo className");
  const doc = new PDFDocument({ margin: 30, size: "A4" });

  // Stream PDF back as response
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename=attendance_report.pdf`);

  doc.pipe(res);

  doc.fontSize(18).text("Attendance Report", { align: "center" });
  doc.moveDown();

  // Table header
  const tableTop = 100;
  const itemSpacing = 20;
  // Define column positions
  const col = {
    date: 50,
    name: 120,
    roll: 260,
    cls: 320,
    status: 400,
  };

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
    if (y > doc.page.height - 50) {
      doc.addPage();
      y = 50;
    }
  }

  doc.end();
});

// --- Start server ---
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});
