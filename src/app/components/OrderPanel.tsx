"use client";

import { useState, useRef, useEffect } from "react";
import { X, LayoutGrid, MoreHorizontal, ArrowLeftRight, ChevronDown, ChevronUp, CheckSquare, Square, Pin, Hexagon } from "lucide-react";
import { usePaperTrading } from "@/context/PaperTradingContext";

interface OrderPanelProps {
  symbol: string;
  onClose: () => void;
  theme?: string;
  initialSide?: "buy" | "sell";
}

export default function OrderPanel({ symbol, onClose, theme = "light", initialSide = "buy" }: OrderPanelProps) {
  const isDark = theme === "dark";
  const [tab, setTab] = useState<"Order" | "DOM">("Order");
  const [orderType, setOrderType] = useState<"Market" | "Limit" | "Stop">("Limit");
  const [side, setSide] = useState<"buy" | "sell">(initialSide);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);
  
  const textColor = isDark ? "#d1d4dc" : "#131722";
  const mutedColor = isDark ? "#787b86" : "#787b86";
  const borderColor = isDark ? "#2a2e39" : "#e0e3eb";
  const bgHover = isDark ? "#2a2e39" : "#f0f3fa";
  const inputBg = isDark ? "#131722" : "#ffffff";

  const { currentPrice, placeOrder } = usePaperTrading();
  const [quantity, setQuantity] = useState(1);
  const [takeProfit, setTakeProfit] = useState("");
  const [stopLoss, setStopLoss] = useState("");
  const [tpEnabled, setTpEnabled] = useState(false);
  const [slEnabled, setSlEnabled] = useState(false);
  const [limitPrice, setLimitPrice] = useState(currentPrice > 0 ? currentPrice.toString() : "");

  useEffect(() => {
    if (orderType === "Market" || limitPrice === "") {
      setLimitPrice(currentPrice.toString());
    }
  }, [currentPrice, orderType]);

  const sellPrice = currentPrice ? (currentPrice - 0.60).toFixed(2) : "0.00";
  const buyPrice = currentPrice ? (currentPrice + 0.60).toFixed(2) : "0.00";
  const spread = "120.0";

  const handleSubmit = () => {
    placeOrder({
      symbol,
      side,
      type: orderType,
      quantity,
      price: orderType === "Market" ? currentPrice : parseFloat(limitPrice),
      takeProfit: tpEnabled && takeProfit ? parseFloat(takeProfit) : undefined,
      stopLoss: slEnabled && stopLoss ? parseFloat(stopLoss) : undefined
    });
    // Optional: show a toast or something, but the panel auto updates
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", width: "100%", backgroundColor: isDark ? "#1e222d" : "#ffffff", color: textColor, fontSize: "13px" }}>
      
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: `1px solid ${borderColor}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 700, fontSize: "16px" }}>
          <div style={{ width: "24px", height: "24px", backgroundColor: "#131722", borderRadius: "4px", display: "flex", alignItems: "center", justifyContent: "center", color: "white" }}>
            <span style={{ fontSize: "10px", fontWeight: "bold" }}>TV</span>
          </div>
          {symbol}
        </div>
        <div style={{ display: "flex", gap: "4px" }}>
          <button className="tv-icon-btn" style={{ width: "28px", height: "28px" }}><LayoutGrid size={18} /></button>
          
          <div style={{ position: "relative" }} ref={menuRef}>
            <button 
              className="tv-icon-btn" 
              style={{ width: "28px", height: "28px", backgroundColor: menuOpen ? bgHover : "transparent" }} 
              onClick={() => setMenuOpen(!menuOpen)}
            >
              <MoreHorizontal size={18} />
            </button>
            
            {menuOpen && (
              <div style={{
                position: "absolute", top: "100%", right: "0", marginTop: "4px",
                backgroundColor: isDark ? "#1e222d" : "#ffffff",
                border: `1px solid ${borderColor}`,
                borderRadius: "6px", boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                zIndex: 1000, display: "flex", flexDirection: "column",
                minWidth: "260px", padding: "6px 0", pointerEvents: "auto"
              }}>
                {tab === "DOM" ? (
                  <>
                    <div style={{ padding: "4px 16px 8px 16px", fontSize: "11px", fontWeight: 600, color: mutedColor, textTransform: "uppercase" }}>DOM Panel Settings</div>
                    <MenuItem checkable defaultChecked={true} text="Show zero trade volume prices" theme={theme} />
                    <MenuItem checkable defaultChecked={true} text="Show prices between the best bid/ask" theme={theme} />
                    <div style={{ height: "1px", backgroundColor: borderColor, margin: "4px 0" }} />
                    <MenuItem icon={<HexagonSettingsIcon size={16} />} text="Trading settings..." theme={theme} />
                  </>
                ) : (
                  <>
                    <MenuItem icon={<Pin size={16} />} text="Undock order panel" theme={theme} />
                    <MenuItem icon={<HexagonSettingsIcon size={16} />} text="Trading settings..." theme={theme} />
                    <MenuItem checkable defaultChecked={false} text="SL enables quantity in risk" theme={theme} />
                  </>
                )}
              </div>
            )}
          </div>

          <button className="tv-icon-btn" style={{ width: "28px", height: "28px" }} onClick={onClose}><X size={18} /></button>
        </div>
      </div>

      <div style={{ padding: "16px", overflowY: "auto", flex: 1 }}>
        {/* Main Tab Toggle */}
        <div style={{ display: "flex", backgroundColor: isDark ? "#131722" : "#f0f3fa", borderRadius: "8px", padding: "2px", marginBottom: "16px" }}>
          <button 
            style={{ flex: 1, padding: "6px 0", borderRadius: "6px", backgroundColor: tab === "Order" ? (isDark ? "#2a2e39" : "#ffffff") : "transparent", color: tab === "Order" ? textColor : mutedColor, fontWeight: 600, border: "none", cursor: "pointer", boxShadow: tab === "Order" ? "0 1px 2px rgba(0,0,0,0.1)" : "none" }}
            onClick={() => setTab("Order")}
          >
            Order
          </button>
          <button 
            style={{ flex: 1, padding: "6px 0", borderRadius: "6px", backgroundColor: tab === "DOM" ? (isDark ? "#2a2e39" : "#ffffff") : "transparent", color: tab === "DOM" ? textColor : mutedColor, fontWeight: 600, border: "none", cursor: "pointer", boxShadow: tab === "DOM" ? "0 1px 2px rgba(0,0,0,0.1)" : "none" }}
            onClick={() => setTab("DOM")}
          >
            DOM
          </button>
        </div>

        {tab === "Order" ? (
          <>
            {/* Buy/Sell Prices */}
            <div style={{ display: "flex", borderRadius: "4px", overflow: "hidden", marginBottom: "16px", position: "relative" }}>
              <button 
                onClick={() => setSide("sell")}
                style={{ flex: 1, padding: "12px", backgroundColor: side === "sell" ? (isDark ? "rgba(242,54,69,0.2)" : "#fceced") : (isDark ? "#2a2e39" : "#f0f3fa"), border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "flex-start" }}
              >
                <div style={{ fontWeight: 600, fontSize: "14px", color: side === "sell" ? "#f23645" : textColor }}>Sell</div>
                <div style={{ fontSize: "16px", fontWeight: 400, color: side === "sell" ? "#f23645" : textColor }}>{sellPrice}</div>
              </button>
              
              <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", backgroundColor: isDark ? "#1e222d" : "#ffffff", padding: "2px 6px", borderRadius: "4px", fontSize: "11px", fontWeight: 500 }}>
                {spread}
              </div>

              <button 
                onClick={() => setSide("buy")}
                style={{ flex: 1, padding: "12px", backgroundColor: side === "buy" ? (isDark ? "rgba(41,98,255,0.2)" : "#eaf0ff") : (isDark ? "#2a2e39" : "#f0f3fa"), border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "flex-end" }}
              >
                <div style={{ fontWeight: 600, fontSize: "14px", color: side === "buy" ? "#2962ff" : textColor }}>Buy</div>
                <div style={{ fontSize: "16px", fontWeight: 400, color: side === "buy" ? "#2962ff" : textColor }}>{buyPrice}</div>
              </button>
            </div>

            {/* Order Types */}
            <div style={{ display: "flex", borderBottom: `1px solid ${borderColor}`, marginBottom: "16px" }}>
              {["Market", "Limit", "Stop"].map(t => (
                <button 
                  key={t}
                  onClick={() => setOrderType(t as any)}
                  style={{ flex: 1, padding: "8px 0", backgroundColor: "transparent", border: "none", borderBottom: orderType === t ? `2px solid ${textColor}` : "2px solid transparent", color: orderType === t ? textColor : mutedColor, fontWeight: 600, cursor: "pointer" }}
                >
                  {t}
                </button>
              ))}
            </div>

            {/* Price (Only for Limit/Stop) */}
            {orderType !== "Market" && (
              <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ marginBottom: "6px", color: mutedColor }}>Price</div>
                  <div style={{ position: "relative" }}>
                    <input 
                      type="text" 
                      value={limitPrice}
                      onChange={e => setLimitPrice(e.target.value)}
                      style={{ width: "100%", padding: "6px 28px 6px 12px", border: `1px solid ${borderColor}`, backgroundColor: inputBg, color: textColor, borderRadius: "6px", outline: "none", fontSize: "14px" }} 
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Quantity */}
            <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
              <div style={{ flex: 1 }}>
                <div style={{ marginBottom: "6px", color: mutedColor }}>Quantity</div>
                <div style={{ position: "relative" }}>
                  <input 
                    type="number" 
                    value={quantity}
                    onChange={e => setQuantity(parseFloat(e.target.value) || 0)}
                    style={{ width: "100%", padding: "6px 28px 6px 12px", border: `1px solid ${borderColor}`, backgroundColor: inputBg, color: textColor, borderRadius: "6px", outline: "none", fontSize: "14px" }} 
                  />
                </div>
              </div>
            </div>
            {/* Exits Accordion */}
            <Accordion title="Exits" defaultOpen={true}>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px", color: mutedColor }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>Take profit, price <ChevronDown size={14} /></div>
                    <div 
                      onClick={() => setTpEnabled(!tpEnabled)}
                      style={{ width: "32px", height: "18px", backgroundColor: tpEnabled ? "#2962ff" : borderColor, borderRadius: "9px", position: "relative", cursor: "pointer", transition: "background-color 0.2s" }}
                    >
                      <div style={{ position: "absolute", top: "2px", left: tpEnabled ? "16px" : "2px", width: "14px", height: "14px", backgroundColor: "white", borderRadius: "50%", transition: "left 0.2s" }} />
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", backgroundColor: isDark ? "#1e222d" : "#f8f9fa", border: `1px solid ${borderColor}`, borderRadius: "4px", padding: "8px 12px", opacity: tpEnabled ? 1 : 0.6 }}>
                    <input 
                      type="number" 
                      value={takeProfit}
                      onChange={e => setTakeProfit(e.target.value)}
                      placeholder={tpEnabled ? "Price" : ""}
                      disabled={!tpEnabled} 
                      style={{ border: "none", backgroundColor: "transparent", color: textColor, flex: 1, outline: "none", width: "100%" }} 
                    />
                    <ArrowLeftRight size={14} color={mutedColor} style={{ margin: "0 8px" }} />
                    <span style={{ color: mutedColor }}>75 ticks</span>
                  </div>
                </div>

                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px", color: mutedColor }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>Stop loss, price <ChevronDown size={14} /></div>
                    <div 
                      onClick={() => setSlEnabled(!slEnabled)}
                      style={{ width: "32px", height: "18px", backgroundColor: slEnabled ? "#2962ff" : borderColor, borderRadius: "9px", position: "relative", cursor: "pointer", transition: "background-color 0.2s" }}
                    >
                      <div style={{ position: "absolute", top: "2px", left: slEnabled ? "16px" : "2px", width: "14px", height: "14px", backgroundColor: "white", borderRadius: "50%", transition: "left 0.2s" }} />
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", backgroundColor: isDark ? "#1e222d" : "#f8f9fa", border: `1px solid ${borderColor}`, borderRadius: "4px", padding: "8px 12px", opacity: slEnabled ? 1 : 0.6 }}>
                    <input 
                      type="number" 
                      value={stopLoss}
                      onChange={e => setStopLoss(e.target.value)}
                      placeholder={slEnabled ? "Price" : ""}
                      disabled={!slEnabled} 
                      style={{ border: "none", backgroundColor: "transparent", color: textColor, flex: 1, outline: "none", width: "100%" }} 
                    />
                    <ArrowLeftRight size={14} color={mutedColor} style={{ margin: "0 8px" }} />
                    <span style={{ color: mutedColor }}>-10939 ticks</span>
                  </div>
                </div>
              </div>
            </Accordion>

            {/* Extra Settings - Hidden for Market orders */}
            {orderType !== "Market" && (
              <Accordion title="Extra settings" defaultOpen={true}>
                <div style={{ color: mutedColor, marginBottom: "4px" }}>Time in force</div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", backgroundColor: inputBg, border: `1px solid ${borderColor}`, borderRadius: "4px", padding: "8px 12px" }}>
                  <span>Month</span>
                  <ChevronDown size={16} color={mutedColor} />
                </div>
              </Accordion>
            )}

            {/* Order Info */}
            <div style={{ marginTop: "16px" }}>
              <div style={{ fontWeight: 700, marginBottom: "12px" }}>Order info</div>
              
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                <span style={{ color: mutedColor }}>Margin</span>
                <span style={{ fontWeight: 600 }}>11,560.50 / 100,016.76</span>
              </div>
              <div style={{ height: "6px", backgroundColor: borderColor, borderRadius: "3px", marginBottom: "12px", overflow: "hidden" }}>
                <div style={{ height: "100%", width: "15%", backgroundColor: "#2962ff" }}></div>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                <span style={{ color: mutedColor }}>Leverage</span>
                <span style={{ fontWeight: 600 }}>50:1</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                <span style={{ color: mutedColor }}>Tick value</span>
                <span style={{ fontWeight: 600 }}>0.1 <span style={{ fontWeight: 400, fontSize: "11px", color: mutedColor }}>USD</span></span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "24px" }}>
                <span style={{ color: mutedColor }}>Trade value</span>
                <span style={{ fontWeight: 600 }}>578,024.92 <span style={{ fontWeight: 400, fontSize: "11px", color: mutedColor }}>USD</span></span>
              </div>
            </div>
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', color: mutedColor, marginTop: '40px' }}>
            DOM Data Simulator
          </div>
        )}
      </div>

      {/* Footer Action Button */}
      {tab === "Order" && (
        <div style={{ padding: "16px", borderTop: `1px solid ${borderColor}` }}>
          <button 
            onClick={handleSubmit}
            style={{ 
              width: "100%", padding: "14px 0", borderRadius: "6px", border: "none", cursor: "pointer",
              backgroundColor: side === "buy" ? "#2962ff" : "#f23645",
              color: "white", fontWeight: 700, fontSize: "14px",
              display: "flex", flexDirection: "column", alignItems: "center"
            }}
          >
            <span style={{ fontSize: "16px", marginBottom: "2px" }}>{side === "buy" ? "Buy" : "Sell"}</span>
            <span style={{ fontSize: "11px", fontWeight: 500, opacity: 0.9 }}>
              {quantity} {symbol} {orderType !== "Market" ? `@ ${limitPrice}` : `@ ${side === "buy" ? buyPrice : sellPrice}`} {orderType.toUpperCase()}
            </span>
          </button>
        </div>
      )}
    </div>
  );
}

function Accordion({ title, children, defaultOpen = false }: { title: string, children: React.ReactNode, defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ borderTop: "1px solid var(--tv-color-border)", padding: "16px 0" }}>
      <div 
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontWeight: 700, cursor: "pointer", marginBottom: open ? "16px" : "0" }}
        onClick={() => setOpen(!open)}
      >
        {title}
        {open ? <ChevronUp size={18} color="var(--tv-color-text-muted)" /> : <ChevronDown size={18} color="var(--tv-color-text-muted)" />}
      </div>
      {open && children}
    </div>
  );
}

function HexagonSettingsIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
      <circle cx="12" cy="12" r="3"></circle>
    </svg>
  );
}

function MenuItem({ icon, text, theme, checkable, defaultChecked = false }: { icon?: React.ReactNode, text: string, theme: string, checkable?: boolean, defaultChecked?: boolean }) {
  const [hovered, setHovered] = useState(false);
  const [checked, setChecked] = useState(defaultChecked);
  const isDark = theme === "dark";
  const textColor = isDark ? "#d1d4dc" : "#131722";
  const iconColor = isDark ? "#787b86" : "#787b86";
  const bgHover = isDark ? "#2a2e39" : "#f0f3fa";
  
  return (
    <div 
      style={{
        display: "flex", alignItems: "center", gap: "12px",
        padding: "8px 16px", cursor: "pointer", backgroundColor: hovered ? bgHover : "transparent",
        color: textColor, fontSize: "13px"
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => { if (checkable) setChecked(!checked); }}
    >
      {checkable ? (
        <div style={{ 
          width: "16px", height: "16px", 
          backgroundColor: checked ? textColor : "transparent",
          border: `1px solid ${checked ? textColor : iconColor}`,
          borderRadius: "3px", display: "flex", alignItems: "center", justifyContent: "center",
          color: isDark ? "#1e222d" : "#ffffff",
          flexShrink: 0
        }}>
          {checked && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>}
        </div>
      ) : (
        <span style={{ color: iconColor, display: "flex", flexShrink: 0 }}>{icon}</span>
      )}
      <span>{text}</span>
    </div>
  );
}
