# PuffinRide Facebook and Instagram page kit

Nov 25, 2026 · @Martin

Everything you need to set up the PuffinRide Facebook Page and Instagram profile: the texts below, and the pictures beside this file in the repository's `marketing/social-pages/` folder. Nothing here mentions money, payments or fees, and there is no Meta Pixel.

## Names and usernames

Use the same name and username on both, so people find one from the other. Facebook and Instagram tell you as you type whether a username is free; I could not check that from here.

| Field | Facebook Page | Instagram | If it is taken |
| --- | --- | --- | --- |
| Name | PuffinRide | PuffinRide · Samferða (21 of 30 characters; the word helps Icelandic search) | PuffinRide |
| Username | @puffinride | puffinride | puffinride.is, then puffinride\_is |
| Web address it gives | facebook.com/puffinride | instagram.com/puffinride |  |

If you have to use a fallback, use the same one on both.

## Bios and About text

Both bios lead with the front page's own words ("Verum samferða", "Share your ride") and name what PuffinRide is in both languages, because people search for "samakstur" and "carpool".

**Facebook bio** (95 of 101 characters):

> Samferða um Ísland: finndu far eða bjóddu far. Carpooling across Iceland: find or offer a ride.

**Instagram bio** (122 of 150 characters, three lines):

```text
Verum samferða · Share your ride
Samakstur um Ísland · Carpooling across Iceland
Yfir 100 mótsstaðir · 100+ meeting points
```

**Longer About text.** Facebook's new Pages keep only the short bio, so use this as the start of the pinned welcome post, and anywhere else a longer description fits.

> PuffinRide er samakstur um allt Ísland. Bílstjórar bjóða laus sæti í bílnum sínum og farþegar bóka sæti alla leið eða bara hluta hennar. Ferðir stoppa á yfir 100 mótsstöðum, frá Ísafirði til Hafnar, og hver mótsstaður segir þér hvar á að standa. Þú sérð hver keyrir áður en þú bókar og spjallar við bílstjórann í appinu. Opið öllum, á íslensku og ensku, á puffinride.is.
>
> PuffinRide is carpooling across Iceland. Drivers offer the empty seats in their car, and passengers book a seat for the whole way or just part of it. Trips stop at 100+ meeting points from Ísafjörður to Höfn, and each one tells you where to stand. You see who's driving before you book, and chat with the driver in the app. Open to everyone, in Icelandic and English, at puffinride.is.

## Category, button, contact and links

Pick "Transportation service" and stay clear of "Taxi service": PuffinRide is cost sharing between people going the same way, not a taxi, and the category should not suggest otherwise.

| Field | Facebook Page | Instagram |
| --- | --- | --- |
| Category | Transportation service, Website | Business account, category Transportation service |
| Action button | Sign up, opening the website link below | None (the link sits in the bio) |
| Email | `admin@puffinride.is` | `admin@puffinride.is` (as the contact option) |
| Phone | Leave empty | Leave empty |
| Address | None: choose that you have no shop; service area Iceland | None |
| Website | `https://puffinride.is/?utm_source=facebook&utm_medium=social&utm_campaign=page` | `https://puffinride.is/?utm_source=instagram&utm_medium=social&utm_campaign=bio` |
|  |  |  |

Links in posts and stories, so Google Analytics shows where visits come from (the same tags as the launch ads):

| Where | Link |
| --- | --- |
| Posts on the Facebook Page | `https://puffinride.is/?utm_source=facebook&utm_medium=social&utm_campaign=launch` |
| Posts you share into Facebook groups | `https://puffinride.is/?utm_source=facebook_groups&utm_medium=social&utm_campaign=launch` |
| Link sticker in an Instagram story | `https://puffinride.is/?utm_source=instagram&utm_medium=story&utm_campaign=launch` |
| Meeting points post | `https://puffinride.is/meeting-points?utm_source=facebook&utm_medium=social&utm_campaign=launch` |

Instagram posts can't hold a link, so their captions say "puffinride.is" or "link in bio".

## Pictures

All pictures are in this folder (`marketing/social-pages/`), drawn in the same look as the site and the launch ads: the puffin pin, the yellow car, moss and glacier colours. Every post comes in Icelandic (`-is-`) and English (`-en-`).

