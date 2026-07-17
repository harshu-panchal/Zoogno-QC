# Zoogno Full Sharing & Deep Linking Guide

Yeh document future reference ke liye banaya gaya hai jisme **Web Product Link Sharing, Social Media Previews (Images/Title), aur Mobile App Deep Linking** ka poora A-to-Z setup step-by-step explain kiya gaya hai.

---

## 1. Product Share Controller (Backend Setup)
Jab koi user app se kisi product ka link share karta hai (e.g., WhatsApp ya Telegram par), toh wahan ek sundar image, title aur description dikhna chahiye. Iske liye backend mein HTML generate karke bhejna padta hai.

**Code (`shareController.js`):**
Backend mein ek API route (`/share/product/:id`) banaya gaya hai. Yeh controller database se product ki details nikalta hai aur HTML return karta hai jisme **Open Graph (OG)** aur **Twitter Card** meta tags hote hain.

```javascript
// Open Graph Meta Tags (For WhatsApp, FB, Telegram)
<meta property="og:title" content="${title}" />
<meta property="og:description" content="${description}" />
<meta property="og:image" content="${image}" />
<meta property="og:url" content="${url}" />

// Redirect Logic (Javascript fallback)
<script>
    var isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (isMobile && /Android/i.test(navigator.userAgent)) {
        // App open karne ka intent URI
        window.location.href = "intent://product/${id}#Intent;scheme=zoogno;package=com.zoogno.app;S.browser_fallback_url=${playStoreUrl};end";
    } else {
        // Desktop user ko website par bhejo
        window.location.href = "${url}";
    }
</script>
```

> [!TIP]
> **Image Share Note:** Social media bots jab link ko read karte hain, toh woh `og:image` meta tag se image utha kar link preview mein dikhate hain.

---

## 2. Nginx Bot Proxy (Routing Setup)
Kyunki Vercel/React ek Single Page App (SPA) hai, bots Javascript run nahi kar sakte aur meta tags nahi padh sakte. Isko solve karne ke liye **Nginx par Bot Proxy** set kiya gaya.

Jab bhi WhatsApp/Telegram bot link kholta hai, Nginx usko pehchanta hai aur sidha Backend Node.js API ke pass bhejta hai taaki usko Meta Tags mil sakein. Normal insaan click karega toh usko Frontend dikhega.

**Nginx Configuration (`/etc/nginx/sites-available/zoogno.conf`):**
```nginx
    location /share/product/ {
        # Agar bot (WhatsApp, Facebook, AppleBot) hai, toh Backend API (Port 5000) ko bhejo
        if ($http_user_agent ~* "whatsapp|facebook|telegram|twitter|linkedin|discord|slackbot|applebot") {
            proxy_pass http://127.0.0.1:5000;
            break;
        }

        # Normal User ko React Frontend par bhejo
        try_files $uri $uri/ /index.html;
    }
```

---

## 3. Deep Linking Setup (App Verification)
Jab link par click ho toh Android/iOS directly application open kare bina browser ke prompt ke. Iske liye domain ki ownership verify karna zaroori hai.

### A. Configuration Files Banayein
Frontend codebase mein `public/.well-known/` naam ka folder banaya gaya aur usme 2 files dali gayin:

**1. Android (`assetlinks.json`)**
Isme App ka package aur SHA-256 keys milti hain:
```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "com.zoogno.app",
    "sha256_cert_fingerprints": [
      "26:BA:2C:4C:F1... (Debug Key)",
      "74:90:DD:2D:58... (Release Key)",
      "2F:AC:25:72:E4... (Other Key)"
    ]
  }
}]
```

**2. iOS (`apple-app-site-association`)** *(Bina kisi extension ke)*
```json
{
  "applinks": {
    "apps": [],
    "details": [{ "appID": "YOUR_APPLE_TEAM_ID.com.zoogno.app", "paths": ["*"] }]
  }
}
```

### B. VPS Server par Files Setup
VPS par manually yeh folder aur files Nginx ke web root directory (`/var/www/zoogno`) mein rakhni padti hain.
```bash
sudo mkdir -p /var/www/zoogno/.well-known
sudo nano /var/www/zoogno/.well-known/assetlinks.json
```

### C. Nginx Deep Link Routing
React/SPA routing sab kuch `index.html` par point karta hai. Isey rokar JSON serve karne ke liye `.well-known` location block banaya gaya:
```nginx
    ################################
    # Deep Linking (.well-known)
    ################################
    location /.well-known/ {
        allow all;
        try_files $uri =404;
    }
```
*Is block ke baad Nginx restart karna hota hai (`sudo systemctl restart nginx`).*

---

## 4. Verification & Testing Checklist

> [!IMPORTANT]
> Future mein koi bhi issue check karne ke liye ye steps apnaein:

1. **Bot Preview Test:** Link copy karke WhatsApp par kisi ko paste karein (send nahi karna, bas type karna). Agar Image aur Title automatically aa gaya, toh matlab Nginx Bot Proxy theek chal raha hai.
2. **Android Keys Test:** Browser mein `https://zoogno.com/.well-known/assetlinks.json` khol ke dekhein. Homepage ki jagah JSON code aana chahiye.
3. **Google Validator:** [Google Digital Asset Links tool](https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://zoogno.com&relation=delegate_permission/common.handle_all_urls) open karke check karein.
4. **App Click Test:** Phone mein `https://zoogno.com/share/product/123` type karke bhejein aur click karein. Agar Flutter app installed hai, toh app directly open hogi.
