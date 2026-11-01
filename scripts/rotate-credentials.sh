#!/usr/bin/env bash
#
# rotate-credentials.sh — rotate the Journiful api service's credentials, and
# repair what Railway's own credential reset already broke.
#
# Rewritten 2026-10-22 (v2) after Railway published their remediation guides.
# v1 tried to rotate the bucket keys and the Postgres password by hand. That is
# now wrong, and Railway says so explicitly:
#
#   Bucket keys      "A bucket's credentials reach your services through reference
#                    variables, and containers read variables only at startup. The
#                    bucket already has its new credentials. Your services pick
#                    them up on their next deploy."
#                    https://blog.railway.com/p/security-disclosure-recommendation-redeploy-buckets-and-reconnect-github-after-the-credential-reset
#
#   Postgres         "Don't edit POSTGRES_PASSWORD or PGPASSWORD by hand, and don't
#                    run ALTER USER yourself... The fastest path is Regenerate in the
#                    Database View, which changes the password inside PostgreSQL and
#                    updates the service variables in one step."
#                    https://blog.railway.com/p/security-disclosure-recommendation-rotate-postgresql-database-credentials
#
# So the credentials split into four owners, and only two of them are this script's job:
#
#   railway-owned   AWS_ACCESS_KEY_ID/SECRET, DATABASE_URL   → references; a redeploy is the whole rotation
#   provider-owned  TWILIO_AUTH_TOKEN, GOOGLE_MAPS_API_KEY   → mint at the provider, write the value, revoke the old
#   self-owned      JWT_SECRET, VAPID_*                      → generated here
#   manual          AERODATABOX_API_KEY                      → no rotation API
#
# THE ONE-LINE FIX for the bucket reset is `deploy`. Nothing else.
#
# Hazards this script encodes:
#   * Regenerate restarts Postgres and drops every session. If the deploy that
#     must follow then FAILS (pre-deploy migration, build), the old container keeps
#     running with a password that no longer exists, and there is no rollback.
#     That is why `invalidate` refuses to run without --migrations-proven.
#   * The api service has no healthcheckPath, so a half-broken deploy is not rolled
#     back by Railway. Fixing that is in DEPLOYMENT.md's follow-up list.
#   * Twilio promote kills the old token immediately: OTP sign-in SMS fails from
#     that moment until the deploy lands. Seconds, if the script drives it.
#
# Secrets never reach stdout: values are read with python3 from Railway JSON and
# written back through `railway variable set --stdin`. `set -x` must never be added.
# This repository is PUBLIC. Old values live in $STATE_DIR (0700 dir, 0600 files)
# so `revert` works; `verify --purge` shreds it.
#
# EXERCISED against production on 2026-10-22: plan, deploy, stage, invalidate, verify —
# a full rotation, including the Regenerate poll, the Twilio promote, and a Hobby deploy
# that took five minutes fifty to build. NOT YET EXERCISED: `revert` and `verify --purge`.
# Read those two before relying on them under pressure.
#
# USAGE
#   ./scripts/rotate-credentials.sh plan                         # read-only
#   ./scripts/rotate-credentials.sh deploy                       # redeploy + wait (fixes buckets)
#   ./scripts/rotate-credentials.sh verify                       # end-to-end checks
#   ./scripts/rotate-credentials.sh stage --apply [--skip vapid]
#   ./scripts/rotate-credentials.sh invalidate --i-mean-it --migrations-proven
#   ./scripts/rotate-credentials.sh revert --i-mean-it
#
# Provider endpoints verified 2026-10-22 against:
#   https://www.twilio.com/docs/iam/api/secondary_authtoken   (create secondary)
#   https://www.twilio.com/docs/iam/api/authtoken             (POST /v1/AuthTokens/Promote)
#   railway 5.71.0  `railway bucket|variable|deployment|ssh --help`
#   gcloud `services api-keys` CLI
#
set -euo pipefail
umask 077

# ── config ────────────────────────────────────────────────────────────────────
SERVICE="${SERVICE:-api}"
PG_SERVICE="${PG_SERVICE:-postgres}"
RAILWAY_ENV="${RAILWAY_ENV:-production}"
BUCKET="${BUCKET:-storage}"
API_BASE="${API_BASE:-https://api.journiful.app}"
EXPECT_PROJECT="${EXPECT_PROJECT:-journiful}"
GCP_PROJECT="${GCP_PROJECT:-journiful-app}"
STATE_ROOT="${STATE_ROOT:-$HOME/.journiful-rotation}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

