import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw, Save, X, RotateCcw, RotateCw, Download } from 'lucide-react';

interface Props {
  initialConfig?: any;
  onSave: (config: any) => void;
  onCancel: () => void;
}

const limits = {
  body: 6,
  eyes: 8,
  hair: 65,
  cloths: 69,
};

const baseLocal = (folder: string, i: number, v: number) => `/avatar-maker/${folder}/${i}.png?v=${v}`;

const LayeredAvatarEditor: React.FC<Props> = ({ initialConfig, onSave, onCancel }) => {
  const [layers, setLayers] = useState({
    body: initialConfig?.layers?.body ?? 0,
    eyes: initialConfig?.layers?.eyes ?? 0,
    hair: initialConfig?.layers?.hair ?? 0,
    cloths: initialConfig?.layers?.cloths ?? 0,
  });
  const [seed] = useState(initialConfig?.seed || 'seed');
  const [history, setHistory] = useState<{ layers: typeof layers }[]>([]);
  const [future, setFuture] = useState<{ layers: typeof layers }[]>([]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const genRef = useRef(0);
  const [version, setVersion] = useState(0);
  const isClothAllowed = (_idx: number) => true;

  useEffect(() => {}, []);

  const change = (key: keyof typeof layers, dir: number) => {
    const max = limits[key];
    let val = (layers[key] + dir + max) % max;
    if (key === 'cloths') {
      let attempts = 0;
      while (!isClothAllowed(val) && attempts < max) {
        val = (val + dir + max) % max;
        attempts++;
      }
    }
    setHistory([...history, { layers }]);
    setFuture([]);
    setLayers({ ...layers, [key]: val });
    setVersion(v => v + 1);
  };

  const randomize = () => {
    setHistory([...history, { layers }]);
    setFuture([]);
    const clothCandidates: number[] = Array.from({ length: limits.cloths }, (_, i) => i);
    const nextLayers = {
      body: Math.floor(Math.random() * limits.body),
      eyes: Math.floor(Math.random() * limits.eyes),
      hair: Math.floor(Math.random() * limits.hair),
      cloths: clothCandidates[Math.floor(Math.random() * clothCandidates.length)],
    };
    setLayers(nextLayers);
    setVersion(v => v + 1);
  };

  const undo = () => {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    setFuture([{ layers }, ...future]);
    setHistory(history.slice(0, history.length - 1));
    setLayers(prev.layers);
  };

  const redo = () => {
    if (future.length === 0) return;
    const next = future[0];
    setHistory([...history, { layers }]);
    setFuture(future.slice(1));
    setLayers(next.layers);
  };

  const loadImage = (src: string) => {
    return new Promise<HTMLImageElement>((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => resolve(img);
      img.src = src;
    });
  };

  const updatePreview = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const currentGen = ++genRef.current;
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const bodySrc = baseLocal('body', layers.body, version);
    const clothsSrc = baseLocal('cloths', layers.cloths, version);
    const hairSrc = baseLocal('hair', layers.hair, version);
    const eyesSrc = baseLocal('eyes', layers.eyes, version);
    const [bodyImg, clothsImg, hairImg, eyesImg] = await Promise.all([
      loadImage(bodySrc),
      loadImage(clothsSrc),
      loadImage(hairSrc),
      loadImage(eyesSrc),
    ]);
    if (currentGen !== genRef.current) return;
    if (bodyImg.width) {
      ctx.drawImage(bodyImg, 0, 0, w, h);
    }
    if (clothsImg.width) {
      ctx.drawImage(clothsImg, 0, 0, w, h);
    }
    if (hairImg.width) {
      ctx.drawImage(hairImg, 0, 0, w, h);
    }
    if (eyesImg.width) {
      ctx.drawImage(eyesImg, 0, 0, w, h);
    }
  };

  useEffect(() => {
    updatePreview();
  }, [layers, version]);

  const downloadPng = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = `avatar_${seed}.png`;
    link.click();
  };
  return (
    <div className="bg-white rounded-xl shadow-xl h-full flex flex-col">
      <div className="p-4 border-b flex justify-between items-center">
        <h2 className="font-bold">Avatarını Oluştur</h2>
        <button onClick={onCancel} className="p-2 rounded bg-gray-100 hover:bg-gray-200"><X /></button>
      </div>
      <div className="flex-1 grid grid-cols-1 md:grid-cols-2">
        <div className="p-6 flex items-center justify-center">
          <div className="w-64 h-64 rounded-full border-4 border-blue-200 bg-white shadow-lg relative overflow-hidden">
            <canvas ref={canvasRef} width={256} height={256} className="absolute inset-0 w-full h-full"></canvas>
          </div>
        </div>
        <div className="p-6 space-y-6">
          {(['body','eyes','hair','cloths'] as const).map(k => (
            <div key={k} className="flex items-center gap-3">
              <button onClick={() => change(k, -1)} className="p-2 rounded bg-gray-100 hover:bg-gray-200"><ChevronLeft /></button>
              <div className="flex-1 flex items-center gap-3">
                <img 
                  src={baseLocal(k, layers[k], version)} 
                  alt={k} 
                  className="w-12 h-12 rounded-lg border"
                />
                <span className="font-bold capitalize">{k}</span>
                <span className="ml-auto px-2 py-1 rounded bg-gray-100 text-xs font-bold">ID: {layers[k]}</span>
              </div>
              <button onClick={() => change(k, +1)} className="p-2 rounded bg-gray-100 hover:bg-gray-200"><ChevronRight /></button>
            </div>
          ))}
          <button onClick={randomize} className="w-full py-2 rounded bg-purple-600 text-white font-bold flex items-center justify-center gap-2">
            <RefreshCw /> Rastgele
          </button>
          <div className="flex gap-2">
            <button onClick={undo} className="flex-1 py-2 rounded bg-gray-200 text-gray-800 font-bold flex items-center justify-center gap-2"><RotateCcw /> Geri Al</button>
            <button onClick={redo} className="flex-1 py-2 rounded bg-gray-200 text-gray-800 font-bold flex items-center justify-center gap-2"><RotateCw /> İleri Al</button>
          </div>
          <div className="flex gap-2 mt-2">
            <button onClick={downloadPng} className="flex-1 py-2 rounded bg-slate-600 text-white font-bold flex items-center justify-center gap-2"><Download /> PNG İndir</button>
            <button 
              onClick={() => { onSave({ provider: 'layered', layers }); }}
              className="flex-1 py-2 rounded bg-green-600 text-white font-bold flex items-center justify-center gap-2"
            >
              <Save /> Kaydet
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LayeredAvatarEditor;
