/* Aurora Extract — static catalogue: platforms, what each can collect, where to open, column order. */
(function (root) {
  'use strict';
  const SITE = 'https://getaurorastudios.com/';
  const C = {
    site: SITE,
    telegram: 'https://t.me/+GqmNSvnMJxhhMzJh',
    supportEmail: 'support@getaurorastudios.com',
    platforms: {
      facebook: {
        name: 'Facebook', color: '#1877f2', match: ['https://*.facebook.com/*'],
        glyph: '<svg viewBox="0 0 24 24"><path d="M14 8h3V4h-3a4 4 0 00-4 4v2H7v4h3v8h4v-8h3l1-4h-4V8z" fill="currentColor"/></svg>',
        blurb: 'Pages, groups, Marketplace',
        open: [
          { label: 'A page or profile', hint: 'then its About tab for contacts', url: 'https://www.facebook.com/' },
          { label: 'A group you belong to', hint: 'feed or Members tab', url: 'https://www.facebook.com/groups/feed/' },
          { label: 'Marketplace', hint: 'search or a category', url: 'https://www.facebook.com/marketplace/' },
        ],
        tiles: [
          ['🏷️', 'Pages & profiles', 'Name, category, followers, website, public email & phone, address', 'Open any page or profile'],
          ['👥', 'Group members', 'Name, profile link, avatar — for groups you belong to', 'Group page → we open the Members tab for you'],
          ['ℹ️', 'Group info', 'Name, member count, privacy, description', 'Any group page'],
          ['📝', 'Group, page & profile posts', 'Text, author, date, reactions, comments, photos & videos', 'Group, page or profile feed'],
          ['💬', 'Comments', 'Every visible comment with author and time', 'Open a post'],
          ['🗣️', 'People who commented', 'One row per person: how many comments, likes received, sample', 'Open a post'],
          ['👍', 'People who reacted', 'Names + profile links of everyone who reacted', 'Open a post'],
          ['🤝', 'Friends, followers & following', 'Names, profile links, avatars — when the owner shows them', 'Profile → we open the tab for you'],
          ['🛍️', 'Marketplace', 'Listings, prices, locations, seller and all photos', 'Marketplace search or a listing'],
        ],
      },
      instagram: {
        name: 'Instagram', color: '#e1306c', match: ['https://*.instagram.com/*'],
        glyph: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor"/></svg>',
        blurb: 'Profiles, posts, followers, hashtags',
        open: [
          { label: 'A profile', hint: 'instagram.com/username', url: 'https://www.instagram.com/' },
          { label: 'A hashtag', hint: 'instagram.com/explore/tags/…', url: 'https://www.instagram.com/explore/' },
          { label: 'A post or reel', hint: 'for comments & media', url: 'https://www.instagram.com/' },
        ],
        tiles: [
          ['🧑‍💼', 'Profiles & business contacts', 'Bio, category, followers, public email, phone, website', 'Open a profile'],
          ['🖼️', 'Posts & reels', 'Captions, hashtags, likes, comments, plays — with photos and real video files', 'Open a profile'],
          ['🤝', 'Followers list', 'Username, name, verified, private', 'Open a profile'],
          ['➡️', 'Following list', 'Username, name, verified, private', 'Open a profile'],
          ['💬', 'Comments', 'Text, author, likes, replies, date', 'Open a post or reel'],
          ['🗣️', 'People who commented', 'One row per person with comment count and sample', 'Open a post or reel'],
          ['❤️', 'People who liked', 'Everyone Instagram lets you see who liked', 'Open a post or reel'],
          ['#️⃣', 'Hashtags', 'Top posts on a hashtag page', 'instagram.com/explore/tags/…'],
        ],
      },
      tiktok: {
        name: 'TikTok', color: '#fe2c55', match: ['https://*.tiktok.com/*'],
        glyph: '<svg viewBox="0 0 24 24"><path d="M16 3c.3 2.4 1.8 4 4 4.2v3.2a7 7 0 01-4-1.3v6.2a5.6 5.6 0 11-5.6-5.6c.3 0 .6 0 .9.1v3.3a2.4 2.4 0 102 2.3V3h2.7z" fill="currentColor"/></svg>',
        blurb: 'Profiles, videos, comments, hashtags',
        open: [
          { label: 'A profile', hint: 'tiktok.com/@username', url: 'https://www.tiktok.com/' },
          { label: 'A hashtag', hint: 'tiktok.com/tag/…', url: 'https://www.tiktok.com/explore' },
          { label: 'A video', hint: 'for comments & download', url: 'https://www.tiktok.com/' },
        ],
        tiles: [
          ['🎬', 'Profiles', 'Bio, followers, likes, verified, bio link, public email', 'Open a profile'],
          ['📼', 'Videos + downloads', 'Caption, hashtags, plays, likes, comments, shares, date — and the real video file', 'Profile → Videos tab'],
          ['🤝', 'Followers list', 'Username, name, profile link', 'Profile → we open the list for you'],
          ['➡️', 'Following list', 'Username, name, profile link', 'Profile → we open the list for you'],
          ['💬', 'Comments', 'Text, author, likes, time, replies', 'Open a video'],
          ['🗣️', 'People who commented', 'One row per person with comment count and sample', 'Open a video'],
          ['⬇️', 'Single video', 'Full record + downloadable file', 'Open a video'],
          ['🔖', 'Hashtags & search', 'Videos on a hashtag or search page', 'tiktok.com/tag/… or search'],
        ],
      },
    },
    kindLabels: {
      page_info: 'Page / profile details', posts: 'Posts', comments: 'Comments', group_members: 'Group members', marketplace_list: 'Marketplace listings',
      marketplace_item: 'Marketplace listing', marketplace_seller: 'Seller details', profile: 'Profile', followers: 'Followers', following: 'Following', commenters: 'People who commented', reactors: 'People who reacted', likers: 'People who liked', people: 'People list', people_friends: 'Friends', people_followers: 'Followers', people_following: 'Following', group_info: 'Group info',
      post: 'Post', hashtag: 'Hashtag', videos: 'Videos', video: 'Video',
    },
    preferred: ['name', 'username', 'title', 'author', 'email', 'emails', 'phone', 'phones', 'website', 'websites', 'text', 'caption', 'description', 'category', 'followers', 'following', 'likes', 'comments', 'likesOnComments', 'plays', 'shares', 'price', 'bio', 'url', 'profileUrl'],
    hidden: ['platform', 'kind', 'media', 'sourceUrl', 'collectedAt', 'avatar', 'image', 'cover', 'thumb', 'authorUrl', 'emailsInText', 'phonesInText'],
    studios: [
      { id: 'facebook', name: 'Aurora Facebook Studio', color: '#1877f2', text: 'Likes, reactions, comments and follows on pages, groups and hashtags — previewed before it runs.' },
      { id: 'instagram', name: 'Aurora Instagram Studio', color: '#e1306c', text: 'Engage hashtags, profiles and followers lists with human-like pacing and local history.' },
      { id: 'tiktok', name: 'Aurora TikTok Studio', color: '#fe2c55', text: 'Like, follow and comment straight from the video viewer, follower lists and hashtags.' },
    ],
  };
  root.AuroraCatalog = C;
  if (typeof module !== 'undefined') module.exports = C;
})(typeof globalThis !== 'undefined' ? globalThis : this);
