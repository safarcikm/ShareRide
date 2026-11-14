# Spec 15: Visual design system

**Owner:** Martin · **Date:** 2026-11-13 · **Status:** Approved (2026-11-13)

Covers the brand direction (colours, type, tone of voice) and the first
screen designs from the [roadmap](../strategy/roadmap.md), Phase 1. Related:
[ADR 0017](../decisions/0017-visual-design-system.md) (accepted),
[ADR 0003](../decisions/0003-cross-platform-client-expo.md) (Expo),
[ADR 0011](../decisions/0011-localization.md) (Icelandic and English),
[conventions: accessibility](../engineering/conventions.md#accessibility),
[spec 1](2026-11-13-sign-in-and-profile.md) (sign-in screens),
[spec 3](2026-11-13-post-a-trip.md) (post a trip),
[spec 4](2026-11-13-search-and-trip-details.md) (search and trip details),
[spec 5](2026-11-13-booking-and-requests.md) (booking),
[spec 14](2026-11-13-women-only-trips.md) (women-only tag).

The screens below were drawn on a design canvas and reviewed there by Martin.
This spec is the source of truth for the build; the canvas is a sketch.

## 1. Problem and goal

The app has a neutral placeholder look. Before more screens are built, every
screen needs to share one look that fits ShareRide: friendly enough that a
stranger feels at ease getting into someone's car, and clear enough that
prices, times and seats are never misread.

Goal: one small set of colours, type, sizes and parts, with every colour pair
checked for contrast, that the app uses on iOS, Android and the web, in light
and dark mode, in Icelandic and English.

## 2. User stories

- As a passenger, I see at a glance how many seats are free on my part of the
  trip and where I would sit, so the trip feels real before I book.
- As a driver, posting a trip feels quick and friendly, and the price limit
  feels fair rather than like a telling-off.
- As someone with low vision, I can read every text, see every control's
  edge and always see where the keyboard focus is.
- As someone who reads in Icelandic, long Icelandic words fit without being
  cut off.
- As someone who uses dark mode at night, the app is easy on the eyes and
  still clear.

## 3. Direction

### 3.1 Where it comes from

Martin's reference is the style of the puzzle game *Is This Seat Taken?*
(Poti Poti Studio, 2025): people drawn as simple coloured shapes with faces,
a small soft palette, chunky rounded parts and a cosy but very clear feel. We
take those traits and make them ours. We never copy the game's characters,
name, art or layouts.

What makes it ours:

- **The seat is the hero.** A top-down view of the car shows the seats on
  your part of the trip: free, taken, yours, not offered.
- **Colours from Iceland:** moss, glacier, lupine, basalt, the low sun and
  crowberries, on a cool frost background.
- **Our own people:** a pebble, a mountain and a dome with a face. In winter
  some wear a knitted hat.
- **Trip preferences as small "need" icons**, like luggage, pets, chat and
  smoking.

### 3.2 Principles

1. **Cosy, clear, a full car.** Warm and friendly, never cute at the expense
   of clarity.
2. **Playful around the edges, plain where trust matters.** Shape people
   appear in seat views, empty screens, confirmations and onboarding. Prices,
   times, payment, safety and real profile photos are always plain.
3. **Chunky and touchable.** Rounded parts with a solid bottom edge, so it is
   obvious what can be pressed. Nothing smaller than 44 by 44 points to tap.
4. **Never colour alone.** Every state also has a shape, icon, pattern or
   word.
5. **Icelandic first-class.** Layouts are checked with Icelandic texts, which
   are often longer.

## 4. Rules

### 4.1 Colour

Hex values for light and dark mode. Contrast ratios were checked with the
WCAG 2.2 formula; text needs 4.5:1, control edges and focus rings 3:1.

| Token | Light | Dark | Used for | Contrast (light / dark) |
| ----- | ----- | ---- | -------- | ----------------------- |
| `background` | `#EEF3F4` frost | `#121A1E` | Screen background | |
| `surface` | `#FFFFFF` | `#1B252B` | Cards, bars, inputs | |
| `text` | `#1F2A30` basalt | `#ECF2F4` | Text | 13.1 on background, 14.7 on surface / 15.6, 13.8 |
| `textMuted` | `#56636B` slate | `#A6B4BB` | Secondary text | 5.5, 6.2 / 8.3, 7.3 |
| `primary` | `#2F6B4F` moss | `#7CC49E` | Main buttons, selected states, links | 5.6, 6.3 / 8.6, 7.6 |
| `onPrimary` | `#FFFFFF` | `#0C2117` | Text and icons on `primary` | 6.3 / 8.2 |
| `primaryEdge` | `#1F4A36` | `#4E8E6C` | Bottom edge of primary buttons, checked boxes | decorative |
| `primarySoft` | `#E2EFE7` | `#203A2D` | Selected chips, "Get in" tags, your seat | `primary` on it 5.3 / 6.0 |
| `border` | `#DCE5E8` | `#2C3940` | Dividers and decorative lines only | decorative |
| `control` | `#7F8C93` | `#6E7D85` | Edges of inputs, checkboxes, radios, switches when off, seat outlines | 3.5 on surface, 3.1 on background / 3.7, 4.1 |
| `edge` | `#D2DDE1` | `#0B1013` | Solid bottom edge of cards and secondary buttons | decorative |
| `focus` | `#1F5F8B` | `#8FCBE6` | Keyboard focus ring | 6.1, 6.8 / 9.9, 8.8 |
| `error` | `#B3261E` | `#FFB4AB` | Error text and error field edges | 5.8, 6.5 / 10.4, 9.2 |
| `onError` | `#FFFFFF` | `#3B0905` | Text on an `error` fill (delete actions) | 6.5 / 10.1 |
| `errorSoft` | `#FCE8E6` | `#3B1A17` | Error notice background | `text` on it 12.5 / 13.8 |
| `infoSoft` | `#E1EDF6` | `#16303F` | Info notice background | `text` on it 12.3 / 12.2 |

`background`, `surface`, `text`, `textMuted`, `primary`, `onPrimary`,
`border`, `focus` and `error` keep the names the app already uses, so screens
need no changes. `border` used to outline inputs; that job moves to
`control`, because `border` is too light to show a control's edge (WCAG
1.4.11).

