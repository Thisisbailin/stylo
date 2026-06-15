import React from "react";
import { motion } from "framer-motion";

export type FilmRollPhysics = {
  stiffness: number;
  damping: number;
  mass: number;
  rotationMultiplier: number;
  filmstripHeight?: number;
  frameWidth?: number;
};

export type FilmRollCanisterStyle = {
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
  styleConfig?: Partial<FilmRollCanisterStyle>;
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

const DEFAULT_CANISTER_STYLE: FilmRollCanisterStyle = {
  primaryColor: "#facc15",
  accentColor: "#d83b31",
  backgroundColor: "#d9a517",
  textColor: "#18181b",
  brandText: "GOLD",
  iso: 200,
  exp: 36,
};

const sprocketHoles = Array.from({ length: 135 });
const frameMarks = Array.from({ length: 9 });
const barcodeBars = [2, 1, 4, 1, 2, 1, 3, 1, 5, 1, 2];
const filmPoems = [
  {
    text: "Light keeps the contour. Memory keeps the grain.",
    sub: "曝光写下轮廓，记忆留下颗粒。",
    className: "film-roll-ribbon__poem--one",
  },
  {
    text: "Every frame is a small resistance against forgetting.",
    sub: "每一格都是一次抵抗遗忘的显影。",
    className: "film-roll-ribbon__poem--two",
  },
  {
    text: "The acetate turns; the story waits for chemistry.",
    sub: "片基缓慢转动，故事等待冲洗。",
    className: "film-roll-ribbon__poem--three",
  },
  {
    text: "Burnt orange, silver dust, and a pulse of afternoon.",
    sub: "焦橙、银盐，和午后的余温。",
    className: "film-roll-ribbon__poem--four",
  },
];

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
        x: isOpen ? 6 : 0,
      }}
      transition={springTransition}
      style={{ transformStyle: "preserve-3d", perspective: 1000 }}
      whileHover={{ scale: scale * 1.035 }}
      whileTap={{ scale: scale * 0.98 }}
    >
      <motion.div
        className="film-roll-canister__halo"
        initial={false}
        animate={{
          opacity: isOpen ? 1 : 0,
          scale: isOpen ? 1.16 : 0.92,
          filter: isOpen
            ? ["blur(16px) brightness(1)", "blur(21px) brightness(1.28)", "blur(16px) brightness(1)"]
            : "blur(16px) brightness(1)",
        }}
        transition={{
          opacity: { duration: 0.34 },
          scale: { duration: 0.34 },
          filter: { repeat: Infinity, duration: 2.6, ease: "easeInOut" },
        }}
      />

      <div className="film-roll-canister__top">
        <motion.div
          className="film-roll-canister__spindle"
          initial={false}
          animate={{
            rotateY: isOpen ? -360 * resolvedPhysics.rotationMultiplier : 0,
          }}
          transition={springTransition}
        >
          <i />
          <i />
          <i />
          <i />
        </motion.div>
      </div>

      <div className="film-roll-canister__body">
        <div className="film-roll-canister__rim film-roll-canister__rim--top" />
        <div className="film-roll-canister__rim film-roll-canister__rim--bottom" />
        <div className="film-roll-canister__slot" />
        <motion.div
          className="film-roll-canister__leader"
          aria-hidden="true"
          initial={false}
          animate={{
            width: isOpen ? 24 : 18,
            opacity: isOpen ? 0.98 : 0.86,
            x: isOpen ? 0 : -2,
          }}
          transition={springTransition}
        >
          <i />
        </motion.div>
        <div
          className="film-roll-canister__label"
          style={{
            background: `linear-gradient(90deg, ${style.backgroundColor} 0%, ${style.primaryColor} 25%, ${style.primaryColor} 65%, ${style.backgroundColor} 90%, #0c0c0d 100%)`,
          }}
        >
          <motion.div
            className="film-roll-canister__sheen"
            initial={false}
            animate={isOpen ? { x: ["-145%", "145%"] } : { x: "-145%" }}
            transition={{ duration: 0.68, ease: "easeOut" }}
          />
          <motion.div
            className="film-roll-canister__shockwave"
            initial={false}
            animate={
              isOpen
                ? { opacity: [0, 0.9, 0], scale: [0.7, 1.25, 1.42] }
                : { opacity: 0, scale: 0.7 }
            }
            transition={{ duration: 0.56, ease: "easeOut" }}
          />
          <motion.div
            className="film-roll-canister__active-border"
            initial={false}
            animate={{ opacity: isOpen ? 1 : 0 }}
            transition={{ duration: 0.28 }}
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
            <i className="film-roll-canister__barcode" aria-hidden="true">
              {barcodeBars.map((bar, index) => (
                <b key={index} style={{ width: bar }} />
              ))}
            </i>
          </div>
          <span className="film-roll-canister__reflection film-roll-canister__reflection--soft" />
          <span className="film-roll-canister__reflection film-roll-canister__reflection--dark" />
        </div>
      </div>
      <div className="film-roll-canister__bottom" />
      <div className="film-roll-canister__contact-shadow" />
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
  const ribbonHeight = physics?.filmstripHeight ?? height;
  const frameWidth = physics?.frameWidth ?? 156;

  return (
    <motion.div
      className={`film-roll-ribbon ${isOpen ? "is-open" : "is-closed"} ${className}`}
      initial={false}
      animate={{
        width: isOpen ? "100%" : "56px",
        opacity: isOpen ? 1 : 0.58,
        clipPath: isOpen
          ? "polygon(0% 0%, calc(100% - 90px) 0%, calc(100% - 75px) 4%, calc(100% - 60px) 12%, calc(100% - 48px) 25%, calc(100% - 35px) 38%, calc(100% - 25px) 43%, calc(100% - 15px) 45%, 100% 45%, 100% 100%, 0% 100%)"
          : "polygon(0% 0%, calc(100% - 30px) 0%, calc(100% - 27px) 4%, calc(100% - 24px) 12%, calc(100% - 20px) 25%, calc(100% - 17px) 38%, calc(100% - 15px) 43%, calc(100% - 13px) 45%, 100% 45%, 100% 100%, 0% 100%)",
      }}
      transition={springTransition}
      style={
        {
          height: ribbonHeight,
          transformOrigin: "left center",
          "--film-frame-width": `${frameWidth}px`,
        } as React.CSSProperties
      }
      aria-hidden="true"
    >
      <div className="film-roll-ribbon__leader" aria-hidden="true">
        <span />
        <b>PULL</b>
      </div>
      <div className="film-roll-ribbon__base" />
      <div className="film-roll-ribbon__gloss" />
      <div className="film-roll-ribbon__leaks" />
      <div className="film-roll-ribbon__grain" />
      <div className="film-roll-ribbon__shine film-roll-ribbon__shine--one" />
      <div className="film-roll-ribbon__shine film-roll-ribbon__shine--two" />
      <div className="film-roll-ribbon__shine film-roll-ribbon__shine--three" />
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
          <span key={index}>QALAM SAFETY FILM {index + 1}A</span>
        ))}
      </div>
      <div className="film-roll-ribbon__numbers">
        {frameMarks.map((_, index) => (
          <span key={index}>
            <b>{index + 1}</b>
            <i>BA {index + 1}A</i>
          </span>
        ))}
      </div>
      <div className="film-roll-ribbon__frames">
        {frameMarks.map((_, index) => (
          <i key={index} />
        ))}
      </div>
      <div className="film-roll-ribbon__gates">
        {frameMarks.map((_, index) => (
          <i key={index} />
        ))}
      </div>
      <div className="film-roll-ribbon__poetry">
        {filmPoems.map((poem) => (
          <span key={poem.className} className={poem.className}>
            <strong>{poem.text}</strong>
            <em>{poem.sub}</em>
          </span>
        ))}
      </div>
    </motion.div>
  );
};
