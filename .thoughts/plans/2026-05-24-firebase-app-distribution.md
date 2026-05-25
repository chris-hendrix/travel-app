---
date: 2026-05-24
topic: Firebase App Distribution CI/CD Integration
status: in-progress
---

# Firebase App Distribution CI/CD — Implementation Plan

## Overview

Integrate Firebase App Distribution into the build pipeline so every push to `main` (or manual trigger) builds the Android APK and distributes it to testers via Firebase. Uses the Firebase App Distribution Gradle plugin — a single Gradle command builds AND uploads. No separate CLI or Fastlane needed.

## Success Criteria

- [ ] `make distribute-android` builds APK and uploads to Firebase App Distribution from local WSL2
- [ ] Release appears in Firebase Console → App Distribution with correct version
- [ ] Testers receive email invite or console link to install
- [ ] GitHub Actions workflow distributes on push to `main`
- [ ] `pnpm build:web` (standalone) still succeeds after Gradle changes
- [ ] All existing tests pass (`pnpm test`, `pnpm lint`, `pnpm typecheck`)

## What We're NOT Doing

- Not setting up Fastlane (overkill — Gradle plugin is sufficient)
- Not distributing release AABs (debug APKs for internal testing)
- Not automating Play Store uploads (out of scope)
- Not distributing iOS builds (post-MVP)
- Not adding automated device tests via Firebase Test Lab (can add later)
- Automating tester group management (manual via Firebase Console for MVP)

## Risks & Blockers

| Risk | Severity | Mitigation |
|------|----------|-----------|
| VersionCode collision on repeat uploads | High | Use `-PbuildNumber=$GITHUB_RUN_NUMBER` or timestamp; Firebase rejects duplicate versionCodes |
| Gradle plugin classpath conflict with Capacitor auto-generated `capacitor.build.gradle` | Low | Plugin applied in `app/build.gradle` (not generated file); classpath goes in root `build.gradle` |
| Service account credentials exposed in CI logs | Medium | Use GitHub Secrets, never echo in scripts |
| `google-services.json` not available in CI | High | Store as GitHub Secret, write to disk during workflow |
| WSL2 Gradle signing issues | Low | Distribute debug APK (no signing required) |
| Gradle daemon OOM during CI Android build | Medium | Set `GRADLE_OPTS=-Dorg.gradle.jvmargs=-Xmx3g` in workflow env or add to `apps/web/android/gradle.properties` |

## Branch & Commit Strategy

```
Branch: feat/capacitor-native-apps (same branch as existing work)
Commits: One for Gradle plugin + Makefile, one for GHA workflow
PR: Included in the existing #18 (feat/capacitor-native-apps)
```

## Architecture

### Distribution Pipeline

```
make distribute-android
  │
  ├── make build-mobile          → NEXT_EXPORT=true → out/
  ├── npx cap sync               → out/ → android/app/src/main/assets/
  └── ./gradlew assembleDebug    → Builds APK
        appDistributionUploadDebug → Uploads to Firebase
                                       │
                                       ▼
                              Firebase App Distribution
                                       │
                                       ▼
                              Testers get email link
```

### Gradle Configuration

**Root `android/build.gradle`** — add classpath:
```groovy
classpath 'com.google.firebase:firebase-appdistribution-gradle:5.2.1'
```

**App `android/app/build.gradle`** — apply plugin and configure:
```groovy
apply plugin: 'com.google.firebase.appdistribution'

android {
    defaultConfig {
        versionCode project.hasProperty('buildNumber')
            ? project.property('buildNumber').toInteger()
            : 1
    }

    buildTypes {
        debug {
            firebaseAppDistribution {
                artifactType = "APK"
                testers = project.hasProperty('testers') ? project.property('testers') : "your-email@gmail.com"
            }
        }
    }
}
```

In CI, pass `-PbuildNumber=$GITHUB_RUN_NUMBER` to `./gradlew`. Local builds default to 1.

Testers can be passed via `-Ptesters='a@b.com,c@d.com'` on the Gradle command line. Defaults to the hardcoded value for local dev.

NOTE: Android provides `debug` and `release` build types implicitly. The current
`app/build.gradle` only explicitly configures `release`, but `debug` exists and
we add the `firebaseAppDistribution` block to it. No separate `debug` block creation needed.

### Authentication

The Gradle plugin reads credentials from:
- `GOOGLE_APPLICATION_CREDENTIALS` env var → path to service account JSON file
- Or `serviceCredentialsFile` property in build.gradle

For CI: Service account JSON written to `/tmp/firebase-sa.json` from `FIREBASE_SERVICE_ACCOUNT` GitHub Secret, then `GOOGLE_APPLICATION_CREDENTIALS=/tmp/firebase-sa.json` set.

