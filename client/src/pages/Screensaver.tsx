import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Maximize, Minimize, Star, CloudSun, Wind } from 'lucide-react';
import api from '../api';
import type { User } from '../context/AuthContext';
import { getAvatarUrl } from '../utils/avatar';
import LayeredAvatar from '../components/LayeredAvatar';

const Screensaver: React.FC = () => {
  const navigate = useNavigate();
  const [time, setTime] = useState(new Date());
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [topStudent, setTopStudent] = useState<User | null>(null);
  const [weather, setWeather] = useState<{temp:number, desc:string, humidity:number, wind:number} | null>(null);
  const [nextLabel, setNextLabel] = useState<string>('');
  const [nextMinutes, setNextMinutes] = useState<number>(0);

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    fetchTopStudent();
    fetchWeather();
    computeNext();
    const w = setInterval(fetchWeather, 15 * 60 * 1000);
    const c = setInterval(computeNext, 60 * 1000);
    return () => {
      clearInterval(timer);
      clearInterval(w);
      clearInterval(c);
    };
  }, []);

  const fetchTopStudent = async () => {
    try {
        const weekly = await api.get('/leaderboard/weeklyTop');
        if (weekly.data) {
            setTopStudent(weekly.data as any);
            return;
        }
        // Fallback to total points
        const res = await api.get('/students');
        const students = res.data as User[];
        if (students.length > 0) {
            const sorted = students.sort((a, b) => (b.points?.total_points || 0) - (a.points?.total_points || 0));
            setTopStudent(sorted[0]);
        }
    } catch (err) {
        console.error(err);
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
        setIsFullscreen(false);
      }
    }
  };

  const fetchWeather = async () => {
    try {
      const url = 'https://api.open-meteo.com/v1/forecast?latitude=40.35&longitude=27.97&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code&timezone=Europe%2FIstanbul';
      const r = await fetch(url);
      const j = await r.json();
      const c = j.current || {};
      const map: Record<number, string> = {
        0: 'Açık', 1: 'Az bulutlu', 2: 'Parçalı bulutlu', 3: 'Bulutlu',
        45: 'Sis', 48: 'Donan sis', 51: 'Çiseleme', 53: 'Çiseleme', 55: 'Yoğun çiseleme',
        61: 'Hafif yağmur', 63: 'Yağmur', 65: 'Şiddetli yağmur',
        71: 'Hafif kar', 73: 'Kar', 75: 'Yoğun kar',
        80: 'Sağanak', 81: 'Sağanak', 82: 'Şiddetli sağanak',
        95: 'Gök gürültülü', 96: 'Dolu', 99: 'Şiddetli dolu'
      };
      setWeather({
        temp: c.temperature_2m,
        desc: map[c.weather_code] || 'Durum',
        humidity: c.relative_humidity_2m,
        wind: c.wind_speed_10m
      });
    } catch {}
  };

  const computeNext = () => {
    const slots = ['08:55-09:35','09:50-10:30','10:45-11:25','11:40-12:20','13:00-13:40','13:55-14:35','14:45-15:25'];
    const now = new Date();
    const toMin = (s: string) => {
      const [h,m] = s.split(':').map(Number);
      return h*60+m;
    };
    const curMin = now.getHours()*60 + now.getMinutes();
    let label = '';
    let mins = 0;
    for (let i=0;i<slots.length;i++) {
      const [start,end] = slots[i].split('-');
      const s = toMin(start);
      const e = toMin(end);
      if (curMin < s) {
        label = `Sonraki Ders: ${start}`;
        mins = s - curMin;
        break;
      }
      if (curMin >= s && curMin <= e) {
        const nextStart = i+1 < slots.length ? toMin(slots[i+1].split('-')[0]) : null;
        if (nextStart) {
          label = `Sonraki Ders: ${slots[i+1].split('-')[0]}`;
          mins = nextStart - curMin;
        } else {
          label = 'Gün bitti';
          mins = 0;
        }
        break;
      }
    }
    if (!label) {
      label = 'Gün başlamadı';
      const firstStart = toMin(slots[0].split('-')[0]);
      mins = Math.max(0, firstStart - curMin);
    }
    setNextLabel(label);
    setNextMinutes(mins);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-purple-900 to-indigo-900 flex flex-col items-center justify-center text-white relative overflow-hidden">
      {/* Background Elements */}
      <div className="absolute top-0 left-0 w-full h-full opacity-20 pointer-events-none">
          <div className="absolute top-10 left-10 w-32 h-32 bg-blue-500 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute bottom-10 right-10 w-48 h-48 bg-purple-500 rounded-full blur-3xl animate-pulse delay-700"></div>
      </div>

      <div className="z-10 text-center">
        <h1 className="text-[120px] font-bold tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-blue-200 to-pink-200 drop-shadow-lg font-mono">
          {time.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
        </h1>
        <p className="text-2xl text-blue-200 mt-4 font-light tracking-widest uppercase">
          {time.toLocaleDateString('tr-TR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
        
        <div className="mt-16">
            <h2 className="text-6xl font-black text-white mb-2">8/G SINIFI</h2>
            <p className="text-xl text-blue-300 italic mb-8">"Gelecek, bugün ne yaptığına bağlıdır."</p>
            
            {topStudent && (
                <div className="bg-white/10 backdrop-blur-sm p-6 rounded-2xl border border-white/20 inline-flex items-center gap-6 animate-bounce-slow">
                    <div className="relative">
                        {topStudent.avatar_config?.provider === 'layered' ? (
                          <LayeredAvatar config={topStudent.avatar_config} size={96} className="rounded-full border-4 border-yellow-400 shadow-lg bg-white" fallbackSeed={topStudent.username} />
                        ) : (
                          <img src={getAvatarUrl(topStudent.avatar_config, topStudent.username)} className="w-24 h-24 rounded-full border-4 border-yellow-400 shadow-lg bg-white" alt="Star Student" />
                        )}
                        <div className="absolute -top-4 -right-4 text-yellow-400 animate-spin-slow">
                            <Star size={40} fill="currentColor" />
                        </div>
                    </div>
                    <div className="text-left">
                        <p className="text-yellow-400 font-bold uppercase tracking-wider text-sm">Haftanın Yıldızı</p>
                        <h3 className="text-3xl font-bold text-white">{topStudent.name}</h3>
                        <p className="text-white/80 font-mono">{topStudent.points?.total_points} Puan</p>
                    </div>
                </div>
            )}
        </div>
        
        <div className="mt-10 grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
          <div className="bg-white/10 backdrop-blur-sm p-6 rounded-2xl border border-white/20 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CloudSun size={32} className="text-blue-200" />
              <div>
                <div className="text-lg font-bold">Bandırma Hava Durumu</div>
                <div className="text-sm text-blue-200">15 dakikada bir güncellenir</div>
              </div>
            </div>
            {weather ? (
              <div className="text-right">
                <div className="text-3xl font-extrabold">{Math.round(weather.temp)}°C</div>
                <div className="text-sm">{weather.desc}</div>
                <div className="text-sm">Nem {Math.round(weather.humidity)}%</div>
                <div className="text-sm flex items-center justify-end gap-1"><Wind size={16} /> {Math.round(weather.wind)} km/s</div>
              </div>
            ) : (
              <div className="text-right text-sm">Yükleniyor</div>
            )}
          </div>
          <div className="bg-white/10 backdrop-blur-sm p-6 rounded-2xl border border-white/20 flex items-center justify-between">
            <div className="text-left">
              <div className="text-lg font-bold">Ders Zamanı</div>
              <div className="text-sm text-blue-200">{nextLabel}</div>
            </div>
            <div className="text-right">
              <div className="text-5xl font-extrabold">{nextMinutes}</div>
              <div className="text-sm">dakika</div>
            </div>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="absolute bottom-6 right-6 flex gap-4 z-20 opacity-0 hover:opacity-100 transition-opacity">
        <button onClick={toggleFullscreen} className="p-2 bg-white/10 rounded-full hover:bg-white/20">
            {isFullscreen ? <Minimize size={24} /> : <Maximize size={24} />}
        </button>
        <button onClick={() => navigate('/')} className="px-4 py-2 bg-white/10 rounded-lg hover:bg-white/20 font-semibold">
            Çıkış
        </button>
      </div>
    </div>
  );
};

export default Screensaver;
