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
  const creator = secondary ? "Riley Mae" : "Tru Kait";
  const initial = secondary ? "R" : "T";
  return (
    <div className={`ava-phone ${secondary ? "ava-phone-secondary" : ""}`} aria-label={`Demo Telegram conversation with ${creator}`}>
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
  const bars = [31,42,37,55,49,66,61,74,82,91,86,108,98,116,129,121,142,136,156,149,171,162,184,202];
  return (
    <div className="ava-dashboard-shell">
      <aside className="ava-real-sidebar">
        <div className="ava-real-logo">Ava</div>
        <div className="ava-core-dot">◉ <span>AI Intelligence Core</span></div>
        {['Earnings','Creators','Fans','Messages','Content','Flows','Analytics','Settings'].map((item, index) => <span className={index===0?'active':''} key={item}>{item}</span>)}
      </aside>
      <div className="ava-real-main">
        <div className="ava-real-topbar"><div><small>Tru Kait</small><b>Earnings overview</b></div><div className="ava-real-controls"><span>Updated just now</span><span>AUD</span><span>•••</span></div></div>
        <div className="ava-periods">{['ALL','1Y','6M','3M','1M','2W','1W','1D'].map(x=><span className={x==='1M'?'active':''} key={x}>{x}</span>)}<span>Custom</span></div>
        <div className="ava-hero-kpis">
          <article><small>Total revenue</small><strong>A$184,720.73</strong><em>↗ 28.4%</em></article>
          <article><small>Telegram Stars</small><strong>9,833,632</strong><em>↗ 19.7%</em></article>
          <article><small>Total orders</small><strong>18,426</strong><em>↗ 24.1%</em></article>
        </div>
        <div className="ava-real-chart-card">
          <div className="ava-chart-head"><span>Revenue</span><b>A$64,532.18 <em>this month</em></b></div>
          <div className="ava-real-bars">{bars.map((h,i)=><i key={i} style={{height:`${h}px`}} />)}</div>
          <div className="ava-axis"><span>Aug 12</span><span>Aug 18</span><span>Aug 24</span><span>Aug 30</span><span>Sep 5</span><span>Sep 9</span></div>
        </div>
        <div className="ava-real-stats">
          <article><small>Fans</small><strong>71,591</strong><span>+8,241 this month</span></article>
          <article><small>Messages</small><strong>126,904</strong><span>+17.8%</span></article>
          <article><small>Repeat order rate</small><strong>51%</strong><span>+6.2%</span></article>
          <article><small>Avg. revenue per buyer</small><strong>A$38.42</strong><span>+12.1%</span></article>
        </div>
      </div>
    </div>
  );
}