Tags (text on a tinted fill, all at least 5.3:1):

| Tag | Light | Dark | Example |
| --- | ----- | ---- | ------- |
| Positive | `primary` on `primarySoft` | same | "Get in", "Instant booking", "Suggested price" |
| Warning | `#8A4B00` on `#FFF3DC` | `#F2C46B` on `#2E2614` | "New driver", "Leaves in 30 min" |
| Info | `#1F5F8B` on `#E1EDF6` | `#8FCBE6` on `#16303F` | "Request to book" |
| Women only | `#6B3FA0` on `#F1EAFB` | `#CDB6F2` on `#2E2340` | "Women only" (spec 14) |

Rating star: `#B97F0F` light, `#E9B44C` dark, always next to the number.

The main colour was chosen from three options drawn side by side: moss green
(chosen), glacier blue `#1F5F8B` and lupine `#5A4BB5`.

![The three main colour options](images/visual-design-system/colours.png)

### 4.2 People and illustration colours

Only for shape people, need icons and drawings; never for text and never the
only way to show meaning. Faces are drawn in `text` light (`#1F2A30`) in both
modes.

| Name | Hex | | Name | Hex |
| ---- | --- | - | ---- | --- |
| Glacier | `#8FCBE6` | | Crowberry | `#F08C9C` |
| Lupine | `#A99BEB` | | Moss light | `#9ED0A0` |
| Sun | `#F4C04E` | | Wool (hats, scarves) | `#EADFCB` |

The car, seen from above: body `#D5E1E5`, glass `#A9C4CE`, cabin `#F5F8F9`
in light mode; `#34454E`, `#557784` and `#24323A` in dark mode.

### 4.3 Type

Two free fonts (SIL Open Font License), both with every Icelandic letter
(á ð é í ó ú ý þ æ ö, the capitals and „ “):

- **Fredoka** SemiBold (600) for titles, times, prices and buttons; Medium
  (500) for secondary times.
- **Nunito** Regular (400), SemiBold (600) and Bold (700) for everything you
  read.

