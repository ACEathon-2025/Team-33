const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Configuration
const MONGO_URI = 'mongodb://localhost:27017/attendanceDB';
const JWT_SECRET = 'your-secret-key-here'; // Replace with a secure key in production
const PORT = 5000;

// Initialize Express app
const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' })); // Increased limit for face descriptors

// Connect to MongoDB
mongoose.connect(MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

// Catch unhandled errors
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

// Models
const adminSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  institutionDomain: { type: String, required: true },
});

adminSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  try {
    this.password = await bcrypt.hash(this.password, 10);
    next();
  } catch (err) {
    console.error('Password hash error:', err);
    next(err);
  }
});

adminSchema.methods.comparePassword = async function (password) {
  return bcrypt.compare(password, this.password);
};

const Admin = mongoose.model('Admin', adminSchema);

const teacherSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  classAssigned: { type: String, required: true },
});

teacherSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  try {
    this.password = await bcrypt.hash(this.password, 10);
    next();
  } catch (err) {
    console.error('Password hash error:', err);
    next(err);
  }
});

teacherSchema.methods.comparePassword = async function (password) {
  return bcrypt.compare(password, this.password);
};

const Teacher = mongoose.model('Teacher', teacherSchema);

const studentSchema = new mongoose.Schema({
  fullName: { type: String, required: true },
  rollNo: { type: String, required: true, unique: true },
  className: { type: String, required: true },
  section: { type: String, required: true },
  parentName: { type: String, required: true },
  parentNumber: { type: String, required: true },
  faceDescriptors: [[Number]], // Store multiple face descriptors (arrays of 128 floats each)
});

const Student = mongoose.model('Student', studentSchema);

const attendanceSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  date: { type: Date, default: Date.now },
  status: { type: String, enum: ['Present', 'Absent'], required: true },
  className: { type: String }, // Added to track class context
  confidence: { type: String }, // Added to store recognition confidence
});

const Attendance = mongoose.model('Attendance', attendanceSchema);

// Authentication Middleware
const auth = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) {
    console.log('No token provided');
    return res.status(401).json({ message: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    console.log('Token decoded:', decoded);
    req.user = decoded;
    next();
  } catch (err) {
    console.error('Token verification error:', err);
    res.status(401).json({ message: 'Invalid token' });
  }
};

// Routes
app.post('/api/admin/register', async (req, res) => {
  try {
    const { name, email, password, institutionDomain } = req.body;
    if (!name || !email || !password || !institutionDomain) {
      return res.status(400).json({ message: 'All fields are required' });
    }
    console.log('Registering admin:', { name, email });
    const existingAdmin = await Admin.findOne({ email });
    if (existingAdmin) {
      return res.status(400).json({ message: 'Email already exists' });
    }
    const admin = new Admin({ name, email, password, institutionDomain });
    await admin.save();
    console.log('Admin saved:', admin.email);
    res.status(201).json({ message: 'Admin registered successfully' });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ message: 'Registration failed: ' + err.message });
  }
});

app.post('/api/admin/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }
    console.log('Login attempt:', { email });
    const admin = await Admin.findOne({ email: email.toLowerCase() });
    console.log('Admin found:', admin ? admin.email : null);
    if (!admin) {
      return res.status(401).json({ message: 'Invalid email' });
    }
    const isMatch = await admin.comparePassword(password);
    console.log('Password match:', isMatch);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid password' });
    }
    const token = jwt.sign({ id: admin._id, role: 'admin' }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ token });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Server error: ' + err.message });
  }
});

app.get('/api/admin/stats', auth, async (req, res) => {
  try {
    const totalStudents = await Student.countDocuments();
    const totalRecords = await Attendance.countDocuments();
    const totalPresent = await Attendance.countDocuments({ status: 'Present' });
    const totalAbsent = totalRecords - totalPresent;
    const attendanceRate = totalRecords > 0 ? Math.round((totalPresent / totalRecords) * 100) : 0;
    res.json({ totalStudents, totalRecords, totalPresent, totalAbsent, attendanceRate });
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ message: 'Failed to fetch stats: ' + err.message });
  }
});

app.post('/api/teachers/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }
    console.log('Teacher login attempt:', { email });
    const teacher = await Teacher.findOne({ email: email.toLowerCase() });
    console.log('Teacher found:', teacher ? teacher.email : null);
    if (!teacher) {
      return res.status(401).json({ message: 'Invalid email' });
    }
    const isMatch = await teacher.comparePassword(password);
    console.log('Password match:', isMatch);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid password' });
    }
    const token = jwt.sign({ id: teacher._id, role: 'teacher' }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ token });
  } catch (err) {
    console.error('Teacher login error:', err);
    res.status(500).json({ message: 'Server error: ' + err.message });
  }
});

