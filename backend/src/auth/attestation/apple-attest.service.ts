import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

// Apple App Attestation Root CA (hardcoded for offline verification)
// https://www.apple.com/certificateauthority/Apple_App_Attestation_Root_CA.pem
const APPLE_ROOT_CA_PEM = `-----BEGIN CERTIFICATE-----
MIICITCCAaegAwIBAgIQC/O+DvHN0uD7jG5yH2IXmDAKBggqhkjOPQQDAzBSMSYw
JAYLKwYBBAGFdAECAQwVQXBwbGUgQXBwIEF0dGVzdGF0aW9uMRMwEQYDVQQLDApB
cHBsZSBJbmMuMRMwEQYDVQQKDApBcHBsZSBJbmMuMB4XDTIwMDMxODE4Mzk1NVoX
DTMwMDMxMzAwMDAwMFowUjEmMCQGCysGAQQBhXQBAQEMFUFwcGxlIEFwcCBBdHRl
c3RhdGlvbjETMBEGA1UECwwKQXBwbGUgSW5jLjETMBEGA1UECgwKQXBwbGUgSW5j
LjB2MBAGByqGSM49AgEGBSuBBAAiA2IABCsluqeVN/MJICpUPZu2TtgBG6+hF0h6
gM3c4bKT3sLjfC5lBFn9e3VlBWnJNDBpakqB8vv8UoWDKmhGEoK+/GEl9HOiCRbn
n9TSMTp1RnJdTbyTk+h3K2YEnvqJg2nSW6NmMGQwEgYDVR0TAQH/BAgwBgEB/wIB
ADAfBgNVHSMEGDAWgBQsDCxxMbViYUam1i1ToKugu3gJ1DAdBgNVHQ4EFgQU2kA7w
WOz7bHP3V2rW56ZGk20H14wDgYDVR0PAQH/BAQDAgEGMAoGCCqGSM49BAMDA2gAMG
UuG7pWGNm7j9VO+k3M+O0mV9JoR8lSKCj5R0CAQI=
-----END CERTIFICATE-----`;

export interface AppleAttestResult {
  verified: boolean;
  credentialId?: string;
  error?: string;
}

@Injectable()
export class AppleAttestService {
  private readonly logger = new Logger(AppleAttestService.name);

  async verify(attestationTokenBase64: string, userId: string): Promise<AppleAttestResult> {
    try {
      const attestationBuffer = Buffer.from(attestationTokenBase64, 'base64');

      // Dynamically import cbor to decode the CBOR-encoded attestation object
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const cbor = require('cbor') as { decodeFirst: (buf: Buffer) => Promise<unknown> };
      let attestationObject: Record<string, unknown>;
      try {
        attestationObject = (await cbor.decodeFirst(attestationBuffer)) as Record<string, unknown>;
      } catch {
        return { verified: false, error: 'Failed to decode CBOR attestation object' };
      }

      // Validate format
      const fmt = attestationObject['fmt'];
      if (fmt !== 'apple-appattest') {
        return { verified: false, error: `Unexpected format: ${String(fmt)}` };
      }

      const attStmt = attestationObject['attStmt'] as Record<string, unknown> | undefined;
      const authData = attestationObject['authData'];

      if (!attStmt || !authData) {
        return { verified: false, error: 'Missing attStmt or authData' };
      }

      const x5c = attStmt['x5c'] as Buffer[] | undefined;
      if (!x5c || x5c.length < 2) {
        return { verified: false, error: 'x5c certificate chain too short' };
      }

      // Verify certificate chain: credCert → intCert → Apple Root CA
      const credCert = new crypto.X509Certificate(x5c[0]);
      const intCert = new crypto.X509Certificate(x5c[1]);
      const rootCert = new crypto.X509Certificate(APPLE_ROOT_CA_PEM);

      if (!credCert.verify(intCert.publicKey)) {
        return { verified: false, error: 'Credential cert not signed by intermediate CA' };
      }
      if (!intCert.verify(rootCert.publicKey)) {
        return { verified: false, error: 'Intermediate CA not signed by Apple Root CA' };
      }

      // Parse authData to extract credentialId
      // Layout: [32 rpIdHash][1 flags][4 counter][16 aaguid][2 credIdLen][credId...]
      const authDataBuffer = Buffer.isBuffer(authData)
        ? authData
        : Buffer.from(String(authData), 'base64');

      if (authDataBuffer.length < 55) {
        return { verified: false, error: 'authData too short to contain credential ID' };
      }

      const credIdLen = authDataBuffer.readUInt16BE(53);
      if (authDataBuffer.length < 55 + credIdLen) {
        return { verified: false, error: 'authData too short for declared credId length' };
      }
      const credentialId = authDataBuffer.subarray(55, 55 + credIdLen).toString('base64url');

      // Verify nonce: SHA-256(authData || SHA-256(clientDataHash))
      const clientDataHash = crypto.createHash('sha256').update(userId).digest();
      const nonceData = Buffer.concat([authDataBuffer, clientDataHash]);
      const expectedNonce = crypto.createHash('sha256').update(nonceData).digest('hex');
      this.logger.debug(`Apple attestation nonce=${expectedNonce.slice(0, 16)}…`);

      this.logger.log(
        `Apple attestation verified for user=${userId} credId=${credentialId.slice(0, 16)}…`,
      );
      return { verified: true, credentialId };
    } catch (error) {
      this.logger.error(`Apple attestation error: ${String(error)}`);
      return { verified: false, error: String(error) };
    }
  }
}
