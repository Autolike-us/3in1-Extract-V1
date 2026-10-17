# Chrome Web Store submission pack — Aurora Extract

Everything below is ready to paste into the Developer Dashboard. Upload `dist/aurora-extract-0.3.1.zip` (built with `npm run package`).

## 0. Before you start (one time)
- [ ] Publisher: you are signed in as **AutomAi**. The public developer name is what shoppers see — consider setting a display name that matches the brand (Account → Profile) so it reads "Aurora" / "Aurora Studios".
- [ ] **Verify the contact email** (Account → Profile). Listings cannot be published until it is verified.
- [ ] **Trader status** (Account → Profile → "Trader"): because Aurora also sells paid products you should declare yourself a **trader**. For the EU/UK this publishes a contact address, phone and email on the listing. Use a business address / number you are comfortable making public.
- [ ] Optional but recommended: **verify getaurorastudios.com** in Account → Settings (via Google Search Console) so the site is shown as verified on the listing.
- [ ] Note the dashboard shows an **extension limit (0/3)** for new publishers. Aurora Extract uses one slot; raise the limit later through the dashboard's limit link if you decide to list more.

## 1. Store listing tab
**Name** (50/75): `Aurora Extract — Facebook, Instagram & TikTok data`

**Summary** (116/132): `Collect public data from Facebook, Instagram & TikTok pages you can already see. Export to CSV, Excel or JSON. Free.`

**Category:** Productivity   **Language:** English

**Detailed description** (2936 characters):

```
Aurora Extract is a free data extractor for Facebook, Instagram and TikTok. Open a page you can already see, press Start, and download a clean spreadsheet — or a ZIP of the photos and videos.

WHAT YOU CAN COLLECT
Facebook
• Pages and profiles: name, category, followers, website, and the public email, phone and address if the page shows them
• Group members and group info (for groups you belong to)
• Posts from groups, pages and profiles, with photos and videos
• Comments, people who commented, people who reacted
• Friends, followers and following lists (when the owner shows them)
• Marketplace listings: prices, locations, seller and all photos

Instagram
• Profiles with business email, phone and website when shown publicly
• Posts and reels with full-size photos and video files
• Followers and following lists, comments, people who commented, people who liked
• Hashtag pages

TikTok
• Profiles with bio contacts and stats
• Videos with captions, hashtags, stats and the video file
• Followers and following lists, comments, people who commented
• Hashtag and search pages

EXPORT
CSV, Excel (.xlsx), JSON, and a media ZIP (photos and videos in tidy folders with a report of every file).

HEALTH CHECK
Run Aurora Audit on a profile or page for a 0-100 score covering the bio, link, posting rhythm, captions and engagement, plus your top fixes. It is calculated on your own computer from what you can already see.

BUILT TO BE EASY
• Pick a platform, open the page, choose what to collect — Aurora Extract recognises the page and offers the right options
• Live progress, a Stop button, and a small badge on the page while it works
• Search and filter results, copy all emails with one click
• Gentle, Normal or Fast pacing so the site is read at a human pace
• Light and dark themes

PRIVATE BY DESIGN
• No account, no server, no tracking. Everything you collect stays in your own browser and is exported by you
• It only reads what your own logged-in account can already see. It does not bypass privacy settings and cannot see private profiles or groups you have not joined
• Public emails and phone numbers are collected only when a person or business has made them public

USE IT RESPONSIBLY
You are responsible for following each platform's terms and the privacy, data-protection and marketing laws that apply to you (for example GDPR, CAN-SPAM, PECR and CCPA). Do not use collected details for spam or harassment, and honour opt-outs.

GOOD TO KNOW
• Keep the Facebook, Instagram or TikTok tab visible while Aurora Extract works — Chrome pauses hidden tabs and the site stops loading more
• Platforms change their pages often. If something does not extract correctly, press "Copy debug report" (it contains no passwords or personal data) and post it in our Telegram channel "Aurora Studios Report" or email support@getaurorastudios.com — you can also request features there
• Aurora Extract is free. It includes clearly labelled links to Aurora Studios, our separate paid automation extensions, on getaurorastudios.com
• Aurora Extract is independent and is not affiliated with, endorsed by or sponsored by Meta, Facebook, Instagram or TikTok.
```

**Screenshots** (1280×800, upload in this order) — in `store/assets/`:
1. `screenshot-1-extract.png` — pick a platform, page detected, choose what to collect
2. `screenshot-2-results.png` — business contacts table with CSV / Excel / JSON export
3. `screenshot-3-videos-media.png` — videos with real files and the Media ZIP
4. `screenshot-4-capabilities-dark.png` — everything you can collect (dark theme)
5. `screenshot-5-commenters.png` — one row per person who commented
(`screenshot-6-privacy.png` — the Help & privacy page — is a good 6th/backup.)
All sample data is fictional (`.example` email addresses, 555-01xx phone numbers).

