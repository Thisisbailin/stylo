import React, { useRef } from 'react';
import { motion } from 'framer-motion';
import { PhysicsParams } from '../types';

interface FilmstripProps {
  isOpen: boolean;
  physics: PhysicsParams;
  onToggleCanister: () => void;
}

export const Filmstrip: React.FC<FilmstripProps> = ({
  physics,
  isOpen,
  onToggleCanister,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Generate sprocket holes for 35mm
  // We render 35 holes which cover up to ~510px, plenty for the maximum 420px open width limit.
  const renderSprocketHoles = () => {
    return Array.from({ length: 35 }).map((_, i) => (
      <div 
        key={i} 
        className="w-[7px] h-[10px] rounded-[1.8px] border border-black/50 shadow-[inset_0_1px_1.5px_rgba(0,0,0,0.85)] bg-[#070708] flex-shrink-0 pointer-events-none"
        style={{
          margin: '0 3.8px',
        }}
      />
    ));
  };

  // Spring animation transition based on physics configuration
  const springTransition = {
    type: 'spring',
    stiffness: physics.stiffness,
    damping: physics.damping,
    mass: physics.mass,
  };

  const H = physics.filmstripHeight ?? 114;
  const closedW = physics.closedWidth ?? 64;
  const openW = physics.openWidth ?? 320;

  // Stable clipPath for the 35mm film leader curve, keeping it completely consistent
  // and non-deforming in both open and closed states.
  // Standard 35mm film has a straight top edge and a bottom edge that is cut away
  // in an elegant S-curve to form the loading leader tongue at the top.
  const leaderClipPath = 'polygon(0% 0%, 100% 0%, 100% 45%, calc(100% - 12px) 45%, calc(100% - 20px) 48%, calc(100% - 28px) 58%, calc(100% - 34px) 75%, calc(100% - 40px) 90%, calc(100% - 45px) 100%, 0% 100%)';

  return (
    <div 
      id="filmstrip-container" 
      ref={containerRef}
      className="relative flex items-center select-none pl-0 overflow-visible w-full"
      style={{ height: H + 32 }}
    >
      {/* Lightbeam guide */}
      <div className="absolute inset-y-0 left-0 w-[4px] bg-sky-500/0 z-40" />

      {/* Leader & Roller wrapper */}
      <motion.div
        id="filmstrip-roller-wrapper"
        initial={false}
        animate={{
          width: isOpen ? `${openW}px` : `${closedW}px`,
          clipPath: leaderClipPath,
        }}
        transition={springTransition}
        onClick={onToggleCanister}
        className="flex overflow-hidden origin-left items-center relative z-10 select-none group cursor-pointer"
        style={{ 
          height: H,
        }}
        title={isOpen ? "Click to retract filmstrip" : "Click to pull out filmstrip"}
      >
        {/* ========================================== */}
        {/* 1. LAYER: BASE PHYSICAL ACETATE TAPE      */}
        {/* ========================================== */}
        <div 
          className="absolute inset-y-0 left-0 right-0 rounded-r-[3px] transition-all duration-500 z-0"
          style={{
            // Rich professional acetate tape base gradient
            background: 'linear-gradient(to bottom, #080302 0%, #150804 15%, #1d0a05 15%, #150804 85%, #0d0502 85%, #080302 100%)',
            boxShadow: '0 4px 15px rgba(0,0,0,0.65), inset 0 1px 2px rgba(255,255,255,0.03), inset 0 -1px 2px rgba(0,0,0,0.6)',
            borderRight: '1.5px solid rgba(0,0,0,0.4)',
          }}
        />

        {/* ========================================== */}
        {/* 2. LAYER: ORGANIC GLOSS SHEEN             */}
        {/* ========================================== */}
        <div className="absolute inset-0 bg-gradient-to-b from-white/10 via-transparent to-black/10 pointer-events-none z-10" />
        <div className="absolute top-1/4 left-0 right-0 h-[1px] bg-white/5 pointer-events-none z-10" />

        {/* ========================================== */}
        {/* 3. LAYER: INTENSE WARM EMULSION GLOW        */}
        {/* ========================================== */}
        <div 
          className="absolute inset-0 z-[2] transition-opacity duration-700 pointer-events-none"
          style={{
            opacity: isOpen ? 1 : 0,
            background: 'linear-gradient(to right, #090301 0%, #170802 10%, #2a0e03 20%, #361304 35%, #421705 50%, #361304 65%, #2a0e03 80%, #170802 90%, #090301 100%)',
            boxShadow: 'inset 0 4px 14px rgba(0,0,0,0.95), inset 0 -4px 14px rgba(0,0,0,0.95)'
          }}
        />

        {/* ========================================== */}
        {/* 4. LAYER: REALISTIC LIGHT LEAKS OVERLAYS   */}
        {/* ========================================== */}
        <div 
          className="absolute inset-0 z-[3] pointer-events-none mix-blend-screen transition-opacity duration-700"
          style={{
            opacity: isOpen ? 0.22 : 0,
            background: `
              radial-gradient(circle at 15% 35%, rgba(255, 180, 80, 0.22) 0%, rgba(234, 88, 12, 0.1) 28%, transparent 60%),
              radial-gradient(circle at 48% 68%, rgba(255, 255, 255, 0.25) 0%, rgba(249, 115, 22, 0.12) 32%, transparent 65%),
              radial-gradient(circle at 75% 25%, rgba(254, 215, 170, 0.2) 0%, rgba(217, 119, 6, 0.08) 35%, transparent 68%),
              radial-gradient(circle at 92% 50%, rgba(255, 220, 180, 0.2) 0%, rgba(234, 88, 12, 0.12) 22%, transparent 55%)
            `
          }}
        />

        {/* ========================================== */}
        {/* 5. LAYER: FILM EMULSION GRAIN              */}
        {/* ========================================== */}
        <div 
          className="absolute inset-0 z-[4] pointer-events-none mix-blend-overlay bg-repeat bg-center transition-opacity duration-500"
          style={{ 
            opacity: isOpen ? 0.12 : 0.04,
            backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noise\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.85\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noise)\'/%3E%3C/svg%3E")',
            backgroundSize: '150px 150px',
          }} 
        />

        {/* ========================================== */}
        {/* 6. SYSTEM: SPROCKETS & TEXT RUNWAYS (TOP)  */}
        {/* ========================================== */}
        <div className="absolute top-0.5 left-0 right-0 h-[22px] flex flex-col justify-between z-[5] pointer-events-none select-none">
          {/* Horizontal row of sprockets - automatically revealed as width expands */}
          <div className="w-full flex justify-start pl-1 pr-3 overflow-hidden select-none">
            {renderSprocketHoles()}
          </div>

          {/* Stamped edge markers - fades in as we extend */}
          <div 
            className="w-full px-5 flex justify-between items-center text-[5.5px] font-mono tracking-[0.25em] text-[#FFB800]/70 uppercase leading-none mt-1 transition-opacity duration-500"
            style={{ opacity: isOpen ? 0.9 : 0 }}
          >
            <div className="flex gap-40 w-full justify-around">
              <span>KODAK SAFETY FILM 5062</span>
              <span>GB 200-7</span>
            </div>
          </div>
        </div>

        {/* ========================================== */}
        {/* 7. SYSTEM: SPROCKETS & TEXT RUNWAYS (BOT)  */}
        {/* ========================================== */}
        <div className="absolute bottom-0.5 left-0 right-0 h-[22px] flex flex-col-reverse justify-between z-[5] pointer-events-none select-none">
          {/* Horizontal row of sprockets - automatically revealed as width expands */}
          <div className="w-full flex justify-start pl-1 pr-3 overflow-hidden select-none">
            {renderSprocketHoles()}
          </div>

          {/* Numbering markings and direction cues - fades in as we extend */}
          <div 
            className="w-full px-8 flex justify-around items-center text-[7px] font-mono text-[#FFB800]/75 uppercase leading-none mb-1 font-semibold transition-opacity duration-500"
            style={{ opacity: isOpen ? 0.9 : 0 }}
          >
            {Array.from({ length: 3 }).map((_, idx) => (
              <div key={idx} className="flex items-center gap-16 select-none">
                <span>▶ {idx + 1}</span>
                <span className="text-[5.5px] opacity-60">BA {idx + 1}A</span>
                {/* Barcode representation */}
                <div className="flex gap-[0.5px] h-1.5 p-[0.5px] bg-[#FFB800]/25 rounded-[0.5px]">
                  <div className="w-[0.5px] h-full bg-[#FFB800]/80"></div>
                  <div className="w-[1.5px] h-full bg-[#FFB800]/80"></div>
                  <div className="w-[0.5px] h-full bg-[#FFB800]/80"></div>
                  <div className="w-[1px] h-full bg-[#FFB800]/80"></div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ========================================== */}
        {/* 8. TRACK: EXPOSURE VERTICAL GATES          */}
        {/* ========================================== */}
        <div 
          className="absolute inset-y-6 left-0 right-0 z-[4] pointer-events-none overflow-hidden transition-opacity duration-700" 
          style={{ height: H - 46, opacity: isOpen ? 1 : 0 }}
        >
          {Array.from({ length: 3 }).map((_, i) => (
            <div 
              key={i}
              className="absolute w-[1.5px] h-full pointer-events-none"
              style={{
                left: `${120 + i * 150}px`,
                background: 'linear-gradient(to bottom, rgba(217,119,6,0.01) 0%, rgba(217,119,6,0.18) 20%, rgba(217,119,6,0.25) 50%, rgba(217,119,6,0.18) 80%, rgba(217,119,6,0.01) 100%)',
                filter: 'blur(3px)',
                mixBlendMode: 'screen'
              }}
            />
          ))}
        </div>

        {/* ========================================== */}
        {/* 9. CONTROLS: INTERACTIVE PULL DRAG LABELS  */}
        {/* ========================================== */}
        <div 
          className="absolute right-2.5 flex items-center gap-1 text-[#FFB800] z-[6] pointer-events-none transition-all duration-300"
          style={{
            top: '22.5%',
            opacity: isOpen ? 0 : 1,
            transform: isOpen ? 'translateY(-50%) scale(0.8) translateX(10px)' : 'translateY(-50%)',
          }}
        >
          <span className="text-[9px] font-mono font-bold tracking-widest leading-none pl-1">PULL</span>
          <span className="text-[10px] font-bold leading-none">▶</span>
        </div>

      </motion.div>
    </div>
  );
};
