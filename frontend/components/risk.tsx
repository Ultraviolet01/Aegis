'use client';

import { useCountUp } from './hooks';
import { AlertIcon, CheckIcon, DownloadIcon, PauseIcon, VaultIcon } from './icons';


/* ==========================================================================
   Risk bands
   --------------------------------------------------------------------------
   The boundaries are not decorative. They mirror the agent's engine: a
   threshold breach scores 60+, and 50 is where an anomaly starts producing a
   pause. Putting the band edges anywhere else would make the gauge tell a
   different story than the system it is describing.
   ========================================================================== */

export interface RiskBand {
  label: string;
  min: number;
  max: number;
  color: string;
  meaning: string;
}

export const RISK_BANDS: RiskBand[] = [
  { label: 'Calm', min: 0, max: 29, color: 'var(--accent)', meaning: 'Inside your thresholds' },
  { label: 'Elevated', min: 30, max: 59, color: 'var(--info)', meaning: 'Moving, not breached' },
  { label: 'Breach', min: 60, max: 79, color: 'var(--warn)', meaning: 'A rule has tripped' },
  { label: 'Critical', min: 80, max: 100, color: 'var(--danger)', meaning: 'Routing to vault' },
];

export function bandFor(score: number): RiskBand {
  const found = RISK_BANDS.find((b) => score >= b.min && score <= b.max);
  return found ?? RISK_BANDS[0]!;
}

/* ==========================================================================
   Gauge
   ========================================================================== */

/** Semicircle geometry. Centre (100,104), radius 84, drawn left to right. */
const ARC = 'M 16 104 A 84 84 0 0 1 184 104';
const ARC_LENGTH = Math.PI * 84;

export function RiskGauge({ score, live }: { score: number; live?: boolean }) {
  const clamped = Math.max(0, Math.min(100, score));
  const band = bandFor(clamped);
  const offset = ARC_LENGTH * (1 - clamped / 100);
  // -90deg at zero, +90deg at a hundred.
  const angle = -90 + clamped * 1.8;

  // The arc and needle sweep over --t-explain (620ms). The number has to move
  // with them: a digit that snaps to 74 while the arc is still travelling
  // makes the two read as unrelated elements. Same duration, same easing
  // family, so they arrive together.
  const displayed = Math.round(useCountUp(clamped, 620));

  return (
    <div className="gauge-wrap">
      <div
        className="gauge"
        style={{ ['--gauge-color' as string]: band.color }}

        role="img"
        aria-label={`Risk score ${clamped} of 100 - ${band.label}. ${band.meaning}.`}
      >
        <svg viewBox="0 0 200 120" aria-hidden="true">
          <path
            className="gauge-track"
            d={ARC}
            fill="none"
            strokeWidth="13"
            strokeLinecap="round"
          />
          {/* One stroke, animated by dash offset — the sweep reads as the
              score moving rather than a new arc appearing. */}
          <path
            className="gauge-value"
            d={ARC}
            fill="none"
            strokeWidth="13"
            strokeLinecap="round"
            strokeDasharray={ARC_LENGTH}
            strokeDashoffset={offset}
          />
          <g
            className="gauge-needle"
            style={{ transformOrigin: '100px 104px', transform: `rotate(${angle}deg)` }}
          >
            <line
              x1="100"
              y1="104"
              x2="100"
              y2="44"
              stroke="var(--fg)"
              strokeWidth="2"
              strokeLinecap="round"
              opacity="0.55"
            />
          </g>
          <circle cx="100" cy="104" r="4.5" fill="var(--surface-3)" stroke="var(--line-strong)" />
        </svg>

        <div className="gauge-readout">
          {/* aria-hidden: the accessible value lives on the parent's
              aria-label, which announces the settled score once instead of
              every intermediate frame. */}
          <span className="gauge-score num" aria-hidden="true">
            {displayed}
            <span className="gauge-score-max">/100</span>
          </span>

          <span className="gauge-band">{band.label}</span>
        </div>
      </div>

      <div className="gauge-legend">
        {live ? (
          <div className="inline" style={{ marginBottom: 2 }}>
            <span className="pill ok">
              <span className="dot live" /> Agent watching
            </span>
          </div>
        ) : null}

        {RISK_BANDS.map((b) => (
          <div key={b.label} className="gauge-legend-row" data-active={b.label === band.label}>
            <span className="gauge-legend-swatch" style={{ background: b.color }} />
            <span>{b.label}</span>
            <span className="gauge-legend-range num">
              {b.min}–{b.max}
            </span>
          </div>
        ))}
        <p className="footnote" style={{ marginTop: 2 }}>
          {band.meaning}. Score is computed by the agent from drawdown and oracle deviation against
          the thresholds you signed.
        </p>
      </div>
    </div>
  );
}

