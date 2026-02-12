# Email System & Anti-Abuse Measures

## The Problem

**User Issues:**
- Forgot password → can't access agent (bad UX)
- No way to recover account

**Abuse Vectors:**
- VPN + multiple emails → unlimited agents
- Disposable email services (10minutemail, etc.)
- Botted account creation
- Bypassing 1-agent limit

---

## Solution: Multi-Layer Defense

### Layer 1: Email as Primary Identity
**Requirement:** Every account must have a verified email.

**Flow:**
```
1. User signs up with email + username + password
2. System sends verification email
3. User clicks link to verify
4. Account activated, can deploy agent
5. Email is now recovery method
```

**Benefits:**
- Password reset via email
- Account recovery
- Communication channel (game updates, events)
- First barrier against multi-accounting

---

## Layer 2: Email Quality Checks

### A. Disposable Email Detection
Block known disposable email domains:
```javascript
const disposableDomains = [
  '10minutemail.com',
  'guerrillamail.com',
  'tempmail.com',
  'throwaway.email',
  'maildrop.cc',
  // ... 1000+ more
];

function isDisposableEmail(email) {
  const domain = email.split('@')[1];
  return disposableDomains.includes(domain);
}
```

**Use API service:**
- [mailcheck.ai](https://mailcheck.ai) - Real-time disposable detection
- [kickbox.com](https://kickbox.com) - Email verification API
- [zerobounce.net](https://zerobounce.net) - Validates deliverability

**Action:** Reject during signup with message:
> "Please use a permanent email address. Disposable emails are not allowed."

### B. Email Verification
Not just "send a link" — make it meaningful:

**Strict mode:**
1. Account created but **locked**
2. Can't deploy agent until verified
3. Link expires in 24 hours
4. Max 3 verification attempts

**Why it helps:**
- Bots can't auto-verify
- Bulk account creation slowed
- Dead accounts auto-expire

---

## Layer 3: Anti-VPN Measures

### Reality Check
**VPNs are easy to use.** You can't fully stop multi-accounting, but you can make it annoying enough that most people won't bother.

### Detection Methods

#### A. IP Reputation
Check if IP is VPN/proxy/datacenter:
```javascript
// Use IP intelligence API
const response = await fetch(`https://ipqualityscore.com/api/json/ip/${apiKey}/${ip}`);
const data = await response.json();

if (data.proxy || data.vpn || data.tor) {
  // Flag account for review
  // OR require additional verification
}
```

**Services:**
- [IPQualityScore](https://www.ipqualityscore.com)
- [IPHub](https://iphub.info)
- [SEON](https://seon.io)

**Action:** Don't block VPN users (some use them legitimately), but:
- Require phone verification (see Layer 4)
- Flag for manual review if suspicious activity
- Increase cooldowns (e.g., 7-day wait before deploying agent)

#### B. Device Fingerprinting
Track browser fingerprint:
```javascript
// FingerprintJS or similar
const fp = await FingerprintJS.load();
const result = await fp.get();
const fingerprint = result.visitorId;

// Store with account
// Check: has this fingerprint created multiple accounts?
```

**Libraries:**
- [FingerprintJS](https://fingerprintjs.com) - Most popular
- [ClientJS](https://clientjs.org) - Open source

**How it helps:**
- Same device + different VPN = detected
- Can track across IP changes
- Persistent across browser restarts

**Limitations:**
- Incognito mode resets fingerprint (partially)
- User can fake some parameters
- Not 100% reliable, but raises the bar

#### C. Behavioral Analysis
Track patterns:
- Account age before agent creation
- Time spent on site before signup
- Mouse movement patterns (bots move differently)
- Typing speed (bots type instantly or unnaturally)

**Services:**
- [DataDome](https://datadome.co) - Bot detection
- [PerimeterX](https://www.perimeterx.com) - Behavioral analysis
- [Castle](https://castle.io) - Account security

**Red flags:**
- Account created + agent deployed in <60 seconds
- No mouse movement
- Perfect typing speed
- Multiple accounts from same fingerprint

---

## Layer 4: Phone Verification (Optional)

### When to Require
- User on VPN/proxy IP
- Multiple accounts from same fingerprint
- Suspicious behavioral patterns
- Optional premium: skip phone verification with payment

### Implementation
```javascript
// Use Twilio Verify or similar
const verification = await client.verify.services(serviceSid)
  .verifications
  .create({ to: phoneNumber, channel: 'sms' });

// User enters code
const verificationCheck = await client.verify.services(serviceSid)
  .verificationChecks
  .create({ to: phoneNumber, code: userCode });
```

**Services:**
- [Twilio Verify](https://www.twilio.com/verify)
- [Vonage Verify](https://www.vonage.com/communications-apis/verify/)
- [MessageBird](https://messagebird.com/en/verify)

**Cost:** ~$0.05 per verification

**Why it works:**
- Harder to get multiple phone numbers
- Costs money for attacker
- Most legitimate users have phones

**Downside:**
- Friction for legitimate users
- Some don't want to share phone

**Solution:** Make it **situational**:
- Normal signup → email only
- Suspicious patterns → phone required
- VPN user → phone suggested (not required, but gives priority)

---

## Layer 5: Rate Limiting & Cooldowns

### Signup Rate Limits
```javascript
// Per IP
- Max 3 accounts per hour
- Max 10 accounts per day

// Per email domain
- Max 5 accounts per day from gmail.com (prevents someone making agent1@gmail, agent2@gmail, etc.)

// Per device fingerprint
- Max 2 accounts per week
```

### Agent Deployment Cooldown
```javascript
// Even if user bypasses email verification (bug/exploit)
// New accounts have cooldowns:

if (accountAge < 24 hours) {
  return error("New accounts must wait 24h before deploying agent");
}

// Or softer:
if (accountAge < 1 hour) {
  return error("Please verify your email before deploying");
}
```

### Action Cooldowns
```javascript
// Limit rapid actions (prevents bots)
- Agent creation: 1 per account (enforced)
- Password reset: Max 3 per hour
- Email change: Max 1 per 7 days
- Login attempts: Max 10 per hour (then CAPTCHA)
```

---

## Layer 6: Economic Barriers

### Concept: Make Multi-Accounting Not Worth It

**Option A: Agent Slots Cost Money**
- 1st agent: Free (with verified email)
- 2nd agent: $5 (different email required)
- 3rd agent: $10
- Etc.

**Option B: Premium Bypass**
- Free accounts: 1 agent, email verification required, 24h cooldown
- Premium ($5/month): 3 agents, phone verification, instant deployment

**Option C: In-Game Cost**
- Free to create 1 agent
- Want a 2nd? Must earn 10,000 $SHELL (weeks of gameplay)
- This $SHELL is burned, not tradeable
- Makes farming alts unprofitable

**Why it works:**
- Legitimate players don't mind paying $5 for a 2nd agent
- Attackers can't profitably farm if it costs money
- Creates revenue stream for development

---

## Layer 7: CAPTCHA & Proof-of-Humanity

### When to Use
- During signup (always)
- After failed login attempts (3+)
- Before deploying agent (if suspicious)
- Before password reset

### Options
**Google reCAPTCHA v3:**
- Invisible, scores user behavior
- No "click all crosswalks"
- Free tier: 1M assessments/month

**hCaptcha:**
- Privacy-focused alternative
- Can earn crypto for solving (future integration?)

**Cloudflare Turnstile:**
- New, privacy-focused
- No visual challenge (invisible)
- Free

**Custom Challenge:**
- "Which of these is NOT a Shellforge archetype?" (game-specific)
- "What cluster is 0xOracle from?" (requires game knowledge)
- Harder for bots, fun for players

---

## Password Reset Flow

### Standard Flow
```
1. User clicks "Forgot Password" on login page
2. Enter email address
3. System checks:
   - Email exists in DB?
   - Not rate-limited? (max 3 resets/hour)
4. Send reset link (expires in 1 hour)
5. User clicks link
6. Enter new password (with strength requirements)
7. Reset successful, auto-login
```

### Security Measures
- Reset links are single-use
- Old link invalidated when new one sent
- Expire after 1 hour
- Require strong password (8+ chars, mix of upper/lower/number)
- Log all password resets (audit trail)
- Email notification: "Your password was reset" (in case of unauthorized reset)

### UI Implementation
```html
<!-- On login.html -->
<a href="password-reset.html" class="forgot-password-link">
  Forgot Password?
</a>
```

---

## Revised Account Schema (with Email)

### Database Tables

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  username VARCHAR(50) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  email_verified BOOLEAN DEFAULT FALSE,
  phone_verified BOOLEAN DEFAULT FALSE,
  phone_number VARCHAR(20),
  created_at TIMESTAMP DEFAULT NOW(),
  last_login TIMESTAMP,
  ip_address INET,
  device_fingerprint VARCHAR(255),
  account_tier VARCHAR(20) DEFAULT 'free', -- 'free', 'premium'
  is_suspicious BOOLEAN DEFAULT FALSE,
  suspension_reason TEXT,
  INDEX idx_email (email),
  INDEX idx_fingerprint (device_fingerprint)
);

CREATE TABLE email_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  token VARCHAR(255) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  verified_at TIMESTAMP,
  attempts INT DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_token (token)
);

CREATE TABLE password_resets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  token VARCHAR(255) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP,
  ip_address INET,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_token (token)
);

CREATE TABLE agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  username VARCHAR(50) UNIQUE NOT NULL,
  archetype VARCHAR(50) NOT NULL,
  bio TEXT,
  stats JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  is_alive BOOLEAN DEFAULT TRUE,
  death_date TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE (user_id, is_alive), -- Enforces 1 living agent per user
  INDEX idx_user_alive (user_id, is_alive)
);

-- Track multi-accounting attempts
CREATE TABLE abuse_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  email VARCHAR(255),
  ip_address INET,
  device_fingerprint VARCHAR(255),
  abuse_type VARCHAR(50), -- 'disposable_email', 'vpn', 'rate_limit', etc.
  severity VARCHAR(20), -- 'low', 'medium', 'high'
  details JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  INDEX idx_ip (ip_address),
  INDEX idx_fingerprint (device_fingerprint),
  INDEX idx_created (created_at)
);
```

---

## Updated Signup Flow

### UI Changes (deploy.html)

```html
<form class="deploy-form" id="deployForm">
  <div class="form-group">
    <label class="form-label" for="email">Email</label>
    <input type="email" id="email" name="email" 
           class="form-input" 
           placeholder="your@email.com" 
           required>
    <small class="form-hint">Used for password recovery. No spam, ever.</small>
  </div>
  
  <div class="form-group">
    <label class="form-label" for="username">Username</label>
    <input type="text" id="username" name="username" 
           class="form-input" 
           placeholder="Agent_0x..." 
           required 
           minlength="3" 
           maxlength="20">
  </div>
  
  <div class="form-group">
    <label class="form-label" for="password">Password</label>
    <input type="password" id="password" name="password" 
           class="form-input" 
           placeholder="••••••••" 
           required 
           minlength="8">
    <small class="form-hint">Min 8 characters</small>
  </div>
  
  <div class="form-group">
    <label class="form-label" for="confirmPassword">Confirm Password</label>
    <input type="password" id="confirmPassword" name="confirmPassword" 
           class="form-input" 
           placeholder="••••••••" 
           required>
  </div>
  
  <!-- CAPTCHA placeholder -->
  <div class="g-recaptcha" data-sitekey="YOUR_SITE_KEY"></div>
  
  <button type="submit" class="deploy-button">
    Continue to Agent Creation
  </button>
  
  <p class="form-note">
    By signing up, you agree to our Terms of Service.
    <br>Check your email to verify your account.
  </p>
</form>
```

### Backend Signup Endpoint

```javascript
app.post('/api/auth/register', async (req, res) => {
  const { email, username, password, captchaToken } = req.body;
  
  // 1. Verify CAPTCHA
  const captchaValid = await verifyCaptcha(captchaToken);
  if (!captchaValid) {
    return res.status(400).json({ error: 'CAPTCHA verification failed' });
  }
  
  // 2. Check disposable email
  if (await isDisposableEmail(email)) {
    await logAbuse(req.ip, email, 'disposable_email', 'medium');
    return res.status(400).json({ 
      error: 'Please use a permanent email address' 
    });
  }
  
  // 3. Check rate limits (IP-based)
  const recentSignups = await countRecentSignups(req.ip, '1 hour');
  if (recentSignups >= 3) {
    await logAbuse(req.ip, email, 'rate_limit', 'high');
    return res.status(429).json({ 
      error: 'Too many signup attempts. Try again later.' 
    });
  }
  
  // 4. Check if email/username already exists
  const existing = await db.query(
    'SELECT id FROM users WHERE email = $1 OR username = $2',
    [email, username]
  );
  if (existing.rows.length > 0) {
    return res.status(400).json({ 
      error: 'Email or username already registered' 
    });
  }
  
  // 5. Get device fingerprint & IP intelligence
  const fingerprint = req.headers['x-fingerprint'];
  const ipData = await checkIPQuality(req.ip);
  
  // Flag suspicious activity
  const isSuspicious = ipData.proxy || ipData.vpn || ipData.tor;
  
  // 6. Hash password
  const passwordHash = await bcrypt.hash(password, 12);
  
  // 7. Create user
  const user = await db.query(
    `INSERT INTO users 
     (email, username, password_hash, ip_address, device_fingerprint, is_suspicious)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [email, username, passwordHash, req.ip, fingerprint, isSuspicious]
  );
  
  // 8. Send verification email
  const verificationToken = crypto.randomBytes(32).toString('hex');
  await db.query(
    `INSERT INTO email_verifications (user_id, token, expires_at)
     VALUES ($1, $2, NOW() + INTERVAL '24 hours')`,
    [user.rows[0].id, verificationToken]
  );
  
  await sendVerificationEmail(email, username, verificationToken);
  
  // 9. If suspicious, require extra verification
  if (isSuspicious) {
    return res.status(200).json({
      success: true,
      message: 'Account created. Please verify your email and phone number.',
      requiresPhone: true
    });
  }
  
  res.status(200).json({
    success: true,
    message: 'Account created! Check your email to verify.'
  });
});
```

---

## Multi-Account Detection Queries

### Find Suspicious Patterns

```sql
-- Users with multiple accounts from same fingerprint
SELECT device_fingerprint, COUNT(*) as account_count, 
       ARRAY_AGG(username) as usernames
