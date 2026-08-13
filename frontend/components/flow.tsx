'use client';

import { useCallback, useEffect, useRef, useState, type ComponentType } from 'react';
import { DownloadIcon, EyeIcon, PauseIcon, PenIcon, VaultIcon } from './icons';


/**
 * The five-step story of how Aegis works.
 *
 * Used twice: on the landing page as the main explainer, and inside the app as
 * a collapsed reminder. Same component, same copy, so a judge who reads it
 * cold and then opens the app sees one consistent story rather than two
 * different descriptions of the same system.
 *
 * The auto-advance is the only involuntary motion in the product. It earns its
 * place because the diagram's job is to be understood by someone who has not
 * decided to interact yet — but it yields immediately and permanently the
 * moment the visitor takes over, and it never runs under reduced motion.
 */

type Actor = 'you' | 'agent' | 'chain';

interface Step {
  title: string;
  note: string;
  actor: Actor;
  detailTitle: string;
  detail: string;
  meta: string[];
  Icon: ComponentType<{ size?: number; className?: string }>;

}

const ACTOR_LABEL: Record<Actor, string> = {
  you: 'You',
  agent: 'Agent',
  chain: 'On-chain',
};

export const FLOW_STEPS: Step[] = [
  {
    title: 'Deposit',
    note: 'Your xStocks go into a vault you own.',
    actor: 'you',
    Icon: DownloadIcon,
    detailTitle: 'You deposit — and stay the owner',
    detail:
      'Tokenised equities and commodities go into AegisVault. The position is recorded against your address. No transfer of ownership, no pooled custody, no lockup.',
    meta: ['AegisVault.deposit()', 'Your address, your position'],
  },
  {
    title: 'Write a policy',
    note: 'Plain English, parsed to on-chain numbers.',
    actor: 'you',
    Icon: PenIcon,
    detailTitle: 'You describe the rule in your own words',
    detail:
      '"If SPYX drops more than 8%, move half to USDC." Aegis parses that into explicit basis-point thresholds, shows you exactly what will be written, and you sign it. The policy lives on-chain in PolicyRegistry, and only you can change it.',
    meta: ['PolicyRegistry.setPolicy()', 'Owner-only'],
  },
  {
    title: 'Agent watches',
    note: 'Prices and oracle health, continuously.',
    actor: 'agent',
    Icon: EyeIcon,
    detailTitle: 'The agent watches, and only watches',
    detail:
      'An off-chain agent tracks price drawdown and oracle deviation against your thresholds. It holds no keys to your funds and cannot withdraw, transfer, or retarget anything. Its whole authority is the ability to trip a rule you already signed.',
    meta: ['Off-chain monitor', 'No withdrawal rights'],
  },
  {
    title: 'Trigger',
    note: 'Pause, or route to a time-locked vault.',
    actor: 'chain',
    Icon: PauseIcon,
    detailTitle: 'A breach fires your rule, not a decision',
    detail:
      'When your threshold is crossed, the contract does what your policy says: pause the position, or route the specified share into EmergencyVault. Every action is bounded by the policy and recorded as an on-chain event you can audit.',
    meta: ['Bounded by your policy', 'Emitted as events'],
  },
  {
    title: 'You withdraw',
    note: 'Always. Paused or not.',
    actor: 'you',
    Icon: VaultIcon,
    detailTitle: 'Withdrawal is always yours',
    detail:
      'Whatever the agent did, the exit is unconditional and permissionless for you. A paused position can still be withdrawn. Funds in the time-locked vault return to you and nobody else — the timelock delays a release, it never redirects one.',
    meta: ['No agent approval needed', 'No admin override'],
  },
];

