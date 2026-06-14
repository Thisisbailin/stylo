import React, { useRef } from 'react';
import { motion } from 'motion/react';
import { FilmFrame, FilmFilter, PhysicsParams } from '../types';

interface FilmstripProps {
  frames: FilmFrame[];
  isOpen: boolean;
  onUploadImage: (frameId: string, url: string) => void;
  onUpdateFilter: (frameId: string, filter: FilmFilter) => void;
  onCutFrame: (frameId: string) => void;
  onDeleteFrame: (frameId: string) => void;
  onAddFrame: () => void;
  onDevelopScan: (frameId: string) => void;
  physics: PhysicsParams;
  onToggleCanister: () => void;
}

// Romantic and wistful excerpts from Marguerite Duras' "The Lover" (《情人》) and essays on the fading weight of light and memory.
const poeticParagraphs = [
  {
    text: "Très vite dans ma vie il a été trop tard. À dix-huit ans, il était déjà trop tard.",
    translation: "在我生命中极早的时候，一切就已经太迟了。在十八岁时，一切都已成为废墟。",
    style: { left: '80px', top: '15%', rotate: '-0.3deg', fontSize: '11px', opacity: 0.72 }
  },
  {
    text: "La lumière de ce jour-là était si forte qu'elle effaçait les contours, ne laissant que la pureté de l'oubli.",
    translation: "那天的阳光如此炽烈，它熔融了所有的轮廓，只留下纯粹的遗忘。",
    style: { left: '420px', top: '38%', rotate: '0.4deg', fontSize: '10.5px', opacity: 0.65 }
  },
  {
    text: "Écrire, c'est hurler sans bruit. C'est dire l'absence des images que la lumière a dévorées.",
    translation: "写作，是无声中发出的呐喊。是缄默。是去述说那些被光芒吞噬的、不复存在的影像。",
    style: { left: '760px', top: '18%', rotate: '-0.5deg', fontSize: '11.5px', opacity: 0.75 }
  },
  {
    text: "L'amour de ma vie, une pellicule brûlée par le soleil de l'après-midi... Une poésie disparue.",
    translation: "我一生的爱恋，恰似一卷被午后烈日灼伤的过曝胶片……一首退场的逝去之诗。",
    style: { left: '1120px', top: '42%', rotate: '0.3deg', fontSize: '10px', opacity: 0.68 }
  },
  {
    text: "Un secret gravé sur l'émulsion, lisible seulement sous la lumière de l'oubli, dans la splendeur vide.",
    translation: "一个刻在感光乳剂上的秘密，唯有在遗忘之光的照映下，方才隐约可读。",
    style: { left: '1460px', top: '22%', rotate: '-0.2deg', fontSize: '11px', opacity: 0.7 }
  }
];

