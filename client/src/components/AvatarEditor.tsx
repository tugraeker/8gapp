import React, { useState, useEffect } from 'react';
import { RefreshCw, Save, X, Grid } from 'lucide-react';
import api from '../api';

interface AvatarEditorProps {
  initialConfig: any;
  onSave: (config: any) => void;
  onCancel: () => void;
}

const PROVIDERS = [
    { id: 'multiavatar', name: 'Multiavatar', free: true },
    { id: 'robohash', name: 'Robohash', free: true }
];

const AvatarEditor: React.FC<AvatarEditorProps> = ({ initialConfig, onSave, onCancel }) => {
  const [provider, setProvider] = useState(initialConfig?.provider || 'multiavatar');
  const [options, setOptions] = useState<any>({}); // deprecated for new providers
  const [seed, setSeed] = useState(initialConfig?.seed || initialConfig?.username || 'seed');
  const [activeTab] = useState<'provider' | 'head' | 'face' | 'body' | 'accessories'>('provider');
  const [currentStyle] = useState('multiavatar');
  // const [inventory, setInventory] = useState<string[]>([]);

  useEffect(() => {
      // Fetch inventory to see unlocked styles
      api.get('/inventory').then(_res => {
          // const ownedAssets = res.data.map((i: any) => i.asset_id);
          // setInventory(ownedAssets);
      }).catch(console.error);
  }, []);

  // Define available options (keep existing ones for avataaars)
  const tops = [
    'longHairBigHair', 'longHairBob', 'longHairBun', 'longHairCurly', 'longHairCurvy', 
    'longHairDreads', 'longHairFrida', 'longHairFro', 'longHairFroBand', 'longHairNotTooLong', 
    'longHairShavedSides', 'longHairMiaWallace', 'longHairStraight', 'longHairStraight2', 
    'longHairStraightStrand', 'shortHairDreads01', 'shortHairDreads02', 'shortHairFrizzle', 
    'shortHairShaggyMullet', 'shortHairShortCurly', 'shortHairShortFlat', 'shortHairShortRound', 
    'shortHairShortWaved', 'shortHairSides', 'shortHairTheCaesar', 'shortHairTheCaesarSidePart',
    'hat', 'hijab', 'turban', 'winterHat1', 'winterHat2', 'winterHat3', 'winterHat4'
  ];

  const accessories = ['eyepatch', 'kurt', 'prescription01', 'prescription02', 'round', 'sunglasses', 'wayfarers'];
  const clothing = ['blazerAndShirt', 'blazerAndSweater', 'collarAndSweater', 'graphicShirt', 'hoodie', 'overall', 'shirtCrewNeck', 'shirtScoopNeck', 'shirtVNeck'];
  const eyes = ['closed', 'cry', 'default', 'eyeRoll', 'happy', 'hearts', 'side', 'squint', 'surprised', 'wink', 'winkWacky', 'xDizzy'];
  const eyebrows = ['angry', 'angryNatural', 'default', 'defaultNatural', 'flatNatural', 'frownNatural', 'raisedExcited', 'raisedExcitedNatural', 'sadConcerned', 'sadConcernedNatural', 'unibrowNatural', 'upDown', 'upDownNatural'];
  const mouths = ['concerned', 'default', 'disbelief', 'eating', 'grimace', 'sad', 'screamOpen', 'serious', 'smile', 'tongue', 'twinkle', 'vomit'];
  const facialHair = ['beardLight', 'beardMajestic', 'beardMedium', 'moustacheFancy', 'moustacheMagnum'];
  
  const skinColors = ['614335', 'ae5d29', 'd08b5b', 'edb98a', 'ffdbb4', 'f8d25c', 'fd9841'];
  const hairColors = ['2c1b18', '4a312c', '724133', 'a55728', 'b58143', 'c93305', 'd6b370', 'e8e1e1', 'ecdcbf', 'f59797'];
  const clothingColors = ['3c4f5c', '65c9ff', '262e33', '5199e4', '25557c', '929598', 'a7ffc4', 'b1e2ff', 'e6e6e6', 'ff5c5c', 'ff488e', 'ffafb9', 'ffffb1', 'ffffff'];

  const updateOption = (key: string, value: string) => {
    setOptions({ ...options, [key]: [value] });
  };

  const getAvatarUrl = () => {
    if (provider === 'multiavatar') {
        return `https://api.multiavatar.com/${encodeURIComponent(seed)}.svg`;
    }
    if (provider === 'robohash') {
        return `https://robohash.org/${encodeURIComponent(seed)}.png?size=200x200`;
    }
    return `https://api.multiavatar.com/${encodeURIComponent(seed)}.svg`;
  };

  const ColorPicker = ({ colors, selected, onChange }: { colors: string[], selected: string, onChange: (c: string) => void }) => (
    <div className="flex flex-wrap gap-2 mt-2">
      {colors.map(c => (
        <button
          key={c}
          onClick={() => onChange(c)}
          className={`w-8 h-8 rounded-full border-2 ${selected === c ? 'border-blue-600 scale-110' : 'border-transparent hover:border-gray-300'}`}
          style={{ backgroundColor: `#${c}` }}
        />
      ))}
    </div>
  );

  return (
    <div className="flex flex-col h-full bg-white rounded-xl overflow-hidden">
      {/* Preview Section */}
      <div className="bg-blue-50 p-6 flex justify-center items-center border-b relative">
        <div className="w-48 h-48 bg-white rounded-full border-4 border-blue-200 shadow-lg overflow-hidden">
          <img src={getAvatarUrl()} alt="Avatar Preview" className="w-full h-full" />
        </div>
        <button 
          onClick={() => {
              setOptions({});
              setSeed(Math.random().toString(36).substring(7));
          }}
          className="absolute top-4 right-4 p-2 bg-white rounded-full shadow hover:bg-gray-100 text-gray-500"
          title="Rastgele / Sıfırla"
        >
          <RefreshCw size={20} />
        </button>
      </div>

      {/* Controls Section */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Provider selector */}
        <div className="flex border-b bg-gray-50 overflow-x-auto">
          <button className={`flex-1 min-w-[80px] py-3 flex justify-center items-center gap-2 border-b-2 border-blue-600 text-blue-600 bg-white`}>
            <Grid size={20} /> Altyapı
          </button>
        </div>

        {/* Options Content */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-2 gap-4 p-2">
              {PROVIDERS.map(p => (
                <button 
                  key={p.id}
                  onClick={() => setProvider(p.id)}
                  className={`p-4 rounded-xl border-2 flex flex-col items-center gap-2 transition ${
                    provider === p.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-blue-300'
                  }`}
                >
                  <img 
                    src={p.id === 'multiavatar' ? `https://api.multiavatar.com/preview.svg` : `https://robohash.org/preview.png?size=100x100`} 
                    className="w-16 h-16 rounded-full bg-white" 
                    alt={p.name} 
                  />
                  <span className="font-bold text-sm text-gray-700">{p.name}</span>
                </button>
              ))}
          </div>

          {activeTab === 'head' && currentStyle === 'avataaars' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-bold text-gray-700 mb-2">Saç / Şapka Stili</h3>
                <div className="grid grid-cols-4 gap-2">
                  {tops.map(t => (
                    <button 
                      key={t} 
                      onClick={() => updateOption('top', t)}
                      className={`p-2 rounded-lg text-xs border ${options.top?.[0] === t ? 'bg-blue-100 border-blue-500' : 'bg-gray-50 hover:bg-gray-100'}`}
                    >
                      {t.replace(/([A-Z])/g, ' $1').trim()}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-700 mb-2">Saç Rengi</h3>
                <ColorPicker 
                  colors={hairColors} 
                  selected={options.hairColor?.[0]} 
                  onChange={(c) => updateOption('hairColor', c)} 
                />
              </div>
            </div>
          )}

          {activeTab === 'face' && currentStyle === 'avataaars' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-bold text-gray-700 mb-2">Gözler</h3>
                <div className="grid grid-cols-4 gap-2">
                  {eyes.map(t => (
                    <button key={t} onClick={() => updateOption('eyes', t)} className={`p-2 rounded-lg text-xs border ${options.eyes?.[0] === t ? 'bg-blue-100 border-blue-500' : 'bg-gray-50 hover:bg-gray-100'}`}>{t}</button>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-700 mb-2">Kaşlar</h3>
                <div className="grid grid-cols-4 gap-2">
                  {eyebrows.map(t => (
                    <button key={t} onClick={() => updateOption('eyebrows', t)} className={`p-2 rounded-lg text-xs border ${options.eyebrows?.[0] === t ? 'bg-blue-100 border-blue-500' : 'bg-gray-50 hover:bg-gray-100'}`}>{t}</button>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-700 mb-2">Ağız</h3>
                <div className="grid grid-cols-4 gap-2">
                  {mouths.map(t => (
                    <button key={t} onClick={() => updateOption('mouth', t)} className={`p-2 rounded-lg text-xs border ${options.mouth?.[0] === t ? 'bg-blue-100 border-blue-500' : 'bg-gray-50 hover:bg-gray-100'}`}>{t}</button>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-700 mb-2">Sakal / Bıyık</h3>
                <div className="grid grid-cols-4 gap-2">
                    <button onClick={() => updateOption('facialHair', '')} className="p-2 rounded-lg text-xs border bg-gray-50 hover:bg-gray-100">Yok</button>
                  {facialHair.map(t => (
                    <button key={t} onClick={() => updateOption('facialHair', t)} className={`p-2 rounded-lg text-xs border ${options.facialHair?.[0] === t ? 'bg-blue-100 border-blue-500' : 'bg-gray-50 hover:bg-gray-100'}`}>{t}</button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'body' && currentStyle === 'avataaars' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-bold text-gray-700 mb-2">Kıyafet</h3>
                <div className="grid grid-cols-3 gap-2">
                  {clothing.map(t => (
                    <button key={t} onClick={() => updateOption('clothing', t)} className={`p-2 rounded-lg text-xs border ${options.clothing?.[0] === t ? 'bg-blue-100 border-blue-500' : 'bg-gray-50 hover:bg-gray-100'}`}>{t}</button>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-700 mb-2">Kıyafet Rengi</h3>
                <ColorPicker 
                  colors={clothingColors} 
                  selected={options.clothesColor?.[0]} 
                  onChange={(c) => updateOption('clothesColor', c)} 
                />
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-700 mb-2">Ten Rengi</h3>
                <ColorPicker 
                  colors={skinColors} 
                  selected={options.skinColor?.[0]} 
                  onChange={(c) => updateOption('skinColor', c)} 
                />
              </div>
            </div>
          )}

          {activeTab === 'accessories' && currentStyle === 'avataaars' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-bold text-gray-700 mb-2">Gözlük / Aksesuar</h3>
                <div className="grid grid-cols-3 gap-2">
                    <button onClick={() => updateOption('accessories', '')} className="p-2 rounded-lg text-xs border bg-gray-50 hover:bg-gray-100">Yok</button>
                  {accessories.map(t => (
                    <button key={t} onClick={() => updateOption('accessories', t)} className={`p-2 rounded-lg text-xs border ${options.accessories?.[0] === t ? 'bg-blue-100 border-blue-500' : 'bg-gray-50 hover:bg-gray-100'}`}>{t}</button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t bg-gray-50 flex gap-3">
          <button onClick={onCancel} className="flex-1 py-3 rounded-xl bg-gray-200 text-gray-700 font-bold hover:bg-gray-300 transition flex items-center justify-center gap-2">
            <X size={20} /> İptal
          </button>
          <button onClick={() => onSave({ provider, seed })} className="flex-1 py-3 rounded-xl bg-green-600 text-white font-bold hover:bg-green-700 transition flex items-center justify-center gap-2">
            <Save size={20} /> Kaydet
          </button>
        </div>
      </div>
    </div>
  );
};

export default AvatarEditor;