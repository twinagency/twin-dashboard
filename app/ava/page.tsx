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
  ["A$384k+", "Revenue generated"],
];

const features = [
  ["✈", "Built for Telegram", "Meet your fans where they already are."],
  ["◌", "Natural conversations", "On-brand chats that feel personal and convert."],
  ["▧", "Sells your content", "Photos, videos, bundles and custom offers."],
  ["▥", "Real-time analytics", "Track messages, buyers, revenue and retention."],
  ["✦", "Fully managed", "We handle the technology so you can keep creating."],
];

function TelegramPhone({ secondary = false }: { secondary?: boolean }) {
  const creator = secondary ? "Sienna Rose" : "Mia Vale";
  const initial = secondary ? "S" : "M";
  return (
    <div className={`ava-phone ava-phone-real ${secondary ? "ava-phone-secondary" : ""}`} aria-label={`Demo Telegram conversation with ${creator}`}>
      <div className="ava-phone-notch" />
      <div className="ava-telegram-topbar">
        <span className="ava-back">‹</span>
        <span className="ava-avatar">{initial}</span>
        <span className="ava-chat-name"><strong>{creator}</strong><small>{secondary ? "last seen recently" : "online"}</small></span>
        <span className="ava-tg-actions">⌕ ⋮</span>
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
            <div className="ava-content-card"><div className="ava-content-blur" /><div className="ava-lock">🔒<small>Tap to unlock</small></div></div>
            <div className="ava-bubble them">This set is so hot 🔥</div>
            <button type="button" className="ava-unlock">Unlock for $12</button>
          </>
        )}
      </div>
      <div className="ava-message-bar"><span>Message</span><span>◉ 🎙</span></div>
      <div className="ava-home-indicator" />
    </div>
  );
}

function DashboardMockup() {
  const bars = [24,34,28,46,41,58,55,69,77,71,86,93,82,101,108,96,118,124,113,132,141,136,154,164,158,176,185,194];
  const nav = ["Earnings", "Creators", "Fans", "PPVs", "Business", "Flows", "Edit", "Settings", "Logs"];
  const cards = [
    ["Total revenue", "A$384,729.84", "+32.8%"],
    ["Total balance", "A$72,441.18", "+18.6%"],
    ["Telegram Stars", "1,948,220", "+28.1%"],
    ["Orders", "24,892", "+35.4%"],
  ];
  const secondary = [
    ["All-time users", "184,209"],
    ["New users", "28,941"],
    ["Users who messaged", "162,774"],
    ["Revenue per user", "A$2.09"],
  ];
  return (
    <div className="ava-dashboard-frame">
      <aside className="ava-dashboard-sidebar">
        <div className="ava-dashboard-logo">Ava</div>
        <div className="ava-core-pill"><span>◉</span><b>AI Intelligence Core</b></div>
        {nav.map((item, index) => <span key={item} className={index === 0 ? "active" : ""}>{item}</span>)}
      </aside>
      <div className="ava-dashboard-main">
        <div className="ava-dashboard-mobilebar"><span className="ava-dashboard-logo">Ava</span><span>Mia Vale</span></div>
        <div className="ava-dashboard-topbar">
          <div><small>Mia Vale / Earnings</small><h3>Earnings overview</h3></div>
          <div className="ava-dashboard-controls"><span>Updated just now</span><span>AUD</span><span>◉</span><span>•••</span></div>
        </div>
        <div className="ava-dashboard-periods">
          {['All','1D','7D','1M','3M','6M','1Y','Custom'].map(x => <span key={x} className={x === '1M' ? 'active' : ''}>{x}</span>)}
        </div>
        <div className="ava-dashboard-kpis">
          {cards.map(([label,value,trend]) => <article key={label}><small>{label}</small><strong>{value}</strong><em>↗ {trend}</em></article>)}
        </div>
        <div className="ava-dashboard-chart">
          <div className="ava-dashboard-charthead"><div><small>Revenue</small><strong>A$128,442.63</strong></div><span>Last 30 days</span></div>
          <div className="ava-dashboard-bars">{bars.map((h,i)=><i key={i} style={{height:`${h}px`}} />)}</div>
          <div className="ava-dashboard-axis"><span>Aug 12</span><span>Aug 19</span><span>Aug 26</span><span>Sep 2</span><span>Sep 9</span></div>
        </div>
        <div className="ava-dashboard-secondary">
          {secondary.map(([label,value]) => <article key={label}><small>{label}</small><strong>{value}</strong></article>)}
        </div>
      </div>
    </div>
  );
}