CMD="${1:-}"
[ $# -gt 0 ] && shift || true

APPLY=0; MEAN_IT=0; SKIP=""; PURGE=0; NO_DEPLOY=0; MIGPROVEN=0; SKIP_PG=0
MAPS_OLD_KEY=""; EXPECT_COMMIT=""; AERO_KEY=""; AERO_KEY_FILE="${AERO_KEY_FILE:-}"; TIMEOUT_S=1200; WAIT_S=0

while [ $# -gt 0 ]; do
  case "$1" in
    --apply)              APPLY=1 ;;
    --i-mean-it)          MEAN_IT=1 ;;
    --migrations-proven)  MIGPROVEN=1 ;;
    --skip-pg)            SKIP_PG=1 ;;
    --no-deploy)          NO_DEPLOY=1 ;;
    --skip)               SKIP="${2:-}"; shift ;;
    --purge)              PURGE=1 ;;
    --maps-old-key)       MAPS_OLD_KEY="${2:-}"; shift ;;
    --expect-commit)      EXPECT_COMMIT="${2:-}"; shift ;;
    --aero-key)           AERO_KEY="${2:-}"; shift ;;
    --timeout)            TIMEOUT_S="${2:-1200}"; shift ;;
    --wait)               WAIT_S="${2:-0}"; shift ;;
    -h|--help|"")         CMD="${CMD:-help}" ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
  shift
done

# ── output ────────────────────────────────────────────────────────────────────
say()   { printf '%s\n' "$*"; }
warn()  { printf '  ! %s\n' "$*" >&2; }
die()   { printf '\nFATAL: %s\n' "$*" >&2; exit 1; }
head2() { printf '\n\033[1m%s\033[0m\n' "$*"; }
FAILS=0
ok()    { printf '  \033[32mPASS\033[0m  %s\n' "$1"; }
bad()   { printf '  \033[31mFAIL\033[0m  %s\n' "$1"; FAILS=$((FAILS + 1)); }
skip()  { printf '  \033[33mSKIP\033[0m  %s\n' "$1"; }
in_list() { case ",$1," in *",$2,"*) return 0 ;; *) return 1 ;; esac; }
skipped() { [ -n "$SKIP" ] && in_list "$SKIP" "$1"; }
strength() { python3 -c 'import sys; print("len=%d" % len(sys.argv[1]))' "$1"; }

# ── json (jq is not installed on this host) ───────────────────────────────────
json_get() { python3 - "$1" "$2" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
v = d.get(sys.argv[2], "")
print("" if v is None else v)
PY
}
json_stdin_get() {
  python3 -c 'import json,sys; v=json.load(sys.stdin).get(sys.argv[1],""); print("" if v is None else v)' "$1"
}
sha12() { python3 -c 'import hashlib,sys; print(hashlib.sha256(sys.argv[1].encode()).hexdigest()[:12])' "$1"; }

# ── railway ───────────────────────────────────────────────────────────────────
need_railway() {
  command -v railway >/dev/null || die "railway CLI not found"
  local st proj
  st="$(railway status --json 2>/dev/null || true)"
  [ -n "$st" ] || die "railway is not linked to a project"
  proj="$(printf '%s' "$st" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("name",""))' 2>/dev/null || true)"
  [ "$proj" = "$EXPECT_PROJECT" ] || die "linked project is '$proj', expected '$EXPECT_PROJECT' (override EXPECT_PROJECT=)"
}

railway_set_stdin() { # <service> <key>   value on stdin
  railway variable set "$2" --stdin --skip-deploys \
    --service "$1" --environment "$RAILWAY_ENV" --json >/dev/null
}

snapshot_vars() { # <service> <outfile>
  railway variable list --service "$1" --environment "$RAILWAY_ENV" --json > "$2"
  chmod 600 "$2"
}

api_health() { curl -fsS --max-time 20 "$API_BASE/api/health/ready" 2>/dev/null || echo '{"status":"unreachable"}'; }
api_healthy() {
  local s
  s="$(api_health | python3 -c 'import json,sys
try: print(json.load(sys.stdin).get("status",""))
except Exception: print("")')"
  [ "$s" = "ok" ]
}

active_api_commit() {
  railway deployment list --service "$SERVICE" --environment "$RAILWAY_ENV" --json 2>/dev/null \
  | python3 -c '
import json,sys
try: ds = json.load(sys.stdin)
except Exception: print(""); raise SystemExit
for d in ds:
    if d.get("status") == "SUCCESS":
        print(((d.get("meta") or {}).get("commitHash") or "")[:12]); break
else: print("")
'
}

latest_api_status() {
  railway deployment list --service "$SERVICE" --environment "$RAILWAY_ENV" --json 2>/dev/null \
  | python3 -c 'import json,sys
d=json.load(sys.stdin)
print("%s %s" % (d[0]["status"], ((d[0].get("meta") or {}).get("commitHash") or "")[:12]) if d else "none")'
}

# ── credential probes (all read-only, none print a value) ─────────────────────
bucket_json() { railway bucket credentials --bucket "$BUCKET" --environment "$RAILWAY_ENV" --json 2>/dev/null; }

# Is the value the api service *holds as config* the same as the bucket's live key?
# (Does NOT prove the running container has it — only a redeploy does that.)
bucket_sync() { # <api file>
  local ak sk bj
  ak="$(json_get "$1" AWS_ACCESS_KEY_ID)"; sk="$(json_get "$1" AWS_SECRET_ACCESS_KEY)"
  bj="$(bucket_json)" || return 1
  [ -n "$bj" ] || return 1
  printf '%s' "$bj" | python3 -c '
import json,sys
b=json.load(sys.stdin)
same = b.get("accessKeyId","")==sys.argv[1] and b.get("secretAccessKey","")==sys.argv[2]
print("api config matches bucket" if same else "MISMATCH — api config holds a different key than the bucket")
' "$ak" "$sk"
}

