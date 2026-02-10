process.env.NODE_ENV = 'test';
const request = require('supertest');
const { app, server } = require('./index');
const db = require('./database');
const bcrypt = require('bcryptjs');

// Mock database
jest.mock('./database', () => {
  const mockUsers = [];
  const mockNotes = [];
  const mockPoints = {}; // { userId: { total_points, spendable_points } }
  const mockPolls = [];
  const mockVotes = [];
  const mockMessages = [];
  const mockTransactions = [];
  return {
    initDatabase: jest.fn().mockResolvedValue(true),
    get: jest.fn(async (sql, params) => {
      if (sql.includes('SELECT count(*) as count FROM daily_missions')) {
        return { count: 0 };
      }
      if (sql.includes('SELECT * FROM users WHERE LOWER(username) = ?')) {
        return mockUsers.find(u => u.username.toLowerCase() === params[0].toLowerCase());
      }
      if (sql.includes('SELECT * FROM users WHERE id = ?')) {
        return mockUsers.find(u => u.id === params[0]);
      }
      if (sql.includes('SELECT total_points, spendable_points FROM points')) {
        return mockPoints[params[0]] || { total_points: 0, spendable_points: 0 };
      }
      if (sql.includes('SELECT expires_at FROM polls')) {
        return mockPolls.find(p => p.id === parseInt(params[0]));
      }
      return null;
    }),
    all: jest.fn(async (sql, params) => {
      if (sql.includes('SELECT') && sql.includes('FROM users')) {
        return mockUsers.filter(u => u.role === 'student');
      }
      if (sql.includes('SELECT * FROM teacher_notes')) {
        return mockNotes.filter(n => n.student_id === params[0]);
      }
      if (sql.includes('SELECT p.*')) {
        return mockPolls.map(p => ({ ...p, total_votes: 0, user_vote: null }));
      }
      if (sql.includes('SELECT m.*')) {
        return mockMessages.filter(m => m.group_type === params[0]);
      }
      if (sql.includes('SELECT t.*')) {
        return mockTransactions;
      }
      return [];
    }),
    run: jest.fn(async (sql, params) => {
      if (sql.includes('INSERT INTO users')) {
        const newUser = { 
          id: mockUsers.length + 1, 
          username: params[0], 
          password: params[1], 
          role: params[2], 
          name: params[3] 
        };
        mockUsers.push(newUser);
        return { id: newUser.id, changes: 1 };
      }
      if (sql.includes('INSERT INTO teacher_notes')) {
        const newNote = {
          id: mockNotes.length + 1,
          student_id: params[0],
          note: params[1],
          created_at: new Date().toISOString()
        };
        mockNotes.push(newNote);
        return { id: newNote.id, changes: 1 };
      }
      if (sql.includes('INSERT INTO polls')) {
        const newPoll = {
          id: mockPolls.length + 1,
          question: params[0],
          options: params[1],
          expires_at: params[2]
        };
        mockPolls.push(newPoll);
        return { id: newPoll.id, changes: 1 };
      }
      if (sql.includes('INSERT INTO poll_votes')) {
        mockVotes.push({ poll_id: params[0], user_id: params[1], option_index: params[2] });
        return { id: mockVotes.length, changes: 1 };
      }
      if (sql.includes('INSERT INTO messages')) {
        const newMessage = { id: mockMessages.length + 1, sender_id: params[0], content: params[1], group_type: params[2] };
        mockMessages.push(newMessage);
        return { id: newMessage.id, changes: 1 };
      }
      if (sql.includes('INSERT INTO transactions')) {
        mockTransactions.push({ id: mockTransactions.length + 1, from_user_id: params[0], to_user_id: params[1], amount: params[2], reason: params[3], type: params[4] });
        return { id: mockTransactions.length, changes: 1 };
      }
      if (sql.includes('DELETE FROM teacher_notes')) {
        const id = params[0];
        const idx = mockNotes.findIndex(n => n.id === id);
        if (idx !== -1) mockNotes.splice(idx, 1);
        return { changes: 1 };
      }
      if (sql.includes('INSERT OR IGNORE INTO points')) {
        const userId = params[0];
        if (!mockPoints[userId]) {
          mockPoints[userId] = { total_points: 0, spendable_points: 0 };
        }
        return { changes: 1 };
      }
      if (sql.includes('UPDATE points SET total_points = total_points + ?')) {
        const amount = params[0];
        const userId = params[2];
        if (mockPoints[userId]) {
          mockPoints[userId].total_points += amount;
          mockPoints[userId].spendable_points += amount;
        }
        return { changes: 1 };
      }
      return { id: 1, changes: 1 };
    })
  };
});