export default function AvaPage() {
  return (
    <main className="ava-site">
      <style>{`
        .ava-hero-visual{min-height:470px;gap:0;overflow:visible}.ava-phone-real{width:205px!important;height:430px!important;border-radius:34px!important;padding:7px!important;background:#08090c!important;border:1px solid #50545a!important;box-shadow:0 28px 60px rgba(34,13,20,.24),inset 0 0 0 1px rgba(255,255,255,.08)!important;transform:rotate(-2.5deg)!important}.ava-phone-secondary{transform:translate(-24px,20px) rotate(3.5deg)!important;z-index:1!important}.ava-phone-notch{top:8px!important;width:74px!important;height:19px!important}.ava-telegram-topbar{height:58px!important;border-radius:28px 28px 0 0!important;background:#17212b!important;grid-template-columns:18px 29px 1fr 35px!important;gap:6px!important;padding:14px 9px 7px!important;align-items:center!important}.ava-avatar{width:29px!important;height:29px!important;background:linear-gradient(135deg,#c0617e,#6f102d)!important}.ava-chat-name strong{font-size:10.5px}.ava-chat-name small{font-size:7px!important;color:#62c58b!important}.ava-tg-actions{font-size:9px;color:#dce5eb;letter-spacing:2px}.ava-chat{height:326px!important;background:#0e1621!important;padding:8px!important;gap:6px!important}.ava-bubble{font-size:9px!important;padding:7px 8px!important;border-radius:10px!important;box-shadow:0 1px 0 rgba(0,0,0,.22)}.ava-bubble.them{background:#182533!important}.ava-bubble.me{background:#2b5278!important}.ava-content-card{height:96px!important;border-radius:10px!important}.ava-content-card.compact{height:80px!important}.ava-unlock{font-size:8.8px!important;padding:7px 10px!important;background:#8c2146!important}.ava-message-bar{height:38px!important;border-radius:0 0 27px 27px!important;background:#17212b!important;padding:9px 10px!important;font-size:8.5px!important}.ava-home-indicator{position:absolute;bottom:4px;left:50%;width:68px;height:3px;border-radius:99px;background:#f1f1f1;transform:translateX(-50%);opacity:.72}.ava-script-note{display:none!important}.ava-orb.one{width:300px!important;height:300px!important}.ava-orb.two{width:250px!important;height:250px!important}
        .ava-dashboard-frame{display:grid;grid-template-columns:154px minmax(0,1fr);width:100%;border:1px solid #d7dce4;border-radius:18px;overflow:hidden;background:#f7f8fb;box-shadow:0 30px 70px rgba(8,18,32,.28),0 0 0 7px #101318;min-height:520px}.ava-dashboard-sidebar{background:linear-gradient(180deg,#65152f,#3a0c1c);color:#fff;padding:18px 12px;display:flex;flex-direction:column;gap:4px}.ava-dashboard-logo{font-family:Georgia,'Times New Roman',serif;font-style:italic;font-size:28px;line-height:1;color:#fff;margin:4px 8px 14px}.ava-core-pill{display:flex;align-items:center;gap:7px;padding:9px 8px;margin:0 3px 12px;border-radius:11px;background:rgba(255,255,255,.04);border:1px solid rgba(125,211,252,.22);font-size:8px}.ava-core-pill span{color:#7dd3fc}.ava-core-pill b{font-size:7.4px;color:#fff}.ava-dashboard-sidebar>span{font-size:9px;padding:8px 9px;border-radius:8px;color:#eadde2}.ava-dashboard-sidebar>span.active{background:#8b2a4b;color:#fff}.ava-dashboard-main{min-width:0;padding:18px;background:#f5f7fa;color:#202733}.ava-dashboard-mobilebar{display:none}.ava-dashboard-topbar{display:flex;justify-content:space-between;gap:12px;align-items:center;padding-bottom:12px;border-bottom:1px solid #e0e5eb}.ava-dashboard-topbar small{display:block;font-size:8px;color:#738091;margin-bottom:3px}.ava-dashboard-topbar h3{margin:0;font-size:19px;letter-spacing:-.02em}.ava-dashboard-controls{display:flex;gap:6px;align-items:center}.ava-dashboard-controls span{font-size:7.5px;background:#fff;border:1px solid #dfe4ea;border-radius:8px;padding:6px 7px;color:#667180}.ava-dashboard-periods{display:flex;gap:5px;flex-wrap:wrap;padding:12px 0}.ava-dashboard-periods span{font-size:8px;padding:5px 7px;border-radius:7px;background:#fff;border:1px solid #dfe4ea;color:#667085}.ava-dashboard-periods span.active{background:#24354b;color:#fff}.ava-dashboard-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.ava-dashboard-kpis article,.ava-dashboard-secondary article,.ava-dashboard-chart{background:#fff;border:1px solid #e0e5eb;border-radius:12px;box-shadow:0 5px 15px rgba(33,46,62,.035)}.ava-dashboard-kpis article{padding:11px}.ava-dashboard-kpis small,.ava-dashboard-secondary small,.ava-dashboard-chart small{display:block;color:#7a8491;font-size:7.5px}.ava-dashboard-kpis strong{display:block;color:#15945d;font-size:16px;margin:4px 0;letter-spacing:-.02em;white-space:nowrap}.ava-dashboard-kpis em{font-style:normal;color:#2a9b67;font-size:7px}.ava-dashboard-chart{padding:12px;margin-top:9px}.ava-dashboard-charthead{display:flex;justify-content:space-between;align-items:end;gap:10px}.ava-dashboard-charthead strong{display:block;font-size:16px;margin-top:3px}.ava-dashboard-charthead>span{font-size:7px;color:#7a8491}.ava-dashboard-bars{height:180px;display:flex;align-items:flex-end;gap:4px;border-bottom:1px solid #dce2e9;background:repeating-linear-gradient(to top,#fff 0,#fff 44px,#edf1f5 45px)}.ava-dashboard-bars i{flex:1;background:#8c2146;border-radius:3px 3px 0 0;min-width:2px;max-width:12px}.ava-dashboard-axis{display:flex;justify-content:space-between;padding-top:6px;color:#89929d;font-size:6.5px}.ava-dashboard-secondary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:9px}.ava-dashboard-secondary article{padding:10px}.ava-dashboard-secondary strong{display:block;font-size:14px;margin-top:3px}.ava-product-section{grid-template-columns:.72fr 1.28fr!important}
        @media(max-width:760px){.ava-header{grid-template-columns:1fr auto!important;padding:14px 18px!important}.ava-header nav{display:none!important}.ava-header>.ava-button{padding:11px 16px!important;font-size:13px!important}.ava-wordmark{font-size:30px!important}.ava-hero{display:block!important;min-height:auto!important;padding:48px 22px 28px!important}.ava-hero h1{font-size:clamp(50px,14vw,72px)!important}.ava-hero-copy>p{font-size:17px!important;line-height:1.5!important}.ava-trust{align-items:flex-start!important;gap:10px!important;flex-wrap:wrap}.ava-hero-visual{min-height:360px!important;margin-top:14px!important;justify-content:center!important}.ava-phone-real{width:154px!important;height:326px!important;border-radius:27px!important}.ava-phone-secondary{transform:translate(-25px,20px) rotate(3deg)!important}.ava-phone-notch{width:58px!important;height:15px!important}.ava-telegram-topbar{height:48px!important;border-radius:22px 22px 0 0!important;grid-template-columns:14px 24px 1fr 27px!important;padding:11px 7px 6px!important}.ava-avatar{width:23px!important;height:23px!important;font-size:9px!important}.ava-chat-name strong{font-size:8.5px}.ava-chat-name small{font-size:5.5px!important}.ava-tg-actions{font-size:7px}.ava-chat{height:246px!important;padding:6px!important;gap:4px!important}.ava-bubble{font-size:7.1px!important;padding:5px 6px!important}.ava-content-card{height:66px!important}.ava-content-card.compact{height:56px!important}.ava-unlock{font-size:7px!important;padding:5px 7px!important}.ava-message-bar{height:29px!important;padding:7px 7px!important;font-size:6.5px!important}.ava-home-indicator{width:50px}.ava-metrics{grid-template-columns:repeat(2,1fr)!important}.ava-product-section{display:block!important;padding:48px 18px 58px!important}.ava-product-copy{margin-bottom:34px}.ava-product-copy h2{font-size:44px!important}.ava-dashboard-frame{display:block;min-height:0;border-radius:16px;box-shadow:0 20px 42px rgba(0,0,0,.26),0 0 0 4px #101318}.ava-dashboard-sidebar{display:none}.ava-dashboard-main{padding:12px}.ava-dashboard-mobilebar{display:flex;justify-content:space-between;align-items:center;background:linear-gradient(90deg,#65152f,#4a1023);margin:-12px -12px 12px;padding:11px 12px;color:#fff;font-size:10px}.ava-dashboard-mobilebar .ava-dashboard-logo{font-size:20px;margin:0}.ava-dashboard-topbar{align-items:flex-start}.ava-dashboard-topbar h3{font-size:17px}.ava-dashboard-controls span:first-child,.ava-dashboard-controls span:nth-child(3),.ava-dashboard-controls span:nth-child(4){display:none}.ava-dashboard-controls span{font-size:7px;padding:5px 6px}.ava-dashboard-periods{gap:4px;overflow-x:auto;flex-wrap:nowrap;padding:10px 0 11px;scrollbar-width:none}.ava-dashboard-periods::-webkit-scrollbar{display:none}.ava-dashboard-periods span{flex:0 0 auto;font-size:7px;padding:5px 7px}.ava-dashboard-kpis{grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.ava-dashboard-kpis article{padding:10px}.ava-dashboard-kpis small{font-size:7px}.ava-dashboard-kpis strong{font-size:14px;white-space:normal}.ava-dashboard-kpis em{font-size:6.5px}.ava-dashboard-chart{padding:10px;margin-top:8px}.ava-dashboard-charthead strong{font-size:14px}.ava-dashboard-bars{height:128px;gap:2px}.ava-dashboard-axis{font-size:5.5px}.ava-dashboard-secondary{grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.ava-dashboard-secondary article{padding:9px}.ava-dashboard-secondary strong{font-size:13px}.ava-features{grid-template-columns:1fr!important}.ava-testimonial{grid-template-columns:1fr!important}.ava-portrait{display:none!important}.ava-footer{grid-template-columns:1fr!important;text-align:center}.ava-footer nav{justify-content:center;flex-wrap:wrap}.ava-footer small{justify-self:center!important}}
      `}</style>

      <header className="ava-header">
        <a className="ava-wordmark" href="#top">Ava</a>
        <nav><a href="#top">Home</a><a href="#how">How It Works</a><a href="#features">Features</a><a href="#results">Results</a><a href="#faq">FAQ</a></nav>
        <button type="button" className="ava-button solid">Get Started <span>→</span></button>
      </header>

      <section id="top" className="ava-hero">
        <div className="ava-hero-copy">
          <div className="ava-eyebrow">AI clones for real creators</div>
          <h1>Your Fans.<br/>Your Rules.<br/><em>More Revenue.</em></h1>
          <p>Ava builds AI clones for creators that chat, sell content and grow your income 24/7 on Telegram.</p>
          <div className="ava-hero-actions"><button type="button" className="ava-button solid">Get Started <span>→</span></button><button type="button" className="ava-button ghost">Book a Call</button></div>
          <div className="ava-trust"><div className="ava-face-stack">{['M','S','L','A','N'].map((x,i)=><i key={i}>{x}</i>)}</div><div><div className="ava-stars">★★★★★ <b>5.0</b></div><small>Trusted by top creators</small></div></div>
        </div>
        <div className="ava-hero-visual"><div className="ava-orb one"/><div className="ava-orb two"/><TelegramPhone/><TelegramPhone secondary/></div>
      </section>

      <section className="ava-metrics" id="results">{metrics.map(([value,label])=><div key={label}><strong>{value}</strong><span>{label}</span></div>)}</section>

      <section id="how" className="ava-product-section">
        <div className="ava-product-copy">
          <div className="ava-eyebrow light">Creator growth platform</div>
          <h2>Everything You Need<br/>to Scale as a Creator.</h2>
          <p>Ava handles the conversations, sells your content and builds real relationships with your fans, so you can focus on creating.</p>
          <ul><li>Autonomous AI chat on Telegram</li><li>Sells photos, videos, bundles and customs</li><li>Learns your style, tone and personality</li><li>24/7 operation with full analytics</li><li>Fully managed setup and support</li></ul>
          <button type="button" className="ava-button cream">Get Started <span>→</span></button>
        </div>
        <DashboardMockup />
      </section>

      <section className="ava-features" id="features">{features.map(([icon,title,copy])=><article key={title}><i>{icon}</i><h3>{title}</h3><p>{copy}</p></article>)}</section>
      <section className="ava-testimonial"><div className="ava-portrait ava-left-portrait"><span>A</span></div><div className="ava-testimonial-copy"><div className="ava-eyebrow">Trusted by top creators</div><blockquote>“Ava feels like another me, talking to my fans 24/7.”</blockquote><div className="ava-stars centered">★★★★★</div><small>Demo creator testimonial</small></div><div className="ava-portrait ava-right-portrait"><span>V</span></div></section>
      <section className="ava-final-cta"><div className="ava-eyebrow light">Same girls. Bigger opportunities.</div><h2>Ready to Scale with Ava?</h2><button type="button" className="ava-button cream">Get Started <span>→</span></button></section>
      <footer className="ava-footer"><a className="ava-wordmark" href="#top">Ava</a><nav><a href="#how">How It Works</a><a href="#features">Features</a><a href="#results">Results</a><a href="#faq">FAQ</a></nav><small>© 2026 Ava. Front-end preview.</small></footer>
      <div id="faq" className="ava-faq-anchor" />
    </main>
  );
}
