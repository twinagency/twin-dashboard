import type { Metadata } from "next";
import "./ava.css";

export const metadata: Metadata = {
  title: "Ava | AI clones for creators",
  description: "A premium AI creator clone experience built around Telegram conversations, paid content and creator analytics.",
  robots: { index: false, follow: false },
};

const metrics = [
  ["70,000+", "Fans engaged"],
  ["51%", "Repeat order rate"],
  ["12+", "Live AI clones"],
  ["$71,000+", "Revenue generated"],
];

const features = [
  ["✈", "Built for Telegram", "Meet your fans where they already are."],
  ["◌", "Natural conversations", "On-brand chats that feel personal and convert."],
  ["▧", "Sells your content", "Photos, videos, bundles and custom offers."],
  ["▥", "Real-time analytics", "Track messages, buyers, revenue and retention."],
  ["✦", "Fully managed", "We handle the technology so you can keep creating."],
];

function TelegramPhone({ secondary = false }: { secondary?: boolean }) {
  return (
    <div className={`ava-phone ${secondary ? "ava-phone-secondary" : ""}`} aria-label="Demo Telegram conversation">
      <div className="ava-phone-notch" />
      <div className="ava-telegram-topbar">
        <span className="ava-back">‹</span>
        <span className="ava-avatar">A</span>
        <span><strong>Ava</strong><small>{secondary ? "last seen recently" : "online"}</small></span>
        <span className="ava-tg-mark">✦</span>
      </div>
      <div className="ava-chat">
        {secondary ? (
          <>
            <div className="ava-bubble them">You’re amazing 😍</div>
            <div className="ava-voice"><span>▶</span><i /><i /><i /><i /><i /><i /><b>0:24</b></div>
            <div className="ava-bubble them">Should I send you a custom video?</div>
            <div className="ava-bubble me">Yes please 🔥</div>
            <div className="ava-content-card compact"><div className="ava-content-blur" /><span>Just for you 💗</span></div>
          </>
        ) : (
          <>
            <div className="ava-bubble them">Hey handsome 💕<br/>Good to see you here...</div>
            <div className="ava-bubble me">You got any new content? 😏</div>
            <div className="ava-bubble them">I do... want a little preview? 😉</div>
            <div className="ava-content-card"><div className="ava-content-blur" /><div className="ava-lock">⌑<small>Tap to unlock</small></div></div>
            <div className="ava-bubble them">This set is so hot 🔥</div>
            <button type="button" className="ava-unlock">Unlock for $12</button>
          </>
        )}
      </div>
      <div className="ava-message-bar">Message… <span>◉</span></div>
    </div>
  );
}

function DashboardMockup() {
  const bars = [28, 38, 34, 51, 47, 62, 58, 71, 76, 88, 82, 102];
  return (
    <div className="ava-laptop">
      <div className="ava-laptop-screen">
        <div className="ava-dash-sidebar">
          <div className="ava-mini-logo">Ava</div>
          {['Dashboard','Fans','Messages','Content','Analytics','AI Training','Settings'].map((item, index) => (
            <span className={index === 0 ? 'active' : ''} key={item}>{item}</span>
          ))}
        </div>
        <div className="ava-dash-main">
          <div className="ava-dash-head"><span>Revenue</span><small>Last 30 days⌄</small></div>
          <div className="ava-revenue-row"><strong>$24,532.18</strong><em>↗ 28%</em></div>
          <div className="ava-dashboard-grid">
            <div className="ava-chart-card">
              <div className="ava-bars">{bars.map((h,i)=><i key={i} style={{height:`${h}px`}} />)}</div>
            </div>
            <div className="ava-kpi-grid">
              <div><strong>8,392</strong><span>Messages</span><em>↗ 12%</em></div>
              <div><strong>1,204</strong><span>Purchases</span><em>↗ 35%</em></div>
              <div><strong>51%</strong><span>Repeat Rate</span><em>↗ 6%</em></div>
              <div><strong>2,847</strong><span>Active Fans</span><em>↗ 18%</em></div>
            </div>
          </div>
          <div className="ava-bottom-grid">
            <div className="ava-top-content"><span>Top Performing Content</span><div>{[487,421,398,362].map(v=><figure key={v}><i/><b>${v}</b></figure>)}</div></div>
            <div className="ava-growth"><span>Fans</span><b>+1,257</b><svg viewBox="0 0 160 60" preserveAspectRatio="none"><polyline points="0,50 20,45 40,47 60,32 80,35 100,24 120,27 140,12 160,4" /></svg></div>
          </div>
        </div>
      </div>
      <div className="ava-laptop-base" />
    </div>
  );
}

