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
  const socketRef = useRef<Socket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Connect to socket
    socketRef.current = io('http://localhost:3000');

    socketRef.current.on('new_message', (message: any) => {
      // Only append if it belongs to current group
      // But inside this callback state might be stale if not careful, 
      // however setActiveGroup triggers re-render and re-setup of listener if we put it in dependency
      // Actually, better to listen to all and filter, or re-subscribe.
      // Let's use functional update to access current state if needed, or rely on effect cleanup.
      
      // Since we reconstruct the listener on activeGroup change (due to dependency array),
      // we can just check against the activeGroup in the closure scope? 
      // Wait, if activeGroup changes, the effect runs again, so 'activeGroup' variable is fresh.
      
      if (message.group_type === activeGroup) {
        setMessages(prev => [...prev, message]);
      }
    });

    return () => {
      socketRef.current?.disconnect();
    };
  }, [activeGroup]);

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
    } catch (err) {
      console.error(err);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    try {
      await api.post('/messages', { content: inputText, group_type: activeGroup });
      setInputText('');
    } catch (err: any) {
        if (err.response && err.response.data.error === 'Profanity detected') {
            alert('Lütfen nazik bir dil kullanın! (Küfür yasak)');
        } else {
            console.error('Failed to send');
        }
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-100">
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
