# Shellforge Realms - Deployment Guide

## 🎯 Current Status: Prototype Ready

Your browser game is ready to deploy as an **alpha prototype/demo**!

**Domain:** shellforge.xyz (Cloudflare)
**Tech Stack:** Pure HTML/CSS/JavaScript (static site)
**Current Backend:** None (localStorage only)

---

## ✅ Good News: No Traditional Hosting Needed!

Since it's a static browser game, you can use **Cloudflare Pages** (free) which integrates perfectly with your domain.

---

## 🚀 Deployment Option 1: Cloudflare Pages (RECOMMENDED)

### Why Cloudflare Pages?
- ✅ **Free** (unlimited bandwidth)
- ✅ **Already have Cloudflare domain**
- ✅ **Global CDN** (fast worldwide)
- ✅ **Automatic HTTPS**
- ✅ **Git-based deployment** (push → auto-deploy)
- ✅ **Preview deployments** for testing

### Setup Steps

#### 1. Create GitHub Repository
```bash
cd /Users/buddyguy/openclaw-projects/shellforge-website
git init
git add .
git commit -m "Initial Shellforge Realms prototype"

# Create repo on GitHub, then:
git remote add origin https://github.com/YOUR_USERNAME/shellforge-realms.git
git push -u origin main
```

#### 2. Connect to Cloudflare Pages

1. Go to **Cloudflare Dashboard** → **Pages**
2. Click **"Create a project"**
3. Connect your **GitHub account**
4. Select **shellforge-realms** repository
5. Configuration:
   - **Production branch:** `main`
   - **Build command:** *(leave empty - no build needed)*
   - **Build output directory:** `/` *(root)*
6. Click **"Save and Deploy"**

#### 3. Set Custom Domain

1. In Cloudflare Pages project → **Custom domains**
2. Add **shellforge.xyz**
3. Cloudflare will auto-configure DNS
4. HTTPS will be automatic

**Done!** Your site is live at https://shellforge.xyz 🎉

---

## 🚀 Deployment Option 2: GitHub Pages (Alternative)

If you prefer GitHub:

