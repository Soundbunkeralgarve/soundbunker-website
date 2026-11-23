import copy
import datetime as dt
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('verify_profile', Path(__file__).with_name('verify-ticketbunker-profile.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
NOW = dt.datetime(2026, 11, 23, tzinfo=dt.timezone.utc)
EXPIRY = dt.datetime(2027, 10, 20, 7, 11, 36, tzinfo=dt.timezone.utc)
BUNDLE = 'pt.soundbunker.theticketbunker'


def fixture():
    return {
        'Name': 'TicketBunker Customer App Store 2026-11-23', 'UUID': 'PROFILE-UUID',
        'TeamIdentifier': [module.TEAM], 'ApplicationIdentifierPrefix': [module.TEAM],
        'ExpirationDate': EXPIRY, 'DeveloperCertificates': [b'public certificate'],
        'Entitlements': {'application-identifier': f'{module.TEAM}.{BUNDLE}',
                         'com.apple.developer.team-identifier': module.TEAM, 'get-task-allow': False},
    }


class ProfileVerificationTests(unittest.TestCase):
    def validate(self, profile, serial=module.SERIAL):
        return module.validate_plist(profile, BUNDLE, now=NOW, certificate_inspector=lambda der: (serial, EXPIRY))

    def test_matching_app_team_and_distribution_certificate(self):
        output = self.validate(fixture())
        self.assertEqual(output['applicationIdentifier'], f'{module.TEAM}.{BUNDLE}')
        self.assertEqual(output['certificateSerial'], module.SERIAL)
        self.assertNotIn('DeveloperCertificates', output)

    def test_wrong_app_team_or_certificate_is_rejected(self):
        for change in ['app', 'team', 'serial']:
            profile = fixture()
            if change == 'app': profile['Entitlements']['application-identifier'] = f'{module.TEAM}.pt.soundbunker.ticketbunkerscanner'
            if change == 'team': profile['TeamIdentifier'] = ['WRONG']
            with self.assertRaises(ValueError): self.validate(profile, 'WRONG' if change == 'serial' else module.SERIAL)

    def test_debug_adhoc_expired_or_multiple_certificate_profiles_are_rejected(self):
        mutations = [
            lambda p: p['Entitlements'].update({'get-task-allow': True}),
            lambda p: p.update({'ProvisionedDevices': ['DEVICE']}),
            lambda p: p.update({'ProvisionsAllDevices': True}),
            lambda p: p.update({'ExpirationDate': dt.datetime(2025, 1, 1)}),
            lambda p: p.update({'DeveloperCertificates': [b'a', b'b']}),
        ]
        for mutate in mutations:
            profile = fixture(); mutate(profile)
            with self.assertRaises(ValueError): self.validate(profile)


if __name__ == '__main__': unittest.main()
