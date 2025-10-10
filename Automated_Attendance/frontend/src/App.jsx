import React, { useState, useEffect, useRef } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import axios from "axios";
import { QRCodeCanvas } from "qrcode.react";
import jsPDF from "jspdf";
import "jspdf-autotable";
import * as faceapi from 'face-api.js';
import emailjs from '@emailjs/browser';
import "./index.css";

// EnrollmentModal Component
function EnrollmentModal({ setStatus, modelsLoaded, setEnrolledStudents, closeModal }) {
  const videoRef = useRef(null);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [formData, setFormData] = useState({ name: '', usn: '', parentEmail: '', parentPhone: '' });

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: {} });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setIsCameraOn(true);
      setStatus("Camera started. Position student's face.");
    } catch (err) {
      setStatus('Webcam access denied.');
    }
  };

  const handleEnroll = async () => {
    if (!formData.name || !formData.usn) {
      setStatus("Name and USN are required.");
      return;
    }
    setStatus(`Capturing face for ${formData.name}...`);

    try {
      const detection = await faceapi
        .detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (!detection) {
        setStatus("Enrollment failed: No face detected.");
        return;
      }

      const label = `${formData.name} (${formData.usn})`;
      const newStudent = {
        ...formData,
        label,
        descriptor: new faceapi.LabeledFaceDescriptors(label, [detection.descriptor])
      };

      setEnrolledStudents(prev => [...prev, newStudent]);
      setStatus(`${formData.name} enrolled successfully!`);
      closeModal();
    } catch (error) {
      setStatus("An error occurred during enrollment.");
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h2>Enroll New Student</h2>
        <div className="enrollment-form">
          <input
            type="text"
            name="name"
            placeholder="Student Name"
            value={formData.name}
            onChange={handleInputChange}
            className="input-field"
          />
          <input
            type="text"
            name="usn"
            placeholder="Student USN"
            value={formData.usn}
            onChange={handleInputChange}
            className="input-field"
          />
          <input
            type="email"
            name="parentEmail"
            placeholder="Parent's Email"
            value={formData.parentEmail}
            onChange={handleInputChange}
            className="input-field"
          />
          <input
            type="tel"
            name="parentPhone"
            placeholder="Parent's Phone"
            value={formData.parentPhone}
            onChange={handleInputChange}
            className="input-field"
          />
        </div>
        <div className="camera-container small">
          <video ref={videoRef} autoPlay muted playsInline className={isCameraOn ? '' : 'hidden'} />
          {!isCameraOn && <div className="camera-placeholder">Camera is off</div>}
        </div>
        <div className="modal-actions">
          {!isCameraOn ? (
            <button onClick={startCamera} className="btn btn-secondary">Start Camera</button>
          ) : (
            <button onClick={handleEnroll} disabled={!modelsLoaded} className="btn btn-primary">
              Capture and Enroll
            </button>
          )}
          <button onClick={closeModal} className="btn btn-danger">Cancel</button>
        </div>
      </div>
    </div>
  );
}

