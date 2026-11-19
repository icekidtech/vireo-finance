# Email OTP Implementation Plan

## 🎯 Goal
Enable users to login/register using email + OTP (in addition to existing phone + OTP and email + password flows).

## ✅ What's Already Done

### Backend
1. ✅ **Email + Password login** - Already implemented in `auth.service.ts`
2. ✅ **Resend package** - Already installed (`resend@^6.38.0` in package.json)
3. ✅ **Email configuration** - `.env` has `RESEND_API_KEY` and `RESEND_FROM_EMAIL`

### Current Auth Flows
- **Phone + OTP**: ✅ Working
- **Email + Password**: ✅ Working
- **Email + OTP**: ❌ Not implemented yet

---

## 📋 Implementation Checklist

### Phase 1: Backend Setup ✅ **DONE**

#### 1.1 Email Provider
- ✅ Created `/backend/src/notifications/providers/email.provider.ts`
  - Uses Resend SDK
  - `sendVerificationCode()` method for OTP emails
  - Beautiful HTML email templates
  - Proper error handling

#### 1.2 Configuration
- ✅ Updated `/backend/src/config/configuration.ts`
  - Added `resend` config section
  - Reads from `RESEND_API_KEY` and `RESEND_FROM_EMAIL`

#### 1.3 Module Registration
- ✅ Updated `/backend/src/notifications/notifications.module.ts`
  - Added `EmailNotificationProvider` to providers
  - Exported for use in auth module

#### 1.4 Database Entity
- ✅ Created `/backend/src/auth/email-otp.entity.ts`
  - Similar to `phone-otp.entity.ts`
  - Stores hashed email OTP codes

#### 1.5 DTOs
- ✅ Updated `/backend/src/auth/dto/auth.dto.ts`
  - Added `EmailOtpRequestDto`
  - Added `EmailOtpVerifyDto`

---

### Phase 2: Backend Auth Service (TODO)

#### 2.1 Add Email OTP Methods to `auth.service.ts`

```typescript
/**
 * Request an email OTP
 */
async requestEmailOtp(email: string): Promise<{ sent: boolean }> {
  const normalizedEmail = email.trim().toLowerCase();
  
  // Generate 6-digit code
  const code = String(randomInt(100000, 999999));
  const codeHash = hmacSha256Hex(this.config.get('jwt.secret'), code);
  
  // Store in database
  const expiresAt = new Date(Date.now() + this.config.get('otp.ttlSeconds') * 1000);
  await this.emailOtps.save(
    this.emailOtps.create({
      email: normalizedEmail,
      codeHash,
      expiresAt,
    }),
  );
  
  // Send via Resend
  try {
    await this.emailProvider.sendVerificationCode(normalizedEmail, code);
  } catch (error) {
    this.logger.error(`Failed to send email OTP to ${normalizedEmail}: ${error}`);
    throw new ServiceUnavailableException('Could not send verification email');
  }
  
  // Log code in development
  if (this.config.get('otp.logCode')) {
    this.logger.log(`📧 Email OTP for ${normalizedEmail}: ${code}`);
  }
  
  return { sent: true };
}

/**
 * Verify email OTP and return JWT token
 */
async verifyEmailOtp(email: string, code: string): Promise<{ accessToken: string; user: PublicUser }> {
  const normalizedEmail = email.trim().toLowerCase();
  const codeHash = hmacSha256Hex(this.config.get('jwt.secret'), code);
  
  // Find valid OTP
  const otp = await this.emailOtps.findOne({
    where: {
      email: normalizedEmail,
      codeHash,
      consumedAt: IsNull(),
    },
  });
  
  if (!otp || otp.expiresAt < new Date()) {
    throw new UnauthorizedException('Invalid or expired code');
  }
  
  if (otp.attempts >= MAX_OTP_ATTEMPTS) {
    throw new UnauthorizedException('Too many attempts');
  }
  
  // Increment attempts
  otp.attempts += 1;
  await this.emailOtps.save(otp);
  
  // Find or create user
  let user = await this.users.findOne({ where: { email: normalizedEmail } });
  if (!user) {
    throw new NotFoundException('No account found with this email. Please register first.');
  }
  
  // Mark OTP as consumed
  otp.consumedAt = new Date();
  await this.emailOtps.save(otp);
  
  // Generate JWT
  const accessToken = this.jwt.sign({
    sub: user.id,
    phone: user.phone,
    email: user.email,
    role: user.role,
  });
  
  return { accessToken, user: toPublicUser(user) };
}
```

#### 2.2 Update Auth Module

