# Mobile App Updates for TRUE Deviceless Payments

## Overview

This document outlines the changes made to the merchant and personal mobile apps to support TRUE deviceless biometric payments using 1:N face search.

---

## 🎯 What Changed

### Before
- **Merchant app**: Required customer phone number before capturing face (1:1 verification)
- **Personal app**: Enrollment only stored biometric locally

### After
- **Merchant app**: TWO modes - Deviceless (just face) + Legacy (with phone number)
- **Personal app**: Enrollment stores user ID in Didit for 1:N search
- **Backend**: Passes user ID during KYC verification to enable face search

---

## 📱 Merchant App Changes

### File: `merchant/src/api.ts`

**Added new method for deviceless identification:**

```typescript
/**
 * TRUE DEVICELESS: Identify customer by face (1:N search).
 * No identifier needed - just capture face and system finds the customer.
 */
async identifyByFace(input: {
  sampleBase64: string;
  amountMinor?: number;
  metadata?: Record<string, unknown>;
}) {
  const { data } = await this.client.post<{
    decision: 'APPROVED' | 'DENIED' | 'STEP_UP';
    userId?: string;
    scores: {
      matchScore: number;
      livenessScore: number;
      spoofScore: number;
      qualityScore: number;
    };
    reason?: string;
  }>('/biometrics/identify', input, { timeout: 45_000 });
  return data;
}
```

**Kept legacy method for backward compatibility:**
```typescript
/**
 * LEGACY: Requires customer identifier (1:1 verification)
 */
async terminalPayment(input: {
  orderReference: string;
  customerIdentifier: string;
  biometricType: 'face';
  biometricSample: string;
})
```

---

### File: `merchant/src/screens/BiometricPaymentScreen.tsx`

**Key Changes:**

1. **Added payment mode selection**
   ```typescript
   type PaymentMode = 'deviceless' | 'legacy';
   const [mode, setMode] = useState<PaymentMode>('deviceless'); // Default
   ```

2. **Updated UI to show both options**
   ```tsx
   {/* Mode selector */}
   <View style={styles.modeSelector}>
     <Button
       title="🚀 Deviceless (just face)"
       variant={mode === 'deviceless' ? 'primary' : 'ghost'}
       onPress={() => setMode('deviceless')}
     />
     <Button
       title="📱 With phone number"
       variant={mode === 'legacy' ? 'primary' : 'ghost'}
       onPress={() => setMode('legacy')}
     />
   </View>
   ```

3. **Conditional rendering based on mode**
   ```tsx
   {mode === 'deviceless' ? (
     <>
       <Text style={styles.instruction}>
         <Text style={styles.instructionBold}>TRUE DEVICELESS:</Text> 
         Just capture the customer's face. No phone number needed!
       </Text>
       <Button
         title="Capture face & identify"
         disabled={!available}
         onPress={startCapture}
       />
     </>
   ) : (
     <>
       <Field
         label="CUSTOMER PHONE OR $HANDLE"
         value={identifier}
         onChangeText={setIdentifier}
         autoCapitalize="none"
         placeholder="+2348012345678"
       />
       <Button
         title="Continue to camera"
         disabled={!identifier.trim() || !available}
         onPress={startCapture}
       />
     </>
   )}
   ```

4. **Updated payment handler**
   ```typescript
   const captureAndPay = async () => {
     // ... camera capture code ...
     
     if (mode === 'deviceless') {
       // NEW: 1:N face search - no identifier needed!
       const identification = await api.identifyByFace({
         sampleBase64: photo.base64,
         amountMinor: amount,
         metadata: {
           orderReference,
           terminalType: 'merchant_app',
         },
       });

       // Map identification result to TerminalPaymentResult format
       const outcome: TerminalPaymentResult = {
         status: identification.decision === 'APPROVED' ? 'paid' :
                 identification.decision === 'STEP_UP' ? 'step_up_required' : 'denied',
         message: identification.decision === 'APPROVED' ? 'Payment approved' :
                  identification.decision === 'STEP_UP' ? 
                    'Additional verification required (high-value or low confidence)' :
                  identification.reason || 
                    'Face not recognized. Customer may not be enrolled.',
         userId: identification.userId,
         scores: identification.scores,
       };

       setResult(outcome);
       setStage('result');
     } else {
       // LEGACY: 1:1 verification with identifier
       const outcome = await api.terminalPayment({
         orderReference,
         customerIdentifier: identifier.trim().replace(/^[@$]/, ''),
         biometricType: 'face',
         biometricSample: photo.base64,
       });
       setResult(outcome);
       setStage('result');
     }
   };
   ```

