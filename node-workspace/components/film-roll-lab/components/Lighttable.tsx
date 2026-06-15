import React, { useState, useRef } from 'react';
import { FilmFrame, FilmFilter } from '../types';
import { Download, Trash2, Maximize2, Search, Sliders, Sparkles, X } from 'lucide-react';

interface LighttableProps {
  splitSlides: FilmFrame[];
  onDeleteSlide: (id: string) => void;
  onClearSlides: () => void;
  onExportFilmstripPNG: () => void;
}

export const Lighttable: React.FC<LighttableProps> = ({
  splitSlides,
  onDeleteSlide,
  onClearSlides,
  onExportFilmstripPNG,
}) => {
  const [selectedSlide, setSelectedSlide] = useState<FilmFrame | null>(null);
  const [loupePosition, setLoupePosition] = useState({ x: 50, y: 50 }); // loupe zoom position
  const glassRef = useRef<HTMLDivElement>(null);

  const getFilterStyle = (filter: FilmFilter, isScanned?: boolean) => {
    if (filter === 'negative' && !isScanned) {
      return {
        filter: 'invert(1) sepia(0.65) saturate(1.8) hue-rotate(170deg) contrast(1.15) brightness(0.9)',
      };
    }
    if (filter === 'negative' && isScanned) {
      return {
        filter: 'contrast(1.05) brightness(1.02) saturate(1.1) sepia(0.15)',
      };
    }
    switch (filter) {
      case 'grayscale':
        return { filter: 'grayscale(1) contrast(1.2)' };
      case 'vintage':
        return { filter: 'sepia(0.65) contrast(0.95) saturate(1.3) hue-rotate(-5deg) brightness(1.02)' };
      case 'cyanotype':
        return { filter: 'grayscale(1) sepia(1) hue-rotate(190deg) saturate(3) contrast(1.1) brightness(0.95)' };
      case 'sunset':
        return { filter: 'saturate(2) contrast(1.15) brightness(1.05) sepia(0.35) hue-rotate(-15deg)' };
      case 'positive':
      default:
        return { filter: 'contrast(1.05) saturate(1.05)' };
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!glassRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setLoupePosition({ x, y });
  };

  return (
    <div id="lighttable-panel" className="bg-[#111112] border border-[#222] rounded-xl overflow-hidden shadow-2xl flex flex-col select-none animate-fadeIn">
      
      {/* Lighttable Header */}
      <div className="bg-[#0A0A0B] px-5 py-4 border-b border-[#222] flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-2.5">
          <Sparkles className="text-[#FFB800] w-5 h-5 animate-pulse" />
          <div>
            <h2 className="text-zinc-100 font-semibold text-sm uppercase tracking-widest">
              Photographic Light Table
            </h2>
            <p className="text-[10px] text-[#6B7280] font-mono mt-0.5 uppercase tracking-wider">
              INSPECT SPLIT 35mm SLIDES & EXPORT PANORAMAS
            </p>
          </div>
        </div>

        <div className="flex gap-2.5 w-full sm:w-auto">
          {splitSlides.length > 0 && (
            <button
              onClick={onExportFilmstripPNG}
              className="bg-white hover:bg-[#E5E7EB] text-black text-xs font-mono font-bold px-3 py-1.5 rounded flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all uppercase tracking-wider cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Export Panoramic Roll (PNG)
            </button>
          )}

          <button
            onClick={onClearSlides}
            disabled={splitSlides.length === 0}
            className={`text-xs font-mono px-3 py-1.5 rounded border transition-all uppercase tracking-wider ${
              splitSlides.length > 0
                ? 'text-stone-400 hover:text-white border-[#333] hover:border-zinc-700 bg-[#1A1A1A] cursor-pointer'
                : 'text-stone-600 border-[#222] bg-[#0A0A0B]/40 cursor-not-allowed'
            }`}
          >
            Clear Lighttable ({splitSlides.length})
          </button>
        </div>
      </div>

      {/* Light Desk Glow Stage */}
      <div 
        className="p-6 md:p-8 flex flex-col items-center justify-center relative min-h-[300px]"
        style={{
          background: 'radial-gradient(circle, #FCFCFA 0%, #EFECE6 100%)',
          boxShadow: 'inset 0 10px 40px rgba(0,0,0,0.18)',
        }}
      >
        {/* Subtle grid paper overlay representing professional workspace */}
        <div 
          className="absolute inset-0 opacity-70 pointer-events-none mix-blend-overlay"
          style={{
            backgroundImage: 'radial-gradient(#1c1917 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }}
        />

        {splitSlides.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-stone-600 py-12 max-w-sm text-center relative z-10 animate-fadeIn">
            <Search className="w-10 h-10 text-stone-400 mb-3 stroke-[1.5]" />
            <h3 className="font-mono text-xs uppercase tracking-widest text-[#222] font-semibold">Light Table Empty</h3>
            <p className="text-[11px] text-stone-500 leading-relaxed mt-2 font-sans">
              Pull out the film roll, upload images, and click <strong className="font-semibold text-amber-900">"Split Frame"</strong> beneath any cell to cut out beautiful standalone trans-light slides. They'll drop right onto this glowing sheet!
            </p>
          </div>
        ) : (
          <div className="w-full grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6 relative z-10">
            {splitSlides.map((slide) => (
              <div
                key={slide.id}
                className="bg-[#FCFCF9] p-2 border border-stone-300 shadow-lg hover:shadow-2xl transition-all duration-300 relative group flex flex-col items-center rounded-sm"
                style={{
                  transform: `rotate(${((slide.index * 7) % 11) - 5}deg)`, // random aesthetic tilt
                }}
              >
                {/* 35mm mounted slide look */}
                <div 
                  onClick={() => setSelectedSlide(slide)}
                  className="w-full aspect-square bg-[#0C0C0D] p-1 shadow-inner relative overflow-hidden cursor-zoom-in group-hover:brightness-105"
                >
                  {/* Sprocket notch mock for single slide mount */}
                  <div className="absolute top-0 bottom-0 left-[-4px] w-[2px] bg-white opacity-40"></div>

                  <img
                    src={slide.imageUrl || ''}
                    alt="Slide preview"
                    className="w-full h-full object-cover rounded-[1px]"
                    style={getFilterStyle(slide.filter, slide.isScanned)}
                    referrerPolicy="no-referrer"
                  />

                  {/* Negative Cast Highlight Overlay */}
                  {slide.filter === 'negative' && !slide.isScanned && (
                    <div className="absolute inset-0 bg-[#e05307]/15 pointer-events-none mix-blend-color-burn" />
                  )}

                  {/* Slide numbering */}
                  <div className="absolute bottom-1 right-2 bg-stone-900/80 rounded px-1.5 py-0.5 text-[7px] text-[#FFB800] font-mono leading-none">
                    #{slide.index}
                  </div>
                </div>

                {/* Mounted cardboard slide labeling info */}
                <div className="w-full mt-2 text-center flex flex-col items-center">
                  <span className="text-[9px] font-mono font-bold text-stone-800">
                    SLIDE {slide.index}A
                  </span>
                  <span className="text-[7px] font-sans font-medium text-stone-500 uppercase tracking-widest leading-none mt-0.5">
                    {slide.isScanned ? 'Developed' : 'Negative base'}
                  </span>
                </div>

                {/* Action hovering tags */}
                <div className="absolute -top-2 -right-2 flex gap-1 scale-0 group-hover:scale-100 transition-transform duration-200 z-20">
                  <button
                    onClick={() => setSelectedSlide(slide)}
                    className="p-1.5 bg-[#1C1C1E] hover:bg-stone-800 text-stone-200 rounded-full shadow-lg border border-[#333]"
                    title="Inspect slide with Loupe magnifier"
                  >
                    <Maximize2 className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => onDeleteSlide(slide.id)}
                    className="p-1.5 bg-red-950/90 hover:bg-red-900 text-rose-200 rounded-full shadow-lg border border-red-900/40"
                    title="Discard slide slide"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Slide Loupe Loupe Overlay Modal */}
      {selectedSlide && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#111112] border border-[#222] rounded-xl max-w-lg w-full overflow-hidden flex flex-col p-5 relative shadow-2xl animate-scaleUp">
            
            {/* Close */}
            <button
              onClick={() => setSelectedSlide(null)}
              className="absolute top-4 right-4 text-stone-400 hover:text-white bg-[#1A1A1A] hover:bg-zinc-800 p-2 rounded-full transition-all border border-[#222]"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="border-b border-[#222] pb-3 mb-4">
              <h3 className="text-zinc-100 text-xs font-mono uppercase tracking-widest text-[#FFB800] font-bold">
                Loupe Magnifier: Slide #{selectedSlide.index}
              </h3>
              <p className="text-[9px] text-[#6B7280] font-mono mt-0.5 uppercase tracking-wider">
                HOVER OVER CHASSIS FOR PHYSICAL 4X GLASS ZOOM ENGINE
              </p>
            </div>

            {/* Magnifying interactive frame */}
            <div 
              className="w-full aspect-[3/2] bg-[#0d0d0f] relative overflow-hidden rounded border border-[#222] cursor-none group"
              onMouseMove={handleMouseMove}
            >
              {/* Core Image */}
              <img
                src={selectedSlide.imageUrl || ''}
                alt="Magnifying display"
                className="w-full h-full object-cover brightness-95"
                style={getFilterStyle(selectedSlide.filter, selectedSlide.isScanned)}
                referrerPolicy="no-referrer"
              />

              {/* Dynamic Photographers Slide loupe magnifier dome */}
              <div
                ref={glassRef}
                className="hidden group-hover:block absolute w-48 h-48 rounded-full border-[6px] border-zinc-400 bg-white/5 shadow-[0_20px_50px_rgba(0,0,0,0.8),inset_0_2px_15px_rgba(255,255,255,0.7)] pointer-events-none z-30"
                style={{
                  left: `calc(${loupePosition.x}% - 96px)`,
                  top: `calc(${loupePosition.y}% - 96px)`,
                  backgroundImage: `url(${selectedSlide.imageUrl || ''})`,
                  backgroundPosition: `${loupePosition.x}% ${loupePosition.y}%`,
                  backgroundSize: '400% 400%', // zoomed multiplier 4x
                  backgroundRepeat: 'no-repeat',
                  // Map appropriate slide filters to the zoomed loupe glass
                  ...getFilterStyle(selectedSlide.filter, selectedSlide.isScanned),
                }}
              >
                {/* Loupe glare glass circles */}
                <div className="absolute inset-2 border border-white/20 rounded-full animate-pulse" />
                <div className="absolute top-4 left-6 w-12 h-6 bg-white/25 rounded-full blur-[1px] rotate-12" />
                <div className="absolute bottom-4 right-6 w-8 h-4 bg-white/10 rounded-full blur-[2px] -rotate-12" />
              </div>
            </div>

            {/* Info and toggle options for filter */}
            <div className="flex justify-between items-center mt-4 pt-3 border-t border-[#222]">
              <div className="text-[10px] font-mono text-[#6B7280] uppercase tracking-wider">
                <span>Filter: <strong className="text-[#FFB800] font-bold capitalize">{selectedSlide.filter}</strong></span>
                <span className="mx-2">•</span>
                <span>Type: {selectedSlide.isScanned ? 'Processed' : 'Negative'}</span>
              </div>
              <button
                onClick={() => setSelectedSlide(null)}
                className="bg-white hover:bg-[#E5E7EB] text-black font-semibold font-mono text-[10px] px-3.5 py-1.5 rounded uppercase tracking-wider cursor-pointer"
              >
                Dismiss Lens
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