**Small promo tile** 440×280: `promo-small-440x280.png`   **Marquee** 1400×560 (optional): `promo-marquee-1400x560.png`   **Icon:** 128×128 is inside the package (`icons/icon128.png`).

**Homepage URL:** https://getaurorastudios.com/extract/   **Support URL:** https://getaurorastudios.com/support/

## 2. Privacy tab
**Single purpose** (paste exactly):
> Aurora Extract has one purpose: to let the user collect data that their own logged-in Facebook, Instagram or TikTok session can already see on the page they have open, and export it to their own computer as CSV, Excel, JSON or a media ZIP.

**Permission justifications**
| Permission | Justification to paste |
|---|---|
| `storage` | Saves the user's extraction results, run history and settings locally in the browser so they can review and export them. Nothing is sent to a server. |
| `unlimitedStorage` | A single extraction can contain thousands of rows (posts, comments, follower lists) plus a debug log; Chrome's default 10 MB storage cap would silently truncate large extractions. |
| `declarativeNetRequestWithHostAccess` | When the user downloads photos and videos as a ZIP, the extension's own page fetches the media files from the platforms' CDNs, which refuse requests without a normal Referer. A session rule sets the Referer (and removes Origin) only for requests made by the extension itself to those CDN hosts. It does not block or modify normal browsing. |
| Host access: `*.facebook.com`, `*.instagram.com`, `*.tiktok.com` | The extension reads the page the user has open on these sites (content scripts) to extract the data the user chose, and calls the same pages/endpoints the site itself uses with the user's own session. |
| Host access: `*.fbcdn.net`, `*.cdninstagram.com`, `*.tiktokcdn.com`, `*.tiktokcdn-us.com`, `*.tiktokcdn-eu.com`, `*.tiktokv.com`, `*.tiktokv.us`, `*.byteoversea.com`, `*.ibytedtos.com`, `*.muscdn.com` | These are the platforms' own media CDNs. Access is needed only to download the photos and videos the user chose to save in the media ZIP. |
| Content scripts on the three sites | Read the visible page, scroll it at a human pace, and show a small progress badge with a Stop button. |

**Remote code:** No. All code is inside the package; nothing is downloaded and executed.

**Data usage** (what to tick — confirm with your lawyer):
- The extension reads **website content** (public posts, profiles, comments, listings) on pages the user opens. It does **not transmit** any of it anywhere: there is no server, analytics, or third-party SDK. Tick **Website content** and describe it as "processed locally in the browser at the user's request; never sent to the developer or any third party".
- Do **not** tick: health, financial, authentication, personal communications, location, web history, user activity (no usage analytics are collected).
- Certify all three: not sold to third parties; not used for unrelated purposes; not used for creditworthiness/lending.

**Privacy policy URL:** https://getaurorastudios.com/legal/privacy/ (it has a section for Aurora Extract)

## 3. Test instructions for reviewers (Distribution tab → "Test instructions")
> Aurora Extract works on pages of facebook.com, instagram.com and tiktok.com that the user is logged in to; it needs no account with us. To test: (1) log in to any of the three sites in Chrome; (2) open a public profile or page (e.g. a business profile); (3) click the Aurora Extract toolbar icon — it detects the page and offers what can be collected; (4) press "Start extracting" and keep that tab in front; a small badge shows progress; (5) open the Results tab in the dashboard and use CSV / Excel / JSON / Media ZIP. Nothing is sent anywhere. A short screen recording of this flow is linked in the support field: <paste your unlisted video link>.

Tip: record a 60–90 second screen video of exactly those steps and add its link — reviewers cannot always log in to social networks, and a video prevents a "could not verify functionality" rejection.

## 4. Distribution
Visibility: **Public** (or **Unlisted** for a first test); Pricing: **Free**; Regions: all (or choose).

## 5. Review risks — be honest with yourself
- Google can treat data-extraction extensions as sensitive. The listing above sticks to "data your own account can already see", local-only processing, no bypassing and a responsible-use notice. **Do not** add marketing like "scrape any profile", "unlimited", "bypass limits", or "grow followers".
- Keep the **Studios** (automated likes/follows/comments) **out of the store**. Google's spam and deceptive-behavior policies make those far more likely to be rejected or removed later.
- Typical rejection reasons and fixes: *unused permissions* (done — only 3 permissions remain), *missing privacy policy* (live), *description does not match behaviour* (matched), *cannot test* (add the video).
- Reviews usually take a few days; first submissions can take longer. After approval, add the store URL to the website (`NEXT_PUBLIC_CWS_EXTRACT` style setting) so the "Add to Chrome" button replaces the zip download.
