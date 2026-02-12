# Shellforge Realms - Teaser Website

A professional single-page teaser website for Shellforge Realms.

## 📁 Structure

```
shellforge-website/
├── index.html       # Main HTML page
├── style.css        # All styles (dark cyberpunk theme)
├── script.js        # Interactions & animations
├── visuals/         # Game screenshots/concept art
│   ├── citystreets.jpg
│   ├── marketplace.jpg
│   └── graveyard.jpg
└── README.md        # This file
```

## 🚀 How to View

### Option 1: Open Locally
Simply double-click `index.html` in Finder or open it in any web browser.

### Option 2: Local Server (recommended)
```bash
cd /Users/buddyguy/openclaw-projects/shellforge-website
python3 -m http.server 8000
# Then open: http://localhost:8000
```

### Option 3: Deploy (GitHub Pages, Netlify, Vercel)
- **GitHub Pages**: Push to GitHub, enable Pages in settings
- **Netlify**: Drag the folder onto netlify.com/drop
- **Vercel**: `npm i -g vercel` then `vercel` in this directory

## 🎨 Features

- ✅ Responsive design (mobile-friendly)
- ✅ Dark cyberpunk aesthetic (neon cyan/magenta)
- ✅ Smooth scroll animations
- ✅ Glitch effects on title
- ✅ Interactive hover states
- ✅ Gallery with image previews
- ✅ Subscribe form (needs backend hookup)
- ✅ Social links placeholders

## 🔧 Customization

### Change Colors
Edit `style.css` `:root` variables:
```css
--color-primary: #00ffcc;    /* Neon cyan */
--color-secondary: #ff00aa;  /* Neon pink */
--color-accent: #7b2cbf;     /* Purple */
```

### Add More Images
1. Place images in `visuals/` folder
2. Add to gallery in `index.html`:
```html
<div class="gallery-item">
    <img src="visuals/yourimage.jpg" alt="Description">
    <div class="gallery-caption">Your Caption</div>
</div>
```

### Hook Up Subscribe Form
Edit `script.js` subscribe handler to send to your backend:
```javascript
fetch('https://your-api.com/subscribe', {
    method: 'POST',
    body: JSON.stringify({ email }),
    headers: { 'Content-Type': 'application/json' }
})
```

### Enable Matrix Rain Effect
In `script.js`, uncomment the last line:
```javascript
createMatrixRain(); // Uncomment this
```

## 📝 To-Do

- [ ] Add actual social media links (Discord, Twitter, GitHub)
- [ ] Connect subscribe form to backend (Mailchimp, ConvertKit, etc.)
- [ ] Add more gameplay screenshots/GIFs
- [ ] Create favicon
- [ ] Add meta tags for social sharing (Open Graph, Twitter Cards)
- [ ] Optimize images (compress JPGs)
- [ ] Add loading animations

## 🎯 Content Based On

- `Shellforge - Main Idea.pdf`
- `Shellforge - Combat system.pdf`
- Game visuals from `/Game Idea/photos and idea/`

## 🌐 Next Steps

1. **Get screenshots**: Take 3-5 in-game screenshots from your Godot project
2. **Replace placeholders**: Swap concept art with actual game visuals
3. **Deploy**: Push to GitHub Pages or Netlify
4. **Share**: Post on Twitter, Discord, Reddit (r/gamedev, r/IndieGaming)
5. **Analytics**: Add Google Analytics or Plausible to track visitors

---

**Built in ~2 hours** | Pure HTML/CSS/JS (no frameworks)
