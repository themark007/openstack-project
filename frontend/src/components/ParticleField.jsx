// src/components/ParticleField.jsx
import { useEffect, useRef } from "react";

export default function ParticleField() {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas.getContext("2d");
    let w = canvas.width = window.innerWidth;
    let h = canvas.height = window.innerHeight;
    const pts = Array.from({ length: 100 }, () => ({
      x: Math.random() * w, y: Math.random() * h,
      vx: (Math.random() - .5) * .35, vy: (Math.random() - .5) * .35,
      r: Math.random() * 1.4 + .4, a: Math.random() * .7 + .2
    }));
    let raf;
    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      pts.forEach(p => {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0) p.x = w; if (p.x > w) p.x = 0;
        if (p.y < 0) p.y = h; if (p.y > h) p.y = 0;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0,255,200,${p.a * .45})`; ctx.fill();
      });
      pts.forEach((p, i) => pts.slice(i + 1).forEach(q => {
        const d = Math.hypot(p.x - q.x, p.y - q.y);
        if (d < 110) {
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y);
          ctx.strokeStyle = `rgba(0,220,180,${(1 - d / 110) * .12})`;
          ctx.lineWidth = .5; ctx.stroke();
        }
      }));
      raf = requestAnimationFrame(draw);
    };
    draw();
    const onResize = () => { w = canvas.width = window.innerWidth; h = canvas.height = window.innerHeight; };
    window.addEventListener("resize", onResize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", onResize); };
  }, []);
  return <canvas ref={ref} style={{ position: "fixed", inset: 0, zIndex: 0, opacity: .55, pointerEvents: "none" }} />;
}

