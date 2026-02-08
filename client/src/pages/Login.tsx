import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../api';
import { useNavigate } from 'react-router-dom';
import { School, User, Lock } from 'lucide-react';

const Login: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const res = await api.post('/login', { username, password });
      login(res.data.token, res.data.user, rememberMe);
      navigate('/');
    } catch (err: any) {
      setError('Kullanıcı adı veya şifre hatalı!');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-500 to-purple-600">
      <div className="bg-white p-8 rounded-2xl shadow-2xl w-96 transform transition-all hover:scale-105 duration-300">
        <div className="flex flex-col items-center mb-6">
            <div className="bg-blue-100 p-4 rounded-full mb-4">
                <School size={48} className="text-blue-600" />
            </div>
            <h1 className="text-3xl font-extrabold text-gray-800 tracking-tight">8/G Sınıfı</h1>
            <p className="text-gray-500 text-sm">Sınıf Yönetim Sistemi</p>
        </div>

        {error && (
            <div className="bg-red-50 border-l-4 border-red-500 p-3 mb-4 text-red-700 text-sm">
                {error}
            </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-gray-700 text-sm font-bold mb-2 ml-1">Kullanıcı Adı</label>
            <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <User size={18} className="text-gray-400" />
                </div>
                <input 
                  type="text" 
                  className="w-full pl-10 p-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent bg-gray-50 transition"
                  placeholder="Kullanıcı adınızı girin"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
            </div>
          </div>
          <div>
            <label className="block text-gray-700 text-sm font-bold mb-2 ml-1">Şifre</label>
            <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock size={18} className="text-gray-400" />
                </div>
                <input 
                  type="password" 
                  className="w-full pl-10 p-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent bg-gray-50 transition"
                  placeholder="Şifrenizi girin"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <input
                id="remember-me"
                name="remember-me"
                type="checkbox"
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
              />
              <label htmlFor="remember-me" className="ml-2 block text-sm text-gray-900">
                Beni hatırla
              </label>
            </div>
          </div>
          <button 
            type="submit" 
            disabled={isLoading}
            className={`w-full bg-blue-600 text-white p-3 rounded-xl font-bold text-lg hover:bg-blue-700 transition duration-200 shadow-lg hover:shadow-xl transform active:scale-95 ${isLoading ? 'opacity-70 cursor-not-allowed' : ''}`}
          >
            {isLoading ? 'Giriş Yapılıyor...' : 'Giriş Yap'}
          </button>
        </form>

        <div className="mt-6 text-center text-xs text-gray-400">
            &copy; 2025 8/G Sınıfı Uygulaması
        </div>
      </div>
    </div>
  );
};

export default Login;