export default function AvaPage() {
  return (
    <main className="ava-site">
      <style>{`
        .ava-hero-visual{min-height:500px;gap:0}.ava-phone{width:218px!important;height:455px!important;border-radius:36px!important;padding:7px!important;background:#090b0f!important;border:1px solid #51545a!important;box-shadow:0 26px 55px rgba(32,14,20,.25),inset 0 0 0 1px rgba(255,255,255,.07)!important;transform:rotate(-3deg)!important}.ava-phone-secondary{transform:translate(-20px,22px) rotate(4deg)!important;z-index:1!important}.ava-phone-notch{top:8px!important;width:78px!important;height:20px!important}.ava-telegram-topbar{height:61px!important;border-radius:30px 30px 0 0!important;background:#17212b!important;grid-template-columns:18px 30px 1fr 38px!important;gap:6px!important;padding:15px 9px 7px!important;align-items:center!important}.ava-avatar{width:29px!important;height:29px!important;background:linear-gradient(135deg,#b55c79,#6f102d)!important}.ava-chat-name strong{font-size:11px}.ava-chat-name small{font-size:7px!important;color:#5fc38b!important}.ava-tg-actions{font-size:10px;color:#d5e1e8;letter-spacing:2px}.ava-chat{height:344px!important;background:#0e1621!important;padding:8px!important;gap:6px!important;background-image:radial-gradient(circle at 20% 25%,rgba(34,158,217,.035),transparent 28%),radial-gradient(circle at 80% 75%,rgba(34,158,217,.028),transparent 24%)!important}.ava-bubble{font-size:9.3px!important;padding:7px 8px!important;border-radius:10px!important;box-shadow:0 1px 0 rgba(0,0,0,.2)}.ava-bubble.them{background:#182533!important}.ava-bubble.me{background:#2b5278!important}.ava-content-card{height:104px!important;border-radius:10px!important}.ava-content-card.compact{height:88px!important}.ava-unlock{font-size:9px!important;padding:7px 10px!important;background:#8c2146!important}.ava-message-bar{height:39px!important;border-radius:0 0 28px 28px!important;background:#17212b!important;padding:9px 10px!important;font-size:9px!important}.ava-home-indicator{position:absolute;bottom:4px;left:50%;width:72px;height:3px;border-radius:99px;background:#e7e7e7;transform:translateX(-50%);opacity:.75}.ava-script-note{right:1%!important;top:15%!important;font-size:22px!important}.ava-orb.one{width:330px!important;height:330px!important}.ava-orb.two{width:280px!important;height:280px!important}
        .ava-dashboard-shell{display:grid;grid-template-columns:150px 1fr;width:100%;min-height:470px;border:1px solid #d9dde5;border-radius:18px;overflow:hidden;background:#f7f9fc;box-shadow:0 30px 70px rgba(10,20,35,.26),0 0 0 8px #11151b}.ava-real-sidebar{background:linear-gradient(180deg,#67152f,#3b0d1c);color:#fff;padding:20px 12px;display:flex;flex-direction:column;gap:5px}.ava-real-logo{font-family:Georgia,'Times New Roman',serif;font-style:italic;font-size:27px;margin:0 8px 14px}.ava-core-dot{display:flex;align-items:center;gap:6px;margin:0 4px 12px;padding:8px;border:1px solid rgba(125,211,252,.2);border-radius:10px;color:#7dd3fc;font-size:9px}.ava-core-dot span{color:#fff;font-size:8px}.ava-real-sidebar>span{padding:8px 10px;border-radius:8px;font-size:9px;color:#eadce1}.ava-real-sidebar>span.active{background:#8a2848;color:#fff}.ava-real-main{padding:18px;background:#f6f8fb;color:#202733}.ava-real-topbar{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #e2e6ed;padding-bottom:12px}.ava-real-topbar small,.ava-real-topbar b{display:block}.ava-real-topbar small{font-size:9px;color:#687386;margin-bottom:3px}.ava-real-topbar b{font-size:18px}.ava-real-controls{display:flex;gap:6px;align-items:center}.ava-real-controls span{font-size:8px;background:#fff;border:1px solid #e2e6ed;padding:6px 8px;border-radius:8px;color:#6b7482}.ava-periods{display:flex;gap:5px;align-items:center;padding:12px 0}.ava-periods span{font-size:8px;padding:5px 7px;border-radius:7px;color:#667085;background:#fff;border:1px solid #e3e7ee}.ava-periods span.active{background:#24364d;color:#fff}.ava-hero-kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:9px}.ava-hero-kpis article,.ava-real-stats article,.ava-real-chart-card{background:#fff;border:1px solid #e1e5ec;border-radius:12px;box-shadow:0 4px 12px rgba(27,39,55,.035)}.ava-hero-kpis article{padding:12px}.ava-hero-kpis small,.ava-real-stats small{display:block;font-size:8px;color:#7b8492}.ava-hero-kpis strong{display:block;font-size:18px;margin:4px 0;color:#1f2937}.ava-hero-kpis em{font-style:normal;font-size:8px;color:#2f9d69}.ava-real-chart-card{margin-top:9px;padding:12px}.ava-chart-head{display:flex;justify-content:space-between;align-items:flex-end}.ava-chart-head span{font-size:9px;color:#687386}.ava-chart-head b{font-size:14px}.ava-chart-head em{font-style:normal;font-size:8px;color:#7a8490;font-weight:500}.ava-real-bars{height:170px;display:flex;align-items:flex-end;gap:4px;border-bottom:1px solid #dce1e8;background:repeating-linear-gradient(to top,#fff 0,#fff 41px,#eef1f5 42px)}.ava-real-bars i{flex:1;max-width:12px;background:#8d2146;border-radius:3px 3px 0 0;min-height:10px}.ava-axis{display:flex;justify-content:space-between;padding-top:6px;color:#8a93a0;font-size:7px}.ava-real-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:9px}.ava-real-stats article{padding:10px}.ava-real-stats strong{display:block;font-size:15px;margin:3px 0}.ava-real-stats span{font-size:7px;color:#2f9d69}
        @media(max-width:760px){.ava-hero-visual{min-height:455px!important;margin-top:12px!important}.ava-phone{width:184px!important;height:388px!important;border-radius:31px!important}.ava-phone-secondary{transform:translate(-24px,22px) rotate(4deg)!important}.ava-telegram-topbar{height:54px!important}.ava-chat{height:292px!important}.ava-message-bar{height:34px!important}.ava-content-card{height:82px!important}.ava-content-card.compact{height:70px!important}.ava-script-note{display:none!important}.ava-dashboard-shell{grid-template-columns:88px 1fr;min-height:350px;border-radius:12px;box-shadow:0 18px 42px rgba(0,0,0,.28),0 0 0 5px #11151b}.ava-real-sidebar{padding:10px 6px}.ava-real-logo{font-size:18px;margin:0 5px 8px}.ava-core-dot{display:none}.ava-real-sidebar>span{font-size:6px;padding:6px}.ava-real-main{padding:9px}.ava-real-topbar b{font-size:12px}.ava-real-controls span:first-child{display:none}.ava-real-controls span{font-size:6px;padding:4px}.ava-periods{padding:8px 0;gap:2px;overflow:hidden}.ava-periods span{font-size:5.5px;padding:3px 4px}.ava-hero-kpis{gap:4px}.ava-hero-kpis article{padding:6px}.ava-hero-kpis small,.ava-real-stats small{font-size:5.5px}.ava-hero-kpis strong{font-size:10px}.ava-hero-kpis em{font-size:5px}.ava-real-chart-card{padding:7px}.ava-chart-head b{font-size:9px}.ava-real-bars{height:110px;gap:2px}.ava-axis{font-size:5px}.ava-real-stats{gap:4px}.ava-real-stats article{padding:6px}.ava-real-stats strong{font-size:9px}.ava-real-stats span{font-size:5px}}
      `}</style>
      <header className="ava-header"><a className="ava-wordmark" href="#top">Ava</a><nav><a href="#top">Home</a><a href="#how">How It Works</a><a href="#features">Features</a><a href="#results">Results</a><a href="#faq">FAQ</a></nav><button type="button" className="ava-button solid">Get Started <span>→</span></button></header>
      <section id="top" className="ava-hero">
        <div className="ava-hero-copy"><div className="ava-eyebrow">AI clones for real creators</div><h1>Your Fans.<br/>Your Rules.<br/><em>More Revenue.</em></h1><p>Ava builds AI clones for creators that chat, sell content and grow your income 24/7 on Telegram.</p><div className="ava-hero-actions"><button type="button" className="ava-button solid">Get Started <span>→</span></button><button type="button" className="ava-button ghost">Book a Call</button></div><div className="ava-trust"><div className="ava-face-stack">{['A','V','A','A','V'].map((x,i)=><i key={i}>{x}</i>)}</div><div><div className="ava-stars">★★★★★ <b>5.0</b></div><small>Trusted by top creators</small></div></div></div>
        <div className="ava-hero-visual"><div className="ava-orb one"/><div className="ava-orb two"/><TelegramPhone /><TelegramPhone secondary /><div className="ava-script-note">Same girls.<br/>More opportunities. ♡</div></div>
      </section>
      <section className="ava-metrics" id="results">{metrics.map(([value,label])=><div key={label}><strong>{value}</strong><span>{label}</span></div>)}</section>
      <section id="how" className="ava-product-section"><div className="ava-product-copy"><div className="ava-eyebrow light">Creator growth platform</div><h2>Everything You Need<br/>to Scale as a Creator.</h2><p>Ava handles the conversations, sells your content and builds real relationships with your fans, so you can focus on creating.</p><ul><li>Autonomous AI chat on Telegram</li><li>Sells photos, videos, bundles and customs</li><li>Learns your style, tone and personality</li><li>24/7 operation with full analytics</li><li>Fully managed setup and support</li></ul><button type="button" className="ava-button cream">Get Started <span>→</span></button></div><DashboardMockup /></section>
      <section className="ava-features" id="features">{features.map(([icon,title,copy])=><article key={title}><i>{icon}</i><h3>{title}</h3><p>{copy}</p></article>)}</section>
      <section className="ava-testimonial"><div className="ava-portrait ava-left-portrait"><span>A</span></div><div className="ava-testimonial-copy"><div className="ava-eyebrow">Trusted by top creators</div><blockquote>“Ava feels like another me, talking to my fans 24/7.”</blockquote><div className="ava-stars centered">★★★★★</div><small>Demo creator testimonial</small></div><div className="ava-portrait ava-right-portrait"><span>V</span></div></section>
      <section className="ava-final-cta"><div className="ava-eyebrow light">Same girls. Bigger opportunities.</div><h2>Ready to Scale with Ava?</h2><button type="button" className="ava-button cream">Get Started <span>→</span></button></section>
      <footer className="ava-footer"><a className="ava-wordmark" href="#top">Ava</a><nav><a href="#how">How It Works</a><a href="#features">Features</a><a href="#results">Results</a><a href="#faq">FAQ</a></nav><small>© 2026 Ava. Front-end preview.</small></footer><div id="faq" className="ava-faq-anchor" />
    </main>
  );
}
