import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { MessageSquare, ShoppingBag, Trophy, Calendar, Edit, LogOut, Box, Sparkles, Timer, Layers } from 'lucide-react';
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

  useEffect(() => {
    if (user?.first_login) {
        setShowBirthdayModal(true);
    }
    if (user?.id) {
        fetchRosettes();
        fetchNotifications();
        fetchWeekly();
        setDisplayTotal(user?.points?.total_points || 0);
        setDisplaySpendable(user?.points?.spendable_points || 0);
    }
  }, [user]);

  // Live update points on socket event
  const socketRef = useRef<Socket | null>(null);
  useEffect(() => {
    socketRef.current = io('http://localhost:3000');
    socketRef.current.on('points_updated', async (payload: any) => {
      if (payload.student_id === user?.id) {
        const amt = Number(payload.amount) || 0;
        setDisplayTotal(t => t + amt);
        setDisplaySpendable(s => (amt > 0 ? s + amt : s));
        setTimeout(async () => {
          await refreshUser();
          await fetchWeekly();
        }, 200);
      }
    });
    return () => { socketRef.current?.disconnect(); };
  }, [user?.id]);

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
            <h2 className="text-left font-bold text-gray-700 mb-2">Haftalık İstatistik</h2>
            <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                <div className="flex justify-between items-center mb-3">
                    <span className="text-sm text-gray-600">Son 7 gün net puan</span>
                    <span className="text-xl font-bold text-blue-700">{weeklyPoints}</span>
                </div>
                <div className="flex items-end gap-2 h-24">
                    {weeklyDetail.map(d => (
                        <div key={d.day} className="flex flex-col items-center">
                            <div className="w-6 bg-blue-400 rounded-t" style={{ height: `${Math.max(4, Math.min(100, Math.abs(d.points))) }px` }} title={`${d.day}: ${d.points}`} />
                            <span className="text-[10px] text-gray-500 mt-1">{d.day.slice(5)}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>

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

        {/* Announcements */}
        {notifications.length > 0 && (
            <div className="mb-6 w-full">
                <h2 className="text-left font-bold text-gray-700 mb-2">Duyurular</h2>
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
          <button onClick={() => navigate('/chat')} className="flex items-center justify-center gap-2 bg-purple-500 text-white p-3 rounded-xl hover:bg-purple-600 transition">
            <MessageSquare /> Sınıf Sohbeti
          </button>
          <button onClick={() => navigate('/shop')} className="flex items-center justify-center gap-2 bg-orange-500 text-white p-3 rounded-xl hover:bg-orange-600 transition">
            <ShoppingBag /> Mağaza
          </button>
           <button onClick={() => navigate('/leaderboard')} className="flex items-center justify-center gap-2 bg-yellow-500 text-white p-3 rounded-xl hover:bg-yellow-600 transition">
            <Trophy /> Liderlik Tablosu
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
    </div>
  );
};

export default StudentDashboard;
