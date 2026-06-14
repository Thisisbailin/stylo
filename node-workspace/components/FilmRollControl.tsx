import React from "react";
import { motion } from "framer-motion";

export type FilmRollPhysics = {
  stiffness: number;
  damping: number;
  mass: number;
  rotationMultiplier: number;
};

type CanisterStyle = {
  primaryColor: string;
  accentColor: string;
  backgroundColor: string;
  textColor: string;
  brandText: string;
  iso: number;
  exp: number;
};

type FilmRollCanisterProps = {
  isOpen: boolean;
  physics?: Partial<FilmRollPhysics>;
  styleConfig?: Partial<CanisterStyle>;
  className?: string;
  scale?: number;
};

type FilmRollRibbonProps = {
  isOpen: boolean;
  physics?: Partial<FilmRollPhysics>;
  className?: string;
  height?: number;
};

export const FILM_ROLL_DEFAULT_PHYSICS: FilmRollPhysics = {
  stiffness: 180,
  damping: 20,
  mass: 1.05,
  rotationMultiplier: 2.5,
};

const DEFAULT_CANISTER_STYLE: CanisterStyle = {
  primaryColor: "#facc15",
  accentColor: "#d83b31",
  backgroundColor: "#d9a517",
  textColor: "#18181b",
  brandText: "GOLD",
  iso: 200,
  exp: 36,
};

const sprocketHoles = Array.from({ length: 84 });
const frameMarks = Array.from({ length: 9 });

const resolvePhysics = (physics?: Partial<FilmRollPhysics>) => ({
  ...FILM_ROLL_DEFAULT_PHYSICS,
  ...physics,
});

export const FilmRollCanister: React.FC<FilmRollCanisterProps> = ({
  isOpen,
  physics,
  styleConfig,
  className = "",
  scale = 1,
}) => {
  const resolvedPhysics = resolvePhysics(physics);
  const style = { ...DEFAULT_CANISTER_STYLE, ...styleConfig };
  const springTransition = {
    type: "spring" as const,
    stiffness: resolvedPhysics.stiffness,
    damping: resolvedPhysics.damping,
    mass: resolvedPhysics.mass,
  };

  return (
    <motion.div
      className={`film-roll-canister ${className}`}
      aria-hidden="true"
      initial={false}
      animate={{
        rotateY: isOpen ? -15 : 0,
        rotateZ: isOpen ? -3.5 : 0,
        scale: isOpen ? scale * 1.025 : scale,
        x: isOpen ? 5 : 0,
      }}
      transition={springTransition}
      style={{ transformStyle: "preserve-3d", perspective: 1000 }}
    >
      <motion.div
        className="film-roll-canister__halo"
        initial={false}
        animate={{
          opacity: isOpen ? 1 : 0,
          scale: isOpen ? 1.14 : 0.92,
        }}
        transition={springTransition}
      />

      <div className="film-roll-canister__top">
        <motion.div
          className="film-roll-canister__spindle"
          initial={false}
          animate={{
            rotateY: isOpen ? -360 * resolvedPhysics.rotationMultiplier : 0,
          }}
          transition={springTransition}
        />
      </div>

      <div className="film-roll-canister__body">
        <div className="film-roll-canister__rim film-roll-canister__rim--top" />
        <div className="film-roll-canister__rim film-roll-canister__rim--bottom" />
        <div className="film-roll-canister__slot" />
        <div
          className="film-roll-canister__label"
          style={{
            background: `linear-gradient(90deg, ${style.backgroundColor} 0%, ${style.primaryColor} 24%, ${style.primaryColor} 66%, ${style.backgroundColor} 88%, #101013 100%)`,
          }}
        >
          <motion.div
            className="film-roll-canister__sheen"
            initial={false}
            animate={isOpen ? { x: ["-145%", "145%"] } : { x: "-145%" }}
            transition={{ duration: 0.68, ease: "easeOut" }}
          />
          <div className="film-roll-canister__label-top" style={{ color: style.textColor }}>
            <span>35mm COLOR FILM</span>
            <i style={{ backgroundColor: style.accentColor }} />
          </div>
          <div className="film-roll-canister__label-main">
            <span style={{ color: style.accentColor }}>{style.brandText}</span>
            <strong style={{ color: style.textColor }}>{style.iso}</strong>
            <em style={{ color: style.textColor }}>PROCESS C-41</em>
          </div>
          <div className="film-roll-canister__label-foot" style={{ color: style.textColor }}>
            <span>
              Exp.
              <b style={{ color: style.accentColor }}>{style.exp}</b>
            </span>
            <small>DX CODE 023-A</small>
          </div>
        </div>
      </div>
      <div className="film-roll-canister__bottom" />
    </motion.div>
  );
};

export const FilmRollRibbon: React.FC<FilmRollRibbonProps> = ({
  isOpen,
  physics,
  className = "",
  height = 78,
}) => {
  const resolvedPhysics = resolvePhysics(physics);
  const springTransition = {
    type: "spring" as const,
    stiffness: resolvedPhysics.stiffness,
    damping: resolvedPhysics.damping,
    mass: resolvedPhysics.mass,
  };

  return (
    <motion.div
      className={`film-roll-ribbon ${className}`}
      initial={false}
      animate={{
        scaleX: isOpen ? 1 : 0.08,
        opacity: isOpen ? 1 : 0.38,
      }}
      transition={springTransition}
      style={{ height, transformOrigin: "left center" }}
      aria-hidden="true"
    >
      <div className="film-roll-ribbon__base" />
      <div className="film-roll-ribbon__leaks" />
      <div className="film-roll-ribbon__grain" />
      <div className="film-roll-ribbon__track film-roll-ribbon__track--top">
        {sprocketHoles.map((_, index) => (
          <i key={`top-${index}`} />
        ))}
      </div>
      <div className="film-roll-ribbon__track film-roll-ribbon__track--bottom">
        {sprocketHoles.map((_, index) => (
          <i key={`bottom-${index}`} />
        ))}
      </div>
      <div className="film-roll-ribbon__stamps">
        {frameMarks.map((_, index) => (
          <span key={index}>KODAK SAFETY FILM {index + 1}A</span>
        ))}
      </div>
      <div className="film-roll-ribbon__frames">
        {frameMarks.map((_, index) => (
          <i key={index} />
        ))}
      </div>
    </motion.div>
  );
};
