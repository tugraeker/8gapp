import React, { useState, useEffect } from 'react';
import api from '../api';
import { ArrowLeft, Trophy, Medal } from 'lucide-react';
import LayeredAvatar from '../components/LayeredAvatar';
import { useNavigate } from 'react-router-dom';

const Leaderboard: React.FC = () => {
    const navigate = useNavigate();
    const [students, setStudents] = useState<any[]>([]);

    useEffect(() => {
        const fetchLeaderboard = async () => {
            try {
                const res = await api.get('/leaderboard');
                setStudents(res.data);
            } catch (err) {
                console.error(err);
            }
        };
        fetchLeaderboard();
    }, []);

    const getRankIcon = (index: number) => {
        if (index === 0) return <Medal className="text-yellow-500 w-8 h-8" />;
        if (index === 1) return <Medal className="text-gray-400 w-8 h-8" />;
        if (index === 2) return <Medal className="text-amber-700 w-8 h-8" />;
        return <span className="font-bold text-gray-500 text-xl w-8 text-center">{index + 1}</span>;
    };

    return (
        <div className="min-h-screen bg-yellow-50 p-6 flex flex-col items-center">
            <div className="w-full max-w-4xl">
                <div className="flex justify-between items-center mb-6">
                    <button onClick={() => navigate('/student-dashboard')} className="flex items-center gap-2 text-yellow-800 font-bold hover:bg-yellow-100 p-2 rounded-lg transition">
                        <ArrowLeft /> Geri Dön
                    </button>
                    <div className="bg-yellow-100 px-6 py-2 rounded-full border-2 border-yellow-500 shadow-sm flex items-center gap-2">
                        <Trophy className="text-yellow-600" />
                        <span className="font-bold text-yellow-800">Liderlik Tablosu</span>
                    </div>
                </div>

                <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
                    <div className="bg-yellow-500 p-4 text-white font-bold grid grid-cols-12 gap-4">
                        <div className="col-span-2 text-center">Sıra</div>
                        <div className="col-span-2"></div>
                        <div className="col-span-6">Öğrenci</div>
                        <div className="col-span-2 text-right">Puan</div>
                    </div>
                    
                    <div className="divide-y divide-gray-100">
                        {students.map((student, index) => (
                            <div key={student.id} className={`grid grid-cols-12 gap-4 p-4 items-center hover:bg-yellow-50 transition ${index < 3 ? 'bg-yellow-50/30' : ''}`}>
                                <div className="col-span-2 flex justify-center">
                                    {getRankIcon(index)}
                                </div>
                                <div className="col-span-2 flex justify-center">
                                    {student.avatar_config?.provider === 'layered' ? (
                                        <LayeredAvatar config={student.avatar_config} size={48} />
                                    ) : (
                                        <div className="w-12 h-12 rounded-full border-2 border-gray-200 bg-gray-100 flex items-center justify-center text-[10px] text-gray-400">
                                            Yok
                                        </div>
                                    )}
                                </div>
                                <div className="col-span-6 font-bold text-gray-700">
                                    {student.name}
                                </div>
                                <div className="col-span-2 text-right font-bold text-yellow-600 text-lg">
                                    {student.total_points}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Leaderboard;
