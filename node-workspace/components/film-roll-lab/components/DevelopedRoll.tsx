import React from 'react';
import { motion } from 'framer-motion';
import { Camera, Sliders, Layers, Trash2, Sparkles, Image as ImageIcon } from 'lucide-react';

export interface PhotoFrame {
  id: number;
  url: string;
  title: string;
  meta: string;
}

export type EmulsionType = 'high-grain-bw' | 'vintage-c41' | 'tungsten-slide';

export const SAMPLE_PHOTO_STOCK = [
  'https://images.unsplash.com/photo-1542038784456-1ea8e935640e?q=80&w=500&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?q=80&w=500&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1539628390353-30198d573926?q=80&w=500&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1506015391300-4802dc74de2e?q=80&w=500&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?q=80&w=500&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?q=80&w=500&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1498036882173-b41c28a8ba34?q=80&w=500&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1478147427282-58a87a120781?q=80&w=500&auto=format&fit=crop',
];

export const INITIAL_BLANK_FRAMES: PhotoFrame[] = [
  { id: 1, url: '', title: 'EXP 01', meta: 'TMX 100' },
  { id: 2, url: '', title: 'EXP 02', meta: 'TMX 100' },
  { id: 3, url: '', title: 'EXP 03', meta: 'SENSITOME' },
  { id: 4, url: '', title: 'EXP 04', meta: 'EXP 18A' },
  { id: 5, url: '', title: 'EXP 05', meta: 'KODACHROME' },
  { id: 6, url: '', title: 'EXP 06', meta: 'CHROMED' },
  { id: 7, url: '', title: 'EXP 07', meta: 'TRI-X 400' },
  { id: 8, url: '', title: 'EXP 08', meta: 'VELVIA 50' },
];

export const getEmulsionStyles = (emulsion: EmulsionType) => {
  switch (emulsion) {
    case 'vintage-c41':
      return {
        filmBackground: 'linear-gradient(to bottom, #3a1002 0%, #7d2a06 8%, #b5471a 15%, #be5423 50%, #b5471a 85%, #7d2a06 92%, #3a1002 100%)',
        imprintColor: 'rgba(254, 215, 170, 0.95)',
        photoFilter: 'sepia(0.24) contrast(1.1) saturate(1.3) brightness(1.05) hue-rotate(346deg)',
        filmOverlayStyle: {
          background: 'linear-gradient(135deg, rgba(251, 146, 60, 0.1) 0%, rgba(253, 186, 116, 0.05) 100%)',
          mixBlendMode: 'multiply' as const,
        },
        borderLightColor: 'rgba(254, 215, 170, 0.5)',
        lightLeakOverlay: 'radial-gradient(circle at 15% 40%, rgba(254, 215, 170, 0.15) 0%, rgba(234, 88, 12, 0.04) 40%, transparent 70%), radial-gradient(circle at 85% 60%, rgba(251, 146, 60, 0.12) 0%, transparent 60%)',
      };
    case 'tungsten-slide':
      return {
        filmBackground: 'linear-gradient(to bottom, #051626 0%, #15324b 8%, #285475 15%, #2c5d82 50%, #285475 85%, #15324b 92%, #051626 100%)',
        imprintColor: 'rgba(165, 243, 252, 0.95)',
        photoFilter: 'contrast(1.15) saturate(1.1) brightness(1.08) grayscale(0.04) hue-rotate(185deg) sepia(0.02)',
        filmOverlayStyle: {
          background: 'linear-gradient(to bottom, rgba(14, 116, 144, 0.08), rgba(8, 145, 178, 0.02))',
          mixBlendMode: 'multiply' as const,
        },
        borderLightColor: 'rgba(165, 243, 252, 0.45)',
        lightLeakOverlay: 'radial-gradient(circle at 25% 35%, rgba(165, 243, 252, 0.12) 0%, transparent 65%), radial-gradient(circle at 75% 65%, rgba(34, 211, 238, 0.08) 0%, transparent 55%)',
      };
    case 'high-grain-bw':
    default:
      return {
        filmBackground: 'linear-gradient(to bottom, #161619 0%, #2f2f34 8%, #525258 15%, #5a5a60 50%, #525258 85%, #2f2f34 92%, #161619 100%)',
        imprintColor: 'rgba(244, 244, 245, 0.95)',
        photoFilter: 'grayscale(1) contrast(1.2) brightness(1.04)',
        filmOverlayStyle: {
          background: 'rgba(255, 255, 255, 0.05)',
          mixBlendMode: 'overlay' as const,
        },
        borderLightColor: 'rgba(255, 255, 255, 0.45)',
        lightLeakOverlay: 'radial-gradient(circle at 50% 50%, rgba(255, 255, 255, 0.06) 0%, transparent 80%)',
      };
  }
};