| Token | Font | Size / line height | Used for |
| ----- | ---- | ------------------ | -------- |
| `display` | Fredoka 600 | 48 / 52 | The price on the price step |
| `title` | Fredoka 600 | 28 / 34 | Screen titles |
| `heading` | Fredoka 600 | 19 / 24 | Card and section headings |
| `figure` | Fredoka 600 | 22 / 28 | Times and prices in lists and bars |
| `figureSmall` | Fredoka 500 | 16 / 22 | Secondary times |
| `button` | Fredoka 600 | 18 / 22 | Button labels (19 / 22 on the main action) |
| `body` | Nunito 400 | 17 / 24 | Text |
| `bodyStrong` | Nunito 700 | 17 / 24 | Place names, names, emphasis |
| `label` | Nunito 700 | 15 / 20 | Field labels, chips, small buttons |
| `small` | Nunito 400 | 15 / 20 | Help text, meeting point names, notes |
| `caption` | Nunito 700 | 13 / 18 | Tags, "Step 3 of 5", legends |

- Use sentence case everywhere; no capitals for labels.
- Text scales with the phone's text size. Layouts wrap rather than cut text
  at 200%. Only text inside drawings (the "You" flag on the seat view) may
  cap its scaling, at 1.3.
- Numbers in prices and times use the formats in
  [`packages/i18n`](../../packages/i18n/src/format.ts): "4.700 kr." in
  Icelandic, "4,700 ISK" in English.

### 4.4 Spacing, corners, edges and sizes

| Group | Tokens |
| ----- | ------ |
| Spacing | `xs` 4, `sm` 8, `ms` 12, `md` 16, `lg` 24, `xl` 32, `xxl` 48 |
| Corners | `seat` 4 (seat legend), `checkbox` 9, `tag` 12, `control` 16 (buttons, inputs, notices), `card` 22, `pill` 999 (chips, need bubbles, icon buttons) |
| Bottom edges | `card` 3 (`edge` colour), `buttonPrimary` 4 (`primaryEdge`), `buttonSecondary` 3 (`edge`) |
| Sizes | `minTouchTarget` 44, `buttonHeight` 48, `mainButtonHeight` 56, `inputHeight` 52, `chipHeight` 40, `iconButton` 44, `checkbox` 26, `maxContentWidth` 480; `controlOutline` 2 (inputs, tick boxes, chips) |

- `ms` 12 is new; the other spacing names are unchanged.
- Screen padding is `md`; gaps between cards are `md`; inside a card, `ms`
  between rows.
- The **chunky edge** is a solid bottom border (`borderBottomWidth`), not a
  shadow, so it looks the same on iOS, Android and the web. When pressed,
  the part moves down by its edge and the edge disappears.
- Parts drawn smaller than 44 (chips at 40, small buttons at 40) get
  `hitSlop` so the area you can tap is at least 44 by 44.

### 4.5 Icons

