// src/App.jsx

import React, { useState, useEffect, useRef } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import axios from "axios";
import * as faceapi from "face-api.js";
import Dexie from 'dexie';
import 'dexie-syncable';
import { QRCodeCanvas } from "qrcode.react";
import jsPDF from "jspdf";
import "jspdf-autotable";
import db from './db.js';
import "./index.css";



// ============================================================================
// EnrollmentModal Component
// ============================================================================
function EnrollmentModal({ setStatus, modelsLoaded, closeModal }) {
  const videoRef = useRef(null);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    usn: "",
    parentEmail: "",
    parentPhone: "+91",
  });

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    let processedValue = value;

    if (name === "parentPhone") {
      // Allow only digits after +91, max 12 chars (+91 + 10 digits)
      processedValue = value.replace(/[^\d+]/g, '');
      if (processedValue.startsWith('9') && processedValue.length > 2 && !processedValue.startsWith('+919')) {
        processedValue = '+91' + processedValue;
      } else if (!processedValue.startsWith('+91') && processedValue.length >= 2) {
        processedValue = '+91' + processedValue.slice(0, 10);
      }
      // Truncate to valid length
      if (processedValue.length > 12) processedValue = processedValue.slice(0, 12);
    }

    setFormData((prev) => ({ ...prev, [name]: processedValue }));
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: {} });
      if (videoRef.current) videoRef.current.srcObject = stream;
      setIsCameraOn(true);
      setStatus("Camera started. Position student's face.");
    } catch (err) {
      setStatus("Webcam access denied. Please allow camera access.");
      console.error("Webcam error:", err);
    }
  };

  const handleEnroll = async () => {
    if (!formData.name || !formData.usn) {
      setStatus("Name and USN are required.");
      return;
    }
    setStatus(
      `Capturing multiple faces for ${formData.name}... Please hold still and vary your angle slightly.`
    );

    try {
      const descriptors = [];
      for (let i = 0; i < 3; i++) {
        const detection = await faceapi
          .detectSingleFace(videoRef.current, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.6 }))
          .withFaceLandmarks()
          .withFaceDescriptor();

        if (!detection) {
          setStatus(
            `Capture ${i + 1} failed: No face detected. Ensure face is centered and well-lit.`
          );
          return;
        }
        descriptors.push(Array.from(detection.descriptor));
        console.log(`Capture ${i + 1} descriptor:`, detection.descriptor);
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      await db.students.add({
        fullName: formData.name,
        rollNo: formData.usn,
        className: "",
        section: "",
        parentName: formData.parentEmail || "N/A",
        parentNumber: formData.parentPhone || "N/A",
        faceDescriptors: JSON.stringify(descriptors),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      setStatus(`${formData.name} enrolled successfully with multiple captures!`);
      closeModal();
    } catch (error) {
      setStatus("An error occurred during enrollment. Check console.");
      console.error("Enrollment error:", error);
    }
  };

  useEffect(() => {
    if (modelsLoaded) { // Automatically start camera when models are loaded and modal is open
        startCamera();
    }
    return () => {
      if (videoRef.current?.srcObject) {
        videoRef.current.srcObject.getTracks().forEach((track) => track.stop());
      }
    };
  }, [modelsLoaded]);

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
            placeholder="Parent's Phone (e.g., 9380680180 → +919380680180)"
            value={formData.parentPhone}
            onChange={handleInputChange}
            className="input-field"
            pattern="\+91[6-9]\d{9}"
            title="Enter 10-digit Indian mobile number (starts with 6-9)"
          />
        </div>
        <div className="camera-container small">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className={isCameraOn ? "" : "hidden"}
          />
          {!isCameraOn && <div className="camera-placeholder">Camera is off</div>}
        </div>
        <div className="modal-actions">
          {!isCameraOn ? (
            <button onClick={() => setIsCameraOn(true)} className="btn btn-secondary">
              Start Camera
            </button>
          ) : (
            <button
              onClick={handleEnroll}
              disabled={!modelsLoaded}
              className="btn btn-primary"
            >
              Capture Multiple and Enroll
            </button>
          )}
          <button onClick={closeModal} className="btn btn-danger">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}


