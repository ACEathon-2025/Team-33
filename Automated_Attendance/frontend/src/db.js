// src/db.js
import Dexie from 'dexie';
import 'dexie-syncable';

const db = new Dexie('AttendanceDB');

db.version(1).stores({
  students: '++id, fullName, rollNo, className, section, parentName, parentNumber, faceDescriptors, createdAt, updatedAt',
  attendance: '++id, studentId, date, status, className, confidence, timestamp',
});

// Sync configuration (to be initialized later)
let syncProtocol = null;

// Export db for use in components
export default db;