"use client";

import { useEffect, useRef } from "react";

interface AsciiRainBackdropProps {
  className?: string;
  opacity?: number;
}

export default function AsciiRainBackdrop({
  className = "",
  opacity = 0.85,
}: AsciiRainBackdropProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const config = {
      glyphSize: 14,
      speed: 1.6,
      trail: 18,
      headColor: "#FFFFFF",
      trailColor: "#38bdf8",
      glyphs: "ｱｲｳｴｵｶｷｸ0123456789ABCDEFｸｿﾝ!@#$%&*<>[]{}",
    };

    let width = 0;
    let height = 0;
    let columns = 0;
    let rows = 0;
    let drops: Array<{
      y: number;
      speed: number;
      trailLength: number;
    }> = [];

    let animationFrameId: number;

    function resize() {
      if (!canvas || !ctx) return;
      const dpr = window.devicePixelRatio || 1;
      width = window.innerWidth;
      height = window.innerHeight;

      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);

      // Pre-fill background immediately to avoid transparent flicker
      ctx.fillStyle = "#090e1a";
      ctx.fillRect(0, 0, width, height);

      ctx.font = `${config.glyphSize}px "JetBrains Mono", monospace`;

      columns = Math.floor(width / config.glyphSize);
      rows = Math.floor(height / config.glyphSize);

      drops = [];
      for (let i = 0; i < columns; i++) {
        drops[i] = {
          // Spread initial drops across the entire screen so rain is active immediately on load
          y: Math.random() * (rows + 30) - 15,
          speed: (Math.random() * 0.45 + 0.75) * (config.speed * 0.35),
          trailLength: Math.floor(Math.random() * 12) + config.trail,
        };
      }
    }

    resize();
    window.addEventListener("resize", resize);

    let isVisible = !document.hidden;
    function handleVisibilityChange() {
      isVisible = !document.hidden;
      if (isVisible) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = requestAnimationFrame(draw);
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);

    function draw() {
      if (!ctx || !isVisible) return;
      ctx.fillStyle = "rgba(9, 14, 26, 0.18)";
      ctx.fillRect(0, 0, width, height);

      for (let i = 0; i < drops.length; i++) {
        const drop = drops[i];
        const x = i * config.glyphSize;
        const currentY = Math.floor(drop.y) * config.glyphSize;

        const char = config.glyphs[Math.floor(Math.random() * config.glyphs.length)];

        for (let t = 0; t < drop.trailLength; t++) {
          const trailY = currentY - t * config.glyphSize;
          if (trailY >= -config.glyphSize && trailY <= height + config.glyphSize) {
            const alpha = Math.max(0, 1 - t / drop.trailLength);
            if (t === 0) {
              ctx.fillStyle = config.headColor;
              ctx.shadowColor = config.trailColor;
              ctx.shadowBlur = 10;
            } else {
              ctx.fillStyle = `rgba(56, 189, 248, ${alpha * 0.85})`;
              ctx.shadowBlur = 0;
            }
            ctx.fillText(char, x, trailY);
          }
        }
        ctx.shadowBlur = 0;

        drop.y += drop.speed;

        if ((drop.y - drop.trailLength) * config.glyphSize > height) {
          drop.y = Math.random() * -20;
          drop.speed = (Math.random() * 0.45 + 0.75) * (config.speed * 0.35);
          drop.trailLength = Math.floor(Math.random() * 10) + config.trail;
        }
      }

      animationFrameId = requestAnimationFrame(draw);
    }

    draw();

    return () => {
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <div
      className={`fixed inset-0 pointer-events-none z-0 overflow-hidden ${className}`}
      id="rain-wrap"
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full block"
        style={{ opacity }}
      />
      {/* Ambient gradient overlays with tuned transparency so the cyan stream shines through */}
      <div className="absolute inset-0 bg-gradient-to-t from-[#090e1a]/90 via-transparent to-[#090e1a]/80 pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-sky-950/25 via-[#070b14]/40 to-[#070b14]/80 pointer-events-none" />
    </div>
  );
}
