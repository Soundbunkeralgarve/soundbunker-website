"""Verify an Apple-signed App Store profile without emitting profile contents."""
import datetime as dt
import hashlib
import json
import plistlib
import subprocess
import sys

TEAM = '488DLN54MP'
SERIAL = '44FD863171BA2EB7F80E9AB16A6FB3C5'
BUNDLES = {'pt.soundbunker.theticketbunker', 'pt.soundbunker.theticketbunker.organiser'}


def utc(value):
    return value.replace(tzinfo=dt.timezone.utc) if value.tzinfo is None else value.astimezone(dt.timezone.utc)


def inspect_certificate(der):
    out = subprocess.run(['openssl', 'x509', '-inform', 'DER', '-noout', '-serial', '-enddate'], input=der, capture_output=True, check=True).stdout.decode()
    fields = dict(line.split('=', 1) for line in out.strip().splitlines())
    expires = dt.datetime.strptime(fields['notAfter'], '%b %d %H:%M:%S %Y %Z').replace(tzinfo=dt.timezone.utc)
    return fields['serial'].upper(), expires


def validate_plist(profile, bundle, now=None, certificate_inspector=inspect_certificate):
    now = now or dt.datetime.now(dt.timezone.utc)
    if bundle not in BUNDLES:
        raise ValueError('Unexpected profile bundle identifier')
    entitlements = profile.get('Entitlements', {})
    if profile.get('TeamIdentifier') != [TEAM] or profile.get('ApplicationIdentifierPrefix') != [TEAM]:
        raise ValueError('Profile signing team does not match')
    if entitlements.get('application-identifier') != f'{TEAM}.{bundle}' or entitlements.get('com.apple.developer.team-identifier') != TEAM:
        raise ValueError('Profile entitlements do not match the exact app and team')
    if entitlements.get('get-task-allow') is not False or profile.get('ProvisionedDevices') is not None or profile.get('ProvisionsAllDevices'):
        raise ValueError('Expected an App Store distribution profile')
    expiry = profile.get('ExpirationDate')
    if not isinstance(expiry, dt.datetime) or utc(expiry) <= now:
        raise ValueError('Profile has expired')
    certificates = profile.get('DeveloperCertificates', [])
    if len(certificates) != 1:
        raise ValueError('Expected only the existing distribution certificate')
    certificate_serial, certificate_expiry = certificate_inspector(certificates[0])
    if certificate_serial != SERIAL or certificate_expiry <= now:
        raise ValueError('Distribution certificate does not match or has expired')
    if not profile.get('UUID') or not profile.get('Name'):
        raise ValueError('Missing signed profile identity')
    return {
        'uuid': profile['UUID'], 'name': profile['Name'], 'teamIdentifier': TEAM,
        'applicationIdentifier': entitlements['application-identifier'],
        'expirationDate': utc(expiry).isoformat(), 'certificateSerial': certificate_serial,
    }


def main():
    path, bundle = sys.argv[1:3]
    result = subprocess.run(['openssl', 'cms', '-verify', '-inform', 'DER', '-in', path, '-noverify'], capture_output=True, check=True)
    metadata = validate_plist(plistlib.loads(result.stdout), bundle)
    with open(path, 'rb') as file:
        metadata['sha256'] = hashlib.sha256(file.read()).hexdigest()
    print(json.dumps(metadata))


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print('Signed profile verification failed; no profile content was emitted.', file=sys.stderr)
        sys.exit(1)