# The api's `/uploads/*` route proxies S3 and turns every error into a 404, so the
# only honest test is end-to-end: pick a real key from the bucket, fetch it from the
# api. Needs the bucket's credentials, which this host has via the railway CLI.
photo_pipeline() { # -> "ok <bytes>" | "404 <key> (<code>)" | "empty" | "err <what>"
  local bj key bj_ak
  bj="$(bucket_json)" || { echo "err bucket-unreadable"; return 0; }
  bj_ak="$(printf '%s' "$bj" | json_stdin_get accessKeyId)"
  [ -n "$bj_ak" ] || { echo "err bucket-unreadable"; return 0; }
  # list one object with the bucket's own credentials
  key="$( cd "$REPO_ROOT/apps/api" && \
  S3_AK="$bj_ak" \
    S3_SK="$(printf '%s' "$bj" | json_stdin_get secretAccessKey)" \
    S3_BN="$(printf '%s' "$bj" | json_stdin_get bucketName)" \
    S3_EP="$(printf '%s' "$bj" | json_stdin_get endpoint)" \
    S3_RG="$(printf '%s' "$bj" | json_stdin_get region)" \
    node -e '
const {S3Client,ListObjectsV2Command}=require("@aws-sdk/client-s3");
const c=new S3Client({endpoint:process.env.S3_EP,region:process.env.S3_RG,
  credentials:{accessKeyId:process.env.S3_AK,secretAccessKey:process.env.S3_SK}});
c.send(new ListObjectsV2Command({Bucket:process.env.S3_BN,MaxKeys:1}))
 .then(r=>console.log((r.Contents&&r.Contents[0]&&r.Contents[0].Key)||"EMPTY"))
 .catch(e=>console.log("ERR "+e.name));
' 2>/dev/null | tail -1 )"
  case "$key" in EMPTY) echo "empty"; return 0 ;; ERR*) echo "err $key"; return 0 ;; esac
  rep="$(curl -s -o /dev/null -m 30 -w '%{http_code} %{size_download}' "$API_BASE/uploads/$key" || echo '000 0')"
  code="${rep%% *}"; size="${rep##* }"
  if [ "$code" = "200" ] && [ "$size" -gt 0 ] 2>/dev/null; then echo "ok $size"; else echo "404 $key ($code)"; fi
}

db_auth() { # -> "ok" | "fail <reason>"
  local url
  url="$(json_get "$1" DATABASE_PUBLIC_URL)"
  [ -n "$url" ] || { echo "skip no-public-url"; return 0; }
  if psql "$url" -v ON_ERROR_STOP=1 -q -t -c 'select 1' >/dev/null 2>&1; then echo ok; else echo "fail $url"; fi
}

# ── state ─────────────────────────────────────────────────────────────────────
STATE_DIR=""
init_state() {
  if [ -L "$STATE_ROOT/current" ] && [ -d "$STATE_ROOT/current" ]; then
    STATE_DIR="$STATE_ROOT/current"
  else
    mkdir -p "$STATE_ROOT"; chmod 700 "$STATE_ROOT"
    STATE_DIR="$STATE_ROOT/$(date -u +%Y%m%dT%H%M%SZ)"
    mkdir -p "$STATE_DIR"; chmod 700 "$STATE_DIR"
    ln -sfn "$STATE_DIR" "$STATE_ROOT/current"
  fi
  chmod 700 "$STATE_DIR" 2>/dev/null || true
  [ -f "$STATE_DIR/status.env" ] || : > "$STATE_DIR/status.env"
  chmod 600 "$STATE_DIR/status.env"
}
use_state() {
  [ -L "$STATE_ROOT/current" ] && [ -d "$STATE_ROOT/current" ] \
    || die "no rotation state at $STATE_ROOT — run 'stage --apply' first"
  STATE_DIR="$STATE_ROOT/current"
}
mark() { printf '%s=%s\n' "$1" "$2" >> "$STATE_DIR/status.env"; }
did()  { grep -qx "$1=1" "$STATE_DIR/status.env" 2>/dev/null; }
newv() { json_get "$STATE_DIR/new.secrets.json" "$1"; }
set_new() {
  python3 - "$STATE_DIR/new.secrets.json" "$1" "$2" <<'PY'
import json, sys
p, k, v = sys.argv[1], sys.argv[2], sys.argv[3]
try: d = json.load(open(p))
except Exception: d = {}
d[k] = v
json.dump(d, open(p, "w"), indent=0)
PY
}

