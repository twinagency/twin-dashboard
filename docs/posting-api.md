# Posting API (stories and channel posts)

`POST /api/admin/v1/posting/write`, bearer admin key, loopback or Tailscale only. Full field list is the comment block at the top of `app/api/admin/v1/posting/write/route.ts`. Read calls: `GET /posting/targets`, `/posting/media`, `/posting/recent`.

Every action takes `dryRun=true`: all live checks run, nothing is posted, nothing is audited.

## Stories: what Telegram allows

- The Bot API (`postStory`, version 10.3 checked 2026-10-26) takes the media, a plain caption and invisible clickable areas. It has no link sticker, no text layer, no button.
- `caption` is Telegram's own caption: small, plain text, not on the picture.
- `linkUrl` alone makes one INVISIBLE tappable area (70% x 8% near the bottom). Nothing is drawn.
- So a visible button has to be burned into the pixels. That is the `overlay` option. The tappable area is then shrunk to the exact rectangle of the drawn button.

## Story overlay (photos only)

```json
{
  "action": "story",
  "clone": "alanna",
  "mediaUrl": "https://...",
  "linkUrl": "https://t.me/AlannaBot/app",
  "overlay": {
    "caption": "new clips on my app",
    "button": "OPEN MY APP",
    "scrim": true
  },
  "dryRun": true,
  "previewImage": "both"
}
```

In multipart, send `overlay` as a JSON string.

| key | values (default) |
| --- | --- |
| `caption` | text, or `{text 1-120, position top/middle/bottom (bottom), size 24-120 (62), color (#FFFFFF), strokeColor (#000000), strokeWidth 0-12 (2), shadow (true)}` |
| `button` | label, or `{label 1-24, position (bottom), size 24-90 (50), background (#FFFFFF), textColor (#111111), shape pill/rounded/square (pill), arrow (true)}` |
| `scrim` | `true`, or `{position bottom/top (bottom), heightPct 10-80 (38), color (#000000), opacity 0.05-0.95 (0.6)}` |

- With defaults and "OPEN MY APP" the result matches the finished look: white pill about 500x120 at y 1670-1790, caption 40px above it, on a 1080x1920 canvas.
- A caption and a button in the same slot stack, caption above the button.
- Colours are `#RGB` or `#RRGGBB`. Button text needs at least 2:1 contrast on its background.
- Labels: Latin text only, no emoji or symbols, no links, `@names` or domains. Em and en dashes become commas.
- Text too wide for the story shrinks (buttons down to 32px, captions to 28px, captions wrap to 3 lines), then the request is a 400.
- `button` needs `linkUrl`. Video stories with `overlay` are a 400. With `fit=false` the image must already be exactly 1080x1920.
- Unknown keys and bad values are a 400, never silently ignored.

### Seeing it before posting

- `dryRun=true` plus `previewImage` (`true` or `base64`, `file`, `both`) returns `previewBase64` (JPEG) and/or `previewPath` (a file in the server's temp dir). `wouldPost.overlay` lists the pixel rectangles and the exact `linkArea` that would be sent to Telegram.
- `action=story_preview` renders only. It needs no clone bot, no business connection and no story right, so it is fast and has no live Telegram call. `previewImage` defaults to base64.

### Font

The overlay text is drawn from `public/fonts/LiberationSans-Bold.ttf` (SIL Open Font License, licence file next to it). The prod image is `node:22-alpine` with no system fonts, so the font is bundled and found from `process.cwd()/public/fonts`. The Dockerfile already copies `public/` into the runner image, so no Dockerfile change is needed. `STORY_FONT_FILE` overrides the path.

## Channel posts: what Telegram allows

- Buttons are inline URL buttons: up to 8 rows of 1 to 4, text up to 64 characters, `https://` or `tg://` links. Not allowed on an album (2 or more media).
- Styling: Bot API 9.4 added `InlineKeyboardButton.style`, which is exactly one of `primary` (blue), `success` (green) or `danger` (red). Send it per button: `{"text":"Join","url":"https://t.me/x","style":"success"}`. `blue`, `green` and `red` are accepted as aliases. Apps older than 9.4 show the default look.
- There are NO custom colours, gradients or shapes on a channel button. A hex colour in `style` is refused with a 400, not faked.
- Button icons use a custom emoji and only work when the bot owner has Telegram Premium, so they are not exposed.
- For a custom coloured button on a channel, burn it into a photo (story overlay) instead.