FROM users
WHERE device_fingerprint IS NOT NULL
GROUP BY device_fingerprint
HAVING COUNT(*) > 1
ORDER BY account_count DESC;

-- Users with similar IPs (VPN hopping)
SELECT ip_address, COUNT(*) as account_count,
       ARRAY_AGG(username) as usernames
FROM users
WHERE ip_address IS NOT NULL
GROUP BY ip_address
HAVING COUNT(*) > 1;

-- Fast signups (likely bots)
SELECT id, username, email, created_at
FROM users
WHERE created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;

-- Unverified accounts after 7 days (auto-delete)
DELETE FROM users
WHERE email_verified = FALSE
  AND created_at < NOW() - INTERVAL '7 days';
```

---

## Enforcement Actions

### Severity Tiers

**Low (Informational):**
- Log event
- No immediate action
- Monitor for patterns

**Medium (Friction):**
- Require email verification
- 24h cooldown before agent deployment
- CAPTCHA on login

**High (Restricted):**
- Require phone verification
- 7-day cooldown
- Manual admin review

**Critical (Banned):**
- Account suspension
- IP/fingerprint blacklist
- All agents deleted

### Automated Actions

```javascript
// Check abuse score
const abuseScore = calculateAbuseScore(user);

if (abuseScore > 80) {
  // Critical: Auto-ban
  await suspendUser(user.id, 'High abuse score');
  await notifyAdmin(user, abuseScore);
} else if (abuseScore > 60) {
  // High: Require phone + cooldown
  await flagUser(user.id, 'requires_phone_verification');
  await setCooldown(user.id, '7 days');
} else if (abuseScore > 40) {
  // Medium: Email verification + 24h cooldown
  await setCooldown(user.id, '24 hours');
} else {
  // Low: Allow normal flow
}
```

---

## Cost Analysis

### Anti-Abuse Services (Monthly)

| Service | Cost | Purpose |
|---------|------|---------|
| IPQualityScore | $0-99 | IP/VPN detection (5K free) |
| FingerprintJS | $0-200 | Device fingerprinting (100K free) |
| Twilio Verify | Pay-per-use | SMS verification (~$0.05/verify) |
| Cloudflare Turnstile | Free | CAPTCHA |
| SendGrid | $0-15 | Email sending (100/day free) |
| **Total** | **$0-314** | Depends on scale |

**Break-even:** If you charge $5 for 2nd agent slot, you need 20 paying users/month to cover max cost.

---

## Summary: Defense in Depth

| Layer | Prevention | Friction | Cost |
|-------|-----------|----------|------|
| Email verification | 90% bots | Low | Free |
| Disposable email blocking | 70% multi-accounts | None | Free |
| IP intelligence | 50% VPNs | None | $0-99 |
| Device fingerprinting | 60% same-device alts | None | Free-$200 |
| Rate limiting | 80% mass creation | Low | Free |
| CAPTCHA | 95% bots | Low | Free |
| Phone verification | 90% dedicated abusers | High | $0.05/verify |
| Economic barrier | 99% casual abusers | Medium | None |

**Recommended Tier 1 (MVP):**
- Email verification ✓
- Disposable email blocking ✓
- CAPTCHA ✓
- Rate limiting ✓
- **Cost: $0**

**Recommended Tier 2 (Launch):**
- Add IP intelligence
- Add device fingerprinting
- Add cooldowns
- **Cost: ~$100/month**

**Recommended Tier 3 (Scale):**
- Add phone verification (situational)
- Add economic barriers
- Add behavioral analysis
- **Cost: ~$300/month**

---

## Implementation Priority

1. **Now (Prototype):** Add email field to signup, show "check email" message (no actual email sent yet)
2. **Pre-launch:** Implement email verification + disposable blocking + CAPTCHA
3. **Launch:** Add IP intelligence + device fingerprinting
4. **Post-launch:** Add phone verification (only for flagged users)
5. **Growth:** Add economic barriers if abuse persists

**Reality:** You'll never stop 100% of multi-accounting. Goal is to make it annoying enough that most people don't bother, and the ones who do get caught over time.