# ══════════════════════════════════════════════════════════════════════════════
# plan — read-only inventory and guards
# ══════════════════════════════════════════════════════════════════════════════
cmd_plan() {
  need_railway
  local tmp; tmp="$(mktemp -d)"; trap "rm -rf '$tmp'" EXIT
  snapshot_vars "$SERVICE" "$tmp/api.json"
  snapshot_vars "$PG_SERVICE" "$tmp/pg.json"

  head2 "Runtime"
  say "  project / service / env : $(railway status --json | python3 -c 'import json,sys;print(json.load(sys.stdin).get("name",""))') / $SERVICE / $RAILWAY_ENV"
  say "  api /ready              : $(api_health | python3 -c 'import json,sys;d=json.load(sys.stdin);print(d.get("status"),"| db:",d.get("database"),"| migrations:",d.get("migrations"))' 2>/dev/null || echo unreachable)"
  say "  active api commit       : $(active_api_commit)"
  say "  latest api deployment   : $(latest_api_status)"
  say "  plan (from deploy meta) : $(railway deployment list --service "$SERVICE" --environment "$RAILWAY_ENV" --json 2>/dev/null | python3 -c 'import json,sys;d=json.load(sys.stdin);print((d[0].get("meta") or {}).get("plan","?") if d else "?")')"
  say "  source repo             : $(railway status --json | python3 -c 'import json,sys
d=json.load(sys.stdin)
def walk(o):
    if isinstance(o,dict):
        for k,v in o.items():
            if k=="repo" and isinstance(v,str): print(v); return True
            if walk(v): return True
    elif isinstance(o,list):
        for v in o:
            if walk(v): return True
    return False
print("" if walk(d) else "not shown by CLI")' 2>/dev/null)"

  head2 "End-to-end health (the two things the reset broke)"
  local photo db
  photo="$(photo_pipeline)"
  case "$photo" in
    ok*)    ok "photo pipeline: /uploads/<key> served ($photo)" ;;
    empty)  skip "photo pipeline: bucket has no objects to test with" ;;
    *)      bad "photo pipeline: $photo — the container holds a revoked bucket key, or a wrong credential" ;;
  esac
  db="$(db_auth "$tmp/pg.json")"
  case "$db" in
    ok)          ok "Postgres: public URL authenticates" ;;
    skip*)       skip "Postgres: ${db#skip }" ;;
    *)           bad "Postgres: ${db#fail }" ;;
  esac
  say ""
  say "  ! A failing photo pipeline with a non-empty bucket means the running container"
  say "    predates Railway's bucket reset. \`deploy\` is the fix; nothing else is needed."

  head2 "Credentials — who owns what"
  printf '  %-24s %-9s %s\n' CREDENTIAL OWNER STATE
  printf '  %-24s %-9s %s\n' 'AWS_ACCESS_KEY_ID' railway "$(bucket_sync "$tmp/api.json" 2>/dev/null || echo unreadable)"
  printf '  %-24s %-9s %s\n' 'DATABASE_URL' railway "$(python3 -c 'import sys;from urllib.parse import urlsplit as u;x=u(sys.argv[1]);print((x.hostname or "?")+":"+str(x.port or 5432)+x.path)' "$(json_get "$tmp/api.json" DATABASE_URL)")"
  printf '  %-24s %-9s %s\n' 'JWT_SECRET' self "$(strength "$(json_get "$tmp/api.json" JWT_SECRET)")"
  printf '  %-24s %-9s %s\n' 'TWILIO_AUTH_TOKEN' provider "sid $(strength "$(json_get "$tmp/api.json" TWILIO_ACCOUNT_SID)"), token $(strength "$(json_get "$tmp/api.json" TWILIO_AUTH_TOKEN)")"
  printf '  %-24s %-9s %s\n' 'GOOGLE_MAPS_API_KEY' provider "$(gcloud services api-keys list --project "$GCP_PROJECT" --format=json 2>/dev/null | python3 -c 'import json,sys
ks=json.load(sys.stdin); print("%d key(s): %s" % (len(ks), ", ".join(k["displayName"] for k in ks if k.get("displayName"))))' 2>/dev/null || echo 'gcloud unavailable')"
  printf '  %-24s %-9s %s\n' 'VAPID_PRIVATE_KEY' self "$(strength "$(json_get "$tmp/api.json" VAPID_PRIVATE_KEY)")"
  printf '  %-24s %-9s %s\n' 'AERODATABOX_API_KEY' manual "$(strength "$(json_get "$tmp/api.json" AERODATABOX_API_KEY)") — you mint it"
  say ""
  say "  railway-owned = reference vars; Railway already rotated them, so a redeploy is the whole rotation."
  if bucket_sync "$tmp/api.json" 2>/dev/null | grep -q '^api config matches'; then
    say "  -> nothing to rotate here; \`deploy\` covers bucket and database."
  else
    say "  -> bucket mismatch: Railway rotated it and your config has not caught up. Re-check the service's"
    say "     Variables tab for a pasted value where a \${{ $BUCKET.ACCESS_KEY_ID }} reference belongs."
  fi

  head2 "Guards"
  say "  rotation state : ${STATE_ROOT}/current ($([ -L "$STATE_ROOT/current" ] && echo exists || echo absent))"
  say ""
  say "Next: ./scripts/rotate-credentials.sh deploy               # fix the bucket reset"
  say "Then: ./scripts/rotate-credentials.sh stage --apply        # mint the app-owned secrets"
}

