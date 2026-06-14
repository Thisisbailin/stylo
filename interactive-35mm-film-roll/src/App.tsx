import React, { useState } from 'react';
import { FilmFrame, FilmFilter, PhysicsParams, CanisterBrand, CanisterStyle } from './types';
import { Canister } from './components/Canister';
import { Filmstrip } from './components/Filmstrip';
import { PhysicsControls } from './components/PhysicsControls';
import { Lighttable } from './components/Lighttable';
import { Camera, Layers, Flame, BookOpen, AlertCircle, Sparkles, Wand2 } from 'lucide-react';

const CANISTER_BRANDS: CanisterStyle[] = [
  {
    id: 'retro-yellow',
    name: 'Kodak Gold 200 Style',
    primaryColor: '#facc15', // yellow-400
    accentColor: '#ef4444', // red-500
    backgroundColor: '#eab308', // yellow-500
    textColor: '#18181b', // dark gray
    brandText: 'GOLD 200',
    iso: 120,
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

const SEED_PICTURES = [
  'https://images.unsplash.com/photo-1542282088-fe8426682b8f?auto=format&fit=crop&w=600&q=80', // Classic sports car
  'https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?auto=format&fit=crop&w=600&q=80', // Pines cabin
  'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=600&q=80', // Retro diner
  'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?auto=format&fit=crop&w=600&q=80', // Neon streets
  'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=600&q=80', // Vintage camera
  'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=600&q=80', // Sunset beaches
];

const DEFAULT_PHYSICS: PhysicsParams = {
  stiffness: 140,
  damping: 18,
  mass: 1.1,
  rotationMultiplier: 2.5,
  filmstripHeight: 114,
  frameWidth: 156,
};

export default function App() {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedBrand, setSelectedBrand] = useState<CanisterBrand>('retro-yellow');
  const [physics, setPhysics] = useState<PhysicsParams>(DEFAULT_PHYSICS);

  // Initial film roll setup: 3 unexposed empty frames
  const [frames, setFrames] = useState<FilmFrame[]>([
    { id: 'f-1', index: 1, imageUrl: null, filter: 'negative', isScanned: false },
    { id: 'f-2', index: 2, imageUrl: null, filter: 'negative', isScanned: false },
    { id: 'f-3', index: 3, imageUrl: null, filter: 'negative', isScanned: false },
  ]);

  // Slides cut/split onto the lighttable
  const [splitSlides, setSplitSlides] = useState<FilmFrame[]>([]);

  const activeStyle = CANISTER_BRANDS.find((b) => b.id === selectedBrand) || CANISTER_BRANDS[0];

  // Toggle canister state - winds/unspools film
  const handleToggleCanister = () => {
    setIsOpen(!isOpen);
  };

  // Upload photo into precise frame target
  const handleUploadImage = (frameId: string, url: string) => {
    setFrames((prev) =>
      prev.map((frame) =>
        frame.id === frameId ? { ...frame, imageUrl: url, isScanned: false } : frame
      )
    );
  };

  // Update discrete photographic filter
  const handleUpdateFilter = (frameId: string, filter: FilmFilter) => {
    setFrames((prev) =>
      prev.map((frame) =>
        frame.id === frameId ? { ...frame, filter } : frame
      )
    );
  };

  // Split/Cut action: clones the frame at split point and places it in lightbox
  const handleCutFrame = (frameId: string) => {
    const frameToCut = frames.find((f) => f.id === frameId);
    if (frameToCut && frameToCut.imageUrl) {
      // Add a clone onto slide lightbox tray
      const uniqueId = `slide-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
      setSplitSlides((prev) => [
        ...prev,
        { ...frameToCut, id: uniqueId }, // Keep index & image details
      ]);

      // Highlight feedback
      const targetElement = document.getElementById(`film-frame-${frameId}`);
      if (targetElement) {
        targetElement.classList.add('ring-4', 'ring-amber-500', 'scale-95');
        setTimeout(() => {
          targetElement.classList.remove('ring-4', 'ring-amber-500', 'scale-95');
        }, 350);
      }
    } else {
      alert("请先为此格胶片上传或选择一张图片，再进行拆分切割！\nPlease load an image on this frame before cutting!");
    }
  };

  // Delete/Clear single frame back to unexposed
  const handleDeleteFrame = (frameId: string) => {
    setFrames((prev) =>
      prev.map((frame) =>
        frame.id === frameId ? { ...frame, imageUrl: null, filter: 'negative', isScanned: false } : frame
      )
    );
  };

  // Add 1 more blank frame to filmstrip
  const handleAddFrame = () => {
    const maxIndex = frames.length > 0 ? Math.max(...frames.map((f) => f.index)) : 0;
    const newId = `f-${Date.now()}`;
    setFrames((prev) => [
      ...prev,
      {
        id: newId,
        index: maxIndex + 1,
        imageUrl: null,
        filter: 'negative',
        isScanned: false,
      },
    ]);
  };

  // Single develop scan beam toggle
  const handleDevelopScan = (frameId: string) => {
    setFrames((prev) =>
      prev.map((frame) =>
        frame.id === frameId ? { ...frame, isScanned: !frame.isScanned } : frame
      )
    );
  };

  // Populate multiple frames with beautiful, nostalgic seed urls
  const handleSeedPhotos = () => {
    setFrames((prev) => {
      // Loop through and seed urls sequentially
      return prev.map((frame, idx) => {
        const seedUrl = SEED_PICTURES[idx % SEED_PICTURES.length];
        return {
          ...frame,
          imageUrl: seedUrl,
          filter: 'negative', // start off as cool authentic unexposed negatives
          isScanned: false,
        };
      });
    });
  };

  // Quick reset for physical properties
  const handleResetPhysics = () => {
    setPhysics(DEFAULT_PHYSICS);
  };

  // Clear entire roll
  const handleClearAll = () => {
    setFrames([
      { id: 'f-1', index: 1, imageUrl: null, filter: 'negative', isScanned: false },
      { id: 'f-2', index: 2, imageUrl: null, filter: 'negative', isScanned: false },
      { id: 'f-3', index: 3, imageUrl: null, filter: 'negative', isScanned: false },
    ]);
  };

  // Scan or develop all slides in bulk
  const handleScanAll = () => {
    const hasUnscanned = frames.some((f) => f.imageUrl && !f.isScanned);
    setFrames((prev) =>
      prev.map((f) => (f.imageUrl ? { ...f, isScanned: hasUnscanned } : f))
    );
  };

  const allScanned = frames.every((f) => !f.imageUrl || f.isScanned);

  // Lighttable slide actions
  const handleDeleteSlide = (id: string) => {
    setSplitSlides((prev) => prev.filter((s) => s.id !== id));
  };

  const handleClearSlides = () => {
    setSplitSlides([]);
  };

  // High fidelity canvas drawing exporter to stitch and download the entire active filmstrip!
  const handleExportFilmstripPNG = () => {
    // Collect all valid photos
    const validFrames = frames.filter((f) => f.imageUrl);
    if (validFrames.length === 0) {
      alert('请确保在当前胶片上有至少一张已上传的图片才可以导出！\nPlease upload at least one image keyframe onto the roll to export.');
      return;
    }

    // Canvas construction parameters
    const frameW = 340;
    const frameH = 220;
    const verticalPad = 45; // space for sprocket holes at top/bottom
    const stripH = frameH + (verticalPad * 2); // 310 px

    const sidePadding = 120; // safe space for leader curves
    const cellGap = 35;
    const totalW = (validFrames.length * frameW) + ((validFrames.length - 1) * cellGap) + (sidePadding * 2);

    const canvas = document.createElement('canvas');
    canvas.width = totalW;
    canvas.height = stripH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Draw dark amber film strip body texture
    ctx.fillStyle = '#1c0a03'; // deep acetate brown
    ctx.fillRect(0, 0, totalW, stripH);

    // Give subtle gradient shine on margins
    const backGradient = ctx.createLinearGradient(0, 0, 0, stripH);
    backGradient.addColorStop(0, '#100602');
    backGradient.addColorStop(0.12, '#2d1406');
    backGradient.addColorStop(0.88, '#240e03');
    backGradient.addColorStop(1, '#0e0401');
    ctx.fillStyle = backGradient;
    ctx.fillRect(0, 0, totalW, stripH);

    // Draw top and bottom sprocket perforation tracks
    const sprocketCount = Math.floor(totalW / 24);
    ctx.fillStyle = '#0f0f11'; // hollow hole fill representation
    for (let i = 0; i < sprocketCount; i++) {
      const sx = i * 24 + 10;
      // top holes
      ctx.beginPath();
      ctx.roundRect(sx, 12, 14, 10, 3);
      ctx.fill();

      // bottom holes
      ctx.beginPath();
      ctx.roundRect(sx, stripH - 22, 14, 10, 3);
      ctx.fill();
    }

    // Draw professional border filmtext markings
    ctx.fillStyle = '#f59e0b'; // authentic amber-yellow Kodak text paint
    ctx.font = 'bold 10px monospace';
    
    // Top codes
    ctx.fillText('KODAK SAFETY FILM 5062 • CHROMATIC 200 • EXP PANORAMA • PROCESS C-41', 120, 30);
    
    // Sequential image painter
    let loadedCount = 0;
    validFrames.forEach((frame, i) => {
      const img = new Image();
      img.crossOrigin = 'anonymous'; // critical for CORS Unsplash safe saving

      img.onload = () => {
        const cx = sidePadding + i * (frameW + cellGap);
        const cy = verticalPad;

        // Draw inner frame shadow slot
        ctx.fillStyle = '#000000';
        ctx.fillRect(cx - 3, cy - 3, frameW + 6, frameH + 6);

        // Apply photographic image styling attributes
        ctx.save();
        
        // Match CSS filters natively on context
        const filter = frame.filter;
        const isScanned = frame.isScanned;
        
        if (filter === 'negative' && !isScanned) {
          ctx.filter = 'invert(1) sepia(0.65) saturate(1.8) hue-rotate(170deg) contrast(1.15) brightness(0.9)';
        } else if (filter === 'negative' && isScanned) {
          ctx.filter = 'contrast(1.05) brightness(1.02) saturate(1.1) sepia(0.15)';
        } else {
          switch (filter) {
            case 'grayscale':
              ctx.filter = 'grayscale(100%) contrast(120%)';
              break;
            case 'vintage':
              ctx.filter = 'sepia(65%) contrast(95%) saturate(130%) brightness(102%)';
              break;
            case 'cyanotype':
              ctx.filter = 'grayscale(100%) sepia(100%) hue-rotate(190deg) saturate(300%) contrast(110%) brightness(95%)';
              break;
            case 'sunset':
              ctx.filter = 'saturate(200%) contrast(115%) brightness(105%) sepia(35%) hue-rotate(-15deg)';
              break;
            case 'positive':
            default:
              ctx.filter = 'contrast(105%) saturate(105%)';
              break;
          }
        }

        // Draw clipped image onto canvas frame
        ctx.drawImage(img, cx, cy, frameW, frameH);
        ctx.restore();

        // Draw frame indexing numbers at the bottom margin
        ctx.fillStyle = '#f59e0b';
        ctx.font = 'bold 11px monospace';
        ctx.fillText(`▶ ${frame.index} — ${frame.index}A`, cx + 10, stripH - 30);

        loadedCount++;
        // Trigger save download when all frames are rendered
        if (loadedCount === validFrames.length) {
          const downloadLink = document.createElement('a');
          downloadLink.download = `vintage-35mm-filmstrip-${Date.now()}.png`;
          downloadLink.href = canvas.toDataURL('image/png');
          document.body.appendChild(downloadLink);
          downloadLink.click();
          document.body.removeChild(downloadLink);
        }
      };

      img.onerror = () => {
        alert('加载种子图片时，图片服务器出现安全策略限制，请尝试使用您的本地照片上传导出！');
      };

      img.src = frame.imageUrl || '';
    });
  };

  return (
    <div className="min-h-screen bg-[#0A0A0B] text-zinc-100 flex flex-col font-sans selection:bg-[#FFB800] selection:text-zinc-950">
      
      {/* Immersive Background Lighting Glow */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-[#FFB800]/5 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-[600px] h-[600px] bg-amber-500/5 rounded-full blur-[160px] pointer-events-none" />

      {/* Main Container */}
      <div className="max-w-7xl mx-auto w-full px-4 md:px-8 py-10 flex flex-col gap-10 relative z-10 flex-grow">
        
        {/* Editorial UI Header */}
        <header id="main-header" className="flex flex-col md:flex-row md:items-end justify-between border-b border-[#222] pb-6 gap-6">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <span className="bg-[#1A1A1A] border border-[#333] px-3 py-1 rounded-full text-xs font-mono tracking-widest text-[#FFB800] font-semibold uppercase">
                Analog Emulation v1.2
              </span>
              <span className="text-[10px] font-mono font-bold bg-[#EF4444] text-white px-2 py-0.5 rounded uppercase tracking-wider select-none animate-pulse">
                Classic C-41
              </span>
            </div>
            <h1 className="text-4xl md:text-6xl font-light tracking-[-0.04em] uppercase text-stone-100">
              Phantom Chrome
            </h1>
            <p className="text-xs text-[#6B7280] font-sans">
              High-end 35mm photograph simulator mimicking chemical negative base resistance and mechanical spring-back.
            </p>
          </div>

          {/* Editorial right side metadata */}
          <div className="flex items-end gap-6 text-right">
            <div className="hidden sm:flex flex-col">
              <span className="text-[10px] text-[#6B7280] font-mono tracking-widest">ROLL IDENTIFIER</span>
              <span className="text-zinc-300 font-bold font-mono text-xs uppercase">ROLL_35_104_99A</span>
            </div>
            <div className="h-8 w-[1px] bg-[#222] hidden sm:block"></div>
            <div className="flex flex-col justify-end">
              <span className="text-[10px] text-[#6B7280] font-mono tracking-widest">SENSITIVITY</span>
              <span className="text-xl font-bold font-mono text-[#FFB800] leading-none mt-1">ISO {activeStyle.iso}</span>
            </div>
          </div>
        </header>

        {/* Operating Environment with Side-info element from instruction */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 items-start">
          
          {/* Main Stage Cylinder container */}
          <section id="laboratory-stage" className="lg:col-span-3 bg-[#111112] border border-[#222] rounded-xl p-6 md:p-8 shadow-2xl relative overflow-visible flex flex-col justify-between min-h-[360px]">
            
            {/* Unified Mechanical Assembly: Canister + Filmstrip fully connected */}
            <div className="flex flex-row items-center justify-start select-none relative overflow-visible mt-4 w-full">
              
              {/* Skeuomorphic 3D Canister (Left) - overlapping right margin to tuck filmstrip behind the exit felt slot */}
              <div className="flex-shrink-0 z-30 relative mr-[-14px]">
                <Canister
                  styleConfig={activeStyle}
                  isOpen={isOpen}
                  onToggle={handleToggleCanister}
                  physics={physics}
                />
              </div>

              {/* Elastic Sliding Filmstrip Tape (Right) - starts directly flush underneath the felt slot of the canister */}
              <div className="flex-grow relative overflow-visible z-20">
                <Filmstrip
                  frames={frames}
                  isOpen={isOpen}
                  onUploadImage={handleUploadImage}
                  onUpdateFilter={handleUpdateFilter}
                  onCutFrame={handleCutFrame}
                  onDeleteFrame={handleDeleteFrame}
                  onAddFrame={handleAddFrame}
                  onDevelopScan={handleDevelopScan}
                  physics={physics}
                  onToggleCanister={handleToggleCanister}
                />
              </div>

            </div>

            {/* Background Stage Hints */}
            {!isOpen && (
              <div className="mt-8 text-[11px] text-[#6B7280] font-mono flex items-center justify-end gap-1.5 pointer-events-none uppercase tracking-wider">
                <span className="inline-block w-2 h-2 rounded-full bg-[#FFB800] animate-pulse"></span>
                <span>Click the canister to unspool the negative with tactile spring dynamics</span>
              </div>
            )}

          </section>

          {/* Sidebar Info - Specified precisely by the Editorial Design Template */}
          <aside className="bg-[#111112] border border-[#222] rounded-xl p-5 text-xs text-stone-400 font-mono tracking-wider flex flex-col gap-4">
            <div className="text-[11px] font-bold text-[#FFB800] tracking-widest uppercase border-b border-[#222] pb-2">
              System Specification
            </div>
            <div className="flex justify-between items-center py-1 border-b border-[#222]/50">
              <span className="text-[#6B7280]">PROCESS</span>
              <span className="text-zinc-200">C-41 DEVELOP</span>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-[#222]/50">
              <span className="text-[#6B7280]">BASE EMULSION</span>
              <span className="text-zinc-200 uppercase">{activeStyle.brandText}</span>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-[#222]/50">
              <span className="text-[#6B7280]">GRAIN RATIO</span>
              <span className="text-zinc-200">ULTRA-FINE 0.14</span>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-[#222]/50">
              <span className="text-[#6B7280]">SATURATION</span>
              <span className="text-zinc-200">HIGH CONTRAST</span>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-[#222]/50">
              <span className="text-[#6B7280]">TENSION MECHANIC</span>
              <span className="text-[#FFB800] font-bold">REBOUND ACTIVE</span>
            </div>

            <div className="mt-2 text-[11px] text-[#6B7280] leading-relaxed tracking-normal font-sans border-t border-[#222] pt-3">
              This emulator recreates the physical, mechanical resistance of 35mm acetate film base. Observe rotational wobbles and recoil damping when fully unspooled.
            </div>
          </aside>
          
        </div>

        {/* Dynamic Multi-column Controls (Physics + Laboratory presets) */}
        <section id="laboratory-dashboard">
          <PhysicsControls
            physics={physics}
            setPhysics={setPhysics}
            selectedBrand={selectedBrand}
            onBrandChange={setSelectedBrand}
            brands={CANISTER_BRANDS}
            onSeedPhotos={handleSeedPhotos}
            onResetPhysics={handleResetPhysics}
            onClearAll={handleClearAll}
            onScanAll={handleScanAll}
            allScanned={allScanned}
          />
        </section>

        {/* Photographers Lighttable / Lightbox Box */}
        <section id="laboratory-lighttable">
          <Lighttable
            splitSlides={splitSlides}
            onDeleteSlide={handleDeleteSlide}
            onClearSlides={handleClearSlides}
            onExportFilmstripPNG={handleExportFilmstripPNG}
          />
        </section>

        {/* Helpful Tips Legend */}
        <section id="help-legend" className="bg-[#111112] border border-[#222] rounded-xl p-5 flex gap-4 text-xs leading-normal text-zinc-400">
          <AlertCircle className="w-5 h-5 text-[#FFB800] flex-shrink-0 mt-0.5" />
          <div className="flex flex-col gap-1.5">
            <h4 className="font-semibold text-zinc-200 uppercase tracking-widest font-mono text-[11px]">User Manual / 冲洗指南</h4>
            <ul className="list-disc pl-4 space-y-1.5 text-stone-400 text-[11px] font-mono tracking-wider">
              <li>
                <strong>物理回弹旋转 (Canister Spun Damping):</strong> 点击胶卷盒展开或收起时，胶卷盒会根据所调参数旋转并产生<strong>物理机械回弹</strong>。在参数面板中调节不同的 <strong>Damping(阻尼)</strong> 可以改变物理拉扯的阻力感！
              </li>
              <li>
                <strong>模拟胶片开发 (C-41 Negative Processing):</strong> 刚上传好的图片默认带有胶片原始的 <strong>Negative (负片橙红基底)</strong> 效果，点击每格胶片上的 <strong>“Developer Scan (显影扫描)”</strong> 来模拟扫描仪透过灯箱，让负片冲洗显影，转换成明亮正片！
              </li>
              <li>
                <strong>拆分胶片条 (Split Film Slides):</strong> 选中某格含有图片的胶片，点击 <strong>“Split Frame (拆分切片)”</strong> 可以把这格胶片裁切成一个独立的幻灯片，掉落到下方的 <strong>灯箱观片台</strong> 供你仔细鉴赏。
              </li>
              <li>
                <strong>高保真全景导出 (Panorama Graphic Export):</strong> 在观片台右侧，点击 <strong>“Export Panoramic Roll”</strong> 可以把当前的整条摄影胶卷拼接、加上标准齿孔与标识，直接绘画并导出为一张超复古的 PNG 的胶卷全景图！
              </li>
            </ul>
          </div>
        </section>

      </div>

    </div>
  );
}