export const Filmstrip: React.FC<FilmstripProps> = ({
  physics,
  isOpen,
  onToggleCanister,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Generate sprocket holes for 35mm
  const renderSprocketHoles = (count: number) => {
    return Array.from({ length: Math.max(12, Math.ceil(count)) }).map((_, i) => (
      <div 
        key={i} 
        className="w-[7px] h-[10px] rounded-[1.8px] border border-black/50 shadow-[inset_0_1px_1.5px_rgba(0,0,0,0.85)] bg-[#070708] flex-shrink-0 transition-all duration-300 pointer-events-none"
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
          width: isOpen ? 'calc(100% - 14px)' : '42px',
          clipPath: isOpen 
            ? 'polygon(0% 0%, calc(100% - 90px) 0%, calc(100% - 75px) 4%, calc(100% - 60px) 12%, calc(100% - 48px) 25%, calc(100% - 35px) 38%, calc(100% - 25px) 43%, calc(100% - 15px) 45%, 100% 45%, 100% 100%, 0% 100%)'
            : 'polygon(0% 0%, calc(100% - 30px) 0%, calc(100% - 27px) 4%, calc(100% - 24px) 12%, calc(100% - 20px) 25%, calc(100% - 17px) 38%, calc(100% - 15px) 43%, calc(100% - 13px) 45%, 100% 45%, 100% 100%, 0% 100%)',
        }}
        transition={springTransition}
        className="flex overflow-hidden origin-left items-center relative z-10 select-none group"
        style={{ 
          height: H,
        }}
      >
        {/* Core Transparent Amber Filmstrip Layer (Only active when closed, as open state carries its own scrolling background) */}
        {!isOpen && (
          <div 
            className="absolute inset-y-0 left-0 right-0 rounded-r-[3px]"
            style={{
              background: 'linear-gradient(to bottom, #100602 0%, #301406 15%, #421c08 15%, #381604 85%, #200c03 85%, #100602 100%)',
              boxShadow: '0 4px 15px rgba(0,0,0,0.5), inset 0 1px 2px rgba(255,255,255,0.06), inset 0 -1px 2px rgba(0,0,0,0.5)',
              borderRight: '1.5px solid rgba(0,0,0,0.6)',
            }}
          />
        )}

        {/* Gloss highlight over the leader tab */}
        {!isOpen && (
          <>
            <div className="absolute inset-0 bg-gradient-to-b from-white/10 via-transparent to-black/10 pointer-events-none z-20" />
            <div className="absolute top-1/4 left-0 right-0 h-[1px] bg-white/5 pointer-events-none z-20" />
          </>
        )}

        {/* Film leader tab when closed (The classic 35mm asymmetric contoured slant head) */}
        {!isOpen && (
          <div 
            onClick={onToggleCanister}
            className="absolute inset-y-0 right-0 w-[42px] cursor-pointer z-35"
            style={{
              height: H,
              background: 'linear-gradient(to bottom, #110703 0%, #3a1604 15%, #461c08 85%, #110703 100%)',
            }}
            title="Click to pull out filmstrip"
          >
            {/* Top sprocket hole inside leader before the slant begins */}
            <div className="absolute top-1.5 left-2 flex gap-1">
              <div className="w-1.5 h-2.5 rounded-[1.5px] bg-[#0A0A0B] border border-black/40"></div>
            </div>
            
            {/* Lead drag lever arrow highlight */}
            <div className="absolute top-[68%] right-2 transform -translate-y-1/2 flex items-center gap-1 text-[#FFB800] animate-pulse text-[9px] font-mono font-bold tracking-widest pl-1">
              <span>PULL</span>
              <span className="text-[10px] font-bold">▶</span>
            </div>

            {/* Bottom sprocket holes spanning the entire straight bottom edge */}
            <div className="absolute bottom-1.5 left-2 right-2 flex justify-between pr-3">
              <div className="w-1.5 h-2.5 rounded-[1.5px] bg-[#0A0A0B] border border-black/40"></div>
              <div className="w-1.5 h-2.5 rounded-[1.5px] bg-[#0A0A0B] border border-black/40"></div>
            </div>
          </div>
        )}

        {/* Continuous Overexposed Ribbon for aesthetic feedback (Active when open) */}
        {isOpen && (
          <div 
            className="w-full h-full overflow-x-auto overflow-y-hidden no-scrollbar relative z-10 flex items-center select-none"
            style={{ height: H }}
          >
            {/* The continuous scrolling tape track */}
            <div 
              className="relative h-full flex flex-col justify-between py-1 select-none flex-shrink-0"
              style={{ width: '1850px' }}
            >
              {/* Continuous tape background gradients & textures (Deep rich gelatinous dark cherry/burnt orange) */}
              <div 
                className="absolute inset-0 z-0"
                style={{
                  background: 'linear-gradient(to right, #1a0802 0%, #351206 5%, #561d07 15%, #7a2807 28%, #a2380a 42%, #ce4910 52%, #a2380a 63%, #7a2807 75%, #561d07 86%, #351206 95%, #1a0802 100%)',
                  boxShadow: 'inset 0 4px 14px rgba(0,0,0,0.95), inset 0 -4px 14px rgba(0,0,0,0.95)'
                }}
              />

              {/* Realistic glossy sheen vertical reflection lines */}
              <div className="absolute inset-x-0 h-full bg-gradient-to-b from-white/12 via-white/2 to-transparent/10 opacity-70 pointer-events-none z-10 mix-blend-overlay" />
              <div className="absolute top-1.5 bottom-1.5 left-[150px] w-[2px] bg-white/5 opacity-50 blur-[0.5px] z-10 pointer-events-none" />
              <div className="absolute top-1.5 bottom-1.5 left-[480px] w-[1px] bg-white/5 opacity-30 z-10 pointer-events-none" />
              <div className="absolute top-1.5 bottom-1.5 left-[880px] w-[3px] bg-white/5 opacity-40 blur-[1px] z-10 pointer-events-none" />
              <div className="absolute top-1.5 bottom-1.5 left-[1320px] w-[1px] bg-white/5 opacity-30 z-10 pointer-events-none" />

              {/* Intense light leak overlays simulating raw exposure curves */}
              <div 
                className="absolute inset-y-0 left-0 right-0 pointer-events-none z-10 mix-blend-screen opacity-70"
                style={{
                  background: `
                    radial-gradient(circle at 15% 35%, rgba(255, 220, 120, 0.45) 0%, rgba(234, 88, 12, 0.22) 28%, transparent 60%),
                    radial-gradient(circle at 48% 68%, rgba(255, 255, 255, 0.58) 0%, rgba(249, 115, 22, 0.28) 32%, transparent 65%),
                    radial-gradient(circle at 75% 25%, rgba(254, 215, 170, 0.45) 0%, rgba(217, 119, 6, 0.18) 35%, transparent 68%),
                    radial-gradient(circle at 92% 50%, rgba(255, 250, 220, 0.45) 0%, rgba(234, 88, 12, 0.25) 22%, transparent 55%)
                  `
                }}
              />

              {/* Precise film emulsion grain texture code */}
              <div 
                className="opacity-12 absolute inset-0 z-10 pointer-events-none mix-blend-overlay bg-repeat bg-center"
                style={{ 
                  backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noise\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.85\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noise)\'/%3E%3C/svg%3E")',
                  backgroundSize: '150px 150px',
                }} 
              />

              {/* TOP STRIP RUNWAY: Sprocket holes + technical stamps */}
              <div className="absolute top-0.5 left-0 right-0 h-[22px] flex flex-col justify-between z-20 pointer-events-none">
                {/* Horizontal row of sprockets */}
                <div className="w-full flex justify-between pr-3 select-none">
                  {renderSprocketHoles(135)}
                </div>

                {/* Stamped edge markers */}
                <div className="w-full px-5 flex justify-between items-center text-[5.5px] font-mono tracking-[0.25em] text-[#FFB800]/70 uppercase leading-none mt-1">
                  <div className="flex gap-40 w-full justify-around opacity-90">
                    <span>KODAK SAFETY FILM 5062</span>
                    <span>GB 200-7</span>
                    <span>PRO EMULSION PROCESS II</span>
                    <span>KODAK SAFETY FILM 5062</span>
                    <span>GB 200-7</span>
                  </div>
                </div>
              </div>

              {/* BOTTOM STRIP RUNWAY: Sprocket holes + index numbering */}
              <div className="absolute bottom-0.5 left-0 right-0 h-[22px] flex flex-col-reverse justify-between z-20 pointer-events-none">
                {/* Horizontal row of sprockets */}
                <div className="w-full flex justify-between pr-3 select-none">
                  {renderSprocketHoles(135)}
                </div>

                {/* Numbering markings and direction cues */}
                <div className="w-full px-8 flex justify-around items-center text-[7px] font-mono text-[#FFB800]/75 uppercase leading-none mb-1 font-semibold">
                  {Array.from({ length: 9 }).map((_, idx) => (
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

              {/* CENTRAL TRACK: Floating prose of Duras */}
              <div className="absolute inset-y-6 left-0 right-0 z-20 pointer-events-none overflow-hidden" style={{ height: H - 46 }}>
                {/* Simulated exposure bars/gates (Soft ambient gate transitions) */}
                {Array.from({ length: 9 }).map((_, i) => (
                  <div 
                    key={i}
                    className="absolute w-[1.5px] h-full pointer-events-none"
                    style={{
                      left: `${120 + i * 200}px`,
                      background: 'linear-gradient(to bottom, rgba(217,119,6,0.01) 0%, rgba(217,119,6,0.18) 20%, rgba(217,119,6,0.25) 50%, rgba(217,119,6,0.18) 80%, rgba(217,119,6,0.01) 100%)',
                      filter: 'blur(3px)',
                      mixBlendMode: 'screen'
                    }}
                  />
                ))}

                {/* Poetry whispers written into the exposure */}
                {poeticParagraphs.map((para, idx) => (
                  <div
                    key={idx}
                    className="absolute flex flex-col pointer-events-none select-none max-w-[340px] px-2 leading-relaxed"
                    style={{
                      left: para.style.left,
                      top: para.style.top,
                      transform: `rotate(${para.style.rotate})`,
                    }}
                  >
                    <p 
                      className="font-serif italic font-medium tracking-wide antialiased transition-all"
                      style={{
                        fontSize: para.style.fontSize,
                        // Mix dark silver halide silver and bright burning positive golds
                        color: idx % 2 === 0 ? '#1b0702' : '#ffdfbd',
                        opacity: para.style.opacity,
                        textShadow: idx % 2 === 0 
                          ? '1px 1px 1.5px rgba(251,191,36,0.08)' 
                          : '0 0 5px rgba(251,146,60,0.25)',
                        letterSpacing: '0.04em'
                      }}
                    >
                      {para.text}
                    </p>
                    <p 
                      className="font-serif font-light tracking-[0.15em] leading-normal antialiased mt-0.5 pl-[1px] transition-all"
                      style={{
                        fontSize: '7.5px',
                        color: idx % 2 === 0 ? '#260a02' : '#fed7aa',
                        opacity: para.style.opacity - 0.15,
                        letterSpacing: '0.12em'
                      }}
                    >
                      {para.translation}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
};
