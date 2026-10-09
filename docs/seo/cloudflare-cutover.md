# Μετάβαση wwa-espa.com → νέα εφαρμογή (Cloudflare)

Σημερινή εικόνα (έλεγχος DNS 09/10/2026):

| Τομέας | Τώρα | Cloudflare |
|---|---|---|
| `wwa-espa.com`, `www` | A → `185.134.112.10` (παλιό WordPress, LiteSpeed) | **γκρι σύννεφο** (DNS only) |
| `espa.nuboy.gr` | νέα εφαρμογή (Next.js) | **πορτοκαλί** (proxied) |
| Email `@wwa-espa.com` | MX → Google Workspace | — |

Και οι δύο ζώνες είναι στον ίδιο λογαριασμό Cloudflare (NS `art`/`rose`).

> ⚠️ **ΜΗΝ αγγίξετε** τις εγγραφές MX, SPF/DKIM/DMARC (TXT `_dmarc`, `google._domainkey`), το `google-site-verification` ή εγγραφές Mailgun. Αλλάζουν ΜΟΝΟ οι `@` και `www`.

---

## 1. Πριν (1 ημέρα νωρίτερα)

1. Cloudflare → `wwa-espa.com` → **DNS** → **Export** (αντίγραφο ασφαλείας των εγγραφών).
2. Κρατήστε τον παλιό WordPress server ενεργό για 2–4 εβδομάδες (επιστροφή αν χρειαστεί).
3. Ελέγξτε στη διαχείριση της νέας εφαρμογής ότι τα 21 άρθρα (CMS → Άρθρα) είναι όπως τα θέλετε.

## 2. Ρυθμίσεις της εφαρμογής (server)

Στις μεταβλητές περιβάλλοντος του deploy:

```
SITE_PUBLIC=1
NEXT_PUBLIC_SITE_URL=https://wwa-espa.com
AUTH_URL=https://wwa-espa.com
```

- Το `NEXT_PUBLIC_SITE_URL` μπαίνει στο **build**: χρειάζεται **νέο build/redeploy** (όχι μόνο restart).
- Το `AUTH_URL` χρησιμοποιείται στους συνδέσμους των emails (portal, αιτήματα δικαιολογητικών, επαναφορά κωδικού).
- Προσθέστε τα `wwa-espa.com` και `www.wwa-espa.com` στα domains του reverse proxy / panel (Coolify, Nginx, Caddy) ή στα **Public Hostnames** του Cloudflare Tunnel, αν χρησιμοποιείτε tunnel. Πρέπει να δείχνουν στην ίδια υπηρεσία με το `espa.nuboy.gr`.

## 3. DNS (η «αλλαγή»)

Cloudflare → **nuboy.gr** → DNS: δείτε σε τι δείχνει η εγγραφή `espa` (IP του server ή `<id>.cfargotunnel.com`).

Cloudflare → **wwa-espa.com** → DNS:

| Τύπος | Όνομα | Τιμή | Proxy |
|---|---|---|---|
| A (ή CNAME) | `@` | ό,τι έχει το `espa.nuboy.gr` | **Proxied (πορτοκαλί)** |
| CNAME | `www` | `wwa-espa.com` | **Proxied (πορτοκαλί)** |

Με tunnel: CNAME `@` → `<id>.cfargotunnel.com`. Το Cloudflare δέχεται CNAME στο apex μέσω flattening.

Η αλλαγή ισχύει σε 1–5 λεπτά, επειδή η κίνηση περνά μέσω του proxy.

## 4. SSL/TLS

- **SSL/TLS → Overview:** **Full (strict)**. Αν ο server δεν έχει έγκυρο πιστοποιητικό για το νέο domain, προσωρινά **Full** — ποτέ Flexible, γιατί δημιουργεί redirect loop.
- **Edge Certificates:** Always Use HTTPS **On** · Automatic HTTPS Rewrites **On** · Minimum TLS **1.2** · HSTS μόνο αφού όλα δουλεύουν σωστά για μερικές ημέρες.

## 5. Ανακατευθύνσεις (Rules → Redirect Rules)

1. **www → χωρίς www** (ζώνη wwa-espa.com):
   - Συνθήκη: Hostname equals `www.wwa-espa.com`.
   - Ενέργεια: Dynamic redirect → `concat("https://wwa-espa.com", http.request.uri.path)`, 301, **Preserve query string**.
2. **Staging → παραγωγή** (ζώνη nuboy.gr), όταν δεν χρειάζεστε άλλο το espa.nuboy.gr:
   - Συνθήκη: Hostname equals `espa.nuboy.gr`.
   - Ενέργεια: Dynamic redirect → `concat("https://wwa-espa.com", http.request.uri.path)`, 301, Preserve query string.

Τα 70 παλιά URLs του WordPress (π.χ. `/programs/...`, `/news/...`) ανακατευθύνονται ήδη με 301 από την ίδια την εφαρμογή. Δεν χρειάζεται κανόνας στο Cloudflare.

## 6. Ρυθμίσεις που ΠΡΕΠΕΙ να είναι σωστές για SEO/GEO/AEO

