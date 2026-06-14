import React, { useEffect, useState } from "react";
import { FilmRollCanister, FilmRollRibbon, FILM_ROLL_DEFAULT_PHYSICS } from "./FilmRollControl";

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

const controlChipClass =
  "pointer-events-auto rounded-[22px] border border-white/10 bg-[rgba(20,22,25,0.62)] px-4 py-3 text-white/88 shadow-[0_12px_30px_rgba(0,0,0,0.16)] backdrop-blur-xl";

export const FilmRollLab: React.FC<Props> = ({ isOpen, onClose }) => {
  const [filmOpen, setFilmOpen] = useState(true);
  const [stiffness, setStiffness] = useState(FILM_ROLL_DEFAULT_PHYSICS.stiffness);
  const [damping, setDamping] = useState(FILM_ROLL_DEFAULT_PHYSICS.damping);
  const [height, setHeight] = useState(94);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const physics = {
    stiffness,
    damping,
    mass: FILM_ROLL_DEFAULT_PHYSICS.mass,
    rotationMultiplier: FILM_ROLL_DEFAULT_PHYSICS.rotationMultiplier,
  };

  return (
    <div className="pointer-events-none fixed inset-0 z-[85] overflow-hidden bg-[rgba(10,10,11,0.28)] backdrop-blur-[2px]">
      <div className="fixed left-5 top-5 z-[86] flex items-center gap-2">
        <button type="button" onClick={onClose} className={`${controlChipClass} text-[11px] uppercase tracking-[0.2em] text-white/72`}>
          Close Film Lab
        </button>
        <button
          type="button"
          onClick={() => setFilmOpen((value) => !value)}
          className={`${controlChipClass} px-3 py-2 text-[11px] ${filmOpen ? "border-white/22 text-white" : "text-white/58"}`}
        >
          {filmOpen ? "extended" : "retracted"}
        </button>
      </div>

      <div className="pointer-events-auto absolute left-1/2 top-1/2 grid w-[min(980px,calc(100vw-40px))] -translate-x-1/2 -translate-y-1/2 gap-8">
        <div className="relative h-[240px] overflow-visible rounded-[28px] border border-white/10 bg-[rgba(19,17,14,0.72)] shadow-[0_34px_90px_rgba(0,0,0,0.34)] backdrop-blur-xl">
          <div className="absolute inset-x-10 top-1/2 -translate-y-1/2">
            <FilmRollRibbon isOpen={filmOpen} physics={physics} height={height} />
          </div>
          <button
            type="button"
            onClick={() => setFilmOpen((value) => !value)}
            className="absolute left-10 top-1/2 -translate-y-1/2 outline-none"
            aria-label="Toggle film roll"
          >
            <FilmRollCanister isOpen={filmOpen} physics={physics} scale={1.08} />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          {[
            { label: "stiffness", value: stiffness, min: 80, max: 280, step: 1, set: setStiffness },
            { label: "damping", value: damping, min: 10, max: 36, step: 1, set: setDamping },
            { label: "strip height", value: height, min: 64, max: 132, step: 1, set: setHeight },
          ].map((item) => (
            <label key={item.label} className={`${controlChipClass} block px-3 py-2`}>
              <div className="mb-1.5 flex items-center justify-between text-[11px] uppercase tracking-[0.16em] text-white/68">
                <span>{item.label}</span>
                <span className="normal-case tracking-normal text-white/54">{item.value}</span>
              </div>
              <input
                type="range"
                min={item.min}
                max={item.max}
                step={item.step}
                value={item.value}
                onChange={(event) => item.set(Number(event.target.value))}
                className="w-full accent-white"
              />
            </label>
          ))}
        </div>
      </div>
    </div>
  );
};