const ADVANCE_MS = 5000;

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function FlowWalkthrough({ compact = false }: { compact?: boolean }) {
  const [active, setActive] = useState(0);
  const [entering, setEntering] = useState(false);
  /** Set once the visitor clicks a step: auto-advance never resumes. */
  const [userDriving, setUserDriving] = useState(false);
  const frame = useRef<number | null>(null);

  const select = useCallback((index: number, byUser: boolean) => {
    setActive((current) => {
      if (current === index) return current;
      // Blur the outgoing copy for a beat so the two text blocks read as one
      // surface changing rather than two stacked paragraphs crossfading.
      setEntering(true);
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(() => {
        frame.current = requestAnimationFrame(() => setEntering(false));
      });
      return index;
    });
    if (byUser) setUserDriving(true);
  }, []);

  useEffect(() => {
    if (userDriving || prefersReducedMotion()) return;
    const handle = setInterval(() => {
      select((active + 1) % FLOW_STEPS.length, false);
    }, ADVANCE_MS);
    return () => clearInterval(handle);
  }, [active, userDriving, select]);

  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    [],
  );

  const step = FLOW_STEPS[active] ?? FLOW_STEPS[0];
  if (!step) return null;

  return (
    <div className="flow">
      {!compact ? <FlowDiagram activeStep={active} /> : null}

      {/* Tabs, because that is what this is: five labels selecting one panel. */}
      <div className="flow-track" role="tablist" aria-label="How Aegis works">
        {FLOW_STEPS.map((s, index) => {
          const isActive = index === active;
          return (
            <button
              key={s.title}
              type="button"
              role="tab"
              id={`flow-tab-${index}`}
              aria-selected={isActive}
              aria-controls="flow-detail"
              tabIndex={isActive ? 0 : -1}
              className="flow-step"
              data-active={isActive}
              onClick={() => select(index, true)}
              onKeyDown={(event) => {
                if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
                  event.preventDefault();
                  const delta = event.key === 'ArrowRight' ? 1 : -1;
                  const next = (index + delta + FLOW_STEPS.length) % FLOW_STEPS.length;
                  select(next, true);
                  document.getElementById(`flow-tab-${next}`)?.focus();
                }
              }}
            >
              <span className="inline" style={{ gap: 8 }}>
                <span className="flow-step-index num">{index + 1}</span>
                <span className={`flow-actor ${s.actor}`}>{ACTOR_LABEL[s.actor]}</span>
              </span>
              <span className="flow-step-title">
                <s.Icon size={14} /> {s.title}
              </span>
              {compact ? null : <span className="flow-step-note">{s.note}</span>}
              {/* Progress hairline: only drawn for the active step, and only
                  while the timer is actually running. */}
              {isActive && !userDriving ? <span className="flow-step-progress" /> : null}
            </button>
          );
        })}
      </div>

      <div
        className="flow-detail"
        id="flow-detail"
        role="tabpanel"
        aria-labelledby={`flow-tab-${active}`}
      >
        <div className="flow-detail-inner" data-entering={entering}>
          <h3>{step.detailTitle}</h3>
          <p>{step.detail}</p>
          <div className="flow-detail-meta">
            {step.meta.map((m) => (
              <span key={m} className="pill">
                {m}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function FlowDiagram({ activeStep }: { activeStep: number }) {
  return (
    <div className="flow-diagram-wrap">
      <svg
        viewBox="0 0 780 160"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="flow-diagram-svg"
      >
        {/* Connecting Lines */}
        {/* Wallet to AegisVault */}
        <path
          d="M 125 70 L 255 70"
          stroke={activeStep === 0 || activeStep === 4 ? 'var(--accent)' : 'var(--line-strong)'}
          strokeWidth={activeStep === 0 || activeStep === 4 ? 2.5 : 1.5}
          strokeDasharray={activeStep === 0 ? '6 4' : undefined}
        />

        {/* AegisVault to Agent Monitor */}
        <path
          d="M 385 70 L 515 70"
          stroke={activeStep === 2 || activeStep === 3 ? 'var(--info)' : 'var(--line-strong)'}
          strokeWidth={activeStep === 2 || activeStep === 3 ? 2.5 : 1.5}
          strokeDasharray={activeStep === 2 ? '4 4' : undefined}
        />

        {/* AegisVault to EmergencyVault */}
        <path
          d="M 320 95 L 320 135 L 580 135 L 580 95"
          stroke={activeStep === 3 ? '#ff6b6b' : 'var(--line-strong)'}
          strokeWidth={activeStep === 3 ? 2.5 : 1.5}
          strokeDasharray={activeStep === 3 ? '6 4' : undefined}
        />

        {/* BLOCKED Path: Agent to Direct Withdrawal */}
        <path
          d="M 575 70 L 575 125 L 125 125"
          stroke="rgba(255, 107, 107, 0.4)"
          strokeWidth="1.2"
          strokeDasharray="3 3"
        />

        {/* NODES */}
        {/* Node 1: User Wallet */}
        <g transform="translate(15, 45)">
          <rect
            x="0"
            y="0"
            width="110"
            height="50"
            rx="8"
            fill="var(--surface-2)"
            stroke={activeStep === 0 || activeStep === 4 ? 'var(--accent)' : 'var(--line)'}
            strokeWidth={activeStep === 0 || activeStep === 4 ? 2 : 1}
          />
          <text x="55" y="24" textAnchor="middle" fill="var(--fg)" fontSize="12" fontWeight="600">
            User Wallet
          </text>
          <text x="55" y="38" textAnchor="middle" fill="var(--fg-subtle)" fontSize="9.5">
            Sole Key Owner
          </text>
        </g>

        {/* Node 2: AegisVault */}
        <g transform="translate(255, 45)">
          <rect
            x="0"
            y="0"
            width="130"
            height="50"
            rx="8"
            fill="var(--surface-2)"
            stroke={activeStep === 0 || activeStep === 1 || activeStep === 3 ? 'var(--accent)' : 'var(--line)'}
            strokeWidth={activeStep === 0 || activeStep === 1 || activeStep === 3 ? 2 : 1}
          />
          <text x="65" y="24" textAnchor="middle" fill="var(--fg)" fontSize="12" fontWeight="600">
            AegisVault
          </text>
          <text x="65" y="38" textAnchor="middle" fill="var(--accent)" fontSize="9.5">
            Non-Custodial Escrow
          </text>
        </g>

        {/* Node 3: Off-Chain Agent */}
        <g transform="translate(515, 45)">
          <rect
            x="0"
            y="0"
            width="130"
            height="50"
            rx="8"
            fill="var(--surface-3)"
            stroke={activeStep === 2 ? 'var(--info)' : 'var(--line)'}
            strokeWidth={activeStep === 2 ? 2 : 1}
          />
          <text x="65" y="24" textAnchor="middle" fill="var(--fg)" fontSize="12" fontWeight="600">
            Risk Agent
          </text>
          <text x="65" y="38" textAnchor="middle" fill="var(--info)" fontSize="9.5">
            Read-Only Watcher
          </text>
        </g>

        {/* Security Badge: Blocked Path Indicator */}
        <g transform="translate(270, 114)">
          <rect x="0" y="0" width="180" height="22" rx="4" fill="rgba(255, 107, 107, 0.12)" stroke="rgba(255, 107, 107, 0.3)" />
          <text x="90" y="15" textAnchor="middle" fill="#ff6b6b" fontSize="9.5" fontWeight="600">
            🚫 Direct Agent Transfer Blocked
          </text>
        </g>
      </svg>
    </div>
  );
}