// StudentModule Component
function StudentModule({ setStatus, modelsLoaded, enrolledStudents, attendance, setAttendance, setView }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [isAttendanceRunning, setIsAttendanceRunning] = useState(false);
  const [lastRecognized, setLastRecognized] = useState(null);
  const [currentClass, setCurrentClass] = useState(null);
  const recognitionIntervalRef = useRef(null);

  const playBeep = () => {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(800, audioCtx.currentTime);
      const gainNode = audioCtx.createGain();
      gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.1);
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.1);
    } catch (e) {
      console.error("Could not play beep sound:", e);
    }
  };

  useEffect(() => {
    const classData = localStorage.getItem('currentClass');
    if (classData) {
      setCurrentClass(JSON.parse(classData));
    }
  }, []);

  useEffect(() => {
    const startWebcam = async () => {
      if (!videoRef.current) return;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: {} });
        videoRef.current.srcObject = stream;
      } catch (err) {
        setStatus('Webcam access denied.');
      }
    };
    startWebcam();
    return () => {
      if (recognitionIntervalRef.current) clearInterval(recognitionIntervalRef.current);
      if (videoRef.current && videoRef.current.srcObject) {
        videoRef.current.srcObject.getTracks().forEach(track => track.stop());
      }
    };
  }, [setStatus]);

  const toggleAttendance = () => {
    if (isAttendanceRunning) {
      clearInterval(recognitionIntervalRef.current);
      setIsAttendanceRunning(false);
      setStatus("Attendance session ended.");
    } else {
      setLastRecognized(null);
      setIsAttendanceRunning(true);
      setStatus("Attendance in progress...");
      startRecognition();
    }
  };

  const startRecognition = () => {
    const faceMatcher = new faceapi.FaceMatcher(enrolledStudents.map(s => s.descriptor), 0.6);

    recognitionIntervalRef.current = setInterval(async () => {
      if (!videoRef.current || videoRef.current.readyState !== 4) return;

      const detections = await faceapi
        .detectAllFaces(videoRef.current, new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks()
        .withFaceDescriptors();
      const displaySize = { width: videoRef.current.videoWidth, height: videoRef.current.videoHeight };
      if (displaySize.width === 0) return;

      const resizedDetections = faceapi.resizeResults(detections, displaySize);

      if (canvasRef.current) {
        const context = canvasRef.current.getContext('2d');
        context.clearRect(0, 0, displaySize.width, displaySize.height);
      }

      for (const detection of resizedDetections) {
        const bestMatch = faceMatcher.findBestMatch(detection.descriptor);
        const student = enrolledStudents.find(s => s.label === bestMatch.label);
        const box = detection.detection.box;

        let label = 'Unknown';
        let boxColor = '#EF4444';

        const isAlreadyMarked = attendance.some(a => student && a.usn === student.usn);

        if (student) {
          if (!isAlreadyMarked) {
            label = `${student.label} - Marked!`;
            boxColor = '#10B981';
            const className = currentClass ? currentClass.className : 'Unknown';
            setAttendance(currentAttendance => {
              if (!currentAttendance.some(a => a.usn === student.usn)) {
                const newRecord = {
                  name: student.name,
                  usn: student.usn,
                  timestamp: new Date().toLocaleTimeString(),
                  date: new Date().toLocaleDateString(),
                  confidence: (1 - bestMatch.distance).toFixed(2),
                  className,
                };
                setLastRecognized(newRecord);
                playBeep();
                return [...currentAttendance, newRecord].sort((a, b) => a.name.localeCompare(b.name));
              }
              return currentAttendance;
            });
          } else {
            label = student.label;
            boxColor = '#3B82F6';
          }
        }

        const context = canvasRef.current.getContext('2d');
        context.strokeStyle = boxColor;
        context.lineWidth = 2;
        context.strokeRect(box.x, box.y, box.width, box.height);

        const text = label;
        const textMetrics = context.measureText(text);
        const textHeight = 20;
        const textX = box.x + box.width / 2 - textMetrics.width / 2;
        const textY = box.y > textHeight ? box.y : box.y + box.height;

        context.fillStyle = boxColor;
        context.fillRect(textX, textY - textHeight, textMetrics.width, textHeight);

        context.save();
        context.scale(-1, 1);
        context.fillStyle = 'white';
        context.font = '14px Arial';
        context.textAlign = 'center';
        const unmirroredX = -(textX + textMetrics.width / 2);
        context.fillText(text, unmirroredX, textY - 5);
        context.restore();
      }
    }, 1500);
  };

  return (
    <main className="main-grid-student">
      <div className="card camera-card">
        <h2>Attendance for {currentClass ? currentClass.className : 'Class'}</h2>
        <div className="camera-container">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            onLoadedMetadata={() => {
              if (canvasRef.current && videoRef.current) {
                canvasRef.current.width = videoRef.current.videoWidth;
                canvasRef.current.height = videoRef.current.videoHeight;
              }
            }}
          />
          <canvas ref={canvasRef} />
        </div>
        <button
          onClick={toggleAttendance}
          disabled={!modelsLoaded || enrolledStudents.length === 0}
          className={`btn btn-toggle-attendance ${isAttendanceRunning ? 'running' : ''}`}
        >
          {isAttendanceRunning ? 'Stop Scanning' : 'Start Scanning'}
        </button>
        <button
          onClick={() => setView('main')}
          className="btn btn-secondary"
          style={{ marginTop: '10px' }}
        >
          Back to Home
        </button>
        {lastRecognized && (
          <div className="last-recognized-card">
            <h3>Last Student Marked</h3>
            <p><strong>Name:</strong> {lastRecognized.name}</p>
            <p><strong>USN:</strong> {lastRecognized.usn}</p>
            <p><strong>Class:</strong> {lastRecognized.className}</p>
            <p><strong>Time:</strong> {lastRecognized.timestamp}</p>
            <p><strong>Confidence:</strong> {lastRecognized.confidence}</p>
          </div>
        )}
      </div>
      <div className="card">
        <h2>Today's Attendance</h2>
        <div className="attendance-header">Present: {attendance.length} / {enrolledStudents.length}</div>
        <div className="list-container">
          <ul className="list attendance-list">
            {attendance.length > 0 ? (
              attendance.map(rec => (
                <li key={rec.usn} className="list-item">
                  <div>{rec.name} ({rec.usn}) - {rec.className}</div>
                  <div className="details">
                    <span>Time: {rec.timestamp}</span>
                    <span>Confidence: {rec.confidence || 'N/A'}</span>
                  </div>
                </li>
              ))
            ) : (
              <li className="list-item-placeholder">No students marked present yet.</li>
            )}
          </ul>
        </div>
      </div>
    </main>
  );
}

// TeacherModule Component
function TeacherModule({ setStatus, modelsLoaded, enrolledStudents, setEnrolledStudents, attendance, setAttendance, setView }) {
  const [activePage, setActivePage] = useState('enrollment');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [classForm, setClassForm] = useState({ className: '', classTime: '09:00', gracePeriod: 15 });
  const [todayClasses, setTodayClasses] = useState([]);
  const [dailySummaries, setDailySummaries] = useState([]);
  const [reportType, setReportType] = useState('daily');
  const [reportData, setReportData] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const classes = localStorage.getItem('classes');
    if (classes) {
      const allClasses = JSON.parse(classes);
      const today = new Date().toLocaleDateString();
      setTodayClasses(allClasses.filter(c => c.date === today));
    }
  }, []);

  const handleEnrollClick = () => setIsModalOpen(true);

  const handleClassInputChange = (e) => {
    const { name, value } = e.target;
    setClassForm(prev => ({ ...prev, [name]: value }));
  };

