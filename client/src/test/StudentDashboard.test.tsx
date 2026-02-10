import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import StudentDashboard from '../pages/StudentDashboard';
import { AuthContext } from '../context/AuthContext';
import { BrowserRouter } from 'react-router-dom';
import React from 'react';

// Mock API
vi.mock('../api', () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: [] }),
    post: vi.fn().mockResolvedValue({ data: { success: true } }),
  },
}));

// Mock Socket.io
vi.mock('socket.io-client', () => ({
  io: vi.fn(() => ({
    on: vi.fn(),
    emit: vi.fn(),
    disconnect: vi.fn(),
  })),
}));

const mockUser = {
  id: 1,
  name: 'Test Student',
  username: 'test.student',
  role: 'student',
  points: { total_points: 100, spendable_points: 50 },
  first_login: false,
};

const renderWithProviders = (ui: React.ReactElement, { user = mockUser } = {}) => {
  const mockAuth = {
    user,
    login: vi.fn(),
    logout: vi.fn(),
    refreshUser: vi.fn().mockResolvedValue(undefined),
    isLoading: false,
  };

  return render(
    <AuthContext.Provider value={mockAuth}>
      <BrowserRouter>
        {ui}
      </BrowserRouter>
    </AuthContext.Provider>
  );
};

describe('StudentDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders student name and points correctly', () => {
    renderWithProviders(<StudentDashboard />);
    expect(screen.getByText(/Test Student/i)).toBeInTheDocument();
    expect(screen.getByText(/100/)).toBeInTheDocument(); // Total points
    expect(screen.getByText(/50/)).toBeInTheDocument(); // Spendable points
  });

  it('shows birthday modal on first login', () => {
    const firstLoginUser = { ...mockUser, first_login: true };
    renderWithProviders(<StudentDashboard />, { user: firstLoginUser });
    expect(screen.getByText(/Hoşgeldin/i)).toBeInTheDocument();
    expect(screen.getByText(/Doğum gününü girer misin/i)).toBeInTheDocument();
  });

  it('opens password change modal when button clicked', () => {
    renderWithProviders(<StudentDashboard />);
    const passwordBtn = screen.getByText(/Şifre Değiştir/i);
    fireEvent.click(passwordBtn);
    expect(screen.getByPlaceholderText(/Mevcut Şifre/i)).toBeInTheDocument();
  });
});