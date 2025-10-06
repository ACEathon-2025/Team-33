import React, { useState, useEffect } from "react";
import axios from "axios";
import { QRCodeCanvas } from "qrcode.react";
import jsPDF from "jspdf";
import "jspdf-autotable";
import "./AdminPanel.css";

const API_BASE = "http://localhost:5000/api";

export default function AdminPanel() {
  const [token, setToken] = useState(localStorage.getItem("admintoken") || "");
  const [page, setPage] = useState("login");

  // AUTH STATES
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regDomain, setRegDomain] = useState("");

  // DATA STATES
  const [stats, setStats] = useState(null);
  const [teachers, setTeachers] = useState([]);
  const [students, setStudents] = useState([]);
  const [attendance, setAttendance] = useState([]);

  // TEACHER FORM
  const [teacherName, setTeacherName] = useState("");
  const [teacherEmail, setTeacherEmail] = useState("");
  const [teacherPassword, setTeacherPassword] = useState("");
  const [teacherClass, setTeacherClass] = useState("");

  // STUDENT FORM
  const [studentFullName, setStudentFullName] = useState("");
  const [studentRollNo, setStudentRollNo] = useState("");
  const [studentClass, setStudentClass] = useState("");
  const [studentSection, setStudentSection] = useState("");
  const [parentName, setParentName] = useState("");
  const [parentNumber, setParentNumber] = useState("");

  // EFFECT: LOAD INITIAL DATA
  useEffect(() => {
    if (token) {
      axios.defaults.headers.common["Authorization"] = `Bearer ${token}`;
      fetchStats();
      fetchTeachers();
      fetchStudents();
      fetchAttendance();
      setPage("dashboard");
    } else {
      delete axios.defaults.headers.common["Authorization"];
    }
  }, [token]);

  // -------- AUTH --------
  const handleLogin = async () => {
    try {
      const res = await axios.post(`${API_BASE}/admin/login`, {
        email: loginEmail,
        password: loginPassword,
      });
      localStorage.setItem("admintoken", res.data.token);
      setToken(res.data.token);
      alert("✅ Login successful!");
    } catch (err) {
      alert(err.response?.data?.message || "Login failed");
    }
  };

  const handleRegister = async () => {
    try {
      await axios.post(`${API_BASE}/admin/register`, {
        name: regName,
        email: regEmail,
        password: regPassword,
        institutionDomain: regDomain,
      });
      alert("✅ Admin registered successfully!");
      setPage("login");
    } catch (err) {
      alert(err.response?.data?.message || "Registration failed");
    }
  };

  const logout = () => {
    localStorage.removeItem("admintoken");
    setToken("");
    setPage("login");
  };

  // -------- FETCH DATA --------
  const fetchStats = async () => {
    const res = await axios.get(`${API_BASE}/admin/stats`);
    setStats(res.data);
  };

  const fetchTeachers = async () => {
    const res = await axios.get(`${API_BASE}/teachers`);
    setTeachers(res.data);
  };

  const fetchStudents = async () => {
    const res = await axios.get(`${API_BASE}/students`);
    setStudents(res.data);
  };

  const fetchAttendance = async () => {
    const res = await axios.get(`${API_BASE}/attendance/report`);
    setAttendance(res.data);
  };

  // -------- TEACHERS --------
  const handleAddTeacher = async () => {
    try {
      await axios.post(`${API_BASE}/teachers/register`, {
        name: teacherName,
        email: teacherEmail,
        password: teacherPassword,
        classAssigned: teacherClass,
      });
      alert("✅ Teacher added successfully!");
      setTeacherName("");
      setTeacherEmail("");
      setTeacherPassword("");
      setTeacherClass("");
      fetchTeachers();
    } catch (err) {
      alert(err.response?.data?.message || "Error adding teacher");
    }
  };

  // -------- STUDENTS --------
  const handleAddStudent = async () => {
    try {
      await axios.post(`${API_BASE}/students/register`, {
        fullName: studentFullName,
        rollNo: studentRollNo,
        className: studentClass,
        section: studentSection,
        parentName,
        parentNumber,
      });
      alert("✅ Student registered successfully!");
      setStudentFullName("");
      setStudentRollNo("");
      setStudentClass("");
      setStudentSection("");
      setParentName("");
      setParentNumber("");
      fetchStudents();
    } catch (err) {
      alert(err.response?.data?.message || "Error adding student");
    }
  };

  // -------- QR DOWNLOAD --------
  const handleDownloadQR = (rollNo) => {
    const canvas = document.getElementById(`qr-${rollNo}`);
    const pngUrl = canvas.toDataURL("image/png").replace("image/png", "image/octet-stream");
    const link = document.createElement("a");
    link.href = pngUrl;
    link.download = `${rollNo}_QR.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // -------- EXPORT FUNCTIONS --------
  const exportCSV = (data, filename) => {
    const headers = Object.keys(data[0]);
    const rows = data.map((obj) => headers.map((header) => `"${obj[header] ?? ""}"`).join(","));
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${filename}.csv`;
    link.click();
  };

  const exportAttendancePDF = () => {
    const doc = new jsPDF();
    doc.text("Attendance Report", 14, 15);
    const rows = attendance.map((a) => [
      a.date,
      a.student?.fullName || "",
      a.student?.rollNo || "",
      a.student?.className || "",
      a.status,
    ]);
    doc.autoTable({
      head: [["Date", "Student", "Roll", "Class", "Status"]],
      body: rows,
      startY: 25,
    });
    doc.save("attendance_report.pdf");
  };

  // -------- UI --------
  if (!token && page === "login") {
    return (
      <div className="centered">
        <h2>Admin Login</h2>
        <input placeholder="Email" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} />
        <input placeholder="Password" type="password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} />
        <button onClick={handleLogin}>Login</button>
        <p>
          No account? <button onClick={() => setPage("register")}>Register</button>
        </p>
      </div>
    );
  }

  if (!token && page === "register") {
    return (
      <div className="centered">
        <h2>Register Admin</h2>
        <input placeholder="Full Name" value={regName} onChange={(e) => setRegName(e.target.value)} />
        <input placeholder="Institution Email" value={regEmail} onChange={(e) => setRegEmail(e.target.value)} />
        <input placeholder="Password" type="password" value={regPassword} onChange={(e) => setRegPassword(e.target.value)} />
        <input placeholder="Institution Domain" value={regDomain} onChange={(e) => setRegDomain(e.target.value)} />
        <button onClick={handleRegister}>Register</button>
        <p>
          Already registered? <button onClick={() => setPage("login")}>Login</button>
        </p>
      </div>
    );
  }

  // -------- PAGES --------
  const renderDashboard = () => (
    <div>
      <h3>📊 Dashboard</h3>
      {stats ? (
        <ul>
          <li>Total Students: {stats.totalStudents}</li>
          <li>Total Records: {stats.totalRecords}</li>
          <li>Present: {stats.totalPresent}</li>
          <li>Absent: {stats.totalAbsent}</li>
          <li>Attendance Rate: {stats.attendanceRate}%</li>
        </ul>
      ) : (
        <p>Loading...</p>
      )}
    </div>
  );

  const renderTeachers = () => (
    <div>
      <h3>👩‍🏫 Manage Teachers</h3>
      <div className="form-row">
        <input placeholder="Name" value={teacherName} onChange={(e) => setTeacherName(e.target.value)} />
        <input placeholder="Email" value={teacherEmail} onChange={(e) => setTeacherEmail(e.target.value)} />
        <input placeholder="Password" type="password" value={teacherPassword} onChange={(e) => setTeacherPassword(e.target.value)} />
        <input placeholder="Class Assigned" value={teacherClass} onChange={(e) => setTeacherClass(e.target.value)} />
        <button onClick={handleAddTeacher}>Add Teacher</button>
      </div>
      <button onClick={() => exportCSV(teachers, "teachers")}>⬇ Export CSV</button>
      <table>
        <thead><tr><th>Name</th><th>Email</th><th>Class</th></tr></thead>
        <tbody>{teachers.map((t) => (<tr key={t._id}><td>{t.name}</td><td>{t.email}</td><td>{t.classAssigned}</td></tr>))}</tbody>
      </table>
    </div>
  );

  const renderStudents = () => (
    <div>
      <h3>🎓 Manage Students</h3>
      <div className="form-row">
        <input placeholder="Full Name" value={studentFullName} onChange={(e) => setStudentFullName(e.target.value)} />
        <input placeholder="Roll No" value={studentRollNo} onChange={(e) => setStudentRollNo(e.target.value)} />
        <input placeholder="Class" value={studentClass} onChange={(e) => setStudentClass(e.target.value)} />
        <input placeholder="Section" value={studentSection} onChange={(e) => setStudentSection(e.target.value)} />
        <input placeholder="Parent Name" value={parentName} onChange={(e) => setParentName(e.target.value)} />
        <input placeholder="Parent Number" value={parentNumber} onChange={(e) => setParentNumber(e.target.value)} />
        <button onClick={handleAddStudent}>Add Student</button>
      </div>
      <button onClick={() => exportCSV(students, "students")}>⬇ Export CSV</button>
      <table>
        <thead><tr><th>QR</th><th>Roll</th><th>Name</th><th>Class</th><th>Section</th><th>Parent</th><th>Contact</th><th>Action</th></tr></thead>
        <tbody>{students.map((s) => (<tr key={s._id}>
        <td><QRCodeCanvas id={`qr-${s.rollNo}`} value={s.rollNo} size={50} /></td>
          <td>{s.rollNo}</td><td>{s.fullName}</td><td>{s.className}</td><td>{s.section}</td>
          <td>{s.parentName}</td><td>{s.parentNumber}</td>
          <td><button onClick={() => handleDownloadQR(s.rollNo)}>Download QR</button></td></tr>))}</tbody>
      </table>
    </div>
  );

  const renderAttendance = () => (
    <div>
      <h3>🕒 Attendance Records</h3>
      <div style={{ marginBottom: "10px" }}>
        <button onClick={() => exportCSV(attendance, "attendance_report")}>⬇ Export CSV</button>
        <button onClick={exportAttendancePDF}>📄 Export PDF</button>
      </div>
      <table>
        <thead><tr><th>Date</th><th>Student</th><th>Roll</th><th>Class</th><th>Status</th></tr></thead>
        <tbody>{attendance.map((a, i) => (
          <tr key={i}><td>{a.date}</td><td>{a.student?.fullName}</td><td>{a.student?.rollNo}</td><td>{a.student?.className}</td><td>{a.status}</td></tr>
        ))}</tbody>
      </table>
    </div>
  );

  return (
    <div>
      <nav className="navbar">
        <h2>Attendance Admin Panel</h2>
        <div>
          <button onClick={() => setPage("dashboard")}>🏠 Dashboard</button>
          <button onClick={() => setPage("teachers")}>👩‍🏫 Teachers</button>
          <button onClick={() => setPage("students")}>🎓 Students</button>
          <button onClick={() => setPage("attendance")}>🕒 Attendance</button>
          <button onClick={logout}>🚪 Logout</button>
        </div>
      </nav>
      <div className="page-container">
        {page === "dashboard" && renderDashboard()}
        {page === "teachers" && renderTeachers()}
        {page === "students" && renderStudents()}
        {page === "attendance" && renderAttendance()}
      </div>
    </div>
  );
}

// ---- INLINE STYLES ----
const style = document.createElement("style");
style.innerHTML = `
body { font-family: Arial, sans-serif; background: #f8f8f8; margin: 0; }
.navbar { background: #0047AB; color: white; display: flex; justify-content: space-between; padding: 10px 20px; flex-wrap: wrap; }
.navbar button { margin: 5px; background: white; color: #0047AB; border: none; padding: 6px 10px; border-radius: 4px; cursor: pointer; }
.navbar button:hover { background: #e6e6e6; }
.centered { text-align: center; margin-top: 100px; }
.centered input { display: block; margin: 10px auto; padding: 8px; width: 250px; }
.page-container { padding: 20px; }
table { width: 100%; background: white; border-collapse: collapse; margin-top: 15px; }
th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
th { background: #f0f0f0; }
.form-row input { margin: 5px; padding: 6px; }
.form-row button { padding: 6px 10px; background: #0047AB; color: white; border: none; border-radius: 4px; cursor: pointer; }
@media (max-width: 768px) {
  .navbar { flex-direction: column; align-items: flex-start; }
  .navbar button { width: 100%; margin: 4px 0; }
}`;
document.head.appendChild(style);
