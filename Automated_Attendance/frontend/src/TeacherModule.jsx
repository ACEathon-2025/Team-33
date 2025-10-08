import { useState, useEffect } from 'react';
import EnrollmentModal from './EnrollmentModal';
import emailjs from '@emailjs/browser'; // Install: npm i @emailjs/browser

export default function TeacherModule({
  setStatus,
  modelsLoaded,
  enrolledStudents,
  setEnrolledStudents,
  attendance,
  setAttendance,
  setView
}) {
  const [activePage, setActivePage] = useState('enrollment');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [classForm, setClassForm] = useState({ className: '', classTime: '09:00', gracePeriod: 15 }); // Added gracePeriod
  const [todayClasses, setTodayClasses] = useState([]);
  const [dailySummaries, setDailySummaries] = useState([]);
  const [reportType, setReportType] = useState('daily'); // For reports
  const [reportData, setReportData] = useState(null); // For report results

  // Load today's classes
  useEffect(() => {
    const classes = localStorage.getItem('classes');
    if (classes) {
      const allClasses = JSON.parse(classes);
      const today = new Date().toLocaleDateString();
      setTodayClasses(allClasses.filter(c => c.date === today));
    }
  }, []);

  // Enrollment modal
  const handleEnrollClick = () => setIsModalOpen(true);

  // Class creation (updated with gracePeriod)
  const handleClassInputChange = (e) => {
    const { name, value } = e.target;
    setClassForm(prev => ({ ...prev, [name]: value }));
  };

  const handleCreateClass = () => {
    if (!classForm.className) return setStatus("Class name is required.");
    const newClass = { 
      ...classForm, 
      date: new Date().toLocaleDateString(),
      gracePeriod: parseInt(classForm.gracePeriod) // Ensure numeric
    };
    const classes = localStorage.getItem('classes') ? JSON.parse(localStorage.getItem('classes')) : [];
    localStorage.setItem('classes', JSON.stringify([...classes, newClass]));
    setTodayClasses(prev => [...prev, newClass]);
    localStorage.setItem('currentClass', JSON.stringify(newClass));
    setStatus(`Class "${classForm.className}" created with ${newClass.gracePeriod} min grace period.`);
    setActivePage('attendance');
  };

  // Manual attendance override (added date for reports)
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
        date: new Date().toLocaleDateString(), // Added for reports
        confidence: 'Manual',
        className
      }]);
    }
  };

  const presentStudents = enrolledStudents.filter(s => attendance.some(a => a.usn === s.usn));
  const absentStudents = enrolledStudents.filter(s => !attendance.some(a => a.usn === s.usn));

  // Generate daily summary (updated to detect late students using grace period)
  const handleGenerateSummary = () => {
    const today = new Date().toLocaleDateString();
    const todayAttendance = attendance.filter(a => a.date === today);
    const currentClass = localStorage.getItem('currentClass') ? JSON.parse(localStorage.getItem('currentClass')) : null;
    
    // Initialize absent list
    let summaryStudents = enrolledStudents.map(s => ({ ...s, status: 'Absent' }));
    const present = [];
    const late = [];

    // Process attendance to categorize present/late
    todayAttendance.forEach(rec => {
      const student = enrolledStudents.find(s => s.usn === rec.usn);
      if (student) {
        const studentIndex = summaryStudents.findIndex(s => s.usn === rec.usn);
        if (studentIndex > -1) {
          summaryStudents.splice(studentIndex, 1); // Remove from absent
          
          if (currentClass && currentClass.gracePeriod) {
            // Parse times to check if late (after classTime + gracePeriod)
            const attendanceTime = new Date(`2000-01-01T${rec.timestamp}`);
            const classStart = new Date(`2000-01-01T${currentClass.classTime}`);
            const graceEnd = new Date(classStart.getTime() + (currentClass.gracePeriod * 60 * 1000)); // Minutes to ms
            
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

    // Automatic notifications after grace period (simulate with timeout; in production, use backend cron/scheduler)
    if (late.length > 0 && currentClass) {
      setTimeout(() => {
        sendNotifications(newSummary, 'late');
        setStatus(`Automatic notifications sent for late students after grace period.`);
      }, currentClass.gracePeriod * 60 * 1000); // Delay based on grace period (e.g., 15 min)
    }

    setActivePage('summary');
  };

  // Send notifications (email via EmailJS; SMS backend-only)
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
          parent_phone: student.parentPhone // For SMS if backend
        };
        emailjs.send('YOUR_SERVICE_ID', 'YOUR_TEMPLATE_ID', templateParams, 'YOUR_USER_ID') // Replace with your EmailJS config
          .then(() => setStatus(`Email sent to ${student.parentEmail} for ${type}.`))
          .catch(err => setStatus(`Email error: ${err.text}`));
        
        // SMS simulation (requires backend like Twilio)
        console.log(`SMS to ${student.parentPhone}: ${templateParams.message}`); // Log for now
        setStatus('SMS requires backend (e.g., Twilio). Simulated.');
      }
    });
  };

  // Generate reports (daily/weekly/monthly)
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

    // Filter attendance by date range
    const filteredAttendance = attendance.filter(a => {
      const attDate = new Date(a.date);
      const start = new Date(startDate);
      const end = new Date(endDate);
      return attDate >= start && attDate <= end;
    });

    // Total classes in range
    const allClasses = localStorage.getItem('classes') ? JSON.parse(localStorage.getItem('classes')) : [];
    const totalClasses = allClasses.filter(c => {
      const classDate = new Date(c.date);
      const start = new Date(startDate);
      const end = new Date(endDate);
      return classDate >= start && classDate <= end;
    }).length;

    // Calculate per student
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

  // Render pages
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
            <div className="enrollment-form"> {/* Use enrollment-form class for styling */}
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
          <button className="nav-link logout" onClick={() => setView('login')}>🚪 Logout</button>
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