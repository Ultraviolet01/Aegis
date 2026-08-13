'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { motion } from 'motion/react';

const PROMPTS = [
  "“If GLDX falls 12%, move 75% to USDC immediately”",
  "“Cautious: exit 30% on a 5% drawdown or 1% oracle deviation”",
  "“Pause if the oracle moves more than 2% from market price”"
];

// Reusable fluid reveal wrapper
function Reveal({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 24, filter: 'blur(4px)' }}
      whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.8, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}

export default function Landing() {
  const [promptIndex, setPromptIndex] = useState(0);
  const [lastCheckSec, setLastCheckSec] = useState(2);

  useEffect(() => {
    const interval = setInterval(() => {
      setPromptIndex((i) => (i + 1) % PROMPTS.length);
    }, 4200);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setLastCheckSec((s) => (s >= 5 ? 1 : s + 1));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <>
      <motion.header 
        className="wrap nav"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      >
        <Link className="brand" href="/">
          <span className="mark"></span>Aegis
        </Link>
        <nav className="navlinks">
          <a href="#demo">Policy</a>
          <a href="#flow">How it works</a>
          <a href="#assets">Assets</a>
          <a href="#boundary">Trust boundary</a>
        </nav>
        <Link className="navcta" href="/app">Open the app ↗</Link>
      </motion.header>

      <main>
        <section className="wrap hero">
          <motion.div
            className="hero-content"
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="kicker">X Layer · non-custodial risk infrastructure</div>
            <h1>Protection that <em>can watch.</em><br/>Not custody.</h1>
            <p>Aegis is an AI risk guardian for tokenized real-world assets and DeFi positions. You write the rule. Your vault enforces the boundary. The agent watches the market and has only one narrow action when your condition is breached.</p>
            <div className="hero-status-strip">
              <span className="pulse-dot"></span>
              <span>Agent status: <strong>Watching</strong> · Last check {lastCheckSec}s ago · Risk score 14/100</span>
            </div>

            <div className="actions">
              <Link className="primary" href="/app">Open the app</Link>
              <a className="secondary" href="#demo">See the policy parser ↓</a>
            </div>
          </motion.div>

          <motion.div 
            className="guardian-wrapper"
            initial={{ opacity: 0, scale: 0.95, filter: 'blur(10px)' }}
            animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
            transition={{ duration: 1, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          >
            <div 
              className="guardian" 
              style={{ padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}
            >
              <video src="/vid.mp4" autoPlay loop muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
          </motion.div>
        </section>

        <Reveal>
          <div className="band">
            <div className="wrap bandrow">
              <span>THE CORE PROMISE</span>
              <strong>Watches prices → verifies breach → pauses or routes → records proof. Never owns the position.</strong>
            </div>
          </div>
        </Reveal>

        <section className="wrap section" id="demo">
          <Reveal delay={0}>
            <div className="eyebrow">01 / Plain English → policy</div>
            <h2>Tell Aegis what “risk” means to you.</h2>
            <p className="intro">The parser turns one sentence into explicit contract parameters. Values you actually specify stay visually distinct from safe defaults the parser supplies.</p>
          </Reveal>
          
          <Reveal delay={0.15}>
            <div className="policy-demo">
              <div className="inputside">
                <div className="label">Your policy</div>
                <div className="prompt">
                  <motion.span
                    key={promptIndex}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.4 }}
                  >
                    {PROMPTS[promptIndex]}
                  </motion.span>
                  <span className="cursor"></span>
                </div>
                <div className="chips">
                  <span className="chip">5% drawdown</span>
                  <span className="chip">1% oracle deviation</span>
                  <span className="chip">30% exit</span>
                  <span className="chip default">cautious → default</span>
                </div>
                <div className="note"><span style={{ color: '#245e4b', fontWeight: 700 }}>● Green</span> = explicitly stated · <span style={{ color: '#777' }}>● Grey</span> = parser fallback</div>
              </div>
              <div className="parseside">
                <div className="label">On-chain policy preview</div>
                <div className="paramgrid">
                  <div className="param specified"><small>Drawdown</small><b>5.00%</b></div>
                  <div className="param specified"><small>Oracle deviation</small><b>1.00%</b></div>
                  <div className="param specified"><small>Exit percentage</small><b>30%</b></div>
                  <div className="param fallback"><small>Risk mode</small><b>CAUTIOUS</b></div>
                </div>
                <div className="note">Policy hash <span className="mono">0x7a91…e31c</span> · immutable after signature</div>
              </div>
            </div>
          </Reveal>
        </section>

        <section className="section alt" id="flow">
          <div className="wrap">
            <Reveal>
              <div className="eyebrow">02 / The loop</div>
              <h2>Set once. The boundary stays on-chain.</h2>
              <p className="intro">Aegis separates observation from authority. The agent can interpret signals and call only the functions your vault already permits.</p>
            </Reveal>
            
            <div className="steps">
              <Reveal delay={0.1} className="step"><span className="num">01</span><h3>Deposit</h3><p>Place a supported tokenized asset or stablecoin in your vault.</p></Reveal>
              <Reveal delay={0.2} className="step"><span className="num">02</span><h3>Write</h3><p>Describe your risk tolerance in plain English and review the parsed policy.</p></Reveal>
              <Reveal delay={0.3} className="step"><span className="num">03</span><h3>Watch</h3><p>The agent reads price and oracle-health signals continuously.</p></Reveal>
              <Reveal delay={0.4} className="step"><span className="num">04</span><h3>Defend</h3><p>A confirmed breach triggers only pause or the approved route to recovery.</p></Reveal>
              <Reveal delay={0.5} className="step"><span className="num">05</span><h3>Withdraw</h3><p>You retain withdrawal control at every point — online or offline.</p></Reveal>
            </div>
          </div>
        </section>

        <section className="wrap section" id="assets">
          <Reveal>
            <div className="asset-intro">
              <div>
                <div className="eyebrow">03 / What it guards</div>
                <h2>Real assets. Explicit boundaries.</h2>
              </div>
              <p className="intro">Designed around the growing onchain RWA market: tokenized equities, commodities and stablecoins.</p>
            </div>
          </Reveal>
          
          <div className="assetlist">
            <Reveal delay={0.1} className="assetcard">
              <div className="assettop"><span className="ticker">SPYX</span><span className="verified">REGISTRY</span></div>
              <div className="assetname">S&P 500 exposure</div>
              <div className="assetmeta">TOKENIZED EQUITY · EVM</div>
              <div className="assetline">Price source · oracle feed · policy-aware</div>
            </Reveal>
            <Reveal delay={0.2} className="assetcard">
              <div className="assettop"><span className="ticker">GLDX</span><span className="verified">REGISTRY</span></div>
              <div className="assetname">Gold exposure</div>
              <div className="assetmeta">TOKENIZED COMMODITY · EVM</div>
              <div className="assetline">Price source · oracle feed · policy-aware</div>
            </Reveal>
            <Reveal delay={0.3} className="assetcard">
              <div className="assettop"><span className="ticker">USDC</span><span className="verified">STABLECOIN</span></div>
              <div className="assetname">Dollar liquidity</div>
              <div className="assetmeta">ERC-20 · LIQUIDITY BUFFER</div>
              <div className="assetline">Recovery destination · time-locked vault</div>
            </Reveal>
          </div>
        </section>

        <section className="section alt" id="boundary">
          <div className="wrap">
            <Reveal>
              <div className="eyebrow">04 / Trust boundary</div>
              <h2>The agent is deliberately underpowered.</h2>
              <p className="intro">That is the feature. Intelligence lives outside the vault; authority is reduced to a tiny, auditable surface.</p>
            </Reveal>
            <div className="boundary">
              <Reveal delay={0.1} className="can">
                <h3>It CAN</h3>
                <ul>
                  <li><span className="tick">+</span>Read price and oracle-health data</li>
                  <li><span className="tick">+</span>Compare signals against your signed thresholds</li>
                  <li><span className="tick">+</span>Pause a position when permitted</li>
                  <li><span className="tick">+</span>Route the approved percentage to the time-locked recovery vault</li>
                </ul>
              </Reveal>
              <Reveal delay={0.2} className="cannot">
                <h3>It NEVER can</h3>
                <ul>
                  <li><span className="cross">×</span>Withdraw funds to itself or an arbitrary address</li>
                  <li><span className="cross">×</span>Send funds anywhere except the recovery vault</li>
                  <li><span className="cross">×</span>Change, loosen or rewrite your policy</li>
                  <li><span className="cross">×</span>Block, delay or override your withdrawal</li>
                </ul>
              </Reveal>
            </div>
          </div>
        </section>

        <section className="wrap cta">
          <Reveal>
            <div className="ctabox">
              <div>
                <div className="eyebrow" style={{ color: '#86a69a' }}>06 / Final word</div>
                <h2>Give the agent eyes.<br/>Keep the keys.</h2>
                <p>Non-custodial AI risk protection for RWA and DeFi positions on X Layer with the authority boundary designed into the vault itself.</p>
              </div>
              <Link className="primary" style={{ background: 'var(--mint)', color: 'var(--ink)' }} href="/app">Open Aegis ↗</Link>
            </div>
          </Reveal>
        </section>
      </main>

      <motion.footer 
        className="wrap footer"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1, delay: 0.2 }}
      >
        <span>AEGIS · X LAYER</span>
        <span>WATCH · VERIFY · DEFEND · RECORD</span>
      </motion.footer>
    </>
  );
}