[Lucide](https://lucide.dev) icons (ISC licence), 2.4 stroke, 22 points in
buttons and 14 to 18 inside need bubbles and ticks (`iconSizes`: `button`
22, `inline` 18, `tick` 16), in the colour of the text next to them. An icon on its own (an icon button) always has an accessible
name. Shape people and the car are our own drawings.

### 4.6 Motion

- Press feedback is instant: the part moves down by its edge.
- Choosing a seat count "pops" the seat in the seat view (scale 0.9 to 1,
  150 ms). Screens otherwise use the platform's own transitions.
- With reduce motion turned on, the pop is skipped and nothing else moves.
- Nothing moves on its own: no looping animations.

### 4.7 Dark mode

The app follows the phone's setting (light or dark). Dark mode uses the dark
column of every table above; the shape people keep their colours. Martin's
review board shows the trip details in Icelandic and dark mode.

![Trip details in Icelandic, dark mode](images/visual-design-system/trip-is-dark.png)

### 4.8 Wide screens

- Content sits in one column at most 480 wide, centred.
- From 900 wide, the trip details and request screens move the price and main
  action from the bottom bar into a panel 320 wide beside the column.
- Search results put the map beside the list (spec 4).

### 4.9 Logo and app icon

Logo A, "A shared ride" (decision 11): the car from above, front up. The
driver sits front left in a crowberry knitted hat, because Iceland drives on
the right, and you sit in the back, in moss. The two empty seats say there is
room.

![Logo A as the app icon, the Android icon, the opening screen and with the name](images/visual-design-system/logo.png)

- **Drawings:** `apps/mobile/assets/logo/*.svg` are the source.
  `node scripts/export-icons.ts` (in `apps/mobile`) exports the pictures in
  `apps/mobile/assets` from them; commit a drawing and its picture together.
  A test checks each picture's size, background and use in `app.json`.
- **App icon:** the car at 90% of the square on `primary` moss, filling the
  square; phones round the corners. iOS also gets a dark icon (the car in
  night colours on dark `background`) and a tinted icon (the car's outline,
  windscreen and people in light grey on black, which iOS colours).
- **Android:** an adaptive icon. The background is `primary` moss; the car
  layer is see-through with the car at 58%, inside the safe circle (66 of
  108), so no shape the phone cuts reaches it. The themed icon (Android 13
  and later) is the same outline in one colour.
- **Opening screen:** the icon with rounded corners in the middle of
  `background` (frost, or night in dark mode), 144 points wide on both
  platforms, and nothing else. Its picture (1152 pixels, enough for the
  sharpest Android screens) is twice the icon's size with see-through
  edges, so Android's round mask never cuts the corners. It shows only
  while the app starts; the fonts and your session then load behind the
  usual loading view.
- **Browser tab:** the icon with rounded corners, 48 pixels.
- **With the name:** the icon, then "ShareRide" in Fredoka SemiBold in
  `text`, at 0.6 of the icon's height, with a gap of a quarter of the
  icon's height. A new name later only changes the word.
- **Rules:** keep space around the logo of at least half the icon's height.
  Smallest sizes: the icon 24 points, the icon with the name 120 points wide.
  Always on a plain background (frost, white or night); never on a photo,
  never recoloured, rotated or stretched.
- Expo Go shows its own icon. The app icon and the opening screen show only
  in a build of the app (`npx expo run:android`, or a store build).

## 5. Parts and screens

### 5.1 Parts the app already has

Names and props stay as they are in `apps/mobile/src/components`, so screens
and tests need no edits. Only the look changes.

| Part | Look |
| ---- | ---- |
| `Button` `primary` | `primary` fill, `onPrimary` label in `button`, corner `control`, 4 bottom edge in `primaryEdge`, height 48 (56 for the main action in a bottom bar). Every button fits its label, with `lg` padding each side, and sits in the middle of the column |
| `Button` `secondary` | `surface` fill, 2 `control` outline, `text` label, 3 bottom edge in `edge` |
| `Button` `text` | No fill, `primary` label in `label`, at least 44 high |
| `Button` `busy` | A small spinner before the label, which stays; it can't be pressed again; `accessibilityState.busy` |
| `Button` `disabled` | `border` fill, `textMuted` label, no edge; never shown with opacity alone |
| `TextField` | `label` above in `text`; input height 52, `surface`, 2 `control` outline, corner `control`; the outline turns `primary` while you type in it; `help` below in `small` `textMuted`; with `error`, the outline and message turn `error` and the message starts with an alert icon |
| `Checkbox` | 26 square, corner 9, 2 `control` outline; checked: `primary` fill, `onPrimary` tick, 2 `primaryEdge` bottom edge; the whole row is pressable |
| `Chip` | 40 high, corner `pill`, `surface`, 2 `control` outline, `label` text; selected: `primarySoft` fill, `primary` outline and a tick before the label |
| `Notice` | Corner `control`, an icon then the message in `body`; `error` on `errorSoft` with an alert icon, `info` on `infoSoft` with an info icon |
| `TextLink` | `primary`, Nunito 700, always underlined (moss on basalt text is only 2.3:1, so the underline is what marks a link), centred |
| `BackButton` | 44 round, `surface`, 3 `edge` bottom edge, chevron icon; accessible name "Back" |
| `Loading` | A `primary` spinner centred on `background` |
| `Screen` | `background`, safe area, `md` padding, column at most 480 wide |
| `Title` | `title`, `text`, role header, centred |
| `Body` | `body`, `textMuted` (the intro or help line under a title), centred; long text such as a legal document starts at the left |
| `LanguageSwitch` | A `text` button with the other language's name |

**Focus:** every pressable part shows a 3 wide `focus` ring with a 2 gap
around its shape when reached by keyboard (web, and keyboards on phones).
A tap or click never shows it. Text fields show focus with their own
`primary` outline instead.

**Alignment:** screens centre their titles, intro text, buttons and links.
Fields with their labels, tick boxes, lists and long text start at the left,
because centred lines are hard to read and to scan in a form.

### 5.2 Parts for the posting and booking screens

Built when the screens that need them are built.

| Part | What it is |
| ---- | ---------- |
| `Card` | `surface`, corner `card`, 3 `edge` bottom edge, `md` padding |
| `Tag` | `caption` text on a tinted fill, corner `tag` (section 4.1) |
| `IconButton` | 44 round, like `BackButton`, for share and more |
| `Stepper` | Minus and plus as 48 square secondary buttons, the value in `figure` between them; accessible names "One seat fewer" and "One seat more"; adjustable role with a value |
| `Switch` | Off: `control` track outline; on: `primary` track; label to the left |
| `RadioCard` | A card with a radio, a title and a line of help; selected: `primary` 2 outline |
| `TickList` | Rows with a tick box: done is a filled `primary` box with a tick, not done is an empty `control` box with an action button |
| `StepProgress` | "Step 3 of 5" in `caption` above five bars 8 high; done bars `primary`, others `border` |
| `BottomBar` | `surface`, 2 `border` top line, price on the left, main button on the right; respects the safe area |
| `NeedBubble` | A pill with a coloured round icon and a word, for trip preferences |
| `RouteLine` | Times, a line with stops, place in `bodyStrong` and meeting point in `small`; the part you ride is solid `primary`, the rest dotted `control` |
| `PriceLevel` | The price level control of spec 3, as on the price step below: a track in 10% steps with the suggested level marked, a shape person as the handle, and minus and plus buttons; adjustable role whose value reads the level and the whole-route price |
| `SeatView` | The top-down car (section 5.3) |
| `Avatar` | The real profile photo, round; without a photo, the first letter on a people colour. Never a shape person |

### 5.3 Shape people and the seat view

**Shape people** are a pebble, a mountain or a dome with two dot eyes and a
small smile, in a people colour, sometimes with a knitted hat. They appear
in the seat view, empty screens, confirmations and onboarding. They never
stand in for a real person's photo, never speak about money or safety, and
their shape or colour never says anything about a person's gender.

**The seat view** shows the car from above, front to the right, on your part
of the trip:

| Seat | How it looks | Meaning |
| ---- | ------------ | ------- |
| Driver | A shape person whose colour comes from the driver's id, so it stays the same on every trip | Always there |
| You | `primarySoft` seat, 3 `primary` outline, a moss shape person and a "You" flag | The seats you are booking |
| Taken | A grey shape with no colour and no face details beyond two dots | Booked by someone on this part |
| Free | White seat with a dashed `control` outline | Free on your part |
| Not offered | Flat grey seat with a cross | The driver doesn't offer it |

- **Positions are illustrative.** ShareRide doesn't assign seats. The app
  fills seats in a fixed order: front passenger seat, then the back seats
  from the outside in. Taken seats come first, then yours, then free ones.
- A legend under the view repeats the states in words, and a line says "2 of
  3 seats free on your part".
- The whole view is one image for screen readers, with a label that says
  the same in words, for example "Seats on your part: 3 offered. 1 is taken,
  you have 1, and 1 is free." It updates when the seat count changes.
- Cars with more than five seats show a third row; the view never shows more
  seats than the car has.

On the driver's seats step, the same view shows which seats are offered.

### 5.4 Screens

Drawn at phone size (390 wide) in English, light mode, with fictional names
and trips. They show how the parts fit together; the behaviour and texts are
in the specs named under each.

**Kit:** colours, people colours, type, shape people, seat states and parts.

![The kit](images/visual-design-system/main.png)

**Find and book a seat** (specs 4 and 5):

| Screen | Board |
| ------ | ----- |
| Search results: three trips on Friday, then other days | ![Search results](images/visual-design-system/results.png) |
| Trip details: your part, the seat view, the route, the driver and car, preferences, and "Request to book" | ![Trip details](images/visual-design-system/trip.png) |
| Request to book: what happens next, seats, a message to the driver and the price | ![Request to book](images/visual-design-system/book.png) |
| Request sent: when the driver must answer and the next steps | ![Request sent](images/visual-design-system/sent.png) |

**Offer a ride** (spec 3). The date and time step (step 2) is not drawn yet.

| Screen | Board |
| ------ | ----- |
| Step 1, route: from, to, the map and the stops on the way, each with a switch | ![Route step](images/visual-design-system/post-route.png) |
| Step 3, price: the whole-route price, the price level control with a shape person as the handle, minus and plus buttons, each stretch's price and why there is a limit | ![Price step](images/visual-design-system/post-price.png) |
| Step 4, seats and preferences: the seats offered in the seat view, booking mode, preferences and a note | ![Seats step](images/visual-design-system/post-seats.png) |
| Step 5, check and publish: the ready-to-drive list, a summary with Edit links and "Publish trip" | ![Check and publish step](images/visual-design-system/post-review.png) |

Some details in the drawings are older than this spec, and the tables above
win: the message box on "Request to book", the filter and preference chips
and the switches when off are drawn with the light `border` colour and must
use `control`; body text is drawn at 16 and is 17.

## 6. Implementation

- **Tokens** stay in `apps/mobile/src/theme/tokens.ts`, with the new values
  and keys from section 4. `Palette` gains the new colour keys. Typography
  tokens name the font face (`Fredoka_600SemiBold`, `Nunito_400Regular`,
  `Nunito_600SemiBold`, `Nunito_700Bold`, `Fredoka_500Medium`) and never set
  `fontWeight`, because Android ignores weights for custom fonts. Tokens move
  to `packages/ui` when a second client (the operator console) needs them
  ([ADR 0017](../decisions/0017-visual-design-system.md)).
- **Fonts** come from `@expo-google-fonts/fredoka` and
  `@expo-google-fonts/nunito`, loaded with `expo-font`'s `useFonts` in the
  root layout while the existing `Loading` view shows. If loading fails, the
  app goes on with the system font rather than blocking. Font files ship
  inside the app and the web build; nothing is fetched from Google at run
  time.
- **Drawings** (shape people, the car, need icons) are `react-native-svg`
  components in `apps/mobile/src/components/illustrations/`.
- **Icons** come from `lucide-react-native`.
- **App icon and opening screen:** drawings in `apps/mobile/assets/logo`,
  pictures exported by `scripts/export-icons.ts`, set in `app.json`, with
  `expo-splash-screen` for the opening screen (section 4.9).
- **Add packages** with `npx expo install expo-font react-native-svg
  @expo-google-fonts/fredoka @expo-google-fonts/nunito`, and
  `lucide-react-native` with pnpm.
- **Focus ring:** on the web, one `:focus-visible` style sheet added at
  start (`apps/mobile/src/theme/focus-ring.web.ts`), so every pressable
  part and link shows the ring for the keyboard and not for clicks or taps.
  Text fields are left out of it; their outline turns `primary` instead. On phones, keep the system's own focus highlight (Android
  keyboard navigation, iOS Full Keyboard Access).
