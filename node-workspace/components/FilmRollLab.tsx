import React, { useEffect, useRef, useState } from 'react';
import { PhysicsParams, CanisterBrand, CanisterStyle } from './film-roll-lab/types';
import { Canister } from './film-roll-lab/components/Canister';
import { Filmstrip } from './film-roll-lab/components/Filmstrip';
import { 
  DevelopedRollRibbon, 
  DevelopedRollWorkbench, 
  INITIAL_BLANK_FRAMES, 
  SAMPLE_PHOTO_STOCK, 
  PhotoFrame, 
  EmulsionType,
  RibbonParams,
  RIBBON_PRESETS
} from './film-roll-lab/components/DevelopedRoll';
import { SlideMount } from './film-roll-lab/components/SlideMount';
import { PhysicsControls } from './film-roll-lab/components/PhysicsControls';
import { AlertCircle, X } from 'lucide-react';

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

const CANISTER_BRANDS: CanisterStyle[] = [
  {
    id: 'retro-yellow',
    name: 'Kodak Gold 200 Style',
    primaryColor: '#facc15', // yellow-400
    accentColor: '#ef4444', // red-500
    backgroundColor: '#eab308', // yellow-500
    textColor: '#18181b', // dark gray
    brandText: 'GOLD 200',
    iso: 200,
    exp: 36,
  },
  {
    id: 'fuji-green',
    name: 'Fujifilm Superia 400',
    primaryColor: '#10b981', // green-500
    accentColor: '#f43f5e', // rose-500
    backgroundColor: '#047857', // green-700
    textColor: '#ffffff',
    brandText: 'SUPERIA',
    iso: 400,
    exp: 24,
  },
  {
    id: 'ilford-black',
    name: 'Ilford HP5 Plus Black',
    primaryColor: '#3f3f46', // gray-600
    accentColor: '#e4e4e7', // gray-200
    backgroundColor: '#09090b', // gray-950
    textColor: '#ffffff',
    brandText: 'HP5 PLUS',
    iso: 400,
    exp: 36,
  },
  {
    id: 'agfa-red',
    name: 'AgfaPhoto Vista 400',
    primaryColor: '#f43f5e', // rose-500
    accentColor: '#3b82f6', // blue-500
    backgroundColor: '#be123c', // rose-700
    textColor: '#ffffff',
    brandText: 'VISTA',
    iso: 400,
    exp: 24,
  },
];

const DEFAULT_PHYSICS: PhysicsParams = {
  stiffness: 140,
  damping: 18,
  mass: 1.1,
  rotationMultiplier: 2.5,
  filmstripHeight: 114,
  frameWidth: 156,
  closedWidth: 50,
  openWidth: 500,
};

