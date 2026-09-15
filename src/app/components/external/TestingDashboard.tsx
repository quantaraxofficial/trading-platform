'use client';
import React, { useState } from 'react';
import { Play, Clock, Activity, TrendingUp, BarChart3, Settings, Trash2, Plus, Info, LayoutDashboard, Calendar, X } from 'lucide-react';

export default function TestingDashboard() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [sessionType, setSessionType] = useState('backtesting'); // 'backtesting' | 'propfirm'

  return (
    <div className="space-y-8">
      {/* Sub Navigation */}
      <div className="flex gap-6 border-b border-purple-800/50 pb-4">
        {['dashboard', 'sessions', 'trades', 'analytics'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex items-center gap-2 px-2 py-1 capitalize font-semibold transition-colors relative ${
              activeTab === tab ? 'text-white' : 'text-purple-400 hover:text-purple-200'
            }`}
          >
            {tab === 'dashboard' && <LayoutDashboard className="w-4 h-4" />}
            {tab === 'sessions' && <Clock className="w-4 h-4" />}
            {tab === 'trades' && <BarChart3 className="w-4 h-4" />}
            {tab === 'analytics' && <Activity className="w-4 h-4" />}
            {tab}
            {activeTab === tab && (
              <div className="absolute bottom-[-17px] left-0 right-0 h-1 bg-gradient-to-r from-purple-500 to-indigo-500 rounded-t-full"></div>
            )}
          </button>
        ))}
      </div>

      {activeTab === 'dashboard' && (
        <div className="space-y-6">
          {/* Stat Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-purple-950/60 backdrop-blur-sm border border-purple-800/50 rounded-2xl p-6 relative overflow-hidden group hover:border-purple-600/50 transition-colors">
              <div className="absolute top-4 right-4 text-purple-400 opacity-50 group-hover:opacity-100 transition-opacity"><Info className="w-4 h-4" /></div>
              <div className="flex items-center gap-2 text-purple-300 font-semibold mb-4">
                <BarChart3 className="w-5 h-5 text-indigo-400" /> Time Invested
              </div>
              <div className="text-3xl font-bold flex items-baseline gap-1">
                34 <span className="text-lg text-purple-400 font-normal">min</span>
              </div>
            </div>

            <div className="bg-purple-950/60 backdrop-blur-sm border border-purple-800/50 rounded-2xl p-6 relative overflow-hidden group hover:border-purple-600/50 transition-colors">
              <div className="absolute top-4 right-4 text-purple-400 opacity-50 group-hover:opacity-100 transition-opacity"><Info className="w-4 h-4" /></div>
              <div className="flex items-center gap-2 text-purple-300 font-semibold mb-4">
                <Clock className="w-5 h-5 text-purple-400" /> Historical time replayed
              </div>
              <div className="text-3xl font-bold flex items-baseline gap-1">
                2<span className="text-lg text-purple-400 font-normal mr-2">d</span> 
                3<span className="text-lg text-purple-400 font-normal mr-2">hr</span> 
                51<span className="text-lg text-purple-400 font-normal">min</span>
              </div>
            </div>

            <div className="bg-purple-950/60 backdrop-blur-sm border border-purple-800/50 rounded-2xl p-6 relative overflow-hidden group hover:border-purple-600/50 transition-colors">
              <div className="absolute top-4 right-4 text-purple-400 opacity-50 group-hover:opacity-100 transition-opacity"><Info className="w-4 h-4" /></div>
              <div className="flex items-center gap-2 text-purple-300 font-semibold mb-4">
                <Activity className="w-5 h-5 text-green-400" /> Trades taken
              </div>
              <div className="text-3xl font-bold mb-4">12</div>
              <div className="w-full h-2 bg-purple-900/50 rounded-full overflow-hidden flex">
                <div className="bg-green-500 h-full" style={{ width: '41.67%' }}></div>
                <div className="bg-red-500 h-full" style={{ width: '58.33%' }}></div>
              </div>
              <div className="flex justify-between mt-2 text-xs font-semibold">
                <span className="text-green-400">41.67% buys</span>
                <span className="text-red-400">58.33% sells</span>
              </div>
            </div>

            <div className="bg-purple-950/60 backdrop-blur-sm border border-purple-800/50 rounded-2xl p-6 relative overflow-hidden group hover:border-purple-600/50 transition-colors">
              <div className="absolute top-4 right-4 text-purple-400 opacity-50 group-hover:opacity-100 transition-opacity"><Info className="w-4 h-4" /></div>
              <div className="flex items-center gap-2 text-purple-300 font-semibold mb-4">
                <TrendingUp className="w-5 h-5 text-yellow-400" /> Overall win rate
              </div>
              <div className="text-3xl font-bold text-white">25%</div>
            </div>
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Win Rate Bar Chart Mockup */}
            <div className="bg-purple-950/60 backdrop-blur-sm border border-purple-800/50 rounded-2xl p-6 h-80 flex flex-col relative">
               <div className="absolute top-4 right-4 text-purple-400 opacity-50 hover:opacity-100 transition-opacity cursor-pointer"><Info className="w-4 h-4" /></div>
               <h3 className="text-lg font-semibold mb-6 text-purple-100">Win Rate</h3>
               <div className="flex-1 flex items-end gap-12 px-8 pb-8 relative">
                 {/* Y Axis Guides */}
                 <div className="absolute inset-0 pt-16 pb-8 px-8 flex flex-col justify-between pointer-events-none">
                    {[100, 80, 60, 40, 20, 0].map(val => (
                      <div key={val} className="flex items-center gap-4">
                        <span className="text-xs text-purple-500 w-8 text-right">{val}%</span>
                        <div className="flex-1 border-b border-dashed border-purple-800/30"></div>
                      </div>
                    ))}
                 </div>
                 {/* Bars */}
                 <div className="relative z-10 w-24 ml-16 flex flex-col items-center">
                   <div className="w-full bg-gradient-to-t from-blue-600/80 to-blue-400 rounded-t-sm shadow-[0_0_15px_rgba(59,130,246,0.3)] hover:brightness-125 transition-all cursor-pointer" style={{ height: '22%' }}></div>
                   <span className="text-xs text-purple-400 mt-4 absolute -bottom-8">Apr 2026</span>
                 </div>
                 <div className="relative z-10 w-24 flex flex-col items-center">
                   <div className="w-full bg-gradient-to-t from-blue-600/80 to-blue-400 rounded-t-sm shadow-[0_0_15px_rgba(59,130,246,0.3)] hover:brightness-125 transition-all cursor-pointer" style={{ height: '2%' }}></div>
                   <span className="text-xs text-purple-400 mt-4 absolute -bottom-8">May 2026</span>
                 </div>
                 <div className="relative z-10 w-24 flex flex-col items-center">
                   <div className="w-full bg-gradient-to-t from-blue-600/80 to-blue-400 rounded-t-sm shadow-[0_0_15px_rgba(59,130,246,0.3)] hover:brightness-125 transition-all cursor-pointer" style={{ height: '32%' }}></div>
                   <span className="text-xs text-purple-400 mt-4 absolute -bottom-8">Jun 2026</span>
                 </div>
               </div>
            </div>

            {/* Trades by Symbol Box Mockup */}
            <div className="bg-purple-950/60 backdrop-blur-sm border border-purple-800/50 rounded-2xl p-6 h-80 flex flex-col relative">
               <div className="absolute top-4 right-4 text-purple-400 opacity-50 hover:opacity-100 transition-opacity cursor-pointer"><Info className="w-4 h-4" /></div>
               <h3 className="text-lg font-semibold mb-6 text-purple-100">Trades by symbol</h3>
               <div className="flex-1 flex items-center justify-center p-8 relative">
                 {/* Y Axis Guides */}
                 <div className="absolute inset-0 pt-16 pb-12 px-8 flex flex-col justify-between pointer-events-none">
                    <div className="flex items-center gap-4 h-full">
                      <span className="text-xs text-purple-500 w-24 text-right">OANDA:XAUUSD</span>
                      <div className="flex-1 border-b border-dashed border-purple-800/30"></div>
                    </div>
                 </div>
                 {/* X Axis Guides */}
                 <div className="absolute bottom-8 left-0 right-0 px-36 flex justify-between">
                   <span className="text-xs text-purple-500">0</span>
                   <span className="text-xs text-purple-500">20</span>
                 </div>
                 
                 {/* Gradient Box */}
                 <div className="w-3/4 h-3/4 bg-gradient-to-br from-indigo-900 via-purple-600 to-fuchsia-500 rounded-lg shadow-[0_0_30px_rgba(168,85,247,0.4)] ml-16 relative z-10 border border-purple-400/20 hover:scale-105 transition-transform cursor-pointer"></div>
               </div>
            </div>
          </div>

          {/* Recent Sessions */}
          <div className="mt-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold">Recent Sessions</h3>
              <div className="flex items-center gap-2 text-sm text-purple-300">
                <span>1 out of 2 sessions</span>
                <div className="w-24 h-1.5 bg-purple-900/50 rounded-full overflow-hidden">
                  <div className="bg-emerald-400 h-full w-1/2"></div>
                </div>
              </div>
            </div>
            
            <div className="bg-purple-950/40 border border-purple-800/30 rounded-xl p-4 flex items-center justify-between hover:bg-purple-900/40 transition-colors">
               <div className="flex items-center gap-4">
                 <div className="w-10 h-10 bg-blue-500/20 text-blue-400 rounded-full flex items-center justify-center cursor-pointer hover:bg-blue-500/30 transition-colors">
                   <Play className="w-5 h-5 ml-1" />
                 </div>
                 <div>
                   <div className="flex items-center gap-3">
                     <span className="font-bold text-lg">XAUUSD</span>
                     <span className="text-xs px-2 py-0.5 bg-blue-500/20 text-blue-300 rounded border border-blue-500/30 flex items-center gap-1">⚡ 7 days</span>
                   </div>
                   <div className="flex items-center gap-4 text-sm text-purple-400 mt-1">
                     <div className="flex items-center gap-1"><Calendar className="w-3 h-3" /> 1/1/26 - 6/2/26</div>
                     <div className="flex items-center gap-1"><span className="text-emerald-400 font-semibold">$99,901.00</span></div>
                     <div className="text-xs border border-purple-700 rounded-full px-2 py-0.5 bg-purple-900/30">OANDA:XAUUSD</div>
                   </div>
                 </div>
               </div>
               
               <div className="flex items-center gap-6">
                 <div className="text-sm font-semibold text-purple-300">Remaining days: 152</div>
                 <div className="flex items-center gap-2">
                   <button className="p-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"><Trash2 className="w-4 h-4" /></button>
                   <button className="p-2 rounded-lg bg-purple-800/30 text-purple-300 hover:bg-purple-700/50 transition-colors"><Settings className="w-4 h-4" /></button>
                   <button className="p-2 rounded-lg bg-purple-800/30 text-purple-300 hover:bg-purple-700/50 transition-colors"><BarChart3 className="w-4 h-4" /></button>
                   <button className="p-2 rounded-lg bg-purple-800/30 text-purple-300 hover:bg-purple-700/50 transition-colors"><Activity className="w-4 h-4" /></button>
                   <button className="px-4 py-2 rounded-lg bg-purple-800/50 text-white font-semibold hover:bg-purple-700 transition-colors">Summary</button>
                 </div>
               </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'sessions' && (
        <div className="space-y-6">
          {/* Upgrade Banner */}
          <div className="bg-gradient-to-r from-blue-900/40 to-indigo-900/40 border border-indigo-500/30 rounded-xl p-4 flex items-center justify-between shadow-[0_0_20px_rgba(79,70,229,0.15)]">
            <span className="text-indigo-200">Sessions on the Beginner plan are hidden after 1 week. Upgrade to Pro to unlock all your past sessions.</span>
            <button className="px-4 py-2 bg-transparent border border-indigo-400 text-indigo-300 rounded-lg hover:bg-indigo-500/20 font-semibold transition-colors flex items-center gap-2">
              ⚡ Upgrade
            </button>
          </div>

          {/* Action Bar */}
          <div className="flex items-center justify-between">
             <div className="bg-purple-950/60 border border-purple-800/50 rounded-xl overflow-hidden flex divide-x divide-purple-800/50 shadow-lg">
               <button className="flex items-center gap-2 px-6 py-3 hover:bg-purple-900/40 transition-colors text-purple-200 bg-purple-900/20">
                 <div className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_#3b82f6]"></div> Backtesting session <Info className="w-3 h-3 text-purple-500" />
               </button>
               <button className="flex items-center gap-2 px-6 py-3 hover:bg-purple-900/40 transition-colors text-purple-400">
                 <Activity className="w-4 h-4 text-blue-500" /> Prop firm session <Info className="w-3 h-3 text-purple-500" />
               </button>
               <button className="flex items-center gap-2 px-6 py-3 hover:bg-purple-900/40 transition-colors text-purple-400">
                 <Settings className="w-4 h-4 text-blue-500" /> Tutorials <Info className="w-3 h-3 text-purple-500" />
               </button>
             </div>
             <div className="flex gap-4">
               <div className="bg-purple-950/60 border border-purple-800/50 rounded-lg px-4 py-2 text-purple-300 flex items-center gap-2 cursor-pointer hover:bg-purple-900/40 shadow-lg transition-colors">
                 <BarChart3 className="w-4 h-4" /> Backtesting <Info className="w-3 h-3" />
               </div>
               <div className="bg-purple-950/60 border border-purple-800/50 rounded-lg px-4 py-2 text-purple-300 flex items-center gap-2 cursor-pointer hover:bg-purple-900/40 shadow-lg transition-colors">
                 <Clock className="w-4 h-4" /> Lifetime <Info className="w-3 h-3" />
               </div>
             </div>
          </div>

          <div className="flex gap-6 mt-8">
            <h3 className="text-xl font-bold">Select session</h3>
          </div>

          {/* Session Cards */}
          <div className="flex flex-col xl:flex-row gap-6 items-start">
             {/* Left Card */}
             <div className="bg-purple-950/60 backdrop-blur-sm border border-purple-800/50 rounded-2xl p-6 w-full xl:w-[400px] shadow-[0_8px_30px_rgb(0,0,0,0.3)] hover:border-purple-600/50 transition-colors cursor-pointer group">
               <div className="flex justify-between items-start mb-4">
                 <div>
                   <h2 className="text-2xl font-bold group-hover:text-blue-400 transition-colors">XAUUSD</h2>
                   <div className="text-purple-400 text-sm mt-1">OANDA:XAUUSD</div>
                 </div>
                 <div className="w-8 h-8 rounded-full bg-purple-900/50 flex items-center justify-center cursor-pointer hover:bg-purple-800 transition-colors"><Info className="w-4 h-4 text-purple-400" /></div>
               </div>
               <div className="text-purple-300 text-sm mb-1">Current Balance: <span className="text-emerald-400 font-semibold">$99,901.00</span></div>
               <div className="text-purple-400 text-sm">Jan 1, 2026 - Jun 2, 2026</div>
             </div>

             {/* Right Content Area */}
             <div className="flex-1 space-y-6 w-full">
                <div className="flex justify-end gap-3 flex-wrap">
                  <button onClick={() => setIsModalOpen(true)} className="px-6 py-2 bg-blue-600 hover:bg-blue-500 rounded-full text-white font-semibold flex items-center gap-2 shadow-[0_0_15px_rgba(37,99,235,0.4)] transition-all transform hover:scale-105">
                    <Plus className="w-4 h-4" /> New session
                  </button>
                  <button className="px-6 py-2 bg-purple-900/40 border border-purple-700 hover:bg-purple-800 rounded-full text-purple-200 font-semibold flex items-center gap-2 transition-all">
                    Analytics <Info className="w-4 h-4" />
                  </button>
                  <button className="px-6 py-2 bg-purple-900/40 border border-purple-700 hover:bg-purple-800 rounded-full text-purple-200 font-semibold transition-all">
                    Session Settings
                  </button>
                  <button className="px-6 py-2 bg-red-900/30 border border-red-700/50 hover:bg-red-800/40 rounded-full text-red-300 font-semibold transition-all">
                    Delete session
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-purple-950/60 backdrop-blur-sm border border-purple-800/50 rounded-2xl p-8 relative overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.3)]">
                    <h2 className="text-3xl font-bold mb-2">XAUUSD</h2>
                    <p className="text-purple-400 mb-6">No strategy - OANDA:XAUUSD</p>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="text-purple-300">Jan 1, 2026 - Jun 2, 2026</span>
                      <span className="bg-yellow-500/20 text-yellow-500 px-3 py-1 rounded-full border border-yellow-500/30 font-semibold flex items-center gap-1 shadow-[0_0_10px_rgba(234,179,8,0.2)]">
                        <div className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse"></div>
                        151 days remaining
                      </span>
                    </div>
                    
                    <div className="absolute top-8 right-8 text-right">
                      <div className="text-purple-400 text-sm mb-1">Account balance</div>
                      <div className="text-3xl font-bold text-white tracking-wide shadow-black drop-shadow-md">$99,901.00</div>
                    </div>
                    
                    <button className="mt-12 px-8 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 rounded-full text-white font-bold shadow-[0_0_20px_rgba(37,99,235,0.4)] transition-all transform hover:-translate-y-1">
                      Go to chart
                    </button>
                  </div>

                  <div className="bg-purple-950/60 backdrop-blur-sm border border-purple-800/50 rounded-2xl p-8 relative shadow-[0_8px_30px_rgb(0,0,0,0.3)] min-h-[250px]">
                    <h3 className="text-2xl font-bold mb-4">Description</h3>
                    <div className="absolute top-8 right-8 w-12 h-12 rounded-full bg-purple-900/50 border border-purple-800/50 flex items-center justify-center text-purple-600">
                      <Info className="w-5 h-5" />
                    </div>
                  </div>
                </div>

                {/* Additional Analytics Mockups */}
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                  {/* Equity Curve */}
                  <div className="bg-purple-950/60 backdrop-blur-sm border border-purple-800/50 rounded-2xl p-6 relative overflow-hidden h-64 flex flex-col shadow-[0_8px_30px_rgb(0,0,0,0.3)] group hover:border-purple-600/50 transition-colors">
                    <div className="absolute top-4 right-4 text-purple-400 opacity-50"><Info className="w-4 h-4" /></div>
                    <h3 className="text-lg font-bold mb-4 text-purple-100">Equity Curve</h3>
                    <div className="flex-1 border-t border-purple-800/30 flex items-end pt-4 relative">
                       {/* SVG Mockup */}
                       <svg viewBox="0 0 100 50" className="w-full h-full text-blue-500 drop-shadow-[0_0_8px_rgba(59,130,246,0.5)]" preserveAspectRatio="none">
                         <path d="M0 45 C 20 30, 40 10, 60 15 S 80 30, 100 40" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                         <circle cx="60" cy="15" r="2" fill="white" />
                       </svg>
                    </div>
                  </div>

                  {/* Monthly Performance */}
                  <div className="bg-purple-950/60 backdrop-blur-sm border border-purple-800/50 rounded-2xl p-6 relative overflow-hidden h-64 flex flex-col shadow-[0_8px_30px_rgb(0,0,0,0.3)] group hover:border-purple-600/50 transition-colors">
                    <div className="absolute top-4 right-4 text-purple-400 opacity-50"><Info className="w-4 h-4" /></div>
                    <h3 className="text-lg font-bold mb-4 text-purple-100">Monthly Performance</h3>
                    <div className="flex-1 flex items-end justify-center gap-1 border-t border-purple-800/30 pt-4">
                       <div className="w-16 bg-gradient-to-t from-red-500/80 to-red-400 rounded-t-md shadow-[0_0_15px_rgba(239,68,68,0.3)]" style={{ height: '60%' }}></div>
                       <div className="w-16 bg-gradient-to-t from-emerald-500/80 to-emerald-400 rounded-t-md shadow-[0_0_15px_rgba(16,185,129,0.3)]" style={{ height: '70%' }}></div>
                    </div>
                  </div>

                  {/* Daily Performance */}
                  <div className="bg-purple-950/60 backdrop-blur-sm border border-purple-800/50 rounded-2xl p-6 relative overflow-hidden h-64 flex flex-col shadow-[0_8px_30px_rgb(0,0,0,0.3)] group hover:border-purple-600/50 transition-colors">
                    <div className="absolute top-4 right-4 text-purple-400 opacity-50"><Info className="w-4 h-4" /></div>
                    <h3 className="text-lg font-bold mb-4 text-purple-100">Daily Performance</h3>
                    <div className="flex-1 flex items-start justify-center pt-8 border-t border-purple-800/30 relative">
                       {/* Y axis lines */}
                       <div className="absolute inset-0 pt-8 pb-4 flex flex-col justify-between opacity-30 pointer-events-none">
                         <div className="border-b border-dashed border-purple-500"></div>
                         <div className="border-b border-dashed border-purple-500"></div>
                         <div className="border-b border-dashed border-purple-500"></div>
                       </div>
                       {/* Downward Bar */}
                       <div className="w-24 bg-gradient-to-b from-blue-400 to-blue-600/80 rounded-b-md shadow-[0_0_15px_rgba(59,130,246,0.3)] relative z-10" style={{ height: '80%' }}></div>
                    </div>
                  </div>
                </div>

                {/* 6 Small Stats */}
                <div className="grid grid-cols-2 lg:grid-cols-6 gap-6">
                  {/* Total PnL */}
                  <div className="bg-purple-950/60 backdrop-blur-sm border border-purple-800/50 rounded-2xl p-6 relative shadow-[0_8px_30px_rgb(0,0,0,0.3)] group hover:border-purple-600/50 transition-colors">
                    <div className="absolute top-4 right-4 text-purple-400 opacity-50"><Info className="w-4 h-4" /></div>
                    <div className="text-sm font-semibold text-purple-300 mb-2">Total Pnl</div>
                    <div className="text-3xl font-bold text-white">-$99</div>
                  </div>
                  {/* Win Rate */}
                  <div className="bg-purple-950/60 backdrop-blur-sm border border-purple-800/50 rounded-2xl p-6 relative shadow-[0_8px_30px_rgb(0,0,0,0.3)] group hover:border-purple-600/50 transition-colors">
                    <div className="absolute top-4 right-4 text-purple-400 opacity-50"><Info className="w-4 h-4" /></div>
                    <div className="text-sm font-semibold text-purple-300 mb-2">Win Rate</div>
                    <div className="text-3xl font-bold text-white">33.33%</div>
                  </div>
                  {/* Risk/Reward */}
                  <div className="bg-purple-950/60 backdrop-blur-sm border border-purple-800/50 rounded-2xl p-6 relative shadow-[0_8px_30px_rgb(0,0,0,0.3)] group hover:border-purple-600/50 transition-colors">
                    <div className="absolute top-4 right-4 text-purple-400 opacity-50"><Info className="w-4 h-4" /></div>
                    <div className="text-sm font-semibold text-purple-300 mb-2">Risk/Reward</div>
                    <div className="text-3xl font-bold text-white">0</div>
                  </div>
                  {/* Month Gain/Loss */}
                  <div className="bg-purple-950/60 backdrop-blur-sm border border-purple-800/50 rounded-2xl p-6 relative shadow-[0_8px_30px_rgb(0,0,0,0.3)] group hover:border-purple-600/50 transition-colors">
                    <div className="absolute top-4 right-4 text-purple-400 opacity-50"><Info className="w-4 h-4" /></div>
                    <div className="text-sm font-semibold text-purple-300 mb-2">Month Gain/Loss</div>
                    <div className="text-3xl font-bold text-white">-$99</div>
                  </div>
                  {/* Week Gain/Loss */}
                  <div className="bg-purple-950/60 backdrop-blur-sm border border-purple-800/50 rounded-2xl p-6 relative shadow-[0_8px_30px_rgb(0,0,0,0.3)] group hover:border-purple-600/50 transition-colors">
                    <div className="absolute top-4 right-4 text-purple-400 opacity-50"><Info className="w-4 h-4" /></div>
                    <div className="text-sm font-semibold text-purple-300 mb-2">Week Gain/Loss</div>
                    <div className="text-3xl font-bold text-white">-$99</div>
                  </div>
                  {/* Daily Gain/Loss */}
                  <div className="bg-purple-950/60 backdrop-blur-sm border border-purple-800/50 rounded-2xl p-6 relative shadow-[0_8px_30px_rgb(0,0,0,0.3)] group hover:border-purple-600/50 transition-colors">
                    <div className="absolute top-4 right-4 text-purple-400 opacity-50"><Info className="w-4 h-4" /></div>
                    <div className="text-sm font-semibold text-purple-300 mb-2">Daily Gain/Loss</div>
                    <div className="text-3xl font-bold text-white">-$99</div>
                  </div>
                </div>

             </div>
          </div>
        </div>
      )}
      
      {activeTab === 'trades' && (
        <div className="flex items-center justify-center h-64 text-purple-400 border border-dashed border-purple-800/50 rounded-2xl bg-purple-950/30">
          Trades log coming soon...
        </div>
      )}
      
      {activeTab === 'analytics' && (
        <div className="flex items-center justify-center h-64 text-purple-400 border border-dashed border-purple-800/50 rounded-2xl bg-purple-950/30">
          Advanced analytics coming soon...
        </div>
      )}

      {/* Quick Session Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-purple-950 border border-purple-700 rounded-2xl w-full max-w-2xl overflow-hidden shadow-[0_0_50px_rgba(88,28,135,0.6)] animate-in fade-in zoom-in duration-200">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-purple-800/50">
              <h2 className="text-2xl font-bold text-white">Create a quick session</h2>
              <div className="flex items-center gap-4">
                <button className="px-4 py-1.5 rounded-full bg-purple-900/40 text-purple-300 text-sm font-semibold hover:bg-purple-800/50 transition-colors">Advanced session</button>
                <button onClick={() => setIsModalOpen(false)} className="text-purple-400 hover:text-white transition-colors"><X className="w-6 h-6" /></button>
              </div>
            </div>
            
            {/* Body */}
            <div className="p-6 space-y-6">
              {/* Type Toggle */}
              <div className="flex p-1 bg-purple-900/20 border border-purple-800/50 rounded-xl">
                <button 
                  onClick={() => setSessionType('backtesting')}
                  className={`flex-1 py-2 rounded-lg font-semibold transition-all ${sessionType === 'backtesting' ? 'bg-purple-800 text-white shadow-lg' : 'text-purple-400 hover:text-purple-200'}`}
                >
                  Backtesting Session
                </button>
                <button 
                  onClick={() => setSessionType('propfirm')}
                  className={`flex-1 py-2 rounded-lg font-semibold flex items-center justify-center gap-2 transition-all ${sessionType === 'propfirm' ? 'bg-purple-800 text-white shadow-lg' : 'text-purple-400 hover:text-purple-200'}`}
                >
                  Prop Firm Session <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded flex items-center gap-1"><Play className="w-3 h-3"/> Pro</span>
                </button>
              </div>

              {/* Inputs */}
              <div>
                <label className="block text-sm font-bold text-purple-200 mb-2">Name *</label>
                <input type="text" placeholder="Name your session" className="w-full bg-purple-900/20 border border-purple-800/50 rounded-xl px-4 py-3 text-white placeholder-purple-500 focus:outline-none focus:border-purple-500 transition-colors" />
              </div>

              <div>
                <label className="block text-sm font-bold text-purple-200 mb-2">Account Balance *</label>
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-purple-400 font-bold">$</div>
                  <input type="number" defaultValue="100000" className="w-full bg-purple-900/20 border border-purple-800/50 rounded-xl pl-8 pr-4 py-3 text-white focus:outline-none focus:border-purple-500 transition-colors" />
                </div>
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm font-bold text-purple-200 mb-2">Assets * <span className="text-purple-400 text-xs font-normal">Request asset</span></label>
                <select className="w-full bg-purple-900/20 border border-purple-800/50 rounded-xl px-4 py-3 text-white appearance-none focus:outline-none focus:border-purple-500 transition-colors">
                  <option>Type to search for assets</option>
                  <option>OANDA:XAUUSD</option>
                  <option>OANDA:EURUSD</option>
                  <option>OANDA:GBPUSD</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-bold text-purple-200 mb-2">Risk % (Per Trade) *</label>
                <div className="relative">
                  <input type="number" step="0.1" placeholder="e.g. 1.0" className="w-full bg-purple-900/20 border border-purple-800/50 rounded-xl px-4 py-3 text-white placeholder-purple-500 focus:outline-none focus:border-purple-500 transition-colors" />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-purple-400 font-bold">%</div>
                </div>
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm font-bold text-purple-200 mb-2">Select Chart Layout (Optional) <Info className="w-4 h-4 text-purple-500"/></label>
                <input type="text" className="w-full bg-purple-900/20 border border-purple-800/50 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500 transition-colors" />
              </div>
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-purple-800/50 flex justify-end gap-4">
              <button onClick={() => setIsModalOpen(false)} className="px-6 py-2 rounded-full font-semibold text-purple-300 hover:text-white transition-colors">Cancel</button>
              <button className="px-6 py-2 bg-purple-800/50 text-purple-400 rounded-full font-semibold cursor-not-allowed">Create session</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