- The first implementation PR updates tokens, fonts and the parts in section
  5.1. The parts in 5.2 come with the screens of specs 3 to 5.

## 7. Privacy and safety

- Fonts are bundled, so opening the web app sends no visitor IP address to
  Google.
- Taken seats show no names, photos or colours, and seat positions are
  illustrative, so the seat view says nothing about who is in the car or
  where they sit.
- Shape people never replace a real profile photo, which stays the way to
  recognise your driver (spec 8).
- Drawings, screenshots and tests use fictional names and trips only.
- "Women only" uses its own neutral lupine tag, not pink, and shape people
  carry no gender.

## 8. Texts and tone of voice

**Tone:** plain, warm and short, like a helpful neighbour. Say "you" and use
the driver's first name. Give times and facts, not statuses: "Sigrún has
until 07:30 tomorrow to answer", not "Your request is pending". Errors say
what happened and what to do, and never blame. No jokes about money or
safety, no exclamation marks in errors and no emoji in app texts.

New texts for the parts (first draft; Icelandic to be reviewed by a native
speaker):

| Key | English | Icelandic |
| --- | ------- | --------- |
| `seats.you` | You | Þú |
| `seats.legend.taken` | Taken | Upptekið |
| `seats.legend.free` | Free | Laust |
| `seats.freeOnPart` | `{free} of {offered} seats free on your part` | `{free} af {offered} sætum laus á þínum hluta` |
| `seats.viewLabel` | `Seats on your part: {offered} offered. {taken} taken, you have {yours}, and {free} free.` | `Sæti á þínum hluta: {offered} í boði. {taken} upptekin, þú ert með {yours} og {free} laus.` |
| `seats.fewer` | One seat fewer | Einu sæti færra |
| `seats.more` | One seat more | Einu sæti fleira |
| `steps.progress` | `Step {step} of {total}` | `Skref {step} af {total}` |
| `common.loading` | Loading | Hleð |