export const FilmRollLab: React.FC<Props> = ({ isOpen: labOpen, onClose }) => {
  // Unit 1: Tactile Cylinder States
  const [isOpen, setIsOpen] = useState(false);
  const [selectedBrand, setSelectedBrand] = useState<CanisterBrand>('retro-yellow');
  const [physics, setPhysics] = useState<PhysicsParams>(DEFAULT_PHYSICS);
  const [activeUnit, setActiveUnit] = useState<1 | 2>(1);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  // Unit 2: Developed Roll States
  const [frames, setFrames] = useState<PhotoFrame[]>(INITIAL_BLANK_FRAMES);
  const [emulsion, setEmulsion] = useState<EmulsionType>('vintage-c41');
  const [ribbonParams, setRibbonParams] = useState<RibbonParams>(RIBBON_PRESETS['vintage-c41']);
  const [dragOverFrameId, setDragOverFrameId] = useState<number | null>(null);

  const handleSetEmulsion = (newEmulsion: EmulsionType) => {
    setEmulsion(newEmulsion);
    setRibbonParams(RIBBON_PRESETS[newEmulsion]);
  };

  const fileInputRefs = useRef<{ [key: number]: HTMLInputElement | null }>({});

  const activeStyle = CANISTER_BRANDS.find((b) => b.id === selectedBrand) || CANISTER_BRANDS[0];

  useEffect(() => {
    if (!labOpen) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [labOpen, onClose]);

  if (!labOpen) return null;

  const handleToggleCanister = () => {
    setIsOpen(!isOpen);
  };

  const handleResetPhysics = () => {
    setPhysics(DEFAULT_PHYSICS);
  };

  // Unit 2 File Upload & Management Logic
  const handleFileChange = (frameId: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files[0]) {
      processFile(frameId, files[0]);
    }
  };

  const processFile = (frameId: number, file: File) => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        setFrames(prev => prev.map(f => {
          if (f.id === frameId) {
            return {
              ...f,
              url: event.target!.result as string,
              title: file.name.substring(0, 16).toUpperCase().replace(/\.[^/.]+$/, "") || 'EXPOSURE',
            };
          }
          return f;
        }));
      }
    };
    reader.readAsDataURL(file);
  };

  const triggerUpload = (frameId: number) => {
    fileInputRefs.current[frameId]?.click();
  };

  const removePhoto = (frameId: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setFrames(prev => prev.map(f => {
      if (f.id === frameId) {
        return { ...f, url: '' };
      }
      return f;
    }));
  };

  const clearAll = () => {
    setFrames(INITIAL_BLANK_FRAMES);
  };

  const loadPresetSamples = () => {
    setFrames(prev => prev.map((f, idx) => ({
      ...f,
      url: SAMPLE_PHOTO_STOCK[idx] || '',
    })));
  };

  // Drag and Drop Logic
  const handleDragOver = (frameId: number, e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverFrameId(frameId);
  };

  const handleDragLeave = () => {
    setDragOverFrameId(null);
  };

  const handleDrop = (frameId: number, e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverFrameId(null);
    const files = e.dataTransfer.files;
    if (files && files[0]) {
      processFile(frameId, files[0]);
    }
  };

  return (
    <div className={`film-roll-prototype pointer-events-auto fixed inset-0 z-[85] min-h-screen overflow-auto flex flex-col font-sans transition-all duration-300 overflow-x-hidden ${
      theme === 'light' 
        ? 'bg-[#F2F1EC] text-zinc-800 selection:bg-amber-100 selection:text-amber-900' 
        : 'bg-[#0A0A0B] text-zinc-100 selection:bg-[#FFB800] selection:text-zinc-950'
    }`}>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close visual lab"
        className={`fixed right-4 top-4 z-[90] flex h-9 w-9 items-center justify-center rounded-full border shadow-2xl backdrop-blur transition active:scale-95 ${
          theme === 'light'
            ? 'border-zinc-300 bg-white/90 text-zinc-700 hover:border-amber-500 hover:text-amber-700'
            : 'border-[#333] bg-[#111112]/90 text-stone-300 hover:border-[#FFB800] hover:text-[#FFB800]'
        }`}
      >
        <X className="h-4 w-4" />
      </button>
      
      {/* Immersive Background Lighting Glow */}
      <div className={`absolute top-0 left-1/4 w-[500px] h-[500px] rounded-full blur-[140px] pointer-events-none transition-opacity duration-500 ${
        theme === 'light' ? 'bg-amber-400/5' : 'bg-[#FFB800]/5'
      }`} />
      <div className={`absolute bottom-0 right-1/4 w-[600px] h-[600px] rounded-full blur-[160px] pointer-events-none transition-opacity duration-500 ${
        theme === 'light' ? 'bg-amber-300/5' : 'bg-amber-500/5'
      }`} />

      {/* Main Container */}
      <div className="max-w-7xl mx-auto w-full px-4 md:px-8 py-10 flex flex-col gap-8 relative z-10 flex-grow">
        
        {/* Editorial UI Header */}
        <header id="main-header" className={`flex flex-col md:flex-row md:items-end justify-between border-b pb-6 gap-6 relative transition-colors duration-300 ${
          theme === 'light' ? 'border-zinc-300/80' : 'border-[#222]'
        }`}>
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <span className={`border px-3 py-1 rounded-full text-xs font-mono tracking-widest font-semibold uppercase transition-colors duration-300 ${
                theme === 'light'
                  ? 'bg-white border-zinc-300 text-zinc-700 shadow-sm'
                  : 'bg-[#1A1A1A] border-[#333] text-[#FFB800]'
              }`}>
                胶片实验室 / FILM LAB
              </span>
              <span className="text-[10px] font-mono font-bold bg-amber-600/20 text-[#FFB800] border border-amber-500/30 px-2 py-0.5 rounded uppercase tracking-wider select-none animate-pulse">
                Project 01
              </span>
              
              {/* Theme light/dark safe-light switch */}
              <button
                onClick={() => setTheme(prev => prev === 'light' ? 'dark' : 'light')}
                className={`ml-2 flex items-center gap-1.5 px-3 py-1 rounded-lg border text-[10px] font-mono tracking-wider transition-all duration-200 uppercase font-bold cursor-pointer ${
                  theme === 'light'
                    ? 'bg-white hover:bg-zinc-100 text-zinc-700 border-zinc-200 shadow-sm'
                    : 'bg-[#111112] hover:bg-zinc-800 text-[#FFB800] border-zinc-800'
                }`}
                title="切换看片台背底环度 (Light/Dark Mode)"
              >
                {theme === 'light' ? '☀️ Alabaster Desk / 白光看片台' : '🌙 Safelight Darkroom / 三级红黑暗房'}
              </button>
            </div>
            <h1 className={`text-4xl md:text-6xl font-light tracking-[-0.04em] uppercase mt-2 transition-colors duration-350 ${
              theme === 'light' ? 'text-zinc-900 font-semibold' : 'text-stone-100'
            }`}>
              PHYSICAL SILENT COIL
            </h1>
            <p className={`text-xs font-sans transition-colors duration-300 ${theme === 'light' ? 'text-zinc-600' : 'text-[#6B7280]'}`}>
              探索物理阻尼振动、偏置拉力重塑与无声醋酸橙红乳剂在拟物化微观构造下的美学实践。
            </p>
          </div>

          <div className="flex items-end gap-6 text-right">
            <div className="hidden sm:flex flex-col">
              <span className={`text-[10px] font-mono tracking-widest ${theme === 'light' ? 'text-zinc-500' : 'text-[#6B7280]'}`}>PROJECT CODE</span>
              <span className={`font-bold font-mono text-xs uppercase ${theme === 'light' ? 'text-zinc-800' : 'text-zinc-300'}`}>LAB_35_COIL</span>
            </div>
            <div className={`h-8 w-[1px] hidden sm:block ${theme === 'light' ? 'bg-zinc-300' : 'bg-[#222]'}`}></div>
            <div className="flex flex-col justify-end">
              <span className={`text-[10px] font-mono tracking-widest ${theme === 'light' ? 'text-zinc-500' : 'text-[#6B7280]'}`}>EMULSION LATITUDE</span>
              <span className="text-xl font-bold font-mono text-[#FFB800] leading-none mt-1">
                {activeUnit === 1 ? `ISO ${activeStyle.iso}` : 'ISO 100'}
              </span>
            </div>
          </div>
        </header>

        {/* Lab Unit Segment Selector / 单元控制切换 */}
        <div className={`flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between border p-2 rounded-xl transition-all duration-300 ${
          theme === 'light' ? 'bg-[#ECEAE4] border-zinc-300/80 shadow-sm' : 'bg-[#111112]/90 border-[#222]'
        }`}>
          <div className="flex items-center gap-3 pl-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[#FFB800] animate-pulse" />
            <span className={`text-[11px] font-mono tracking-widest uppercase ${theme === 'light' ? 'text-zinc-700' : 'text-[#6B7280]'}`}>
              SELECT MODULE WORKSPACE / 切换暗房实验单元
            </span>
          </div>
          <div className={`flex gap-1.5 p-1 rounded-lg border transition-colors duration-200 ${
            theme === 'light' ? 'bg-[#DFDDD7] border-zinc-300' : 'bg-[#0A0A0B] border-[#222]'
          }`}>
            <button
              onClick={() => setActiveUnit(1)}
              className={`px-4 py-1.5 rounded-md text-[11px] font-mono tracking-wider transition-all duration-200 uppercase flex items-center gap-2 ${
                activeUnit === 1
                  ? 'bg-[#FFB800] text-[#0A0A0B] font-bold shadow-md'
                  : theme === 'light'
                    ? 'text-zinc-700 hover:text-zinc-950 hover:bg-[#D4D1CA]'
                    : 'text-stone-400 hover:text-zinc-100 hover:bg-zinc-800/40'
              }`}
            >
              <span>U01</span>
              <span>•</span>
              <span>Tactile Cylinder (暗盒拉曳)</span>
            </button>
            <button
              onClick={() => setActiveUnit(2)}
              className={`px-4 py-1.5 rounded-md text-[11px] font-mono tracking-wider transition-all duration-200 uppercase flex items-center gap-2 ${
                activeUnit === 2
                  ? 'bg-[#FFB800] text-[#0A0A0B] font-bold shadow-md'
                  : theme === 'light'
                    ? 'text-zinc-700 hover:text-zinc-950 hover:bg-[#D4D1CA]'
                    : 'text-stone-400 hover:text-zinc-100 hover:bg-zinc-800/40'
              }`}
            >
              <span>U02</span>
              <span>•</span>
              <span>Slide Mount (幻灯胶片匣)</span>
            </button>
          </div>
        </div>

        {/* ======================================================= */}
        {/* MAIN MODULE STAGE / WORKSPACE AREA                      */}
        {/* ======================================================= */}
            <section 
              id="laboratory-stage" 
              className={`w-full rounded-xl px-4 py-8 shadow-2xl relative overflow-visible flex flex-col justify-center items-center min-h-[160px] transition-all duration-300 border ${
                theme === 'light'
                  ? 'bg-white border-zinc-200/80 shadow-[0_12px_40px_rgba(0,0,0,0.04)]'
                  : 'bg-[#111112] border-[#222]'
              }`}
            >
              {activeUnit === 1 ? (
                /* Unit 1 Visualizer: Canister + Filmstrip Tape sliding */
                <div className="flex flex-row items-center justify-center select-none relative overflow-visible w-full max-w-4xl mx-auto">
                  {/* Skeuomorphic 3D Canister (Left) */}
                  <div className="flex-shrink-0 z-30 relative mr-[-14px]">
                    <Canister
                      styleConfig={activeStyle}
                      isOpen={isOpen}
                      onToggle={handleToggleCanister}
                      physics={physics}
                    />
                  </div>

                  {/* Elastic Sliding Filmstrip Tape (Right) */}
                  <div className="flex-grow relative overflow-visible z-20">
                    <Filmstrip
                      isOpen={isOpen}
                      physics={physics}
                      onToggleCanister={handleToggleCanister}
                    />
                  </div>
                </div>
              ) : (
                /* Unit 2 visualizer: Slide Mount Holder step */
                <div className="w-full flex justify-center items-center overflow-visible">
                  <SlideMount
                    frames={frames}
                    emulsion={emulsion}
                    ribbonParams={ribbonParams}
                  />
                </div>
              )}

              {/* Interactive hints */}
              <div className="mt-4 text-[10px] text-[#6B7280] font-mono flex items-center justify-center gap-1.5 pointer-events-none uppercase tracking-wider select-none text-center">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#FFB800] animate-pulse"></span>
                <span>
                  {activeUnit === 1 
                    ? 'Click canister to pull out or rewind the film ribbon with dynamic elastic spring mechanics' 
                    : 'Load exposures, adjust emulsion chemistries, and preview positive slides inside the mounted cardboard frames'}
                </span>
              </div>
            </section>

            {/* ======================================================= */}
            {/* LOWER SECTION: WORKBENCH (LEFT) & TECH SPECS (RIGHT)    */}
            {/* ======================================================= */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 items-start">
              
              {/* Main Laboratory Workbench (Col Span 3) */}
              <div className="lg:col-span-3">
                {activeUnit === 1 ? (
                  <section id="laboratory-dashboard">
                    <PhysicsControls
                      physics={physics}
                      setPhysics={setPhysics}
                      selectedBrand={selectedBrand}
                      onBrandChange={setSelectedBrand}
                      brands={CANISTER_BRANDS}
                      onResetPhysics={handleResetPhysics}
                    />
                  </section>
                ) : (
                  <section id="developed-workbench-dashboard">
                    <DevelopedRollWorkbench
                      frames={frames}
                      emulsion={emulsion}
                      setEmulsion={handleSetEmulsion}
                      loadPresetSamples={loadPresetSamples}
                      clearAll={clearAll}
                      triggerUpload={triggerUpload}
                      removePhoto={removePhoto}
                      ribbonParams={ribbonParams}
                      onChangeRibbonParams={setRibbonParams}
                    />
                  </section>
                )}
              </div>

              {/* Technical Specs Sidebar Display (Col Span 1) */}
              <aside className={`border rounded-xl p-5 text-xs font-mono tracking-wider flex flex-col gap-4 transition-all duration-300 ${
                theme === 'light'
                  ? 'bg-white border-zinc-200 text-zinc-650 shadow-[0_8px_30px_rgba(0,0,0,0.02)]'
                  : 'bg-[#111112] border-[#222] text-stone-400'
              }`}>
                <div className="text-[11px] font-bold text-[#FFB800] tracking-widest uppercase border-b pb-2" style={{ borderColor: theme === 'light' ? '#E4E4E7' : '#222' }}>
                  EMULATION META / 技术规格
                </div>
                <div className="flex justify-between items-center py-1 border-b" style={{ borderColor: theme === 'light' ? 'rgba(228,228,231,0.5)' : 'rgba(34,34,34,0.5)' }}>
                  <span className={theme === 'light' ? 'text-zinc-500' : 'text-[#6B7280]'}>MEDIA BASE</span>
                  <span className={theme === 'light' ? 'text-zinc-800 font-bold' : 'text-zinc-200'}>
                    {activeUnit === 1 ? 'ACETATE 35MM' : 'CARDBOARD SLIDE'}
                  </span>
                </div>
                <div className="flex justify-between items-center py-1 border-b" style={{ borderColor: theme === 'light' ? 'rgba(228,228,231,0.5)' : 'rgba(34,34,34,0.5)' }}>
                  <span className={theme === 'light' ? 'text-zinc-500' : 'text-[#6B7280]'}>DEVELOPING</span>
                  <span className={theme === 'light' ? 'text-zinc-800 font-bold' : 'text-zinc-200'}>
                    {activeUnit === 1 ? 'RAW EXP TAPE' : 'POSITIVE SEPARATION'}
                  </span>
                </div>
                <div className="flex justify-between items-center py-1 border-b" style={{ borderColor: theme === 'light' ? 'rgba(228,228,231,0.5)' : 'rgba(34,34,34,0.5)' }}>
                  <span className={theme === 'light' ? 'text-zinc-500' : 'text-[#6B7280]'}>RECOIL ENGINE</span>
                  <span className={theme === 'light' ? 'text-zinc-800 font-bold' : 'text-zinc-200'}>
                    {activeUnit === 1 ? 'ACTIVE DAMPING' : 'MANUAL SLOT'}
                  </span>
                </div>
                <div className="flex justify-between items-center py-1 border-b" style={{ borderColor: theme === 'light' ? 'rgba(228,228,231,0.5)' : 'rgba(34,34,34,0.5)' }}>
                  <span className={theme === 'light' ? 'text-zinc-500' : 'text-[#6B7280]'}>EMULSION TINT</span>
                  <span className="text-[#FFB800] font-bold">
                    {activeUnit === 1 
                      ? 'ORANGE HALIDE GELS' 
                      : emulsion === 'vintage-c41' 
                        ? 'AMBER PORTRA C-41' 
                        : emulsion === 'tungsten-slide' 
                          ? 'CYAN TUNGSTEN' 
                          : 'SILVER HALIDE NOIR'}
                  </span>
                </div>

                <div className="mt-2 text-[10.5px] leading-relaxed tracking-normal font-sans border-t pt-3" style={{ borderColor: theme === 'light' ? '#E4E4E7' : '#222', color: theme === 'light' ? '#71717A' : '#6B7280' }}>
                  {activeUnit === 1 
                    ? '第1单元：搭载物理暗盒齿孔，模拟手部拉条时的强力防光槽摩擦力与高精度阻尼回弹。'
                    : '第2单元：精工35mm反转片硬纸切片盒。内置8组化学冲印工作台，将洗印后的显影框组合，套用复古精绘纸框，在拟真3D光源盘片上实时展示。'
                  }
                </div>
              </aside>
              
            </div>

        {/* Hidden File Upload Element Tree (One input per frame node) */}
        <div className="hidden">
          {frames.map((frame) => (
            <input
              key={frame.id}
              type="file"
              ref={(el) => { fileInputRefs.current[frame.id] = el; }}
              onChange={(e) => handleFileChange(frame.id, e)}
              accept="image/*"
            />
          ))}
        </div>

        {/* Helpful Tips Legend */}
        <section id="help-legend" className={`border rounded-xl p-5 flex gap-4 text-xs leading-normal transition-colors duration-300 ${
          theme === 'light'
            ? 'bg-white border-zinc-200 text-zinc-700 shadow-[0_8px_30px_rgba(0,0,0,0.02)]'
            : 'bg-[#111112] border-[#222] text-zinc-400'
        }`}>
          <AlertCircle className="w-5 h-5 text-[#FFB800] flex-shrink-0 mt-0.5" />
          <div className="flex flex-col gap-1.5">
            <h4 className={`font-semibold uppercase tracking-widest font-mono text-[11px] ${theme === 'light' ? 'text-[#C23C27]' : 'text-zinc-200'}`}>
              PROJECT MANIFESTO / 实验室宣言
            </h4>
            <ul className={`list-disc pl-4 space-y-1.5 text-[11px] font-mono tracking-wider ${
              theme === 'light' ? 'text-zinc-650' : 'text-stone-400'
            }`}>
              <li>
                <strong>醋酸片基弹性 (Acetate Poly-resonance):</strong> 经典的 35 毫米胶片片基自带反向张力，当被拉出暗盒时会自然卷屈，收纳时又会完美归位。
              </li>
              <li>
                <strong>物理回弹旋转 (Oscillation & Bounce):</strong> 点击暗盒即可启动物理 unspool，你可以自由测试不同 <strong>Damping(阻尼)</strong> 与 <strong>Stiffness(刚度)</strong> 组合，观察微妙的回弹过冲与阻尼回摆！
              </li>
              <li>
                <strong>多载体皮肤 (Halide Emulsion Skins):</strong> 在控制台自由切换富士、柯达、爱乐福等传奇经典暗盒外观，不同外观将自动渲染特定感光度及独特的金属底色。
              </li>
            </ul>
          </div>
        </section>

      </div>

    </div>
  );
};
