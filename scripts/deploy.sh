#!/bin/sh
# 로컬에서 빌드한 바이너리를 프로덕션 서버에 올려 배포, 재기동까지 수행하는 배포 스크립트.
# 실패 시(헬스체크 불통) 기존 바이너리로 자동 롤백한다.
#
# 빌드는 서버가 아니라 개발 머신에서 한다. 프로덕션 드롭릿은 512MB / 8.7GB 짜리라
# Go 툴체인도 Node도 없고 저장소 체크아웃도 두지 않는다. 서버가 하는 일은 받은
# 바이너리를 교체하고 재기동하는 것뿐이다. 서버에서 직접 빌드하고 싶다면
# server-setup.sh 로 툴체인을 깔고 저장소를 클론해야 한다.
#
# 사용법 (개발 머신에서, 저장소 어디서든):
#   sh scripts/deploy.sh
#
# 환경변수로 덮어쓸 수 있는 값:
#   DEPLOY_HOST         배포 대상 (기본 root@178.128.53.74)
#   DEPLOY_SSH_KEY      SSH 키 경로 (기본 ~/.ssh/mpt_do)
#   DEPLOY_BRANCH       배포 기준 브랜치 (기본 main)
#   DEPLOY_ALLOW_DIRTY  1이면 커밋/푸시 검사를 건너뛴다 (긴급 배포용)
set -eu

HOST="${DEPLOY_HOST:-root@178.128.53.74}"
SSH_KEY="${DEPLOY_SSH_KEY:-${HOME}/.ssh/mpt_do}"
BRANCH="${DEPLOY_BRANCH:-main}"
OUTPUT="build/memos-linux-amd64"
REMOTE_BIN="/tmp/memos.new"
REMOTE_UNIT="/tmp/memos.service.new"
# 바이너리 + 백업 + DB 백업이 들어갈 여유. 킬로바이트 단위(df -Pk 기준).
MIN_FREE_KB=307200

cd "$(dirname "$0")/.."

echo "==> 1/6 로컬 사전 점검"
for cmd in git go pnpm ssh scp; do
  command -v "${cmd}" >/dev/null 2>&1 || { echo "필요한 명령을 찾을 수 없습니다: ${cmd}"; exit 1; }
done
[ -f "${SSH_KEY}" ] || { echo "SSH 키가 없습니다: ${SSH_KEY}"; exit 1; }

# 배포한 것이 origin/${BRANCH} 에 그대로 남아 있어야 나중에 무엇을 띄웠는지 되짚을 수
# 있다. 예전처럼 서버가 reset --hard 로 브랜치를 따라가지 않으니 그 보증을 여기서 한다.
# git status 대신 git diff 를 쓰는 이유: 윈도우 체크아웃에서는 줄바꿈만 다른 파일이
# status 에 수십 개씩 뜨는데, 내용은 같으므로 배포를 막을 이유가 없다.
if [ "${DEPLOY_ALLOW_DIRTY:-0}" = "1" ]; then
  echo "DEPLOY_ALLOW_DIRTY=1 — 커밋/푸시 검사를 건너뜁니다."
else
  git diff --quiet || { echo "커밋되지 않은 변경이 있습니다. 커밋 후 다시 실행하세요."; exit 1; }
  git diff --cached --quiet || { echo "스테이지된 변경이 있습니다. 커밋 후 다시 실행하세요."; exit 1; }
  if [ -n "$(git ls-files --others --exclude-standard)" ]; then
    echo "추적되지 않은 파일이 있습니다. 빌드에 섞이므로 커밋하거나 지우고 다시 실행하세요."
    git ls-files --others --exclude-standard
    exit 1
  fi
  git fetch origin "${BRANCH}"
  if [ "$(git rev-parse HEAD)" != "$(git rev-parse "origin/${BRANCH}")" ]; then
    echo "HEAD가 origin/${BRANCH} 와 다릅니다. 푸시한 뒤 다시 실행하세요."
    exit 1
  fi
fi
COMMIT="$(git rev-parse --short HEAD)"
echo "배포 대상 커밋: ${COMMIT}"

echo "==> 2/6 서버 연결 및 디스크 확인"
FREE_KB="$(ssh -i "${SSH_KEY}" "${HOST}" "df -Pk / | awk 'NR==2 {print \$4}'")"
echo "서버 여유 공간: $((FREE_KB / 1024))MB"
if [ "${FREE_KB}" -lt "${MIN_FREE_KB}" ]; then
  echo "여유 공간이 $((MIN_FREE_KB / 1024))MB 미만입니다. /usr/local/memos 의 오래된 바이너리 백업을 정리하세요."
  exit 1
fi

echo "==> 3/6 프론트엔드 빌드 (pnpm release)"
(cd web && pnpm install --frozen-lockfile && pnpm release)

echo "==> 4/6 백엔드 크로스 컴파일 (linux/amd64)"
mkdir -p build
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
  go build -trimpath -ldflags "-s -w" -o "${OUTPUT}" ./cmd/memos
ls -lh "${OUTPUT}"

echo "==> 5/6 업로드"
scp -i "${SSH_KEY}" "${OUTPUT}" "${HOST}:${REMOTE_BIN}"
scp -i "${SSH_KEY}" scripts/memos.service "${HOST}:${REMOTE_UNIT}"

