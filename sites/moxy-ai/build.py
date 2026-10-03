from pathlib import Path
from html import escape
import shutil
ROOT=Path(__file__).parent
ORIGIN='https://lynqai.co'
BRAND_ASSET_VERSION='moxy-logo-20261002'
descriptions={
 'index.html':'Your personality. Your content. A new way to connect with your fans on Telegram. Meet your AI with Moxy.',
 'how-it-works.html':'See how Moxy creates an AI version of you on Telegram, shaped around your personality, tone and chosen content.',
 'earnings.html':'Explore your earning potential with Moxy AI and discover new ways to connect with fans on Telegram.',
 'get-started.html':'Use your Moxy invitation to create your account and start building your own AI on Telegram.',
}
links=[('index.html','Home'),('how-it-works.html','How it works'),('earnings.html','Earnings')]
def page(file,title,body,cls=''):
 if file=='index.html':
  how_home=(ROOT/'how-content.html').read_text()
  how_home=how_home.replace('<main id="main" class="how-main">','<section id="how-it-works" class="how-main" aria-labelledby="how-title">',1)
  how_home=how_home.rsplit('</main>',1)[0]+'</section>'
  how_home=how_home.replace('<h1','<h2',1).replace('</h1>','</h2>',1)
  earnings_home=(ROOT/'earnings-content.html').read_text()
  earnings_home=earnings_home.replace('<main id="main" class="moxy-earnings">','<section id="earnings" class="moxy-earnings" aria-labelledby="earnings-title">',1)
  earnings_home=earnings_home.rsplit('</main>',1)[0]+'</section>'
  earnings_home=earnings_home.replace('<h1','<h2',1).replace('</h1>','</h2>',1)
  body=body.replace('<main id="main" class="home-main">','<main id="main" class="home-flow"><div class="home-main">',1)
  body=body.rsplit('</main>',1)[0]+'</div>'+how_home+(ROOT/'monetization-content.html').read_text()+earnings_home+(ROOT/'launch-content.html').read_text()+(ROOT/'faq-content.html').read_text()+'</main>'
 if file=='how-it-works.html':
  body=body.replace('<main id="main" class="how-main">','<main id="main" class="how-flow"><div class="how-main">',1)
  body=body.rsplit('</main>',1)[0]+'</div>'+(ROOT/'monetization-content.html').read_text()+(ROOT/'launch-content.html').read_text()+(ROOT/'faq-content.html').read_text()+'</main>'
 nav=''.join(f'<a href="{p}"'+(' aria-current="page"' if file==p else '')+f'>{label}</a>' for p,label in links)
 footer='' if file in ('index.html','how-it-works.html') else '<footer class="footer"><span>© 2026 Moxy AI</span><span class="footer-center">Your world. A new way to connect.</span><a href="mailto:creators@moxymgt.com">Contact Moxy</a></footer>'
 canonical=ORIGIN+('/' if file=='index.html' else '/'+file)
 page_title=escape(f'{title} | Moxy AI',quote=True)
 description=escape(descriptions[file],quote=True)
 preview=f'{ORIGIN}/assets/moxy-link-preview.png?v={BRAND_ASSET_VERSION}'
 html=f'''<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="theme-color" content="#087d72">
<meta name="application-name" content="Moxy AI">
<meta name="apple-mobile-web-app-title" content="Moxy AI">
<title>{page_title}</title>
<meta name="description" content="{description}">
<link rel="canonical" href="{canonical}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Moxy AI">
<meta property="og:title" content="{page_title}">
<meta property="og:description" content="{description}">
<meta property="og:url" content="{canonical}">
<meta property="og:image" content="{preview}">
<meta property="og:image:type" content="image/png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Moxy, Los Angeles and Miami. White logo on black.">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{page_title}">
<meta name="twitter:description" content="{description}">
<meta name="twitter:image" content="{preview}">
<meta name="twitter:image:alt" content="Moxy, Los Angeles and Miami. White logo on black.">
<link rel="icon" type="image/svg+xml" href="/favicon.svg?v={BRAND_ASSET_VERSION}">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png?v={BRAND_ASSET_VERSION}">
<link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png?v={BRAND_ASSET_VERSION}">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png?v={BRAND_ASSET_VERSION}">
<link rel="manifest" href="/site.webmanifest?v={BRAND_ASSET_VERSION}">
<link rel="stylesheet" href="styles.css"><link rel="stylesheet" href="ending.css"><script src="app.js" defer></script></head>
<body class="{cls}"><a class="skip-link" href="#main">Skip to content</a>
<header class="header"><a class="brand" href="index.html" aria-label="Moxy AI home"><img src="assets/moxy-ai.svg" width="1176" height="447" alt="Moxy AI, Los Angeles and Miami"></a><nav class="desktop-nav" aria-label="Main navigation">{nav}</nav><div class="header-actions"><a class="login" href="https://dashboard.lynqai.co/creator/moxy/login">Log in</a><a class="button small" href="get-started.html">Get started</a><button class="menu-button" aria-expanded="false" aria-controls="mobile-nav" aria-label="Open navigation"><span></span><span></span></button></div><nav id="mobile-nav" class="mobile-nav" aria-label="Mobile navigation" hidden>{nav}<a href="https://dashboard.lynqai.co/creator/moxy/login">Creator login</a></nav></header>
{body}
{footer}
</body></html>'''
 if file=='how-it-works.html':
  html=html.replace('<script src="app.js" defer>', '<link rel="stylesheet" href="how.css"><script src="how.js" defer></script><script src="app.js" defer>')
 if file=='earnings.html':
  html=html.replace('<script src="app.js" defer>', '<link rel="stylesheet" href="earnings.css"><script src="earnings-model.js" defer></script><script src="earnings.js" defer></script><script src="app.js" defer>')
 if file in ('index.html','how-it-works.html'):
  html=html.replace('</head>','<link rel="stylesheet" href="monetization.css"><script src="monetization.js" defer></script></head>')
 (ROOT/file).write_text(html)
 if file=='index.html':
  html=html.replace('<script src="app.js" defer>', '<link rel="stylesheet" href="how.css"><link rel="stylesheet" href="earnings.css"><link rel="stylesheet" href="home.css"><script src="how.js" defer></script><script src="earnings-model.js" defer></script><script src="earnings.js" defer></script><script src="app.js" defer>')
  (ROOT/file).write_text(html.replace('href="how-it-works.html"','href="#how-it-works"').replace('href="earnings.html"','href="#earnings"'))
