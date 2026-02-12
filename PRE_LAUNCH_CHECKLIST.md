# 🚀 Pre-Launch Checklist for Shellforge.xyz

## ✅ Quick Deployment Path (30 minutes)

### Step 1: Add Prototype Banner (5 min)
- [ ] Copy contents of `prototype-banner.html`
- [ ] Paste at top of `<body>` tag in `index.html`
- [ ] Test locally that banner shows and "Let's Go!" button dismisses it
- [ ] Refresh page - verify banner doesn't show again (stored in localStorage)

### Step 2: Push to GitHub (10 min)
```bash
cd /Users/buddyguy/openclaw-projects/shellforge-website

# Initialize git
git init
git add .
git commit -m "Shellforge Realms - Alpha Prototype v0.1"

# Create GitHub repo (replace YOUR_USERNAME)
# Option A: Via GitHub web interface
# - Go to github.com/new
# - Create repo "shellforge-realms" (public)
# - Copy the remote URL

# Option B: Via gh CLI (if installed)
gh repo create shellforge-realms --public --source=. --push

# If Option A, add remote manually:
git remote add origin https://github.com/YOUR_USERNAME/shellforge-realms.git
git branch -M main
git push -u origin main
```

### Step 3: Deploy to Cloudflare Pages (10 min)
1. **Go to Cloudflare Dashboard**
   - https://dash.cloudflare.com
   
2. **Navigate to Pages**
   - Click "Workers & Pages" in sidebar
   - Click "Create application" → "Pages" tab
   - Click "Connect to Git"

3. **Connect GitHub**
   - Authorize Cloudflare to access GitHub
   - Select `shellforge-realms` repository
   - Click "Begin setup"

4. **Configure Build Settings**
   - **Project name:** `shellforge-realms`
   - **Production branch:** `main`
   - **Framework preset:** None
   - **Build command:** *(leave empty)*
   - **Build output directory:** `/` *(root directory)*
   - Click "Save and Deploy"

5. **Wait for Deployment** (~2 minutes)
   - Watch build logs
   - Get temporary URL (e.g., `shellforge-realms.pages.dev`)

### Step 4: Connect Custom Domain (5 min)
1. In your Cloudflare Pages project:
   - Click "Custom domains" tab
   - Click "Set up a custom domain"
   - Enter: `shellforge.xyz`
   - Click "Continue"

2. Cloudflare will auto-configure DNS:
   - CNAME for www
   - DNS records for apex domain
   - HTTPS certificate (automatic)

3. **Wait for DNS propagation** (5-10 minutes)

### Step 5: Test Live Site (5 min)
- [ ] Visit https://shellforge.xyz
- [ ] Prototype banner shows
- [ ] Click "Let's Go!" - banner dismisses
- [ ] Navigate to "Deploy Agent"
- [ ] Create account (email/password)
- [ ] Select archetype, write bio
- [ ] Click "Deploy Agent"
- [ ] Dashboard loads with agent
- [ ] Try sending a whisper
- [ ] Hover over wilderness markers on map (should show location info)
- [ ] Check that 6 markers appear on map
- [ ] Verify marker tooltips show distance, time, energy, danger
- [ ] Refresh page - agent persists
- [ ] Test on mobile device

---

## 📋 Extended Checklist (Optional Improvements)

### Polish (Before Launch)
- [ ] Add favicon.ico (create 32x32 icon)
- [ ] Add Open Graph meta tags for social media
- [ ] Test all 12 archetypes load images correctly
- [ ] Verify map displays correctly
- [ ] Test whisper responses (try 5-10 times)
- [ ] Check that all 150 messages can display

### Testing (Different Browsers)
- [ ] Chrome (desktop)
- [ ] Firefox (desktop)
- [ ] Safari (desktop)
- [ ] Mobile Chrome (Android/iOS)
- [ ] Mobile Safari (iOS)

### Performance
- [ ] Check page load speed (should be <2s)
- [ ] Verify images aren't too large
- [ ] Test with slow connection
- [ ] Check console for errors

### Content
- [ ] Spellcheck all pages
- [ ] Verify all links work
- [ ] Check that "coming soon" features are labeled
- [ ] Ensure no placeholder text remains

---

## 🐛 Known Issues (OK for Prototype)

### Non-Critical
- ✅ Console.log statements visible in browser console (8 found)
- ✅ No loading states (instant transitions)
- ✅ No favicon (shows default)
- ✅ localStorage warnings (documented in banner)

### By Design (Prototype Limitations)
- ✅ No backend (localStorage only)
- ✅ No cross-device sync
- ✅ No real-time multiplayer
- ✅ 1 agent per browser
- ✅ Clear cache = lose data

