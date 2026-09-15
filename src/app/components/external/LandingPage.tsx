'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { TrendingUp, BarChart3, LineChart, Activity, Zap, Shield, Globe, ArrowRight, Menu, X, Target } from 'lucide-react';
import RollingBitcoin from './RollingBitcoin';

export default function LandingPage() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [scrollY, setScrollY] = useState(0);
  const [activeFeature, setActiveFeature] = useState(0);

  useEffect(() => {
    document.title = 'TradePilot | Professional Trading Made Simple';
  }, []);

  useEffect(() => {
    let ticking = false;
    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          setScrollY(window.scrollY);
          ticking = false;
        });
        ticking = true;
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveFeature((prev) => (prev + 1) % 4);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const scrollToSection = useCallback((sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      const navbarHeight = 80;
      const elementPosition = element.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({
        top: elementPosition - navbarHeight,
        behavior: 'smooth',
      });
    }
    setIsMenuOpen(false);
  }, []);

  const features = [
    { icon: <TrendingUp className="w-8 h-8" />, title: "Advanced Charting", description: "Professional-grade charts with multiple drawing tools and technical indicators" },
    { icon: <Activity className="w-8 h-8" />, title: "Real-time Analysis", description: "Live market data with instant updates and customizable timeframes" },
    { icon: <Shield className="w-8 h-8" />, title: "Risk Management", description: "Built-in position sizing, stop-loss, and risk-reward calculation tools" },
    { icon: <Zap className="w-8 h-8" />, title: "Lightning Fast", description: "Optimized performance for smooth scrolling and instant chart interactions" }
  ];

  const stats = [
    { value: "10K+", label: "Active Traders" },
    { value: "50M+", label: "Charts Analyzed" },
    { value: "99.9%", label: "Uptime" },
    { value: "24/7", label: "Support" }
  ];

  const tools = [
    { name: "Trendlines", icon: <LineChart className="w-6 h-6" /> },
    { name: "Shapes", icon: <Target className="w-6 h-6" /> },
    { name: "Fibonacci", icon: <BarChart3 className="w-6 h-6" /> },
    { name: "Curves", icon: <Activity className="w-6 h-6" /> },
    { name: "Text", icon: <Globe className="w-6 h-6" /> },
    { name: "Risk Tools", icon: <Shield className="w-6 h-6" /> }
  ];

  return (
    <div className="bg-gradient-to-br from-black via-purple-950 to-black text-white overflow-x-hidden">
      {/* Background Blobs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none" style={{ zIndex: 0 }}>
        <div className="blob blob-1"></div>
        <div className="blob blob-2"></div>
        <div className="blob blob-3"></div>
      </div>

      {/* Navigation */}
      <nav className={`fixed top-0 w-full z-50 transition-all duration-300 ${scrollY > 50 ? 'bg-purple-900/90 backdrop-blur-md shadow-lg' : 'bg-transparent'}`}>
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-10 h-10 bg-gradient-to-r from-purple-500 to-indigo-500 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-6 h-6" />
              </div>
              <span className="bg-gradient-to-r from-purple-400 to-indigo-400 bg-clip-text text-transparent font-bold text-xl">
                TradePilot
              </span>
            </div>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center space-x-8">
              <button onClick={() => scrollToSection('features')} className="text-purple-400 hover:text-white transition-colors">Features</button>
              <button onClick={() => scrollToSection('tools')} className="text-purple-400 hover:text-white transition-colors">Tools</button>
              <a href="/about" className="text-purple-400 hover:text-white transition-colors">About Us</a>
              <a href="/contact" className="text-purple-400 hover:text-white transition-colors">Contact</a>
              <a href="/pricing" className="text-purple-400 hover:text-white transition-colors">Pricing</a>
              <a href="/profile" className="text-purple-400 hover:text-white transition-colors">Profile</a>
              <a href="/login" className="bg-gradient-to-r from-purple-700 to-indigo-700 hover:from-purple-800 hover:to-indigo-800 px-6 py-2 rounded-lg font-semibold transition-all transform hover:scale-105">
                Get Started
              </a>
            </div>

            {/* Mobile Menu Button */}
            <button className="md:hidden text-white" onClick={() => setIsMenuOpen(!isMenuOpen)}>
              {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>

          {/* Mobile Navigation */}
          {isMenuOpen && (
            <div className="md:hidden mt-4 pb-4 space-y-4">
              <button onClick={() => scrollToSection('features')} className="block text-purple-400 hover:text-white transition-colors">Features</button>
              <button onClick={() => scrollToSection('tools')} className="block text-purple-400 hover:text-white transition-colors">Tools</button>
              <a href="/about" className="block text-purple-400 hover:text-white transition-colors">About Us</a>
              <a href="/contact" className="block text-purple-400 hover:text-white transition-colors">Contact</a>
              <a href="/pricing" className="block text-purple-400 hover:text-white transition-colors">Pricing</a>
              <a href="/profile" className="block text-purple-400 hover:text-white transition-colors">Profile</a>
              <a href="/login" className="block text-center w-full bg-gradient-to-r from-purple-700 to-indigo-700 px-6 py-2 rounded-lg font-semibold transition-all">
                Get Started
              </a>
            </div>
          )}
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative flex items-center justify-center px-6 pt-32 pb-20 overflow-hidden" style={{ zIndex: 1, minHeight: '100vh' }}>
        <RollingBitcoin />
        <div className="container mx-auto text-center relative" style={{ zIndex: 2 }}>
          <div className="max-w-4xl mx-auto">
            <h1 className="text-5xl md:text-7xl font-bold mb-6 animate-fade-in-up">
              <span className="bg-gradient-to-r from-purple-400 via-pink-400 to-indigo-400 bg-clip-text text-transparent">Professional Trading</span>
              <br /><span className="text-white">Made Simple</span>
            </h1>
            <p className="text-xl md:text-2xl text-purple-400 mb-8 animate-fade-in-up animation-delay-200">
              Advanced charting tools, real-time analysis, and intelligent risk management all in one powerful platform.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center animate-fade-in-up animation-delay-400">
              <a href="/login" className="bg-gradient-to-r from-purple-700 to-indigo-700 hover:from-purple-800 hover:to-indigo-800 px-8 py-4 rounded-lg font-semibold text-lg transition-all transform hover:scale-105 flex items-center justify-center">
                Start Trading <ArrowRight className="inline-block ml-2 w-5 h-5" />
              </a>
              <a href="/signup" className="border-2 border-purple-600 hover:border-white px-8 py-4 rounded-lg font-semibold text-lg transition-all flex items-center justify-center">
                Watch Demo
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 px-6" style={{ zIndex: 1, position: 'relative' }}>
        <div className="container mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-4">
              <span className="bg-gradient-to-r from-purple-400 to-indigo-400 bg-clip-text text-transparent">Powerful Features</span>
            </h2>
            <p className="text-xl text-purple-400 max-w-2xl mx-auto">Everything you need to analyze markets and execute trades with confidence.</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {features.map((feature, index) => (
              <div key={index} className={`bg-purple-950/60 backdrop-blur-sm border border-purple-800/50 rounded-xl p-6 transition-all duration-500 ${activeFeature === index ? 'scale-105 border-purple-600 shadow-xl' : ''}`}>
                <div className="text-purple-500 mb-4">{feature.icon}</div>
                <h3 className="text-xl font-bold text-white mb-2">{feature.title}</h3>
                <p className="text-purple-200">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-6 border-t border-purple-900" style={{ zIndex: 1, position: 'relative' }}>
        <div className="container mx-auto flex flex-col md:flex-row justify-between items-center">
          <div className="flex items-center space-x-2 mb-4 md:mb-0">
            <TrendingUp className="w-8 h-8 text-purple-500" />
            <span className="text-xl font-bold">TradePilot</span>
          </div>
          <div className="text-purple-400 text-center text-sm">© 2024 TradePilot. Professional trading platform.</div>
        </div>
      </footer>

      <style jsx global>{`
        .blob { position: absolute; border-radius: 50%; filter: blur(80px); opacity: 0.15; will-change: opacity; transform: translateZ(0); animation: pulse-blob 6s ease-in-out infinite; }
        .blob-1 { width: 320px; height: 320px; background: #581c87; top: -80px; right: -80px; }
        .blob-2 { width: 320px; height: 320px; background: #581c87; bottom: -80px; left: -80px; }
        .blob-3 { width: 384px; height: 384px; background: #4c1d95; top: 50%; left: 50%; transform: translate3d(-50%, -50%, 0); opacity: 0.08; }
        @keyframes pulse-blob { 0%, 100% { opacity: 0.15; } 50% { opacity: 0.25; } }
        @keyframes fade-in-up { from { opacity: 0; transform: translate3d(0, 30px, 0); } to { opacity: 1; transform: translate3d(0, 0, 0); } }
        .animate-fade-in-up { animation: fade-in-up 0.8s ease-out forwards; will-change: transform, opacity; }
        .animation-delay-200 { animation-delay: 200ms; }
        .animation-delay-400 { animation-delay: 400ms; }
      `}</style>
    </div>
  );
}