| Πού | Ρύθμιση | Τιμή | Γιατί |
|---|---|---|---|
| Security → Bots / **AI Crawl Control** | Block AI bots / AI training | **Off / Allow** | Αλλιώς ChatGPT, Claude, Perplexity, Gemini δεν «διαβάζουν» το site (GEO). |
| AI Crawl Control | **Managed robots.txt** | **Off** | Να σερβίρεται το δικό μας `robots.txt` (sitemap + κανόνες). |
| AI Crawl Control | AI Labyrinth | **Off** | Δεν θέλουμε παγίδες για crawlers. |
| Security → Bots | Bot Fight Mode | **Off** (ή μόνο με «verified bots allowed») | Μπλοκάρει και νόμιμους crawlers. |
| Scrape Shield | **Email Address Obfuscation** | **Off** | Αλλάζει το HTML (mailto) → σφάλματα hydration στο React. |
| Speed → Optimization | **Rocket Loader** | **Off** | Χαλάει Next.js/GSAP. |
| Caching → Configuration | Caching level | Standard | Η εφαρμογή ορίζει μόνη της τι κάνει cache. |

> ❌ **ΜΗΝ** φτιάξετε κανόνα «Cache Everything» για όλο το site: θα έμπαιναν σε cache και σελίδες διαχείρισης συνδεδεμένων χρηστών. Η προεπιλογή αρκεί, γιατί τα στατικά αρχεία (`/_next/static`, εικόνες) γίνονται cache αυτόματα.
> Προαιρετικά: Speed → **Early Hints** On, **HTTP/3** On, **Brotli** On.

## 6β. Cache εικόνων (μετά τη μετάβαση)

Οι φωτογραφίες σερβίρονται βελτιστοποιημένες από την εφαρμογή στο `/_next/image?...` (AVIF/WebP σε σωστό μέγεθος). Για να τις κρατά και το Cloudflare (ταχύτερα, λιγότερο φορτίο στον server):

**Caching → Cache Rules → Create rule**
- Όνομα: `Images optimizer`
- Συνθήκη: *URI Path* **starts with** `/_next/image`
- Ενέργεια: **Eligible for cache** · Edge TTL: **Use cache-control header if present** (η εφαρμογή στέλνει 30 ημέρες) · Browser TTL: Respect origin
- **Cache key:** να περιλαμβάνει το **query string** (default) και, στο «Header», το **Accept** — ώστε AVIF και WebP να κρατιούνται χωριστά.

## 7. Εξωτερικές υπηρεσίες με URL της εφαρμογής

Αλλάξτε `espa.nuboy.gr` → `wwa-espa.com` όπου υπάρχει:
- **Mailgun:** inbound route και webhooks (απαντήσεις πελατών, tracking).
- **Viva Payments:** webhook URL και redirect (success/failure).
- **Google OAuth / Login με Google**, αν υπάρχει: Authorized redirect URIs.
- **Bunny CDN:** allowed referrers / hotlink protection, αν έχει οριστεί.

## 8. Έλεγχος αμέσως μετά (5 λεπτά)

```bash
curl -sI https://wwa-espa.com | grep -iE "x-robots|server|location"
curl -s https://wwa-espa.com/robots.txt
curl -s https://wwa-espa.com/sitemap.xml | head -20
curl -sI https://www.wwa-espa.com/nea | grep -i location
```

Τι πρέπει να δείτε:
- Καμία κεφαλίδα `X-Robots-Tag: noindex`.
- Το `robots.txt` με `Sitemap: https://wwa-espa.com/sitemap.xml`.
- Το sitemap με τα προγράμματα και τα άρθρα.
- Το `www` να κάνει 301 στο `wwa-espa.com`.

Επίσης:
- Ανοίξτε την αρχική, ένα πρόγραμμα, ένα άρθρο και τη φόρμα επιλεξιμότητας.
- Κάντε login στη διαχείριση (`/login`).
- Αποδεχτείτε τα cookies και ελέγξτε στο **GA4 → Realtime** ότι εμφανίζεστε (G-1S0QFSVZ4F).

## 9. Search Console & Bing (ίδια ημέρα)

1. **Google Search Console** (το domain είναι ήδη επαληθευμένο με TXT):
   - Sitemaps → υποβολή `https://wwa-espa.com/sitemap.xml`.
   - URL Inspection → Request indexing για την αρχική, `/programmata`, `/prothesmies-espa` και 3–4 βασικά άρθρα.
2. **Bing Webmaster Tools:** Import από Search Console. Το Bing τροφοδοτεί και το ChatGPT search.
3. Μετά από 7 ημέρες: Search Console → Pages → «Not found (404)» για παλιά URLs που δεν καλύφθηκαν. Θα προσθέσουμε redirects.

## 10. Επιστροφή (αν κάτι πάει στραβά)

DNS → `@` ξανά A `185.134.112.10` **DNS only (γκρι)** και `www` CNAME `wwa-espa.com` γκρι. Η επιστροφή ισχύει σε λίγα λεπτά.