Counts use ICU plural forms in both languages.

## 9. Testing

- **Contrast:** a unit test computes the WCAG ratio of every pair in section
  4.1 from the tokens, for light and dark, and fails below 4.5:1 for text or
  3:1 for control edges and the focus ring.
- **Parts:** component tests keep finding parts by role and accessible name;
  new tests for the seat view's label, the stepper's value and the disabled
  and busy states.
- **Fonts:** a test that the root layout shows `Loading` until fonts are
  ready, and the app when loading fails.
- **Browser:** the Playwright tests take phone and desktop screenshots in
  light and dark mode for review in the PR.
- **Manual:** each new screen on a real iPhone and Android phone in both
  languages, with the largest text size, with VoiceOver and TalkBack, and
  with a keyboard on the web.

## 10. Out of scope

The date and time step of posting, the my-trips and manage-bookings
screens, chat, the trip day screens, the operator console's look, the public
website, sound and haptics. These get drawn when their specs are built,
following this spec.

## Decisions

Accepted by Martin on 2026-11-13 as recommended.

| # | Question | Decision |
| - | -------- | -------- |
| 1 | Which visual direction? | The style of *Is This Seat Taken?* made ours: shape people, a small soft palette from Iceland, chunky rounded parts, the seat view as the hero |
| 2 | Which main colour? | Moss green `#2F6B4F` (not glacier blue or lupine) |
| 3 | Which fonts? | Fredoka for titles, times, prices and buttons; Nunito for text |
| 4 | How playful? | As drawn: shape people in seat views, empty screens and confirmations; prices, times, payment and photos plain |

Calls made while writing this spec, accepted by Martin with the spec on
2026-11-13:

| # | Call | Why |
| - | ---- | --- |
| 5 | The focus ring is glacier blue, not the placeholder amber `#F2A900` | Amber is only 1.8:1 on frost; blue is 6.1:1 and doesn't clash with moss |
| 6 | A new `control` colour for the edges of inputs and other controls | `border` is 1.3:1, below the 3:1 that control edges need |
| 7 | Body text stays at 17, although the drawings use 16 | Nunito's lower-case letters are smaller than the system fonts' (x-height 0.48 of the size against about 0.52), so it needs 17 to read as easily |
| 8 | Lucide icons | Rounded strokes match the look, ISC licence, one package for every platform |
| 9 | Tokens stay in the app until a second client needs them | `packages/ui` with one user adds a package without a benefit yet |
| 10 | Fonts bundled, not loaded from Google | Works offline and sends no visitor data to Google |

Decided by Martin after the spec was approved:

| # | Question | Decision |
| - | -------- | -------- |
| 11 | Which logo? | A, "A shared ride": the car from above with the driver and you (chosen 2026-11-13; the refined drawing approved 2026-11-14), not B (a friend in a hat) or C (your stretch of road) |