| What | File | Size (px) | Where it goes |
| --- | --- | --- | --- |
| Profile picture | `profile/puffinride-profile-picture-1080.png` | 1080 × 1080 | Facebook and Instagram. Both show it as a circle; `profile/check-how-it-looks-in-the-circle.png` shows the crop |
| Facebook cover | `cover/puffinride-facebook-cover-1640x624.png` | 1640 × 624 | The Page's cover. The words sit in the middle, which phones show |
| Highlight covers | `highlights/highlight-1-how … highlight-6-questions` | 1080 × 1920 | Instagram story highlights, in this order: Svona virkar, Finna far, Bjóða far, Mótsstaðir, Öryggi, Spurningar |
| Posts | `posts/post-01-welcome … post-07-feedback` | 1080 × 1350 | Facebook and Instagram feed. 4:5 takes the most room on a phone, and the sides stay clear for Instagram's 3:4 grid |
| How it works | `posts/post-02-how-it-works-<is or en>-slide1 … slide6` | 1080 × 1350 | One carousel post, slides in order |
| Stories | `stories/story-welcome-<is or en>`, plus the six launch ad stories | 1080 × 1920 | Instagram and Facebook stories. Words stay out of the top 270 and bottom 340 px |
| Reel | `reels/reel-share-your-ride-<is or en>-1080x1920.mp4`, cover `reels/reel-share-your-ride-<is or en>-cover-1080x1920.png` | 1080 × 1920, 15 s | Instagram and Facebook reels. Words stay out of the top 250 and bottom 420 px and clear of the buttons on the right |
| Shared ride card | `link-preview/` | 1200 × 630 | Not uploaded by you: the site makes it for each shared trip link once that change is live |

The source drawings are in `src/kit.py` (it reuses the launch ads' `../launch-ads/src`), so any text can be changed and the pictures rebuilt; [the folder's README](../README.md) says how.

## First posts