### Release Notes

Auto-generated from recent git commits:
```bash
git log --oneline -5 > /tmp/release-notes.txt
```
Passed to the Gradle build via `releaseNotesFile` property.

### CI Trigger

| Trigger | Behavior |
|---------|----------|
| `push` to `main` | Auto-distribute on every merge |
| `workflow_dispatch` | Manual trigger from GitHub Actions tab |
| Path filter: `apps/web/**` | Only runs when web/mobile code changes |

---

## Implementation Checklist

### Task 1: Add Firebase App Distribution Gradle Plugin

- [x] **Task 1.1: Add classpath to root build.gradle**
  - [x] RED: Run `cd apps/web/android && ./gradlew appDistributionUploadDebug` → confirm "Task 'appDistributionUploadDebug' not found"
  - [x] GREEN: Add `classpath 'com.google.firebase:firebase-appdistribution-gradle:5.2.1'` to `apps/web/android/build.gradle`
  - [x] CHECK: `./gradlew tasks --group="Firebase"` lists Firebase tasks (`appDistributionUploadDebug` appears after plugin applied in Task 1.2) — see Tracked Changes for inaccuracy note

- [x] **Task 1.2: Apply plugin and configure in app build.gradle**
  - [x] RED: Run `./gradlew assembleDebug appDistributionUploadDebug` → fails with "Task 'appDistributionUploadDebug' not found"
  - [x] GREEN: Add `apply plugin: 'com.google.firebase.appdistribution'` to `apps/web/android/app/build.gradle`
  - [x] GREEN: Configure `debug.firebaseAppDistribution` block with `artifactType = "APK"`, dynamic `testers` and `versionCode`
  - [x] CHECK: `./gradlew assembleDebug appDistributionUploadDebug` → `assembleDebug` succeeds, `appDistributionUploadDebug` fails only with "Could not find credentials" (expected — no service account configured yet)

### Task 2: Local Distribution Test

- [x] **Task 2.1: Extract service account JSON to temp file**
  - [x] RED: Run `ls /tmp/firebase-sa.json` → file does not exist
  - [x] GREEN: Write service account JSON from `FIREBASE_SERVICE_ACCOUNT` env var to temp file
  - [x] CHECK: File exists, valid JSON, contains `project_id`

- [x] **Task 2.2: Run full build + distribute**
  - [x] GREEN: `make build-mobile && cd apps/web && npx cap sync` → succeeded
  - [x] GREEN: `cd apps/web/android && GOOGLE_APPLICATION_CREDENTIALS=/tmp/firebase-sa.json ./gradlew assembleDebug appDistributionUploadDebug` → `assembleDebug` succeeded, `appDistributionUploadDebug` FAILED with 403
  - [x] CHECK: APK exists at `apps/web/android/app/build/outputs/apk/debug/app-debug.apk` (10.9 MB / 11M)
  - [!] CHECK: Upload blocked — 403 "The caller does not have permission". Service account `firebase-adminsdk-fbsvc@journiful-app.iam.gserviceaccount.com` needs `roles/firebaseappdistribution.admin` (or `releaser`). Must be granted manually in Firebase Console > Project Settings > Service Accounts or GCP IAM.
  - [!] CHECK: `firebase appdistribution:releases:list` is not a recognized Firebase CLI command (also blocked by same 403 permission).

### Task 3: Makefile Target

- [ ] **Task 3.1: Add `distribute-android` target**
  - GREEN: Generate release notes from recent commits: `git log --oneline -5 > /tmp/release-notes.txt`
  - GREEN: Create Makefile target:
    ```makefile
    distribute-android: ## Build and distribute Android APK via Firebase App Distribution
    	@echo "Writing service account credentials..."
    	@echo "$$FIREBASE_SERVICE_ACCOUNT" > /tmp/firebase-sa.json
    	@echo "Building web app for mobile..."
    	cd apps/web && pnpm build:mobile
    	@echo "Syncing Capacitor..."
    	cd apps/web && npx cap sync
    	@echo "Building and distributing APK..."
    	cd apps/web/android && GOOGLE_APPLICATION_CREDENTIALS=/tmp/firebase-sa.json \
    		./gradlew assembleDebug appDistributionUploadDebug \
    		-PreleaseNotesFile=/tmp/release-notes.txt
    	@rm -f /tmp/firebase-sa.json /tmp/release-notes.txt
    	@echo "Distribution complete. Check Firebase Console."
    ```
  - GREEN: Pass release notes to Gradle via `-PreleaseNotesFile=/tmp/release-notes.txt`
  - GREEN: Clean up temp file after build: `rm -f /tmp/firebase-sa.json /tmp/release-notes.txt`
  - CHECK: `make distribute-android` completes successfully from WSL2

