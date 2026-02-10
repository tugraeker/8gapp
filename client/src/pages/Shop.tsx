import React, { useState, useEffect } from 'react';
import api from '../api';
import { ShoppingBag, ArrowLeft, Check, Lock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface Item {
    id: number;
    name: string;
    category: string;
    cost: number;
    asset_id: string;
}

const Shop: React.FC = () => {
    // const { user } = useAuth();
    const navigate = useNavigate();
    const [items, setItems] = useState<Item[]>([]);
    const [inventory, setInventory] = useState<number[]>([]);
    const [spendablePoints, setSpendablePoints] = useState(0);
    const [feedback, setFeedback] = useState({ message: '', type: '' as 'success' | 'error' | '' });

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            const [itemsRes, inventoryRes, userRes] = await Promise.all([
                api.get('/items'),
                api.get('/inventory'),
                api.get('/me')
            ]);
            setItems(itemsRes.data);
            setInventory(inventoryRes.data.map((i: any) => i.item_id));
            setSpendablePoints(userRes.data.points?.spendable_points || 0);
        } catch (err: any) {
            console.error('Veri yüklenemedi:', err.message);
        }
    };

    const handleBuy = async (item: Item) => {
        if (inventory.includes(item.id)) return;
        if (item.category !== 'clothing' && spendablePoints < item.cost) {
            setFeedback({ message: 'Yetersiz puan!', type: 'error' });
            setTimeout(() => setFeedback({ message: '', type: '' }), 3000);
            return;
        }
        try {
            await api.post('/items/buy', { item_id: item.id });
            await fetchData();
            setFeedback({ 
              message: item.category === 'clothing' ? 'Ücretsiz eklendi!' : 'Satın alma başarılı!', 
              type: 'success' 
            });
            setTimeout(() => setFeedback({ message: '', type: '' }), 3000);
        } catch (err: any) {
            setFeedback({ message: err.response?.data?.error || 'Hata oluştu', type: 'error' });
            setTimeout(() => setFeedback({ message: '', type: '' }), 3000);
        }
    };

    return (
        <div className="min-h-screen bg-green-50 p-6 flex flex-col items-center">
            {/* Feedback Toast */}
            {feedback.message && (
                <div className={`fixed top-4 z-50 px-6 py-3 rounded-xl shadow-2xl transition-all animate-bounce ${
                    feedback.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
                }`}>
                    {feedback.message}
                </div>
            )}
            <div className="w-full max-w-4xl">
                <div className="flex justify-between items-center mb-6">
                    <button onClick={() => navigate('/student-dashboard')} className="flex items-center gap-2 text-green-700 font-bold hover:bg-green-100 p-2 rounded-lg transition">
                        <ArrowLeft /> Geri Dön
                    </button>
                    <div className="bg-green-100 px-6 py-2 rounded-full border-2 border-green-500 shadow-sm flex items-center gap-2">
                        <ShoppingBag className="text-green-600" />
                        <span className="font-bold text-green-800">{spendablePoints} Puan</span>
                    </div>
                </div>

                <h1 className="text-3xl font-bold text-center text-green-800 mb-8">Mağaza</h1>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {items.map(item => {
                        const isOwned = inventory.includes(item.id);
                        const isClothing = item.category === 'clothing';
                        const canAfford = isClothing || spendablePoints >= item.cost;

                        return (
                            <div key={item.id} className={`bg-white rounded-xl shadow-md overflow-hidden border-2 ${isOwned ? 'border-green-400 bg-green-50' : 'border-gray-100'}`}>
                                <div className="p-6 text-center">
                                    <div className="w-16 h-16 mx-auto bg-gray-100 rounded-full flex items-center justify-center mb-4 text-2xl">
                                        {isClothing ? '👕' : item.category === 'frame' ? '🖼️' : item.category === 'perk' ? '🎁' : item.category === 'theme' ? '🎨' : '🛍️'}
                                    </div>
                                    <h3 className="font-bold text-lg mb-2">{item.name}</h3>
                                    <p className="text-gray-500 text-sm mb-4">{isClothing ? 'Kıyafet (Ücretsiz)' : item.category === 'frame' ? 'Avatar Çerçevesi' : item.category === 'perk' ? 'Özel Ödül' : 'Tema'}</p>
                                    
                                    {isOwned ? (
                                        <button disabled className="w-full py-2 bg-green-200 text-green-800 rounded-lg font-bold flex items-center justify-center gap-2 cursor-default">
                                            <Check size={18} /> Sahipsin
                                        </button>
                                    ) : (
                                        <button 
                                            onClick={() => handleBuy(item)}
                                            disabled={!canAfford}
                                            className={`w-full py-2 rounded-lg font-bold flex items-center justify-center gap-2 transition ${canAfford ? 'bg-green-500 text-white hover:bg-green-600' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}
                                        >
                                            {isClothing ? (
                                                <>Ücretsiz Ekle</>
                                            ) : canAfford ? (
                                                <>Satın Al ({item.cost})</>
                                            ) : (
                                                <><Lock size={16} /> {item.cost} Puan</>
                                            )}
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export default Shop;
