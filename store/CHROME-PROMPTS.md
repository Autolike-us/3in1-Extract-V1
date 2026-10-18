# Prompts for Claude in Chrome - filling the Chrome Web Store dashboard

Open https://chrome.google.com/webstore/devconsole , sign in as the AutomAi publisher, then paste these one at a time (new chat per prompt is fine).

## Prompt 0 - upload (do this by hand, 1 minute)
Dashboard -> **Add new item** -> choose `1-UPLOAD-THIS/aurora-extract-0.3.4.zip`. Claude cannot pick local files, so do this yourself. You land on the item's edit page.

## Prompt 1 - Account / profile check
```
GUARDRAILS (apply to every step): You are helping me fill in the Chrome Web Store Developer Dashboard for my own extension. Only type text I give you into the matching field, exactly as written (no rewording, no added marketing). Never click "Submit for review", "Publish", or anything that sends the item to Google. Never enter payment, identity, address or phone data yourself - stop and ask me. Do not upload files; tell me when I need to. After filling each field, read it back to confirm it saved, click Save draft, and finish with a short list of what is filled and what is still missing.

TASK: Open Account (left menu) -> Profile. Do NOT type anything. Just report: (a) is the contact email verified, (b) what is the publisher display name, (c) what is the Trader status setting currently. If the contact email is not verified, tell me and click the verify/resend link only. Then stop.
```

## Prompt 2 - Store listing tab (text fields)
```
GUARDRAILS (apply to every step): You are helping me fill in the Chrome Web Store Developer Dashboard for my own extension. Only type text I give you into the matching field, exactly as written (no rewording, no added marketing). Never click "Submit for review", "Publish", or anything that sends the item to Google. Never enter payment, identity, address or phone data yourself - stop and ask me. Do not upload files; tell me when I need to. After filling each field, read it back to confirm it saved, click Save draft, and finish with a short list of what is filled and what is still missing.

TASK: Open my draft item "Aurora Extract" -> Store listing tab. Fill ONLY these fields, exactly:

Name is taken from the package; do not change it. Check that it reads: Aurora Extract — Facebook, Instagram & TikTok data

Summary (from package; if empty or different, set it to):
Collect public data from Facebook, Instagram & TikTok pages you can already see. Export to CSV, Excel or JSON. Free.

Category: Productivity
Language: English

Detailed description - paste exactly the text between the lines:
-----
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
-----

Homepage URL: https://getaurorastudios.com/extract/
Support URL: https://getaurorastudios.com/support/

Leave screenshots, icon and promo tiles untouched (I upload those). Save draft, then tell me which fields are filled and any validation errors shown.
```

## Prompt 3 - Privacy tab
```
GUARDRAILS (apply to every step): You are helping me fill in the Chrome Web Store Developer Dashboard for my own extension. Only type text I give you into the matching field, exactly as written (no rewording, no added marketing). Never click "Submit for review", "Publish", or anything that sends the item to Google. Never enter payment, identity, address or phone data yourself - stop and ask me. Do not upload files; tell me when I need to. After filling each field, read it back to confirm it saved, click Save draft, and finish with a short list of what is filled and what is still missing.

TASK: Open the item -> Privacy tab. Fill:

1. Single purpose description (paste exactly):
Aurora Extract has one purpose: to let the user collect data that their own logged-in Facebook, Instagram or TikTok session can already see on the page they have open, and export it to their own computer as CSV, Excel, JSON or a media ZIP.

2. Permission justifications - paste each into the matching box:
- storage: Saves the user's extraction results, run history and settings locally in the browser so they can review and export them. Nothing is sent to a server.
- unlimitedStorage: A single extraction can contain thousands of rows (posts, comments, follower lists) plus a debug log; Chrome's default 10 MB storage cap would silently truncate large extractions.
- declarativeNetRequestWithHostAccess: When the user downloads photos and videos as a ZIP, the extension's own page fetches the media files from the platforms' CDNs, which refuse requests without a normal Referer. A session rule sets the Referer (and removes Origin) only for requests made by the extension itself to those CDN hosts. It does not block or modify normal browsing.
- Host permissions (one box): The extension reads the page the user has open on facebook.com, instagram.com and tiktok.com (content scripts) to extract the data the user chose, and calls the same pages/endpoints the site itself uses with the user's own session. The media CDN hosts (fbcdn.net, cdninstagram.com, tiktokcdn*.com, tiktokv.com/.us, byteoversea.com, ibytedtos.com, muscdn.com) are the platforms' own media servers and are accessed only to download the photos and videos the user chose to save in the media ZIP.
- Content scripts / any other box: Read the visible page, scroll it at a human pace, and show a small progress badge with a Stop button.

3. Remote code: select "No, I am not using remote code". If a justification box appears, write: All code is inside the package; nothing is downloaded and executed.

4. Data usage - tick ONLY "Website content". Leave every other category unticked (health, financial, authentication, personal communications, location, web history, user activity). If it asks for a description, write: Processed locally in the browser at the user's request; never sent to the developer or any third party.

5. Certifications - tick all three: not sold or transferred to third parties; not used or transferred for purposes unrelated to the single purpose; not used or transferred to determine creditworthiness or for lending.

6. Privacy policy URL: https://getaurorastudios.com/legal/privacy/

Save draft and report the result.
```