# ══════════════════════════════════════════════════════════════════════════════
# deploy — the entire bucket-credential rotation
# ══════════════════════════════════════════════════════════════════════════════
cmd_deploy() { need_railway; do_deploy; }

do_deploy() {
  head2 "deploy"
  if [ -n "$EXPECT_COMMIT" ]; then
    # A failed deployment cannot be "redeployed", and the latest one here is the
    # Settle deploy that failed before the incident. Name the commit instead.
    say "  deploying commit $EXPECT_COMMIT (the failed deployment cannot be redeployed as-is)"
    railway redeploy --service "$SERVICE" --environment "$RAILWAY_ENV" --commit "$EXPECT_COMMIT" --yes >/dev/null 2>&1 \
      || die "Railway refused --commit $EXPECT_COMMIT. Try once more later; do not loop."
    say "  accepted"
  else
    say "  redeploying the latest deployment (no rebuild)"
    railway redeploy --service "$SERVICE" --environment "$RAILWAY_ENV" --yes >/dev/null 2>&1 \
      || die "Railway refused the redeploy. If your plan's builds are paused this is expected (https://status.railway.com/incident/QH8L8B3E); do not loop. Otherwise pass --expect-commit <sha>."
    say "  accepted"
  fi

  local i=0
  while [ "$i" -lt "$TIMEOUT_S" ]; do
    if api_healthy; then say "  /api/health/ready ok after ${i}s"; mark DEPLOYED 1; return 0; fi
    sleep 5; i=$((i+5))
  done
  die "api not ready after ${TIMEOUT_S}s. Check 'railway logs --service $SERVICE --deployment'. If pre-deploy failed, the DB password may already be Regenerated and the old container is holding a dead one — recovering requires a SUCCESSFUL deploy, so fix the migration and redeploy. Do not loop."
}

# ══════════════════════════════════════════════════════════════════════════════
# stage — mint the app-owned and provider-owned secrets. Nothing is revoked,
#         nothing deploys.
# ══════════════════════════════════════════════════════════════════════════════
cmd_stage() {
  need_railway
  [ "$APPLY" = 1 ] || die "stage writes variables; pass --apply"
  init_state
  if did STAGED; then die "already staged at $STATE_DIR (run invalidate, or delete that dir to start over)"; fi

  [ -f "$STATE_DIR/api-env.before.json" ] || snapshot_vars "$SERVICE" "$STATE_DIR/api-env.before.json"
  snapshot_vars "$PG_SERVICE" "$STATE_DIR/pg-env.before.json"
  local BEFORE="$STATE_DIR/api-env.before.json"
  : > "$STATE_DIR/new.secrets.json"; chmod 600 "$STATE_DIR/new.secrets.json"

  head2 "minting"

  if ! skipped jwt; then
    local jwt; jwt="$(openssl rand -base64 48 | tr -d '\n' | tr '+/' '-_')"
    set_new JWT_SECRET "$jwt"
    say "  JWT_SECRET           minted ($(strength "$jwt")) — every user signs in again once"
  fi

  if ! skipped twilio; then
    local sid tok sec
    sid="$(json_get "$BEFORE" TWILIO_ACCOUNT_SID)"
    tok="$(json_get "$BEFORE" TWILIO_AUTH_TOKEN)"
    [ -n "$sid" ] && [ -n "$tok" ] || die "Twilio SID/token missing from the api service"
    sec="$(twilio_create_secondary "$sid" "$tok")" || die "Twilio: could not create a secondary token"
    [ -n "$sec" ] || die "Twilio: secondary token response was empty"
    set_new _TWILIO_SECONDARY "$sec"
    set_new TWILIO_AUTH_TOKEN "$sec"
    say "  TWILIO_AUTH_TOKEN    secondary token created — primary still live until invalidate"
  fi

  if ! skipped maps; then
    local mk
    mk="$(maps_create_key)" || die "Google Maps: key creation failed (gcloud auth? project $GCP_PROJECT?)"
    [ -n "$mk" ] || die "Google Maps: gcloud returned no keyString"
    set_new GOOGLE_MAPS_API_KEY "$mk"
    say "  GOOGLE_MAPS_API_KEY  created $(strength "$mk") — old key left enabled until you delete it"
  fi

  if ! skipped vapid; then
    local pub priv
    read -r pub priv <<<"$(vapid_generate)" || die "VAPID: web-push generate failed"
    set_new VAPID_PUBLIC_KEY "$pub"; set_new VAPID_PRIVATE_KEY "$priv"
    say "  VAPID_*              new pair ($(strength "$priv")) — existing web-push subscriptions die; no app rebuild needed"
  fi

  if ! skipped aero; then
    local aero="$AERO_KEY"
    if [ -z "$aero" ] && [ -n "$AERO_KEY_FILE" ] && [ -f "$AERO_KEY_FILE" ]; then
      aero="$(tr -d '\r\n' < "$AERO_KEY_FILE")"
      say "  AERODATABOX_API_KEY  read from $AERO_KEY_FILE"
    fi
    if [ -z "$aero" ]; then
      printf '  AERODATABOX_API_KEY  paste the new key (blank to skip): '
      read -r -s aero || true; echo
    fi
    if [ -n "$aero" ]; then set_new AERODATABOX_API_KEY "$aero"; say "  AERODATABOX_API_KEY  staged"; else warn "skipped AeroDataBox — it stays on the old key"; fi
  fi

  say ""
  say "  * AWS_* and DATABASE_URL are NOT here on purpose: Railway owns them as"
  say "    reference variables and has already rotated them. They only need a deploy."

  head2 "writing variables (no deploy)"
  rail_write_app_values

  mark STAGED 1
  say ""
  say "  new values : $STATE_DIR/new.secrets.json (0600)"
  say "  old values : $BEFORE (0600)"
  say ""
  say "Nothing revoked, nothing deployed. Next:"
  say "  ./scripts/rotate-credentials.sh invalidate --i-mean-it --migrations-proven"
}