// ============================================================================
// StudentModule Component
// ============================================================================
function StudentModule({ setStatus, modelsLoaded, setView }) {
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const [isAttendanceRunning, setIsAttendanceRunning] = useState(false);
    const [lastRecognized, setLastRecognized] = useState(null);
    const [currentClass, setCurrentClass] = useState(null);
    const recognitionIntervalRef = useRef(null);
    const [attendanceData, setAttendanceData] = useState([]);
    const [studentData, setStudentData] = useState([]);

    const playBeep = () => {
        try {
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioCtx.createOscillator();
            oscillator.type = "sine";
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
    
    const fetchData = async () => {
        const today = new Date().toLocaleDateString();
        const att = await db.attendance.filter(a => new Date(a.date).toLocaleDateString() === today).toArray();
        const stu = await db.students.toArray();
        setAttendanceData(att);
        setStudentData(stu);
    };

    useEffect(() => {
        const classData = localStorage.getItem("currentClass");
        if (classData) setCurrentClass(JSON.parse(classData));

        const startWebcam = async () => {
            if (!videoRef.current) return;
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ video: {} });
                videoRef.current.srcObject = stream;
            } catch (err) {
                setStatus("Webcam access denied. Please allow camera access.");
                console.error("Webcam error:", err);
            }
        };
        startWebcam();
        fetchData();

        return () => {
            if (recognitionIntervalRef.current) clearInterval(recognitionIntervalRef.current);
            if (videoRef.current?.srcObject) {
                videoRef.current.srcObject.getTracks().forEach((track) => track.stop());
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

    const startRecognition = async () => {
        const students = await db.students.toArray();
        const faceMatcher = new faceapi.FaceMatcher(
            students.map((s) => {
                const descriptors = JSON.parse(s.faceDescriptors).map((d) => new Float32Array(d));
                return new faceapi.LabeledFaceDescriptors(`${s.fullName} (${s.rollNo})`, descriptors);
            }),
            0.5
        );

        recognitionIntervalRef.current = setInterval(async () => {
            if (!videoRef.current || videoRef.current.readyState !== 4) return;

            const detections = await faceapi
                .detectAllFaces(videoRef.current, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.6 }))
                .withFaceLandmarks()
                .withFaceDescriptors();
            const displaySize = { width: videoRef.current.videoWidth, height: videoRef.current.videoHeight };
            if (displaySize.width === 0) return;

            const resizedDetections = faceapi.resizeResults(detections, displaySize);

            if (canvasRef.current) {
                const context = canvasRef.current.getContext("2d");
                context.clearRect(0, 0, displaySize.width, displaySize.height);
            }

            for (const detection of resizedDetections) {
                const bestMatch = faceMatcher.findBestMatch(detection.descriptor);
                const student = students.find((s) => `${s.fullName} (${s.rollNo})` === bestMatch.label);
                const box = detection.detection.box;

                let label = "Unknown";
                let boxColor = "#EF4444";

                if (student) {
                    const isAlreadyMarked = (await db.attendance
                        .where("studentId")
                        .equals(student.id)
                        .filter((a) => new Date(a.date).toLocaleDateString() === new Date().toLocaleDateString())
                        .toArray()).length > 0;
                    
                    if (!isAlreadyMarked) {
                        label = `${student.fullName} (${student.rollNo}) - Marked!`;
                        boxColor = "#10B981";
                        const className = currentClass?.className || "Unknown";
                        await db.attendance.add({
                            studentId: student.id,
                            date: new Date(),
                            status: "Present",
                            className,
                            confidence: (1 - bestMatch.distance).toFixed(2),
                            timestamp: new Date(),
                        });
                        setLastRecognized({
                            name: student.fullName,
                            usn: student.rollNo,
                            className,
                            timestamp: new Date().toLocaleTimeString(),
                            confidence: (1 - bestMatch.distance).toFixed(2),
                        });
                        playBeep();
                        fetchData(); // Refresh attendance list
                    } else {
                        label = `${student.fullName} (${student.rollNo})`;
                        boxColor = "#3B82F6";
                    }
                }

                if (canvasRef.current) {
                    const context = canvasRef.current.getContext("2d");
                    context.strokeStyle = boxColor;
                    context.lineWidth = 2;
                    context.strokeRect(box.x, box.y, box.width, box.height);

                    const text = label;
                    const textMetrics = context.measureText(text);
                    const textHeight = 20;
                    const textX = box.x;
                    const textY = box.y > textHeight ? box.y - 5 : box.y + box.height + 15;

                    context.fillStyle = boxColor;
                    context.fillRect(textX, textY - textHeight, textMetrics.width + 4, textHeight);
                    context.fillStyle = "white";
                    context.font = "14px Arial";
                    context.fillText(text, textX + 2, textY - 5);
                }
            }
        }, 1500);
    };

    return (
        <main className="main-grid-student">
            <div className="card camera-card">
                <h2>Attendance for {currentClass ? currentClass.className : "Class"}</h2>
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
                    disabled={!modelsLoaded || studentData.length === 0}
                    className={`btn btn-toggle-attendance ${isAttendanceRunning ? "running" : ""}`}
                >
                    {isAttendanceRunning ? "Stop Scanning" : "Start Scanning"}
                </button>
                <button
                    onClick={() => setView("main")}
                    className="btn btn-secondary"
                    style={{ marginTop: "10px" }}
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
                <div className="attendance-header">
                    Present: {attendanceData.length} / {studentData.length}
                </div>
                <div className="list-container">
                    <ul className="list attendance-list">
                        {attendanceData.length > 0 ? (
                            attendanceData.map((rec) => {
                                const student = studentData.find(s => s.id === rec.studentId);
                                return (
                                    <li key={rec.id} className="list-item">
                                        <div>
                                            {student?.fullName} ({student?.rollNo}) - {rec.className}
                                        </div>
                                        <div className="details">
                                            <span>Time: {new Date(rec.timestamp).toLocaleTimeString()}</span>
                                            <span>Confidence: {rec.confidence || "N/A"}</span>
                                        </div>
                                    </li>
                                );
                            })
                        ) : (
                            <li className="list-item-placeholder">No students marked present yet.</li>
                        )}
                    </ul>
                </div>
            </div>
        </main>
    );
}

// ============================================================================
// TeacherModule Component
// ============================================================================
function TeacherModule({ setStatus, modelsLoaded, setView }) {
  const [activePage, setActivePage] = useState("enrollment");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [classForm, setClassForm] = useState({
    className: "",
    classTime: "09:00",
    gracePeriod: 15,
  });
  const [todayClasses, setTodayClasses] = useState([]);
  const [dailySummaries, setDailySummaries] = useState([]);
  const [reportType, setReportType] = useState("daily");
  const [reportData, setReportData] = useState(null);
  const [allStudents, setAllStudents] = useState([]);
  const [presentStudents, setPresentStudents] = useState([]);
  const navigate = useNavigate();

  const fetchData = async () => {
    const today = new Date().toLocaleDateString();
    const all = await db.students.toArray();
    const presentIds = (await db.attendance
        .filter(a => new Date(a.date).toLocaleDateString() === today)
        .toArray())
        .map(a => a.studentId);
    
    setAllStudents(all);
    setPresentStudents(all.filter(s => presentIds.includes(s.id)));
  };

  useEffect(() => {
    fetchData();
    const classes = localStorage.getItem("classes");
    if (classes) {
      const allClasses = JSON.parse(classes);
      const today = new Date().toLocaleDateString();
      setTodayClasses(allClasses.filter((c) => c.date === today));
    }
  }, [activePage]);

  const handleEnrollClick = () => setIsModalOpen(true);

  const handleClassInputChange = (e) => {
    const { name, value } = e.target;
    setClassForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleCreateClass = () => {
    if (!classForm.className) return setStatus("Class name is required.");
    const newClass = {
      ...classForm,
      date: new Date().toLocaleDateString(),
      gracePeriod: parseInt(classForm.gracePeriod),
    };
    const classes = localStorage.getItem("classes")
      ? JSON.parse(localStorage.getItem("classes"))
      : [];
    localStorage.setItem("classes", JSON.stringify([...classes, newClass]));
    setTodayClasses((prev) => [...prev, newClass]);
    localStorage.setItem("currentClass", JSON.stringify(newClass));
    setStatus(
      `Class "${classForm.className}" created. Redirecting to start attendance...`
    );
    navigate("/student");
  };

  const handleManualOverride = async (studentId, isPresent) => {
      const currentClass = localStorage.getItem("currentClass") ? JSON.parse(localStorage.getItem("currentClass")) : null;
      const className = currentClass ? currentClass.className : "Unknown";
      const today = new Date().toLocaleDateString();

      if (isPresent) {
          await db.attendance
              .where({ studentId: studentId })
              .filter(a => new Date(a.date).toLocaleDateString() === today)
              .delete();
      } else {
          await db.attendance.add({
              studentId: studentId,
              date: new Date(),
              status: "Present",
              className,
              confidence: "Manual",
              timestamp: new Date(),
          });
      }
      fetchData();
  };

  const validateAndFormatPhone = (phone) => {
    if (!phone) return null;
    let cleaned = phone.replace(/[^\d+]/g, '');
    if (!cleaned.startsWith('+91') && cleaned.length === 10 && /^([6-9]\d{9})$/.test(cleaned)) {
      cleaned = '+91' + cleaned;
    }
    return (cleaned.startsWith('+91') && cleaned.length === 12) ? cleaned : null;
  };

  const sendNotifications = async (summary, type = "absent") => {
    const students = await db.students.toArray();
    const currentClass = localStorage.getItem("currentClass") ? JSON.parse(localStorage.getItem("currentClass")) : null;
    const toNotifyList = type === "late" ? summary.late : summary.absent;

    if (toNotifyList.length === 0) {
      setStatus(`No ${type} students to notify.`);
      return;
    }

    const emailStudents = toNotifyList
      .map((studentEntry) => {
        const rollNo = studentEntry.split(" (")[1]?.replace(")", "");
        const student = students.find((s) => s.rollNo === rollNo);
        return student && student.parentEmail ? {
          fullName: student.fullName,
          rollNo: student.rollNo,
          parentEmail: student.parentEmail,
        } : null;
      })
      .filter(Boolean);

    const smsStudents = toNotifyList
      .map((studentEntry) => {
        const rollNo = studentEntry.split(" (")[1]?.replace(")", "");
        const student = students.find((s) => s.rollNo === rollNo);
        const formattedPhone = validateAndFormatPhone(student?.parentNumber || '');
        return student && formattedPhone ? {
          fullName: student.fullName,
          rollNo: student.rollNo,
          parentNumber: formattedPhone,
        } : null;
      })
      .filter(Boolean);

    const className = currentClass ? currentClass.className : "Class";
    const date = summary.date;
    const schoolName = "Your School"; // Replace with your school's name
    const status = type.charAt(0).toUpperCase() + type.slice(1);

    try {
      setStatus(`Sending ${type} notifications to ${toNotifyList.length} parents...`);

      let emailSuccess = 0, smsSuccess = 0, emailFailed = [], smsFailed = [];

      if (emailStudents.length > 0) {
        const emailRes = await axios.post("http://localhost:5000/api/notifications/send-email", {
          students: emailStudents,
          status,
          className,
          date,
          schoolName,
        }, {
          headers: { Authorization: `Bearer ${localStorage.getItem("teachertoken")}` }
        });
        emailSuccess = emailRes.data.details.successful;
        emailFailed = emailRes.data.details.failed;
        console.log("Email Response:", emailRes.data);
      }

      if (smsStudents.length > 0) {
        const smsRes = await axios.post("http://localhost:5000/api/notifications/send-sms", {
          students: smsStudents,
          status,
          className,
          date,
          schoolName,
        }, {
          headers: { Authorization: `Bearer ${localStorage.getItem("teachertoken")}` }
        });
        smsSuccess = smsRes.data.details.successful;
        smsFailed = smsRes.data.details.failed;
        console.log("SMS Response:", smsRes.data);
      }

      const failedMessages = [];
      if (emailFailed.length > 0) {
        failedMessages.push(`Email failed for: ${emailFailed.map(f => `${f.student} (${f.error})`).join(", ")}`);
      }
      if (smsFailed.length > 0) {
        failedMessages.push(`SMS failed for: ${smsFailed.map(f => `${f.student} (${f.error})`).join(", ")}`);
      }

      setStatus(
        `Notifications sent! Emails: ${emailSuccess}/${emailStudents.length}, SMS: ${smsSuccess}/${smsStudents.length}.` +
        (failedMessages.length > 0 ? ` Failures: ${failedMessages.join("; ")}` : "")
      );
    } catch (err) {
      console.error("Notification error:", err);
      setStatus(`Failed to send notifications: ${err.response?.data?.message || err.message}`);
    }
  };

  const handleGenerateSummary = async () => {
    const today = new Date().toLocaleDateString();
    const todayAttendance = await db.attendance.filter(a => new Date(a.date).toLocaleDateString() === today).toArray();
    const students = await db.students.toArray();
    const currentClass = localStorage.getItem("currentClass") ? JSON.parse(localStorage.getItem("currentClass")) : null;

    const present = [];
    const late = [];
    const presentIds = [];
    
    todayAttendance.forEach((rec) => {
        const student = students.find((s) => s.id === rec.studentId);
        if (student) {
            presentIds.push(student.id);
            if (currentClass && currentClass.classTime) {
                const attendanceTime = new Date(rec.timestamp);
                const [hours, minutes] = currentClass.classTime.split(':');
                const classStart = new Date(today);
                classStart.setHours(hours, minutes, 0, 0);
                const graceEnd = new Date(classStart.getTime() + (currentClass.gracePeriod || 0) * 60 * 1000);

                if (attendanceTime > graceEnd) {
                    late.push(student);
                } else {
                    present.push(student);
                }
            } else {
                present.push(student);
            }
        }
    });

    const absent = students.filter(s => !presentIds.includes(s.id));
    
    const newSummary = {
      date: today,
      present: present.map((s) => `${s.fullName} (${s.rollNo})`),
      absent: absent.map((s) => `${s.fullName} (${s.rollNo})`),
      late: late.map((s) => `${s.fullName} (${s.rollNo})`),
    };
    setDailySummaries((prev) => [...prev.filter((s) => s.date !== today), newSummary]);
    setStatus(`Summary generated for ${today}. Late students: ${late.length}.`);

    // Auto-send notifications for absent and late students
    if (absent.length > 0) {
      await sendNotifications(newSummary, "absent");
    }
    if (late.length > 0) {
      await sendNotifications(newSummary, "late");
    }

    setActivePage("summary");
  };

  const handleGenerateReport = async () => {
    const now = new Date();
    let startDate, endDate;
    let reportTitle = "Daily";

    switch (reportType) {
        case "weekly":
            reportTitle = "Weekly";
            startDate = new Date(now);
            startDate.setDate(now.getDate() - now.getDay());
            endDate = new Date(startDate);
            endDate.setDate(startDate.getDate() + 6);
            break;
        case "monthly":
            reportTitle = "Monthly";
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
            break;
        default: // daily
            startDate = now;
            endDate = now;
            break;
    }

    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(23, 59, 59, 999);
    
    const filteredAttendance = await db.attendance.where('date').between(startDate, endDate).toArray();
    
    const allClasses = localStorage.getItem("classes") ? JSON.parse(localStorage.getItem("classes")) : [];
    const totalClasses = allClasses.filter(c => {
        const classDate = new Date(c.date);
        return classDate >= startDate && classDate <= endDate;
    }).length;
    
    const studentReports = (await db.students.toArray()).map((s) => {
        const attended = filteredAttendance.filter((a) => a.studentId === s.id).length;
        const percentage = totalClasses > 0 ? Math.round((attended / totalClasses) * 100) : 0;
        return { ...s, attended, total: totalClasses, percentage };
    });

    setReportData({ startDate: startDate.toLocaleDateString(), endDate: endDate.toLocaleDateString(), studentReports });
    setStatus(`${reportTitle} report generated. Total classes: ${totalClasses}.`);
  };

  const handleLogout = () => {
    localStorage.removeItem("teachertoken");
    setView("main");
    navigate("/");
  };

  const renderPage = () => {
    switch (activePage) {
      case "enrollment":
        return (
          <div className="card">
            <h2>Enroll Students</h2>
            <button onClick={handleEnrollClick} className="btn btn-primary">
              Enroll New Student
            </button>
          </div>
        );
      case "create-class":
        return (
          <div className="card">
            <h2>Create Class</h2>
            <div className="enrollment-form">
              <input type="text" name="className" placeholder="Class Name (e.g., Math 101)" value={classForm.className} onChange={handleClassInputChange} className="input-field" />
              <input type="time" name="classTime" value={classForm.classTime} onChange={handleClassInputChange} className="input-field" />
              <input type="number" name="gracePeriod" placeholder="Grace Period (minutes, e.g., 15)" value={classForm.gracePeriod} onChange={handleClassInputChange} className="input-field" min="0" max="60" />
              <button onClick={handleCreateClass} className="btn btn-primary">Create Class & Start Attendance</button>
            </div>
          </div>
        );
      case "attendance":
        const absentStudents = allStudents.filter(s => !presentStudents.some(ps => ps.id === s.id));
        return (
          <div className="card">
            <h2>Attendance</h2>
            <div className="attendance-columns">
              <div className="list-container">
                <h4>Present ({presentStudents.length})</h4>
                <ul className="list">
                  {presentStudents.map(student => (
                    <li key={student.id} className="list-item teacher-list present">
                      {student.fullName} ({student.rollNo})
                      <button onClick={() => handleManualOverride(student.id, true)} title="Mark as Absent">X</button>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="list-container">
                <h4>Absent ({absentStudents.length})</h4>
                <ul className="list">
                  {absentStudents.map(student => (
                    <li key={student.id} className="list-item teacher-list absent">
                      {student.fullName} ({student.rollNo})
                      <button onClick={() => handleManualOverride(student.id, false)} title="Mark as Present">+</button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <button onClick={handleGenerateSummary} className="btn btn-primary" style={{ marginTop: "10px" }}>Generate Today's Summary</button>
          </div>
        );
      case "summary":
        return (
          <div className="card">
            <h2>Daily Summary</h2>
            {dailySummaries.length === 0 ? <p>No summaries yet. Generate one from the Attendance page.</p> : (
              <ul className="list">
                {dailySummaries.map((s) => (
                  <li key={s.date} className="list-item teacher-list">
                    <strong>{s.date}</strong>
                    <p><b>Present:</b> {s.present.join(", ") || "None"}</p>
                    <p><b>Absent:</b> {s.absent.join(", ") || "None"}</p>
                    <p><b>Late:</b> {s.late.join(", ") || "None"}</p>
                    <button onClick={() => sendNotifications(s, "absent")} className="btn btn-secondary" style={{ marginTop: "10px" }}>Send Absent Notifications</button>
                    <button onClick={() => sendNotifications(s, "late")} className="btn btn-warning" style={{ marginTop: "10px", marginLeft: "10px" }}>Send Late Notifications</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      case "reports":
        return (
          <div className="card">
            <h2>Generate Reports</h2>
            <div className="enrollment-form">
              <select value={reportType} onChange={(e) => setReportType(e.target.value)} className="input-field">
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
                  {reportData.studentReports.map((s) => (
                    <li key={s.rollNo} className="list-item">
                      <div><strong>{s.fullName} ({s.rollNo})</strong>: {s.attended}/{s.total} classes ({s.percentage}%)</div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
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
          <button className={`nav-link ${activePage === "enrollment" ? "active" : ""}`} onClick={() => setActivePage("enrollment")}>🧑‍🎓 Enrollment</button>
          <button className={`nav-link ${activePage === "create-class" ? "active" : ""}`} onClick={() => setActivePage("create-class")}>📚 Create Class</button>
          <button className={`nav-link ${activePage === "attendance" ? "active" : ""}`} onClick={() => setActivePage("attendance")}>📋 Attendance</button>
          <button className={`nav-link ${activePage === "summary" ? "active" : ""}`} onClick={() => setActivePage("summary")}>📊 Summary</button>
          <button className={`nav-link ${activePage === "reports" ? "active" : ""}`} onClick={() => setActivePage("reports")}>📈 Reports</button>
          <button className="nav-link logout" onClick={handleLogout}>🚪 Logout</button>
        </nav>
      </aside>

      <div className="main-content">
        <header className="topbar">
          <h1>{activePage.charAt(0).toUpperCase() + activePage.slice(1).replace(/-/g, " ")}</h1>
        </header>
        <section className="page-content">{renderPage()}</section>
      </div>

      {isModalOpen && <EnrollmentModal setStatus={setStatus} modelsLoaded={modelsLoaded} closeModal={() => setIsModalOpen(false)} />}
    </div>
  );
}

// ============================================================================
// AdminPanel Component
// ============================================================================
function AdminPanel() {
  const navigate = useNavigate();
  const location = useLocation();
  const [token, setToken] = useState(localStorage.getItem("admintoken") || "");
  const [page, setPage] = useState(location.pathname === "/register" ? "register" : "login");

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

  // FORM STATES
  const [teacherName, setTeacherName] = useState("");
  const [teacherEmail, setTeacherEmail] = useState("");
  const [teacherPassword, setTeacherPassword] = useState("");
  const [teacherClass, setTeacherClass] = useState("");
  const [studentFullName, setStudentFullName] = useState("");
  const [studentRollNo, setStudentRollNo] = useState("");
  const [studentClass, setStudentClass] = useState("");
  const [studentSection, setStudentSection] = useState("");
  const [parentName, setParentName] = useState("");
  const [parentNumber, setParentNumber] = useState("");
  
  const API_BASE = "http://localhost:5000/api";

  useEffect(() => {
    if (token) {
      setPage("dashboard");
      axios.defaults.headers.common["Authorization"] = `Bearer ${token}`;
      fetchStats();
      fetchTeachers();
      fetchStudents();
      fetchAttendance();
    } else {
      delete axios.defaults.headers.common["Authorization"];
      if (location.pathname !== "/register") {
        setPage("login");
        navigate("/login");
      }
    }
  }, [token, navigate, location.pathname]);

  const fetchData = async (fetchFunc, setFunc, name) => {
    try {
        const res = await fetchFunc();
        setFunc(res.data);
    } catch (err) {
        console.error(`Error fetching ${name}:`, err);
        if (err.response && err.response.status === 401) {
            logout();
        }
    }
  };
  
  const fetchStats = () => fetchData(() => axios.get(`${API_BASE}/admin/stats`), setStats, "stats");
  const fetchTeachers = () => fetchData(() => axios.get(`${API_BASE}/teachers`), setTeachers, "teachers");
  const fetchStudents = () => fetchData(() => axios.get(`${API_BASE}/students`), setStudents, "students");
  const fetchAttendance = () => fetchData(() => axios.get(`${API_BASE}/attendance/report`), setAttendance, "attendance");

  const handleAuth = async (authFunc, payload, successMsg, failureMsg) => {
    try {
        const res = await authFunc(payload);
        if (res.data.token) {
            localStorage.setItem("admintoken", res.data.token);
            setToken(res.data.token);
            navigate("/");
        }
        alert(successMsg);
        return true;
    } catch (err) {
        alert(err.response?.data?.message || failureMsg);
        return false;
    }
  };

  const handleLogin = () => handleAuth(
    (p) => axios.post(`${API_BASE}/admin/login`, p),
    { email: loginEmail, password: loginPassword },
    "✅ Login successful!",
    "Login failed"
  );
  
  const handleRegister = async () => {
    const success = await handleAuth(
        (p) => axios.post(`${API_BASE}/admin/register`, p),
        { name: regName, email: regEmail, password: regPassword, institutionDomain: regDomain },
        "✅ Admin registered successfully!",
        "Registration failed"
    );
    if (success) navigate("/login");
  };

  const logout = () => {
    localStorage.removeItem("admintoken");
    setToken("");
    navigate("/login");
  };

  const handleAddTeacher = async () => {
    try {
      await axios.post(`${API_BASE}/teachers/register`, { name: teacherName, email: teacherEmail, password: teacherPassword, classAssigned: teacherClass });
      alert("✅ Teacher added successfully!");
      setTeacherName(""); setTeacherEmail(""); setTeacherPassword(""); setTeacherClass("");
      fetchTeachers();
    } catch (err) {
      alert(err.response?.data?.message || "Error adding teacher");
    }
  };

  const handleAddStudent = async () => {
    try {
      await axios.post(`${API_BASE}/students/register`, { fullName: studentFullName, rollNo: studentRollNo, className: studentClass, section: studentSection, parentName, parentNumber });
      alert("✅ Student registered successfully!");
      setStudentFullName(""); setStudentRollNo(""); setStudentClass(""); setStudentSection(""); setParentName(""); setParentNumber("");
      fetchStudents();
    } catch (err) {
      alert(err.response?.data?.message || "Error adding student");
    }
  };
  
  const handleDownloadQR = (rollNo) => {
    const canvas = document.getElementById(`qr-${rollNo}`);
    const pngUrl = canvas.toDataURL("image/png").replace("image/png", "image/octet-stream");
    let downloadLink = document.createElement("a");
    downloadLink.href = pngUrl;
    downloadLink.download = `${rollNo}_QR.png`;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
  };
  
  const exportCSV = (data, filename) => {
    if (!data || data.length === 0) return alert("No data to export!");
    const headers = Object.keys(data[0]).filter(key => key !== '_id' && key !== '__v');
    const rows = data.map(obj => headers.map(header => `"${obj[header] ?? ''}"`).join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${filename}.csv`;
    link.click();
  };
  
  const exportAttendancePDF = () => {
    const doc = new jsPDF();
    doc.text("Attendance Report", 14, 15);
    const rows = attendance.map(a => [
        new Date(a.date).toLocaleDateString(), 
        a.student?.fullName || a.studentId, 
        a.student?.rollNo || "N/A", 
        a.student?.className || "N/A", 
        a.status
    ]);
    doc.autoTable({
      head: [["Date", "Student", "Roll No", "Class", "Status"]],
      body: rows,
      startY: 25,
    });
    doc.save("attendance_report.pdf");
  };

  const renderDashboard = () => (
    <div className="admin-card">
      <h3>📊 Dashboard</h3>
      {stats ? (
        <ul>
          <li>Total Students: {stats.totalStudents}</li>
          <li>Total Attendance Records: {stats.totalRecords}</li>
          <li>Today's Present: {stats.totalPresent}</li>
          <li>Today's Absent: {stats.totalAbsent}</li>
          <li>Overall Attendance Rate: {stats.attendanceRate}%</li>
        </ul>
      ) : <p>Loading stats...</p>}
      <button onClick={() => navigate("/teacher")} style={{marginRight: "10px"}}>Go to Teacher Module</button>
      <button onClick={() => navigate("/student")}>Go to Student Module</button>
    </div>
  );

  const renderTeachers = () => (
    <div className="admin-card">
        <h3>👩‍🏫 Manage Teachers</h3>
        <div className="form-row">
            <input placeholder="Name" value={teacherName} onChange={e => setTeacherName(e.target.value)} className="input-field"/>
            <input placeholder="Email" value={teacherEmail} onChange={e => setTeacherEmail(e.target.value)} className="input-field"/>
            <input placeholder="Password" type="password" value={teacherPassword} onChange={e => setTeacherPassword(e.target.value)} className="input-field"/>
            <input placeholder="Class Assigned" value={teacherClass} onChange={e => setTeacherClass(e.target.value)} className="input-field"/>
            <button onClick={handleAddTeacher} className="btn btn-primary">Add</button>
        </div>
        <button onClick={() => exportCSV(teachers, "teachers")} className="btn btn-secondary">⬇ Export CSV</button>
        <div className="table-container">
            <table>
                <thead><tr><th>Name</th><th>Email</th><th>Class Assigned</th></tr></thead>
                <tbody>
                    {teachers.map(t => (
                        <tr key={t._id}>
                            <td>{t.name}</td>
                            <td>{t.email}</td>
                            <td>{t.classAssigned}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    </div>
  );

  const renderStudents = () => (
     <div className="admin-card">
        <h3>🎓 Manage Students</h3>
        <div className="form-row">
            <input placeholder="Full Name" value={studentFullName} onChange={e => setStudentFullName(e.target.value)} className="input-field"/>
            <input placeholder="Roll No" value={studentRollNo} onChange={e => setStudentRollNo(e.target.value)} className="input-field"/>
            <input placeholder="Class" value={studentClass} onChange={e => setStudentClass(e.target.value)} className="input-field"/>
            <input placeholder="Section" value={studentSection} onChange={e => setStudentSection(e.target.value)} className="input-field"/>
            <input placeholder="Parent Name" value={parentName} onChange={e => setParentName(e.target.value)} className="input-field"/>
            <input placeholder="Parent Number" value={parentNumber} onChange={e => setParentNumber(e.target.value)} className="input-field"/>
            <button onClick={handleAddStudent} className="btn btn-primary">Add Student</button>
        </div>
        <button onClick={() => exportCSV(students, "students")} className="btn btn-secondary">⬇ Export CSV</button>
        <div className="table-container">
            <table>
                <thead><tr><th>QR</th><th>Roll No</th><th>Name</th><th>Class</th><th>Section</th><th>Parent</th><th>Contact</th><th>Action</th></tr></thead>
                <tbody>
                    {students.map(s => (
                        <tr key={s._id}>
                            <td><QRCodeCanvas id={`qr-${s.rollNo}`} value={s.rollNo} size={50} /></td>
                            <td>{s.rollNo}</td>
                            <td>{s.fullName}</td>
                            <td>{s.className}</td>
                            <td>{s.section}</td>
                            <td>{s.parentName}</td>
                            <td>{s.parentNumber}</td>
                            <td><button onClick={() => handleDownloadQR(s.rollNo)} className="btn btn-primary">Download QR</button></td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    </div>
  );
  
  const renderAttendance = () => (
    <div className="admin-card">
        <h3>📄 Attendance Report</h3>
        <button onClick={() => exportCSV(attendance, "attendance_report")} className="btn btn-secondary">⬇ Export CSV</button>
        <button onClick={exportAttendancePDF} className="btn btn-primary" style={{marginLeft: "10px"}}>📄 Export PDF</button>
        <div className="table-container">
            <table>
                <thead><tr><th>Date</th><th>Student</th><th>Roll No</th><th>Class</th><th>Status</th></tr></thead>
                <tbody>
                    {attendance.map((a, i) => (
                        <tr key={a._id || i}>
                            <td>{new Date(a.date).toLocaleDateString()}</td>
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
  
  const AuthForm = ({ isRegister }) => (
    <div className="centered">
      <h2>{isRegister ? "Register Admin" : "Admin Login"}</h2>
      {isRegister && <input placeholder="Full Name" value={regName} onChange={e => setRegName(e.target.value)} className="input-field" />}
      <input placeholder="Institution Email" value={isRegister ? regEmail : loginEmail} onChange={e => isRegister ? setRegEmail(e.target.value) : setLoginEmail(e.target.value)} className="input-field" />
      <input type="password" placeholder="Password" value={isRegister ? regPassword : loginPassword} onChange={e => isRegister ? setRegPassword(e.target.value) : setLoginPassword(e.target.value)} className="input-field" />
      {isRegister && <input placeholder="Institution Domain" value={regDomain} onChange={e => setRegDomain(e.target.value)} className="input-field" />}
      <button onClick={isRegister ? handleRegister : handleLogin} className="btn btn-primary">{isRegister ? "Register" : "Login"}</button>
      <p>
        {isRegister ? "Already registered? " : "No account? "}
        <button onClick={() => navigate(isRegister ? '/login' : '/register')} className="btn btn-secondary">{isRegister ? "Login" : "Register"}</button>
      </p>
    </div>
  );

  if (!token) {
    return <AuthForm isRegister={location.pathname === '/register'} />;
  }

  const renderPage = () => {
    switch(page) {
      case "dashboard": return renderDashboard();
      case "teachers": return renderTeachers();
      case "students": return renderStudents();
      case "attendance": return renderAttendance();
      default: return renderDashboard();
    }
  };

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
      <main className="content">{renderPage()}</main>
    </div>
  );
}

// ============================================================================
// MainLogin Component
// ============================================================================
function MainLogin() {
  const navigate = useNavigate();
  const [role, setRole] = useState("admin");
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [status, setStatus] = useState("Please log in.");

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setLoginForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleLogin = async () => {
    try {
      const endpoint = role === "admin" ? "/api/admin/login" : "/api/teachers/login";
      const res = await axios.post(`http://localhost:5000${endpoint}`, {
        email: loginForm.email,
        password: loginForm.password,
      });
      const token = res.data.token;
      if (role === "admin") {
        localStorage.setItem("admintoken", token);
        navigate("/");
      } else {
        localStorage.setItem("teachertoken", token);
        navigate("/teacher");
      }
      setStatus("Login successful. Redirecting...");
    } catch (err) {
      setStatus(err.response?.data?.message || "Login failed");
    }
  };

  return (
    <div className="centered" style={{ minHeight: "100vh" }}>
      <h2>{role === "admin" ? "Admin Login" : "Teacher Login"}</h2>
      <select value={role} onChange={(e) => setRole(e.target.value)} className="input-field">
        <option value="admin">Admin</option>
        <option value="teacher">Teacher</option>
      </select>
      <input type="email" name="email" placeholder="Email" value={loginForm.email} onChange={handleInputChange} className="input-field" />
      <input type="password" name="password" placeholder="Password" value={loginForm.password} onChange={handleInputChange} className="input-field" />
      <button onClick={handleLogin} className="btn btn-primary">Login</button>
      {role === "admin" && (
        <p>No account? <button onClick={() => navigate("/register")} className="btn btn-secondary">Register</button></p>
      )}
      <p className="status-bar"><strong>Status:</strong> {status}</p>
    </div>
  );
}

// ============================================================================
// TeacherLogin Component
// ============================================================================
function TeacherLogin({ setView }) {
    const navigate = useNavigate();
    const [loginForm, setLoginForm] = useState({ email: "", password: "" });
    const [status, setStatus] = useState("Please log in.");

    const handleLoginInputChange = (e) => {
        const { name, value } = e.target;
        setLoginForm((prev) => ({ ...prev, [name]: value }));
    };

    const handleLogin = async () => {
        try {
            const res = await axios.post("http://localhost:5000/api/teachers/login", {
                email: loginForm.email,
                password: loginForm.password,
            });
            localStorage.setItem("teachertoken", res.data.token);
            setStatus("Login successful. Redirecting...");
            // Instead of setView, we navigate which will trigger the parent's logic
            navigate(0); // This forces a reload of the current route to reflect the new auth state
        } catch (err) {
            setStatus(err.response?.data?.message || "Invalid email or password.");
        }
    };

    return (
        <div className="centered" style={{ minHeight: "100vh" }}>
            <h2>Teacher Login</h2>
            <input type="email" name="email" placeholder="Email" value={loginForm.email} onChange={handleLoginInputChange} className="input-field" />
            <input type="password" name="password" placeholder="Password" value={loginForm.password} onChange={handleLoginInputChange} className="input-field" />
            <button onClick={handleLogin} className="btn btn-primary">Login</button>
            <p>Back to <button onClick={() => navigate("/login")} className="btn btn-secondary">Main Login</button></p>
            <p className="status-bar"><strong>Status:</strong> {status}</p>
        </div>
    );
}

// ============================================================================
// Main App Component
// ============================================================================
export default function App() {
  const [view, setView] = useState("main");
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [status, setStatus] = useState("Loading models, please wait...");

  useEffect(() => {
    const loadApp = async () => {
      setStatus("Loading face recognition models...");
      const MODEL_URL = "/models"; // Models should be in the public/models folder
      try {
        await Promise.all([
          faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        ]);
        setModelsLoaded(true);
        setStatus("Ready.");
        console.log("Face-api.js models loaded successfully");

        // Initialize sync when online
        if (navigator.onLine) {
          try {
            await db.syncable.connect("http://localhost:5000/sync", {
              protocol: "http",
              retry: 5,
              error: (err) => setStatus(`Sync error: ${err}`),
              success: () => setStatus("Synced with server."),
            });
          } catch (err) {
            setStatus(`Sync init failed: ${err.message}`);
          }
        }
      } catch (error) {
        setStatus("Error loading models. Check console.");
        console.error("Model loading error:", error);
      }
    };
    loadApp();
  }, []);

  // Network detection for sync
  useEffect(() => {
    const handleOnline = () => {
      setStatus("Attempting to sync...");
      db.syncable.protocols[0]?.sync(); // Trigger sync if protocol exists
    };
    const handleOffline = () => setStatus("Offline mode - data saved locally.");
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);
  
  const ProtectedRoute = ({ children, requiredToken }) => {
    const token = localStorage.getItem(requiredToken);
    return token ? children : <Navigate to="/login" />;
  };

  return (
    <Router>
      <Routes>
        <Route path="/login" element={<MainLogin />} />
        <Route path="/register" element={<AdminPanel />} />
        
        <Route path="/" element={
            <ProtectedRoute requiredToken="admintoken">
                <AdminPanel />
            </ProtectedRoute>
        } />
        
        <Route path="/teacher" element={
            localStorage.getItem("teachertoken") ? (
                <TeacherModule setStatus={setStatus} modelsLoaded={modelsLoaded} setView={setView} />
            ) : (
                <TeacherLogin setView={setView} />
            )
        } />

        <Route path="/student" element={
            (localStorage.getItem("admintoken") || localStorage.getItem("teachertoken")) ? (
                <StudentModule setStatus={setStatus} modelsLoaded={modelsLoaded} setView={setView} />
            ) : (
                <Navigate to="/login" />
            )
        } />
      </Routes>
    </Router>
  );
}