# Directional Icon Conventions (Prompt 03 §9)

MindStep uses [Lucide React](https://lucide.dev/) icons. Some icons are
**directional** — they imply a reading direction (e.g., a "next" chevron
pointing right in LTR). For RTL locales (Arabic), directional icons must
be mirrored so they continue to point in the document's reading direction.

## When to flip (apply `.rtl-flip`)

| Icon | Why flip |
| --- | --- |
| `ChevronRight` | Used as a "next"/"forward" indicator. In RTL, "next" is left-pointing. |
| `ChevronLeft` | Used as a "back"/"previous" indicator. In RTL, "back" is right-pointing. |
| `ArrowRight`, `ArrowLeft` | Same as chevrons — direction implies semantic direction. |
| `Play` (triangle) | Media play triangle points right in LTR. In RTL, the play direction visually flips so it still reads "forward". |
| `MoveRight` | Used in Reset My Day to indicate "move to tomorrow" — direction implies forward. |
| `Footprints` | Footprint icons have a subtle visual direction; flip in RTL. |
| `Undo2`, `Redo2` | Circular arrow icons imply direction. |
| `Reply`, `Share`, `Forward` | Arrow-implying icons for sharing actions. |
| `LogIn`, `LogOut` | Door-arrow icons imply entrance/exit direction. |
| `ListStart`, `ListEnd` | List position indicators — direction implies order. |

## When NOT to flip

| Icon | Why no flip |
| --- | --- |
| `Pause` (two vertical bars) | Symmetric — no reading direction implied. |
| `Stop` (square) | Symmetric — no reading direction. |
| `X` (close) | Symmetric — no reading direction. |
| `Plus`, `Minus` | Symmetric — no reading direction. |
| `Check`, `CheckCircle2` | The check mark has a direction, but it is a culturally-universal "yes" mark — does not flip. |
| `Timer`, `Clock`, `Hourglass` | Clock hands imply fixed direction (the hands always rotate the same way). |
| `Calendar` | Symmetric. |
| `Battery`, `BatteryFull`, etc. | Battery orientation is fixed by the device icon convention. |
| `Heart`, `Star`, `Bell` | Symmetric. |
| `Sparkles`, `Bot`, `Brain` | No implied direction. |
| `RefreshCw`, `RotateCw` | Circular arrows imply a fixed rotation direction (clockwise = refresh). The rotation direction does NOT change with text direction. |
| `AlertTriangle`, `AlertCircle`, `ShieldAlert` | Symmetric warning shapes. |
| `Trash2`, `Edit`, `Settings`, `Eye`, `Lock`, etc. | Symmetric / no reading direction. |

## Implementation

MindStep's `.rtl-flip` utility lives in `src/app/globals.css`:

\`\`\`css
[dir="rtl"] .rtl-flip {
  transform: scaleX(-1);
}
\`\`\`

Apply the `rtl-flip` class to the icon's className:

\`\`\`tsx
<Play className="size-4 rtl-flip" aria-hidden />
<ChevronRight className="size-5 rtl-flip" aria-hidden />
\`\`\`

For non-directional icons, do NOT apply `rtl-flip`:

\`\`\`tsx
<Pause className="size-4" aria-hidden />
<Trash2 className="size-4" aria-hidden />
\`\`\`

## Audit

`tests/logical-css-audit.test.ts` includes a check that verifies the
`rtl-flip` class is used somewhere in the codebase, and that
`[dir="rtl"]` selectors exist in `globals.css`.

When adding a new directional icon, add a row to the table above and
make sure the component uses `rtl-flip`.
