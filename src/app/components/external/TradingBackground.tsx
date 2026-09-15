'use client';
import React, { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';

export default function TradingBackground() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mountRef.current) return;

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

    // Renderer setup
    const renderer = new THREE.WebGLRenderer({ 
      antialias: true, 
      alpha: true 
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mountRef.current.appendChild(renderer.domElement);

    // Create tilted plane for candlesticks
    const planeGeometry = new THREE.PlaneGeometry(50, 30, 50, 30);
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

    // Lighting setup
    const ambientLight = new THREE.AmbientLight(0x404040, 0.5);
    scene.add(ambientLight);

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
        // Main candle body
        const candleGeometry = new THREE.BoxGeometry(0.8, this.height, 0.3);
        const candleMaterial = new THREE.MeshBasicMaterial({
          color: this.isGreen ? 0x00ff88 : 0xff3333,
          transparent: true,
          opacity: 0.9
        });
        const candle = new THREE.Mesh(candleGeometry, candleMaterial);
        candle.position.y = this.height / 2;
        candle.castShadow = true;
        this.group.add(candle);

        // Glow effect for candle
        const glowGeometry = new THREE.BoxGeometry(1.2, this.height + 0.5, 0.6);
        const glowMaterial = new THREE.MeshBasicMaterial({
          color: this.isGreen ? 0x00ff88 : 0xff3333,
          transparent: true,
          opacity: 0.3
        });
        const glow = new THREE.Mesh(glowGeometry, glowMaterial);
        glow.position.y = this.height / 2;
        this.group.add(glow);

        // Upper wick
        if (this.wickHeight > 0) {
          const upperWickGeometry = new THREE.BoxGeometry(0.1, this.wickHeight, 0.1);
          const wickMaterial = new THREE.MeshBasicMaterial({
            color: this.isGreen ? 0x00ff88 : 0xff3333,
            transparent: true,
            opacity: 0.8
          });
          const upperWick = new THREE.Mesh(upperWickGeometry, wickMaterial);
          upperWick.position.y = this.height + this.wickHeight / 2;
          this.group.add(upperWick);
        }

        // Lower wick
        const lowerWickHeight = Math.random() * 0.5 + 0.2;
        const lowerWickGeometry = new THREE.BoxGeometry(0.1, lowerWickHeight, 0.1);
        const lowerWickMaterial = new THREE.MeshBasicMaterial({
          color: this.isGreen ? 0x00ff88 : 0xff3333,
          transparent: true,
          opacity: 0.8
        });
        const lowerWick = new THREE.Mesh(lowerWickGeometry, lowerWickMaterial);
        lowerWick.position.y = -lowerWickHeight / 2;
        this.group.add(lowerWick);

        // Point light for glow effect
        const pointLight = new THREE.PointLight(
          this.isGreen ? 0x00ff88 : 0xff3333,
          2,
          5
        );
        pointLight.position.y = this.height / 2;
        this.group.add(pointLight);

        this.group.position.set(this.x, 0, this.z);
      }

      updatePosition(x: number, z: number) {
        this.group.position.set(x, 0, z);
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

    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);
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

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      if (mountRef.current) {
        mountRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []);

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
