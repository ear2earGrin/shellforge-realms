# Email & Password Recovery Implementation

## Summary
Added email requirement to signup + password reset functionality to solve the "forgot password" problem and establish foundation for anti-abuse measures.

---

## What Changed

### 1. Deploy Page (deploy.html)
**Added Fields:**
- Email (required, validated)
- Password confirmation (must match)

**Validation:**
- Email format check (regex)
- Disposable email detection (basic list)
- Password minimum 8 characters
- Passwords must match
- Username 3-20 characters

**User Flow:**
```
User fills: Email + Username + Password + Confirm
  ↓ Validation checks
  ↓ Alert: "Account created! You would receive verification email"
  ↓ Stores in sessionStorage
  → Redirects to agent-creator.html
```

**Security Checks:**
- Disposable domains blocked: tempmail.com, 10minutemail.com, guerrillamail.com, throwaway.email
- Email collision check (1 agent per email)
- Username collision check

### 2. Agent Creator (agent-creator.html)
**Updated:**
- Now expects email in sessionStorage
- Stores email with agent data
- Email saved to localStorage for future login validation

### 3. Login Page (login.html)
**Added:**
- "Forgot Password?" link below password field
- Links to password-reset.html

### 4. Password Reset Page (password-reset.html - NEW)
**Features:**
- Email input form
- Simulates sending reset link
- Always shows success (security: don't reveal if email exists)
- Dev mode: Checks localStorage and logs to console
- Links back to login page

**Security Best Practice:**
> Always return "Check your email" even if email doesn't exist.
> Prevents attackers from discovering valid email addresses.

---

## localStorage Schema Update

### Before:
```javascript
{
  shellforgeAgent: { username, archetype, ... },
  shellforgeUsername: "Vex",
  shellforgeLoggedIn: "Vex"
}
```

### After:
```javascript
{
  shellforgeAgent: { 
    email: "user@example.com",  // NEW
    username, 
    archetype, 
    ... 
  },
  shellforgeEmail: "user@example.com",  // NEW
  shellforgeUsername: "Vex",
  shellforgeLoggedIn: "Vex"
}
```

---

## User Flows

### New User Signup
```
1. index.html → Click "Deploy Your Agent"
2. deploy.html:
   - Enter email: user@example.com
   - Enter username: Vex
   - Enter password: ••••••••
   - Confirm password: ••••••••
   ↓ Submit
3. Validation:
   ✓ Email format valid
   ✓ Not disposable email
   ✓ Passwords match
   ✓ No existing agent with this email/username
   ↓ Pass
4. Alert: "Account created! [In production: check email]"
5. agent-creator.html → Deploy agent
6. dashboard.html → Logged in
```

### Forgot Password
```
1. login.html → Click "Forgot Password?"
2. password-reset.html:
   - Enter email: user@example.com
   ↓ Submit
3. Always shows: "Check your email!"
4. (In production: Email sent with reset link)
5. User clicks link → Reset password → Login
```

### Login with Email Check
```
1. login.html:
   - Enter username: Vex
   - Enter password: ••••••••
   ↓ Submit
2. Backend checks:
   - Username exists?
   - Password correct?
   - Email verified? (future)
   ↓ Success
3. dashboard.html
```

---

## Anti-Abuse Foundation

### Currently Implemented (Client-Side)
✅ **Email requirement** - Every account needs email
✅ **Disposable email blocking** - 4 common domains blocked
✅ **Email collision check** - 1 agent per email
✅ **Username collision check** - Usernames unique
✅ **Password strength** - Minimum 8 characters
✅ **Password confirmation** - Must match

### Ready for Backend (See EMAIL_AND_ANTI_ABUSE.md)
- IP intelligence (VPN/proxy detection)
- Device fingerprinting (track same device)
- Rate limiting (max 3 signups/hour per IP)
- Email verification (send link, require click)
- Phone verification (for suspicious accounts)
- CAPTCHA (Google reCAPTCHA v3 or Cloudflare Turnstile)
- Behavioral analysis (bot detection)

---

## Password Reset Flow (Production)

### Backend Implementation Needed

**1. Request Reset:**
```javascript
POST /api/auth/password-reset
Body: { email: "user@example.com" }

→ Generate secure token (crypto.randomBytes(32))
→ Store in password_resets table with expiry (1 hour)
→ Send email with link: https://shellforge.com/reset?token=abc123
→ Return 200 OK (always, even if email doesn't exist)
```

**2. Email Template:**
```
Subject: Password Reset - Shellforge Realms

Hi there,

You requested a password reset for your Shellforge account.

Click here to reset your password:
https://shellforge.com/reset?token=abc123def456

This link expires in 1 hour.

If you didn't request this, ignore this email.

- Shellforge Team
```

**3. Reset Password:**
```javascript
GET /reset?token=abc123def456
→ Show new password form (if token valid)

POST /api/auth/password-reset-confirm
Body: { token: "abc123def456", newPassword: "••••••••" }

→ Verify token (not expired, not used)
→ Hash new password (bcrypt)
→ Update user password
→ Invalidate token
→ Send confirmation email ("Your password was changed")
→ Redirect to login with success message
```

---

## Email Service Options

### Transactional Email (Verification + Password Reset)

**1. SendGrid (Recommended)**
- Free tier: 100 emails/day
- Easy API
- Good deliverability
- Cost: $0-15/month

**2. AWS SES**
- $0.10 per 1,000 emails
- Requires domain verification
- Very cheap at scale
- Slightly more complex setup

**3. Mailgun**
- Free tier: 5,000 emails/month
- Good for testing
- Cost: $0-35/month

**4. Postmark**
- Best deliverability
- $10/month for 10,000 emails
- Premium option

### Implementation Example (SendGrid)

```javascript
const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

async function sendPasswordResetEmail(email, username, token) {
  const resetUrl = `https://shellforge.com/reset?token=${token}`;
  
  const msg = {
    to: email,
    from: 'noreply@shellforge.com',
    subject: 'Password Reset - Shellforge Realms',
    text: `Hi ${username},\n\nClick here to reset: ${resetUrl}`,
    html: `
      <div style="font-family: monospace; background: #0a0a0f; color: #00ffcc; padding: 20px;">
        <h2>Password Reset Request</h2>
        <p>Hi ${username},</p>
        <p>Click the link below to reset your password:</p>
        <a href="${resetUrl}" style="color: #ff00aa;">Reset Password</a>
        <p>This link expires in 1 hour.</p>
        <p style="color: #888; font-size: 0.9em;">
          If you didn't request this, ignore this email.
        </p>
      </div>
    `
  };
  
  await sgMail.send(msg);
}
```

---

## Email Verification Flow (Future)

### On Signup:
```
1. User signs up with email
2. Account created but locked (email_verified = FALSE)
3. Send verification email with token
4. User must click link to unlock account
5. Can't deploy agent until verified
6. Link expires in 24 hours
```

### Benefits:
- Confirms email is real + accessible
- Prevents throwaway emails
- Reduces bot signups by 90%
- Establishes communication channel

### Implementation:
```javascript
// On signup
const token = crypto.randomBytes(32).toString('hex');
await db.query(
  'INSERT INTO email_verifications (user_id, token, expires_at) VALUES ($1, $2, $3)',
  [userId, token, new Date(Date.now() + 24 * 60 * 60 * 1000)]
);

