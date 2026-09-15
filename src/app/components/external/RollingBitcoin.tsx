'use client';
import { useEffect, useRef } from 'react';

export default function RollingBitcoin() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.src = '/bitcoin.png'; // ✅ image in /public folder

    let animationId: number;
    let x = -200;
    let direction = 1; // 1 = left to right, -1 = right to left
    let rotation = 0;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const coinSize = () => Math.min(window.innerWidth, window.innerHeight) * 0.35; // increased from 0.28 to 0.35 (25% bigger)

    const sparkles = Array.from({ length: 28 }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      r: Math.random() * 2.5 + 0.5,
      alpha: Math.random(),
      speed: Math.random() * 0.4 + 0.1,
      drift: (Math.random() - 0.5) * 0.3,
    }));

    const drawSparkles = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      sparkles.forEach((s) => {
        s.y -= s.speed;
        s.x += s.drift;
        s.alpha += (Math.random() - 0.5) * 0.04;
        s.alpha = Math.max(0.05, Math.min(0.7, s.alpha));
        if (s.y < -10) {
          s.y = h + 10;
          s.x = Math.random() * w;
        }

        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 195, 50, ${s.alpha})`;
        ctx.fill();
      });
    };

    img.onload = () => {
      const draw = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const size = coinSize();
        const speed = 3.125; // increased from 2.5 to 3.125 (1.25x faster)
        const y = canvas.height * 0.52; // vertical position — just below center

        // Rotation tied to movement (realistic rolling)
        rotation += (speed / (size / 2)) * direction;

        // Move horizontally
        x += speed * direction;

        // Bounce at edges
        if (x + size > canvas.width + size * 0.2) {
          direction = -1;
        }
        if (x < -size * 0.2) {
          direction = 1;
        }

        // --- Draw glow beneath coin ---
        const glowX = x + size / 2;
        const glowY = y + size * 0.92;
        const glow = ctx.createRadialGradient(glowX, glowY, 0, glowX, glowY, size * 0.55);
        glow.addColorStop(0, 'rgba(255, 180, 0, 0.22)');
        glow.addColorStop(0.5, 'rgba(255, 140, 0, 0.10)');
        glow.addColorStop(1, 'rgba(255, 100, 0, 0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.ellipse(glowX, glowY, size * 0.55, size * 0.13, 0, 0, Math.PI * 2);
        ctx.fill();

        // --- Draw rotating coin image ---
        ctx.save();
        ctx.translate(x + size / 2, y + size / 2);
        ctx.rotate(rotation);

        // Outer gold ring glow
        const ringGlow = ctx.createRadialGradient(0, 0, size * 0.3, 0, 0, size * 0.6);
        ringGlow.addColorStop(0, 'rgba(255, 200, 50, 0)');
        ringGlow.addColorStop(0.75, 'rgba(255, 180, 0, 0.08)');
        ringGlow.addColorStop(1, 'rgba(255, 160, 0, 0.25)');
        ctx.fillStyle = ringGlow;
        ctx.beginPath();
        ctx.arc(0, 0, size * 0.55, 0, Math.PI * 2);
        ctx.fill();

        // Clip to circle so image stays round
        ctx.beginPath();
        ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
        ctx.clip();

        // Draw the actual bitcoin image
        ctx.drawImage(img, -size / 2, -size / 2, size, size);

        ctx.restore();

        // --- Sparkle particles ---
        drawSparkles(ctx, canvas.width, canvas.height);

        animationId = requestAnimationFrame(draw);
      };

      draw();
    };

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 0,
        opacity: 0.85,
      }}
    />
  );
}
