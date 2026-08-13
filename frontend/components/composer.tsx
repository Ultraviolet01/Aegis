'use client';

import { useEffect, useRef, useState } from 'react';
import {
  bpsToPercent,
  detectedFields,
  segmentPolicy,
  type ParsedPolicy,
  type PolicyField,
} from '@/lib/policy';
import { AlertIcon, ArrowRightIcon, PenIcon } from './icons';

/**
 * Plain English in, on-chain calldata out.
 *
 * The point of the panel is the transformation, so the transformation is what
 * the layout shows: the user's own sentence on the left with the fragments the
 * parser matched underlined, and on the right the parameters those fragments
 * produced — each carrying the same color as the words it came from. The color
 * is the mapping. No connector lines, no diagram, nothing to maintain when the
 * text reflows.
 *
 * Under the parameters is the actual calldata, tokenised in those same colors.
 * A judge can read a sentence at the top and see the exact `setPolicy(...)`
 * arguments at the bottom, with the link between them visible rather than
 * asserted.
 */

interface FieldMeta {
  field: PolicyField;
  label: string;
  sub: string;
}

const FIELDS: FieldMeta[] = [
  { field: 'drawdown', label: 'Drawdown threshold', sub: 'Price fall that trips the rule' },
  {
    field: 'deviation',
    label: 'Oracle deviation',
    sub: 'Feed disagreement that trips the rule',
  },
  { field: 'exit', label: 'Exit size', sub: 'Share routed to the time-locked vault' },
  { field: 'mode', label: 'Mode', sub: 'How eagerly the agent reacts' },
];


/**
 * Flash a value when it changes.
 *
 * Comparing against the previous render's value rather than firing on every
 * keystroke: typing "8" then "8%" reparses twice but the number only moves
 * once, and flashing an unchanged value would be a lie about what happened.
 */
function useChangeFlash(value: string | number): boolean {
  const previous = useRef(value);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    if (previous.current === value) return;
    previous.current = value;
    setFlash(true);
    // Matches the 260ms value-settle animation. Cleared on change so a fast
    // typist retriggers cleanly instead of stacking timers.
    const handle = setTimeout(() => setFlash(false), 280);
    return () => clearTimeout(handle);
  }, [value]);

  return flash;
}

function ParamRow({
  meta,
  display,
  raw,
  specified,
}: {
  meta: FieldMeta;
  display: string;
  raw: string;
  specified: boolean;
}) {
  const flash = useChangeFlash(display);

  return (
    <div className="param" data-field={meta.field} data-changed={flash}>
      <span className="param-swatch" aria-hidden="true" />
      <span className="param-name">
        {meta.label}
        <span className="param-sub">{specified ? meta.sub : `${meta.sub} · defaulted`}</span>
      </span>
      <span className="param-value" data-flash={flash}>
        {display}
        <span className="param-raw mono">{raw}</span>
      </span>
    </div>
  );
}

