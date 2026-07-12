import React, { memo, useRef } from "react";
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  type HTMLMotionProps,
} from "framer-motion";

type Props = Omit<HTMLMotionProps<"button">, "children"> & {
  children?: React.ReactNode;
  icon?: React.ReactNode;
};

const spring = {
  stiffness: 120,
  damping: 20,
  mass: 0.24,
};

export const MagneticButton = memo(function MagneticButton({
  children,
  className = "",
  icon,
  onMouseMove,
  onMouseLeave,
  ...props
}: Props) {
  const ref = useRef<HTMLButtonElement>(null);
  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);
  const translateX = useSpring(useTransform(pointerX, [-0.5, 0.5], [-10, 10]), spring);
  const translateY = useSpring(useTransform(pointerY, [-0.5, 0.5], [-10, 10]), spring);

  const handleMouseMove = (event: React.MouseEvent<HTMLButtonElement>) => {
    const rect = ref.current?.getBoundingClientRect();
    if (rect) {
      const relativeX = (event.clientX - rect.left) / rect.width - 0.5;
      const relativeY = (event.clientY - rect.top) / rect.height - 0.5;
      pointerX.set(relativeX);
      pointerY.set(relativeY);
    }
    onMouseMove?.(event);
  };

  const handleMouseLeave = (event: React.MouseEvent<HTMLButtonElement>) => {
    pointerX.set(0);
    pointerY.set(0);
    onMouseLeave?.(event);
  };

  return (
    <motion.button
      ref={ref}
      style={{ x: translateX, y: translateY }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 100, damping: 20 }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={`inline-flex items-center justify-center gap-2 rounded-full transition will-change-transform active:translate-y-px ${className}`}
      {...props}
    >
      <span>{children}</span>
      {icon}
    </motion.button>
  );
});
