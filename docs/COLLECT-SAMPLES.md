# Collecting page samples (so the extractors match what you really see)

Facebook, Instagram and TikTok change their pages constantly, so the extractors are
tuned against **real pages from a logged-in account**. The fastest way to give me those is to let
your Claude browser extension capture them. Use a **throw-away or test account** if you can, and
**never paste passwords, cookies, tokens or private messages** — only page structure.

## Option A — let Claude in Chrome do it (recommended)

Open the target page in Chrome (logged in), open the Claude extension, and paste this prompt.
Repeat once per page type in the checklist below, then paste each result into our chat (or save as a
`.txt` and drop it in `samples/` of the repo).

```
I'm building a browser extension that reads publicly visible data from this page.
Please inspect THIS page and give me a structured report. Do not click anything that
changes data (no likes, follows, comments, posts, messages).

1. PAGE TYPE: which kind of page is this (profile, group feed, group members, marketplace
   search, marketplace listing, post with comments, hashtag, followers list, video …)?
   Give the URL pattern with IDs replaced by <id>.
2. REPEATING ITEMS: what is the repeated element (a post, listing, member, comment,
   video tile)? Give a CSS selector that matches ONE item, and 2 alternative selectors.
   Prefer stable attributes (role, aria-label, data-*, href patterns) over generated class names.
3. For ONE representative item, paste its outer HTML with these changes only:
   replace personal names/emails/phones with placeholders like NAME_1, EMAIL_1, PHONE_1,
   shorten long text to ~80 characters, and truncate image/video URLs after the first 60 characters.
   Keep ALL attributes and the nesting structure intact.
4. FIELDS: for that item list every field you can see and the selector (relative to the item)
   that returns it: author/name, profile link, text, date/time, like/reaction count, comment
   count, share count, price, location, image URL(s), video URL (or say if it is a blob:/DASH
   stream), badges (verified, admin, Page/Group).
5. CONTACT DETAILS: where, if anywhere, does this page show a public email, phone, website
   or address? Give the selector and a redacted example.
6. EMBEDDED DATA: does the page contain JSON in <script> tags (e.g. __UNIVERSAL_DATA_FOR_REHYDRATION__,
   SIGI_STATE, application/ld+json, window.__*)? List the script ids/types and the top-level
   keys (not the values) and the path to the item list.
7. LOADING MORE: how does more content load (infinite scroll, "See more" button, "View more
   comments", a scrollable dialog)? Give the selector of the scrollable container and of any button.
8. NETWORK: in DevTools → Network, filter Fetch/XHR while scrolling. List the request URL
   PATHS (no query-string tokens, no cookies, no headers) that return the list data, plus the
   JSON path to the items in the response (keys only).
9. Anything unusual: A/B variants, login walls, "Something went wrong", rate-limit banners.

Return everything as Markdown with clear headings.
```

### Checklist of pages to capture

| Platform | Page types |
|---|---|
| **Facebook** | 1) a business **Page** (main) and its **About → Contact** tab · 2) a personal **profile** you can view · 3) a **group feed** (one with images/video) · 4) **group → Members** · 5) **Marketplace search results** · 6) a **Marketplace listing** (with seller block) · 7) an open **post** with comments (incl. "View more comments") · 8) Page/profile **Photos** and **Videos** tabs |
| **Instagram** | 1) a **business profile** (shows email/phone buttons) · 2) a normal profile **grid** · 3) a **post** (photo) · 4) a **carousel** · 5) a **reel** · 6) post **comments** · 7) **Followers** dialog · 8) **Following** dialog · 9) **hashtag** page (`/explore/tags/…`) |
| **TikTok** | 1) a **profile** (with bio link) · 2) profile **Videos** grid · 3) a **video page** with comments open · 4) **Followers/Following** popup · 5) **hashtag** page (`/tag/…`) · 6) **search** results (Videos) |

## Option B — manual

For each page type above, on the page press **F12 → Elements**, right-click the repeating item →
**Copy → Copy outerHTML** (redact names/emails/phones), paste it into a text file and send it with a
screenshot. For "Loading more", also send a screenshot of DevTools → Network showing the list request
(URL path only).

## Also tell me
* Your language setting for each platform (labels like "See more" differ by language).
* Which countries' phone formats matter most to you.
* Whether you want Marketplace extraction to include **seller profile links** (public) — yes/no.