rail_write_app_values() {
  local k v
  for k in JWT_SECRET TWILIO_AUTH_TOKEN GOOGLE_MAPS_API_KEY VAPID_PUBLIC_KEY VAPID_PRIVATE_KEY AERODATABOX_API_KEY; do
    v="$(newv "$k")"
    if [ -n "$v" ]; then
      printf '%s' "$v" | railway_set_stdin "$SERVICE" "$k"
      say "  $SERVICE.$k = <set>"
    fi
  done
}

twilio_create_secondary() {
  printf 'user = "%s:%s"\n' "$1" "$2" \
  | curl -sS -K - -X POST "https://accounts.twilio.com/v1/AuthTokens/Secondary" \
  | python3 -c 'import json,sys
try: print(json.load(sys.stdin).get("secondary_auth_token") or "")
except Exception: print("")'
}

twilio_promote() { # <sid> <current primary> -> new primary
  printf 'user = "%s:%s"\n' "$1" "$2" \
  | curl -sS -K - -X POST "https://accounts.twilio.com/v1/AuthTokens/Promote" \
  | python3 -c 'import json,sys
try: print(json.load(sys.stdin).get("auth_token") or "")
except Exception: print("")'
}

maps_create_key() {
  command -v gcloud >/dev/null || return 1
  local name old targets=()
  name="journiful-$(date -u +%Y%m%d-%H%M)"
  if [ -n "$MAPS_OLD_KEY" ]; then
    old="$MAPS_OLD_KEY"
  else
    old="$(gcloud services api-keys list --project "$GCP_PROJECT" --format=json 2>/dev/null \
      | python3 -c 'import json,sys
ks=json.load(sys.stdin); print(ks[0]["name"].rsplit("/",1)[-1] if ks else "")')"
  fi
  if [ -n "$old" ]; then
    while read -r s; do [ -n "$s" ] && targets+=("--api-target=service=$s"); done < <(
      gcloud services api-keys describe "$old" --project "$GCP_PROJECT" --format=json 2>/dev/null \
      | python3 -c 'import json,sys
d=json.load(sys.stdin)
for t in ((d.get("restrictions") or {}).get("apiTargets") or []): print(t.get("service",""))')
  fi
  gcloud services api-keys create --project "$GCP_PROJECT" --display-name "$name" \
    ${targets[@]+"${targets[@]}"} --format=json 2>/dev/null \
  | python3 -c 'import json,sys
d=json.load(sys.stdin); print((d.get("response") or {}).get("keyString") or d.get("keyString") or "")'
}

vapid_generate() {
  ( cd "$REPO_ROOT/apps/api" && pnpm exec web-push generate-vapid-keys --json 2>/dev/null ) \
  | python3 -c 'import json,sys;d=json.load(sys.stdin);print(d["publicKey"], d["privateKey"])'
}

# ══════════════════════════════════════════════════════════════════════════════
# invalidate — the irreversible half. Postgres is a human click, then the deploy.
# ══════════════════════════════════════════════════════════════════════════════
cmd_invalidate() {
  need_railway
  use_state
  did STAGED || die "nothing staged — run 'stage --apply' first"
  if did INVALIDATED; then die "already invalidated; run 'deploy' then 'verify'"; fi
  [ "$MEAN_IT" = 1 ] || die "invalidate revokes live credentials. Re-run with --i-mean-it"

  head2 "pre-flight"
  api_healthy || die "api /ready is not ok — do not rotate on top of a broken api"
  ok "api /ready"
  local live; live="$(active_api_commit)"
  say "  active commit : $live"
  if [ -n "$EXPECT_COMMIT" ]; then
    case "$live" in "$(printf '%s' "$EXPECT_COMMIT" | cut -c1-12)"*) ok "commit guard" ;;
      *) die "active commit '$live' != expected '$EXPECT_COMMIT' — deploy the api before rotating" ;; esac
  else
    warn "no --expect-commit; rotating against whatever is live"
  fi
  if [ "$MIGPROVEN" = 1 ]; then ok "migrations proven on a copy"; else
    die "pass --migrations-proven once 'cd apps/api && pnpm db:migrate' has succeeded against a restored copy. After Regenerate, a deploy that fails on pre-deploy leaves the old container with a dead DB password and no rollback."
  fi
  local photo; photo="$(photo_pipeline)"
  case "$photo" in ok*|empty) ok "photo pipeline healthy before rotation" ;; *) warn "photo pipeline already broken ($photo) — deploy first; this script would mask it" ;; esac

  head2 "1/4 writing app-owned values (no deploy yet)"
  rail_write_app_values

  if [ "$SKIP_PG" = 1 ]; then
    head2 "2/4 Postgres"
    warn "--skip-pg: you are responsible for Regenerate + the redeploy that follows it"
  else
    head2 "2/4 Postgres — your click, then mine"
    say "  In the Railway dashboard:  $PG_SERVICE → Database → Config → Connection → Regenerate"
    say "  Railway will: change the password inside Postgres, update POSTGRES_PASSWORD, cascade to"
    say "  PGPASSWORD/DATABASE_URL/DATABASE_PUBLIC_URL, and restart the DB (every session drops)."
    say ""
    say "  From the moment you click, the running api cannot reach the database. The deploy below"
    say "  is what restores it. Do not walk away."
    if [ "$WAIT_S" -gt 0 ]; then
      # Poll instead of sleeping a fixed delay: the deploy should follow the click by
      # seconds, because between them the running container cannot reach the database.
      say "  waiting up to ${WAIT_S}s for POSTGRES_PASSWORD to change (ctrl-c to abandon)"
      local want got t=0
      want="$(json_get "$STATE_DIR/pg-env.before.json" POSTGRES_PASSWORD | sha256sum | cut -c1-16)"
      while [ "$t" -lt "$WAIT_S" ]; do
        snapshot_vars "$PG_SERVICE" "$STATE_DIR/pg-env.after.json"
        got="$(json_get "$STATE_DIR/pg-env.after.json" POSTGRES_PASSWORD | sha256sum | cut -c1-16)"
        if [ "$got" != "$want" ]; then say "  change detected after ${t}s — deploying next"; break; fi
        sleep 5; t=$((t+5))
      done
      if [ "$t" -ge "$WAIT_S" ]; then warn "no Regenerate within ${WAIT_S}s — continuing without rotating the database"; fi
    else
      printf '  Press Enter once Regenerate has finished (or ctrl-c to stop here): '
      read -r _ || true
    fi
    # Re-read: Regenerate rewrites POSTGRES_PASSWORD and cascades to
    # DATABASE_PUBLIC_URL, so the pre-rotation snapshot holds the dead password.
    snapshot_vars "$PG_SERVICE" "$STATE_DIR/pg-env.after.json"
    local db; db="$(db_auth "$STATE_DIR/pg-env.after.json")"
    case "$db" in
      ok)    ok "public DATABASE_URL authenticates with the new password" ;;
      skip*) warn "no public URL to test with; continuing" ;;
      *)     die "the new password does not authenticate (${db#fail }). Fix the database before deploying." ;;
    esac
  fi

  head2 "3/4 Twilio promote"
  local sid old_tok sec promoted
  sid="$(json_get "$STATE_DIR/api-env.before.json" TWILIO_ACCOUNT_SID)"
  old_tok="$(json_get "$STATE_DIR/api-env.before.json" TWILIO_AUTH_TOKEN)"
  sec="$(newv _TWILIO_SECONDARY)"
  if [ -n "$sec" ]; then
    promoted="$(twilio_promote "$sid" "$old_tok")"
    [ -n "$promoted" ] || die "Twilio promote failed — old token still live. Fix before anything else."
    set_new TWILIO_AUTH_TOKEN "$promoted"
    printf '%s' "$promoted" | railway_set_stdin "$SERVICE" TWILIO_AUTH_TOKEN
    say "  secondary promoted, old primary deleted. OTP SMS fails until the deploy lands."
  else
    warn "no secondary staged — skipped"
  fi

  mark INVALIDATED 1
  head2 "4/4 deploy"
  if [ "$NO_DEPLOY" = 1 ]; then
    warn "--no-deploy: the api is on dead credentials. Run 'deploy' NOW."
    return 0
  fi
  do_deploy

  head2 "verify"
  say "  ./scripts/rotate-credentials.sh verify"
  say "  then delete the old Google Maps key and read the Twilio usage log."
}

