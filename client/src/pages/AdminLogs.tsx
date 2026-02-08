import React, { useEffect, useMemo, useState } from 'react';
import api from '../api';
import { useAuth } from '../context/AuthContext';

interface Tx {
  id: number;
  from_user_id: number | null;
  to_user_id: number | null;
  amount: number;
  reason: string;
  type: string;
  created_at: string;
  from_name?: string;
  to_name?: string;
}

const AdminLogs: React.FC = () => {
  const { user } = useAuth();
  const [logs, setLogs] = useState<Tx[]>([]);
  const [type, setType] = useState<string>('');
  const [fromId, setFromId] = useState<string>('');
  const [toId, setToId] = useState<string>('');
  const [start, setStart] = useState<string>('');
  const [end, setEnd] = useState<string>('');
  const [exporting, setExporting] = useState(false);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (type) params.set('type', type);
    if (fromId) params.set('from_user_id', fromId);
    if (toId) params.set('to_user_id', toId);
    if (start) params.set('start', start);
    if (end) params.set('end', end);
    return params.toString();
  }, [type, fromId, toId, start, end]);

  const fetchLogs = async () => {
    const url = '/transactions' + (query ? `?${query}` : '');
    const res = await api.get(url);
    setLogs(res.data);
  };

  useEffect(() => {
    fetchLogs().catch(() => {});
  }, [query]);

  const exportCsv = async () => {
    setExporting(true);
    try {
      const url = '/transactions' + (query ? `?${query}&export=csv` : '?export=csv');
      const res = await api.get(url, { responseType: 'text' });
      const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'transactions.csv';
      link.click();
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">İşlem Logları</h1>
        <div className="text-sm text-gray-500">Giriş: {user?.name}</div>
      </div>
      <div className="bg-white p-4 rounded-xl shadow mb-4">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div>
            <label className="text-xs font-semibold">Tür</label>
            <select value={type} onChange={(e) => setType(e.target.value)} className="w-full p-2 border rounded">
              <option value="">Hepsi</option>
              <option value="academic">Akademik</option>
              <option value="shop">Mağaza</option>
              <option value="bonus">Bonus</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold">Veren ID</label>
            <input value={fromId} onChange={(e) => setFromId(e.target.value)} className="w-full p-2 border rounded" placeholder="örn. 3" />
          </div>
          <div>
            <label className="text-xs font-semibold">Alan ID</label>
            <input value={toId} onChange={(e) => setToId(e.target.value)} className="w-full p-2 border rounded" placeholder="örn. 12" />
          </div>
          <div>
            <label className="text-xs font-semibold">Başlangıç</label>
            <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} className="w-full p-2 border rounded" />
          </div>
          <div>
            <label className="text-xs font-semibold">Bitiş</label>
            <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} className="w-full p-2 border rounded" />
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <button onClick={fetchLogs} className="px-4 py-2 bg-blue-600 text-white rounded">Filtrele</button>
          <button onClick={exportCsv} disabled={exporting} className="px-4 py-2 bg-gray-700 text-white rounded">{exporting ? 'Dışa Aktarılıyor...' : 'CSV Dışa Aktar'}</button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow overflow-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="p-2 text-left">Tarih</th>
              <th className="p-2 text-left">Tür</th>
              <th className="p-2 text-left">Veren</th>
              <th className="p-2 text-left">Alan</th>
              <th className="p-2 text-left">Miktar</th>
              <th className="p-2 text-left">Sebep</th>
            </tr>
          </thead>
          <tbody>
            {logs.map(l => (
              <tr key={l.id} className="border-t">
                <td className="p-2">{new Date(l.created_at).toLocaleString()}</td>
                <td className="p-2">{l.type}</td>
                <td className="p-2">{l.from_name ?? l.from_user_id}</td>
                <td className="p-2">{l.to_name ?? l.to_user_id}</td>
                <td className="p-2">{l.amount}</td>
                <td className="p-2">{l.reason}</td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr><td className="p-4 text-center text-gray-500" colSpan={6}>Kayıt bulunamadı</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminLogs;
