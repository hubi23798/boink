"use client";

import { motion, type MotionProps } from "framer-motion";

interface RevealProps {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  as?: "div" | "section" | "header" | "footer" | "article";
  id?: string;
}

const easeOutExpo = [0.16, 1, 0.3, 1] as const;

export function Reveal({ children, delay = 0, className = "", as = "div", id }: RevealProps) {
  const MotionTag = motion[as] as React.ComponentType<
    MotionProps & { className?: string; id?: string }
  >;
  return (
    <MotionTag
      id={id}
      className={className}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -8% 0px", amount: 0.15 }}
      transition={{
        delay: delay / 1000,
        duration: 0.5,
        ease: easeOutExpo,
      }}
    >
      {children}
    </MotionTag>
  );
}
