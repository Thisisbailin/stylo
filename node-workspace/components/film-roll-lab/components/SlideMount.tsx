import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { PhotoFrame, getEmulsionStyles, RibbonParams, RIBBON_PRESETS } from './DevelopedRoll';
import { Sparkles, Sliders, Layers, Film, ArrowRight, ArrowLeft } from 'lucide-react';

interface SlideMountProps {
  frames: PhotoFrame[];
  emulsion: string;
  ribbonParams?: RibbonParams;
}

export const SlideMount: React.FC<SlideMountProps> = ({ frames, emulsion, ribbonParams }) => {
  // Find developed images or fall back to default assets
  const developedFrames = frames.filter(f => f.url);
  const [activeFrameIndex, setActiveFrameIndex] = useState(0);

  const activeFrame = developedFrames.length > 0 
    ? developedFrames[activeFrameIndex % developedFrames.length] 
    : null;

  const handleNext = () => {
    if (developedFrames.length > 0) {
      setActiveFrameIndex((prev) => (prev + 1) % developedFrames.length);
    }
  };

  const handlePrev = () => {
    if (developedFrames.length > 0) {
      setActiveFrameIndex((prev) => (prev - 1 + developedFrames.length) % developedFrames.length);
    }
  };

  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const xc = rect.width / 2;
    const yc = rect.height / 2;

    const dx = (x - xc) / xc; // -1 to 1
    const dy = (yc - y) / yc; // -1 to 1

    const maxTilt = 10; // Max tilt degrees
    setTilt({
      x: dy * maxTilt,
      y: dx * maxTilt,
    });
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    setTilt({ x: 0, y: 0 });
  };

  const handleMouseEnter = () => {
    setIsHovered(true);
  };

  const params = ribbonParams || (RIBBON_PRESETS as any)[emulsion];
  const hue = params?.hue ?? 16;
  const saturation = params?.saturation ?? 68;

  // Calculate dynamic professional photography film filter applied inside the slot snapshots to match DevelopedRoll
  let computedPhotoFilter = 'contrast(1.1) brightness(1.04)';
  if (saturation === 0) {
    computedPhotoFilter = 'grayscale(1) contrast(1.2) brightness(1.04)';
  } else {
    const warmthBias = Math.max(0, 1 - Math.abs(hue - 16) / 90);
    const sepiaVal = (warmthBias * 0.35) * (saturation / 100);
    const hueShift = hue - 16;
    computedPhotoFilter = `contrast(1.15) brightness(1.05) saturate(${0.72 + (saturation / 100) * 0.56}) sepia(${sepiaVal.toFixed(2)}) hue-rotate(${hueShift}deg)`;
  }

  // Dynamic branding text based on chemistry
  const slideBrand = emulsion === 'vintage-c41' 
    ? 'Kodachrome' 
    : emulsion === 'tungsten-slide' 
      ? 'Ektachrome' 
      : 'Agfa Black & White';

  const slideSubtitle = emulsion === 'vintage-c41' 
    ? 'WARM EMULSION • ASA 64' 
    : emulsion === 'tungsten-slide' 
      ? 'PROCESS CR-56 • CYAN' 
      : 'SILVER HALIDE NOIR • ASA 400';

  return (
    <div className="w-full flex flex-col items-center justify-center gap-6 py-2 select-none animate-fadeIn">
      {/* Dynamic Skeuomorphic 35mm Slide Mount Box */}
      <div className="relative flex flex-col md:flex-row items-center gap-8 justify-center w-full max-w-4xl">
        
        {/* Left Side: Interactive Retro Slide Mount Frame with 3D Perspective */}
        <div 
          className="relative flex-shrink-0 z-10"
          style={{ perspective: '1200px' }}
        >
          {/* Cardboard backing 3D ambient shadow */}
          <div 
            className="absolute inset-0 bg-black/55 rounded-[6px] blur-xl pointer-events-none transition-all duration-300 transform"
            style={{
              transform: isHovered 
                ? `translateY(${14 + tilt.x * 0.4}px) translateX(${4 - tilt.y * 0.4}px) scale(1.02)` 
                : 'translateY(10px) translateX(2px) scale(0.97)',
              opacity: isHovered ? 0.8 : 0.6,
            }}
          />

          {/* Core Cardboard Slide Mount */}
          <motion.div 
            onMouseMove={handleMouseMove}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            animate={{
              rotateX: isHovered ? tilt.x : 0,
              rotateY: isHovered ? tilt.y : 0,
              scale: isHovered ? 1.05 : 1,
            }}
            transition={{ type: 'spring', stiffness: 200, damping: 22, mass: 0.6 }}
            className="w-[280px] h-[280px] bg-[#FAF8F3] rounded-[5px] p-[22px] border border-[#d6d4ce] flex flex-col justify-between relative overflow-hidden select-none cursor-grab active:cursor-grabbing"
            style={{
              transformStyle: 'preserve-3d' as const,
              backgroundImage: 'linear-gradient(145deg, #FAF8F3 0%, #ece9de 100%)',
              boxShadow: isHovered
                ? 'inset 0 2px 2px rgba(255,255,255,1), inset 0 -2px 3px rgba(0,0,0,0.08), 0 24px 50px rgba(0,0,0,0.5)'
                : 'inset 0 1px 1px rgba(255,255,255,0.9), inset 0 -1px 2px rgba(0,0,0,0.05), 0 10px 24px rgba(0,0,0,0.3)',
            }}
          >
            {/* Skeuomorphic Paper Fiber Texture Overlay */}
            <div 
              className="absolute inset-0 pointer-events-none opacity-[0.09] mix-blend-multiply bg-repeat"
              style={{
                backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noise\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.75\' numOctaves=\'3\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noise)\'/%3E%3C/svg%3E")',
                backgroundSize: '120px 120px',
              }}
            />

            {/* Subtle paper die indentation lines (Bevel ring around slide) */}
            <div className="absolute inset-[10px] border border-stone-900/[0.04] rounded-[4px] pointer-events-none shadow-[inset_0_1px_1px_rgba(255,255,255,0.8),_0_1px_2px_rgba(0,0,0,0.02)]" />
            <div className="absolute inset-[11px] border border-white/60 rounded-[3px] pointer-events-none" />

            {/* Top Text Stamp: Vintage Red or Brand Ink Typography */}
            <div 
              className="flex flex-col items-center text-center mt-0.5 z-10 pointer-events-none"
              style={{ transform: 'translateZ(10px)' }}
            >
              <span 
                className="text-[15px] font-sans font-black tracking-[0.24em] font-extrabold select-none transition-colors duration-300"
                style={{
                  color: emulsion === 'vintage-c41' 
                    ? '#B82D1E' 
                    : emulsion === 'tungsten-slide' 
                      ? '#1E4DB8' 
                      : '#3a3a3d'
                }}
              >
                {slideBrand}
              </span>
              <div className="flex items-center gap-1.5 mt-[2px]">
                <span className="text-[6px] font-mono font-bold tracking-[0.14em] uppercase text-stone-500/95">SLIDE</span>
                <span className="w-2.5 h-[1px] bg-stone-400" />
                <span className="text-[6px] font-mono font-bold tracking-[0.11em] uppercase text-stone-500/95">{slideSubtitle}</span>
              </div>
            </div>

            {/* Middle Cutout - Die-cut 3D 35mm Beveled Window Panel */}
            <div 
              className="relative w-full aspect-[3/2] bg-[#030304] border-[2px] border-stone-200/95 rounded-[3px] overflow-hidden shadow-[0_3px_6px_rgba(0,0,0,0.12),_inset_0_4px_12px_rgba(0,0,0,0.98)] my-auto flex items-center justify-center"
              style={{ transform: 'translateZ(5px)' }}
            >
              {/* Paper Bevel Thickness Mask Ring (Inside cutout overlay) */}
              <div className="absolute inset-0 border border-stone-400/30 z-[4] pointer-events-none rounded-[1px]" />
              
              {/* Backlit glow from the light-table beneath positive slide */}
              <div 
                className="absolute inset-0 pointer-events-none z-[1] transition-all duration-300" 
                style={{
                  background: emulsion === 'vintage-c41'
                    ? 'radial-gradient(circle, rgba(254, 215, 170, 0.45) 0%, rgba(254, 215, 170, 0.05) 80%)'
                    : emulsion === 'tungsten-slide'
                      ? 'radial-gradient(circle, rgba(165, 243, 252, 0.35) 0%, rgba(165, 243, 252, 0.05) 80%)'
                      : 'radial-gradient(circle, rgba(255, 255, 255, 0.2) 0%, transparent 80%)'
                }}
              />

              {activeFrame ? (
                <>
                  <img
                    src={activeFrame.url}
                    alt={activeFrame.title}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover select-none"
                    style={{ 
                      filter: computedPhotoFilter,
                    }}
                  />
                  
                  {/* Dynamic Shifting High-Gloss Specular Glare */}
                  <div 
                    className="absolute inset-0 pointer-events-none z-[2] bg-gradient-to-tr from-white/0 via-white/[0.08] to-white/0 mix-blend-overlay"
                    style={{
                      transform: `translateX(${-tilt.y * 3}px) translateY(${tilt.x * 3}px)`,
                      transition: 'transform 0.15s ease-out'
                    }}
                  />
                  <div className="absolute inset-x-[-150%] top-[-100%] bottom-[-100%] pointer-events-none z-[2] bg-gradient-to-r from-transparent via-white/[0.04] to-transparent pointer-none mix-blend-screen"
                    style={{
                      transform: `skewX(-25deg) translateX(${tilt.y * 5}px)`,
                      transition: 'transform 0.15s ease-out'
                    }}
                  />

                  {/* Inner frame bounds cast-shadow on the film slip */}
                  <div className="absolute inset-0 pointer-events-none z-[3] shadow-[inset_0_2.5px_6px_rgba(0,0,0,0.92)]" />
                </>
              ) : (
                <div className="flex flex-col items-center justify-center text-stone-700 p-4 text-center pointer-events-none">
                  <Film className="w-5.5 h-5.5 text-stone-700 mb-1.5 stroke-[1.1] animate-pulse" />
                  <span className="text-[8px] font-mono tracking-widest text-stone-500 uppercase leading-none">EMPTY CAROUSEL</span>
                  <span className="text-[6px] text-stone-600 mt-1 uppercase font-semibold">Load exposures in the console below</span>
                </div>
              )}
            </div>

            {/* Bottom Manufacturer & Pencil Handwritten Indexing */}
            <div 
              className="flex justify-between items-end mb-1 z-10 text-[6.5px] font-mono tracking-wider font-semibold pointer-events-none"
              style={{ transform: 'translateZ(8px)' }}
            >
              <div 
                className="flex flex-col font-bold"
                style={{
                  color: emulsion === 'vintage-c41' 
                    ? '#B82D1E/80' 
                    : emulsion === 'tungsten-slide' 
                      ? '#1E4DB8/80' 
                      : '#555'
                }}
              >
                <span>MADE IN U.S.A.</span>
                <span className="opacity-70 mt-0.5">PROCESS K-14 • MCXXVI</span>
              </div>
              
              {/* Retro slate-pencil handwriting for catalog identification */}
              <div className="flex flex-col items-end pr-0.5">
                <span className="text-[#2b608a]/80 font-sans font-bold italic text-[11px] tracking-normal transform rotate-[-3deg] select-none scale-y-110">
                  # {activeFrame ? String(activeFrame.id).padStart(2, '0') : '00'}
                </span>
                <span className="text-stone-500/70 font-semibold uppercase text-[5.5px] tracking-widest">
                  {activeFrame ? activeFrame.meta || activeFrame.title.substring(0, 10) : 'BLANK EXP'}
                </span>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Right Side: Description and Control Panel */}
        <div className="flex-grow flex flex-col gap-4 max-w-md">
          <div className="border border-red-900/10 bg-red-950/[0.04] rounded-xl p-4 md:p-5 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <h3 className="text-zinc-200 text-xs font-mono font-bold uppercase tracking-wider">
                Unit 02: Interactive slide mount preview / 幻灯片搭载
              </h3>
            </div>
            
            <p className="text-[11px] text-stone-400 leading-relaxed font-sans">
              幻灯片（Slide Mount）为洗印流程的经典形态。冲洗干燥后的胶片将被裁切为单张，嵌入坚韧纸板或塑木框架中，通过经典卡盘幻灯投影仪（Slide Projector）放大显影。
            </p>

            <div className="bg-[#18181b]/40 rounded-lg p-3 border border-zinc-800/40 text-[10px] font-mono flex flex-col gap-1.5 text-zinc-400">
              <div className="flex justify-between">
                <span>DEVELOPED TOTAL / 已冲洗底片</span>
                <span className="text-[#FFB800] font-bold">{developedFrames.length} / 8</span>
              </div>
              <div className="flex justify-between border-t border-[#222]/60 pt-1.5">
                <span>CURRENT POSITION / 当前底片</span>
                <span className="text-zinc-200">
                  {developedFrames.length > 0 ? `EXP 0${activeFrame?.id || 1}` : 'N/A'}
                </span>
              </div>
            </div>
          </div>

          {/* Interactive slide selectors */}
          {developedFrames.length > 0 ? (
            <div className="flex items-center justify-between gap-3 bg-[#131315] border border-zinc-800/60 p-2.5 rounded-lg w-full">
              <button
                onClick={handlePrev}
                className="p-1 px-3 bg-[#1c1c1e] hover:bg-zinc-800 text-zinc-300 rounded text-xs font-mono transition-all flex items-center gap-1 font-bold tracking-wider cursor-pointer border border-zinc-800"
              >
                <ArrowLeft className="w-3.5 h-3.5 text-[#FFB800]" />
                PREV
              </button>
              
              <span className="text-[10px] text-zinc-400 font-mono tracking-wider">
                {activeFrameIndex + 1} / {developedFrames.length}
              </span>

              <button
                onClick={handleNext}
                className="p-1 px-3 bg-[#1c1c1e] hover:bg-zinc-800 text-zinc-300 rounded text-xs font-mono transition-all flex items-center gap-1 font-bold tracking-wider cursor-pointer border border-zinc-800"
              >
                NEXT
                <ArrowRight className="w-3.5 h-3.5 text-[#FFB800]" />
              </button>
            </div>
          ) : (
            <div className="bg-[#18181b]/30 border border-dashed border-zinc-800/80 rounded-lg p-4 text-center">
              <span className="text-[10.5px] font-mono text-amber-500/80 uppercase block">💡 Empty Exposure Slots</span>
              <p className="text-[10px] text-stone-500 leading-normal mt-1.5 font-sans">
                请在下方工作台<strong>“洗片液配方与底片工作台”</strong>载入预设复古示例或点击卡槽上传并在底片内装片。拥有洗印后的成品后，即可在此处加载经典的 Kodachrome 卡框！
              </p>
            </div>
          )}
        </div>

      </div>

      {/* Grid listing developed items to click to hot-mount */}
      {developedFrames.length > 1 && (
        <div className="w-full max-w-4xl bg-[#121214] border border-[#232326] rounded-xl p-4 shadow-xl mt-2 select-none animate-fadeIn">
          <div className="flex items-center gap-1.5 text-[9.5px] font-mono text-[#888] uppercase tracking-wider mb-2 border-b border-zinc-800 pb-1.5">
            <Layers className="w-3.5 h-3.5 text-[#FFB800]" />
            <span>Hot Mount Picker / 快捷卡盘插芯</span>
          </div>
          <div className="flex gap-2.5 overflow-x-auto pb-1">
            {developedFrames.map((frame, idx) => (
              <button
                key={frame.id}
                onClick={() => setActiveFrameIndex(idx)}
                className={`flex-shrink-0 flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-[10px] font-mono transition-all ${
                  developedFrames[activeFrameIndex]?.id === frame.id
                    ? 'bg-amber-950/40 border-amber-500/60 text-[#FFB800] font-bold shadow'
                    : 'bg-[#18181b]/40 border-zinc-800/60 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/20'
                }`}
              >
                <div className="w-3.5 h-3.5 rounded bg-black/40 overflow-hidden relative border border-zinc-800 flex-shrink-0">
                  <img src={frame.url} alt="" className="w-full h-full object-cover" style={{ filter: computedPhotoFilter }} />
                </div>
                <span>EXP 0{frame.id}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
