process.env.NODE_ENV = 'test';
const request = require('supertest');
const { app, server } = require('./index');
const db = require('./database');
const bcrypt = require('bcryptjs');

// Mock database
jest.mock('./database', () => {
  const mockUsers = [];
  return {
    initDatabase: jest.fn().mockResolvedValue(true),
    get: jest.fn(async (sql, params) => {
      if (sql.includes('SELECT * FROM users WHERE LOWER(username) = $1')) {
        return mockUsers.find(u => u.username.toLowerCase() === params[0].toLowerCase());
      }
      return null;
    }),
    all: jest.fn(async (sql, params) => {
      if (sql.includes('SELECT') && sql.includes('FROM users')) {
        return mockUsers.filter(u => u.role === 'student');
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
        return { rows: [{ id: newUser.id }] };
      }
      return { rows: [] };
    }),
    pool: { end: jest.fn().mockResolvedValue(true) }
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
        "INSERT INTO users (username, password, role, name) VALUES ($1, $2, 'teacher', 'Test Teacher')",
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

    it('should prevent non-teacher from assigning rosettes', async () => {
      const res = await request(app)
        .post('/api/rosettes/assign')
        .send({ student_id: 1, rosette_id: 1 });
      expect(res.statusCode).toEqual(401);
    });
  });

  describe('Error Handling', () => {
    it('should return 404 for unknown routes', async () => {
      const res = await request(app).get('/api/unknown');
      expect(res.statusCode).toEqual(404);
    });
  });
});