page('index.html','Meet your AI.','''<main id="main" class="home-main">
<section class="moxy-opening" aria-labelledby="hero-title">
  <div class="opening-copy">
    <h1 id="hero-title">Meet<br>your <em>AI.</em></h1>
    <p class="opening-lead">Your personality. Your content.<br>A new way to connect with your fans.</p>
    <p class="opening-description">We build an AI version of you on Telegram that fans can talk to 24/7, shaped around your personality, tone and the way you speak. It remembers past conversations and naturally introduces your chosen content, making the connection more personal over time.</p>
    <div class="opening-actions"><a class="button" href="get-started.html">Create your AI</a><a class="opening-link" href="how-it-works.html">See how it works</a></div>
  </div>
  <figure class="opening-visual">
    <div class="opening-light" aria-hidden="true"></div>
    <img class="opening-portrait" src="assets/moxy-opening-portrait.webp" width="1086" height="1448" alt="Creator holding her phone" fetchpriority="high" decoding="async">
  </figure>
</section>
</main>''','home')
page('how-it-works.html','How it works',(ROOT/'how-content.html').read_text(),cls='how-page')
page('earnings.html','Earning potential',(ROOT/'earnings-content.html').read_text(),cls='earnings-page')
page('get-started.html','Get started','''<main id="main" class="inner-main start-main"><section class="start-intro"><p class="eyebrow">YOUR NEXT CHAPTER</p><h1>Let’s create<br><span class="muted">your AI.</span></h1><p class="lead">Start with your Moxy invitation.<br>We’ll take it from there.</p><ol class="onboarding-steps"><li><span>01</span><div><h2>Create your account</h2><p>Use your Moxy invitation to join the right team.</p></div></li><li><span>02</span><div><h2>Make it yours</h2><p>Add your profile, personality and selected content.</p></div></li><li><span>03</span><div><h2>Get ready to launch</h2><p>Review your setup with Moxy before going live.</p></div></li></ol></section><section class="invitation-panel"><p class="eyebrow">WELCOME TO MOXY AI</p><h2>Your invitation.<br>Your first step.</h2><p>If Moxy sent you an invitation code or signup link, enter it below to create your creator account.</p><form id="invite-form"><label for="invite-code">Invitation code or link</label><input id="invite-code" name="invitation" type="text" placeholder="Paste your Moxy invitation" autocomplete="off" spellcheck="false" required aria-describedby="invite-error"><p id="invite-error" role="alert" class="form-error" hidden></p><button class="button" type="submit">Continue to signup</button></form><div class="invite-divider"></div><p class="invitation-help">Don’t have an invitation yet?</p><a class="text-link" href="mailto:creators@moxymgt.com?subject=Moxy%20AI%20creator%20invitation&body=Hi%20Moxy%2C%0A%0AI%E2%80%99m%20interested%20in%20creating%20my%20AI.%20Could%20you%20send%20me%20an%20invitation%20and%20the%20next%20steps%3F%0A%0AMy%20creator%20profile%3A%20">Request an invitation</a><p class="existing-account">Already set up? <a href="https://dashboard.lynqai.co/creator/moxy/login">Log in</a></p></section></main>''')

# Keep shared-link metadata and its assets together in every static build.
dist=ROOT/'dist'
dist.mkdir(exist_ok=True)
static_names=['index.html','how-it-works.html','earnings.html','get-started.html',
              'og.png','favicon.svg','favicon.ico','favicon-32.png',
              'apple-touch-icon.png','icon-192.png','icon-512.png','site.webmanifest']
static_names += [p.name for p in ROOT.glob('*.css')] + [p.name for p in ROOT.glob('*.js')]
for name in static_names:
 shutil.copy2(ROOT/name,dist/name)
shutil.copytree(ROOT/'assets',dist/'assets',dirs_exist_ok=True)
