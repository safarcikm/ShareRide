# Privacy Policy v4: the paragraphs the phone apps need

The draft paragraphs the phone apps add to the privacy policy (spec 32,
section 7; ADR 0043), handed to the website redesign's work, which publishes
Privacy Policy version 4 with its own "on your Profile" wording, so there is
one new version, not two. The published text in `packages/db/src/legal`
is the one that counts; this page only records what the stores asked for.

## English

**Section 5, in the list of providers, after the Expo push line:**

- **Expo (app updates):** when the PuffinRide app opens on your phone, it asks Expo for a newer version of its own code, sending a random ID the app makes when it is installed (not linked to your account), the app's version and the phone's system. United States.

**Section 5, a new paragraph after the one on Google and Apple sign-in:**

If you get the PuffinRide app from Google Play or the App Store, Google or Apple handle the download, any rating or review you leave in their store, and the crash reports they collect if you allow it, under their own terms and privacy policies. If you test the app before it is released, through Apple's TestFlight or Google Play testing, we give Apple or Google your email address to invite you, and they show us how the test version works for you: installs, crashes, your phone's model and system, and the feedback you send, with any screenshot you add.

**Section 6, the list of providers outside the EEA:** add "Expo for app updates" and "Apple and Google for testing the app before release".

**Section 7, Delete your account:** may add "puffinride.is/delete-account says how, step by step."

## Íslenska

**5. kafli, í listanum yfir þjónustuaðila, á eftir línunni um Expo og tilkynningar:**

- **Expo (uppfærslur appsins):** þegar PuffinRide-appið opnast í símanum spyr það Expo hvort til sé nýrri útgáfa af kóða þess og sendir handahófskennt auðkenni sem appið býr til við uppsetningu (ekki tengt aðganginum þínum), útgáfu appsins og stýrikerfi símans. Í Bandaríkjunum.

**5. kafli, ný málsgrein á eftir þeirri um innskráningu með Google og Apple:**

Ef þú sækir PuffinRide-appið í Google Play eða App Store sjá Google eða Apple um niðurhalið, einkunnir eða umsagnir sem þú skilur eftir í verslun þeirra og hrunskýrslur sem þau safna ef þú leyfir það, samkvæmt eigin skilmálum og persónuverndarstefnu. Ef þú prófar appið áður en það kemur út, í TestFlight hjá Apple eða í prófunum Google Play, gefum við Apple eða Google netfangið þitt til að bjóða þér, og þau sýna okkur hvernig prófunarútgáfan virkar hjá þér: uppsetningar, hrun, gerð símans og stýrikerfi, og ábendingar sem þú sendir, með skjámynd ef þú bætir henni við.

**6. kafli, listinn yfir þjónustuaðila utan EES:** bæta við „Expo vegna uppfærslna appsins“ og „Apple og Google vegna prófana á appinu fyrir útgáfu“.

**7. kafli, Eyða aðganginum:** má bæta við „Á puffinride.is/delete-account sérðu hvernig, skref fyrir skref.“

## Register rows that go with it (written in the store thread's PR)

Google Play and the App Store as separate controllers for downloads, ratings and
their own crash reports; Apple TestFlight and Google Play testing for testers'
details. The privacy register's provider table gets these in the store kit PR.
