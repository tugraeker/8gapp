import React, { useEffect, useRef, useState } from 'react';
import api from '../api';
import { useAuth, type User } from '../context/AuthContext';
import { UserPlus, Users, MessageSquare, Book, Calendar, MonitorPlay, LogOut, ShoppingBag, Dice6, CheckSquare, Megaphone } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import LayeredAvatar from '../components/LayeredAvatar';
import { io, Socket } from 'socket.io-client';

interface Rosette {
  id: number;
  name: string;
  description: string;
  icon: string;
}

interface WithBirthDate {
  birth_date?: string | null;
}

const TeacherDashboard: React.FC = () => {
  const { user, logout } = useAuth();
  const [students, setStudents] = useState<User[]>([]);
  const [rosettes, setRosettes] = useState<Rosette[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<User | 'all' | null>(null);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [selectedRecipientId, setSelectedRecipientId] = useState<number | 'all' | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'points' | 'rosettes' | 'istatistik'>('points');
  const [reason, setReason] = useState('');
  const [amountInput, setAmountInput] = useState<string>('');
  const [feedback, setFeedback] = useState<string>('');
  const navigate = useNavigate();

  const [newStudentName, setNewStudentName] = useState('');
  const [showAddStudent, setShowAddStudent] = useState(false);
  const [lastCreatedStudent, setLastCreatedStudent] = useState<{username: string, password: string} | null>(null);
  const [showShopAdmin, setShowShopAdmin] = useState(false);
  type ShopItem = { id: number; name: string; category: string; cost: number; asset_id: string };
  const [shopItems, setShopItems] = useState<ShopItem[]>([]);
  const [newItem, setNewItem] = useState({ name: '', category: '', cost: '', asset_id: '' });
  const [newItemError, setNewItemError] = useState<string>('');
  const [newItemLoading, setNewItemLoading] = useState<boolean>(false);
  const [newItemSuccess, setNewItemSuccess] = useState<string>('');
  const [showRandomPicker, setShowRandomPicker] = useState(false);
  const [pickerCount, setPickerCount] = useState<number>(1);
  const [pickerAnimating, setPickerAnimating] = useState(false);
  const [pickerDisplayUsers, setPickerDisplayUsers] = useState<User[]>([]);
  const [pickerSelectedUsers, setPickerSelectedUsers] = useState<User[]>([]);
  const [panelError, setPanelError] = useState<string>('');

  const [showNotebook, setShowNotebook] = useState(false);
  const [showAttendance, setShowAttendance] = useState(false);
  const [attendanceData, setAttendanceData] = useState<Record<number, string>>({});
  const [attendanceLoading, setAttendanceLoading] = useState(false);

  // Announcement State
  const [showAnnouncementModal, setShowAnnouncementModal] = useState(false);
  const [announcementTitle, setAnnouncementTitle] = useState('');
  const [announcementContent, setAnnouncementContent] = useState('');
  const [announcementFeedback, setAnnouncementFeedback] = useState('');
  
  // Poll State
  const [showPollModal, setShowPollModal] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState(['', '']);
  const [pollFeedback, setPollFeedback] = useState('');

  const isBirthdayToday = (bd?: string | null) => {
    if (!bd) return false;
    const d = new Date(String(bd));
    const t = new Date();
    return d.getDate() === t.getDate() && d.getMonth() === t.getMonth();
  };

  // Extended modal data
  const [studentWeeklyPoints, setStudentWeeklyPoints] = useState<number>(0);
  const [studentWeeklyDetail, setStudentWeeklyDetail] = useState<{day:string,points:number}[]>([]);
  const [studentRank, setStudentRank] = useState<number | null>(null);
  const [studentRosettes, setStudentRosettes] = useState<any[]>([]);

  const handlePostAnnouncement = async () => {
    if (!announcementTitle || !announcementContent) {
        setAnnouncementFeedback('Başlık ve içerik gereklidir.');
        return;
    }
    try {
        await api.post('/announcements', { title: announcementTitle, content: announcementContent });
        setAnnouncementFeedback('Duyuru başarıyla yayınlandı!');
        setAnnouncementTitle('');
        setAnnouncementContent('');
        setTimeout(() => {
            setShowAnnouncementModal(false);
            setAnnouncementFeedback('');
        }, 1500);
    } catch (err) {
        setAnnouncementFeedback('Hata oluştu.');
    }
  };

  const handleCreatePoll = async () => {
    if (!pollQuestion || pollOptions.some(o => !o.trim())) {
      setPollFeedback('Soru ve tüm seçenekler gereklidir.');
      return;
    }
    try {
      await api.post('/polls', { 
        question: pollQuestion, 
        options: pollOptions.filter(o => o.trim() !== '') 
      });
      setPollFeedback('Oylama başarıyla oluşturuldu!');
      setPollQuestion('');
      setPollOptions(['', '']);
      setTimeout(() => {
        setShowPollModal(false);
        setPollFeedback('');
      }, 1500);
    } catch (err) {
      setPollFeedback('Oylama oluşturulurken hata oluştu.');
    }
  };

  const handleAddOption = () => {
    if (pollOptions.length < 5) {
      setPollOptions([...pollOptions, '']);
    }
  };

  const handleRemoveOption = (index: number) => {
    if (pollOptions.length > 2) {
      setPollOptions(pollOptions.filter((_, i) => i !== index));
    }
  };

  const fetchStudentStats = async (id: number) => {
    try {
      const end = new Date();
      const start = new Date(); start.setDate(end.getDate() - 6);
      const startStr = start.toISOString().slice(0,10);
      const endStr = end.toISOString().slice(0,10);
      const tx = await api.get('/transactions', { params: { to_user_id: id, type: 'academic', start: startStr, end: endStr }});
      // Aggregate by day
      const map: Record<string, number> = {};
      tx.data.forEach((t: any) => {
        const day = String(t.created_at).slice(0,10);
        map[day] = (map[day] || 0) + Number(t.amount || 0);
      });
      const detail: {day:string,points:number}[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i);
        const dayStr = d.toISOString().slice(0,10);
        detail.push({ day: dayStr, points: map[dayStr] || 0 });
      }
      setStudentWeeklyDetail(detail);
      const total = detail.reduce((acc, x) => acc + x.points, 0);
      setStudentWeeklyPoints(total);
    } catch {}
    try {
      const lb = await api.get('/leaderboard');
      const idx = lb.data.findIndex((u: any) => u.id === id);
      setStudentRank(idx >= 0 ? idx + 1 : null);
    } catch {}
    try {
      const rs = await api.get(`/users/${id}/rosettes`);
      setStudentRosettes(rs.data || []);
    } catch {}
  };

  const fetchAttendance = async () => {
    try {
      const res = await api.get('/attendance');
      const data: Record<number, string> = {};
      res.data.forEach((a: any) => {
        data[a.student_id] = a.status;
      });
      setAttendanceData(data);
    } catch (e) {
      console.error('attendance fetch error', e);
    }
  };

  const handleStartAttendance = async () => {
    setAttendanceLoading(true);
    try {
      await api.post('/attendance/start');
      await fetchAttendance();
    } catch (e) {
      alert('Yoklama başlatılamadı');
    } finally {
      setAttendanceLoading(false);
    }
  };

  const handleToggleAttendance = async (studentId: number) => {
    const currentStatus = attendanceData[studentId] || 'present';
    const newStatus = currentStatus === 'present' ? 'absent' : 'present';
    try {
      await api.post('/attendance/toggle', { student_id: studentId, status: newStatus });
      setAttendanceData(prev => ({ ...prev, [studentId]: newStatus }));
    } catch (e) {
      alert('Yoklama durumu güncellenemedi');
    }
  };

  const fetchStudents = async () => {
    try {
      const res = await api.get('/students');
      setStudents(res.data);
    } catch (e) {
      console.error('students fetch error', e);
      setPanelError('Öğrenci listesi alınamadı. Lütfen bağlantıyı kontrol edin.');
    }
  };

  const fetchRosettes = async () => {
    try {
        const res = await api.get('/rosettes');
        setRosettes(res.data);
    } catch (e) {
        console.error('rosettes fetch error', e);
        setPanelError(p => p || 'Rozet verileri alınamadı.');
    }
  };
  const fetchItems = async () => {
    try {
      const res = await api.get('/items');
      setShopItems(res.data);
    } catch (e) { 
      console.error('items fetch error', e);
      setPanelError(p => p || 'Mağaza ürünleri yüklenemedi.');
    }
  };

  useEffect(() => {
    fetchStudents();
    fetchRosettes();
    fetchAttendance();
    api.get('/users').then(res => setAllUsers(res.data)).catch((e) => { 
      console.error('users fetch error', e);
      setPanelError(p => p || 'Kullanıcı listesi alınamadı.');
    });
  }, []);

  // Live update student points
  const socketRef = useRef<Socket | null>(null);
  useEffect(() => {
    socketRef.current = io(((import.meta as any).env?.VITE_BACKEND_URL) || 'http://localhost:3000');
    socketRef.current.on('points_updated', (payload: { student_id: number; total_points: number; spendable_points: number; amount?: number }) => {
      const { student_id, total_points, spendable_points, amount } = payload;
      
      setStudents(prev => prev.map(s => {
        if (s.id !== student_id) return s;
        
        // Use absolute values from server if available (most reliable)
        const newTotal = total_points !== undefined ? total_points : (s.points?.total_points || 0) + (amount || 0);
        const newSpendable = spendable_points !== undefined ? spendable_points : (s.points?.spendable_points || 0) + (amount || 0);
        
        return { 
          ...s, 
          points: { total_points: newTotal, spendable_points: newSpendable },
          total_points: newTotal,
          spendable_points: newSpendable
        };
      }));
    });
    return () => { socketRef.current?.disconnect(); };
  }, []);

  useEffect(() => {
    if (selectedStudent && selectedStudent !== 'all') {
      fetchStudentStats((selectedStudent as User).id);
    }
  }, [selectedStudent]);

  const handleGivePoints = async () => {
    try {
      const targetId = selectedRecipientId ?? (selectedStudent === 'all' ? 'all' : (selectedStudent as User).id);
      const res = await api.post('/points', {
        student_id: targetId,
        amount: amountInput,
        reason
      });
      setFeedback(`Puan verildi: ${res.data.amount}`);
      setShowModal(false);
      setReason('');
      setAmountInput('');
      setTimeout(() => fetchStudents(), 250); // Let socket update first; then reconcile with server snapshot
    } catch {
      alert('Error giving points');
    }
  };

  const handleGiveRosette = async (rosetteId: number) => {
      if (selectedStudent === 'all') return; // Rosettes are individual for now
      try {
          await api.post('/rosettes/assign', {
              student_id: (selectedStudent as User).id,
              rosette_id: rosetteId
          });
          alert('Rozet verildi!');
          setShowModal(false);
      } catch {
          alert('Error giving rosette');
      }
  };

  const handleCreateStudent = async () => {
    try {
      const res = await api.post('/students', { name: newStudentName });
      setLastCreatedStudent({ username: res.data.username, password: res.data.password });
      setNewStudentName('');
      fetchStudents();
    } catch {
      alert('Error creating student');
    }
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="flex justify-between items-start mb-6">
        <h1 className="text-3xl font-bold text-gray-800">Sınıf Yönetimi (8/G)</h1>
        <div className="flex gap-2 flex-wrap justify-end max-w-4xl">
           <button onClick={() => setShowAttendance(true)} className="flex items-center gap-2 bg-blue-600 text-white px-3 py-2 rounded-lg hover:bg-blue-700 text-sm font-semibold shadow-sm transition-colors">
             <CheckSquare size={18} /> Yoklama
           </button>
           <button onClick={() => setShowAnnouncementModal(true)} className="flex items-center gap-2 bg-red-500 text-white px-3 py-2 rounded-lg hover:bg-red-600 text-sm font-semibold shadow-sm transition-colors">
             <Megaphone size={18} /> Duyuru
           </button>
           <button onClick={() => setShowPollModal(true)} className="flex items-center gap-2 bg-indigo-600 text-white px-3 py-2 rounded-lg hover:bg-indigo-700 text-sm font-semibold shadow-sm transition-colors">
             <CheckSquare size={18} /> Oylama
           </button>
           <button onClick={() => setShowNotebook(true)} className="flex items-center gap-2 bg-yellow-500 text-white px-3 py-2 rounded-lg hover:bg-yellow-600 text-sm font-semibold shadow-sm transition-colors">
             <Book size={18} /> Not Defteri
           </button>
           <button onClick={() => navigate('/screensaver')} className="flex items-center gap-2 bg-indigo-500 text-white px-3 py-2 rounded-lg hover:bg-indigo-600 text-sm font-semibold shadow-sm transition-colors">
             <MonitorPlay size={18} /> Akıllı Tahta
           </button>
           <button onClick={() => { setShowRandomPicker(true); setPickerSelectedUsers([]); setPickerDisplayUsers([]); setPickerAnimating(false); setPickerCount(1); }} className="flex items-center gap-2 bg-pink-500 text-white px-3 py-2 rounded-lg hover:bg-pink-600 text-sm font-semibold shadow-sm transition-colors">
             <MessageSquare size={18} /> Seçim
           </button>
           <button onClick={() => { window.open('/sinif-kura.html','_blank'); }} className="flex items-center gap-2 bg-teal-500 text-white px-3 py-2 rounded-lg hover:bg-teal-600 text-sm font-semibold shadow-sm transition-colors">
             <Dice6 size={18} /> Kura
           </button>
           <button onClick={() => { setShowShopAdmin(true); fetchItems(); }} className="flex items-center gap-2 bg-orange-500 text-white px-3 py-2 rounded-lg hover:bg-orange-600 text-sm font-semibold shadow-sm transition-colors">
             <ShoppingBag size={18} /> Mağaza
           </button>
           <button onClick={() => navigate('/admin/logs')} className="flex items-center gap-2 bg-slate-600 text-white px-3 py-2 rounded-lg hover:bg-slate-700 text-sm font-semibold shadow-sm transition-colors">
             Loglar
           </button>
           <button onClick={() => navigate('/chat')} className="flex items-center gap-2 bg-purple-500 text-white px-3 py-2 rounded-lg hover:bg-purple-600 text-sm font-semibold shadow-sm transition-colors">
            <MessageSquare size={18} /> Sohbet
          </button>
          <button onClick={() => setShowAddStudent(true)} className="flex items-center gap-2 bg-green-500 text-white px-3 py-2 rounded-lg hover:bg-green-600 text-sm font-semibold shadow-sm transition-colors">
            <UserPlus size={18} /> Ekle
          </button>
          <button onClick={() => { logout(); navigate('/login'); }} className="flex items-center gap-2 bg-red-100 text-red-700 px-3 py-2 rounded-lg hover:bg-red-200 text-sm font-semibold shadow-sm transition-colors">
            <LogOut size={18} /> Çıkış
          </button>
        </div>
      </div>
      {/* Error Banner */}
      {panelError && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700">
          {panelError}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-6">
          {/* MEB Calendar Widget */}
          <div className="bg-white p-4 rounded-xl shadow-sm border border-blue-100 lg:col-span-2">
              <div className="flex items-center gap-2 mb-2 text-blue-700 font-bold">
                  <Calendar size={20} />
                  <span>2026 Yılı MEB Eğitim Takvimi</span>
              </div>
              <div className="text-left text-sm space-y-2 text-gray-700">
                  <p><span className="font-semibold">Şu Anki Dönem:</span> 2 Şubat 2026 Pazartesi itibarıyla 2. dönem başladı.</p>
                  <p><span className="font-semibold">2. Dönem Ara Tatili:</span> 16 Mart Pazartesi – 20 Mart Cuma. Ramazan Bayramı ile birleşerek hafta sonları dahil toplam 9 gün.</p>
                  <p><span className="font-semibold">23 Nisan Tatili:</span> Perşembe gününe denk geliyor.</p>
                  <p><span className="font-semibold">1 Mayıs Tatili:</span> Cuma; hafta sonu ile birleşiyor.</p>
                  <p><span className="font-semibold">19 Mayıs Tatili:</span> Salı günü kutlanacak.</p>
                  <p><span className="font-semibold">Kurban Bayramı Tatili:</span> 27 Mayıs Çarşamba – 30 Mayıs Cumartesi.</p>
                  <p><span className="font-semibold">Okulların Kapanışı:</span> 26 Haziran 2026 Cuma, karne günü.</p>
              </div>
          </div>
          
          {/* Birthdays Today */}
          <div className="bg-white p-4 rounded-xl shadow-sm border border-pink-100 lg:col-span-2">
              <div className="flex items-center gap-2 mb-2 text-pink-700 font-bold">
                  <span>Bugün Doğum Günü Olanlar</span>
              </div>
              <div className="flex flex-wrap gap-3">
                {students.filter(s => {
                  if (!('birth_date' in s) || !(s as WithBirthDate).birth_date) return false;
                  const bd = String((s as WithBirthDate).birth_date);
                  const d = new Date(bd);
                  const today = new Date();
                  return d.getDate() === today.getDate() && d.getMonth() === today.getMonth();
                }).map(s => (
                  <div key={s.id} className="flex items-center gap-2 bg-pink-50 border border-pink-200 rounded-lg px-3 py-2">
                    <div className="w-10 h-10 rounded-full overflow-hidden border border-pink-300 bg-white">
                      {s.avatar_config?.provider === 'layered' ? (
                        <LayeredAvatar config={s.avatar_config} size={40} fallbackSeed={s.username} />
                      ) : (
                        <div className="w-full h-full bg-gray-100"></div>
                      )}
                    </div>
                    <span className="text-lg" aria-hidden="true">🎂</span>
                    <span className="font-semibold text-pink-800">{s.name}</span>
                    <span className="text-xs text-pink-600">Doğum günü kutlu olsun!</span>
                  </div>
                ))}
                {students.filter(s => (s as WithBirthDate).birth_date).length === 0 && (
                  <div className="text-sm text-gray-500">Bugün doğum günü olan öğrenci yok.</div>
                )}
              </div>
          </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {/* Whole Class Button */}
        <div 
          onClick={() => { setSelectedStudent('all'); setShowModal(true); }}
          className="bg-white p-4 rounded-xl shadow-sm border-2 border-transparent hover:border-blue-400 cursor-pointer flex flex-col items-center justify-center h-48 transition"
        >
          <div className="bg-blue-100 p-4 rounded-full mb-3">
            <Users size={32} className="text-blue-600" />
          </div>
          <span className="font-bold text-lg text-gray-700">Tüm Sınıf</span>
        </div>

        {students.map(student => (
          <div 
            key={student.id}
            onClick={() => { setSelectedStudent(student); setShowModal(true); }}
            className="bg-white p-4 rounded-2xl shadow-md border-2 border-transparent hover:border-blue-400 cursor-pointer flex flex-col items-center h-56 transition transform hover:scale-105 relative"
          >
            <div className="bg-gray-100 w-20 h-20 rounded-full mb-3 overflow-hidden border-2 border-gray-200 bg-white">
              {student.avatar_config?.provider === 'layered' ? (
                <LayeredAvatar config={student.avatar_config} size={80} fallbackSeed={student.username} />
              ) : (
                <div className="w-full h-full bg-gray-100 flex items-center justify-center">
                  <span className="text-gray-400 text-xs font-bold">Avatar Yok</span>
                </div>
              )}
            </div>
            <span className="font-bold text-gray-800 text-center text-lg leading-tight mb-2">
              {isBirthdayToday((student as WithBirthDate).birth_date) && <span className="mr-1" aria-label="bugün doğum günü">🎂</span>}
              {student.name}
            </span>
            
            <div className="mt-auto flex gap-2 w-full justify-center">
                <div className="flex flex-col items-center bg-green-50 px-2 py-1 rounded-lg border border-green-200 min-w-[3rem]">
                    <span className="text-[10px] text-green-700 font-bold uppercase">Harcama</span>
                    <span className="text-green-800 font-bold text-sm">
                      {(student.points?.spendable_points ?? 0)}
                    </span>
                </div>
                <div className="flex flex-col items-center bg-blue-50 px-2 py-1 rounded-lg border border-blue-200 min-w-[3rem]">
                    <span className="text-[10px] text-blue-700 font-bold uppercase">Toplam</span>
                    <span className="text-blue-800 font-bold text-sm">
                      {(student.points?.total_points ?? 0)}
                    </span>
                </div>
            </div>
          </div>
        ))}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-xl w-96">
            <h2 className="text-xl font-bold mb-4">
              {selectedStudent === 'all' ? 'Tüm Sınıf İşlemleri' : `${(selectedStudent as User).name}`}
            </h2>
            
            {/* Tabs */}
            <div className="flex flex-wrap border-b mb-4">
                <button 
                    className={`flex-1 py-2 font-semibold ${activeTab === 'points' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500'}`}
                    onClick={() => setActiveTab('points')}
                >
                    Puan Ver
                </button>
                {selectedStudent !== 'all' && (
                    <button 
                        className={`flex-1 py-2 font-semibold ${activeTab === 'rosettes' ? 'text-yellow-600 border-b-2 border-yellow-600' : 'text-gray-500'}`}
                        onClick={() => setActiveTab('rosettes')}
                    >
                        Rozet Ver
                    </button>
                )}
                {selectedStudent !== 'all' && (
                  <button 
                    className={`flex-1 py-2 font-semibold ${activeTab === 'istatistik' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-500'}`}
                    onClick={() => setActiveTab('istatistik')}
                  >
                    İstatistik
                  </button>
                )}
            </div>

            {activeTab === 'points' && (
                <>
                    <div className="mb-4 flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full overflow-hidden border">
                        {user?.avatar_config?.provider === 'layered' ? (
                          <LayeredAvatar config={user.avatar_config} size={48} fallbackSeed={user?.username || 'teacher'} />
                        ) : <div className="w-full h-full bg-gray-100"></div>}
                      </div>
                      <div>
                        <div className="text-xs text-gray-500">Veren Kişi</div>
                        <div className="font-semibold text-gray-700">{user?.name}</div>
                      </div>
                    </div>

                    <div className="mb-4">
                      <label className="block text-sm font-medium mb-1">Puan Verilecek Kişi</label>
                      <select
                        value={selectedRecipientId ?? (selectedStudent === 'all' ? 'all' : (selectedStudent as User)?.id)}
                        onChange={(e) => {
                          const v = e.target.value;
                          setSelectedRecipientId(v === 'all' ? 'all' : Number(v));
                        }}
                        className="w-full p-2 border rounded-lg"
                      >
                        <option value="all">Tüm Öğrenciler</option>
                        {allUsers.map(u => (
                          <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                        ))}
                      </select>
                    </div>

                    <div className="mb-4">
                    <label className="block text-sm font-medium mb-1">Sebep</label>
                    <input 
                        type="text" 
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        className="w-full p-2 border rounded-lg"
                        placeholder="Örn: Ödevini yaptı, Arkadaşına yardım etti..."
                    />
                    </div>
                    
                    <div className="mb-6">
                    <label className="block text-sm font-medium mb-1">Puan Miktarı (+ veya -)</label>
                    <input 
                        type="text" 
                        value={amountInput}
                        onChange={(e) => setAmountInput(e.target.value)}
                        className="w-full p-2 border rounded-lg"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                        <span className="text-red-500">Kural: (+) Hem T hem H artar. (-) Sadece T azalır.</span>
                    </p>
                    </div>

                    <div className="flex gap-2">
                    <button onClick={() => setShowModal(false)} className="flex-1 bg-gray-200 py-2 rounded-lg">İptal</button>
                    <button onClick={handleGivePoints} className="flex-1 bg-blue-600 text-white py-2 rounded-lg">Onayla</button>
                    </div>
                    {feedback && <div className="mt-3 text-green-600 text-sm">{feedback}</div>}
                </>
            )}

            {activeTab === 'rosettes' && (
                <div className="grid grid-cols-4 gap-2 max-h-60 overflow-y-auto p-1">
                    {rosettes.map(rosette => (
                        <div 
                            key={rosette.id} 
                            onClick={() => handleGiveRosette(rosette.id)}
                            className="flex flex-col items-center p-2 border rounded-lg hover:bg-yellow-50 cursor-pointer transition text-center"
                        >
                            <div className="text-2xl mb-1">{rosette.icon}</div>
                            <span className="text-[10px] font-bold leading-tight">{rosette.name}</span>
                        </div>
                    ))}
                </div>
            )}

             {activeTab === 'rosettes' && (
                 <div className="mt-4 flex justify-end">
                     <button onClick={() => setShowModal(false)} className="bg-gray-200 text-gray-800 px-4 py-2 rounded-lg">Kapat</button>
                 </div>
             )}

            {activeTab === 'istatistik' && selectedStudent !== 'all' && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <div className="w-12 h-12 rounded-full overflow-hidden border">
                    {(selectedStudent as User).avatar_config?.provider === 'layered' ? (
                      <LayeredAvatar config={(selectedStudent as User).avatar_config} size={48} fallbackSeed={(selectedStudent as User).username} />
                    ) : <div className="w-full h-full bg-gray-100"></div>}
                  </div>
                  <div>
                    <div className="text-sm text-gray-600">Haftalık Net Puan</div>
                    <div className="text-xl font-bold text-indigo-700">{studentWeeklyPoints}</div>
                  </div>
                  <div className="ml-auto text-right">
                    <div className="text-sm text-gray-600">Sınıf Sırası</div>
                    <div className="text-xl font-bold text-indigo-700">{studentRank ?? '-'}</div>
                  </div>
                </div>
                <div className="flex items-end gap-2 h-24">
                  {studentWeeklyDetail.map(d => (
                    <div key={d.day} className="flex flex-col items-center">
                      <div className="w-6 bg-indigo-400 rounded-t" style={{ height: `${Math.max(4, Math.min(100, Math.abs(d.points))) }px` }} title={`${d.day}: ${d.points}`} />
                      <span className="text-[10px] text-gray-500 mt-1">{d.day.slice(5)}</span>
                    </div>
                  ))}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-700 mb-2">Rozetleri</h3>
                  <div className="flex gap-2 overflow-x-auto">
                    {studentRosettes.map((r, i) => (
                      <div key={i} className="flex flex-col items-center bg-yellow-50 p-2 rounded-lg border border-yellow-200 min-w-[72px]" title={r.description}>
                        <span className="text-2xl mb-1">{r.icon}</span>
                        <span className="text-[10px] font-bold text-gray-700 leading-tight">{r.name}</span>
                      </div>
                    ))}
                    {studentRosettes.length === 0 && <div className="text-xs text-gray-500">Rozet yok</div>}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      
      {showShopAdmin && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-xl w-full max-w-[720px]">
            <h2 className="text-xl font-bold mb-4">Mağaza Yönetimi</h2>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 mb-2">
              <input className="p-2 border rounded" placeholder="Ad" value={newItem.name} onChange={(e) => setNewItem({ ...newItem, name: e.target.value })} />
              <input className="p-2 border rounded" placeholder="Kategori" value={newItem.category} onChange={(e) => setNewItem({ ...newItem, category: e.target.value })} />
              <input className="p-2 border rounded" placeholder="Maliyet" value={newItem.cost} onChange={(e) => setNewItem({ ...newItem, cost: e.target.value })} />
              <input className="p-2 border rounded" placeholder="Asset ID" value={newItem.asset_id} onChange={(e) => setNewItem({ ...newItem, asset_id: e.target.value })} />
            </div>
            <div className="text-xs text-gray-500 mb-3">Not: Avatar giysileri için Asset ID genellikle cloths indeksidir (ör. 66, 67, 68).</div>
            {newItemError && <div className="mb-3 p-2 rounded bg-red-50 border border-red-200 text-red-700 text-sm">{newItemError}</div>}
            {newItemSuccess && <div className="mb-3 p-2 rounded bg-green-50 border border-green-200 text-green-700 text-sm">{newItemSuccess}</div>}
            <div className="flex gap-2 mb-4">
              <button
                onClick={async () => {
                  setNewItemError('');
                  setNewItemSuccess('');
                  const { name, category, cost, asset_id } = newItem;
                  const n = name.trim();
                  const c = category.trim();
                  const a = asset_id.trim();
                  const costNum = Number(cost);
                  if (!n || !c || !a || !Number.isFinite(costNum) || costNum <= 0) {
                    setNewItemError('Lütfen tüm alanları doldurun ve maliyet için pozitif bir sayı kullanın.');
                    return;
                  }
                  try {
                    setNewItemLoading(true);
                    await api.post('/items', { name: n, category: c, cost: costNum, asset_id: a });
                    setNewItem({ name: '', category: '', cost: '', asset_id: '' });
                    setNewItemSuccess('Ürün eklendi');
                    fetchItems();
                  } catch (e: any) {
                    setNewItemError(e?.response?.data || 'Ürün eklenemedi');
                  } finally {
                    setNewItemLoading(false);
                  }
                }}
                disabled={newItemLoading}
                className={`px-4 py-2 rounded ${newItemLoading ? 'bg-green-300 text-white cursor-not-allowed' : 'bg-green-600 text-white hover:bg-green-700'}`}
              >
                {newItemLoading ? 'Ekleniyor…' : 'Ekle'}
              </button>
              <button onClick={() => setShowShopAdmin(false)} className="bg-gray-200 px-4 py-2 rounded">Kapat</button>
            </div>
            <div className="max-h-72 overflow-y-auto border rounded">
              {shopItems.map((it) => (
                <div key={it.id} className="grid grid-cols-6 gap-2 p-2 border-b items-center">
                  <span className="col-span-2 font-bold text-gray-700">{it.name}</span>
                  <span className="text-sm">{it.category}</span>
                  <span className="text-sm">{it.cost}</span>
                  <span className="text-sm">{it.asset_id}</span>
                  <div className="flex gap-2 justify-end">
                    <button onClick={async () => { await api.delete(`/items/${it.id}`); fetchItems(); }} className="text-red-600 text-sm underline">Sil</button>
                  </div>
                </div>
              ))}
              {shopItems.length === 0 && <div className="p-3 text-sm text-gray-500">Ürün yok</div>}
            </div>
          </div>
        </div>
      )}

      {showRandomPicker && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-xl w-[640px]">
            <h2 className="text-xl font-bold mb-4">Rastgele Öğrenci Seç</h2>
            <div className="flex items-center gap-3 mb-4">
              <input type="number" min={1} max={students.length} value={pickerCount} onChange={(e) => setPickerCount(Math.min(students.length, Math.max(1, Number(e.target.value))))} className="p-2 border rounded w-24" />
              <button onClick={() => {
                setPickerSelectedUsers([]);
                setPickerAnimating(true);
                const candidates = students;
                const stopAt = Date.now() + 2500;
                const interval = setInterval(() => {
                  const shuffled = [...candidates].sort(() => Math.random() - 0.5).slice(0, Math.min(pickerCount, candidates.length));
                  setPickerDisplayUsers(shuffled);
                  if (Date.now() > stopAt) {
                    clearInterval(interval);
                    const unique = [...candidates].sort(() => Math.random() - 0.5).slice(0, pickerCount);
                    setPickerSelectedUsers(unique);
                    setPickerAnimating(false);
                  }
                }, 60);
              }} className="bg-pink-600 text-white px-4 py-2 rounded">Karıştır</button>
              <button onClick={() => setShowRandomPicker(false)} className="bg-gray-200 px-4 py-2 rounded">Kapat</button>
            </div>
            <div className="h-40 mb-4 flex items-center justify-center">
              {pickerAnimating ? (
                <div className="flex gap-4">
                  {pickerDisplayUsers.map(u => (
                    <div key={u.id} className="flex items-center gap-2 bg-pink-50 border border-pink-200 rounded-lg px-3 py-2">
                      <div className="w-10 h-10 rounded-full overflow-hidden border border-pink-300 bg-white">
                        {u.avatar_config?.provider === 'layered' ? (
                          <LayeredAvatar config={u.avatar_config} size={40} fallbackSeed={u.username} />
                        ) : (
                          <div className="w-full h-full bg-gray-100"></div>
                        )}
                      </div>
                      <span className="font-semibold text-pink-800">{u.name}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {pickerSelectedUsers.map(u => (
                    <div key={u.id} className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
                      <div className="w-14 h-14 rounded-full overflow-hidden border-2 border-green-300 bg-white">
                        {u.avatar_config?.provider === 'layered' ? (
                          <LayeredAvatar config={u.avatar_config} size={56} fallbackSeed={u.username} />
                        ) : (
                          <div className="w-full h-full bg-gray-100"></div>
                        )}
                      </div>
                      <span className="text-2xl font-extrabold text-green-800">{u.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add Student Modal */}
      {showAddStudent && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-xl w-96">
            <h2 className="text-xl font-bold mb-4">Yeni Öğrenci Ekle</h2>
            
            {!lastCreatedStudent ? (
              <>
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-1">Ad Soyad</label>
                  <input 
                    type="text" 
                    value={newStudentName}
                    onChange={(e) => setNewStudentName(e.target.value)}
                    className="w-full p-2 border rounded-lg"
                  />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setShowAddStudent(false)} className="flex-1 bg-gray-200 py-2 rounded-lg">İptal</button>
                  <button onClick={handleCreateStudent} className="flex-1 bg-green-600 text-white py-2 rounded-lg">Ekle</button>
                </div>
              </>
            ) : (
              <div className="text-center">
                <div className="bg-green-100 text-green-800 p-4 rounded-lg mb-4">
                  <p className="font-bold">Öğrenci Oluşturuldu!</p>
                  <p>Kullanıcı Adı: {lastCreatedStudent.username}</p>
                  <p>Şifre: {lastCreatedStudent.password}</p>
                </div>
                <button onClick={() => { setLastCreatedStudent(null); setShowAddStudent(false); }} className="w-full bg-blue-600 text-white py-2 rounded-lg">Tamam</button>
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* Attendance Modal */}
      {showAttendance && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-xl w-[800px] max-h-[90vh] flex flex-col">
            <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
              <CheckSquare size={24} className="text-blue-600" /> Yoklama Modülü
            </h2>
            
            <div className="flex justify-between items-center mb-6 bg-blue-50 p-4 rounded-lg">
              <div>
                <p className="text-sm text-blue-700">Ders başlangıcında yoklamayı başlatın.</p>
                <p className="text-xs text-blue-500">Öğrenciye tıklayarak "Yok" (Kırmızı) durumuna getirebilirsiniz.</p>
              </div>
              <button 
                onClick={handleStartAttendance}
                disabled={attendanceLoading}
                className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {attendanceLoading ? 'Başlatılıyor...' : 'Yoklama Başlat (Herkesi Var Yap)'}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto grid grid-cols-2 md:grid-cols-3 gap-3 p-2">
              {students.map(s => {
                const status = attendanceData[s.id] || 'present';
                return (
                  <div 
                    key={s.id}
                    onClick={() => handleToggleAttendance(s.id)}
                    className={`p-3 rounded-lg border-2 cursor-pointer transition-all flex items-center gap-3 ${
                      status === 'present' 
                        ? 'bg-green-50 border-green-200 text-green-800' 
                        : 'bg-red-50 border-red-200 text-red-800'
                    }`}
                  >
                    <div className="w-8 h-8 rounded-full overflow-hidden bg-white border">
                      {s.avatar_config?.provider === 'layered' && (
                        <LayeredAvatar config={s.avatar_config} size={32} fallbackSeed={s.username} />
                      )}
                    </div>
                    <span className="font-medium truncate">{s.name}</span>
                    <div className={`ml-auto w-3 h-3 rounded-full ${status === 'present' ? 'bg-green-500' : 'bg-red-500'}`}></div>
                  </div>
                );
              })}
            </div>

            <div className="mt-6 flex justify-between items-center pt-4 border-t">
              <span className="text-sm text-gray-500">
                Mevcut: {students.filter(s => (attendanceData[s.id] || 'present') === 'present').length} / {students.length}
              </span>
              <button 
                onClick={() => setShowAttendance(false)} 
                className="bg-gray-800 text-white px-8 py-2 rounded-lg hover:bg-gray-700"
              >
                Kaydet ve Kapat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Teacher Notebook Modal */}
      {showNotebook && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-xl w-[600px] h-[500px] flex flex-col">
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                  <Book size={24} /> Öğretmen Not Defteri
              </h2>
              <textarea 
                  className="flex-1 w-full p-4 border rounded-xl bg-yellow-50 font-handwriting resize-none focus:outline-none focus:ring-2 focus:ring-yellow-400"
                  placeholder="Buraya sınıf veya öğrencilerle ilgili özel notlarınızı alabilirsiniz..."
              ></textarea>
              <div className="mt-4 flex justify-end">
                  <button onClick={() => setShowNotebook(false)} className="bg-gray-800 text-white px-6 py-2 rounded-lg hover:bg-gray-700">Kapat</button>
              </div>
            </div>
          </div>
      )}
      {/* Announcement Modal */}
      {showAnnouncementModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white p-6 rounded-2xl w-full max-w-md shadow-2xl">
            <h2 className="text-2xl font-bold mb-4 flex items-center gap-2 text-red-600">
              <Megaphone size={24} /> Yeni Duyuru Yayınla
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Duyuru Başlığı</label>
                <input 
                  type="text" 
                  value={announcementTitle}
                  onChange={(e) => setAnnouncementTitle(e.target.value)}
                  placeholder="Örn: Haftalık Ödev Hatırlatması"
                  className="w-full p-3 border rounded-xl focus:ring-2 focus:ring-red-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Duyuru İçeriği</label>
                <textarea 
                  value={announcementContent}
                  onChange={(e) => setAnnouncementContent(e.target.value)}
                  placeholder="Duyuru detaylarını buraya yazın..."
                  rows={4}
                  className="w-full p-3 border rounded-xl focus:ring-2 focus:ring-red-500 outline-none resize-none"
                />
              </div>
              
              {announcementFeedback && (
                <div className={`p-3 rounded-lg text-sm font-bold ${announcementFeedback.includes('başarıyla') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                  {announcementFeedback}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button 
                  onClick={() => setShowAnnouncementModal(false)} 
                  className="flex-1 bg-gray-100 text-gray-700 font-bold py-3 rounded-xl hover:bg-gray-200 transition"
                >
                  İptal
                </button>
                <button 
                  onClick={handlePostAnnouncement}
                  className="flex-1 bg-red-600 text-white font-bold py-3 rounded-xl hover:bg-red-700 transition shadow-lg"
                >
                  Yayınla
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Poll Modal */}
      {showPollModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white p-6 rounded-2xl w-full max-w-md shadow-2xl">
            <h2 className="text-2xl font-bold mb-4 flex items-center gap-2 text-indigo-600">
              <CheckSquare size={24} /> Yeni Oylama Başlat
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Oylama Sorusu</label>
                <input 
                  type="text" 
                  value={pollQuestion}
                  onChange={(e) => setPollQuestion(e.target.value)}
                  placeholder="Örn: Cuma günü film izleyelim mi?"
                  className="w-full p-3 border rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1 flex justify-between">
                  Seçenekler
                  {pollOptions.length < 5 && (
                    <button onClick={handleAddOption} className="text-indigo-600 hover:text-indigo-800 text-xs font-black">+ Seçenek Ekle</button>
                  )}
                </label>
                <div className="space-y-2">
                  {pollOptions.map((opt, idx) => (
                    <div key={idx} className="flex gap-2">
                      <input 
                        type="text" 
                        value={opt}
                        onChange={(e) => {
                          const newOpts = [...pollOptions];
                          newOpts[idx] = e.target.value;
                          setPollOptions(newOpts);
                        }}
                        placeholder={`Seçenek ${idx + 1}`}
                        className="flex-1 p-2 border rounded-lg focus:ring-1 focus:ring-indigo-500 outline-none text-sm"
                      />
                      {pollOptions.length > 2 && (
                        <button onClick={() => handleRemoveOption(idx)} className="text-red-400 hover:text-red-600">×</button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              
              {pollFeedback && (
                <div className={`p-3 rounded-lg text-sm font-bold ${pollFeedback.includes('başarıyla') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                  {pollFeedback}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button 
                  onClick={() => setShowPollModal(false)} 
                  className="flex-1 bg-gray-100 text-gray-700 font-bold py-3 rounded-xl hover:bg-gray-200 transition"
                >
                  İptal
                </button>
                <button 
                  onClick={handleCreatePoll}
                  className="flex-1 bg-indigo-600 text-white font-bold py-3 rounded-xl hover:bg-indigo-700 transition shadow-lg"
                >
                  Başlat
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TeacherDashboard;