echo "==> 6/6 서버 교체 및 재기동"
# 서버 쪽 절차는 아래 heredoc 하나로 끝난다. 따옴표로 묶은 heredoc이라 로컬에서는
# 아무것도 치환되지 않고, 필요한 값(커밋 해시)만 인자로 넘긴다. tr 로 CR을 걷어내는
# 이유: 이 파일이 CRLF로 체크아웃된 머신에서 실행되면 원격 bash가 줄 끝의 \r 을
# 명령 일부로 읽고 전부 실패한다.
remote_script() {
  cat <<'REMOTE'
set -eu

INSTALL_DIR="/usr/local/memos"
BIN="${INSTALL_DIR}/memos"
PORT="5230"
HEALTH_RETRIES=10
HEALTH_INTERVAL=2
UNIT_FILE="/etc/systemd/system/memos.service"
UNIT_BACKUP="/etc/systemd/system/memos.service.bak"
UNIT_NEW="/tmp/memos.service.new"
DB_FILE="/var/opt/memos/memos_prod.db"
DB_BACKUP_DIR="/var/opt/memos/backups"
DB_BACKUP_KEEP=7
# 바이너리 백업은 지우지 않는다. 어느 것이 어떤 배포였는지는 파일 이름의 타임스탬프뿐이라
# 자동으로 버리기에는 위험하다. 대신 쌓이면 알려준다.
BIN_BACKUP_WARN=10

COMMIT="${1:-unknown}"

test -f /tmp/memos.new || { echo "업로드된 바이너리가 없습니다: /tmp/memos.new"; exit 1; }
chmod 0755 /tmp/memos.new

echo "-- 기존 바이너리 백업"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="${INSTALL_DIR}/memos.bak.v${STAMP}"
cp -f "${BIN}" "${BACKUP}"
echo "백업 완료: ${BACKUP}"

echo "-- systemd 유닛 동기화"
if [ -f "${UNIT_NEW}" ] && ! cmp -s "${UNIT_NEW}" "${UNIT_FILE}"; then
  echo "유닛 파일이 변경됨. ${UNIT_BACKUP} 로 백업 후 교체합니다."
  if [ -f "${UNIT_FILE}" ]; then
    cp -f "${UNIT_FILE}" "${UNIT_BACKUP}"
  fi
  install -m 0644 "${UNIT_NEW}" "${UNIT_FILE}"
  systemctl daemon-reload
else
  echo "유닛 파일 변경 없음."
fi

echo "-- 바이너리 교체 및 재기동"
systemctl stop memos

# 서비스가 멈춘 뒤에 DB를 복사한다. 실행 중 복사는 WAL과 본체가 어긋난
# 스냅샷을 만들 수 있다. 로컬 SQLite 단일 파일 운영이므로 배포마다
# 한 부씩 떠 두고 최근 것만 남긴다. 백업 실패가 배포를 막지는 않는다.
if [ -f "${DB_FILE}" ]; then
  mkdir -p "${DB_BACKUP_DIR}"
  for suffix in "" "-wal" "-shm"; do
    if [ -f "${DB_FILE}${suffix}" ]; then
      cp -f "${DB_FILE}${suffix}" "${DB_BACKUP_DIR}/memos_prod.db${suffix}.${STAMP}" || echo "경고: DB 백업 실패(${suffix})"
    fi
  done
  echo "DB 백업 완료: ${DB_BACKUP_DIR}/memos_prod.db.${STAMP}"
  # 최근 ${DB_BACKUP_KEEP}개만 남기고 정리.
  ls -1t "${DB_BACKUP_DIR}"/memos_prod.db.* 2>/dev/null | tail -n "+$((DB_BACKUP_KEEP + 1))" | while read -r old; do
    rm -f "${old}" "${old%.*}"-wal."${old##*.}" "${old%.*}"-shm."${old##*.}" 2>/dev/null || true
  done
fi

install -m 0755 /tmp/memos.new "${BIN}"
systemctl start memos

echo "-- 헬스체크"
OK=0
i=0
while [ "${i}" -lt "${HEALTH_RETRIES}" ]; do
  if curl -fsS "http://127.0.0.1:${PORT}/healthz" >/dev/null 2>&1; then
    OK=1
    break
  fi
  i=$((i + 1))
  sleep "${HEALTH_INTERVAL}"
done

if [ "${OK}" -eq 1 ]; then
  rm -f /tmp/memos.new "${UNIT_NEW}"
  echo "배포 성공: ${STAMP} (${COMMIT})"
  BIN_BACKUPS="$(ls -1 "${INSTALL_DIR}"/memos.bak.* 2>/dev/null | wc -l | tr -d ' ')"
  if [ "${BIN_BACKUPS}" -ge "${BIN_BACKUP_WARN}" ]; then
    echo "참고: 바이너리 백업이 ${BIN_BACKUPS}개($(du -sh "${INSTALL_DIR}" | cut -f1)) 쌓였습니다. 필요 없는 것은 직접 지우세요."
  fi
else
  echo "헬스체크 실패. 롤백합니다..."
  systemctl stop memos
  if [ -f "${UNIT_BACKUP}" ] && ! cmp -s "${UNIT_BACKUP}" "${UNIT_FILE}"; then
    echo "유닛 파일도 롤백합니다."
    install -m 0644 "${UNIT_BACKUP}" "${UNIT_FILE}"
    systemctl daemon-reload
  fi
  install -m 0755 "${BACKUP}" "${BIN}"
  systemctl start memos
  rm -f /tmp/memos.new
  echo "롤백 완료: ${BACKUP}"
  journalctl -u memos -n 40 --no-pager || true
  exit 1
fi
REMOTE
}

remote_script | tr -d '\r' | ssh -i "${SSH_KEY}" "${HOST}" "bash -s -- ${COMMIT}"

rm -f "${OUTPUT}"
echo
echo "완료: ${COMMIT} 를 ${HOST} 에 배포했습니다."