// In your TeacherModule Component

  const handleCreateClass = () => {
    if (!classForm.className) return setStatus("Class name is required.");
    const newClass = { 
      ...classForm, 
      date: new Date().toLocaleDateString(),
      gracePeriod: parseInt(classForm.gracePeriod)
    };
    const classes = localStorage.getItem('classes') ? JSON.parse(localStorage.getItem('classes')) : [];
    localStorage.setItem('classes', JSON.stringify([...classes, newClass]));
    setTodayClasses(prev => [...prev, newClass]);
    // This line is correct, as the StudentModule will read it
    localStorage.setItem('currentClass', JSON.stringify(newClass)); 
    setStatus(`Class "${classForm.className}" created. Redirecting to start attendance...`);
    
    // 👇 THIS IS THE CORRECTED LINE 👇
    navigate('/student'); 
  };

  const handleManualOverride = (usn, isPresent) => {
    if (isPresent) {
      setAttendance(prev => prev.filter(a => a.usn !== usn));
    } else {
      const student = enrolledStudents.find(s => s.usn === usn);
      if (!student) return;
      const currentClass = localStorage.getItem('currentClass') ? JSON.parse(localStorage.getItem('currentClass')) : null;
      const className = currentClass ? currentClass.className : 'Unknown';
      setAttendance(prev => [...prev, {
        name: student.name,
        usn: student.usn,
        timestamp: new Date().toLocaleTimeString(),
        date: new Date().toLocaleDateString(),
        confidence: 'Manual',
        className
      }]);
    }
  };

  const presentStudents = enrolledStudents.filter(s => attendance.some(a => a.usn === s.usn));
  const absentStudents = enrolledStudents.filter(s => !attendance.some(a => a.usn === s.usn));

  const handleGenerateSummary = () => {
    const today = new Date().toLocaleDateString();
    const todayAttendance = attendance.filter(a => a.date === today);
    const currentClass = localStorage.getItem('currentClass') ? JSON.parse(localStorage.getItem('currentClass')) : null;
    
    let summaryStudents = enrolledStudents.map(s => ({ ...s, status: 'Absent' }));
    const present = [];
    const late = [];

    todayAttendance.forEach(rec => {
      const student = enrolledStudents.find(s => s.usn === rec.usn);
      if (student) {
        const studentIndex = summaryStudents.findIndex(s => s.usn === rec.usn);
        if (studentIndex > -1) {
          summaryStudents.splice(studentIndex, 1);
          
          if (currentClass && currentClass.gracePeriod) {
            const attendanceTime = new Date(`2000-01-01T${rec.timestamp}`);
            const classStart = new Date(`2000-01-01T${currentClass.classTime}`);
            const graceEnd = new Date(classStart.getTime() + (currentClass.gracePeriod * 60 * 1000));
            
            if (attendanceTime > graceEnd) {
              late.push({ ...student, status: 'Late' });
            } else {
              present.push({ ...student, status: 'Present' });
            }
          } else {
            present.push({ ...student, status: 'Present' });
          }
        }
      }
    });

    const newSummary = {
      date: today,
      present: present.map(s => `${s.name} (${s.usn})`),
      absent: summaryStudents.map(s => `${s.name} (${s.usn})`),
      late: late.map(s => `${s.name} (${s.usn})`)
    };
    setDailySummaries(prev => [...prev.filter(s => s.date !== today), newSummary]);
    setStatus(`Summary generated for ${today}. Late students: ${late.length}.`);

    if (late.length > 0 && currentClass) {
      setTimeout(() => {
        sendNotifications(newSummary, 'late');
        setStatus(`Automatic notifications sent for late students after grace period.`);
      }, currentClass.gracePeriod * 60 * 1000);
    }

    setActivePage('summary');
  };

  const sendNotifications = (summary, type = 'absent') => {
    const toNotify = type === 'late' ? summary.late : summary.absent;
    const currentClass = localStorage.getItem('currentClass') ? JSON.parse(localStorage.getItem('currentClass')) : null;
    
    toNotify.forEach(studentEntry => {
      const student = enrolledStudents.find(s => s.name === studentEntry.split(' (')[0]);
      if (student && student.parentEmail) {
        const templateParams = {
          to_email: student.parentEmail,
          to_name: student.name,
          message: `${type === 'late' ? 'Late' : 'Absent'} for ${currentClass ? currentClass.className : 'class'} on ${summary.date}. Please ensure timely arrival.`,
          parent_phone: student.parentPhone
        };
        emailjs.send('YOUR_SERVICE_ID', 'YOUR_TEMPLATE_ID', templateParams, 'YOUR_USER_ID')
          .then(() => setStatus(`Email sent to ${student.parentEmail} for ${type}.`))
          .catch(err => setStatus(`Email error: ${err.text}`));
        
        console.log(`SMS to ${student.parentPhone}: ${templateParams.message}`);
        setStatus('SMS requires backend (e.g., Twilio). Simulated.');
      }
    });
  };

  const handleGenerateReport = () => {
    const now = new Date();
    let startDate, endDate;
    
    switch (reportType) {
      case 'daily':
        startDate = endDate = now.toLocaleDateString();
        break;
      case 'weekly':
        const startOfWeek = new Date(now);
        startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
        startDate = startOfWeek.toLocaleDateString();
        endDate = new Date(startOfWeek.getTime() + 6 * 24 * 60 * 60 * 1000).toLocaleDateString();
        break;
      case 'monthly':
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        startDate = startOfMonth.toLocaleDateString();
        endDate = endOfMonth.toLocaleDateString();
        break;
    }

    const filteredAttendance = attendance.filter(a => {
      const attDate = new Date(a.date);
      const start = new Date(startDate);
      const end = new Date(endDate);
      return attDate >= start && attDate <= end;
    });

    const allClasses = localStorage.getItem('classes') ? JSON.parse(localStorage.getItem('classes')) : [];
    const totalClasses = allClasses.filter(c => {
      const classDate = new Date(c.date);
      const start = new Date(startDate);
      const end = new Date(endDate);
      return classDate >= start && classDate <= end;
    }).length;

    const studentReports = enrolledStudents.map(s => {
      const attended = filteredAttendance.filter(a => a.usn === s.usn).length;
      const percentage = totalClasses > 0 ? Math.round((attended / totalClasses) * 100) : 0;
      return {
        ...s,
        attended,
        total: totalClasses,
        percentage
      };
    });

    setReportData({ startDate, endDate, studentReports });
    setStatus(`${reportType.charAt(0).toUpperCase() + reportType.slice(1)} report generated. Total classes: ${totalClasses}.`);
  };

  const handleLogout = () => {
    localStorage.removeItem('teachertoken');
    setView('main');
    navigate('/');
  };

  const renderPage = () => {
    switch (activePage) {
      case 'enrollment':
        return (
          <div className="card">
            <h2>Enroll Students</h2>
            <button onClick={handleEnrollClick} className="btn btn-primary">Enroll New Student</button>
          </div>
        );
      case 'create-class':
        return (
          <div className="card">
            <h2>Create Class</h2>
            <div className="enrollment-form">
              <input 
                type="text" 
                name="className" 
                placeholder="Class Name (e.g., Math 101)" 
                value={classForm.className} 
                onChange={handleClassInputChange} 
                className="input-field" 
              />
              <input 
                type="time" 
                name="classTime" 
                value={classForm.classTime} 
                onChange={handleClassInputChange} 
                className="input-field" 
              />
              <input 
                type="number" 
                name="gracePeriod" 
                placeholder="Grace Period (minutes, e.g., 15)" 
                value={classForm.gracePeriod} 
                onChange={handleClassInputChange} 
                className="input-field" 
                min="0" 
                max="60"
              />
              <button onClick={handleCreateClass} className="btn btn-primary">Create Class & Start Attendance</button>
            </div>
          </div>
        );
      case 'attendance':
        return (
          <div className="card">
            <h2>Attendance</h2>
            <div className="attendance-columns">
              <div className="list-container">
                <h4>Present ({presentStudents.length})</h4>
                <ul className="list">
                  {presentStudents.map(s => (
                    <li key={s.usn} className="list-item teacher-list present">
                      {s.name} ({s.usn})
                      <button onClick={() => handleManualOverride(s.usn, true)} title="Mark as Absent">X</button>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="list-container">
                <h4>Absent ({absentStudents.length})</h4>
                <ul className="list">
                  {absentStudents.map(s => (
                    <li key={s.usn} className="list-item teacher-list absent">
                      {s.name} ({s.usn})
                      <button onClick={() => handleManualOverride(s.usn, false)} title="Mark as Present">+</button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <button onClick={handleGenerateSummary} className="btn btn-primary" style={{ marginTop: '10px' }}>Generate Today's Summary</button>
          </div>
        );
      case 'summary':
        return (
          <div className="card">
            <h2>Daily Summary</h2>
            {dailySummaries.length === 0 ? <p>No summaries yet.</p> :
              <ul className="list">
                {dailySummaries.map(s => (
                  <li key={s.date} className="list-item teacher-list">
                    <strong>{s.date}</strong>
                    <p><b>Present:</b> {s.present.join(', ') || 'None'}</p>
                    <p><b>Absent:</b> {s.absent.join(', ') || 'None'}</p>
                    <p><b>Late:</b> {s.late.join(', ') || 'None'}</p>
                    <button 
                      onClick={() => sendNotifications(s, 'absent')} 
                      className="btn btn-secondary" 
                      style={{ marginTop: '10px' }}
                    >
                      Send Absent Notifications
                    </button>
                    <button 
                      onClick={() => sendNotifications(s, 'late')} 
                      className="btn btn-warning" 
                      style={{ marginTop: '10px' }}
                    >
                      Send Late Notifications
                    </button>
                  </li>
                ))}
              </ul>
            }
          </div>
        );
      case 'reports':
        return (
          <div className="card">
            <h2>Generate Reports</h2>
            <div className="enrollment-form">
              <select 
                value={reportType} 
                onChange={(e) => setReportType(e.target.value)} 
                className="input-field"
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
              <button onClick={handleGenerateReport} className="btn btn-primary">Generate Report</button>
            </div>
            {reportData && (
              <div className="report-results">
                <h4>Report from {reportData.startDate} to {reportData.endDate}</h4>
                <ul className="list">
                  {reportData.studentReports.map(s => (
                    <li key={s.usn} className="list-item">
                      <div>
                        <strong>{s.name} ({s.usn})</strong>: {s.attended}/{s.total} classes ({s.percentage}%)
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        );
      case 'notifications':
        return (
          <div className="card">
            <h2>Notifications</h2>
            <p>Notifications for absent/late students are sent automatically after grace period or manually from Summary page. SMS requires backend integration (e.g., Twilio).</p>
            <p>Email setup: Configure EmailJS in code with your service/template IDs.</p>
          </div>
        );
      default:
        return <div className="card"><h2>404 - Page Not Found</h2></div>;
    }
  };

  return (
    <div className="teacher-dashboard">
      <aside className="sidebar">
        <h2 className="logo">Teacher Panel</h2>
        <nav className="nav">
          <button className={`nav-link ${activePage === 'enrollment' ? 'active' : ''}`} onClick={() => setActivePage('enrollment')}>🧑‍🎓 Enrollment</button>
          <button className={`nav-link ${activePage === 'create-class' ? 'active' : ''}`} onClick={() => setActivePage('create-class')}>📚 Create Class</button>
          <button className={`nav-link ${activePage === 'attendance' ? 'active' : ''}`} onClick={() => setActivePage('attendance')}>📋 Attendance</button>
          <button className={`nav-link ${activePage === 'summary' ? 'active' : ''}`} onClick={() => setActivePage('summary')}>📊 Summary</button>
          <button className={`nav-link ${activePage === 'reports' ? 'active' : ''}`} onClick={() => setActivePage('reports')}>📈 Reports</button>
          <button className={`nav-link ${activePage === 'notifications' ? 'active' : ''}`} onClick={() => setActivePage('notifications')}>🔔 Notifications</button>
          <button className="nav-link logout" onClick={handleLogout}>🚪 Logout</button>
        </nav>
      </aside>
      <div className="main-content">
        <header className="topbar">
          <h1>{activePage.charAt(0).toUpperCase() + activePage.slice(1).replace(/-/g, ' ')}</h1>
        </header>
        <section className="page-content">{renderPage()}</section>
      </div>

      {isModalOpen &&
        <EnrollmentModal
          setStatus={setStatus}
          modelsLoaded={modelsLoaded}
          setEnrolledStudents={setEnrolledStudents}
          closeModal={() => setIsModalOpen(false)}
        />
      }
    </div>
  );
}

// AdminPanel Component
function AdminPanel() {
  const navigate = useNavigate();
  const location = useLocation();
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

  // MANUAL ATTENDANCE STATES
  const [attendanceRecord, setAttendanceRecord] = useState({});
  const [presentList, setPresentList] = useState([]);
  const [absentList, setAbsentList] = useState([]);

  const API_BASE = "http://localhost:5000/api";

  useEffect(() => {
    if (location.pathname === "/register") {
      setPage("register");
    } else if (location.pathname === "/login" || !token) {
      setPage("login");
    } else if (token) {
      setPage("dashboard");
    }
  }, [location.pathname, token]);

  useEffect(() => {
    if (token) {
      axios.defaults.headers.common["Authorization"] = `Bearer ${token}`;
      fetchStats();
      fetchTeachers();
      fetchStudents();
      fetchAttendance();
    } else {
      delete axios.defaults.headers.common["Authorization"];
      if (location.pathname !== "/register") {
        navigate('/login');
      }
    }
  }, [token, navigate, location.pathname]);

  const fetchStats = async () => {
    try {
      const res = await axios.get(`${API_BASE}/admin/stats`);
      setStats(res.data);
    } catch (err) {
      console.error("Error fetching stats:", err);
      alert("Failed to fetch stats. Please try again.");
    }
  };

  const fetchTeachers = async () => {
    try {
      const res = await axios.get(`${API_BASE}/teachers`);
      setTeachers(res.data);
    } catch (err) {
      console.error("Error fetching teachers:", err);
      alert("Failed to fetch teachers. Please try again.");
    }
  };

  const fetchStudents = async () => {
    try {
      const res = await axios.get(`${API_BASE}/students`);
      setStudents(res.data);
    } catch (err) {
      console.error("Error fetching students:", err);
      alert("Failed to fetch students. Please try again.");
    }
  };

  const fetchAttendance = async () => {
    try {
      const res = await axios.get(`${API_BASE}/attendance/report`);
      setAttendance(res.data);
    } catch (err) {
      console.error("Error fetching attendance:", err);
      alert("Failed to fetch attendance. Please try again.");
    }
  };

  const handleLogin = async () => {
    try {
      const res = await axios.post(`${API_BASE}/admin/login`, {
        email: loginEmail,
        password: loginPassword,
      });
      localStorage.setItem("admintoken", res.data.token);
      setToken(res.data.token);
      setPage("dashboard");
      navigate('/');
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
      setRegName("");
      setRegEmail("");
      setRegPassword("");
      setRegDomain("");
      setPage("login");
      navigate('/login');
    } catch (err) {
      alert(err.response?.data?.message || "Registration failed");
    }
  };

  const logout = () => {
    localStorage.removeItem("admintoken");
    setToken("");
    setPage("login");
    navigate('/login');
  };

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

  const handleDownloadQR = (rollNo) => {
    const canvas = document.getElementById(`qr-${rollNo}`);
    const pngUrl = canvas
      .toDataURL("image/png")
      .replace("image/png", "image/octet-stream");
    const link = document.createElement("a");
    link.href = pngUrl;
    link.download = `${rollNo}_QR.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportCSV = (data, filename) => {
    if (!data || data.length === 0) return alert("No data to export!");
    const headers = Object.keys(data[0]);
    const rows = data.map((obj) =>
      headers.map((header) => `"${obj[header] ?? ""}"`).join(",")
    );
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

  const handleToggleAttendance = (rollNo, name) => {
    setAttendanceRecord((prev) => {
      const newStatus = prev[rollNo] === "Present" ? "Absent" : "Present";
      const updated = { ...prev, [rollNo]: newStatus };

      const allPresent = Object.entries(updated)
        .filter(([_, status]) => status === "Present")
        .map(([r]) => r);
      const allAbsent = Object.entries(updated)
        .filter(([_, status]) => status === "Absent")
        .map(([r]) => r);

      setPresentList(students.filter((s) => allPresent.includes(s.rollNo)));
      setAbsentList(students.filter((s) => allAbsent.includes(s.rollNo)));

      return updated;
    });
  };

  const handleSubmitAttendance = async () => {
    try {
      const records = Object.entries(attendanceRecord).map(([rollNo, status]) => ({
        rollNo,
        status,
      }));
      await axios.post(`${API_BASE}/attendance/mark`, { records });
      alert("✅ Attendance submitted successfully!");
      fetchAttendance();
      setAttendanceRecord({});
      setPresentList([]);
      setAbsentList([]);
    } catch (err) {
      alert(err.response?.data?.message || "Error submitting attendance");
    }
  };

  const renderDashboard = () => (
    <div className="admin-card">
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
      <button onClick={() => navigate('/teacher')}>Go to Teacher Module</button>
      <button onClick={() => navigate('/student')}>Go to Student Module</button>
    </div>
  );

  const renderTeachers = () => (
    <div className="admin-card">
      <h3>👩‍🏫 Manage Teachers</h3>
      <div className="form-row">
        <input
          placeholder="Name"
          value={teacherName}
          onChange={(e) => setTeacherName(e.target.value)}
          className="input-field"
        />
        <input
          placeholder="Email"
          value={teacherEmail}
          onChange={(e) => setTeacherEmail(e.target.value)}
          className="input-field"
        />
        <input
          placeholder="Password"
          type="password"
          value={teacherPassword}
          onChange={(e) => setTeacherPassword(e.target.value)}
          className="input-field"
        />
        <input
          placeholder="Class Assigned"
          value={teacherClass}
          onChange={(e) => setTeacherClass(e.target.value)}
          className="input-field"
        />
        <button onClick={handleAddTeacher} className="btn btn-primary">Add Teacher</button>
      </div>
      <button onClick={() => exportCSV(teachers, "teachers")} className="btn btn-secondary">⬇ Export CSV</button>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Class</th>
          </tr>
        </thead>
        <tbody>
          {teachers.map((t) => (
            <tr key={t._id}>
              <td>{t.name}</td>
              <td>{t.email}</td>
              <td>{t.classAssigned}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const renderStudents = () => (
    <div className="admin-card">
      <h3>🎓 Manage Students</h3>
      <div className="form-row">
        <input
          placeholder="Full Name"
          value={studentFullName}
          onChange={(e) => setStudentFullName(e.target.value)}
          className="input-field"
        />
        <input
          placeholder="Roll No"
          value={studentRollNo}
          onChange={(e) => setStudentRollNo(e.target.value)}
          className="input-field"
        />
        <input
          placeholder="Class"
          value={studentClass}
          onChange={(e) => setStudentClass(e.target.value)}
          className="input-field"
        />
        <input
          placeholder="Section"
          value={studentSection}
          onChange={(e) => setStudentSection(e.target.value)}
          className="input-field"
        />
        <input
          placeholder="Parent Name"
          value={parentName}
          onChange={(e) => setParentName(e.target.value)}
          className="input-field"
        />
        <input
          placeholder="Parent Number"
          value={parentNumber}
          onChange={(e) => setParentNumber(e.target.value)}
          className="input-field"
        />
        <button onClick={handleAddStudent} className="btn btn-primary">Add Student</button>
      </div>
      <button onClick={() => exportCSV(students, "students")} className="btn btn-secondary">⬇ Export CSV</button>
      <table>
        <thead>
          <tr>
            <th>QR</th>
            <th>Roll</th>
            <th>Name</th>
            <th>Class</th>
            <th>Section</th>
            <th>Parent</th>
            <th>Contact</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {students.map((s) => (
            <tr key={s._id}>
              <td>
                <QRCodeCanvas id={`qr-${s.rollNo}`} value={s.rollNo} size={50} />
              </td>
              <td>{s.rollNo}</td>
              <td>{s.fullName}</td>
              <td>{s.className}</td>
              <td>{s.section}</td>
              <td>{s.parentName}</td>
              <td>{s.parentNumber}</td>
              <td>
                <button onClick={() => handleDownloadQR(s.rollNo)} className="btn btn-primary">
                  Download QR
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const renderAttendance = () => (
    <div className="admin-card">
      <h3>🕒 Attendance Records</h3>
      <div className="attendance-marking">
        <h4>📋 Take Attendance</h4>
        <table>
          <thead>
            <tr>
              <th>Roll No</th>
              <th>Name</th>
              <th>Class</th>
              <th>Mark Attendance</th>
            </tr>
          </thead>
          <tbody>
            {students.map((s) => (
              <tr key={s._id}>
                <td>{s.rollNo}</td>
                <td>{s.fullName}</td>
                <td>{s.className}</td>
                <td>
                  <button
                    onClick={() => handleToggleAttendance(s.rollNo, s.fullName)}
                    style={{
                      background:
                        attendanceRecord[s.rollNo] === "Present"
                          ? "#4CAF50"
                          : attendanceRecord[s.rollNo] === "Absent"
                          ? "#f44336"
                          : "#ddd",
                      color: "white",
                      border: "none",
                      padding: "6px 10px",
                      borderRadius: "4px",
                      cursor: "pointer",
                    }}
                  >
                    {attendanceRecord[s.rollNo] || "Mark"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button
          style={{
            marginTop: "10px",
            background: "#0047AB",
            color: "white",
            border: "none",
            padding: "8px 14px",
            borderRadius: "4px",
            cursor: "pointer",
          }}
          onClick={handleSubmitAttendance}
        >
          ✅ Submit Attendance
        </button>
        <div style={{ marginTop: "15px" }}>
          <h4>Summary</h4>
          <p>
            Present: {presentList.length} | Absent: {absentList.length}
          </p>
          <div className="summary-lists">
            <div>
              <h5>✅ Present Students:</h5>
              <ul>
                {presentList.map((s) => (
                  <li key={s.rollNo}>
                    {s.fullName} ({s.rollNo})
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h5>❌ Absent Students:</h5>
              <ul>
                {absentList.map((s) => (
                  <li key={s.rollNo}>
                    {s.fullName} ({s.rollNo})
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
      <div style={{ marginTop: "40px" }}>
        <h4>📄 Attendance Report</h4>
        <div style={{ marginBottom: "10px" }}>
          <button onClick={() => exportCSV(attendance, "attendance_report")} className="btn btn-secondary">
            ⬇ Export CSV
          </button>
          <button onClick={exportAttendancePDF} className="btn btn-primary">📄 Export PDF</button>
        </div>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Student</th>
              <th>Roll</th>
              <th>Class</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {attendance.map((a, i) => (
              <tr key={i}>
                <td>{a.date}</td>
                <td>{a.student?.fullName}</td>
                <td>{a.student?.rollNo}</td>
                <td>{a.student?.className}</td>
                <td>{a.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  if (!token && page === "login") {
    return (
      <div className="centered">
        <h2>Admin Login</h2>
        <input
          placeholder="Institution Email"
          value={loginEmail}
          onChange={(e) => setLoginEmail(e.target.value)}
          className="input-field"
        />
        <input
          type="password"
          placeholder="Password"
          value={loginPassword}
          onChange={(e) => setLoginPassword(e.target.value)}
          className="input-field"
        />
        <button onClick={handleLogin} className="btn btn-primary">Login</button>
        <p>
          No account?{" "}
          <button onClick={() => setPage("register")} className="btn btn-secondary">
            Register
          </button>
        </p>
      </div>
    );
  }

  if (!token && page === "register") {
    return (
      <div className="centered">
        <h2>Register Admin</h2>
        <input
          placeholder="Full Name"
          value={regName}
          onChange={(e) => setRegName(e.target.value)}
          className="input-field"
        />
        <input
          placeholder="Institution Email"
          value={regEmail}
          onChange={(e) => setRegEmail(e.target.value)}
          className="input-field"
        />
        <input
          placeholder="Password"
          type="password"
          value={regPassword}
          onChange={(e) => setRegPassword(e.target.value)}
          className="input-field"
        />
        <input
          placeholder="Institution Domain"
          value={regDomain}
          onChange={(e) => setRegDomain(e.target.value)}
          className="input-field"
        />
        <button onClick={handleRegister} className="btn btn-primary">Register</button>
        <p>
          Already registered? <button onClick={() => navigate('/login')} className="btn btn-secondary">Login</button>
        </p>
      </div>
    );
  }

  return (
    <div>
      <nav className="navbar">
        <h2>🏫 Admin Panel</h2>
        <div className="nav-buttons">
          <button onClick={() => setPage("dashboard")}>Dashboard</button>
          <button onClick={() => setPage("teachers")}>Teachers</button>
          <button onClick={() => setPage("students")}>Students</button>
          <button onClick={() => setPage("attendance")}>Attendance</button>
          <button onClick={logout}>Logout</button>
        </div>
      </nav>
      <main className="content">
        {page === "dashboard"
          ? renderDashboard()
          : page === "teachers"
          ? renderTeachers()
          : page === "students"
          ? renderStudents()
          : renderAttendance()}
      </main>
    </div>
  );
}

// Main Login Component
function MainLogin() {
  const navigate = useNavigate();
  const [role, setRole] = useState('admin');
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [status, setStatus] = useState('Please log in.');

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setLoginForm(prev => ({ ...prev, [name]: value }));
  };

  const handleLogin = async () => {
    try {
      const endpoint = role === 'admin' ? '/api/admin/login' : '/api/teachers/login';
      const res = await axios.post(`http://localhost:5000${endpoint}`, {
        email: loginForm.email,
        password: loginForm.password,
      });
      const token = res.data.token;
      if (role === 'admin') {
        localStorage.setItem('admintoken', token);
        navigate('/');
      } else {
        localStorage.setItem('teachertoken', token);
        navigate('/teacher');
      }
      setStatus('Login successful. Redirecting...');
      setLoginForm({ email: '', password: '' });
    } catch (err) {
      setStatus(err.response?.data?.message || 'Login failed');
    }
  };

  return (
    <div className="centered" style={{ minHeight: '100vh' }}>
      <h2>{role === 'admin' ? 'Admin Login' : 'Teacher Login'}</h2>
      <select
        value={role}
        onChange={(e) => setRole(e.target.value)}
        className="input-field"
      >
        <option value="admin">Admin</option>
        <option value="teacher">Teacher</option>
      </select>
      <input
        type="email"
        name="email"
        placeholder="Email"
        value={loginForm.email}
        onChange={handleInputChange}
        className="input-field"
      />
      <input
        type="password"
        name="password"
        placeholder="Password"
        value={loginForm.password}
        onChange={handleInputChange}
        className="input-field"
      />
      <button onClick={handleLogin} className="btn btn-primary">Login</button>
      {role === 'admin' && (
        <p>
          No account? <button onClick={() => navigate('/register')} className="btn btn-secondary">Register</button>
        </p>
      )}
      <p className="status-bar"><strong>Status:</strong> {status}</p>
    </div>
  );
}

// TeacherLogin Wrapper (for /teacher route)
function TeacherLogin({ setView }) {
  const navigate = useNavigate();
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [status, setStatus] = useState('Please log in.');

  const handleLoginInputChange = (e) => {
    const { name, value } = e.target;
    setLoginForm(prev => ({ ...prev, [name]: value }));
  };

  const handleLogin = async () => {
    try {
      const res = await axios.post('http://localhost:5000/api/teachers/login', {
        email: loginForm.email,
        password: loginForm.password,
      });
      localStorage.setItem('teachertoken', res.data.token);
      setStatus('Login successful. Redirecting...');
      setView('teacher');
      setLoginForm({ email: '', password: '' });
    } catch (err) {
      setStatus(err.response?.data?.message || 'Invalid email or password.');
    }
  };

  return (
    <div className="centered" style={{ minHeight: '100vh' }}>
      <h2>Teacher Login</h2>
      <input
        type="email"
        name="email"
        placeholder="Email"
        value={loginForm.email}
        onChange={handleLoginInputChange}
        className="input-field"
      />
      <input
        type="password"
        name="password"
        placeholder="Password"
        value={loginForm.password}
        onChange={handleLoginInputChange}
        className="input-field"
      />
      <button onClick={handleLogin} className="btn btn-primary">Login</button>
      <p>
        Back to <button onClick={() => navigate('/login')} className="btn btn-secondary">Main Login</button>
      </p>
      <p className="status-bar"><strong>Status:</strong> {status}</p>
    </div>
  );
}

// Main App Component
export default function App() {
  const [view, setView] = useState('main');
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [status, setStatus] = useState('Loading models, please wait...');
  const [enrolledStudents, setEnrolledStudents] = useState([]);
  const [attendance, setAttendance] = useState([]);

  useEffect(() => {
    const loadApp = async () => {
      setStatus('Loading face recognition models...');
      const MODEL_URL = '/models';
      try {
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
          faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
        ]);
        setModelsLoaded(true);
        setStatus('Ready.');
      } catch (error) {
        setStatus('Error loading models. Check console.');
        console.error(error);
        return;
      }

      const loadEnrolledStudents = () => {
        const data = localStorage.getItem('enrolledStudents');
        if (!data) return [];
        try {
          const parsedData = JSON.parse(data);
          return parsedData.map(d => ({
            ...d,
            descriptor: new faceapi.LabeledFaceDescriptors(d.label, [new Float32Array(Object.values(d.descriptor[0]))])
          }));
        } catch (error) {
          console.error('Error parsing enrolled students:', error);
          return [];
        }
      };

      setEnrolledStudents(loadEnrolledStudents());

      const loadAttendance = () => {
        const data = localStorage.getItem('attendance');
        if (!data) return [];
        try {
          return JSON.parse(data);
        } catch (error) {
          console.error('Error parsing attendance:', error);
          return [];
        }
      };

      setAttendance(loadAttendance());
    };

    loadApp();
  }, []);

  useEffect(() => {
    localStorage.setItem('enrolledStudents', JSON.stringify(enrolledStudents));
  }, [enrolledStudents]);

  useEffect(() => {
    localStorage.setItem('attendance', JSON.stringify(attendance));
  }, [attendance]);

  return (
    <Router>
      <Routes>
        <Route path="/login" element={<MainLogin />} />
        <Route path="/register" element={<AdminPanel />} />
        <Route
          path="/"
          element={
            localStorage.getItem('admintoken') ? (
              <AdminPanel />
            ) : (
              <Navigate to="/login" />
            )
          }
        />
        <Route
          path="/teacher"
          element={
            localStorage.getItem('teachertoken') ? (
              <TeacherModule
                setStatus={setStatus}
                modelsLoaded={modelsLoaded}
                enrolledStudents={enrolledStudents}
                setEnrolledStudents={setEnrolledStudents}
                attendance={attendance}
                setAttendance={setAttendance}
                setView={setView}
              />
            ) : (
              <TeacherLogin setView={setView} />
            )
          }
        />
        <Route
          path="/student"
          element={
            localStorage.getItem('admintoken') || localStorage.getItem('teachertoken') ? (
              <StudentModule
                setStatus={setStatus}
                modelsLoaded={modelsLoaded}
                enrolledStudents={enrolledStudents}
                attendance={attendance}
                setAttendance={setAttendance}
                setView={setView}
              />
            ) : (
              <Navigate to="/login" />
            )
          }
        />
      </Routes>
    </Router>
  );
}