5. **Added new styles**
   ```typescript
   const styles = StyleSheet.create({
     // ...existing styles...
     modeSelector: {
       flexDirection: 'row',
       gap: spacing.sm,
       marginBottom: spacing.md,
     },
     instruction: {
       ...type.body,
       color: colors.textMuted,
       marginBottom: spacing.md,
       textAlign: 'center',
     },
     instructionBold: {
       ...type.bodyStrong,
       color: colors.accent,
     },
   });
   ```

---

## 👤 Personal App Changes

### No code changes needed!

The personal app enrollment already works correctly. The backend now handles storing the user ID in Didit during KYC verification.

**What happens now:**
1. User completes KYC (BVN verification) in personal app
2. Backend passes `userId` to Didit during verification
3. Didit stores the face with `vendor_user_id` = userId
4. Face is now searchable via 1:N API

---

## 🔧 Backend Changes

### File: `backend/src/kyc/identity-verifier.ts`

**Updated interface:**
```typescript
verifyBvn(input: {
  bvn: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  selfie: Buffer;
  userId?: string; // NEW: For deviceless payments (1:N face search)
}): Promise<boolean>;
```

---

### File: `backend/src/kyc/didit-identity.verifier.ts`

**Updated implementation:**
```typescript
async verifyBvn(input: {
  bvn: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  selfie: Buffer;
  userId?: string; // NEW
}): Promise<boolean> {
  const body = new FormData();
  body.append('issuing_state', 'NGA');
  body.append('services', 'nga_bank_verification_number');
  body.append('bvn', input.bvn);
  body.append('first_name', input.firstName);
  body.append('last_name', input.lastName);
  body.append('date_of_birth', input.dateOfBirth);
  body.append('selfie', imageBlob(input.selfie), 'selfie.jpg');
  
  // NEW: Store user ID for deviceless payments (1:N face search)
  if (input.userId) {
    body.append('vendor_data', input.userId);
    body.append('vendor_user_id', input.userId);
  }
  
  return this.matched(
    await this.client.postForm<DatabaseValidationResponse>('database-validation', body),
    'nga_bank_verification_number',
    ['identification_number', 'full_name', 'date_of_birth'],
  );
}
```

---

### File: `backend/src/kyc/kyc.service.ts`

**Updated BVN verification call:**
```typescript
const matched = await verifier.verifyBvn({
  bvn: dto.bvn,
  firstName: dto.firstName.trim(),
  lastName: dto.lastName.trim(),
  dateOfBirth: dto.dateOfBirth,
  selfie,
  userId, // NEW: Pass user ID for deviceless payments
});
```

---

## 🎨 User Experience

### Merchant Terminal Flow

#### Deviceless Mode (Default) ✅
```
1. Merchant selects "Deviceless (just face)" mode
2. Merchant enters payment amount
3. Merchant clicks "Capture face & identify"
4. Customer looks at camera
5. Merchant clicks "Capture & pay"
6. System searches all enrolled faces
7. If match found (>75% confidence):
   - ≥85% + low amount → APPROVED
   - 75-84% or high amount → STEP_UP (ask for PIN)
   - <75% → DENIED
8. Payment complete!
```

#### Legacy Mode (Fallback) 📱
```
1. Merchant selects "With phone number" mode
2. Merchant asks customer for phone: "+2348012345678"
3. Merchant enters phone number
4. Merchant clicks "Continue to camera"
5. Customer looks at camera
6. Merchant clicks "Capture & pay"
7. System verifies: "Does face match this phone?"
8. Payment complete!
```

---

## 🔒 Security Considerations

### Deviceless Mode
- **Liveness detection**: Prevents photos of photos
- **Spoof detection**: Prevents masks, videos
- **Quality thresholds**: Rejects poor captures
- **Rate limiting**: 5 failed attempts = 15 min lockout
- **Score fusion**: Multiple factors determine approval

### Legacy Mode
- Same security as deviceless
- Additional identifier verification
- Useful for customers not enrolled

---

## 📊 Decision Matrix

