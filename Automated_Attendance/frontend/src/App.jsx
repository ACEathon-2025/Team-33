import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";

import AdminPanel from "./AdminPanel";

/**
 * ✅ APP STRUCTURE
 * - "/" → Unified Admin Panel (Login + Dashboard + Management)
 * - Uses AuthProvider for global state (token, admin info)
 * - Redirects any invalid route back to "/"
 */

export default function App() {
  return (

      <Router>
        <Routes>
          {/* 🏠 Main Admin Panel (Login + Dashboard + Management) */}
          <Route path="/" element={<AdminPanel />} />

          {/* 🔁 Redirect all unknown paths to admin panel */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
   
  );
}
