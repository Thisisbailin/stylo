import React from 'react';
import { motion } from 'motion/react';
import { CanisterStyle, PhysicsParams } from '../types';

interface CanisterProps {
  styleConfig: CanisterStyle;
  isOpen: boolean;
  onToggle: () => void;
  physics: PhysicsParams;
}

export const Canister: React.FC<CanisterProps> = ({
  styleConfig,
  isOpen,
  onToggle,
  physics,
}) => {
  const {
    id,
    name,
    primaryColor,
    accentColor,
    backgroundColor,
    textColor,
    brandText,
    iso,
    exp,
  } = styleConfig;

  // Canister 3D rotation and bounce effect using spring based on user physics
  const springTransition = {
    type: 'spring',
    stiffness: physics.stiffness,
    damping: physics.damping,
    mass: physics.mass,
  };

  return (
    <motion.div 
      id={`canister-wrapper-${id}`} 
      onClick={onToggle}
      className="relative select-none flex flex-col items-center cursor-pointer overflow-visible z-30 origin-center"
      animate={{
        // Subtle tension twist on Y to keep 3D depth intact without exposing the back side of flat element
        rotateY: isOpen ? -15 : 0,
        // Subtle tilt/wobble on the Z-axis for physical overshoot rebound
        rotateZ: isOpen ? -3.5 : 0,
        scale: isOpen ? 1.025 : 1,
        x: isOpen ? 6 : 0, // slight stretch shift to the right, simulating tension towards the film strip
      }}
      transition={springTransition}
      style={{ transformStyle: 'preserve-3d', perspective: 1000 }}
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.97 }}
    >


      {/* Dynamic Active Glow / Physical Halo Backglow when activated */}
      <motion.div
        className="absolute inset-x-[-10px] inset-y-[-7px] bg-gradient-to-r from-[#FFB800]/30 via-amber-500/15 to-transparent rounded-[30px] blur-xl -z-10 pointer-events-none"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ 
          opacity: isOpen ? 1 : 0, 
          scale: isOpen ? 1.15 : 0.92,
          filter: isOpen 
            ? ['blur(16px) brightness(1)', 'blur(20px) brightness(1.35)', 'blur(16px) brightness(1)']
            : 'blur(16px) brightness(1)',
        }}
        transition={{ 
          opacity: { duration: 0.4 },
          scale: { duration: 0.4 },
          filter: { repeat: Infinity, duration: 2.5, ease: 'easeInOut' }
        }}
      />

      {/* Spindle Top Cap (Center Axis Pin) with horizontal perspective */}
      <div className="w-[30px] h-[15px] relative z-10 flex justify-center items-end overflow-visible">
        <motion.div 
          className="w-[18px] h-[15px] bg-zinc-900 border border-zinc-700 shadow-md relative flex items-center justify-center overflow-hidden"
          style={{
            borderTopLeftRadius: '2px',
            borderTopRightRadius: '2px',
            background: 'linear-gradient(to right, #09090b 0%, #202025 40%, #09090b 80%, #020202 100%)',
          }}
          animate={{
            // Spin around Y axis (as the cylinder unspools side-to-side)
            rotateY: isOpen ? -360 * physics.rotationMultiplier : 0,
          }}
          transition={springTransition}
        >
          {/* Vertical core ridges seen from side perspective */}
          <div className="absolute inset-y-0 left-0.5 w-[1px] bg-zinc-800" />
          <div className="absolute inset-y-0 left-1.5 w-[1.5px] bg-zinc-700" />
          <div className="absolute inset-y-0 right-0.5 w-[1px] bg-zinc-800" />
          <div className="absolute inset-y-0 right-1.5 w-[1.5px] bg-zinc-700" />
          <div className="absolute top-0 inset-x-0 h-0.5 bg-zinc-950/80" />
        </motion.div>
      </div>

      {/* Main 3D Canister Cylinder (Scaled Down) */}
      <div
        id={`canister-body-${id}`}
        className="w-[108px] h-[168px] relative rounded-xl group overflow-visible z-20"
        style={{ perspective: 1000 }}
        title="点击展开/收起胶卷"
      >
        {/* Canister Top Metal Rim */}
        <div 
          className="absolute top-0 left-0 right-0 h-3 rounded-t-mg z-35 shadow-md"
          style={{
            background: 'linear-gradient(to right, #27272a 0%, #71717a 25%, #27272a 50%, #18181b 80%, #09090b 100%)',
            borderBottom: '1px solid #18181b',
          }}
        />

        {/* Canister Bottom Metal Rim */}
        <div 
          className="absolute bottom-0 left-0 right-0 h-3 rounded-b-mg z-35 shadow-md"
          style={{
            background: 'linear-gradient(to right, #27272a 0%, #71717a 25%, #27272a 50%, #18181b 80%, #09090b 100%)',
            borderTop: '1px solid #18181b',
          }}
        />

        {/* Canister felt trap slot (Where film exits) */}
        <div 
          className="absolute top-3 bottom-3 right-0 w-2.5 bg-zinc-950 z-30 flex flex-col justify-between"
          style={{
            background: 'linear-gradient(to right, #09090b 0%, #202024 40%, #0c0c0d 100%)',
            boxShadow: '-1.5px 0 4px rgba(0,0,0,0.5)',
          }}
        >
          {/* Subtle felt fiber texture details */}
          <div className="w-[1.5px] h-full bg-zinc-850 border-l border-zinc-900/40 absolute left-0.5 opacity-60"></div>
          <div className="w-[1.5px] h-full bg-[#FFB800]/30 absolute right-0.5 blur-[0.5px]"></div>
        </div>

        {/* Sticker Wrap Base */}
        <div 
          className="absolute top-2.5 bottom-2.5 left-0.5 right-1.5 rounded-sm overflow-hidden flex flex-col justify-between p-2 select-none"
          style={{
            background: `linear-gradient(to right, ${backgroundColor} 0%, ${primaryColor} 25%, ${primaryColor} 65%, ${backgroundColor} 90%, #0c0c0d 100%)`,
            boxShadow: 'inset 0 3px 8px rgba(255,255,255,0.15), inset 0 -3px 8px rgba(0,0,0,0.4)',
          }}
        >
          {/* Swipe light sheen sweep across Sticker when clicked */}
          <motion.div 
            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/35 to-transparent pointer-events-none -skew-x-20 z-40"
            initial={{ x: '-150%' }}
            animate={isOpen ? { x: ['-150%', '150%'] } : { x: '-150%' }}
            transition={{ duration: 0.7, ease: 'easeOut' }}
          />

          {/* Click active radiant shockwave bubble - starts small, flashes fiercely into a golden bubble */}
          <motion.div 
            className="absolute inset-[-4px] pointer-events-none rounded-lg z-35 mix-blend-screen"
            style={{
              background: 'radial-gradient(circle, rgba(255,255,255,0.85) 0%, rgba(255,184,0,0.45) 50%, transparent 100%)',
            }}
            initial={{ opacity: 0, scale: 0.7 }}
            animate={isOpen ? {
              opacity: [0, 0.9, 0],
              scale: [0.7, 1.25, 1.4],
            } : { opacity: 0, scale: 0.7 }}
            transition={{ duration: 0.55, ease: 'easeOut' }}
          />

          {/* Active Golden Glowing Border Outline */}
          <motion.div 
            className="absolute inset-0 rounded-sm border-[1px] border-[#FFB800]/0 pointer-events-none z-30"
            animate={{
              borderColor: isOpen ? 'rgba(255, 184, 0, 0.45)' : 'rgba(255, 184, 0, 0)',
              boxShadow: isOpen ? '0 0 8px rgba(255, 184, 0, 0.3)' : 'none',
            }}
            transition={{ duration: 0.35 }}
          />

          {/* Label Details */}
          
          {/* Brand/Heading block */}
          <div className="flex flex-col">
            <span className="text-[8px] font-mono tracking-widest opacity-80" style={{ color: textColor }}>
              35mm COLOR FILM
            </span>
            <div className="h-[1.5px] w-6 mt-0.5" style={{ backgroundColor: accentColor }}></div>
          </div>

          {/* Central Mega Number Graphic */}
          <div className="flex flex-col -my-1 items-start leading-none relative">
            <span className="text-[10px] font-bold tracking-wider opacity-90 uppercase" style={{ color: accentColor }}>
              {brandText}
            </span>
            <span className="text-3xl font-black tracking-tighter" style={{ color: textColor, textShadow: '1px 1px 0px rgba(0,0,0,0.2)' }}>
              {iso}
            </span>
            <span className="text-[7px] font-mono font-semibold tracking-widest mt-0.5 opacity-75" style={{ color: textColor }}>
              PROCESS C-41
            </span>
          </div>

          {/* Exposure count & Film details */}
          <div className="flex justify-between items-end border-t border-black/10 pt-1 mt-0.5">
            <div className="flex flex-col leading-tight">
              <span className="text-[7px] font-mono uppercase tracking-tight opacity-70" style={{ color: textColor }}>
                Exp.
              </span>
              <span className="text-[14px] font-black font-mono leading-none" style={{ color: accentColor }}>
                {exp}
              </span>
            </div>
            
            <div className="flex flex-col items-end leading-none">
              <span className="text-[6px] font-mono tracking-tighter opacity-60" style={{ color: textColor }}>
                DX CODE 023-A
              </span>
              <div className="flex gap-[1px] mt-0.5 bg-black p-0.5 rounded-[0.5px]">
                {/* Visual mock barcode block */}
                <div className="w-[1.5px] h-2 bg-white"></div>
                <div className="w-[0.5px] h-2 bg-black"></div>
                <div className="w-[2.5px] h-2 bg-white"></div>
                <div className="w-[0.5px] h-2 bg-white"></div>
                <div className="w-[1.5px] h-2 bg-black"></div>
                <div className="w-[0.5px] h-2 bg-white"></div>
                <div className="w-[2.5px] h-2 bg-white"></div>
              </div>
            </div>
          </div>

          {/* Canister Cylindrical reflection overlay */}
          <div className="absolute inset-0 bg-gradient-to-r from-white/10 via-transparent to-black/40 pointer-events-none mix-blend-overlay"></div>
          {/* Realistic glass shimmers */}
          <div className="absolute top-0 bottom-0 left-6 w-3 bg-white/5 blur-[0.5px] pointer-events-none"></div>
          <div className="absolute top-0 bottom-0 left-[55px] w-6 bg-black/15 pointer-events-none"></div>
        </div>
      </div>

      {/* Spindle Bottom Cap */}
      <div 
        className="w-9 h-2 bg-zinc-950 rounded-b shadow-md border-b border-zinc-800 -mt-0.5 z-10"
        style={{
          background: 'linear-gradient(to right, #09090b 0%, #1e1e24 40%, #09090b 80%, #020202 100%)',
        }}
      ></div>

      {/* Shadow layer representing the contact on light table */}
      <div className="w-24 h-2 bg-black/45 blur-md absolute -bottom-3 rounded-full pointer-events-none"></div>
    </motion.div>
  );
};