app.get('/api/teachers', auth, async (req, res) => {
  try {
    const teachers = await Teacher.find({}, '-password');
    res.json(teachers);
  } catch (err) {
    console.error('Teachers fetch error:', err);
    res.status(500).json({ message: 'Failed to fetch teachers: ' + err.message });
  }
});

app.post('/api/teachers/register', auth, async (req, res) => {
  try {
    const { name, email, password, classAssigned } = req.body;
    if (!name || !email || !password || !classAssigned) {
      return res.status(400).json({ message: 'All fields are required' });
    }
    console.log('Registering teacher:', { name, email });
    const existingTeacher = await Teacher.findOne({ email });
    if (existingTeacher) {
      return res.status(400).json({ message: 'Email already exists' });
    }
    const teacher = new Teacher({ name, email, password, classAssigned });
    await teacher.save();
    console.log('Teacher saved:', teacher.email);
    res.status(201).json({ message: 'Teacher registered successfully' });
  } catch (err) {
    console.error('Teacher register error:', err);
    res.status(500).json({ message: 'Registration failed: ' + err.message });
  }
});

app.get('/api/students', auth, async (req, res) => {
  try {
    const students = await Student.find({}, '-faceDescriptors'); // Exclude descriptors for general fetch
    res.json(students);
  } catch (err) {
    console.error('Students fetch error:', err);
    res.status(500).json({ message: 'Failed to fetch students: ' + err.message });
  }
});

app.get('/api/students/enrolled', auth, async (req, res) => {
  try {
    const students = await Student.find({ faceDescriptors: { $exists: true, $ne: [] } }); // Fetch students with descriptors
    console.log('Fetched enrolled students:', students.length);
    res.json(students);
  } catch (err) {
    console.error('Enrolled students fetch error:', err);
    res.status(500).json({ message: 'Failed to fetch enrolled students: ' + err.message });
  }
});

app.post('/api/students/register', auth, async (req, res) => {
  try {
    const { fullName, rollNo, className, section, parentName, parentNumber, faceDescriptors } = req.body;
    if (!fullName || !rollNo || !className || !section || !parentName || !parentNumber) {
      return res.status(400).json({ message: 'All required fields must be provided' });
    }
    console.log('Registering student:', { fullName, rollNo, faceDescriptors: faceDescriptors ? 'Present' : 'Not provided' });
    const existingStudent = await Student.findOne({ rollNo });
    if (existingStudent) {
      return res.status(400).json({ message: 'Roll number already exists' });
    }
    const student = new Student({
      fullName,
      rollNo,
      className,
      section,
      parentName,
      parentNumber,
      faceDescriptors: faceDescriptors || [], // Store descriptors if provided
    });
    await student.save();
    console.log('Student saved:', student.rollNo);
    res.status(201).json({ message: 'Student registered successfully', student });
  } catch (err) {
    console.error('Student register error:', err);
    res.status(500).json({ message: 'Registration failed: ' + err.message });
  }
});

app.post('/api/attendance/mark', auth, async (req, res) => {
  try {
    const { records, className, confidence } = req.body; // Added className, confidence
    if (!records || !Array.isArray(records)) {
      return res.status(400).json({ message: 'Records array is required' });
    }
    const today = new Date().toISOString().split('T')[0];
    console.log('Marking attendance:', records);

    for (const rec of records) {
      const student = await Student.findOne({ rollNo: rec.rollNo });
      if (!student) {
        console.log(`Student not found: ${rec.rollNo}`);
        continue;
      }

      const existing = await Attendance.findOne({
        student: student._id,
        date: { $gte: new Date(today), $lt: new Date(today + 'T23:59:59') },
      });
      if (existing) {
        console.log(`Attendance already marked for ${rec.rollNo}`);
        continue;
      }

      const attendance = new Attendance({
        student: student._id,
        status: rec.status,
        className: className || 'Unknown', // Store class context
        confidence: confidence || 'Manual', // Store confidence if provided
      });
      await attendance.save();
      console.log(`Attendance saved for ${rec.rollNo}: ${rec.status}`);
    }
    res.json({ message: 'Attendance marked successfully' });
  } catch (err) {
    console.error('Attendance mark error:', err);
    res.status(500).json({ message: 'Failed to mark attendance: ' + err.message });
  }
});

app.get('/api/attendance/report', auth, async (req, res) => {
  try {
    const attendances = await Attendance.find().populate('student').sort({ date: -1 });
    console.log('Fetched attendances:', attendances.length);
    res.json(attendances);
  } catch (err) {
    console.error('Attendance fetch error:', err);
    res.status(500).json({ message: 'Failed to fetch attendance: ' + err.message });
  }
});

// Start Server
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
