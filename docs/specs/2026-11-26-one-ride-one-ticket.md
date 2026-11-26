# Spec 31: One ride, one ticket: the same rules for every screen

**Owner:** Martin · **Date:** 2026-11-26 · **Status:** Proposed
(2026-11-26): Martin asked for the review; the direction (3.1) and the
choices in the Decisions section are his to make. Nothing is built until he
approves

Amends, once approved: [spec 15](2026-11-13-visual-design-system.md) (new
parts, title alignment, the title font's spacing),
[spec 16](2026-11-15-one-home-and-simpler-flows.md) (3.2 Find, 3.3 My rides,
3.4 Profile, 3.6 item 4, the last posting step) and
[spec 18](2026-11-18-laptop-layout.md) (3.5 Find, 3.9 a booking, 3.10 My
rides, 3.12 Profile, 3.14 the driver's trip), and the look, not the
behaviour, of the screens of specs 3 to 9 (3.19). No ADR: no new service,
dependency or business rule. Sign-in is left to
[spec 29](2026-11-25-easier-sign-in.md).

A second reader checked this spec against the app's code on 2026-11-26.
What that settled is in decisions 9 to 16, each a working choice of
Claude's that Martin can change.

The proposal as Martin saw it, each screen as it is beside how it would
look: [proposal page](https://claude.ai/artifact/3hMRPHSfiQxqVFkhtdAQtx)
(its files: [images/one-ride-one-ticket/proposal/](images/one-ride-one-ticket/proposal/)).

## 1. Problem and goal

Martin, 2026-11-26: "go over the whole web and make it more orgnaized and
easy to use, focusing on the complex UX/UI. I beliave its in many ways
clunky and disfunctional. I think its visually unorganized and boring. I
like the style we have, but its without a greater thought. Lets make sure
we can do better"

The website was walked on 2026-11-26 as a member uses it: joining as a
driver and as a passenger, offering a ride, asking for a seat, accepting
it, chatting, the trip day and a rating, on a phone (390 by 844) and a
laptop (1280 by 720), about 300 pictures. No screen was named beforehand.

The style holds up. What is missing is a system: each screen was designed
on its own, so the same thing has a different name, shape and place from
one screen to the next.

One thing has several names and shapes:

- The menu says My rides. A second page for drivers, My trips
  (`/drive/trips`), lists the same rides as a different card. Offering is
  called "Offer a ride", "Post a trip" and "Publish trip". Finding is
  "Find", "Find a ride" and "Search".
- There are two search forms: the card on the front page and the screen at
  `/search`.
- A ride is a different card in the results, in My rides, in My trips and
  in a request.
- Profile and Settings overlap; Send feedback is on both.

Everything has the same weight:

- Nearly every block is a white card of the same kind, so nothing says
  where to look first.
- The driver's ride ends in a column of five equal buttons: Edit trip,
  Cancel trip, Share trip details, Post again, Post the return trip.
- Titles are centred on some screens and at the left on others.
- The car's yellow and the Iceland scene live only in the drawings. The
  screens themselves are moss, white and frost, which is why they read as
  dull.

What needs you is easy to miss:

- On Find and in My rides, a request waiting for the driver's answer is a
  small blue tag on a tall white card, with the button under the card. On
  Find that card lists every stretch of the route and pushes the search
  under the first screen.
- On the trip day, "I'm here" comes just under the first screen on a phone.
- A booking's title is its route; its state is a small tag and a line
  under it.
- At the top of a conversation the two most visible things are Report and
  Block.

Long screens list everything:

- The last step of offering a ride opens with three unticked boxes and
  three buttons, then lists the route twice, once as places and once with
  times.
- The driver's ride gives most of its room to one seat bar a stretch and
  little to the person asking for a seat.
- A ride's details put your part, the driver, the car, the seats and the
  route in cards of equal weight.
- Settings is one long page of text, chips, switches and cards.

**Plain defects**, fixed whatever is chosen (3.18).

**Goal:** every screen follows the same six rules, so a member learns the
website once: a ride always looks the same, the title says what is going
on, what needs them comes first, and each screen has one main thing to do.
The colours, fonts, puffins, car, scene and logo stay.

**Anti-goals:** a new look; new features; any change to how booking,
prices, seats, cancelling or sign-in work; a screen that looks tidier but
takes more presses than today for what people do most (finding, booking,
answering a request, messaging, "I'm here"); a function that is on a
screen today and on none afterwards.

## 2. User stories

- As a passenger, I open the website on the day of my ride and the first
  screen tells me when it leaves, where to stand and who to look for, with
  "I'm here" under my thumb.
- As a driver, I open the website and the first thing I see is that Dóra
  asks for a seat, with one button to answer.
- As someone looking for a ride, I compare rides that all look the same:
  the times and places down the left, the price at the right, the driver
  under the tear line.
- As a driver about to publish, I see my ride the way passengers will, and
  what is still missing as one line.
- As anyone, I know what a screen is about from its title, and I find its
  main button in the same place every time.

## 3. Behaviour

### 3.1 Approaches considered

- **A. Tidy up.** Every screen stays as it is. Fix the defects, give every
  page the same head, turn the button columns into rows. Three or four pull
  requests. The website would still feel like many separate screens, and
  still dull.
- **B. One ride, one ticket** (recommended). The six rules of 3.2 on every
  flow; the same style with the screens rearranged. About twelve pull
  requests, flow by flow, each usable on its own.
- **C. A new look.** New colours, fonts and drawings. Martin likes the
  style, and what is wrong is the order, not the style. Not recommended.

Martin chooses on the thread's decision card (decision 1). The rest of this
spec describes B.

### 3.2 The six rules

1. **One ride, one ticket.** A ride is the same card everywhere: the day,
   the two times and places as a timetable, the price. Under a tear line it
   says what that place needs: the driver in the results, your seat in My
   rides, the request to answer for a driver.
2. **The road shows where things stand.** A booking goes Asked, Confirmed,
   Trip day, Done. Offering a ride goes Route, Time, Seats, Price, Check.
   The puffins' car stands at the step you are on.
3. **What needs you comes first, in the car's yellow.** A request to
   answer, a seat to pay for, a ride on its trip day: one yellow card with
   one button, at the top of Find and of My rides (3.3, item 3).
4. **One main button.** At the bottom of the screen on a phone, at the top
   of the side column on a laptop (R31.1). Everything else is a row with
   an icon. What cannot be undone is red and last.
5. **The title says what is going on.** "Your seat is confirmed", "Leaves
   in 10 minutes", "Your ride to Vík": once, at the left, in place of a tag
   and a line that repeat each other.
6. **Colour means something.** Moss is what you can do. Sun yellow is
   yours and now. Glacier blue is waiting and information. Red is a
   problem.

![The parts](images/one-ride-one-ticket/proposal/img/parts.webp)

### 3.3 The parts

New parts of the design system (spec 15, section 5), light and dark. They
need no new colour value; what the colours mean changes in two places,
named in item 3.

1. **`RideTicket`** takes the place of the four ride cards (`ResultCard`,
   the My rides row, the My trips card, the stretch inside a request).
   - **Day row:** the day ("Fri 27 Nov") in `caption`, then the tags at the
     right: "Book instantly" or "Driver approves" in the results; "You
     drive" or "Passenger" on my own rides; then Share where the ride can
     be shared.
   - **Timetable:** departure time, a ring, the place; the line with the
     duration beside it ("1 h 35 min", with ", 5 stops" for a driver's
     whole route); arrival time, a filled dot, the place. Times are
     Fredoka with tabular digits and line up; a place name that wraps
     keeps its time on its first line.
   - **Price:** at the right of the timetable, with "per seat" or "1 seat"
     under it. A driver's own ride shows no price there.
   - **Tear line:** a dashed line with a notch in each edge, in the page's
     colour.
   - **Foot,** one line: in the results, the driver's picture, name, rating
     or "New driver", and the seats left; on a booking in My rides, the
     driver and the booking's state as a tag; on a ride I drive, "1 of 3
     seats taken" and what it needs ("1 request"). A ride that is mine has
     a moss bottom edge.
   - It is one link, as the cards are today. Tickets in one row of a grid
     are equally tall, with the foot at the bottom.
2. **`Road`**: a grey road with a dashed middle line, the part behind the
   car in moss, a mark at each step and the car (`PuffinsInCar`, 60 wide)
   on the step you are on, with the steps' names under it and the current
   one in the text colour. For screen readers it is one line: "Step 2 of
   4: Confirmed". It takes the place of `StepProgress` on the posting
   steps. Its marks are not links: on the last posting step the rows open
   the earlier steps (3.11).
3. **`NeedsYouCard`**: a card in `warningSoft` (the soft yellow of the
   "New driver" tag) with a bottom edge in the car's yellow (`people.sun`):
   a yellow square with an icon, one bold line saying what is asked ("Dóra
   asks for 1 seat"), one line of detail in `warning` ("Mjódd to Selfoss,
   Fri 27 Nov. 11 h left to answer."), and one button. On the
   driver's ride the same card holds the whole request, with Decline and
   Accept side by side.
   - **What needs me** is one of three things, each already known to the
     lists Find and My rides load (section 6): a ride I drive with
     requests whose deadline is still to come; a seat of mine the driver
     accepted, to pay before its deadline (both as today, spec 16, 3.3);
     and a ride on its trip day, from three hours before I get in or
     leave until it is done (spec 8, 3.1). The soonest comes first: by
     the deadline to answer or pay, or by the time to get in or leave.
   - **A rating to give is not among them** (decision 9). It is asked on
     the booking, whose title is then "How was your ride?" (3.8), and
     under Past in My rides (3.10), as well as by the email of today.
   - **The button** is filled where the card is the thing to do (Find, My
     rides, the driver's ride) and outlined on the last posting step,
     where Publish ride is the main button (R31.1).
   - **The colours** are the pair the tags use, `warningSoft` and
     `warning`, which spec 15 names for warnings. From this spec they mean
     "yours and now" (rule 6); the tokens keep their names. `people.sun`
     gains one use outside drawings, the card's bottom edge and the square
     behind its icon; it is never text and never the only sign, since the
     bold line says what is asked.
   - **Status tags follow rule 6** (decision 10). "Driver said yes: pay"
     stays amber. Declined, expired, cancelled and withdrawn, amber or
     blue today, become a quiet tag (`plain`: muted text on the page's
     colour), since nothing is asked of anyone. "Did not show up" becomes
     red (`problem`: `error` on `errorSoft`). `Tag` gains those two kinds.
4. **`ActionRows`**: a card of rows 56 high, built on today's `Row`: an
   icon in a soft square, a label, sometimes the current value in muted
   text, and a chevron. A row that cannot be undone is red, has no chevron
   and comes last. A row either opens a page (chevron), unfolds what is
   under it (a chevron pointing down), holds a switch, or only shows a
   value (no chevron, and not a button). It takes the place of columns of
   secondary buttons and of loose text links.
5. **`ScreenHead`**: Back, then the title at the left with at most one
   line under it, and at most one round icon button at the right (Share).
   (`PageHead` is already the name of the title for search engines.)
6. **Titles and figures** (Fredoka) are set without kerning and with a
   word space 0.06 em wider (3.18, item 1), on the web, where it was
   measured; the phone apps are checked when they are built (section 10).

Existing parts stay: `Card`, `Tag`, `Chip`, `BottomBar`, `SeatView`,
`TickList`, `Columns`, `Grid`, `PuffinsInCar`, `IcelandScene`, `PuffinByPin`,
`TopBar`, `TabBar`.

### 3.4 One name each

In English a member reads **ride** for what a driver offers and a passenger
books; "trip" stays only in "Trip day" and in the code and docs
(decision 5). The places are Find, My rides, Offer, Messages and Profile, as
today; their actions are **Find a ride**, **Offer a ride** and **Publish
ride**. "Post a trip", "Publish trip", "My trips" and "Search" (as a
button) go. Icelandic keeps "far" in "Finna far" and "Bjóða far" and "ferð"
for the ride itself.

### 3.5 Find

1. Signed out, a phone's Find stays as it is (spec 16, 3.2), with the rides
   as tickets.
2. Signed in, under the scene: **"Hi Bára"** as the title, at the left.
   Then **one** of:
   - what needs me, as a `NeedsYouCard`, when something does (the
     soonest, 3.3, item 3; under it "and 2 more" opens My rides);
   - otherwise my next ride, as a ticket.
   Then the search card, then "Your next ride" as a ticket when a
   `NeedsYouCard` stands above and my next ride is another ride than the
   one it is about, then "Leaving soon".
3. The search card is the one card of spec 16, 3.2, item 3. `/search` shows
   the same card with the title "Find a ride" and the same button, "Find a
   ride"; there is one search form.
4. A driver's ticket shows the whole route as two ends with ", 5 stops";
   the seats free on each stretch are on the driver's ride (3.12), not on
   Find or My rides.

![Find now](images/one-ride-one-ticket/proposal/img/now-find-first.webp)
![Find proposed](images/one-ride-one-ticket/proposal/img/new-find-first.webp)

### 3.6 Search results

1. The head stays: Back, and the search as a card with Change.
2. One row: the sorting ("Earliest"), one **Filters** chip that opens the
   filters there are today, and the number of rides at the right.
3. Rides are tickets under a heading for each day, with the tag beside the
   day instead of in a band of its own.
4. The list ends with a card, the puffin by its pin beside "That's every
   ride found" and "All rides". The sections for other days and nearby
   meeting points stay as they are.

### 3.7 A ride's details

1. Head: the day in small text over the title "Selfoss to Vík", Share at
   the right.
2. **Your part of the ride**, as a ticket: the two stops with Change on
   each, the booking tag, and under the tear line the seats with the
   stepper and how many are free on that part.
3. **The driver:** picture, name, rating, rides and what is checked, opening
   the profile; under a line, the car, and the preferences as today.
4. **Where you sit:** the seat picture in a card of its own, with one line
   beside it.
5. **The whole route:** the map and the stops, the ones outside my part
   muted, mine marked "Get in" and "Get out".
6. Rows: free cancellation with its time, "Weather and roads" (the Safety
   links of today), "Report this ride".
7. The bar at the bottom stays: the price for my seats and **Book** (or
   "Ask for a seat").

### 3.8 A booked seat

1. The **title is the state**: "Request sent", "Bára said yes: pay to keep
   your seat", "Your seat is confirmed", "Leaves in 10 minutes", "How was
   your ride?", "Cancelled". One line under it says what happens next
   ("Bára said yes. See you on Friday at 18:30."). The "Confirmed" tag and
   the line with a tick go.
2. The **road**: Asked, Confirmed, Trip day, Done. A ride booked instantly
   starts at Confirmed. A cancelled or declined booking shows no road.
3. The ride as a **ticket**, with "1 seat" and the price under the tear
   line.
4. **The driver:** picture, name and rating with **Message** at the right;
   under a line the car, and the number plate once it shows.
5. **Where to stand,** once the seat is confirmed: a small map, the place,
   its description, "Open in maps".
6. A notice for paying, as today (the deadline with Pay, or the line about
   paying the driver in person).
7. Rows: Share trip details, Weather and roads, Report a problem, and
   **Cancel booking**, red and last.
8. Everything a booking shows today stays, in this order: reports and
   changes to the ride come directly under the title.
9. This screen is the passenger's. What a driver does with a passenger's
   booking is on the driver's ride (3.12), where cancelling it and a
   report lead back to, as today.

### 3.9 Trip day

1. The title counts down ("Leaves in 10 minutes") and then follows the
   states the trip day has today (spec 8), one title for each; the line
   under it says when and where.
2. Where to stand comes first, then the driver with the number plate as a
   tag.
3. **"I'm here"** is in a bar at the bottom of the screen, and "The driver
   didn't come" takes its place when that is offered.
4. The driver's trip day keeps its list of stops with who gets in and out
   at each; its "I'm here" moves into the bar at the bottom as well.

### 3.10 My rides

1. Title "My rides" with **Offer a ride** as a small button at its right;
   then Coming up and Past.
2. "Needs you" and "Coming up" as today (spec 16, 3.3), each ride a
   ticket. The foot of a ride that needs me is a yellow tag saying what
   ("Answer Dóra's request", "Pay by 20:46", "Leaves in 40 minutes"), and
   the ticket opens where that is done.
3. Under Past, a finished ride whose rating can still be given has the
   yellow tag "Rate the driver" or "Rate your passenger" in its foot, and
   opens the rating (decision 9).
4. My trips (`/drive/trips`) goes; its address leads to My rides. Drafts
   are listed on Offer (3.11, item 6; spec 16, decision 6), and what led
   to My trips today (Back from a posting step opened by its address,
   and deleting a draft) leads to Offer.

### 3.11 Offering a ride

1. Each step has Back and the **road** with five stops in place of "Step 5
   of 5" and the bars; the title under it at the left.
2. Steps 1 to 4 keep their fields. Step 4 says the price as kronur for the
   whole way first; the price level in per cent is the control, not the
   headline. On step 2 the time wheel for a day other than today opens at
   08:00, not at the present time (at 03:40 at night it opened at 04:00
   for a ride the next day).
3. **Check and publish:** "This is how people will see your ride." over
   the ride as a ticket. Under it one card of rows with Change, each
   opening the step it opens today: Route ("Mjódd to Vík, with 5 stops"),
   Time, Price, Seats and booking, Car, Preferences and note. The stops
   are listed once, with their times, when Time is opened; the ticket
   shows the two ends. **Delete draft** is a red row, last, and asks
   first, as today.
4. What is still missing (photo, car, licence; spec 16, 3.6, items 4 and
   5) is one `NeedsYouCard`: "One thing before your first ride. Photo and
   car are done. Your driving licence is left.", with the button for the
   next one. They are still asked here and not earlier.
5. **Publish ride** is in the bar at the bottom, as today, and waits until
   nothing is missing.
6. **Drafts** are listed on Offer, over step 1, as rows in one card, the
   one changed last first: the route and day, opening the step where it
   was left, as today. More than three fold under "Show all drafts".
   "See all drafts" and its page go with My trips (3.10).

### 3.12 The driver's ride

1. Title "Your ride to Vík"; under it what it needs ("1 request needs your
   answer") or its state.
2. The ride as a ticket, with the price for the whole way and the car
   under the tear line.
3. **Needs you:** each request as a `NeedsYouCard`: the passenger with
   rating and rides, opening the profile, the time left, the part asked for
   as a timetable with the seats and price, the message, the seats with
   this request on the fullest stretch of that part as one line ("If you
   accept, 2 of 3 seats are taken from Mjódd to Selfoss"; today it is a
   bar for each stretch, which "Each stretch" still opens), and
   **Decline** and **Accept** side by side. Decline asks why in place, as
   today. "Report Dóra" stays a quiet text link at the card's end.
4. **Passengers:** one card of rows: the picture, the name, their part
   ("Mjódd to Hella, 1 seat, 600 ISK") and the booking's tag, with a round
   **Message** button at the right once the seat is confirmed. Pressing a
   row unfolds it in place (decision 11): See profile, Cancel booking (red
   and last, while it can be cancelled) and Report. Once the ride is done
   the rating shows under the row without unfolding, as today. The card's
   last row is "Message all passengers".
5. **Seats:** one line, "1 of 3 taken at the busiest, Mjódd to Selfoss",
   with "Each stretch" opening the bars of today.
6. **Rows:** Edit the ride, Share this ride, Post it again, Post the way
   back, and Cancel the ride, red and last.

### 3.13 Messages

1. A conversation's top: Back, the picture, the name with "Driver, White
   Toyota Yaris" or "Passenger" under it, and a menu button that holds
   Report and Block. Under it one line with the ride ("Fri 27 Nov, 18:30
   Mjódd to Norðlingaholt"), opening the booking or the driver's ride.
2. The safety line stays, as the first thing in the conversation.
3. The quick answers stay as chips. The field is one line that grows as
   you type, with a round send button.
4. The list of conversations keeps its rows; each shows the ride's day and
   route under the name.

### 3.14 Profile and settings

1. **One page.** The person's card (the picture with its controls for
   adding, changing and removing it, the name, member since, rating, what
   is checked, Edit, "See your profile as others do"), then groups of
   rows, each row showing what is set now:
   - **Driving:** My cars, Driving licence.
   - **Account:** Email, Phone number, Ways to sign in, Notifications,
     Language.
   - **Safety and privacy:** Privacy and your data, Blocked people, My
     reports, Notices.
   - **Help:** Meeting points, Send feedback, My feedback, About
     PuffinRide, Legal documents.
   - **Sign out**, a row of its own at the end. "Sign out on all devices"
     moves to the end of Ways to sign in.
2. A row opens the page it has today. Three things Settings shows in
   place today have no page (decision 12):
   - **Language** opens a new page, `/settings/language`, with the two
     languages to choose from; the row shows the one in use.
   - **Notifications** opens a new page, `/settings/notifications`, with
     the switches of today and the way to the beta news.
   - **Phone number** only shows the number, as today: no chevron, and its
     line of help stands under the group.
   "Shake to send feedback" is a row with a switch under Send feedback,
   in the phone apps only, as today.
3. `/settings` leads to Profile. Signed out, Profile stays as it is.

### 3.15 Sign-in

Not changed here: [spec 29](2026-11-25-easier-sign-in.md) is changing that
screen. Once it has landed, one thing joins it from this spec: the ride
someone was about to book shows over the form as a ticket (spec 16, 3.5
already keeps the ride in sight; only its shape changes).

### 3.16 Wide screens

The kinds of screen, the widths and the top bar of spec 18 stay. What
changes:

1. **Find:** the title and its line stand at the left of the scene, with
   the car on the road at the right; the search row overlaps the scene's
   lower edge as today. Main column: the rides as tickets. Side column:
   signed in, what needs me or my next ride; signed out, "How it works"
   in three lines with **Offer a ride**; then the map, as today.
2. **A booked seat:** main column: the title, the road, where to stand and
   the driver; side column: the ticket, then the rows. On the trip day
   "I'm here" is the main button at the top of the side column.
3. **The driver's ride:** main column: Needs you, Passengers, then "Drive
   it again" (Post it again, Post the way back). Side column: the ticket,
   Seats in one line, and the rows Edit, Share and Cancel. The side column
   is whole in a window 1280 by 720 (spec 18, decision 14), which the
   one-line Seats makes possible.
4. **My rides:** a grid of tickets, as today.
5. **Profile:** the person's card in the side column, the groups in the
   main column.

![The driver's ride on a laptop, proposed](images/one-ride-one-ticket/proposal/img/new-laptop-driver-ride-first.webp)

### 3.17 Titles at the left

On a screen where you do something (a ride, a booking, a step, a list, a
conversation, Profile) the title is at the left. Find on a phone, the empty
and signed-out screens with a puffin, the screens that say a seat is
booked or a ride is published, and About keep a centred title. This
changes Martin's choice of 2026-11-14 (spec 15, 5.1) and is decision 2.

### 3.18 Plain defects

Fixed in a pull request of their own, before the rest and whatever is
chosen:

1. Titles run words together ("N1Vík" for "N1 Vík"): Fredoka's space is
   narrow, and the kerning between "1" or a space and "V" closes it
   further. At 28 px the space is 6.75 px and "N1 Vík" is 72.5 px wide
   with kerning, 77.4 px without. **Fixed:** on the web, every Fredoka
   style is set without kerning and with a word space 0.06 em wider
   (`wordsApart` in the app's tokens).
2. On Edit trip, "Change the preferences and note" runs out of its card.
   **Fixed:** where a part's title and its link do not fit on one line,
   the link goes under the title; the same on the last step of posting.
   "Remove a stop" starts at the left.
3. Profile pictures sit at mid-height beside tall blocks of text (the
   driver's card, a request). **Fixed:** the picture stands at the top,
   with the name; beside a line or two it stays at their middle.

A web journey checks each of the last two in the browser: no link of Edit
trip reaches past its part at 360 wide, and no picture starts under the
top of the text beside it.

Pictures: Edit trip
[before](images/one-ride-one-ticket/defects/edit-trip-before.webp) and
[after](images/one-ride-one-ticket/defects/edit-trip-after.webp) (a phone
360 and 390 wide, and a laptop), and a profile picture beside its text
[before](images/one-ride-one-ticket/defects/picture-before.webp) and
[after](images/one-ride-one-ticket/defects/picture-after.webp).

### 3.19 Every other screen

The sections above describe the screens that change most. Every other
screen a signed-in member reaches keeps what it holds, its order and its
texts, and takes the rules in the same pull request as its flow
(decisions 8 and 13): the head at the left (rule 5), one main button
(rule 4, R31.1), rows in place of columns of buttons and loose links, a
ticket wherever it shows a ride (R31.2), and the tags of rule 6.

| Screen | What changes |
| ------ | ------------ |
| Booking a seat (`/trips/[id]/book`) | My part as a ticket at the top; the main button stays in the bar |
| "You're booked" and "Your ride is published" | The ride as a ticket; the share panel of spec 28 stays; centred, with their puffins |
| Cancelling a booking or a ride, answering a report, "The driver didn't come", "The passenger didn't come", reporting, blocking | The head at the left; the ride as a ticket where it shows today; the main button in the bar, red when it cannot be undone |
| Rating (`/bookings/[id]/rate`) | The head at the left; the stars and fields as today |
| Edit trip (`/drive/trips/[id]/edit`) | Its parts become rows with what is set now: Time, Stops (with Add a stop and Remove a stop under it), Price, Seats, Car, How people book, Preferences and note. Each part's screen and "Check the change" keep their fields |
| Sharing a ride, messaging all passengers | The head at the left |
| A person's profile, its preview, Edit profile | The person's card as on Profile (3.14); Report and Block as rows, red and last |
| All rides (`/rides`), a place, a meeting point and their list | Rides as tickets; the rest as today |
| My cars, a car, the driving licence, the photo | The head at the left |
| The pages under Settings, Notices, Send feedback, deleting the account | The head at the left |

Not changed: signing in and joining (`/sign-in`, `/onboarding`, the
invitation and email links), which are spec 29's; About, the legal
documents, cookies and the public pages for search engines (specs 23 and
30); the console.

## 4. Rules

No business rule changes. Booking, seats (rules S1 to S4), prices and their
caps, payment deadlines (M1), cancelling and the trip's earnings limit work
as today. The posting form still needs a photo, a car and the licence
declaration before publishing (spec 3, R3.1 and R3.2; spec 16, 3.6).

- **R31.1** A screen has at most one main button: the tall filled one,
  in the bar at the bottom on a phone, at the top of the side column on a
  laptop, and in the search card on Find. The only other filled buttons
  are those of `NeedsYouCard`s, one for each thing that needs me (a
  request's Accept, "See the request"). A screen test counts them: one
  main button at most, and no filled button outside a `NeedsYouCard`.
- **R31.2** A ride is shown as a `RideTicket` wherever a member sees it in
  a list or as a summary.
- **R31.3** An action that cannot be undone is a red row, last in its
  card, and still asks before it acts, as today.
- **R31.4** Sun yellow as a card's colour is kept for what needs the
  member now, and amber as a tag's for what is theirs to do. Neither is
  used for decoration or for a problem (those are red).

## 5. Screens

Each screen as it is now beside the proposal, the first screen and the
whole of it, is on the [proposal page](https://claude.ai/artifact/3hMRPHSfiQxqVFkhtdAQtx)
and in [images/one-ride-one-ticket/proposal/img/](images/one-ride-one-ticket/proposal/img/)
(`now-…` and `new-…`; `-first` is the first screen). The drawings use the
app's own fonts, icons and drawings; fictional people and rides only.

| Screen | Now | Proposed |
| ------ | --- | -------- |
| Find, signed in | [now-find](images/one-ride-one-ticket/proposal/img/now-find.webp) | [new-find](images/one-ride-one-ticket/proposal/img/new-find.webp) |
| Search results | [now-results](images/one-ride-one-ticket/proposal/img/now-results.webp) | [new-results](images/one-ride-one-ticket/proposal/img/new-results.webp) |
| A ride's details | [now-trip](images/one-ride-one-ticket/proposal/img/now-trip.webp) | [new-trip](images/one-ride-one-ticket/proposal/img/new-trip.webp) |
| A booked seat | [now-booking](images/one-ride-one-ticket/proposal/img/now-booking.webp) | [new-booking](images/one-ride-one-ticket/proposal/img/new-booking.webp) |
| Trip day | [now-trip-day](images/one-ride-one-ticket/proposal/img/now-trip-day.webp) | [new-trip-day](images/one-ride-one-ticket/proposal/img/new-trip-day.webp) |
| Offering, last step | [now-offer](images/one-ride-one-ticket/proposal/img/now-offer.webp) | [new-offer](images/one-ride-one-ticket/proposal/img/new-offer.webp) |
| The driver's ride | [now-driver-ride](images/one-ride-one-ticket/proposal/img/now-driver-ride.webp) | [new-driver-ride](images/one-ride-one-ticket/proposal/img/new-driver-ride.webp) |
| My rides | [now-my-rides](images/one-ride-one-ticket/proposal/img/now-my-rides.webp), [My trips](images/one-ride-one-ticket/proposal/img/now-my-rides-2.webp) | [new-my-rides](images/one-ride-one-ticket/proposal/img/new-my-rides.webp) |
| A conversation | [now-chat](images/one-ride-one-ticket/proposal/img/now-chat.webp) | [new-chat](images/one-ride-one-ticket/proposal/img/new-chat.webp) |
| Profile and settings | [now-profile](images/one-ride-one-ticket/proposal/img/now-profile.webp), [Settings](images/one-ride-one-ticket/proposal/img/now-profile-2.webp) | [new-profile](images/one-ride-one-ticket/proposal/img/new-profile.webp) |
| Find, laptop | [now-laptop-find](images/one-ride-one-ticket/proposal/img/now-laptop-find.webp) | [new-laptop-find](images/one-ride-one-ticket/proposal/img/new-laptop-find.webp) |
| The driver's ride, laptop | [now-laptop-driver-ride](images/one-ride-one-ticket/proposal/img/now-laptop-driver-ride.webp) | [new-laptop-driver-ride](images/one-ride-one-ticket/proposal/img/new-laptop-driver-ride.webp) |
| Find, Icelandic and dark | | [new-home-is-dark](images/one-ride-one-ticket/proposal/img/new-home-is-dark.webp) |

How the pictures were made, and how to make them again:
[images/one-ride-one-ticket/src/](images/one-ride-one-ticket/src/README.md).

## 6. Data and API

No new tables and no new endpoint: every screen shows what it shows
today, in another order and shape. One thing is missing from what Find and
My rides load, named below.

- What needs me (3.3, item 3) is worked out from my upcoming bookings and
  the rides I drive (`GET /v1/me/bookings` and `GET /v1/me/trips` with
  `when=upcoming`), which Find and My rides already load and merge (spec
  16, section 6). They carry what the three kinds need: a booking's
  status, `paymentDueAt` and `tripDay`; a ride's `openRequests`,
  `requestsCloseAt` and `phase`. Which comes first, and its kind, is a
  function in `packages/domain`, used by Find and My rides alike; it
  takes the place of `needsYou` in `my-rides/rides.ts`.
- **Missing today:** "Dóra asks for 1 seat, Mjódd to Selfoss" names the
  person, the seats and the part asked for. A ride in `GET /v1/me/trips`
  carries only the number of requests and their first deadline. Working
  choice (decision 14): the ride gains `firstRequest`, the first name,
  the seats and the two stops of the request that closes first, which the
  driver already sees on the ride. With more than one request the card
  says "2 requests to answer". The plan may instead load the ride's
  requests, as the driver's ride does, when `openRequests` is above zero.
- A rating to give is known from a finished booking's `review`, which My
  rides loads under Past. Find loads upcoming rides only, which is why a
  rating is not raised there (decision 9).
- "1 of 3 taken at the busiest, Mjódd to Selfoss" (3.12) comes from the
  seats taken on each stretch, which the driver's ride already has; naming
  the busiest stretch is a function in `packages/domain`.
- A request's "11 h left to answer" comes from `requestsCloseAt` on Find
  and My rides, and from the request's own deadline on the driver's ride.
- Two new addresses, `/settings/language` and `/settings/notifications`
  (3.14); `/drive/trips` and `/settings` lead to My rides and Profile.
- The plan checks each of these against the API before the first pull
  request; a field that turns out to be missing is added there, and named
  in the plan.

## 7. Privacy and safety

- Nothing new is collected or stored, and nobody sees what they cannot
  see today. `firstRequest` (section 6) gives a driver, in the list of
  their own rides, the first name of someone asking for a seat, which the
  ride itself already shows them. The number plate still shows only once
  the seat is confirmed; a phone number never shows.
- Report and Block stay two presses away at most: in a conversation's
  menu, on a person's profile, and as a row on a booking and a ride's
  details. The safety line in a conversation stays.
- Asking before cancelling, declining or blocking stays as it is.
- Pictures in this spec show fictional people, rides and addresses made by
  the test server.

## 8. Texts

New and changed texts, both languages; the Icelandic is for Martin or a
native speaker to check. Every other text keeps its key.

| Text | English | Icelandic |
| ---- | ------- | --------- |
| Greeting on Find | Hi {name} | Hæ {name} |
| A request needs me | {name} asks for {count, plural, one {# seat} other {# seats}} | {name} biður um {count} sæti |
| Its detail | {route}, {day}. {time} left to answer. | {route}, {day}. {time} eftir til að svara. |
| Its button | See the request | Sjá beiðnina |
| Several requests | {count} requests to answer | {count} beiðnir bíða svars |
| A seat to pay for | {name} said yes: pay to keep your seat | {name} samþykkti: greiddu til að halda sætinu |
| Its detail | {route}, {day}. Pay by {time}. | {route}, {day}. Greiddu fyrir kl. {time}. |
| A ride on its trip day, and the trip day's title | Leaves in {minutes} minutes; Leaves at {time} | Fer eftir {minutes} mínútur; Fer kl. {time} |
| Its button | See your ride | Skoða ferðina |
| More that needs me | and {count} more | og {count} í viðbót |
| Tags on my rides | You drive, Passenger | Þú ekur, Farþegi |
| A booking's road | Asked, Confirmed, Trip day, Done | Beiðni, Staðfest, Ferðadagur, Lokið |
| The posting road | Route, Time, Seats, Price, Check | Leið, Tími, Sæti, Verð, Yfirlit |
| Driver's title | Your ride to {place} | Ferðin þín: {from} → {to} |
| A route in a title | {from} to {to} | {from} → {to} |
| Details | Where you sit, The whole route | Hvar þú situr, Öll leiðin |
| Seats, one line | {taken} of {seats} taken at the busiest, {from} to {to} | {taken} af {seats} upptekin þar sem mest er, {from} → {to} |
| Its link | Each stretch | Hver áfangi |
| Seats with a request | If you accept, {taken} of {seats} seats are taken from {from} to {to} | Ef þú samþykkir eru {taken} af {seats} sætum upptekin: {from} → {to} |
| Last step | This is how people will see your ride. | Svona sér fólk ferðina þína. |
| What is missing | One thing before your first ride | Eitt eftir fyrir fyrstu ferðina |
| Its detail | Photo and car are done. Your driving licence is left. | Mynd og bíll eru komin. Ökuskírteinið er eftir. |
| Publishing | Publish ride | Birta ferð |
| Laptop heading | Drive it again | Aka aftur |
| End of results | That's every ride found | Þetta eru allar ferðirnar |
| Profile groups | Driving, Account, Safety and privacy, Help | Akstur, Aðgangur, Öryggi og persónuvernd, Aðstoð |
| Drafts on Offer | Show all drafts | Sýna öll drög |
| A passenger's row | See profile | Skoða prófíl |

Texts that exist are reused where they say the same: "Rate the driver",
"Rate your passenger", "Pay", "Delete draft", "My reports", "Notices",
"My feedback", "Legal documents", "Message all passengers".

Icelandic place names change form after "til" ("til Víkur"), so an
Icelandic title names a route with the arrow it has today and never puts a
place after a preposition.

## 9. Testing

- **Unit:** the two domain functions of section 6; `firstRequest` in the
  API, with its integration test; every new key in both languages.
- **Screen tests** (`renderApp`), written first for each pull request: a
  ticket's parts for each kind of ride; the road's step and its label for
  screen readers; Find with each kind of thing that needs me, with a
  next ride and with neither; on each changed screen one main button and
  no filled button outside a `NeedsYouCard` (R31.1); destructive rows
  last (R31.3); a passenger's row unfolding to what it offers today; every
  draft on Offer; `/drive/trips` and `/settings` leading to My rides and
  Profile; each status tag's kind (3.3, item 3).
- **Web journeys** (Playwright): the existing journeys keep passing with
  the new names; one new journey reads the trip day's first screen on a
  phone and finds "I'm here" inside it.
- **Look:** each pull request adds its screens, phone and laptop, light
  and dark, English and Icelandic, to
  [images/one-ride-one-ticket/](images/one-ride-one-ticket/) for Martin to
  compare with the drawings.
- **Accessibility:** contrast of text on `warningSoft` and of the road's marks
  checked in both themes; the tear line and the road are decoration and
  hidden from screen readers; focus order follows the reading order.

## 10. Out of scope

- A new look, new drawings, a new logo.
- New features: seat picking, saved searches, a map in the results on a
  phone, push notifications.
- Sign-in and sign-up (spec 29), the console, emails, the marketing pages'
  texts, About and the footer (spec 30).
- The phone apps' builds: the same screens serve them, and they are checked
  when the apps are built.

## Decisions

Working choices, for Martin to change:

| # | Question | Working choice |
| - | -------- | -------------- |
| 1 | Which way? | B, "One ride, one ticket" (3.1). Asked on the thread's card, 2026-11-26 |
| 2 | Titles | At the left on screens where you do something; centred on Find on a phone, empty screens and About (3.17). Changes the choice of 2026-11-14 |
| 3 | Profile and Settings | One page of grouped rows (3.14) |
| 4 | My trips | Goes; My rides lists both (3.10) |
| 5 | Ride or trip? | "Ride" in every English text a member reads, except "Trip day" (3.4) |
| 6 | Steps of offering a ride | The road with the car instead of the five bars (3.11) |
| 7 | Find, signed in | What needs me, else my next ride, over the search; the next ride under the search when something needs me (3.5). Changes spec 16, 3.2, item 2, where the next ride always comes first |
| 8 | Order of building | Defects; the parts and the tags; Find and results (with All rides and a place); a ride and booking a seat (with "You're booked"); a booked seat and trip day (with cancelling, the reports and rating); the driver's ride and My rides (with Edit trip, cancelling a ride and sharing); offering (with the drafts and "Your ride is published"); Messages; Profile (with a person's profile and the pages under Settings); a last pass over laptop, dark and Icelandic. Each is a pull request to staging; production on Martin's go |
| 9 | Is a rating something that "needs you"? | No: a request to answer, a seat to pay for and a ride on its trip day are. A rating is asked on the booking, under Past and by email (3.3, 3.10). The proposal page listed it at first; Find does not load finished rides |
| 10 | Status tags | They follow rule 6: declined, expired, cancelled and withdrawn become quiet, "Did not show up" red, and paying stays amber (3.3, item 3) |
| 11 | A passenger on the driver's ride | The row unfolds in place to See profile, Cancel booking and Report, with Message as a button on the row. Those three take one press more than today; there is no new screen (3.12) |
| 12 | Language, notifications and the phone number | Language and Notifications get a page each; the phone number is a row that opens nothing (3.14) |
| 13 | The screens that are not drawn | They keep what they hold and take the rules with their flow (3.19) |
| 14 | Naming who asks for a seat, on Find and My rides | A ride in my list gains `firstRequest` in the API (section 6) |
| 15 | Drafts | All of them are listed on Offer; the page of drafts goes with My trips (3.11, item 6) |
| 16 | Filled buttons | One main button a screen; the button of a `NeedsYouCard` is the only other filled one (R31.1) |
