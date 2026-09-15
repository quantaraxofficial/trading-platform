"use client";

import {
  FileText,
  AlarmClock,
  LayoutList,
  Flame,
  CalendarDays,
  Lightbulb,
  MessageSquare,
  Activity,
  Bell,
  Layers,
  HelpCircle
} from "lucide-react";

// Pine Editor — two overlapping mountain peaks (a little price-chart silhouette),
// matching TradingView's own icon for this panel.
function TVPineEditorIcon({ size = 18, ...props }: any) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M3 17 L9 7 L14 14 L17 10 L21 17 Z" />
    </svg>
  );
}

// Trading Agent — a small chat-bubble-with-spark glyph.
function TVAgentIcon({ size = 18, ...props }: any) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M4 5h16v10H9l-4 4v-4H4Z" />
      <path d="M12 8.2 12.7 10 14.5 10.7 12.7 11.4 12 13.2 11.3 11.4 9.5 10.7 11.3 10Z" fill="currentColor" stroke="none" />
    </svg>
  );
}

interface RightSidebarProps {
  activePanel: string;
  onPanelChange: (panelId: string) => void;
  onOpenPineEditor?: () => void;
  onOpenAgent?: () => void;
}

export default function RightSidebar({ activePanel, onPanelChange, onOpenPineEditor, onOpenAgent }: RightSidebarProps) {
  const iconSize = 18;
  const btnSize = "32px";
  const icons = [
    { id: "watchlist", icon: <FileText size={iconSize} strokeWidth={1.5} />, tooltip: "Watchlist and details" },
    { id: "alerts", icon: <AlarmClock size={iconSize} strokeWidth={1.5} />, tooltip: "Alerts" },
    { id: "data", icon: <LayoutList size={iconSize} strokeWidth={1.5} />, tooltip: "Data Window" },
    { id: "hotlists", icon: <Flame size={iconSize} strokeWidth={1.5} />, tooltip: "Hotlists" },
    { id: "calendar", icon: <CalendarDays size={iconSize} strokeWidth={1.5} />, tooltip: "Calendar" },
    { id: "ideas", icon: <Lightbulb size={iconSize} strokeWidth={1.5} />, tooltip: "Ideas" },
    { id: "chats", icon: <MessageSquare size={iconSize} strokeWidth={1.5} />, tooltip: "Chats" },
    { id: "idea_stream", icon: <Activity size={iconSize} strokeWidth={1.5} />, tooltip: "Idea Stream" },
    { id: "notifications", icon: <Bell size={iconSize} strokeWidth={1.5} />, tooltip: "Notifications" },
    { id: "object_tree", icon: <Layers size={iconSize} strokeWidth={1.5} />, tooltip: "Object Tree" },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', padding: '4px 0', height: '100%', justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', width: '100%', alignItems: 'center' }}>
        {icons.map((item, i) => (
          <div key={i} className="tv-tooltip-container" style={{ position: "relative" }}>
            <button
              className={`tv-icon-btn ${activePanel === item.id ? "active" : ""}`}
              style={{ width: btnSize, height: btnSize, borderRadius: "4px" }}
              onClick={() => onPanelChange(item.id)}
            >
              {item.icon}
            </button>
            <div className="tv-tooltip" style={{ right: "100%", top: "50%", transform: "translateY(-50%)", marginRight: "8px" }}>
              {item.tooltip}
            </div>
          </div>
        ))}

        <div className="tv-tooltip-container" style={{ position: "relative" }}>
          <button
            className="tv-icon-btn"
            style={{ width: btnSize, height: btnSize, borderRadius: "4px" }}
            onClick={() => onOpenPineEditor?.()}
          >
            <TVPineEditorIcon size={iconSize} />
          </button>
          <div className="tv-tooltip" style={{ right: "100%", top: "50%", transform: "translateY(-50%)", marginRight: "8px" }}>
            Pine Editor
          </div>
        </div>

        <div className="tv-tooltip-container" style={{ position: "relative" }}>
          <button
            className="tv-icon-btn"
            style={{ width: btnSize, height: btnSize, borderRadius: "4px" }}
            onClick={() => onOpenAgent?.()}
          >
            <TVAgentIcon size={iconSize} />
          </button>
          <div className="tv-tooltip" style={{ right: "100%", top: "50%", transform: "translateY(-50%)", marginRight: "8px" }}>
            Trading Agent
          </div>
        </div>
      </div>

      <div className="tv-tooltip-container" style={{ position: "relative", marginBottom: "4px" }}>
        <button className="tv-icon-btn" style={{ width: btnSize, height: btnSize, borderRadius: "4px" }}>
          <HelpCircle size={iconSize} strokeWidth={1.5} />
        </button>
        <div className="tv-tooltip" style={{ right: "100%", top: "50%", transform: "translateY(-50%)", marginRight: "8px" }}>
          Help Center
        </div>
      </div>
    </div>
  );
}
