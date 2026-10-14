# Werewolf Web Design System

English | [简体中文](MASTER.zh-CN.md)

Baseline updated October 13, 2026, prod1.0; the lobby readiness placement below reflects subsequent maintenance. Covers entry, lobby, private tasks, host controls, and recaps. Shared styling lives in `web/src/app/globals.css`.

## Visual Direction

Original dark-fantasy bitmaps combine with clear editorial typography and a low-light tool interface. Scenes provide atmosphere; text, seats, and controls provide readability. The first screen creates, joins, or restores a game, without a marketing landing page, casino green/gold, or complex 3D.

The initial ui-ux-pro-max search was social deduction game dark cinematic; its marketing layout was not adopted. An explicit dark mode OLED style search suggested Dark Mode OLED for entertainment and low-light use, adapted to the established charcoal, dark red, and cool green. UX guidance informed touch spacing, accepted-action feedback, and destructive confirmations. Keep the verified Next.js interfaces rather than rewriting authorization for a template recommendation.

## Color and Typography

| Meaning | Baseline |
| --- | --- |
| Background | `#161819` |
| Surface | `#202526`, hover `#292F30` |
| Body and secondary text | `#EEEAE2`, `#A8B1AD` |
| Control borders and dividers | `#687470`, `#333C3B` |
| Primary commands | Dark red `#9A3546`, hover `#B14859`, white text |
| Confirmation and focus | Cool green `#91C8AE` |
| Error | `#F1A5AA` |
| Headings | Local Noto Serif SC subset, system serif fallback |
| Body | Chinese system sans serif, 16px, line height 1.6 |
| Large headings | Entry 72px, page 40px; fixed font sizes, no viewport-based scaling |

Approximate contrast ratios: body/background 14.85:1, secondary/surface 7.06:1, primary-button white text 7.07:1, and input border/surface 3.19:1. Selection uses outlines, check marks, and semantic labels, not color alone.

## Layout and Controls

- Content width is capped at 1104px. Entry scenes are full width; page sections are not floating cards.
- Create/join forms begin with an empty nickname and no nickname placeholder. Omit decorative English numbering, repeated form headings, and player-count badges; configuration choices and validation still communicate limits. Remove the shared header's English wordmark and decorative entry footer; retain own seat/nickname in the room footer.
- Use compact seats: phone lobby three columns at 64px high, public roster four columns at 56px; wide screens use four columns without reordering. Ellipsize long nicknames on one line, retaining full accessible names, tooltips, and roster-panel text. Readiness/alive/eliminated status stays readable.
- Action targets use fixed-size text in three/four columns, 48-64px tall, with a two-pane layout on short landscape screens. Seats, role status, countdown, and confirmation fit together. Private action panels normally cap height at 580px. Preserve the full-roster control and accessible names.
- Identity views prioritize portraits: centered 216px-wide art on typical portrait phones, with role/rules below; desktop art up to 300px beside copy. Short screens use side-by-side layout with available-height constraints, preserving the full uncropped 3:4 image. Keep conceal controls at the private-panel bottom. Do not enlarge the action screen's 36x48px thumbnail or displace its single-screen targets.
- Do not repeat 本人私密视角 on identity cards. Private dialog titles retain accessible names without redundant visible headings; closing/concealing stays available. Remove 本夜一次 from the Seer screen while retaining timer, rules, roster, inspections, and confirmation.
- The public shared card back remains uncropped 3:4, up to 240px wide, constrained by available height with an 8px task-button gap. At heights of 700px or less, a 64px card back sits beside the task entry, leaving room for 12 players and progress. Night heading and timer sit inline. Do not enlarge private action thumbnails.
- After an action, the private identity confirmation area shows one's choice and permitted result: protect/pass, highest-count wolf target, antidote/poison/no potion, inspected alignment, or Hunter shot/pass. No skipped wolf kill or skipped Seer inspection. Wolf/potion feedback describes accepted choices and consumption, never unannounced final deaths. Concealing leaves no result on the public screen. Normal and late submissions both keep feedback for about three seconds.
- Repeated items use 5px corners; modals use 7px. No nested cards.
- Tools use Lucide icons, 44px touch targets, accessible names, and tooltips. Modes use segmented controls; numeric inputs and single-target selection have clear states.
- Lobby readiness sits above the seat list, visible in the first viewport for unready players. Preserve manual ready/cancel and a secondary host entry, without tutorials or extra popups.
- Native dialog manages focus and Escape. Backgrounding, closing, and phase changes clear private drafts.
- Keep background transitions short; reduced motion removes nonessential effects. No private sounds, vibration, or role-specific idle colors.

## Screen Application

Entry is the actual form, with the product name as its first-screen heading. The lobby shows seats and readiness. At night, the main screen uses the same card back and public phase; own artwork and legal tasks appear only in the private view.

The host drawer contains public commands and organizational controls only. Daytime drafting, confirmation, and publication are separate. Hunter reactions become available only after announcement. Recaps use identity artwork and nightly records, restricted to participants.

## Assets and Maintenance

Eight original bitmaps live in `web/public/art/`; its README documents provenance and generation descriptions, and manifest records fingerprints. Text is not baked into images. Historical reference assets are removed from the current tree.

Maintain shared colors, typography, and controls rather than a separate phone product. Text and Chinese voice hosting are supported; sound testing is optional, and only the host device plays public audio. Action windows open early after the actual eyes-open clip ends. System recovery is automatic where possible; manual pauses require explicit resume.
