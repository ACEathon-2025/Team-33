import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import axios from 'axios';
import Login from './components/Login';
import AdminPanel from './AdminPanel';
import TeacherModule from './TeacherModule';
import StudentModule from './StudentModule';
import * as faceapi from 'face-api.js';
import './AdminPanel.css'; // Reuse styles

const API_BASE = 'http://localhost:5000/api';
axios.defaults.baseURL = API_BASE;

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [role, setRole] = useState(localStorage.getItem('role') || '');
  const [modelsLoaded, setModelsLoaded] = useState(false);

  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    }
    // Load face-api models with error handling
    const loadModels = async () => {
      const MODEL_URL = '/models';
      try {
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
          faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
        ]);
        setModelsLoaded(true);
      } catch (error) {
        console.error('Failed to load face-api models:', error);
      }
    };
    loadModels();
  }, [token]);

  const handleLogin = (newToken, newRole) => {
    localStorage.setItem('token', newToken);
    localStorage.setItem('role', newRole);
    setToken(newToken);
    setRole(newRole);
    axios.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    setToken('');
    setRole('');
    delete axios.defaults.headers.common['Authorization'];
  };

  return (
    <Router>
      <Routes>
        <Route
          path="/"
          element={!token ? <Navigate to="/login" replace /> : <Navigate to={role === 'admin' ? '/admin' : '/teacher'} replace />}
        />
        <Route path="/login" element={!token ? <Login onLogin={handleLogin} /> : <Navigate to={role === 'admin' ? '/admin' : '/teacher'} replace />} />
        <Route path="/admin" element={role === 'admin' ? <AdminPanel onLogout={handleLogout} /> : <Navigate to="/login" />} />
        <Route path="/teacher" element={role === 'teacher' ? <TeacherModule onLogout={handleLogout} modelsLoaded={modelsLoaded} /> : <Navigate to="/login" />} />
        <Route path="/attendance" element={role === 'teacher' ? <StudentModule modelsLoaded={modelsLoaded} /> : <Navigate to="/login" />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </Router>
  );
}