1. Push to GitHub (same as above)
2. Go to repo **Settings** → **Pages**
3. Source: **Deploy from branch** → `main` → `/` (root)
4. In Cloudflare DNS, add:
   - **CNAME** record: `www` → `YOUR_USERNAME.github.io`
   - **A** records for apex domain (GitHub's IPs)

---

## 📋 Pre-Launch Checklist

### Critical Items

- [ ] **Add prototype warning banner** (see below)
- [ ] **Test all pages load** (index, deploy, agent-creator, dashboard)
- [ ] **Test agent creation flow** end-to-end
- [ ] **Verify all images load** (check images/ directory exists)
- [ ] **Test on mobile** (responsive design)
- [ ] **Check all links work** (navigation, buttons)
- [ ] **Test localStorage** (create agent, refresh page, still there)

### Recommended (Optional)

- [ ] Remove or comment out `console.log()` statements (8 found)
- [ ] Add Google Analytics or tracking (if desired)
- [ ] Add favicon (currently missing)
- [ ] Add Open Graph tags for social media sharing
- [ ] Compress images for faster load
- [ ] Add "Report Bug" or feedback link

---

## ⚠️ IMPORTANT: Prototype Warning

**Add this to your homepage (index.html) to set expectations:**

```html
<!-- Add at top of <body> or as a modal -->
<div class="prototype-notice">
    <div class="notice-content">
        <h3>🚧 ALPHA PROTOTYPE</h3>
        <p>This is an early prototype. Your agent data is stored locally in your browser.</p>
        <ul>
            <li>Don't clear your browser cache or you'll lose your agent</li>
            <li>Can't access from different devices/browsers</li>
            <li>Backend multiplayer coming soon</li>
        </ul>
        <button class="btn-understand" onclick="dismissNotice()">I Understand</button>
    </div>
</div>

<style>
.prototype-notice {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.95);
    z-index: 10000;
    display: flex;
    align-items: center;
    justify-content: center;
}

.notice-content {
    background: #0a0a0f;
    border: 3px solid var(--color-primary);
    border-radius: 8px;
    padding: 40px;
    max-width: 500px;
    text-align: center;
}

.notice-content h3 {
    color: #ffcc00;
    font-family: var(--font-title);
    margin-bottom: 20px;
}

.notice-content ul {
    text-align: left;
    margin: 20px 0;
    line-height: 1.8;
}

.btn-understand {
    background: var(--color-primary);
    color: #000;
    border: none;
    padding: 12px 30px;
    font-family: var(--font-title);
    font-size: 1rem;
    cursor: pointer;
    border-radius: 4px;
}
</style>

<script>
function dismissNotice() {
    // Store that they've seen it
    localStorage.setItem('shellforge_notice_seen', 'true');
    document.querySelector('.prototype-notice').style.display = 'none';
}

// Check if already seen
if (localStorage.getItem('shellforge_notice_seen')) {
    document.querySelector('.prototype-notice').style.display = 'none';
}
</script>
```

---

## 🔍 What Works Now (localStorage)

✅ **Agent Creation:** Create 1 agent per browser
✅ **Agent Customization:** 12 archetypes, bio, stats
✅ **Dashboard:** View agent stats, map, inventory
✅ **Whispers:** Send whispers, get sassy responses
✅ **Visual Polish:** All animations, hover effects
✅ **Terminal Notifications:** All custom alerts

---

## ❌ Current Limitations (No Backend)

❌ **No real user accounts** (localStorage = per-browser)
❌ **No cross-device sync** (can't login elsewhere)
❌ **No multiplayer** (no agent-to-agent interaction yet)
❌ **No real-time updates** (no WebSockets)
❌ **No leaderboards** (no database)
❌ **No save/export** (clear cache = lose data)

**This is normal for a prototype!** You can add backend later.

---

## 🎮 Testing Before Launch

### Desktop Testing
1. Open in **Chrome** → create agent → verify it persists on refresh
2. Open in **Firefox** → verify all features work
3. Open in **Safari** → check animations/styling

### Mobile Testing
1. Open on **iPhone/Android**
2. Test responsive layout
3. Verify touch interactions work
4. Check that terminal notifications display properly

### Flow Testing
1. **Homepage** → Click "Deploy Agent"
2. **Deploy page** → Enter email/password → Submit
3. **Agent Creator** → Select archetype → Write bio → Deploy
4. **Dashboard** → Verify agent loads, map works, whispers work
5. **Logout** → Login again → Verify agent still exists

---

## 📊 Analytics (Optional)

If you want to track visitors:

### Google Analytics 4 (Free)
```html
<!-- Add to <head> of all pages -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-XXXXXXXXXX');
</script>
```

### Simple Analytics (Privacy-friendly alternative)
- https://simpleanalytics.com
- No cookies, GDPR-compliant
- $19/month

---

## 🐛 Known Issues to Fix (Optional)

### Minor
- 8 `console.log()` statements (non-critical, but noisy in browser console)
- No favicon (shows default browser icon)
- Missing Open Graph tags (won't preview nicely on Twitter/Discord)

### Cosmetic
- Prototype banner not implemented yet (see above)
- No "loading" state when pages load
- No error handling for missing images

---

## 🚀 Post-Launch TODO

### Immediate (Week 1)
- [ ] Monitor for bugs (set up error logging?)
- [ ] Collect player feedback
- [ ] Test on various devices/browsers
- [ ] Share on Twitter/Discord for initial testers
- [ ] Create FAQ or Help page

### Short-term (Month 1)
- [ ] Set up backend (database, API)
- [ ] Real user accounts (email verification)
- [ ] Cross-device sync
- [ ] Export/import agent feature (backup)
- [ ] Analytics review (what are players doing?)

### Medium-term (Month 2-3)
- [ ] Multiplayer features (agent interaction)
- [ ] Real-time gameplay (AI decisions)
- [ ] Leaderboards
- [ ] Social features (share agent, PvP)
- [ ] Payment integration ($SHELL currency)

---

## 🛡️ Security Notes

### Current Security (localStorage)
- ✅ **No server = no server vulnerabilities**
- ✅ **No user data stored remotely** (privacy-friendly)
- ⚠️ **XSS protection:** Cloudflare CDN helps, but still use CSP headers

### Future Security (when adding backend)
- Password hashing (bcrypt)
- Email verification
- Rate limiting (prevent spam)
- CSRF tokens
- Input sanitization
- API authentication

---

## 💰 Costs

### Current (Prototype)
- **Domain:** ~$10/year (Cloudflare)
- **Hosting:** $0 (Cloudflare Pages free tier)
- **Total:** ~$10/year

### Future (With Backend)
- **Domain:** ~$10/year
- **Hosting:** $0 (Pages still free)
- **Database:** $5-20/month (Railway, Supabase, PlanetScale)
- **API hosting:** $0-25/month (Vercel/Netlify free tier or Railway)
- **AI API (Haiku):** Pay-per-use (~$0.25 per 1M tokens)

---

## 📱 Social Media Prep

Before sharing widely:

1. **Take screenshots** of best moments (agent creation, dashboard, whisper responses)
2. **Record short video** (30-60s gameplay demo)
3. **Write launch tweet:**
   ```
   🎮 Shellforge Realms - ALPHA PROTOTYPE
   
   Create your AI agent, whisper commands, get roasted by your own creation 💀
   
   Features:
   - 12 unique archetypes
   - 150 sassy AI responses
   - Cyberpunk terminal aesthetic
   
   Play now: https://shellforge.xyz
   
   #indiegame #AIagent #browsergame
   ```

4. **Prepare for feedback:** Have a Discord/feedback form ready

---

## 🎯 Launch Strategy

### Soft Launch (Now)
1. Deploy to Cloudflare Pages
2. Test thoroughly yourself
3. Share with 5-10 friends for private testing
4. Fix critical bugs

### Public Launch (When Ready)
1. Add prototype banner
2. Share on Twitter with demo video
3. Post in relevant Discord servers (game dev, indie games)
4. Post on Reddit r/incremental_games, r/WebGames
5. Submit to itch.io (alternative hosting + community)

---

## ✅ Deploy Now or Wait?

**Deploy Now If:**
- ✅ You want early feedback
- ✅ You're okay with "prototype" label
- ✅ You want to iterate publicly
- ✅ You understand localStorage limitations

**Wait If:**
- ❌ You want a "polished launch"
- ❌ You need real user accounts first
- ❌ You want multiplayer working
- ❌ You're worried about first impressions

**My Recommendation:** 🚀 **Deploy now as "alpha prototype"**

Why?
- Get real player feedback early
- Test on various devices/browsers
- Build hype gradually
- Iterate based on real usage
- localStorage works fine for single-player testing

---

## 🔧 Quick Deployment Commands

```bash
# 1. Navigate to project
cd /Users/buddyguy/openclaw-projects/shellforge-website

# 2. Initialize git (if not already)
git init
git add .
git commit -m "Shellforge Realms - Alpha Prototype v0.1"

# 3. Create GitHub repo (via web or gh CLI)
gh repo create shellforge-realms --public --source=. --push

# 4. Go to Cloudflare Pages → Connect GitHub → Deploy
# Done!
```

---

## 📞 Need Help?

Common issues:
- **Images not loading:** Check that `images/` folder is committed to git
- **Styles broken:** Verify all CSS files are in root directory
- **404 errors:** Make sure `index.html` is in root (not a subfolder)
- **DNS issues:** Wait 24-48h for DNS propagation

---

**Status:** Ready to deploy! 🚀
**Estimated setup time:** 15-30 minutes
**Risk level:** Low (it's just static files, easy to fix)

Let's get this live! 💀✨
