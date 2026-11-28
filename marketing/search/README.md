# Found for our name, and in AI answers

Made 2026-11-28 for Martin: "if I google puffin ride, why isn't it first",
and "it'd be great to have the AI overview about us". What the site tells
Google is in [spec 23, 3.6, item 8](../../docs/specs/2026-11-22-google-analytics-and-search.md);
this page is what happens outside the code.

## Why "puffin ride" does not show us first yet

- **We are new.** puffinride.is opened on 22 November 2026, and
  almost no other site links to it yet. Links from other sites are what
  Google trusts most.
- **"puffin ride", in two words, means puffin tours.** People type it to
  find boat trips to see puffins, and the sites that sell those tours
  have years of links and reviews. So Google reads the two words as
  "puffin tour" and shows those.
- **"puffinride", in one word, is ours alone.** In Search Console (below)
  see which words people actually use to find us, and where we are for
  each.
- **What moves it:** other sites that mention and link to PuffinRide,
  people who search for us by name and click, and time: weeks, not days.
  No setting buys first place, and nobody can promise it.

## The AI Overview

Google decides when to show an AI Overview and what goes in it. It builds
one from pages it already ranks for the question, so the way in is the
same as for ranking: clear pages and other sites that mention us. Nobody
can ask for one or buy one, and Google has said `llms.txt` files make no
difference, so we have none.

What the site now gives an answer to quote: Carpool in Iceland starts its
questions with "What is PuffinRide?", one paragraph that says it whole,
and the front page tells Google our name (also written Puffin Ride), our
logo, what we are, our email address, and that the Facebook and Instagram
pages are ours.

ChatGPT search, Microsoft Copilot and DuckDuckGo lean on Bing's index, so
be in Bing too (below).

## Martin's steps

### Google Search Console (as `admin@puffinride.is`)

1. **URL inspection:** type `https://puffinride.is/` in the bar at the
   top, then **Request indexing**. Do the same for
   `https://puffinride.is/carpool-iceland` and `https://puffinride.is/about`.
2. **Check the new data:** open the
   [Rich Results Test for the front page](https://search.google.com/test/rich-results?url=https%3A%2F%2Fpuffinride.is%2F).
   It should find "Organization" and no errors.
3. **Performance > Search results:** add a filter **Query** containing
   `puffin`. You see each search that showed us, how often, and our place.
   Look again in two weeks.
4. **Sitemaps:** `https://puffinride.is/sitemap.xml` should say Success.

### Bing Webmaster Tools

1. Open [bing.com/webmasters](https://www.bing.com/webmasters) and sign in
   with the `admin@puffinride.is` Google account.
2. Choose **Import from Google Search Console**: it adds puffinride.is
   and its sitemap with no DNS record to type.

## Honest places to be mentioned and linked from

Always as yourself, saying you run PuffinRide; keep to each group's rules;
never a word about prices, payments or fees. Never buy links, swap links,
post from made-up accounts or ask friends for reviews as if they were
riders: Google's spam rules punish exactly that, and it is not who we are.

### Our own pages

- The Facebook Page and the Instagram profile: puffinride.is in the
  website field and the bio.
- Your own Facebook and LinkedIn profiles: "Founder of PuffinRide", with
  the link. A LinkedIn page for PuffinRide too.

### Where people look for rides

- Facebook groups where people in Iceland offer and look for rides
  (search Facebook for "far", "samferða", "rideshare Iceland"). Where a
  group allows it, post a real ride with its PuffinRide link rather than
  an advert.
- Reddit's r/VisitingIceland and r/Iceland: answer when someone asks how
  to get around without a car, and say that you run PuffinRide.
- Hitchwiki's Iceland page, which anyone can edit: one factual line about
  PuffinRide where it lists ways to share a ride.

### Listings and guides

- Já.is: a listing for PuffinRide, if they take one before the company is
  registered.
- Travel guides' "getting around Iceland" pages (Guide to Iceland, I Heart
  Reykjavík, Iceland Review, the regional tourist offices such as Visit
  South Iceland): write and ask whether they would list carpooling with
  PuffinRide beside the buses.
- Not Google Business Profile: it is for places customers visit, and an
  online service with no such place is not eligible.

### News

- A short note, in Icelandic, to the local and national news: Sunnlenska
  and Dagskráin in the south, mbl.is, Vísir, RÚV; in English, Iceland
  Review and The Reykjavík Grapevine. The story: a new Icelandic carpool
  site, made in Hella, with meeting points in towns and at sights around
  the country, in an open beta. An article is a strong link, and the kind
  of page AI answers quote.
- Rangárþing ytra's news page, and towns with few buses.

### Students and newcomers

- Student unions at the University of Iceland, Reykjavík University, the
  University of Akureyri, Bifröst, Hvanneyri and Hólar: students travel
  home at weekends. Ask whether they would share it in a newsletter or
  their groups.

### Later

- KLAK's Gulleggið, the startup competition, early each year.
- Wikipedia and Wikidata only once newspapers have written about us: they
  need independent sources, and an entry without them is deleted.