interface DevelopedRollRibbonProps {
  frames: PhotoFrame[];
  emulsion: EmulsionType;
  triggerUpload: (frameId: number) => void;
  dragOverFrameId?: number | null;
  onDragOver?: (frameId: number, e: React.DragEvent) => void;
  onDragLeave?: () => void;
  onDrop?: (frameId: number, e: React.DragEvent) => void;
  ribbonParams?: RibbonParams;
}

export interface RibbonParams {
  hue: number;
  saturation: number;
  lightness: number;
  transparency: number;
  specularGloss: number;
  backglowIntensity: number;
  lightLeakIntensity: number;
  grainIntensity: number;
}

export const RIBBON_PRESETS: Record<EmulsionType, RibbonParams> = {
  'vintage-c41': {
    hue: 16,
    saturation: 68,
    lightness: 20,
    transparency: 85,
    specularGloss: 80,
    backglowIntensity: 75,
    lightLeakIntensity: 45,
    grainIntensity: 35,
  },
  'high-grain-bw': {
    hue: 0,
    saturation: 0,
    lightness: 18,
    transparency: 90,
    specularGloss: 95,
    backglowIntensity: 30,
    lightLeakIntensity: 10,
    grainIntensity: 75,
  },
  'tungsten-slide': {
    hue: 208,
    saturation: 55,
    lightness: 16,
    transparency: 75,
    specularGloss: 95,
    backglowIntensity: 65,
    lightLeakIntensity: 25,
    grainIntensity: 20,
  }
};

