'use client';

/**
 * AmbientMarginChart
 * 
 * Renders a continuously drifting price-line SVG in the left and right margins
 * of the dashboard, outside the main .wrap container. Uses SVG + CSS animation
 * with a feGaussianBlur glow filter in mint green at restrained opacity.
 * 
 * The chart loops infinitely via a duplicated path pattern and CSS translateX
 * animation, creating a seamless horizontal scroll with no visible reset.
 */

export default function AmbientMarginChart() {
  // Generate a smooth, organic price-line path
  // We create a long path that tiles seamlessly by making start and end y-values match
  const segmentWidth = 1200; // width of one repeating segment
  const viewHeight = 800;
  const midY = viewHeight / 2;
  const amplitude = 180;

  // Pre-computed smooth price-line points for one segment
  // These form a natural-looking price chart waveform
  const points: Array<[number, number]> = [
    [0, 420], [40, 390], [80, 410], [120, 370], [160, 340],
    [200, 380], [240, 350], [280, 310], [320, 340], [360, 290],
    [400, 320], [440, 280], [480, 340], [520, 370], [560, 330],
    [600, 360], [640, 310], [680, 280], [720, 320], [760, 350],
    [800, 300], [840, 270], [880, 310], [920, 350], [960, 380],
    [1000, 340], [1040, 370], [1080, 400], [1120, 370], [1160, 420],
    [1200, 420], // end matches start for seamless loop
  ];

  // Build a smooth cubic bezier path through the points
  const buildSmoothPath = (pts: Array<[number, number]>) => {
    const first = pts[0];
    if (!first) return '';
    const [x0, y0] = first;
    let d = `M ${x0},${y0}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const curr = pts[i];
      const next = pts[i + 1];
      if (!curr || !next) continue;
      const [x1, y1] = curr;
      const [x2, y2] = next;
      const cpx1 = x1 + (x2 - x1) * 0.4;
      const cpy1 = y1;
      const cpx2 = x1 + (x2 - x1) * 0.6;
      const cpy2 = y2;
      d += ` C ${cpx1},${cpy1} ${cpx2},${cpy2} ${x2},${y2}`;
    }
    return d;
  };

  const pathD = buildSmoothPath(points);

  // Second variation of the path (slightly different wave) for the right side
  const points2: Array<[number, number]> = [
    [0, 380], [40, 350], [80, 370], [120, 330], [160, 360],
    [200, 310], [240, 340], [280, 370], [320, 330], [360, 300],
    [400, 340], [440, 310], [480, 280], [520, 320], [560, 360],
    [600, 330], [640, 370], [680, 400], [720, 360], [760, 330],
    [800, 370], [840, 340], [880, 310], [920, 340], [960, 370],
    [1000, 400], [1040, 360], [1080, 330], [1120, 360], [1160, 380],
    [1200, 380],
  ];

  const pathD2 = buildSmoothPath(points2);

  return (
    <>
      {/* Left margin chart */}
      <div className="ambient-margin ambient-margin--left" aria-hidden="true">
        <div className="ambient-margin__track">
          <svg
            className="ambient-margin__svg"
            viewBox={`0 0 ${segmentWidth * 2} ${viewHeight}`}
            preserveAspectRatio="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              <filter id="ambient-glow-left" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            {/* Two copies of the path for seamless looping */}
            <g filter="url(#ambient-glow-left)">
              <path d={pathD} fill="none" stroke="#4fe0a8" strokeWidth="2" opacity="0.22" />
              {/* Second copy offset by one segment width */}
              <path
                d={pathD}
                fill="none"
                stroke="#4fe0a8"
                strokeWidth="2"
                opacity="0.22"
                transform={`translate(${segmentWidth}, 0)`}
              />
            </g>
          </svg>
        </div>
      </div>

      {/* Right margin chart */}
      <div className="ambient-margin ambient-margin--right" aria-hidden="true">
        <div className="ambient-margin__track ambient-margin__track--reverse">
          <svg
            className="ambient-margin__svg"
            viewBox={`0 0 ${segmentWidth * 2} ${viewHeight}`}
            preserveAspectRatio="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              <filter id="ambient-glow-right" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <g filter="url(#ambient-glow-right)">
              <path d={pathD2} fill="none" stroke="#4fe0a8" strokeWidth="2" opacity="0.18" />
              <path
                d={pathD2}
                fill="none"
                stroke="#4fe0a8"
                strokeWidth="2"
                opacity="0.18"
                transform={`translate(${segmentWidth}, 0)`}
              />
            </g>
          </svg>
        </div>
      </div>
    </>
  );
}
