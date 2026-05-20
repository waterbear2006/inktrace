import React, { type ReactNode } from 'react';
import { motion, useMotionValue, useTransform } from 'motion/react';

interface SwipeCardProps {
  children: ReactNode;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
  direction?: 'horizontal' | 'vertical';
  threshold?: number;
  className?: string;
}

const SwipeCard: React.FC<SwipeCardProps> = ({
  children,
  onSwipeLeft,
  onSwipeRight,
  onSwipeUp,
  onSwipeDown,
  direction = 'horizontal',
  threshold = 80,
  className = '',
}) => {
  const isHorizontal = direction === 'horizontal';
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const rotate = useTransform(
    isHorizontal ? x : y,
    [-200, 0, 200],
    [-12, 0, 12]
  );

  const opacity = useTransform(
    isHorizontal ? x : y,
    [-200, -50, 0, 50, 200],
    [0.4, 1, 1, 1, 0.4]
  );

  const dragAxis = isHorizontal ? 'x' : 'y';

  const handleDragEnd = (_: any, info: { offset: { x: number; y: number }; velocity: { x: number; y: number } }) => {
    const offset = isHorizontal ? info.offset.x : info.offset.y;
    const velocity = isHorizontal ? info.velocity.x : info.velocity.y;

    if (offset < -threshold || velocity < -500) {
      if (isHorizontal) onSwipeLeft?.();
      else onSwipeUp?.();
    } else if (offset > threshold || velocity > 500) {
      if (isHorizontal) onSwipeRight?.();
      else onSwipeDown?.();
    }
  };

  return (
    <motion.div
      drag={dragAxis}
      dragElastic={0.85}
      dragSnapToOrigin
      style={{
        x,
        y,
        rotate,
        opacity,
        touchAction: isHorizontal ? 'pan-y' : 'pan-x',
      }}
      onDragEnd={handleDragEnd}
      whileTap={{ scale: 0.98 }}
      className={`swipe-card glaze-card cursor-grab active:cursor-grabbing select-none ${className}`}
    >
      {children}
    </motion.div>
  );
};

export default SwipeCard;