/* ==========================================================================
   Decision history
   ========================================================================== */

export type DecisionKind = 'clear' | 'watch' | 'pause' | 'exit' | 'open' | 'withdraw';

export interface Decision {
  id: string;
  kind: DecisionKind;
  title: string;
  detail?: string;
  /** Unix seconds. */
  at?: number;
  score?: number;
  txHash?: string;
}

const KIND_ICON = {
  clear: CheckIcon,
  watch: AlertIcon,
  pause: PauseIcon,
  exit: VaultIcon,
  open: DownloadIcon,
  withdraw: DownloadIcon,
} as const;

/** Node colouring only distinguishes the three states that matter. */
function nodeKind(kind: DecisionKind): 'exit' | 'pause' | 'clear' | 'neutral' {
  if (kind === 'exit') return 'exit';
  if (kind === 'pause') return 'pause';
  if (kind === 'clear') return 'clear';
  return 'neutral';
}

function formatWhen(at: number | undefined): string {
  if (at === undefined) return '';
  const date = new Date(at * 1000);
  const diff = Date.now() - date.getTime();
  const mins = Math.round(diff / 60000);
  // Relative for anything recent — "4m ago" is what a demo audience reads.
  // Absolute after a day, because "1,340m ago" is not information.
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function DecisionTimeline({
  decisions,
  explorerUrl,
}: {
  decisions: Decision[];
  explorerUrl?: (hash: string) => string;
}) {
  if (decisions.length === 0) {
    return (
      <div className="inset-quiet">
        <p className="hint" style={{ margin: 0 }}>
          No decisions recorded yet. Every evaluation the agent makes is emitted on-chain and will
          appear here — including the ones where it decided to do nothing.
        </p>
      </div>
    );
  }

  return (
    <ol className="timeline" data-stagger>
      {decisions.map((d) => {
        const Icon = KIND_ICON[d.kind];
        const band = d.score === undefined ? undefined : bandFor(d.score);
        return (
          <li key={d.id} className="timeline-item">
            <span className="timeline-node" data-kind={nodeKind(d.kind)} aria-hidden="true">
              <Icon size={9} />
            </span>

            <div className="timeline-head">
              <span className="timeline-title">{d.title}</span>
              <span className="timeline-time">{formatWhen(d.at)}</span>
            </div>

            {d.detail ? <p className="timeline-detail">{d.detail}</p> : null}

            {d.score !== undefined || d.txHash ? (
              <div className="timeline-meta">
                {d.score !== undefined && band ? (
                  <span
                    className="score-chip num"
                    style={{ ['--chip-color' as string]: band.color }}
                    title={`Risk score ${d.score} - ${band.label}`}
                  >
                    <span className="bar">
                      <span style={{ ['--score-scale' as string]: `${d.score / 100}` }} />
                    </span>
                    {d.score}
                  </span>
                ) : null}
                {d.txHash && explorerUrl ? (
                  <a
                    className="footnote mono"
                    href={explorerUrl(d.txHash)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {d.txHash.slice(0, 10)}…
                  </a>
                ) : null}
              </div>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
