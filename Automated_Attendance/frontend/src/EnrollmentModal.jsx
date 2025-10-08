import { useState, useRef } from 'react';
import * as faceapi from 'face-api.js';

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

export default EnrollmentModal;