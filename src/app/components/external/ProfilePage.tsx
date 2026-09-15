'use client';
import React, { useState } from 'react';
import { TrendingUp, Menu, X, User, Bell, Shield, CreditCard, Edit2, Camera, Mail, Calendar, MapPin, Award, Activity, DollarSign, BarChart3 } from 'lucide-react';
import { TVSettingsIcon } from '../icons/TVIcons';
import { load } from '@cashfreepayments/cashfree-js';
import TestingDashboard from './TestingDashboard';

import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';

export default function ProfilePage() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [editMode, setEditMode] = useState(false);
  const [riskLevel, setRiskLevel] = useState('Moderate (4-6)');

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  const handlePayment = async () => {
    try {
      // 1. Get payment session ID from backend
      const response = await fetch('http://localhost:8000/api/users/create-order/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          uid: user?.uid || 'guest_user',
          amount: 49.99 // e.g. Pro tier price
        })
      });
      
      const data = await response.json();
      
      if (data.payment_session_id) {
        // 2. Initialize Cashfree
        const cashfree = await load({
          mode: "sandbox" // Change to production when ready
        });
        
        // 3. Initiate checkout
        cashfree.checkout({
          paymentSessionId: data.payment_session_id,
          returnUrl: `http://localhost:3000/profile?order_id={order_id}`
        });
      } else {
        alert("Failed to initialize payment.");
      }
    } catch (error) {
      console.error("Payment error:", error);
      alert("Error processing payment.");
    }
  };

  const stats = [
    { value: '$124,563', label: 'Total Profit', icon: <TrendingUp className="w-5 h-5" />, color: 'text-green-400' },
    { value: '1,247', label: 'Total Trades', icon: <BarChart3 className="w-5 h-5" />, color: 'text-purple-400' },
    { value: '68.4%', label: 'Win Rate', icon: <Activity className="w-5 h-5" />, color: 'text-blue-400' },
    { value: '4.8', label: 'Risk Score', icon: <Shield className="w-5 h-5" />, color: 'text-yellow-400' }
  ];

  const recentActivity = [
    { type: 'trade', symbol: 'BTC/USD', action: 'Buy', amount: '$2,500', profit: '+$125', time: '2 hours ago', positive: true },
    { type: 'trade', symbol: 'ETH/USD', action: 'Sell', amount: '$1,800', profit: '-$45', time: '4 hours ago', positive: false },
    { type: 'trade', symbol: 'AAPL', action: 'Buy', amount: '$3,200', profit: '+$89', time: '6 hours ago', positive: true },
    { type: 'deposit', amount: '$10,000', time: '1 day ago', positive: true }
  ];

  const achievements = [
    { name: 'Profit Master', description: 'Earn $100,000 in profits', icon: <Award className="w-6 h-6" />, unlocked: true },
    { name: 'Day Trader', description: 'Complete 1000 trades', icon: <BarChart3 className="w-6 h-6" />, unlocked: true },
    { name: 'Risk Manager', description: 'Maintain risk score below 5', icon: <Shield className="w-6 h-6" />, unlocked: true },
    { name: 'Consistency King', description: '65% win rate for 30 days', icon: <TrendingUp className="w-6 h-6" />, unlocked: false }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-purple-950 to-black text-white overflow-x-hidden">
      {/* Animated Background Blobs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none" style={{ zIndex: 0 }}>
        <div className="blob blob-1"></div>
        <div className="blob blob-2"></div>
        <div className="blob blob-3"></div>
      </div>

      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 transition-all duration-300 bg-purple-900/90 backdrop-blur-md shadow-lg">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-10 h-10 bg-gradient-to-r from-purple-500 to-indigo-500 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-6 h-6" />
              </div>
              <span className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-indigo-400 bg-clip-text text-transparent">
                TradePilot
              </span>
            </div>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center space-x-8">
              <a href="/landing" className="text-purple-400 hover:text-white transition-colors">Home</a>
              <a href="/trading" className="text-purple-400 hover:text-white transition-colors">Trading</a>
              <a href="/profile" className="text-white font-semibold">Profile</a>
              <a href="/login" className="bg-gradient-to-r from-purple-700 to-indigo-700 hover:from-purple-800 hover:to-indigo-800 px-6 py-2 rounded-lg font-semibold transition-all transform hover:scale-105">
                Logout
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
              <a href="/landing" className="block text-purple-400 hover:text-white transition-colors">Home</a>
              <a href="/trading" className="block text-purple-400 hover:text-white transition-colors">Trading</a>
              <a href="/profile" className="block text-white font-semibold">Profile</a>
              <a href="/login" className="block text-center w-full bg-gradient-to-r from-purple-700 to-indigo-700 px-6 py-2 rounded-lg font-semibold transition-all">
                Logout
              </a>
            </div>
          )}
        </div>
      </nav>

      {/* Profile Content */}
      <div className="relative pt-24 pb-12 px-6" style={{ zIndex: 1 }}>
        <div className="container mx-auto max-w-6xl">
          {/* Profile Header */}
          <div className="bg-purple-950/60 backdrop-blur-sm border border-purple-800/50 rounded-2xl p-8 mb-8">
            <div className="flex flex-col md:flex-row items-center md:items-start gap-8">
              {/* Profile Picture */}
              <div className="relative">
                <div className="w-32 h-32 bg-gradient-to-r from-purple-600 to-indigo-600 rounded-full flex items-center justify-center">
                  <User className="w-16 h-16" />
                </div>
                <button className="absolute bottom-0 right-0 w-10 h-10 bg-purple-600 rounded-full flex items-center justify-center hover:bg-purple-700 transition-colors">
                  <Camera className="w-5 h-5" />
                </button>
              </div>

              {/* Profile Info */}
              <div className="flex-1 text-center md:text-left">
                <div className="flex items-center justify-center md:justify-start gap-4 mb-2">
                  <h1 className="text-3xl font-bold">{user?.displayName || 'John Trader'}</h1>
                  <button 
                    onClick={() => setEditMode(!editMode)}
                    className="text-purple-400 hover:text-purple-300 transition-colors"
                  >
                    <Edit2 className="w-5 h-5" />
                  </button>
                </div>
                <p className="text-purple-400 mb-4">@{user?.displayName?.toLowerCase().replace(/\s/g, '') || 'johntrader'} • Professional Trader</p>
                
                <div className="flex flex-wrap gap-4 justify-center md:justify-start text-sm text-purple-300">
                  <div className="flex items-center gap-2">
                    <Mail className="w-4 h-4" />
                    {user?.email || 'john.trader@tradepilot.com'}
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    Joined {user?.metadata.creationTime ? new Date(user.metadata.creationTime).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : 'March 2024'}
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4" />
                    New York, USA
                  </div>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="flex flex-col gap-3">
                <button className="flex items-center gap-2 bg-purple-800/50 hover:bg-purple-800/70 px-4 py-2 rounded-lg transition-all">
                  <TVSettingsIcon className="w-4 h-4" />
                  Settings
                </button>
                <button className="flex items-center gap-2 bg-purple-800/50 hover:bg-purple-800/70 px-4 py-2 rounded-lg transition-all">
                  <Bell className="w-4 h-4" />
                  Notifications
                </button>
                <a href="/pricing" className="flex items-center gap-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 px-4 py-2 rounded-lg transition-all font-semibold shadow-lg shadow-green-900/20 text-white no-underline w-fit">
                  <CreditCard className="w-4 h-4" />
                  Upgrade to Pro
                </a>
              </div>
            </div>
          </div>

          {/* Stats Overview */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {stats.map((stat, index) => (
              <div key={index} className="bg-purple-950/60 backdrop-blur-sm border border-purple-800/50 rounded-xl p-6">
                <div className="flex items-center justify-between mb-3">
                  <div className={`p-2 bg-purple-900/50 rounded-lg ${stat.color}`}>
                    {stat.icon}
                  </div>
                </div>
                <div className="text-2xl font-bold mb-1">{stat.value}</div>
                <div className="text-purple-400 text-sm">{stat.label}</div>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mb-8 bg-purple-900/30 p-1 rounded-xl max-w-md">
            {['overview', 'activity', 'achievements', 'settings', 'testing'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 px-4 py-2 rounded-lg capitalize transition-all ${
                  activeTab === tab 
                    ? 'bg-purple-700 text-white' 
                    : 'text-purple-400 hover:text-white'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="bg-purple-950/60 backdrop-blur-sm border border-purple-800/50 rounded-2xl p-8">
            {activeTab === 'overview' && (
              <div>
                <h2 className="text-2xl font-bold mb-6">Performance Overview</h2>
                <div className="grid md:grid-cols-2 gap-8">
                  <div>
                    <h3 className="text-lg font-semibold mb-4 text-purple-300">Trading Performance</h3>
                    <div className="space-y-4">
                      <div className="flex justify-between">
                        <span className="text-purple-400">Daily Average</span>
                        <span className="text-green-400">+$423</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-purple-400">Weekly Profit</span>
                        <span className="text-green-400">+$2,961</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-purple-400">Monthly Profit</span>
                        <span className="text-green-400">+$12,684</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-purple-400">Best Trade</span>
                        <span className="text-green-400">+$3,247</span>
                      </div>
                    </div>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold mb-4 text-purple-300">Risk Analysis</h3>
                    <div className="space-y-4">
                      <div className="flex justify-between">
                        <span className="text-purple-400">Risk Score</span>
                        <span className="text-yellow-400">4.8 / 10</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-purple-400">Max Drawdown</span>
                        <span className="text-red-400">-12.3%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-purple-400">Sharpe Ratio</span>
                        <span className="text-blue-400">2.34</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-purple-400">Success Rate</span>
                        <span className="text-green-400">68.4%</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'activity' && (
              <div>
                <h2 className="text-2xl font-bold mb-6">Recent Activity</h2>
                <div className="space-y-4">
                  {recentActivity.map((activity, index) => (
                    <div key={index} className="flex items-center justify-between p-4 bg-purple-900/30 rounded-lg">
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                          activity.positive ? 'bg-green-500/20' : 'bg-red-500/20'
                        }`}>
                          {activity.type === 'trade' ? (
                            <BarChart3 className="w-5 h-5" />
                          ) : (
                            <DollarSign className="w-5 h-5" />
                          )}
                        </div>
                        <div>
                          <div className="font-semibold">
                            {activity.type === 'trade' ? `${activity.action} ${activity.symbol}` : 'Deposit'}
                          </div>
                          <div className="text-sm text-purple-400">{activity.time}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold">{activity.amount}</div>
                        <div className={`text-sm ${activity.positive ? 'text-green-400' : 'text-red-400'}`}>
                          {activity.profit}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'achievements' && (
              <div>
                <h2 className="text-2xl font-bold mb-6">Achievements</h2>
                <div className="grid md:grid-cols-2 gap-6">
                  {achievements.map((achievement, index) => (
                    <div 
                      key={index}
                      className={`p-6 rounded-xl border transition-all ${
                        achievement.unlocked 
                          ? 'bg-purple-900/40 border-purple-700/50' 
                          : 'bg-gray-900/20 border-gray-800/30 opacity-50'
                      }`}
                    >
                      <div className="flex items-center gap-4 mb-3">
                        <div className={`p-3 rounded-lg ${
                          achievement.unlocked ? 'bg-purple-700/50' : 'bg-gray-700/50'
                        }`}>
                          {achievement.icon}
                        </div>
                        <div>
                          <h3 className="font-semibold">{achievement.name}</h3>
                          <p className="text-sm text-purple-400">{achievement.description}</p>
                        </div>
                      </div>
                      <div className={`text-sm ${
                        achievement.unlocked ? 'text-green-400' : 'text-gray-500'
                      }`}>
                        {achievement.unlocked ? '✓ Unlocked' : '🔒 Locked'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'settings' && (
              <div>
                <h2 className="text-2xl font-bold mb-6">Account Settings</h2>
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold mb-4 text-purple-300">Preferences</h3>
                    <div className="space-y-4">
                      <label className="flex items-center justify-between">
                        <span>Email Notifications</span>
                        <input type="checkbox" defaultChecked className="w-5 h-5" />
                      </label>
                      <label className="flex items-center justify-between">
                        <span>Push Notifications</span>
                        <input type="checkbox" defaultChecked className="w-5 h-5" />
                      </label>
                      <label className="flex items-center justify-between">
                        <span>Two-Factor Authentication</span>
                        <input type="checkbox" className="w-5 h-5" />
                      </label>
                    </div>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold mb-4 text-purple-300">Trading Settings</h3>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm text-purple-400 mb-2">Default Risk Level</label>
                        <select 
                          value={riskLevel} 
                          onChange={(e) => setRiskLevel(e.target.value)}
                          className="w-full bg-purple-900/50 border border-purple-700/50 rounded-lg px-4 py-2 outline-none"
                        >
                          <option>Conservative (1-3)</option>
                          <option>Moderate (4-6)</option>
                          <option>Aggressive (7-10)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm text-purple-400 mb-2">Max Position Size</label>
                        <input type="text" defaultValue="$10,000" className="w-full bg-purple-900/50 border border-purple-700/50 rounded-lg px-4 py-2 outline-none" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            {activeTab === 'testing' && (
              <div>
                <TestingDashboard />
              </div>
            )}
          </div>
        </div>
      </div>

      <style jsx global>{`
        .blob {
          position: absolute;
          border-radius: 50%;
          filter: blur(80px);
          opacity: 0.15;
          will-change: opacity;
          transform: translateZ(0);
          animation: pulse-blob 6s ease-in-out infinite;
        }
        .blob-1 { width: 320px; height: 320px; background: #581c87; top: -80px; right: -80px; animation-delay: 0s; }
        .blob-2 { width: 320px; height: 320px; background: #581c87; bottom: -80px; left: -80px; animation-delay: 2s; }
        .blob-3 { width: 384px; height: 384px; background: #4c1d95; top: 50%; left: 50%; transform: translate3d(-50%, -50%, 0); opacity: 0.08; animation-delay: 4s; }
        @keyframes pulse-blob { 0%, 100% { opacity: 0.15; } 50% { opacity: 0.25; } }
      `}</style>
    </div>
  );
}
