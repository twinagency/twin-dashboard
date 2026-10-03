# Moxy AI

A compact, four-page creator website for Moxy. Static HTML, CSS and JavaScript, published at https://lynqai.co/. This GitHub repository contains the editable website source.

## Pages

- Home: Moxy brand introduction and a compact Telegram phone demonstration.
- How it works: accessible Chat / Remember / Earn tabs, illustrative phone conversation, FAQ.
- Earnings: compact calculator with three stacked sliders for social followers, monthly platform income and total platform subscribers (free and paid) (OnlyFans, Fanvue or Fansly). It shows one illustrative USD monthly gross revenue estimate.
- Get started: accepts an existing creator invitation code or approved dashboard signup URL; creator login and a Moxy invitation request link.

## Editing

The working calculator is embedded at the bottom of the homepage after How it works, with desktop and mobile Earnings navigation linking to `#earnings`. The standalone earnings page is preserved. Both views share the same template, styles and calculation scripts. The earnings page is maintained in `earnings-content.html`, `earnings.css`, `earnings-model.js` and `earnings.js`, independently of homepage changes. The calculator models the larger of social followers × 3% or total platform subscribers × 15%, then applies a 10% payer assumption and US$50 monthly spending per payer. These optimistic planning assumptions were selected to show US$15,000 for 100,000 social followers, as requested; they are not measured averages or verified benchmarks. The previous 3× multiplier is removed. The result says “Estimated monthly AI revenue” and “This is an estimate only.” Audiences are never added together. Existing income is used only for the comparison below the result. No scenario selectors or multi-step navigation; the assumptions are available in one collapsed disclosure.

`build.py` produces the four HTML pages. Edit the templates then run `python3 build.py`. Shared styling and interactions are in `styles.css` and `app.js`; homepage styling is in `home.css`. Copy the generated pages, stylesheets, script and assets into `dist`, the public directory declared in `.openai/hosting.json`. No build dependencies are required.

## Dashboard source

The Moxy agency and creator dashboard lives in `jesse98/twin-dashboard`. Moxy login: https://dashboard.lynqai.co/creator/moxy/login. Website changes belong in this repository; dashboard, invitations, accounts and onboarding changes belong in `twin-dashboard`.

## Integration notes

Public creator login is `/creator/moxy/login` on the existing dashboard. Signup requires a valid Moxy agency invitation to preserve attribution. The site does not create accounts itself, issue invitations, store form input, or send emails. The request-invitation link opens the creator's mail app. Invitation validity and agency association are checked by the dashboard.

The calculator uses audience × monthly join rate × payer rate × USD spend per paying fan. It models gross fan spending, not creator take-home pay. No earnings guarantees or unverified performance claims.

## Assets

Logo: supplied Moxy AI SVG from the developer pack, used intact with teal AI and city lettering. The opening does not use a creator photograph. Satoshi is loaded from Fontshare with a system sans-serif fallback. Demo conversations are scripted and labelled.

Opening direction: light/bold sans-serif “Your personality. Your AI.” headline beside a compact 232px Telegram phone, with broad white ambient glow against black. The phone is 214px wide on mobile beneath centred copy. All demonstration messages stay inside the Telegram interface; no portrait, surrounding panel or floating message boxes. The existing Ali AI phone remains in How it works. The existing calculator remains embedded below. This iteration changes only the opening and its header styling; later sections retain their existing design. Em dashes are excluded from site copy.