export const DevelopedRollRibbon: React.FC<DevelopedRollRibbonProps> = ({
  frames,
  emulsion,
  triggerUpload,
  dragOverFrameId,
  onDragOver,
  onDragLeave,
  onDrop,
  ribbonParams,
}) => {
  const HEIGHT = 80;

  const renderSprocketHoles = (totalHoles: number) => {
    return Array.from({ length: totalHoles }).map((_, i) => (
      <div 
        key={i} 
        className="w-[4.2px] h-[5.8px] rounded-[1px] bg-[#040405] flex-shrink-0 pointer-events-none relative shadow-[inset_0_1px_1.5px_rgba(0,0,0,0.95)]"
        style={{
          border: '1px solid rgba(255, 255, 255, 0.08)',
          margin: '0 1.8px',
        }}
      />
    ));
  };

  const params = ribbonParams || RIBBON_PRESETS[emulsion];
  const {
    hue = 16,
    saturation = 68,
    lightness = 20,
    transparency = 85,
    specularGloss = 80,
    backglowIntensity = 75,
    lightLeakIntensity = 45,
    grainIntensity = 35,
  } = params;

  const alpha = transparency / 100;
  
  // Custom, high-fidelity 3D acetate gradient matching Unit 1's professional physics design
  const customFilmBackground = `linear-gradient(to bottom, 
    hsla(${hue}, ${saturation}%, ${Math.max(2, lightness * 0.15)}%, ${alpha}) 0%,
    hsla(${hue}, ${saturation}%, ${Math.max(4, lightness * 0.5)}%, ${alpha}) 10%, 
    hsla(${hue}, ${saturation}%, ${lightness}%, ${alpha}) 15%, 
    hsla(${hue}, ${saturation}%, ${lightness}%, ${alpha}) 85%, 
    hsla(${hue}, ${saturation}%, ${Math.max(4, lightness * 0.4)}%, ${alpha}) 92%, 
    hsla(${hue}, ${saturation}%, ${Math.max(2, lightness * 0.1)}%, ${alpha}) 100%)`;

  const imprintColor = `hsla(${hue === 0 ? 0 : (hue + 10) % 360}, ${hue === 0 ? 0 : 95}%, 75%, 0.85)`;

  // Dynamically calculate the film filter applied inside the frames
  let computedPhotoFilter = 'contrast(1.1) brightness(1.04)';
  if (saturation === 0) {
    computedPhotoFilter = 'grayscale(1) contrast(1.2) brightness(1.04)';
  } else {
    const warmthBias = Math.max(0, 1 - Math.abs(hue - 16) / 90);
    const sepiaVal = (warmthBias * 0.35) * (saturation / 100);
    const hueShift = hue - 16;
    computedPhotoFilter = `contrast(1.15) brightness(1.05) saturate(${0.72 + (saturation / 100) * 0.56}) sepia(${sepiaVal.toFixed(2)}) hue-rotate(${hueShift}deg)`;
  }

  const computedFilmOverlayStyle = {
    background: `linear-gradient(135deg, hsla(${hue}, ${saturation}%, 50%, 0.08) 0%, hsla(${(hue+30)%360}, ${saturation}%, 40%, 0.03) 100%)`,
    mixBlendMode: (saturation === 0 ? 'overlay' : 'multiply') as any,
  };

  return (
    <div className="w-full flex justify-center items-center overflow-visible select-none py-1">
      {/* Translucent dynamic ambient backlight glow behind the film strip matching base dye hue */}
      <div 
        className="absolute pointer-events-none transition-all duration-300"
        style={{
          height: `${HEIGHT}px`,
          width: '676px',
          filter: `blur(${12 + (backglowIntensity / 100) * 12}px)`,
          backgroundColor: `hsla(${hue}, ${saturation}%, ${lightness}%, ${(backglowIntensity / 100) * 0.18})`,
          boxShadow: `0 25px 55px hsla(${hue}, ${saturation}%, ${lightness}%, ${(backglowIntensity / 100) * 0.55}), 0 5px 15px hsla(${hue}, ${saturation}%, ${lightness}%, ${(backglowIntensity / 100) * 0.3})`,
          clipPath: `polygon(
            15px 0%, 636px 0%, 642px 8%, 633px 15%, 649px 24%, 638px 33%, 654px 42%, 643px 51%, 660px 60%, 649px 69%, 664px 78%, 653px 87%, 670px 95%, 662px 100%, 40px 100%, 44px 91%, 31px 83%, 39px 74%, 26px 65%, 34px 57%, 21px 48%, 29px 40%, 17px 32%, 25px 23%, 8px 17%, 18px 12%, 12px 6%
          )`,
          opacity: backglowIntensity / 100,
        }}
      />

      <motion.div
        id="developed-film-ribbon"
        whileTap={{ scale: 0.995 }}
        className="relative overflow-hidden select-none flex items-center justify-start border border-zinc-950/80 shadow-[0_12px_36px_rgba(0,0,0,0.75)]"
        style={{
          height: `${HEIGHT}px`,
          width: '676px',
          background: customFilmBackground,
          clipPath: `polygon(
            15px 0%, 636px 0%, 642px 8%, 633px 15%, 649px 24%, 638px 33%, 654px 42%, 643px 51%, 660px 60%, 649px 69%, 664px 78%, 653px 87%, 670px 95%, 662px 100%, 40px 100%, 44px 91%, 31px 83%, 39px 74%, 26px 65%, 34px 57%, 21px 48%, 29px 40%, 17px 32%, 25px 23%, 8px 17%, 18px 12%, 12px 6%
          )`,
        }}
      >
        {/* Grain and dust textures with adjustable intensity */}
        <div 
          className="absolute inset-0 z-[4] pointer-events-none mix-blend-overlay bg-repeat bg-center transition-opacity duration-300"
          style={{ 
            backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noise\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.85\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noise)\'/%3E%3C/svg%3E")',
            backgroundSize: '110px 110px',
            opacity: (grainIntensity / 100) * 0.28
          }} 
        />

        {/* Dynamic Light Leak overlays that blend seamlessly in screen mode */}
        <div 
          className="absolute inset-0 z-[3] pointer-events-none mix-blend-screen transition-all duration-300"
          style={{
            opacity: (lightLeakIntensity / 100) * 0.45,
            background: `
              radial-gradient(circle at 18% 30%, hsla(${(hue + 20) % 360}, 100%, 65%, 0.22) 0%, hsla(${(hue + 32) % 360}, 100%, 50%, 0.08) 35%, transparent 70%),
              radial-gradient(circle at 55% 70%, hsla(${hue}, 100%, 75%, 0.25) 0%, hsla(${(hue + 340) % 360}, 100%, 50%, 0.1) 40%, transparent 75%),
              radial-gradient(circle at 86% 40%, hsla(${(hue + 15) % 360}, 100%, 60%, 0.2) 0%, hsla(${(hue + 25) % 360}, 100%, 45%, 0.06) 30%, transparent 60%)
            `
          }}
        />

        {/* Specular film gloss sheens matching Unit 1 style */}
        <div 
          className="absolute inset-x-0 top-0 bottom-0 bg-gradient-to-b from-white/12 via-transparent to-black/16 pointer-events-none z-[10] transition-opacity duration-300"
          style={{ opacity: specularGloss / 100 }}
        />
        <div 
          className="absolute top-[22%] left-0 right-0 h-[1.2px] bg-white/7 pointer-events-none z-[10] transition-opacity duration-300"
          style={{ opacity: specularGloss / 100 }}
        />

        <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/[0.02] to-black/[0.18] pointer-events-none z-[10]" />

        {/* Top Sprocket holes */}
        <div className="absolute top-[2.5px] left-[52px] right-[56px] h-[6.5px] flex items-center justify-between z-[5] pointer-events-none select-none overflow-hidden">
          {renderSprocketHoles(72)}
        </div>

        {/* Bottom Sprocket holes */}
        <div className="absolute bottom-[2.5px] left-[52px] right-[56px] h-[6.5px] flex items-center justify-between z-[5] pointer-events-none select-none overflow-hidden">
          {renderSprocketHoles(72)}
        </div>

        {/* Text margins */}
        <div 
          className="absolute left-[58px] right-[62px] top-[11px] flex justify-between items-center text-[5.8px] font-sans tracking-[0.2em] uppercase font-semibold pointer-events-none select-none z-[9] transition-colors"
          style={{ color: imprintColor }}
        >
          <span>ET 160</span>
          <span className="opacity-80">MANUAL SPLIT COIL</span>
          <span>KODAK EXP 5077</span>
        </div>

        <div 
          className="absolute left-[58px] right-[62px] bottom-[11px] flex justify-between items-center text-[5.5px] font-sans tracking-[0.16em] uppercase font-bold pointer-events-none select-none z-[9] transition-colors"
          style={{ color: imprintColor }}
        >
          <span>▶ 01</span>
          <span>02 • SAFETY</span>
          <span>▶ 03</span>
          <span>04 • FILM</span>
          <span>▶ 05</span>
          <span>06 • EXPED</span>
          <span>▶ 07</span>
          <span>08</span>
        </div>

        {/* Photo frames panel */}
        <div 
          className="absolute flex items-center justify-between gap-[3px] z-[6]"
          style={{ 
            top: '15px', 
            bottom: '15px', 
            left: '52px', 
            right: '56px',
            height: '50px' 
          }}
        >
          {frames.map((frame) => {
            return (
              <div 
                key={frame.id}
                onClick={() => triggerUpload(frame.id)}
                onDragOver={onDragOver ? (e) => onDragOver(frame.id, e) : undefined}
                onDragLeave={onDragLeave}
                onDrop={onDrop ? (e) => onDrop(frame.id, e) : undefined}
                className={`relative flex-shrink-0 bg-[#050506] flex items-center justify-center cursor-pointer border border-[#18181b]/30 rounded-[1.5px] hover:brightness-110 active:brightness-95 overflow-hidden transition-all duration-300 shadow-[inset_0_4px_12px_rgba(0,0,0,0.95)] ${
                  dragOverFrameId === frame.id ? 'ring-1 ring-[#FFB800] border-amber-500' : ''
                }`}
                style={{
                  width: '66px',
                  height: '50px',
                }}
              >
                {frame.url ? (
                  <>
                    <img 
                      src={frame.url} 
                      alt=""
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover select-none pointer-events-none"
                      style={{ filter: computedPhotoFilter }}
                    />
                    <div 
                      className="absolute inset-0 pointer-events-none z-[7]"
                      style={computedFilmOverlayStyle}
                    />
                    <div className="absolute inset-0 shadow-[inset_0_1.5px_4px_rgba(0,0,0,0.85)] pointer-events-none z-[9]" />
                  </>
                ) : (
                  <div 
                    className="w-[88%] h-[88%] rounded-[1px] border border-dashed flex flex-col items-center justify-center transition-all duration-300 pointer-events-none"
                    style={{
                      borderColor: imprintColor,
                      backgroundColor: 'rgba(0, 0, 0, 0.45)',
                    }}
                  >
                    <span 
                      className="text-[6.2px] font-mono font-extrabold tracking-widest opacity-60 select-none uppercase"
                      style={{ color: imprintColor }}
                    >
                      X0{frame.id}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </motion.div>
    </div>
  );
};

interface DevelopedRollWorkbenchProps {
  frames: PhotoFrame[];
  emulsion: EmulsionType;
  setEmulsion: (emulsion: EmulsionType) => void;
  loadPresetSamples: () => void;
  clearAll: () => void;
  triggerUpload: (frameId: number) => void;
  removePhoto: (frameId: number, e?: React.MouseEvent) => void;
  ribbonParams: RibbonParams;
  onChangeRibbonParams: (params: RibbonParams) => void;
}

export const DevelopedRollWorkbench: React.FC<DevelopedRollWorkbenchProps> = ({
  frames,
  emulsion,
  setEmulsion,
  loadPresetSamples,
  clearAll,
  triggerUpload,
  removePhoto,
  ribbonParams,
  onChangeRibbonParams,
}) => {
  const params = ribbonParams || RIBBON_PRESETS[emulsion];
  const {
    hue = 16,
    saturation = 68,
    lightness = 20,
    transparency = 85,
    specularGloss = 80,
    backglowIntensity = 75,
    lightLeakIntensity = 45,
    grainIntensity = 35,
  } = params;

  // Compute live preview colors for preset badges
  const getBadgeStyle = (h: number, s: number, l: number) => {
    return {
      backgroundColor: `hsl(${h}, ${s}%, ${l}%)`,
      boxShadow: `0 0 10px hsla(${h}, ${s}%, ${l}%, 0.45)`,
    };
  };

  // Dynamically calculate the film filter applied inside the slot snapshots to match the editor
  let computedPhotoFilter = 'contrast(1.1) brightness(1.04)';
  if (saturation === 0) {
    computedPhotoFilter = 'grayscale(1) contrast(1.2) brightness(1.04)';
  } else {
    const warmthBias = Math.max(0, 1 - Math.abs(hue - 16) / 90);
    const sepiaVal = (warmthBias * 0.35) * (saturation / 100);
    const hueShift = hue - 16;
    computedPhotoFilter = `contrast(1.15) brightness(1.05) saturate(${0.72 + (saturation / 100) * 0.56}) sepia(${sepiaVal.toFixed(2)}) hue-rotate(${hueShift}deg)`;
  }

  const imprintColor = `hsla(${hue === 0 ? 0 : (hue + 10) % 360}, ${hue === 0 ? 0 : 95}%, 75%, 0.85)`;

  return (
    <div className="w-full bg-[#121214] border border-[#232326] rounded-xl p-5 shadow-2xl">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-zinc-800 pb-3 mb-4 gap-2">
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-[#FFB800]" />
          <span className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-200">
            Chemical & Exposure Console / 洗片液配方与底片工作台
          </span>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={loadPresetSamples}
            className="flex items-center gap-1 text-[9.5px] font-mono text-amber-500 hover:text-amber-400 bg-amber-950/20 border border-amber-900/60 hover:border-amber-800 px-2.5 py-1 rounded transition-all duration-150 uppercase tracking-wider"
          >
            <Sparkles className="w-3 h-3 animate-pulse" />
            <span>Load Samples / 载入复古示例</span>
          </button>
          
          <button
            onClick={clearAll}
            className="flex items-center gap-1 text-[9.5px] font-mono text-zinc-400 hover:text-red-400 bg-[#1a1a1c] border border-zinc-800 hover:border-red-900/40 px-2.5 py-1 rounded transition-all duration-150 uppercase tracking-wider"
          >
            <Trash2 className="w-3 h-3" />
            <span>Clear / 清空底片</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Preset chemicals + Detailed Substrate Parameters */}
        <div className="lg:col-span-6 flex flex-col gap-4">
          <div className="flex flex-col gap-3">
            <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-400 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-zinc-500" />
              <span>Developer Emulsion / 银盐感光乳胶配方</span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => setEmulsion('vintage-c41')}
                className={`text-left p-2 rounded-lg border text-xs font-mono transition-all duration-150 flex flex-col justify-between h-[52px] ${
                  emulsion === 'vintage-c41'
                    ? 'bg-orange-950/30 border-orange-500/50 text-[#FF8F00] font-bold shadow-md'
                    : 'bg-[#18181b]/50 border-zinc-900 text-zinc-400 hover:text-[#fff] hover:bg-zinc-800/20'
                }`}
              >
                <span className="text-[9.5px]">🧡 Portra Warm C-41</span>
                <span className="text-[7.5px] opacity-60">AMBER COIL</span>
              </button>

              <button
                onClick={() => setEmulsion('high-grain-bw')}
                className={`text-left p-2 rounded-lg border text-xs font-mono transition-all duration-150 flex flex-col justify-between h-[52px] ${
                  emulsion === 'high-grain-bw'
                    ? 'bg-zinc-800 border-zinc-600 text-[#FFF] font-bold shadow-md'
                    : 'bg-[#18181b]/50 border-zinc-900 text-zinc-400 hover:text-[#fff] hover:bg-zinc-800/20'
                }`}
              >
                <span className="text-[9.5px]">🖤 Halide Noir B&W</span>
                <span className="text-[7.5px] opacity-60">GRAIN NOIR</span>
              </button>

              <button
                onClick={() => setEmulsion('tungsten-slide')}
                className={`text-left p-2 rounded-lg border text-xs font-mono transition-all duration-150 flex flex-col justify-between h-[52px] ${
                  emulsion === 'tungsten-slide'
                    ? 'bg-cyan-950/40 border-cyan-500/50 text-cyan-400 font-bold shadow-md'
                    : 'bg-[#18181b]/50 border-zinc-900 text-zinc-400 hover:text-[#fff] hover:bg-zinc-800/20'
                }`}
              >
                <span className="text-[9.5px]">💙 Chrome Tungsten</span>
                <span className="text-[7.5px] opacity-60">CYAN SLIDE</span>
              </button>
            </div>
          </div>

          {/* BACKGROUND ACETATE & SPECIAL LIGHTING PARAMETERS PANEL */}
          <div className="border-t border-zinc-800 pt-4 flex flex-col gap-4">
            <div className="flex items-center justify-between text-[10px] font-mono tracking-wider uppercase text-zinc-400">
              <div className="flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-amber-500" />
                <span>Base Matte & Ambient Customizer / 胶卷材质与光效深度微调</span>
              </div>
              <button 
                onClick={() => onChangeRibbonParams(RIBBON_PRESETS[emulsion])}
                className="text-[8px] hover:text-amber-400 border border-zinc-800 hover:border-amber-900/50 px-2 py-0.5 rounded transition font-bold"
                title="Reset current preset parameters"
              >
                RESET PRESET
              </button>
            </div>

            {/* Quick HSL Presets of Acetate Media Base */}
            <div className="flex flex-col gap-1.5 bg-black/15 p-2 rounded-lg border border-zinc-900">
              <span className="text-[8.5px] font-mono text-zinc-500 uppercase tracking-wider">Quick Hues / 经典暗房片基基色色调</span>
              <div className="grid grid-cols-5 gap-1.5">
                {[
                  { label: 'Warm 5062', h: 16, s: 68, l: 20 },
                  { label: 'Cool Chrome', h: 208, s: 55, l: 16 },
                  { label: 'Exotic Reala', h: 145, s: 60, l: 15 },
                  { label: 'Violet Duom', h: 290, s: 65, l: 17 },
                  { label: 'Mono Carbon', h: 0, s: 0, l: 18 }
                ].map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => {
                      onChangeRibbonParams({
                        ...params,
                        hue: preset.h,
                        saturation: preset.s,
                        lightness: preset.l
                      });
                    }}
                    className={`p-1 rounded text-[8.5px] font-mono border transition flex flex-col items-center gap-1 ${
                      hue === preset.h && saturation === preset.s
                        ? 'border-amber-500 text-amber-400 bg-amber-500/5 font-extrabold'
                        : 'border-zinc-800/80 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700 bg-black/35'
                    }`}
                  >
                    <div className="w-2.5 h-2.5 rounded-full border border-black/40" style={getBadgeStyle(preset.h, preset.s, preset.l)} />
                    <span className="scale-90">{preset.label.split(' ')[0]}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mt-1">
              {/* Hue spectrum slider */}
              <div className="flex flex-col gap-1 sm:col-span-2">
                <div className="flex justify-between text-[9px] font-mono">
                  <span className="text-zinc-400 uppercase tracking-widest">Base Hue / 胶体底片色相</span>
                  <span className="text-amber-500 font-bold">{hue}°</span>
                </div>
                <div className="relative flex items-center h-4">
                  <div 
                    className="absolute inset-x-0 h-1.5 rounded-full" 
                    style={{
                      background: 'linear-gradient(to right, #ef4444 0%, #f97316 10%, #eab308 20%, #22c55e 40%, #06b6d4 60%, #3b82f6 80%, #a855f7 90%, #ef4444 100%)'
                    }}
                  />
                  <input
                    type="range"
                    min="0"
                    max="360"
                    value={hue}
                    onChange={(e) => onChangeRibbonParams({ ...params, hue: parseInt(e.target.value) })}
                    className="absolute inset-x-0 w-full appearance-none h-4 bg-transparent cursor-pointer focus:outline-none focus:ring-0 accent-white"
                  />
                </div>
              </div>

              {/* Saturation */}
              <div className="flex flex-col gap-1">
                <div className="flex justify-between text-[9px] font-mono">
                  <span className="text-zinc-500 uppercase">Saturation / 染料饱和度</span>
                  <span className="text-zinc-300 font-semibold">{saturation}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={saturation}
                  onChange={(e) => onChangeRibbonParams({ ...params, saturation: parseInt(e.target.value) })}
                  className="w-full accent-amber-500 bg-zinc-800 h-1.5 rounded-full appearance-none cursor-pointer"
                />
              </div>

              {/* Lightness */}
              <div className="flex flex-col gap-1">
                <div className="flex justify-between text-[9px] font-mono">
                  <span className="text-zinc-500 uppercase">Base Light / 片基亮度感</span>
                  <span className="text-zinc-300 font-semibold">{lightness}%</span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="40"
                  value={lightness}
                  onChange={(e) => onChangeRibbonParams({ ...params, lightness: parseInt(e.target.value) })}
                  className="w-full accent-amber-500 bg-zinc-800 h-1.5 rounded-full appearance-none cursor-pointer"
                />
              </div>

              {/* Transparency / Translucency */}
              <div className="flex flex-col gap-1">
                <div className="flex justify-between text-[9px] font-mono">
                  <span className="text-zinc-500 uppercase">Transparency / 片基透光率</span>
                  <span className="text-zinc-300 font-semibold">{transparency}%</span>
                </div>
                <input
                  type="range"
                  min="15"
                  max="100"
                  value={transparency}
                  onChange={(e) => onChangeRibbonParams({ ...params, transparency: parseInt(e.target.value) })}
                  className="w-full accent-amber-500 bg-zinc-800 h-1.5 rounded-full appearance-none cursor-pointer"
                />
              </div>

              {/* Specular Gloss glint */}
              <div className="flex flex-col gap-1">
                <div className="flex justify-between text-[9px] font-mono">
                  <span className="text-zinc-500 uppercase">Sheen Gloss / 镜面反光率</span>
                  <span className="text-zinc-300 font-semibold">{specularGloss}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={specularGloss}
                  onChange={(e) => onChangeRibbonParams({ ...params, specularGloss: parseInt(e.target.value) })}
                  className="w-full accent-amber-500 bg-zinc-800 h-1.5 rounded-full appearance-none cursor-pointer"
                />
              </div>

              {/* Backglow intensity */}
              <div className="flex flex-col gap-1">
                <div className="flex justify-between text-[9px] font-mono">
                  <span className="text-zinc-500 uppercase">Backglow / 片外环境背光</span>
                  <span className="text-zinc-300 font-semibold">{backglowIntensity}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={backglowIntensity}
                  onChange={(e) => onChangeRibbonParams({ ...params, backglowIntensity: parseInt(e.target.value) })}
                  className="w-full accent-amber-500 bg-zinc-800 h-1.5 rounded-full appearance-none cursor-pointer"
                />
              </div>

              {/* Light Leaks */}
              <div className="flex flex-col gap-1">
                <div className="flex justify-between text-[9px] font-mono">
                  <span className="text-zinc-500 uppercase">Light Leaks / 卤化银漏光度</span>
                  <span className="text-zinc-300 font-semibold">{lightLeakIntensity}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={lightLeakIntensity}
                  onChange={(e) => onChangeRibbonParams({ ...params, lightLeakIntensity: parseInt(e.target.value) })}
                  className="w-full accent-amber-500 bg-zinc-800 h-1.5 rounded-full appearance-none cursor-pointer"
                />
              </div>

              {/* Grain */}
              <div className="flex flex-col gap-1 font-mono">
                <div className="flex justify-between text-[9px] font-mono">
                  <span className="text-zinc-500 uppercase">Film Grain / 溴化银噪点度</span>
                  <span className="text-zinc-300 font-semibold">{grainIntensity}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={grainIntensity}
                  onChange={(e) => onChangeRibbonParams({ ...params, grainIntensity: parseInt(e.target.value) })}
                  className="w-full accent-amber-500 bg-zinc-800 h-1.5 rounded-full appearance-none cursor-pointer"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Original 8 slots swappers */}
        <div className="lg:col-span-6 flex flex-col gap-3">
          <span className="text-[10px] font-mono uppercase tracking-widest text-[#888] flex items-center gap-1.5">
            <Camera className="w-3.5 h-3.5 text-zinc-500" />
            <span>Exposure Slot Swappers / 8槽位独立装片管理区</span>
          </span>
          
          <div className="grid grid-cols-4 gap-2">
            {frames.map((frame, idx) => {
              const isTorn = idx === 0 || idx === 7;
              return (
                <div 
                  key={frame.id}
                  className="group relative rounded-lg bg-[#18181a] border border-[#232326] p-1 flex flex-col items-center justify-between"
                >
                  <div 
                    onClick={() => triggerUpload(frame.id)}
                    className="relative w-full aspect-square bg-[#0b0b0c] rounded-md overflow-hidden cursor-pointer flex items-center justify-center border border-zinc-900/80 hover:border-zinc-700 transition"
                  >
                    {frame.url ? (
                      <img 
                        src={frame.url} 
                        alt="" 
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                        style={{ filter: computedPhotoFilter }}
                      />
                    ) : (
                      <div className="text-[8.5px] text-zinc-600 font-mono">+</div>
                    )}
                    
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity z-10">
                      <ImageIcon className="w-3 h-3 text-white/80" />
                    </div>
                  </div>

                  <div className="w-full flex items-center justify-between mt-1 text-[8px] font-mono">
                    <span className="text-zinc-500 font-bold">EXP 0{frame.id}</span>
                    {frame.url ? (
                      <button 
                        onClick={(e) => removePhoto(frame.id, e)}
                        className="text-zinc-600 hover:text-red-400 p-0.5 transition"
                        title="Remove exposure"
                      >
                        <Trash2 className="w-2.5 h-2.5" />
                      </button>
                    ) : (
                      <span className="text-zinc-600 font-normal">BLANK</span>
                    )}
                  </div>

                  {isTorn && (
                    <div className="absolute -top-1 -right-1 bg-red-950/80 border border-red-900/40 text-[#ff8f8f] scale-75 text-[6px] px-1 py-[0.5px] rounded-md font-bold uppercase tracking-wider font-mono">
                      TORN
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