**These are fine for an alpha prototype!**

---

## 📱 Post-Launch Testing

### Day 1 Checklist
- [ ] Share with 3-5 friends for private testing
- [ ] Ask them to try:
  - Creating an agent
  - Sending whispers
  - Refreshing page (does agent persist?)
  - Testing on mobile
- [ ] Collect feedback on:
  - What's confusing?
  - Any bugs?
  - What's fun?
  - What's missing?

### Week 1 Checklist
- [ ] Monitor for common issues
- [ ] Fix critical bugs if any
- [ ] Add FAQ if needed
- [ ] Consider public launch (Twitter, Discord, Reddit)

---

## 🎯 Success Metrics (What to Track)

Even without analytics, you can manually check:
- How many friends test it?
- What feedback do they give?
- Any common complaints?
- What features do they want?

Later, add Google Analytics to track:
- Visitors
- Page views
- Time on site
- Agent creation rate
- Whisper usage

---

## 🚨 Emergency Rollback Plan

If something breaks after deployment:

### Quick Fix (Same Code)
1. Make changes locally
2. `git add .`
3. `git commit -m "Fix: description"`
4. `git push`
5. Cloudflare auto-deploys (~2 min)

### Rollback to Previous Version
1. Go to Cloudflare Pages → Deployments
2. Find last working deployment
3. Click "..." → "Rollback to this deployment"
4. Site reverts immediately

### Take Site Down Temporarily
1. Create `index.html` with maintenance message
2. Push to GitHub
3. Or: In Cloudflare Pages, disable deployment

---

## 📞 Troubleshooting

### "Images not loading"
- Check: Are images in git? (`git ls-files images/`)
- Fix: `git add images/ && git commit -m "Add images" && git push`

### "CSS not loading"
- Check: Is `style.css` in root?
- Check: No syntax errors in CSS?
- Fix: Inspect browser console for 404 errors

### "Domain not working"
- Wait: DNS can take up to 48h (usually 5-10 min)
- Check: Cloudflare Pages → Custom domains → Status
- Try: `https://shellforge-realms.pages.dev` (temporary URL works?)

### "localStorage not working"
- Check: Are cookies/storage enabled in browser?
- Check: Incognito mode? (localStorage may be disabled)
- Try: Regular browser window

### "Page shows 404"
- Check: Is `index.html` in root directory (not in subfolder)?
- Check: Repository structure on GitHub
- Fix: Move files to root if needed

---

## ✅ Final Pre-Flight Check

Before hitting "Deploy":

**Files in Root Directory:**
- [x] index.html
- [x] deploy.html
- [x] agent-creator.html
- [x] dashboard.html
- [x] login.html
- [x] style.css
- [x] terminal-notifications.css
- [x] terminal-notifications.js
- [x] world-coordinates.js
- [x] images/ (directory)
- [ ] prototype-banner.html (contents added to index.html)

**Prototype Banner:**
- [ ] Added to index.html
- [ ] Tested locally (shows once, then disappears)

**Git Repository:**
- [ ] All files committed
- [ ] Pushed to GitHub
- [ ] Repository is public (or Cloudflare has access)

**Cloudflare Pages:**
- [ ] Project created
- [ ] Connected to GitHub repo
- [ ] Build settings configured (empty build, root output)
- [ ] Custom domain added (shellforge.xyz)

**Testing:**
- [ ] Temporary .pages.dev URL works
- [ ] Custom domain works (may take 5-10 min)
- [ ] All pages load
- [ ] Agent creation works
- [ ] Dashboard loads

---

## 🎉 You're Live!

Once deployed, your prototype is live at:
- **Primary:** https://shellforge.xyz
- **Backup:** https://shellforge-realms.pages.dev

**Congrats!** 🎮💀✨

Now you can:
1. Share with friends for testing
2. Collect feedback
3. Plan backend development
4. Iterate based on real usage

---

## 🔄 Next Steps After Launch

### Immediate (This Week)
- Monitor for bugs
- Collect user feedback
- Test on various devices
- Create FAQ if needed

### Short-term (Next Month)
- Plan backend architecture
- Set up database (PostgreSQL on Railway/Supabase)
- Build API (Express.js or similar)
- Implement real user accounts
- Add agent export/import (backup feature)

### Medium-term (2-3 Months)
- Implement AI agent decisions (Haiku API)
- Real-time gameplay
- Multiplayer features
- Leaderboards
- Social features

---

**Estimated Total Time:** 30-60 minutes
**Difficulty:** Easy (static site deployment)
**Risk Level:** Low (easy to rollback)

**You got this!** 🚀
