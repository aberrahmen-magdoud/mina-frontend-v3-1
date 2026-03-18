// src/lib/inboxHelpers.ts
// Inbox URL and label lookup tables for email providers.

export const INBOX_URLS: Record<string, string> = {
  "gmail.com": "https://mail.google.com/mail/u/0/#inbox",
  "googlemail.com": "https://mail.google.com/mail/u/0/#inbox",
  "outlook.com": "https://outlook.live.com/mail/0/inbox",
  "hotmail.com": "https://outlook.live.com/mail/0/inbox",
  "hotmail.co.uk": "https://outlook.live.com/mail/0/inbox",
  "hotmail.fr": "https://outlook.live.com/mail/0/inbox",
  "hotmail.de": "https://outlook.live.com/mail/0/inbox",
  "hotmail.it": "https://outlook.live.com/mail/0/inbox",
  "hotmail.es": "https://outlook.live.com/mail/0/inbox",
  "live.com": "https://outlook.live.com/mail/0/inbox",
  "live.co.uk": "https://outlook.live.com/mail/0/inbox",
  "live.fr": "https://outlook.live.com/mail/0/inbox",
  "live.nl": "https://outlook.live.com/mail/0/inbox",
  "msn.com": "https://outlook.live.com/mail/0/inbox",
  "yahoo.com": "https://mail.yahoo.com/d/folders/1",
  "yahoo.co.uk": "https://mail.yahoo.com/d/folders/1",
  "yahoo.co.jp": "https://mail.yahoo.co.jp/",
  "yahoo.fr": "https://mail.yahoo.com/d/folders/1",
  "yahoo.de": "https://mail.yahoo.com/d/folders/1",
  "yahoo.it": "https://mail.yahoo.com/d/folders/1",
  "yahoo.es": "https://mail.yahoo.com/d/folders/1",
  "yahoo.ca": "https://mail.yahoo.com/d/folders/1",
  "yahoo.com.br": "https://mail.yahoo.com/d/folders/1",
  "yahoo.com.au": "https://mail.yahoo.com/d/folders/1",
  "yahoo.co.in": "https://mail.yahoo.com/d/folders/1",
  "ymail.com": "https://mail.yahoo.com/d/folders/1",
  "rocketmail.com": "https://mail.yahoo.com/d/folders/1",
  "myyahoo.com": "https://mail.yahoo.com/d/folders/1",
  "icloud.com": "https://www.icloud.com/mail/",
  "me.com": "https://www.icloud.com/mail/",
  "mac.com": "https://www.icloud.com/mail/",
  "aol.com": "https://mail.aol.com/d/folders/1",
  "aol.co.uk": "https://mail.aol.com/d/folders/1",
  "zoho.com": "https://mail.zoho.com/zm/",
  "zohomail.com": "https://mail.zoho.com/zm/",
  "protonmail.com": "https://mail.proton.me/u/0/inbox",
  "proton.me": "https://mail.proton.me/u/0/inbox",
  "pm.me": "https://mail.proton.me/u/0/inbox",
  "tutanota.com": "https://app.tuta.com/",
  "tuta.com": "https://app.tuta.com/",
  "tutanota.de": "https://app.tuta.com/",
  "tuta.io": "https://app.tuta.com/",
  "keemail.me": "https://app.tuta.com/",
  "fastmail.com": "https://app.fastmail.com/mail/Inbox",
  "fastmail.fm": "https://app.fastmail.com/mail/Inbox",
  "gmx.com": "https://navigator.gmx.com/mail",
  "gmx.de": "https://navigator.gmx.com/mail",
  "gmx.net": "https://navigator.gmx.com/mail",
  "gmx.at": "https://navigator.gmx.com/mail",
  "gmx.ch": "https://navigator.gmx.com/mail",
  "web.de": "https://web.de/email/",
  "mail.com": "https://www.mail.com/mail/",
  "yandex.com": "https://mail.yandex.com/",
  "yandex.ru": "https://mail.yandex.ru/",
  "mail.ru": "https://e.mail.ru/inbox/",
  "inbox.ru": "https://e.mail.ru/inbox/",
  "bk.ru": "https://e.mail.ru/inbox/",
  "list.ru": "https://e.mail.ru/inbox/",
  "rambler.ru": "https://mail.rambler.ru/",
  "libero.it": "https://login.libero.it/",
  "virgilio.it": "https://mail.virgilio.it/",
  "t-online.de": "https://email.t-online.de/",
  "free.fr": "https://webmail.free.fr/",
  "orange.fr": "https://webmail.orange.fr/",
  "laposte.net": "https://www.laposte.net/accueil",
  "sfr.fr": "https://webmail.sfr.fr/",
  "wanadoo.fr": "https://webmail.orange.fr/",
  "btinternet.com": "https://mail.yahoo.com/d/folders/1",
  "sky.com": "https://mail.yahoo.com/d/folders/1",
  "comcast.net": "https://login.xfinity.com/login",
  "att.net": "https://mail.yahoo.com/d/folders/1",
  "verizon.net": "https://mail.aol.com/d/folders/1",
  "cox.net": "https://webmail.cox.net/",
  "sbcglobal.net": "https://mail.yahoo.com/d/folders/1",
  "bellsouth.net": "https://mail.yahoo.com/d/folders/1",
  "outlook.co.uk": "https://outlook.live.com/mail/0/inbox",
  "outlook.fr": "https://outlook.live.com/mail/0/inbox",
  "outlook.de": "https://outlook.live.com/mail/0/inbox",
  "outlook.es": "https://outlook.live.com/mail/0/inbox",
  "outlook.it": "https://outlook.live.com/mail/0/inbox",
  "outlook.jp": "https://outlook.live.com/mail/0/inbox",
  "outlook.com.au": "https://outlook.live.com/mail/0/inbox",
  "outlook.com.br": "https://outlook.live.com/mail/0/inbox",
  "outlook.sa": "https://outlook.live.com/mail/0/inbox",
};

