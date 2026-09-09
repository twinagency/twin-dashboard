"use client";

import { useRef, useState } from "react";
import { ArrowRight, ArrowUpRight, Check, CheckCheck, ChevronDown, Image as ImageIcon, LockKeyhole, Menu, MessageCircle, Mic, Send, ShieldCheck, SlidersHorizontal, Sparkles, X } from "lucide-react";
import s from "./site.module.css";

type PreviewMode = "chat" | "content" | "voice";
const faq = [
  ["What is an AI twin?", "An AI-powered version of your conversational style. Your Twin can chat with fans on Telegram, respond using the personality you define, and offer the content you choose to make available."],
  ["Do I need to clone my voice?", "No. Start with text conversations and your content. Voice is an optional extra, using a voice clone you have authorised."],
  ["What can my Twin sell?", "Paid messages, photos, videos and content bundles. You decide what content is available and how it is priced. Revenue depends on your audience, engagement and offer; earnings are not guaranteed."],
  ["How much control do I have?", "You choose your Twin's personality, boundaries, media and pricing. The creator tools let you review conversations, pause the AI and take over when you need to."],
  ["What if I work with an agency?", "The next phase will support a private agency invitation during creator signup. You will not need to create an agency account. Agency-linked signup is not connected in this website preview."],
  ["Can I create an account on this preview?", "Not yet. This is the first stage of the new Twin Agency site. Creator signup, login and onboarding are being kept separate for the next phase. The existing TwinAgency.co site is unchanged."],
];
const bars = [13, 22, 34, 18, 42, 29, 50, 36, 21, 46, 56, 31, 19, 43, 28, 51, 37, 23, 46, 32, 16, 28, 38, 20];

function Waveform({ small = false }: { small?: boolean }) {
  return <span className={`${s.waveform} ${small ? s.waveSmall : ""}`} aria-hidden="true">{bars.map((height, index) => <i key={index} style={{ height, animationDelay: `${index * -0.07}s` }} />)}</span>;
}

function Brand({ light = false }: { light?: boolean }) {
  return <a href="#top" className={`${s.brand} ${light ? s.brandLight : ""}`} aria-label="Twin Agency home">Twin<span>.</span><small>Agency</small></a>;
}

