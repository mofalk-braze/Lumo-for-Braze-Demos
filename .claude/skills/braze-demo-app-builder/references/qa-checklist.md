# QA Checklist

Use this before finishing any implementation created with this skill.

## Always Run When Possible

```sh
npm run validate:demo-runtime
cd web-template && npm run build
```

## Native Checks

Run Android checks when Android shell, bridge, manifest, push, app link, SDK command, or generated Android metadata changed:

```sh
cd android-shell
./gradlew :app:compileDebugKotlin
```

Run iOS checks when iOS shell, bridge, Info.plist, push, universal link, SDK command, or generated iOS metadata changed:

```sh
cd ios-shell
xcodebuild -project BrazeDemoShell.xcodeproj -scheme BrazeDemoShell -sdk iphonesimulator -derivedDataPath ./DerivedData CODE_SIGNING_ALLOWED=NO build
```

## Story Smoke Tests

- Browser harness renders without native bridge.
- Runtime id/runtimeHash and canonical rendered source match the expected
  active pack.
- Every declared Banner placement renders on its mapped screen in a native
  shell; browser placeholder evidence is not counted as Banner delivery.
- Pack `notes.md` maps Content Card, Banner, IAM, and push dashboard setup,
  proof, and fallback.
- Product UI contains no presenter-only controls.
- Control Room preset executes the intended SDK or REST action.
- One user change causes one native SDK identity write.
- Content Cards refresh and render in the intended placement.
- IAM-triggering events are logged by the native SDK when the claim is mobile IAM.
- Push/deep-link stories navigate and log exactly once after identity resolution.

## Finish Report

Report:

- files or subsystems changed
- validation commands run and their result
- any checks skipped and why
- any manual Braze dashboard setup still required, such as campaign trigger event, Content Card extras, APNs/FCM setup, universal link host files, or API-triggered campaign IDs