### Task 4: GitHub Actions Workflow

- [ ] **Task 4.1: Add GitHub Secrets**
  - GREEN: Add `GOOGLE_SERVICES_JSON` secret (contents of `google-services.json`)
  - GREEN: Add `FIREBASE_SERVICE_ACCOUNT` secret (service account JSON from `.env`)
  - CHECK: Secrets visible in repo Settings → Secrets and variables → Actions

- [ ] **Task 4.2: Create workflow file**
  - RED: Push a commit with the workflow file but without `FIREBASE_SERVICE_ACCOUNT` secret set → workflow runs, Gradle task fails with clear auth error (not silent hang)
  - GREEN: Create `.github/workflows/distribute.yml` with:
    - Trigger: `push` to `main` with path filter `apps/web/**` + `workflow_dispatch`
    - `actions/checkout@v6`
    - `actions/setup-java@v4` with `java-version: '21'`, `distribution: 'temurin'`
    - `android-actions/setup-android@v3` (or `sdkmanager "platforms;android-36" "build-tools;36.0.0"`)
    - `pnpm/action-setup@v6` + `actions/setup-node@v6` (`node-version: 22`, `cache: 'pnpm'`)
    - `pnpm install --frozen-lockfile`
    - Write `GOOGLE_SERVICES_JSON` secret → `apps/web/android/app/google-services.json`
    - Write `FIREBASE_SERVICE_ACCOUNT` secret → `/tmp/firebase-sa.json`
    - Set `GOOGLE_APPLICATION_CREDENTIALS=/tmp/firebase-sa.json`
    - Set `GRADLE_OPTS: -Dorg.gradle.jvmargs=-Xmx3g` (prevent OOM)
    - Generate release notes: `git log --oneline -5 > /tmp/release-notes.txt`
    - `make build-mobile`
    - `cd apps/web && npx cap sync`
    - `cd apps/web/android && ./gradlew assembleDebug appDistributionUploadDebug -PbuildNumber=$GITHUB_RUN_NUMBER -PreleaseNotesFile=/tmp/release-notes.txt`
    - Cleanup: `rm /tmp/firebase-sa.json /tmp/release-notes.txt`
  - CHECK: Workflow appears in Actions tab

- [ ] **Task 4.3: Test CI distribution**
  - GREEN: Trigger `workflow_dispatch` from Actions tab
  - CHECK: Workflow completes successfully
  - CHECK: Release appears in Firebase Console

### Task 5: Documentation & Regression

- [ ] **Task 5.1: Update AGENTS.md**
  - GREEN: Add `make distribute-android` to Common commands
  - CHECK: Command documented

- [ ] **Task 5.2: Regression check**
  - CHECK: `pnpm build:web` (standalone) succeeds
  - CHECK: `make build-mobile` succeeds
  - CHECK: `pnpm test`, `pnpm lint`, `pnpm typecheck` pass

---

## Testing Strategy

| Type | What | Where |
|------|------|-------|
| Manual | APK install on phone from Firebase link | Physical device |
| Manual | Verify release notes, version in Firebase Console | Firebase Console |
| CI | `./gradlew assembleDebug` succeeds | GitHub Actions |
| CI | `appDistributionUploadDebug` succeeds | GitHub Actions |
| Regression | All existing CI checks pass | `.github/workflows/ci.yml` |

## Tracked Changes

> Record deviations from plan during implementation here.

**2026-05-24** - Task 1.1 CHECK refined: `appDistributionUploadDebug` does not appear in `tasks --group="Firebase"` until the plugin is applied to the app module (Task 1.2). Classpath alone is insufficient. Updated CHECK to BUILD SUCCESSFUL.

**2026-05-24** - Task 2.2 upload blocked: Service account `firebase-adminsdk-fbsvc@journiful-app.iam.gserviceaccount.com` lacks IAM role `roles/firebaseappdistribution.admin`. It cannot enable APIs, read/modify IAM policies, or upload releases. Must be granted manually. `gcloud auth login --no-browser` available but requires browser-based OAuth flow. Also discovered: Java not on host PATH but available at `/home/chend/jdk/jdk-21.0.11+10`; `ANDROID_HOME` already set to Windows Sdk path; `firebase appdistribution:releases:list` is not a recognized Firebase CLI command.

## References

- Firebase App Distribution Gradle plugin: https://firebase.google.com/docs/app-distribution/android/distribute-gradle
- Firebase App Distribution: https://firebase.google.com/docs/app-distribution
- Existing CI: `.github/workflows/ci.yml`
- Firebase App ID: `1:322289647579:android:99cfd802aca2d7c3ea71fe`
