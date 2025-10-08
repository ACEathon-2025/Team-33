import React, { useState } from 'react';
import axios from 'axios';

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleLogin = async () => {
    try {
      // Try admin login
      const adminRes = await axios.post('http://localhost:5000/api/admin/login', { email, password });
      onLogin(adminRes.data.token, 'admin');
    } catch (adminErr) {
      try {
        // If admin fails, try teacher login
        const teacherRes = await axios.post('http://localhost:5000/api/teachers/login', { email, password });
        onLogin(teacherRes.data.token, 'teacher');
      } catch (teacherErr) {
        setError('Invalid credentials');
      }
    }
  };

  return (
    <div className="centered">
      <h2>Login</h2>
      <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <input placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
      <button onClick={handleLogin}>Login</button>
      {error && <p>{error}</p>}
    </div>
  );
}