Add to `/backend/src/auth/auth.module.ts`:
```typescript
import { EmailOtp } from './email-otp.entity';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Device, PhoneOtp, EmailOtp]),
    NotificationsModule,
    // ... other imports
  ],
  // ...
})
```

#### 2.3 Inject EmailProvider into AuthService

```typescript
constructor(
  // ... existing injections
  private readonly emailProvider: EmailNotificationProvider,
) {}
```

---

### Phase 3: Backend Controller (TODO)

Add to `/backend/src/auth/auth.controller.ts`:

```typescript
@Post('email-otp/request')
requestEmailOtp(@Body() dto: EmailOtpRequestDto) {
  return this.auth.requestEmailOtp(dto.email);
}

@Post('email-otp/verify')
verifyEmailOtp(@Body() dto: EmailOtpVerifyDto) {
  return this.auth.verifyEmailOtp(dto.email, dto.code);
}
```

---

### Phase 4: Database Migration (TODO)

Create migration for `email_otps` table:

```sql
CREATE TABLE email_otps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL,
  code_hash VARCHAR(128) NOT NULL,
  attempts SMALLINT DEFAULT 0 NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_email_otps_email ON email_otps(email);
CREATE INDEX idx_email_otps_expires_at ON email_otps(expires_at);
```

---

### Phase 5: Mobile UI Updates (TODO)

#### 5.1 Personal App - Auth Screen

Update `/personal/src/screens/AuthScreen.tsx`:

**Add auth method selector:**
```typescript
type AuthMethod = 'phone' | 'email';
const [authMethod, setAuthMethod] = useState<AuthMethod>('phone');
```

**Add email field:**
```typescript
const [email, setEmail] = useState('');
```

**Update UI to show method selector:**
```tsx
{stage === 'details' && (
  <>
    {/* Auth method selector */}
    <View style={styles.methodSelector}>
      <Button
        title="📱 Phone"
        variant={authMethod === 'phone' ? 'primary' : 'ghost'}
        onPress={() => setAuthMethod('phone')}
      />
      <Button
        title="📧 Email"
        variant={authMethod === 'email' ? 'primary' : 'ghost'}
        onPress={() => setAuthMethod('email')}
      />
    </View>

    {authMethod === 'phone' ? (
      <Field 
        label="PHONE" 
        placeholder="+2348012345678" 
        value={phone} 
        onChangeText={setPhone} 
        keyboardType="phone-pad" 
      />
    ) : (
      <Field 
        label="EMAIL" 
        placeholder="you@example.com" 
        value={email} 
        onChangeText={setEmail} 
        keyboardType="email-address" 
        autoCapitalize="none"
      />
    )}
    
    {/* Rest of fields... */}
  </>
)}
```

**Update send code logic:**
```typescript
const sendCode = async () => {
  if (authMethod === 'phone') {
    await api.requestOtp(phone.trim());
  } else {
    await api.requestEmailOtp(email.trim());
  }
  setStage('otp');
};
```

**Update verify logic:**
```typescript
const onVerify = () =>
  guard(async () => {
    const data = authMethod === 'phone' 
      ? await api.verifyOtp(phone.trim(), code.trim())
      : await api.verifyEmailOtp(email.trim(), code.trim());
      
    if (isSignIn) {
      login(data.accessToken, data.user);
      return;
    }
    
    // New account flow...
    api.setToken(data.accessToken);
    setSession({ token: data.accessToken, user: data.user });
    setStage('pin');
  }, 'Invalid or expired code');
```

#### 5.2 Personal App - API Methods

Add to `/personal/src/api.ts`:

```typescript
async requestEmailOtp(email: string) {
  const { data } = await this.client.post<{ sent: boolean }>('/auth/email-otp/request', { email });
  return data;
}

async verifyEmailOtp(email: string, code: string) {
  const { data } = await this.client.post<VerifyOtpResult>('/auth/email-otp/verify', { email, code });
  return data;
}
```

#### 5.3 Merchant App

Similar updates to `/merchant/src/screens/OnboardScreen.tsx` and `/merchant/src/api.ts`.

---

### Phase 6: Environment Configuration (TODO)

Update `.env` with real Resend API key:

```env
# Get from https://resend.com/api-keys
RESEND_API_KEY=re_123abc...

# Your verified sending domain
RESEND_FROM_EMAIL=noreply@vireofinance.com
```

**Important**: Resend requires domain verification!
1. Go to https://resend.com/domains
2. Add your domain
3. Add DNS records (SPF, DKIM, DMARC)
4. Wait for verification (~24 hours)

---

## 🔄 User Flows