describe('API Endpoints', () => {
  let teacherToken;
  const teacherCreds = { username: 'test_teacher', password: 'password123' };

  beforeAll(async () => {
    // Wait for DB to be ready
    await db.initDatabase();
    
    // Ensure test teacher exists
    try {
      const hash = await bcrypt.hash(teacherCreds.password, 10);
      await db.run(
        "INSERT INTO users (username, password, role, name) VALUES (?, ?, 'teacher', 'Test Teacher')",
        [teacherCreds.username, hash, 'teacher', 'Test Teacher']
      );
      
      const teacherRes = await request(app)
        .post('/api/login')
        .send(teacherCreds);
      
      teacherToken = teacherRes.body.token;
    } catch (err) {
      console.error('Error during beforeAll setup:', err);
    }
  });

  afterAll(async () => {
    if (server && server.close) {
      await new Promise(resolve => server.close(resolve));
    }
  });

  describe('Authentication', () => {
    it('should fail with invalid credentials', async () => {
      const res = await request(app)
        .post('/api/login')
        .send({ username: 'wrong', password: 'wrong' });
      expect(res.statusCode).toEqual(400);
      expect(res.body).toHaveProperty('error');
    });

    it('should login teacher successfully', async () => {
      expect(teacherToken).toBeDefined();
    });
  });

  describe('Teacher Dashboard', () => {
    it('should allow teacher to get students', async () => {
      expect(teacherToken).toBeDefined();
      const res = await request(app)
        .get('/api/students')
        .set('Authorization', `Bearer ${teacherToken}`);
      expect(res.statusCode).toEqual(200);
      expect(Array.isArray(res.body)).toBeTruthy();
    });

    it('should allow teacher to give points to a student', async () => {
      // Create a student first
      const studentRes = await request(app)
        .post('/api/students')
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({ name: 'Points Student' });
      const studentId = studentRes.body.id;

      const res = await request(app)
        .post('/api/points')
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({ student_id: studentId, amount: 10, reason: 'Good work' });
      
      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
    });

    it('should allow teacher to start attendance', async () => {
      const res = await request(app)
        .post('/api/attendance/start')
        .set('Authorization', `Bearer ${teacherToken}`);
      
      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
    });

    it('should prevent non-teacher from assigning rosettes', async () => {
      const res = await request(app)
        .post('/api/rosettes/assign')
        .send({ student_id: 1, rosette_id: 1 });
      expect(res.statusCode).toEqual(401);
    });
  });

  describe('Teacher Notes', () => {
    let studentId;

    beforeAll(async () => {
      // Create a student for testing notes
      const studentRes = await request(app)
        .post('/api/students')
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({ name: 'Note Student' });
      studentId = studentRes.body.id;
    });

    it('should allow teacher to add a note', async () => {
      const res = await request(app)
        .post(`/api/users/${studentId}/notes`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({ note: 'Test note content' });
      
      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty('note', 'Test note content');
    });

    it('should allow teacher to get student notes', async () => {
      const res = await request(app)
        .get(`/api/users/${studentId}/notes`)
        .set('Authorization', `Bearer ${teacherToken}`);
      
      expect(res.statusCode).toEqual(200);
      expect(Array.isArray(res.body)).toBeTruthy();
      expect(res.body.length).toBeGreaterThan(0);
    });

    it('should allow teacher to delete a note', async () => {
      const notesRes = await request(app)
        .get(`/api/users/${studentId}/notes`)
        .set('Authorization', `Bearer ${teacherToken}`);
      const noteId = notesRes.body[0].id;

      const res = await request(app)
        .delete(`/api/notes/${noteId}`)
        .set('Authorization', `Bearer ${teacherToken}`);
      
      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty('success', true);
    });

    it('should prevent unauthorized access to notes', async () => {
      const res = await request(app)
        .get(`/api/users/${studentId}/notes`);
      expect(res.statusCode).toEqual(401);
    });
  });

  describe('Polls', () => {
    it('should allow teacher to create a poll', async () => {
      const res = await request(app)
        .post('/api/polls')
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({ question: 'Test Poll?', options: ['Yes', 'No'], expires_in_hours: 24 });
      
      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty('question', 'Test Poll?');
    });

    it('should allow voting on a poll', async () => {
      const pollsRes = await request(app)
        .get('/api/polls')
        .set('Authorization', `Bearer ${teacherToken}`);
      const pollId = pollsRes.body[0].id;

      const res = await request(app)
        .post(`/api/polls/${pollId}/vote`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({ option_index: 0 });
      
      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty('success', true);
    });
  });

  describe('Messages', () => {
    it('should allow sending a message', async () => {
      const res = await request(app)
        .post('/api/messages')
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({ content: 'Hello test message', group_type: 'class' });
      
      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty('content', 'Hello test message');
    });

    it('should allow fetching messages', async () => {
      const res = await request(app)
        .get('/api/messages?group_type=class')
        .set('Authorization', `Bearer ${teacherToken}`);
      
      expect(res.statusCode).toEqual(200);
      expect(Array.isArray(res.body)).toBeTruthy();
    });
  });

  describe('Transactions', () => {
    it('should allow teacher to view transactions', async () => {
      const res = await request(app)
        .get('/api/transactions')
        .set('Authorization', `Bearer ${teacherToken}`);
      
      expect(res.statusCode).toEqual(200);
      expect(Array.isArray(res.body)).toBeTruthy();
    });

    it('should allow exporting transactions as CSV', async () => {
      const res = await request(app)
        .get('/api/transactions?export=csv')
        .set('Authorization', `Bearer ${teacherToken}`);
      
      expect(res.statusCode).toEqual(200);
      expect(res.headers['content-type']).toContain('text/csv');
    });
  });

  describe('Error Handling', () => {
    it('should return 404 for unknown routes', async () => {
      const res = await request(app).get('/api/unknown');
      expect(res.statusCode).toEqual(404);
    });
  });
});