export default function MarketingSite() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [mode, setMode] = useState<PreviewMode>("chat");
  const [unlocked, setUnlocked] = useState(false);
  const [dashboardTab, setDashboardTab] = useState("Overview");
  const [control, setControl] = useState([true, false, true]);
  const [dialogKind, setDialogKind] = useState<"signup" | "login">("signup");
  const dialog = useRef<HTMLDialogElement>(null);
  const openAccount = (kind: "signup" | "login") => { setMenuOpen(false); setDialogKind(kind); dialog.current?.showModal(); };
  const selectMode = (next: PreviewMode) => { setMode(next); setUnlocked(false); };
  const nav = [["The product", "product"], ["How it works", "how-it-works"], ["Your control", "control"], ["FAQs", "faqs"]];

  return <div className={s.site} id="top">
    <a href="#main" className={s.skip}>Skip to content</a>
    <div className={s.previewBar}><span>Website preview</span><p>Creator signup and login are not connected yet.</p></div>
    <main id="main"><header className={s.hero}>
      <nav className={s.nav} aria-label="Main navigation">
        <Brand light />
        <div className={s.desktopLinks}>{nav.map(([label, id]) => <a key={id} href={`#${id}`}>{label}</a>)}</div>
        <div className={s.navActions}><button className={s.login} onClick={() => openAccount("login")}>Log in</button><button className={s.navSignup} onClick={() => openAccount("signup")}>Sign up <ArrowUpRight size={15} /></button><button className={s.menuButton} onClick={() => setMenuOpen(!menuOpen)} aria-expanded={menuOpen} aria-controls="mobile-navigation" aria-label={menuOpen ? "Close menu" : "Open menu"}>{menuOpen ? <X /> : <Menu />}</button></div>
      </nav>
      {menuOpen && <div id="mobile-navigation" className={s.mobileLinks}>{nav.map(([label, id]) => <a key={id} href={`#${id}`} onClick={() => setMenuOpen(false)}>{label}<ArrowUpRight size={16} /></a>)}<button onClick={() => openAccount("login")}>Creator log in <ArrowRight size={16} /></button></div>}
      <div className={s.heroGlow} aria-hidden="true" />
      <div className={s.heroContent}>
        <div className={s.eyebrowLight}><span /> Your audience. Your AI twin.</div>
        <h1>Let your <em>AI twin</em><br />handle the<br className={s.mobileBreak} /> <span className={s.heroUnderline}>conversations.</span></h1>
        <p className={s.heroDescription}>Your personality. Your content. More time for you.<br />Keep your fans engaged on Telegram with an AI twin built around you.</p>
        <div className={s.heroActions}><button className={s.buttonWhite} onClick={() => openAccount("signup")}>Create your Twin <ArrowUpRight size={18} /></button><a className={s.heroSecondary} href="#product">See how it works <ArrowRight size={17} /></a></div>
        <div className={s.heroChecks}><span><Check size={15} /> Creator controlled</span><span><Check size={15} /> Voice optional</span><span><Check size={15} /> Built for Telegram</span></div>
      </div>
      <div className={s.heroBottom} aria-hidden="true"><span>More connection.</span><div className={s.orbit}><i /><b /></div><span>Less screen time.</span></div>
    </header>

    <div className={s.featureStrip} aria-label="Twin capabilities">{["Personalised conversations", "Paid photos & videos", "Optional voice replies", "Fan memory", "Your rules"].map(text => <span key={text}><Sparkles size={13} />{text}</span>)}</div>

    <section id="product" className={`${s.section} ${s.product}`} aria-labelledby="product-title">
      <div className={s.productCopy}><div className={s.eyebrow}>An extension of you</div><h2 id="product-title">There’s only one <br />of you.<br /><span>Until now.</span></h2><p>You can’t be in every conversation. Your Twin can help you keep them going, with the personality, content and boundaries you choose.</p><div className={s.productPoints}><span><MessageCircle size={18} /> Personal conversations, at scale</span><span><ImageIcon size={18} /> Your content, offered in the chat</span><span><ShieldCheck size={18} /> Always your voice and your rules</span></div></div>
      <div className={s.demoStage}>
        <div className={s.demoTabs} aria-label="Choose a product preview">{([["chat", "Conversations", MessageCircle], ["content", "Paid content", LockKeyhole], ["voice", "Voice", Mic]] as const).map(([key, label, Icon]) => <button key={key} onClick={() => selectMode(key)} aria-pressed={mode === key} className={mode === key ? s.activeTab : ""}><Icon size={15} />{label}</button>)}</div>
        <div className={s.phone}>
          <div className={s.phoneHeader}><div className={s.avatar}>T<span /></div><div><strong>Your Twin</strong><small>Your AI conversation partner</small></div><span className={s.aiBadge}>AI</span></div>
          <div className={s.chatArea} key={mode}>
            <span className={s.chatDate}>Example conversation</span>
            {mode === "chat" && <><div className={s.bubbleFan}>How did your beach day go?<small>10:24</small></div><div className={s.bubbleTwin}>Finally got some sunshine! A coffee, a long walk, and absolutely no plans.<small>10:24 <CheckCheck size={12} /></small></div><div className={s.bubbleFan}>That sounds like my kind of day.<small>10:25</small></div><div className={s.bubbleTwin}>Right? Did you get outside, or was it another busy one?<small>10:25 <CheckCheck size={12} /></small></div><div className={s.contextPill}><Sparkles size={14} /> A conversation that keeps its context</div></>}
            {mode === "content" && <><div className={s.bubbleFan}>Do you have any new photos?<small>10:24</small></div><div className={s.bubbleTwin}>I have a new set ready. Here’s a little preview.<small>10:24 <CheckCheck size={12} /></small></div><div className={`${s.lockedCard} ${unlocked ? s.unlockedCard : ""}`}><div className={s.contentArt} aria-hidden="true"><span /><i /><b /></div><div className={s.lockedOverlay}>{unlocked ? <Check size={24} /> : <LockKeyhole size={24} />}<strong>{unlocked ? "Example unlocked" : "Your exclusive photo set"}</strong><span>{unlocked ? "Demo only. No payment was taken." : "Creator-owned content. Your pricing."}</span><button onClick={() => setUnlocked(!unlocked)}>{unlocked ? "Reset preview" : "Preview the unlock"}<ArrowRight size={14} /></button></div></div></>}
            {mode === "voice" && <><div className={s.bubbleFan}>A voice note would make my day.<small>10:24</small></div><div className={s.bubbleTwin}>A little more personal.<small>10:24 <CheckCheck size={12} /></small></div><div className={s.voiceMessage}><Mic size={21} /><Waveform small /><span>Voice note<br /><small>Visual example</small></span></div><div className={s.voiceNote}>An optional voice clone, authorised by you. Start with text and content, then add your voice when you’re ready.</div></>}
          </div>
          <div className={s.phoneComposer} aria-hidden="true"><span>Message your Twin…</span><Send size={17} /></div>
        </div>
        <p className={s.demoCaption}>Interactive product preview. Not a live chat or payment.</p>
      </div>
    </section>

    <section className={s.features} aria-labelledby="features-title"><div className={s.sectionHead}><div><div className={s.eyebrow}>Built around your world</div><h2 id="features-title">More than a chatbot.<br />A little more <span>you.</span></h2></div><p>Let your Twin look after the conversations while you focus on the things that make you worth following.</p></div><div className={s.featureGrid}>
      <article className={s.featureCard}><div className={s.visualConversation} aria-hidden="true"><span>Remembers the little things.</span><span>Replies in your style.</span><span>Keeps the conversation going.</span></div><span className={s.cardNumber}>01 / Connection</span><h3>Fans feel remembered.</h3><p>Give conversations continuity with fan memory and a personality shaped around how you actually communicate.</p></article>
      <article className={s.featureCard}><div className={s.visualMedia} aria-hidden="true"><div><ImageIcon size={27} /><span>Photos</span></div><div><LockKeyhole size={27} /><span>Videos</span></div><div><Sparkles size={27} /><span>Bundles</span></div></div><span className={s.cardNumber}>02 / Content</span><h3>Make your content go further.</h3><p>Offer the photos, videos and bundles you already create, right where the conversation is happening.</p></article>
      <article className={s.featureCard}><div className={s.visualVoice} aria-hidden="true"><Waveform /><span>Your voice. Another way to connect.</span></div><span className={s.cardNumber}>03 / Personality</span><h3>Sound more like yourself.</h3><p>Set your tone and boundaries. Add authorised voice replies when you’re ready, without making voice a requirement.</p></article>
    </div></section>

    <section id="how-it-works" className={`${s.section} ${s.stepsSection}`} aria-labelledby="steps-title"><div className={s.sectionHead}><div><div className={s.eyebrow}>The process</div><h2 id="steps-title">From you.<br />To your <span>Twin.</span></h2></div><p>A familiar experience for your fans.<br />A new way to run your creator business.</p></div><div className={s.steps}>{[["01", "Make it yours", "Shape its personality, set your boundaries and decide how you want it to talk."], ["02", "Add your content", "Choose the photos, videos and bundles it can offer. Set your own prices."], ["03", "Share your link", "Invite your fans to chat on Telegram. Review activity and stay in control."]].map(([number, title, body]) => <article key={number}><span>{number}</span><h3>{title}</h3><p>{body}</p></article>)}</div></section>

    <section className={s.dashboardSection} aria-labelledby="dashboard-title"><div className={s.dashboardHead}><div className={s.eyebrowLight}><span /> One connected platform</div><h2 id="dashboard-title">Your creator business.<br /><span>All in one place.</span></h2><p>Conversations, content and earnings. A clear view of your Twin,<br className={s.desktopBreak} /> without jumping between tools.</p></div>
      <div className={s.dashboardMock}>
        <aside className={s.mockSidebar} aria-label="Illustrative dashboard views"><span className={s.mockBrand}>Twin.</span><div className={s.mockIdentity}><div className={s.miniOrb} /><span>Your Twin<small>Creator workspace</small></span></div>{["Overview", "Content", "Conversations"].map(tab => <button className={dashboardTab === tab ? s.mockActive : ""} key={tab} aria-pressed={dashboardTab === tab} onClick={() => setDashboardTab(tab)}>{tab === "Overview" ? <SlidersHorizontal size={15} /> : tab === "Content" ? <ImageIcon size={15} /> : <MessageCircle size={15} />}{tab}</button>)}<div className={s.mockSidebarBottom}><ShieldCheck size={15} /> Your creator space</div></aside>
        <div className={s.mockMain}><div className={s.mockTop}><span>{dashboardTab}</span><span className={s.sampleTag}>Illustrative dashboard</span></div>
          {dashboardTab === "Overview" ? <><div className={s.mockGreeting}><h3>A little clarity.<br />A lot more control.</h3><span>Sample view</span></div><div className={s.mockStats}><div><MessageCircle size={18} /><small>Conversations</small><strong>Your fans, connected</strong></div><div><ImageIcon size={18} /><small>Content library</small><strong>Your media, organised</strong></div><div><ShieldCheck size={18} /><small>Creator controls</small><strong>Your rules, in place</strong></div></div><div className={s.mockChart}><div><strong>Earnings overview</strong><span>Illustrative chart, not live revenue</span></div><svg viewBox="0 0 620 150" role="img" aria-label="Illustrative earnings trend, not actual results"><defs><linearGradient id="twin-chart-fill" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#39bca0" stopOpacity=".22" /><stop offset="1" stopColor="#39bca0" stopOpacity="0" /></linearGradient></defs><path className={s.chartGrid} d="M0 35H620M0 80H620M0 125H620" /><path fill="url(#twin-chart-fill)" d="M0 125C30 125 30 105 62 105S100 118 130 91S171 100 206 74S249 101 280 79S320 96 352 61S390 84 421 52S462 61 488 34S530 58 557 30S600 35 620 9V150H0Z" /><path fill="none" stroke="#198a70" strokeWidth="3" d="M0 125C30 125 30 105 62 105S100 118 130 91S171 100 206 74S249 101 280 79S320 96 352 61S390 84 421 52S462 61 488 34S530 58 557 30S600 35 620 9" /></svg><div className={s.chartLegend}><span>Messages</span><span>Photos & videos</span><span>Bundles</span></div></div></> : dashboardTab === "Content" ? <div className={s.mockAlternative}><h3>One library. More possibilities.</h3><p>Preview how your content can be organised.</p><div className={s.mockContentGrid}>{["Photo collection", "Video collection", "Content bundles"].map((label,i) => <div key={label}><span className={s.libraryArt} data-kind={i}><ImageIcon size={34} /></span><strong>{label}</strong><small>Example content</small></div>)}</div></div> : <div className={s.mockAlternative}><h3>Keep the conversation in view.</h3><p>A single place to review your fans’ chats.</p>{[["A", "Alex", "How was your day?"], ["J", "Jordan", "Are there any new photos?"], ["S", "Sam", "Thanks for the chat!"]].map(([initial,name,text]) => <div className={s.mockThread} key={name}><span>{initial}</span><div><strong>{name}</strong><p>{text}</p></div><small>Example</small></div>)}</div>}
        </div>
      </div><p className={s.dashboardCaption}>A visual preview of the creator experience. No live account data is shown.</p>
    </section>

    <section id="control" className={`${s.section} ${s.controlSection}`} aria-labelledby="control-title"><div><div className={s.eyebrow}>You’re in charge</div><h2 id="control-title">Your clone.<br /><span>Your rules.</span></h2><p>More support should never mean less control. You choose what your Twin knows, what it offers, and when to step in.</p><div className={s.controlAssurance}><ShieldCheck size={20} /><span>Your content and personality.<br /><strong>Not a one-size-fits-all bot.</strong></span></div></div><div className={s.controlCard}><div className={s.controlHeader}><SlidersHorizontal size={20} /><strong>Make it yours</strong><span>Demo</span></div>{[["Personalised conversations", "Keep your tone and style."], ["Optional voice replies", "Add your voice when you’re ready."], ["Paid content", "Choose your media and pricing."]].map(([title,description],index) => <div className={s.controlRow} key={title}><div><strong id={`control-label-${index}`}>{title}</strong><small>{description}</small></div><button type="button" role="switch" aria-checked={control[index]} aria-labelledby={`control-label-${index}`} className={`${s.toggle} ${control[index] ? s.toggleOn : ""}`} onClick={() => setControl(control.map((v,i) => i === index ? !v : v))}><span /></button></div>)}<div className={s.controlFoot}><LockKeyhole size={13} /> Example controls only. No live settings are changed.</div></div></section>

    <section className={s.revenueSection} aria-labelledby="revenue-title"><div className={s.eyebrow}>How it pays</div><h2 id="revenue-title">More ways to connect.<br /><span>More ways to earn.</span></h2><div className={s.revenueGrid}>{[["01", "Paid messages", "Give fans a direct way to keep the conversation going."], ["02", "Photos & videos", "Sell access to the exclusive content you choose to share."], ["03", "Content bundles", "Bring your content together into a more complete offer."]].map(([number,title,body]) => <article key={number}><span>{number}</span><h3>{title}</h3><p>{body}</p></article>)}</div><p className={s.earningsNote}>You choose the offer. Results depend on your audience, content and pricing.</p></section>

    <section id="faqs" className={`${s.section} ${s.faqSection}`} aria-labelledby="faq-title"><div><div className={s.eyebrow}>A few things to know</div><h2 id="faq-title">Good questions.<br /><span>Clear answers.</span></h2><p>Have something else on your mind?</p><a className={s.textLink} href="mailto:contact@twinagency.co">Talk to Twin <ArrowUpRight size={16} /></a></div><div className={s.faqList}>{faq.map(([question,answer]) => <details key={question}><summary>{question}<ChevronDown size={19} /></summary><p>{answer}</p></details>)}</div></section>

    <section className={s.finalCta} aria-labelledby="cta-title"><div className={s.eyebrowLight}><span /> Built for the creator behind the content</div><h2 id="cta-title">More you.<br /><em>Less screen time.</em></h2><p>Let your Twin keep the conversation going.</p><button className={s.buttonWhite} onClick={() => openAccount("signup")}>Create your Twin <ArrowUpRight size={18} /></button></section>
    </main><footer className={s.footer}><Brand /><span>AI for the creator economy.</span><a href="mailto:contact@twinagency.co">contact@twinagency.co <ArrowUpRight size={14} /></a><small>© 2026 Twin.</small></footer>

    <dialog ref={dialog} className={s.accountDialog} aria-labelledby="account-dialog-title" onClick={event => { if (event.target === dialog.current) dialog.current?.close(); }}><div><button className={s.dialogClose} onClick={() => dialog.current?.close()} aria-label="Close dialog" autoFocus><X size={21} /></button><span className={s.dialogIcon}><Sparkles size={24} /></span><div className={s.eyebrow}>Creator accounts · Phase two</div><h2 id="account-dialog-title">{dialogKind === "signup" ? "Your Twin starts here." : "Your creator space."}</h2><p>{dialogKind === "signup" ? "Creator signup and onboarding will be connected in the next phase. This preview does not create an account or collect personal details." : "Creator login will be connected in the next phase. The existing TwinAgency.co site and its accounts have not been changed."}</p><p className={s.dialogNote}>For now, explore the site and the interactive product previews.</p><button className={s.buttonBlue} onClick={() => dialog.current?.close()}>Back to the website <ArrowRight size={16} /></button><a href="mailto:contact@twinagency.co">Questions? Contact Twin <ArrowUpRight size={14} /></a></div></dialog>
  </div>;
}
