'use client';
import React, { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';

// Three.js's own WebGLRenderer constructor listens for the canvas's
// 'webglcontextcreationerror' event and logs it with console.error/console.warn before
// re-throwing — so wrapping `new THREE.WebGLRenderer(...)` in try/catch stops the crash,
// but the try/catch runs too late to stop those console messages, which is what a
// browser's own error-reporting overlay (like Next's dev overlay) picks up and surfaces
// as if something were still broken. Feature-detecting on a plain, unlistened canvas
// first (mirrors the check three.js itself ships as THREE.WEBGL.isWebGLAvailable) fails
// silently instead, so THREE's own renderer is never constructed at all when this
// browser/GPU can't support it — no console noise either way.
function isWebGLAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (canvas.getContext('webgl2') || canvas.getContext('webgl')));
  } catch {
    return false;
  }
}

export default function TradingBackground() {
  const mountRef = useRef<HTMLDivElement>(null);
  // WebGL can be unavailable even in a real desktop Chrome — a GPU-disabled launch flag,
  // a remote desktop/VM with no GPU passthrough, or a sandboxed browser profile are all
  // enough to make WebGLRenderer's constructor throw. This is only a decorative
  // background, so that failure should fall back to the same flat color the div already
  // uses underneath, not crash the whole login page.
  const [webglAvailable, setWebglAvailable] = useState(true);

  useEffect(() => {
    if (!mountRef.current) return;

    if (!isWebGLAvailable()) {
      console.warn('[TradingBackground] WebGL unavailable, using static background instead');
      setWebglAvailable(false);
      return;
    }

    // Belt-and-suspenders: the feature check above should already rule this out, but if
    // construction still fails for some other reason, fall back the same way rather than
    // letting the exception crash the page.
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch (err) {
      console.warn('[TradingBackground] WebGL unavailable, using static background instead:', err);
      setWebglAvailable(false);
      return;
    }

    // Scene setup
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x0a0a0f, 10, 100);

    // Camera setup
    const camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );

    // Everything here is unlit (MeshBasicMaterial / grid lines), so no lights or shadow maps:
    // they'd cost work every frame without changing a pixel. The pixel ratio is capped because
    // this is a full-screen decorative layer.
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    const mount = mountRef.current;
    mount.appendChild(renderer.domElement);

    // Create tilted plane for candlesticks
    const planeGeometry = new THREE.PlaneGeometry(50, 30);
    const planeMaterial = new THREE.MeshBasicMaterial({
      color: 0x0a0a0f,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide
    });
    const plane = new THREE.Mesh(planeGeometry, planeMaterial);

    // Tilt the plane (25-35 degrees on X, 10-15 degrees on Y)
    plane.rotation.x = THREE.MathUtils.degToRad(-30); // 30 degrees tilt
    plane.rotation.y = THREE.MathUtils.degToRad(12);  // 12 degrees tilt
    plane.position.z = -10;
    scene.add(plane);

    // Grid overlay
    const gridHelper = new THREE.GridHelper(50, 50, 0x1a1a2e, 0x16213e);
    gridHelper.rotation.x = THREE.MathUtils.degToRad(90);
    gridHelper.position.z = -0.1;
    scene.add(gridHelper);

    // Materials are shared by every candle; each candle owns only its geometries, which are
    // disposed when it scrolls off and is replaced
    const makeMaterial = (color: number, opacity: number) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity });
    const materials = {
      green: { body: makeMaterial(0x00ff88, 0.9), glow: makeMaterial(0x00ff88, 0.3), wick: makeMaterial(0x00ff88, 0.8) },
      red: { body: makeMaterial(0xff3333, 0.9), glow: makeMaterial(0xff3333, 0.3), wick: makeMaterial(0xff3333, 0.8) },
    };

    // Candlestick data
    class Candlestick {
      x: number;
      z: number;
      height: number;
      isGreen: boolean;
      wickHeight: number;
      group: THREE.Group;

      constructor(x: number, z: number, height: number, isGreen: boolean, wickHeight: number) {
        this.x = x;
        this.z = z;
        this.height = height;
        this.isGreen = isGreen;
        this.wickHeight = wickHeight;
        this.group = new THREE.Group();
        this.create();
      }

      create() {
        const m = this.isGreen ? materials.green : materials.red;

        // Main candle body
        const candle = new THREE.Mesh(new THREE.BoxGeometry(0.8, this.height, 0.3), m.body);
        candle.position.y = this.height / 2;
        this.group.add(candle);

        // Glow effect for candle
        const glow = new THREE.Mesh(new THREE.BoxGeometry(1.2, this.height + 0.5, 0.6), m.glow);
        glow.position.y = this.height / 2;
        this.group.add(glow);

        // Upper wick
        if (this.wickHeight > 0) {
          const upperWick = new THREE.Mesh(new THREE.BoxGeometry(0.1, this.wickHeight, 0.1), m.wick);
          upperWick.position.y = this.height + this.wickHeight / 2;
          this.group.add(upperWick);
        }

        // Lower wick
        const lowerWickHeight = Math.random() * 0.5 + 0.2;
        const lowerWick = new THREE.Mesh(new THREE.BoxGeometry(0.1, lowerWickHeight, 0.1), m.wick);
        lowerWick.position.y = -lowerWickHeight / 2;
        this.group.add(lowerWick);

        this.group.position.set(this.x, 0, this.z);
      }

      updatePosition(x: number, z: number) {
        this.group.position.set(x, 0, z);
      }

      dispose() {
        this.group.children.forEach(child => (child as THREE.Mesh).geometry.dispose());
      }
    }

    // Create candlesticks array
    const candlesticks: Candlestick[] = [];
    const numCandles = 30;
    let basePrice = 10;

    for (let i = 0; i < numCandles; i++) {
      // Bullish trend with natural dips
      const trend = i * 0.15; // Overall upward trend
      const volatility = Math.sin(i * 0.5) * 0.8 + Math.random() * 0.4 - 0.2;
      const height = basePrice + trend + volatility;

      const isGreen = Math.random() > 0.3; // 70% green candles for bullish trend
      const wickHeight = Math.random() * 1.5 + 0.5;

      const candlestick = new Candlestick(
        -20 + i * 1.5, // X position
        Math.random() * 2 - 1, // Z position (slight depth variation)
        Math.max(height, 2), // Minimum height
        isGreen,
        wickHeight
      );

      candlesticks.push(candlestick);
      scene.add(candlestick.group);
    }

    // Position camera
    camera.position.set(0, 12, 20);
    camera.lookAt(0, 0, 0);

    // Animation variables
    let scrollSpeed = 0.02;
    let time = 0;
    let frameId = 0;

    // Animation loop (the frame id is kept so unmounting stops it; otherwise it keeps rendering
    // after the login page is gone and every visit adds another loop)
    const animate = () => {
      frameId = requestAnimationFrame(animate);
      time += 0.01;

      // Scroll candlesticks from right to left
      candlesticks.forEach((candlestick, index) => {
        const currentX = candlestick.group.position.x;
        let newX = currentX - scrollSpeed;

        // Reset position when candle goes off screen
        if (newX < -25) {
          newX = 20;
          // Update candle data for variety
          const trend = index * 0.15;
          const volatility = Math.sin(time * 2 + index) * 0.8 + Math.random() * 0.4 - 0.2;
          const height = basePrice + trend + volatility;
          const isGreen = Math.random() > 0.3;
          const wickHeight = Math.random() * 1.5 + 0.5;

          // Remove old candle and create new one
          scene.remove(candlestick.group);
          candlestick.dispose();
          candlesticks[index] = new Candlestick(
            newX,
            Math.random() * 2 - 1,
            Math.max(height, 2),
            isGreen,
            wickHeight
          );
          scene.add(candlesticks[index].group);
        } else {
          candlestick.updatePosition(newX, candlestick.group.position.z);
        }

        // Subtle breathing animation
        const breatheScale = 1 + Math.sin(time * 2 + index * 0.1) * 0.02;
        candlestick.group.scale.set(breatheScale, breatheScale, breatheScale);
      });

      // Subtle camera sway/breathe effect
      const cameraSwayX = Math.sin(time * 0.5) * 0.5;
      const cameraSwayY = Math.cos(time * 0.3) * 0.2;
      camera.position.x = cameraSwayX;
      camera.position.y = 12 + cameraSwayY;

      // Very slow Z rotation for life-like effect
      const slowRotation = Math.sin(time * 0.1) * 0.02;
      camera.rotation.z = slowRotation;

      renderer.render(scene, camera);
    };

    // Handle window resize
    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };

    window.addEventListener('resize', handleResize);
    animate();

    // Cleanup: stop the loop, free GPU buffers and release the WebGL context
    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener('resize', handleResize);
      candlesticks.forEach(c => c.dispose());
      planeGeometry.dispose();
      planeMaterial.dispose();
      gridHelper.geometry.dispose();
      (gridHelper.material as THREE.Material).dispose();
      Object.values(materials).forEach(set => Object.values(set).forEach(mat => mat.dispose()));
      renderer.dispose();
      renderer.forceContextLoss();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, []);

  if (!webglAvailable) {
    return (
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          zIndex: 0,
          pointerEvents: 'none',
          background: '#0a0a0f'
        }}
      />
    );
  }

  return (
    <div
      ref={mountRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
        background: '#0a0a0f'
      }}
    />
  );
}