| Mode | Match Score | Decision |
|------|------------|----------|
| Deviceless | <75% | DENIED (not enrolled or no match) |
| Deviceless | 75-84% | STEP_UP (request PIN) |
| Deviceless | ≥85% + <₦50k | APPROVED |
| Deviceless | ≥85% + ≥₦50k | STEP_UP (high-value) |
| Legacy | <75% | DENIED (face doesn't match phone) |
| Legacy | 75-84% | STEP_UP (low confidence) |
| Legacy | ≥85% + <₦50k | APPROVED |
| Legacy | ≥85% + ≥₦50k | STEP_UP (high-value) |

---

## 🚀 Deployment Checklist

### Backend
- [x] Update `identity-verifier.ts` interface
- [x] Update `didit-identity.verifier.ts` implementation
- [x] Update `kyc.service.ts` to pass userId
- [x] Add `/biometrics/identify` endpoint (already done)
- [ ] Test with Didit sandbox
- [ ] Deploy to staging
- [ ] Test end-to-end flow

### Merchant App
- [x] Add `identifyByFace` API method
- [x] Update `BiometricPaymentScreen` with mode selector
- [x] Add deviceless payment handler
- [x] Update UI styles
- [ ] Test on iOS
- [ ] Test on Android
- [ ] Deploy to TestFlight/Play Console

### Personal App
- [x] No changes needed (backend handles enrollment)
- [ ] Verify KYC flow stores userId correctly
- [ ] Test enrollment creates searchable face

---

## 🧪 Testing Guide

### Test Deviceless Payment (Merchant App)

1. **Enroll a test customer** (Personal App):
   ```
   - Sign up new user
   - Complete KYC (BVN verification)
   - Face is automatically enrolled in Didit
   ```

2. **Test deviceless payment** (Merchant App):
   ```
   - Create new order (e.g., ₦500)
   - Select "Pay with face"
   - Choose "Deviceless (just face)" mode
   - Capture enrolled customer's face
   - Verify payment approved
   ```

3. **Test unknown customer**:
   ```
   - Create new order
   - Capture unenrolled person's face
   - Verify payment denied with message:
     "Face not recognized. Customer may not be enrolled."
   ```

4. **Test high-value transaction**:
   ```
   - Create order ≥₦50,000
   - Capture enrolled customer's face
   - Verify STEP_UP requested
   ```

### Test Legacy Mode

1. **Test with phone number**:
   ```
   - Create new order
   - Select "With phone number" mode
   - Enter customer phone: "+2348012345678"
   - Capture matching customer's face
   - Verify payment approved
   ```

2. **Test wrong phone number**:
   ```
   - Create new order
   - Enter wrong phone number
   - Capture different customer's face
   - Verify payment denied
   ```

---

## 📝 Known Limitations

### Current
1. **Didit stores faces only during KYC verification**
   - Standalone biometric enrollment (`/biometrics/enroll`) does NOT store faces in Didit
   - Only KYC verification (BVN check) stores faces for 1:N search
   - **Workaround**: Users must complete KYC (BVN) to use deviceless payments

2. **No NIN-based enrollment yet**
   - Currently only BVN verification stores faces
   - Could extend to NIN verification in future

### Future Enhancements
1. **Store faces during standalone enrollment**
   - Use Didit's full verification session API during `/biometrics/enroll`
   - Would allow deviceless without KYC (less secure)

2. **Update existing users**
   - Run migration to enroll existing KYC'd users' faces in Didit
   - Would enable deviceless for all verified users retroactively

3. **Multi-biometric support**
   - Add voice biometrics for deviceless payments
   - Would provide alternative for customers without clear face photos

---

## 🎓 Key Takeaways

### What This Enables
✅ **TRUE deviceless payments** - just scan face, no phone needed  
✅ **Backward compatibility** - legacy mode still works  
✅ **Security maintained** - all existing checks still apply  
✅ **Better UX** - faster checkout for enrolled customers  

### What You Need to Know
1. **Enrollment happens during KYC**, not standalone biometric enrollment
2. **Merchant app has TWO modes** - deviceless (default) + legacy (fallback)
3. **Backend automatically stores user ID** in Didit during BVN verification
4. **Personal app needs NO changes** - everything is backend-driven

### Next Steps
1. Test in Didit sandbox environment
2. Deploy backend + mobile apps to staging
3. Run end-to-end tests with real devices
4. Roll out to pilot merchants
5. Monitor fraud/false positive rates
6. Scale to production

---

**Built with ❤️ by Vireo Finance Engineering Team**
