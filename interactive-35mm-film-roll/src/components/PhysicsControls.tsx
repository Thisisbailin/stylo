import React from 'react';
import { PhysicsParams, CanisterBrand, CanisterStyle } from '../types';
import { Sliders, RotateCcw, Image, Palette, Info } from 'lucide-react';

interface PhysicsControlsProps {
  physics: PhysicsParams;
  setPhysics: React.Dispatch<React.SetStateAction<PhysicsParams>>;
  selectedBrand: CanisterBrand;
  onBrandChange: (brand: CanisterBrand) => void;
  brands: CanisterStyle[];
  onResetPhysics: () => void;
}

export const PhysicsControls: React.FC<PhysicsControlsProps> = ({
  physics,
  setPhysics,
  selectedBrand,
  onBrandChange,
  brands,
  onResetPhysics,
}) => {
  const handleSliderChange = (key: keyof PhysicsParams, val: number) => {
    setPhysics((prev) => ({
      ...prev,
      [key]: val,
    }));
  };

  return (
    <div id="physics-controls-panel" className="bg-[#111112] border border-[#222] rounded-xl p-5 md:p-6 shadow-2xl text-zinc-100 flex flex-col gap-6 select-none animate-fadeIn">
      
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#222] pb-3">
        <div className="flex items-center gap-2">
          <Sliders className="w-5 h-5 text-[#FFB800]" />
          <h2 className="text-sm font-semibold uppercase tracking-widest text-[#FFB800]">Darkroom Controls & Resonance</h2>
        </div>
        <div className="text-[10px] font-mono bg-[#1A1A1A] border border-[#333] px-2.5 py-0.5 rounded text-stone-400 tracking-wider">
          CALCULUS ENGINE v1.2
        </div>
      </div>

      {/* Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Column 1: Canister Styles Selector */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 text-[10px] font-mono tracking-widest text-[#6B7280] uppercase">
            <Palette className="w-3.5 h-3.5 text-[#FFB800]" />
            <span>EMULSION SKIN SELECTOR</span>
          </div>

          <div className="grid grid-cols-2 gap-2 mt-1">
            {brands.map((brand) => (
              <button
                key={brand.id}
                onClick={() => onBrandChange(brand.id)}
                className={`flex flex-col p-2.5 rounded border text-left transition-all duration-200 active:scale-95 ${
                  selectedBrand === brand.id
                    ? 'bg-[#1A1A1A] border-[#FFB800] shadow-sm'
                    : 'bg-[#0A0A0B]/40 border-[#222] hover:bg-[#1A1A1A] hover:border-zinc-700'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <div 
                    className="w-3.5 h-3.5 rounded-full border border-black/30 shadow-inner" 
                    style={{ backgroundColor: brand.primaryColor === '#ffe02e' ? '#eab308' : brand.primaryColor }}
                  />
                  <span className="text-[11px] font-mono leading-none capitalize text-zinc-200">
                    {brand.id.split('-')[0]}
                  </span>
                </div>
                <div className="text-[9px] text-[#6B7280] mt-1 font-sans truncate pr-1 uppercase">
                  {brand.name.replace('Style', '')}
                </div>
              </button>
            ))}
          </div>

          <div className="mt-2 bg-[#0A0A0B]/60 border border-[#222] p-3 rounded flex gap-2">
            <Info className="w-4 h-4 text-[#FFB800]/80 flex-shrink-0 mt-0.5" />
            <p className="text-[10px] text-stone-500 leading-normal font-sans">
              Changing the canister type swaps the physical brand aesthetics, ISO ratings, and DX coding details.
            </p>
          </div>
        </div>

        {/* Column 2: Spring Damping Physics Setup */}
        <div className="flex flex-col gap-4 lg:border-x lg:border-[#222] lg:px-6">
          <div className="flex items-center justify-between text-[10px] font-mono tracking-widest text-[#6B7280] uppercase">
            <div className="flex items-center gap-2">
              <Sliders className="w-3.5 h-3.5 text-[#FFB800]" />
              <span>DAMPING COEFFICIENTS</span>
            </div>
            <button
              onClick={onResetPhysics}
              className="text-stone-500 hover:text-[#FFB800] transition-colors p-0.5 rounded"
              title="Reset physics properties"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex flex-col gap-3 mt-1.5">
            {/* Slider 1: Damping */}
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between text-[11px] font-mono text-zinc-400">
                <span>DAMPING (FRICTION)</span>
                <span className="text-[#FFB800] font-bold">{physics.damping} N·s/m</span>
              </div>
              <input
                type="range"
                min="5"
                max="45"
                step="1"
                value={physics.damping}
                onChange={(e) => handleSliderChange('damping', Number(e.target.value))}
                className="w-full accent-[#FFB800] h-1 bg-[#1A1A1A] rounded cursor-pointer"
              />
              <span className="text-[8px] text-stone-500 tracking-wider">
                Controls ribbon recoil. High values prevent jittering; low values bounce elastically.
              </span>
            </div>

            {/* Slider 2: Stiffness */}
            <div className="flex flex-col gap-1.5 mt-1">
              <div className="flex justify-between text-[11px] font-mono text-zinc-400">
                <span>STIFFNESS (REBOUND)</span>
                <span className="text-[#FFB800] font-bold">{physics.stiffness} N/m</span>
              </div>
              <input
                type="range"
                min="40"
                max="300"
                step="5"
                value={physics.stiffness}
                onChange={(e) => handleSliderChange('stiffness', Number(e.target.value))}
                className="w-full accent-[#FFB800] h-1 bg-[#1A1A1A] rounded cursor-pointer"
              />
              <span className="text-[8px] text-stone-500 tracking-wider">
                Springiness of unspool. High values snap rapidly; low values glide lazily.
              </span>
            </div>

            {/* Slider 3: Spool Rotation */}
            <div className="flex flex-col gap-1.5 mt-1">
              <div className="flex justify-between text-[11px] font-mono text-zinc-400">
                <span>ROTATION MULTIPLIER</span>
                <span className="text-[#FFB800] font-bold">{physics.rotationMultiplier}x</span>
              </div>
              <input
                type="range"
                min="1"
                max="5"
                step="0.5"
                value={physics.rotationMultiplier}
                onChange={(e) => handleSliderChange('rotationMultiplier', Number(e.target.value))}
                className="w-full accent-[#FFB800] h-1 bg-[#1A1A1A] rounded cursor-pointer"
              />
              <span className="text-[8px] text-stone-500 tracking-wider">
                Internal spool spin frequency on extraction pull.
              </span>
            </div>

            {/* Slider 4: Dynamic Filmstrip Height */}
            <div className="flex flex-col gap-1.5 mt-1">
              <div className="flex justify-between text-[11px] font-mono text-zinc-400">
                <span>FILMSTRIP HEIGHT</span>
                <span className="text-[#FFB800] font-bold">{physics.filmstripHeight ?? 152} px</span>
              </div>
              <input
                type="range"
                min="110"
                max="245"
                step="2"
                value={physics.filmstripHeight ?? 152}
                onChange={(e) => handleSliderChange('filmstripHeight', Number(e.target.value))}
                className="w-full accent-[#FFB800] h-1 bg-[#1A1A1A] rounded cursor-pointer"
              />
              <span className="text-[8px] text-stone-500 tracking-wider">
                Height scale of physical acetate tape roll.
              </span>
            </div>

            {/* Slider 5: Retracted Length (Closed) */}
            <div className="flex flex-col gap-1.5 mt-1">
              <div className="flex justify-between text-[11px] font-mono text-zinc-400">
                <span>RETRACTED LENGTH (CLOSED)</span>
                <span className="text-[#FFB800] font-bold">{physics.closedWidth ?? 64} px</span>
              </div>
              <input
                type="range"
                min="45"
                max="120"
                step="2"
                value={physics.closedWidth ?? 64}
                onChange={(e) => handleSliderChange('closedWidth', Number(e.target.value))}
                className="w-full accent-[#FFB800] h-1 bg-[#1A1A1A] rounded cursor-pointer"
              />
              <span className="text-[8px] text-stone-500 tracking-wider">
                Length of the film leader sticking out of the canister when rolled in.
              </span>
            </div>

            {/* Slider 6: Unspooled Length (Open) */}
            <div className="flex flex-col gap-1.5 mt-1">
              <div className="flex justify-between text-[11px] font-mono text-zinc-400">
                <span>UNSPOOLED LENGTH (OPEN)</span>
                <span className="text-[#FFB800] font-bold">{physics.openWidth ?? 320} px</span>
              </div>
              <input
                type="range"
                min="150"
                max="650"
                step="5"
                value={physics.openWidth ?? 320}
                onChange={(e) => handleSliderChange('openWidth', Number(e.target.value))}
                className="w-full accent-[#FFB800] h-1 bg-[#1A1A1A] rounded cursor-pointer"
              />
              <span className="text-[8px] text-stone-500 tracking-wider">
                Maximum extension distance of the film strip when fully pulled out.
              </span>
            </div>
          </div>
        </div>

        {/* Column 3: Project Philosophy */}
        <div className="flex flex-col gap-4">
          <div className="text-[10px] font-mono tracking-widest text-[#6B7280] uppercase">
            <span>PROJECT PHILOSOPHY / 胶片重塑</span>
          </div>

          <div className="bg-[#0A0A0B]/60 border border-[#222] p-4 rounded flex flex-col gap-3">
            <h3 className="text-xs font-bold text-zinc-100 uppercase tracking-wider">PROJECT #01: TACTILE COIL</h3>
            <p className="text-[11px] text-stone-400 leading-relaxed font-sans">
              这是我们“胶片实验室”的第一个交互实验。我们将 35-毫米 醋酸树脂胶片（Acetate Base）的物理弹性与弹簧机械模型耦合。
            </p>
            <p className="text-[11px] text-stone-500 leading-relaxed font-sans">
              过光的橙红色基底在拉出时，暗盒天鹅绒防光缝（Felt Exit Slot）赋予其拉扯摩擦。每一次收缩回弹，都是一次高保真的机械回弹与阻尼振荡。
            </p>
          </div>

          <div className="text-[9px] text-[#6B7280] font-mono mt-auto pt-2 border-t border-[#222]">
            * Analog Design Lab © 2026. All rights reserved.
          </div>
        </div>

      </div>

    </div>
  );
};