### Flow 1: Email Registration + OTP
```
1. User: Select "Email" method
2. User: Enter email address
3. User: Click "Continue"
4. Backend: Send OTP via Resend
5. User: Check email inbox
6. User: Enter 6-digit code
7. Backend: Verify code
8. Backend: Create account
9. User: Set PIN
10. User: Logged in ✅
```

### Flow 2: Email Sign-In + OTP
```
1. User: Select "Sign in"
2. User: Select "Email" method
3. User: Enter email address
4. User: Click "Send code"
5. Backend: Send OTP via Resend
6. User: Check email inbox
7. User: Enter 6-digit code
8. Backend: Verify code
9. User: Logged in ✅
```

### Flow 3: Email + Password (Already works!)
```
1. User: Select "Sign in"
2. User: Enter email + password
3. User: Click "Sign in"
4. User: Logged in ✅
```

---

## 🎨 UI Design Mockup

```
┌─────────────────────────────────┐
│  Create your account            │
├─────────────────────────────────┤
│                                 │
│  ┌────────┐  ┌────────┐        │
│  │  📱    │  │  📧    │        │
│  │ Phone  │  │ Email  │        │
│  └────────┘  └────────┘        │
│   (selected)   (inactive)      │
│                                 │
│  PHONE                          │
│  ┌───────────────────────────┐ │
│  │ +2348012345678            │ │
│  └───────────────────────────┘ │
│                                 │
│  FIRST NAME                     │
│  ┌───────────────────────────┐ │
│  │ Ada                       │ │
│  └───────────────────────────┘ │
│                                 │
│  LAST NAME                      │
│  ┌───────────────────────────┐ │
│  │ Okafor                    │ │
│  └───────────────────────────┘ │
│                                 │
│  ┌───────────────────────────┐ │
│  │      Continue             │ │
│  └───────────────────────────┘ │
│                                 │
└─────────────────────────────────┘
```

---

## 🧪 Testing Checklist

### Backend Tests
- [ ] Email OTP can be requested
- [ ] Email OTP is sent via Resend
- [ ] Email OTP can be verified
- [ ] Expired codes are rejected
- [ ] Invalid codes are rejected
- [ ] Rate limiting works (max 5 attempts)
- [ ] Code is hashed before storage
- [ ] Email is case-insensitive

### Frontend Tests
- [ ] Can switch between Phone and Email methods
- [ ] Email validation works
- [ ] Can receive and enter OTP code
- [ ] Can register with email OTP
- [ ] Can sign in with email OTP
- [ ] Error messages are clear
- [ ] Loading states work correctly

### Integration Tests
- [ ] End-to-end email registration flow
- [ ] End-to-end email sign-in flow
- [ ] Email provider fallback if Resend fails
- [ ] OTP logging works in development
- [ ] Production blocks OTP logging

---

## 🚀 Deployment Steps

1. **Backend**:
   ```bash
   # Run migration
   npm run migration:run
   
   # Build
   npm run build
   
   # Deploy
   git push origin dev
   ```

2. **Mobile Apps**:
   ```bash
   # Test
   expo start
   
   # Build
   expo build:android
   expo build:ios
   
   # Deploy to stores
   ```

3. **Configure Resend**:
   - Add domain to Resend
   - Verify DNS records
   - Update `.env` with API key
   - Test email delivery

---

## 📝 Notes

### Why Email OTP?
- More professional than SMS for business users
- Lower cost than SMS (Resend is cheaper)
- Better deliverability than SMS
- Supports international users without SMS issues
- Provides email verification at same time

### Security Considerations
- Codes expire after 5 minutes
- Max 5 attempts per code
- Codes are hashed before storage
- Email addresses are case-insensitive
- Rate limiting prevents abuse

### Resend Limits
- **Free tier**: 100 emails/day, 3,000 emails/month
- **Pro tier**: $20/month for 50,000 emails
- **Email domains must be verified**
- **From address must use verified domain**

---

## ✅ Current Status

**Completed**:
- ✅ Email provider created
- ✅ Configuration added
- ✅ Module registration done
- ✅ Entity created
- ✅ DTOs added

**Todo**:
- ⏭️ Auth service methods
- ⏭️ Controller endpoints
- ⏭️ Database migration
- ⏭️ Mobile UI updates
- ⏭️ API client methods
- ⏭️ Testing
- ⏭️ Resend domain verification

---

**Implementation Time Estimate**: 4-6 hours
- Backend: 2 hours
- Mobile UI: 2 hours
- Testing: 1-2 hours
- Resend setup: 24 hours (DNS propagation)

---

**Ready to implement Phase 2-6?** Let me know and I'll continue with the auth service updates!