export function getInboxHref(email: string | null): string {
  if (!email) return "mailto:";
  const parts = email.split("@");
  if (parts.length !== 2) return "mailto:";
  const domain = parts[1].toLowerCase();
  const direct = INBOX_URLS[domain];
  if (direct) return direct;
  const isMobile = /android|iphone|ipad|ipod/i.test(navigator.userAgent);
  if (isMobile) {
    if (/android/i.test(navigator.userAgent)) {
      return "intent:///#Intent;scheme=gmail;package=com.google.android.gm;end";
    }
    return "message://";
  }
  return `mailto:${email}`;
}

const INBOX_LABELS: Record<string, string> = {
  "gmail.com": "Open Gmail",
  "googlemail.com": "Open Gmail",
  "outlook.com": "Open Outlook",
  "hotmail.com": "Open Outlook",
  "hotmail.co.uk": "Open Outlook",
  "hotmail.fr": "Open Outlook",
  "hotmail.de": "Open Outlook",
  "hotmail.it": "Open Outlook",
  "hotmail.es": "Open Outlook",
  "live.com": "Open Outlook",
  "live.co.uk": "Open Outlook",
  "live.fr": "Open Outlook",
  "live.nl": "Open Outlook",
  "msn.com": "Open Outlook",
  "yahoo.com": "Open Yahoo Mail",
  "yahoo.co.uk": "Open Yahoo Mail",
  "yahoo.fr": "Open Yahoo Mail",
  "yahoo.de": "Open Yahoo Mail",
  "yahoo.it": "Open Yahoo Mail",
  "yahoo.es": "Open Yahoo Mail",
  "yahoo.ca": "Open Yahoo Mail",
  "yahoo.com.br": "Open Yahoo Mail",
  "yahoo.com.au": "Open Yahoo Mail",
  "yahoo.co.in": "Open Yahoo Mail",
  "yahoo.co.jp": "Open Yahoo Mail",
  "ymail.com": "Open Yahoo Mail",
  "rocketmail.com": "Open Yahoo Mail",
  "icloud.com": "Open iCloud Mail",
  "me.com": "Open iCloud Mail",
  "mac.com": "Open iCloud Mail",
  "aol.com": "Open AOL Mail",
  "aol.co.uk": "Open AOL Mail",
  "zoho.com": "Open Zoho Mail",
  "zohomail.com": "Open Zoho Mail",
  "protonmail.com": "Open Proton Mail",
  "proton.me": "Open Proton Mail",
  "pm.me": "Open Proton Mail",
  "tutanota.com": "Open Tuta",
  "tuta.com": "Open Tuta",
  "fastmail.com": "Open Fastmail",
  "fastmail.fm": "Open Fastmail",
  "gmx.com": "Open GMX",
  "gmx.de": "Open GMX",
  "gmx.net": "Open GMX",
  "web.de": "Open Web.de Mail",
  "mail.com": "Open Mail.com",
  "yandex.com": "Open Yandex Mail",
  "yandex.ru": "Open Yandex Mail",
  "mail.ru": "Open Mail.ru",
  "inbox.ru": "Open Mail.ru",
  "bk.ru": "Open Mail.ru",
};

export function getInboxLabel(email: string | null): string {
  if (!email) return "Open email app";
  const parts = email.split("@");
  if (parts.length !== 2) return "Open email app";
  const domain = parts[1].toLowerCase();
  return INBOX_LABELS[domain] || "Open email app";
}

export function formatUserCount(n: number | null): string {
  if (!Number.isFinite(n as number) || n === null) return "";
  const value = Math.max(0, Math.round(n));
  if (value >= 1_000_000) {
    const m = value / 1_000_000;
    return `${m.toFixed(m >= 10 ? 0 : 1).replace(/\.0$/, "")}m`;
  }
  if (value >= 1_000) {
    const k = value / 1_000;
    return `${k.toFixed(k >= 10 ? 0 : 1).replace(/\.0$/, "")}k`;
  }
  return String(value);
}
