# Changelog

## 0.6.0 (2026-10-22)

### Features

- **bodymap:** headache-friendly head zones with front/back views and wider areas (#50)
- **pain:** headache details, "Constant" quality and intensity zone labels (M5 branch 1) (#49)
- **bodymap:** recognisable foot, count badges on close-up buttons, narrower belly choices
- **bodymap:** close-ups for head, hands and feet, and wider areas for belly and back

### Fixes

- **bodymap:** call the quick-log tile and timeline entry "Pain" / "Smerter"

### Documentation

- M3 done (reminders confirmed on the iPhone), upgrade block confirmed
- record ways of working, lessons and current status in CLAUDE.md before the Team-account move

## 0.5.0 (2026-10-19)

### Features

- **bodymap:** entry sheet, "Same as last time" and the "Still there?" card (M4 branch 2) (#45)
- **bodymap:** region catalogue, BodyMap and Find components, pain validator (M4 branch 1) (#44)

## 0.4.0 (2026-10-19)

### Features

- **fluids:** drink logging with editable presets, quantity and a plain day total (#40)

### Documentation

- **release:** upgrade block works from any version and stops if the tag did not change (#39)

## 0.3.0 (2026-10-19)

### Features

- **reminders:** opt-in, payload-less medication reminders (Web Push, D7) (#35)

### Fixes

- **meds:** leave the form out of a Meds row when it is "Other" (#34)

### Documentation

- status after reminders and the Pi preparation for 0.3.0 (#36)
- Portainer upgrade route and status after 0.2.0 (#33)

## 0.2.0 (2026-10-19)

### Features

- **meds:** edit logged doses and set the time of a taken dose (#29)
- **meds:** sachet (powder) as a medication form (#28)
- **meds:** log a medicine that is not in the list yet (#27)

### Documentation

- release guide with a "Prepare release" button and a manual route (#30)
- container commands use `cli`, record the 0.1.0 deployment (#26)

## 0.1.0 (2026-10-18)

### Features

- **backup:** verified nightly backups and a manual backup command (#21)
- **docker:** image, compose file, .env example and gen-secrets for the Pi (#22)
- **meds:** refuse the same time twice on one medication (#20)
- **meds:** dose logging with "All taken" (M3) (#19)
- **meds:** medication list and set-up sheet (M3) (#16)
- **entries:** quick nausea and heartburn logging (M3) (#15)
- **admin:** user and invite management (M2) (#13)
- **auth:** optional two-step sign-in (TOTP) (M2) (#12)
- **photos:** encrypted photo attachments for meals and notes (M2) (#11)
- **entries:** meals with food watch list and saved meals (M2) (#9)
- **entries:** feeling, sleep, weight/measurements and bowel logging (M2) (#8)
- **records:** encrypted records sync, Today timeline and notes (M2) (#7)
- **auth-ui:** join, login, unlock, recovery and account screens with auto-lock (M2) (#5)
- **auth:** accounts API: invite, signup, login, recovery, deletion (M2) (#4)
- **db:** SQLite schema, migrations with pre-migration backup, nightly backup (M2) (#3)
- **crypto:** key hierarchy and record encryption (M2) (#2)
- add app shell, design tokens, core components and typed i18n

### Fixes

- **ui:** show the whole entry time, including AM/PM (#18)

### Documentation

- record approval of D21, D22 and M1 dev dependencies (#1)
- add contributing and security guides, M1 status and screenshots
- **design:** approve design, add food watch list, bowel, sleep, weight and recurring medication
- record home Pi deployment agreement
- settle D3, D6, D7, D11, D13-D15 and add home Pi integration request
- record owner decisions from M0 review
- **design:** propose Linen & Clay design direction with mockups
- add CLAUDE.md, architecture proposal and threat model
- add project brief as docs/SPEC.md