# ══════════════════════════════════════════════════════════════════════════════
# verify — end-to-end, including the two things the reset broke
# ══════════════════════════════════════════════════════════════════════════════
cmd_verify() {
  need_railway
  local SRC="" LIVE PG
  [ -L "$STATE_ROOT/current" ] && SRC="$STATE_ROOT/current/new.secrets.json" || true
  LIVE="$(mktemp)"; PG="$(mktemp)"
  snapshot_vars "$SERVICE" "$LIVE"; snapshot_vars "$PG_SERVICE" "$PG"
  trap "rm -f '$LIVE' '$PG'" EXIT

  val() { local v=""; if [ -n "$SRC" ] && [ -f "$SRC" ]; then v="$(json_get "$SRC" "$1")"; fi
          if [ -z "$v" ]; then v="$(json_get "$LIVE" "$1")"; fi; printf '%s' "$v"; }

  FAILS=0
  head2 "verify"

  api_healthy && ok "api /api/health/ready" || bad "api /api/health/ready"

  local code; code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$API_BASE/api/auth/me" || echo 000)"
  [ "$code" = "401" ] && ok "unauthenticated /auth/me is 401" || bad "unauthenticated /auth/me returned $code"

  local db; db="$(db_auth "$PG")"
  case "$db" in ok) ok "Postgres: api password authenticates" ;; skip*) skip "Postgres: ${db#skip }" ;; *) bad "Postgres: ${db#fail }" ;; esac

  local photo; photo="$(photo_pipeline)"
  case "$photo" in
    ok*)    ok "photo pipeline: container reads the bucket and serves /uploads ($photo)" ;;
    empty)  skip "photo pipeline: bucket empty, nothing to fetch" ;;
    *)      bad "photo pipeline: $photo — container still holds a revoked bucket key (needs a deploy)" ;;
  esac

  local sid tok tc
  sid="$(val TWILIO_ACCOUNT_SID)"; tok="$(val TWILIO_AUTH_TOKEN)"
  if [ -n "$sid" ] && [ -n "$tok" ]; then
    tc="$(printf 'user = "%s:%s"\n' "$sid" "$tok" | curl -sS -K - -o /dev/null -w '%{http_code}' --max-time 20 \
          "https://api.twilio.com/2010-04-01/Accounts/$sid.json" || echo 000)"
    [ "$tc" = "200" ] && ok "Twilio auth token live" || bad "Twilio returned $tc"
  else skip "Twilio (no values)"; fi

  local mk mg
  mk="$(val GOOGLE_MAPS_API_KEY)"
  if [ -n "$mk" ]; then
    mg="$(printf 'url = "https://maps.googleapis.com/maps/api/geocode/json?address=Vancouver&key=%s"\n' "$mk" \
      | curl -sS -K - --max-time 20 2>/dev/null \
      | python3 -c 'import json,sys