export default function AvaPage() {
  return (
    <main className="ava-site">
      <header className="ava-header">
        <a className="ava-wordmark" href="#top">Ava</a>
        <nav>
          <a href="#top">Home</a><a href="#how">How It Works</a><a href="#features">Features</a><a href="#results">Results</a><a href="#faq">FAQ</a>
        </nav>
        <button type="button" className="ava-button solid">Get Started <span>→</span></button>
      </header>

      <section id="top" className="ava-hero">
        <div className="ava-hero-copy">
          <div className="ava-eyebrow">AI clones for real creators</div>
          <h1>Your Fans.<br/>Your Rules.<br/><em>More Revenue.</em></h1>
          <p>Ava builds AI clones for creators that chat, sell content and grow your income 24/7 on Telegram.</p>
          <div className="ava-hero-actions"><button type="button" className="ava-button solid">Get Started <span>→</span></button><button type="button" className="ava-button ghost">Book a Call</button></div>
          <div className="ava-trust"><div className="ava-face-stack">{['A','V','A','A','V'].map((x,i)=><i key={i}>{x}</i>)}</div><div><div className="ava-stars">★★★★★ <b>5.0</b></div><small>Trusted by top creators</small></div></div>
        </div>
        <div className="ava-hero-visual">
          <div className="ava-orb one"/><div className="ava-orb two"/>
          <TelegramPhone />
          <TelegramPhone secondary />
          <div className="ava-script-note">Same girls.<br/>More opportunities. ♡</div>
        </div>
      </section>

      <section className="ava-metrics" id="results">{metrics.map(([value,label])=><div key={label}><strong>{value}</strong><span>{label}</span></div>)}</section>

      <section id="how" className="ava-product-section">
        <div className="ava-product-copy">
          <div className="ava-eyebrow light">Creator growth platform</div>
          <h2>Everything You Need<br/>to Scale as a Creator.</h2>
          <p>Ava handles the conversations, sells your content and builds real relationships with your fans, so you can focus on creating.</p>
          <ul>
            <li>Autonomous AI chat on Telegram</li>
            <li>Sells photos, videos, bundles and customs</li>
            <li>Learns your style, tone and personality</li>
            <li>24/7 operation with full analytics</li>
            <li>Fully managed setup and support</li>
          </ul>
          <button type="button" className="ava-button cream">Get Started <span>→</span></button>
        </div>
        <DashboardMockup />
      </section>

      <section className="ava-features" id="features">{features.map(([icon,title,copy])=><article key={title}><i>{icon}</i><h3>{title}</h3><p>{copy}</p></article>)}</section>

      <section className="ava-testimonial">
        <div className="ava-portrait ava-left-portrait"><span>A</span></div>
        <div className="ava-testimonial-copy"><div className="ava-eyebrow">Trusted by top creators</div><blockquote>“Ava feels like another me, talking to my fans 24/7.”</blockquote><div className="ava-stars centered">★★★★★</div><small>Demo creator testimonial</small></div>
        <div className="ava-portrait ava-right-portrait"><span>V</span></div>
      </section>

      <section className="ava-final-cta"><div className="ava-eyebrow light">Same girls. Bigger opportunities.</div><h2>Ready to Scale with Ava?</h2><button type="button" className="ava-button cream">Get Started <span>→</span></button></section>

      <footer className="ava-footer"><a className="ava-wordmark" href="#top">Ava</a><nav><a href="#how">How It Works</a><a href="#features">Features</a><a href="#results">Results</a><a href="#faq">FAQ</a></nav><small>© 2026 Ava. Front-end preview.</small></footer>
      <div id="faq" className="ava-faq-anchor" />
    </main>
  );
}