export function PolicyComposer({
  value,
  onChange,
  parsed,
  positionId,
  onSign,
  signing,
  disabled,
  disabledReason,
  examples,
}: {
  value: string;
  onChange: (next: string) => void;
  parsed: ParsedPolicy;
  positionId: string | undefined;
  onSign: () => void;
  signing: boolean;
  disabled: boolean;
  // Explicitly `| undefined` rather than optional: exactOptionalPropertyTypes
  // distinguishes "absent" from "present but undefined", and the parent always
  // passes the prop.
  disabledReason: string | undefined;
  examples: string[];

}) {
  const segments = segmentPolicy(value);
  const detected = detectedFields(value);

  const values: Record<PolicyField, { display: string; raw: string }> = {
    drawdown: {
      display: bpsToPercent(parsed.drawdownThresholdBps),
      raw: `${parsed.drawdownThresholdBps} bps`,
    },
    deviation: {
      display: bpsToPercent(parsed.oracleDeviationThresholdBps),
      raw: `${parsed.oracleDeviationThresholdBps} bps`,
    },
    exit: {
      display: bpsToPercent(parsed.exitPercentBps),
      raw: `${parsed.exitPercentBps} bps`,
    },
    mode: {
      display: parsed.mode,
      raw: `enum ${['Conservative', 'Balanced', 'Aggressive'].indexOf(parsed.mode)}`,
    },
  };

  return (
    <div className="composer">
      {/* ---- Left: what you wrote ------------------------------------- */}
      <div className="composer-side">
        <label className="composer-label" htmlFor="policy">
          <PenIcon size={13} /> Your policy, in plain English
        </label>

        <textarea
          id="policy"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          spellCheck={false}
          placeholder="If SPYX drops more than 8%, move half to USDC."
        />

        <div className="inline">
          {examples.map((example, index) => (
            <button
              key={example}
              type="button"
              className="ghost"
              style={{ fontSize: 12.5, padding: '6px 11px' }}
              onClick={() => onChange(example)}
            >
              Example {index + 1}
            </button>
          ))}
        </div>

        <div className="inset">
          <div className="composer-label" style={{ marginBottom: 9 }}>
            What Aegis read
          </div>
          <p className="reading">
            {segments.length === 0 ? (
              <span className="reading-empty">
                Start typing and the phrases Aegis recognises will be marked here.
              </span>
            ) : (
              segments.map((segment, index) =>
                segment.field ? (
                  // Keyed by index because segments are positional, not
                  // identities — the same phrase can legitimately appear twice.
                  <mark key={index} data-field={segment.field}>
                    {segment.text}
                  </mark>
                ) : (
                  <span key={index}>{segment.text}</span>
                ),
              )
            )}
          </p>
        </div>

        {parsed.warnings.length > 0 ? (
          <div className="notice warn">
            <span className="notice-icon">
              <AlertIcon size={14} />
            </span>
            <div className="stack-sm">
              {parsed.warnings.map((warning) => (
                <div key={warning}>{warning}</div>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {/* ---- Right: what gets signed ---------------------------------- */}
      <div className="composer-side">
        <div className="composer-label">
          <ArrowRightIcon size={13} /> What goes on-chain
        </div>

        <div className="param-list">
          {FIELDS.map((meta) => (
            <ParamRow
              key={meta.field}
              meta={meta}
              display={values[meta.field].display}
              raw={values[meta.field].raw}
              specified={detected[meta.field]}
            />
          ))}
        </div>

        <div className="calldata">
          <div className="calldata-head">
            <span>PolicyRegistry.setPolicy</span>
            <span className="pill">owner-only</span>
          </div>
          <pre className="calldata-body">
            <span className="calldata-fn">setPolicy</span>
            <span className="calldata-punct">(</span>
            {'\n  '}
            <span className="calldata-arg">{positionId ?? '<positionId>'}</span>
            <span className="calldata-punct">,</span>{' '}
            <span className="calldata-comment">// positionId</span>
            {'\n  '}
            <span className="calldata-arg" data-field="drawdown">
              {parsed.drawdownThresholdBps}
            </span>
            <span className="calldata-punct">,</span>{' '}
            <span className="calldata-comment">// drawdownThresholdBps</span>
            {'\n  '}
            <span className="calldata-arg" data-field="deviation">
              {parsed.oracleDeviationThresholdBps}
            </span>
            <span className="calldata-punct">,</span>{' '}
            <span className="calldata-comment">// oracleDeviationThresholdBps</span>
            {'\n  '}
            <span className="calldata-arg" data-field="exit">
              {parsed.exitPercentBps}
            </span>
            <span className="calldata-punct">,</span>{' '}
            <span className="calldata-comment">// exitPercentBps</span>
            {'\n  '}
            <span className="calldata-arg" data-field="mode">
              {['Conservative', 'Balanced', 'Aggressive'].indexOf(parsed.mode)}
            </span>
            {'  '}
            <span className="calldata-comment">// mode ({parsed.mode})</span>
            {'\n'}
            <span className="calldata-punct">)</span>
          </pre>
        </div>

        <button onClick={onSign} disabled={disabled || signing}>
          {signing ? (
            <>
              <span className="spinner" /> Confirm in your wallet…
            </>
          ) : (
            'Sign policy on-chain'
          )}
        </button>

        {disabled && disabledReason ? <p className="footnote">{disabledReason}</p> : null}

        <p className="footnote">
          This preview is deterministic parsing running in your browser — regex and arithmetic, not
          a model. The agent&apos;s LLM parser handles broader phrasing and is validated against the
          same schema. Either way the agent cannot write your policy: <code>setPolicy</code> is
          owner-only.
        </p>
      </div>
    </div>
  );
}
