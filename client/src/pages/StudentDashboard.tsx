import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { MessageSquare, ShoppingBag, Trophy, Calendar, Edit, LogOut, Box, Sparkles, Timer, Layers, Megaphone, Disc, CheckSquare } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import LayeredAvatar from '../components/LayeredAvatar';
import LayeredAvatarEditor from '../components/LayeredAvatarEditor';
import { io, Socket } from 'socket.io-client';

const StudentDashboard: React.FC = () => {
  const { user, logout, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [showBirthdayModal, setShowBirthdayModal] = useState(false);
  const [showAvatarModal, setShowAvatarModal] = useState(false);
  const [birthDate, setBirthDate] = useState('');
  const [rosettes, setRosettes] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [weeklyPoints, setWeeklyPoints] = useState<number>(0);
  const [weeklyDetail, setWeeklyDetail] = useState<{day:string,points:number}[]>([]);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordFeedback, setPasswordFeedback] = useState('');
  const [displayTotal, setDisplayTotal] = useState<number>(user?.points?.total_points || 0);
  const [displaySpendable, setDisplaySpendable] = useState<number>(user?.points?.spendable_points || 0);
  // Student-only menus
  const [showInventoryModal, setShowInventoryModal] = useState(false);
  const [inventory, setInventory] = useState<any[]>([]);
  const [showEncModal, setShowEncModal] = useState(false);
  const [encMsg, setEncMsg] = useState('');
  const [showPomodoroModal, setShowPomodoroModal] = useState(false);
  const [pomodoroRunning, setPomodoroRunning] = useState(false);
  const [pomodoroDuration, setPomodoroDuration] = useState<number>(25);
  const [pomodoroRemaining, setPomodoroRemaining] = useState<number>(25 * 60);
  const pomodoroTimerRef = useRef<number | null>(null);
  const [showWardrobeModal, setShowWardrobeModal] = useState(false);
  const [wardrobe, setWardrobe] = useState<any[]>([]);
  const [wardrobeName, setWardrobeName] = useState('');

  // Daily Missions & Polls State
  const [missions, setMissions] = useState<any[]>([]);
  const [polls, setPolls] = useState<any[]>([]);
  const [showPollsModal, setShowPollsModal] = useState(false);

  // Daily Spin State
  const [showSpinModal, setShowSpinModal] = useState(false);
  const [isSpinning, setIsSpinning] = useState(false);
  const [spinPrize, setSpinPrize] = useState<number | null>(null);
  const [spinError, setSpinError] = useState<string | null>(null);

  useEffect(() => {
    if (user?.first_login) {
        setShowBirthdayModal(true);
    }
    if (user?.id) {
        fetchRosettes();
        fetchNotifications();
        fetchAnnouncements();
        fetchWeekly();
        fetchMissions();
        fetchPolls();
        setDisplayTotal(user?.points?.total_points || 0);
        setDisplaySpendable(user?.points?.spendable_points || 0);
    }
  }, [user]);

  // Live update points on socket event
  const socketRef = useRef<Socket | null>(null);
  useEffect(() => {
    socketRef.current = io(((import.meta as any).env?.VITE_BACKEND_URL) || 'http://localhost:3000');
    socketRef.current.on('points_updated', async (payload: any) => {
      if (payload.student_id === user?.id) {
        // ... (existing points update logic)
        if (payload.total_points !== undefined) {
          setDisplayTotal(payload.total_points);
        } else {
          const amt = Number(payload.amount) || 0;
          setDisplayTotal(t => t + amt);
        }

        if (payload.spendable_points !== undefined) {
          setDisplaySpendable(payload.spendable_points);
        } else {
          const amt = Number(payload.amount) || 0;
          setDisplaySpendable(s => s + amt);
        }

        setTimeout(async () => {
          await refreshUser();
          await fetchWeekly();
          await fetchMissions(); // Görevleri de tazele
        }, 200);
      }
    });

    socketRef.current.on('notification', (payload: any) => {
      // Görev tamamlandığında veya başka bir uyarı geldiğinde
      alert(payload.message);
      fetchNotifications();
      fetchMissions();
    });

    socketRef.current.on('poll_updated', (payload: any) => {
      // Oylama sonuçları güncellendiğinde
      fetchPolls();
    });

    socketRef.current.on('new_poll', () => {
      // Yeni oylama eklendiğinde
      fetchPolls();
      setNotifications(prev => [{ id: Date.now(), message: "Yeni bir oylama başladı!", read: false }, ...prev]);
    });

    return () => { socketRef.current?.disconnect(); };
  }, [user?.id]);

  const fetchMissions = async () => {
    try {
      const res = await api.get('/missions');
      setMissions(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchPolls = async () => {
    try {
      const res = await api.get('/polls');
      setPolls(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleVote = async (pollId: number, optionIndex: number) => {
    try {
      await api.post(`/polls/${pollId}/vote`, { option_index: optionIndex });
      fetchPolls();
    } catch (err) {
      console.error(err);
    }
  };

  const fetchRosettes = async () => {
      try {
          const res = await api.get(`/users/${user?.id}/rosettes`);
          setRosettes(res.data);
      } catch (err) {
          console.error(err);
      }
  };

  const fetchNotifications = async () => {
      try {
          const res = await api.get('/notifications');
          setNotifications(res.data);
      } catch {}
  };

  const fetchAnnouncements = async () => {
    try {
        const res = await api.get('/announcements');
        setAnnouncements(res.data);
    } catch {}
  };

  const handleSpin = async () => {
    if (isSpinning) return;
    setIsSpinning(true);
    setSpinError(null);
    setSpinPrize(null);
    
    try {
      // Simulate spinning animation delay
      await new Promise(r => setTimeout(r, 2000));
      const res = await api.post('/daily-spin');
      setSpinPrize(res.data.prize);
      await refreshUser();
    } catch (err: any) {
      setSpinError(err.response?.data?.error || 'Bir hata oluştu.');
    } finally {
      setIsSpinning(false);
    }
  };

  const markNotificationRead = async (id: number) => {
      try {
          await api.post('/notifications/read', { id });
          setNotifications(notifications.map(n => n.id === id ? { ...n, read: 1 } : n));
      } catch {}
  };

  const fetchWeekly = async () => {
      try {
          const res1 = await api.get('/me/weeklyPoints');
          const res2 = await api.get('/me/weeklyPointsDetailed');
          setWeeklyPoints(res1.data.weekly_points || 0);
          setWeeklyDetail(res2.data || []);
      } catch {}
  };

  const handleBirthdaySubmit = async () => {
    if (!birthDate) return;
    try {
        await api.post('/me/birthday', { birth_date: birthDate });
        setShowBirthdayModal(false);
    } catch (err) {
        console.error(err);
    }
  };

  const handleSaveAvatar = async (newConfig: any) => {
    try {
        await api.post('/me/avatar', { avatar_config: newConfig });
        window.location.reload(); 
    } catch (err) {
        console.error(err);
    }
  };

  const fetchInventory = async () => {
    try {
      const res = await api.get('/me/inventory');
      setInventory(res.data || []);
    } catch {}
  };
  const fetchWardrobe = async () => {
    try {
      const res = await api.get('/me/wardrobe');
      setWardrobe(res.data || []);
    } catch {}
  };
  const startPomodoro = () => {
    if (pomodoroRunning) return;
    setPomodoroRemaining(pomodoroDuration * 60);
    setPomodoroRunning(true);
    if (pomodoroTimerRef.current) window.clearInterval(pomodoroTimerRef.current);
    pomodoroTimerRef.current = window.setInterval(() => {
      setPomodoroRemaining((r) => {
        const next = r - 1;
        if (next <= 0) {
          window.clearInterval(pomodoroTimerRef.current!);
          setPomodoroRunning(false);
          alert('Pomodoro tamamlandı! Aferin 👏');
          return 0;
        }
        return next;
      });
    }, 1000);
  };
  const stopPomodoro = () => {
    if (pomodoroTimerRef.current) window.clearInterval(pomodoroTimerRef.current);
    setPomodoroRunning(false);
  };
  useEffect(() => {
    return () => { if (pomodoroTimerRef.current) window.clearInterval(pomodoroTimerRef.current); };
  }, []);

  return (
    <div className="p-6 bg-blue-50 min-h-screen flex flex-col items-center">
      <div className="bg-white p-8 rounded-2xl shadow-lg w-full max-w-md text-center relative overflow-hidden">
        {/* Decorative Background Circle */}
        <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-b from-blue-200 to-transparent opacity-30 pointer-events-none"></div>

        <div className="flex justify-between items-center mb-2 relative z-10">
          <h1 className="text-2xl font-bold text-gray-800">Merhaba, {user?.name}!</h1>
          <button onClick={() => { logout(); navigate('/login'); }} className="flex items-center gap-2 text-red-600 font-bold hover:bg-red-50 px-3 py-1 rounded-lg">
            <LogOut size={18} /> Çıkış
          </button>
        </div>

        {/* Level Section */}
        {user?.level && (
          <div className="relative z-10 mb-6 bg-white/50 p-3 rounded-xl border border-blue-100 shadow-sm">
            <div className="flex justify-between items-end mb-1">
              <span className="text-xs font-bold text-blue-700 uppercase tracking-wider">{user.level.name}</span>
              <span className="text-xs font-bold text-gray-500">Seviye {user.level.level}</span>
            </div>
            <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-blue-400 to-indigo-500 transition-all duration-1000"
                style={{ width: `${Math.min(100, ((displayTotal - user.level.min) / (user.level.next - user.level.min)) * 100)}%` }}
              ></div>
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-[10px] text-gray-400 font-medium">{user.level.min} Puan</span>
              <span className="text-[10px] text-gray-400 font-medium">Hedef: {user.level.next} Puan</span>
            </div>
          </div>
        )}
        
        <div className="relative inline-block my-6 group z-10">
           {user?.avatar_config?.provider === 'layered' ? (
             <LayeredAvatar 
               config={user.avatar_config} 
               size={128} 
               className="border-4 border-blue-200 bg-white shadow-md transition-transform transform group-hover:scale-105" 
               fallbackSeed={user.username}
             />
           ) : (
             <div className="w-32 h-32 rounded-full border-4 border-blue-200 bg-gray-100 shadow-inner flex items-center justify-center">
               <span className="text-gray-400 font-bold">Avatar Yok</span>
             </div>
           )}
           <button 
             onClick={() => setShowAvatarModal(true)}
             className="absolute bottom-0 right-0 bg-blue-500 text-white p-2 rounded-full shadow-lg hover:bg-blue-600 transition"
             title="Avatarı Düzenle"
           >
             <Edit size={16} />
           </button>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-8">
          <div className="bg-blue-100 p-4 rounded-xl">
            <span className="block text-3xl font-bold text-blue-600">{displayTotal}</span>
            <span className="text-sm text-blue-800">Toplam Puan</span>
          </div>
          <div className="bg-green-100 p-4 rounded-xl">
            <span className="block text-3xl font-bold text-green-600">{displaySpendable}</span>
            <span className="text-sm text-green-800">Harcama Puanı</span>
          </div>
        </div>

        {/* Weekly Stats */}
        <div className="mb-6 w-full">
            <h2 className="text-left font-bold text-gray-700 mb-2 flex items-center gap-2 uppercase tracking-tight text-xs">
              <Calendar size={16} className="text-blue-500" /> Haftalık Gelişim
            </h2>
            <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                <div className="flex justify-between items-center mb-4">
                    <span className="text-[10px] font-bold text-gray-400 uppercase">Son 7 Günlük Kazanç</span>
                    <span className="text-lg font-black text-blue-600">+{weeklyPoints} <span className="text-[10px] text-gray-400">Puan</span></span>
                </div>
                <div className="flex items-end justify-between gap-1 h-28 px-1">
                    {weeklyDetail.map((d, idx) => {
                        const maxPoints = Math.max(...weeklyDetail.map(x => Math.abs(x.points)), 10);
                        const height = Math.max(10, (Math.abs(d.points) / maxPoints) * 100);
                        const isToday = idx === weeklyDetail.length - 1;
                        
                        return (
                            <div key={d.day} className="flex-1 flex flex-col items-center group relative">
                                <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-[8px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-20">
                                  {d.points} Puan
                                </div>
                                <div 
                                  className={`w-full max-w-[24px] rounded-t-md transition-all duration-500 relative overflow-hidden ${
                                    isToday ? 'bg-gradient-to-t from-blue-600 to-blue-400 shadow-md' : 'bg-blue-100 hover:bg-blue-200'
                                  }`} 
                                  style={{ height: `${height}%` }}
                                >
                                  {isToday && (
                                    <div className="absolute inset-0 bg-white/20 animate-pulse" />
                                  )}
                                </div>
                                <span className={`text-[8px] mt-2 font-bold ${isToday ? 'text-blue-600' : 'text-gray-400'}`}>
                                  {new Date(d.day).toLocaleDateString('tr-TR', { weekday: 'short' }).toUpperCase()}
                                </span>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>

        {/* Daily Missions Section */}
        {missions.length > 0 && (
          <div className="mb-6 w-full">
            <h2 className="text-left font-bold text-gray-700 mb-2 flex items-center gap-2 uppercase tracking-tight text-xs">
              <Sparkles size={16} className="text-purple-500" /> Günlük Görevler
            </h2>
            <div className="space-y-2">
              {missions.map((m: any) => (
                <div key={m.id} className={`p-3 rounded-xl border flex items-center gap-3 transition-all ${
                  m.status === 'completed' 
                    ? 'bg-green-50 border-green-200 opacity-75' 
                    : 'bg-white border-gray-100 shadow-sm'
                }`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                    m.status === 'completed' ? 'bg-green-500 text-white' : 'bg-purple-100 text-purple-600'
                  }`}>
                    {m.status === 'completed' ? '✓' : m.points_reward}
                  </div>
                  <div className="text-left flex-1 min-w-0">
                    <div className={`text-sm font-bold truncate ${m.status === 'completed' ? 'text-green-800' : 'text-gray-800'}`}>
                      {m.title}
                    </div>
                    <div className="text-[10px] text-gray-500 truncate">{m.description}</div>
                  </div>
                  {m.status === 'completed' && (
                    <span className="text-[10px] font-bold text-green-600 bg-green-100 px-2 py-0.5 rounded-full">Bitti</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Rosettes Section */}
        {rosettes.length > 0 && (
            <div className="mb-6 w-full">
                <h2 className="text-left font-bold text-gray-700 mb-2 flex items-center gap-2">
                    <Trophy size={18} className="text-yellow-500" /> Rozetlerim
                </h2>
                <div className="flex gap-2 overflow-x-auto pb-2">
                    {rosettes.map((r, i) => (
                        <div key={i} className="flex flex-col items-center bg-yellow-50 p-2 rounded-lg border border-yellow-200 min-w-[80px]" title={r.description}>
                            <span className="text-3xl mb-1">{r.icon}</span>
                            <span className="text-[10px] font-bold text-gray-700 leading-tight">{r.name}</span>
                        </div>
                    ))}
                </div>
            </div>
        )}

        {/* Global Announcements */}
        {announcements.length > 0 && (
            <div className="mb-6 w-full">
                <h2 className="text-left font-bold text-gray-700 mb-2 flex items-center gap-2">
                    <Megaphone size={18} className="text-red-500" /> Sınıf Duyuruları
                </h2>
                <div className="space-y-3">
                    {announcements.map(a => (
                        <div key={a.id} className="p-4 rounded-xl border border-red-100 bg-red-50 shadow-sm">
                            <div className="font-bold text-red-800 text-sm mb-1">{a.title}</div>
                            <div className="text-xs text-gray-700 leading-relaxed">{a.content}</div>
                            <div className="text-[9px] text-gray-400 mt-2">{new Date(a.created_at).toLocaleDateString('tr-TR')}</div>
                        </div>
                    ))}
                </div>
            </div>
        )}

        {/* Notifications (Private) */}
        {notifications.length > 0 && (
            <div className="mb-6 w-full">
                <h2 className="text-left font-bold text-gray-700 mb-2 flex items-center gap-2">
                    <Megaphone size={18} className="text-indigo-500" /> Bildirimler
                </h2>
                <div className="space-y-2">
                    {notifications.map(n => (
                        <div key={n.id} className={`p-3 rounded-lg border ${n.read ? 'bg-gray-50 border-gray-200' : 'bg-indigo-50 border-indigo-200'}`}>
                            <div className="text-sm text-gray-800">{n.message}</div>
                            {!n.read && (
                                <button onClick={() => markNotificationRead(n.id)} className="mt-2 text-xs text-indigo-700 underline">Okundu işaretle</button>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        )}

        <div className="flex flex-col gap-3">
          <button 
            onClick={() => setShowSpinModal(true)} 
            className="flex items-center justify-center gap-2 bg-gradient-to-r from-yellow-400 to-orange-500 text-white p-4 rounded-xl hover:from-yellow-500 hover:to-orange-600 transition shadow-md font-bold"
          >
            <Disc className={`${isSpinning ? 'animate-spin' : ''}`} /> Günlük Şans Çarkı
          </button>
          <button onClick={() => navigate('/chat')} className="flex items-center justify-center gap-2 bg-purple-500 text-white p-3 rounded-xl hover:bg-purple-600 transition">
            <MessageSquare /> Sınıf Sohbeti
          </button>
          <button onClick={() => navigate('/shop')} className="flex items-center justify-center gap-2 bg-orange-500 text-white p-3 rounded-xl hover:bg-orange-600 transition">
            <ShoppingBag /> Mağaza
          </button>
           <button onClick={() => navigate('/leaderboard')} className="flex items-center justify-center gap-2 bg-yellow-500 text-white p-3 rounded-xl hover:bg-yellow-600 transition">
            <Trophy /> Liderlik Tablosu
          </button>
          <button onClick={() => setShowPollsModal(true)} className="flex items-center justify-center gap-2 bg-indigo-500 text-white p-3 rounded-xl hover:bg-indigo-600 transition">
            <CheckSquare size={24} /> Sınıf Oylamaları
          </button>
          <button onClick={async () => { await fetchInventory(); setShowInventoryModal(true); }} className="flex items-center justify-center gap-2 bg-green-500 text-white p-3 rounded-xl hover:bg-green-600 transition">
            <Box /> Envanter
          </button>
          <button onClick={() => setShowEncModal(true)} className="flex items-center justify-center gap-2 bg-pink-500 text-white p-3 rounded-xl hover:bg-pink-600 transition">
            <Sparkles /> Teşvik
          </button>
          <button onClick={() => setShowPomodoroModal(true)} className="flex items-center justify-center gap-2 bg-slate-700 text-white p-3 rounded-xl hover:bg-slate-800 transition">
            <Timer /> Pomodoro
          </button>
          <button onClick={async () => { await fetchWardrobe(); setShowWardrobeModal(true); }} className="flex items-center justify-center gap-2 bg-purple-600 text-white p-3 rounded-xl hover:bg-purple-700 transition">
            <Layers /> Gardrop
          </button>
          <button 
            onClick={async () => { 
              try { await api.post('/me/avatar', { avatar_config: null }); window.location.reload(); } catch {}
            }} 
            className="flex items-center justify-center gap-2 bg-gray-200 text-gray-700 p-3 rounded-xl hover:bg-gray-300 transition"
            title="Avatarı Sıfırla"
          >
            Avatarı Sıfırla
          </button>
          <button 
            onClick={() => setShowPasswordModal(true)} 
            className="flex items-center justify-center gap-2 bg-slate-200 text-slate-800 p-3 rounded-xl hover:bg-slate-300 transition"
          >
            Şifre Değiştir
          </button>
        </div>

        {/* MEB Calendar Widget */}
        <div className="mt-8 bg-red-50 p-4 rounded-xl border border-red-100">
            <div className="flex items-center gap-2 mb-2 text-red-700 font-bold">
                <Calendar size={20} />
                <span>MEB Takvimi & Tatiller</span>
            </div>
            <ul className="text-left text-sm space-y-2 text-gray-600">
                <li className="flex justify-between"><span>2. Dönem Ara Tatili:</span> <span className="font-semibold">31 Mart - 4 Nisan</span></li>
                <li className="flex justify-between"><span>Ramazan Bayramı:</span> <span className="font-semibold">30 Mart - 1 Nisan</span></li>
                <li className="flex justify-between"><span>23 Nisan:</span> <span className="font-semibold">Ulusal Egemenlik</span></li>
                <li className="flex justify-between"><span>Okulların Kapanışı:</span> <span className="font-semibold">20 Haziran 2025</span></li>
            </ul>
        </div>
      </div>

      {showBirthdayModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-xl shadow-xl w-80 text-center">
                <h2 className="text-xl font-bold mb-4">Hoşgeldin! 🎉</h2>
                <p className="mb-4 text-gray-600">Doğum gününü girer misin? Sana özel sürprizlerimiz olacak!</p>
                <input 
                    type="date" 
                    value={birthDate} 
                    onChange={e => setBirthDate(e.target.value)}
                    className="w-full p-2 border rounded mb-4"
                />
                <button 
                    onClick={handleBirthdaySubmit}
                    className="w-full bg-blue-500 text-white p-2 rounded hover:bg-blue-600 font-semibold"
                >
                    Kaydet
                </button>
            </div>
        </div>
      )}

      {/* Avatar Modal */}
      {showAvatarModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
            <div className="w-full max-w-4xl h-[80vh]">
                <LayeredAvatarEditor
                  initialConfig={user?.avatar_config}
                  onSave={(c) => { handleSaveAvatar(c); setShowAvatarModal(false); }}
                  onCancel={() => setShowAvatarModal(false)}
                />
            </div>
        </div>
      )}

      {/* Password Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white p-6 rounded-xl w-80">
              <h2 className="text-xl font-bold mb-4">Şifre Değiştir</h2>
              <input type="password" placeholder="Mevcut şifre" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} className="w-full p-2 border rounded mb-2" />
              <input type="password" placeholder="Yeni şifre" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="w-full p-2 border rounded mb-4" />
              <div className="flex gap-2">
                <button onClick={() => setShowPasswordModal(false)} className="flex-1 bg-gray-200 p-2 rounded">İptal</button>
                <button onClick={async () => { 
                    try { 
                      await api.post('/me/password', { current_password: currentPassword, new_password: newPassword });
                      setPasswordFeedback('Şifre güncellendi');
                      setShowPasswordModal(false);
                    } catch { setPasswordFeedback('Hata: Şifre güncellenemedi'); }
                }} className="flex-1 bg-blue-600 text-white p-2 rounded">Güncelle</button>
              </div>
              {passwordFeedback && <div className="text-sm mt-2">{passwordFeedback}</div>}
          </div>
        </div>
      )}

      {/* Inventory Modal */}
      {showInventoryModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white p-6 rounded-xl w-full max-w-lg">
            <h2 className="text-xl font-bold mb-4">Envanterim</h2>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {inventory.map((it: any) => (
                <div key={it.id} className="flex items-center gap-2 p-2 border rounded">
                  <span className="font-bold text-gray-700">{it.name}</span>
                  <span className="text-xs text-gray-500">{it.category}</span>
                  <span className="ml-auto text-xs text-gray-400">Asset: {it.asset_id}</span>
                </div>
              ))}
              {inventory.length === 0 && <div className="text-sm text-gray-500">Envanter boş</div>}
            </div>
            <div className="mt-4 flex justify-end">
              <button onClick={() => setShowInventoryModal(false)} className="bg-gray-200 text-gray-800 px-4 py-2 rounded-lg">Kapat</button>
            </div>
          </div>
        </div>
      )}

      {/* Encouragement Modal */}
      {showEncModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white p-6 rounded-xl w-96">
            <h2 className="text-xl font-bold mb-3">Teşvik Mesajı</h2>
            <input value={encMsg} onChange={e => setEncMsg(e.target.value)} className="w-full p-2 border rounded mb-3" placeholder="Örn: Hedefime odaklanıyorum!" />
            <div className="flex gap-2">
              <button onClick={() => setShowEncModal(false)} className="flex-1 bg-gray-200 text-gray-800 p-2 rounded">İptal</button>
              <button onClick={async () => { 
                try { await api.post('/notifications', { message: encMsg || 'Devam ediyorum! 💪', user_id: user?.id }); setEncMsg(''); setShowEncModal(false); } catch {}
              }} className="flex-1 bg-pink-600 text-white p-2 rounded">Gönder</button>
            </div>
          </div>
        </div>
      )}

      {/* Pomodoro Modal */}
      {showPomodoroModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white p-6 rounded-xl w-96">
            <h2 className="text-xl font-bold mb-3">Pomodoro</h2>
            <div className="flex items-center gap-2 mb-3">
              <input type="number" min={5} max={60} value={pomodoroDuration} onChange={e => setPomodoroDuration(Math.min(60, Math.max(5, Number(e.target.value))))} className="w-20 p-2 border rounded" />
              <span className="text-sm text-gray-600">dakika</span>
            </div>
            <div className="text-3xl font-bold text-slate-800 text-center mb-3">
              {String(Math.floor(pomodoroRemaining / 60)).padStart(2,'0')}:{String(pomodoroRemaining % 60).padStart(2,'0')}
            </div>
            <div className="flex gap-2">
              {!pomodoroRunning ? (
                <button onClick={startPomodoro} className="flex-1 bg-slate-700 text-white p-2 rounded">Başlat</button>
              ) : (
                <button onClick={stopPomodoro} className="flex-1 bg-gray-300 text-gray-800 p-2 rounded">Durdur</button>
              )}
            </div>
            <div className="mt-3 flex justify-end">
              <button onClick={() => setShowPomodoroModal(false)} className="bg-gray-200 text-gray-800 px-4 py-2 rounded-lg">Kapat</button>
            </div>
          </div>
        </div>
      )}

      {/* Polls Modal */}
      {showPollsModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white p-6 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <h2 className="text-2xl font-bold mb-4 flex items-center gap-2 text-indigo-600">
              <Box size={24} /> Aktif Oylamalar
            </h2>
            <div className="space-y-6 overflow-y-auto flex-1 pr-2">
              {polls.map((poll: any) => (
                <div key={poll.id} className="bg-indigo-50/50 p-4 rounded-xl border border-indigo-100">
                  <h3 className="font-bold text-gray-800 mb-3">{poll.question}</h3>
                  <div className="space-y-2">
                    {poll.options.map((opt: string, idx: number) => {
                      const voteCount = poll.results?.[idx] || 0;
                      const percentage = poll.total_votes > 0 ? Math.round((voteCount / poll.total_votes) * 100) : 0;
                      const isSelected = poll.user_vote === idx;

                      return (
                        <button
                          key={idx}
                          onClick={() => handleVote(poll.id, idx)}
                          className={`w-full relative overflow-hidden group transition-all duration-300 rounded-lg border ${
                            isSelected ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 bg-white hover:border-indigo-300'
                          }`}
                        >
                          <div 
                            className="absolute inset-y-0 left-0 bg-indigo-100 transition-all duration-500" 
                            style={{ width: `${percentage}%` }}
                          />
                          <div className="relative p-3 flex justify-between items-center text-sm">
                            <span className={`font-medium ${isSelected ? 'text-indigo-700' : 'text-gray-700'}`}>
                              {opt} {isSelected && '✓'}
                            </span>
                            <span className="text-[10px] font-bold text-indigo-500 bg-white px-1.5 py-0.5 rounded shadow-sm">
                              %{percentage}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-3 flex justify-between items-center text-[10px] text-gray-400 font-medium">
                    <span>Toplam Oy: {poll.total_votes}</span>
                    {poll.expires_at && (
                      <span>Bitiş: {new Date(poll.expires_at).toLocaleDateString()}</span>
                    )}
                  </div>
                </div>
              ))}
              {polls.length === 0 && (
                <div className="text-center py-10 text-gray-500 italic">
                  Şu an aktif bir oylama bulunmuyor.
                </div>
              )}
            </div>
            <div className="mt-6 flex justify-end">
              <button onClick={() => setShowPollsModal(false)} className="w-full bg-gray-100 text-gray-600 font-bold py-3 rounded-xl hover:bg-gray-200 transition">Kapat</button>
            </div>
          </div>
        </div>
      )}

      {/* Wardrobe Modal */}
      {showWardrobeModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white p-6 rounded-xl w-full max-w-lg">
            <h2 className="text-xl font-bold mb-4">Gardrop</h2>
            <div className="flex gap-2 mb-3">
              <input value={wardrobeName} onChange={e => setWardrobeName(e.target.value)} className="flex-1 p-2 border rounded" placeholder="Kombin adı" />
              <button onClick={async () => {
                try { await api.post('/me/wardrobe', { name: wardrobeName, config: user?.avatar_config }); setWardrobeName(''); await fetchWardrobe(); } catch {}
              }} className="bg-purple-600 text-white px-4 rounded">Kaydet</button>
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {wardrobe.map((w: any) => (
                <div key={w.id} className="flex items-center gap-2 p-2 border rounded">
                  <span className="font-bold text-gray-700">{w.name}</span>
                  <span className="ml-auto flex gap-2">
                    <button onClick={async () => { try { await api.post(`/me/wardrobe/${w.id}/apply`); window.location.reload(); } catch {} }} className="px-3 py-1 rounded bg-green-600 text-white">Giy</button>
                    <button onClick={async () => { try { await api.delete(`/me/wardrobe/${w.id}`); await fetchWardrobe(); } catch {} }} className="px-3 py-1 rounded bg-red-100 text-red-700">Sil</button>
                  </span>
                </div>
              ))}
              {wardrobe.length === 0 && <div className="text-sm text-gray-500">Henüz kombin yok</div>}
            </div>
            <div className="mt-4 flex justify-end">
              <button onClick={() => setShowWardrobeModal(false)} className="bg-gray-200 text-gray-800 px-4 py-2 rounded-lg">Kapat</button>
            </div>
          </div>
        </div>
      )}
      {/* Daily Spin Modal */}
      {showSpinModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4 backdrop-blur-sm">
          <div className="bg-white p-8 rounded-2xl w-full max-w-sm text-center shadow-2xl transform transition-all scale-100">
            <h2 className="text-2xl font-black mb-2 text-gray-800">Şans Çarkı</h2>
            <p className="text-sm text-gray-500 mb-6">Her gün bir kez çevir, bedava puan kazan!</p>
            
            <div className="relative w-48 h-48 mx-auto mb-8 flex items-center justify-center">
              <div className={`w-full h-full rounded-full border-8 border-yellow-400 bg-gradient-to-tr from-orange-100 to-yellow-50 flex items-center justify-center shadow-inner ${isSpinning ? 'animate-spin' : ''}`}>
                <Disc size={80} className="text-yellow-500 opacity-40" />
                {spinPrize && !isSpinning && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center animate-bounce">
                    <span className="text-5xl font-black text-orange-600">+{spinPrize}</span>
                    <span className="text-xs font-bold text-orange-400">PUAN!</span>
                  </div>
                )}
                {!spinPrize && !isSpinning && (
                  <Sparkles size={48} className="text-yellow-400 opacity-50" />
                )}
              </div>
              <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-4 h-8 bg-red-600 rounded-b-full shadow-md z-10"></div>
            </div>

            {spinError && (
              <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg font-medium">
                {spinError}
              </div>
            )}

            {!spinPrize ? (
              <button 
                onClick={handleSpin}
                disabled={isSpinning}
                className="w-full py-4 bg-gradient-to-r from-orange-500 to-yellow-500 text-white rounded-xl font-black text-lg shadow-lg hover:from-orange-600 hover:to-yellow-600 transition-all disabled:opacity-50"
              >
                {isSpinning ? 'ÇEVRİLİYOR...' : 'ŞİMDİ ÇEVİR!'}
              </button>
            ) : (
              <button 
                onClick={() => { setShowSpinModal(false); setSpinPrize(null); }}
                className="w-full py-4 bg-green-500 text-white rounded-xl font-black text-lg shadow-lg hover:bg-green-600 transition-all"
              >
                HARİKA!
              </button>
            )}

            {!isSpinning && !spinPrize && (
              <button 
                onClick={() => setShowSpinModal(false)}
                className="mt-4 text-sm text-gray-400 font-bold hover:text-gray-600"
              >
                Kapat
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default StudentDashboard;
