const data = [];
let time = Math.floor(new Date('2023-10-01T00:00:00Z').getTime() / 1000);
for (let i = 0; i < 500; i++) {
  data.push({ time, high: 100 + Math.random(), low: 99 - Math.random() });
  time += 15 * 60; // 15 mins
}

const days = {};
data.forEach(bar => {
  const d = new Date(bar.time * 1000);
  const dateStr = `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
  if (!days[dateStr]) days[dateStr] = [];
  days[dateStr].push(bar);
});

const boxes = [];
Object.values(days).forEach(dayBars => {
  const extractSession = (startH, endH, color, bg, label) => {
    const sessionBars = dayBars.filter(b => {
      const h = new Date(b.time * 1000).getUTCHours();
      return h >= startH && h < endH;
    });
    if (sessionBars.length > 0) {
      const firstBar = sessionBars[0];
      const lastBar = sessionBars[sessionBars.length - 1];
      const firstLogical = data.indexOf(firstBar);
      const lastLogical = data.indexOf(lastBar);
      const maxH = Math.max(...sessionBars.map(b => b.high));
      const minL = Math.min(...sessionBars.map(b => b.low));
      boxes.push({ firstLogical, lastLogical, label });
    }
  };
  
  extractSession(0, 9, '#2196f3', 'rgba(33, 150, 243, 0.1)', 'A'); // Asian
  extractSession(8, 17, '#4caf50', 'rgba(76, 175, 80, 0.1)', 'L'); // London
  extractSession(13, 22, '#9e9e9e', 'rgba(158, 158, 158, 0.1)', 'N'); // New York
});

console.log('Boxes generated:', boxes.length);
console.log(boxes);
