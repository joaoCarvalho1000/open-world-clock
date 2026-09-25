# Age rating (IARC questionnaire)

Partner Center > Submission > Age ratings. The questionnaire is run by IARC and takes about 5 minutes. Answer for what the app does today: a local clock and time zone tool with no content, no accounts and no network features.

## Before the questions

| Field | Answer |
|---|---|
| Email for the IARC certificate | The account owner's email (IARC sends the rating certificate there) |
| Previously rated elsewhere (IARC ID from another store) | No. Leave empty unless you already rated it on another IARC store |
| Product category | **Utility, Productivity, Communication, or Other** (the non-game "all other app types" category). Not "Game", not "Social networking", not "Web browser or search engine", not "Store or retail" |

## Recommended answers

The exact wording and order vary slightly between IARC versions; the intent of each answer is below. Every answer is **No**.

| Question (paraphrased) | Answer | Why |
|---|---|---|
| Does the app contain violence, blood, gore or references to violence? | No | Clock cards, a map and a planner grid only |
| Does the app contain fear-inducing or horror content? | No | |
| Does the app contain sexual content, nudity or sexual references? | No | |
| Does the app contain crude humor or offensive language? | No | UI strings only, reviewed in 3 languages |
| Does the app depict or reference drugs, alcohol or tobacco? | No | |
| Does the app contain discrimination or hate speech? | No | |
| Does the app contain real or simulated gambling, or content that encourages it? | No | |
| Does the app natively allow users to interact or exchange content with other users (text chat, voice, images, audio, video)? | No | No accounts, no servers, no messaging. "Copy times" only puts text on the local clipboard |
| Does the app allow users to share user-generated content with other users? | No | Custom city labels stay in a local settings file |
| Does the app share the user's current physical location with other users? | No | The app never reads the device location. The "local" city comes from the Windows time zone setting and is never sent anywhere |
| Does the app allow users to purchase digital goods (in-app purchases, subscriptions, currency, loot boxes)? | No | Free, no in-app purchases, no ads |
| Does the app provide unrestricted access to the internet (browser, search engine)? | No | The app makes no network requests; there is no web view |
| Does the app collect or share personal information with third parties? | No | No telemetry, no analytics, no third-party SDKs (see PRIVACY.md) |
| Does the app contain advertising? | No | |

## Expected result

| Rating authority | Expected rating |
|---|---|
| Microsoft Store (shown in the listing) | **3+** |
| IARC generic | 3+ |
| ESRB (North America) | Everyone |
| PEGI (Europe) | PEGI 3 |
| USK (Germany) | USK 0 (ab 0 Jahren) |
| ClassInd (Brazil) | L (Livre) |
| ACB (Australia) | G |
| GRAC (South Korea) | ALL |
| RARS (Russia) | 0+ |

No interactive elements are expected (no "Users Interact", "Shares Location", "In-Game Purchases" or "Unrestricted Internet" descriptors).

## If something changes later

Re-run the questionnaire (Partner Center lets you start a new questionnaire on the next submission) if a future version adds any of: accounts or sync, sharing between users, weather or other online data, links that open web content inside the app, ads, or purchases.