## Prompt 4 - Distribution + test instructions
```
GUARDRAILS (apply to every step): You are helping me fill in the Chrome Web Store Developer Dashboard for my own extension. Only type text I give you into the matching field, exactly as written (no rewording, no added marketing). Never click "Submit for review", "Publish", or anything that sends the item to Google. Never enter payment, identity, address or phone data yourself - stop and ask me. Do not upload files; tell me when I need to. After filling each field, read it back to confirm it saved, click Save draft, and finish with a short list of what is filled and what is still missing.

TASK: Open the item -> Distribution tab (and Test instructions section, which may be on the Distribution or Privacy tab). Set:
- Visibility: leave as I tell you now -> choose [PUBLIC  /  UNLISTED]  (delete the one you do not want before sending)
- Pricing: Free
- Regions: all regions
- Test instructions (paste exactly; replace <VIDEO LINK> with: [PASTE YOUR UNLISTED VIDEO URL HERE]):
Aurora Extract works on pages of facebook.com, instagram.com and tiktok.com that the user is logged in to; it needs no account with us. To test: (1) log in to any of the three sites in Chrome; (2) open a public profile or page (e.g. a business profile); (3) click the Aurora Extract toolbar icon — it detects the page and offers what can be collected; (4) press "Start extracting" and keep that tab in front; a small badge shows progress; (5) open the Results tab in the dashboard and use CSV / Excel / JSON / Media ZIP. Nothing is sent anywhere. A short screen recording of this flow is linked in the support field: <paste your unlisted video link>.
- Username/password fields for reviewers: leave blank.

Save draft and report what is set.
```

## Prompt 5 - Final read-only review (do not submit)
```
GUARDRAIL: Read-only. Do not click Submit for review or Publish, and do not edit anything.

TASK: Open my draft "Aurora Extract" in the Chrome Web Store dashboard and go through Store listing, Privacy and Distribution tabs. Report as a checklist: name, summary, category, language, description present and ends with "...Meta, Facebook, Instagram or TikTok.", 5 screenshots uploaded, small promo tile uploaded, icon shown, homepage/support/privacy URLs, single purpose, each permission justification filled, remote code = No, only "Website content" ticked, 3 certifications ticked, visibility, free, test instructions. Also list anything the dashboard flags as an error or warning before submission. Then stop and wait for me.
```

## Images you upload yourself (Store listing tab)
Screenshots in this order: `screenshot-1-extract.png`, `screenshot-2-results.png`, `screenshot-3-videos-media.png`, `screenshot-4-capabilities-dark.png`, `screenshot-5-commenters.png`. Small promo tile: `promo-small-440x280.png`. Marquee: `promo-marquee-1400x560.png`.

## When everything is green
Click **Submit for review** yourself. Review usually takes a few days.
