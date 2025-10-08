import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

const API_BASE = 'http://localhost:5000/api';

export default function LandingPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('admin'); // Default role for login
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regDomain, setRegDomain] = useState('');
  const [error, setError] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async () => {
    setError('');
    try {
      let res;
      if (role === 'admin') {
        res = await axios.post(`${API_BASE}/admin/login`, { email, password });
        localStorage.setItem('token', res.data.token);
        localStorage.setItem('role', 'admin');
        navigate('/admin');
      } else if (role === 'teacher') {
        res = await axios.post(`${API_BASE}/teachers/login`, { email, password });
        localStorage.setItem('token', res.data.token);
        localStorage.setItem('role', 'teacher');
        navigate('/teacher');
      }
      axios.defaults.headers.common['Authorization'] = `Bearer ${res.data.token}`;
    } catch (err) {
      setError('Invalid credentials for selected role');
    }
  };

  const handleRegister = async () => {
    setError('');
    try {
      await axios.post(`${API_BASE}/admin/register`, {
        name: regName,
        email: regEmail,
        password: regPassword,
        institutionDomain: regDomain,
      });
      setIsRegistering(false);
      setError('Admin registered successfully! Please log in.');
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed');
    }
  };

  return (
    <div className="centered landing-page">
      <div className="card">
        <h2>{isRegistering ? 'Register Admin' : 'Login'}</h2>
        {error && <p className="error">{error}</p>}
        {isRegistering ? (
          <>
            <input
              placeholder="Full Name"
              value={regName}
              onChange={(e) => setRegName(e.target.value)}
            />
            <input
              placeholder="Institution Email"
              value={regEmail}
              onChange={(e) => setRegEmail(e.target.value)}
            />
            <input
              placeholder="Password"
              type="password"
              value={regPassword}
              onChange={(e) => setRegPassword(e.target.value)}
            />
            <input
              placeholder="Institution Domain"
              value={regDomain}
              onChange={(e) => setRegDomain(e.target.value)}
            />
            <button onClick={handleRegister}>Register</button>
            <p>
              Already have an account? <button onClick={() => setIsRegistering(false)}>Login</button>
            </p>
          </>
        ) : (
          <>
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="admin">Admin</option>
              <option value="teacher">Teacher</option>
            </select>
            <input
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <input
              placeholder="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button onClick={handleLogin}>Login</button>
            <p>
              No account? <button onClick={() => setIsRegistering(true)}>Register as Admin</button>
            </p>
          </>
        )}
      </div>
    </div>
  );
}