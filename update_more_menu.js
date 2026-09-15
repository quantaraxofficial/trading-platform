const fs = require('fs');

const file = 'src/app/components/drawing/ui/SubBar.tsx';
let content = fs.readFileSync(file, 'utf8');

const regex = /\s*\{\/\*\s*More\s*\*\/\}\s*<div style=\{\{ position: 'relative' \}\}>\s*<button className="tv-icon-btn" onClick=\{\(\) => setShowDropdown\(!showDropdown\)\}[\s\S]*?<\/div>\s*<\/div>/g;

content = content.replace(regex, '\n        {/* More */}\n        <MoreMenu />');

// Now, we need to inject the MoreMenu component definition at the top of the SubBar function
// Let's find: `export function SubBar() {` and inject it right below `const selectedShapeType = selectedShape?.type;`

const subBarFuncRegex = /(export function SubBar\(\) \{[\s\S]*?const selectedShapeType = selectedShape\?\.type;\s*)/;
const setDrawingsAddRegex = /(const \{ activeTool, selectedShapeId, drawings, updateDrawing, deleteDrawing, addDrawing, setSelectedShapeId \} = useDrawing\(\);)/;

// Add setDrawings to useDrawing
content = content.replace(setDrawingsAddRegex, 'const { activeTool, selectedShapeId, drawings, setDrawings, updateDrawing, deleteDrawing, addDrawing, setSelectedShapeId } = useDrawing();');

const moreMenuComponent = `
  const [showVisualOrder, setShowVisualOrder] = useState(false);
  const handleVisualOrder = (action: 'front' | 'back' | 'forward' | 'backward') => {
    if (!selectedShapeId) return;
    setDrawings(prev => {
      const idx = prev.findIndex(d => d.id === selectedShapeId);
      if (idx === -1) return prev;
      
      const newDrawings = [...prev];
      const [shape] = newDrawings.splice(idx, 1);
      
      if (action === 'front') {
        newDrawings.push(shape);
      } else if (action === 'back') {
        newDrawings.unshift(shape);
      } else if (action === 'forward') {
        newDrawings.splice(Math.min(newDrawings.length, idx + 1), 0, shape);
      } else if (action === 'backward') {
        newDrawings.splice(Math.max(0, idx - 1), 0, shape);
      }
      return newDrawings;
    });
    setShowDropdown(false);
    setShowVisualOrder(false);
  };

  const MoreMenu = () => (
    <div style={{ position: 'relative' }}>
      <button className="tv-icon-btn" onClick={() => setShowDropdown(!showDropdown)} style={{ width: '34px', height: '34px', color: '#131722', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f0f3fa'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
        <MoreHorizontal size={18} strokeWidth={1.5} />
      </button>
      {showDropdown && (
        <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: '4px', backgroundColor: '#ffffff', border: '1px solid #e0e3eb', borderRadius: '6px', boxShadow: '0 2px 6px rgba(0,0,0,0.15)', zIndex: 100, padding: '4px 0', minWidth: '180px' }}>
          
          {/* Visual Order with Submenu */}
          <div 
            style={{ position: 'relative' }}
            onMouseEnter={() => setShowVisualOrder(true)}
            onMouseLeave={() => setShowVisualOrder(false)}
          >
            <button style={{ width: '100%', padding: '8px 16px', textAlign: 'left', background: 'transparent', border: 'none', fontSize: '13px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#131722' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f0f3fa'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
              Visual order
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
            </button>
            {showVisualOrder && (
              <div style={{ position: 'absolute', top: '0', right: '100%', marginRight: '4px', backgroundColor: '#ffffff', border: '1px solid #e0e3eb', borderRadius: '6px', boxShadow: '0 2px 6px rgba(0,0,0,0.15)', zIndex: 101, padding: '4px 0', minWidth: '160px' }}>
                <button onClick={() => handleVisualOrder('front')} style={{ width: '100%', padding: '8px 16px', textAlign: 'left', background: 'transparent', border: 'none', fontSize: '13px', cursor: 'pointer', color: '#131722' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f0f3fa'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>Bring to front</button>
                <button onClick={() => handleVisualOrder('back')} style={{ width: '100%', padding: '8px 16px', textAlign: 'left', background: 'transparent', border: 'none', fontSize: '13px', cursor: 'pointer', color: '#131722' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f0f3fa'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>Send to back</button>
                <button onClick={() => handleVisualOrder('forward')} style={{ width: '100%', padding: '8px 16px', textAlign: 'left', background: 'transparent', border: 'none', fontSize: '13px', cursor: 'pointer', color: '#131722' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f0f3fa'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>Bring forward</button>
                <button onClick={() => handleVisualOrder('backward')} style={{ width: '100%', padding: '8px 16px', textAlign: 'left', background: 'transparent', border: 'none', fontSize: '13px', cursor: 'pointer', color: '#131722' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f0f3fa'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>Send backward</button>
              </div>
            )}
          </div>

          <button onClick={() => { setIsSettingsOpen(true); setShowDropdown(false); }} style={{ width: '100%', padding: '8px 16px', textAlign: 'left', background: 'transparent', border: 'none', fontSize: '13px', cursor: 'pointer', color: '#131722' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f0f3fa'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>Visibility on intervals</button>
          
          <div style={{ height: '1px', backgroundColor: '#f0f3fa', margin: '4px 0' }} />

          <button onClick={() => { handleClone(); setShowDropdown(false); }} style={{ width: '100%', padding: '8px 16px', textAlign: 'left', background: 'transparent', border: 'none', fontSize: '13px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', color: '#131722' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f0f3fa'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
            Clone
            <span style={{ color: '#b2b5be', fontSize: '11px' }}>Ctrl + Drag</span>
          </button>
          <button onClick={() => setShowDropdown(false)} style={{ width: '100%', padding: '8px 16px', textAlign: 'left', background: 'transparent', border: 'none', fontSize: '13px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', color: '#131722' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f0f3fa'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
            Copy
            <span style={{ color: '#b2b5be', fontSize: '11px' }}>Ctrl + C</span>
          </button>
          
          <div style={{ height: '1px', backgroundColor: '#f0f3fa', margin: '4px 0' }} />
          
          <button onClick={handleHide} style={{ width: '100%', padding: '8px 16px', textAlign: 'left', background: 'transparent', border: 'none', fontSize: '13px', cursor: 'pointer', color: '#131722' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f0f3fa'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>Hide</button>
        </div>
      )}
    </div>
  );
`;

content = content.replace(subBarFuncRegex, '$1' + moreMenuComponent);

fs.writeFileSync(file, content, 'utf8');
console.log('Successfully updated SubBar.tsx');
