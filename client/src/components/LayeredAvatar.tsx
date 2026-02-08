import React, { useEffect, useRef } from 'react';

interface LayeredAvatarProps {
  config: {
    provider: 'layered';
    layers: { body: number; eyes: number; hair: number; cloths: number };
    seed?: string;
    colors?: { hair: string; eyes: string; skin: string; cloths: string };
  };
  size?: number;
  className?: string;
  fallbackSeed?: string;
}

const getLocalAssetPath = (folder: string, index: number, v: number) => `/avatar-maker/${folder}/${index}.png?v=${v}`;

const LayeredAvatar: React.FC<LayeredAvatarProps> = ({ config, size = 128, className, fallbackSeed }) => {
  if (!config || !config.layers) {
    const seed = fallbackSeed || 'default-avatar-seed';
    return (
      <img
        src={`https://api.multiavatar.com/${encodeURIComponent(seed)}.svg`}
        alt="fallback avatar"
        className={className}
        style={{ width: size, height: size, borderRadius: '9999px', overflow: 'hidden' }}
      />
    );
  }
  const { layers, colors } = config;
  const genRef = useRef(0);
  const style: React.CSSProperties = {
    width: size,
    height: size,
    position: 'relative',
    overflow: 'hidden',
    borderRadius: '9999px',
  };
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const currentGen = ++genRef.current;
    const draw = (folder: string, index: number) =>
      new Promise<HTMLImageElement>((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => resolve(img);
        img.src = getLocalAssetPath(folder, index, 0);
      });
    const tint = (_hex?: string) => {};
    (async () => {
      const w = canvas.width, h = canvas.height;
      const [bodyImg, clothsImg, hairImg, eyesImg] = await Promise.all([
        draw('body', layers.body),
        draw('cloths', layers.cloths),
        draw('hair', layers.hair),
        draw('eyes', layers.eyes),
      ]);
      if (currentGen !== genRef.current) return;
      if (bodyImg.width) {
        ctx.drawImage(bodyImg, 0, 0, w, h);
        tint(colors?.skin);
      }
      if (clothsImg.width) {
        ctx.drawImage(clothsImg, 0, 0, w, h);
        tint(colors?.cloths);
      }
      if (hairImg.width) {
        ctx.drawImage(hairImg, 0, 0, w, h);
        tint(colors?.hair);
      }
      if (eyesImg.width) {
        ctx.drawImage(eyesImg, 0, 0, w, h);
        tint(colors?.eyes);
      }
    })();
  }, [layers, colors]);
  return <canvas ref={canvasRef} width={256} height={256} style={style} className={className} />;
};

export default LayeredAvatar;
