import React, { useEffect, useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../api';
import { io, Socket } from 'socket.io-client';
import { Send, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const Chat: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<any[]>([]);
  const [inputText, setInputText] = useState('');
  const [activeGroup, setActiveGroup] = useState<'class' | 'students'>('class');
  const [feedback, setFeedback] = useState({ message: '', type: '' as 'success' | 'error' | '' });
  const socketRef = useRef<Socket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Connect to socket
    socketRef.current = io(((import.meta as any).env?.VITE_BACKEND_URL) || 'http://localhost:3000');

    socketRef.current.on('new_message', (message: any) => {
      // Use functional update to check against the LATEST activeGroup
      setActiveGroup(currentGroup => {
        if (message.group_type === currentGroup) {
          setMessages(prev => [...prev, message]);
        }
        return currentGroup;
      });
    });

    return () => {
      socketRef.current?.disconnect();
    };
  }, []); // Only once

  useEffect(() => {
    fetchMessages();
  }, [activeGroup]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const fetchMessages = async () => {
    try {
      const res = await api.get(`/messages?group_type=${activeGroup}`);
      setMessages(res.data);
    } catch (err: any) {
      console.error('Mesajlar yüklenemedi:', err.message);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inputText.trim();
    if (!trimmed) return;

    try {
      await api.post('/messages', { content: trimmed, group_type: activeGroup });
      setInputText('');
      setFeedback({ message: '', type: '' });
    } catch (err: any) {
        if (err.response && (err.response.data.error === 'Profanity detected' || err.response.data.error?.includes('küfür'))) {
            setFeedback({ message: 'Lütfen nazik bir dil kullanın! (Küfür yasak)', type: 'error' });
        } else {
            setFeedback({ message: 'Mesaj gönderilemedi.', type: 'error' });
            console.error('Failed to send');
        }
        setTimeout(() => setFeedback({ message: '', type: '' }), 3000);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-100">
      {/* Feedback Toast */}
      {feedback.message && (
        <div className={`fixed top-16 left-1/2 -translate-x-1/2 z-50 px-6 py-2 rounded-lg shadow-lg text-sm font-bold ${
          feedback.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
        }`}>
          {feedback.message}
        </div>
      )}
      <div className="bg-white p-4 shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-4">
             <button onClick={() => navigate('/')} className="text-gray-600 hover:text-gray-900">
                <ArrowLeft />
             </button>
             <h1 className="font-bold text-lg">Sohbet</h1>
        </div>
        
        {user?.role === 'student' && (
            <div className="flex bg-gray-200 rounded-lg p-1">
            <button 
                onClick={() => setActiveGroup('class')}
                className={`px-4 py-1 rounded-md text-sm font-medium transition ${activeGroup === 'class' ? 'bg-white shadow text-blue-600' : 'text-gray-600'}`}
            >
                Sınıf (Genel)
            </button>
            <button 
                onClick={() => setActiveGroup('students')}
                className={`px-4 py-1 rounded-md text-sm font-medium transition ${activeGroup === 'students' ? 'bg-white shadow text-purple-600' : 'text-gray-600'}`}
            >
                Öğrenciler
            </button>
            </div>
        )}
         {user?.role === 'teacher' && (
             <div className="text-sm text-gray-500">Öğretmen Görünümü (Sınıf Grubu)</div>
         )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, index) => {
            const isMe = msg.sender_id === user?.id;
            return (
                <div key={index} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-xs md:max-w-md p-3 rounded-lg ${isMe ? 'bg-blue-500 text-white rounded-br-none' : 'bg-white text-gray-800 rounded-bl-none shadow'}`}>
                        {!isMe && <div className="text-xs font-bold mb-1 opacity-70">{msg.sender_name}</div>}
                        <div>{msg.content}</div>
                    </div>
                </div>
            );
        })}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSend} className="p-4 bg-white border-t flex gap-2">
        <input 
          type="text" 
          className="flex-1 p-2 border rounded-full focus:outline-none focus:ring-2 focus:ring-blue-400 px-4"
          placeholder="Mesaj yaz..."
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
        />
        <button type="submit" className="bg-blue-600 text-white p-2 rounded-full hover:bg-blue-700">
            <Send size={20} />
        </button>
      </form>
    </div>
  );
};

export default Chat;
