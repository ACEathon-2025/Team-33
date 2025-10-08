import { useState, useEffect, useRef } from 'react';
import * as faceapi from 'face-api.js';

// Helper function for beep sound
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

function StudentModule({ setStatus, modelsLoaded, enrolledStudents, attendance, setAttendance, setView }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [isAttendanceRunning, setIsAttendanceRunning] = useState(false);
  const [lastRecognized, setLastRecognized] = useState(null);
  const [currentClass, setCurrentClass] = useState(null);
  const recognitionIntervalRef = useRef(null);

  // Load current class from localStorage
  useEffect(() => {
    const classData = localStorage.getItem('currentClass');
    if (classData) {
      setCurrentClass(JSON.parse(classData));
    }
  }, []);

  // Start webcam
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
        let boxColor = '#EF4444'; // Red for unknown

        const isAlreadyMarked = attendance.some(a => student && a.usn === student.usn);

        if (student) {
          if (!isAlreadyMarked) {
            label = `${student.label} - Marked!`;
            boxColor = '#10B981'; // Green for success
            const className = currentClass ? currentClass.className : 'Unknown';
            setAttendance(currentAttendance => {
              if (!currentAttendance.some(a => a.usn === student.usn)) {
                const newRecord = {
                  name: student.name,
                  usn: student.usn,
                  timestamp: new Date().toLocaleTimeString(),
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
            boxColor = '#3B82F6'; // Blue for already marked
          }
        }

        // Draw box and label
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
          onClick={() => setView('teacher')}
          className="btn btn-secondary"
          style={{ marginTop: '10px' }}
        >
          Back to Teacher Dashboard
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

export default StudentModule;