try: print(json.load(sys.stdin).get("status",""))
except Exception: print("")')"
    [ "$mg" = "OK" ] && ok "Google Maps geocode OK" || bad "Google Maps returned '$mg'"
  else skip "Google Maps (no value)"; fi

  if [ -n "$SRC" ] && [ -f "$SRC" ] && [ -n "$(json_get "$SRC" JWT_SECRET)" ]; then
    ok "JWT_SECRET rotated — every user signed out once"
  else
    skip "JWT_SECRET not rotated in this run ($(strength "$(val JWT_SECRET)"))"
  fi
  skip "AeroDataBox — no cheap unauthenticated check; confirm in its dashboard"

  say ""
  if [ "$FAILS" -eq 0 ]; then
    say "all checks passed"
    if [ "$PURGE" = 1 ]; then purge_state; fi
  else
    if [ -f "$STATE_ROOT/current/api-env.before.json" ]; then
      die "$FAILS check(s) failed — old values: $STATE_ROOT/current/api-env.before.json"
    else
      die "$FAILS check(s) failed (no rotation state — nothing was rotated in this run)"
    fi
  fi
}

purge_state() {
  [ -L "$STATE_ROOT/current" ] || return 0
  local d; d="$(readlink -f "$STATE_ROOT/current")"
  case "$d" in
    "$STATE_ROOT"/*) rm -rf -- "$d"; rm -f -- "$STATE_ROOT/current" ;;
    *) warn "refusing to purge '$d'"; return 0 ;;
  esac
  say "rotation state purged (old secrets gone — revert is no longer possible)"
}

# ══════════════════════════════════════════════════════════════════════════════
# revert — restore the app-owned values and redeploy
# ══════════════════════════════════════════════════════════════════════════════
cmd_revert() {
  need_railway
  use_state
  [ "$MEAN_IT" = 1 ] || die "revert restores revoked values; pass --i-mean-it"
  local BEFORE="$STATE_DIR/api-env.before.json"
  [ -f "$BEFORE" ] || die "no snapshot at $BEFORE"
  head2 "revert"
  local k v
  for k in JWT_SECRET TWILIO_AUTH_TOKEN GOOGLE_MAPS_API_KEY VAPID_PUBLIC_KEY VAPID_PRIVATE_KEY AERODATABOX_API_KEY; do
    v="$(json_get "$BEFORE" "$k")"
    if [ -n "$v" ]; then
      printf '%s' "$v" | railway_set_stdin "$SERVICE" "$k"
      say "  $SERVICE.$k restored"
    fi
  done
  warn "AWS_* / DATABASE_URL are Railway-owned references and cannot be reverted — the bucket keys and the"
  warn "old Postgres password are gone for good. If those were rotated, this revert only covers the app-owned half."
  say ""
  do_deploy
}

usage() { sed -n '3,60p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; }

case "$CMD" in
  plan)        cmd_plan ;;
  deploy)      cmd_deploy ;;
  stage)       cmd_stage ;;
  invalidate)  cmd_invalidate ;;
  verify)      cmd_verify ;;
  revert)      cmd_revert ;;
  help|-h|"")  usage ;;
  *)           usage; exit 2 ;;
esac