Seven posts and a story, each with its caption in both languages, at most five hashtags (Instagram's limit) and alt text for screen readers. Instagram and Facebook show about the first 125 characters before "more", so the point comes first.

How to post both languages:

- **Facebook:** one post, Icelandic caption first, then the English one below it, with the Icelandic picture.
- **Instagram:** one post with two pictures, Icelandic first and English second, so people swipe for their language. The how-it-works carousel is the exception: post the Icelandic slides first and the English ones two days later.
- **Alt text:** Instagram, Advanced settings, Accessibility; Facebook, edit the photo, Alternative text. Use the text in the picture's language.

### 1. Welcome (pin this one)

Picture: `post-01-welcome-is` and `-en`. Pin it on Facebook (Feature on Page) and on Instagram (Pin to your profile).

> Verum samferða! PuffinRide er samakstur um allt Ísland: bílstjórar bjóða laus sæti í bílnum og farþegar bóka sæti alla leið eða bara hluta hennar. Ferðir stoppa á yfir 100 mótsstöðum, frá Ísafirði til Hafnar. Opið öllum á puffinride.is.
>
> Share your ride! PuffinRide is carpooling across Iceland: drivers offer the empty seats in their car, and passengers book a seat for the whole way or just part of it. Trips stop at 100+ meeting points from Ísafjörður to Höfn. Open to everyone at puffinride.is.

Hashtags: #PuffinRide #samferða #samakstur #carpooling #Iceland

Alt text: "Teikning af tveimur lundum í gulum bíl á vegi milli Ísafjarðar og Egilsstaða, fjöll og jökull í baksnæ. Texti: Verum samferða." / "Drawing of two puffins in a yellow car on a road between Ísafjörður and Egilsstaðir, mountains and a glacier behind. Text: Share your ride."

### 2. How it works (carousel, pin this one too)

Picture: `post-02-how-it-works-is-slide1` to `slide6`, then the `-en-` slides two days later.

> Svona virkar PuffinRide í fjórum skrefum. Strjúktu til að sjá:
>
> 1. Leitaðu að fari: hvaðan, hvert og hvaða dag.
> 2. Sjáðu hver keyrir: mynd, staðfest símanúmer og einkunnir.
> 3. Bókaðu sæti, alla leið eða bara hluta hennar, og spjallaðu við bílstjórann.
> 4. Hittist á mótsstaðnum, sem segir þér hvar á að standa. Áttu laus sæti? Bjóddu far á puffinride.is.
>
> How PuffinRide works, in four steps. Swipe to see:
>
> 1. Search for a ride: where from, where to and the day.
> 2. See who's driving: a photo, a verified phone number and ratings.
> 3. Book a seat, for the whole way or just part of it, and chat with the driver.
> 4. Meet at the meeting point, which tells you where to stand. Got empty seats? Offer a ride at puffinride.is.

Hashtags: #PuffinRide #samakstur #samferða #carpooling #Iceland

Alt text, one per slide (English; the Icelandic slides say the same):

1. "How PuffinRide works: four numbered steps, search for a ride, see who's driving, book a seat, meet at the meeting point."
2. "Step 1: a search form from Reykjavík BSÍ to Akureyri Hof on Friday 18 December, and one ride found, 09:00 to 13:30, with 2 free seats."
3. "Step 2: a driver's profile with a puffin picture, phone verified, rating 4.9 from 12 ratings, and a short review."
4. "Step 3: a trip through Reykjavík, Borgarnes, Blönduós and Akureyri with the part from Borgarnes booked, and two chat messages."
5. "Step 4: the BSÍ meeting point card, where to stand: by the main entrance of the bus terminal. A puffin waves at the pin as a car arrives."
6. "Got empty seats? A yellow car with one free seat on the road from Selfoss to Reykjavík."

### 3. Meeting points

Picture: `post-03-meeting-points-is` and `-en`.

> Yfir 100 mótsstaðir um allt land! Bensínstöðvar, umferðarmiðstöðvar og vinsælir áfangastaðir þar sem bílstjórar og farþegar hittast, og hver þeirra segir þér hvar á að standa. Vantar stað í þínum bæ? Segðu okkur í athugasemd. Sjáðu á korti á puffinride.is/meeting-points
>
> 100+ meeting points around Iceland! Fuel stations, bus terminals and favourite sights where drivers and passengers meet, and each one tells you where to stand. Missing a place in your town? Tell us in a comment. See them on the map at puffinride.is/meeting-points

Hashtags: #PuffinRide #mótsstaðir #samakstur #carpooling #Iceland

Alt text: "Kort af Íslandi með 136 punktum, einum fyrir hvern mótsstað, allt í kringum landið." / "Map of Iceland with 136 dots, one for each meeting point, all around the country."

### 4. Safety

Picture: `post-04-safety-is` and `-en`.

> Vittu með hverjum þú ferð. Á PuffinRide eru allir með staðfest símanúmer og bílstjórar með mynd og einkunnir frá fyrri ferðum. Eftir bókun spjallið þið saman í appinu, og ef eitthvað er að getur þú tilkynnt eða útilokað. puffinride.is
>
> Know who you're riding with. On PuffinRide everyone has a verified phone number, and drivers have a photo and ratings from earlier trips. Once you've booked, you chat in the app, and if something's wrong you can report or block. puffinride.is

Hashtags: #PuffinRide #samakstur #öryggi #carpooling #Iceland

Alt text: "Fjórir punktar um öryggi: bílstjórar með mynd og einkunnir, allir með staðfest símanúmer, spjall í appinu eftir bókun, tilkynna eða útiloka. Lundar í gulum bíl." / "Four safety points: drivers with a photo and ratings, everyone with a verified phone number, chat in the app once booked, report or block. Puffins in a yellow car."

### 5. Christmas (first week of December)

Picture: `post-05-christmas-is` and `-en`.

> Á leið heim um jólin? Bjóddu laus sætin í bílnum eða finndu far heim fyrir hátíðarnar. Fleiri í hverjum bíl, færri bílar á veginum. Settu ferðina inn snemma svo aðrir finni hana. puffinride.is
>
> Heading home for Christmas? Offer the empty seats in your car or find a ride home for the holidays. More people in each car, fewer cars on the road. Post your trip early so others can find it. puffinride.is

Hashtags: #PuffinRide #jólin #samferða #carpooling #Iceland

Alt text: "Lundar í gulum bíl á snævi þknum vegi frá Reykjavík til Egilsstaða undir norðurljósum. Texti: Á leið heim um jólin?" / "Puffins in a yellow car on a snowy road from Reykjavík to Egilsstaðir under the northern lights. Text: Heading home for Christmas?"

### 6. Travelling in winter

Picture: `post-06-winter-travel-is` and `-en`.

> Á ferð að vetri? Áður en lagt er af stað: athugaðu færðina á umferdin.is, skoðaðu veðrið á vedur.is og skildu eftir ferðaáætlun á safetravel.is. Ef ferðin breytist, láttu hina vita í spjallinu. Góða ferð!
>
> Travelling in winter? Before you set off: check road conditions at umferdin.is, the weather at vedur.is, and leave a travel plan at safetravel.is. If plans change, tell the others in the chat. Have a good trip!

Hashtags: #PuffinRide #vetrarakstur #samakstur #carpooling #Iceland

Alt text: "Fjógur ráð fyrir vetrarakstur með umferdin.is, vedur.is og safetravel.is. Lundar í gulum bíl í snæ og logndrifi." / "Four winter travel tips naming umferdin.is, vedur.is and safetravel.is. Puffins in a yellow car in light snow."

### 7. Tell us what you think

Picture: `post-07-feedback-is` and `-en`.

> PuffinRide er nýtt og við bætum það á hverjum degi. Hvað virkar vel og hvað vantar? Skrifaðu athugasemd hér, eða sendu ábendingu í appinu: á prófílnum þínum, Senda ábendingu. Við lesum allt.
>
> PuffinRide is new and we're making it better every day. What works, and what's missing? Leave a comment here, or send feedback in the app: on your profile, Send feedback. We read everything.

Hashtags: #PuffinRide #samakstur #carpooling #Iceland

Alt text: "Lundi með talblöðru á grasi. Texti: Segðu okkur hvað þér finnst." / "A puffin with a speech bubble on the grass. Text: Tell us what you think."

### Story: welcome

Picture: `story-welcome-is` and `-en`. Add a link sticker ("puffinride.is", the story link from the links table) in the moss area under the road, above the bottom 340 px. Save it to the "Svona virkar" highlight. The six launch ad stories go to "Finna far" (ride, part) and "Bjóða far" (drive).

### Reel: share your ride

Video: `reels/reel-share-your-ride-is-1080x1920.mp4` and `-en-`, 15 seconds. The yellow car drives in with empty seats, a puffin waits at the Borgarnes meeting point and hops into the back seat, the car drives on, and it ends on "Verum samferða" / "Share your ride" and puffinride.is. The words are on the screen, so it works with the sound off.

- **Sound:** the file has a silent sound track. Add a song from Instagram's or Facebook's own music library in the app (Add audio); those are cleared for reels, other music may not be.
- **Cover:** Edit cover, Add from camera roll, the `-cover-` picture (the end card).
- **Both languages:** post the Icelandic reel first and the English one three days later, as with the carousel. Share each one to Facebook as a reel too: Instagram offers it when the accounts are linked, or post it on the Page.

> Laus sæti í bílnum? Bjóddu far á PuffinRide og farþegar hoppa inn á mótsstöðum á leiðinni, alla leið eða bara hluta hennar. Verum samferða! puffinride.is
>
> Empty seats in your car? Offer a ride on PuffinRide, and passengers hop in at meeting points on the way, for the whole trip or just part of it. Share your ride! puffinride.is

Hashtags: #PuffinRide #samferða #samakstur #carpooling #Iceland

Alt text: "Teiknimynd: gulur bíll með lunda við stýrið keyrir eftir vegi, lundi bíður við mótsstaðinn í Borgarnesi og hoppar inn í aftursætið, og bíllinn heldur áfram. Texti: Laus sæti í bílnum? Farþegar hoppa inn á leiðinni. Alla leið eða bara hluta hennar. Verum samferða. puffinride.is" / "Animation: a yellow car with a puffin driving goes along a road, a puffin waits at the Borgarnes meeting point and hops into the back seat, and the car drives on. Text: Empty seats in your car? Passengers hop in on the way. The whole way or just part of it. Share your ride. puffinride.is"

## Four-week starter plan

Two or three posts a week from Monday 30 November, with Christmas early enough for people to plan the trip home. Meta Business Suite (business.facebook.com, Planner) schedules the same post to Facebook and Instagram at once. Evenings around 20:00 suit a local audience.

| Day | Post | Where | Note |
| --- | --- | --- | --- |
| Mon 30 Nov | 1. Welcome | Both, pin it | Also share it to your own profile and to friends in Messenger |
| Tue 1 Dec | Story: welcome | Instagram and Facebook stories | Save to the "Svona virkar" highlight |
| Wed 2 Dec | 2. How it works (Icelandic slides) | Both, pin on Instagram |  |
| Thu 3 Dec | Reel (Icelandic) | Both, as a reel | Add a song from the app's music library |
| Fri 4 Dec | 2. How it works (English slides) | Both |  |
| Sun 6 Dec | Reel (English) | Both, as a reel |  |
| Mon 7 Dec | 5. Christmas | Both | Early, so drivers post trips home before people book buses |
| Wed 9 Dec | 3. Meeting points | Both, pin on Instagram | Invites comments about missing places |
| Sat 12 Dec | Launch ad story "drive" | Stories | Save to "Bjóða far" |
| Mon 14 Dec | 4. Safety | Both | Save the picture to the "Öryggi" highlight as a story too |
| Thu 17 Dec | 6. Travelling in winter | Both | The busiest travel week before Christmas |
| Sat 19 Dec | 5. Christmas again, as a story | Stories | A last reminder before the holidays |
| Mon 28 Dec | 7. Tell us what you think | Both | Quiet week: a good time to ask what people think |

After four weeks, look at which posts brought visits (Google Analytics, by `utm_source`) and make more of those.

## Messenger replies

Turn on an instant reply so nobody waits in silence (Meta Business Suite, Inbox, Automations, Instant reply), and save the answers to the questions people will ask most (Inbox, Saved replies).

### Instant reply

> Hæ og takk fyrir skilaboðin! Við svörum eins fljótt og við getum, yfirleitt innan dags. Ferðir og bókanir finnur þú á puffinride.is.
>
> Hi, and thanks for your message! We'll answer as soon as we can, usually within a day. Trips and bookings are at puffinride.is.

### Saved replies

| Question | Íslenska | English |
| --- | --- | --- |
| How do I find a ride? | Farðu á puffinride.is, veldu hvaðan, hvert og hvaða dag og bókaðu sæti í ferð sem hentar. Þú getur farið alla leið eða bara hluta hennar. | Go to puffinride.is, choose where from, where to and the day, and book a seat on a trip that suits you. You can ride the whole way or just part of it. |
| How do I offer a ride? | Skráðu þig á puffinride.is og veldu Bjóða far. Þú velur leiðina, mótsstaðina og hversu mörg sæti eru laus. | Sign up at puffinride.is and choose Offer a ride. You choose the route, the meeting points and how many seats are free. |
| Where do we meet? | Á mótsstað á leiðinni. Hver mótsstaður segir þér nákvæmlega hvar á að standa: puffinride.is/meeting-points | At a meeting point on the route. Each one tells you exactly where to stand: puffinride.is/meeting-points |
| Is it safe? | Allir eru með staðfest símanúmer og bílstjórar með mynd og einkunnir. Eftir bókun spjallið þið í appinu, og þú getur tilkynnt eða útilokað ef eitthvað er að. | Everyone has a verified phone number, and drivers have a photo and ratings. Once you've booked, you chat in the app, and you can report or block if something's wrong. |
| A problem with a booking | Sendu okkur ábendingu í appinu (á prófílnum þínum, Senda ábendingu) svo við sjáum við hvaða ferð það á. Ekki senda okkur kennitölu eða kortanúmer hér. | Send us feedback in the app (on your profile, Send feedback) so we can see which trip it's about. Please don't send ID or card numbers here. |

Answer questions about a specific person or booking in the app, not in Messenger, so personal details stay out of Meta's inbox.

## Your setup checklist

About 30 minutes, in the browser you normally use for Facebook. Facebook may ask you to confirm who you are when you make a Page; finish that first.

### Facebook Page

- [ ] Check Pages for a half-made PuffinRide Page from earlier. If there is one, finish it instead of making a second.
- [ ] Create the Page: name PuffinRide, category Transportation service (add Website), the Facebook bio above.
- [ ] Profile picture `profile/puffinride-profile-picture-1080.png`, cover `cover/puffinride-facebook-cover-1640x624.png`.
- [ ] Page details: username @puffinride, website with its tag, email `admin@puffinride.is`. Leave phone and address empty.
- [ ] Add the button: Sign up, to the website link.
- [ ] Turn on the Messenger instant reply and add the saved replies.

### Instagram

- [ ] Make the account from the Page (Settings, Linked accounts, Instagram), or in the Instagram app with `admin@puffinride.is`, then link it to the Page.
- [ ] Switch to a professional account, type Business, category Transportation service.
- [ ] Username puffinride, name "PuffinRide · Samferða", the same profile picture, the Instagram bio and the Instagram link.
- [ ] Post the welcome story, then make the six highlights with their covers from `highlights/` (Instagram needs one story in a highlight before it takes a cover).

### First posts

- [ ] Schedule the posts in Meta Business Suite from the starter plan, with captions, hashtags and alt text.
- [ ] Pin the welcome post on both, and the how-it-works and meeting points posts on Instagram.
- [ ] Have a native speaker read the Icelandic once before the first post.

### Later

- [ ] When the shared ride card is live on puffinride.is, paste a trip link into Facebook's Sharing Debugger (developers.facebook.com/tools/debug) to see the card, and use Scrape Again if an old card shows.
- [ ] Don't add a Meta Pixel or connect the website to Meta; Google Analytics already counts visits by the tags above.