// Send email
await sendVerificationEmail(email, username, token);

// Verification endpoint
app.get('/verify-email', async (req, res) => {
  const { token } = req.query;
  
  const result = await db.query(
    'SELECT user_id FROM email_verifications WHERE token = $1 AND expires_at > NOW()',
    [token]
  );
  
  if (result.rows.length === 0) {
    return res.status(400).send('Invalid or expired token');
  }
  
  await db.query('UPDATE users SET email_verified = TRUE WHERE id = $1', [result.rows[0].user_id]);
  
  res.send('Email verified! You can now deploy your agent.');
});
```

---

## Multi-Account Prevention Strategy

See `EMAIL_AND_ANTI_ABUSE.md` for full details. Quick summary:

### Layer 1: Email (Implemented)
- Every account needs unique email
- Disposable emails blocked
- 1 agent per email

### Layer 2: IP Intelligence (Backend)
- Detect VPN/proxy/datacenter IPs
- Don't block, but flag for review
- Require phone verification if suspicious

### Layer 3: Device Fingerprinting (Backend)
- Track browser fingerprint
- Alert if same fingerprint creates multiple accounts
- Persistent across IP changes

### Layer 4: Behavioral Analysis (Backend)
- Track signup → agent creation time
- Detect bot-like patterns
- Mouse movement, typing speed

### Layer 5: Economic Barriers (Future)
- 1st agent: Free
- 2nd agent: $5 (burns in-game currency or real payment)
- Makes multi-accounting unprofitable

### Layer 6: Rate Limiting (Backend)
- Max 3 signups per IP per hour
- Max 10 signups per IP per day
- Cooldowns for new accounts

**Reality:** 
> You can't stop determined attackers with VPNs.
> Goal is to make it annoying enough that 95% don't bother.
> The 5% who do will get caught by behavioral analysis over time.

---

## Testing Checklist

### Email Field
- [x] Email required on signup
- [x] Email format validated
- [x] Disposable emails blocked (4 domains)
- [x] Email stored with agent data
- [x] Email stored in localStorage
- [x] Password confirmation required
- [x] Passwords must match
- [ ] Test with various email formats
- [ ] Test with more disposable domains

### Password Reset
- [x] "Forgot Password?" link on login page
- [x] Password reset page created
- [x] Email input form
- [x] Always shows success message
- [x] Dev mode logs to console
- [x] Link back to login
- [ ] Test with valid email
- [ ] Test with invalid email
- [ ] Test with empty email

### Agent Limits
- [x] 1 agent per email enforced
- [x] 1 agent per username enforced
- [x] Clear error messages
- [ ] Test creating 2nd agent with same email
- [ ] Test creating 2nd agent with different email

### Backend Integration (Future)
- [ ] Connect to real email service (SendGrid/SES)
- [ ] Implement email verification
- [ ] Implement password reset tokens
- [ ] Add IP intelligence
- [ ] Add device fingerprinting
- [ ] Add rate limiting
- [ ] Add CAPTCHA

---

## Next Steps

### Immediate (Prototype/Demo)
✅ Add email field to signup
✅ Add password reset page
✅ Basic disposable email blocking
✅ Store email with agent data

### Pre-Launch (Production Prep)
- [ ] Set up SendGrid account
- [ ] Implement email verification flow
- [ ] Add CAPTCHA (Cloudflare Turnstile)
- [ ] Expand disposable email blacklist (1000+ domains)
- [ ] Add password strength indicator UI
- [ ] Create email templates (verification, password reset, welcome)

### Launch Day
- [ ] Implement IP intelligence (IPQualityScore)
- [ ] Implement device fingerprinting (FingerprintJS)
- [ ] Set up rate limiting (Redis)
- [ ] Create admin dashboard for abuse monitoring
- [ ] Set up email deliverability monitoring

### Post-Launch (Growth)
- [ ] Add phone verification (Twilio) for flagged accounts
- [ ] Implement behavioral analysis
- [ ] Add economic barriers (paid 2nd agent)
- [ ] Build ML model for abuse detection
- [ ] Create appeal system for false positives

---

## Files Modified

1. **deploy.html**
   - Added email field
   - Added password confirmation field
   - Added email validation
   - Added disposable email check
   - Added password match check
   - Updated sessionStorage to include email

2. **agent-creator.html**
   - Updated to expect email in sessionStorage
   - Added email to agent data
   - Updated localStorage to include email

3. **login.html**
   - Added "Forgot Password?" link

4. **password-reset.html** (NEW)
   - Complete password reset page
   - Email input form
   - Success/error messages
   - Security best practices (always show success)

5. **EMAIL_AND_ANTI_ABUSE.md** (NEW)
   - 18KB comprehensive guide
   - 7 layers of anti-abuse defense
   - Cost analysis
   - Implementation roadmap
   - Database schemas
   - Code examples

6. **EMAIL_IMPLEMENTATION_SUMMARY.md** (this file)
   - Implementation overview
   - User flows
   - Testing checklist
   - Next steps

---

## Cost Estimate (Production)

### Email Sending
- SendGrid: $0-15/month (up to 40K emails)
- OR AWS SES: ~$5/month (50K emails)

### Anti-Abuse Services
- IPQualityScore: $0-99/month (5K free lookups)
- FingerprintJS: Free tier (100K requests/month)
- Cloudflare Turnstile: Free (unlimited)
- Twilio Verify: $0.05 per SMS (only for flagged accounts)

**Total (Small Scale):** $5-114/month
**Total (Medium Scale):** $50-300/month

**Break-even:** 10 users paying $5 for 2nd agent = $50/month revenue

---

## Security Best Practices Implemented

✅ **Never reveal if email exists** (password reset always shows success)
✅ **Password minimum length** (8 characters)
✅ **Password confirmation** (prevents typos)
✅ **Email validation** (regex check)
✅ **Disposable email blocking** (basic protection)
✅ **Collision checks** (1 email = 1 agent, 1 username = 1 agent)

### Future Security (Backend)
- Password hashing (bcrypt with salt rounds 12)
- Rate limiting (prevent brute force)
- CAPTCHA (prevent bots)
- Email verification (confirm ownership)
- IP logging (audit trail)
- Device fingerprinting (track suspicious patterns)
- Session management (JWT tokens)
- HTTPS only (encrypt in transit)

---

## Support Contact for Lost Accounts

If user loses both password AND email access:

**Manual Recovery Process:**
1. User contacts support with username + proof of ownership
2. Proof could be:
   - Last login IP matches current IP
   - Can describe agent details (archetype, bio, items)
   - Payment receipt (if they paid for 2nd agent)
   - Creation date matches records
3. Support manually resets password
4. Send temporary password to new verified email
5. Force password change on next login

**Important:**
- Document every manual recovery in audit log
- Require multiple forms of proof
- Use this data to improve automated recovery

---

**Status:** ✅ Foundation complete, ready for backend integration
**Next Milestone:** Email verification + IP intelligence at launch
